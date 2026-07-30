import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Search, Filter, X, LayoutGrid, LayoutList, ChevronDown,
  CheckSquare, Square, ArrowUpDown, RefreshCw, Loader2,
  Zap, CheckCircle2, AlertTriangle, Clock, Package,
  ChevronRight, Activity,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ECCFeatureDetailPanel, type Feature, calculateHealthScore } from './ECCFeatureDetailPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FilterState {
  search: string;
  statuses: string[];
  categories: string[];
  priorities: string[];
  lifecycle_stages: string[];
  testing_statuses: string[];
  documentation_statuses: string[];
  review_statuses: string[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

const LIFECYCLE_CFG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  idea:                    { label: 'Idea',                    color: 'text-slate-500',   bg: 'bg-slate-100',   dot: 'bg-slate-300'   },
  planned:                 { label: 'Planned',                 color: 'text-slate-600',   bg: 'bg-slate-100',   dot: 'bg-slate-400'   },
  ready_for_development:   { label: 'Ready For Dev',           color: 'text-blue-600',    bg: 'bg-blue-50',     dot: 'bg-blue-400'    },
  ai_analysis:             { label: 'AI Analysis',             color: 'text-violet-600',  bg: 'bg-violet-50',   dot: 'bg-violet-400'  },
  preparation:             { label: 'Preparation',             color: 'text-indigo-600',  bg: 'bg-indigo-50',   dot: 'bg-indigo-400'  },
  approved_to_build:       { label: 'Approved To Build',       color: 'text-cyan-700',    bg: 'bg-cyan-50',     dot: 'bg-cyan-500'    },
  ai_development:          { label: 'AI Development',          color: 'text-purple-700',  bg: 'bg-purple-50',   dot: 'bg-purple-500'  },
  in_development:          { label: 'In Development',          color: 'text-blue-700',    bg: 'bg-blue-100',    dot: 'bg-blue-500'    },
  development_complete:    { label: 'Dev Complete',            color: 'text-teal-700',    bg: 'bg-teal-50',     dot: 'bg-teal-500'    },
  testing:                 { label: 'Testing',                 color: 'text-amber-700',   bg: 'bg-amber-50',    dot: 'bg-amber-500'   },
  awaiting_product_review: { label: 'Awaiting PO Review',      color: 'text-orange-700',  bg: 'bg-orange-50',   dot: 'bg-orange-500'  },
  product_review:          { label: 'Product Review',          color: 'text-rose-700',    bg: 'bg-rose-50',     dot: 'bg-rose-500'    },
  accepted:                { label: 'Accepted',                color: 'text-emerald-700', bg: 'bg-emerald-50',  dot: 'bg-emerald-500' },
  ready_for_release:       { label: 'Ready for Release',       color: 'text-green-700',   bg: 'bg-green-50',    dot: 'bg-green-500'   },
  feature_complete:        { label: 'Feature Complete',        color: 'text-indigo-700',  bg: 'bg-indigo-50',   dot: 'bg-indigo-500'  },
  internally_tested:       { label: 'Internally Tested',       color: 'text-cyan-700',    bg: 'bg-cyan-50',     dot: 'bg-cyan-500'    },
  regression_tested:       { label: 'Regression Tested',       color: 'text-teal-700',    bg: 'bg-teal-50',     dot: 'bg-teal-500'    },
  production_ready:        { label: 'Production Ready',        color: 'text-emerald-700', bg: 'bg-emerald-50',  dot: 'bg-emerald-500' },
  released:                { label: 'Released',                color: 'text-green-700',   bg: 'bg-green-50',    dot: 'bg-green-500'   },
  live:                    { label: 'Live',                    color: 'text-emerald-700', bg: 'bg-emerald-100', dot: 'bg-emerald-600' },
  maintenance:             { label: 'Maintenance',             color: 'text-slate-700',   bg: 'bg-slate-200',   dot: 'bg-slate-500'   },
  deprecated:              { label: 'Deprecated',              color: 'text-amber-700',   bg: 'bg-amber-50',    dot: 'bg-amber-500'   },
  archived:                { label: 'Archived',                color: 'text-slate-400',   bg: 'bg-slate-100',   dot: 'bg-slate-300'   },
};

const REVIEW_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  not_started:          { label: 'Not Started',       color: 'text-slate-500',   bg: 'bg-slate-50'   },
  requested:            { label: 'Review Requested',  color: 'text-blue-600',    bg: 'bg-blue-50'    },
  in_review:            { label: 'In Review',         color: 'text-amber-700',   bg: 'bg-amber-50'   },
  approved:             { label: 'Approved',          color: 'text-emerald-700', bg: 'bg-emerald-50' },
  rejected:             { label: 'Rejected',          color: 'text-red-600',     bg: 'bg-red-50'     },
  changes_requested:    { label: 'Changes Requested', color: 'text-orange-700',  bg: 'bg-orange-50'  },
  sent_back_to_dev:     { label: 'Back to Dev',       color: 'text-purple-600',  bg: 'bg-purple-50'  },
  sent_back_to_testing: { label: 'Back to Testing',   color: 'text-violet-600',  bg: 'bg-violet-50'  },
};

const PRIORITY_CFG: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: 'text-red-700',    bg: 'bg-red-50'    },
  high:     { label: 'High',     color: 'text-amber-700',  bg: 'bg-amber-50'  },
  medium:   { label: 'Medium',   color: 'text-blue-700',   bg: 'bg-blue-50'   },
  low:      { label: 'Low',      color: 'text-slate-600',  bg: 'bg-slate-100' },
};

const TEST_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  passed:          { label: 'Passed',      color: 'text-emerald-700', bg: 'bg-emerald-50'  },
  failed:          { label: 'Failed',      color: 'text-red-600',     bg: 'bg-red-50'      },
  testing:         { label: 'Testing',     color: 'text-blue-600',    bg: 'bg-blue-50'     },
  requires_review: { label: 'Needs Review',color: 'text-amber-700',   bg: 'bg-amber-50'    },
  not_run:         { label: 'Not Run',     color: 'text-slate-500',   bg: 'bg-slate-100'   },
  blocked:         { label: 'Blocked',     color: 'text-orange-600',  bg: 'bg-orange-50'   },
};

const DOC_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  documented:    { label: 'Documented',   color: 'text-emerald-700', bg: 'bg-emerald-50' },
  partial:       { label: 'Partial',      color: 'text-amber-700',   bg: 'bg-amber-50'   },
  undocumented:  { label: 'Undocumented', color: 'text-red-600',     bg: 'bg-red-50'     },
  not_required:  { label: 'N/A',          color: 'text-slate-500',   bg: 'bg-slate-100'  },
};

const EMPTY_FILTERS: FilterState = {
  search: '',
  statuses: [],
  categories: [],
  priorities: [],
  lifecycle_stages: [],
  testing_statuses: [],
  documentation_statuses: [],
  review_statuses: [],
};

// ─── Metric bar ───────────────────────────────────────────────────────────────

function MetricBar({
  features,
  activeFilter,
  onFilter,
}: {
  features: Feature[];
  activeFilter: string[];
  onFilter: (stage: string) => void;
}) {
  const counts = {
    total:       features.length,
    live:        features.filter(f => ['live', 'released', 'ready_for_release'].includes(f.lifecycle_stage)).length,
    accepted:    features.filter(f => f.product_review_status === 'approved' || f.lifecycle_stage === 'accepted').length,
    in_dev:      features.filter(f => ['in_development', 'ai_development', 'approved_to_build'].includes(f.lifecycle_stage)).length,
    testing:     features.filter(f => ['testing', 'internally_tested', 'regression_tested', 'development_complete'].includes(f.lifecycle_stage)).length,
    in_review:   features.filter(f => ['awaiting_product_review', 'product_review'].includes(f.lifecycle_stage) || ['requested', 'in_review'].includes(f.product_review_status ?? '')).length,
    planned:     features.filter(f => ['idea', 'planned', 'ready_for_development'].includes(f.lifecycle_stage)).length,
    compliance:  features.filter(f => f.compliance_critical).length,
  };

  const metrics = [
    { key: 'total',      label: 'Total',           value: counts.total,      color: 'text-slate-700',   filter: '' },
    { key: 'live',       label: 'Live / Released',  value: counts.live,       color: 'text-emerald-700', filter: 'live' },
    { key: 'accepted',   label: 'PO Accepted',      value: counts.accepted,   color: 'text-green-700',   filter: 'accepted' },
    { key: 'in_dev',     label: 'In Development',   value: counts.in_dev,     color: 'text-blue-700',    filter: 'in_development' },
    { key: 'testing',    label: 'Testing',          value: counts.testing,    color: 'text-amber-700',   filter: 'testing' },
    { key: 'in_review',  label: 'PO Review',        value: counts.in_review,  color: 'text-orange-700',  filter: 'awaiting_product_review' },
    { key: 'planned',    label: 'Planned',          value: counts.planned,    color: 'text-slate-500',   filter: 'planned' },
    { key: 'compliance', label: 'Compliance',       value: counts.compliance, color: 'text-red-600',     filter: '' },
  ];

  return (
    <div className="grid grid-cols-4 xl:grid-cols-8 gap-2">
      {metrics.map(m => {
        const isActive = m.filter && activeFilter.includes(m.filter);
        return (
          <button
            key={m.key}
            onClick={() => m.filter && onFilter(m.filter)}
            className={`p-3 rounded-xl border text-left transition-all ${
              m.filter ? 'cursor-pointer hover:shadow-sm' : 'cursor-default'
            } ${isActive
              ? 'bg-blue-50 border-blue-200 shadow-sm'
              : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <p className={`text-xl font-bold leading-none ${m.color}`}>{m.value}</p>
            <p className="text-[10px] font-medium text-slate-500 mt-1 leading-tight">{m.label}</p>
          </button>
        );
      })}
    </div>
  );
}

// ─── Multi-select dropdown ─────────────────────────────────────────────────────

function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
          value.length > 0
            ? 'bg-blue-50 border-blue-300 text-blue-700'
            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
        }`}
      >
        <Filter className="w-3 h-3" />
        {label}{value.length > 0 && <span className="bg-blue-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold">{value.length}</span>}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 max-h-56 overflow-y-auto">
          {options.map(o => (
            <button
              key={o.value}
              onClick={() => toggle(o.value)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {value.includes(o.value)
                ? <CheckSquare className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                : <Square className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Table View ───────────────────────────────────────────────────────────────

function TableView({
  features,
  selected,
  onSelect,
  onOpen,
  sortKey,
  sortDir,
  onSort,
}: {
  features: Feature[];
  selected: Set<string>;
  onSelect: (id: string, multi: boolean) => void;
  onOpen: (f: Feature) => void;
  sortKey: string;
  sortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
}) {
  const cols = [
    { key: 'feature_id', label: 'ID',          width: 'w-20' },
    { key: 'name',       label: 'Feature',      width: 'flex-1' },
    { key: 'category',   label: 'Category',     width: 'w-32 hidden lg:table-cell' },
    { key: 'lifecycle_stage', label: 'Stage',   width: 'w-36' },
    { key: 'priority',   label: 'Priority',     width: 'w-20 hidden xl:table-cell' },
    { key: 'product_review_status', label: 'Review', width: 'w-28 hidden xl:table-cell' },
    { key: 'testing_status', label: 'Testing',  width: 'w-24 hidden 2xl:table-cell' },
    { key: 'health',     label: 'Health',       width: 'w-16 hidden 2xl:table-cell' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="w-10 px-3 py-2.5">
              <div className="w-3.5 h-3.5" />
            </th>
            {cols.map(c => (
              <th
                key={c.key}
                className={`${c.width} px-3 py-2.5 text-left`}
              >
                <button
                  onClick={() => onSort(c.key)}
                  className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wide hover:text-slate-700 transition-colors"
                >
                  {c.label}
                  <ArrowUpDown className={`w-3 h-3 ${sortKey === c.key ? 'text-blue-500' : 'opacity-30'}`} />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {features.map(f => {
            const lc = LIFECYCLE_CFG[f.lifecycle_stage] ?? LIFECYCLE_CFG.planned;
            const pr = PRIORITY_CFG[f.priority ?? 'low'];
            const ts = TEST_STATUS_CFG[f.testing_status] ?? TEST_STATUS_CFG.not_run;
            const rv = REVIEW_STATUS_CFG[f.product_review_status ?? 'not_started'] ?? REVIEW_STATUS_CFG.not_started;
            const health = calculateHealthScore(f);
            const healthColor = health >= 80 ? 'text-emerald-700' : health >= 50 ? 'text-amber-700' : 'text-red-600';
            const isSel = selected.has(f.id);
            return (
              <tr
                key={f.id}
                onClick={() => onOpen(f)}
                className={`border-b border-slate-100 last:border-0 cursor-pointer transition-colors group ${
                  isSel ? 'bg-blue-50/60' : 'hover:bg-slate-50/80'
                }`}
              >
                <td className="px-3 py-2.5" onClick={e => { e.stopPropagation(); onSelect(f.id, e.shiftKey || e.ctrlKey || e.metaKey); }}>
                  {isSel
                    ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                    : <Square className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400" />}
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-xs font-mono text-slate-400">{f.feature_id}</span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-slate-900 truncate">{f.name}</span>
                    {f.compliance_critical && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                  </div>
                </td>
                <td className="px-3 py-2.5 hidden lg:table-cell">
                  <span className="text-xs text-slate-500 truncate">{f.category}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${lc.bg} ${lc.color}`}>
                    <span className={`w-1 h-1 rounded-full shrink-0 ${lc.dot}`} />
                    {lc.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 hidden xl:table-cell">
                  {f.priority && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${pr.bg} ${pr.color}`}>{pr.label}</span>
                  )}
                </td>
                <td className="px-3 py-2.5 hidden xl:table-cell">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${rv.bg} ${rv.color}`}>{rv.label}</span>
                </td>
                <td className="px-3 py-2.5 hidden 2xl:table-cell">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ts.bg} ${ts.color}`}>{ts.label}</span>
                </td>
                <td className="px-3 py-2.5 hidden 2xl:table-cell">
                  <span className={`text-xs font-bold ${healthColor}`}>{health}%</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {features.length === 0 && (
        <div className="py-16 text-center text-slate-400">
          <Package className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No features match your filters</p>
        </div>
      )}
    </div>
  );
}

// ─── Card View ────────────────────────────────────────────────────────────────

function CardView({
  features,
  selected,
  onSelect,
  onOpen,
}: {
  features: Feature[];
  selected: Set<string>;
  onSelect: (id: string, multi: boolean) => void;
  onOpen: (f: Feature) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {features.map(f => {
        const lc = LIFECYCLE_CFG[f.lifecycle_stage] ?? LIFECYCLE_CFG.planned;
        const ts = TEST_STATUS_CFG[f.testing_status] ?? TEST_STATUS_CFG.not_run;
        const rv = REVIEW_STATUS_CFG[f.product_review_status ?? 'not_started'] ?? REVIEW_STATUS_CFG.not_started;
        const health = calculateHealthScore(f);
        const healthColor = health >= 80 ? 'text-emerald-700' : health >= 50 ? 'text-amber-700' : 'text-red-600';
        const isSel = selected.has(f.id);
        return (
          <div
            key={f.id}
            onClick={() => onOpen(f)}
            className={`bg-white border rounded-xl p-4 cursor-pointer transition-all group hover:shadow-sm ${
              isSel ? 'border-blue-300 bg-blue-50/40 shadow-sm' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  onClick={e => { e.stopPropagation(); onSelect(f.id, e.shiftKey || e.ctrlKey || e.metaKey); }}
                  className="shrink-0"
                >
                  {isSel
                    ? <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                    : <Square className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-400" />}
                </button>
                <span className="text-xs font-mono text-slate-400 shrink-0">{f.feature_id}</span>
              </div>
              <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${lc.bg} ${lc.color}`}>
                <span className={`w-1 h-1 rounded-full ${lc.dot}`} />
                {lc.label}
              </span>
            </div>

            <h3 className="text-sm font-semibold text-slate-900 mb-1 leading-tight">{f.name}</h3>
            <p className="text-xs text-slate-400 mb-3 truncate">{f.category}{f.sub_category ? ` › ${f.sub_category}` : ''}</p>

            {f.description && (
              <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-relaxed">{f.description}</p>
            )}

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ts.bg} ${ts.color}`}>{ts.label}</span>
              {f.priority && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${(PRIORITY_CFG[f.priority] ?? PRIORITY_CFG.low).bg} ${(PRIORITY_CFG[f.priority] ?? PRIORITY_CFG.low).color}`}>
                  {(PRIORITY_CFG[f.priority] ?? PRIORITY_CFG.low).label}
                </span>
              )}
              {f.product_review_status && f.product_review_status !== 'not_started' && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${rv.bg} ${rv.color}`}>{rv.label}</span>
              )}
              {f.compliance_critical && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-red-50 text-red-600">Compliance</span>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400">
              <div className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                <span className={`font-semibold ${healthColor}`}>{health}%</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        );
      })}

      {features.length === 0 && (
        <div className="col-span-3 py-16 text-center text-slate-400">
          <Package className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No features match your filters</p>
        </div>
      )}
    </div>
  );
}

// ─── Bulk Actions Bar ─────────────────────────────────────────────────────────

function BulkActionsBar({
  count,
  onClear,
  onBulkStatus,
}: {
  count: number;
  onClear: () => void;
  onBulkStatus: (stage: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const stages = Object.entries(LIFECYCLE_CFG).map(([k, v]) => ({ value: k, label: v.label }));

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm">
      <CheckSquare className="w-4 h-4" />
      <span className="font-semibold">{count} selected</span>
      <div className="flex-1" />
      <div className="relative">
        <button onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors">
          Move Stage <ChevronDown className="w-3 h-3" />
        </button>
        {open && (
          <div className="absolute bottom-full right-0 mb-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1">
            {stages.map(s => (
              <button key={s.value} onClick={() => { onBulkStatus(s.value); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button onClick={onClear} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ECCFeaturesPage() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [viewMode, setViewMode] = useState<'table' | 'card'>(() =>
    (localStorage.getItem('ecc-features-view') as 'table' | 'card') ?? 'table'
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openFeature, setOpenFeature] = useState<Feature | null>(null);
  const [sortKey, setSortKey] = useState('feature_id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('ecc_product_features')
      .select('*')
      .order('feature_id');
    const rows = data ?? [];
    setFeatures(rows as Feature[]);
    const cats = [...new Set(rows.map(r => r.category).filter(Boolean))].sort();
    setCategories(cats);
    setLoading(false);
  }

  function switchView(mode: 'table' | 'card') {
    setViewMode(mode);
    localStorage.setItem('ecc-features-view', mode);
  }

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function toggleLifecycleFilter(stage: string) {
    setFilters(f => ({
      ...f,
      lifecycle_stages: f.lifecycle_stages.includes(stage)
        ? f.lifecycle_stages.filter(s => s !== stage)
        : [...f.lifecycle_stages, stage],
    }));
  }

  function selectFeature(id: string, multi: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      if (multi) {
        next.has(id) ? next.delete(id) : next.add(id);
      } else {
        if (next.has(id) && next.size === 1) next.delete(id);
        else { next.clear(); next.add(id); }
      }
      return next;
    });
  }

  async function bulkUpdateStage(stage: string) {
    const ids = [...selected];
    await Promise.all(
      ids.map(id =>
        supabase.from('ecc_product_features')
          .update({ lifecycle_stage: stage, updated_at: new Date().toISOString() })
          .eq('id', id)
      )
    );
    setFeatures(prev =>
      prev.map(f => selected.has(f.id) ? { ...f, lifecycle_stage: stage } : f)
    );
    setSelected(new Set());
  }

  function updateFeature(id: string, changes: Partial<Feature>) {
    setFeatures(prev => prev.map(f => f.id === id ? { ...f, ...changes } : f));
    if (openFeature?.id === id) setOpenFeature(prev => prev ? { ...prev, ...changes } : prev);
  }

  // ── Filter + sort ──────────────────────────────────────────────────────────

  const filtered = features
    .filter(f => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!f.name.toLowerCase().includes(q) &&
            !f.feature_id.toLowerCase().includes(q) &&
            !(f.description ?? '').toLowerCase().includes(q) &&
            !f.category.toLowerCase().includes(q)) return false;
      }
      if (filters.lifecycle_stages.length && !filters.lifecycle_stages.includes(f.lifecycle_stage)) return false;
      if (filters.categories.length && !filters.categories.includes(f.category)) return false;
      if (filters.priorities.length && !filters.priorities.includes(f.priority ?? '')) return false;
      if (filters.testing_statuses.length && !filters.testing_statuses.includes(f.testing_status)) return false;
      if (filters.documentation_statuses.length && !filters.documentation_statuses.includes(f.documentation_status)) return false;
      if (filters.review_statuses.length && !filters.review_statuses.includes(f.product_review_status ?? 'not_started')) return false;
      return true;
    })
    .sort((a, b) => {
      const va = (a as Record<string, unknown>)[sortKey] ?? '';
      const vb = (b as Record<string, unknown>)[sortKey] ?? '';
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const activeFilterCount =
    filters.lifecycle_stages.length +
    filters.categories.length +
    filters.priorities.length +
    filters.testing_statuses.length +
    filters.documentation_statuses.length +
    filters.review_statuses.length;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Feature list panel */}
      <div className={`flex flex-col min-w-0 transition-all ${openFeature ? 'w-1/2 xl:w-3/5' : 'flex-1'}`}>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-slate-900">Engineering Workspace</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {loading ? 'Loading…' : `${features.length} features across ${categories.length} categories`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={load} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                <button
                  onClick={() => switchView('table')}
                  className={`p-1.5 transition-colors ${viewMode === 'table' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <LayoutList className="w-4 h-4" />
                </button>
                <button
                  onClick={() => switchView('card')}
                  className={`p-1.5 transition-colors ${viewMode === 'card' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Metric bar */}
          {!loading && (
            <MetricBar
              features={features}
              activeFilter={filters.lifecycle_stages}
              onFilter={toggleLifecycleFilter}
            />
          )}

          {/* Search + filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                placeholder="Search features…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-300"
              />
              {filters.search && (
                <button onClick={() => setFilters(f => ({ ...f, search: '' }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-300 hover:text-slate-500">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <MultiSelect
              label="Stage"
              options={Object.entries(LIFECYCLE_CFG).map(([k, v]) => ({ value: k, label: v.label }))}
              value={filters.lifecycle_stages}
              onChange={v => setFilters(f => ({ ...f, lifecycle_stages: v }))}
            />
            <MultiSelect
              label="Category"
              options={categories.map(c => ({ value: c, label: c }))}
              value={filters.categories}
              onChange={v => setFilters(f => ({ ...f, categories: v }))}
            />
            <MultiSelect
              label="Priority"
              options={Object.entries(PRIORITY_CFG).map(([k, v]) => ({ value: k, label: v.label }))}
              value={filters.priorities}
              onChange={v => setFilters(f => ({ ...f, priorities: v }))}
            />
            <MultiSelect
              label="Testing"
              options={Object.entries(TEST_STATUS_CFG).map(([k, v]) => ({ value: k, label: v.label }))}
              value={filters.testing_statuses}
              onChange={v => setFilters(f => ({ ...f, testing_statuses: v }))}
            />
            <MultiSelect
              label="Docs"
              options={Object.entries(DOC_STATUS_CFG).map(([k, v]) => ({ value: k, label: v.label }))}
              value={filters.documentation_statuses}
              onChange={v => setFilters(f => ({ ...f, documentation_statuses: v }))}
            />
            <MultiSelect
              label="PO Review"
              options={Object.entries(REVIEW_STATUS_CFG).map(([k, v]) => ({ value: k, label: v.label }))}
              value={filters.review_statuses}
              onChange={v => setFilters(f => ({ ...f, review_statuses: v }))}
            />

            {activeFilterCount > 0 && (
              <button onClick={() => setFilters(EMPTY_FILTERS)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                <X className="w-3 h-3" /> Clear ({activeFilterCount})
              </button>
            )}
          </div>

          {/* Bulk actions */}
          {selected.size > 0 && (
            <BulkActionsBar
              count={selected.size}
              onClear={() => setSelected(new Set())}
              onBulkStatus={bulkUpdateStage}
            />
          )}

          {/* Feature list / cards */}
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
            </div>
          ) : viewMode === 'table' ? (
            <TableView
              features={filtered}
              selected={selected}
              onSelect={selectFeature}
              onOpen={f => setOpenFeature(prev => prev?.id === f.id ? null : f)}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
          ) : (
            <CardView
              features={filtered}
              selected={selected}
              onSelect={selectFeature}
              onOpen={f => setOpenFeature(prev => prev?.id === f.id ? null : f)}
            />
          )}

          {/* Count footer */}
          {!loading && (
            <p className="text-xs text-slate-400 text-center pb-2">
              Showing {filtered.length} of {features.length} features
            </p>
          )}
        </div>
      </div>

      {/* Feature detail panel */}
      {openFeature && (
        <div className="w-1/2 xl:w-2/5 border-l border-slate-200 overflow-hidden flex flex-col shrink-0">
          <ECCFeatureDetailPanel
            feature={openFeature}
            onClose={() => setOpenFeature(null)}
            onUpdate={updateFeature}
          />
        </div>
      )}
    </div>
  );
}
