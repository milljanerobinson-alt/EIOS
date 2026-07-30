import { supabase } from './supabase';

// ── Types ──────────────────────────────────────────────────────────────────

export type ExecutionStatus =
  | 'draft'
  | 'prepared'
  | 'submitted'
  | 'running'
  | 'awaiting_completion'
  | 'completion_received'
  | 'engineering_review'
  | 'automated_verification'
  | 'awaiting_po_testing'
  | 'po_accepted'
  | 'released'
  | 'archived'
  | 'failed'
  | 'cancelled';

export type POStatus = 'pending' | 'approved' | 'rejected' | 'refinement';

export type ImplementationProvider = 'bolt' | 'claude_code' | 'cursor' | 'codex' | 'eios_code_engine' | 'manual';

export interface ExecutionFile {
  path: string;
  action: 'created' | 'modified' | 'deleted';
  lines_added?: number;
  lines_removed?: number;
}

export interface CompletionReport {
  status: 'success' | 'partial' | 'failed';
  summary: string;
  files: ExecutionFile[];
  verification: {
    passed: boolean;
    tests_run: number;
    tests_passed: number;
    details?: string;
  };
  build: {
    success: boolean;
    errors: string[];
    warnings: string[];
  };
  tests: {
    passed: boolean;
    results: { name: string; status: 'pass' | 'fail'; detail?: string }[];
  };
  recommendations: string[];
  risks: string[];
  report_body: string;
}

export interface ReviewResults {
  reviewer: string;
  reviewed_at: string;
  requirements_satisfied: boolean;
  architecture_score: number;
  standards_compliance: boolean;
  governance_compliance: boolean;
  risks: string[];
  missing_requirements: string[];
  recommendations: string[];
  summary: string;
  overall_verdict: 'pass' | 'conditional_pass' | 'fail';
}

export interface VerificationResults {
  build_verified: boolean;
  functional_verified: boolean;
  ui_verified: boolean;
  ui_verification_state?: 'not_required' | 'not_performed' | 'passed' | 'failed' | 'blocked';
  data_verified: boolean;
  constitutional_verified: boolean;
  details: Record<string, boolean>;
  timestamp: string;
}

export interface ExecutionPackage {
  ewo_ref: string;
  ewo_title: string;
  ewo_body: string;
  engineering_plan: string;
  engineering_standards: string[];
  constitutional_requirements: string[];
  related_engineering: string[];
  historical_context: string;
  verification_requirements: string;
  testing_instructions: string;
  prepared_at: string;
}

export interface EngineeringExecution {
  id: string;
  execution_ref: string;
  ewo_id: string | null;
  engineering_plan_id: string | null;
  implementation_provider: string;
  implementation_status: ExecutionStatus;
  engineer: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds: number | null;
  completion_report: CompletionReport | null;
  verification_results: VerificationResults | null;
  build_results: Record<string, unknown> | null;
  files_changed: ExecutionFile[] | null;
  failure_reason: string | null;
  retry_count: number;
  parent_execution_id: string | null;
  execution_package: ExecutionPackage | null;
  review_results: ReviewResults | null;
  po_status: POStatus;
  po_notes: string | null;
  po_decided_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ExecutionEvent {
  id: string;
  execution_id: string;
  from_status: string | null;
  to_status: string;
  actor: string;
  event_type: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

export const EXECUTION_STATUS_LABELS: Record<ExecutionStatus, string> = {
  draft: 'Draft',
  prepared: 'Prepared',
  submitted: 'Submitted',
  running: 'Running',
  awaiting_completion: 'Awaiting Completion Report',
  completion_received: 'Completion Report Received',
  engineering_review: 'Engineering Review',
  automated_verification: 'Automated Verification',
  awaiting_po_testing: 'Awaiting Product Owner Testing',
  po_accepted: 'Product Owner Accepted',
  released: 'Released',
  archived: 'Archived',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const EXECUTION_STATUS_COLOURS: Record<ExecutionStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  prepared: 'bg-blue-50 text-blue-700 border-blue-200',
  submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  running: 'bg-amber-50 text-amber-700 border-amber-200',
  awaiting_completion: 'bg-amber-50 text-amber-700 border-amber-200',
  completion_received: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  engineering_review: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  automated_verification: 'bg-violet-50 text-violet-700 border-violet-200',
  awaiting_po_testing: 'bg-orange-50 text-orange-700 border-orange-200',
  po_accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  released: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  archived: 'bg-slate-50 text-slate-500 border-slate-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-500 border-slate-200',
};

export const PROVIDER_LABELS: Record<string, string> = {
  bolt: 'Bolt',
  claude_code: 'Claude Code',
  cursor: 'Cursor',
  codex: 'Codex',
  eios_code_engine: 'EIOS Code Engine',
  manual: 'Manual',
};

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  refinement: 'Request Refinement',
};

export const EXECUTION_PIPELINE: ExecutionStatus[] = [
  'draft',
  'prepared',
  'submitted',
  'running',
  'awaiting_completion',
  'completion_received',
  'engineering_review',
  'automated_verification',
  'awaiting_po_testing',
  'po_accepted',
  'released',
  'archived',
];

// ── Service Functions ───────────────────────────────────────────────────────

export async function getExecutions(filters?: {
  status?: ExecutionStatus;
  provider?: string;
  ewoId?: string;
}): Promise<EngineeringExecution[]> {
  let q = supabase
    .from('engineering_executions')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.status) q = q.eq('implementation_status', filters.status);
  if (filters?.provider) q = q.eq('implementation_provider', filters.provider);
  if (filters?.ewoId) q = q.eq('ewo_id', filters.ewoId);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as EngineeringExecution[];
}

export async function getExecution(ref: string): Promise<EngineeringExecution | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  if (isUuid) {
    const { data, error } = await supabase
      .from('engineering_executions')
      .select('*')
      .eq('id', ref)
      .maybeSingle();
    if (error) throw error;
    return data as EngineeringExecution | null;
  }
  // EWO-017R.3: Try exact match first, then ilike fallback for slugified refs
  const { data: exact, error: exactErr } = await supabase
    .from('engineering_executions')
    .select('*')
    .eq('execution_ref', ref)
    .maybeSingle();
  if (exactErr) throw exactErr;
  if (exact) return exact as EngineeringExecution;
  // Fallback: case-insensitive match (handles slugified or lowercased refs)
  const { data: ilikeData, error: ilikeErr } = await supabase
    .from('engineering_executions')
    .select('*')
    .ilike('execution_ref', ref)
    .maybeSingle();
  if (ilikeErr) throw ilikeErr;
  return ilikeData as EngineeringExecution | null;
}

export async function getExecutionEvents(executionId: string): Promise<ExecutionEvent[]> {
  const { data, error } = await supabase
    .from('engineering_execution_events')
    .select('*')
    .eq('execution_id', executionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as ExecutionEvent[];
}

export async function createExecution(input: {
  ewo_id?: string;
  implementation_provider?: string;
  engineer?: string;
  engineering_plan_id?: string;
}): Promise<EngineeringExecution> {
  // Guard: ensure canonical EWO exists before creating execution record
  if (input.ewo_id) {
    const { guardImplementationEntry } = await import('./ensureEngineeringWorkOrder');
    const guard = await guardImplementationEntry(input.ewo_id, 'createExecution');
    if (!guard.success) {
      throw new Error(`Engineering implementation cannot begin because the canonical Engineering Work Order could not be registered. ${guard.error}`);
    }
  }

  const { data: refData } = await supabase.rpc('generate_execution_ref');
  const executionRef = refData || 'EXEC-001';

  const { data, error } = await supabase
    .from('engineering_executions')
    .insert({
      execution_ref: executionRef,
      ewo_id: input.ewo_id || null,
      engineering_plan_id: input.engineering_plan_id || null,
      implementation_provider: input.implementation_provider || 'bolt',
      implementation_status: 'draft',
      engineer: input.engineer || null,
    })
    .select('*')
    .single();
  if (error) throw error;

  await recordEvent(data.id, null, 'draft', 'system', 'execution_created', 'Execution created');

  return data as EngineeringExecution;
}

export async function updateExecution(
  id: string,
  updates: Partial<EngineeringExecution>,
  actor = 'system',
  eventType = 'status_change',
  notes?: string
): Promise<EngineeringExecution> {
  const { data: current } = await supabase
    .from('engineering_executions')
    .select('implementation_status')
    .eq('id', id)
    .maybeSingle();

  const { data, error } = await supabase
    .from('engineering_executions')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;

  if (current && current.implementation_status !== data.implementation_status) {
    await recordEvent(id, current.implementation_status, data.implementation_status, actor, eventType, notes);
  }

  return data as EngineeringExecution;
}

export async function transitionStatus(
  id: string,
  newStatus: ExecutionStatus,
  actor = 'system',
  notes?: string
): Promise<EngineeringExecution> {
  return updateExecution(id, { implementation_status: newStatus }, actor, 'status_change', notes);
}

export async function recordEvent(
  executionId: string,
  fromStatus: string | null,
  toStatus: string,
  actor: string,
  eventType: string,
  notes?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from('engineering_execution_events')
    .insert({
      execution_id: executionId,
      from_status: fromStatus,
      to_status: toStatus,
      actor,
      event_type: eventType,
      notes: notes || null,
      metadata: metadata || {},
    });
  if (error) throw error;
}

export async function getExecutionStats(): Promise<{
  queued: number;
  running: number;
  completed: number;
  failed: number;
  awaiting_review: number;
  awaiting_po: number;
  released: number;
  avg_duration: number;
  provider_success_rate: Record<string, { total: number; succeeded: number; rate: number }>;
}> {
  const { data, error } = await supabase
    .from('engineering_executions')
    .select('implementation_status, implementation_provider, duration_seconds');
  if (error) throw error;

  const rows = data || [];
  const stats = {
    queued: rows.filter((r: { implementation_status: string }) => ['draft', 'prepared', 'submitted'].includes(r.implementation_status)).length,
    running: rows.filter((r: { implementation_status: string }) => r.implementation_status === 'running').length,
    completed: rows.filter((r: { implementation_status: string }) => ['po_accepted', 'released', 'archived'].includes(r.implementation_status)).length,
    failed: rows.filter((r: { implementation_status: string }) => r.implementation_status === 'failed').length,
    awaiting_review: rows.filter((r: { implementation_status: string }) => ['completion_received', 'engineering_review', 'automated_verification'].includes(r.implementation_status)).length,
    awaiting_po: rows.filter((r: { implementation_status: string }) => r.implementation_status === 'awaiting_po_testing').length,
    released: rows.filter((r: { implementation_status: string }) => r.implementation_status === 'released').length,
    avg_duration: 0,
    provider_success_rate: {} as Record<string, { total: number; succeeded: number; rate: number }>,
  };

  const durations = rows.filter((r: { duration_seconds: number | null }) => r.duration_seconds).map((r: { duration_seconds: number | null }) => r.duration_seconds!);
  if (durations.length > 0) {
    stats.avg_duration = Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length);
  }

  const providers: Record<string, { total: number; succeeded: number; rate: number }> = {};
  for (const r of rows) {
    const p = r.implementation_provider;
    if (!providers[p]) providers[p] = { total: 0, succeeded: 0, rate: 0 };
    providers[p].total++;
    if (['po_accepted', 'released', 'archived'].includes(r.implementation_status)) {
      providers[p].succeeded++;
    }
  }
  for (const p of Object.keys(providers)) {
    providers[p].rate = providers[p].total > 0 ? Math.round((providers[p].succeeded / providers[p].total) * 100) : 0;
  }
  stats.provider_success_rate = providers;

  return stats;
}
