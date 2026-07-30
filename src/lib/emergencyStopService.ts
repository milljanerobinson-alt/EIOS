/**
 * EWO-034R.1 — Emergency Stop Service
 *
 * Provides a hard-stop mechanism that halts all autonomous execution
 * and repository mutation. When activated, the orchestrator must:
 *   - halt safely
 *   - not apply further changes
 *   - roll back any unverified mutation
 *   - release execution locks
 *   - record the termination reason
 *   - set an accurate lifecycle state
 *   - notify the Product Owner through the execution result
 */

import { supabase } from './supabase';

export interface EmergencyStopState {
  is_active: boolean;
  reason: string | null;
  activated_by: string | null;
  activated_at: string | null;
  deactivated_at: string | null;
}

/**
 * Check whether emergency stop is currently active.
 * The orchestrator must call this before every critical stage:
 *   - before execution begins
 *   - before provider invocation
 *   - before repository mutation
 *   - before build/test commands
 *   - before promotion or completion
 */
export async function checkEmergencyStop(): Promise<{ halted: boolean; reason: string | null }> {
  const { data } = await supabase
    .from('execution_emergency_stop')
    .select('is_active, reason, activated_by, activated_at, deactivated_at')
    .order('activated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { halted: false, reason: null };

  return {
    halted: data.is_active === true,
    reason: data.is_active ? data.reason : null,
  };
}

/**
 * Activate the emergency stop. Once activated, no further executions
 * may proceed until it is deactivated.
 */
export async function activateEmergencyStop(
  reason: string,
  activatedBy: string,
): Promise<{ activated: boolean }> {
  // Deactivate any previous active stop
  await supabase
    .from('execution_emergency_stop')
    .update({ is_active: false, deactivated_at: new Date().toISOString() })
    .eq('is_active', true);

  const { error } = await supabase
    .from('execution_emergency_stop')
    .insert({
      is_active: true,
      reason,
      activated_by: activatedBy,
      activated_at: new Date().toISOString(),
      deactivated_at: null,
    });

  if (error) {
    // Table may not exist — treat as non-blocking
    return { activated: false };
  }

  // Audit the activation
  await supabase.from('repository_change_audit').insert({
    audit_ref: `ESTOP-ACTIVATE-${Date.now()}`,
    execution_id: 'system',
    ewo_ref: 'system',
    actor: activatedBy,
    operation: 'emergency_stop_activate',
    file_path: null,
    action: 'activate',
    content_size: 0,
    files_applied: [],
    snapshots: { reason },
    diff_evidence: null,
    build_result: null,
    test_result: null,
    rollback_performed: false,
    created_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  return { activated: true };
}

/**
 * Deactivate the emergency stop, allowing executions to resume.
 */
export async function deactivateEmergencyStop(
  deactivatedBy: string,
): Promise<{ deactivated: boolean }> {
  const { error } = await supabase
    .from('execution_emergency_stop')
    .update({ is_active: false, deactivated_at: new Date().toISOString() })
    .eq('is_active', true);

  if (error) {
    return { deactivated: false };
  }

  // Audit the deactivation
  await supabase.from('repository_change_audit').insert({
    audit_ref: `ESTOP-DEACTIVATE-${Date.now()}`,
    execution_id: 'system',
    ewo_ref: 'system',
    actor: deactivatedBy,
    operation: 'emergency_stop_deactivate',
    file_path: null,
    action: 'deactivate',
    content_size: 0,
    files_applied: [],
    snapshots: null,
    diff_evidence: null,
    build_result: null,
    test_result: null,
    rollback_performed: false,
    created_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  return { deactivated: true };
}

/**
 * Get the current emergency stop state.
 */
export async function getEmergencyStopState(): Promise<EmergencyStopState> {
  const { data } = await supabase
    .from('execution_emergency_stop')
    .select('is_active, reason, activated_by, activated_at, deactivated_at')
    .order('activated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return {
      is_active: false,
      reason: null,
      activated_by: null,
      activated_at: null,
      deactivated_at: null,
    };
  }

  return data as EmergencyStopState;
}
