// EWO-023R.1R.3: Historical Bootstrap Dashboard — Operational Evidence Drill-Down
//
// All summary metrics are clickable and provide governed drill-down to
// the underlying evidence. Implements ES-004 Progressive Execution Visibility
// with actionable operational metrics.

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  History, RefreshCw, Loader2, XCircle, AlertTriangle, X,
  CheckCircle2, Clock, ChevronDown, ChevronRight,
  Activity, Brain, Timer, Heart,
} from 'lucide-react';
import {
  runHistoricalBootstrap,
  getBootstrapRuns,
  getLatestBootstrapRun,
  getActiveBootstrapRun,
  abandonBootstrapRun,
  cancelBootstrapRun,
  calculateBootstrapCompletion,
  getBootstrapPhaseMetrics,
  getBootstrapDiagnostics,
  getBootstrapRecords,
  getBootstrapSkippedRecords,
  getBootstrapMemoryEntries,
  getBootstrapLineageEntries,
  getBootstrapHealthAlerts,
  getBootstrapExecutionDetail,
  BOOTSTRAP_PHASES,
  type BootstrapRun,
  type DiagnosticEntry,
  type MemoryEntry,
  type LineageEntry,
  type HealthAlertEntry,
} from '../../lib/historicalBootstrapService';
import {
  ProgressiveExecutionTracker,
  detectStall,
  computeEstimate,
  type PhaseDef,
  type ExecutionSummary,
  type EstimateInfo,
  type StallInfo,
  type MetricKey,
} from '../../components/ProgressiveExecutionTracker';

type DrillDownType =
  | 'diagnostics' | 'records' | 'skipped' | 'memory'
  | 'lineage' | 'health' | 'execution'
  | null;

interface DrillDownState {
  type: DrillDownType;
  runId: string;
  filter?: string;
  expectedCount?: number;
}

export default function ECHistoricalBootstrapPage() {
  const [runs, setRuns] = useState<BootstrapRun[]>([]);
  const [latestRun, setLatestRun] = useState<BootstrapRun | null>(null);
  const [activeRun, setActiveRun] = useState<BootstrapRun | null>(null);
  const [running, setRunning] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [result, setResult] = useState<{ run_id: string; artefacts_imported: number; artefacts_skipped: number; errors: string[]; status: string } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [historicalDurations, setHistoricalDurations] = useState<number[]>([]);
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);

  const loadData = useCallback(async () => {
    const [runsData, latest, active] = await Promise.all([
      getBootstrapRuns(),
      getLatestBootstrapRun(),
      getActiveBootstrapRun(),
    ]);
    setRuns(runsData);
    setLatestRun(latest);
    setActiveRun(active);

    const metrics = await getBootstrapPhaseMetrics();
    setHistoricalDurations(metrics.historicalAverages.map(h => h.runtime_seconds));
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData();
      setNow(Date.now());
    }, 2000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleRunBootstrap = async () => {
    setRunning(true);
    setResult(null);
    const res = await runHistoricalBootstrap();
    setResult({
      run_id: res.run_id,
      artefacts_imported: res.artefacts_imported,
      artefacts_skipped: res.artefacts_skipped,
      errors: res.errors,
      status: res.status,
    });
    await loadData();
    setRunning(false);
  };

  const handleAbandon = async (runId: string) => {
    await abandonBootstrapRun(runId);
    await loadData();
  };

  const handleCancel = async (runId: string) => {
    await cancelBootstrapRun(runId);
    await loadData();
  };

  // ─── Derived Values ──────────────────────────────────────────────────────
  const displayRun = activeRun ?? latestRun;
  const isActive = activeRun !== null;
  const liveRuntime = activeRun?.started_at
    ? Math.round((now - new Date(activeRun.started_at).getTime()) / 1000)
    : (displayRun?.runtime_seconds ?? 0);

  // ─── Memoised Calculations ───────────────────────────────────────────────
  const phases: PhaseDef[] = useMemo(() => {
    const phaseProgress = displayRun?.phase_progress ?? {};
    const currentPhase = displayRun?.current_phase;
    const failedPhase = displayRun?.failed_phase;
    const runStatus = displayRun?.status ?? 'queued';

    return BOOTSTRAP_PHASES.map((p) => {
      const stats = phaseProgress[p.key];
      let status: PhaseDef['status'] = 'pending';
      if (runStatus === 'completed') status = 'completed';
      else if (failedPhase && p.key === failedPhase) status = 'failed';
      else if (stats) status = 'completed';
      else if (currentPhase === p.key) status = 'running';

      return {
        key: p.key, label: p.label, status,
        discovered: stats?.discovered, imported: stats?.imported,
        skipped: stats?.skipped, failed: stats?.failed,
      };
    });
  }, [displayRun]);

  const summary: ExecutionSummary = useMemo(() => ({
    runtimeSeconds: liveRuntime,
    completionPct: displayRun ? calculateBootstrapCompletion(displayRun) : 0,
    discovered: displayRun?.artefacts_discovered ?? 0,
    imported: displayRun?.artefacts_imported ?? 0,
    skipped: displayRun?.artefacts_skipped ?? 0,
    lineageLinks: displayRun?.relationships_reconstructed ?? 0,
    memoryEntries: displayRun?.draft_packages_prepared ?? 0,
    healthIssues: displayRun?.health_issues_detected ?? 0,
  }), [displayRun, liveRuntime]);

  const estimate: EstimateInfo = useMemo(() => {
    if (!isActive) return { remainingSeconds: null, estimatedCompletion: null, confidence: 'unavailable' };
    const completedPhases = phases.filter(p => p.status === 'completed').length;
    return computeEstimate(completedPhases, phases.length, liveRuntime, historicalDurations);
  }, [isActive, phases, liveRuntime, historicalDurations]);

  const stall: StallInfo | null = useMemo(() => {
    if (!displayRun || !isActive) return null;
    return detectStall(displayRun.heartbeat_at, displayRun.current_phase, displayRun.started_at ? new Date(displayRun.started_at).getTime() : null, now);
  }, [displayRun, isActive, now]);

  const heartbeatAgo = displayRun?.heartbeat_at
    ? Math.round((now - new Date(displayRun.heartbeat_at).getTime()) / 1000)
    : undefined;

  // ─── Callbacks ───────────────────────────────────────────────────────────
  const openDrillDown = useCallback((type: DrillDownType, runId: string, filter?: string, expectedCount?: number) => {
    setDrillDown({ type, runId, filter, expectedCount });
  }, []);

  const closeDrillDown = useCallback(() => setDrillDown(null), []);

  const handleMetricClick = useCallback((metric: MetricKey) => {
    const runId = displayRun?.run_id ?? '';
    switch (metric) {
      case 'runtime':
      case 'completion':
        openDrillDown('execution', runId);
        break;
      case 'discovered':
        openDrillDown('records', runId, undefined, summary.discovered);
        break;
      case 'imported':
        openDrillDown('records', runId, 'imported', summary.imported);
        break;
      case 'skipped':
        openDrillDown('skipped', runId, undefined, summary.skipped);
        break;
      case 'lineage':
        openDrillDown('lineage', runId, undefined, summary.lineageLinks ?? 0);
        break;
      case 'memory':
        openDrillDown('memory', runId, undefined, summary.memoryEntries ?? 0);
        break;
      case 'health':
        openDrillDown('health', runId, undefined, summary.healthIssues ?? 0);
        break;
    }
  }, [displayRun, summary, openDrillDown]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <History className="w-5 h-5 text-blue-500" />
            Historical Engineering Bootstrap
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            ES-004 Reference Implementation — Progressive Execution Visibility with Operational Evidence Drill-Down
          </p>
        </div>
        <button
          onClick={handleRunBootstrap}
          disabled={running || isActive}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {running ? 'Bootstrap Running...' : isActive ? 'Bootstrap Active' : 'Run Historical Bootstrap'}
        </button>
      </div>

      {/* Active Run Recovery */}
      {activeRun && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
              <span className="text-sm font-medium text-blue-800">
                Bootstrap Active — {activeRun.run_id}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCancel(activeRun.run_id)}
                className="px-3 py-1 text-xs font-medium rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAbandon(activeRun.run_id)}
                className="px-3 py-1 text-xs font-medium rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
              >
                Abandon
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result Banner — clickable for diagnostics */}
      {result && (
        <button
          onClick={() => result.errors.length > 0 && openDrillDown('diagnostics', result.run_id)}
          disabled={result.errors.length === 0}
          className={`w-full text-left rounded-xl border p-4 transition-all ${
            result.status === 'failed' ? 'bg-red-50 border-red-200 cursor-pointer hover:bg-red-100' :
            result.errors.length > 0 ? 'bg-amber-50 border-amber-200 cursor-pointer hover:bg-amber-100' :
            'bg-emerald-50 border-emerald-200 cursor-default'
          }`}
          aria-label={result.errors.length > 0 ? `View ${result.errors.length} diagnostic items` : 'Bootstrap completed successfully'}
        >
          <div className="flex items-center gap-2">
            {result.status === 'failed' ? (
              <XCircle className="w-5 h-5 text-red-600" />
            ) : result.errors.length > 0 ? (
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            )}
            <span className="text-sm font-medium text-slate-700">
              Bootstrap {result.status === 'failed' ? 'FAILED' : result.errors.length > 0 ? `completed with ${result.errors.length} warning(s)` : 'completed successfully'}
            </span>
            {result.errors.length > 0 && (
              <span className="ml-auto text-xs text-slate-500 flex items-center gap-1">
                Click to inspect <ChevronRight className="w-3 h-3" />
              </span>
            )}
          </div>
          <div className="mt-2 text-xs text-slate-600 space-y-1">
            <div>Run ID: <span className="font-mono">{result.run_id}</span></div>
            <div>Imported: {result.artefacts_imported} | Skipped (existing): {result.artefacts_skipped}</div>
          </div>
        </button>
      )}

      {/* Execution Tracker (ES-004) — Summary Cards are the canonical interactive dashboard */}
      {displayRun && (
        <ProgressiveExecutionTracker
          phases={phases}
          summary={summary}
          estimate={estimate}
          stall={stall}
          overallStatus={displayRun.status as 'queued' | 'starting' | 'running' | 'completed' | 'failed' | 'cancelled' | 'abandoned'}
          heartbeatAgoSeconds={heartbeatAgo}
          onMetricClick={handleMetricClick}
        />
      )}

      {/* Failure Details */}
      {latestRun?.status === 'failed' && latestRun.failed_phase && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <button
            onClick={() => openDrillDown('diagnostics', latestRun.run_id)}
            className="w-full text-left rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700 hover:bg-red-100 transition-colors"
            aria-label="Inspect failure diagnostics"
          >
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              Failed at: {latestRun.failed_phase}
              <ChevronRight className="w-3 h-3 ml-auto" />
            </div>
            {latestRun.failure_reason && (
              <div className="mt-1 text-red-600">{latestRun.failure_reason}</div>
            )}
          </button>
        </div>
      )}

      {/* Bootstrap History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <History className="w-4 h-4 text-slate-400" /> Bootstrap History
          </h2>
        </div>
        {runs.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-400">
            No bootstrap runs yet. Click "Run Historical Bootstrap" to begin.
          </div>
        )}
        <div className="divide-y divide-slate-100">
          {runs.map((run) => (
            <div key={run.run_id}>
              <button
                onClick={() => setExpandedRun(expandedRun === run.run_id ? null : run.run_id)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left"
                aria-label={`Expand bootstrap run ${run.run_id}`}
                aria-expanded={expandedRun === run.run_id}
              >
                {expandedRun === run.run_id ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                <span className="text-xs font-mono text-slate-500">{run.run_id}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  run.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                  run.status === 'failed' ? 'bg-red-100 text-red-700' :
                  run.status === 'running' ? 'bg-blue-100 text-blue-700' :
                  run.status === 'abandoned' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-600'
                }`}>{run.status}</span>
                <span className="text-xs text-slate-500 ml-auto">
                  {run.artefacts_imported} imported / {run.artefacts_skipped} skipped
                </span>
                <span className="text-xs text-slate-400">{new Date(run.started_at).toLocaleString()}</span>
              </button>
              {expandedRun === run.run_id && (
                <div className="px-8 py-3 bg-slate-50 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <DetailItem label="Discovered" value={run.artefacts_discovered} />
                    <DetailItem label="Imported" value={run.artefacts_imported} />
                    <DetailItem label="Skipped" value={run.artefacts_skipped} />
                    <DetailItem label="Lineage" value={run.relationships_reconstructed} />
                    <DetailItem label="Health Issues" value={run.health_issues_detected} />
                    <DetailItem label="Memory Entries" value={run.draft_packages_prepared} />
                    <DetailItem label="Runtime" value={`${run.runtime_seconds ?? 0}s`} />
                    <DetailItem label="Completion" value={`${calculateBootstrapCompletion(run)}%`} />
                  </div>
                  {run.failed_phase && (
                    <div className="text-xs text-red-600">
                      <strong>Failed:</strong> {run.failed_phase} — {run.failure_reason}
                    </div>
                  )}
                  {/* Actionable evidence links */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200">
                    <EvidenceLink label="Records" onClick={() => openDrillDown('records', run.run_id, undefined, run.artefacts_discovered)} />
                    <EvidenceLink label="Skipped" onClick={() => openDrillDown('skipped', run.run_id, undefined, run.artefacts_skipped)} />
                    <EvidenceLink label="Memory" onClick={() => openDrillDown('memory', run.run_id, undefined, run.draft_packages_prepared)} />
                    <EvidenceLink label="Lineage" onClick={() => openDrillDown('lineage', run.run_id, undefined, run.relationships_reconstructed)} />
                    <EvidenceLink label="Health" onClick={() => openDrillDown('health', run.run_id, undefined, run.health_issues_detected)} />
                    <EvidenceLink label="Diagnostics" onClick={() => openDrillDown('diagnostics', run.run_id)} />
                    <EvidenceLink label="Execution" onClick={() => openDrillDown('execution', run.run_id)} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Drill-Down Panel */}
      {drillDown && (
        <DrillDownPanel state={drillDown} onClose={closeDrillDown} />
      )}
    </div>
  );
}

// ─── Evidence Link ─────────────────────────────────────────────────────────────

function EvidenceLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {label}
    </button>
  );
}

// ─── Drill-Down Panel ──────────────────────────────────────────────────────────

export function DrillDownPanel({ state, onClose }: { state: DrillDownState; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([]);
  const [skippedRecords, setSkippedRecords] = useState<Array<Record<string, unknown>>>([]);
  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[]>([]);
  const [lineageEntries, setLineageEntries] = useState<LineageEntry[]>([]);
  const [healthAlerts, setHealthAlerts] = useState<HealthAlertEntry[]>([]);
  const [executionDetail, setExecutionDetail] = useState<{
    run: BootstrapRun | null;
    phases: Array<{ key: string; label: string; durationSeconds: number | null; discovered: number; imported: number; skipped: number; failed: number }>;
    longestPhase: { key: string; label: string; durationSeconds: number } | null;
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        switch (state.type) {
          case 'diagnostics':
            setDiagnostics(await getBootstrapDiagnostics(state.runId));
            break;
          case 'records':
            setRecords(await getBootstrapRecords(state.runId, state.filter));
            break;
          case 'skipped':
            setSkippedRecords(await getBootstrapSkippedRecords(state.runId));
            break;
          case 'memory':
            setMemoryEntries(await getBootstrapMemoryEntries(state.runId));
            break;
          case 'lineage':
            setLineageEntries(await getBootstrapLineageEntries(state.runId));
            break;
          case 'health':
            setHealthAlerts(await getBootstrapHealthAlerts());
            break;
          case 'execution':
            setExecutionDetail(await getBootstrapExecutionDetail(state.runId));
            break;
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [state]);

  const titles: Record<string, string> = {
    diagnostics: 'Bootstrap Diagnostics',
    records: 'Bootstrap Records',
    skipped: 'Skipped Records',
    memory: 'Memory Entries',
    lineage: 'Lineage Links',
    health: 'Record Health Alerts',
    execution: 'Execution Details',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" role="dialog" aria-modal="true" aria-label={titles[state.type ?? ''] ?? 'Drill-down'}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">{titles[state.type ?? ''] ?? 'Drill-down'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Run: <span className="font-mono">{state.runId}</span>
              {state.filter && <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">filter: {state.filter}</span>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close drill-down panel"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-5 flex-1">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          )}

          {!loading && state.type === 'diagnostics' && (
            <DiagnosticsView diagnostics={diagnostics} expectedCount={state.expectedCount} />
          )}

          {!loading && state.type === 'records' && (
            <RecordsView records={records} expectedCount={state.expectedCount} />
          )}

          {!loading && state.type === 'skipped' && (
            <SkippedRecordsView records={skippedRecords} expectedCount={state.expectedCount} />
          )}

          {!loading && state.type === 'memory' && (
            <MemoryView entries={memoryEntries} expectedCount={state.expectedCount} />
          )}

          {!loading && state.type === 'lineage' && (
            <LineageView entries={lineageEntries} expectedCount={state.expectedCount} />
          )}

          {!loading && state.type === 'health' && (
            <HealthView alerts={healthAlerts} expectedCount={state.expectedCount} />
          )}

          {!loading && state.type === 'execution' && executionDetail && (
            <ExecutionDetailView detail={executionDetail} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Drill-Down Views ─────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-sm text-slate-400">
      {message}
    </div>
  );
}

export function GovernedEmptyState({ expectedCount, noun, explanation }: { expectedCount: number; noun: string; explanation: string }) {
  return (
    <div className="text-center py-8">
      <div className="text-2xl font-bold text-slate-700 mb-2">{expectedCount}</div>
      <div className="text-sm font-medium text-slate-600 mb-3">{noun} reported by the bootstrap</div>
      <div className="max-w-md mx-auto text-xs text-slate-500 leading-relaxed">
        {explanation}
      </div>
    </div>
  );
}

export function DiagnosticsView({ diagnostics, expectedCount }: { diagnostics: DiagnosticEntry[]; expectedCount?: number }) {
  if (diagnostics.length === 0) {
    if (expectedCount && expectedCount > 0) {
      return <GovernedEmptyState
        expectedCount={expectedCount}
        noun="diagnostic items"
        explanation="The bootstrap reported warnings or errors, but detailed per-item diagnostics were not recorded for this run. This may occur with earlier bootstrap versions that predate the diagnostic capture system. The run completed but its warning count is preserved in the run summary."
      />;
    }
    return <EmptyState message="No diagnostics recorded for this run." />;
  }
  return (
    <div className="space-y-2">
      {diagnostics.map((d) => (
        <div key={d.id} className={`rounded-lg border p-3 text-sm ${
          d.severity === 'error' ? 'border-red-200 bg-red-50' :
          d.severity === 'warning' ? 'border-amber-200 bg-amber-50' :
          'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-center gap-2">
            {d.severity === 'error' ? <XCircle className="w-4 h-4 text-red-500" /> :
             d.severity === 'warning' ? <AlertTriangle className="w-4 h-4 text-amber-500" /> :
             <Activity className="w-4 h-4 text-slate-400" />}
            <span className="font-medium text-slate-700">{d.user_message}</span>
            <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium ${
              d.severity === 'error' ? 'bg-red-100 text-red-700' :
              d.severity === 'warning' ? 'bg-amber-100 text-amber-700' :
              'bg-slate-100 text-slate-600'
            }`}>{d.severity}</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 space-y-0.5">
            <div>Phase: <span className="font-medium">{d.phase_label ?? d.phase}</span></div>
            {d.record_ref && <div>Record: <span className="font-mono">{d.record_ref}</span> ({d.record_type ?? 'unknown'})</div>}
            {d.technical_message && <div className="text-slate-600">Technical: {d.technical_message}</div>}
            {d.retry_guidance && <div className="text-blue-600">Guidance: {d.retry_guidance}</div>}
            <div>Time: {new Date(d.created_at).toLocaleString()}</div>
            <div>Status: <span className="font-medium">{d.resolution_status}</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RecordsView({ records, expectedCount }: { records: Array<Record<string, unknown>>; expectedCount?: number }) {
  if (records.length === 0) {
    if (expectedCount && expectedCount > 0) {
      return <GovernedEmptyState
        expectedCount={expectedCount}
        noun="records discovered"
        explanation="The bootstrap reported discovering records, but they were not tagged with this run's ID. Records imported by earlier bootstrap versions may not carry the bootstrap_run_id tag. The records exist in the Engineering Records Library but cannot be filtered to this specific run."
      />;
    }
    return <EmptyState message="No records found for this bootstrap run." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 px-2">Record Ref</th>
            <th className="py-2 px-2">Type</th>
            <th className="py-2 px-2">Title</th>
            <th className="py-2 px-2">EWO</th>
            <th className="py-2 px-2">Status</th>
            <th className="py-2 px-2">Skip Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="py-1.5 px-2 font-mono text-slate-600">{r.record_ref as string}</td>
              <td className="py-1.5 px-2 text-slate-600">{r.record_type as string}</td>
              <td className="py-1.5 px-2 text-slate-700 max-w-xs truncate">{r.title as string}</td>
              <td className="py-1.5 px-2 font-mono text-slate-500">{r.ewo_ref as string ?? '—'}</td>
              <td className="py-1.5 px-2 text-slate-600">{r.status as string}</td>
              <td className="py-1.5 px-2 text-slate-500">{r.skip_reason as string ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkippedRecordsView({ records, expectedCount }: { records: Array<Record<string, unknown>>; expectedCount?: number }) {
  if (records.length === 0) {
    if (expectedCount && expectedCount > 0) {
      return <GovernedEmptyState
        expectedCount={expectedCount}
        noun="skipped records"
        explanation={`${expectedCount} historical records were skipped because they already existed in the Engineering Records Library. Detailed per-record skip reasons were not captured by earlier bootstrap versions. The skip count is preserved in the run summary for reconciliation.`}
      />;
    }
    return <EmptyState message="No skipped records with reasons recorded." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 px-2">Record Ref</th>
            <th className="py-2 px-2">Type</th>
            <th className="py-2 px-2">Title</th>
            <th className="py-2 px-2">Skip Reason</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="py-1.5 px-2 font-mono text-slate-600">{r.record_ref as string}</td>
              <td className="py-1.5 px-2 text-slate-600">{r.record_type as string}</td>
              <td className="py-1.5 px-2 text-slate-700 max-w-xs truncate">{r.title as string}</td>
              <td className="py-1.5 px-2">
                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                  {r.skip_reason as string ?? 'unknown'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MemoryView({ entries, expectedCount }: { entries: MemoryEntry[]; expectedCount?: number }) {
  if (entries.length === 0) {
    if (expectedCount && expectedCount > 0) {
      return <GovernedEmptyState
        expectedCount={expectedCount}
        noun="memory entries"
        explanation="The bootstrap reported preparing memory entries, but they were not tagged with this run's ID. Memory entries created by earlier bootstrap versions may not carry the bootstrap_run_id tag. The entries exist in the Engineering Memory workspace but cannot be filtered to this specific run."
      />;
    }
    return <EmptyState message="No memory entries associated with this bootstrap run." />;
  }
  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <div key={e.id} className="rounded-lg border border-slate-200 p-3 text-sm">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-500" />
            <span className="font-medium text-slate-700">{e.title}</span>
            <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700">{e.authority_state}</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 space-y-0.5">
            <div>Category: <span className="font-medium">{e.knowledge_category}</span> | Domain: <span className="font-medium">{e.knowledge_domain ?? '—'}</span></div>
            <div>Source: <span className="font-mono">{e.record_ref}</span></div>
            <div className="text-slate-600 mt-1 line-clamp-2">{e.content}</div>
            <div>Created: {new Date(e.created_at).toLocaleString()}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function LineageView({ entries, expectedCount }: { entries: LineageEntry[]; expectedCount?: number }) {
  if (entries.length === 0) {
    if (expectedCount && expectedCount > 0) {
      return <GovernedEmptyState
        expectedCount={expectedCount}
        noun="lineage links"
        explanation="The bootstrap reported reconstructing lineage links, but they were not tagged with this run's ID. Lineage links created by earlier bootstrap versions may not carry the bootstrap_run_id tag. The links exist in the Lineage workspace but cannot be filtered to this specific run."
      />;
    }
    return <EmptyState message="No lineage links associated with this bootstrap run." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 px-2">Source Record</th>
            <th className="py-2 px-2">Target Ref</th>
            <th className="py-2 px-2">Relationship</th>
            <th className="py-2 px-2">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((e) => (
            <tr key={e.id} className="hover:bg-slate-50">
              <td className="py-1.5 px-2 font-mono text-slate-600">{e.from_record_ref}</td>
              <td className="py-1.5 px-2 font-mono text-slate-600">{e.to_ref}</td>
              <td className="py-1.5 px-2">
                <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px]">{e.relationship_type}</span>
              </td>
              <td className="py-1.5 px-2 text-slate-500">{new Date(e.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HealthView({ alerts, expectedCount }: { alerts: HealthAlertEntry[]; expectedCount?: number }) {
  if (alerts.length === 0) {
    if (expectedCount && expectedCount > 0) {
      return <GovernedEmptyState
        expectedCount={expectedCount}
        noun="health issues"
        explanation="The bootstrap reported detecting health issues during validation, but the health alerts were not recorded in the diagnostic system for this run. This may occur when health validation ran but did not persist individual alerts. The issue count is preserved in the run summary for reconciliation."
      />;
    }
    return <EmptyState message="No health alerts found." />;
  }
  return (
    <div className="space-y-2">
      {alerts.map((a) => (
        <div key={a.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="font-medium text-slate-700">{a.alert_type}</span>
            <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium ${
              a.severity === 'high' ? 'bg-red-100 text-red-700' :
              a.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
              'bg-slate-100 text-slate-600'
            }`}>{a.severity}</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 space-y-0.5">
            <div>EWO: <span className="font-mono">{a.ewo_ref}</span></div>
            <div className="text-slate-600">{a.message}</div>
            <div>Status: <span className="font-medium">{a.status}</span></div>
            <div>Created: {new Date(a.created_at).toLocaleString()}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ExecutionDetailView({ detail }: {
  detail: {
    run: BootstrapRun | null;
    phases: Array<{ key: string; label: string; durationSeconds: number | null; discovered: number; imported: number; skipped: number; failed: number }>;
    longestPhase: { key: string; label: string; durationSeconds: number } | null;
  };
}) {
  const { run, phases, longestPhase } = detail;
  if (!run) return <EmptyState message="No execution data found for this run." />;
  return (
    <div className="space-y-4">
      {/* Lifecycle */}
      <div className="rounded-lg border border-slate-200 p-3">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Lifecycle</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <DetailItem label="Status" value={run.status} />
          <DetailItem label="Started" value={new Date(run.started_at).toLocaleString()} />
          <DetailItem label="Completed" value={run.completed_at ? new Date(run.completed_at).toLocaleString() : '—'} />
          <DetailItem label="Runtime" value={`${run.runtime_seconds ?? 0}s`} />
        </div>
        {run.failed_phase && (
          <div className="mt-2 text-xs text-red-600">
            <strong>Failed Phase:</strong> {run.failed_phase} — {run.failure_reason}
          </div>
        )}
      </div>

      {/* Phase Durations */}
      <div className="rounded-lg border border-slate-200 p-3">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">Phase Statistics</h3>
        <div className="space-y-1">
          {phases.map((p) => (
            <div key={p.key} className="flex items-center gap-3 text-xs py-1">
              <span className={`w-5 h-5 flex items-center justify-center rounded ${
                p.imported + p.skipped > 0 ? 'bg-emerald-100' : 'bg-slate-100'
              }`}>
                {p.imported + p.skipped > 0 ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Clock className="w-3 h-3 text-slate-400" />}
              </span>
              <span className="text-slate-600 w-48">{p.label}</span>
              <span className="text-blue-600">D: {p.discovered}</span>
              <span className="text-emerald-600">I: {p.imported}</span>
              <span className="text-slate-500">S: {p.skipped}</span>
              {p.failed > 0 && <span className="text-red-600">F: {p.failed}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Longest Phase */}
      {longestPhase && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-blue-500" />
            <span className="font-medium text-blue-800">Longest Phase (by records processed)</span>
          </div>
          <div className="mt-1 text-xs text-blue-700">
            {longestPhase.label} — {longestPhase.durationSeconds} records processed
          </div>
        </div>
      )}

      {/* Heartbeat */}
      {run.heartbeat_at && (
        <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <Heart className="w-3.5 h-3.5 text-slate-400" />
            <span>Last heartbeat: {new Date(run.heartbeat_at).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <span className="text-slate-400">{label}:</span> <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}
