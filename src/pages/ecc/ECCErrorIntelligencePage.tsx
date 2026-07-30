import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, AlertCircle, CheckCircle2, Search, RefreshCw,
  Loader2, ChevronRight, X, Brain, Zap, Clock, BarChart3,
  Filter, Tag, Globe, Cpu, Database, Shield, Wifi, Code2,
  ChevronDown, ChevronUp, Copy, Check, Circle,
  TrendingUp, Eye, AlertOctagon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ErrorRecord {
  id: string;
  error_ref: string;
  title: string;
  error_type: string;
  severity: string;
  status: string;
  message: string;
  stack_trace: string | null;
  component_path: string | null;
  page_url: string | null;
  user_agent: string | null;
  browser_info: Record<string, unknown> | null;
  request_context: Record<string, unknown> | null;
  response_context: Record<string, unknown> | null;
  extra_context: Record<string, unknown> | null;
  ai_root_cause: string | null;
  ai_explanation: string | null;
  ai_recommended_fix: string | null;
  ai_impact_assessment: string | null;
  ai_prevention: string | null;
  ai_confidence: string | null;
  ai_analysed_at: string | null;
  is_duplicate: boolean;
  duplicate_of_id: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<string, { label: string; dot: string; badge: string; text: string; ring: string }> = {
  critical: { label: 'Critical', dot: 'bg-red-500',    badge: 'bg-red-50 border-red-200',    text: 'text-red-700',    ring: 'border-red-300' },
  high:     { label: 'High',     dot: 'bg-orange-500', badge: 'bg-orange-50 border-orange-200', text: 'text-orange-700', ring: 'border-orange-300' },
  medium:   { label: 'Medium',   dot: 'bg-amber-500',  badge: 'bg-amber-50 border-amber-200',  text: 'text-amber-700',  ring: 'border-amber-300' },
  low:      { label: 'Low',      dot: 'bg-blue-400',   badge: 'bg-blue-50 border-blue-200',    text: 'text-blue-700',   ring: 'border-blue-300' },
};

const STATUS_CONFIG: Record<string, { label: string; badge: string; text: string }> = {
  open:          { label: 'Open',          badge: 'bg-red-50 border-red-200',      text: 'text-red-700'      },
  investigating: { label: 'Investigating', badge: 'bg-amber-50 border-amber-200',  text: 'text-amber-700'    },
  resolved:      { label: 'Resolved',      badge: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  ignored:       { label: 'Ignored',       badge: 'bg-slate-100 border-slate-200', text: 'text-slate-500'    },
};

const TYPE_ICONS: Record<string, typeof AlertTriangle> = {
  runtime:       Code2,
  network:       Wifi,
  ui:            Globe,
  edge_function: Cpu,
  database:      Database,
  auth:          Shield,
  validation:    AlertCircle,
  unknown:       AlertTriangle,
};

const TYPE_LABELS: Record<string, string> = {
  runtime:       'Runtime',
  network:       'Network',
  ui:            'UI / React',
  edge_function: 'Edge Function',
  database:      'Database',
  auth:          'Auth',
  validation:    'Validation',
  unknown:       'Unknown',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
}

// ─── Copy Button ──────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button onClick={copy} className="p-1 rounded hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color = 'slate', icon: Icon,
}: {
  label: string; value: number | string; sub?: string;
  color?: 'slate' | 'red' | 'orange' | 'amber' | 'emerald' | 'blue';
  icon: typeof AlertTriangle;
}) {
  const colors = {
    slate:   { bg: 'bg-slate-50',   border: 'border-slate-200', text: 'text-slate-700',   icon: 'text-slate-400'   },
    red:     { bg: 'bg-red-50',     border: 'border-red-100',   text: 'text-red-700',     icon: 'text-red-400'     },
    orange:  { bg: 'bg-orange-50',  border: 'border-orange-100',text: 'text-orange-700',  icon: 'text-orange-400'  },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-100', text: 'text-amber-700',   icon: 'text-amber-400'   },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100',text: 'text-emerald-700',icon: 'text-emerald-400' },
    blue:    { bg: 'bg-blue-50',    border: 'border-blue-100',  text: 'text-blue-700',    icon: 'text-blue-400'    },
  }[color];
  return (
    <div className={`rounded-xl border p-4 ${colors.bg} ${colors.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 font-medium">{label}</p>
          <p className={`text-2xl font-bold mt-0.5 ${colors.text}`}>{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${colors.icon}`} />
      </div>
    </div>
  );
}

// ─── Error Detail Panel ───────────────────────────────────────────────────────

function ErrorDetailPanel({
  record, onClose, onAnalyse, onStatusChange, analysing,
}: {
  record: ErrorRecord;
  onClose: () => void;
  onAnalyse: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
  analysing: boolean;
}) {
  const sev = SEVERITY_CONFIG[record.severity] ?? SEVERITY_CONFIG.low;
  const sta = STATUS_CONFIG[record.status] ?? STATUS_CONFIG.open;
  const TypeIcon = TYPE_ICONS[record.error_type] ?? AlertTriangle;

  const [stackExpanded, setStackExpanded] = useState(false);
  const [fixExpanded, setFixExpanded] = useState(true);

  return (
    <div className="flex flex-col h-full bg-white border-l border-slate-200 overflow-y-auto">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3 shrink-0">
        <TypeIcon className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-slate-400">{record.error_ref}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${sev.badge} ${sev.text}`}>{sev.label}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${sta.badge} ${sta.text}`}>{sta.label}</span>
          </div>
          <h2 className="text-sm font-semibold text-slate-800 mt-1 leading-snug">{record.title}</h2>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 px-5 py-4 space-y-5">
        {/* Meta row */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-slate-400 uppercase tracking-wider text-[10px] mb-0.5">Type</p>
            <p className="font-medium text-slate-700 capitalize">{TYPE_LABELS[record.error_type] ?? record.error_type}</p>
          </div>
          <div>
            <p className="text-slate-400 uppercase tracking-wider text-[10px] mb-0.5">Occurrences</p>
            <p className="font-semibold text-slate-800">{record.occurrence_count.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-slate-400 uppercase tracking-wider text-[10px] mb-0.5">First Seen</p>
            <p className="font-medium text-slate-700">{formatDate(record.first_seen_at)}</p>
          </div>
          <div>
            <p className="text-slate-400 uppercase tracking-wider text-[10px] mb-0.5">Last Seen</p>
            <p className="font-medium text-slate-700">{formatDate(record.last_seen_at)}</p>
          </div>
          {record.component_path && (
            <div className="col-span-2">
              <p className="text-slate-400 uppercase tracking-wider text-[10px] mb-0.5">Component / File</p>
              <p className="font-mono text-xs text-slate-600 break-all">{record.component_path}</p>
            </div>
          )}
          {record.page_url && (
            <div className="col-span-2">
              <p className="text-slate-400 uppercase tracking-wider text-[10px] mb-0.5">Page URL</p>
              <p className="font-mono text-xs text-slate-600 break-all">{record.page_url}</p>
            </div>
          )}
        </div>

        {/* Status actions */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Update Status</p>
          <div className="flex flex-wrap gap-1.5">
            {(['open', 'investigating', 'resolved', 'ignored'] as const).map(s => {
              const cfg = STATUS_CONFIG[s];
              const active = record.status === s;
              return (
                <button
                  key={s}
                  onClick={() => onStatusChange(record.id, s)}
                  className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                    active
                      ? `${cfg.badge} ${cfg.text} ring-1 ring-offset-1 ring-current`
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Error message */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-400">Error Message</p>
            <CopyBtn text={record.message} />
          </div>
          <pre className="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-700 whitespace-pre-wrap break-words font-mono leading-relaxed">
            {record.message}
          </pre>
        </div>

        {/* Stack trace */}
        {record.stack_trace && (
          <div>
            <button
              onClick={() => setStackExpanded(v => !v)}
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors w-full"
            >
              {stackExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              Stack Trace
              <CopyBtn text={record.stack_trace} />
            </button>
            {stackExpanded && (
              <pre className="mt-2 text-[10px] bg-slate-900 text-slate-300 rounded-lg p-3 overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap break-words">
                {record.stack_trace}
              </pre>
            )}
          </div>
        )}

        {/* AI Analysis */}
        <div className="rounded-xl border border-blue-100 bg-blue-50/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-blue-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-blue-500" />
              <p className="text-xs font-semibold text-blue-800">AI Technical Director Analysis</p>
              {record.ai_confidence && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  record.ai_confidence === 'high' ? 'bg-emerald-100 text-emerald-700' :
                  record.ai_confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {record.ai_confidence} confidence
                </span>
              )}
            </div>
            <button
              onClick={() => onAnalyse(record.id)}
              disabled={analysing}
              className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              {analysing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              {analysing ? 'Analysing…' : record.ai_root_cause ? 'Re-Analyse' : 'Analyse'}
            </button>
          </div>

          {record.ai_root_cause ? (
            <div className="px-4 py-4 space-y-4">
              {/* Plain-English explanation */}
              {record.ai_explanation && (
                <div className="bg-blue-100/60 rounded-lg px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-blue-500 font-semibold mb-1">In Plain English</p>
                  <p className="text-sm text-blue-900 leading-relaxed">{record.ai_explanation}</p>
                </div>
              )}

              {/* Root cause */}
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Root Cause</p>
                <p className="text-xs text-slate-700 leading-relaxed">{record.ai_root_cause}</p>
              </div>

              {/* Impact */}
              {record.ai_impact_assessment && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Impact</p>
                  <p className="text-xs text-slate-700 leading-relaxed">{record.ai_impact_assessment}</p>
                </div>
              )}

              {/* Recommended fix */}
              {record.ai_recommended_fix && (
                <div>
                  <button
                    onClick={() => setFixExpanded(v => !v)}
                    className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold hover:text-slate-700 transition-colors w-full text-left"
                  >
                    {fixExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    Recommended Fix
                  </button>
                  {fixExpanded && (
                    <div className="mt-2 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                      <pre className="text-xs text-emerald-800 whitespace-pre-wrap leading-relaxed font-sans">
                        {record.ai_recommended_fix}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Prevention */}
              {record.ai_prevention && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1.5">Prevention</p>
                  <p className="text-xs text-slate-700 leading-relaxed">{record.ai_prevention}</p>
                </div>
              )}

              {record.ai_analysed_at && (
                <p className="text-[10px] text-slate-400 pt-1 border-t border-blue-100">
                  Analysed {formatDate(record.ai_analysed_at)}
                </p>
              )}
            </div>
          ) : (
            <div className="px-4 py-6 text-center">
              <Brain className="w-8 h-8 text-blue-200 mx-auto mb-2" />
              <p className="text-xs text-blue-600 font-medium">No AI analysis yet</p>
              <p className="text-[11px] text-blue-400 mt-1">Click Analyse to trigger the AI Technical Director RCA</p>
            </div>
          )}
        </div>

        {/* Tags */}
        {record.tags.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {record.tags.map(t => (
                <span key={t} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ECCErrorIntelligencePage() {
  const [records, setRecords]         = useState<ErrorRecord[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState<ErrorRecord | null>(null);
  const [analysing, setAnalysing]     = useState(false);
  const [search, setSearch]           = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterStatus, setFilterStatus]     = useState<string>('open');
  const [filterType, setFilterType]         = useState<string>('all');
  const [error, setError]             = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('ecc_error_records')
      .select('*')
      .order('last_seen_at', { ascending: false })
      .limit(200);
    if (err) { setError(err.message); setLoading(false); return; }
    setRecords(data ?? []);
    if (selected) {
      const refreshed = (data ?? []).find(r => r.id === selected.id);
      if (refreshed) setSelected(refreshed);
    }
    setLoading(false);
  }, [selected]);

  useEffect(() => { load(); }, [load]);

  const filtered = records.filter(r => {
    if (filterSeverity !== 'all' && r.severity !== filterSeverity) return false;
    if (filterStatus   !== 'all' && r.status   !== filterStatus)   return false;
    if (filterType     !== 'all' && r.error_type !== filterType)    return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.message.toLowerCase().includes(q) ||
        r.error_ref.toLowerCase().includes(q) ||
        (r.component_path ?? '').toLowerCase().includes(q) ||
        r.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const stats = {
    open:      records.filter(r => r.status === 'open').length,
    critical:  records.filter(r => r.severity === 'critical' && r.status !== 'resolved' && r.status !== 'ignored').length,
    high:      records.filter(r => r.severity === 'high' && r.status !== 'resolved' && r.status !== 'ignored').length,
    resolved:  records.filter(r => r.status === 'resolved').length,
    total:     records.length,
    noAnalysis: records.filter(r => !r.ai_root_cause && r.status === 'open').length,
  };

  async function handleAnalyse(id: string) {
    setAnalysing(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-error`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ error_id: id }),
        },
      );
      if (!res.ok) throw new Error(`Analysis failed (${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setAnalysing(false);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'resolved') patch.resolved_at = new Date().toISOString();
    await supabase.from('ecc_error_records').update(patch).eq('id', id);
    await load();
  }

  return (
    <div className="flex h-full overflow-hidden bg-slate-50">
      {/* Left panel — list */}
      <div className={`flex flex-col ${selected ? 'hidden lg:flex lg:w-[520px] shrink-0' : 'flex-1'} overflow-hidden border-r border-slate-200 bg-white`}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center">
                <AlertOctagon className="w-4 h-4 text-red-500" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-900">Error Intelligence</h1>
                <p className="text-[10px] text-slate-400">Engineering Error Intelligence Framework</p>
              </div>
            </div>
            <button
              onClick={load}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <StatCard label="Open Errors"  value={stats.open}     color="red"     icon={AlertTriangle}  sub={`${stats.noAnalysis} need AI RCA`} />
            <StatCard label="Critical"     value={stats.critical} color={stats.critical > 0 ? 'red' : 'slate'} icon={AlertOctagon} sub={`${stats.high} high`} />
            <StatCard label="Resolved"     value={stats.resolved} color="emerald" icon={CheckCircle2}   sub={`of ${stats.total} total`} />
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search errors, refs, components…"
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-slate-50 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2 mt-2.5 flex-wrap">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
              <option value="ignored">Ignored</option>
            </select>
            <select
              value={filterSeverity}
              onChange={e => setFilterSeverity(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All types</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Error list */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {loading && records.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-slate-200 mb-3" />
              <p className="text-sm font-medium text-slate-500">
                {records.length === 0 ? 'No errors captured yet' : 'No errors match your filters'}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                {records.length === 0
                  ? 'The EEIF will automatically capture runtime errors as they occur across the platform.'
                  : 'Try adjusting your search or filter criteria.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map(r => {
                const sev = SEVERITY_CONFIG[r.severity] ?? SEVERITY_CONFIG.low;
                const sta = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.open;
                const TypeIcon = TYPE_ICONS[r.error_type] ?? AlertTriangle;
                const isActive = selected?.id === r.id;

                return (
                  <button
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className={`w-full text-left px-4 py-3.5 hover:bg-slate-50 transition-colors group ${isActive ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">
                        <span className={`inline-block w-2 h-2 rounded-full ${sev.dot}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono text-slate-400">{r.error_ref}</span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${sta.badge} ${sta.text}`}>{sta.label}</span>
                          {r.ai_root_cause && (
                            <span className="text-[10px] text-blue-500 flex items-center gap-0.5">
                              <Brain className="w-2.5 h-2.5" /> RCA
                            </span>
                          )}
                          {r.occurrence_count > 1 && (
                            <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                              <TrendingUp className="w-2.5 h-2.5" /> ×{r.occurrence_count}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-slate-800 mt-0.5 truncate">{r.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <TypeIcon className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="text-[10px] text-slate-400 capitalize">{TYPE_LABELS[r.error_type] ?? r.error_type}</span>
                          <span className="text-[10px] text-slate-300">·</span>
                          <Clock className="w-3 h-3 text-slate-300 shrink-0" />
                          <span className="text-[10px] text-slate-400">{formatRelative(r.last_seen_at)}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0 mt-1" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 shrink-0">
          <p className="text-[10px] text-slate-400">
            {filtered.length} of {records.length} errors · EEIF captures errors automatically from the platform
          </p>
        </div>
      </div>

      {/* Right panel — detail */}
      {selected ? (
        <div className={`flex-1 overflow-hidden ${selected ? 'flex' : 'hidden'}`}>
          <ErrorDetailPanel
            record={selected}
            onClose={() => setSelected(null)}
            onAnalyse={handleAnalyse}
            onStatusChange={handleStatusChange}
            analysing={analysing}
          />
        </div>
      ) : (
        <div className="hidden lg:flex flex-1 items-center justify-center bg-slate-50">
          <div className="text-center max-w-xs">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mx-auto mb-4 shadow-sm">
              <Eye className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-sm font-semibold text-slate-500">Select an error to inspect</p>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              View root cause analysis, stack traces, AI recommendations, and manage lifecycle status.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
