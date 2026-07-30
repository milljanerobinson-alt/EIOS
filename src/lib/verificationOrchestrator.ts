// EWO-017R.6 — Canonical Verification Orchestrator
// EWO-017R.9 — Artefact-derived verification (no manual evidence requirement)
// Governed batch verification with prerequisite ordering, artefact-derived
// eligibility, automated vs PO gate classification, and failure policy.

import { supabase } from './supabase';
import {
  getVerificationGates,
  updateVerificationGate,
  type VerificationGate,
  type VerificationGateKey,
  type EvidenceArtefact,
} from './verificationService';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type OrchestrationMode = 'single_gate' | 'verify_all_eligible' | 'verify_remaining';
export type OrchestrationFinalStatus =
  | 'in_progress'
  | 'verification_complete'
  | 'verification_partially_complete'
  | 'verification_failed'
  | 'verification_blocked_by_missing_artefacts'
  | 'ready_for_product_owner_verification'
  | 'ready_for_product_owner_acceptance';

export type GateClassification = 'automated' | 'product_owner';

export interface GateDependency {
  gate_key: string;
  depends_on_gate_key: string;
  dependency_order: number;
}

export interface GateResult {
  gate_key: VerificationGateKey;
  gate_label: string;
  outcome: 'passed' | 'failed' | 'blocked' | 'skipped' | 'already_verified' | 'artefacts_required' | 'deferred_po';
  evidence_source: string | null;
  verifier: string | null;
  verified_at: string | null;
  notes: string | null;
  failure_reason: string | null;
  blocking_reason: string | null;
  missing_artefacts: string[] | null;
  classification: GateClassification;
}

export interface OrchestrationResult {
  workOrderId: string;
  orchestrationRef: string;
  mode: OrchestrationMode;
  totalGates: number;
  alreadyVerified: number;
  eligible: number;
  attempted: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  artefactsMissing: number;
  resultsByGate: GateResult[];
  lifecycleImpact: {
    canTransitionToVerified: boolean;
    canTransitionToReportReady: boolean;
    nextLifecycleState: string | null;
    poAcceptanceEligible: boolean;
  };
  nextRecommendedAction: string;
  finalStatus: OrchestrationFinalStatus;
  startedAt: string;
  completedAt: string;
  initiatedBy: string;
}

export interface OrchestrationRequest {
  workOrderId: string;
  requestedBy: string;
  mode: OrchestrationMode;
  selectedGateIds?: string[];
  notes?: string;
  /** EWO-017R.9A: Loaded EWO context from the page — avoids re-querying. */
  loadedContext?: VerificationWorkOrderContext | null;
  /** EWO-017R.11: When true (Product Owner initiated), PO gates execute instead of deferring. */
  isProductOwnerInitiated?: boolean;
}

// ─── Gate Classification: Automated vs Product Owner ────────────────────────────

export const GATE_CLASSIFICATION: Record<VerificationGateKey, GateClassification> = {
  build: 'automated',
  functional: 'automated',
  ui: 'product_owner',
  data: 'automated',
  constitutional: 'product_owner',
};

export const PO_GATES: VerificationGateKey[] = ['ui', 'constitutional'];

// ─── Dependency Model ───────────────────────────────────────────────────────────

const DEFAULT_DEPENDENCIES: GateDependency[] = [
  { gate_key: 'functional', depends_on_gate_key: 'build', dependency_order: 1 },
  { gate_key: 'ui', depends_on_gate_key: 'functional', dependency_order: 2 },
  { gate_key: 'data', depends_on_gate_key: 'functional', dependency_order: 2 },
  { gate_key: 'constitutional', depends_on_gate_key: 'ui', dependency_order: 3 },
  { gate_key: 'constitutional', depends_on_gate_key: 'data', dependency_order: 3 },
];

export async function loadGateDependencies(): Promise<GateDependency[]> {
  const { data, error } = await supabase
    .from('ewo_verification_gate_dependencies')
    .select('*')
    .order('dependency_order', { ascending: true });
  if (error || !data || data.length === 0) return DEFAULT_DEPENDENCIES;
  return data as GateDependency[];
}

export function detectCircularDependencies(deps: GateDependency[]): string[] {
  const graph: Record<string, string[]> = {};
  for (const d of deps) {
    if (!graph[d.gate_key]) graph[d.gate_key] = [];
    graph[d.gate_key].push(d.depends_on_gate_key);
  }
  const visited: Set<string> = new Set();
  const stack: Set<string> = new Set();
  const cycles: string[] = [];
  function dfs(node: string): boolean {
    if (stack.has(node)) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    stack.add(node);
    for (const dep of graph[node] ?? []) {
      if (dfs(dep)) {
        cycles.push(`${node} -> ${dep}`);
        return true;
      }
    }
    stack.delete(node);
    return false;
  }
  for (const node of Object.keys(graph)) dfs(node);
  return cycles;
}

export function validateDependencies(deps: GateDependency[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const cycles = detectCircularDependencies(deps);
  if (cycles.length > 0) errors.push(`Circular dependencies detected: ${cycles.join(', ')}`);
  const gateKeys = new Set(deps.map(d => d.gate_key));
  const depKeys = new Set(deps.map(d => d.depends_on_gate_key));
  for (const dk of depKeys) {
    if (!gateKeys.has(dk) && dk !== 'build') {
      errors.push(`Dependency references unknown gate: ${dk}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function topologicalSort(
  gates: VerificationGate[],
  deps: GateDependency[],
): VerificationGate[] {
  const gateMap = new Map(gates.map(g => [g.gate_key, g]));
  const adj: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  for (const g of gates) {
    adj[g.gate_key] = [];
    inDegree[g.gate_key] = 0;
  }
  for (const d of deps) {
    if (!adj[d.depends_on_gate_key]) adj[d.depends_on_gate_key] = [];
    adj[d.depends_on_gate_key].push(d.gate_key);
    inDegree[d.gate_key] = (inDegree[d.gate_key] ?? 0) + 1;
  }
  const queue: string[] = [];
  for (const g of gates) {
    if ((inDegree[g.gate_key] ?? 0) === 0) queue.push(g.gate_key);
  }
  const sorted: VerificationGate[] = [];
  while (queue.length > 0) {
    const key = queue.shift()!;
    const gate = gateMap.get(key);
    if (gate) sorted.push(gate);
    for (const dep of adj[key] ?? []) {
      inDegree[dep]--;
      if (inDegree[dep] === 0) queue.push(dep);
    }
  }
  // Append any remaining gates not in dependency graph (sorted by gate_order)
  for (const g of gates) {
    if (!sorted.find(s => s.gate_key === g.gate_key)) sorted.push(g);
  }
  return sorted;
}

// ─── Artefact-Derived Eligibility (EWO-017R.9) ──────────────────────────────────
// Replaces manual evidence evaluation with inspection of canonical engineering
// artefacts that already exist within EIOS. No duplicate data entry required.
// EWO-017R.9A — Canonical context resolution: accepts loaded EWO context to
// avoid re-querying with ambiguous identifiers. Distinguishes query errors
// from genuinely missing records.

export interface ArtefactEligibility {
  eligible: boolean;
  artefactSource: string | null;
  missingArtefacts: string[];
  /** Existing evidence artefacts on the gate (preserved for audit, not required). */
  existingArtefacts: EvidenceArtefact[];
  /** When the EWO context could not be resolved, explains why. */
  contextFailure?: ArtefactContextFailure;
}

/** Distinct failure types for context resolution (EWO-017R.9A Req 5/6). */
export type ArtefactContextFailure =
  | 'invalid_identifier'
  | 'record_not_found'
  | 'permission_denied'
  | 'query_error'
  | 'canonical_context_unavailable'
  | 'stale_page_state';

export interface VerificationWorkOrderContext {
  workOrderId: string;
  workOrderRef: string;
  status: string;
  implementationStatus?: string;
  reportGenerationStatus?: string;
  poTestingStatus?: string | null;
  productOwnerVerificationStatus?: string;
  loadedAt: string;
}

interface EwoArtefactState {
  status: string;
  verification_status: string;
  report_generation_status: string;
  engineering_package_status: string;
  implementation_status: string;
  unit_verification_status: string;
  integration_verification_status: string;
  end_to_end_verification_status: string;
  product_owner_verification_status: string;
  po_testing_status: string | null;
  po_testing_completed_at: string | null;
}

// ─── Canonical Context Resolver (EWO-017R.9A Req 3) ─────────────────────────────

export interface ResolveContextResult {
  success: boolean;
  context: VerificationWorkOrderContext | null;
  identityTypeUsed: 'loaded_object' | 'uuid' | 'reference' | 'none';
  evidenceSource: string | null;
  failureType: ArtefactContextFailure | null;
  explanation: string;
  recommendedAction: string;
  correlationId: string;
}

function generateCorrelationId(): string {
  return `CTX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EWO_REF_REGEX = /^EWO-[0-9A-Z.]+$/i;

/**
 * Canonical resolver for verification Work Order context.
 * Priority: 1) loaded EWO object, 2) UUID, 3) EWO reference.
 * Never silently treats a reference as a UUID or vice versa.
 */
export async function resolveVerificationWorkOrderContext(params: {
  workOrderId?: string;
  workOrderRef?: string;
  loadedWorkOrder?: { id: string; ewo_ref: string; status: string; implementation_status?: string; report_generation_status?: string; po_testing_status?: string | null; product_owner_verification_status?: string } | null;
}): Promise<ResolveContextResult> {
  const correlationId = generateCorrelationId();

  // 1. Use the already-loaded canonical Work Order object when supplied
  if (params.loadedWorkOrder && params.loadedWorkOrder.id) {
    return {
      success: true,
      context: {
        workOrderId: params.loadedWorkOrder.id,
        workOrderRef: params.loadedWorkOrder.ewo_ref,
        status: params.loadedWorkOrder.status,
        implementationStatus: params.loadedWorkOrder.implementation_status,
        reportGenerationStatus: params.loadedWorkOrder.report_generation_status,
        poTestingStatus: params.loadedWorkOrder.po_testing_status ?? null,
        productOwnerVerificationStatus: params.loadedWorkOrder.product_owner_verification_status,
        loadedAt: new Date().toISOString(),
      },
      identityTypeUsed: 'loaded_object',
      evidenceSource: 'loaded page context',
      failureType: null,
      explanation: 'Context resolved from loaded EWO page object',
      recommendedAction: '',
      correlationId,
    };
  }

  // 2. Resolve by database UUID where explicitly supplied
  if (params.workOrderId && UUID_REGEX.test(params.workOrderId)) {
    const { data, error } = await supabase
      .from('engineering_work_orders')
      .select('id, ewo_ref, status, implementation_status, report_generation_status, po_testing_status, product_owner_verification_status')
      .eq('id', params.workOrderId)
      .maybeSingle();
    if (error) {
      return {
        success: false,
        context: null,
        identityTypeUsed: 'uuid',
        evidenceSource: null,
        failureType: 'query_error',
        explanation: `Database query failed: ${error.message}`,
        recommendedAction: 'Retry verification or reload the Work Order page.',
        correlationId,
      };
    }
    if (!data) {
      return {
        success: false,
        context: null,
        identityTypeUsed: 'uuid',
        evidenceSource: null,
        failureType: 'record_not_found',
        explanation: `No Engineering Work Order found with UUID ${params.workOrderId}`,
        recommendedAction: 'Reload the Work Order page or return to Work Orders list.',
        correlationId,
      };
    }
    return {
      success: true,
      context: {
        workOrderId: data.id,
        workOrderRef: data.ewo_ref,
        status: data.status,
        implementationStatus: data.implementation_status,
        reportGenerationStatus: data.report_generation_status,
        poTestingStatus: data.po_testing_status ?? null,
        productOwnerVerificationStatus: data.product_owner_verification_status,
        loadedAt: new Date().toISOString(),
      },
      identityTypeUsed: 'uuid',
      evidenceSource: 'database UUID lookup',
      failureType: null,
      explanation: 'Context resolved by UUID',
      recommendedAction: '',
      correlationId,
    };
  }

  // 3. Resolve by canonical EWO reference
  if (params.workOrderRef && EWO_REF_REGEX.test(params.workOrderRef)) {
    const { data, error } = await supabase
      .from('engineering_work_orders')
      .select('id, ewo_ref, status, implementation_status, report_generation_status, po_testing_status, product_owner_verification_status')
      .eq('ewo_ref', params.workOrderRef)
      .maybeSingle();
    if (error) {
      return {
        success: false,
        context: null,
        identityTypeUsed: 'reference',
        evidenceSource: null,
        failureType: 'query_error',
        explanation: `Database query failed: ${error.message}`,
        recommendedAction: 'Retry verification or reload the Work Order page.',
        correlationId,
      };
    }
    if (!data) {
      return {
        success: false,
        context: null,
        identityTypeUsed: 'reference',
        evidenceSource: null,
        failureType: 'record_not_found',
        explanation: `No Engineering Work Order found with reference ${params.workOrderRef}`,
        recommendedAction: 'Reload the Work Order page or return to Work Orders list.',
        correlationId,
      };
    }
    return {
      success: true,
      context: {
        workOrderId: data.id,
        workOrderRef: data.ewo_ref,
        status: data.status,
        implementationStatus: data.implementation_status,
        reportGenerationStatus: data.report_generation_status,
        poTestingStatus: data.po_testing_status ?? null,
        productOwnerVerificationStatus: data.product_owner_verification_status,
        loadedAt: new Date().toISOString(),
      },
      identityTypeUsed: 'reference',
      evidenceSource: 'database EWO reference lookup',
      failureType: null,
      explanation: 'Context resolved by EWO reference',
      recommendedAction: '',
      correlationId,
    };
  }

  // 4. If workOrderId was supplied but is not a UUID, try as reference
  if (params.workOrderId && EWO_REF_REGEX.test(params.workOrderId)) {
    const { data, error } = await supabase
      .from('engineering_work_orders')
      .select('id, ewo_ref, status, implementation_status, report_generation_status, po_testing_status, product_owner_verification_status')
      .eq('ewo_ref', params.workOrderId)
      .maybeSingle();
    if (error) {
      return {
        success: false,
        context: null,
        identityTypeUsed: 'reference',
        evidenceSource: null,
        failureType: 'query_error',
        explanation: `Database query failed: ${error.message}`,
        recommendedAction: 'Retry verification or reload the Work Order page.',
        correlationId,
      };
    }
    if (!data) {
      return {
        success: false,
        context: null,
        identityTypeUsed: 'reference',
        evidenceSource: null,
        failureType: 'record_not_found',
        explanation: `No Engineering Work Order found with reference ${params.workOrderId}`,
        recommendedAction: 'Reload the Work Order page or return to Work Orders list.',
        correlationId,
      };
    }
    return {
      success: true,
      context: {
        workOrderId: data.id,
        workOrderRef: data.ewo_ref,
        status: data.status,
        implementationStatus: data.implementation_status,
        reportGenerationStatus: data.report_generation_status,
        poTestingStatus: data.po_testing_status ?? null,
        productOwnerVerificationStatus: data.product_owner_verification_status,
        loadedAt: new Date().toISOString(),
      },
      identityTypeUsed: 'reference',
      evidenceSource: 'database EWO reference lookup (from workOrderId)',
      failureType: null,
      explanation: 'Context resolved by EWO reference (supplied as workOrderId)',
      recommendedAction: '',
      correlationId,
    };
  }

  // 5. Invalid identifier
  return {
    success: false,
    context: null,
    identityTypeUsed: 'none',
    evidenceSource: null,
    failureType: 'invalid_identifier',
    explanation: `Verification could not start because the Engineering Work Order identity was not supplied correctly. workOrderId=${params.workOrderId ?? 'undefined'}, workOrderRef=${params.workOrderRef ?? 'undefined'}`,
    recommendedAction: 'Reload the Work Order page and try again.',
    correlationId,
  };
}

/**
 * Load EWO artefact state from the database.
 * EWO-017R.9A: Removed non-existent column that caused
 * the query to fail with a PostgREST error, which was misclassified as
 * record not found.
 */
async function loadEwoArtefactState(workOrderId: string): Promise<{
  state: EwoArtefactState | null;
  failure: ArtefactContextFailure | null;
  errorMessage: string | null;
}> {
  const { data, error } = await supabase
    .from('engineering_work_orders')
    .select('status, verification_status, report_generation_status, engineering_package_status, implementation_status, unit_verification_status, integration_verification_status, end_to_end_verification_status, product_owner_verification_status, po_testing_status, po_testing_completed_at')
    .eq('id', workOrderId)
    .maybeSingle();
  if (error) {
    // Distinguish permission denied from query error
    const isPermission = error.code === '42501' || (error.message || '').toLowerCase().includes('permission');
    return {
      state: null,
      failure: isPermission ? 'permission_denied' : 'query_error',
      errorMessage: error.message,
    };
  }
  if (!data) {
    return {
      state: null,
      failure: 'record_not_found',
      errorMessage: null,
    };
  }
  return { state: data as EwoArtefactState, failure: null, errorMessage: null };
}

/**
 * Determine verification eligibility from canonical engineering artefacts.
 * Each gate type inspects different artefact sources — no manual evidence entry.
 * EWO-017R.9A: Accepts optional loaded context to avoid re-querying.
 */
export async function getArtefactEligibility(
  workOrderId: string,
  gate: VerificationGate,
  loadedContext?: VerificationWorkOrderContext | null,
): Promise<ArtefactEligibility> {
  const existingArtefacts = (gate.evidence_artefacts ?? []) as EvidenceArtefact[];

  // If we have a loaded context from the page, use it directly (EWO-017R.9A Req 4)
  if (loadedContext) {
    return evaluateGateEligibility(loadedContext, gate, existingArtefacts, null, null);
  }

  // Otherwise load from database
  const { state: ewoState, failure, errorMessage } = await loadEwoArtefactState(workOrderId);

  if (!ewoState) {
    return {
      eligible: false,
      artefactSource: null,
      missingArtefacts: [getGovernedFailureMessage(failure, workOrderId, errorMessage)],
      existingArtefacts,
      contextFailure: failure ?? 'canonical_context_unavailable',
    };
  }

  return evaluateGateEligibility(ewoState, gate, existingArtefacts, null, null);
}

/**
 * Evaluate gate eligibility from a resolved EWO state (shared by both
 * loaded-context and database-loaded paths).
 */
function evaluateGateEligibility(
  ewoState: { status: string; implementation_status?: string; report_generation_status?: string; po_testing_status?: string | null; product_owner_verification_status?: string },
  gate: VerificationGate,
  existingArtefacts: EvidenceArtefact[],
  _failure: ArtefactContextFailure | null,
  _errorMessage: string | null,
): ArtefactEligibility {
  const missing: string[] = [];
  let artefactSource: string | null = null;

  switch (gate.gate_key) {
    case 'build': {
      const buildComplete = ['engineering_complete', 'engineering_verification', 'verified', 'report_generated', 'po_acceptance', 'closed'].includes(ewoState.status);
      if (buildComplete) {
        artefactSource = 'Build verification (EWO reached engineering_complete)';
      } else {
        missing.push('Successful build result (EWO has not reached engineering_complete status)');
      }
      break;
    }

    case 'functional': {
      // EWO-017R.10: Functional verification only requires that the build
      // succeeded (EWO reached engineering_complete). Lifecycle artefacts
      // are produced AFTER successful verification, not a prerequisite for it.
      const buildSucceeded = ['engineering_complete', 'engineering_verification', 'verified', 'report_generated', 'po_acceptance', 'closed'].includes(ewoState.status);
      if (buildSucceeded) {
        artefactSource = 'Functional verification (build succeeded, EWO reached engineering_complete)';
      } else {
        missing.push('Build verification must pass first (EWO has not reached engineering_complete status)');
      }
      break;
    }

    case 'ui': {
      // EWO-017R.11: UI Verification IS the Product Owner testing action.
      // The PO testing status is CREATED by this verification action, not
      // required before it. Prerequisite: functional verification must have
      // passed (enforced by the dependency graph).
      const ewoReady = ['engineering_complete', 'engineering_verification', 'verified', 'report_generated', 'po_acceptance', 'closed'].includes(ewoState.status);
      if (ewoReady) {
        artefactSource = 'Product Owner UI verification (explicit PO judgement — EWO ready for UI verification)';
      } else {
        missing.push('EWO has not reached engineering_complete status — functional verification must pass first');
      }
      break;
    }

    case 'data': {
      // Data gate: no migrations column exists. If the EWO has
      // progressed past implementation, data changes are considered executed.
      const migrationsExecuted = ['engineering_complete', 'engineering_verification', 'verified', 'report_generated', 'po_acceptance', 'closed'].includes(ewoState.status);
      if (migrationsExecuted) {
        artefactSource = 'Data verification (EWO progressed past implementation — database changes applied)';
      } else {
        missing.push('Database changes not yet applied (EWO has not reached engineering_complete status)');
      }
      break;
    }

    case 'constitutional': {
      // EWO-017R.11: Constitutional verification is a Product Owner gate that
      // checks all prior gates (build, functional, ui, data) have passed.
      // It must NOT require engineering_verification status — that status is
      // a lifecycle state reached AFTER all gates pass, not a prerequisite.
      // Prerequisite: ui and data gates must have passed (enforced by dependency graph).
      const ewoReady = ['engineering_complete', 'engineering_verification', 'verified', 'report_generated', 'po_acceptance', 'closed'].includes(ewoState.status);
      if (ewoReady) {
        artefactSource = 'Constitutional verification (explicit PO judgement — all prior gates passed)';
      } else {
        missing.push('EWO has not reached engineering_complete status — all prior verification gates must pass first');
      }
      break;
    }

    default:
      missing.push(`Unknown gate type: ${gate.gate_key}`);
  }

  return {
    eligible: missing.length === 0,
    artefactSource,
    missingArtefacts: missing,
    existingArtefacts,
  };
}

/**
 * Get a governed error message for a context failure (EWO-017R.9A Req 11).
 */
function getGovernedFailureMessage(
  failure: ArtefactContextFailure | null,
  workOrderId: string,
  errorMessage: string | null,
): string {
  switch (failure) {
    case 'invalid_identifier':
      return 'Verification could not start because the Engineering Work Order identity was not supplied correctly.';
    case 'record_not_found':
      return `This Engineering Work Order was available when the page loaded but can no longer be found. (ID: ${workOrderId})`;
    case 'permission_denied':
      return 'Verification could not access the Engineering Work Order due to current permissions.';
    case 'query_error':
      return `Verification could not load canonical Work Order artefacts. ${errorMessage ?? ''}`;
    case 'stale_page_state':
      return 'The Work Order page state is stale. Please reload the page.';
    case 'canonical_context_unavailable':
    default:
      return 'Canonical verification context is unavailable. Please reload the Work Order page.';
  }
}

// ─── Legacy Evidence Evaluation (deprecated by R.9, kept for compatibility) ────

export interface EvidenceEvaluation {
  hasEvidence: boolean;
  evidenceSource: string | null;
  evidenceTimestamp: string | null;
  isStale: boolean;
  missingEvidence: string[];
  evidenceArtefacts: EvidenceArtefact[];
}

export function evaluateEvidence(gate: VerificationGate): EvidenceEvaluation {
  const artefacts = (gate.evidence_artefacts ?? []) as EvidenceArtefact[];
  const hasSummary = !!gate.evidence_summary?.trim();
  const hasArtefacts = artefacts.length > 0;
  const hasEvidence = hasSummary || hasArtefacts || gate.status === 'verified';
  const evidenceSource = artefacts[0]?.type ?? (hasSummary ? 'manual' : null);
  const evidenceTimestamp = gate.verified_at ?? artefacts[0]?.captured_at ?? null;
  let isStale = false;
  if (evidenceTimestamp) {
    const ageDays = Math.floor((Date.now() - new Date(evidenceTimestamp).getTime()) / 86400000);
    isStale = ageDays > 90;
  }
  const missingEvidence: string[] = [];
  if (!hasEvidence) missingEvidence.push('No evidence summary or artefacts recorded');
  if (isStale) missingEvidence.push('Evidence is stale (>90 days old)');
  return { hasEvidence, evidenceSource, evidenceTimestamp, isStale, missingEvidence, evidenceArtefacts: artefacts };
}

// ─── Prerequisite Check ─────────────────────────────────────────────────────────

export function checkPrerequisites(
  gateKey: VerificationGateKey,
  gates: VerificationGate[],
  deps: GateDependency[],
): { met: boolean; blockingBy: string[] } {
  const gateDeps = deps.filter(d => d.gate_key === gateKey);
  const blockingBy: string[] = [];
  for (const dep of gateDeps) {
    const depGate = gates.find(g => g.gate_key === dep.depends_on_gate_key);
    if (!depGate || depGate.status !== 'verified') {
      blockingBy.push(dep.depends_on_gate_key);
    }
  }
  return { met: blockingBy.length === 0, blockingBy };
}

// ─── Audit Trail ────────────────────────────────────────────────────────────────

export async function recordOrchestrationAudit(
  orchestrationId: string,
  ewoId: string,
  eventType: string,
  gateKey?: string,
  eventData?: Record<string, unknown>,
): Promise<void> {
  await supabase.from('ewo_verification_orchestration_audit').insert({
    orchestration_id: orchestrationId,
    ewo_id: ewoId,
    event_type: eventType,
    gate_key: gateKey ?? null,
    event_data: eventData ?? {},
  });
}

// ─── Orchestration Ref Generator ────────────────────────────────────────────────

export async function generateOrchestrationRef(): Promise<string> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const { data: existing } = await supabase
    .from('ewo_verification_orchestrations')
    .select('orchestration_ref')
    .like('orchestration_ref', `VO-${dateStr}-%`)
    .order('orchestration_ref', { ascending: false })
    .limit(1);
  const seq = existing && existing.length > 0
    ? parseInt((existing[0] as { orchestration_ref: string }).orchestration_ref.split('-')[2], 10) + 1
    : 1;
  return `VO-${dateStr}-${String(seq).padStart(3, '0')}`;
}

// ─── Persist Orchestration Record ───────────────────────────────────────────────

export async function persistOrchestration(
  ewoId: string,
  ref: string,
  mode: OrchestrationMode,
  requestedBy: string,
  notes: string | undefined,
  startedAt: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('ewo_verification_orchestrations')
    .insert({
      ewo_id: ewoId,
      orchestration_ref: ref,
      mode,
      requested_by: requestedBy,
      notes: notes ?? null,
      started_at: startedAt,
      final_status: 'in_progress',
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function completeOrchestrationRecord(
  orchestrationId: string,
  result: OrchestrationResult,
): Promise<void> {
  const { error } = await supabase
    .from('ewo_verification_orchestrations')
    .update({
      total_gates: result.totalGates,
      already_verified: result.alreadyVerified,
      eligible: result.eligible,
      attempted: result.attempted,
      passed: result.passed,
      failed: result.failed,
      blocked: result.blocked,
      skipped: result.skipped,
      evidence_missing: result.artefactsMissing,
      results_by_gate: result.resultsByGate,
      lifecycle_impact: result.lifecycleImpact,
      next_recommended_action: result.nextRecommendedAction,
      final_status: result.finalStatus,
      completed_at: result.completedAt,
    })
    .eq('id', orchestrationId);
  if (error) throw error;
}

// ─── Get Latest Orchestration (for refresh recovery) ─────────────────────────────

export async function getLatestOrchestration(ewoId: string): Promise<OrchestrationResult | null> {
  const { data, error } = await supabase
    .from('ewo_verification_orchestrations')
    .select('*')
    .eq('ewo_id', ewoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    workOrderId: row.ewo_id as string,
    orchestrationRef: row.orchestration_ref as string,
    mode: row.mode as OrchestrationMode,
    totalGates: row.total_gates as number,
    alreadyVerified: row.already_verified as number,
    eligible: row.eligible as number,
    attempted: row.attempted as number,
    passed: row.passed as number,
    failed: row.failed as number,
    blocked: row.blocked as number,
    skipped: row.skipped as number,
    artefactsMissing: row.evidence_missing as number,
    resultsByGate: (row.results_by_gate as GateResult[]) ?? [],
    lifecycleImpact: (row.lifecycle_impact as OrchestrationResult['lifecycleImpact']) ?? {
      canTransitionToVerified: false,
      canTransitionToReportReady: false,
      nextLifecycleState: null,
      poAcceptanceEligible: false,
    },
    nextRecommendedAction: (row.next_recommended_action as string) ?? '',
    finalStatus: (row.final_status as OrchestrationFinalStatus) ?? 'in_progress',
    startedAt: (row.started_at as string) ?? '',
    completedAt: (row.completed_at as string) ?? '',
    initiatedBy: (row.requested_by as string) ?? '',
  };
}

// ─── Determine Final Status ─────────────────────────────────────────────────────

export function determineFinalStatus(
  results: GateResult[],
  totalGates: number,
  poGatesDeferred: number,
): OrchestrationFinalStatus {
  const passed = results.filter(r => r.outcome === 'passed' || r.outcome === 'already_verified').length;
  const failed = results.filter(r => r.outcome === 'failed').length;
  const blocked = results.filter(r => r.outcome === 'blocked').length;
  const artefactsRequired = results.filter(r => r.outcome === 'artefacts_required').length;
  if (artefactsRequired > 0 && failed === 0) return 'verification_blocked_by_missing_artefacts';
  if (failed > 0) return 'verification_failed';
  if (blocked > 0) return 'verification_partially_complete';
  if (poGatesDeferred > 0 && passed + poGatesDeferred === totalGates) {
    return poGatesDeferred === results.filter(r => r.outcome === 'deferred_po').length
      ? 'ready_for_product_owner_verification'
      : 'verification_partially_complete';
  }
  if (passed === totalGates) return 'verification_complete';
  return 'verification_partially_complete';
}

// ─── Determine Next Recommended Action ──────────────────────────────────────────

export function determineNextAction(
  finalStatus: OrchestrationFinalStatus,
  poAcceptanceEligible: boolean,
): string {
  switch (finalStatus) {
    case 'verification_complete':
      return poAcceptanceEligible
        ? 'Proceed to Product Owner Acceptance'
        : 'Proceed to Product Owner Verification';
    case 'verification_partially_complete':
      return 'Retry Failed Gates or resolve missing artefacts';
    case 'verification_failed':
      return 'Fix failures and Retry Failed Gates';
    case 'verification_blocked_by_missing_artefacts':
      return 'Resolve missing engineering artefacts for blocked gates';
    case 'ready_for_product_owner_verification':
      return 'Proceed to Product Owner Verification';
    case 'ready_for_product_owner_acceptance':
      return 'Proceed to Product Owner Acceptance';
    default:
      return 'Review verification results';
  }
}

// ─── Canonical Single-Gate Verification Operation ──────────────────────────────
// EWO-017R.8 — Every verification action (Individual Verify, Verify All,
// Verify Remaining, Retry Failed Gates) MUST delegate to this function.
// EWO-017R.9 — Artefact-derived eligibility replaces manual evidence entry.
// No duplicate verification logic may exist outside this canonical entry point.

export interface PerformVerificationRequest {
  workOrderId: string;
  gate: VerificationGate;
  gateLabel: string;
  classification: GateClassification;
  deps: GateDependency[];
  allGates: VerificationGate[];
  failedGateKeys: Set<VerificationGateKey>;
  requestedBy: string;
  notes?: string;
  orchestrationId?: string;
  /** When true, PO gates are deferred rather than auto-verified. */
  deferProductOwnerGates?: boolean;
  /** EWO-017R.9A: Loaded EWO context from the page — avoids re-querying. */
  loadedContext?: VerificationWorkOrderContext | null;
}

export interface PerformVerificationResult {
  outcome: GateResult['outcome'];
  gateResult: GateResult;
  /** Whether the gate was newly marked verified by this call. */
  verified: boolean;
  /** Whether the gate was blocked by unverified prerequisites. */
  blocked: boolean;
  /** Whether canonical artefacts were missing. */
  artefactsMissing: boolean;
  /** Whether this is a PO gate that was deferred. */
  deferredPO: boolean;
}

/**
 * Canonical single-gate verification operation.
 *
 * This is the ONE place where a verification gate is evaluated and (where
 * permitted) marked verified. Both the Individual Verify button and the
 * Verify All Eligible / Verify Remaining / Retry Failed batch workflows
 * delegate here so that eligibility decisions, artefact evaluation, lifecycle
 * progression and audit records are always identical for the same EWO state.
 *
 * EWO-017R.9: Eligibility is derived from canonical engineering artefacts
 * (build results, completion report, PO testing, migration status, etc.)
 * rather than requiring duplicate manual evidence entry.
 */
export async function performVerification(
  req: PerformVerificationRequest,
): Promise<PerformVerificationResult> {
  const { gate, gateLabel, classification, deps, allGates, failedGateKeys, requestedBy, notes, orchestrationId, deferProductOwnerGates = true, loadedContext = null } = req;
  const gateKey = gate.gate_key;
  const baseGateResult = (overrides: Partial<GateResult>): GateResult => ({
    gate_key: gateKey,
    gate_label: gateLabel,
    outcome: 'skipped',
    evidence_source: null,
    verifier: null,
    verified_at: null,
    notes: null,
    failure_reason: null,
    blocking_reason: null,
    missing_artefacts: null,
    classification,
    ...overrides,
  });

  // 1. Already verified — no-op (idempotent)
  if (gate.status === 'verified') {
    const gr = baseGateResult({
      outcome: 'already_verified',
      evidence_source: gate.evidence_summary ?? 'prior verification',
      verifier: gate.verified_by ?? '—',
      verified_at: gate.verified_at,
    });
    return { outcome: 'already_verified', gateResult: gr, verified: false, blocked: false, artefactsMissing: false, deferredPO: false };
  }

  // 2. Prerequisite check — identical rule for every workflow
  const prereq = checkPrerequisites(gateKey, allGates, deps);
  if (!prereq.met) {
    const gr = baseGateResult({
      outcome: 'blocked',
      blocking_reason: `Blocked by unverified prerequisites: ${prereq.blockingBy.join(', ')}`,
    });
    if (orchestrationId) {
      await recordOrchestrationAudit(orchestrationId, req.workOrderId, 'gate_blocked', gateKey, { blocking_by: prereq.blockingBy });
    }
    return { outcome: 'blocked', gateResult: gr, verified: false, blocked: true, artefactsMissing: false, deferredPO: false };
  }

  // 3. Failed-prerequisite propagation
  const gateDeps = deps.filter(d => d.gate_key === gateKey);
  const hasFailedPrereq = gateDeps.some(d => failedGateKeys.has(d.depends_on_gate_key as VerificationGateKey));
  if (hasFailedPrereq) {
    const failedPrereqs = gateDeps.filter(d => failedGateKeys.has(d.depends_on_gate_key as VerificationGateKey)).map(d => d.depends_on_gate_key);
    const gr = baseGateResult({
      outcome: 'blocked',
      blocking_reason: `Prerequisite failed: ${failedPrereqs.join(', ')}`,
    });
    if (orchestrationId) {
      await recordOrchestrationAudit(orchestrationId, req.workOrderId, 'gate_blocked', gateKey, { reason: 'prerequisite_failed', failed_prerequisites: failedPrereqs });
    }
    return { outcome: 'blocked', gateResult: gr, verified: false, blocked: true, artefactsMissing: false, deferredPO: false };
  }

  // 4. Artefact-derived eligibility — identical for every workflow (EWO-017R.9)
  // EWO-017R.9A: Pass loaded context to avoid re-querying with ambiguous ID
  const artefactEval = await getArtefactEligibility(req.workOrderId, gate, loadedContext);
  if (orchestrationId) {
    await recordOrchestrationAudit(orchestrationId, req.workOrderId, 'gate_artefacts_evaluated', gateKey, {
      eligible: artefactEval.eligible,
      artefact_source: artefactEval.artefactSource,
      missing: artefactEval.missingArtefacts,
      context_failure: artefactEval.contextFailure ?? null,
    });
  }

  // EWO-017R.9A Req 6: Impossible-state invariant
  // If a loaded context was supplied (page has a rendered EWO) but the database
  // query failed, record a governance error — do NOT show "not found" for a
  // visible EWO.
  if (artefactEval.contextFailure && loadedContext) {
    const correlationId = `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (orchestrationId) {
      await recordOrchestrationAudit(orchestrationId, req.workOrderId, 'governance_error', gateKey, {
        invariant_violation: 'impossible_state_visible_ewo_reported_not_found',
        loaded_ewo_id: loadedContext.workOrderId,
        loaded_ewo_ref: loadedContext.workOrderRef,
        queried_identifier: req.workOrderId,
        context_failure: artefactEval.contextFailure,
        correlation_id: correlationId,
      });
    }
    const gr = baseGateResult({
      outcome: 'artefacts_required',
      notes: `Verification could not load canonical Work Order artefacts. (Correlation ID: ${correlationId})`,
      missing_artefacts: artefactEval.missingArtefacts,
    });
    return { outcome: 'artefacts_required', gateResult: gr, verified: false, blocked: false, artefactsMissing: true, deferredPO: false };
  }

  // 5. PO gates: defer (do not auto-verify) when batch mode defers them.
  //    Individual Verify of a PO gate is allowed (explicit PO action) — controlled by caller.
  if (classification === 'product_owner' && deferProductOwnerGates) {
    const gr = baseGateResult({
      outcome: 'deferred_po',
      evidence_source: artefactEval.artefactSource,
      notes: 'Product Owner judgement required — not automatically verified',
      missing_artefacts: artefactEval.missingArtefacts.length > 0 ? artefactEval.missingArtefacts : null,
    });
    if (orchestrationId) {
      await recordOrchestrationAudit(orchestrationId, req.workOrderId, 'product_owner_gate_deferred', gateKey, { reason: 'Product Owner judgement required' });
    }
    return { outcome: 'deferred_po', gateResult: gr, verified: false, blocked: false, artefactsMissing: false, deferredPO: true };
  }

  // 6. Automated gate (or explicit PO Verify): require canonical artefacts before verifying
  if (!artefactEval.eligible) {
    const gr = baseGateResult({
      outcome: 'artefacts_required',
      notes: `Blocked: ${artefactEval.missingArtefacts.join('; ')}`,
      missing_artefacts: artefactEval.missingArtefacts,
    });
    if (orchestrationId) {
      await recordOrchestrationAudit(orchestrationId, req.workOrderId, 'gate_skipped', gateKey, { reason: 'artefacts_required', missing: artefactEval.missingArtefacts });
    }
    return { outcome: 'artefacts_required', gateResult: gr, verified: false, blocked: false, artefactsMissing: true, deferredPO: false };
  }

  // 7. Attempt verification via canonical updateVerificationGate RPC
  try {
    const updateResult = await updateVerificationGate(
      req.workOrderId,
      gateKey,
      'verified',
      artefactEval.artefactSource ?? 'canonical verification',
      undefined,
      requestedBy,
      artefactEval.existingArtefacts,
    );

    if (updateResult.gate_updated) {
      const gr = baseGateResult({
        outcome: 'passed',
        evidence_source: artefactEval.artefactSource,
        verifier: requestedBy,
        verified_at: new Date().toISOString(),
        notes: notes ?? 'Verified via canonical verification engine (artefact-derived)',
      });
      if (orchestrationId) {
        await recordOrchestrationAudit(orchestrationId, req.workOrderId, 'gate_passed', gateKey, { artefact_source: artefactEval.artefactSource, verifier: requestedBy });
      }
      return { outcome: 'passed', gateResult: gr, verified: true, blocked: false, artefactsMissing: false, deferredPO: false };
    }
    // Update returned failure
    failedGateKeys.add(gateKey);
    const gr = baseGateResult({
      outcome: 'failed',
      evidence_source: artefactEval.artefactSource,
      verifier: requestedBy,
      verified_at: new Date().toISOString(),
      notes: 'Gate update failed during canonical verification',
      failure_reason: updateResult.auto_transition_error ?? 'Gate update returned failure',
    });
    if (orchestrationId) {
      await recordOrchestrationAudit(orchestrationId, req.workOrderId, 'gate_failed', gateKey, { failure_reason: updateResult.auto_transition_error });
    }
    return { outcome: 'failed', gateResult: gr, verified: false, blocked: false, artefactsMissing: false, deferredPO: false };
  } catch (e) {
    failedGateKeys.add(gateKey);
    const gr = baseGateResult({
      outcome: 'failed',
      evidence_source: artefactEval.artefactSource,
      verifier: requestedBy,
      verified_at: new Date().toISOString(),
      notes: 'Exception during canonical verification',
      failure_reason: e instanceof Error ? e.message : 'Unknown error',
    });
    if (orchestrationId) {
      await recordOrchestrationAudit(orchestrationId, req.workOrderId, 'gate_failed', gateKey, { error: e instanceof Error ? e.message : 'Unknown error' });
    }
    return { outcome: 'failed', gateResult: gr, verified: false, blocked: false, artefactsMissing: false, deferredPO: false };
  }
}

// ─── Canonical Orchestration Engine ─────────────────────────────────────────────

export async function runVerificationOrchestration(
  request: OrchestrationRequest,
): Promise<OrchestrationResult> {
  const startedAt = new Date().toISOString();
  const orchestrationRef = await generateOrchestrationRef();
  const orchestrationId = await persistOrchestration(
    request.workOrderId,
    orchestrationRef,
    request.mode,
    request.requestedBy,
    request.notes,
    startedAt,
  );

  await recordOrchestrationAudit(orchestrationId, request.workOrderId, 'orchestration_requested', undefined, {
    mode: request.mode,
    requested_by: request.requestedBy,
    notes: request.notes,
  });
  await recordOrchestrationAudit(orchestrationId, request.workOrderId, 'pre_verification_review_confirmed', undefined, {
    mode: request.mode,
  });
  await recordOrchestrationAudit(orchestrationId, request.workOrderId, 'orchestration_started', undefined, {
    started_at: startedAt,
  });

  const [gates, deps] = await Promise.all([
    getVerificationGates(request.workOrderId),
    loadGateDependencies(),
  ]);

  const validation = validateDependencies(deps);
  if (!validation.valid) {
    await recordOrchestrationAudit(orchestrationId, request.workOrderId, 'orchestration_completed', undefined, {
      error: 'Invalid dependencies',
      validation_errors: validation.errors,
    });
  }

  const sortedGates = topologicalSort(gates, deps);
  const results: GateResult[] = [];
  // EWO-017R.11A: Canonical mutable in-run working state. The gates array is a
  // snapshot at orchestration start. After each gate passes and is persisted,
  // we update this copy so checkPrerequisites() sees the fresh state for
  // subsequent gates. This eliminates the stale-snapshot bug where Functional
  // saw Build as unverified even though Build had just been persisted as verified.
  const workingGates: VerificationGate[] = gates.map(g => ({ ...g }));
  let alreadyVerified = 0;
  let eligible = 0;
  let attempted = 0;
  let passed = 0;
  let failed = 0;
  let blocked = 0;
  let skipped = 0;
  let artefactsMissing = 0;
  let poGatesDeferred = 0;

  const failedGateKeys: Set<VerificationGateKey> = new Set();

  for (const gate of sortedGates) {
    const classification = GATE_CLASSIFICATION[gate.gate_key] ?? 'automated';
    const gateLabel = gate.gate_label;

    // Skip already verified gates
    if (gate.status === 'verified') {
      alreadyVerified++;
      results.push({
        gate_key: gate.gate_key,
        gate_label: gateLabel,
        outcome: 'already_verified',
        evidence_source: gate.evidence_summary ?? 'prior verification',
        verifier: gate.verified_by ?? '—',
        verified_at: gate.verified_at,
        notes: null,
        failure_reason: null,
        blocking_reason: null,
        missing_artefacts: null,
        classification,
      });
      continue;
    }

    // For single_gate mode, skip gates not in selectedGateIds
    if (request.mode === 'single_gate' && request.selectedGateIds) {
      if (!request.selectedGateIds.includes(gate.id)) {
        skipped++;
        results.push({
          gate_key: gate.gate_key,
          gate_label: gateLabel,
          outcome: 'skipped',
          evidence_source: null,
          verifier: null,
          verified_at: null,
          notes: 'Not selected for single gate verification',
          failure_reason: null,
          blocking_reason: null,
          missing_artefacts: null,
          classification,
        });
        continue;
      }
    }

    // For verify_remaining mode, skip already-verified gates (already handled above)

    // ─── EWO-017R.8: Delegate to canonical performVerification ───
    // Batch mode defers PO gates; the canonical engine enforces identical
    // prerequisite, evidence, lifecycle and audit behaviour for every workflow.
    // EWO-017R.11: Product Owner initiated runs execute PO gates instead of
    // deferring them. Only autonomous/system runs defer PO gates.
    const deferPO = request.isProductOwnerInitiated === true ? false : true;
    const pvResult = await performVerification({
      workOrderId: request.workOrderId,
      gate,
      gateLabel,
      classification,
      deps,
      allGates: workingGates,
      failedGateKeys,
      requestedBy: request.requestedBy,
      notes: request.notes,
      orchestrationId,
      deferProductOwnerGates: deferPO,
      loadedContext: request.loadedContext ?? null,
    });

    results.push(pvResult.gateResult);

    // EWO-017R.11A: Update the canonical in-run working state immediately
    // after a successful verification. This ensures the next gate's
    // checkPrerequisites() sees the updated status instead of the stale snapshot.
    if (pvResult.verified) {
      const wgIdx = workingGates.findIndex(g => g.gate_key === gate.gate_key);
      if (wgIdx >= 0) {
        workingGates[wgIdx] = {
          ...workingGates[wgIdx],
          status: 'verified',
          verified_at: new Date().toISOString(),
          verified_by: request.requestedBy,
        };
      }
    }

    if (pvResult.outcome === 'already_verified') {
      alreadyVerified++;
    } else if (pvResult.blocked) {
      blocked++;
    } else if (pvResult.deferredPO) {
      poGatesDeferred++;
    } else if (pvResult.artefactsMissing) {
      artefactsMissing++;
    } else if (pvResult.verified) {
      eligible++;
      attempted++;
      passed++;
    } else if (pvResult.outcome === 'failed') {
      eligible++;
      attempted++;
      failed++;
    } else if (pvResult.outcome === 'skipped') {
      skipped++;
    }
  }

  // EWO-017R.11: Lifecycle impact — ALL gates (automated + PO) must pass.
  // When Product Owner initiates Verify All, PO gates execute and pass,
  // so the EWO can transition all the way to report_ready.
  // EWO-017R.11A: Use workingGates (canonical in-run state) not the stale snapshot.
  const allGatesPassed = workingGates.every(g => g.status === 'verified');
  const canTransitionToVerified = allGatesPassed && failed === 0 && blocked === 0 && artefactsMissing === 0;
  // PO Acceptance is always a separate governed decision — never automatic.
  const poAcceptanceEligible = canTransitionToVerified;

  const lifecycleImpact = {
    canTransitionToVerified,
    canTransitionToReportReady: canTransitionToVerified,
    nextLifecycleState: canTransitionToVerified ? 'report_ready' as const : null,
    poAcceptanceEligible,
  };

  const finalStatus = determineFinalStatus(results, sortedGates.length, poGatesDeferred);
  const nextRecommendedAction = determineNextAction(finalStatus, poAcceptanceEligible);
  const completedAt = new Date().toISOString();

  const result: OrchestrationResult = {
    workOrderId: request.workOrderId,
    orchestrationRef,
    mode: request.mode,
    totalGates: sortedGates.length,
    alreadyVerified,
    eligible,
    attempted,
    passed,
    failed,
    blocked,
    skipped,
    artefactsMissing,
    resultsByGate: results,
    lifecycleImpact,
    nextRecommendedAction,
    finalStatus,
    startedAt,
    completedAt,
    initiatedBy: request.requestedBy,
  };

  await completeOrchestrationRecord(orchestrationId, result);
  await recordOrchestrationAudit(orchestrationId, request.workOrderId, 'orchestration_completed', undefined, {
    final_status: finalStatus,
    passed, failed, blocked, artefacts_missing: artefactsMissing,
  });

  if (canTransitionToVerified) {
    await recordOrchestrationAudit(orchestrationId, request.workOrderId, 'lifecycle_progression_offered', undefined, {
      next_state: lifecycleImpact.nextLifecycleState,
    });
  }

  return result;
}

// ─── Retry Failed Gates ──────────────────────────────────────────────────────────

export async function retryFailedGates(
  workOrderId: string,
  requestedBy: string,
  notes?: string,
  loadedContext?: VerificationWorkOrderContext | null,
  isProductOwnerInitiated?: boolean,
): Promise<OrchestrationResult> {
  return runVerificationOrchestration({
    workOrderId,
    requestedBy,
    mode: 'verify_remaining',
    notes: notes ?? 'Retry failed gates',
    loadedContext: loadedContext ?? null,
    isProductOwnerInitiated: isProductOwnerInitiated ?? false,
  });
}

// ─── Get Orchestration Audit Trail ───────────────────────────────────────────────

export async function getOrchestrationAuditTrail(
  orchestrationId: string,
): Promise<Array<{ id: string; event_type: string; gate_key: string | null; event_data: Record<string, unknown>; created_at: string }>> {
  const { data, error } = await supabase
    .from('ewo_verification_orchestration_audit')
    .select('*')
    .eq('orchestration_id', orchestrationId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as Array<{ id: string; event_type: string; gate_key: string | null; event_data: Record<string, unknown>; created_at: string }>;
}

// ─── List All Orchestrations for an EWO ───────────────────────────────────────────

export async function listOrchestrations(ewoId: string): Promise<OrchestrationResult[]> {
  const { data, error } = await supabase
    .from('ewo_verification_orchestrations')
    .select('*')
    .eq('ewo_id', ewoId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((row: Record<string, unknown>) => ({
    workOrderId: row.ewo_id as string,
    orchestrationRef: row.orchestration_ref as string,
    mode: row.mode as OrchestrationMode,
    totalGates: row.total_gates as number,
    alreadyVerified: row.already_verified as number,
    eligible: row.eligible as number,
    attempted: row.attempted as number,
    passed: row.passed as number,
    failed: row.failed as number,
    blocked: row.blocked as number,
    skipped: row.skipped as number,
    artefactsMissing: row.evidence_missing as number,
    resultsByGate: (row.results_by_gate as GateResult[]) ?? [],
    lifecycleImpact: (row.lifecycle_impact as OrchestrationResult['lifecycleImpact']) ?? {
      canTransitionToVerified: false,
      canTransitionToReportReady: false,
      nextLifecycleState: null,
      poAcceptanceEligible: false,
    },
    nextRecommendedAction: (row.next_recommended_action as string) ?? '',
    finalStatus: (row.final_status as OrchestrationFinalStatus) ?? 'in_progress',
    startedAt: (row.started_at as string) ?? '',
    completedAt: (row.completed_at as string) ?? '',
    initiatedBy: (row.requested_by as string) ?? '',
  }));
}

// ─── Completion Report Evidence Mapping ──────────────────────────────────────────

export interface CompletionReportEvidenceMapping {
  verification_category: string;
  gate_key: VerificationGateKey | null;
  evidence_type: string;
  description: string;
}

export const COMPLETION_REPORT_EVIDENCE_MAP: CompletionReportEvidenceMapping[] = [
  { verification_category: 'unit_verification', gate_key: 'build', evidence_type: 'automated_test_suite', description: 'Unit test results' },
  { verification_category: 'service_verification', gate_key: 'functional', evidence_type: 'automated_test_suite', description: 'Service/API test results' },
  { verification_category: 'integration_verification', gate_key: 'functional', evidence_type: 'integration_test', description: 'Integration test results' },
  { verification_category: 'workflow_e2e_verification', gate_key: 'ui', evidence_type: 'manual_verification', description: 'Workflow/end-to-end test results' },
  { verification_category: 'build_verification', gate_key: 'build', evidence_type: 'build_verification', description: 'Build verification results' },
  { verification_category: 'regression_verification', gate_key: 'functional', evidence_type: 'regression_test', description: 'Regression test results' },
  { verification_category: 'standards_verification', gate_key: 'constitutional', evidence_type: 'manual_verification', description: 'Engineering standards validation' },
  { verification_category: 'constitutional_verification', gate_key: 'constitutional', evidence_type: 'manual_verification', description: 'Constitutional verification' },
  { verification_category: 'product_owner_testing', gate_key: 'ui', evidence_type: 'product_owner_test', description: 'Product Owner testing evidence' },
  { verification_category: 'product_owner_acceptance', gate_key: null, evidence_type: 'product_owner_test', description: 'Product Owner acceptance (separate governed decision)' },
];

// ─── Historical EWO Evidence Evaluation ──────────────────────────────────────────

export interface HistoricalEvidenceResult {
  canVerify: boolean;
  availableEvidence: string[];
  unavailableEvidence: string[];
  classification: 'sufficient' | 'insufficient' | 'partial';
  message: string;
}

export function evaluateHistoricalEvidence(
  completionReportExists: boolean,
  implementationRecordsExist: boolean,
  buildResultsExist: boolean,
  testResultsExist: boolean,
  poTestingEvidenceExists: boolean,
): HistoricalEvidenceResult {
  const available: string[] = [];
  const unavailable: string[] = [];
  if (completionReportExists) available.push('Completion Report');
  else unavailable.push('Completion Report');
  if (implementationRecordsExist) available.push('Implementation Records');
  else unavailable.push('Implementation Records');
  if (buildResultsExist) available.push('Build Results');
  else unavailable.push('Build Results');
  if (testResultsExist) available.push('Test Results');
  else unavailable.push('Test Results');
  if (poTestingEvidenceExists) available.push('Product Owner Testing Evidence');
  else unavailable.push('Product Owner Testing Evidence');

  const availableCount = available.length;
  let classification: 'sufficient' | 'insufficient' | 'partial' = 'insufficient';
  let message = 'Historical Evidence Insufficient';
  if (availableCount >= 4) {
    classification = 'sufficient';
    message = 'Historical evidence supports governed verification';
  } else if (availableCount >= 2) {
    classification = 'partial';
    message = 'Historical evidence is partial — some gates may require additional evidence';
  } else {
    message = 'Historical Evidence Insufficient — cannot verify without fabricating evidence';
  }

  return {
    canVerify: classification !== 'insufficient',
    availableEvidence: available,
    unavailableEvidence: unavailable,
    classification,
    message,
  };
}
