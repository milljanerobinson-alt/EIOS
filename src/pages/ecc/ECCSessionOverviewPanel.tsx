import { useState } from 'react';
import {
  X, Shield, CheckCircle2, Clock, Lock, Star, Ban,
  RotateCcw, Play, Eye, ExternalLink, ChevronDown, ChevronRight,
  FileText, RefreshCw,
} from 'lucide-react';
import type {
  BenchmarkSession,
  BenchmarkRun,
  SessionOutcome,
} from '../../lib/atdBenchmarkService';

// ─── Config (mirrors ECCBenchmarkingPage constants) ───────────────────────────

const BENCHMARK_ORDER = ['ATD-BMK-001', 'ATD-BMK-002', 'ATD-BMK-003'];

const SESSION_OUTCOME_CONFIG: Record<SessionOutcome, { label: string; color: string; bg: string; border: string }> = {
  in_progress: { label: 'In Progress',  color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200'    },
  completed:   { label: 'Completed',    color: 'text-slate-600',   bg: 'bg-slate-50',   border: 'border-slate-200'   },
  accepted:    { label: 'Accepted',     color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  superseded:  { label: 'Superseded',   color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200'   },
  cancelled:   { label: 'Cancelled',    color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200'     },
};

const SESSION_REVIEW_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  awaiting_review:            { label: 'Awaiting Review',            color: 'text-slate-600',   bg: 'bg-slate-50',   border: 'border-slate-200'   },
  under_review:               { label: 'Under Review',               color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200'   },
  reviewed:                   { label: 'Reviewed',                   color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200'    },
  review_complete:            { label: 'Review Complete',            color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200'    },
  awaiting_po_acceptance:     { label: 'Awaiting PO Acceptance',     color: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-200'  },
  accepted:                   { label: 'Accepted',                   color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  accepted_with_observations: { label: 'Accepted with Observations', color: 'text-teal-700',    bg: 'bg-teal-50',    border: 'border-teal-200'    },
  returned_for_improvement:   { label: 'Returned for Improvement',   color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200'     },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  session: BenchmarkSession;
  runs: BenchmarkRun[];
  allSessions: BenchmarkSession[];
  onClose: () => void;
  onResume: () => void;
  onSupersede: () => void;
  onStartReplacement: () => void;
  onOpenGovernanceReview: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ECCSessionOverviewPanel({
  session,
  runs,
  allSessions,
  onClose,
  onResume,
  onSupersede,
  onStartReplacement,
  onOpenGovernanceReview,
}: Props) {
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const oc = SESSION_OUTCOME_CONFIG[session.session_outcome] ?? SESSION_OUTCOME_CONFIG.in_progress;
  const rs = SESSION_REVIEW_STATUS_CONFIG[session.overall_review_status] ?? SESSION_REVIEW_STATUS_CONFIG.awaiting_review;

  const isInProgress = session.session_outcome === 'in_progress';
  const isComplete = session.benchmarks_count >= BENCHMARK_ORDER.length;
  const isSuperseded = session.session_outcome === 'superseded';

  const sessionMap = Object.fromEntries(allSessions.map(s => [s.id, s]));
  const supersededBy = session.superseded_by_session_id ? sessionMap[session.superseded_by_session_id] : null;
  const supersedes = session.supersedes_session_id ? sessionMap[session.supersedes_session_id] : null;

  // Sort runs by benchmark order
  const sortedRuns = [...runs].sort((a, b) =>
    BENCHMARK_ORDER.indexOf(a.benchmark_id_code ?? '') - BENCHMARK_ORDER.indexOf(b.benchmark_id_code ?? '')
  );

  const nextBenchmarkNum = session.benchmarks_count + 1;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-slate-900/50" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-xl bg-white flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex-shrink-0 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-xs font-mono font-bold text-slate-500">{session.session_ref}</span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${oc.color} ${oc.bg} ${oc.border}`}>{oc.label}</span>
                  {isComplete && !isSuperseded && (
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${rs.color} ${rs.bg} ${rs.border}`}>{rs.label}</span>
                  )}
                  {session.is_baseline && (
                    <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                      <Star className="w-2.5 h-2.5" />Baseline
                    </span>
                  )}
                </div>
                <p className={`text-sm font-bold leading-snug ${isSuperseded ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                  {session.session_name}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Action bar */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            {isInProgress && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Available Actions</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={onResume}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Resume Benchmark {nextBenchmarkNum > BENCHMARK_ORDER.length ? '' : nextBenchmarkNum}
                  </button>
                  <button
                    onClick={onSupersede}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-amber-700 border border-amber-200 rounded-xl text-sm font-semibold hover:bg-amber-50 transition-colors"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Supersede Session
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {session.benchmarks_count} of {BENCHMARK_ORDER.length} benchmarks captured.
                  {session.benchmarks_count < BENCHMARK_ORDER.length && ` Benchmark ${nextBenchmarkNum} is next.`}
                </p>
              </div>
            )}

            {isComplete && !isSuperseded && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Available Actions</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={onOpenGovernanceReview}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Governance Review
                  </button>
                  <button
                    onClick={onSupersede}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-amber-700 border border-amber-200 rounded-xl text-sm font-semibold hover:bg-amber-50 transition-colors"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    Supersede Session
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">Governance review includes Independent Review, Product Owner Decision, and Governance Summary.</p>
              </div>
            )}

            {isSuperseded && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Available Actions</p>
                {!supersededBy ? (
                  <button
                    onClick={onStartReplacement}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Start Replacement Session
                  </button>
                ) : (
                  <p className="text-xs text-slate-500">This session has been replaced by <span className="font-mono font-bold text-slate-700">{supersededBy.session_ref}</span>.</p>
                )}
              </div>
            )}
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Supersession details */}
            {isSuperseded && session.supersession_reason && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1.5">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Supersession Record</p>
                <p className="text-sm text-amber-900">{session.supersession_reason}</p>
                {session.supersession_date && (
                  <p className="text-xs text-amber-600">
                    {new Date(session.supersession_date).toLocaleDateString('en-AU', { dateStyle: 'long' })}
                  </p>
                )}
                {session.supersession_notes && (
                  <p className="text-xs text-amber-800 mt-1">{session.supersession_notes}</p>
                )}
                {supersededBy && (
                  <p className="text-xs text-amber-700 mt-1 font-medium">
                    Superseded by: <span className="font-mono">{supersededBy.session_ref}</span>
                  </p>
                )}
              </div>
            )}

            {/* Replacement link */}
            {supersedes && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-2">
                <RotateCcw className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                <p className="text-xs text-blue-800">
                  Replaces superseded session <span className="font-mono font-bold">{supersedes.session_ref}</span>
                  {' — '}{supersedes.session_name}
                </p>
              </div>
            )}

            {/* Benchmark progress */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Benchmark Progress</p>
              <div className="space-y-2">
                {BENCHMARK_ORDER.map((benchId, idx) => {
                  const run = sortedRuns.find(r => r.benchmark_id_code === benchId);
                  const isCaptured = !!run;
                  const isNext = !isCaptured && idx === session.benchmarks_count;

                  return (
                    <div key={benchId} className={`border rounded-xl overflow-hidden ${
                      isCaptured ? 'border-emerald-200 bg-emerald-50/40' :
                      isNext ? 'border-blue-200 bg-blue-50/30' :
                      'border-slate-200 bg-white opacity-50'
                    }`}>
                      <div
                        className={`flex items-center justify-between px-4 py-3 ${isCaptured ? 'cursor-pointer hover:bg-emerald-50/60' : ''}`}
                        onClick={() => isCaptured && setExpandedRun(expandedRun === (run?.id ?? '') ? null : (run?.id ?? ''))}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                            isCaptured ? 'bg-emerald-500 text-white' :
                            isNext ? 'bg-blue-100 text-blue-700 border-2 border-blue-400' :
                            'bg-slate-200 text-slate-400'
                          }`}>
                            {isCaptured ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-slate-400">{benchId}</span>
                              {isNext && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Next</span>}
                            </div>
                            <p className="text-xs font-semibold text-slate-700 truncate">{run?.benchmark_name ?? `Benchmark ${idx + 1}`}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isCaptured && run && (
                            <>
                              <span className="text-xs text-slate-400">{run.response_length.toLocaleString()} chars</span>
                              <Lock className="w-3 h-3 text-slate-300" />
                              {expandedRun === run.id
                                ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                            </>
                          )}
                        </div>
                      </div>

                      {isCaptured && run && expandedRun === run.id && (
                        <div className="px-4 pb-4 pt-0 border-t border-emerald-100">
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center gap-3 text-xs text-slate-400">
                              <span>{new Date(run.execution_timestamp).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                              {run.model_used && <span>{run.model_used}</span>}
                              {run.provider_used && <span>({run.provider_used})</span>}
                            </div>
                            <div className="bg-slate-900 rounded-lg p-3 max-h-48 overflow-y-auto">
                              <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-mono">{run.ai_response}</pre>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Session metadata */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Session Details</p>
              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                {[
                  { label: 'Session Ref', value: session.session_ref, mono: true },
                  { label: 'Created', value: new Date(session.created_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' }) },
                  session.atd_version ? { label: 'ATD Version', value: session.atd_version, mono: true } : null,
                  session.ecc_version ? { label: 'ECC Version', value: session.ecc_version, mono: true } : null,
                  session.benchmark_version ? { label: 'Benchmark Suite', value: `v${session.benchmark_version}`, mono: true } : null,
                ].filter(Boolean).map((row, i) => row && (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-slate-500">{row.label}</span>
                    <span className={`text-xs font-medium text-slate-800 ${row.mono ? 'font-mono' : ''}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Version refs */}
            {(session.platform_state_id || session.context_package_id) && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Version References</p>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl divide-y divide-emerald-100">
                  {session.platform_state_id && (
                    <div className="flex items-center gap-2 px-4 py-2.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <span className="text-xs text-emerald-700">Platform State linked</span>
                    </div>
                  )}
                  {session.context_package_id && (
                    <div className="flex items-center gap-2 px-4 py-2.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <span className="text-xs text-emerald-700">Context Package linked</span>
                    </div>
                  )}
                  {session.pis_snapshot_id && (
                    <div className="flex items-center gap-2 px-4 py-2.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                      <span className="text-xs text-emerald-700">PIS Snapshot linked</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
