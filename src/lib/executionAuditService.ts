// EWO-017 Req 11 — Engineering Execution Audit
//
// Records a comprehensive, reproducible audit trail for every execution:
//   Execution Session, Timeline, Implementation Engine + Version,
//   Repository, Branch, Commit Reference, Deployment, Verification,
//   Evidence, Approvals, Rollback events.
//
// Every execution must be fully reproducible.

import { supabase } from './supabase';
import type { VerificationOutcome } from './executionVerificationService';

export interface AuditRecordParams {
  sessionId: string;
  executionId: string;
  ewoRef: string;
  implementationEngine: string;
  implementationEngineVersion: string;
  targetPlatform: string;
  targetRepository: string;
  targetBranch: string;
  commitRef: string | null;
  verificationSummary: VerificationOutcome | null;
  evidenceSummary: Record<string, unknown>;
  approvals: { plan: boolean; review: boolean; po: boolean; production: boolean };
  rollbackEvents: unknown[];
}

export async function recordExecutionAudit(params: AuditRecordParams): Promise<string> {
  const auditRef = `EAT-${Date.now()}`;
  const reproducibilityHash = generateReproducibilityHash(params);

  const { error } = await supabase.from('execution_audit_trail').insert({
    audit_ref: auditRef,
    session_id: params.sessionId,
    execution_id: params.executionId,
    ewo_ref: params.ewoRef,
    implementation_engine: params.implementationEngine,
    implementation_engine_version: params.implementationEngineVersion,
    target_platform: params.targetPlatform,
    target_repository: params.targetRepository,
    target_branch: params.targetBranch,
    commit_ref: params.commitRef,
    verification_summary: params.verificationSummary ?? {},
    evidence_summary: params.evidenceSummary,
    approvals: params.approvals,
    rollback_events: params.rollbackEvents,
    reproducibility_hash: reproducibilityHash,
  });

  if (error) throw new Error(`Failed to record audit: ${error.message}`);
  return auditRef;
}

export async function getAuditTrail(sessionId: string) {
  const { data } = await supabase
    .from('execution_audit_trail')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

export async function getAuditByEwo(ewoRef: string) {
  const { data } = await supabase
    .from('execution_audit_trail')
    .select('*')
    .eq('ewo_ref', ewoRef)
    .order('created_at', { ascending: false });
  return data ?? [];
}

function generateReproducibilityHash(params: AuditRecordParams): string {
  const data = [
    params.ewoRef,
    params.implementationEngine,
    params.implementationEngineVersion,
    params.targetPlatform,
    params.targetRepository,
    params.targetBranch,
    params.commitRef ?? '',
    JSON.stringify(params.evidenceSummary),
  ].join('|');
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
  }
  return `rh-${Math.abs(hash).toString(36)}`;
}
