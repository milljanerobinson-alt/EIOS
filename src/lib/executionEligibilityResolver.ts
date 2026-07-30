// EWO-017R.2 — Canonical Execution Eligibility Resolver
//
// The single authoritative source for determining whether an Engineering Work
// Order is eligible for "Begin Engineering Execution". All UI, orchestration,
// ATD guidance, and automated tests must use this resolver — no duplicated
// eligibility logic is permitted elsewhere.
//
// Evidence sources (all verified against the actual deployed schema):
//
//   EWO existence & lifecycle state:
//     engineering_work_orders (id, ewo_ref, status, implementation_status)
//
//   Engineering Plan approval (canonical):
//     ewo_engineering_packages (ewo_id, package_status = 'approved')
//     NOT engineering_plans (does not exist)
//
//   Engineering Review approval (canonical):
//     ecc_engineering_reviews (metadata->>'ewo_ref' = ewo_ref, status = 'approved')
//     NOT engineering_reviews (does not exist)
//
//   Product Owner execution approval (canonical, Req 5):
//     ewo_execution_approvals (ewo_id, decision = 'approved')
//     This is DISTINCT from post-verification PO acceptance
//     (engineering_work_orders PO acceptance columns) and closure acceptance.
//
//   Active execution session:
//     engineering_executions (ewo_id, implementation_status IN active states)
//
//   Execution target:
//     execution_targets (id, is_active = true, valid repository/branches)

import { supabase as defaultSupabase } from './supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExecutionStateKey =
  | 'never_executed'        // No prior implementation, no session
  | 'eligible'              // All prerequisites met, ready to launch
  | 'active_session'        // An execution session is in progress
  | 'completed'              // Execution completed successfully
  | 'failed_resumable'      // Failed but session is resumable
  | 'failed_restart'        // Failed and requires a fresh start
  | 'historical_no_session' // Historical implementation without canonical session
  | 'closed'                // EWO is closed
  | 'ineligible';           // Missing one or more prerequisites

export interface EvidenceSource {
  table: string;
  query: string;
  result: 'found' | 'not_found' | 'error' | 'warning';
  ref?: string;
  detail?: string;
}

export interface BlockingReason {
  prerequisite: string;
  evidenceSource: string;
  detail: string;
  recommendedAction: string;
}

export interface ExecutionTargetInfo {
  id: string;
  target_ref: string;
  platform: string;
  repository: string;
  default_branch: string;
  staging_branch: string;
  production_branch: string;
  is_active: boolean;
  is_protected: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  workOrderId: string;
  workOrderRef: string;
  lifecycleState: string;
  implementationState: string;
  executionState: ExecutionStateKey;
  activeExecutionSession: {
    hasActive: boolean;
    executionRef: string | null;
    status: string | null;
  };
  engineeringPlanApproved: boolean;
  engineeringReviewApproved: boolean;
  productOwnerApproved: boolean;
  workOrderClosed: boolean;
  alreadyExecuted: boolean;
  targetAvailable: boolean;
  targetInfo: ExecutionTargetInfo | null;
  blockingReasons: BlockingReason[];
  evidenceSources: EvidenceSource[];
  recommendedAction: string;
  isTestCandidate: boolean;
}

// ─── Canonical Resolver ──────────────────────────────────────────────────────

export async function evaluateExecutionEligibility(
  workOrderId: string,
  clientOverride?: SupabaseClient,
): Promise<EligibilityResult> {
  const supabase = clientOverride ?? defaultSupabase;
  const evidenceSources: EvidenceSource[] = [];
  const blockingReasons: BlockingReason[] = [];

  // ── 1. EWO exists & lifecycle state ──────────────────────────────────────
  const { data: ewo, error: ewoError } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, status, implementation_status, is_historical_import, implementation_completed_at')
    .eq('id', workOrderId)
    .maybeSingle();

  evidenceSources.push({
    table: 'engineering_work_orders',
    query: `id = '${workOrderId}'`,
    result: ewoError ? 'error' : ewo ? 'found' : 'not_found',
    ref: ewo?.ewo_ref,
    detail: ewoError ? ewoError.message : ewo ? `${ewo.ewo_ref} — ${ewo.status}` : 'Not found',
  });

  if (!ewo || ewoError) {
    return {
      eligible: false,
      workOrderId,
      workOrderRef: 'UNKNOWN',
      lifecycleState: 'unknown',
      implementationState: 'unknown',
      executionState: 'ineligible',
      activeExecutionSession: { hasActive: false, executionRef: null, status: null },
      engineeringPlanApproved: false,
      engineeringReviewApproved: false,
      productOwnerApproved: false,
      workOrderClosed: false,
      alreadyExecuted: false,
      targetAvailable: false,
      targetInfo: null,
      blockingReasons: [{ prerequisite: 'EWO exists', evidenceSource: 'engineering_work_orders', detail: 'EWO not found', recommendedAction: 'Provide a valid Engineering Work Order ID' }],
      evidenceSources,
      recommendedAction: 'Provide a valid Engineering Work Order ID',
      isTestCandidate: false,
    };
  }

  const workOrderClosed = ewo.status === 'closed' || ewo.status === 'archived';
  const alreadyExecuted = ['complete', 'Implementation Complete', 'Completed'].includes(ewo.implementation_status);

  // ── 2. Engineering Plan approval (canonical: ewo_engineering_packages) ────
  const { data: pkg, error: pkgError } = await supabase
    .from('ewo_engineering_packages')
    .select('id, package_status, summary')
    .eq('ewo_id', workOrderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const engineeringPlanApproved = !!pkg && pkg.package_status === 'approved';
  evidenceSources.push({
    table: 'ewo_engineering_packages',
    query: `ewo_id = '${workOrderId}', package_status = 'approved'`,
    result: pkgError ? 'error' : pkg ? 'found' : 'not_found',
    ref: pkg?.id,
    detail: pkgError ? pkgError.message : pkg ? `status: ${pkg.package_status}` : 'No package found',
  });

  // EWO-033R.4 Correction 6: Engineering package is a system prerequisite, but
  // for the conversation-first flow the package is auto-assembled during
  // preparation or generated at execution time. Missing package is a WARNING,
  // not a blocker — the preparation flow already handles this.
  if (!engineeringPlanApproved) {
    evidenceSources.push({
      table: 'ewo_engineering_packages',
      query: `warning: package not approved`,
      result: 'warning',
      ref: pkg?.id,
      detail: pkg ? `Package status '${pkg.package_status}' — will be approved at execution` : 'No package — will generate on execute',
    });
  }

  // ── 3. Engineering Review approval (canonical: ecc_engineering_reviews) ──
  const { data: review, error: reviewError } = await supabase
    .from('ecc_engineering_reviews')
    .select('id, erc_number, status, metadata')
    .eq('metadata->>ewo_ref', ewo.ewo_ref)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fallback: also check by title containing the EWO ref
  let reviewApproved = !!review && review.status === 'approved';
  if (!review) {
    const { data: reviewByTitle } = await supabase
      .from('ecc_engineering_reviews')
      .select('id, erc_number, status, metadata')
      .ilike('title', `%${ewo.ewo_ref}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (reviewByTitle && reviewByTitle.status === 'approved') {
      reviewApproved = true;
      evidenceSources.push({
        table: 'ecc_engineering_reviews',
        query: `title ILIKE '%${ewo.ewo_ref}%', status = 'approved'`,
        result: 'found',
        ref: reviewByTitle.erc_number,
        detail: `Review ${reviewByTitle.erc_number} — status: ${reviewByTitle.status}`,
      });
    } else {
      evidenceSources.push({
        table: 'ecc_engineering_reviews',
        query: `metadata->>ewo_ref = '${ewo.ewo_ref}' OR title ILIKE '%${ewo.ewo_ref}%'`,
        result: reviewError ? 'error' : reviewByTitle ? 'found' : 'not_found',
        ref: reviewByTitle?.erc_number,
        detail: reviewError ? reviewError.message : reviewByTitle ? `status: ${reviewByTitle.status}` : 'No review found',
      });
    }
  } else {
    evidenceSources.push({
      table: 'ecc_engineering_reviews',
      query: `metadata->>ewo_ref = '${ewo.ewo_ref}', status = 'approved'`,
      result: 'found',
      ref: review.erc_number,
      detail: `Review ${review.erc_number} — status: ${review.status}`,
    });
  }

  // EWO-033R.4 Correction 6: Engineering review is a system prerequisite, but
  // for the conversation-first flow the review may not exist yet. Missing
  // review is a WARNING, not a blocker. The preparation flow is the lifecycle
  // owner and has already validated what it needs.
  if (!reviewApproved) {
    evidenceSources.push({
      table: 'ecc_engineering_reviews',
      query: `warning: review not approved`,
      result: 'warning',
      ref: review?.erc_number,
      detail: review ? `Review status '${review.status}' — pending approval` : 'No review — optional for conversation-first flow',
    });
  }

  // ── 4. Product Owner execution approval (canonical: ewo_execution_approvals)
  // EWO-033R.4 Correction 6: Product Owner approval is a DECISION, not a
  // prerequisite. It must NOT be checked during preparation/readiness validation.
  // The PO makes this decision AFTER seeing the Execution Ready card. Checking
  // it as a prerequisite causes the contradictory state where the system says
  // "prepared and ready" while also reporting "No Product Owner approval found".
  // PO approval is validated at execution launch time, not at preparation time.
  const { data: poApproval, error: poError } = await supabase
    .from('ewo_execution_approvals')
    .select('id, approval_ref, decision, product_owner, is_test')
    .eq('ewo_id', workOrderId)
    .eq('decision', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const productOwnerApproved = !!poApproval;
  evidenceSources.push({
    table: 'ewo_execution_approvals',
    query: `ewo_id = '${workOrderId}', decision = 'approved'`,
    result: poError ? 'error' : poApproval ? 'found' : 'not_found',
    ref: poApproval?.approval_ref,
    detail: poError ? poError.message : poApproval ? `Approval ${poApproval.approval_ref} by ${poApproval.product_owner}` : 'No PO execution approval found (pending PO decision)',
  });
  // NOTE: productOwnerApproved is NOT added to blockingReasons. It is a decision
  // the PO makes after seeing the Execution Ready card, not a system prerequisite.

  // ── 5. Active execution session ──────────────────────────────────────────
  const { data: executions, error: execError } = await supabase
    .from('engineering_executions')
    .select('id, execution_ref, implementation_status')
    .eq('ewo_id', workOrderId)
    .order('created_at', { ascending: false });

  // EWO-033R.4 Correction 10: Execution Lifecycle Audit
  // ACTIVE states — genuinely in-progress, should block new execution:
  //   queued, running, prepared, submitted, awaiting_completion
  // STALE states — may be abandoned, should NOT permanently block:
  //   awaiting_review, awaiting_po, awaiting_po_testing, po_accepted
  // TERMINAL states — completed, no longer active:
  //   complete, cancelled, failed, rejected
  const genuinelyActiveStatuses = ['queued', 'running', 'prepared', 'submitted', 'awaiting_completion'];
  const staleStatuses = ['awaiting_review', 'awaiting_po', 'awaiting_po_testing', 'po_accepted'];
  const activeExecution = (executions || []).find(e => genuinelyActiveStatuses.includes(e.implementation_status));
  const staleExecution = (executions || []).find(e => staleStatuses.includes(e.implementation_status));
  const failedExecution = (executions || []).find(e => e.implementation_status === 'failed');

  evidenceSources.push({
    table: 'engineering_executions',
    query: `ewo_id = '${workOrderId}'`,
    result: execError ? 'error' : (executions && executions.length > 0) ? 'found' : 'not_found',
    ref: activeExecution?.execution_ref || failedExecution?.execution_ref,
    detail: execError ? execError.message : activeExecution ? `Active: ${activeExecution.execution_ref} (${activeExecution.implementation_status})` : staleExecution ? `Stale: ${staleExecution.execution_ref} (${staleExecution.implementation_status})` : failedExecution ? `Failed: ${failedExecution.execution_ref}` : 'No executions',
  });

  // ── 6. Execution target validation (Req 9) ────────────────────────────────
  // EWO-033R.4 Correction 10: The execution_targets table has MULTIPLE active
  // targets. Using .maybeSingle() with multiple rows causes HTTP 400.
  // Fix: query without .maybeSingle(), use .limit(1), take first element from array.
  const { data: targetRows, error: targetError } = await supabase
    .from('execution_targets')
    .select('id, target_ref, platform, repository, default_branch, staging_branch, production_branch, is_active, is_protected')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1);

  // Prefer the non-protected test target for test EWOs, or the first active target
  let targetInfo: ExecutionTargetInfo | null = null;
  let targetAvailable = false;

  const target = (targetRows && targetRows.length > 0) ? targetRows[0] : null;

  if (target) {
    targetInfo = {
      id: target.id,
      target_ref: target.target_ref,
      platform: target.platform,
      repository: target.repository,
      default_branch: target.default_branch,
      staging_branch: target.staging_branch,
      production_branch: target.production_branch,
      is_active: target.is_active,
      is_protected: target.is_protected,
    };
    // Target must have valid repository and branches
    targetAvailable = !!target.repository && !!target.default_branch && !!target.staging_branch;
  }

  // For test EWOs, prefer the ET-TEST target
  const isTestCandidate = ewo.ewo_ref.startsWith('EWO-TEST') || (poApproval?.is_test === true);
  if (isTestCandidate) {
    const { data: testTargetRows } = await supabase
      .from('execution_targets')
      .select('id, target_ref, platform, repository, default_branch, staging_branch, production_branch, is_active, is_protected')
      .eq('target_ref', 'ET-TEST')
      .limit(1);
    const testTarget = (testTargetRows && testTargetRows.length > 0) ? testTargetRows[0] : null;
    if (testTarget && testTarget.is_active) {
      targetInfo = {
        id: testTarget.id,
        target_ref: testTarget.target_ref,
        platform: testTarget.platform,
        repository: testTarget.repository,
        default_branch: testTarget.default_branch,
        staging_branch: testTarget.staging_branch,
        production_branch: testTarget.production_branch,
        is_active: testTarget.is_active,
        is_protected: testTarget.is_protected,
      };
      targetAvailable = !!testTarget.repository && !!testTarget.default_branch;
    }
  }

  evidenceSources.push({
    table: 'execution_targets',
    query: isTestCandidate ? `target_ref = 'ET-TEST', is_active = true` : `is_active = true`,
    result: targetError ? 'error' : targetInfo ? 'found' : 'not_found',
    ref: targetInfo?.target_ref,
    detail: targetError ? targetError.message : targetInfo ? `${targetInfo.target_ref}: ${targetInfo.platform}/${targetInfo.repository}` : 'No active target',
  });

  if (!targetAvailable) {
    blockingReasons.push({
      prerequisite: 'Valid execution target',
      evidenceSource: 'execution_targets',
      detail: targetInfo ? `Target ${targetInfo.target_ref} found but missing repository or branch configuration` : 'No active execution target found',
      recommendedAction: isTestCandidate ? 'Ensure ET-TEST target exists and is active' : 'Configure an active execution target with a valid repository and branch strategy',
    });
  }

  // ── 7. Determine execution state (Req 6) ──────────────────────────────────
  let executionState: ExecutionStateKey;

  if (workOrderClosed) {
    executionState = 'closed';
  } else if (activeExecution) {
    executionState = 'active_session';
  } else if (alreadyExecuted && !ewo.is_historical_import) {
    // Has implementation_status = complete but no active session
    // Check if there's a canonical execution session
    if (executions && executions.length > 0) {
      executionState = 'completed';
    } else {
      executionState = 'historical_no_session';
    }
  } else if (staleExecution) {
    // EWO-033R.4 Correction 10: Stale executions should NOT permanently block.
    // The PO may have abandoned the session. Allow new execution with recovery.
    executionState = 'active_session'; // Treat as resumable, not blocking
  } else if (failedExecution) {
    // Check if the failed session is resumable
    const { data: failedSession } = await supabase
      .from('execution_sessions')
      .select('is_resumable')
      .eq('execution_id', failedExecution.id)
      .maybeSingle();
    executionState = failedSession?.is_resumable ? 'failed_resumable' : 'failed_restart';
  } else if (ewo.is_historical_import && alreadyExecuted) {
    executionState = 'historical_no_session';
  } else {
    // Never executed — check if eligible
    // EWO-033R.4 Correction 6: PO approval is a decision, not a prerequisite.
    // Engineering package and review are auto-satisfiable warnings, not blockers.
    const allPrereqsMet = targetAvailable;
    executionState = allPrereqsMet ? 'eligible' : 'ineligible';
  }

  // ── 8. Final eligibility determination ────────────────────────────────────
  // EWO-033R.4 Correction 6: PO approval is a decision (not a prerequisite).
  // Engineering package and review are auto-satisfiable (warnings, not blockers).
  // EWO-033R.4 Correction 14: Stale execution sessions do NOT block eligibility.
  // They remain visible in executionState and evidenceSources for diagnostics
  // and recovery, but must not make eligible=false. This aligns the resolver
  // with executionReadinessValidator (preparation path) which treats stale
  // sessions as non-blocking warnings.
  const eligible =
    !workOrderClosed &&
    !alreadyExecuted &&
    !activeExecution &&
    targetAvailable;

  // ── 9. Recommended action ─────────────────────────────────────────────────
  let recommendedAction: string;
  if (executionState === 'closed') {
    recommendedAction = 'Execution unavailable because the work order is closed';
  } else if (executionState === 'active_session') {
    recommendedAction = 'View or resume the active execution session';
  } else if (executionState === 'completed') {
    recommendedAction = 'View the completed execution';
  } else if (executionState === 'historical_no_session') {
    recommendedAction = 'Implementation already completed — no canonical execution session available';
  } else if (executionState === 'failed_resumable') {
    recommendedAction = 'Resume the failed execution session';
  } else if (executionState === 'failed_restart') {
    recommendedAction = 'Start a new execution session after addressing the failure';
  } else if (eligible) {
    recommendedAction = 'Begin Engineering Execution';
  } else {
    const missing = blockingReasons.map(r => r.prerequisite).join(', ');
    recommendedAction = `Not eligible — missing prerequisites: ${missing}`;
  }

  return {
    eligible,
    workOrderId: ewo.id,
    workOrderRef: ewo.ewo_ref,
    lifecycleState: ewo.status,
    implementationState: ewo.implementation_status,
    executionState,
    activeExecutionSession: {
      hasActive: !!activeExecution,
      executionRef: activeExecution?.execution_ref ?? null,
      status: activeExecution?.implementation_status ?? null,
    },
    engineeringPlanApproved,
    engineeringReviewApproved: reviewApproved,
    productOwnerApproved,
    workOrderClosed,
    alreadyExecuted,
    targetAvailable,
    targetInfo,
    blockingReasons,
    evidenceSources,
    recommendedAction,
    isTestCandidate,
  };
}

// ─── Batch Eligibility (for ATD diagnostics, Req 12) ──────────────────────────

export async function evaluateAllEligibility(clientOverride?: SupabaseClient): Promise<EligibilityResult[]> {
  const supabase = clientOverride ?? defaultSupabase;
  const { data: ewos } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, status, implementation_status')
    .order('ewo_ref');

  if (!ewos) return [];

  const results: EligibilityResult[] = [];
  for (const ewo of ewos) {
    const result = await evaluateExecutionEligibility(ewo.id, clientOverride);
    results.push(result);
  }
  return results;
}

export async function getEligibleEWOs(clientOverride?: SupabaseClient): Promise<EligibilityResult[]> {
  const all = await evaluateAllEligibility(clientOverride);
  return all.filter(r => r.eligible);
}

export async function getTestCandidate(clientOverride?: SupabaseClient): Promise<EligibilityResult | null> {
  const supabase = clientOverride ?? defaultSupabase;
  const { data: ewo } = await supabase
    .from('engineering_work_orders')
    .select('id')
    .eq('ewo_ref', 'EWO-TEST-001')
    .maybeSingle();
  if (!ewo) return null;
  return evaluateExecutionEligibility(ewo.id, clientOverride);
}
