// EWO-033R.4 Correction 9 — Hardened Execution Readiness Validation
//
// Every readiness query is wrapped in try-catch. No query throws.
// Each validation returns one of: SUCCESS | WARNING | BLOCKED | FAILED.
// Validations are classified as Required, Recommended, or Optional.
// Warnings never stop execution. Only Required failures block.

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ValidationStatus = 'success' | 'warning' | 'blocked' | 'failed';
export type ValidationSeverity = 'required' | 'recommended' | 'optional';

export interface ReadinessDiagnostic {
  name: string;
  severity: ValidationSeverity;
  status: ValidationStatus;
  duration: number;
  query: string;
  response: string;
  error: string | null;
  stack: string | null;
  recoveryAdvice: string | null;
}

export interface BlockingDetail {
  reason: string;
  evidence: string;
  recoveryOptions: string[];
}

export interface ReadinessReport {
  eligible: boolean;
  checks: ReadinessDiagnostic[];
  summary: string;
  blockingReasons: string[];
  blockingDetails: BlockingDetail[];
  warnings: string[];
  diagnosticsRef: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeQuery<T = any>(
  name: string,
  severity: ValidationSeverity,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryFn: () => PromiseLike<any>,
  queryDesc: string,
): Promise<{ data: T | null; diagnostic: ReadinessDiagnostic }> {
  const start = Date.now();
  try {
    const result = await queryFn();
    const data = result?.data ?? null;
    const error = result?.error ?? null;
    const duration = Date.now() - start;
    if (error) {
      return {
        data: null,
        diagnostic: {
          name,
          severity,
          status: severity === 'required' ? 'blocked' : 'warning',
          duration,
          query: queryDesc,
          response: 'error',
          error: error.message,
          stack: null,
          recoveryAdvice: getRecoveryAdvice(name, error.message),
        },
      };
    }
    return {
      data,
      diagnostic: {
        name,
        severity,
        status: 'success',
        duration,
        query: queryDesc,
        response: 'ok',
        error: null,
        stack: null,
        recoveryAdvice: null,
      },
    };
  } catch (err) {
    const duration = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? null : null;
    return {
      data: null,
      diagnostic: {
        name,
        severity,
        status: severity === 'required' ? 'failed' : 'warning',
        duration,
        query: queryDesc,
        response: 'exception',
        error: msg,
        stack,
        recoveryAdvice: getRecoveryAdvice(name, msg),
      },
    };
  }
}

function getRecoveryAdvice(name: string, errorMsg: string): string {
  if (errorMsg.includes('permission') || errorMsg.includes('rls') || errorMsg.includes('policy')) {
    return `RLS policy may be blocking access. Check that the authenticated user has the correct role for ${name}.`;
  }
  if (errorMsg.includes('column') && errorMsg.includes('does not exist')) {
    return `Schema mismatch — a column referenced in ${name} does not exist. Check the migration history.`;
  }
  if (errorMsg.includes('relation') && errorMsg.includes('does not exist')) {
    return `Table referenced in ${name} does not exist. Check that the migration was applied.`;
  }
  if (errorMsg.includes('timeout') || errorMsg.includes('network')) {
    return `Network or timeout issue during ${name}. Retry the operation.`;
  }
  return `Unexpected error in ${name}. Retry or contact support if the issue persists.`;
}

function generateDiagnosticsRef(): string {
  return `RD-${Date.now().toString(36).toUpperCase()}`;
}

// ─── Hardened Readiness Validator ─────────────────────────────────────────────

export async function validateExecutionReadiness(
  ewoId: string,
): Promise<ReadinessReport> {
  const checks: ReadinessDiagnostic[] = [];
  const blockingReasons: string[] = [];
  const blockingDetails: BlockingDetail[] = [];
  const warnings: string[] = [];

  // ── 1. EWO exists (Required) ─────────────────────────────────────────────
  const ewoResult = await safeQuery(
    'EWO exists',
    'required',
    () => supabase
      .from('engineering_work_orders')
      .select('id, ewo_ref, title, status, implementation_status, is_historical_import, implementation_completed_at, engineering_package_status, implementation_provider')
      .eq('id', ewoId)
      .maybeSingle(),
    `engineering_work_orders WHERE id = '${ewoId}'`,
  );
  checks.push(ewoResult.diagnostic);

  if (!ewoResult.data) {
    if (ewoResult.diagnostic.status === 'blocked' || ewoResult.diagnostic.status === 'failed') {
      blockingReasons.push(`EWO exists: ${ewoResult.diagnostic.error}`);
    } else {
      blockingReasons.push('EWO not found');
    }
    return buildReport(checks, blockingReasons, warnings, false, blockingDetails);
  }

  const ewo = ewoResult.data;
  const workOrderClosed = ewo.status === 'closed' || ewo.status === 'archived';
  const alreadyExecuted = ['complete', 'Implementation Complete', 'Completed'].includes(ewo.implementation_status);

  if (workOrderClosed) {
    blockingReasons.push(`EWO is ${ewo.status} — execution unavailable`);
  }

  // ── 2. Engineering Plan (Recommended) ────────────────────────────────────
  const pkgResult = await safeQuery(
    'Engineering Package',
    'recommended',
    () => supabase
      .from('ewo_engineering_packages')
      .select('id, package_status, summary')
      .eq('ewo_id', ewoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    `ewo_engineering_packages WHERE ewo_id = '${ewoId}'`,
  );
  checks.push(pkgResult.diagnostic);

  const pkgApproved = !!pkgResult.data && pkgResult.data.package_status === 'approved';
  if (!pkgApproved && pkgResult.diagnostic.status === 'success') {
    warnings.push('Engineering package not yet approved — will be assembled at execution time');
  } else if (pkgResult.diagnostic.status === 'warning') {
    warnings.push(`Engineering package query failed: ${pkgResult.diagnostic.error}`);
  }

  // ── 3. Engineering Review (Recommended) ──────────────────────────────────
  const reviewResult = await safeQuery(
    'Engineering Review',
    'recommended',
    () => supabase
      .from('ecc_engineering_reviews')
      .select('id, erc_number, status, metadata')
      .eq('metadata->>ewo_ref', ewo.ewo_ref)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    `ecc_engineering_reviews WHERE metadata->>ewo_ref = '${ewo.ewo_ref}'`,
  );
  checks.push(reviewResult.diagnostic);

  const reviewApproved = !!reviewResult.data && reviewResult.data.status === 'approved';
  if (!reviewApproved && reviewResult.diagnostic.status === 'success') {
    warnings.push('Engineering review not yet approved — optional for conversation-first flow');
  } else if (reviewResult.diagnostic.status === 'warning') {
    warnings.push(`Engineering review query failed: ${reviewResult.diagnostic.error}`);
  }

  // ── 4. PO Execution Approval (Optional — it's a decision, not a prerequisite) ─
  const poResult = await safeQuery(
    'PO Execution Approval',
    'optional',
    () => supabase
      .from('ewo_execution_approvals')
      .select('id, approval_ref, decision, product_owner, is_test')
      .eq('ewo_id', ewoId)
      .eq('decision', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    `ewo_execution_approvals WHERE ewo_id = '${ewoId}', decision = 'approved'`,
  );
  checks.push(poResult.diagnostic);

  if (!poResult.data && poResult.diagnostic.status === 'success') {
    warnings.push('PO execution approval not yet recorded — pending PO decision');
  } else if (poResult.diagnostic.status === 'warning') {
    warnings.push(`PO approval query failed: ${poResult.diagnostic.error}`);
  }

  // ── 5. Active Execution Session (Required) ──────────────────────────────
  const execResult = await safeQuery(
    'Active Execution Session',
    'required',
    () => supabase
      .from('engineering_executions')
      .select('id, execution_ref, implementation_status')
      .eq('ewo_id', ewoId)
      .order('created_at', { ascending: false }),
    `engineering_executions WHERE ewo_id = '${ewoId}'`,
  );
  checks.push(execResult.diagnostic);

  // EWO-033R.4 Correction 10: Execution Lifecycle Audit
  // ACTIVE states — genuinely in-progress, should block new execution:
  //   queued, running, prepared, submitted, awaiting_completion
  // STALE states — may be abandoned, should NOT permanently block:
  //   awaiting_review, awaiting_po, awaiting_po_testing, po_accepted
  // TERMINAL states — completed, no longer active:
  //   complete, cancelled, failed, rejected
  const genuinelyActiveStatuses = ['queued', 'running', 'prepared', 'submitted', 'awaiting_completion'];
  const staleStatuses = ['awaiting_review', 'awaiting_po', 'awaiting_po_testing', 'po_accepted'];
  const executions = execResult.data ?? [];
  const activeExecution = executions.find((e: { implementation_status: string }) => genuinelyActiveStatuses.includes(e.implementation_status));
  const staleExecution = executions.find((e: { implementation_status: string }) => staleStatuses.includes(e.implementation_status));

  if (activeExecution) {
    blockingReasons.push(`Active execution ${activeExecution.execution_ref} exists (status: ${activeExecution.implementation_status})`);
    blockingDetails.push({
      reason: `Active execution ${activeExecution.execution_ref} is in progress (status: ${activeExecution.implementation_status})`,
      evidence: `engineering_executions WHERE ewo_id = '${ewoId}' — found ${activeExecution.execution_ref} with implementation_status = '${activeExecution.implementation_status}'`,
      recoveryOptions: [
        'Wait for the current execution to complete',
        'Cancel the current execution and start a new one',
      ],
    });
  } else if (staleExecution) {
    // EWO-033R.4 Correction 10: Stale executions should NOT permanently block.
    // The PO may have abandoned the session. Provide governed recovery instead.
    warnings.push(`Stale execution ${staleExecution.execution_ref} found (status: ${staleExecution.implementation_status}) — recovery available`);
    blockingDetails.push({
      reason: `A previous execution ${staleExecution.execution_ref} is in a stale state (${staleExecution.implementation_status})`,
      evidence: `engineering_executions WHERE ewo_id = '${ewoId}' — found ${staleExecution.execution_ref} with implementation_status = '${staleExecution.implementation_status}'`,
      recoveryOptions: [
        'Resume the existing execution session',
        'Cancel the stale execution and create a new one',
      ],
    });
  }
  if (alreadyExecuted && executions.length > 0 && !activeExecution && !staleExecution) {
    blockingReasons.push('Execution already completed');
  }

  // ── 6. Execution Target (Required) ───────────────────────────────────────
  // EWO-033R.4 Correction 10: The execution_targets table has MULTIPLE active
  // targets (ET-001, ET-002, ET-TEST). Using .maybeSingle() with multiple rows
  // causes HTTP 400 "JSON object requested, multiple (or no) rows returned".
  // Fix: query without .maybeSingle(), use .limit(1), take first element from array.
  const isTestCandidate = ewo.ewo_ref.startsWith('EWO-TEST');
  const targetQueryDesc = isTestCandidate
    ? `execution_targets WHERE target_ref = 'ET-TEST'`
    : `execution_targets WHERE is_active = true ORDER BY created_at DESC LIMIT 1`;

  let targetResult;
  if (isTestCandidate) {
    targetResult = await safeQuery<{ id: string; target_ref: string; platform: string; repository: string; default_branch: string; staging_branch: string; production_branch: string; is_active: boolean; is_protected: boolean }>(
      'Execution Target',
      'required',
      () => supabase
        .from('execution_targets')
        .select('id, target_ref, platform, repository, default_branch, staging_branch, production_branch, is_active, is_protected')
        .eq('target_ref', 'ET-TEST')
        .limit(1),
      targetQueryDesc,
    );
  } else {
    targetResult = await safeQuery<{ id: string; target_ref: string; platform: string; repository: string; default_branch: string; staging_branch: string; production_branch: string; is_active: boolean; is_protected: boolean }>(
      'Execution Target',
      'required',
      () => supabase
        .from('execution_targets')
        .select('id, target_ref, platform, repository, default_branch, staging_branch, production_branch, is_active, is_protected')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1),
      targetQueryDesc,
    );
  }
  checks.push(targetResult.diagnostic);

  // Data comes back as an array (no .maybeSingle()), so take first element
  const targetArray = Array.isArray(targetResult.data) ? targetResult.data : (targetResult.data ? [targetResult.data] : []);
  const target = targetArray[0] ?? null;
  let targetAvailable = false;
  if (target) {
    targetAvailable = !!target.repository && !!target.default_branch;
  }
  if (!targetAvailable) {
    if (targetResult.diagnostic.status === 'success') {
      blockingReasons.push('No active execution target with valid repository and branch configuration');
      blockingDetails.push({
        reason: 'No active execution target with valid repository and branch configuration',
        evidence: `execution_targets WHERE is_active = true — no rows with valid repository and default_branch`,
        recoveryOptions: [
          'Configure an active execution target with a valid repository and branch strategy',
          'Ensure at least one target has is_active = true, repository set, and default_branch set',
        ],
      });
    } else {
      blockingReasons.push(`Execution target query failed: ${targetResult.diagnostic.error}`);
      blockingDetails.push({
        reason: `Execution target query failed: ${targetResult.diagnostic.error}`,
        evidence: targetQueryDesc,
        recoveryOptions: [targetResult.diagnostic.recoveryAdvice ?? 'Retry or contact support'],
      });
    }
  }

  // ── 7. Constitutional Validity (Recommended) ─────────────────────────────
  const constResult = await safeQuery(
    'Constitutional Validity',
    'recommended',
    () => supabase
      .from('constitutional_documents')
      .select('id, document_ref, title')
      .eq('status', 'failed')
      .limit(1),
    `constitutional_documents WHERE status = 'failed'`,
  );
  checks.push(constResult.diagnostic);

  if (constResult.data && constResult.data.length > 0) {
    warnings.push('Constitutional amendment in failed state — execution may be impacted');
  } else if (constResult.diagnostic.status === 'warning') {
    warnings.push(`Constitutional check query failed: ${constResult.diagnostic.error}`);
  }

  // ── 8. Verification Gates (Optional) ─────────────────────────────────────
  const gatesResult = await safeQuery(
    'Verification Gates',
    'optional',
    () => supabase
      .from('ewo_verification_gates')
      .select('id')
      .eq('ewo_id', ewoId),
    `ewo_verification_gates WHERE ewo_id = '${ewoId}'`,
  );
  checks.push(gatesResult.diagnostic);

  if (!gatesResult.data || gatesResult.data.length === 0) {
    if (gatesResult.diagnostic.status === 'success') {
      warnings.push('Verification gates not yet initialized — will be created during execution');
    } else if (gatesResult.diagnostic.status === 'warning') {
      warnings.push(`Verification gates query failed: ${gatesResult.diagnostic.error}`);
    }
  }

  // ── 9. Implementation Provider (Optional) ───────────────────────────────
  const provider = ewo.implementation_provider || 'bolt';
  const providerResult = await safeQuery(
    'Provider Available',
    'optional',
    () => supabase
      .from('ai_provider_configs')
      .select('id, provider, is_enabled')
      .eq('provider', provider)
      .eq('is_enabled', true)
      .limit(1)
      .maybeSingle(),
    `ai_provider_configs WHERE provider = '${provider}', is_enabled = true`,
  );
  checks.push(providerResult.diagnostic);

  if (!providerResult.data && providerResult.diagnostic.status === 'success') {
    warnings.push(`Provider ${provider} not configured — will use default`);
  } else if (providerResult.diagnostic.status === 'warning') {
    warnings.push(`Provider check query failed: ${providerResult.diagnostic.error}`);
  }

  // ── Final Determination ──────────────────────────────────────────────────
  // Only Required failures block. Warnings never stop execution.
  const eligible = blockingReasons.length === 0;

  return buildReport(checks, blockingReasons, warnings, eligible, blockingDetails);
}

function buildReport(
  checks: ReadinessDiagnostic[],
  blockingReasons: string[],
  warnings: string[],
  eligible: boolean,
  blockingDetails: BlockingDetail[],
): ReadinessReport {
  const summary = formatReportSummary(checks, eligible, blockingReasons, warnings, blockingDetails);
  return {
    eligible,
    checks,
    summary,
    blockingReasons,
    blockingDetails,
    warnings,
    diagnosticsRef: generateDiagnosticsRef(),
  };
}

function formatReportSummary(
  checks: ReadinessDiagnostic[],
  eligible: boolean,
  blockingReasons: string[],
  warnings: string[],
  blockingDetails: BlockingDetail[],
): string {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════');
  lines.push('Execution Readiness');
  lines.push('═══════════════════════════════════════════════');

  for (const c of checks) {
    const icon = c.status === 'success' ? '✓' : c.status === 'warning' ? '⚠' : '✗';
    lines.push(`${icon} ${c.name}${c.error ? ` — ${c.error}` : ''}`);
  }

  lines.push('');

  if (eligible) {
    lines.push('Execution can continue.');
  } else {
    lines.push('Execution Blocked');
    for (const d of blockingDetails) {
      lines.push(`  Reason: ${d.reason}`);
      lines.push(`  Evidence: ${d.evidence}`);
      lines.push('  Recovery Options:');
      for (const opt of d.recoveryOptions) {
        lines.push(`    • ${opt}`);
      }
    }
  }

  if (warnings.length > 0) {
    lines.push('');
    lines.push('Warnings (non-blocking):');
    for (const w of warnings) {
      lines.push(`  ⚠ ${w}`);
    }
  }

  lines.push('═══════════════════════════════════════════════');
  return lines.join('\n');
}
