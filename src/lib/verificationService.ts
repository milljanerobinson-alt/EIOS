import { supabase } from './supabase';

// ============================================================
// Types
// ============================================================

export type VerificationGateKey = 'build' | 'functional' | 'ui' | 'data' | 'constitutional';
export type VerificationGateStatus = 'not_started' | 'in_progress' | 'verified' | 'failed';
export type VerificationOverallStatus = 'not_started' | 'in_progress' | 'verified' | 'not_verified';

export interface VerificationGate {
  id: string;
  ewo_id: string;
  gate_key: VerificationGateKey;
  gate_label: string;
  gate_order: number;
  status: VerificationGateStatus;
  evidence_summary: string | null;
  evidence_artefacts: EvidenceArtefact[];
  verified_by: string | null;
  verified_at: string | null;
  failure_reason: string | null;
  evidence_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface EvidenceArtefact {
  type: 'screenshot' | 'test_result' | 'build_log' | 'audit_record' | 'manual' | 'other';
  description: string;
  url?: string;
  captured_at?: string;
  metadata?: Record<string, unknown>;
}

export interface VerificationSession {
  id: string;
  ewo_id: string;
  session_ref: string;
  overall_status: VerificationOverallStatus;
  gates_summary: Record<string, string>;
  started_at: string;
  completed_at: string | null;
  started_by: string | null;
  created_at: string;
}

export interface VerificationStandard {
  id: string;
  version_number: string;
  status: 'draft' | 'active' | 'superseded' | 'archived';
  title: string;
  body: string | null;
  gates: GateDefinition[];
  author: string | null;
  released_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GateDefinition {
  key: VerificationGateKey;
  label: string;
  order: number;
  requirements: string[];
}

export interface VerificationSummary {
  gates: VerificationGate[];
  overall_status: VerificationOverallStatus;
  all_verified: boolean;
  any_failed: boolean;
  verified_count: number;
  total_gates: number;
}

// ============================================================
// Gate Definitions (mirrors DB seed for client-side use)
// ============================================================

export const GATE_DEFINITIONS: GateDefinition[] = [
  {
    key: 'build',
    label: 'Build Verification',
    order: 1,
    requirements: [
      'Project builds successfully',
      'Zero TypeScript errors',
      'Zero build errors',
      'Database migrations apply successfully',
      'No failed dependency compilation',
    ],
  },
  {
    key: 'functional',
    label: 'Functional Verification',
    order: 2,
    requirements: [
      'Happy path works',
      'State changes occur correctly',
      'Services execute correctly',
      'APIs return expected responses',
      'Audit records created',
      'Error handling works',
    ],
  },
  {
    key: 'ui',
    label: 'UI Verification',
    order: 3,
    requirements: [
      'Correct page rendered',
      'Correct component rendered',
      'Navigation reaches correct destination',
      'No legacy component still active',
      'Buttons execute expected workflow',
      'Required forms visible',
      'Screenshots captured for evidence',
    ],
  },
  {
    key: 'data',
    label: 'Data Verification',
    order: 4,
    requirements: [
      'Database records created correctly',
      'Immutable records preserved',
      'Foreign keys valid',
      'Rollback behaviour verified',
      'No orphaned records',
      'Lineage updated correctly',
    ],
  },
  {
    key: 'constitutional',
    label: 'Constitutional Verification',
    order: 5,
    requirements: [
      'Engineering Standards followed',
      'Governance requirements satisfied',
      'Evidence complete',
      'Audit trail complete',
      'Constitutional rules enforced',
    ],
  },
];

export const GATE_STATUS_CFG: Record<VerificationGateStatus, { label: string; bg: string; text: string; border: string; dot: string }> = {
  not_started: { label: 'Not Started', bg: 'bg-slate-50',   text: 'text-slate-500',  border: 'border-slate-200',  dot: 'bg-slate-300'  },
  in_progress: { label: 'In Progress', bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200',   dot: 'bg-blue-500'   },
  verified:    { label: 'Verified',    bg: 'bg-emerald-50', text: 'text-emerald-700',border: 'border-emerald-200',dot: 'bg-emerald-500' },
  failed:      { label: 'Failed',      bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500'    },
};

export const OVERALL_STATUS_CFG: Record<VerificationOverallStatus, { label: string; bg: string; text: string; border: string; dot: string }> = {
  not_started:  { label: 'Not Started',  bg: 'bg-slate-50',   text: 'text-slate-500',  border: 'border-slate-200',  dot: 'bg-slate-300'  },
  in_progress:  { label: 'In Progress',  bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200',   dot: 'bg-blue-500'   },
  verified:     { label: 'Verified',     bg: 'bg-emerald-50', text: 'text-emerald-700',border: 'border-emerald-200',dot: 'bg-emerald-500' },
  not_verified: { label: 'Not Verified', bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500'    },
};

// ============================================================
// Verification Standard CRUD
// ============================================================

export async function getActiveVerificationStandard(): Promise<VerificationStandard | null> {
  const { data, error } = await supabase
    .from('ecc_engineering_verification_standard')
    .select('*')
    .eq('status', 'active')
    .order('released_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as VerificationStandard | null;
}

export async function listVerificationStandards(): Promise<VerificationStandard[]> {
  const { data, error } = await supabase
    .from('ecc_engineering_verification_standard')
    .select('*')
    .order('version_number', { ascending: false });
  if (error) throw error;
  return (data ?? []) as VerificationStandard[];
}

// ============================================================
// Verification Gate Management
// ============================================================

export async function initializeVerificationGates(ewoId: string): Promise<void> {
  const { error } = await supabase.rpc('initialize_ewo_verification_gates', { p_ewo_id: ewoId });
  if (error) throw error;
}

export async function getVerificationGates(ewoId: string): Promise<VerificationGate[]> {
  const { data, error } = await supabase
    .from('ewo_verification_gates')
    .select('*')
    .eq('ewo_id', ewoId)
    .order('gate_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as VerificationGate[];
}

export async function getVerificationSummary(ewoId: string): Promise<VerificationSummary> {
  const gates = await getVerificationGates(ewoId);
  const verifiedCount = gates.filter(g => g.status === 'verified').length;
  const anyFailed = gates.some(g => g.status === 'failed');
  const allVerified = gates.length > 0 && verifiedCount === gates.length;

  let overallStatus: VerificationOverallStatus = 'not_started';
  if (allVerified) overallStatus = 'verified';
  else if (anyFailed) overallStatus = 'not_verified';
  else if (gates.some(g => g.status === 'in_progress' || g.status === 'verified')) overallStatus = 'in_progress';

  return {
    gates,
    overall_status: overallStatus,
    all_verified: allVerified,
    any_failed: anyFailed,
    verified_count: verifiedCount,
    total_gates: gates.length,
  };
}

export interface VerificationGateUpdateResult {
  success: boolean;
  gate_updated: boolean;
  all_verified: boolean;
  auto_transitioned?: boolean;
  auto_transition_failed?: boolean;
  auto_transition_error?: string;
  auto_transition_errors?: string[];
  ewo_status?: string;
  verification_status?: string;
}

export async function updateVerificationGate(
  ewoId: string,
  gateKey: VerificationGateKey,
  status: VerificationGateStatus,
  evidenceSummary?: string,
  failureReason?: string,
  verifiedBy = 'platform',
  evidenceArtefacts?: EvidenceArtefact[],
): Promise<VerificationGateUpdateResult> {
  const { data, error } = await supabase.rpc('update_ewo_verification_gate', {
    p_ewo_id: ewoId,
    p_gate_key: gateKey,
    p_status: status,
    p_evidence_summary: evidenceSummary ?? null,
    p_failure_reason: failureReason ?? null,
    p_verified_by: verifiedBy,
    p_evidence_artefacts: evidenceArtefacts ?? null,
  });
  if (error) throw error;
  return data as VerificationGateUpdateResult;
}

export async function retryAutoTransition(ewoId: string): Promise<{ success: boolean; ewo_status?: string; error?: string }> {
  const { data, error } = await supabase.rpc('auto_transition_verified_ewo', {
    p_ewo_id: ewoId,
  });
  if (error) return { success: false, error: error.message };
  return data as { success: boolean; ewo_status?: string; error?: string };
}

export async function addEvidenceArtefact(
  gateId: string,
  artefact: EvidenceArtefact,
): Promise<void> {
  const { data: gate, error: fetchErr } = await supabase
    .from('ewo_verification_gates')
    .select('evidence_artefacts, evidence_locked')
    .eq('id', gateId)
    .single();
  if (fetchErr) throw fetchErr;

  if (gate?.evidence_locked) {
    throw new Error('Evidence is locked. Cannot add artefacts after Report Ready.');
  }

  const existing = (gate?.evidence_artefacts ?? []) as EvidenceArtefact[];
  const updated = [...existing, artefact];

  const { error } = await supabase
    .from('ewo_verification_gates')
    .update({ evidence_artefacts: updated, updated_at: new Date().toISOString() })
    .eq('id', gateId);
  if (error) throw error;
}

// ============================================================
// Verification Sessions
// ============================================================

export async function createVerificationSession(ewoId: string, startedBy = 'platform'): Promise<VerificationSession> {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const { data: existing } = await supabase
    .from('ewo_verification_sessions')
    .select('session_ref')
    .like('session_ref', `VS-${dateStr}-%`)
    .order('session_ref', { ascending: false })
    .limit(1);

  const seq = existing && existing.length > 0
    ? parseInt(existing[0].session_ref.split('-')[2], 10) + 1
    : 1;
  const sessionRef = `VS-${dateStr}-${String(seq).padStart(3, '0')}`;

  const { data, error } = await supabase
    .from('ewo_verification_sessions')
    .insert({
      ewo_id: ewoId,
      session_ref: sessionRef,
      overall_status: 'in_progress',
      started_by: startedBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data as VerificationSession;
}

export async function completeVerificationSession(
  sessionId: string,
  gatesSummary: Record<string, string>,
  overallStatus: VerificationOverallStatus,
): Promise<void> {
  const { error } = await supabase
    .from('ewo_verification_sessions')
    .update({
      overall_status: overallStatus,
      gates_summary: gatesSummary,
      completed_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
  if (error) throw error;
}

export async function listVerificationSessions(ewoId: string): Promise<VerificationSession[]> {
  const { data, error } = await supabase
    .from('ewo_verification_sessions')
    .select('*')
    .eq('ewo_id', ewoId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as VerificationSession[];
}

// ============================================================
// EWO Verification Status Helpers
// ============================================================

export async function getEwoVerificationStatus(ewoId: string): Promise<VerificationOverallStatus> {
  const { data, error } = await supabase
    .from('engineering_work_orders')
    .select('verification_status')
    .eq('id', ewoId)
    .maybeSingle();
  if (error) throw error;
  return (data?.verification_status ?? 'not_started') as VerificationOverallStatus;
}

export function canGenerateCompletionReport(verificationStatus: VerificationOverallStatus): boolean {
  return verificationStatus === 'verified';
}

// ============================================================
// Sequential Gate Logic
// ============================================================

export function isGateUnlocked(gateKey: VerificationGateKey, gates: VerificationGate[]): boolean {
  if (gateKey === 'build') return true;
  const order = GATE_DEFINITIONS.find(d => d.key === gateKey)?.order ?? 99;
  const previousGates = gates.filter(g => {
    const gateOrder = GATE_DEFINITIONS.find(d => d.key === g.gate_key)?.order ?? 99;
    return gateOrder < order;
  });
  return previousGates.length > 0 && previousGates.every(g => g.status === 'verified');
}

export function getNextUnverifiedGate(gates: VerificationGate[]): VerificationGate | null {
  const sorted = [...gates].sort((a, b) => a.gate_order - b.gate_order);
  for (const gate of sorted) {
    if (gate.status !== 'verified') return gate;
  }
  return null;
}

export function isEvidenceLocked(gate: VerificationGate): boolean {
  return gate.evidence_locked === true;
}

// ============================================================
// Future Automation Hook
// ============================================================

export interface AutomatedVerificationProvider {
  gateKey: VerificationGateKey;
  name: string;
  execute(ewoId: string): Promise<{
    status: VerificationGateStatus;
    evidenceSummary: string;
    artefacts?: EvidenceArtefact[];
    failureReason?: string;
  }>;
}

const registeredProviders: AutomatedVerificationProvider[] = [];

export function registerVerificationProvider(provider: AutomatedVerificationProvider): void {
  registeredProviders.push(provider);
}

export function getRegisteredProviders(): AutomatedVerificationProvider[] {
  return [...registeredProviders];
}

export async function runAutomatedVerification(ewoId: string): Promise<void> {
  for (const provider of registeredProviders) {
    const result = await provider.execute(ewoId);
    await updateVerificationGate(
      ewoId,
      provider.gateKey,
      result.status,
      result.evidenceSummary,
      result.failureReason,
    );
    if (result.artefacts) {
      const gates = await getVerificationGates(ewoId);
      const gate = gates.find(g => g.gate_key === provider.gateKey);
      if (gate) {
        for (const artefact of result.artefacts) {
          await addEvidenceArtefact(gate.id, artefact);
        }
      }
    }
  }
}
