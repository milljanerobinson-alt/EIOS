import { useState, useEffect, useCallback } from 'react';
import {
  Brain, Target, Users, DollarSign, TrendingUp, ShieldCheck,
  AlertTriangle, CheckCircle2, Clock, Layers, Zap, BookOpen,
  BarChart3, GitBranch, Package, ChevronDown, ChevronRight,
  RefreshCw, Plus, ArrowRight, Circle, Info,
} from 'lucide-react';
import {
  assembleProductIntelligence,
  generateSnapshot,
  type ProductIntelligence,
  type VisionItem,
  type CustomerSegment,
  type CommercialItem,
  type CompetitiveAdvantage,
  type ProductConstraint,
  type LaunchBlocker,
  type ProductModule,
  type EnrichedCapability,
  type ProductRelationship,
  type PisSnapshot,
} from '../../lib/pisService';

// ─── Constants ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'capabilities' | 'roadmap' | 'intelligence' | 'governance' | 'snapshots';

const TABS: { key: Tab; label: string; icon: typeof Brain }[] = [
  { key: 'overview',      label: 'Overview',         icon: Brain       },
  { key: 'capabilities',  label: 'Capabilities',     icon: Layers      },
  { key: 'roadmap',       label: 'Roadmap',          icon: GitBranch   },
  { key: 'intelligence',  label: 'Market Intel',     icon: Target      },
  { key: 'governance',    label: 'Governance',       icon: ShieldCheck },
  { key: 'snapshots',     label: 'Snapshots',        icon: BookOpen    },
];

const MATURITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  concept:          { label: 'Concept',          color: 'text-slate-600',   bg: 'bg-slate-50',    border: 'border-slate-200' },
  developing:       { label: 'Developing',       color: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-200'  },
  maturing:         { label: 'Maturing',         color: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200' },
  production_ready: { label: 'Production Ready', color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200' },
};

const STRENGTH_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  high:   { label: 'High',   color: 'text-emerald-700', dot: 'bg-emerald-500' },
  medium: { label: 'Medium', color: 'text-amber-700',   dot: 'bg-amber-400'   },
  low:    { label: 'Low',    color: 'text-slate-500',   dot: 'bg-slate-300'   },
};

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: 'Critical', color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200'    },
  high:     { label: 'High',     color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  medium:   { label: 'Medium',   color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
  low:      { label: 'Low',      color: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-200'  },
};

const STATUS_BLOCKER_CONFIG: Record<string, { label: string; color: string }> = {
  open:        { label: 'Open',        color: 'text-red-600'     },
  in_progress: { label: 'In Progress', color: 'text-amber-600'   },
  resolved:    { label: 'Resolved',    color: 'text-emerald-600' },
};

const CRITICALITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  launch_critical: { label: 'Launch Critical', color: 'text-red-700',    bg: 'bg-red-50'    },
  important:       { label: 'Important',        color: 'text-amber-700',  bg: 'bg-amber-50'  },
  nice_to_have:    { label: 'Nice to Have',     color: 'text-slate-600',  bg: 'bg-slate-100' },
};

const FEATURE_STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  live:          { label: 'Live',          color: 'text-emerald-700', dot: 'bg-emerald-500' },
  production:    { label: 'Production',    color: 'text-emerald-700', dot: 'bg-emerald-500' },
  in_progress:   { label: 'In Progress',   color: 'text-blue-700',    dot: 'bg-blue-500'    },
  in_development:{ label: 'In Dev',        color: 'text-blue-700',    dot: 'bg-blue-500'    },
  planned:       { label: 'Planned',       color: 'text-slate-600',   dot: 'bg-slate-400'   },
  backlog:       { label: 'Backlog',       color: 'text-slate-500',   dot: 'bg-slate-300'   },
  deferred:      { label: 'Deferred',      color: 'text-amber-700',   dot: 'bg-amber-400'   },
  verified:      { label: 'Verified',      color: 'text-emerald-700', dot: 'bg-emerald-500' },
  archived:      { label: 'Archived',      color: 'text-slate-400',   dot: 'bg-slate-200'   },
};

const CONSTRAINT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  product:       { label: 'Product',       color: 'text-blue-700'    },
  commercial:    { label: 'Commercial',    color: 'text-emerald-700' },
  engineering:   { label: 'Engineering',   color: 'text-purple-700'  },
  deferred_idea: { label: 'Deferred Idea', color: 'text-amber-700'   },
  rejected_idea: { label: 'Rejected',      color: 'text-red-700'     },
  assumption:    { label: 'Assumption',    color: 'text-slate-600'   },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function LaunchReadinessRing({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="100" height="100" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="10" />
      <circle
        cx="50" cy="50" r={r} fill="none"
        stroke={color} strokeWidth="10"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dasharray 0.8s ease' }}
      />
      <text x="50" y="47" textAnchor="middle" fontSize="18" fontWeight="700" fill={color}>{score}</text>
      <text x="50" y="61" textAnchor="middle" fontSize="9" fill="#94a3b8">/ 100</text>
    </svg>
  );
}

function KpiCard({ label, value, sub, icon: Icon, color = 'blue' }: {
  label: string; value: string | number; sub?: string;
  icon: typeof Brain; color?: 'blue' | 'emerald' | 'amber' | 'red' | 'purple' | 'slate';
}) {
  const colorMap = {
    blue:    { bg: 'bg-blue-50',    icon: 'text-blue-600',    val: 'text-blue-900'    },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', val: 'text-emerald-900' },
    amber:   { bg: 'bg-amber-50',   icon: 'text-amber-600',   val: 'text-amber-900'   },
    red:     { bg: 'bg-red-50',     icon: 'text-red-600',     val: 'text-red-900'     },
    purple:  { bg: 'bg-purple-50',  icon: 'text-purple-600',  val: 'text-purple-900'  },
    slate:   { bg: 'bg-slate-50',   icon: 'text-slate-600',   val: 'text-slate-900'   },
  };
  const c = colorMap[color];
  return (
    <div className={`${c.bg} rounded-xl p-4 border border-white`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <Icon className={`w-4 h-4 ${c.icon}`} />
      </div>
      <p className={`text-2xl font-bold ${c.val}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function VisionSection({ items }: { items: VisionItem[] }) {
  const byDomain = items.reduce<Record<string, VisionItem[]>>((acc, v) => {
    if (!acc[v.domain]) acc[v.domain] = [];
    acc[v.domain].push(v);
    return acc;
  }, {});

  const domainOrder = ['vision', 'mission', 'purpose', 'customer_promise', 'objective', 'principle', 'success_metric'];
  const domainLabel: Record<string, string> = {
    vision: 'Vision', mission: 'Mission', purpose: 'Purpose',
    customer_promise: 'Customer Promise', objective: 'Strategic Objectives',
    principle: 'Product Principles', success_metric: 'Success Metrics',
  };

  return (
    <div className="space-y-5">
      {domainOrder.filter(d => byDomain[d]).map(domain => (
        <div key={domain}>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{domainLabel[domain] ?? domain}</p>
          <div className="space-y-2">
            {byDomain[domain].map(item => (
              <div key={item.id} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                {byDomain[domain].length > 1 && (
                  <p className="text-xs font-semibold text-slate-600 mb-1">{item.title}</p>
                )}
                <p className="text-sm text-slate-700 leading-relaxed">{item.content}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CustomerCard({ segment }: { segment: CustomerSegment }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left p-4 flex items-start justify-between hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-800">{segment.segment_name}</p>
              {segment.is_primary && (
                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Primary</span>
              )}
              {segment.persona_type && segment.persona_type !== 'primary' && (
                <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded capitalize">{segment.persona_type}</span>
              )}
            </div>
            {segment.description && (
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{segment.description}</p>
            )}
          </div>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          {segment.problems.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-600 mb-1.5">Problems We Solve</p>
              <ul className="space-y-1">
                {segment.problems.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                    <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {segment.desired_outcomes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-emerald-600 mb-1.5">Desired Outcomes</p>
              <ul className="space-y-1">
                {segment.desired_outcomes.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0 mt-0.5" />
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {segment.adoption_drivers.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-blue-600 mb-1.5">Adoption Drivers</p>
              <ul className="space-y-1">
                {segment.adoption_drivers.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                    <ArrowRight className="w-3 h-3 text-blue-400 flex-shrink-0 mt-0.5" />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompetitiveTable({ advantages }: { advantages: CompetitiveAdvantage[] }) {
  const typeOrder = ['differentiator', 'usp', 'innovation', 'investment_area'];
  const typeLabel: Record<string, string> = {
    differentiator: 'Differentiators', usp: 'Unique Selling Points',
    innovation: 'Innovation Areas', investment_area: 'Future Investment',
  };
  const grouped = advantages.reduce<Record<string, CompetitiveAdvantage[]>>((acc, a) => {
    if (!acc[a.advantage_type]) acc[a.advantage_type] = [];
    acc[a.advantage_type].push(a);
    return acc;
  }, {});
  return (
    <div className="space-y-6">
      {typeOrder.filter(t => grouped[t]).map(type => (
        <div key={type}>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{typeLabel[type]}</p>
          <div className="space-y-2">
            {grouped[type].map(adv => {
              const sc = STRENGTH_CONFIG[adv.strength] ?? STRENGTH_CONFIG.medium;
              return (
                <div key={adv.id} className="bg-white border border-slate-200 rounded-lg p-3 flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full ${sc.dot} flex-shrink-0 mt-1.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800">{adv.title}</p>
                      <span className={`text-xs font-medium ${sc.color}`}>{sc.label}</span>
                    </div>
                    {adv.description && (
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{adv.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function CommercialSection({ items }: { items: CommercialItem[] }) {
  const domainOrder = ['pricing', 'revenue', 'growth', 'competitive', 'launch', 'risk'];
  const domainLabel: Record<string, string> = {
    pricing: 'Pricing Strategy', revenue: 'Revenue Model',
    growth: 'Growth Strategy', competitive: 'Market Position',
    launch: 'Launch Strategy', risk: 'Commercial Risks',
  };
  const domainIcon: Record<string, typeof DollarSign> = {
    pricing: DollarSign, revenue: TrendingUp, growth: ArrowRight,
    competitive: Target, launch: Zap, risk: AlertTriangle,
  };
  const grouped = items.reduce<Record<string, CommercialItem[]>>((acc, i) => {
    if (!acc[i.domain]) acc[i.domain] = [];
    acc[i.domain].push(i);
    return acc;
  }, {});
  return (
    <div className="space-y-5">
      {domainOrder.filter(d => grouped[d]).map(domain => {
        const Icon = domainIcon[domain] ?? Info;
        return (
          <div key={domain}>
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-3.5 h-3.5 text-slate-400" />
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{domainLabel[domain] ?? domain}</p>
            </div>
            <div className="space-y-2">
              {grouped[domain].map(item => (
                <div key={item.id} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-xs font-semibold text-slate-700 mb-0.5">{item.title}</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{item.content}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LaunchBlockerList({ blockers }: { blockers: LaunchBlocker[] }) {
  const sorted = [...blockers].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
  });
  return (
    <div className="space-y-2">
      {sorted.map(b => {
        const sev = SEVERITY_CONFIG[b.severity] ?? SEVERITY_CONFIG.medium;
        const st = STATUS_BLOCKER_CONFIG[b.status] ?? STATUS_BLOCKER_CONFIG.open;
        return (
          <div key={b.id} className={`${sev.bg} border ${sev.border} rounded-lg p-3`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <span className={`text-xs font-semibold ${sev.color} uppercase mt-0.5`}>{sev.label}</span>
                <p className="text-sm font-medium text-slate-800">{b.title}</p>
              </div>
              <span className={`text-xs font-medium ${st.color} whitespace-nowrap flex-shrink-0`}>{st.label}</span>
            </div>
            {b.description && (
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{b.description}</p>
            )}
          </div>
        );
      })}
      {sorted.length === 0 && (
        <div className="text-center py-6 text-slate-400 text-sm">No launch blockers recorded.</div>
      )}
    </div>
  );
}

function ConstraintList({ constraints }: { constraints: ProductConstraint[] }) {
  const typeOrder = ['product', 'commercial', 'engineering', 'deferred_idea', 'rejected_idea', 'assumption'];
  const grouped = constraints.reduce<Record<string, ProductConstraint[]>>((acc, c) => {
    if (!acc[c.constraint_type]) acc[c.constraint_type] = [];
    acc[c.constraint_type].push(c);
    return acc;
  }, {});
  return (
    <div className="space-y-5">
      {typeOrder.filter(t => grouped[t]).map(type => {
        const tc = CONSTRAINT_TYPE_CONFIG[type] ?? { label: type, color: 'text-slate-600' };
        return (
          <div key={type}>
            <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${tc.color}`}>{tc.label}</p>
            <div className="space-y-2">
              {grouped[type].map(c => (
                <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-slate-800">{c.title}</p>
                  {c.description && (
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{c.description}</p>
                  )}
                  {c.impact && (
                    <span className="inline-block mt-1.5 text-xs text-slate-400">Impact: {c.impact}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RelationshipGraph({ relationships }: { relationships: ProductRelationship[] }) {
  const typeColors: Record<string, string> = {
    drives: 'bg-blue-100 text-blue-700', enables: 'bg-emerald-100 text-emerald-700',
    blocked_by: 'bg-red-100 text-red-700', addressed_by: 'bg-amber-100 text-amber-700',
    belongs_to: 'bg-slate-100 text-slate-600', implements: 'bg-purple-100 text-purple-700',
    tests: 'bg-cyan-100 text-cyan-700', risks: 'bg-orange-100 text-orange-700',
  };
  return (
    <div className="space-y-2">
      {relationships.map(r => (
        <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{r.from_entity_type}</span>
              <span className="text-xs text-slate-400">{r.from_entity_id}</span>
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${typeColors[r.relationship_type] ?? 'bg-slate-100 text-slate-600'}`}>
                {r.relationship_type}
              </span>
              <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{r.to_entity_type}</span>
              <span className="text-xs text-slate-400">{r.to_entity_id}</span>
            </div>
            {r.description && (
              <p className="text-xs text-slate-500 mt-1">{r.description}</p>
            )}
          </div>
        </div>
      ))}
      {relationships.length === 0 && (
        <div className="text-center py-6 text-slate-400 text-sm">No relationships recorded.</div>
      )}
    </div>
  );
}

function ModuleGrid({ modules }: { modules: ProductModule[] }) {
  const statusConfig: Record<string, { color: string; bg: string }> = {
    active:   { color: 'text-emerald-700', bg: 'bg-emerald-50'  },
    planned:  { color: 'text-blue-700',    bg: 'bg-blue-50'     },
    deferred: { color: 'text-amber-700',   bg: 'bg-amber-50'    },
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {modules.map(m => {
        const sc = statusConfig[m.status] ?? statusConfig.active;
        return (
          <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors">
            <div className="flex items-start justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                <Package className="w-4 h-4 text-slate-500" />
              </div>
              <div className="flex items-center gap-1.5">
                {m.is_core && (
                  <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">Core</span>
                )}
                <span className={`text-xs font-medium capitalize ${sc.color} ${sc.bg} px-1.5 py-0.5 rounded`}>{m.status}</span>
              </div>
            </div>
            <p className="text-sm font-semibold text-slate-800">{m.module_name}</p>
            {m.description && (
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{m.description}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SnapshotCard({ snap }: { snap: PisSnapshot }) {
  const maturity = MATURITY_CONFIG[snap.product_maturity] ?? MATURITY_CONFIG.developing;
  const score = snap.launch_readiness_score;
  const scoreColor = score >= 70 ? 'text-emerald-700' : score >= 40 ? 'text-amber-700' : 'text-red-700';
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{snap.snapshot_ref}</p>
          <p className="text-xs text-slate-400 mt-0.5">v{snap.pis_version} · {new Date(snap.created_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full border ${maturity.color} ${maturity.bg} ${maturity.border}`}>
          {maturity.label}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-xs text-slate-400">Launch Readiness</p>
          <p className={`text-lg font-bold ${scoreColor}`}>{score}<span className="text-xs font-normal">/100</span></p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Implemented</p>
          <p className="text-lg font-bold text-slate-800">{snap.implemented_capabilities}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Planned</p>
          <p className="text-lg font-bold text-slate-800">{snap.planned_capabilities}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Confidence</p>
          <p className="text-lg font-bold text-slate-800">{snap.knowledge_confidence}%</p>
        </div>
      </div>
      {snap.current_strategic_objective && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <p className="text-xs text-slate-400 mb-0.5">Strategic Objective</p>
          <p className="text-xs text-slate-700">{snap.current_strategic_objective}</p>
        </div>
      )}
    </div>
  );
}

// ─── Tab Content ──────────────────────────────────────────────────────────────

function OverviewTab({ intel }: { intel: ProductIntelligence }) {
  const maturity = MATURITY_CONFIG[intel.productMaturity] ?? MATURITY_CONFIG.developing;
  const vision = intel.vision.find(v => v.domain === 'vision');
  const mission = intel.vision.find(v => v.domain === 'mission');
  const latestSnap = intel.snapshots[0];

  return (
    <div className="p-6 space-y-6">
      {/* Maturity + launch readiness */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="flex-shrink-0">
            <LaunchReadinessRing score={intel.launchReadinessScore} />
            <p className="text-xs text-center text-slate-400 mt-1">Launch Readiness</p>
          </div>
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-3">
              <span className={`text-sm font-semibold px-2.5 py-1 rounded-full border ${maturity.color} ${maturity.bg} ${maturity.border}`}>
                {maturity.label}
              </span>
              {intel.criticalBlockers > 0 && (
                <span className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  {intel.criticalBlockers} critical blocker{intel.criticalBlockers !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {vision && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Vision</p>
                <p className="text-sm text-slate-700 leading-relaxed">{vision.content}</p>
              </div>
            )}
            {mission && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Mission</p>
                <p className="text-sm text-slate-700 leading-relaxed">{mission.content}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Capabilities" icon={Layers} color="blue"
          value={intel.capabilities.length}
          sub={`${intel.capabilities.filter(c => c.status === 'live' || c.status === 'production' || c.status === 'verified').length} implemented`}
        />
        <KpiCard
          label="Product Modules" icon={Package} color="slate"
          value={intel.modules.length}
          sub={`${intel.modules.filter(m => m.is_core).length} core`}
        />
        <KpiCard
          label="Customer Segments" icon={Users} color="emerald"
          value={intel.customers.length}
          sub={`${intel.customers.filter(c => c.is_primary).length} primary`}
        />
        <KpiCard
          label="Competitive Advantages" icon={Target} color="amber"
          value={intel.competitive.length}
          sub={`${intel.competitive.filter(c => c.strength === 'high').length} high-strength`}
        />
        <KpiCard
          label="Open Blockers" icon={AlertTriangle}
          color={intel.openBlockers === 0 ? 'emerald' : intel.criticalBlockers > 0 ? 'red' : 'amber'}
          value={intel.openBlockers}
          sub={intel.criticalBlockers > 0 ? `${intel.criticalBlockers} critical` : 'All open'}
        />
        <KpiCard
          label="Constraints" icon={ShieldCheck} color="slate"
          value={intel.constraints.length}
          sub="product constraints"
        />
        <KpiCard
          label="Relationships" icon={GitBranch} color="purple"
          value={intel.relationships.length}
          sub="product edges"
        />
        <KpiCard
          label="PIS Snapshots" icon={BookOpen} color="slate"
          value={intel.snapshots.length}
          sub={latestSnap ? new Date(latestSnap.created_at).toLocaleDateString('en-AU') : 'No snapshots'}
        />
      </div>

      {/* Latest snapshot */}
      {latestSnap && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Latest Product Intelligence Snapshot</p>
          <SnapshotCard snap={latestSnap} />
        </div>
      )}
    </div>
  );
}

function CapabilitiesTab({ capabilities, modules }: { capabilities: EnrichedCapability[]; modules: ProductModule[] }) {
  const [filterModule, setFilterModule] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCriticality, setFilterCriticality] = useState('');
  const [search, setSearch] = useState('');

  const filtered = capabilities.filter(c => {
    if (filterModule && c.module_id !== filterModule && c.module_name !== filterModule) return false;
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterCriticality && c.launch_criticality !== filterCriticality) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const moduleOptions = [...new Set(modules.map(m => m.module_name))];
  const statusOptions = [...new Set(capabilities.map(c => c.status))];

  return (
    <div className="p-6 space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search capabilities..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
        />
        <select
          value={filterModule}
          onChange={e => setFilterModule(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Modules</option>
          {moduleOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Status</option>
          {statusOptions.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
        </select>
        <select
          value={filterCriticality}
          onChange={e => setFilterCriticality(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Criticality</option>
          <option value="launch_critical">Launch Critical</option>
          <option value="important">Important</option>
          <option value="nice_to_have">Nice to Have</option>
        </select>
        <span className="text-xs text-slate-400 self-center">{filtered.length} of {capabilities.length}</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Capability</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Module</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Criticality</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Competitive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(c => {
                const sc = FEATURE_STATUS_CONFIG[c.status] ?? { label: c.status, color: 'text-slate-600', dot: 'bg-slate-300' };
                const cc = CRITICALITY_CONFIG[c.launch_criticality] ?? CRITICALITY_CONFIG.nice_to_have;
                const comp = STRENGTH_CONFIG[c.competitive_significance] ?? STRENGTH_CONFIG.low;
                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{c.name}</p>
                      {c.feature_code && <p className="text-xs text-slate-400">{c.feature_code}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {c.module_name ? (
                        <span className="text-xs bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{c.module_name}</span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                        <span className={`text-xs ${sc.color}`}>{sc.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${cc.color} ${cc.bg}`}>{cc.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${comp.color}`}>{comp.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">No capabilities match the selected filters.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function RoadmapTab({ capabilities }: { capabilities: EnrichedCapability[] }) {
  const stages = [
    { key: ['live', 'production', 'verified'], label: 'Live', color: 'emerald', icon: CheckCircle2 },
    { key: ['in_progress', 'in_development'],  label: 'In Development', color: 'blue', icon: Clock },
    { key: ['planned', 'backlog'],              label: 'Planned', color: 'slate', icon: Circle },
    { key: ['deferred'],                        label: 'Deferred', color: 'amber', icon: AlertTriangle },
    { key: ['archived', 'rejected'],            label: 'Archived', color: 'slate', icon: BarChart3 },
  ] as const;

  const stageColors: Record<string, { border: string; bg: string; header: string; count: string }> = {
    emerald: { border: 'border-emerald-200', bg: 'bg-emerald-50',  header: 'bg-emerald-100', count: 'text-emerald-700 bg-emerald-100' },
    blue:    { border: 'border-blue-200',    bg: 'bg-blue-50',     header: 'bg-blue-100',    count: 'text-blue-700 bg-blue-100'       },
    slate:   { border: 'border-slate-200',   bg: 'bg-slate-50',    header: 'bg-slate-100',   count: 'text-slate-700 bg-slate-100'     },
    amber:   { border: 'border-amber-200',   bg: 'bg-amber-50',    header: 'bg-amber-100',   count: 'text-amber-700 bg-amber-100'     },
  };

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {stages.map(stage => {
          const items = capabilities.filter(c => (stage.key as readonly string[]).includes(c.status));
          const sc = stageColors[stage.color] ?? stageColors.slate;
          const Icon = stage.icon;
          return (
            <div key={stage.label} className={`border ${sc.border} rounded-xl overflow-hidden`}>
              <div className={`${sc.header} px-3 py-2 flex items-center justify-between`}>
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 text-slate-600" />
                  <p className="text-xs font-semibold text-slate-700">{stage.label}</p>
                </div>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${sc.count}`}>{items.length}</span>
              </div>
              <div className={`${sc.bg} p-2 space-y-1.5 min-h-24`}>
                {items.map(c => (
                  <div key={c.id} className="bg-white border border-white/80 rounded-lg p-2 shadow-sm">
                    <p className="text-xs font-medium text-slate-800 leading-tight">{c.name}</p>
                    {c.module_name && (
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{c.module_name}</p>
                    )}
                    {c.launch_criticality === 'launch_critical' && (
                      <span className="inline-block mt-1 text-xs text-red-600 font-medium">Critical</span>
                    )}
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-xs text-slate-300 text-center py-3">None</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IntelligenceTab({ intel }: { intel: ProductIntelligence }) {
  const [subTab, setSubTab] = useState<'customers' | 'commercial' | 'competitive'>('customers');
  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-2">
        {([
          { key: 'customers',  label: 'Customers'   },
          { key: 'commercial', label: 'Commercial'  },
          { key: 'competitive',label: 'Competitive' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              subTab === t.key
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {subTab === 'customers' && (
        <div className="space-y-3">
          {intel.customers.map(s => <CustomerCard key={s.id} segment={s} />)}
          {intel.customers.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">No customer segments recorded.</p>
          )}
        </div>
      )}
      {subTab === 'commercial' && <CommercialSection items={intel.commercial} />}
      {subTab === 'competitive' && <CompetitiveTable advantages={intel.competitive} />}
    </div>
  );
}

function GovernanceTab({ intel }: { intel: ProductIntelligence }) {
  const [subTab, setSubTab] = useState<'launch' | 'constraints' | 'relationships'>('launch');
  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-2">
        {([
          { key: 'launch',       label: `Launch (${intel.openBlockers} open)` },
          { key: 'constraints',  label: `Constraints (${intel.constraints.length})` },
          { key: 'relationships',label: `Relationships (${intel.relationships.length})` },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              subTab === t.key
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {subTab === 'launch' && <LaunchBlockerList blockers={intel.launch} />}
      {subTab === 'constraints' && <ConstraintList constraints={intel.constraints} />}
      {subTab === 'relationships' && <RelationshipGraph relationships={intel.relationships} />}
    </div>
  );
}

function SnapshotsTab({ snapshots, onGenerate, generating }: {
  snapshots: PisSnapshot[];
  onGenerate: () => void;
  generating: boolean;
}) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-800">Product Intelligence Snapshots</p>
          <p className="text-xs text-slate-400 mt-0.5">Versioned snapshots of product intelligence with confidence scoring.</p>
        </div>
        <button
          onClick={onGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {generating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Generate Snapshot
        </button>
      </div>
      <div className="space-y-3">
        {snapshots.map(s => <SnapshotCard key={s.id} snap={s} />)}
        {snapshots.length === 0 && (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center">
            <BookOpen className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No snapshots generated yet.</p>
            <p className="text-xs text-slate-400 mt-1">Generate your first snapshot to begin versioned product intelligence.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ECCProductIntelligencePage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intel, setIntel] = useState<ProductIntelligence | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await assembleProductIntelligence();
      setIntel(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load product intelligence');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      await generateSnapshot('Engineering Intelligence Platform');
      await load();
    } catch (e) {
      console.error('Failed to generate snapshot:', e);
    } finally {
      setGenerating(false);
    }
  }, [load]);

  const maturity = MATURITY_CONFIG[intel?.productMaturity ?? 'developing'] ?? MATURITY_CONFIG.developing;
  const score = intel?.launchReadinessScore ?? 0;
  const scoreColor = score >= 70 ? 'text-emerald-700' : score >= 40 ? 'text-amber-700' : 'text-red-700';

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-5 h-5 text-blue-600" />
              <h1 className="text-lg font-bold text-slate-900">Product Intelligence Service</h1>
              <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">PIS v1.0</span>
            </div>
            <p className="text-xs text-slate-500">Authoritative product understanding assembled from Engineering Command Centre sources.</p>
          </div>
          {intel && (
            <div className="flex items-center gap-4 flex-shrink-0">
              <div className="text-right">
                <p className="text-xs text-slate-400">Launch Readiness</p>
                <p className={`text-xl font-bold ${scoreColor}`}>{score}<span className="text-xs font-normal">/100</span></p>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${maturity.color} ${maturity.bg} ${maturity.border}`}>
                {maturity.label}
              </span>
              <button
                onClick={load}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 -mb-4 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 whitespace-nowrap transition-colors ${
                  tab === t.key
                    ? 'text-blue-700 border-blue-600 bg-blue-50/50'
                    : 'text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="w-6 h-6 text-blue-500 animate-spin mx-auto mb-2" />
              <p className="text-sm text-slate-500">Assembling product intelligence...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-6">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
          </div>
        )}

        {!loading && !error && intel && (
          <>
            {tab === 'overview'      && <OverviewTab intel={intel} />}
            {tab === 'capabilities'  && <CapabilitiesTab capabilities={intel.capabilities} modules={intel.modules} />}
            {tab === 'roadmap'       && <RoadmapTab capabilities={intel.capabilities} />}
            {tab === 'intelligence'  && <IntelligenceTab intel={intel} />}
            {tab === 'governance'    && <GovernanceTab intel={intel} />}
            {tab === 'snapshots'     && (
              <SnapshotsTab
                snapshots={intel.snapshots}
                onGenerate={handleGenerate}
                generating={generating}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
