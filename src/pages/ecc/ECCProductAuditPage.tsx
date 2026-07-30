import { useEffect, useState, useMemo } from 'react';
import {
  ClipboardCheck, Search, RefreshCw, Loader2, ChevronDown,
  CheckCircle2, AlertTriangle, XCircle, Clock, FileText,
  Boxes, Zap, Database, Globe, Terminal, Shield, BarChart3, AlertCircle,
  Info, Filter, SlidersHorizontal, TrendingUp, Activity,
  ChevronRight, X, ShieldCheck, Heart, ArrowRight, ClipboardList,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ECCFeatureDetailPanel, type Feature } from './ECCFeatureDetailPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditReport {
  id: string; audit_date: string; triggered_by: string | null;
  total_features: number; features_implemented: number;
  features_planned: number; features_deprecated: number;
  missing_documentation: number; missing_testing: number;
  unknown_dates: number; unknown_versions: number;
  features_with_flags: number;
  roadmap_differences: { type: string; note: string }[];
  recommended_cleanup: { priority: string; item: string }[];
  notes: string | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Authentication', 'Assessment Engine', 'Qualification Management',
  'Candidate Management', 'Support Plans', 'Interventions',
  'aXcelerate Integration', 'Email & Notifications', 'Billing',
  'Compliance', 'Admin Portal', 'Marketing',
  'Engineering Control Centre', 'Infrastructure',
];

const STATUS_CFG: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  implemented: { label: 'Implemented', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  in_progress: { label: 'In Progress', dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50'    },
  planned:     { label: 'Planned',     dot: 'bg-slate-400',   text: 'text-slate-600',   bg: 'bg-slate-50'   },
  deprecated:  { label: 'Deprecated',  dot: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50'   },
  removed:     { label: 'Removed',     dot: 'bg-red-400',     text: 'text-red-700',     bg: 'bg-red-50'     },
};

const LIFECYCLE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  planned:           { label: 'Planned',           color: 'text-slate-500',   bg: 'bg-slate-100'   },
  in_development:    { label: 'In Development',    color: 'text-blue-600',    bg: 'bg-blue-50'     },
  feature_complete:  { label: 'Feature Complete',  color: 'text-sky-600',     bg: 'bg-sky-50'      },
  internally_tested: { label: 'Internally Tested', color: 'text-cyan-700',    bg: 'bg-cyan-50'     },
  regression_tested: { label: 'Regression Tested', color: 'text-teal-700',    bg: 'bg-teal-50'     },
  production_ready:  { label: 'Production Ready',  color: 'text-emerald-600', bg: 'bg-emerald-50'  },
  released:          { label: 'Released',           color: 'text-green-700',   bg: 'bg-green-50'    },
  live:              { label: 'Live',               color: 'text-emerald-700', bg: 'bg-emerald-100' },
  deprecated:        { label: 'Deprecated',         color: 'text-amber-700',   bg: 'bg-amber-50'    },
};

const TESTING_CFG: Record<string, { label: string; icon: typeof CheckCircle2; color: string }> = {
  passed:          { label: 'Passed',      icon: CheckCircle2, color: 'text-emerald-600' },
  failed:          { label: 'Failed',      icon: XCircle,      color: 'text-red-500'     },
  testing:         { label: 'Testing',     icon: Clock,        color: 'text-blue-500'    },
  requires_review: { label: 'Req. Review', icon: AlertTriangle, color: 'text-amber-500'  },
  requires_retest: { label: 'Req. Retest', icon: RefreshCw,    color: 'text-orange-500'  },
  not_tested:      { label: 'Not Tested',  icon: XCircle,      color: 'text-slate-400'   },
};

const PRIORITY_CFG: Record<string, { label: string; text: string; bg: string }> = {
  critical: { label: 'Critical', text: 'text-red-700',   bg: 'bg-red-50'    },
  high:     { label: 'High',     text: 'text-amber-700', bg: 'bg-amber-50'  },
  medium:   { label: 'Medium',   text: 'text-blue-700',  bg: 'bg-blue-50'   },
  low:      { label: 'Low',      text: 'text-slate-600', bg: 'bg-slate-100' },
};

const CATEGORY_ICONS: Record<string, typeof Boxes> = {
  'Authentication':             Shield,
  'Assessment Engine':          Zap,
  'Qualification Management':   Database,
  'Candidate Management':       Globe,
  'Support Plans':              FileText,
  'Interventions':              AlertCircle,
  'aXcelerate Integration':     RefreshCw,
  'Email & Notifications':      Globe,
  'Billing':                    BarChart3,
  'Compliance':                 CheckCircle2,
  'Admin Portal':               Terminal,
  'Marketing':                  Globe,
  'Engineering Control Centre': Terminal,
  'Infrastructure':             Database,
};

// ─── Metrics Dashboard ────────────────────────────────────────────────────────

function MetricCard({ value, label, sub, color = 'text-slate-900', bg = 'bg-white' }: {
  value: number | string; label: string; sub?: string;
  color?: string; bg?: string;
}) {
  return (
    <div className={`${bg} rounded-2xl border border-slate-200 p-4 shadow-sm`}>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs font-medium text-slate-600 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function MetricsDashboard({ features, report }: { features: Feature[]; report: AuditReport | null }) {
  const [expanded, setExpanded] = useState(false);

  const stats = useMemo(() => {
    const live           = features.filter(f => f.lifecycle_stage === 'live').length;
    const notTested      = features.filter(f => f.testing_status === 'not_tested').length;
    const complianceCrit = features.filter(f => f.compliance_critical).length;
    const auditCrit      = features.filter(f => f.audit_critical).length;
    const regressionReq  = features.filter(f => f.regression_required && !f.regression_completed).length;
    const criticalRisk   = features.filter(f => f.operational_risk === 'critical').length;
    const highRisk       = features.filter(f => f.operational_risk === 'high').length;
    const withFlags      = features.filter(f => f.audit_flags?.length > 0).length;
    const missingDocs    = features.filter(f => f.documentation_status === 'missing').length;
    const withIssues     = features.filter(f => f.known_issues).length;
    return { live, notTested, complianceCrit, auditCrit, regressionReq, criticalRisk, highRisk, withFlags, missingDocs, withIssues };
  }, [features]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-slate-800 text-sm">Product Audit Dashboard</h2>
          {report && (
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              Audited {new Date(report.audit_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {report && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              {report.recommended_cleanup.length} recommendations
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Primary metrics */}
      <div className="grid grid-cols-4 lg:grid-cols-8 divide-x divide-y lg:divide-y-0 divide-slate-100">
        {[
          { value: features.length,      label: 'Total',      color: 'text-slate-800' },
          { value: stats.live,           label: 'Live',       color: 'text-emerald-700' },
          { value: stats.notTested,      label: 'Untested',   color: stats.notTested > 10 ? 'text-amber-700' : 'text-slate-700' },
          { value: stats.complianceCrit, label: 'Compliance', color: 'text-red-700'    },
          { value: stats.auditCrit,      label: 'Audit Crit', color: 'text-amber-700'  },
          { value: stats.regressionReq,  label: 'Regression', color: stats.regressionReq > 0 ? 'text-orange-700' : 'text-slate-500' },
          { value: stats.criticalRisk + stats.highRisk, label: 'High Risk', color: stats.criticalRisk > 0 ? 'text-red-700' : 'text-amber-700' },
          { value: stats.withFlags,      label: 'Flagged',    color: stats.withFlags > 0 ? 'text-amber-700' : 'text-slate-500' },
        ].map(({ value, label, color }) => (
          <div key={label} className="py-4 px-5 text-center">
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      {/* Lifecycle breakdown bar */}
      <div className="px-6 py-3 border-t border-slate-100">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-3 h-3 text-slate-400" />
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Lifecycle Distribution</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          {Object.entries(LIFECYCLE_CFG).map(([key, cfg]) => {
            const count = features.filter(f => f.lifecycle_stage === key).length;
            if (!count) return null;
            return (
              <div key={key} className="flex items-center gap-1.5">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                <span className="text-xs font-bold text-slate-600">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expandable recommendations */}
      {expanded && report && (
        <div className="px-6 pb-5 border-t border-slate-100 pt-4 space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recommendations</p>
          {report.recommended_cleanup.map((item, i) => {
            const isHigh = item.priority === 'high';
            return (
              <div key={i} className={`flex items-start gap-2.5 text-sm rounded-xl px-4 py-2.5 ${isHigh ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-700'}`}>
                <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${isHigh ? 'text-amber-500' : 'text-slate-400'}`} />
                <span className="flex-1">{item.item}</span>
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${isHigh ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>{item.priority}</span>
              </div>
            );
          })}
          {report.roadmap_differences.length > 0 && (
            <>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">Roadmap Differences</p>
              {report.roadmap_differences.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm bg-blue-50 text-blue-800 rounded-xl px-4 py-2.5">
                  <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
                  <span className="flex-1">{item.note}</span>
                  <span className="text-xs font-semibold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">{item.type}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Guardian Summary Widget ──────────────────────────────────────────────────

interface GuardianSnap {
  id: string;
  title: string;
  created_at: string;
  engineering_health_score: number | null;
  maintainability_score: number | null;
  technical_debt_score: number | null;
  approval_status: string | null;
  performance_issues: number | null;
  security_issues: number | null;
}

function GuardianSummaryWidget({ onNavigate }: { onNavigate?: (s: string) => void }) {
  const [snap, setSnap] = useState<GuardianSnap | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('architecture_guardian_reviews')
      .select('id, title, created_at, engineering_health_score, maintainability_score, technical_debt_score, approval_status, performance_issues, security_issues')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setSnap(data);
        setLoading(false);
      });
  }, []);

  if (loading) return null;
  if (!snap) return (
    <div className="mt-3 bg-slate-800/5 border border-dashed border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3">
      <ShieldCheck className="w-4 h-4 text-slate-300 shrink-0" />
      <p className="text-xs text-slate-400 flex-1">No Engineering Guardian review yet — run a review for engineering health metrics.</p>
    </div>
  );

  const score = snap.engineering_health_score ?? 0;
  const scoreColor = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-teal-600' : score >= 40 ? 'text-amber-600' : 'text-red-600';
  const statusColors: Record<string, string> = {
    approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    approved_with_warnings: 'bg-amber-100 text-amber-800 border-amber-200',
    blocked: 'bg-red-100 text-red-800 border-red-200',
  };
  const statusCls = statusColors[snap.approval_status ?? ''] ?? 'bg-slate-100 text-slate-700 border-slate-200';

  return (
    <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-4">
      <ShieldCheck className="w-4 h-4 text-slate-500 shrink-0" />
      <p className="text-xs font-semibold text-slate-500 shrink-0">Engineering Guardian</p>
      <div className="flex items-center gap-1.5 shrink-0">
        <Heart className={`w-3.5 h-3.5 ${scoreColor}`} />
        <span className={`text-sm font-bold ${scoreColor}`}>{score}</span>
        <span className="text-[10px] text-slate-400">/100</span>
      </div>
      {snap.approval_status && (
        <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusCls}`}>
          {snap.approval_status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
        </span>
      )}
      <div className="hidden md:flex items-center gap-4 flex-1">
        {[
          { label: 'Maintainability', value: snap.maintainability_score },
          { label: 'Tech Debt',       value: snap.technical_debt_score  },
        ].map(({ label, value }) => value !== null && (
          <div key={label} className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400">{label}:</span>
            <span className="text-[10px] font-semibold text-slate-700">{value}</span>
          </div>
        ))}
        {(snap.security_issues ?? 0) > 0 && (
          <span className="text-[10px] font-semibold text-red-600">{snap.security_issues} security</span>
        )}
        {(snap.performance_issues ?? 0) > 0 && (
          <span className="text-[10px] font-semibold text-amber-600">{snap.performance_issues} perf.</span>
        )}
      </div>
      <p className="hidden lg:block text-[10px] text-slate-400 shrink-0">
        {new Date(snap.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
      {onNavigate && (
        <button
          onClick={() => onNavigate('arch-guardian')}
          className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 font-semibold shrink-0 transition-colors"
        >
          View <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ─── TP-001 Summary Widget ────────────────────────────────────────────────────

function TP001SummaryWidget({ onNavigate }: { onNavigate?: (s: string) => void }) {
  const [exec, setExec] = useState<{ pass_rate: number | null; release_recommendation: string | null; execution_number: string; completed_at: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('ecc_tp001_executions')
      .select('execution_number, pass_rate, release_recommendation, completed_at')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { setExec(data); setLoading(false); });
  }, []);

  if (loading) return null;

  const recColors: Record<string, string> = {
    PROCEED: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    WARNING:  'text-amber-700 bg-amber-50 border-amber-200',
    BLOCK:    'text-red-700 bg-red-50 border-red-200',
  };
  const rec = exec?.release_recommendation ?? null;

  return (
    <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-4">
      <ClipboardList className="w-4 h-4 text-slate-400 shrink-0" />
      <p className="text-xs font-semibold text-slate-500 shrink-0">TP-001 Validation</p>
      {exec ? (
        <>
          <span className="text-xs font-mono text-slate-500">{exec.execution_number}</span>
          {rec && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${recColors[rec] ?? 'text-slate-600 bg-slate-100 border-slate-200'}`}>{rec}</span>
          )}
          {exec.pass_rate != null && (
            <span className="text-xs text-slate-500">{exec.pass_rate.toFixed(1)}% pass rate</span>
          )}
          {exec.completed_at && (
            <span className="text-xs text-slate-400 ml-auto">{new Date(exec.completed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          )}
        </>
      ) : (
        <span className="text-xs text-slate-400">No TP-001 execution completed yet</span>
      )}
      {onNavigate && (
        <button
          onClick={() => onNavigate('qa-testing')}
          className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          View <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ─── Filters Panel ───────────────────────────────────────────────────────────

interface Filters {
  search: string;
  category: string;
  status: string;
  lifecycle: string;
  testing: string;
  priority: string;
  compliance: 'all' | 'compliance' | 'audit';
  risk: string;
  flags: boolean;
}

function FiltersBar({ filters, onChange, total, filtered }: {
  filters: Filters;
  onChange: (f: Filters) => void;
  total: number;
  filtered: number;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const activeCount = [
    filters.category !== 'all',
    filters.status !== 'all',
    filters.lifecycle !== 'all',
    filters.testing !== 'all',
    filters.priority !== 'all',
    filters.compliance !== 'all',
    filters.risk !== 'all',
    filters.flags,
  ].filter(Boolean).length;

  function reset() {
    onChange({ search: '', category: 'all', status: 'all', lifecycle: 'all', testing: 'all', priority: 'all', compliance: 'all', risk: 'all', flags: false });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-3">
      {/* Search + toggle */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={filters.search}
            onChange={e => onChange({ ...filters, search: e.target.value })}
            placeholder="Search features, categories, tags…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
        <button
          onClick={() => setShowAdvanced(s => !s)}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl border transition-all ${
            showAdvanced || activeCount > 0
              ? 'bg-blue-600 text-white border-blue-600'
              : 'text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="bg-white/20 text-white text-[10px] font-bold rounded-full px-1.5">{activeCount}</span>
          )}
        </button>
        <span className="text-sm text-slate-500 shrink-0">{filtered} of {total}</span>
        {activeCount > 0 && (
          <button onClick={reset} className="p-2 text-slate-400 hover:text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {showAdvanced && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-1 border-t border-slate-100">
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Category</label>
            <select value={filters.category} onChange={e => onChange({ ...filters, category: e.target.value })}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
              <option value="all">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Status</label>
            <select value={filters.status} onChange={e => onChange({ ...filters, status: e.target.value })}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Lifecycle Stage</label>
            <select value={filters.lifecycle} onChange={e => onChange({ ...filters, lifecycle: e.target.value })}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
              <option value="all">All Stages</option>
              {Object.entries(LIFECYCLE_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Testing</label>
            <select value={filters.testing} onChange={e => onChange({ ...filters, testing: e.target.value })}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
              <option value="all">All Testing</option>
              {Object.entries(TESTING_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Priority</label>
            <select value={filters.priority} onChange={e => onChange({ ...filters, priority: e.target.value })}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
              <option value="all">All Priorities</option>
              {Object.entries(PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Compliance</label>
            <select value={filters.compliance} onChange={e => onChange({ ...filters, compliance: e.target.value as Filters['compliance'] })}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
              <option value="all">All Features</option>
              <option value="compliance">Compliance Critical</option>
              <option value="audit">Audit Critical</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Operational Risk</label>
            <select value={filters.risk} onChange={e => onChange({ ...filters, risk: e.target.value })}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
              <option value="all">All Risk Levels</option>
              <option value="critical">Critical Risk</option>
              <option value="high">High Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="low">Low Risk</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer pb-1.5">
              <input type="checkbox" checked={filters.flags} onChange={e => onChange({ ...filters, flags: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-400" />
              <span className="text-xs text-slate-600 font-medium">Audit Flags Only</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Category chips ───────────────────────────────────────────────────────────

function CategoryChips({ features, activeCategory, onSelect }: {
  features: Feature[];
  activeCategory: string;
  onSelect: (cat: string) => void;
}) {
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    features.forEach(f => { t[f.category] = (t[f.category] ?? 0) + 1; });
    return t;
  }, [features]);

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect('all')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
          activeCategory === 'all'
            ? 'bg-slate-900 text-white border-slate-900'
            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
        }`}
      >
        <Boxes className="w-3 h-3" />
        All
        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeCategory === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
          {features.length}
        </span>
      </button>
      {Object.entries(totals).sort(([,a],[,b]) => b - a).map(([cat, count]) => {
        const Icon = CATEGORY_ICONS[cat] ?? Boxes;
        const active = activeCategory === cat;
        return (
          <button
            key={cat}
            onClick={() => onSelect(active ? 'all' : cat)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
              active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            <Icon className="w-3 h-3" />
            {cat}
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Feature List Item ────────────────────────────────────────────────────────

function FeatureListItem({ feature, selected, onClick }: {
  feature: Feature;
  selected: boolean;
  onClick: () => void;
}) {
  const sCfg = STATUS_CFG[feature.status] ?? STATUS_CFG.planned;
  const lc   = LIFECYCLE_CFG[feature.lifecycle_stage] ?? LIFECYCLE_CFG.planned;
  const tCfg = TESTING_CFG[feature.testing_status] ?? TESTING_CFG.not_tested;
  const pCfg = PRIORITY_CFG[feature.priority ?? 'low'] ?? PRIORITY_CFG.low;
  const TestIcon = tCfg.icon;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors group ${
        selected ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'hover:bg-slate-50 border-l-2 border-l-transparent'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-[10px] font-mono font-bold text-slate-400 shrink-0">{feature.feature_id}</span>
          {feature.priority && (
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${pCfg.bg} ${pCfg.text}`}>{pCfg.label}</span>
          )}
          {feature.compliance_critical && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-600 shrink-0">COMP</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <TestIcon className={`w-3 h-3 ${tCfg.color}`} />
          {feature.audit_flags?.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-600 text-[9px] flex items-center justify-center font-bold">
              {feature.audit_flags.length}
            </span>
          )}
        </div>
      </div>
      <p className={`text-sm font-semibold truncate ${selected ? 'text-blue-900' : 'text-slate-800'}`}>{feature.name}</p>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${lc.bg} ${lc.color}`}>
          {lc.label}
        </span>
        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${sCfg.bg} ${sCfg.text}`}>
          <span className={`w-1 h-1 rounded-full ${sCfg.dot}`} />{sCfg.label}
        </span>
      </div>
      <p className="text-[10px] text-slate-400 mt-1 truncate">{feature.category}{feature.sub_category ? ` › ${feature.sub_category}` : ''}</p>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const DEFAULT_FILTERS: Filters = {
  search: '', category: 'all', status: 'all', lifecycle: 'all',
  testing: 'all', priority: 'all', compliance: 'all', risk: 'all', flags: false,
};

export function ECCProductAuditPage({ onNavigate }: { onNavigate?: (s: string) => void } = {}) {
  const [features,       setFeatures]       = useState<Feature[]>([]);
  const [report,         setReport]         = useState<AuditReport | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [filters,        setFilters]        = useState<Filters>(DEFAULT_FILTERS);
  const [sortBy,         setSortBy]         = useState<'feature_id' | 'name' | 'category'>('feature_id');
  const [selectedId,     setSelectedId]     = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [fRes, rRes] = await Promise.all([
      supabase.from('ecc_product_features').select('*').order('feature_id'),
      supabase.from('ecc_product_audit_reports').select('*').order('audit_date', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setFeatures(fRes.data ?? []);
    setReport(rRes.data ?? null);
    setLoading(false);
  }

  function handleUpdate(id: string, changes: Partial<Feature>) {
    setFeatures(fs => fs.map(f => f.id === id ? { ...f, ...changes } : f));
  }

  const filtered = useMemo(() => {
    let result = [...features];
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.feature_id.toLowerCase().includes(q) ||
        (f.description?.toLowerCase().includes(q)) ||
        (f.category.toLowerCase().includes(q)) ||
        f.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    if (filters.category !== 'all')   result = result.filter(f => f.category === filters.category);
    if (filters.status !== 'all')     result = result.filter(f => f.status === filters.status);
    if (filters.lifecycle !== 'all')  result = result.filter(f => f.lifecycle_stage === filters.lifecycle);
    if (filters.testing !== 'all')    result = result.filter(f => f.testing_status === filters.testing);
    if (filters.priority !== 'all')   result = result.filter(f => f.priority === filters.priority);
    if (filters.compliance === 'compliance') result = result.filter(f => f.compliance_critical);
    if (filters.compliance === 'audit')      result = result.filter(f => f.audit_critical);
    if (filters.risk !== 'all')       result = result.filter(f => f.operational_risk === filters.risk);
    if (filters.flags)                result = result.filter(f => f.audit_flags?.length > 0);

    result.sort((a, b) => {
      if (sortBy === 'name')     return a.name.localeCompare(b.name);
      if (sortBy === 'category') return a.category.localeCompare(b.category) || a.feature_id.localeCompare(b.feature_id);
      return a.feature_id.localeCompare(b.feature_id);
    });
    return result;
  }, [features, filters, sortBy]);

  const selectedFeature = useMemo(
    () => features.find(f => f.id === selectedId) ?? null,
    [features, selectedId],
  );

  function handleCategoryChip(cat: string) {
    setFilters(f => ({ ...f, category: cat }));
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
    </div>
  );

  const showPanel = selectedFeature !== null;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Top bar */}
      <div className="shrink-0 px-6 pt-6 pb-4 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Product Audit</h1>
            <p className="text-sm text-slate-500 mt-0.5">{features.length} features catalogued across {new Set(features.map(f => f.category)).size} categories</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none"
            >
              <option value="feature_id">Sort: ID</option>
              <option value="name">Sort: Name</option>
              <option value="category">Sort: Category</option>
            </select>
            <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-white transition-colors bg-white">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>

        <MetricsDashboard features={features} report={report} />
        <GuardianSummaryWidget onNavigate={onNavigate} />
        <TP001SummaryWidget onNavigate={onNavigate} />

        <div className="mt-4">
          <CategoryChips
            features={features}
            activeCategory={filters.category}
            onSelect={handleCategoryChip}
          />
        </div>
      </div>

      {/* Split layout — feature list + optional detail panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Feature list */}
        <div className={`flex flex-col ${showPanel ? 'w-80 shrink-0' : 'flex-1'} overflow-hidden border-r border-slate-200 bg-white transition-all`}>
          <div className="shrink-0 p-3 border-b border-slate-100 bg-slate-50">
            <FiltersBar
              filters={filters}
              onChange={setFilters}
              total={features.length}
              filtered={filtered.length}
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-8 text-center">
                <Filter className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No features match filters.</p>
                <button onClick={() => setFilters(DEFAULT_FILTERS)} className="mt-2 text-xs text-blue-600 hover:underline">
                  Clear filters
                </button>
              </div>
            ) : (
              filtered.map(f => (
                <FeatureListItem
                  key={f.id}
                  feature={f}
                  selected={selectedId === f.id}
                  onClick={() => setSelectedId(selectedId === f.id ? null : f.id)}
                />
              ))
            )}
          </div>

          {/* Future Run Audit CTA */}
          {!showPanel && (
            <div className="shrink-0 p-4 border-t border-slate-100 bg-slate-900">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Coming Phase 4</p>
                  <p className="text-sm font-bold text-white mt-0.5 truncate">Automated Product Audit</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed hidden lg:block">
                    Auto-scan migrations, pages &amp; edge functions to detect drift.
                  </p>
                </div>
                <button disabled className="ml-3 flex items-center gap-1.5 px-3 py-2 bg-slate-700 text-slate-400 rounded-xl text-xs font-medium cursor-not-allowed shrink-0">
                  <ClipboardCheck className="w-3.5 h-3.5" /> Run Audit
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {showPanel && selectedFeature && (
          <div className="flex-1 overflow-hidden">
            <ECCFeatureDetailPanel
              feature={selectedFeature}
              onClose={() => setSelectedId(null)}
              onUpdate={handleUpdate}
            />
          </div>
        )}
      </div>
    </div>
  );
}
