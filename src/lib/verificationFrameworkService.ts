import { supabase } from './supabase';

// ─── EWO-014.18: Engineering Verification Framework ─────────────────────────
// Canonical test types, verification matrix, PO workflows, and confidence.

export type TestTypeCode =
  | 'unit' | 'service' | 'integration' | 'ui_component' | 'workflow'
  | 'po_verification' | 'po_acceptance' | 'regression'
  | 'build_verification' | 'manual_verification';

export type VerificationStatus =
  | 'not_run' | 'passed' | 'failed' | 'blocked' | 'not_applicable' | 'pending'
  | 'pending_reverification';

export type WorkflowStatus = 'defined' | 'executed' | 'passed' | 'failed';
export type WorkflowRunStatus = 'pending' | 'in_progress' | 'passed' | 'failed' | 'blocked';

export type EngineeringConfidence =
  | 'unknown' | 'low' | 'medium' | 'high' | 'verified';

export type CompletionDimension =
  | 'implementation' | 'verification' | 'po_testing' | 'po_acceptance' | 'build';

export type CompletionStatus = 'pending' | 'partial' | 'complete' | 'failed' | 'not_applicable';

export interface TestClassification {
  id: string;
  code: TestTypeCode;
  label: string;
  description: string;
  category: 'automated' | 'manual' | 'build' | 'product_owner';
  sort_order: number;
  is_active: boolean;
  default_role?: string;
  prerequisite_codes?: string[];
}

export interface VerificationMatrixRow {
  id: string;
  ewo_id: string;
  test_type: TestTypeCode;
  status: VerificationStatus;
  verified_by: string | null;
  verified_at: string | null;
  evidence_ref: string | null;
  notes: string | null;
  verification_role?: string | null;
  verification_method?: string | null;
  evidence_type?: string | null;
  requires_reverification?: boolean;
  reverification_reason?: string | null;
  last_engineering_change_at?: string | null;
}

export interface POWorkflow {
  id: string;
  ewo_id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  created_at: string;
  updated_at: string;
}

export interface POWorkflowStep {
  id: string;
  workflow_id: string;
  step_label: string;
  step_description: string | null;
  order_index: number;
}

export interface POWorkflowRun {
  id: string;
  workflow_id: string;
  status: WorkflowRunStatus;
  tested_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  failure_reason: string | null;
  notes: string | null;
}

export interface CompletionReportStatus {
  implementation: CompletionStatus;
  verification: CompletionStatus;
  po_testing: CompletionStatus;
  po_acceptance: CompletionStatus;
  build: CompletionStatus;
}

// ─── EWO-017R.5: Constitutional Verification Model (AMD-007) ──────────────────
// Verification permanently consists of four constitutional levels.
// Product Owner Acceptance requires Unit + Integration + End-to-End all passed.

export type ConstitutionalVerificationLevel = 'unit' | 'integration' | 'end_to_end' | 'product_owner';

export const CONSTITUTIONAL_LEVELS: ConstitutionalVerificationLevel[] = [
  'unit', 'integration', 'end_to_end', 'product_owner',
];

export const CONSTITUTIONAL_LEVEL_LABELS: Record<ConstitutionalVerificationLevel, string> = {
  unit: 'Unit Verification',
  integration: 'Integration Verification',
  end_to_end: 'End-to-End Verification',
  product_owner: 'Product Owner Verification',
};

export interface ConstitutionalVerificationRecord {
  id: string;
  ewo_id: string;
  verification_level: ConstitutionalVerificationLevel;
  status: VerificationStatus;
  evidence: string | null;
  evidence_artefacts: unknown[];
  verifier: string | null;
  result: string | null;
  notes: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConstitutionalVerificationSummary {
  unit: ConstitutionalVerificationRecord | null;
  integration: ConstitutionalVerificationRecord | null;
  end_to_end: ConstitutionalVerificationRecord | null;
  product_owner: ConstitutionalVerificationRecord | null;
  allPassed: boolean;
  poAcceptanceEligible: boolean;
  outstandingLevels: ConstitutionalVerificationLevel[];
}

export async function getConstitutionalVerification(
  ewoId: string,
): Promise<ConstitutionalVerificationSummary> {
  const { data, error } = await supabase
    .from('ewo_constitutional_verification')
    .select('*')
    .eq('ewo_id', ewoId);
  if (error || !data) {
    return {
      unit: null, integration: null, end_to_end: null, product_owner: null,
      allPassed: false, poAcceptanceEligible: false,
      outstandingLevels: [...CONSTITUTIONAL_LEVELS],
    };
  }
  const rows = data as ConstitutionalVerificationRecord[];
  const byLevel = (lvl: ConstitutionalVerificationLevel) =>
    rows.find(r => r.verification_level === lvl) ?? null;

  const unit = byLevel('unit');
  const integration = byLevel('integration');
  const endToEnd = byLevel('end_to_end');
  const productOwner = byLevel('product_owner');

  const isPassed = (r: ConstitutionalVerificationRecord | null) =>
    r?.status === 'passed' || r?.status === 'not_applicable';

  const mandatoryLevels: ConstitutionalVerificationLevel[] = ['unit', 'integration', 'end_to_end'];
  const allMandatoryPassed = mandatoryLevels.every(lvl => isPassed(byLevel(lvl)));
  const allFourPassed = [...CONSTITUTIONAL_LEVELS].every(lvl => isPassed(byLevel(lvl)));

  const outstandingLevels = CONSTITUTIONAL_LEVELS.filter(lvl => !isPassed(byLevel(lvl)));

  return {
    unit, integration, end_to_end: endToEnd, product_owner: productOwner,
    allPassed: allFourPassed,
    poAcceptanceEligible: allMandatoryPassed,
    outstandingLevels,
  };
}

export async function upsertConstitutionalVerification(
  ewoId: string,
  level: ConstitutionalVerificationLevel,
  status: VerificationStatus,
  verifier: string,
  evidence?: string,
  notes?: string,
  evidenceArtefacts?: unknown[],
): Promise<ConstitutionalVerificationRecord | null> {
  const now = new Date().toISOString();
  const payload = {
    ewo_id: ewoId,
    verification_level: level,
    status,
    verifier,
    evidence: evidence ?? null,
    notes: notes ?? null,
    evidence_artefacts: evidenceArtefacts ?? [],
    verified_at: status === 'passed' || status === 'failed' ? now : null,
    result: status === 'passed' ? 'pass' : status === 'failed' ? 'fail' : null,
    updated_at: now,
  };
  const { data, error } = await supabase
    .from('ewo_constitutional_verification')
    .upsert(payload, { onConflict: 'ewo_id,verification_level' })
    .select('*')
    .maybeSingle();
  if (error) return null;

  // Sync summary column on engineering_work_orders
  const columnMap: Record<ConstitutionalVerificationLevel, string> = {
    unit: 'unit_verification_status',
    integration: 'integration_verification_status',
    end_to_end: 'end_to_end_verification_status',
    product_owner: 'product_owner_verification_status',
  };
  await supabase
    .from('engineering_work_orders')
    .update({ [columnMap[level]]: status })
    .eq('id', ewoId);

  return data as ConstitutionalVerificationRecord | null;
}

export interface POAcceptanceGateResult {
  canAccept: boolean;
  blockingLevels: ConstitutionalVerificationLevel[];
  explanation: string;
}

export async function checkPOAcceptanceGate(
  ewoId: string,
): Promise<POAcceptanceGateResult> {
  const summary = await getConstitutionalVerification(ewoId);
  const mandatoryLevels: ConstitutionalVerificationLevel[] = ['unit', 'integration', 'end_to_end'];
  const blockingLevels = mandatoryLevels.filter(lvl => {
    const record = summary[lvl];
    return !record || (record.status !== 'passed' && record.status !== 'not_applicable');
  });
  if (blockingLevels.length === 0) {
    return { canAccept: true, blockingLevels: [], explanation: 'All mandatory verification levels passed.' };
  }
  const labels = blockingLevels.map(l => CONSTITUTIONAL_LEVEL_LABELS[l]);
  const explanation = `Product Owner Acceptance blocked: ${labels.join(', ')} ${blockingLevels.length === 1 ? 'has' : 'have'} not passed. Product Owner Acceptance requires Unit, Integration, and End-to-End verification to pass first (AMD-007).`;
  return { canAccept: false, blockingLevels, explanation };
}

// ─── Test Classifications ──────────────────────────────────────────────────────

export async function getTestClassifications(): Promise<TestClassification[]> {
  const { data, error } = await supabase
    .from('engineering_test_classifications')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) return [];
  return (data ?? []) as TestClassification[];
}

// ─── Verification Matrix ───────────────────────────────────────────────────────

export async function getVerificationMatrix(ewoId: string): Promise<VerificationMatrixRow[]> {
  const { data, error } = await supabase
    .from('engineering_verification_matrix')
    .select('*')
    .eq('ewo_id', ewoId)
    .order('test_type', { ascending: true });
  if (error) return [];
  return (data ?? []) as VerificationMatrixRow[];
}

export async function upsertVerificationMatrixRow(
  ewoId: string,
  testType: TestTypeCode,
  status: VerificationStatus,
  verifiedBy?: string,
  notes?: string,
): Promise<VerificationMatrixRow | null> {
  const payload: Record<string, unknown> = {
    ewo_id: ewoId,
    test_type: testType,
    status,
    verified_by: verifiedBy ?? null,
    verified_at: status === 'passed' || status === 'failed' ? new Date().toISOString() : null,
    notes: notes ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('engineering_verification_matrix')
    .upsert(payload, { onConflict: 'ewo_id,test_type' })
    .select('*')
    .maybeSingle();
  if (error) return null;
  return data as VerificationMatrixRow | null;
}

// ─── PO Workflows ──────────────────────────────────────────────────────────────

export async function getPOWorkflows(ewoId: string): Promise<POWorkflow[]> {
  const { data, error } = await supabase
    .from('engineering_po_workflows')
    .select('*')
    .eq('ewo_id', ewoId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data ?? []) as POWorkflow[];
}

export async function createPOWorkflow(
  ewoId: string,
  name: string,
  description: string,
  steps: { step_label: string; step_description?: string }[],
): Promise<POWorkflow | null> {
  const { data: wf, error } = await supabase
    .from('engineering_po_workflows')
    .insert({ ewo_id: ewoId, name, description, status: 'defined' })
    .select('*')
    .maybeSingle();
  if (error || !wf) return null;
  const workflow = wf as POWorkflow;
  if (steps.length > 0) {
    const stepRows = steps.map((s, i) => ({
      workflow_id: workflow.id,
      step_label: s.step_label,
      step_description: s.step_description ?? null,
      order_index: i + 1,
    }));
    await supabase.from('engineering_po_workflow_steps').insert(stepRows);
  }
  return workflow;
}

export async function getWorkflowSteps(workflowId: string): Promise<POWorkflowStep[]> {
  const { data, error } = await supabase
    .from('engineering_po_workflow_steps')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('order_index', { ascending: true });
  if (error) return [];
  return (data ?? []) as POWorkflowStep[];
}

export async function updateWorkflowStatus(
  workflowId: string,
  status: WorkflowStatus,
): Promise<boolean> {
  const { error } = await supabase
    .from('engineering_po_workflows')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', workflowId);
  return !error;
}

export async function recordWorkflowRun(
  workflowId: string,
  status: WorkflowRunStatus,
  testedBy: string,
  failureReason?: string,
  notes?: string,
): Promise<POWorkflowRun | null> {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    workflow_id: workflowId,
    status,
    tested_by: testedBy,
    started_at: status === 'in_progress' ? now : null,
    completed_at: status === 'passed' || status === 'failed' || status === 'blocked' ? now : null,
    failure_reason: failureReason ?? null,
    notes: notes ?? null,
  };
  const { data, error } = await supabase
    .from('engineering_po_workflow_runs')
    .insert(payload)
    .select('*')
    .maybeSingle();
  if (error) return null;
  return data as POWorkflowRun | null;
}

// ─── Completion Report Status ──────────────────────────────────────────────────

export async function getCompletionReportStatus(ewoId: string): Promise<CompletionReportStatus> {
  const { data, error } = await supabase
    .from('engineering_work_orders')
    .select('completion_report_status')
    .eq('id', ewoId)
    .maybeSingle();
  if (error || !data) {
    return {
      implementation: 'pending',
      verification: 'pending',
      po_testing: 'pending',
      po_acceptance: 'pending',
      build: 'pending',
    };
  }
  const raw = (data as { completion_report_status?: Record<string, string> }).completion_report_status;
  return {
    implementation: (raw?.implementation as CompletionStatus) ?? 'pending',
    verification: (raw?.verification as CompletionStatus) ?? 'pending',
    po_testing: (raw?.po_testing as CompletionStatus) ?? 'pending',
    po_acceptance: (raw?.po_acceptance as CompletionStatus) ?? 'pending',
    build: (raw?.build as CompletionStatus) ?? 'pending',
  };
}

export async function updateCompletionReportStatus(
  ewoId: string,
  status: Partial<CompletionReportStatus>,
): Promise<boolean> {
  const current = await getCompletionReportStatus(ewoId);
  const merged = { ...current, ...status };
  const { error } = await supabase
    .from('engineering_work_orders')
    .update({ completion_report_status: merged })
    .eq('id', ewoId);
  return !error;
}

// ─── Engineering Confidence Calculation ──────────────────────────────────────────
// Confidence is derived from the verification matrix and PO workflow status.
// It cannot reach "verified" while any required row is not "passed" or
// "not_applicable", or while any PO workflow is "failed".

const REQUIRED_ROWS: TestTypeCode[] = [
  'unit', 'integration', 'workflow', 'ui_component',
  'manual_verification', 'po_verification', 'po_acceptance', 'build_verification',
];

export function calculateEngineeringConfidence(
  matrix: VerificationMatrixRow[],
  workflows: POWorkflow[],
): EngineeringConfidence {
  // If no matrix rows exist at all, confidence is unknown.
  if (matrix.length === 0) return 'unknown';

  // Check for any failed workflow — immediately drops to low.
  const hasFailedWorkflow = workflows.some(w => w.status === 'failed');
  if (hasFailedWorkflow) return 'low';

  // Count passed, failed, and not_applicable among required rows.
  let passed = 0;
  let failed = 0;
  let notApplicable = 0;
  let notRun = 0;
  let blocked = 0;

  for (const row of REQUIRED_ROWS) {
    const entry = matrix.find(m => m.test_type === row);
    if (!entry || entry.status === 'not_run' || entry.status === 'pending') {
      notRun++;
    } else if (entry.status === 'passed') {
      passed++;
    } else if (entry.status === 'failed') {
      failed++;
    } else if (entry.status === 'not_applicable') {
      notApplicable++;
    } else if (entry.status === 'blocked') {
      blocked++;
    } else if (entry.status === 'pending_reverification') {
      notRun++;
    }
  }

  // Any failed required row → low confidence.
  if (failed > 0) return 'low';
  // Any blocked required row → low confidence.
  if (blocked > 0) return 'low';

  const totalApplicable = REQUIRED_ROWS.length - notApplicable;
  const passedRatio = totalApplicable > 0 ? passed / totalApplicable : 0;

  // PO verification and acceptance are mandatory for "verified".
  const poVerification = matrix.find(m => m.test_type === 'po_verification');
  const poAcceptance = matrix.find(m => m.test_type === 'po_acceptance');
  const poVerified = poVerification?.status === 'passed';
  const poAccepted = poAcceptance?.status === 'passed';

  // All required rows passed (or not_applicable) AND PO verified AND accepted.
  if (notRun === 0 && poVerified && poAccepted) return 'verified';

  // High: >75% passed and PO verification passed.
  if (passedRatio >= 0.75 && poVerified) return 'high';

  // Medium: >50% passed.
  if (passedRatio >= 0.5) return 'medium';

  // Low: anything below.
  return 'low';
}

export async function recalculateAndStoreConfidence(ewoId: string): Promise<EngineeringConfidence> {
  const [matrix, workflows] = await Promise.all([
    getVerificationMatrix(ewoId),
    getPOWorkflows(ewoId),
  ]);
  const confidence = calculateEngineeringConfidence(matrix, workflows);
  await supabase
    .from('engineering_work_orders')
    .update({ engineering_confidence: confidence })
    .eq('id', ewoId);
  return confidence;
}

// ─── Dashboard Aggregation ──────────────────────────────────────────────────────

export interface VerificationDashboardSummary {
  totalEWOs: number;
  verificationCoverage: number;       // 0..1 — fraction of EWOs with ≥1 matrix row
  workflowCoverage: number;           // 0..1 — fraction of EWOs with a defined workflow
  pendingPOTests: number;             // EWOs with po_verification not passed
  failedWorkflows: number;            // EWOs with a failed workflow
  confidenceBreakdown: Record<EngineeringConfidence, number>;
  recentlyVerified: { ewo_ref: string; title: string; verified_at: string }[];
}

export async function getVerificationDashboardSummary(): Promise<VerificationDashboardSummary> {
  // Fetch all work orders with confidence + completion status.
  const { data: ewos, error: ewoErr } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, engineering_confidence, completion_report_status')
    .neq('status', 'archived')
    .order('created_at', { ascending: false });
  if (ewoErr || !ewos) {
    return {
      totalEWOs: 0,
      verificationCoverage: 0,
      workflowCoverage: 0,
      pendingPOTests: 0,
      failedWorkflows: 0,
      confidenceBreakdown: { unknown: 0, low: 0, medium: 0, high: 0, verified: 0 },
      recentlyVerified: [],
    };
  }

  const ewoIds = (ewos as { id: string }[]).map(e => e.id);

  // Matrix coverage: how many EWOs have at least one matrix row.
  const { data: matrixRows } = await supabase
    .from('engineering_verification_matrix')
    .select('ewo_id, test_type, status, verified_at')
    .in('ewo_id', ewoIds);
  const ewosWithMatrix = new Set((matrixRows ?? []).map(r => (r as { ewo_id: string }).ewo_id));

  // PO workflows.
  const { data: workflows } = await supabase
    .from('engineering_po_workflows')
    .select('id, ewo_id, status')
    .in('ewo_id', ewoIds);
  const wfList = (workflows ?? []) as { id: string; ewo_id: string; status: WorkflowStatus }[];
  const ewosWithWorkflow = new Set(wfList.map(w => w.ewo_id));
  const failedWorkflowEWOs = new Set(wfList.filter(w => w.status === 'failed').map(w => w.ewo_id));

  // Pending PO tests: EWOs where po_verification is not passed.
  const matrixByEWO = new Map<string, VerificationMatrixRow[]>();
  for (const row of (matrixRows ?? []) as VerificationMatrixRow[]) {
    const list = matrixByEWO.get(row.ewo_id) ?? [];
    list.push(row);
    matrixByEWO.set(row.ewo_id, list);
  }
  let pendingPOTests = 0;
  for (const ewoId of ewoIds) {
    const rows = matrixByEWO.get(ewo_id) ?? [];
    const poVer = rows.find(r => r.test_type === 'po_verification');
    if (!poVer || poVer.status !== 'passed') pendingPOTests++;
  }

  // Confidence breakdown.
  const confidenceBreakdown: Record<EngineeringConfidence, number> = {
    unknown: 0, low: 0, medium: 0, high: 0, verified: 0,
  };
  for (const ewo of ewos as { engineering_confidence?: EngineeringConfidence }[]) {
    const c = (ewo.engineering_confidence ?? 'unknown') as EngineeringConfidence;
    confidenceBreakdown[c] = (confidenceBreakdown[c] ?? 0) + 1;
  }

  // Recently verified: EWOs with po_verification passed, sorted by verified_at.
  const recentlyVerified = (matrixRows ?? [])
    .filter(r => (r as VerificationMatrixRow).test_type === 'po_verification'
              && (r as VerificationMatrixRow).status === 'passed'
              && (r as VerificationMatrixRow).verified_at)
    .map(r => {
      const row = r as VerificationMatrixRow;
      const ewo = (ewos as { id: string; ewo_ref: string; title: string }[])
        .find(e => e.id === row.ewo_id);
      return {
        ewo_ref: ewo?.ewo_ref ?? '—',
        title: ewo?.title ?? '—',
        verified_at: row.verified_at as string,
      };
    })
    .sort((a, b) => (b.verified_at ?? '').localeCompare(a.verified_at ?? ''))
    .slice(0, 10);

  return {
    totalEWOs: ewos.length,
    verificationCoverage: ewos.length > 0 ? ewosWithMatrix.size / ewos.length : 0,
    workflowCoverage: ewos.length > 0 ? ewosWithWorkflow.size / ewos.length : 0,
    pendingPOTests,
    failedWorkflows: failedWorkflowEWOs.size,
    confidenceBreakdown,
    recentlyVerified,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EWO-014.18R — Verification Governance Maturity
// ═══════════════════════════════════════════════════════════════════════════

// ─── Evidence Types ────────────────────────────────────────────────────────────

export type EvidenceType =
  | 'product_owner_test' | 'automated_test_suite' | 'engineering_completion_report'
  | 'build_verification' | 'manual_verification' | 'regression_test'
  | 'integration_test' | 'external_evidence';

export type VerificationRole =
  | 'Implementation Engineer' | 'Product Owner' | 'Engineering Director';

// ─── Verification History ──────────────────────────────────────────────────────

export interface VerificationHistoryEntry {
  id: string;
  ewo_id: string;
  matrix_row_id: string | null;
  test_type: TestTypeCode;
  previous_status: VerificationStatus;
  new_status: VerificationStatus;
  changed_by: string;
  reason: string | null;
  related_ewo_ref: string | null;
  created_at: string;
}

export async function getVerificationHistory(ewoId: string): Promise<VerificationHistoryEntry[]> {
  const { data, error } = await supabase
    .from('engineering_verification_history')
    .select('*')
    .eq('ewo_id', ewoId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as VerificationHistoryEntry[];
}

async function recordVerificationHistory(
  ewoId: string,
  matrixRowId: string | null,
  testType: TestTypeCode,
  previousStatus: VerificationStatus,
  newStatus: VerificationStatus,
  changedBy: string,
  reason?: string,
  relatedEwoRef?: string,
): Promise<void> {
  await supabase.from('engineering_verification_history').insert({
    ewo_id: ewoId,
    matrix_row_id: matrixRowId,
    test_type: testType,
    previous_status: previousStatus,
    new_status: newStatus,
    changed_by: changedBy,
    reason: reason ?? null,
    related_ewo_ref: relatedEwoRef ?? null,
  });
}

// ─── Evidence Recording (extends upsertVerificationMatrixRow) ──────────────────

export interface EvidenceRecord {
  status: VerificationStatus;
  verifiedBy: string;
  verificationRole: VerificationRole;
  verificationMethod: string;
  evidenceRef: string;
  evidenceType: EvidenceType;
  notes?: string;
}

export async function recordVerificationEvidence(
  ewoId: string,
  testType: TestTypeCode,
  evidence: EvidenceRecord,
  relatedEwoRef?: string,
): Promise<VerificationMatrixRow | null> {
  // Fetch the current row to record history.
  const { data: existing } = await supabase
    .from('engineering_verification_matrix')
    .select('*')
    .eq('ewo_id', ewoId)
    .eq('test_type', testType)
    .maybeSingle();
  const prev = existing as VerificationMatrixRow | null;
  const previousStatus: VerificationStatus = prev?.status ?? 'not_run';

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    ewo_id: ewoId,
    test_type: testType,
    status: evidence.status,
    verified_by: evidence.verifiedBy,
    verification_role: evidence.verificationRole,
    verification_method: evidence.verificationMethod,
    evidence_ref: evidence.evidenceRef,
    evidence_type: evidence.evidenceType,
    verified_at: evidence.status === 'passed' || evidence.status === 'failed' ? now : null,
    notes: evidence.notes ?? null,
    updated_at: now,
  };
  const { data, error } = await supabase
    .from('engineering_verification_matrix')
    .upsert(payload, { onConflict: 'ewo_id,test_type' })
    .select('*')
    .maybeSingle();
  if (error) return null;

  // Record immutable history.
  await recordVerificationHistory(
    ewoId,
    prev?.id ?? null,
    testType,
    previousStatus,
    evidence.status,
    evidence.verifiedBy,
    evidence.notes,
    relatedEwoRef,
  );

  return data as VerificationMatrixRow | null;
}

// ─── Verification Dependencies ─────────────────────────────────────────────────

export interface DependencyCheckResult {
  canVerify: boolean;
  blockedBy: { testType: TestTypeCode; requiredStatus: VerificationStatus; currentStatus: VerificationStatus }[];
  explanation: string;
}

export function checkVerificationDependencies(
  testType: TestTypeCode,
  matrix: VerificationMatrixRow[],
  classifications: TestClassification[],
): DependencyCheckResult {
  const cls = classifications.find(c => c.code === testType);
  const prereqCodes = cls?.prerequisite_codes ?? [];
  if (prereqCodes.length === 0) {
    return { canVerify: true, blockedBy: [], explanation: '' };
  }
  const blockedBy: DependencyCheckResult['blockedBy'] = [];
  for (const prereq of prereqCodes as TestTypeCode[]) {
    const row = matrix.find(m => m.test_type === prereq);
    const currentStatus: VerificationStatus = row?.status ?? 'not_run';
    if (currentStatus !== 'passed') {
      blockedBy.push({ testType: prereq, requiredStatus: 'passed', currentStatus });
    }
  }
  if (blockedBy.length === 0) {
    return { canVerify: true, blockedBy: [], explanation: '' };
  }
  const explanation = `Cannot verify ${cls?.label ?? testType} because the following prerequisites are not met: ${
    blockedBy.map(b => `${b.testType} must be ${b.requiredStatus} (currently ${b.currentStatus})`).join('; ')
  }.`;
  return { canVerify: false, blockedBy, explanation };
}

// ─── Automatic Reverification Detection ────────────────────────────────────────

export async function markReverificationRequired(
  ewoId: string,
  testTypes: TestTypeCode[],
  reason: string,
  relatedEwoRef?: string,
): Promise<number> {
  const now = new Date().toISOString();
  let count = 0;
  for (const testType of testTypes) {
    const { data: existing } = await supabase
      .from('engineering_verification_matrix')
      .select('*')
      .eq('ewo_id', ewoId)
      .eq('test_type', testType)
      .maybeSingle();
    const prev = existing as VerificationMatrixRow | null;
    if (!prev || prev.status !== 'passed') continue;

    const { error } = await supabase
      .from('engineering_verification_matrix')
      .update({
        status: 'pending_reverification' as VerificationStatus,
        requires_reverification: true,
        reverification_reason: reason,
        last_engineering_change_at: now,
        updated_at: now,
      })
      .eq('id', prev.id);
    if (!error) {
      count++;
      await recordVerificationHistory(
        ewoId,
        prev.id,
        testType,
        prev.status,
        'pending_reverification',
        'system',
        reason,
        relatedEwoRef,
      );
    }
  }
  if (count > 0) {
    await recalculateAndStoreConfidence(ewoId);
  }
  return count;
}

// ─── Engineering Confidence Explanation ────────────────────────────────────────

export interface ConfidenceContributor {
  testType: TestTypeCode;
  label: string;
  status: VerificationStatus;
  passed: boolean;
  required: boolean;
}

export interface ConfidenceExplanation {
  confidence: EngineeringConfidence;
  percentage: number;
  contributors: ConfidenceContributor[];
  summary: string;
}

export function explainEngineeringConfidence(
  matrix: VerificationMatrixRow[],
  workflows: POWorkflow[],
  classifications: TestClassification[],
): ConfidenceExplanation {
  const confidence = calculateEngineeringConfidence(matrix, workflows);
  const contributors: ConfidenceContributor[] = [];
  let passedCount = 0;
  let totalApplicable = 0;

  for (const code of REQUIRED_ROWS) {
    const cls = classifications.find(c => c.code === code);
    const row = matrix.find(m => m.test_type === code);
    const status: VerificationStatus = row?.status ?? 'not_run';
    const isApplicable = status !== 'not_applicable';
    const passed = status === 'passed';
    if (isApplicable) totalApplicable++;
    if (passed) passedCount++;
    contributors.push({
      testType: code,
      label: cls?.label ?? code,
      status,
      passed,
      required: true,
    });
  }

  // Add workflow status as a contributor.
  const hasFailedWorkflow = workflows.some(w => w.status === 'failed');
  const allWorkflowsPassed = workflows.length > 0 && workflows.every(w => w.status === 'passed');
  contributors.push({
    testType: 'workflow' as TestTypeCode,
    label: 'Primary PO Workflow',
    status: hasFailedWorkflow ? 'failed' : allWorkflowsPassed ? 'passed' : 'not_run',
    passed: allWorkflowsPassed,
    required: true,
  });

  const percentage = totalApplicable > 0 ? Math.round((passedCount / totalApplicable) * 100) : 0;
  const passedLabels = contributors.filter(c => c.passed).map(c => `✓ ${c.label} Passed`);
  const failedLabels = contributors.filter(c => !c.passed && c.required && c.status !== 'not_applicable')
    .map(c => `✗ ${c.label} ${c.status === 'not_run' ? 'Pending' : c.status === 'pending_reverification' ? 'Pending Reverification' : c.status === 'failed' ? 'Failed' : c.status === 'blocked' ? 'Blocked' : 'Pending'}`);
  const summary = [...passedLabels, ...failedLabels].join('\n');

  return { confidence, percentage, contributors, summary };
}

// ─── PO Test Guide Generation ──────────────────────────────────────────────────

export interface POTestGuide {
  id: string;
  ewo_id: string;
  title: string;
  description: string | null;
  prerequisites: string[];
  expected_results: string[];
  regression_checks: string[];
  risk_level: string;
  is_edited: boolean;
  generated_at: string;
  updated_at: string;
}

export interface POTestGuideStep {
  id: string;
  guide_id: string;
  step_label: string;
  step_description: string | null;
  expected_result: string | null;
  order_index: number;
}

export async function getPOTestGuide(ewoId: string): Promise<{ guide: POTestGuide | null; steps: POTestGuideStep[] }> {
  const { data: guide } = await supabase
    .from('engineering_po_test_guides')
    .select('*')
    .eq('ewo_id', ewoId)
    .order('generated_at', { ascending: false })
    .maybeSingle();
  if (!guide) return { guide: null, steps: [] };
  const g = guide as POTestGuide;
  const { data: steps } = await supabase
    .from('engineering_po_test_guide_steps')
    .select('*')
    .eq('guide_id', g.id)
    .order('order_index', { ascending: true });
  return { guide: g, steps: (steps ?? []) as POTestGuideStep[] };
}

export interface POTestGuideGenerationInput {
  ewoId: string;
  ewoRef: string;
  ewoTitle: string;
  riskLevel: string;
  changedComponents: string[];
  workflows: POWorkflow[];
  workflowSteps: Record<string, POWorkflowStep[]>;
  regressionImpact: string[];
}

export async function generatePOTestGuide(input: POTestGuideGenerationInput): Promise<POTestGuide | null> {
  // Delete any existing unedited guide for this EWO.
  await supabase
    .from('engineering_po_test_guides')
    .delete()
    .eq('ewo_id', input.ewoId)
    .eq('is_edited', false);

  const prerequisites = [
    'Hard refresh the browser to load the latest bundle.',
    'Ensure the Engineering Work Order is in an accessible state.',
    `Confirm risk level: ${input.riskLevel}.`,
  ];
  if (input.changedComponents.length > 0) {
    prerequisites.push(`Review changed components: ${input.changedComponents.join(', ')}.`);
  }

  const expectedResults = [
    'The Engineering Verification Matrix is displayed with all required rows.',
    'The Primary Product Owner Workflow is visible with ordered steps.',
    'Engineering Confidence updates correctly when verification status changes.',
  ];

  const regressionChecks = input.regressionImpact.length > 0
    ? input.regressionImpact
    : ['Verify existing Engineering Work Order navigation still works.',
       'Verify existing verification matrix data is preserved.'];

  // Build steps from the first workflow's steps, or default steps.
  const firstWorkflow = input.workflows[0];
  const wfSteps = firstWorkflow ? (input.workflowSteps[firstWorkflow.id] ?? []) : [];
  const guideSteps: { step_label: string; step_description: string; expected_result: string }[] = [];

  if (wfSteps.length > 0) {
    for (const s of wfSteps) {
      guideSteps.push({
        step_label: s.step_label,
        step_description: s.step_description ?? '',
        expected_result: `Step completes successfully without errors.`,
      });
    }
  } else {
    guideSteps.push(
      { step_label: 'Open Engineering Work Order', step_description: 'Navigate to the EWO detail page.', expected_result: 'EWO detail loads successfully.' },
      { step_label: 'Verify Verification Matrix', step_description: 'Check all matrix rows are displayed.', expected_result: 'All 8 required rows are visible with correct statuses.' },
      { step_label: 'Verify PO Workflow', step_description: 'Confirm the Primary PO Workflow is visible.', expected_result: 'Workflow steps are displayed in order.' },
      { step_label: 'Verify Confidence', step_description: 'Check the Engineering Confidence badge.', expected_result: 'Confidence reflects the current verification status.' },
    );
  }

  // Add regression check steps.
  for (const rc of regressionChecks) {
    guideSteps.push({
      step_label: `Regression: ${rc}`,
      step_description: rc,
      expected_result: 'No regression observed.',
    });
  }

  const { data: guide, error } = await supabase
    .from('engineering_po_test_guides')
    .insert({
      ewo_id: input.ewoId,
      title: `PO Testing Guide — ${input.ewoRef}`,
      description: `Auto-generated PO testing guide for ${input.ewoTitle}. Considers changed components, risk level (${input.riskLevel}), and regression impact.`,
      prerequisites: prerequisites,
      expected_results: expectedResults,
      regression_checks: regressionChecks,
      risk_level: input.riskLevel,
      is_edited: false,
    })
    .select('*')
    .maybeSingle();
  if (error || !guide) return null;
  const g = guide as POTestGuide;

  if (guideSteps.length > 0) {
    const stepRows = guideSteps.map((s, i) => ({
      guide_id: g.id,
      step_label: s.step_label,
      step_description: s.step_description,
      expected_result: s.expected_result,
      order_index: i + 1,
    }));
    await supabase.from('engineering_po_test_guide_steps').insert(stepRows);
  }

  return g;
}

export async function updatePOTestGuide(
  guideId: string,
  updates: Partial<Pick<POTestGuide, 'title' | 'description' | 'prerequisites' | 'expected_results' | 'regression_checks'>>,
): Promise<boolean> {
  const { error } = await supabase
    .from('engineering_po_test_guides')
    .update({ ...updates, is_edited: true, updated_at: new Date().toISOString() })
    .eq('id', guideId);
  return !error;
}

// ─── Platform Verification Coverage ────────────────────────────────────────────

export interface PlatformCoverageEntry {
  id: string;
  capability: string;
  description: string | null;
  coverage_pct: number;
  verified_count: number;
  total_count: number;
  last_assessed_at: string;
}

export async function getPlatformCoverage(): Promise<PlatformCoverageEntry[]> {
  const { data, error } = await supabase
    .from('engineering_platform_coverage')
    .select('*')
    .order('capability', { ascending: true });
  if (error) return [];
  return (data ?? []) as PlatformCoverageEntry[];
}

export async function updatePlatformCoverage(
  capability: string,
  coveragePct: number,
  verifiedCount?: number,
  totalCount?: number,
): Promise<boolean> {
  const { error } = await supabase
    .from('engineering_platform_coverage')
    .update({
      coverage_pct: coveragePct,
      verified_count: verifiedCount ?? 0,
      total_count: totalCount ?? 0,
      last_assessed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('capability', capability);
  return !error;
}

// ─── Engineering Trust Score ────────────────────────────────────────────────────

export type TrustLevel = 'excellent' | 'good' | 'moderate' | 'low' | 'critical';

export interface TrustScoreRecord {
  id: string;
  ewo_id: string;
  trust_level: TrustLevel;
  trust_score: number;
  verification_age_days: number;
  reopenings_count: number;
  outstanding_defects: number;
  failed_regressions: number;
  outstanding_tech_debt: number;
  changes_since_verification: number;
  po_acceptance_status: string;
  release_count: number;
  explanation: { contributor: string; value: string; impact: string }[];
  assessed_at: string;
}

export interface TrustScoreInput {
  verificationAgeDays: number;
  reopeningsCount: number;
  outstandingDefects: number;
  failedRegressions: number;
  outstandingTechDebt: number;
  changesSinceVerification: number;
  poAcceptanceStatus: string; // 'passed' | 'pending' | 'failed' | 'not_applicable'
  releaseCount: number;
}

export interface TrustScoreResult {
  trustLevel: TrustLevel;
  trustScore: number;
  explanation: { contributor: string; value: string; impact: string }[];
}

export function calculateTrustScore(input: TrustScoreInput): TrustScoreResult {
  let score = 100;
  const explanation: { contributor: string; value: string; impact: string }[] = [];

  // Verification age: older verification loses trust slowly.
  const ageImpact = Math.min(input.verificationAgeDays * 0.5, 15);
  score -= ageImpact;
  explanation.push({
    contributor: 'Verification Age',
    value: `${input.verificationAgeDays} days`,
    impact: `-${ageImpact.toFixed(1)}`,
  });

  // Reopenings: each reopening reduces trust.
  const reopeningImpact = input.reopeningsCount * 8;
  score -= reopeningImpact;
  explanation.push({
    contributor: 'Reopenings',
    value: `${input.reopeningsCount}`,
    impact: `-${reopeningImpact}`,
  });

  // Outstanding defects.
  const defectImpact = input.outstandingDefects * 5;
  score -= defectImpact;
  explanation.push({
    contributor: 'Outstanding Defects',
    value: `${input.outstandingDefects}`,
    impact: `-${defectImpact}`,
  });

  // Failed regressions.
  const regressionImpact = input.failedRegressions * 7;
  score -= regressionImpact;
  explanation.push({
    contributor: 'Failed Regressions',
    value: `${input.failedRegressions}`,
    impact: `-${regressionImpact}`,
  });

  // Outstanding tech debt.
  const debtImpact = input.outstandingTechDebt * 3;
  score -= debtImpact;
  explanation.push({
    contributor: 'Outstanding Tech Debt',
    value: `${input.outstandingTechDebt}`,
    impact: `-${debtImpact}`,
  });

  // Changes since verification.
  const changeImpact = input.changesSinceVerification * 4;
  score -= changeImpact;
  explanation.push({
    contributor: 'Changes Since Verification',
    value: `${input.changesSinceVerification}`,
    impact: `-${changeImpact}`,
  });

  // PO acceptance.
  let poImpact = 0;
  if (input.poAcceptanceStatus === 'passed') {
    poImpact = 0;
  } else if (input.poAcceptanceStatus === 'pending') {
    poImpact = 10;
  } else if (input.poAcceptanceStatus === 'failed') {
    poImpact = 20;
  }
  score -= poImpact;
  explanation.push({
    contributor: 'Product Owner Acceptance',
    value: input.poAcceptanceStatus,
    impact: poImpact > 0 ? `-${poImpact}` : '0',
  });

  // Release history: each release adds a small amount of trust (proven history).
  const releaseBonus = Math.min(input.releaseCount * 2, 10);
  score += releaseBonus;
  explanation.push({
    contributor: 'Release History',
    value: `${input.releaseCount}`,
    impact: `+${releaseBonus}`,
  });

  score = Math.max(0, Math.min(100, score));

  let trustLevel: TrustLevel;
  if (score >= 85) trustLevel = 'excellent';
  else if (score >= 70) trustLevel = 'good';
  else if (score >= 50) trustLevel = 'moderate';
  else if (score >= 30) trustLevel = 'low';
  else trustLevel = 'critical';

  return { trustLevel, trustScore: Math.round(score * 100) / 100, explanation };
}

export async function getTrustScore(ewoId: string): Promise<TrustScoreRecord | null> {
  const { data, error } = await supabase
    .from('engineering_trust_scores')
    .select('*')
    .eq('ewo_id', ewoId)
    .maybeSingle();
  if (error || !data) return null;
  return data as TrustScoreRecord;
}

export async function calculateAndStoreTrustScore(
  ewoId: string,
  input: TrustScoreInput,
): Promise<TrustScoreResult> {
  const result = calculateTrustScore(input);
  const payload = {
    ewo_id: ewoId,
    trust_level: result.trustLevel,
    trust_score: result.trustScore,
    verification_age_days: input.verificationAgeDays,
    reopenings_count: input.reopeningsCount,
    outstanding_defects: input.outstandingDefects,
    failed_regressions: input.failedRegressions,
    outstanding_tech_debt: input.outstandingTechDebt,
    changes_since_verification: input.changesSinceVerification,
    po_acceptance_status: input.poAcceptanceStatus,
    release_count: input.releaseCount,
    explanation: result.explanation,
    assessed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('engineering_trust_scores')
    .upsert(payload, { onConflict: 'ewo_id' });
  return result;
}

