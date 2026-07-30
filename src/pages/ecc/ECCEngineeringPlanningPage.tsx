import { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, BarChart3, Brain, Check,
  CheckCircle2, ChevronRight, Circle, Clock, Flag,
  GitBranch, History, Layers, Link2, Loader2, Play,
  RefreshCw, Shield, TrendingUp, X, Zap, Target,
  ArrowRight, Info, ListOrdered, Network,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  runProgrammeAnalysis,
  type EpreRecommendation,
  type ScoredEWO,
  type EWO,
  type ProgrammeHealth,
} from '../../lib/epreService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(ts: string): string {
  return new Date(ts).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const PRIORITY_CFG = {
  critical: { dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200'    },
  high:     { dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  medium:   { dot: 'bg-amber-500',  text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
  low:      { dot: 'bg-slate-400',  text: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-200'  },
};

const STATUS_CFG: Record<string, { label: string; dot: string; text: string }> = {
  draft:                  { label: 'Draft',              dot: 'bg-slate-400',   text: 'text-slate-600'   },
  architecture_review:    { label: 'Arch Review',        dot: 'bg-orange-400',  text: 'text-orange-700'  },
  engineering_approved:   { label: 'Eng Approved',       dot: 'bg-blue-500',    text: 'text-blue-700'    },
  po_approved:            { label: 'PO Approved',        dot: 'bg-cyan-500',    text: 'text-cyan-700'    },
  ready:                  { label: 'Ready',              dot: 'bg-teal-500',    text: 'text-teal-700'    },
  in_progress:            { label: 'In Progress',        dot: 'bg-amber-500',   text: 'text-amber-700'   },
  engineering_validation: { label: 'Validation',         dot: 'bg-violet-500',  text: 'text-violet-700'  },
  report_generated:       { label: 'Report Ready',       dot: 'bg-indigo-500',  text: 'text-indigo-700'  },
  po_acceptance:          { label: 'PO Acceptance',      dot: 'bg-purple-500',  text: 'text-purple-700'  },
  closed:                 { label: 'Closed',             dot: 'bg-emerald-500', text: 'text-emerald-700' },
  archived:               { label: 'Archived',           dot: 'bg-slate-300',   text: 'text-slate-400'   },
};

function StatusDot({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { dot: 'bg-slate-400', text: 'text-slate-500', label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function PriorityChip({ priority }: { priority: string }) {
  const cfg = PRIORITY_CFG[priority as keyof typeof PRIORITY_CFG] ?? PRIORITY_CFG.medium;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}

// ─── Health Gauge ─────────────────────────────────────────────────────────────

function HealthGauge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-red-600';
  const ring = score >= 80 ? 'stroke-emerald-500' : score >= 60 ? 'stroke-amber-500' : 'stroke-red-500';
  const label = score >= 80 ? 'Healthy' : score >= 60 ? 'Fair' : 'At Risk';
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
          <circle
            cx="32" cy="32" r={r} fill="none" className={ring}
            strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-lg font-bold ${color}`}>{Math.round(score)}</span>
        </div>
      </div>
      <p className={`text-xs font-semibold mt-1 ${color}`}>{label}</p>
    </div>
  );
}

// ─── Recommendation Card ──────────────────────────────────────────────────────

function RecommendationCard({ rec }: { rec: EpreRecommendation }) {
  const ewo = rec.recommendedEwo;
  const [expanded, setExpanded] = useState(false);

  if (!ewo) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center">
        <Circle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
        <p className="text-sm font-medium text-slate-500">No actionable work orders found.</p>
        <p className="text-xs text-slate-400 mt-1">Create Engineering Work Orders via the EEE to enable recommendations.</p>
      </div>
    );
  }

  const pCfg = PRIORITY_CFG[ewo.priority as keyof typeof PRIORITY_CFG] ?? PRIORITY_CFG.medium;
  const sCfg = STATUS_CFG[ewo.status] ?? STATUS_CFG['draft'];

  return (
    <div className={`rounded-2xl border-2 overflow-hidden shadow-sm ${pCfg.border}`}>
      {/* Header band */}
      <div className={`px-5 py-3 ${pCfg.bg} border-b ${pCfg.border} flex items-center gap-3`}>
        <div className={`w-8 h-8 rounded-xl ${pCfg.bg} border ${pCfg.border} flex items-center justify-center shrink-0`}>
          <Target className={`w-4 h-4 ${pCfg.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">EPRE Recommended Next Work Order</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs font-bold font-mono ${pCfg.text}`}>{ewo.ewo_ref}</span>
            <PriorityChip priority={ewo.priority} />
            <StatusDot status={ewo.status} />
          </div>
        </div>
        <span className={`text-2xl font-black ${pCfg.text}`}>{rec.scoredProgramme.find(s => s.ewo.id === ewo.id)?.score ?? '—'}</span>
      </div>

      {/* Body */}
      <div className="bg-white px-5 py-4 space-y-3">
        <h3 className="text-base font-semibold text-slate-900">{ewo.title}</h3>

        <p className="text-sm text-slate-600 leading-relaxed">{rec.execSummary}</p>

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {[
            { label: 'Business Value', value: rec.businessValue },
            { label: 'Engineering Value', value: rec.engineeringValue },
            { label: 'Estimated Effort', value: rec.estimatedEffort },
            { label: 'Estimated Risk', value: rec.estimatedRisk },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
              <p className="text-xs text-slate-700 mt-0.5 leading-snug">{value}</p>
            </div>
          ))}
        </div>

        {/* Recommended Next Action */}
        <div className="flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <ArrowRight className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wide">Recommended Next Action</p>
            <p className="text-xs text-blue-800 mt-0.5 leading-snug">{rec.recommendedNextAction}</p>
          </div>
        </div>

        {/* Expandable reasoning */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          <Info className="w-3.5 h-3.5" />
          {expanded ? 'Hide reasoning' : 'Show scoring reasoning'}
        </button>

        {expanded && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">EPRE Scoring Analysis</p>
            <p className="text-xs text-slate-600 leading-relaxed">{rec.reasoning}</p>
            {rec.scoredProgramme.find(s => s.ewo.id === ewo.id)?.reasoning.map((r, i) => (
              <div key={i} className="flex items-start gap-2 mt-1.5">
                <span className="w-1 h-1 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                <span className="text-xs text-slate-500">{r}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Priority Queue ───────────────────────────────────────────────────────────

function PriorityQueuePanel({ queue, recommendedRef }: { queue: ScoredEWO[]; recommendedRef?: string }) {
  if (queue.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
        <p className="text-xs text-slate-400">No additional work orders in the priority queue.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <ListOrdered className="w-4 h-4 text-blue-500" />
        <h3 className="text-sm font-semibold text-slate-800">Priority Queue</h3>
        <span className="ml-auto text-xs text-slate-400">Next {queue.length}</span>
      </div>
      <div className="divide-y divide-slate-50">
        {queue.map((s, idx) => (
          <div key={s.ewo.id} className="flex items-center gap-3 px-4 py-3">
            <span className="text-xs font-bold text-slate-300 w-4 shrink-0">{idx + 2}</span>
            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold text-slate-400 font-mono">{s.ewo.ewo_ref}</span>
                <PriorityChip priority={s.ewo.priority} />
                <StatusDot status={s.ewo.status} />
              </div>
              <p className="text-xs font-medium text-slate-700 truncate">{s.ewo.title}</p>
            </div>
            <span className="text-xs font-semibold text-slate-400 shrink-0">{s.score} pts</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Blocked Work Panel ───────────────────────────────────────────────────────

function BlockedWorkPanel({ blocked }: { blocked: ScoredEWO[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <AlertTriangle className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-800">Blocked Work</h3>
        <span className="ml-auto text-xs text-slate-400">{blocked.length}</span>
      </div>
      {blocked.length === 0 ? (
        <div className="p-4 text-center">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
          <p className="text-xs text-slate-400">No blocked work orders.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {blocked.map(s => (
            <div key={s.ewo.id} className="px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold text-slate-400 font-mono">{s.ewo.ewo_ref}</span>
                <PriorityChip priority={s.ewo.priority} />
              </div>
              <p className="text-xs font-medium text-slate-700 mb-1.5">{s.ewo.title}</p>
              <div className="flex items-start gap-1.5">
                <Link2 className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-amber-700">
                  Waiting on: {s.blockingDependencies.join(', ')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dependency Graph Panel ───────────────────────────────────────────────────

function DependencyGraphPanel({ edges, ewos }: {
  edges: { from: string; to: string; resolved: boolean }[];
  ewos: EWO[];
}) {
  const ewoMap = Object.fromEntries(ewos.map(e => [e.ewo_ref, e]));
  const unresolved = edges.filter(e => !e.resolved);
  const resolved = edges.filter(e => e.resolved);

  if (edges.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
        <Network className="w-5 h-5 text-slate-200 mx-auto mb-1" />
        <p className="text-xs text-slate-400">No dependency relationships defined.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <GitBranch className="w-4 h-4 text-blue-500" />
        <h3 className="text-sm font-semibold text-slate-800">Dependency Analysis</h3>
        <span className="ml-auto text-xs text-slate-400">{edges.length} edges</span>
      </div>
      <div className="p-4 space-y-2">
        {unresolved.length > 0 && (
          <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wide mb-1">Unresolved</p>
        )}
        {unresolved.map((e, i) => (
          <div key={i} className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
            <span className="text-[10px] font-bold text-slate-600 font-mono">{e.from}</span>
            <ArrowRight className="w-3 h-3 text-amber-500" />
            <span className="text-[10px] font-bold text-amber-700 font-mono">{e.to}</span>
            <span className="text-[10px] text-amber-600 ml-auto">pending</span>
          </div>
        ))}
        {resolved.length > 0 && (
          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide mt-2 mb-1">Resolved</p>
        )}
        {resolved.map((e, i) => (
          <div key={i} className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
            <span className="text-[10px] font-bold text-slate-600 font-mono">{e.from}</span>
            <ArrowRight className="w-3 h-3 text-emerald-500" />
            <span className="text-[10px] font-bold text-emerald-700 font-mono">{e.to}</span>
            <Check className="w-3 h-3 text-emerald-500 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Health Panel ─────────────────────────────────────────────────────────────

function HealthPanel({ health }: { health: ProgrammeHealth }) {
  const metrics = [
    { label: 'Active',      value: health.activeEwos,      icon: Activity,    color: 'text-blue-600',    bg: 'bg-blue-50'    },
    { label: 'In Progress', value: health.inProgressCount, icon: Zap,         color: 'text-amber-600',   bg: 'bg-amber-50'   },
    { label: 'Blocked',     value: health.blockedCount,    icon: AlertTriangle,color: 'text-red-600',    bg: 'bg-red-50'     },
    { label: 'Completed',   value: health.completedCount,  icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <Shield className="w-4 h-4 text-blue-500" />
        <h3 className="text-sm font-semibold text-slate-800">Engineering Health</h3>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-4 mb-4">
          <HealthGauge score={health.healthScore} />
          <div className="flex-1 space-y-1.5">
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-slate-500">Completion Rate</span>
                <span className="text-[10px] font-semibold text-slate-700">{health.completionRate}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${health.completionRate}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-slate-500">Velocity (30d)</span>
                <span className="text-[10px] font-semibold text-slate-700">{health.velocity30d} closed</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${Math.min(health.velocity30d * 20, 100)}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {metrics.map(m => {
            const Icon = m.icon;
            return (
              <div key={m.label} className={`flex items-center gap-2 p-2 ${m.bg} rounded-lg`}>
                <Icon className={`w-3.5 h-3.5 ${m.color}`} />
                <div>
                  <p className="text-lg font-bold text-slate-800">{m.value}</p>
                  <p className="text-[10px] text-slate-500">{m.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Velocity Panel ───────────────────────────────────────────────────────────

function VelocityPanel({ health, ewos }: { health: ProgrammeHealth; ewos: EWO[] }) {
  const recent = ewos
    .filter(e => e.status === 'closed')
    .sort((a, b) => new Date(b.closed_at || b.created_at).getTime() - new Date(a.closed_at || a.created_at).getTime())
    .slice(0, 4);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <TrendingUp className="w-4 h-4 text-emerald-500" />
        <h3 className="text-sm font-semibold text-slate-800">Recently Completed</h3>
      </div>
      {recent.length === 0 ? (
        <div className="p-4 text-center">
          <Circle className="w-5 h-5 text-slate-200 mx-auto mb-1" />
          <p className="text-xs text-slate-400">No completed work orders yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {recent.map(e => (
            <div key={e.id} className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="text-[10px] font-bold text-slate-400 font-mono">{e.ewo_ref}</span>
                <PriorityChip priority={e.priority} />
              </div>
              <p className="text-xs font-medium text-slate-700 mt-0.5 truncate">{e.title}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(e.closed_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Recommendation History Panel ─────────────────────────────────────────────

function RecommendationHistory() {
  const [runs, setRuns] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('epre_recommendations')
      .select('id, run_ref, recommended_ewo_ref, recommended_title, health_score, ewos_closed_30d, total_ewos, blocked_count, created_at')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => { setRuns(data ?? []); setLoading(false); });
  }, []);

  if (loading) return <div className="flex items-center justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-slate-300" /></div>;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <History className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-800">Recommendation History</h3>
        <span className="ml-auto text-xs text-slate-400">{runs.length}</span>
      </div>
      {runs.length === 0 ? (
        <div className="p-4 text-center">
          <Brain className="w-5 h-5 text-slate-200 mx-auto mb-1" />
          <p className="text-xs text-slate-400">No analysis runs yet. Run the Planning Engine to generate the first recommendation.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {runs.map(r => (
            <button
              key={r.id as string}
              onClick={() => setExpanded(exp => exp === r.id ? null : r.id as string)}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 font-mono">{r.run_ref as string}</span>
                <span className="text-[10px] text-slate-400">{fmtDateTime(r.created_at as string)}</span>
              </div>
              {r.recommended_ewo_ref ? (
                <p className="text-xs font-medium text-slate-700 mt-0.5">
                  <span className="font-bold text-blue-600">{r.recommended_ewo_ref as string}</span>
                  {r.recommended_title ? ` · ${(r.recommended_title as string).substring(0, 40)}…` : ''}
                </p>
              ) : (
                <p className="text-xs text-slate-400 mt-0.5">No recommendation generated</p>
              )}
              {expanded === r.id && (
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: 'Total EWOs', value: r.total_ewos },
                    { label: 'Blocked', value: r.blocked_count },
                    { label: 'Health', value: `${Math.round(r.health_score as number)}` },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-50 rounded-lg p-1.5">
                      <p className="text-sm font-bold text-slate-700">{value as string}</p>
                      <p className="text-[9px] text-slate-400">{label}</p>
                    </div>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Full Programme Panel ─────────────────────────────────────────────────────

function ProgrammePanel({ scored }: { scored: ScoredEWO[] }) {
  const all = [...scored].filter(s => s.score > -999 || s.isBlocked);
  all.sort((a, b) => {
    if (a.isBlocked && !b.isBlocked) return 1;
    if (!a.isBlocked && b.isBlocked) return -1;
    return b.score - a.score;
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <Layers className="w-4 h-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-800">Full Programme Scoring</h3>
        <span className="ml-auto text-xs text-slate-400">{all.length} EWOs</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {['Rank', 'EWO', 'Title', 'Priority', 'Status', 'Score', 'Blocked'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-slate-500 uppercase tracking-wide text-[9px] whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {all.map((s, idx) => (
              <tr key={s.ewo.id} className={s.isBlocked ? 'bg-amber-50/40' : 'hover:bg-slate-50'}>
                <td className="px-3 py-2 font-bold text-slate-300">{idx + 1}</td>
                <td className="px-3 py-2 font-mono font-bold text-slate-500 whitespace-nowrap">{s.ewo.ewo_ref}</td>
                <td className="px-3 py-2 text-slate-700 max-w-[200px] truncate">{s.ewo.title}</td>
                <td className="px-3 py-2 whitespace-nowrap"><PriorityChip priority={s.ewo.priority} /></td>
                <td className="px-3 py-2 whitespace-nowrap"><StatusDot status={s.ewo.status} /></td>
                <td className="px-3 py-2 font-bold text-slate-700 whitespace-nowrap">{s.score}</td>
                <td className="px-3 py-2">
                  {s.isBlocked
                    ? <span className="text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{s.blockingDependencies.join(', ')}</span>
                    : <Check className="w-3.5 h-3.5 text-emerald-500" />
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ECCEngineeringPlanningPage() {
  const [ewos, setEwos] = useState<EWO[]>([]);
  const [rec, setRec] = useState<EpreRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [showFullProgramme, setShowFullProgramme] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [ewoRes, lastRunRes] = await Promise.all([
      supabase.from('engineering_work_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('epre_recommendations').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const loadedEwos = (ewoRes.data ?? []) as EWO[];
    setEwos(loadedEwos);

    if (lastRunRes.data) {
      setLastRunAt(lastRunRes.data.created_at as string);

      // Reconstruct recommendation from persisted data
      const d = lastRunRes.data as Record<string, unknown>;
      const topEwo = loadedEwos.find(e => e.ewo_ref === d.recommended_ewo_ref) ?? null;

      // Rebuild scored from stored JSON
      const storedScored = (d.scored_programme as { ewo_ref: string; score: number; isBlocked: boolean; blockingDependencies: string[]; readinessLevel: number; reasoning: string[] }[] ?? []);
      const scoredProgramme: ScoredEWO[] = storedScored.map(s => {
        const ewo = loadedEwos.find(e => e.ewo_ref === s.ewo_ref);
        if (!ewo) return null;
        return { ewo, score: s.score, isBlocked: s.isBlocked, blockingDependencies: s.blockingDependencies, readinessLevel: s.readinessLevel, reasoning: s.reasoning };
      }).filter(Boolean) as ScoredEWO[];

      const storedGraph = d.dependency_graph as Record<string, string[]> ?? {};
      const depEdges: { from: string; to: string; resolved: boolean }[] = [];
      const closedRefs = new Set(loadedEwos.filter(e => ['closed', 'archived'].includes(e.status)).map(e => e.ewo_ref));
      for (const [from, deps] of Object.entries(storedGraph)) {
        for (const to of deps) {
          depEdges.push({ from, to, resolved: closedRefs.has(to) });
        }
      }

      const health: ProgrammeHealth = {
        totalEwos: (d.total_ewos as number) ?? 0,
        activeEwos: (d.active_ewos as number) ?? 0,
        inProgressCount: (d.in_progress_count as number) ?? 0,
        blockedCount: (d.blocked_count as number) ?? 0,
        completedCount: (d.completed_count as number) ?? 0,
        archivedCount: loadedEwos.filter(e => e.status === 'archived').length,
        healthScore: parseFloat(String(d.health_score ?? 0)),
        velocity30d: (d.ewos_closed_30d as number) ?? 0,
        started30d: (d.ewos_started_30d as number) ?? 0,
        criticalCount: loadedEwos.filter(e => e.priority === 'critical' && !['closed', 'archived'].includes(e.status)).length,
        highCount: loadedEwos.filter(e => e.priority === 'high' && !['closed', 'archived'].includes(e.status)).length,
        completionRate: loadedEwos.length > 0 ? Math.round((loadedEwos.filter(e => e.status === 'closed').length / loadedEwos.length) * 100) : 0,
      };

      const blocked = scoredProgramme.filter(s => s.isBlocked);
      const unblocked = scoredProgramme.filter(s => !s.isBlocked && s.score > -999);
      const sorted = [...unblocked].sort((a, b) => b.score - a.score);
      const queue = topEwo ? sorted.filter(s => s.ewo.id !== topEwo.id).slice(0, 5) : sorted.slice(0, 5);

      setRec({
        runRef: d.run_ref as string,
        recommendedEwo: topEwo,
        execSummary: (d.exec_summary as string) ?? '',
        businessValue: (d.business_value as string) ?? '',
        engineeringValue: (d.engineering_value as string) ?? '',
        strategicAlignment: (d.strategic_alignment as string) ?? '',
        estimatedEffort: (d.estimated_effort as string) ?? '',
        estimatedRisk: (d.estimated_risk as string) ?? '',
        reasoning: (d.reasoning as string) ?? '',
        recommendedNextAction: (d.recommended_next_action as string) ?? '',
        scoredProgramme,
        blockedEwos: blocked,
        highPriorityQueue: queue,
        dependencyGraph: storedGraph,
        dependencyEdges: depEdges,
        health,
        analysisNotes: (d.analysis_notes as string) ?? '',
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleRunAnalysis() {
    setRunning(true);
    try {
      const result = await runProgrammeAnalysis(ewos);
      setRec(result);
      setLastRunAt(new Date().toISOString());
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Engineering Planning</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Engineering Planning & Recommendation Engine · EPRE-v1.0
              {lastRunAt && <> · Last run: {fmtDateTime(lastRunAt)}</>}
            </p>
          </div>
          <button
            onClick={handleRunAnalysis}
            disabled={running || ewos.length === 0}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {running
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Analysing Programme…</>
              : <><Play className="w-4 h-4" /> Analyse Programme</>
            }
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!rec ? (
          <div className="flex flex-col items-center justify-center h-full p-12 text-center">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
              <Brain className="w-8 h-8 text-blue-400" />
            </div>
            <h2 className="text-base font-semibold text-slate-700 mb-2">No Analysis Run Yet</h2>
            <p className="text-sm text-slate-400 max-w-sm mb-6">
              Click "Analyse Programme" to run the EPRE. It will evaluate all Engineering Work Orders and recommend the highest-value next action.
            </p>
            <button
              onClick={handleRunAnalysis}
              disabled={running || ewos.length === 0}
              className="btn-primary flex items-center gap-2"
            >
              {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Running…</> : <><Play className="w-4 h-4" /> Run First Analysis</>}
            </button>
            {ewos.length === 0 && (
              <p className="text-xs text-slate-400 mt-3">Create Engineering Work Orders in the EEE first.</p>
            )}
          </div>
        ) : (
          <div className="p-5 space-y-5 max-w-screen-xl mx-auto">

            {/* Top summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Work Orders', value: rec.health.totalEwos,       color: 'text-slate-700',   bg: 'bg-white',         icon: Layers      },
                { label: 'Active',            value: rec.health.activeEwos,      color: 'text-blue-700',    bg: 'bg-blue-50',       icon: Activity    },
                { label: 'Blocked',           value: rec.health.blockedCount,    color: 'text-amber-700',   bg: 'bg-amber-50',      icon: AlertTriangle },
                { label: 'Velocity (30d)',    value: rec.health.velocity30d,     color: 'text-emerald-700', bg: 'bg-emerald-50',    icon: TrendingUp  },
              ].map(s => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className={`${s.bg} border border-slate-200 rounded-xl p-4`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-4 h-4 ${s.color}`} />
                      <p className="text-xs text-slate-500">{s.label}</p>
                    </div>
                    <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                  </div>
                );
              })}
            </div>

            {/* Analysis badge */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-100 rounded-xl text-xs text-slate-500">
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="font-mono">{rec.runRef}</span>
              <span>·</span>
              <span>{rec.analysisNotes}</span>
              <button
                onClick={handleRunAnalysis}
                disabled={running}
                className="ml-auto flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} /> Re-run
              </button>
            </div>

            {/* Main grid */}
            <div className="grid lg:grid-cols-3 gap-5">

              {/* Left 2/3 */}
              <div className="lg:col-span-2 space-y-5">
                <RecommendationCard rec={rec} />
                <PriorityQueuePanel queue={rec.highPriorityQueue} recommendedRef={rec.recommendedEwo?.ewo_ref} />
                <BlockedWorkPanel blocked={rec.blockedEwos} />
                <DependencyGraphPanel edges={rec.dependencyEdges} ewos={ewos} />

                {/* Full programme toggle */}
                <div>
                  <button
                    onClick={() => setShowFullProgramme(s => !s)}
                    className="flex items-center gap-2 text-xs font-medium text-blue-600 hover:text-blue-700 mb-3"
                  >
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showFullProgramme ? 'rotate-90' : ''}`} />
                    {showFullProgramme ? 'Hide' : 'Show'} Full Programme Scoring
                  </button>
                  {showFullProgramme && <ProgrammePanel scored={rec.scoredProgramme} />}
                </div>
              </div>

              {/* Right 1/3 */}
              <div className="space-y-5">
                <HealthPanel health={rec.health} />
                <VelocityPanel health={rec.health} ewos={ewos} />
                <RecommendationHistory />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
