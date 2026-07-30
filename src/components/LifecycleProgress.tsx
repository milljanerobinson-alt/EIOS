/**
 * EWO-032R.15 — Engineering Lifecycle Progress Component
 *
 * Read-only visualisation of the lifecycle stages of an Engineering Idea.
 * All stage completion is derived from persisted governed records.
 */

import { useState, useEffect } from 'react';
import {
  CheckCircle2, Circle, Clock, AlertCircle,
  ChevronRight, Info, Loader2, Zap,
} from 'lucide-react';
import type { EngineeringIdea } from '../pages/ecc/ECCIdeaTypes';
import {
  resolveIdeaLifecycle,
  type LifecycleResolution,
  type LifecycleStage,
  type StageStatus,
} from '../lib/lifecycleProgressResolver';

const STAGE_ICONS: Record<StageStatus, typeof CheckCircle2> = {
  completed: CheckCircle2,
  current: Clock,
  pending: Circle,
  not_implemented: AlertCircle,
};

const STAGE_COLOURS: Record<StageStatus, string> = {
  completed: 'text-emerald-600',
  current: 'text-blue-600',
  pending: 'text-slate-300',
  not_implemented: 'text-amber-500',
};

export function LifecycleProgress({
  idea,
  onNavigateToEwo,
  onContinueWizard,
  onPromote,
}: {
  idea: EngineeringIdea;
  onNavigateToEwo: (ewoRef: string) => void;
  onContinueWizard: () => void;
  onPromote: () => void;
}) {
  const [resolution, setResolution] = useState<LifecycleResolution | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    resolveIdeaLifecycle(idea)
      .then(res => { if (!cancelled) { setResolution(res); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [idea]);

  if (loading || !resolution) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Resolving lifecycle progress…
        </div>
      </div>
    );
  }

  const { stages, currentStage, nextAction, nextActionAvailable, nextActionRoute, diagnostics } = resolution;

  function handleNextAction() {
    if (!nextActionAvailable || !nextActionRoute) return;
    switch (nextActionRoute) {
      case 'wizard':
        onContinueWizard();
        break;
      case 'ewo':
        if (idea.related_ewo_refs.length > 0) {
          onNavigateToEwo(idea.related_ewo_refs[0]);
        }
        break;
      case 'promote':
        onPromote();
        break;
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-blue-500" />
            <h3 className="text-xs font-semibold text-slate-700">Engineering Lifecycle Progress</h3>
          </div>
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
          >
            <Info className="w-3 h-3" />
            {showDiagnostics ? 'Hide' : 'Diagnostics'}
          </button>
        </div>
      </div>

      {/* Current Stage + Next Action */}
      <div className="px-4 py-3 bg-blue-50/50 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Current Stage</p>
            <p className="text-sm font-bold text-slate-800">{currentStage.label}</p>
          </div>
          <div className="text-right min-w-0">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Next Action</p>
            {nextActionAvailable ? (
              <button
                onClick={handleNextAction}
                className="flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 transition-colors group"
              >
                {nextAction}
                <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </button>
            ) : (
              <p className="text-xs text-slate-500">{nextAction}</p>
            )}
          </div>
        </div>
      </div>

      {/* Stage List */}
      <div className="px-4 py-3">
        <div className="space-y-1">
          {stages.map((stage: LifecycleStage, idx: number) => {
            const Icon = STAGE_ICONS[stage.status];
            const colour = STAGE_COLOURS[stage.status];
            const isCurrent = stage.id === currentStage.id;
            const isLast = idx === stages.length - 1;

            return (
              <div key={stage.id}>
                <div className="flex items-center gap-2.5 py-1">
                  {/* Icon */}
                  <div className={`flex-shrink-0 ${colour}`}>
                    {stage.status === 'current' ? (
                      <Clock className="w-3.5 h-3.5 animate-pulse" />
                    ) : (
                      <Icon className={`w-3.5 h-3.5 ${stage.status === 'completed' ? 'text-emerald-600' : ''}`} />
                    )}
                  </div>

                  {/* Label */}
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs ${isCurrent ? 'font-bold text-slate-800' : stage.status === 'completed' ? 'font-medium text-slate-600' : 'text-slate-400'}`}>
                      {stage.label}
                    </span>
                    {stage.evidenceSource && (
                      <span className="text-[10px] text-slate-300 ml-1.5" title={stage.evidenceSource}>
                        · {stage.evidenceSource.length > 40 ? stage.evidenceSource.slice(0, 40) + '…' : stage.evidenceSource}
                      </span>
                    )}
                  </div>

                  {/* Status indicator */}
                  {stage.status === 'completed' && (
                    <span className="text-[10px] text-emerald-600 font-medium">✓</span>
                  )}
                  {isCurrent && (
                    <span className="text-[10px] text-blue-600 font-medium uppercase tracking-wide">Current</span>
                  )}
                </div>

                {/* Connector line */}
                {!isLast && (
                  <div className={`ml-[7px] w-px h-2 ${stage.status === 'completed' ? 'bg-emerald-200' : 'bg-slate-100'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Execution gap notice */}
      {currentStage.id === 'ewo_created' && (
        <div className="mx-4 mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
          <p className="text-[10px] text-amber-700 leading-relaxed">
            Execution Preparation and Execution actions are implemented on the
            Engineering Work Orders page, not from this view. Open the linked
            Work Order to continue the execution workflow.
          </p>
        </div>
      )}

      {/* Diagnostics (collapsible) */}
      {showDiagnostics && (
        <div className="border-t border-slate-200 bg-slate-900 px-4 py-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Runtime Diagnostics</p>
          <div className="space-y-1.5 text-[10px] font-mono text-slate-300">
            <DiagRow label="idea_ref" value={diagnostics.idea_ref} />
            <DiagRow label="resolved_current_stage" value={diagnostics.resolved_current_stage} />
            <DiagRow label="completed_stages" value={diagnostics.completed_stages.join(', ')} />
            <DiagRow label="next_action" value={diagnostics.next_action} />
            <DiagRow label="next_action_available" value={String(diagnostics.next_action_available)} />
            <DiagRow label="next_action_route" value={diagnostics.next_action_route ?? 'null'} />
            <DiagRow label="execution_preparation_implemented" value={String(diagnostics.execution_preparation_implemented)} />
            <DiagRow label="execution_readiness_implemented" value={String(diagnostics.execution_readiness_implemented)} />
            <DiagRow label="execute_action_implemented" value={String(diagnostics.execute_action_implemented)} />
            <DiagRow label="execution_runtime_connected" value={String(diagnostics.execution_runtime_connected)} />
          </div>

          {diagnostics.resolution_sources.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Resolution Sources</p>
              <div className="space-y-0.5">
                {diagnostics.resolution_sources.map((src, i) => (
                  <p key={i} className="text-[10px] font-mono text-slate-400">· {src}</p>
                ))}
              </div>
            </div>
          )}

          {diagnostics.missing_expected_records.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide mb-1">Missing Expected Records</p>
              <div className="space-y-0.5">
                {diagnostics.missing_expected_records.map((m, i) => (
                  <p key={i} className="text-[10px] font-mono text-amber-400">· {m}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-slate-500 flex-shrink-0">{label}:</span>
      <span className="text-slate-300 break-all">{value}</span>
    </div>
  );
}
