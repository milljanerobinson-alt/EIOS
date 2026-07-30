/**
 * Interaction Execution Service — EWO-033R.1 Phase 5
 *
 * When the PO approves the proposal, execution is prepared automatically.
 * When the PO approves execution, the pipeline runs with live progress.
 * Everything happens in-channel — the PO never navigates to a separate page.
 */

import { supabase } from './supabase';
import { validateExecutionReadiness, type ReadinessReport } from './executionReadinessValidator';
import { beginEngineeringExecution } from './executionLaunchService';
import { InteractionLifecycleService } from './interactionLifecycleService';
import type { LifecycleStage, PODecisionType } from './interactionLifecycleService';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ExecutionPreparationResult {
  ready: boolean;
  ewoId: string;
  ewoRef: string;
  provider: string;
  estimatedImpact: string;
  filesAffected: string[];
  validation: string[];
  blockingReasons: string[];
  lifecycleStage: LifecycleStage;
}

export interface ExecutionLaunchResult {
  success: boolean;
  executionId: string | null;
  ewoRef: string;
  error: string | null;
}

export interface ExecutionProgressUpdate {
  stage: string;
  label: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  detail?: string;
}

// ─── EWO-033R.4 Correction 4: Preparation Phases ───────────────────────────────

export type PreparationPhase =
  | 'ewo_verified'
  | 'context_assembled'
  | 'package_generated'
  | 'provider_resolved'
  | 'provider_validated'
  | 'readiness_verified';

export interface PreparationPhaseUpdate {
  phase: PreparationPhase;
  label: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  detail?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
}

export const PREPARATION_PHASES: PreparationPhaseUpdate[] = [
  { phase: 'ewo_verified', label: 'Engineering Work Order verified', status: 'pending' },
  { phase: 'context_assembled', label: 'Engineering context assembled', status: 'pending' },
  { phase: 'package_generated', label: 'Execution package generated', status: 'pending' },
  { phase: 'provider_resolved', label: 'Execution provider resolved', status: 'pending' },
  { phase: 'provider_validated', label: 'Provider validated', status: 'pending' },
  { phase: 'readiness_verified', label: 'Execution readiness verified', status: 'pending' },
];

export interface PreparationDiagnostics {
  phases: PreparationPhaseUpdate[];
  startedAt: string;
  finishedAt: string | null;
  totalDurationMs: number | null;
  success: boolean;
  failedPhase: PreparationPhase | null;
  error: string | null;
  retryCount: number;
}

export interface PrepareExecutionOptions {
  onProgress?: (update: PreparationPhaseUpdate, diagnostics: PreparationDiagnostics) => void;
}

export const EXECUTION_PROGRESS_STAGES: ExecutionProgressUpdate[] = [
  { stage: 'preparing_context', label: 'Preparing Context', status: 'pending' },
  { stage: 'selecting_provider', label: 'Selecting Provider', status: 'pending' },
  { stage: 'executing', label: 'Executing', status: 'pending' },
  { stage: 'running_tests', label: 'Running Tests', status: 'pending' },
  { stage: 'validating', label: 'Validating', status: 'pending' },
  { stage: 'building_completion', label: 'Building Completion Package', status: 'pending' },
];

// ─── Service ────────────────────────────────────────────────────────────────────

export const InteractionExecutionService = {
  /**
   * Prepare execution after proposal approval.
   * Auto-assembles package, resolves provider, evaluates eligibility.
   * EWO-033R.4 Correction 4: Emits progress for each phase with diagnostics.
   */
  async prepareExecution(
    ewoId: string,
    options?: PrepareExecutionOptions,
  ): Promise<ExecutionPreparationResult> {
    const startedAt = new Date().toISOString();
    const phases: PreparationPhaseUpdate[] = PREPARATION_PHASES.map(p => ({ ...p }));
    const diagnostics: PreparationDiagnostics = {
      phases,
      startedAt,
      finishedAt: null,
      totalDurationMs: null,
      success: false,
      failedPhase: null,
      error: null,
      retryCount: 0,
    };

    const emit = (phase: PreparationPhase, status: PreparationPhaseUpdate['status'], detail?: string, error?: string) => {
      const p = phases.find(f => f.phase === phase);
      if (!p) return;
      const now = new Date().toISOString();
      if (status === 'running') p.startedAt = now;
      if (status === 'complete' || status === 'error') {
        p.completedAt = now;
        if (p.startedAt) p.durationMs = new Date(now).getTime() - new Date(p.startedAt).getTime();
      }
      p.status = status;
      p.detail = detail;
      p.error = error;
      options?.onProgress?.(p, { ...diagnostics });
    };

    // ── Phase 1: Verify EWO ──────────────────────────────────────────────────
    emit('ewo_verified', 'running');
    const { data: ewo, error: ewoErr } = await supabase
      .from('engineering_work_orders')
      .select('id, ewo_ref, title, implementation_provider, engineering_package_status')
      .eq('id', ewoId)
      .maybeSingle();

    if (ewoErr || !ewo) {
      const msg = ewoErr?.message ?? 'Engineering Work Order not found';
      emit('ewo_verified', 'error', undefined, msg);
      diagnostics.finishedAt = new Date().toISOString();
      diagnostics.totalDurationMs = new Date(diagnostics.finishedAt).getTime() - new Date(startedAt).getTime();
      diagnostics.failedPhase = 'ewo_verified';
      diagnostics.error = msg;
      return {
        ready: false,
        ewoId,
        ewoRef: '',
        provider: '',
        estimatedImpact: '',
        filesAffected: [],
        validation: [],
        blockingReasons: [msg],
        lifecycleStage: 'blocked',
      };
    }
    emit('ewo_verified', 'complete', `${ewo.ewo_ref} — ${ewo.title}`);

    // ── Phase 2: Assemble engineering context ─────────────────────────────────
    emit('context_assembled', 'running');
    // Context = verify EWO has a linked proposal and idea
    const { data: proposal, error: propErr } = await supabase
      .from('engineering_proposals')
      .select('id, proposal_ref, status')
      .eq('ewo_id', ewoId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (propErr) {
      const msg = `Context assembly failed: ${propErr.message}`;
      emit('context_assembled', 'error', undefined, msg);
      diagnostics.finishedAt = new Date().toISOString();
      diagnostics.totalDurationMs = new Date(diagnostics.finishedAt).getTime() - new Date(startedAt).getTime();
      diagnostics.failedPhase = 'context_assembled';
      diagnostics.error = msg;
      return {
        ready: false,
        ewoId: ewo.id,
        ewoRef: ewo.ewo_ref,
        provider: ewo.implementation_provider ?? 'codex',
        estimatedImpact: ewo.engineering_package_status ?? 'Generated',
        filesAffected: [],
        validation: [],
        blockingReasons: [msg],
        lifecycleStage: 'blocked',
      };
    }
    emit('context_assembled', 'complete', proposal ? `Proposal ${proposal.proposal_ref} linked` : 'No proposal linked');

    // ── Phase 3: Generate execution package ──────────────────────────────────
    emit('package_generated', 'running');
    const { data: pkg, error: pkgErr } = await supabase
      .from('ewo_engineering_packages')
      .select('id, package_status, summary')
      .eq('ewo_id', ewoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pkgErr) {
      const msg = `Package generation failed: ${pkgErr.message}`;
      emit('package_generated', 'error', undefined, msg);
      diagnostics.finishedAt = new Date().toISOString();
      diagnostics.totalDurationMs = new Date(diagnostics.finishedAt).getTime() - new Date(startedAt).getTime();
      diagnostics.failedPhase = 'package_generated';
      diagnostics.error = msg;
      return {
        ready: false,
        ewoId: ewo.id,
        ewoRef: ewo.ewo_ref,
        provider: ewo.implementation_provider ?? 'codex',
        estimatedImpact: ewo.engineering_package_status ?? 'Generated',
        filesAffected: [],
        validation: [],
        blockingReasons: [msg],
        lifecycleStage: 'blocked',
      };
    }
    emit('package_generated', 'complete', pkg ? `Package status: ${pkg.package_status}` : 'No package — will generate on execute');

    // ── Phase 4: Resolve execution provider ─────────────────────────────────
    emit('provider_resolved', 'running');
    const provider = ewo.implementation_provider ?? 'codex';
    emit('provider_resolved', 'complete', `Provider: ${provider}`);

    // ── Phase 5: Validate provider ───────────────────────────────────────────
    emit('provider_validated', 'running');
    // Check that the provider has credentials configured
    const { data: providerConfig, error: providerErr } = await supabase
      .from('ai_provider_configs')
      .select('id, provider, is_enabled')
      .eq('provider', provider)
      .eq('is_enabled', true)
      .limit(1)
      .maybeSingle();

    if (providerErr) {
      // Non-fatal — provider validation is best-effort
      emit('provider_validated', 'complete', 'Provider validation skipped (query error)');
    } else if (providerConfig) {
      emit('provider_validated', 'complete', `Provider ${provider} is active`);
    } else {
      emit('provider_validated', 'complete', `Provider ${provider} not configured — will use default`);
    }

    // ── Phase 6: Verify execution readiness ──────────────────────────────────
    // EWO-033R.4 Correction 9: Use hardened readiness validator. Every query is
    // wrapped in try-catch. No HTTP 400 can crash the flow. Required failures
    // block; warnings never stop execution. A governed report is returned.
    emit('readiness_verified', 'running');
    let readiness: ReadinessReport;
    try {
      readiness = await validateExecutionReadiness(ewoId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit('readiness_verified', 'error', undefined, `Readiness validator crashed: ${msg}`);
      diagnostics.finishedAt = new Date().toISOString();
      diagnostics.totalDurationMs = new Date(diagnostics.finishedAt).getTime() - new Date(startedAt).getTime();
      diagnostics.failedPhase = 'readiness_verified';
      diagnostics.error = `Readiness validator crashed: ${msg}`;
      return {
        ready: false,
        ewoId: ewo.id,
        ewoRef: ewo.ewo_ref,
        provider,
        estimatedImpact: ewo.engineering_package_status ?? 'Generated',
        filesAffected: [],
        validation: [`Readiness validator crashed: ${msg}`],
        blockingReasons: [`Readiness validator crashed: ${msg}`],
        lifecycleStage: 'blocked',
      };
    }

    const blockingReasons = readiness.blockingReasons;

    if (!readiness.eligible) {
      emit('readiness_verified', 'error', undefined, blockingReasons.join('; ') || 'Readiness checks failed');
      diagnostics.finishedAt = new Date().toISOString();
      diagnostics.totalDurationMs = new Date(diagnostics.finishedAt).getTime() - new Date(startedAt).getTime();
      diagnostics.failedPhase = 'readiness_verified';
      diagnostics.error = blockingReasons.join('; ');
    } else {
      const warnCount = readiness.warnings.length;
      emit('readiness_verified', 'complete', warnCount > 0 ? `All required checks passed (${warnCount} warning(s))` : 'All eligibility checks passed');
      diagnostics.finishedAt = new Date().toISOString();
      diagnostics.totalDurationMs = new Date(diagnostics.finishedAt).getTime() - new Date(startedAt).getTime();
      diagnostics.success = true;
    }

    return {
      ready: readiness.eligible,
      ewoId: ewo.id,
      ewoRef: ewo.ewo_ref,
      provider,
      estimatedImpact: ewo.engineering_package_status ?? 'Generated',
      filesAffected: [],
      validation: readiness.eligible
        ? [...readiness.warnings.length ? readiness.warnings : ['All required checks passed']]
        : [...blockingReasons, ...readiness.warnings],
      blockingReasons,
      lifecycleStage: readiness.eligible ? 'awaiting_execution_approval' : 'blocked',
    };
  },

  /**
   * Launch execution after PO approval.
   * Records the PO decision and invokes the execution pipeline.
   */
  async launchExecution(
    ewoId: string,
    options: { userId?: string; onProgress?: (update: ExecutionProgressUpdate) => void },
  ): Promise<ExecutionLaunchResult> {
    // Record the PO execution approval decision
    await InteractionLifecycleService.recordDecision(
      'execution_approval',
      'approved',
      {
        ewoId,
        decidedBy: options.userId,
        lifecycleStageBefore: 'awaiting_execution_approval',
        lifecycleStageAfter: 'executing',
      },
    );

    // Emit progress: preparing context
    options.onProgress?.({ ...EXECUTION_PROGRESS_STAGES[0], status: 'running' });

    try {
      // Emit: selecting provider
      options.onProgress?.({ ...EXECUTION_PROGRESS_STAGES[0], status: 'complete' });
      options.onProgress?.({ ...EXECUTION_PROGRESS_STAGES[1], status: 'running' });

      // Use the existing launch service — this invokes the real orchestrator
      const result = await beginEngineeringExecution(ewoId, {
        onProgress: (update: { stage: string; status: string; detail?: string }) => {
          const stageMap: Record<string, ExecutionProgressUpdate> = {
            load_context: { ...EXECUTION_PROGRESS_STAGES[0], status: 'complete' },
            load_ewo: { ...EXECUTION_PROGRESS_STAGES[0], status: 'complete' },
            load_plan: { ...EXECUTION_PROGRESS_STAGES[0], status: 'complete' },
            prepare_package: { ...EXECUTION_PROGRESS_STAGES[1], status: 'complete' },
            invoke_engine: { ...EXECUTION_PROGRESS_STAGES[2], status: update.status === 'complete' ? 'complete' : 'running' },
            receive_impl: { ...EXECUTION_PROGRESS_STAGES[3], status: update.status === 'complete' ? 'complete' : 'running' },
            validate_impl: { ...EXECUTION_PROGRESS_STAGES[4], status: update.status === 'complete' ? 'complete' : 'running' },
            record_evidence: { ...EXECUTION_PROGRESS_STAGES[5], status: update.status === 'complete' ? 'complete' : 'running' },
          };
          const mapped = stageMap[update.stage];
          if (mapped) options.onProgress?.(mapped);
        },
      });

      options.onProgress?.({ ...EXECUTION_PROGRESS_STAGES[5], status: 'complete' });

      // EWO-033R.4 Correction 8: Capture the execution ID so the adapter can
      // assemble the completion package. beginEngineeringExecution returns
      // executionRef (human-readable) but not the database UUID. Query for it.
      let executionId: string | null = null;
      if (result.success) {
        const { data: execRow } = await supabase
          .from('engineering_executions')
          .select('id')
          .eq('ewo_id', ewoId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        executionId = execRow?.id ?? null;
      }

      return {
        success: result.success,
        executionId,
        ewoRef: result.executionRef ?? '',
        error: result.error,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      options.onProgress?.({ ...EXECUTION_PROGRESS_STAGES[2], status: 'error', detail: msg });
      return {
        success: false,
        executionId: null,
        ewoRef: '',
        error: msg,
      };
    }
  },
};
