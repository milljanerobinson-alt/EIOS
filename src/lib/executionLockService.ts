/**
 * EWO-034R.1 — Execution Lock Service
 *
 * Enforces concurrent execution locking so that two executions cannot
 * modify the same governed repository workspace at the same time.
 *
 * Lock lifecycle:
 *   1. acquire — before provider invocation or repository mutation
 *   2. renew  — during long-running execution to prevent expiry
 *   3. release — on success, failure, cancellation, or timeout
 *   4. recover — stale locks are cleaned up automatically
 */

import { supabase } from './supabase';

const LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const LOCK_RENEWAL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

export interface ExecutionLock {
  id: string;
  ewo_ref: string;
  locked_by: string;
  locked_at: string;
  expires_at: string;
}

export interface LockAcquisitionResult {
  acquired: boolean;
  lock: ExecutionLock | null;
  conflict: { locked_by: string; locked_at: string; expires_at: string } | null;
  reason: string | null;
}

/**
 * Acquire an execution lock scoped to an EWO.
 * If a lock already exists and has not expired, acquisition fails.
 * If a lock exists but has expired, it is recovered and re-acquired.
 */
export async function acquireExecutionLock(
  ewoRef: string,
  lockedBy: string,
): Promise<LockAcquisitionResult> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_TIMEOUT_MS);

  // Check for existing lock
  const { data: existing } = await supabase
    .from('execution_locks')
    .select('*')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (existing) {
    const existingExpiry = new Date(existing.expires_at);
    if (existingExpiry > now) {
      // Active lock — deny
      return {
        acquired: false,
        lock: null,
        conflict: {
          locked_by: existing.locked_by,
          locked_at: existing.locked_at,
          expires_at: existing.expires_at,
        },
        reason: `EWO ${ewoRef} is already locked by ${existing.locked_by} until ${existing.expires_at}`,
      };
    }
    // Stale lock — recover it
    await supabase
      .from('execution_locks')
      .delete()
      .eq('id', existing.id);

    // Audit the stale lock recovery
    await supabase.from('repository_change_audit').insert({
      audit_ref: `LOCK-RECOVER-${Date.now()}`,
      execution_id: ewoRef,
      ewo_ref: ewoRef,
      actor: lockedBy,
      operation: 'lock_recovery',
      file_path: null,
      action: 'recover',
      content_size: 0,
      files_applied: [],
      snapshots: { recovered_lock_id: existing.id, stale_since: existing.expires_at },
      diff_evidence: null,
      build_result: null,
      test_result: null,
      rollback_performed: false,
      created_at: now.toISOString(),
    }).then(() => {}, () => {});
  }

  // Insert new lock
  const { data: lock, error } = await supabase
    .from('execution_locks')
    .insert({
      ewo_ref: ewoRef,
      locked_by: lockedBy,
      locked_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    return {
      acquired: false,
      lock: null,
      conflict: null,
      reason: `Failed to acquire lock: ${error.message}`,
    };
  }

  // Audit the lock acquisition
  await supabase.from('repository_change_audit').insert({
    audit_ref: `LOCK-ACQUIRE-${Date.now()}`,
    execution_id: ewoRef,
    ewo_ref: ewoRef,
    actor: lockedBy,
    operation: 'lock_acquire',
    file_path: null,
    action: 'acquire',
    content_size: 0,
    files_applied: [],
    snapshots: { lock_id: lock.id, expires_at: expiresAt.toISOString() },
    diff_evidence: null,
    build_result: null,
    test_result: null,
    rollback_performed: false,
    created_at: now.toISOString(),
  }).then(() => {}, () => {});

  return {
    acquired: true,
    lock: lock as unknown as ExecutionLock,
    conflict: null,
    reason: null,
  };
}

/**
 * Renew an existing lock to prevent expiry during long-running execution.
 */
export async function renewExecutionLock(
  ewoRef: string,
  lockedBy: string,
): Promise<{ renewed: boolean; reason: string | null }> {
  const now = new Date();
  const newExpiry = new Date(now.getTime() + LOCK_TIMEOUT_MS);

  const { data, error } = await supabase
    .from('execution_locks')
    .update({ expires_at: newExpiry.toISOString() })
    .eq('ewo_ref', ewoRef)
    .eq('locked_by', lockedBy)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    return { renewed: false, reason: error?.message || 'Lock not found or not owned by caller' };
  }

  return { renewed: true, reason: null };
}

/**
 * Release an execution lock. Called on success, failure, cancellation, or timeout.
 */
export async function releaseExecutionLock(
  ewoRef: string,
  lockedBy: string,
): Promise<{ released: boolean; reason: string | null }> {
  const { error } = await supabase
    .from('execution_locks')
    .delete()
    .eq('ewo_ref', ewoRef)
    .eq('locked_by', lockedBy);

  if (error) {
    return { released: false, reason: error.message };
  }

  // Audit the lock release
  await supabase.from('repository_change_audit').insert({
    audit_ref: `LOCK-RELEASE-${Date.now()}`,
    execution_id: ewoRef,
    ewo_ref: ewoRef,
    actor: lockedBy,
    operation: 'lock_release',
    file_path: null,
    action: 'release',
    content_size: 0,
    files_applied: [],
    snapshots: null,
    diff_evidence: null,
    build_result: null,
    test_result: null,
    rollback_performed: false,
    created_at: new Date().toISOString(),
  }).then(() => {}, () => {});

  return { released: true, reason: null };
}

/**
 * Check whether a lock is currently held for an EWO.
 */
export async function isExecutionLocked(ewoRef: string): Promise<{ locked: boolean; lockedBy: string | null }> {
  const now = new Date();
  const { data } = await supabase
    .from('execution_locks')
    .select('locked_by, expires_at')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  if (!data) return { locked: false, lockedBy: null };

  const expiry = new Date(data.expires_at);
  if (expiry <= now) {
    // Stale — clean up
    await supabase
      .from('execution_locks')
      .delete()
      .eq('ewo_ref', ewoRef);
    return { locked: false, lockedBy: null };
  }

  return { locked: true, lockedBy: data.locked_by };
}

/**
 * Clean up all stale locks (expired). Called before any execution begins.
 */
export async function cleanupStaleLocks(): Promise<{ cleaned: number }> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('execution_locks')
    .delete()
    .lt('expires_at', now)
    .select('id');

  return { cleaned: data?.length ?? 0 };
}

export { LOCK_TIMEOUT_MS, LOCK_RENEWAL_INTERVAL_MS };
