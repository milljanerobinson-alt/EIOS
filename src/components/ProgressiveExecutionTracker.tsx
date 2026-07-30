// EWO-023R.1R.2: Reusable Progressive Execution Tracker Component
//
// Implements Engineering Standard ES-004 — Progressive Execution Visibility.
// Any governed operation can use this component by providing its phase
// definitions and live execution state.

import {
  CheckCircle2, Loader2, Clock, XCircle, AlertTriangle,
  Activity, Heart, Timer, Gauge, TrendingUp,
} from 'lucide-react';

export type PhaseStatus = 'completed' | 'running' | 'pending' | 'failed';

export interface PhaseDef {
  key: string;
  label: string;
  status: PhaseStatus;
  discovered?: number;
  imported?: number;
  skipped?: number;
  failed?: number;
  elapsedMs?: number;
}

export interface ExecutionSummary {
  runtimeSeconds: number;
  completionPct: number;
  discovered: number;
  imported: number;
  skipped: number;
  lineageLinks?: number;
  memoryEntries?: number;
  healthIssues?: number;
}

export interface EstimateInfo {
  remainingSeconds: number | null;
  estimatedCompletion: string | null;
  confidence: 'high' | 'medium' | 'low' | 'calculating' | 'unavailable';
}

export interface StallInfo {
  stalled: boolean;
  lastHeartbeatAgoSeconds: number;
  currentPhase: string;
  elapsedPhaseSeconds: number;
  guidance: string;
}

export type MetricKey =
  | 'runtime' | 'completion' | 'discovered' | 'imported'
  | 'skipped' | 'lineage' | 'memory' | 'health';

interface Props {
  phases: PhaseDef[];
  summary: ExecutionSummary;
  estimate: EstimateInfo;
  stall: StallInfo | null;
  overallStatus: 'queued' | 'starting' | 'running' | 'completed' | 'failed' | 'cancelled' | 'abandoned';
  heartbeatAgoSeconds?: number;
  onMetricClick?: (metric: MetricKey) => void;
}

const STALL_THRESHOLD_SECONDS = 60;

export function ProgressiveExecutionTracker({
  phases, summary, estimate, stall, overallStatus, heartbeatAgoSeconds, onMetricClick,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Summary Cards — interactive when onMetricClick is provided */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <SummaryCard icon={Timer} label="Runtime" value={`${summary.runtimeSeconds}s`} colour="text-slate-600 bg-slate-50" metricKey="runtime" onClick={onMetricClick} ariaLabel="Inspect execution lifecycle and runtime details" />
        <SummaryCard icon={Gauge} label="Completion" value={`${summary.completionPct}%`} colour="text-cyan-600 bg-cyan-50" metricKey="completion" onClick={onMetricClick} ariaLabel="Inspect execution details and phase durations" />
        <SummaryCard icon={TrendingUp} label="Discovered" value={summary.discovered} colour="text-blue-600 bg-blue-50" metricKey="discovered" onClick={onMetricClick} disabled={summary.discovered === 0} ariaLabel={`Inspect ${summary.discovered} discovered records`} />
        <SummaryCard icon={CheckCircle2} label="Imported" value={summary.imported} colour="text-emerald-600 bg-emerald-50" metricKey="imported" onClick={onMetricClick} disabled={summary.imported === 0} ariaLabel={`Inspect ${summary.imported} imported records`} />
        <SummaryCard icon={Clock} label="Skipped" value={summary.skipped} colour="text-slate-500 bg-slate-50" metricKey="skipped" onClick={onMetricClick} disabled={summary.skipped === 0} ariaLabel={`Inspect ${summary.skipped} skipped records with reasons`} />
        {summary.lineageLinks !== undefined && (
          <SummaryCard icon={Activity} label="Lineage" value={summary.lineageLinks} colour="text-indigo-600 bg-indigo-50" metricKey="lineage" onClick={onMetricClick} disabled={summary.lineageLinks === 0} ariaLabel={`Inspect ${summary.lineageLinks} lineage links`} />
        )}
        {summary.memoryEntries !== undefined && (
          <SummaryCard icon={Heart} label="Memory" value={summary.memoryEntries} colour="text-purple-600 bg-purple-50" metricKey="memory" onClick={onMetricClick} disabled={summary.memoryEntries === 0} ariaLabel={`Inspect ${summary.memoryEntries} memory entries`} />
        )}
        {summary.healthIssues !== undefined && (
          <SummaryCard icon={AlertTriangle} label="Health Issues" value={summary.healthIssues} colour="text-amber-600 bg-amber-50" metricKey="health" onClick={onMetricClick} disabled={summary.healthIssues === 0} ariaLabel={`Inspect ${summary.healthIssues} health issues`} />
        )}
      </div>

      {/* Progress Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-700">Overall Completion</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-800">{summary.completionPct}%</span>
            <StatusBadge status={overallStatus} />
          </div>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              overallStatus === 'failed' ? 'bg-red-500' :
              overallStatus === 'abandoned' ? 'bg-amber-500' :
              'bg-gradient-to-r from-blue-500 to-emerald-500'
            }`}
            style={{ width: `${summary.completionPct}%` }}
          />
        </div>
      </div>

      {/* Estimate */}
      {overallStatus === 'running' && estimate.confidence !== 'unavailable' && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-4 text-sm">
          <Timer className="w-4 h-4 text-slate-400" />
          <div className="flex items-center gap-4">
            <div>
              <span className="text-slate-500">Est. remaining: </span>
              <span className="font-medium text-slate-700">
                {estimate.remainingSeconds !== null ? formatDuration(estimate.remainingSeconds) : '—'}
              </span>
            </div>
            {estimate.estimatedCompletion && (
              <div>
                <span className="text-slate-500">Est. completion: </span>
                <span className="font-medium text-slate-700">{estimate.estimatedCompletion}</span>
              </div>
            )}
            <div>
              <span className="text-slate-500">Confidence: </span>
              <ConfidenceBadge confidence={estimate.confidence} />
            </div>
          </div>
        </div>
      )}

      {/* Stall Warning */}
      {stall?.stalled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">Execution appears stalled</span>
          </div>
          <div className="mt-2 text-xs text-amber-700 space-y-1">
            <div>Last heartbeat: {stall.lastHeartbeatAgoSeconds}s ago</div>
            <div>Current phase: {stall.currentPhase}</div>
            <div>Elapsed phase time: {stall.elapsedPhaseSeconds}s</div>
            <div className="mt-1 text-amber-600 font-medium">{stall.guidance}</div>
          </div>
        </div>
      )}

      {/* Heartbeat indicator */}
      {overallStatus === 'running' && heartbeatAgoSeconds !== undefined && !stall?.stalled && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Heart className={`w-3 h-3 ${heartbeatAgoSeconds < 10 ? 'text-emerald-500' : 'text-amber-500'}`} />
          Heartbeat: {heartbeatAgoSeconds}s ago
        </div>
      )}

      {/* Phase List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-slate-400" /> Execution Phases
          </h2>
        </div>
        <div className="divide-y divide-slate-100">
          {phases.map((phase) => (
            <PhaseRow key={phase.key} phase={phase} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PhaseRow({ phase }: { phase: PhaseDef }) {
  const hasStats = (phase.discovered ?? 0) > 0 || (phase.imported ?? 0) > 0 || (phase.skipped ?? 0) > 0 || (phase.failed ?? 0) > 0;

  return (
    <div className={`px-4 py-3 flex items-center gap-3 ${phase.status === 'running' ? 'bg-blue-50/50' : ''}`}>
      {/* Status icon */}
      <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
        {phase.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
        {phase.status === 'running' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
        {phase.status === 'pending' && <Clock className="w-4 h-4 text-slate-300" />}
        {phase.status === 'failed' && <XCircle className="w-4 h-4 text-red-500" />}
      </div>

      {/* Label */}
      <span className={`text-sm flex-1 ${phase.status === 'pending' ? 'text-slate-400' : phase.status === 'running' ? 'text-blue-700 font-medium' : 'text-slate-700'}`}>
        {phase.label}
      </span>

      {/* Stats */}
      {hasStats && (
        <div className="flex items-center gap-3 text-xs">
          {phase.discovered !== undefined && phase.discovered > 0 && (
            <span className="text-blue-600">D: {phase.discovered}</span>
          )}
          {phase.imported !== undefined && phase.imported > 0 && (
            <span className="text-emerald-600">I: {phase.imported}</span>
          )}
          {phase.skipped !== undefined && phase.skipped > 0 && (
            <span className="text-slate-500">S: {phase.skipped}</span>
          )}
          {phase.failed !== undefined && phase.failed > 0 && (
            <span className="text-red-600">F: {phase.failed}</span>
          )}
          {phase.elapsedMs !== undefined && phase.elapsedMs > 0 && (
            <span className="text-slate-400">{(phase.elapsedMs / 1000).toFixed(1)}s</span>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon, label, value, colour, metricKey, onClick, disabled, ariaLabel,
}: {
  icon: typeof Timer; label: string; value: number | string; colour: string;
  metricKey?: MetricKey; onClick?: (metric: MetricKey) => void;
  disabled?: boolean; ariaLabel?: string;
}) {
  const interactive = onClick && metricKey && !disabled;

  const content = (
    <>
      <div className={`w-7 h-7 rounded-lg ${colour} flex items-center justify-center mb-2`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="text-lg font-bold text-slate-800">{value}</div>
      <div className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</div>
      {interactive && (
        <div className="mt-1 text-[10px] text-blue-500 flex items-center gap-0.5">
          Inspect
        </div>
      )}
    </>
  );

  if (interactive) {
    return (
      <button
        onClick={() => onClick!(metricKey!)}
        aria-label={ariaLabel ?? `Inspect ${label}`}
        className="text-left bg-white border border-slate-200 rounded-xl p-3 transition-all hover:border-blue-300 hover:shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
      >
        {content}
      </button>
    );
  }

  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-3 ${disabled ? 'opacity-50' : ''}`}>
      {content}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    completed: 'bg-emerald-100 text-emerald-700',
    running: 'bg-blue-100 text-blue-700',
    starting: 'bg-blue-100 text-blue-700',
    queued: 'bg-cyan-100 text-cyan-700',
    failed: 'bg-red-100 text-red-700',
    cancelled: 'bg-slate-100 text-slate-600',
    abandoned: 'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${colours[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: EstimateInfo['confidence'] }) {
  const colours: Record<string, string> = {
    high: 'bg-emerald-100 text-emerald-700',
    medium: 'bg-blue-100 text-blue-700',
    low: 'bg-amber-100 text-amber-700',
    calculating: 'bg-cyan-100 text-cyan-700',
    unavailable: 'bg-slate-100 text-slate-500',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${colours[confidence]}`}>
      {confidence}
    </span>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

// ─── Helper: Compute stall detection ──────────────────────────────────────────

export function detectStall(
  heartbeatAt: string | null,
  currentPhase: string | null,
  phaseStartTime: number | null,
  now: number = Date.now(),
): StallInfo | null {
  if (!heartbeatAt || !currentPhase) return null;

  const heartbeatAge = Math.round((now - new Date(heartbeatAt).getTime()) / 1000);
  const elapsedPhase = phaseStartTime ? Math.round((now - phaseStartTime) / 1000) : 0;

  if (heartbeatAge < STALL_THRESHOLD_SECONDS) return null;

  return {
    stalled: true,
    lastHeartbeatAgoSeconds: heartbeatAge,
    currentPhase,
    elapsedPhaseSeconds: elapsedPhase,
    guidance: 'Consider using Cancel to stop execution or Abandon to release the lock. If the service is still processing, wait for the next heartbeat.',
  };
}

// ─── Helper: Compute estimated remaining time ──────────────────────────────────

export function computeEstimate(
  completedPhases: number,
  totalPhases: number,
  elapsedSeconds: number,
  historicalDurations: number[],
): EstimateInfo {
  if (completedPhases === 0 || totalPhases === 0) {
    return { remainingSeconds: null, estimatedCompletion: null, confidence: 'calculating' };
  }

  const remainingPhases = totalPhases - completedPhases;

  if (historicalDurations.length > 0) {
    const avgPhaseDuration = historicalDurations.reduce((a, b) => a + b, 0) / historicalDurations.length;
    const remainingSeconds = Math.round(avgPhaseDuration * remainingPhases);
    const completionTime = new Date(Date.now() + remainingSeconds * 1000);
    const confidence = historicalDurations.length >= 3 ? 'high' : historicalDurations.length >= 1 ? 'medium' : 'low';
    return {
      remainingSeconds,
      estimatedCompletion: completionTime.toLocaleTimeString(),
      confidence,
    };
  }

  // Fall back to current rate
  if (elapsedSeconds > 0 && completedPhases > 0) {
    const avgPhaseTime = elapsedSeconds / completedPhases;
    const remainingSeconds = Math.round(avgPhaseTime * remainingPhases);
    const completionTime = new Date(Date.now() + remainingSeconds * 1000);
    return {
      remainingSeconds,
      estimatedCompletion: completionTime.toLocaleTimeString(),
      confidence: completedPhases >= 3 ? 'medium' : 'low',
    };
  }

  return { remainingSeconds: null, estimatedCompletion: null, confidence: 'unavailable' };
}
