// EWO-017 Req 1 — Engineering Execution Orchestrator
//
// Executes approved Engineering Work Orders through the complete 10-stage
// pipeline:
//   1. Load context
//   2. Load Engineering Work Order
//   3. Load Engineering Plan
//   4. Load related engineering
//   5. Determine affected components
//   6. Prepare implementation package
//   7. Invoke implementation engine
//   8. Receive implementation
//   9. Validate implementation
//  10. Record implementation evidence
//
// Execution is resumable. Every stage is recorded. Failures pause execution
// and allow resume / retry / abort / rollback without losing history.

import { supabase } from './supabase';
import { getEngine, type ImplementationRequest, type ImplementationResult } from './implementationEngineInterface';
import { runAutomatedVerification, type VerificationOutcome } from './executionVerificationService';
import { deployToStaging, deployToProduction, rollbackDeployment, type DeploymentResult } from './executionDeploymentService';
import { recordExecutionAudit } from './executionAuditService';
import { resolveComponentFromRequest } from './componentResolutionService';
import { acquireExecutionLock, releaseExecutionLock, renewExecutionLock, cleanupStaleLocks, type ExecutionLock } from './executionLockService';
import { checkEmergencyStop } from './emergencyStopService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StageKey =
  | 'load_context'
  | 'load_ewo'
  | 'load_plan'
  | 'load_related'
  | 'determine_components'
  | 'prepare_package'
  | 'invoke_engine'
  | 'receive_impl'
  | 'validate_impl'
  | 'record_evidence';

export type StageStatus = 'pending' | 'running' | 'complete' | 'failed' | 'skipped';

export interface StageRecord {
  id: string;
  session_id: string;
  stage_key: StageKey;
  stage_label: string;
  status: StageStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  detail: string | null;
  error: string | null;
  evidence: Record<string, unknown>;
}

export interface ExecutionSession {
  id: string;
  session_ref: string;
  execution_id: string;
  ewo_id: string;
  target_id: string;
  current_stage: StageKey | null;
  stage_status: StageStatus;
  is_resumable: boolean;
  started_at: string;
  completed_at: string | null;
  resumed_at: string | null;
  failure_stage: string | null;
  failure_reason: string | null;
  recovery_action: 'resume' | 'retry' | 'abort' | 'rollback' | null;
  metadata: Record<string, unknown>;
}

export interface PrerequisiteCheck {
  passed: boolean;
  checks: { name: string; passed: boolean; detail: string }[];
}

export interface OrchestratorConfig {
  executionId: string;
  ewoId: string;
  targetId: string;
  engineId: string;
  actor: string;
  autoDeployStaging?: boolean;
  autoVerify?: boolean;
}

export interface OrchestratorResult {
  session: ExecutionSession;
  stages: StageRecord[];
  implementationResult: ImplementationResult | null;
  verificationOutcome: VerificationOutcome | null;
  stagingDeployment: DeploymentResult | null;
  productionDeployment: DeploymentResult | null;
  auditRef: string | null;
  success: boolean;
  failureReason: string | null;
}

// ─── Pipeline Definition ──────────────────────────────────────────────────────

export const PIPELINE_STAGES: { key: StageKey; label: string }[] = [
  { key: 'load_context', label: 'Load Context' },
  { key: 'load_ewo', label: 'Load Engineering Work Order' },
  { key: 'load_plan', label: 'Load Engineering Plan' },
  { key: 'load_related', label: 'Load Related Engineering' },
  { key: 'determine_components', label: 'Determine Affected Components' },
  { key: 'prepare_package', label: 'Prepare Implementation Package' },
  { key: 'invoke_engine', label: 'Invoke Implementation Engine' },
  { key: 'receive_impl', label: 'Receive Implementation' },
  { key: 'validate_impl', label: 'Validate Implementation' },
  { key: 'record_evidence', label: 'Record Implementation Evidence' },
];

// ─── Prerequisite Validation (Req 1) ──────────────────────────────────────────
//
// EWO-017R.2: This function now delegates to the canonical
// evaluateExecutionEligibility resolver. All schema references have been
// corrected to use actual deployed tables:
//   - ewo_engineering_packages (NOT engineering_plans, which does not exist)
//   - ecc_engineering_reviews (NOT engineering_reviews, which does not exist)
//   - ewo_execution_approvals (NOT ewo_lifecycle_events.event_type, which
//     does not have an event_type column)
//
// No execution eligibility decision may bypass this canonical resolver.

import { evaluateExecutionEligibility } from './executionEligibilityResolver';

export async function validatePrerequisites(ewoId: string): Promise<PrerequisiteCheck> {
  const result = await evaluateExecutionEligibility(ewoId);

  const checks: { name: string; passed: boolean; detail: string }[] = [
    {
      name: 'EWO exists',
      passed: result.workOrderRef !== 'UNKNOWN',
      detail: result.workOrderRef !== 'UNKNOWN' ? `${result.workOrderRef} — ${result.lifecycleState}` : 'EWO not found',
    },
    {
      name: 'Engineering Plan approved',
      passed: result.engineeringPlanApproved,
      detail: result.evidenceSources.find(e => e.table === 'ewo_engineering_packages')?.detail || 'No package found',
    },
    {
      name: 'Engineering Review approved',
      passed: result.engineeringReviewApproved,
      detail: result.evidenceSources.find(e => e.table === 'ecc_engineering_reviews')?.detail || 'No review found',
    },
    {
      name: 'Product Owner approval',
      passed: result.productOwnerApproved,
      detail: result.evidenceSources.find(e => e.table === 'ewo_execution_approvals')?.detail || 'No PO approval found',
    },
    {
      name: 'Execution target available',
      passed: result.targetAvailable,
      detail: result.targetInfo ? `${result.targetInfo.target_ref}: ${result.targetInfo.platform}/${result.targetInfo.repository}` : 'No active target',
    },
    {
      name: 'Not already executed',
      passed: !result.alreadyExecuted,
      detail: result.alreadyExecuted ? `Implementation status: ${result.implementationState}` : 'Not yet executed',
    },
    {
      name: 'No active execution session',
      passed: !result.activeExecutionSession.hasActive,
      detail: result.activeExecutionSession.hasActive ? `Active: ${result.activeExecutionSession.executionRef}` : 'No active session',
    },
    {
      name: 'EWO not closed',
      passed: !result.workOrderClosed,
      detail: result.workOrderClosed ? `Status: ${result.lifecycleState}` : 'EWO is open',
    },
  ];

  const allPassed = checks.every(c => c.passed);
  return { passed: allPassed, checks };
}

// ─── Self-Engineering Governance (Req 12) ──────────────────────────────────────

export async function checkSelfEngineering(targetId: string, affectedComponents: string[]): Promise<{ isSelfEngineering: boolean; protectedHits: { path: string; ref: string }[] }> {
  const { data: target } = await supabase
    .from('execution_targets')
    .select('platform, is_protected')
    .eq('id', targetId)
    .maybeSingle();

  const isSelfEngineering = target?.is_protected === true;

  if (!isSelfEngineering) {
    return { isSelfEngineering: false, protectedHits: [] };
  }

  // Check if any affected components are protected
  const { data: protectedComps } = await supabase
    .from('protected_components')
    .select('component_ref, component_path, requires_constitutional_approval');

  const protectedHits: { path: string; ref: string }[] = [];
  for (const comp of protectedComps ?? []) {
    for (const affected of affectedComponents) {
      if (affected.includes(comp.component_path) || comp.component_path.includes(affected)) {
        protectedHits.push({ path: comp.component_path, ref: comp.component_ref });
      }
    }
  }

  return { isSelfEngineering, protectedHits };
}

// ─── Session Management ──────────────────────────────────────────────────────

export async function createSession(config: OrchestratorConfig): Promise<ExecutionSession> {
  const sessionRef = `ES-${Date.now()}`;
  const { data, error } = await supabase
    .from('execution_sessions')
    .insert({
      session_ref: sessionRef,
      execution_id: config.executionId,
      ewo_id: config.ewoId,
      target_id: config.targetId,
      current_stage: 'load_context',
      stage_status: 'pending',
      is_resumable: true,
      metadata: { engine_id: config.engineId, actor: config.actor },
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to create session: ${error.message}`);

  // Link session to execution
  await supabase
    .from('engineering_executions')
    .update({ session_id: data.id, target_id: config.targetId })
    .eq('id', config.executionId);

  return data as unknown as ExecutionSession;
}

export async function getSession(sessionId: string): Promise<ExecutionSession | null> {
  const { data } = await supabase
    .from('execution_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  return data as unknown as ExecutionSession | null;
}

export async function getSessionStages(sessionId: string): Promise<StageRecord[]> {
  const { data } = await supabase
    .from('execution_stage_records')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  return (data ?? []) as unknown as StageRecord[];
}

async function updateSessionStage(sessionId: string, stage: StageKey, status: StageStatus, extra?: Record<string, unknown>): Promise<void> {
  await supabase
    .from('execution_sessions')
    .update({
      current_stage: stage,
      stage_status: status,
      updated_at: new Date().toISOString(),
      ...extra,
    })
    .eq('id', sessionId);
}

async function recordStage(sessionId: string, stage: StageKey, status: StageStatus, detail: string, error?: string | null, evidence?: Record<string, unknown>): Promise<StageRecord> {
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from('execution_stage_records')
    .select('*')
    .eq('session_id', sessionId)
    .eq('stage_key', stage)
    .maybeSingle();

  if (existing && existing.status === 'complete') {
    return existing as unknown as StageRecord;
  }

  if (existing) {
    const startedAt = existing.started_at ?? now;
    const durationMs = status === 'complete' || status === 'failed'
      ? new Date(now).getTime() - new Date(startedAt).getTime()
      : null;
    const { data, error: err } = await supabase
      .from('execution_stage_records')
      .update({
        status,
        completed_at: status === 'complete' || status === 'failed' ? now : null,
        duration_ms: durationMs,
        detail,
        error: error ?? null,
        evidence: evidence ?? {},
      })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (err) throw err;
    return data as unknown as StageRecord;
  }

  const { data, error: err } = await supabase
    .from('execution_stage_records')
    .insert({
      session_id: sessionId,
      stage_key: stage,
      stage_label: PIPELINE_STAGES.find(s => s.key === stage)?.label ?? stage,
      status,
      started_at: status === 'running' ? now : null,
      completed_at: status === 'complete' || status === 'failed' ? now : null,
      detail,
      error: error ?? null,
      evidence: evidence ?? {},
    })
    .select('*')
    .single();
  if (err) throw err;
  return data as unknown as StageRecord;
}

// ─── Main Orchestrator ─────────────────────────────────────────────────────────

export async function executeWorkOrder(
  config: OrchestratorConfig,
  onProgress?: (stage: StageKey, status: StageStatus, detail: string) => void,
): Promise<OrchestratorResult> {
  const session = await createSession(config);
  const stages: StageRecord[] = [];
  let implementationResult: ImplementationResult | null = null;
  let verificationOutcome: VerificationOutcome | null = null;
  let stagingDeployment: DeploymentResult | null = null;
  let productionDeployment: DeploymentResult | null = null;
  let auditRef: string | null = null;
  let executionLock: ExecutionLock | null = null;
  let ewoRef: string | null = null;

  const notify = (stage: StageKey, status: StageStatus, detail: string) => {
    onProgress?.(stage, status, detail);
  };

  // EWO-034R.1: Emergency stop check helper — called before every critical stage
  const assertNotHalted = async (stageLabel: string): Promise<void> => {
    const estop = await checkEmergencyStop();
    if (estop.halted) {
      throw new Error(`Emergency stop activated: ${estop.reason}. Execution halted at ${stageLabel}.`);
    }
  };

  try {
    // EWO-034R.1: Clean up stale locks before starting
    await cleanupStaleLocks();

    // EWO-034R.1: Check emergency stop before execution begins
    await assertNotHalted('execution start');

    // ── Stage 1: Load Context ──────────────────────────────────────────────
    await updateSessionStage(session.id, 'load_context', 'running');
    await recordStage(session.id, 'load_context', 'running', 'Loading execution context');
    notify('load_context', 'running', 'Loading execution context');

    const { data: target } = await supabase
      .from('execution_targets')
      .select('*')
      .eq('id', config.targetId)
      .maybeSingle();
    if (!target) throw new Error('Execution target not found');

    await recordStage(session.id, 'load_context', 'complete', `Target: ${target.platform}/${target.repository}`);
    notify('load_context', 'complete', `Target: ${target.platform}/${target.repository}`);

    // ── Stage 2: Load EWO ──────────────────────────────────────────────────
    await updateSessionStage(session.id, 'load_ewo', 'running');
    await recordStage(session.id, 'load_ewo', 'running', 'Loading Engineering Work Order');
    notify('load_ewo', 'running', 'Loading EWO');

    const { data: ewo } = await supabase
      .from('engineering_work_orders')
      .select('*')
      .eq('id', config.ewoId)
      .maybeSingle();
    if (!ewo) throw new Error('EWO not found');

    await recordStage(session.id, 'load_ewo', 'complete', `${ewo.ewo_ref} — ${ewo.title}`, null, { ewo_ref: ewo.ewo_ref });
    notify('load_ewo', 'complete', `${ewo.ewo_ref} — ${ewo.title}`);
    ewoRef = ewo.ewo_ref;

    // EWO-034R.1: Acquire execution lock before any mutation can occur
    const lockResult = await acquireExecutionLock(ewo.ewo_ref, config.actor);
    if (!lockResult.acquired) {
      await recordStage(session.id, 'load_ewo', 'failed',
        `Lock acquisition failed: ${lockResult.reason}`,
        lockResult.reason);
      throw new Error(`Concurrent execution lock denied: ${lockResult.reason}`);
    }
    executionLock = lockResult.lock;

    // ── Stage 3: Load Engineering Plan ─────────────────────────────────────
    await updateSessionStage(session.id, 'load_plan', 'running');
    await recordStage(session.id, 'load_plan', 'running', 'Loading Engineering Plan');
    notify('load_plan', 'running', 'Loading plan');

    // EWO-017R.2: Query ewo_engineering_packages (NOT engineering_plans, which does not exist)
    const { data: plan } = await supabase
      .from('ewo_engineering_packages')
      .select('id, package_status, summary, engineering_objectives, implementation_scope')
      .eq('ewo_id', ewo.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const planText = plan?.summary ?? plan?.engineering_objectives ?? 'No plan available';

    await recordStage(session.id, 'load_plan', 'complete', plan ? `Package loaded (status: ${plan.package_status})` : 'No package found (proceeding with EWO body)');
    notify('load_plan', 'complete', plan ? `Package loaded` : 'No plan');

    // ── Stage 4: Load Related Engineering ──────────────────────────────────
    await updateSessionStage(session.id, 'load_related', 'running');
    await recordStage(session.id, 'load_related', 'running', 'Loading related engineering context');
    notify('load_related', 'running', 'Loading related');

    const { data: relatedRecords } = await supabase
      .from('engineering_records_library')
      .select('record_ref, title')
      .eq('ewo_ref', ewo.ewo_ref)
      .limit(10);
    const relatedEngineering = (relatedRecords ?? []).map((r: { record_ref: string; title: string }) => `${r.record_ref} — ${r.title}`);

    await recordStage(session.id, 'load_related', 'complete', `${relatedEngineering.length} related records loaded`);
    notify('load_related', 'complete', `${relatedEngineering.length} related records`);

    // ── Stage 5: Determine Affected Components ──────────────────────────────
    await updateSessionStage(session.id, 'determine_components', 'running');
    await recordStage(session.id, 'determine_components', 'running', 'Determining affected components');
    notify('determine_components', 'running', 'Determining components');

    const affectedComponents = await inferAffectedComponents(ewo, plan as { executive_summary?: string; title?: string } | null);

    // EWO-033 Defect 2: Block execution when no components are resolved.
    // A natural-language request without an explicit file path must not
    // silently fall back to an unrelated file. Instead, block and require
    // governed clarification.
    if (affectedComponents.length === 0) {
      await recordStage(session.id, 'determine_components', 'failed',
        'No affected components could be resolved from the EWO or plan',
        'Component resolution failed. The EWO and plan do not reference any explicit source file paths. Execution is blocked until the target component is identified with sufficient confidence.',
        { ewo_ref: ewo.ewo_ref, title: ewo.title });
      throw new Error('Execution blocked: no affected components could be resolved. The EWO and plan do not contain explicit source file paths. A governed clarification is required to identify the target component before execution can proceed.');
    }

    const selfEng = await checkSelfEngineering(config.targetId, affectedComponents);
    if (selfEng.isSelfEngineering && selfEng.protectedHits.length > 0) {
      await recordStage(session.id, 'determine_components', 'failed',
        `Self-engineering detected: ${selfEng.protectedHits.length} protected components require constitutional approval`,
        'Protected components require constitutional approval',
        { protected_hits: selfEng.protectedHits });
      throw new Error(`Self-engineering governance: ${selfEng.protectedHits.length} protected components require constitutional approval`);
    }

    await supabase
      .from('engineering_executions')
      .update({ is_self_engineering: selfEng.isSelfEngineering })
      .eq('id', config.executionId);

    await recordStage(session.id, 'determine_components', 'complete',
      `${affectedComponents.length} components identified${selfEng.isSelfEngineering ? ' (self-engineering)' : ''}`,
      null, { components: affectedComponents, is_self_engineering: selfEng.isSelfEngineering });
    notify('determine_components', 'complete', `${affectedComponents.length} components`);

    // ── Stage 6: Prepare Implementation Package ────────────────────────────
    await updateSessionStage(session.id, 'prepare_package', 'running');
    await recordStage(session.id, 'prepare_package', 'running', 'Preparing implementation package');
    notify('prepare_package', 'running', 'Preparing package');

    const implRequest: ImplementationRequest = {
      ewoRef: ewo.ewo_ref,
      ewoTitle: ewo.title,
      ewoBody: ewo.executive_summary ?? '',
      engineeringPlan: planText,
      engineeringStandards: ['ES-001: EWO-First Principle', 'ES-002: Implementation Engine Independence', 'ES-003: Governed Code Changes'],
      constitutionalRequirements: ['Every modification attributable to originating EWO', 'Full audit trail', 'Rollback capability'],
      relatedEngineering,
      historicalContext: `EWO ${ewo.ewo_ref} execution on ${target.platform}`,
      verificationRequirements: 'Build, type check, unit tests, integration tests, linting, standards validation, constitutional validation',
      testingInstructions: 'Run full test suite and verify all gates pass',
      targetPlatform: target.platform,
      targetRepository: target.repository,
      targetBranch: target.staging_branch,
      targetEnvironment: 'staging',
      affectedComponents,
    };

    await recordStage(session.id, 'prepare_package', 'complete', 'Implementation package prepared', null, { package: { ewo_ref: implRequest.ewoRef, target: implRequest.targetPlatform } });
    notify('prepare_package', 'complete', 'Package prepared');

    // ── Stage 7: Invoke Implementation Engine ─────────────────────────────
    // EWO-034R.1: Check emergency stop before provider invocation
    await assertNotHalted('provider invocation');
    // EWO-034R.1: Renew lock before provider invocation
    if (ewoRef) await renewExecutionLock(ewoRef, config.actor);
    await updateSessionStage(session.id, 'invoke_engine', 'running');
    await recordStage(session.id, 'invoke_engine', 'running', `Invoking ${config.engineId} engine`);
    notify('invoke_engine', 'running', `Invoking ${config.engineId}`);

    const engine = getEngine(config.engineId);
    implementationResult = await engine.invoke(implRequest);

    if (implementationResult.status === 'failed') {
      await recordStage(session.id, 'invoke_engine', 'failed', implementationResult.summary, implementationResult.errors.join('; '));
      throw new Error(`Implementation failed: ${implementationResult.errors.join('; ')}`);
    }

    if (implementationResult.status === 'simulation_complete') {
      await recordStage(session.id, 'invoke_engine', 'failed',
        'Simulation result received — execution cannot proceed to completion',
        'A simulated implementation result was returned. Real implementation is required for production completion.');
      throw new Error('Execution cannot proceed: a simulated implementation result was returned. Real provider execution is required for completion. No files were modified, no build was run, and this must not be treated as implementation success.');
    }

    await recordStage(session.id, 'invoke_engine', 'complete', implementationResult.summary, null, implementationResult.evidence);
    notify('invoke_engine', 'complete', implementationResult.summary);

    // ── Stage 8: Receive Implementation ────────────────────────────────────
    await updateSessionStage(session.id, 'receive_impl', 'running');
    await recordStage(session.id, 'receive_impl', 'running', 'Receiving implementation results');
    notify('receive_impl', 'running', 'Receiving');

    // Update execution with files changed and commit ref
    await supabase
      .from('engineering_executions')
      .update({
        files_changed: implementationResult.filesModified.map(f => f.path),
        commit_ref: implementationResult.commitRef,
        completion_report: {
          status: implementationResult.status,
          summary: implementationResult.summary,
          files: implementationResult.filesModified.map(f => f.path),
          build: implementationResult.buildResult,
          tests: implementationResult.testResults.map(t => ({
            name: t.name,
            status: t.status === 'pass' ? 'passed' : t.status === 'fail' ? 'failed' : 'skipped',
            detail: t.detail,
          })),
          recommendations: [],
          risks: implementationResult.warnings,
          report_body: implementationResult.implementationLog,
        },
      })
      .eq('id', config.executionId);

    await recordStage(session.id, 'receive_impl', 'complete',
      `${implementationResult.filesModified.length} files modified, commit ${implementationResult.commitRef ?? 'none'}`,
      null, { files: implementationResult.filesModified.length, commit: implementationResult.commitRef });
    notify('receive_impl', 'complete', `${implementationResult.filesModified.length} files`);

    // ── Stage 9: Validate Implementation ───────────────────────────────────
    // EWO-034R.1: Check emergency stop before build/test verification
    await assertNotHalted('build/test verification');
    if (ewoRef) await renewExecutionLock(ewoRef, config.actor);
    await updateSessionStage(session.id, 'validate_impl', 'running');
    await recordStage(session.id, 'validate_impl', 'running', 'Validating implementation');
    notify('validate_impl', 'running', 'Validating');

    if (config.autoVerify !== false) {
      verificationOutcome = await runAutomatedVerification(config.executionId, implementationResult);
      if (!verificationOutcome.allPassed) {
        await recordStage(session.id, 'validate_impl', 'failed',
          `Verification failed: ${verificationOutcome.failedGates.join(', ')}`,
          verificationOutcome.details,
          { verification: verificationOutcome });
        throw new Error(`Verification failed: ${verificationOutcome.failedGates.join(', ')}`);
      }
      await recordStage(session.id, 'validate_impl', 'complete',
        `All ${verificationOutcome.totalGates} verification gates passed`,
        null, { verification: verificationOutcome });
      notify('validate_impl', 'complete', `All ${verificationOutcome.totalGates} gates passed`);
    } else {
      await recordStage(session.id, 'validate_impl', 'skipped', 'Verification skipped (manual mode)');
      notify('validate_impl', 'skipped', 'Skipped');
    }

    // ── Stage 10: Record Evidence ──────────────────────────────────────────
    // EWO-034R.1: Check emergency stop before promotion/completion
    await assertNotHalted('promotion/completion');
    await updateSessionStage(session.id, 'record_evidence', 'running');
    await recordStage(session.id, 'record_evidence', 'running', 'Recording implementation evidence');
    notify('record_evidence', 'running', 'Recording evidence');

    // Auto-deploy to staging if configured
    if (config.autoDeployStaging !== false && implementationResult.commitRef) {
      stagingDeployment = await deployToStaging({
        sessionId: session.id,
        executionId: config.executionId,
        targetId: config.targetId,
        commitRef: implementationResult.commitRef,
        actor: config.actor,
      });
    }

    // Record audit trail
    auditRef = await recordExecutionAudit({
      sessionId: session.id,
      executionId: config.executionId,
      ewoRef: ewo.ewo_ref,
      implementationEngine: config.engineId,
      implementationEngineVersion: engine.engineVersion,
      targetPlatform: target.platform,
      targetRepository: target.repository,
      targetBranch: target.staging_branch,
      commitRef: implementationResult.commitRef ?? null,
      verificationSummary: verificationOutcome,
      evidenceSummary: { files: implementationResult.filesModified, logs: implementationResult.implementationLog },
      approvals: { plan: true, review: true, po: true, production: false },
      rollbackEvents: [],
    });

    await recordStage(session.id, 'record_evidence', 'complete',
      `Evidence recorded. Audit: ${auditRef}. Staging: ${stagingDeployment?.status ?? 'skipped'}`,
      null, { audit_ref: auditRef, staging: stagingDeployment?.status });
    notify('record_evidence', 'complete', `Evidence recorded`);

    // Complete session
    await supabase
      .from('execution_sessions')
      .update({
        current_stage: 'record_evidence',
        stage_status: 'complete',
        completed_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    // Transition execution to awaiting PO testing
    await supabase
      .from('engineering_executions')
      .update({
        implementation_status: 'awaiting_po_testing',
        finished_at: new Date().toISOString(),
      })
      .eq('id', config.executionId);

    // EWO-034R.1: Release execution lock on success
    if (ewoRef) {
      await releaseExecutionLock(ewoRef, config.actor);
    }

    return {
      session: await getSession(session.id) ?? session,
      stages: await getSessionStages(session.id),
      implementationResult,
      verificationOutcome,
      stagingDeployment,
      productionDeployment: null,
      auditRef,
      success: true,
      failureReason: null,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const failedStage = await getCurrentStage(session.id);

    // EWO-034R.1: Release execution lock on failure
    if (ewoRef) {
      await releaseExecutionLock(ewoRef, config.actor);
    }

    // EWO-034R.1: If emergency stop caused the halt, record it in the session
    const isEmergencyStop = error.includes('Emergency stop activated');
    if (isEmergencyStop) {
      await supabase
        .from('execution_sessions')
        .update({
          stage_status: 'failed',
          failure_stage: failedStage,
          failure_reason: error,
          is_resumable: false,
        })
        .eq('id', session.id);
    }

    await supabase
      .from('execution_sessions')
      .update({
        stage_status: 'failed',
        failure_stage: failedStage,
        failure_reason: error,
        is_resumable: true,
      })
      .eq('id', session.id);

    await supabase
      .from('engineering_executions')
      .update({
        implementation_status: 'failed',
        failure_reason: error,
        finished_at: new Date().toISOString(),
      })
      .eq('id', config.executionId);

    return {
      session: await getSession(session.id) ?? session,
      stages: await getSessionStages(session.id),
      implementationResult,
      verificationOutcome,
      stagingDeployment,
      productionDeployment,
      auditRef,
      success: false,
      failureReason: error,
    };
  }
}

// ─── Failure Recovery (Req 13) ─────────────────────────────────────────────────

export async function recoverExecution(
  sessionId: string,
  action: 'resume' | 'retry' | 'abort' | 'rollback',
  actor: string,
): Promise<{ recovered: boolean; detail: string }> {
  const session = await getSession(sessionId);
  if (!session) return { recovered: false, detail: 'Session not found' };

  if (action === 'abort') {
    await supabase
      .from('execution_sessions')
      .update({ recovery_action: 'abort', stage_status: 'failed', is_resumable: false, completed_at: new Date().toISOString() })
      .eq('id', sessionId);
    await supabase
      .from('engineering_executions')
      .update({ implementation_status: 'cancelled' })
      .eq('id', session.execution_id);
    return { recovered: true, detail: 'Execution aborted. History preserved.' };
  }

  if (action === 'rollback') {
    const { data: deployment } = await supabase
      .from('execution_deployments')
      .select('id')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (deployment) {
      await rollbackDeployment(deployment.id, 'Manual rollback during recovery', actor);
    }
    await supabase
      .from('execution_sessions')
      .update({ recovery_action: 'rollback', stage_status: 'failed' })
      .eq('id', sessionId);
    return { recovered: true, detail: 'Rollback initiated. History preserved.' };
  }

  if (action === 'resume' || action === 'retry') {
    await supabase
      .from('execution_sessions')
      .update({
        recovery_action: action,
        stage_status: 'pending',
        resumed_at: new Date().toISOString(),
        failure_reason: null,
      })
      .eq('id', sessionId);
    return { recovered: true, detail: `Execution ${action} initiated from failed stage ${session.failure_stage}.` };
  }

  return { recovered: false, detail: 'Unknown recovery action' };
}

// ─── Production Deployment (Req 10) ────────────────────────────────────────────

export async function approveAndDeployToProduction(
  sessionId: string,
  executionId: string,
  targetId: string,
  commitRef: string,
  actor: string,
): Promise<{ deployment: DeploymentResult | null; auditUpdated: boolean }> {
  const deployment = await deployToProduction({
    sessionId,
    executionId,
    targetId,
    commitRef,
    actor,
  });

  // Update audit trail with production approval
  await supabase
    .from('execution_audit_trail')
    .update({
      approvals: { plan: true, review: true, po: true, production: true },
    })
    .eq('session_id', sessionId);

  // Close EWO
  const { data: session } = await supabase
    .from('execution_sessions')
    .select('ewo_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (session?.ewo_id) {
    await supabase
      .from('engineering_work_orders')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', session.ewo_id);
  }

  await supabase
    .from('engineering_executions')
    .update({ implementation_status: 'released' })
    .eq('id', executionId);

  return { deployment, auditUpdated: true };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Resolves affected source components from the EWO and plan text.
 *
 * EWO-033 Defect 2: Previously fell back to `src/lib/executionOrchestrator.ts`
 * when no explicit path was found — an invalid architectural fallback that
 * caused unrelated files to be targeted.
 *
 * Now: returns ONLY explicitly-mentioned file paths. If none are found,
 * returns an empty array. The caller MUST treat an empty result as
 * "component unresolved" and block execution with a governed clarification
 * requirement.
 */
async function inferAffectedComponents(ewo: { ewo_ref: string; title: string; executive_summary?: string }, plan: { executive_summary?: string; title?: string } | null): Promise<string[]> {
  const text = `${ewo.title} ${ewo.executive_summary ?? ''} ${plan?.executive_summary ?? ''} ${plan?.title ?? ''}`;

  // 1. Extract explicit file paths from text
  const pathPattern = /src\/[^\s,)]+\.(ts|tsx|js|jsx|sql|md)/g;
  const explicitMatches = text.match(pathPattern) ?? [];

  if (explicitMatches.length > 0) {
    return Array.from(new Set(explicitMatches));
  }

  // 2. Use the canonical semantic component resolver (EWO-034)
  const resolution = await resolveComponentFromRequest(text);
  if (resolution.resolved && resolution.selected_candidate) {
    return [resolution.selected_candidate.file_path];
  }

  // 3. If clarification required, return empty — do NOT fabricate
  return [];
}

async function getCurrentStage(sessionId: string): Promise<string> {
  const { data } = await supabase
    .from('execution_sessions')
    .select('current_stage')
    .eq('id', sessionId)
    .maybeSingle();
  return data?.current_stage ?? 'unknown';
}

// ─── Query Helpers ────────────────────────────────────────────────────────────

export async function getExecutionTargets() {
  const { data } = await supabase
    .from('execution_targets')
    .select('*')
    .eq('is_active', true)
    .order('platform');
  return data ?? [];
}

export async function getSessionsByStatus(status: string) {
  const { data } = await supabase
    .from('execution_sessions')
    .select('*')
    .eq('stage_status', status)
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function getDeploymentsByEnvironment(env: string) {
  const { data } = await supabase
    .from('execution_deployments')
    .select('*')
    .eq('environment', env)
    .order('created_at', { ascending: false });
  return data ?? [];
}
