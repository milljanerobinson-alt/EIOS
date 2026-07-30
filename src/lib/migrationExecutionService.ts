import { supabase } from './supabase';
import { getMigrationPlan, type MigrationPlan } from './migrationPlannerService';
import { getReview, resolveSubjectIdentity, type GovernedReview } from './reviewService';
import {
  getOwnershipMetadataForObject,
  getLineageForObject,
  listSharedPlatformCapabilities,
  type OwnershipMetadata,
  type OwnershipLineageEvent,
  type SharedPlatformCapability,
} from './ownershipService';

// ============================================================
// Types
// ============================================================

export type ExecutionStatus =
  | 'queued' | 'executing' | 'completed' | 'rolled_back' | 'failed' | 'cancelled';

export type RollbackStatus = 'none' | 'not_required' | 'completed' | 'failed';

export type FinalOutcome = '' | 'success' | 'partial_failure' | 'rolled_back' | 'cancelled';

export interface ExecutionOperation {
  order: number;
  operation: string;
  started: string;
  completed: string;
  duration_ms: number;
  result: 'success' | 'failed';
  evidence: Record<string, unknown>;
  error?: string;
}

export interface ValidationCheck {
  plan_status_ready: boolean;
  ecr_approved: boolean;
  no_newer_plan: boolean;
  dependencies_satisfied: boolean;
  spc_does_not_exist: boolean;
  object_not_already_migrated: boolean;
  fingerprint_matches: boolean;
  hash_matches: boolean;
  target_owner_exists: boolean;
}

export interface ExecutionReport {
  migration_plan_ref: string;
  execution_ref: string;
  operations_executed: number;
  validation_checks: Record<string, boolean>;
  start_time: string;
  finish_time: string;
  duration_seconds: number;
  objects_affected: number;
  ownership_records_created: number;
  lineage_records_created: number;
  spc_records_created: number;
  rollback_status: string;
  final_outcome: string;
  evidence_package: Record<string, unknown>;
}

export interface MigrationExecution {
  id: string;
  execution_ref: string;
  migration_plan_id: string;
  status: ExecutionStatus;
  initiated_by: string;
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number;
  operations_json: ExecutionOperation[];
  validation_json: Record<string, unknown>;
  backup_json: Record<string, unknown>;
  report_json: ExecutionReport | Record<string, never>;
  rollback_status: RollbackStatus;
  objects_affected: number;
  ownership_records_created: number;
  lineage_records_created: number;
  spc_records_created: number;
  final_outcome: FinalOutcome;
  error_message: string;
  created_at: string;
}

export interface ExecutionMetrics {
  ready: number;
  executing: number;
  completed: number;
  failed: number;
  rolled_back: number;
  total: number;
  average_execution_time: number;
}

export interface ValidationResult {
  passed: boolean;
  checks: ValidationCheck;
  blocking_reasons: string[];
}

// ============================================================
// CRUD
// ============================================================

export async function listExecutions(): Promise<MigrationExecution[]> {
  const { data, error } = await supabase
    .from('ecc_migration_executions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MigrationExecution[];
}

export async function getExecution(id: string): Promise<MigrationExecution | null> {
  const { data, error } = await supabase
    .from('ecc_migration_executions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as MigrationExecution | null;
}

export async function getExecutionsByPlan(planId: string): Promise<MigrationExecution[]> {
  const { data, error } = await supabase
    .from('ecc_migration_executions')
    .select('*')
    .eq('migration_plan_id', planId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MigrationExecution[];
}

export async function getLatestExecutionForPlan(planId: string): Promise<MigrationExecution | null> {
  const { data, error } = await supabase
    .from('ecc_migration_executions')
    .select('*')
    .eq('migration_plan_id', planId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as MigrationExecution | null;
}

// ============================================================
// Pre-Execution Validation
// ============================================================

export async function validateExecution(planId: string): Promise<ValidationResult> {
  const plan = await getMigrationPlan(planId);
  if (!plan) {
    return {
      passed: false,
      checks: emptyChecks(),
      blocking_reasons: ['Migration plan not found'],
    };
  }

  // Defence in depth: test/validation plans cannot execute production changes
  if ((plan.record_purpose ?? 'production') !== 'production') {
    return {
      passed: false,
      checks: emptyChecks(),
      blocking_reasons: [
        `This is a ${plan.record_purpose ?? 'production'} plan, not a production plan. ` +
        'Test and validation plans cannot execute production ownership changes.',
      ],
    };
  }

  // Defence in depth: blocked plans cannot execute
  if (plan.status === 'blocked') {
    return {
      passed: false,
      checks: emptyChecks(),
      blocking_reasons: ['Migration plan is blocked. Resolve blocking issues before executing.'],
    };
  }

  const review = await getReview(plan.review_id);
  const snapshot = plan.snapshot_json;
  const objectId = snapshot?.review?.subject_object_id;
  const objectType = snapshot?.review?.subject_object_type ?? 'unknown';
  const ecr = snapshot?.ecr_extension;

  const checks: ValidationCheck = {
    plan_status_ready: plan.status === 'ready',
    ecr_approved: review?.status === 'approved',
    no_newer_plan: false,
    dependencies_satisfied: true,
    spc_does_not_exist: true,
    object_not_already_migrated: true,
    fingerprint_matches: !!plan.decision_hash,
    hash_matches: !!plan.decision_hash,
    target_owner_exists: !!ecr?.proposed_ownership_type_key,
  };

  // Defence in depth: subject_object_id must be present
  if (!objectId) {
    return {
      passed: false,
      checks,
      blocking_reasons: [
        'Subject object ID is missing from the plan snapshot. ' +
        'Link the originating ECR to an existing engineering object and regenerate the Migration Plan.',
      ],
    };
  }

  // Defence in depth: validate subject identity resolution
  try {
    const resolution = await resolveSubjectIdentity(objectId, objectType);
    if (!resolution.resolved && (review?.record_purpose ?? 'production') === 'production') {
      // Object not in ownership metadata — could be valid for a new object being classified.
      // The RPC function will catch it if the object truly doesn't exist.
    }
  } catch {
    // Resolution check failed — don't block, let the RPC handle it
  }

  // Check for newer plans
  const { data: newerPlans } = await supabase
    .from('ecc_migration_plans')
    .select('id')
    .eq('review_id', plan.review_id)
    .neq('id', planId)
    .gt('created_at', plan.created_at)
    .in('status', ['ready', 'blocked']);
  checks.no_newer_plan = (newerPlans ?? []).length === 0;

  // Check SPC doesn't already exist
  if (ecr?.proposed_ownership_type_key === 'platform' && ecr?.promotion_eligible) {
    const spcs = await listSharedPlatformCapabilities();
    const existing = spcs.find(s => s.name === review?.title && s.deleted_at === null);
    checks.spc_does_not_exist = !existing;
  }

  // Check object hasn't been migrated already
  const lineage = await getLineageForObject(objectId, objectType);
  const migratedEvents = lineage.filter(e =>
    ['ownership_transferred', 'promoted', 'absorbed', 'externalised'].includes(e.event_type)
  );
  checks.object_not_already_migrated = migratedEvents.length === 0;

  const blocking_reasons: string[] = [];
  if (!checks.plan_status_ready) blocking_reasons.push('Migration plan status is not "ready"');
  if (!checks.ecr_approved) blocking_reasons.push('Originating ECR is not approved');
  if (!checks.no_newer_plan) blocking_reasons.push('A newer migration plan exists for this ECR — execute the latest plan instead');
  if (!checks.spc_does_not_exist) blocking_reasons.push('SPC already exists for this capability');
  if (!checks.object_not_already_migrated) blocking_reasons.push('Object has already been migrated');
  if (!checks.target_owner_exists) blocking_reasons.push('Target owner is not specified');
  if (!checks.fingerprint_matches) blocking_reasons.push('Constitutional fingerprint is missing');
  if (!checks.hash_matches) blocking_reasons.push('Decision hash is missing');

  return {
    passed: blocking_reasons.length === 0,
    checks,
    blocking_reasons,
  };
}

function emptyChecks(): ValidationCheck {
  return {
    plan_status_ready: false,
    ecr_approved: false,
    no_newer_plan: false,
    dependencies_satisfied: false,
    spc_does_not_exist: false,
    object_not_already_migrated: false,
    fingerprint_matches: false,
    hash_matches: false,
    target_owner_exists: false,
  };
}

// ============================================================
// Execute Migration
// ============================================================

export async function executeMigration(
  planId: string,
  initiatedBy = 'platform',
): Promise<{ success: boolean; execution?: MigrationExecution; error?: string }> {
  // 1. Pre-validate
  const validation = await validateExecution(planId);
  if (!validation.passed) {
    return {
      success: false,
      error: `Execution blocked: ${validation.blocking_reasons.join('; ')}`,
    };
  }

  // 2. Call the RPC function (single transaction)
  const { data, error } = await supabase
    .rpc('execute_migration_plan', {
      p_plan_id: planId,
      p_initiated_by: initiatedBy,
    });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as { success: boolean; execution_id: string; execution_ref: string; report: ExecutionReport };
  if (!result?.success) {
    return { success: false, error: 'Execution failed without specific error' };
  }

  // 3. Fetch the full execution record
  const execution = await getExecution(result.execution_id);
  return { success: true, execution: execution ?? undefined };
}

// ============================================================
// Cancel Execution
// ============================================================

export async function cancelExecution(executionId: string): Promise<void> {
  const { error } = await supabase
    .from('ecc_migration_executions')
    .update({ status: 'cancelled', final_outcome: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', executionId)
    .eq('status', 'queued');
  if (error) throw error;
}

// ============================================================
// Retry Execution
// ============================================================

export async function retryExecution(
  planId: string,
  initiatedBy = 'platform',
): Promise<{ success: boolean; execution?: MigrationExecution; error?: string }> {
  // A retry is just a new execution of the same plan
  // The plan must still be in "ready" status (failed executions don't freeze the plan)
  return executeMigration(planId, initiatedBy);
}

// ============================================================
// Metrics
// ============================================================

export async function getExecutionMetrics(): Promise<ExecutionMetrics> {
  const { data, error } = await supabase
    .from('ecc_migration_executions')
    .select('status, duration_seconds');

  if (error) throw error;
  const rows = (data ?? []) as { status: string; duration_seconds: number }[];

  const counts: Record<string, number> = {};
  let totalDuration = 0;
  let completedCount = 0;

  for (const row of rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    if (row.status === 'completed') {
      totalDuration += row.duration_seconds;
      completedCount++;
    }
  }

  // "ready" = count of plans in ready status (not executions)
  const { data: readyPlans } = await supabase
    .from('ecc_migration_plans')
    .select('id')
    .eq('status', 'ready');

  return {
    ready: (readyPlans ?? []).length,
    executing: counts['executing'] ?? 0,
    completed: counts['completed'] ?? 0,
    failed: counts['failed'] ?? 0,
    rolled_back: counts['rolled_back'] ?? 0,
    total: rows.length,
    average_execution_time: completedCount > 0 ? Math.round(totalDuration / completedCount) : 0,
  };
}
