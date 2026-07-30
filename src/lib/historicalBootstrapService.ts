// EWO-023R.1R.2: Historical Engineering Bootstrap & Execution Governance
//
// Reference implementation of Engineering Standard ES-004 — Progressive
// Execution Visibility. Governed one-time bootstrap of all historical
// engineering artefacts into the existing Engineering Records Library.
// Extends existing Memory (engineering_memory) and Lineage
// (engineering_record_lineage) capabilities rather than introducing
// parallel repositories. Features live phase tracking, heartbeat, failure
// governance, concurrency protection, and safe retry.

import { supabase } from './supabase';
import { checkRecordHealth } from './engineeringRecordsOrchestrator';
import { recordChangeLogEvent } from './engineeringChangeLogService';

// ─── Types ───────────────────────────────────────────────────────────────────

export type BootstrapStatus =
  | 'queued' | 'starting' | 'running' | 'completed' | 'failed'
  | 'cancelled' | 'abandoned';

export interface BootstrapResult {
  run_id: string;
  status: 'completed' | 'failed';
  artefacts_discovered: number;
  artefacts_imported: number;
  artefacts_skipped: number;
  relationships_reconstructed: number;
  health_issues_detected: number;
  memory_entries_prepared: number;
  runtime_seconds: number;
  errors: string[];
}

export interface BootstrapRun {
  id: string;
  run_id: string;
  status: string;
  artefacts_discovered: number;
  artefacts_imported: number;
  artefacts_skipped: number;
  relationships_reconstructed: number;
  health_issues_detected: number;
  draft_packages_prepared: number;
  started_at: string;
  completed_at: string | null;
  runtime_seconds: number | null;
  current_phase: string | null;
  phase_progress: Record<string, { discovered: number; imported: number; skipped: number; failed: number }> | null;
  heartbeat_at: string | null;
  failed_phase: string | null;
  failure_reason: string | null;
  diagnostics: Record<string, unknown> | null;
}

interface PhaseResult {
  discovered: number;
  imported: number;
  skipped: number;
  failed: number;
  error?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = ['queued', 'starting', 'running'];
const HEARTBEAT_INTERVAL_MS = 2000;

// ─── Canonical Phase Definitions (ES-004) ───────────────────────────────────

export const BOOTSTRAP_PHASES = [
  { key: 'phase1_ewos',              label: 'Phase 1 — EWOs' },
  { key: 'phase2_completion_reports', label: 'Phase 2 — Completion Reports' },
  { key: 'phase3_packages',         label: 'Phase 3 — Engineering Packages' },
  { key: 'phase4_change_log',       label: 'Phase 4 — Change Log' },
  { key: 'phase5_timeline',         label: 'Phase 5 — Timeline' },
  { key: 'phase6_standards',        label: 'Phase 6 — Standards' },
  { key: 'phase7_constitutional',   label: 'Phase 7 — Constitutional Decisions' },
  { key: 'phase8_historical_refs',  label: 'Phase 8 — Historical References' },
  { key: 'phase9_verifications',    label: 'Phase 9 — Verifications' },
  { key: 'phase10_lineage',         label: 'Phase 10 — Lineage Reconstruction' },
  { key: 'phase11_health',          label: 'Phase 11 — Health Validation' },
  { key: 'phase12_memory',          label: 'Phase 12 — Memory Preparation' },
] as const;

// ─── Main Bootstrap Entry Point ──────────────────────────────────────────────

export async function runHistoricalBootstrap(): Promise<BootstrapResult> {
  const runId = `BOOTSTRAP-${Date.now()}`;
  const startTime = Date.now();
  const errors: string[] = [];

  let artefactsDiscovered = 0;
  let artefactsImported = 0;
  let artefactsSkipped = 0;
  let relationshipsReconstructed = 0;
  let healthIssuesDetected = 0;
  let memoryEntriesPrepared = 0;

  const phaseProgress: Record<string, { discovered: number; imported: number; skipped: number; failed: number }> = {};

  // ─── Concurrency check ──────────────────────────────────────────────────────
  const { data: activeRun } = await supabase
    .from('historical_bootstrap_runs')
    .select('run_id')
    .in('status', ACTIVE_STATUSES)
    .limit(1)
    .maybeSingle();

  if (activeRun) {
    return {
      run_id: '',
      status: 'failed',
      artefacts_discovered: 0,
      artefacts_imported: 0,
      artefacts_skipped: 0,
      relationships_reconstructed: 0,
      health_issues_detected: 0,
      memory_entries_prepared: 0,
      runtime_seconds: 0,
      errors: [`Another bootstrap is already active: ${activeRun.run_id}. Use recovery options before retrying.`],
    };
  }

  // ─── Create bootstrap run record (status: queued) ────────────────────────────
  const { error: createError } = await supabase.from('historical_bootstrap_runs').insert({
    run_id: runId,
    status: 'queued' as BootstrapStatus,
    started_at: new Date().toISOString(),
  });

  if (createError) {
    return {
      run_id: '',
      status: 'failed',
      artefacts_discovered: 0,
      artefacts_imported: 0,
      artefacts_skipped: 0,
      relationships_reconstructed: 0,
      health_issues_detected: 0,
      memory_entries_prepared: 0,
      runtime_seconds: 0,
      errors: [`Failed to create bootstrap run: ${createError.message}`],
    };
  }

  // Transition to starting
  await updateRunStatus(runId, 'starting');

  // Generate Engineering Record for bootstrap start
  await generateBootstrapEngineeringRecord(runId, 'started');

  try {
    // Transition to running
    await updateRunStatus(runId, 'running');

    // ─── Phase 1: Discover and import EWOs ─────────────────────────────────────
    await updatePhase(runId, 'phase1_ewos', phaseProgress);
    const ewoResult = await bootstrapEWOs(runId);
    phaseProgress['phase1_ewos'] = { discovered: ewoResult.discovered, imported: ewoResult.imported, skipped: ewoResult.skipped, failed: 0 };
    artefactsDiscovered += ewoResult.discovered;
    artefactsImported += ewoResult.imported;
    artefactsSkipped += ewoResult.skipped;
    if (ewoResult.error) errors.push(`Phase 1: ${ewoResult.error}`);
    if (ewoResult.skipped > 0) await recordDiagnostic(runId, 'phase1_ewos', 'info', `${ewoResult.skipped} records skipped (already exist or insert failed)`);
    await heartbeat(runId, 'phase1_ewos', phaseProgress);

    // ─── Phase 2: Completion Reports ──────────────────────────────────────────
    await updatePhase(runId, 'phase2_completion_reports', phaseProgress);
    const crResult = await bootstrapCompletionReports(runId);
    phaseProgress['phase2_completion_reports'] = { discovered: crResult.discovered, imported: crResult.imported, skipped: crResult.skipped, failed: 0 };
    artefactsDiscovered += crResult.discovered;
    artefactsImported += crResult.imported;
    artefactsSkipped += crResult.skipped;
    if (crResult.error) errors.push(`Phase 2: ${crResult.error}`);
    if (crResult.skipped > 0) await recordDiagnostic(runId, 'phase2_completion_reports', 'info', `${crResult.skipped} completion reports skipped (already exist or insert failed)`);
    await heartbeat(runId, 'phase2_completion_reports', phaseProgress);

    // ─── Phase 3: Engineering Packages ────────────────────────────────────────
    await updatePhase(runId, 'phase3_packages', phaseProgress);
    const pkgResult = await bootstrapEngineeringPackages(runId);
    phaseProgress['phase3_packages'] = { discovered: pkgResult.discovered, imported: pkgResult.imported, skipped: pkgResult.skipped, failed: 0 };
    artefactsDiscovered += pkgResult.discovered;
    artefactsImported += pkgResult.imported;
    artefactsSkipped += pkgResult.skipped;
    if (pkgResult.error) errors.push(`Phase 3: ${pkgResult.error}`);
    if (pkgResult.skipped > 0) await recordDiagnostic(runId, 'phase3_packages', 'info', `${pkgResult.skipped} engineering packages skipped (already exist or insert failed)`);
    await heartbeat(runId, 'phase3_packages', phaseProgress);

    // ─── Phase 4: Change Log entries ───────────────────────────────────────────
    await updatePhase(runId, 'phase4_change_log', phaseProgress);
    const clResult = await bootstrapChangeLogEntries(runId);
    phaseProgress['phase4_change_log'] = { discovered: clResult.discovered, imported: clResult.imported, skipped: clResult.skipped, failed: 0 };
    artefactsDiscovered += clResult.discovered;
    artefactsImported += clResult.imported;
    artefactsSkipped += clResult.skipped;
    if (clResult.error) errors.push(`Phase 4: ${clResult.error}`);
    if (clResult.skipped > 0) await recordDiagnostic(runId, 'phase4_change_log', 'info', `${clResult.skipped} change log entries skipped (already exist or insert failed)`);
    await heartbeat(runId, 'phase4_change_log', phaseProgress);

    // ─── Phase 5: Timeline events ──────────────────────────────────────────────
    await updatePhase(runId, 'phase5_timeline', phaseProgress);
    const tlResult = await bootstrapTimelineEvents(runId);
    phaseProgress['phase5_timeline'] = { discovered: tlResult.discovered, imported: tlResult.imported, skipped: tlResult.skipped, failed: 0 };
    artefactsDiscovered += tlResult.discovered;
    artefactsImported += tlResult.imported;
    artefactsSkipped += tlResult.skipped;
    if (tlResult.error) errors.push(`Phase 5: ${tlResult.error}`);
    if (tlResult.skipped > 0) await recordDiagnostic(runId, 'phase5_timeline', 'info', `${tlResult.skipped} timeline events skipped (already exist or insert failed)`);
    await heartbeat(runId, 'phase5_timeline', phaseProgress);

    // ─── Phase 6: Engineering Standards ───────────────────────────────────────
    await updatePhase(runId, 'phase6_standards', phaseProgress);
    const stdResult = await bootstrapEngineeringStandards(runId);
    phaseProgress['phase6_standards'] = { discovered: stdResult.discovered, imported: stdResult.imported, skipped: stdResult.skipped, failed: 0 };
    artefactsDiscovered += stdResult.discovered;
    artefactsImported += stdResult.imported;
    artefactsSkipped += stdResult.skipped;
    if (stdResult.error) errors.push(`Phase 6: ${stdResult.error}`);
    if (stdResult.skipped > 0) await recordDiagnostic(runId, 'phase6_standards', 'info', `${stdResult.skipped} engineering standards skipped (already exist or insert failed)`);
    await heartbeat(runId, 'phase6_standards', phaseProgress);

    // ─── Phase 7: Constitutional Decisions ─────────────────────────────────────
    await updatePhase(runId, 'phase7_constitutional', phaseProgress);
    const conResult = await bootstrapConstitutionalDecisions(runId);
    phaseProgress['phase7_constitutional'] = { discovered: conResult.discovered, imported: conResult.imported, skipped: conResult.skipped, failed: 0 };
    artefactsDiscovered += conResult.discovered;
    artefactsImported += conResult.imported;
    artefactsSkipped += conResult.skipped;
    if (conResult.error) errors.push(`Phase 7: ${conResult.error}`);
    if (conResult.skipped > 0) await recordDiagnostic(runId, 'phase7_constitutional', 'info', `${conResult.skipped} constitutional decisions skipped (already exist or insert failed)`);
    await heartbeat(runId, 'phase7_constitutional', phaseProgress);

    // ─── Phase 8: Historical References ─────────────────────────────────────────
    await updatePhase(runId, 'phase8_historical_refs', phaseProgress);
    const hrResult = await bootstrapHistoricalReferences(runId);
    phaseProgress['phase8_historical_refs'] = { discovered: hrResult.discovered, imported: hrResult.imported, skipped: hrResult.skipped, failed: 0 };
    artefactsDiscovered += hrResult.discovered;
    artefactsImported += hrResult.imported;
    artefactsSkipped += hrResult.skipped;
    if (hrResult.error) errors.push(`Phase 8: ${hrResult.error}`);
    if (hrResult.skipped > 0) await recordDiagnostic(runId, 'phase8_historical_refs', 'info', `${hrResult.skipped} historical references skipped (already exist or insert failed)`);
    await heartbeat(runId, 'phase8_historical_refs', phaseProgress);

    // ─── Phase 9: Verifications ────────────────────────────────────────────────
    await updatePhase(runId, 'phase9_verifications', phaseProgress);
    const verResult = await bootstrapVerifications(runId);
    phaseProgress['phase9_verifications'] = { discovered: verResult.discovered, imported: verResult.imported, skipped: verResult.skipped, failed: 0 };
    artefactsDiscovered += verResult.discovered;
    artefactsImported += verResult.imported;
    artefactsSkipped += verResult.skipped;
    if (verResult.error) errors.push(`Phase 9: ${verResult.error}`);
    if (verResult.skipped > 0) await recordDiagnostic(runId, 'phase9_verifications', 'info', `${verResult.skipped} verifications skipped (already exist or insert failed)`);
    await heartbeat(runId, 'phase9_verifications', phaseProgress);

    // ─── Phase 10: Reconstruct Lineage ─────────────────────────────────────────
    await updatePhase(runId, 'phase10_lineage', phaseProgress);
    const relResult = await reconstructLineage(runId);
    phaseProgress['phase10_lineage'] = { discovered: 0, imported: relResult.reconstructed, skipped: 0, failed: 0 };
    relationshipsReconstructed = relResult.reconstructed;
    if (relResult.error) errors.push(`Phase 10: ${relResult.error}`);
    await heartbeat(runId, 'phase10_lineage', phaseProgress);

    // ─── Phase 11: Health validation ──────────────────────────────────────────
    await updatePhase(runId, 'phase11_health', phaseProgress);
    const healthResult = await runHistoricalHealthValidation();
    phaseProgress['phase11_health'] = { discovered: 0, imported: 0, skipped: 0, failed: healthResult.issues };
    healthIssuesDetected = healthResult.issues;
    if (healthResult.error) errors.push(`Phase 11: ${healthResult.error}`);
    if (healthResult.issues > 0) await recordDiagnostic(runId, 'phase11_health', 'warning', `${healthResult.issues} health issues detected during record validation`, { retryGuidance: 'Review health alerts in the Records Library and address missing artefacts.' });
    await heartbeat(runId, 'phase11_health', phaseProgress);

    // ─── Phase 12: Prepare Memory entries ──────────────────────────────────────
    await updatePhase(runId, 'phase12_memory', phaseProgress);
    const memResult = await prepareMemoryEntries(runId);
    phaseProgress['phase12_memory'] = { discovered: memResult.discovered, imported: memResult.prepared, skipped: memResult.skipped, failed: 0 };
    memoryEntriesPrepared = memResult.prepared;
    if (memResult.error) errors.push(`Phase 12: ${memResult.error}`);
    if (memResult.skipped > 0) await recordDiagnostic(runId, 'phase12_memory', 'info', `${memResult.skipped} memory entries skipped (already exist or no summary available)`);
    await heartbeat(runId, 'phase12_memory', phaseProgress);

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    errors.push(errMsg);

    // ─── Failure governance ──────────────────────────────────────────────────
    const currentPhase = Object.keys(phaseProgress).pop() ?? 'unknown';
    await supabase.from('historical_bootstrap_runs').update({
      status: 'failed' as BootstrapStatus,
      failed_phase: currentPhase,
      failure_reason: errMsg,
      diagnostics: { errors, phaseProgress },
      completed_at: new Date().toISOString(),
      runtime_seconds: Math.round((Date.now() - startTime) / 1000),
      phase_progress: phaseProgress,
    }).eq('run_id', runId);

    await generateBootstrapEngineeringRecord(runId, 'failed', { failed_phase: currentPhase, failure_reason: errMsg });

    await recordDiagnostic(runId, currentPhase, 'error', `Bootstrap failed at ${currentPhase}: ${errMsg}`, {
      technicalMessage: errMsg,
      retryGuidance: 'Retry the bootstrap. Previous records are preserved — the bootstrap is idempotent and will skip already-imported records.',
    });

    await recordChangeLogEvent({
      change_type: 'created',
      object_type: 'historical_bootstrap',
      object_ref: runId,
      ewo_ref: 'EWO-023R.1R.1',
      summary: `Historical bootstrap FAILED at ${currentPhase}: ${errMsg}`,
      description: `Bootstrap run ${runId} failed. ${artefactsImported} imported before failure.`,
      actor_type: 'system',
      actor: 'Historical Engineering Bootstrap Service',
      metadata: { run_id: runId, failed_phase: currentPhase, errors },
    });

    return {
      run_id: runId,
      status: 'failed',
      artefacts_discovered: artefactsDiscovered,
      artefacts_imported: artefactsImported,
      artefacts_skipped: artefactsSkipped,
      relationships_reconstructed: relationshipsReconstructed,
      health_issues_detected: healthIssuesDetected,
      memory_entries_prepared: memoryEntriesPrepared,
      runtime_seconds: Math.round((Date.now() - startTime) / 1000),
      errors,
    };
  }

  const runtimeSeconds = Math.round((Date.now() - startTime) / 1000);

  // ─── Completion ──────────────────────────────────────────────────────────────
  await supabase.from('historical_bootstrap_runs').update({
    status: 'completed' as BootstrapStatus,
    artefacts_discovered: artefactsDiscovered,
    artefacts_imported: artefactsImported,
    artefacts_skipped: artefactsSkipped,
    relationships_reconstructed: relationshipsReconstructed,
    health_issues_detected: healthIssuesDetected,
    draft_packages_prepared: memoryEntriesPrepared,
    completed_at: new Date().toISOString(),
    runtime_seconds: runtimeSeconds,
    phase_progress: phaseProgress,
    current_phase: null,
  }).eq('run_id', runId);

  await generateBootstrapEngineeringRecord(runId, 'completed', {
    artefacts_imported: artefactsImported,
    artefacts_skipped: artefactsSkipped,
    relationships: relationshipsReconstructed,
    memory_entries: memoryEntriesPrepared,
  });

  await recordChangeLogEvent({
    change_type: 'created',
    object_type: 'historical_bootstrap',
    object_ref: runId,
    ewo_ref: 'EWO-023R.1R.1',
    summary: `Historical bootstrap completed: ${artefactsImported} imported, ${artefactsSkipped} skipped, ${relationshipsReconstructed} lineage links, ${memoryEntriesPrepared} memory entries`,
    description: `Bootstrap run ${runId}. Discovered ${artefactsDiscovered}, imported ${artefactsImported}, skipped ${artefactsSkipped}.`,
    actor_type: 'system',
    actor: 'Historical Engineering Bootstrap Service',
    metadata: { run_id: runId, errors },
  });

  // Record completion warning diagnostics if there were errors
  if (errors.length > 0) {
    await recordDiagnostic(runId, 'completion', 'warning', `Bootstrap completed with ${errors.length} warning(s)`, {
      technicalMessage: errors.join('; '),
      retryGuidance: 'Review the warnings above. The bootstrap completed successfully but some phases reported issues.',
    });
  }

  return {
    run_id: runId,
    status: 'completed',
    artefacts_discovered: artefactsDiscovered,
    artefacts_imported: artefactsImported,
    artefacts_skipped: artefactsSkipped,
    relationships_reconstructed: relationshipsReconstructed,
    health_issues_detected: healthIssuesDetected,
    memory_entries_prepared: memoryEntriesPrepared,
    runtime_seconds: runtimeSeconds,
    errors,
  };
}

// ─── Recovery Functions ──────────────────────────────────────────────────────

export async function abandonBootstrapRun(runId: string): Promise<void> {
  await supabase.from('historical_bootstrap_runs').update({
    status: 'abandoned' as BootstrapStatus,
    completed_at: new Date().toISOString(),
    failure_reason: 'Manually abandoned by operator',
    diagnostics: { abandoned_at: new Date().toISOString() },
  }).eq('run_id', runId);

  await generateBootstrapEngineeringRecord(runId, 'abandoned');
}

export async function cancelBootstrapRun(runId: string): Promise<void> {
  await supabase.from('historical_bootstrap_runs').update({
    status: 'cancelled' as BootstrapStatus,
    completed_at: new Date().toISOString(),
  }).eq('run_id', runId);

  await generateBootstrapEngineeringRecord(runId, 'cancelled');
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

async function updateRunStatus(runId: string, status: BootstrapStatus): Promise<void> {
  await supabase.from('historical_bootstrap_runs').update({
    status,
    heartbeat_at: new Date().toISOString(),
  }).eq('run_id', runId);
}

async function updatePhase(
  runId: string,
  phase: string,
  phaseProgress: Record<string, { discovered: number; imported: number; skipped: number; failed: number }>,
): Promise<void> {
  await supabase.from('historical_bootstrap_runs').update({
    current_phase: phase,
    heartbeat_at: new Date().toISOString(),
    phase_progress: phaseProgress,
  }).eq('run_id', runId);
}

async function heartbeat(
  runId: string,
  phase: string,
  phaseProgress: Record<string, { discovered: number; imported: number; skipped: number; failed: number }>,
): Promise<void> {
  await supabase.from('historical_bootstrap_runs').update({
    heartbeat_at: new Date().toISOString(),
    current_phase: phase,
    phase_progress: phaseProgress,
  }).eq('run_id', runId);
}

async function generateBootstrapEngineeringRecord(
  runId: string,
  eventType: 'started' | 'completed' | 'failed' | 'retried' | 'reconciled' | 'abandoned' | 'cancelled',
  extra?: Record<string, unknown>,
): Promise<void> {
  const recordRef = `BOOTSTRAP-${runId}-${eventType.toUpperCase()}`;
  const { data: existing } = await supabase
    .from('engineering_records_library')
    .select('id')
    .eq('record_ref', recordRef)
    .maybeSingle();

  if (existing) return;

  await supabase.from('engineering_records_library').insert({
    record_ref: recordRef,
    record_type: 'timeline_snapshot',
    title: `Historical Bootstrap ${eventType} — ${runId}`,
    ewo_ref: 'EWO-023R.1R.1',
    status: eventType === 'completed' ? 'accepted' : 'generated',
    orchestrator_status: 'generated',
    orchestrator_generated: false,
    is_backfill: true,
    content: {
      bootstrap_run_id: runId,
      event_type: eventType,
      ...extra,
    },
    version_number: 1,
    record_version: 1,
    generated_by: 'Historical Engineering Bootstrap Service',
    governance_status: 'complete',
    knowledge_extracted: false,
    lineage_established: false,
    exports_generated: false,
    linked_releases: [],
    linked_standards: [],
    reconciliation_source: 'historical_bootstrap',
  });
}

async function recordDiagnostic(
  runId: string,
  phase: string,
  severity: 'error' | 'warning' | 'info',
  userMessage: string,
  opts?: {
    recordRef?: string;
    recordType?: string;
    technicalMessage?: string;
    retryGuidance?: string;
  },
): Promise<void> {
  await supabase.from('historical_bootstrap_diagnostics').insert({
    run_id: runId,
    phase,
    phase_label: BOOTSTRAP_PHASES.find(p => p.key === phase)?.label ?? phase,
    severity,
    record_ref: opts?.recordRef ?? null,
    record_type: opts?.recordType ?? null,
    user_message: userMessage,
    technical_message: opts?.technicalMessage ?? null,
    retry_guidance: opts?.retryGuidance ?? null,
  });
}

// ─── Phase 1: Bootstrap EWOs ──────────────────────────────────────────────────

async function bootstrapEWOs(runId: string): Promise<PhaseResult> {
  const { data: ewos, error } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, executive_summary, status, implementation_source, originating_prompt_ref, refinement_chain, refinement_depth, parent_ref, created_by, created_at, po_accepted_at, po_accepted_by, po_acceptance_statement, implementation_status')
    .order('created_at', { ascending: true });

  if (error) return { discovered: 0, imported: 0, skipped: 0, failed: 0, error: error.message };
  if (!ewos || ewos.length === 0) return { discovered: 0, imported: 0, skipped: 0, failed: 0 };

  let imported = 0, skipped = 0, failed = 0;

  for (const ewo of ewos as Array<Record<string, unknown>>) {
    const ewoRef = ewo.ewo_ref as string;
    const recordRef = `${ewoRef}-PROMPT`;

    const { data: existing } = await supabase
      .from('engineering_records_library')
      .select('id')
      .eq('record_ref', recordRef)
      .maybeSingle();

    if (existing) { skipped++; continue; }

    const { error: insertError } = await supabase
      .from('engineering_records_library')
      .insert({
        record_ref: recordRef, record_type: 'prompt',
        title: `Engineering Prompt — ${ewoRef}`,
        ewo_id: ewo.id as string, ewo_ref: ewoRef,
        status: 'generated', orchestrator_status: 'generated',
        orchestrator_generated: false, is_backfill: true,
        content: {
          ewo_ref: ewoRef,
          prompt_ref: (ewo.originating_prompt_ref as string) ?? `${ewoRef}-prompt`,
          implementation_source: (ewo.implementation_source as string) ?? 'unknown',
          executive_summary: (ewo.executive_summary as string) ?? '',
        },
        version_number: 1, record_version: 1,
        generated_by: (ewo.created_by as string) ?? 'Historical Bootstrap',
        governance_status: 'complete', knowledge_extracted: false,
        lineage_established: false, exports_generated: false,
        linked_releases: [], linked_standards: [],
        implementation_source: (ewo.implementation_source as string) ?? null,
        parent_refinement_ref: (ewo.parent_ref as string) ?? null,
        reconciliation_source: 'historical_bootstrap',
      });

    if (insertError) { skipped++; } else { imported++; }
  }

  return { discovered: ewos.length, imported, skipped, failed };
}

// ─── Phase 2: Bootstrap Completion Reports ────────────────────────────────────

async function bootstrapCompletionReports(runId: string): Promise<PhaseResult> {
  const { data: reports, error } = await supabase
    .from('ewo_completion_reports')
    .select('id, ewo_id, ewo_ref, title, executive_summary, scope_completed, files_modified, database_changes, engineering_objects, ui_components, lifecycle_summary, validation_results, build_result, risks, po_decisions, acceptance_recommendation, generated_at, accepted_at, accepted_by, report_body, created_at')
    .order('created_at', { ascending: true });

  if (error) return { discovered: 0, imported: 0, skipped: 0, failed: 0, error: error.message };
  if (!reports || reports.length === 0) return { discovered: 0, imported: 0, skipped: 0, failed: 0 };

  let imported = 0, skipped = 0;

  for (const report of reports as Array<Record<string, unknown>>) {
    const ewoRef = report.ewo_ref as string;
    const recordRef = `${ewoRef}-COMPLETION_REPORT`;

    const { data: existing } = await supabase
      .from('engineering_records_library')
      .select('id').eq('record_ref', recordRef).maybeSingle();

    if (existing) { skipped++; continue; }

    const { error: insertError } = await supabase
      .from('engineering_records_library')
      .insert({
        record_ref: recordRef, record_type: 'completion_report',
        title: (report.title as string) ?? `Completion Report — ${ewoRef}`,
        ewo_id: report.ewo_id as string, ewo_ref: ewoRef,
        status: (report.accepted_at ? 'accepted' : 'generated'),
        orchestrator_status: (report.accepted_at ? 'accepted' : 'generated'),
        orchestrator_generated: false, is_backfill: true,
        content: {
          ewo_ref: ewoRef, title: (report.title as string) ?? '',
          executive_summary: (report.executive_summary as string) ?? '',
          scope_completed: (report.scope_completed as string) ?? '',
          files_modified: report.files_modified ?? [],
          database_changes: report.database_changes ?? [],
          engineering_objects: report.engineering_objects ?? [],
          ui_components: report.ui_components ?? [],
          lifecycle_summary: (report.lifecycle_summary as string) ?? '',
          validation_results: (report.validation_results as string) ?? '',
          build_result: (report.build_result as string) ?? '',
          risks: (report.risks as string) ?? '',
          po_decisions: (report.po_decisions as string) ?? '',
          acceptance_recommendation: (report.acceptance_recommendation as string) ?? '',
          report_body: (report.report_body as string) ?? '',
        },
        version_number: 1, record_version: 1,
        generated_by: 'Historical Bootstrap',
        governance_status: 'complete', knowledge_extracted: false,
        lineage_established: false, exports_generated: false,
        linked_releases: [], linked_standards: [],
        po_accepted_at: (report.accepted_at as string) ?? null,
        po_accepted_by: (report.accepted_by as string) ?? null,
        reconciliation_source: 'historical_bootstrap',
      });

    if (insertError) { skipped++; } else { imported++; }
  }

  return { discovered: reports.length, imported, skipped, failed: 0 };
}

// ─── Phase 3: Bootstrap Engineering Packages ──────────────────────────────────

async function bootstrapEngineeringPackages(runId: string): Promise<PhaseResult> {
  const { data: packages, error } = await supabase
    .from('ewo_engineering_packages')
    .select('id, ewo_id, version, package_status, summary, engineering_objectives, implementation_scope, acceptance_criteria, relevant_standards, implementation_notes, expected_deliverables, verification_requirements, completion_requirements, constitutional_references, constraints, package_body, generated_at, created_at')
    .order('created_at', { ascending: true });

  if (error) return { discovered: 0, imported: 0, skipped: 0, failed: 0, error: error.message };
  if (!packages || packages.length === 0) return { discovered: 0, imported: 0, skipped: 0, failed: 0 };

  let imported = 0, skipped = 0;

  const { data: allEwos } = await supabase
    .from('engineering_work_orders').select('id, ewo_ref');
  const ewoRefMap = new Map<string, string>();
  for (const ewo of (allEwos ?? []) as Array<Record<string, unknown>>) {
    ewoRefMap.set(ewo.id as string, ewo.ewo_ref as string);
  }

  for (const pkg of packages as Array<Record<string, unknown>>) {
    const ewoId = pkg.ewo_id as string;
    const ewoRef = ewoRefMap.get(ewoId) ?? 'UNKNOWN';
    const version = pkg.version as number ?? 1;
    const recordRef = `${ewoRef}-PACKAGE-v${version}`;

    const { data: existing } = await supabase
      .from('engineering_records_library')
      .select('id').eq('record_ref', recordRef).maybeSingle();

    if (existing) { skipped++; continue; }

    const { error: insertError } = await supabase
      .from('engineering_records_library')
      .insert({
        record_ref: recordRef, record_type: 'engineering_package',
        title: `Engineering Package — ${ewoRef} v${version}`,
        ewo_id: ewoId, ewo_ref: ewoRef,
        status: (pkg.package_status as string) ?? 'generated',
        orchestrator_status: (pkg.package_status as string) ?? 'generated',
        orchestrator_generated: false, is_backfill: true,
        content: {
          ewo_ref: ewoRef, version,
          summary: (pkg.summary as string) ?? '',
          engineering_objectives: (pkg.engineering_objectives as string) ?? '',
          implementation_scope: (pkg.implementation_scope as string) ?? '',
          acceptance_criteria: (pkg.acceptance_criteria as string) ?? '',
          relevant_standards: (pkg.relevant_standards as string) ?? '',
          implementation_notes: (pkg.implementation_notes as string) ?? '',
          expected_deliverables: (pkg.expected_deliverables as string) ?? '',
          verification_requirements: (pkg.verification_requirements as string) ?? '',
          completion_requirements: (pkg.completion_requirements as string) ?? '',
          constitutional_references: pkg.constitutional_references ?? [],
          constraints: (pkg.constraints as string) ?? '',
          package_body: (pkg.package_body as string) ?? '',
        },
        version_number: version, record_version: 1,
        generated_by: 'Historical Bootstrap',
        governance_status: 'complete', knowledge_extracted: false,
        lineage_established: false, exports_generated: false,
        linked_releases: [], linked_standards: [],
        reconciliation_source: 'historical_bootstrap',
      });

    if (insertError) { skipped++; } else { imported++; }
  }

  return { discovered: packages.length, imported, skipped, failed: 0 };
}

// ─── Phase 4: Bootstrap Change Log Entries ───────────────────────────────────

async function bootstrapChangeLogEntries(runId: string): Promise<PhaseResult> {
  const { data: entries, error } = await supabase
    .from('engineering_change_log')
    .select('id, change_ref, change_type, ewo_ref, object_type, object_ref, summary, description, actor_type, actor, created_at')
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) return { discovered: 0, imported: 0, skipped: 0, failed: 0, error: error.message };
  if (!entries || entries.length === 0) return { discovered: 0, imported: 0, skipped: 0, failed: 0 };

  let imported = 0, skipped = 0;

  for (const entry of entries as Array<Record<string, unknown>>) {
    const ewoRef = (entry.ewo_ref as string) ?? 'UNKNOWN';
    const changeRef = (entry.change_ref as string) ?? `ECL-${entry.id}`;
    const recordRef = `${changeRef}-CHANGELOG`;

    const { data: existing } = await supabase
      .from('engineering_records_library')
      .select('id').eq('record_ref', recordRef).maybeSingle();

    if (existing) { skipped++; continue; }

    const { error: insertError } = await supabase
      .from('engineering_records_library')
      .insert({
        record_ref: recordRef, record_type: 'change_log_entry',
        title: `Change Log — ${(entry.summary as string) ?? changeRef}`,
        ewo_ref: ewoRef !== 'UNKNOWN' ? ewoRef : null,
        status: 'generated', orchestrator_status: 'generated',
        orchestrator_generated: false, is_backfill: true,
        content: {
          change_ref: changeRef, change_type: (entry.change_type as string) ?? '',
          ewo_ref: ewoRef, object_type: (entry.object_type as string) ?? '',
          object_ref: (entry.object_ref as string) ?? '',
          summary: (entry.summary as string) ?? '',
          description: (entry.description as string) ?? '',
          actor_type: (entry.actor_type as string) ?? '',
          actor: (entry.actor as string) ?? '',
        },
        version_number: 1, record_version: 1,
        generated_by: (entry.actor as string) ?? 'Historical Bootstrap',
        governance_status: 'complete', knowledge_extracted: false,
        lineage_established: false, exports_generated: false,
        linked_releases: [], linked_standards: [],
        reconciliation_source: 'historical_bootstrap',
      });

    if (insertError) { skipped++; } else { imported++; }
  }

  return { discovered: entries.length, imported, skipped, failed: 0 };
}

// ─── Phase 5: Bootstrap Timeline Events ──────────────────────────────────────

async function bootstrapTimelineEvents(runId: string): Promise<PhaseResult> {
  const { data: events, error } = await supabase
    .from('ewo_lifecycle_events')
    .select('id, ewo_id, from_status, to_status, actor, notes, created_at')
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) return { discovered: 0, imported: 0, skipped: 0, failed: 0, error: error.message };
  if (!events || events.length === 0) return { discovered: 0, imported: 0, skipped: 0, failed: 0 };

  const { data: allEwos } = await supabase
    .from('engineering_work_orders').select('id, ewo_ref');
  const ewoRefMap = new Map<string, string>();
  for (const ewo of (allEwos ?? []) as Array<Record<string, unknown>>) {
    ewoRefMap.set(ewo.id as string, ewo.ewo_ref as string);
  }

  let imported = 0, skipped = 0;

  for (const event of events as Array<Record<string, unknown>>) {
    const ewoId = event.ewo_id as string;
    const ewoRef = ewoRefMap.get(ewoId) ?? 'UNKNOWN';
    const eventId = event.id as string;
    const recordRef = `TIMELINE-${eventId}`;

    const { data: existing } = await supabase
      .from('engineering_records_library')
      .select('id').eq('record_ref', recordRef).maybeSingle();

    if (existing) { skipped++; continue; }

    const { error: insertError } = await supabase
      .from('engineering_records_library')
      .insert({
        record_ref: recordRef, record_type: 'timeline_snapshot',
        title: `Timeline — ${ewoRef}: ${(event.to_status as string) ?? ''}`,
        ewo_id: ewoId, ewo_ref: ewoRef !== 'UNKNOWN' ? ewoRef : null,
        status: 'generated', orchestrator_status: 'generated',
        orchestrator_generated: false, is_backfill: true,
        content: {
          ewo_ref: ewoRef, from_status: (event.from_status as string) ?? null,
          to_status: (event.to_status as string) ?? '',
          actor: (event.actor as string) ?? '', notes: (event.notes as string) ?? '',
          event_id: eventId,
        },
        version_number: 1, record_version: 1,
        generated_by: 'Historical Bootstrap',
        governance_status: 'complete', knowledge_extracted: false,
        lineage_established: false, exports_generated: false,
        linked_releases: [], linked_standards: [],
        reconciliation_source: 'historical_bootstrap',
      });

    if (insertError) { skipped++; } else { imported++; }
  }

  return { discovered: events.length, imported, skipped, failed: 0 };
}

// ─── Phase 6: Bootstrap Engineering Standards ─────────────────────────────────

async function bootstrapEngineeringStandards(runId: string): Promise<PhaseResult> {
  const { data: standards, error } = await supabase
    .from('ecc_engineering_standards')
    .select('id, standard_id, title, description, category, status, version, created_at')
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) return { discovered: 0, imported: 0, skipped: 0, failed: 0, error: error.message };
  if (!standards || standards.length === 0) return { discovered: 0, imported: 0, skipped: 0, failed: 0 };

  let imported = 0, skipped = 0;

  for (const std of standards as Array<Record<string, unknown>>) {
    const stdId = (std.standard_id as string) ?? (std.id as string);
    const recordRef = `STANDARD-${stdId}`;

    const { data: existing } = await supabase
      .from('engineering_records_library')
      .select('id').eq('record_ref', recordRef).maybeSingle();

    if (existing) { skipped++; continue; }

    const { error: insertError } = await supabase
      .from('engineering_records_library')
      .insert({
        record_ref: recordRef, record_type: 'architecture_decision',
        title: (std.title as string) ?? `Standard — ${stdId}`,
        status: 'generated', orchestrator_status: 'generated',
        orchestrator_generated: false, is_backfill: true,
        content: {
          standard_id: stdId, title: (std.title as string) ?? '',
          description: (std.description as string) ?? '',
          category: (std.category as string) ?? '',
          status: (std.status as string) ?? '',
          version: (std.version as string) ?? '',
        },
        version_number: 1, record_version: 1,
        generated_by: 'Historical Bootstrap',
        governance_status: 'complete', knowledge_extracted: false,
        lineage_established: false, exports_generated: false,
        linked_releases: [], linked_standards: [stdId],
        reconciliation_source: 'historical_bootstrap',
      });

    if (insertError) { skipped++; } else { imported++; }
  }

  return { discovered: standards.length, imported, skipped, failed: 0 };
}

// ─── Phase 7: Bootstrap Constitutional Decisions ──────────────────────────────

async function bootstrapConstitutionalDecisions(runId: string): Promise<PhaseResult> {
  const { data: docs, error } = await supabase
    .from('constitutional_documents')
    .select('id, amendment_id, title, summary, status, created_at')
    .order('created_at', { ascending: true });

  if (error) return { discovered: 0, imported: 0, skipped: 0, failed: 0, error: error.message };
  if (!docs || docs.length === 0) return { discovered: 0, imported: 0, skipped: 0, failed: 0 };

  let imported = 0, skipped = 0;

  for (const doc of docs as Array<Record<string, unknown>>) {
    const amendId = (doc.amendment_id as string) ?? (doc.id as string);
    const recordRef = `CONSTITUTIONAL-${amendId}`;

    const { data: existing } = await supabase
      .from('engineering_records_library')
      .select('id').eq('record_ref', recordRef).maybeSingle();

    if (existing) { skipped++; continue; }

    const { error: insertError } = await supabase
      .from('engineering_records_library')
      .insert({
        record_ref: recordRef, record_type: 'constitutional_decision',
        title: (doc.title as string) ?? `Constitutional — ${amendId}`,
        status: 'generated', orchestrator_status: 'generated',
        orchestrator_generated: false, is_backfill: true,
        content: {
          amendment_id: amendId, title: (doc.title as string) ?? '',
          summary: (doc.summary as string) ?? '',
          status: (doc.status as string) ?? '',
        },
        version_number: 1, record_version: 1,
        generated_by: 'Historical Bootstrap',
        governance_status: 'complete', knowledge_extracted: false,
        lineage_established: false, exports_generated: false,
        linked_releases: [], linked_standards: [],
        reconciliation_source: 'historical_bootstrap',
      });

    if (insertError) { skipped++; } else { imported++; }
  }

  return { discovered: docs.length, imported, skipped, failed: 0 };
}

// ─── Phase 8: Bootstrap Historical References ────────────────────────────────

async function bootstrapHistoricalReferences(runId: string): Promise<PhaseResult> {
  const { data: refs, error } = await supabase
    .from('engineering_historical_references')
    .select('id, reference, title, investigation_date, audit_ref, evidence_summary, conclusion, historical_explanation, status, product_owner, created_at')
    .order('created_at', { ascending: true });

  if (error) return { discovered: 0, imported: 0, skipped: 0, failed: 0, error: error.message };
  if (!refs || refs.length === 0) return { discovered: 0, imported: 0, skipped: 0, failed: 0 };

  let imported = 0, skipped = 0;

  for (const ref of refs as Array<Record<string, unknown>>) {
    const refId = (ref.reference as string) ?? (ref.id as string);
    const recordRef = `HISTORICAL-${refId}`;

    const { data: existing } = await supabase
      .from('engineering_records_library')
      .select('id').eq('record_ref', recordRef).maybeSingle();

    if (existing) { skipped++; continue; }

    const { error: insertError } = await supabase
      .from('engineering_records_library')
      .insert({
        record_ref: recordRef, record_type: 'historical_recovery',
        title: (ref.title as string) ?? `Historical — ${refId}`,
        status: 'generated', orchestrator_status: 'generated',
        orchestrator_generated: false, is_backfill: true,
        content: {
          reference: refId, title: (ref.title as string) ?? '',
          investigation_date: (ref.investigation_date as string) ?? '',
          audit_ref: (ref.audit_ref as string) ?? '',
          evidence_summary: (ref.evidence_summary as string) ?? '',
          conclusion: (ref.conclusion as string) ?? '',
          historical_explanation: (ref.historical_explanation as string) ?? '',
          status: (ref.status as string) ?? '',
          product_owner: (ref.product_owner as string) ?? '',
        },
        version_number: 1, record_version: 1,
        generated_by: 'Historical Bootstrap',
        governance_status: 'complete', knowledge_extracted: false,
        lineage_established: false, exports_generated: false,
        linked_releases: [], linked_standards: [],
        reconciliation_source: 'historical_bootstrap',
      });

    if (insertError) { skipped++; } else { imported++; }
  }

  return { discovered: refs.length, imported, skipped, failed: 0 };
}

// ─── Phase 9: Bootstrap Verifications ─────────────────────────────────────────

async function bootstrapVerifications(runId: string): Promise<PhaseResult> {
  const { data: verifs, error } = await supabase
    .from('ewo_verification_orchestrations')
    .select('id, ewo_ref, ewo_id, status, verification_type, created_at')
    .order('created_at', { ascending: true })
    .limit(200);

  if (error) return { discovered: 0, imported: 0, skipped: 0, failed: 0, error: error.message };
  if (!verifs || verifs.length === 0) return { discovered: 0, imported: 0, skipped: 0, failed: 0 };

  let imported = 0, skipped = 0;

  for (const verif of verifs as Array<Record<string, unknown>>) {
    const ewoRef = (verif.ewo_ref as string) ?? 'UNKNOWN';
    const verifId = verif.id as string;
    const recordRef = `VERIFICATION-${verifId}`;

    const { data: existing } = await supabase
      .from('engineering_records_library')
      .select('id').eq('record_ref', recordRef).maybeSingle();

    if (existing) { skipped++; continue; }

    const { error: insertError } = await supabase
      .from('engineering_records_library')
      .insert({
        record_ref: recordRef, record_type: 'verification',
        title: `Verification — ${ewoRef}`,
        ewo_id: (verif.ewo_id as string) ?? null,
        ewo_ref: ewoRef !== 'UNKNOWN' ? ewoRef : null,
        status: (verif.status as string) ?? 'generated',
        orchestrator_status: (verif.status as string) ?? 'generated',
        orchestrator_generated: false, is_backfill: true,
        content: {
          ewo_ref: ewoRef,
          verification_type: (verif.verification_type as string) ?? '',
          status: (verif.status as string) ?? '',
        },
        version_number: 1, record_version: 1,
        generated_by: 'Historical Bootstrap',
        governance_status: 'complete', knowledge_extracted: false,
        lineage_established: false, exports_generated: false,
        linked_releases: [], linked_standards: [],
        reconciliation_source: 'historical_bootstrap',
      });

    if (insertError) { skipped++; } else { imported++; }
  }

  return { discovered: verifs.length, imported, skipped, failed: 0 };
}

// ─── Phase 10: Reconstruct Lineage (extends engineering_record_lineage) ───────

async function reconstructLineage(runId: string): Promise<{ reconstructed: number; error?: string }> {
  let reconstructed = 0;

  const { data: records, error } = await supabase
    .from('engineering_records_library')
    .select('id, record_ref, record_type, ewo_ref, ewo_id')
    .not('ewo_ref', 'is', null)
    .order('created_at', { ascending: true });

  if (error) return { reconstructed: 0, error: error.message };
  if (!records || records.length === 0) return { reconstructed: 0 };

  for (const record of records as Array<Record<string, unknown>>) {
    const recordId = record.id as string;
    const recordRef = record.record_ref as string;
    const ewoRef = record.ewo_ref as string;
    const recordType = record.record_type as string;

    // Check existing lineage for this record
    const { data: existingLineage } = await supabase
      .from('engineering_record_lineage')
      .select('id')
      .eq('from_record_id', recordId)
      .limit(1);

    if (existingLineage && existingLineage.length > 0) continue;

    // Create lineage links using the existing engineering_record_lineage table
    const lineageLinks: Array<{ to_ref: string; relationship_type: string }> = [
      { to_ref: ewoRef, relationship_type: 'related_ewo' },
    ];

    if (recordType !== 'completion_report') {
      lineageLinks.push({ to_ref: `${ewoRef}-COMPLETION_REPORT`, relationship_type: 'related_record' });
    }
    if (recordType !== 'engineering_package') {
      lineageLinks.push({ to_ref: `${ewoRef}-PACKAGE`, relationship_type: 'related_record' });
    }

    for (const link of lineageLinks) {
      const { error: lineageError } = await supabase
        .from('engineering_record_lineage')
        .insert({
          from_record_id: recordId,
          from_record_ref: recordRef,
          to_ref: link.to_ref,
          relationship_type: link.relationship_type,
          notes: 'historical_bootstrap',
          bootstrap_run_id: runId,
        });

      if (!lineageError) reconstructed++;
    }
  }

  return { reconstructed };
}

// ─── Phase 11: Historical Health Validation ───────────────────────────────────

async function runHistoricalHealthValidation(): Promise<{ issues: number; error?: string }> {
  let issues = 0;

  const { data: ewos, error } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, status')
    .order('created_at', { ascending: true });

  if (error) return { issues: 0, error: error.message };
  if (!ewos || ewos.length === 0) return { issues: 0 };

  for (const ewo of ewos as Array<Record<string, unknown>>) {
    const ewoRef = ewo.ewo_ref as string;
    const ewoId = ewo.id as string;
    const ewoStatus = ewo.status as string;

    if (ewoStatus === 'closed' || ewoStatus === 'po_accepted') {
      const report = await checkRecordHealth(ewoRef, ewoId);
      issues += report.alerts.length;
    }
  }

  return { issues };
}

// ─── Phase 12: Prepare Memory Entries (extends engineering_memory) ────────────

async function prepareMemoryEntries(runId: string): Promise<{ discovered: number; prepared: number; skipped: number; error?: string }> {
  let prepared = 0, skipped = 0;

  const { data: ewos, error } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, executive_summary, status, implementation_status')
    .order('created_at', { ascending: true });

  if (error) return { discovered: 0, prepared: 0, skipped: 0, error: error.message };
  if (!ewos || ewos.length === 0) return { discovered: 0, prepared: 0, skipped: 0 };

  // Get the completion report record for each EWO to link memory to it
  for (const ewo of ewos as Array<Record<string, unknown>>) {
    const ewoRef = ewo.ewo_ref as string;
    const ewoId = ewo.id as string;

    // Find the completion report record in the library to link memory to it
    const { data: crRecord } = await supabase
      .from('engineering_records_library')
      .select('id, record_ref')
      .eq('record_ref', `${ewoRef}-COMPLETION_REPORT`)
      .maybeSingle();

    if (!crRecord) { skipped++; continue; }

    // Check if memory entry already exists for this record (idempotent)
    const { data: existingMemory } = await supabase
      .from('engineering_memory')
      .select('id')
      .eq('record_id', (crRecord as Record<string, unknown>).id as string)
      .eq('knowledge_category', 'implementation_strategy')
      .limit(1);

    if (existingMemory && existingMemory.length > 0) { skipped++; continue; }

    // Gather data for the memory entry
    const { data: completionReport } = await supabase
      .from('ewo_completion_reports')
      .select('executive_summary, risks')
      .eq('ewo_ref', ewoRef)
      .maybeSingle();

    const cr = completionReport as Record<string, unknown> | null;
    const summary = (cr?.executive_summary as string) ?? (ewo.executive_summary as string) ?? '';
    const risks = (cr?.risks as string) ?? '';

    if (!summary) { skipped++; continue; }

    const memoryContent = risks
      ? `${summary}\n\nRisks: ${risks}`
      : summary;

    const { error: memError } = await supabase
      .from('engineering_memory')
      .insert({
        record_id: (crRecord as Record<string, unknown>).id as string,
        record_ref: (crRecord as Record<string, unknown>).record_ref as string,
        knowledge_category: 'implementation_strategy',
        knowledge_domain: 'platform',
        title: `Engineering Summary — ${ewoRef}`,
        content: memoryContent,
        source_section: 'executive_summary',
        tags: [ewoRef, 'historical_bootstrap', (ewo.status as string) ?? ''],
        authority_state: 'provisional',
        bootstrap_run_id: runId,
      });

    if (!memError) prepared++;
    else skipped++;
  }

  return { discovered: ewos.length, prepared, skipped };
}

// ─── Dashboard / Query Functions ──────────────────────────────────────────────

export async function getBootstrapRuns(): Promise<BootstrapRun[]> {
  const { data, error } = await supabase
    .from('historical_bootstrap_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(20);

  if (error || !data) return [];
  return data as unknown as BootstrapRun[];
}

export async function getLatestBootstrapRun(): Promise<BootstrapRun | null> {
  const { data, error } = await supabase
    .from('historical_bootstrap_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as BootstrapRun;
}

export async function getActiveBootstrapRun(): Promise<BootstrapRun | null> {
  const { data, error } = await supabase
    .from('historical_bootstrap_runs')
    .select('*')
    .in('status', ACTIVE_STATUSES)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as BootstrapRun;
}

export function calculateBootstrapCompletion(run: BootstrapRun): number {
  if (run.artefacts_discovered === 0) return 0;
  const imported = run.artefacts_imported + run.artefacts_skipped;
  return Math.round((imported / run.artefacts_discovered) * 100);
}

// ─── Phase Performance Metrics (ES-004 REQ-9) ────────────────────────────────

export interface PhaseMetrics {
  avgPhaseDurationSeconds: number | null;
  longestPhase: string | null;
  longestPhaseDurationSeconds: number;
  shortestPhase: string | null;
  shortestPhaseDurationSeconds: number;
  totalCompletedPhases: number;
  historicalAverages: Array<{ run_id: string; runtime_seconds: number }>;
}

// ─── Drill-Down Query Functions (EWO-023R.1R.3) ──────────────────────────────

export interface DiagnosticEntry {
  id: string;
  run_id: string;
  phase: string;
  phase_label: string | null;
  severity: string;
  record_ref: string | null;
  record_type: string | null;
  user_message: string;
  technical_message: string | null;
  resolution_status: string;
  related_record_ref: string | null;
  retry_guidance: string | null;
  created_at: string;
}

export async function getBootstrapDiagnostics(runId: string): Promise<DiagnosticEntry[]> {
  const { data, error } = await supabase
    .from('historical_bootstrap_diagnostics')
    .select('*')
    .eq('run_id', runId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data as unknown as DiagnosticEntry[];
}

export async function getBootstrapRecords(runId: string, recordType?: string): Promise<Array<Record<string, unknown>>> {
  let query = supabase
    .from('engineering_records_library')
    .select('id, record_ref, record_type, title, ewo_ref, status, skip_reason, created_at, reconciliation_source')
    .eq('reconciliation_source', 'historical_bootstrap')
    .order('created_at', { ascending: true });

  if (recordType) {
    query = query.eq('record_type', recordType);
  }

  const { data, error } = await query.limit(500);
  if (error || !data) return [];
  return data as unknown as Array<Record<string, unknown>>;
}

export async function getBootstrapSkippedRecords(runId: string): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabase
    .from('engineering_records_library')
    .select('id, record_ref, record_type, title, ewo_ref, status, skip_reason, created_at')
    .not('skip_reason', 'is', null)
    .order('created_at', { ascending: true })
    .limit(200);

  if (error || !data) return [];
  return data as unknown as Array<Record<string, unknown>>;
}

export interface MemoryEntry {
  id: string;
  record_id: string;
  record_ref: string;
  knowledge_category: string;
  knowledge_domain: string | null;
  title: string;
  content: string;
  source_section: string | null;
  tags: string[] | null;
  authority_state: string;
  bootstrap_run_id: string | null;
  created_at: string;
}

export async function getBootstrapMemoryEntries(runId: string): Promise<MemoryEntry[]> {
  const { data, error } = await supabase
    .from('engineering_memory')
    .select('*')
    .eq('bootstrap_run_id', runId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data as unknown as MemoryEntry[];
}

export interface LineageEntry {
  id: string;
  from_record_id: string;
  from_record_ref: string;
  to_ref: string;
  relationship_type: string;
  notes: string | null;
  bootstrap_run_id: string | null;
  created_at: string;
}

export async function getBootstrapLineageEntries(runId: string): Promise<LineageEntry[]> {
  const { data, error } = await supabase
    .from('engineering_record_lineage')
    .select('*')
    .eq('bootstrap_run_id', runId)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error || !data) return [];
  return data as unknown as LineageEntry[];
}

export interface HealthAlertEntry {
  id: string;
  ewo_ref: string;
  alert_type: string;
  severity: string;
  message: string;
  status: string;
  created_at: string;
}

export async function getBootstrapHealthAlerts(): Promise<HealthAlertEntry[]> {
  const { data, error } = await supabase
    .from('engineering_record_health_alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error || !data) return [];
  return data as unknown as HealthAlertEntry[];
}

export async function getBootstrapExecutionDetail(runId: string): Promise<{
  run: BootstrapRun | null;
  phases: Array<{ key: string; label: string; durationSeconds: number | null; discovered: number; imported: number; skipped: number; failed: number }>;
  longestPhase: { key: string; label: string; durationSeconds: number } | null;
}> {
  const { data: runData, error: runError } = await supabase
    .from('historical_bootstrap_runs')
    .select('*')
    .eq('run_id', runId)
    .maybeSingle();

  if (runError || !runData) return { run: null, phases: [], longestPhase: null };
  const run = runData as unknown as BootstrapRun;

  const phaseProgress = run.phase_progress ?? {};
  const phases = BOOTSTRAP_PHASES.map(p => {
    const stats = phaseProgress[p.key] ?? { discovered: 0, imported: 0, skipped: 0, failed: 0 };
    return {
      key: p.key,
      label: p.label,
      durationSeconds: null,
      discovered: stats.discovered ?? 0,
      imported: stats.imported ?? 0,
      skipped: stats.skipped ?? 0,
      failed: stats.failed ?? 0,
    };
  });

  // Determine longest phase from diagnostics or phase_progress
  const longestPhase = phases.reduce<{ key: string; label: string; durationSeconds: number } | null>((max, p) => {
    const processed = p.imported + p.skipped + p.failed;
    if (processed > (max?.durationSeconds ?? 0)) {
      return { key: p.key, label: p.label, durationSeconds: processed };
    }
    return max;
  }, null);

  return { run, phases, longestPhase };
}

// ─── Phase Performance Metrics (ES-004 REQ-9) ────────────────────────────────

export async function getBootstrapPhaseMetrics(): Promise<PhaseMetrics> {
  const { data: completedRuns } = await supabase
    .from('historical_bootstrap_runs')
    .select('run_id, runtime_seconds, phase_progress')
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .limit(10);

  const runs = (completedRuns ?? []) as Array<Record<string, unknown>>;
  const historicalAverages = runs.map(r => ({
    run_id: r.run_id as string,
    runtime_seconds: (r.runtime_seconds as number) ?? 0,
  }));

  if (runs.length === 0) {
    return {
      avgPhaseDurationSeconds: null,
      longestPhase: null,
      longestPhaseDurationSeconds: 0,
      shortestPhase: null,
      shortestPhaseDurationSeconds: 0,
      totalCompletedPhases: 0,
      historicalAverages: [],
    };
  }

  const totalRuntime = runs.reduce((sum, r) => sum + ((r.runtime_seconds as number) ?? 0), 0);
  const avgPhaseDuration = totalRuntime / (runs.length * BOOTSTRAP_PHASES.length);

  return {
    avgPhaseDurationSeconds: Math.round(avgPhaseDuration),
    longestPhase: null,
    longestPhaseDurationSeconds: 0,
    shortestPhase: null,
    shortestPhaseDurationSeconds: 0,
    totalCompletedPhases: runs.length * BOOTSTRAP_PHASES.length,
    historicalAverages,
  };
}
