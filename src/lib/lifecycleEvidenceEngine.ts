// EWO-017R — Product Owner Acceptance Governs Work Order Closure
//
// Lifecycle Truthfulness Refinement: ensures Engineering Work Order lifecycle
// status always reflects the true governance state. An EWO may only be Closed
// when Product Owner acceptance is granted.
//
// This engine derives lifecycle state from evidence (not assumptions), provides
// automatic progression as evidence is added, and exposes helpers for
// dashboards and the integrity engine.

import { supabase } from './supabase';
import { recordPOAcceptance, recordEWOClosed } from './engineeringChangeLogService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LifecycleState =
  | 'created'
  | 'implementation_started'
  | 'engineering_complete'
  | 'po_testing_pending'
  | 'awaiting_po_acceptance'
  | 'closed'
  | 'rejected'
  | 'superseded'
  | 'archived';

export interface LifecycleEvidence {
  ewo_ref: string;
  implementation_complete: boolean;
  engineering_package_attached: boolean;
  completion_report_present: boolean;
  po_testing_completed: boolean;
  po_acceptance_granted: boolean;
  rejection_recorded: boolean;
  superseded: boolean;
  archived: boolean;
  bootstrap_origin: string | null;
  bootstrap_date: string | null;
  bootstrap_reason: string | null;
}

export interface LifecycleAssessment {
  ewo_ref: string;
  evidence: LifecycleEvidence;
  current_status: string;
  derived_state: LifecycleState;
  closure_eligible: boolean;
  status_is_truthful: boolean;
  recommended_status: string;
  transition_needed: boolean;
}

// ─── Evidence Collection (Requirement 3) ──────────────────────────────────────

export async function collectLifecycleEvidence(ewoRef: string): Promise<LifecycleEvidence | null> {
  const { data: ewo, error } = await supabase
    .from('engineering_work_orders')
    .select('ewo_ref, status, implementation_status, implementation_completed_at, po_accepted_at, po_acceptance_statement, closed_at, closure_reason, archived, bootstrap_origin, bootstrap_date, bootstrap_reason, po_testing_status, po_testing_completed_at')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (error || !ewo) return null;

  // Check for engineering package
  const { count: packageCount } = await supabase
    .from('ewo_engineering_packages')
    .select('*', { count: 'exact', head: true })
    .eq('ewo_id', (await supabase.from('engineering_work_orders').select('id').eq('ewo_ref', ewoRef).maybeSingle()).data?.id ?? '');

  // Check for completion report
  const { count: reportCount } = await supabase
    .from('ewo_completion_reports')
    .select('*', { count: 'exact', head: true })
    .eq('ewo_ref', ewoRef);

  const implStatus = (ewo.implementation_status as string) ?? '';
  const implementationComplete =
    implStatus === 'complete' ||
    implStatus === 'Implementation Complete' ||
    Boolean(ewo.implementation_completed_at);

  const poAcceptanceGranted = Boolean(ewo.po_accepted_at) || Boolean(ewo.po_acceptance_statement);
  const poTestingCompleted =
    (ewo.po_testing_status as string) === 'completed' ||
    Boolean(ewo.po_testing_completed_at);

  return {
    ewo_ref: ewoRef,
    implementation_complete: implementationComplete,
    engineering_package_attached: (packageCount ?? 0) > 0,
    completion_report_present: (reportCount ?? 0) > 0,
    po_testing_completed: poTestingCompleted,
    po_acceptance_granted: poAcceptanceGranted,
    rejection_recorded: (ewo.closure_reason as string)?.toLowerCase().includes('reject') ?? false,
    superseded: false,
    archived: Boolean(ewo.archived) || (ewo.status as string) === 'archived',
    bootstrap_origin: (ewo.bootstrap_origin as string) ?? null,
    bootstrap_date: (ewo.bootstrap_date as string) ?? null,
    bootstrap_reason: (ewo.bootstrap_reason as string) ?? null,
  };
}

// ─── State Derivation (Requirement 3 — highest fully supported state) ────────

export function deriveLifecycleState(evidence: LifecycleEvidence): LifecycleState {
  // Terminal states first
  if (evidence.archived) return 'archived';
  if (evidence.superseded) return 'superseded';
  if (evidence.rejection_recorded) return 'rejected';
  if (evidence.po_acceptance_granted) return 'closed';

  // PO acceptance not yet granted — determine how far we've progressed
  if (evidence.po_testing_completed) return 'awaiting_po_acceptance';
  if (evidence.implementation_complete && evidence.completion_report_present) return 'po_testing_pending';
  if (evidence.implementation_complete) return 'engineering_complete';
  if (evidence.engineering_package_attached) return 'implementation_started';
  return 'created';
}

// ─── Closure Eligibility (Requirement 1) ──────────────────────────────────────

export function isClosureEligible(evidence: LifecycleEvidence): boolean {
  return (
    evidence.implementation_complete &&
    evidence.engineering_package_attached &&
    evidence.completion_report_present &&
    evidence.po_testing_completed &&
    evidence.po_acceptance_granted &&
    !evidence.rejection_recorded &&
    !evidence.superseded &&
    !evidence.archived
  );
}

// ─── Status Mapping ────────────────────────────────────────────────────────────
// Maps derived lifecycle states to the CHECK-constrained status values
// allowed by the engineering_work_orders table.

const STATE_TO_STATUS: Record<LifecycleState, string> = {
  created: 'draft',
  implementation_started: 'ready',
  engineering_complete: 'engineering_complete',
  po_testing_pending: 'engineering_complete',
  awaiting_po_acceptance: 'po_acceptance',
  closed: 'closed',
  rejected: 'closed',
  superseded: 'archived',
  archived: 'archived',
};

export function statusForState(state: LifecycleState): string {
  return STATE_TO_STATUS[state] ?? 'draft';
}

// ─── Truthfulness Check ───────────────────────────────────────────────────────

export function isStatusTruthful(currentStatus: string, derivedState: LifecycleState): boolean {
  const expected = statusForState(derivedState);
  return currentStatus === expected;
}

// ─── Full Assessment ──────────────────────────────────────────────────────────

export async function assessLifecycle(ewoRef: string): Promise<LifecycleAssessment | null> {
  const evidence = await collectLifecycleEvidence(ewoRef);
  if (!evidence) return null;

  const { data: ewo } = await supabase
    .from('engineering_work_orders')
    .select('status')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  const currentStatus = (ewo?.status as string) ?? 'draft';
  const derivedState = deriveLifecycleState(evidence);
  const closureEligible = isClosureEligible(evidence);
  const recommendedStatus = statusForState(derivedState);
  const truthful = isStatusTruthful(currentStatus, derivedState);

  return {
    ewo_ref: ewoRef,
    evidence,
    current_status: currentStatus,
    derived_state: derivedState,
    closure_eligible: closureEligible,
    status_is_truthful: truthful,
    recommended_status: recommendedStatus,
    transition_needed: !truthful,
  };
}

// ─── Automatic Progression (Requirement 4) ────────────────────────────────────
//
// Advances lifecycle as governance evidence is added. Each transition
// creates a lifecycle event.

export async function progressLifecycle(
  ewoRef: string,
  actor: string = 'system',
  reason: string = 'Automatic lifecycle progression'
): Promise<{ transitioned: boolean; from_status: string | null; to_status: string | null; assessment: LifecycleAssessment | null }> {
  // Guard: ensure canonical EWO exists before lifecycle progression
  const { guardImplementationEntry } = await import('./ensureEngineeringWorkOrder');
  const guard = await guardImplementationEntry(ewoRef, 'progressLifecycle');
  if (!guard.success) {
    return { transitioned: false, from_status: null, to_status: null, assessment: null };
  }

  const assessment = await assessLifecycle(ewoRef);
  if (!assessment) {
    return { transitioned: false, from_status: null, to_status: null, assessment: null };
  }

  if (!assessment.transition_needed) {
    return { transitioned: false, from_status: assessment.current_status, to_status: assessment.current_status, assessment };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('engineering_work_orders')
    .update({
      status: assessment.recommended_status,
      closure_eligible: assessment.closure_eligible,
      updated_at: now,
    })
    .eq('ewo_ref', ewoRef);

  if (error) {
    return { transitioned: false, from_status: assessment.current_status, to_status: assessment.current_status, assessment };
  }

  // Record lifecycle event
  const { data: ewo } = await supabase
    .from('engineering_work_orders')
    .select('id')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (ewo) {
    await supabase.from('ewo_lifecycle_events').insert({
      ewo_id: ewo.id,
      from_status: assessment.current_status,
      to_status: assessment.recommended_status,
      actor,
      notes: `${reason}. Derived state: ${assessment.derived_state}. Closure eligible: ${assessment.closure_eligible}.`,
      metadata: {
        standard: 'EWO-017R',
        derived_state: assessment.derived_state,
        closure_eligible: assessment.closure_eligible,
        evidence: assessment.evidence,
      },
      created_at: now,
    });
  }

  return {
    transitioned: true,
    from_status: assessment.current_status,
    to_status: assessment.recommended_status,
    assessment,
  };
}

// ─── PO Testing Completion (Requirement 4 — transition to awaiting acceptance) ─

export async function completePoTesting(
  ewoRef: string,
  actor: string = 'product_owner'
): Promise<{ transitioned: boolean; to_status: string | null }> {
  const now = new Date().toISOString();
  await supabase
    .from('engineering_work_orders')
    .update({
      po_testing_status: 'completed',
      po_testing_completed_at: now,
      updated_at: now,
    })
    .eq('ewo_ref', ewoRef);

  const result = await progressLifecycle(ewoRef, actor, 'Product Owner testing completed');
  return { transitioned: result.transitioned, to_status: result.to_status };
}

// ─── PO Acceptance Safeguards (EWO-030R.3) ────────────────────────────────────
//
// Product Owner acceptance can only be recorded when ALL of the following are
// present:
//   1. An explicit Product Owner decision containing an authorised acceptance
//      instruction (e.g. "ACCEPTED").
//   2. A reference to the live Product Owner test result being accepted.
//   3. A verified requesting identity and authorised Product Owner role.
//   4. An explicit lifecycle-change request.
//   5. A confirmation that no unresolved acceptance blocker remains.
//
// Engineering completion reports, passing tests, deployment success, runtime
// verification, or an acceptance recommendation must NEVER independently
// trigger Product Owner acceptance.

export type PoAcceptanceDecision = 'ACCEPTED' | 'REJECTED' | 'PENDING';

export interface PoAcceptanceRequest {
  ewo_ref: string;
  /** The explicit Product Owner decision — must be 'ACCEPTED'. */
  po_decision: PoAcceptanceDecision;
  /** The identity of the Product Owner making the decision. */
  po_identity: string;
  /** Reference to the live Product Owner test/inspection result. */
  live_test_result_ref: string;
  /** The actor requesting the lifecycle change. */
  requested_by: string;
  /** Whether any unresolved acceptance blockers exist. */
  unresolved_blockers: boolean;
  /** The acceptance statement / notes. */
  acceptance_statement: string;
  /** Whether the request includes an explicit lifecycle-change instruction. */
  explicit_lifecycle_change: boolean;
}

export interface PoAcceptanceValidationResult {
  valid: boolean;
  rejection_reasons: string[];
}

export function validatePoAcceptanceRequest(
  request: PoAcceptanceRequest
): PoAcceptanceValidationResult {
  const reasons: string[] = [];

  if (request.po_decision !== 'ACCEPTED') {
    reasons.push(
      `Product Owner decision must be 'ACCEPTED' — received '${request.po_decision}'. ` +
      'Engineering completion, test success, deployment, or verification cannot substitute for an explicit acceptance decision.'
    );
  }

  if (!request.po_identity || request.po_identity.trim() === '') {
    reasons.push('Product Owner identity is required — acceptance cannot be recorded without a verified requesting identity.');
  }

  if (!request.live_test_result_ref || request.live_test_result_ref.trim() === '') {
    reasons.push('A reference to the live Product Owner test result is required — engineering verification is not a substitute for live PO inspection.');
  }

  if (!request.requested_by || request.requested_by.trim() === '') {
    reasons.push('The actor requesting the lifecycle change is required.');
  }

  if (!request.explicit_lifecycle_change) {
    reasons.push('An explicit lifecycle-change request is required — acceptance cannot be inferred from implementation completion, test success, or deployment.');
  }

  if (request.unresolved_blockers) {
    reasons.push('Acceptance is blocked while unresolved acceptance blockers remain.');
  }

  return {
    valid: reasons.length === 0,
    rejection_reasons: reasons,
  };
}

// ─── PO Acceptance (Requirement 1 — governs closure) ───────────────────────────

export async function grantPoAcceptance(
  ewoRef: string,
  acceptedBy: string,
  acceptanceStatement: string,
  acceptanceRequest?: PoAcceptanceRequest
): Promise<{ closed: boolean; closure_eligible: boolean; to_status: string | null; rejected?: boolean; rejection_reasons?: string[] }> {
  // EWO-030R.3 safeguard: if an acceptance request is provided, it must pass
  // all validation checks. If no request is provided, the function refuses to
  // record acceptance — the caller must provide an explicit PoAcceptanceRequest.
  if (!acceptanceRequest) {
    return {
      closed: false,
      closure_eligible: false,
      to_status: null,
      rejected: true,
      rejection_reasons: [
        'Product Owner acceptance requires an explicit PoAcceptanceRequest with a verified PO decision, live test result reference, and authorised identity.',
        'Engineering completion, test success, deployment success, or acceptance recommendations cannot independently trigger Product Owner acceptance.',
      ],
    };
  }

  const validation = validatePoAcceptanceRequest(acceptanceRequest);
  if (!validation.valid) {
    return {
      closed: false,
      closure_eligible: false,
      to_status: null,
      rejected: true,
      rejection_reasons: validation.rejection_reasons,
    };
  }

  // EWO-030R.4: The frontend service layer must NOT directly set PO acceptance
  // fields. The database trigger (trg_protect_po_acceptance_fields) blocks direct
  // updates. The canonical path is the governed RPC: grant_governed_product_owner_acceptance.
  // This function delegates to that RPC via the edge function.

  const { data: rpcResult, error: rpcError } = await supabase
    .rpc('grant_governed_product_owner_acceptance', {
      p_ewo_ref: ewoRef,
      p_po_identity: acceptanceRequest.po_identity,
      p_po_decision: acceptanceRequest.po_decision,
      p_live_test_result_ref: acceptanceRequest.live_test_result_ref,
      p_acceptance_command_ref: `frontend-${acceptanceRequest.requested_by}-${Date.now()}`,
      p_source_conversation_ref: null,
      p_audit_ref: `frontend-acceptance-${Date.now()}`,
      p_acceptance_statement: acceptanceStatement,
      p_explicit_lifecycle_change: acceptanceRequest.explicit_lifecycle_change,
      p_unresolved_blockers: acceptanceRequest.unresolved_blockers,
    });

  if (rpcError || !rpcResult) {
    return {
      closed: false,
      closure_eligible: false,
      to_status: null,
      rejected: true,
      rejection_reasons: [`Governed acceptance RPC failed: ${rpcError?.message ?? 'No result returned'}`],
    };
  }

  const result = rpcResult as { success?: boolean; acceptance_recorded?: boolean; rejection_reasons?: string[]; closed_at?: string };

  if (!result.success || !result.acceptance_recorded) {
    return {
      closed: false,
      closure_eligible: false,
      to_status: null,
      rejected: true,
      rejection_reasons: result.rejection_reasons ?? ['Governed acceptance RPC rejected the request'],
    };
  }

  return {
    closed: true,
    closure_eligible: true,
    to_status: 'closed',
  };
}

// ─── Bootstrap Transparency (Requirement 5) ───────────────────────────────────

export interface BootstrapTransparency {
  is_bootstrapped: boolean;
  bootstrap_origin: string | null;
  bootstrap_date: string | null;
  bootstrap_reason: string | null;
}

export async function getBootstrapTransparency(ewoRef: string): Promise<BootstrapTransparency> {
  const { data } = await supabase
    .from('engineering_work_orders')
    .select('bootstrap_origin, bootstrap_date, bootstrap_reason')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  return {
    is_bootstrapped: Boolean(data?.bootstrap_origin),
    bootstrap_origin: (data?.bootstrap_origin as string) ?? null,
    bootstrap_date: (data?.bootstrap_date as string) ?? null,
    bootstrap_reason: (data?.bootstrap_reason as string) ?? null,
  };
}

// ─── Dashboard Helpers (Requirement 6) ─────────────────────────────────────────

export interface LifecycleDashboardSummary {
  total: number;
  engineering_complete: number;
  po_testing_pending: number;
  awaiting_acceptance: number;
  closed: number;
  bootstrapped: number;
  premature_closures: number;
}

export async function getLifecycleDashboardSummary(): Promise<LifecycleDashboardSummary> {
  const { data: ewos } = await supabase
    .from('engineering_work_orders')
    .select('status, closure_eligible, bootstrap_origin, po_testing_status, po_accepted_at');

  const rows = (ewos ?? []) as unknown as Array<Record<string, unknown>>;

  let engineeringComplete = 0;
  let poTestingPending = 0;
  let awaitingAcceptance = 0;
  let closed = 0;
  let bootstrapped = 0;
  let prematureClosures = 0;

  for (const row of rows) {
    const status = (row.status as string) ?? '';
    const closureEligible = Boolean(row.closure_eligible);
    const bootstrapOrigin = (row.bootstrap_origin as string) ?? null;
    const poTestingStatus = (row.po_testing_status as string) ?? 'pending';
    const poAccepted = Boolean(row.po_accepted_at);

    if (bootstrapOrigin) bootstrapped++;

    if (status === 'closed') {
      closed++;
      // Premature closure: closed but not closure eligible
      if (!closureEligible || !poAccepted) prematureClosures++;
    } else if (status === 'po_acceptance') {
      awaitingAcceptance++;
    } else if (status === 'engineering_complete') {
      if (poTestingStatus === 'completed') {
        awaitingAcceptance++;
      } else {
        poTestingPending++;
      }
      engineeringComplete++;
    }
  }

  return {
    total: rows.length,
    engineering_complete: engineeringComplete,
    po_testing_pending: poTestingPending,
    awaiting_acceptance: awaitingAcceptance,
    closed: closed,
    bootstrapped: bootstrapped,
    premature_closures: prematureClosures,
  };
}

// ─── Integrity Engine Awareness (Requirement 7) ───────────────────────────────
//
// Returns whether a given lifecycle state should be treated as a governance
// failure by the integrity engine. "Engineering Complete / PO Testing Pending"
// is a HEALTHY state — it is not a governance failure.

export function isHealthyLifecycleState(state: LifecycleState): boolean {
  return (
    state === 'engineering_complete' ||
    state === 'po_testing_pending' ||
    state === 'awaiting_po_acceptance' ||
    state === 'closed' ||
    state === 'created' ||
    state === 'implementation_started'
  );
}

export function isGovernanceFailure(state: LifecycleState): boolean {
  return state === 'rejected' || state === 'superseded';
}

// ─── Premature Closure Detection ───────────────────────────────────────────────
//
// Detects EWOs that have status='closed' but are not closure_eligible.
// This is the core truthfulness check.

export async function detectPrematureClosures(): Promise<Array<{ ewo_ref: string; status: string; closure_eligible: boolean; derived_state: LifecycleState }>> {
  const { data: ewos } = await supabase
    .from('engineering_work_orders')
    .select('ewo_ref, status, closure_eligible, implementation_status, implementation_completed_at, po_accepted_at, po_acceptance_statement, po_testing_status, po_testing_completed_at, archived')
    .eq('status', 'closed');

  const rows = (ewos ?? []) as unknown as Array<Record<string, unknown>>;
  const premature: Array<{ ewo_ref: string; status: string; closure_eligible: boolean; derived_state: LifecycleState }> = [];

  for (const row of rows) {
    const closureEligible = Boolean(row.closure_eligible);
    const poAccepted = Boolean(row.po_accepted_at);
    const poTestingCompleted = (row.po_testing_status as string) === 'completed' || Boolean(row.po_testing_completed_at);

    if (!closureEligible || !poAccepted || !poTestingCompleted) {
      // Reconstruct evidence to derive the true state
      const evidence: LifecycleEvidence = {
        ewo_ref: (row.ewo_ref as string) ?? '',
        implementation_complete: Boolean(row.implementation_completed_at),
        engineering_package_attached: true, // assumed — would verify in full impl
        completion_report_present: true, // assumed
        po_testing_completed: poTestingCompleted,
        po_acceptance_granted: poAccepted,
        rejection_recorded: false,
        superseded: false,
        archived: Boolean(row.archived),
        bootstrap_origin: null,
        bootstrap_date: null,
        bootstrap_reason: null,
      };
      premature.push({
        ewo_ref: row.ewo_ref as string,
        status: 'closed',
        closure_eligible: closureEligible,
        derived_state: deriveLifecycleState(evidence),
      });
    }
  }

  return premature;
}

// ─── Lifecycle History (Requirement 4 — every transition recorded) ────────────

export async function getLifecycleHistory(ewoRef: string): Promise<Array<Record<string, unknown>>> {
  const { data: ewo } = await supabase
    .from('engineering_work_orders')
    .select('id')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (!ewo) return [];

  const { data: events } = await supabase
    .from('ewo_lifecycle_events')
    .select('*')
    .eq('ewo_id', ewo.id)
    .order('created_at', { ascending: true });

  return (events ?? []) as unknown as Array<Record<string, unknown>>;
}
