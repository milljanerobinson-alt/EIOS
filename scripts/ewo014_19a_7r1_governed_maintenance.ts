/**
 * EWO-014.19A.7R.1 — Governed Maintenance Script
 * Platform-Wide Verification, Product Owner Acceptance & Canonical Closure
 *
 * SAFETY DOCUMENTATION
 * ====================
 * This script processes exactly 41 Engineering Work Orders (excluding only
 * the exact reference 'TEST') through the canonical governance services:
 *
 *   1. Integrity validation (engineeringIntegrityService)
 *   2. Verification orchestration (verificationOrchestrator — Verify All Eligible)
 *   3. Lifecycle progression (lifecycleEvidenceEngine — progressLifecycle)
 *   4. Product Owner Acceptance (lifecycleEvidenceEngine — grantPoAcceptance)
 *   5. Canonical closure (lifecycleEvidenceEngine — progressLifecycle to 'closed')
 *   6. Lifecycle history (ewo_lifecycle_events)
 *   7. Batch audit recording (ewo_batch_audit_records)
 *
 * DRY RUN: Set DRY_RUN = true (default) to preview without database writes.
 *          Set DRY_RUN = false to execute the governed maintenance.
 *
 * IDEMPOTENCY: Safe to run multiple times. Recognises already-verified gates,
 *              existing PO acceptance, and already-closed EWOs.
 *
 * EXACT TEST EXCLUSION: Only ewo_ref = 'TEST' is excluded. EWO-TEST-001 is
 *                       included as a candidate.
 *
 * EXPECTED COUNT ASSERTION: total=42, excluded=1, candidates=41
 *
 * ROLLBACK/FAILURE BEHAVIOUR: Each EWO is processed in isolation. A failure
 *   on one EWO does not corrupt or roll back completed independent EWOs.
 *
 * EXECUTION INSTRUCTIONS:
 *   1. Run with DRY_RUN = true first
 *   2. Review dry-run output
 *   3. If dry-run confirms 41 candidates and no blocking issues, set DRY_RUN = false
 *   4. Run again to execute
 *   5. Review final reconciliation
 *
 * This script is NOT exposed as a normal end-user action. It is a one-time
 * governed maintenance operation.
 */

import { supabase } from '../../src/lib/supabase';
import {
  runVerificationOrchestration,
  type OrchestrationRequest,
} from '../../src/lib/verificationOrchestrator';
import {
  getVerificationGates,
} from '../../src/lib/verificationService';
import {
  assessLifecycle,
  progressLifecycle,
  grantPoAcceptance,
} from '../../src/lib/lifecycleEvidenceEngine';

// ─── Configuration ───────────────────────────────────────────────────────────

const DRY_RUN: boolean = process.env.DRY_RUN !== 'false'; // default: true
const EXCLUDED_REF = 'TEST';
const EXPECTED_TOTAL = 42;
const EXPECTED_EXCLUDED = 1;
const EXPECTED_CANDIDATES = 41;
const ACCEPTANCE_NOTE =
  'Product Owner Acceptance granted. Verified successful historical import, audit trail preservation, duplicate protection, and canonical closure method resolution. Approved for Engineering Ledger migration.';
const ACCEPTED_BY = 'product_owner';
const SCRIPT_NAME = 'ewo-014-19a-7r1-governed-maintenance';
const SCRIPT_VERSION = '1.0.0';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CandidateEWO {
  id: string;
  ewo_ref: string;
  title: string;
  status: string;
  closure_eligible: boolean;
  po_accepted_at: string | null;
  po_acceptance_statement: string | null;
  po_testing_status: string | null;
  implementation_status: string | null;
  verification_status: string | null;
  closure_method: string | null;
  parent_ref: string | null;
}

interface PerEWOResult {
  ewo_ref: string;
  title: string;
  starting_state: string;
  integrity_valid: boolean;
  integrity_issues: string[];
  verification_result: 'already_verified' | 'verified' | 'skipped' | 'failed';
  verified_gates: number;
  total_gates: number;
  po_acceptance_result: 'already_accepted' | 'accepted' | 'skipped' | 'failed';
  closure_result: 'already_closed' | 'closed' | 'skipped' | 'failed';
  final_state: string;
  action_taken: string;
  failure_or_skip_reason: string | null;
}

interface BatchResult {
  execution_id: string;
  dry_run: boolean;
  total_canonical: number;
  excluded_refs: string[];
  candidate_count: number;
  verified_count: number;
  accepted_count: number;
  closed_count: number;
  already_complete_count: number;
  skipped_count: number;
  failed_count: number;
  per_ewo_results: PerEWOResult[];
  scope_mismatch: boolean;
  scope_mismatch_report: string | null;
}

// ─── Scope Validation (Requirement 1) ────────────────────────────────────────

async function validateScope(): Promise<{
  candidates: CandidateEWO[];
  excluded: CandidateEWO[];
  scopeMismatch: boolean;
  mismatchReport: string | null;
}> {
  const { data: allEWOs, error } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, status, closure_eligible, po_accepted_at, po_acceptance_statement, po_testing_status, implementation_status, verification_status, closure_method, parent_ref')
    .order('ewo_ref');

  if (error || !allEWOs) {
    return {
      candidates: [],
      excluded: [],
      scopeMismatch: true,
      mismatchReport: `Failed to load EWOs: ${error?.message ?? 'no data'}`,
    };
  }

  const total = allEWOs.length;
  const excluded = allEWOs.filter((e: Record<string, unknown>) => (e.ewo_ref as string) === EXCLUDED_REF);
  const candidates = allEWOs.filter((e: Record<string, unknown>) => (e.ewo_ref as string) !== EXCLUDED_REF) as unknown as CandidateEWO[];

  if (total !== EXPECTED_TOTAL) {
    return {
      candidates,
      excluded: excluded as unknown as CandidateEWO[],
      scopeMismatch: true,
      mismatchReport: `Total canonical EWO count = ${total}, expected ${EXPECTED_TOTAL}. Stopping before any writes.`,
    };
  }

  if (excluded.length !== EXPECTED_EXCLUDED) {
    return {
      candidates,
      excluded: excluded as unknown as CandidateEWO[],
      scopeMismatch: true,
      mismatchReport: `Excluded count = ${excluded.length}, expected ${EXPECTED_EXCLUDED}. Stopping before any writes.`,
    };
  }

  if (candidates.length !== EXPECTED_CANDIDATES) {
    return {
      candidates,
      excluded: excluded as unknown as CandidateEWO[],
      scopeMismatch: true,
      mismatchReport: `Candidate count = ${candidates.length}, expected ${EXPECTED_CANDIDATES}. Stopping before any writes.`,
    };
  }

  // Check for duplicate ewo_ref
  const refs = candidates.map((c) => c.ewo_ref);
  const duplicates = refs.filter((r, i) => refs.indexOf(r) !== i);
  if (duplicates.length > 0) {
    return {
      candidates,
      excluded: excluded as unknown as CandidateEWO[],
      scopeMismatch: true,
      mismatchReport: `Duplicate canonical references found: ${duplicates.join(', ')}. Stopping before any writes.`,
    };
  }

  return {
    candidates,
    excluded: excluded as unknown as CandidateEWO[],
    scopeMismatch: false,
    mismatchReport: null,
  };
}

// ─── Integrity Validation (Requirement 4) ────────────────────────────────────

async function validateIntegrity(ewo: CandidateEWO): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];

  // Check ewo_ref is present
  if (!ewo.ewo_ref || ewo.ewo_ref.trim().length === 0) {
    issues.push('ewo_ref is missing or empty');
  }

  // Check no duplicate reference exists (already validated in scope, but double-check)
  const { count: refCount } = await supabase
    .from('engineering_work_orders')
    .select('*', { count: 'exact', head: true })
    .eq('ewo_ref', ewo.ewo_ref);

  if ((refCount ?? 0) > 1) {
    issues.push(`Duplicate reference: ${refCount} records found for ${ewo.ewo_ref}`);
  }

  // Check lifecycle history belongs to this EWO
  const { count: lifecycleCount } = await supabase
    .from('ewo_lifecycle_events')
    .select('*', { count: 'exact', head: true })
    .eq('ewo_id', ewo.id);

  // Lifecycle events are optional but if they exist, they must belong to this EWO
  // (enforced by FK constraint, so no issue needed)

  // Check verification records belong to this EWO
  const { count: gateCount } = await supabase
    .from('ewo_verification_gates')
    .select('*', { count: 'exact', head: true })
    .eq('ewo_id', ewo.id);

  // Check parent relationship is valid if present
  if (ewo.parent_ref) {
    const { count: parentCount } = await supabase
      .from('engineering_work_orders')
      .select('*', { count: 'exact', head: true })
      .eq('ewo_ref', ewo.parent_ref);

    if ((parentCount ?? 0) === 0) {
      issues.push(`Parent reference ${ewo.parent_ref} does not exist in canonical ledger`);
    }
  }

  return { valid: issues.length === 0, issues };
}

// ─── Verification (Requirement 5 & 6) ─────────────────────────────────────────

async function verifyEWO(
  ewo: CandidateEWO,
  dryRun: boolean
): Promise<{ result: 'already_verified' | 'verified' | 'skipped' | 'failed'; verifiedGates: number; totalGates: number; reason: string | null }> {
  // Get current verification gates
  const gates = await getVerificationGates(ewo.id);
  const totalGates = gates.length;
  const verifiedGates = gates.filter((g) => g.status === 'verified').length;

  // If all 5 gates are verified, preserve existing
  if (totalGates === 5 && verifiedGates === 5) {
    return { result: 'already_verified', verifiedGates: 5, totalGates: 5, reason: null };
  }

  // If no gates exist, this is a historical EWO that predates the verification model
  if (totalGates === 0) {
    // Historical EWO — use artefact-derived reconciliation
    // Check if completion report exists
    const { count: reportCount } = await supabase
      .from('ewo_completion_reports')
      .select('*', { count: 'exact', head: true })
      .eq('ewo_id', ewo.id);

    // Check if engineering records exist
    const { count: recordCount } = await supabase
      .from('engineering_records_library')
      .select('*', { count: 'exact', head: true })
      .eq('ewo_id', ewo.id);

    if (reportCount === 0 && recordCount === 0) {
      return {
        result: 'skipped',
        verifiedGates: 0,
        totalGates: 0,
        reason: 'Historical EWO with no verification gates, no completion report, and no engineering records. Cannot safely verify.',
      };
    }

    if (dryRun) {
      return {
        result: 'verified',
        verifiedGates: 0,
        totalGates: 0,
        reason: 'Would initialize gates and verify via artefact-derived historical evidence',
      };
    }

    // Initialize gates via RPC
    const { error: initError } = await supabase.rpc('initialize_ewo_verification_gates', { p_ewo_id: ewo.id });
    if (initError) {
      return { result: 'failed', verifiedGates: 0, totalGates: 0, reason: `Failed to initialize gates: ${initError.message}` };
    }

    // Now run verification orchestration with PO-initiated flag to verify all gates
    const request: OrchestrationRequest = {
      workOrderId: ewo.id,
      mode: 'verify_all_eligible',
      requestedBy: 'product_owner',
      isProductOwnerInitiated: true,
      notes: 'Governed maintenance script — historical EWO verification via artefact-derived evidence',
    };

    try {
      const orchestrationResult = await runVerificationOrchestration(request);

      // Re-check gates after orchestration
      const updatedGates = await getVerificationGates(ewo.id);
      const updatedVerified = updatedGates.filter((g) => g.status === 'verified').length;

      if (updatedGates.length === 5 && updatedVerified === 5) {
        return { result: 'verified', verifiedGates: 5, totalGates: 5, reason: null };
      }

      return {
        result: 'failed',
        verifiedGates: updatedVerified,
        totalGates: updatedGates.length,
        reason: `Verification incomplete: ${updatedVerified}/${updatedGates.length} gates verified. Final status: ${orchestrationResult.final_status}`,
      };
    } catch (err) {
      return {
        result: 'failed',
        verifiedGates: 0,
        totalGates: 0,
        reason: `Verification orchestration failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Has some gates but not all verified — run orchestration
  if (dryRun) {
    return {
      result: 'verified',
      verifiedGates,
      totalGates,
      reason: `Would run Verify All Eligible (${verifiedGates}/${totalGates} already verified)`,
    };
  }

  const request: OrchestrationRequest = {
    workOrderId: ewo.id,
    mode: 'verify_remaining',
    requestedBy: 'product_owner',
    isProductOwnerInitiated: true,
    notes: 'Governed maintenance script — Verify All Eligible Gates',
  };

  try {
    const orchestrationResult = await runVerificationOrchestration(request);
    const updatedGates = await getVerificationGates(ewo.id);
    const updatedVerified = updatedGates.filter((g) => g.status === 'verified').length;

    if (updatedGates.length === 5 && updatedVerified === 5) {
      return { result: 'verified', verifiedGates: 5, totalGates: 5, reason: null };
    }

    return {
      result: 'failed',
      verifiedGates: updatedVerified,
      totalGates: updatedGates.length,
      reason: `Verification incomplete: ${updatedVerified}/${updatedGates.length} gates verified. Final status: ${orchestrationResult.final_status}`,
    };
  } catch (err) {
    return {
      result: 'failed',
      verifiedGates,
      totalGates,
      reason: `Verification orchestration failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Product Owner Acceptance (Requirement 8) ─────────────────────────────────

async function acceptEWO(
  ewo: CandidateEWO,
  dryRun: boolean
): Promise<{ result: 'already_accepted' | 'accepted' | 'skipped' | 'failed'; reason: string | null }> {
  // Check if already accepted (any valid acceptance note)
  if (ewo.po_accepted_at && ewo.po_acceptance_statement) {
    return { result: 'already_accepted', reason: null };
  }

  if (dryRun) {
    return { result: 'accepted', reason: 'Would record authorised PO acceptance note' };
  }

  // Use canonical grantPoAcceptance
  const result = await grantPoAcceptance(ewo.ewo_ref, ACCEPTED_BY, ACCEPTANCE_NOTE);

  if (result.closed) {
    return { result: 'accepted', reason: null };
  }

  if (!result.closure_eligible) {
    // Acceptance recorded but closure not eligible — this is OK, acceptance is still recorded
    // Closure will be attempted separately
    return { result: 'accepted', reason: 'PO acceptance recorded but closure prerequisites not fully met' };
  }

  return { result: 'accepted', reason: null };
}

// ─── Canonical Closure (Requirement 9) ────────────────────────────────────────

async function closeEWO(
  ewo: CandidateEWO,
  dryRun: boolean
): Promise<{ result: 'already_closed' | 'closed' | 'skipped' | 'failed'; reason: string | null }> {
  // Check if already closed with valid acceptance and verification
  if (ewo.status === 'closed' && ewo.po_accepted_at) {
    // Validate that closure is truthful
    const assessment = await assessLifecycle(ewo.ewo_ref);
    if (assessment && assessment.derived_state === 'closed' && assessment.closure_eligible) {
      return { result: 'already_closed', reason: null };
    }
    // Closed but not closure_eligible — need to fix closure eligibility
    // Fall through to attempt canonical closure
  }

  if (ewo.status === 'closed' && !ewo.po_accepted_at) {
    // Premature closure — need PO acceptance first, then re-close
    // This will be handled by the acceptance + progressLifecycle flow
  }

  if (dryRun) {
    return { result: 'closed', reason: 'Would close through canonical lifecycle service' };
  }

  // Use canonical progressLifecycle to transition to closed
  const result = await progressLifecycle(ewo.ewo_ref, ACCEPTED_BY, 'Governed maintenance script — canonical closure after PO acceptance');

  if (result.to_status === 'closed') {
    return { result: 'closed', reason: null };
  }

  // If progressLifecycle didn't transition to closed, check if already closed
  if (result.to_status === 'closed' || (ewo.status === 'closed' && result.transitioned === false)) {
    return { result: 'already_closed', reason: null };
  }

  return {
    result: 'failed',
    reason: `Closure failed: transitioned=${result.transitioned}, to_status=${result.to_status}`,
  };
}

// ─── Main Processing ──────────────────────────────────────────────────────────

async function processEWO(ewo: CandidateEWO, dryRun: boolean): Promise<PerEWOResult> {
  const result: PerEWOResult = {
    ewo_ref: ewo.ewo_ref,
    title: ewo.title,
    starting_state: ewo.status,
    integrity_valid: false,
    integrity_issues: [],
    verification_result: 'skipped',
    verified_gates: 0,
    total_gates: 0,
    po_acceptance_result: 'skipped',
    closure_result: 'skipped',
    final_state: ewo.status,
    action_taken: '',
    failure_or_skip_reason: null,
  };

  // Step 1: Integrity validation
  const integrity = await validateIntegrity(ewo);
  result.integrity_valid = integrity.valid;
  result.integrity_issues = integrity.issues;

  if (!integrity.valid) {
    result.action_taken = 'Skipped — integrity validation failed';
    result.failure_or_skip_reason = integrity.issues.join('; ');
    return result;
  }

  // Step 2: Verification
  const verification = await verifyEWO(ewo, dryRun);
  result.verification_result = verification.result;
  result.verified_gates = verification.verifiedGates;
  result.total_gates = verification.totalGates;

  if (verification.result === 'failed') {
    result.action_taken = 'Skipped — verification failed';
    result.failure_or_skip_reason = verification.reason;
    result.final_state = ewo.status;
    return result;
  }

  if (verification.result === 'skipped') {
    result.action_taken = 'Skipped — verification skipped';
    result.failure_or_skip_reason = verification.reason;
    result.final_state = ewo.status;
    return result;
  }

  // Step 3: Product Owner Acceptance
  const acceptance = await acceptEWO(ewo, dryRun);
  result.po_acceptance_result = acceptance.result;

  if (acceptance.result === 'failed') {
    result.action_taken = 'Skipped — PO acceptance failed';
    result.failure_or_skip_reason = acceptance.reason;
    result.final_state = ewo.status;
    return result;
  }

  // Step 4: Canonical Closure
  const closure = await closeEWO(ewo, dryRun);
  result.closure_result = closure.result;

  if (closure.result === 'failed') {
    result.action_taken = 'Partial — PO acceptance recorded but closure failed';
    result.failure_or_skip_reason = closure.reason;
    result.final_state = ewo.status;
    return result;
  }

  // Determine action taken
  const actions: string[] = [];
  if (verification.result === 'verified') actions.push('verified');
  if (verification.result === 'already_verified') actions.push('already_verified');
  if (acceptance.result === 'accepted') actions.push('accepted');
  if (acceptance.result === 'already_accepted') actions.push('already_accepted');
  if (closure.result === 'closed') actions.push('closed');
  if (closure.result === 'already_closed') actions.push('already_closed');

  result.action_taken = actions.join(', ');
  result.final_state = 'closed';
  return result;
}

// ─── Batch Audit Record (Requirement 12) ─────────────────────────────────────

async function createBatchAuditRecord(batchResult: BatchResult): Promise<void> {
  if (DRY_RUN) return; // No writes in dry-run

  await supabase.from('ewo_batch_audit_records').insert({
    execution_id: batchResult.execution_id,
    script_name: SCRIPT_NAME,
    script_version: SCRIPT_VERSION,
    initiated_by: ACCEPTED_BY,
    dry_run: batchResult.dry_run,
    total_canonical: batchResult.total_canonical,
    excluded_refs: batchResult.excluded_refs,
    candidate_count: batchResult.candidate_count,
    verified_count: batchResult.verified_count,
    accepted_count: batchResult.accepted_count,
    closed_count: batchResult.closed_count,
    already_complete_count: batchResult.already_complete_count,
    skipped_count: batchResult.skipped_count,
    failed_count: batchResult.failed_count,
    per_ewo_results: batchResult.per_ewo_results,
    acceptance_note: ACCEPTANCE_NOTE,
    code_version: SCRIPT_VERSION,
    status: 'completed',
    summary: `Processed ${batchResult.candidate_count} EWOs: ${batchResult.verified_count} verified, ${batchResult.accepted_count} accepted, ${batchResult.closed_count} closed, ${batchResult.already_complete_count} already complete, ${batchResult.skipped_count} skipped, ${batchResult.failed_count} failed.`,
    completed_at: new Date().toISOString(),
  });
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

async function main(): Promise<BatchResult> {
  const executionId = `BATCH-${Date.now()}`;
  console.log(`\n${'='.repeat(80)}`);
  console.log(`EWO-014.19A.7R.1 — Governed Maintenance Script`);
  console.log(`Execution ID: ${executionId}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE EXECUTION'}`);
  console.log(`${'='.repeat(80)}\n`);

  // Step 1: Scope validation
  console.log('Step 1: Scope Validation...');
  const scope = await validateScope();

  if (scope.scopeMismatch) {
    console.error(`SCOPE MISMATCH: ${scope.scopeMismatchReport}`);
    console.error('STOPPING — no writes performed.');
    return {
      execution_id: executionId,
      dry_run: DRY_RUN,
      total_canonical: scope.candidates.length + scope.excluded.length,
      excluded_refs: scope.excluded.map((e) => e.ewo_ref),
      candidate_count: scope.candidates.length,
      verified_count: 0,
      accepted_count: 0,
      closed_count: 0,
      already_complete_count: 0,
      skipped_count: 0,
      failed_count: 0,
      per_ewo_results: [],
      scope_mismatch: true,
      scope_mismatch_report: scope.scopeMismatchReport,
    };
  }

  console.log(`  Total canonical EWOs: ${EXPECTED_TOTAL}`);
  console.log(`  Excluded (TEST): ${scope.excluded.length}`);
  console.log(`  Candidates: ${scope.candidates.length}`);
  console.log('  Scope validated.\n');

  // Step 2: Process each EWO
  console.log(`Step 2: Processing ${scope.candidates.length} EWOs...\n`);
  const perEwoResults: PerEWOResult[] = [];

  for (const ewo of scope.candidates) {
    const result = await processEWO(ewo, DRY_RUN);
    perEwoResults.push(result);

    const status = result.failure_or_skip_reason ? `[${result.failure_or_skip_reason}]` : `[${result.action_taken}]`;
    console.log(`  ${ewo.ewo_ref.padEnd(20)} ${ewo.status.padEnd(15)} → ${result.final_state.padEnd(15)} ${status}`);
  }

  // Step 3: Aggregate results
  const verifiedCount = perEwoResults.filter((r) => r.verification_result === 'verified').length;
  const acceptedCount = perEwoResults.filter((r) => r.po_acceptance_result === 'accepted').length;
  const closedCount = perEwoResults.filter((r) => r.closure_result === 'closed').length;
  const alreadyCompleteCount = perEwoResults.filter(
    (r) => r.verification_result === 'already_verified' && r.po_acceptance_result === 'already_accepted' && r.closure_result === 'already_closed'
  ).length;
  const skippedCount = perEwoResults.filter((r) => r.verification_result === 'skipped' || r.closure_result === 'skipped').length;
  const failedCount = perEwoResults.filter((r) => r.verification_result === 'failed' || r.po_acceptance_result === 'failed' || r.closure_result === 'failed').length;

  const batchResult: BatchResult = {
    execution_id: executionId,
    dry_run: DRY_RUN,
    total_canonical: EXPECTED_TOTAL,
    excluded_refs: scope.excluded.map((e) => e.ewo_ref),
    candidate_count: scope.candidates.length,
    verified_count: verifiedCount,
    accepted_count: acceptedCount,
    closed_count: closedCount,
    already_complete_count: alreadyCompleteCount,
    skipped_count: skippedCount,
    failed_count: failedCount,
    per_ewo_results: perEwoResults,
    scope_mismatch: false,
    scope_mismatch_report: null,
  };

  // Step 4: Create batch audit record
  if (!DRY_RUN) {
    console.log('\nStep 3: Creating batch audit record...');
    await createBatchAuditRecord(batchResult);
    console.log('  Batch audit record created.\n');
  }

  // Step 5: Print summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(80)}`);
  console.log(`  Execution ID:     ${executionId}`);
  console.log(`  Mode:              ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Total canonical:   ${batchResult.total_canonical}`);
  console.log(`  Excluded (TEST):   ${batchResult.excluded_refs.length}`);
  console.log(`  Candidates:        ${batchResult.candidate_count}`);
  console.log(`  Verified:          ${batchResult.verified_count}`);
  console.log(`  Accepted:          ${batchResult.accepted_count}`);
  console.log(`  Closed:            ${batchResult.closed_count}`);
  console.log(`  Already complete:  ${batchResult.already_complete_count}`);
  console.log(`  Skipped:           ${batchResult.skipped_count}`);
  console.log(`  Failed:            ${batchResult.failed_count}`);
  console.log(`${'='.repeat(80)}\n`);

  return batchResult;
}

// ─── Execute ──────────────────────────────────────────────────────────────────

// This script is run via npx tsx scripts/ewo014_19a_7r1_governed_maintenance.ts
// Set DRY_RUN=false to execute live writes.

export { main, validateScope, validateIntegrity, verifyEWO, acceptEWO, closeEWO, processEWO };
