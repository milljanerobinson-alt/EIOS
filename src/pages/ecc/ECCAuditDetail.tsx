import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, BarChart3, AlertTriangle, CheckCircle2, FileText,
  Star, ChevronDown, ChevronUp, Loader2, Download, Copy, Check,
  XCircle, Minus, Info, AlertCircle, Plus, Flag, Clock, User,
  Printer, ExternalLink, RefreshCw, Trash2, Edit3,
  TrendingUp, TrendingDown, Brain, Target,
  Shield, Activity, Package, Link2, GitBranch, BookOpen,
  Award, DollarSign, Cpu, TestTube, ClipboardList,
  FlaskConical, ArrowUpCircle, Archive, Calendar, CheckSquare,
  AlertOctagon, Zap, RotateCcw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Audit, AuditScore, AuditFinding, Recommendation } from './ECCAuditPage';
import {
  AUDIT_STATUS_CFG, SEVERITY_CFG, PRIORITY_CFG, READINESS_CFG,
  REC_STATUS_CFG, REC_PRIORITY_CFG, AUDIT_DOMAIN_CFG, CREATION_METHOD_CFG,
  StatusBadge, HealthRing, ScoreBar, CopyButton,
  scoreColor, scoreBarColor, scoreBgColor, formatDate, formatDateTime, normalizeReadiness,
} from './ECCAuditPage';

// ─── Local Types ───────────────────────────────────────────────────────────────

interface HealthSnapshot {
  id: string;
  audit_id: string;
  overall_score: number;
  category_scores: Record<string, number>;
  recorded_at: string;
  notes: string | null;
  domain_key: string | null;
  ecc_audits: { audit_number: string; name: string } | null;
}

interface ArtefactLink {
  id: string;
  audit_id: string;
  artefact_type: string;
  artefact_id: string | null;
  artefact_ref: string | null;
  artefact_title: string;
  notes: string | null;
  linked_at: string;
  linked_by: string | null;
}

interface EngineeringDecision {
  development_status: string;
  commercial_status: string;
  current_stage: string;
  current_release: string;
  recommended_next_release: string;
  recommended_next_stage: string;
  decision_date: string;
  approved_by: string;
  engineering_confidence: number;
  risk_level: string;
  verdict: string;
  rationale: string;
  recommendation?: 'approve' | 'approve_with_conditions' | 'reject';
  business_risk?: string;
  engineering_risk?: string;
  compliance_risk?: string;
  release_risk?: string;
  required_actions?: string[];
}

interface DirectorPriority {
  priority: number;
  investment: string;
  why: string;
  roi: string;
  effort: string;
  risk_reduction: string;
  platform_improvement: string;
}

type AuditFull = Audit & {
  engineering_decision: EngineeringDecision | null;
  director_summary: string | null;
  director_priorities: DirectorPriority[] | null;
  phase3_readiness_verdict: string | null;
  phase3_conditions: Array<{
    condition: number; title: string; rec: string; due: string; blocks: string; mandatory_for: string;
  }> | null;
  risk_level: string | null;
  engineering_effort_days: number | null;
};

// ─── Governance Types ─────────────────────────────────────────────────────────

interface GovernanceEvent {
  id: string;
  audit_id: string;
  event_type: string;
  event_timestamp: string;
  performed_by: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
}

const GOV_EVENT_CFG: Record<string, { label: string; Icon: typeof CheckCircle2; color: string; bg: string }> = {
  audit_created:          { label: 'Audit Created',            Icon: Plus,          color: 'text-slate-600',   bg: 'bg-slate-100'   },
  ai_generated:           { label: 'AI Generated',             Icon: Zap,           color: 'text-blue-600',    bg: 'bg-blue-50'     },
  submitted_for_review:   { label: 'Submitted for Review',     Icon: ArrowUpCircle, color: 'text-amber-600',   bg: 'bg-amber-50'    },
  review_started:         { label: 'Review Started',           Icon: BookOpen,      color: 'text-blue-600',    bg: 'bg-blue-50'     },
  approved:               { label: 'Approved',                 Icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-50'  },
  rejected:               { label: 'Returned to Draft',        Icon: RotateCcw,     color: 'text-amber-600',   bg: 'bg-amber-50'    },
  reference_designated:   { label: 'Reference Audit Designated', Icon: Star,        color: 'text-yellow-600',  bg: 'bg-yellow-50'   },
  reference_removed:      { label: 'Reference Status Removed', Icon: XCircle,       color: 'text-slate-500',   bg: 'bg-slate-100'   },
  reference_superseded:   { label: 'Reference Baseline Updated', Icon: RotateCcw,   color: 'text-blue-600',    bg: 'bg-blue-50'     },
  closed:                 { label: 'Audit Closed',             Icon: Archive,       color: 'text-slate-600',   bg: 'bg-slate-100'   },
  archived:               { label: 'Archived',                 Icon: Archive,       color: 'text-slate-400',   bg: 'bg-slate-50'    },
  reopened:               { label: 'Reopened',                 Icon: RefreshCw,     color: 'text-blue-600',    bg: 'bg-blue-50'     },
  promoted_to_production: { label: 'Promoted to Production',   Icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-50'  },
};

// ─── Tab System ───────────────────────────────────────────────────────────────

const TAB_GROUPS = [
  {
    key: 'summary' as const,
    label: 'Summary',
    tabs: [
      { key: 'overview',    label: 'Overview',            Icon: BarChart3   },
      { key: 'executive',   label: 'Executive Brief',     Icon: Brain       },
      { key: 'decision',    label: 'Engineering Decision', Icon: Target      },
    ],
  },
  {
    key: 'analysis' as const,
    label: 'Analysis',
    tabs: [
      { key: 'findings',       label: 'Findings',        Icon: AlertTriangle },
      { key: 'recommendations',label: 'Recommendations', Icon: Flag          },
      { key: 'scores',         label: 'Scores',          Icon: Star          },
      { key: 'trends',         label: 'Trend Analysis',  Icon: TrendingUp    },
    ],
  },
  {
    key: 'governance' as const,
    label: 'Governance',
    tabs: [
      { key: 'lifecycle',  label: 'Lifecycle',          Icon: CheckCircle2 },
      { key: 'metadata',   label: 'Governance Record',  Icon: ClipboardList },
      { key: 'report',     label: 'Report',             Icon: FileText     },
      { key: 'artefacts',  label: 'Linked Artefacts',   Icon: Link2        },
    ],
  },
] as const;

type GroupKey = typeof TAB_GROUPS[number]['key'];
type TabKey   = typeof TAB_GROUPS[number]['tabs'][number]['key'];

const ARTEFACT_TYPES: { value: string; label: string; Icon: typeof Link2 }[] = [
  { value: 'feature',           label: 'Feature',                  Icon: Cpu          },
  { value: 'epic',              label: 'Epic / Goal',              Icon: Award        },
  { value: 'test_plan',         label: 'Test Plan',                Icon: TestTube     },
  { value: 'release',           label: 'Release',                  Icon: Package      },
  { value: 'adr',               label: 'Architecture Decision',    Icon: GitBranch    },
  { value: 'guardian_finding',  label: 'Guardian Finding',         Icon: Shield       },
  { value: 'spec',              label: 'Engineering Specification', Icon: FileText     },
  { value: 'investment_review', label: 'Investment Review',        Icon: DollarSign   },
  { value: 'documentation',     label: 'Documentation',            Icon: BookOpen     },
  { value: 'other',             label: 'Other',                    Icon: Link2        },
];

// ─── KPI Config ───────────────────────────────────────────────────────────────

const KPI_LABELS: Record<string, { label: string; Icon: typeof Activity }> = {
  engineering_health:   { label: 'Engineering Health',  Icon: Activity    },
  architecture_health:  { label: 'Architecture Health', Icon: GitBranch   },
  testing_health:       { label: 'Testing Health',      Icon: TestTube    },
  compliance_health:    { label: 'Compliance Health',   Icon: Shield      },
  documentation_health: { label: 'Documentation',       Icon: BookOpen    },
  release_readiness:    { label: 'Release Readiness',   Icon: Package     },
  ai_platform_health:   { label: 'AI Platform Health',  Icon: Brain       },
  performance_health:   { label: 'Performance Health',  Icon: Cpu         },
  operational_health:   { label: 'Operational Health',  Icon: ClipboardList },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const W = 100, H = 28, pad = 3;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - 2 * pad);
    const y = H - pad - ((v - min) / range) * (H - 2 * pad);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
      {values.map((v, i) => {
        const x = pad + (i / (values.length - 1)) * (W - 2 * pad);
        const y = H - pad - ((v - min) / range) * (H - 2 * pad);
        return <circle key={i} cx={x} cy={y} r="2" fill={color} />;
      })}
    </svg>
  );
}

// ─── Linked Artefacts Tab ─────────────────────────────────────────────────────

function LinkedArtefactsTab({ audit }: { audit: Audit }) {
  const [links,   setLinks]   = useState<ArtefactLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding,  setAdding]  = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form, setForm] = useState({ artefact_type: 'feature', artefact_ref: '', artefact_title: '', notes: '', linked_by: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('ecc_audit_artefact_links').select('*').eq('audit_id', audit.id).order('linked_at');
    setLinks(data ?? []);
    setLoading(false);
  }, [audit.id]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!form.artefact_title.trim()) return;
    setSaving(true);
    await supabase.from('ecc_audit_artefact_links').insert({
      audit_id:       audit.id,
      artefact_type:  form.artefact_type,
      artefact_ref:   form.artefact_ref.trim() || null,
      artefact_title: form.artefact_title.trim(),
      notes:          form.notes.trim() || null,
      linked_by:      form.linked_by.trim() || null,
    });
    setSaving(false);
    setAdding(false);
    setForm({ artefact_type: 'feature', artefact_ref: '', artefact_title: '', notes: '', linked_by: '' });
    load();
  }

  async function handleDelete(id: string) {
    await supabase.from('ecc_audit_artefact_links').delete().eq('id', id);
    load();
  }

  const grouped = ARTEFACT_TYPES.map(t => ({
    ...t,
    items: links.filter(l => l.artefact_type === t.value),
  })).filter(g => g.items.length > 0);

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Linked Engineering Artefacts</h3>
          <p className="text-xs text-slate-400 mt-0.5">{links.length} linked · full engineering traceability</p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors">
            <Plus className="w-3.5 h-3.5" />Link Artefact
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h4 className="text-sm font-semibold text-slate-800">Link Engineering Artefact</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Artefact Type</label>
              <select value={form.artefact_type} onChange={e => setForm(f => ({ ...f, artefact_type: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none">
                {ARTEFACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Reference</label>
              <input type="text" value={form.artefact_ref} onChange={e => setForm(f => ({ ...f, artefact_ref: e.target.value }))}
                placeholder="e.g. F-001, TP-001"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">Title <span className="text-red-500">*</span></label>
            <input type="text" value={form.artefact_title} onChange={e => setForm(f => ({ ...f, artefact_title: e.target.value }))}
              placeholder="Display name of the linked artefact..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Notes</label>
              <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Why this is linked..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Linked By</label>
              <input type="text" value={form.linked_by} onChange={e => setForm(f => ({ ...f, linked_by: e.target.value }))}
                placeholder="Your name..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => setAdding(false)} className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={!form.artefact_title.trim() || saving}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Link Artefact
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : links.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-10 text-center">
          <Link2 className="w-7 h-7 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No linked artefacts yet.</p>
          <p className="text-xs text-slate-400 mt-1">Link features, test plans, releases, and other engineering artefacts to create full traceability.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(g => {
            const GroupIcon = g.Icon;
            return (
              <div key={g.value} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <GroupIcon className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs font-semibold text-slate-700">{g.label}</span>
                  <span className="ml-auto text-[10px] text-slate-400">{g.items.length}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {g.items.map(link => (
                    <div key={link.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {link.artefact_ref && (
                            <span className="text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{link.artefact_ref}</span>
                          )}
                          <p className="text-sm font-medium text-slate-800 truncate">{link.artefact_title}</p>
                        </div>
                        {link.notes && <p className="text-xs text-slate-500 mt-0.5">{link.notes}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          {link.linked_by && <span className="flex items-center gap-1 text-[10px] text-slate-400"><User className="w-2.5 h-2.5" />{link.linked_by}</span>}
                          <span className="text-[10px] text-slate-400">{formatDate(link.linked_at)}</span>
                        </div>
                      </div>
                      <button onClick={() => handleDelete(link.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Executive KPIs Section ────────────────────────────────────────────────────

function ExecutiveKPIsSection({ audit }: { audit: Audit }) {
  const kpis = audit.executive_kpis ?? {};

  const kpiEntries = Object.entries(KPI_LABELS)
    .map(([key, cfg]) => ({ key, ...cfg, score: kpis[key] ?? null }))
    .filter(k => k.score !== null);

  const scoreEntries = Object.entries(kpis)
    .filter(([k]) => !KPI_LABELS[k])
    .map(([k, v]) => ({ key: k, label: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), score: v }));

  const allEntries = [...kpiEntries, ...scoreEntries];

  if (allEntries.length === 0) {
    return (
      <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 flex items-center gap-3">
        <Info className="w-4 h-4 text-slate-400 shrink-0" />
        <p className="text-xs text-slate-500">Executive KPIs unavailable — this audit predates Audit Engine v1.0.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">Executive KPIs</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {allEntries.map(({ key, label, score }) => {
          const Icon = (KPI_LABELS[key]?.Icon) ?? Activity;
          return (
            <div key={key} className={`rounded-lg border p-3 ${scoreBgColor(score as number)}`}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Icon className="w-3 h-3 opacity-70" />
                <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</span>
              </div>
              <p className="text-2xl font-bold">{score}</p>
              <div className="h-1 bg-current/20 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-current rounded-full opacity-60 transition-all" style={{ width: `${score}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Historical Comparison Section ────────────────────────────────────────────

function HistoricalComparisonSection({ audit }: { audit: Audit }) {
  const [prev, setPrev]   = useState<Audit | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      if (!audit.previous_audit_id) { setLoaded(true); return; }
      const { data } = await supabase.from('ecc_audits').select('*').eq('id', audit.previous_audit_id).maybeSingle();
      setPrev(data ?? null);
      setLoaded(true);
    }
    load();
  }, [audit.id, audit.previous_audit_id]);

  if (!loaded) return null;

  // No previous audit authorised by the Audit Engine — show baseline notice
  if (!audit.previous_audit_id) {
    return (
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
        <Info className="w-4 h-4 text-slate-400 shrink-0" />
        <div>
          <p className="text-xs font-medium text-slate-600">No prior audit in this domain for comparison.</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            This is the baseline audit for the <strong>{(AUDIT_DOMAIN_CFG[audit.audit_type] ?? AUDIT_DOMAIN_CFG.other).label}</strong> domain.
            A comparison will be available after the next production audit in this domain.
          </p>
        </div>
      </div>
    );
  }

  if (!prev || audit.overall_health_score === null) return null;

  const prevScore  = prev.overall_health_score ?? 0;
  const currScore  = audit.overall_health_score;
  const delta      = currScore - prevScore;
  const prevCrit   = (prev.critical_findings_count ?? 0) + (prev.high_findings_count ?? 0);
  const currCrit   = (audit.critical_findings_count ?? 0) + (audit.high_findings_count ?? 0);
  const deltaCrit  = currCrit - prevCrit;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        {delta > 0 ? <TrendingUp className="w-4 h-4 text-emerald-500" /> : delta < 0 ? <TrendingDown className="w-4 h-4 text-red-500" /> : <Minus className="w-4 h-4 text-slate-400" />}
        <h3 className="text-sm font-semibold text-slate-800">vs. {prev.is_reference ? '⭐ Reference Audit' : 'Previous Audit'}</h3>
        <span className="text-xs text-slate-400 ml-auto">vs. {prev.audit_number} · {formatDateTime(prev.created_at)}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <p className={`text-sm font-semibold text-slate-500`}>{prevScore}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Previous Score</p>
        </div>
        <div className={`rounded-lg p-3 text-center ${delta > 0 ? 'bg-emerald-50' : delta < 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
          <p className={`text-xl font-bold ${delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-red-700' : 'text-slate-700'}`}>
            {delta > 0 ? '+' : ''}{delta}
          </p>
          <p className={`text-[10px] mt-0.5 ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-slate-400'}`}>
            {delta > 0 ? 'Improvement' : delta < 0 ? 'Regression' : 'No Change'}
          </p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <p className={`text-sm font-semibold ${scoreColor(currScore)}`}>{currScore}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Current Score</p>
        </div>
        <div className={`rounded-lg p-3 text-center ${deltaCrit < 0 ? 'bg-emerald-50' : deltaCrit > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
          <p className={`text-sm font-semibold ${deltaCrit < 0 ? 'text-emerald-700' : deltaCrit > 0 ? 'text-red-700' : 'text-slate-700'}`}>
            {deltaCrit > 0 ? '+' : ''}{deltaCrit}
          </p>
          <p className={`text-[10px] mt-0.5 ${deltaCrit < 0 ? 'text-emerald-600' : deltaCrit > 0 ? 'text-red-600' : 'text-slate-400'}`}>
            Crit/High Findings
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Governance Events Timeline ───────────────────────────────────────────────

function GovernanceEventsTimeline({ events, loading }: { events: GovernanceEvent[]; loading: boolean }) {
  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;
  }
  if (events.length === 0) {
    return (
      <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center">
        <Activity className="w-6 h-6 text-slate-200 mx-auto mb-2" />
        <p className="text-xs text-slate-400">No governance events recorded yet.</p>
      </div>
    );
  }
  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />
      <div className="space-y-0">
        {[...events].reverse().map((ev, i) => {
          const cfg = GOV_EVENT_CFG[ev.event_type] ?? { label: ev.event_type, Icon: Activity, color: 'text-slate-500', bg: 'bg-slate-100' };
          const Icon = cfg.Icon;
          return (
            <div key={ev.id} className={`relative flex gap-4 pb-4 ${i === events.length - 1 ? '' : ''}`}>
              <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center z-10 ${cfg.bg} ring-2 ring-white`}>
                <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                  {ev.performed_by && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-400">
                      <User className="w-2.5 h-2.5" />{ev.performed_by}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(ev.event_timestamp)}</p>
                {ev.notes && <p className="text-xs text-slate-600 mt-1 leading-relaxed">{ev.notes}</p>}
                {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {Object.entries(ev.metadata).map(([k, v]) => (
                      <span key={k} className="text-[9px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {k.replace(/_/g, ' ')}: {String(v)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Smart Lifecycle Guidance ──────────────────────────────────────────────────

function SmartLifecycleGuidance({ audit }: { audit: Audit }) {
  const domainLabel = (AUDIT_DOMAIN_CFG[audit.audit_type] ?? AUDIT_DOMAIN_CFG.other).label;

  const guidance: { color: string; bg: string; border: string; Icon: typeof Info; title: string; body: string } | null = (() => {
    if (audit.is_draft) return null;
    switch (audit.status) {
      case 'ai_generated':
        return { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', Icon: Info,
          title: 'This audit is ready for review.',
          body:  'Submit it for review to begin the governance approval workflow.' };
      case 'in_progress':
        return { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', Icon: Info,
          title: 'Review is in progress.',
          body:  'Submit for review when ready to enter the formal approval workflow.' };
      case 'under_review':
        return { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', Icon: AlertTriangle,
          title: 'This audit can now be approved.',
          body:  'Add reviewer details and notes, then approve to complete the governance workflow.' };
      case 'approved':
        if (!audit.is_reference) {
          return { color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', Icon: CheckCircle2,
            title: 'This audit is ready to be closed.',
            body:  'Optionally designate it as the Reference Audit for the ' + domainLabel + ' domain before closing.' };
        }
        return { color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', Icon: Star,
          title: 'This is the active Reference Audit.',
          body:  'Close the audit to complete the governance record. The reference designation will be preserved.' };
      case 'closed':
        if (!audit.is_reference) {
          return { color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', Icon: CheckCircle2,
            title: 'Audit lifecycle completed.',
            body:  'This audit is closed. Governance records have been finalised.' };
        }
        return null;
      default:
        return null;
    }
  })();

  if (!guidance) return null;
  const Icon = guidance.Icon;
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 mb-5 ${guidance.bg} ${guidance.border}`}>
      <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${guidance.color}`} />
      <div>
        <p className={`text-xs font-semibold ${guidance.color}`}>{guidance.title}</p>
        <p className={`text-[11px] mt-0.5 ${guidance.color} opacity-80`}>{guidance.body}</p>
      </div>
    </div>
  );
}

// ─── Governance Metadata Panel ────────────────────────────────────────────────

function GovernanceMetadataPanel({
  audit, events, eventsLoading, onRefresh,
}: {
  audit: Audit; events: GovernanceEvent[]; eventsLoading: boolean; onRefresh: () => void;
}) {
  const [editNotes, setEditNotes]       = useState(false);
  const [govNotes, setGovNotes]         = useState(audit.governance_notes ?? '');
  const [govVersion, setGovVersion]     = useState(audit.governance_version ?? '');
  const [reviewFreq, setReviewFreq]     = useState(audit.review_frequency ?? '');
  const [saving, setSaving]             = useState(false);

  const domain     = AUDIT_DOMAIN_CFG[audit.audit_type] ?? AUDIT_DOMAIN_CFG.other;
  const status     = AUDIT_STATUS_CFG[audit.status];
  const approvalEv = events.find(e => e.event_type === 'approved');
  const refEv      = events.find(e => e.event_type === 'reference_designated');

  function govHealth(): { label: string; color: string; bg: string; items: { label: string; ok: boolean }[] } {
    const items = [
      { label: 'Reviewer assigned',       ok: !!audit.reviewer },
      { label: 'Review date recorded',    ok: !!audit.review_date },
      { label: 'Review notes present',    ok: !!audit.review_notes },
      { label: 'Domain assigned',         ok: !!audit.audit_type },
      { label: 'Governance version set',  ok: !!audit.governance_version },
      { label: audit.is_reference ? 'Reference approved by' : 'Reference status defined',
        ok: audit.is_reference ? !!audit.reference_approved_by : true },
    ];
    const passed = items.filter(i => i.ok).length;
    const pct    = Math.round((passed / items.length) * 100);
    return {
      label: pct >= 83 ? 'Complete' : pct >= 50 ? 'Partial' : 'Incomplete',
      color: pct >= 83 ? 'text-emerald-700' : pct >= 50 ? 'text-amber-700' : 'text-red-700',
      bg:    pct >= 83 ? 'bg-emerald-50'    : pct >= 50 ? 'bg-amber-50'    : 'bg-red-50',
      items,
    };
  }

  async function saveGovernanceFields() {
    setSaving(true);
    await supabase.from('ecc_audits').update({
      governance_notes:   govNotes.trim() || null,
      governance_version: govVersion.trim() || null,
      review_frequency:   reviewFreq || null,
    }).eq('id', audit.id);
    setSaving(false);
    setEditNotes(false);
    onRefresh();
  }

  const health = govHealth();

  const FREQ_OPTS = [
    { value: '',              label: 'Not scheduled'    },
    { value: 'every_release', label: 'Every Release'    },
    { value: 'quarterly',     label: 'Quarterly'        },
    { value: 'biannual',      label: 'Every Six Months' },
    { value: 'annual',        label: 'Annually'         },
  ];

  return (
    <div className="p-6 max-w-3xl space-y-5">

      {/* Governance Health */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Governance Health</h3>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${health.bg} ${health.color}`}>{health.label}</span>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {health.items.map(item => (
            <div key={item.label} className="flex items-center gap-2">
              {item.ok
                ? <CheckSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                : <AlertOctagon className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
              <span className={`text-xs ${item.ok ? 'text-slate-600' : 'text-amber-700 font-medium'}`}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Core Metadata */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Governance Metadata</h3>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <MetaRow label="Reference Audit" value={
            audit.is_reference
              ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-yellow-700 bg-yellow-50 px-2 py-0.5 rounded-full border border-yellow-200"><Star className="w-2.5 h-2.5 fill-yellow-500 text-yellow-500" />Yes</span>
              : <span className="text-xs text-slate-400">No</span>
          } />
          <MetaRow label="Domain" value={<span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${domain.bg} ${domain.color}`}>{domain.label}</span>} />
          <MetaRow label="Current Status" value={status ? <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${status.bg} ${status.text}`}>{status.label}</span> : <span className="text-xs text-slate-400">{audit.status}</span>} />
          <MetaRow label="Version" value={<span className="text-xs text-slate-700">{audit.reference_version ?? audit.governance_version ?? '—'}</span>} />
          <MetaRow label="Reviewer" value={<span className="text-xs text-slate-700">{audit.reviewer ?? '—'}</span>} />
          <MetaRow label="Review Date" value={<span className="text-xs text-slate-700">{audit.review_date ? formatDate(audit.review_date) : '—'}</span>} />
          <MetaRow label="Approval Date" value={<span className="text-xs text-slate-700">{audit.approval_date ? formatDateTime(audit.approval_date) : (approvalEv ? formatDateTime(approvalEv.event_timestamp) : '—')}</span>} />
          <MetaRow label="Designated By" value={<span className="text-xs text-slate-700">{audit.reference_approved_by ?? '—'}</span>} />
          <MetaRow label="Designation Date" value={<span className="text-xs text-slate-700">{audit.reference_date ? formatDateTime(audit.reference_date) : (refEv ? formatDateTime(refEv.event_timestamp) : '—')}</span>} />
          <MetaRow label="Previous Reference" value={<span className="text-xs text-slate-400">{audit.reference_superseded_by ? 'Superseded prior reference' : '—'}</span>} />
          <MetaRow label="Governance Version" value={<span className="text-xs text-slate-700">{audit.governance_version ?? '—'}</span>} />
          <MetaRow label="Audit Engine" value={<span className="text-xs text-slate-700">{(audit as any).audit_engine_version ?? '—'}</span>} />
          <MetaRow label="Workspace" value={<span className="text-xs text-slate-700 capitalize">{audit.workspace}</span>} />
          <MetaRow label="Created" value={<span className="text-xs text-slate-700">{formatDateTime(audit.created_at)}</span>} />
        </div>
      </div>

      {/* Editable governance fields */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Governance Configuration</h3>
          {!editNotes && (
            <button onClick={() => setEditNotes(true)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
              <Edit3 className="w-3.5 h-3.5" />Edit
            </button>
          )}
        </div>
        <div className="p-5 space-y-4">
          {editNotes ? (
            <>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">Governance Version</label>
                <input type="text" value={govVersion} onChange={e => setGovVersion(e.target.value)}
                  placeholder="e.g. Engineering Governance v1.0"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">Review Frequency</label>
                <select value={reviewFreq} onChange={e => setReviewFreq(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none">
                  {FREQ_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1.5">Governance Notes</label>
                <textarea rows={4} value={govNotes} onChange={e => setGovNotes(e.target.value)}
                  placeholder="Record governance decisions, notes, and context for this audit..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditNotes(false)} className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium transition-colors">Cancel</button>
                <button onClick={saveGovernanceFields} disabled={saving}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save
                </button>
              </div>
            </>
          ) : (
            <>
              <MetaRow label="Governance Version" value={<span className="text-xs text-slate-700">{audit.governance_version ?? <em className="text-slate-400">Not set</em>}</span>} />
              <MetaRow label="Review Frequency"
                value={<span className="text-xs text-slate-700">{FREQ_OPTS.find(o => o.value === (audit.review_frequency ?? ''))?.label ?? 'Not scheduled'}</span>} />
              <MetaRow label="Governance Notes" value={
                audit.governance_notes
                  ? <p className="text-xs text-slate-700 leading-relaxed">{audit.governance_notes}</p>
                  : <em className="text-xs text-slate-400">No notes recorded.</em>
              } />
            </>
          )}
        </div>
      </div>

      {/* Governance Event Timeline */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Governance Timeline</h3>
          <p className="text-xs text-slate-400 mt-0.5">Complete engineering governance history — immutable record</p>
        </div>
        <div className="p-5">
          <GovernanceEventsTimeline events={events} loading={eventsLoading} />
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <div>{value}</div>
    </div>
  );
}

// ─── Governance Validation Panel ──────────────────────────────────────────────

interface ValidationError { field: string; message: string; rule: string; fix: string }

function GovernanceValidationPanel({ errors, onDismiss }: { errors: ValidationError[]; onDismiss: () => void }) {
  if (errors.length === 0) return null;
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" />
          <h4 className="text-sm font-semibold text-red-800">Governance Validation Failed</h4>
        </div>
        <button onClick={onDismiss} className="text-red-400 hover:text-red-600 transition-colors">
          <XCircle className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs text-red-700">The following mandatory governance information is missing. Complete these before closing this audit.</p>
      <div className="space-y-2">
        {errors.map((e, i) => (
          <div key={i} className="bg-white border border-red-100 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-mono">{e.field}</span>
              <span className="text-xs font-medium text-red-700">{e.message}</span>
            </div>
            <p className="text-[11px] text-slate-500"><strong className="text-slate-600">Rule:</strong> {e.rule}</p>
            <p className="text-[11px] text-slate-500"><strong className="text-slate-600">Fix:</strong> {e.fix}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recommendations Tab ──────────────────────────────────────────────────────

function RecommendationsTab({ audit }: { audit: Audit }) {
  const [recs, setRecs]       = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const [editId, setEditId]   = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', owner: '', due_date: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('ecc_audit_recommendations').select('*').eq('audit_id', audit.id).order('created_at');
    setRecs(data ?? []);
    setLoading(false);
  }, [audit.id]);

  useEffect(() => { load(); }, [load]);

  function resetForm() { setForm({ title: '', description: '', priority: 'medium', owner: '', due_date: '' }); setAdding(false); setEditId(null); }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    if (editId) {
      await supabase.from('ecc_audit_recommendations').update({
        title: form.title.trim(), description: form.description.trim(),
        priority: form.priority, owner: form.owner.trim() || null, due_date: form.due_date || null,
        updated_at: new Date().toISOString(),
      }).eq('id', editId);
    } else {
      await supabase.from('ecc_audit_recommendations').insert({
        audit_id: audit.id, title: form.title.trim(), description: form.description.trim(),
        priority: form.priority, owner: form.owner.trim() || null, due_date: form.due_date || null,
      });
    }
    setSaving(false); resetForm(); load();
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('ecc_audit_recommendations').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    load();
  }

  async function createWorkItem(r: Recommendation) {
    if (r.work_item_created) return;
    const { data: item } = await supabase.from('ecc_backlog_items').insert({
      title: r.title, description: r.description ?? null, priority: r.priority,
      status: 'backlog', category: 'engineering', tags: ['from-audit', r.rec_number],
    }).select('id').single();
    if (item) {
      await supabase.from('ecc_audit_recommendations').update({ work_item_created: true, work_item_id: item.id, updated_at: new Date().toISOString() }).eq('id', r.id);
      load();
    }
  }

  async function handleDelete(id: string) { await supabase.from('ecc_audit_recommendations').delete().eq('id', id); load(); }
  function startEdit(r: Recommendation) { setForm({ title: r.title, description: r.description ?? '', priority: r.priority, owner: r.owner ?? '', due_date: r.due_date ?? '' }); setEditId(r.id); setAdding(true); }

  const openRecs   = recs.filter(r => r.status === 'open' || r.status === 'in_progress');
  const closedRecs = recs.filter(r => r.status === 'completed' || r.status === 'deferred' || r.status === 'cancelled');

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Recommendations</h3>
          <p className="text-xs text-slate-400 mt-0.5">{openRecs.length} open · {closedRecs.length} closed</p>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors">
            <Plus className="w-3.5 h-3.5" />Add Recommendation
          </button>
        )}
      </div>

      {adding && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h4 className="text-sm font-semibold text-slate-800">{editId ? 'Edit Recommendation' : 'New Recommendation'}</h4>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">Title <span className="text-red-500">*</span></label>
            <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Short, actionable title..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">Description</label>
            <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Detailed description, context, or acceptance criteria..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none">
                {Object.entries(REC_PRIORITY_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Owner</label>
              <input type="text" value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="Name or team..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1.5">Due Date</label>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={resetForm} className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-medium transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={!form.title.trim() || saving}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editId ? 'Save Changes' : 'Add Recommendation'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : recs.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center">
          <Flag className="w-7 h-7 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No recommendations yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recs.map(r => {
            const pri = REC_PRIORITY_CFG[r.priority] ?? REC_PRIORITY_CFG.medium;
            const sta = REC_STATUS_CFG[r.status] ?? REC_STATUS_CFG.open;
            return (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-mono text-slate-400">{r.rec_number}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${sta.bg} ${sta.text} ${sta.border}`}>
                        <span className={`w-1 h-1 rounded-full ${sta.dot}`} />{sta.label}
                      </span>
                      <span className={`text-[10px] font-semibold ${pri.color}`}>{pri.label}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800">{r.title}</p>
                    {r.description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{r.description}</p>}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {r.owner && <span className="flex items-center gap-1 text-xs text-slate-400"><User className="w-3 h-3" />{r.owner}</span>}
                      {r.due_date && <span className="flex items-center gap-1 text-xs text-slate-400"><Clock className="w-3 h-3" />Due {formatDate(r.due_date)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => startEdit(r)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                {r.status !== 'completed' && r.status !== 'cancelled' && (
                  <div className="flex gap-1.5 mt-3 pt-3 border-t border-slate-100 flex-wrap">
                    {r.status === 'open' && <button onClick={() => updateStatus(r.id, 'in_progress')} className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[11px] font-semibold transition-colors">Start</button>}
                    {(r.status === 'open' || r.status === 'in_progress') && <button onClick={() => updateStatus(r.id, 'completed')} className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[11px] font-semibold transition-colors">Complete</button>}
                    <button onClick={() => updateStatus(r.id, 'deferred')} className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-[11px] font-semibold transition-colors">Defer</button>
                    <button onClick={() => updateStatus(r.id, 'cancelled')} className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-[11px] font-semibold transition-colors">Cancel</button>
                    <div className="flex-1" />
                    {r.work_item_created ? (
                      <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[11px] font-semibold border border-emerald-200"><Package className="w-3 h-3" />Work Item Created</span>
                    ) : (
                      <button onClick={() => createWorkItem(r)} className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-semibold transition-colors"><Package className="w-3 h-3" />Create Work Item</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Engineering Decision Tab ─────────────────────────────────────────────────

function EngineeringDecisionTab({ audit }: { audit: AuditFull }) {
  const decision = audit.engineering_decision;

  const riskColors: Record<string, string> = {
    low:      'text-emerald-700 bg-emerald-50 border-emerald-200',
    medium:   'text-amber-700 bg-amber-50 border-amber-200',
    high:     'text-orange-700 bg-orange-50 border-orange-200',
    critical: 'text-red-700 bg-red-50 border-red-200',
  };

  const RECOMMENDATION_CFG = {
    approve:                 { label: 'Approve',                  color: 'bg-emerald-600 text-white border-emerald-700' },
    approve_with_conditions: { label: 'Approve with Conditions',  color: 'bg-amber-500 text-white border-amber-600' },
    reject:                  { label: 'Reject',                   color: 'bg-red-600 text-white border-red-700' },
  };

  const verdictColor = (v: string) => {
    if (!v) return 'bg-slate-100 text-slate-700 border-slate-200';
    if (v.toLowerCase().includes('ready') && !v.toLowerCase().includes('condition')) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    if (v.toLowerCase().includes('condition')) return 'bg-amber-50 text-amber-800 border-amber-200';
    return 'bg-red-50 text-red-800 border-red-200';
  };

  return (
    <div className="p-6 max-w-3xl space-y-5">

      {/* Formal recommendation badge */}
      {decision?.recommendation && (
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold ${RECOMMENDATION_CFG[decision.recommendation]?.color ?? RECOMMENDATION_CFG.approve.color}`}>
          <Award className="w-4 h-4" />
          Governance Recommendation: {RECOMMENDATION_CFG[decision.recommendation]?.label ?? decision.recommendation}
        </div>
      )}

      {/* Verdict banner */}
      {(decision || audit.phase3_readiness_verdict) && (
        <div className={`rounded-xl border px-5 py-4 ${verdictColor(decision?.verdict ?? audit.phase3_readiness_verdict ?? '')}`}>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-60 mb-1">Engineering Decision</p>
          <p className="text-xl font-bold">{decision?.verdict ?? audit.phase3_readiness_verdict?.replace(/_/g, ' ').toUpperCase()}</p>
          {decision?.decision_date && (
            <p className="text-xs mt-1 opacity-70">Recorded {formatDate(decision.decision_date)} · Approved by {decision.approved_by}</p>
          )}
        </div>
      )}

      {!decision && !audit.phase3_readiness_verdict && (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center">
          <Target className="w-7 h-7 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No engineering decision recorded for this audit.</p>
          <p className="text-xs text-slate-400 mt-1">Decisions are generated automatically for AI audits or can be added manually.</p>
        </div>
      )}

      {decision && (
        <>
          {/* Confidence + risk */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className={`text-3xl font-bold ${scoreColor(decision.engineering_confidence)}`}>{decision.engineering_confidence}%</p>
              <p className="text-xs text-slate-400 mt-1">Engineering Confidence</p>
            </div>
            <div className={`rounded-xl border p-4 text-center ${riskColors[decision.risk_level] ?? riskColors.medium}`}>
              <p className="text-3xl font-bold capitalize">{decision.risk_level}</p>
              <p className="text-xs mt-1 opacity-70">Overall Risk Level</p>
            </div>
          </div>

          {/* Risk breakdown */}
          {(decision.business_risk || decision.engineering_risk || decision.compliance_risk || decision.release_risk) && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Risk Assessment</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { label: 'Business Risk',    val: decision.business_risk    },
                  { label: 'Engineering Risk', val: decision.engineering_risk },
                  { label: 'Compliance Risk',  val: decision.compliance_risk  },
                  { label: 'Release Risk',     val: decision.release_risk     },
                ].filter(r => r.val).map(({ label, val }) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
                    <p className="text-sm text-slate-700">{val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Platform status grid */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Platform Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { label: 'Development Status',    val: decision.development_status        },
                { label: 'Commercial Status',      val: decision.commercial_status        },
                { label: 'Current Stage',          val: decision.current_stage            },
                { label: 'Current Release',        val: decision.current_release          },
                { label: 'Next Release',           val: decision.recommended_next_release },
                { label: 'Next Stage',             val: decision.recommended_next_stage   },
              ].filter(i => i.val).map(({ label, val }) => (
                <div key={label} className="bg-slate-50 rounded-lg p-3">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
                  <p className="text-sm font-medium text-slate-800">{val}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Required actions */}
          {decision.required_actions && decision.required_actions.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Required Actions Before Approval</h3>
              <ul className="space-y-2">
                {decision.required_actions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{i + 1}</span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Rationale */}
          {decision.rationale && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Decision Rationale</h3>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{decision.rationale}</p>
            </div>
          )}
        </>
      )}

      {/* Phase 3 conditions */}
      {audit.phase3_conditions && audit.phase3_conditions.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Approval Conditions</h3>
          <div className="space-y-3">
            {audit.phase3_conditions.map(c => (
              <div key={c.condition} className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{c.condition}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-900">{c.title}</p>
                  <p className="text-xs text-amber-700 mt-0.5">Ref: {c.rec} · Due {formatDate(c.due)}</p>
                  <p className="text-xs text-amber-600 mt-1">Mandatory for: {c.mandatory_for}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Executive Brief Tab ──────────────────────────────────────────────────────

function ExecutiveBriefTab({ audit }: { audit: AuditFull }) {
  const priorities = audit.director_priorities;

  const ROI_LABELS = [
    { key: 'roi', label: 'ROI' },
    { key: 'effort', label: 'Effort' },
    { key: 'risk_reduction', label: 'Risk Reduction' },
    { key: 'platform_improvement', label: 'Platform Impact' },
  ];

  return (
    <div className="p-6 max-w-3xl space-y-5">

      {/* Executive Summary panel */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-800">Executive Engineering Brief</h3>
        </div>
        {audit.director_summary ? (
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{audit.director_summary}</p>
        ) : (
          <div className="text-center py-6">
            <Brain className="w-7 h-7 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No executive brief available for this audit.</p>
            <p className="text-xs text-slate-400 mt-1">Executive briefs are generated automatically for AI audits.</p>
          </div>
        )}
      </div>

      {/* KPI Summary if available */}
      {audit.overall_health_score !== null && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Engineering Health', val: audit.overall_health_score },
            { label: 'Risk Level', val: audit.risk_level ?? (audit.engineering_decision as EngineeringDecision | null)?.risk_level, isText: true },
            { label: 'Effort (days)', val: audit.engineering_effort_days ?? (audit.engineering_decision as EngineeringDecision | null)?.engineering_confidence, isScore: true },
          ].map(({ label, val, isText, isScore }) => val != null && (
            <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              {isText
                ? <p className="text-lg font-bold text-slate-800 capitalize">{String(val)}</p>
                : <p className={`text-2xl font-bold ${isScore ? scoreColor(Number(val)) : scoreColor(Number(val))}`}>{val}</p>}
              <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Top Investment Priorities */}
      {priorities && priorities.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800 px-1">Recommended Investment Areas</h3>
          {priorities.map(p => (
            <div key={p.priority} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start gap-3 mb-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white ${p.priority === 1 ? 'bg-red-500' : p.priority === 2 ? 'bg-orange-500' : 'bg-amber-500'}`}>
                  {p.priority}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-800">{p.investment}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{p.why}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pl-10">
                {ROI_LABELS.map(({ key, label }) => (p as Record<string, string>)[key] && (
                  <div key={key} className="bg-slate-50 rounded-lg p-2">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                    <p className="text-xs text-slate-700 mt-0.5">{(p as Record<string, string>)[key]}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Trend Analysis Tab ───────────────────────────────────────────────────────

function TrendAnalysisTab({ auditId, auditDomain }: { auditId: string; auditDomain: string }) {
  const [snapshots, setSnapshots] = useState<HealthSnapshot[]>([]);
  const [loading, setLoading]     = useState(true);
  const [viewMode, setViewMode]   = useState<'overall' | 'categories'>('overall');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('ecc_health_history')
        .select('*, ecc_audits(audit_number, name)')
        .eq('domain_key', auditDomain)
        .order('recorded_at');
      setSnapshots((data as HealthSnapshot[]) ?? []);
      setLoading(false);
    }
    load();
  }, [auditId, auditDomain]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;

  if (snapshots.length === 0) {
    return (
      <div className="p-6 max-w-3xl">
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-10 text-center">
          <TrendingUp className="w-8 h-8 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No health history snapshots yet.</p>
          <p className="text-xs text-slate-400 mt-1">Trend data is recorded with each audit completion.</p>
        </div>
      </div>
    );
  }

  const allCats      = Array.from(new Set(snapshots.flatMap(s => Object.keys(s.category_scores ?? {})))).sort();
  const overallDelta = snapshots.length >= 2 ? snapshots[snapshots.length - 1].overall_score - snapshots[0].overall_score : 0;
  const overallValues = snapshots.map(s => s.overall_score);

  return (
    <div className="p-6 max-w-3xl space-y-5">
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {(['overall', 'categories'] as const).map(m => (
          <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${viewMode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {m}
          </button>
        ))}
      </div>

      {viewMode === 'overall' && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Overall Health Trend — {AUDIT_DOMAIN_CFG[auditDomain]?.label ?? auditDomain}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{snapshots.length} audits · {formatDateTime(snapshots[0].recorded_at)} → {formatDateTime(snapshots[snapshots.length - 1].recorded_at)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-2xl font-bold ${scoreColor(snapshots[snapshots.length - 1].overall_score)}`}>
                  {snapshots[snapshots.length - 1].overall_score}
                </p>
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  {overallDelta > 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : overallDelta < 0 ? <TrendingDown className="w-3.5 h-3.5 text-red-500" /> : <Minus className="w-3.5 h-3.5 text-slate-400" />}
                  <span className={`text-xs font-semibold ${overallDelta > 0 ? 'text-emerald-600' : overallDelta < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                    {overallDelta > 0 ? '+' : ''}{overallDelta}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-5">
              <Sparkline values={overallValues} color={overallDelta >= 0 ? '#10b981' : '#ef4444'} />
            </div>
            <div className="flex justify-between mt-2">
              {snapshots.map((s) => (
                <div key={s.id} className="text-center">
                  <p className={`text-xs font-bold ${scoreColor(s.overall_score)}`}>{s.overall_score}</p>
                  <p className="text-[9px] text-slate-400">{s.ecc_audits?.audit_number ?? '—'}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Audit History</h3>
            <div className="space-y-3">
              {snapshots.map((s, i) => (
                <div key={s.id} className="flex items-center gap-4">
                  <div className="w-16 shrink-0 text-center">
                    <p className={`text-lg font-bold ${scoreColor(s.overall_score)}`}>{s.overall_score}</p>
                    <p className="text-[9px] text-slate-400">{s.ecc_audits?.audit_number ?? '—'}</p>
                  </div>
                  <div className="flex-1">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${s.overall_score >= 80 ? 'bg-emerald-500' : s.overall_score >= 60 ? 'bg-teal-500' : s.overall_score >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${s.overall_score}%` }} />
                    </div>
                    {s.notes && <p className="text-[10px] text-slate-400 mt-1 truncate">{s.notes}</p>}
                  </div>
                  <p className="text-xs text-slate-400 shrink-0">{formatDateTime(s.recorded_at)}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {viewMode === 'categories' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Category Trends</h3>
          <div className="space-y-4">
            {allCats.map(cat => {
              const vals   = snapshots.map(s => s.category_scores?.[cat] ?? 0);
              const latest = vals[vals.length - 1] ?? 0;
              const delta  = vals.length >= 2 ? latest - vals[0] : 0;
              const isSelected = selectedCat === cat;
              return (
                <div key={cat}>
                  <button onClick={() => setSelectedCat(isSelected ? null : cat)}
                    className="w-full flex items-center gap-3 hover:bg-slate-50 rounded-lg p-2 -mx-2 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-700 font-medium truncate">{cat}</span>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {delta !== 0 && <span className={`text-[10px] font-semibold ${delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{delta > 0 ? '+' : ''}{delta}</span>}
                          <span className={`text-xs font-bold ${scoreColor(latest)}`}>{latest}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${latest >= 80 ? 'bg-emerald-500' : latest >= 60 ? 'bg-teal-500' : latest >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${latest}%` }} />
                      </div>
                    </div>
                    {vals.length >= 2 && <div className="shrink-0"><Sparkline values={vals} color={delta >= 0 ? '#10b981' : '#ef4444'} /></div>}
                  </button>
                  {isSelected && vals.length >= 2 && (
                    <div className="mt-2 pl-2 flex gap-4">
                      {snapshots.map((s) => (
                        <div key={s.id} className="text-center">
                          <p className={`text-xs font-bold ${scoreColor(s.category_scores?.[cat] ?? 0)}`}>{s.category_scores?.[cat] ?? '—'}</p>
                          <p className="text-[9px] text-slate-400">{s.ecc_audits?.audit_number ?? '—'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

function generateExecutivePDF(audit: Audit, scores: AuditScore[], findings: AuditFinding[]) {
  const win = window.open('', '_blank');
  if (!win) return;
  const scoreHtml = scores.map(s => `<div class="score-row"><span class="score-label">${s.category}</span><div class="score-bar-wrap"><div class="score-bar" style="width:${s.score}%;background:${s.score >= 80 ? '#10b981' : s.score >= 60 ? '#14b8a6' : s.score >= 40 ? '#f59e0b' : '#ef4444'}"></div></div><span class="score-num">${s.score}/100</span></div>`).join('');
  const criticalFindings = findings.filter(f => f.severity === 'critical' || f.severity === 'high');
  const findingsHtml = criticalFindings.map(f => `<div class="finding"><div class="finding-header"><span class="badge-${f.severity}">${f.severity.toUpperCase()}</span><strong>${f.finding_number}: ${f.title}</strong></div><p>${f.description}</p>${f.recommendation ? `<p class="recommendation"><strong>Recommendation:</strong> ${f.recommendation}</p>` : ''}</div>`).join('');
  const domainLabel = (AUDIT_DOMAIN_CFG[audit.audit_type] ?? AUDIT_DOMAIN_CFG.other).label;
  const methodLabel = (CREATION_METHOD_CFG[audit.creation_method ?? 'manual'] ?? CREATION_METHOD_CFG.manual).label;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Engineering Audit — ${audit.name}</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b;background:white;padding:40px;max-width:900px;margin:0 auto;font-size:14px;line-height:1.6;}.header{border-bottom:3px solid #0f172a;padding-bottom:24px;margin-bottom:32px;}.header-top{display:flex;justify-content:space-between;align-items:flex-start;}.brand{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;}.audit-id{font-size:12px;font-family:monospace;color:#64748b;}h1{font-size:26px;font-weight:700;color:#0f172a;margin:16px 0 4px;}.meta{font-size:12px;color:#64748b;}.section{margin-bottom:32px;}h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-bottom:16px;}.health-num{font-size:48px;font-weight:800;color:${(audit.overall_health_score ?? 0) >= 80 ? '#10b981' : (audit.overall_health_score ?? 0) >= 60 ? '#14b8a6' : (audit.overall_health_score ?? 0) >= 40 ? '#f59e0b' : '#ef4444'};}.health-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;}.score-row{display:flex;align-items:center;gap:12px;margin-bottom:12px;}.score-label{width:140px;font-size:12px;color:#475569;}.score-bar-wrap{flex:1;height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;}.score-bar{height:100%;border-radius:4px;}.score-num{width:50px;text-align:right;font-size:12px;font-weight:700;color:#0f172a;}.finding{background:#fafafa;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:12px;}.finding-header{display:flex;align-items:center;gap:10px;margin-bottom:8px;}.badge-critical{background:#fee2e2;color:#dc2626;font-size:10px;font-weight:800;padding:2px 8px;border-radius:4px;}.badge-high{background:#fed7aa;color:#c2410c;font-size:10px;font-weight:800;padding:2px 8px;border-radius:4px;}.recommendation{margin-top:8px;color:#374151;background:#f0fdf4;padding:8px 12px;border-radius:6px;border-left:3px solid #10b981;}.footer{margin-top:48px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;display:flex;justify-content:space-between;}@media print{body{padding:20px;}}</style></head><body>
<div class="header"><div class="header-top"><span class="brand">Engineering Audit Report — Executive Summary</span><span class="audit-id">${audit.audit_number}</span></div><h1>${audit.name}</h1><div class="meta">Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · Type: ${domainLabel} · Method: ${methodLabel} · Status: ${AUDIT_STATUS_CFG[audit.status]?.label ?? audit.status}</div></div>
${audit.overall_health_score !== null ? `<div class="section"><h2>Platform Health</h2><div class="health-num">${audit.overall_health_score}</div><div class="health-label">Health Score / 100</div></div>` : ''}
${audit.executive_summary ? `<div class="section"><h2>Executive Summary</h2><p>${audit.executive_summary.replace(/\n/g, '<br>')}</p></div>` : ''}
${scores.length > 0 ? `<div class="section"><h2>Category Scores</h2>${scoreHtml}</div>` : ''}
${criticalFindings.length > 0 ? `<div class="section"><h2>Critical & High Findings (${criticalFindings.length})</h2>${findingsHtml}</div>` : ''}
<div class="footer"><span>Engineering Command Centre · Confidential</span><span>${audit.audit_number} · ${new Date().toISOString().split('T')[0]}</span></div>
<script>window.onload=function(){window.print();}</script></body></html>`;
  win.document.write(html);
  win.document.close();
}

// ─── Audit Detail ─────────────────────────────────────────────────────────────

export function AuditDetail({
  audit,
  onBack,
  onRefresh,
}: {
  audit: Audit;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const auditFull = audit as AuditFull;
  const [activeGroup, setActiveGroup] = useState<GroupKey>('summary');
  const [activeTab,   setActiveTab]   = useState<TabKey>('overview');
  const [scores,    setScores]    = useState<AuditScore[]>([]);
  const [findings,  setFindings]  = useState<AuditFinding[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());
  const [reviewNotes, setReviewNotes] = useState(audit.review_notes ?? '');
  const [reviewer, setReviewer]       = useState(audit.reviewer ?? '');
  const [saving, setSaving]           = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [draftAction, setDraftAction]  = useState<'delete' | 'promote' | null>(null);
  const [draftWorking, setDraftWorking] = useState(false);
  const [draftError, setDraftError]    = useState<string | null>(null);

  // Reference audit state
  const [refAction, setRefAction]   = useState<'designate' | 'remove' | null>(null);
  const [refWorking, setRefWorking] = useState(false);
  const [refError, setRefError]     = useState<string | null>(null);
  const [refReason, setRefReason]   = useState(
    audit.reference_reason ?? 'Establishes the approved engineering baseline for this domain following successful completion of the audit.'
  );
  const [refApprovedBy, setRefApprovedBy] = useState('');
  const [refVersion, setRefVersion] = useState('');

  // Governance events
  const [govEvents, setGovEvents]         = useState<GovernanceEvent[]>([]);
  const [govEventsLoading, setGovEventsLoading] = useState(true);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  const domainCfg  = AUDIT_DOMAIN_CFG[audit.audit_type]            ?? AUDIT_DOMAIN_CFG.other;
  const methodCfg  = CREATION_METHOD_CFG[audit.creation_method ?? 'manual'] ?? CREATION_METHOD_CFG.manual;
  const isSandbox  = (audit as any).workspace === 'sandbox' || (!((audit as any).workspace) && audit.is_draft);
  const isLegacy   = (audit as any).workspace === 'legacy';
  const engineVer  = (audit as any).audit_engine_version as string | null | undefined;

  const loadGovEvents = useCallback(async () => {
    setGovEventsLoading(true);
    const { data } = await supabase
      .from('ecc_audit_governance_events')
      .select('*')
      .eq('audit_id', audit.id)
      .order('event_timestamp');
    setGovEvents(data ?? []);
    setGovEventsLoading(false);
  }, [audit.id]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: sc }, { data: fi }] = await Promise.all([
        supabase.from('ecc_audit_scores').select('*').eq('audit_id', audit.id).order('score', { ascending: false }),
        supabase.from('ecc_audit_findings').select('*').eq('audit_id', audit.id).order('finding_number'),
      ]);
      setScores(sc ?? []);
      setFindings(fi ?? []);
      setLoading(false);
    }
    load();
    loadGovEvents();
  }, [audit.id, loadGovEvents]);

  async function writeGovernanceEvent(
    eventType: string,
    notes: string,
    performedBy?: string,
    metadata?: Record<string, unknown>,
  ) {
    await supabase.from('ecc_audit_governance_events').insert({
      audit_id:        audit.id,
      event_type:      eventType,
      event_timestamp: new Date().toISOString(),
      performed_by:    performedBy ?? reviewer ?? null,
      notes,
      metadata:        metadata ?? null,
    });
    loadGovEvents();
  }

  function validateForClose(): ValidationError[] {
    const errs: ValidationError[] = [];
    if (!reviewer.trim() && !audit.reviewer) {
      errs.push({
        field: 'reviewer',
        message: 'Reviewer name is required before closing.',
        rule: 'Every closed audit must have a named reviewer.',
        fix: 'Enter the reviewer name in the Reviewer field above.',
      });
    }
    if (!audit.review_date) {
      errs.push({
        field: 'review_date',
        message: 'Review date has not been recorded.',
        rule: 'A review date must be set during the approval step.',
        fix: 'Approve the audit before closing. Approval sets the review date automatically.',
      });
    }
    if (!reviewNotes.trim() && !audit.review_notes) {
      errs.push({
        field: 'review_notes',
        message: 'Review notes are missing.',
        rule: 'Review notes must be recorded to provide governance context.',
        fix: 'Enter review notes in the Review Notes field above.',
      });
    }
    if (!audit.audit_type) {
      errs.push({
        field: 'audit_type',
        message: 'Domain has not been assigned.',
        rule: 'Every audit must have a domain assigned.',
        fix: 'This audit was not created correctly. Contact your Engineering team.',
      });
    }
    const history = (audit as AuditFull).lifecycle_history ?? [];
    if (history.length === 0 && govEvents.length === 0) {
      errs.push({
        field: 'governance_timeline',
        message: 'No governance history has been recorded.',
        rule: 'A closed audit must have at least one governance event on record.',
        fix: 'Submit the audit for review and approve it before closing.',
      });
    }
    return errs;
  }

  function selectTab(groupKey: GroupKey, tabKey: TabKey) {
    setActiveGroup(groupKey);
    setActiveTab(tabKey);
  }

  function toggleExpand(id: string) {
    setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  async function handleLifecycleAction(action: 'start' | 'submit_review' | 'approve' | 'reject' | 'close' | 'archive' | 'reopen') {
    // Pre-close governance validation
    if (action === 'close') {
      const errs = validateForClose();
      if (errs.length > 0) {
        setValidationErrors(errs);
        selectTab('governance', 'lifecycle');
        return;
      }
    }
    setValidationErrors([]);

    const statusMap: Record<string, string> = {
      start: 'in_progress', submit_review: 'under_review', approve: 'approved',
      reject: 'ai_generated', close: 'closed', archive: 'archived', reopen: 'ai_generated',
    };
    const now       = new Date().toISOString();
    const newStatus = statusMap[action];
    const historyEntry = { from: audit.status, to: newStatus, at: now, by: reviewer || undefined };
    const currentHistory = (audit as AuditFull).lifecycle_history ?? [];

    // Auto-populate review notes on submit_review if empty
    let effectiveReviewNotes = reviewNotes;
    if (action === 'submit_review' && !reviewNotes.trim()) {
      effectiveReviewNotes = 'This audit has been reviewed and approved as the official engineering baseline for its domain. The findings, recommendations and governance decisions have been accepted as the reference standard for future engineering activities.';
      setReviewNotes(effectiveReviewNotes);
    }

    // Auto-populate approval notes on approve
    const approvalNotesValue = (audit as any).approval_notes ||
      'This audit has been reviewed and accepted. This audit becomes the official engineering reference for future development, governance and architectural decision making.';

    setSaving(true);
    await supabase.from('ecc_audits').update({
      status:           newStatus,
      review_notes:     effectiveReviewNotes || null,
      reviewer:         reviewer || null,
      review_date:      action === 'approve' ? now : audit.review_date,
      approval_date:    action === 'approve' ? now : (audit as any).approval_date,
      approval_notes:   action === 'approve' ? approvalNotesValue : (audit as any).approval_notes,
      lifecycle_history: [...currentHistory, historyEntry],
    }).eq('id', audit.id);

    // Write governance event
    const eventTypeMap: Record<string, string> = {
      start:         'review_started',
      submit_review: 'submitted_for_review',
      approve:       'approved',
      reject:        'rejected',
      close:         'closed',
      archive:       'archived',
      reopen:        'reopened',
    };
    const eventNoteMap: Record<string, string> = {
      start:         'Review process initiated.',
      submit_review: 'Audit submitted for formal governance review.',
      approve:       `Audit approved by ${reviewer || 'reviewer'}. ${approvalNotesValue}`,
      reject:        'Audit returned to draft for revision.',
      close:         'Audit lifecycle completed. Governance records finalised.',
      archive:       'Audit archived.',
      reopen:        'Audit reopened for further review.',
    };
    await writeGovernanceEvent(
      eventTypeMap[action],
      eventNoteMap[action],
      reviewer || undefined,
      action === 'approve' ? { overall_health_score: audit.overall_health_score } : undefined,
    );

    setSaving(false);
    onRefresh();
  }

  const criticalFindings = findings.filter(f => f.severity === 'critical' || f.severity === 'high');
  const filteredFindings = severityFilter === 'all' ? findings : findings.filter(f => f.severity === severityFilter);

  async function handleDeleteDraft() {
    setDraftWorking(true);
    setDraftError(null);
    try {
      // Delete all child records first
      await Promise.all([
        supabase.from('ecc_audit_findings').delete().eq('audit_id', audit.id),
        supabase.from('ecc_audit_scores').delete().eq('audit_id', audit.id),
        supabase.from('ecc_audit_recommendations').delete().eq('audit_id', audit.id),
        supabase.from('ecc_audit_artefact_links').delete().eq('audit_id', audit.id),
        supabase.from('ecc_health_history').delete().eq('audit_id', audit.id),
      ]);
      const { error } = await supabase.from('ecc_audits').delete().eq('id', audit.id);
      if (error) throw new Error(error.message);
      setDraftAction(null);
      onBack();
      onRefresh();
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : 'Delete failed');
      setDraftWorking(false);
    }
  }

  async function handlePromoteToProduction() {
    setDraftWorking(true);
    setDraftError(null);
    try {
      // Get next AUD number from production audits
      const { data: prodAudits } = await supabase
        .from('ecc_audits')
        .select('audit_number, workspace')
        .neq('workspace', 'sandbox')
        .order('created_at', { ascending: false })
        .limit(20);

      let nextNum = 1;
      if (prodAudits && prodAudits.length > 0) {
        for (const a of prodAudits) {
          const n = parseInt(String(a.audit_number).replace('AUD-', ''), 10);
          if (!isNaN(n) && n >= nextNum) nextNum = n + 1;
        }
      }
      const newAuditNumber = `AUD-${String(nextNum).padStart(3, '0')}`;

      const now = new Date().toISOString();
      const currentHistory = (audit as AuditFull).lifecycle_history ?? [];

      const { error: updateErr } = await supabase.from('ecc_audits').update({
        is_draft:     false,
        workspace:    'production',
        audit_number: newAuditNumber,
        status:       audit.status === 'draft' ? 'ai_generated' : audit.status,
        lifecycle_history: [...currentHistory, {
          from:  'sandbox',
          to:    'production',
          at:    now,
          by:    'Engineering Director',
          notes: `Promoted from Sandbox to Production Audit ${newAuditNumber}`,
        }],
        updated_at: now,
      }).eq('id', audit.id);

      if (updateErr) throw new Error(updateErr.message);

      // Insert health history snapshot now that it's a production audit
      await supabase.from('ecc_health_history').insert({
        audit_id:      audit.id,
        overall_score: audit.overall_health_score ?? 0,
        category_scores: {},
        recorded_at:   now,
        notes:         `${audit.name} · Promoted from Draft to Production`,
      });

      // Register in engineering register
      const { data: regNum } = await supabase.rpc('get_next_register_number', { p_type: 'aud' });
      if (regNum) {
        await supabase.from('ecc_engineering_register').insert({
          register_number: regNum,
          register_type:   'aud',
          entity_id:       audit.id,
          entity_table:    'ecc_audits',
          title:           audit.name,
          status:          'draft',
        });
      }

      setDraftAction(null);
      onRefresh();
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : 'Promotion failed');
      setDraftWorking(false);
    }
  }

  async function handleDesignateReference() {
    if (!refReason.trim() || !refApprovedBy.trim()) {
      setRefError('Reason and Approved By are required.');
      return;
    }
    setRefWorking(true);
    setRefError(null);
    try {
      const now = new Date().toISOString();

      // Find the current reference audit for this domain (to record supersession)
      const { data: prevRef } = await supabase
        .from('ecc_audits')
        .select('id, audit_number, name')
        .eq('audit_type', audit.audit_type)
        .eq('is_reference', true)
        .eq('is_draft', false)
        .neq('id', audit.id)
        .maybeSingle();

      // Clear any existing reference for this domain and mark it as superseded
      if (prevRef) {
        await supabase
          .from('ecc_audits')
          .update({
            is_reference: false,
            reference_reason: null,
            reference_date: null,
            reference_approved_by: null,
            reference_version: null,
            reference_superseded_by: audit.id,
          })
          .eq('id', prevRef.id);

        // Write superseded event on the old reference audit
        await supabase.from('ecc_audit_governance_events').insert({
          audit_id:        prevRef.id,
          event_type:      'reference_superseded',
          event_timestamp: now,
          performed_by:    refApprovedBy.trim(),
          notes:           `Reference baseline for the ${domainCfg.label} domain superseded by ${audit.audit_number}: ${audit.name}.`,
          metadata:        { superseded_by: audit.id, superseded_by_number: audit.audit_number },
        });
      }

      const { error } = await supabase
        .from('ecc_audits')
        .update({
          is_reference:          true,
          reference_reason:      refReason.trim(),
          reference_date:        now,
          reference_approved_by: refApprovedBy.trim(),
          reference_version:     refVersion.trim() || null,
        })
        .eq('id', audit.id);

      if (error) throw new Error(error.message);

      // Write governance event for this audit
      await writeGovernanceEvent(
        'reference_designated',
        `Official Reference Audit established for the ${domainCfg.label} domain. This audit now represents the approved engineering baseline for future architecture reviews, engineering decisions and platform evolution. ${refReason.trim()}`,
        refApprovedBy.trim(),
        {
          domain:      audit.audit_type,
          version:     refVersion.trim() || null,
          approved_by: refApprovedBy.trim(),
          ...(prevRef ? { supersedes: prevRef.audit_number } : {}),
        },
      );

      setRefAction(null);
      setRefApprovedBy('');
      setRefVersion('');
      onRefresh();
    } catch (e) {
      setRefError(e instanceof Error ? e.message : 'Failed to designate reference.');
      setRefWorking(false);
    }
  }

  async function handleRemoveReference() {
    setRefWorking(true);
    setRefError(null);
    try {
      const { error } = await supabase
        .from('ecc_audits')
        .update({ is_reference: false, reference_reason: null, reference_date: null, reference_approved_by: null, reference_version: null })
        .eq('id', audit.id);
      if (error) throw new Error(error.message);
      await writeGovernanceEvent(
        'reference_removed',
        `Reference Audit designation removed from ${audit.audit_number}. This audit is no longer the active baseline for the ${domainCfg.label} domain.`,
        reviewer || undefined,
      );
      setRefAction(null);
      onRefresh();
    } catch (e) {
      setRefError(e instanceof Error ? e.message : 'Failed to remove reference status.');
      setRefWorking(false);
    }
  }

  const currentGroupTabs = TAB_GROUPS.find(g => g.key === activeGroup)?.tabs ?? TAB_GROUPS[0].tabs;

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="flex items-start gap-4 mb-4">
          <button onClick={onBack} className="p-1.5 mt-0.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[11px] font-mono font-semibold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{audit.audit_number}</span>
              {isSandbox ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                  <FlaskConical className="w-3 h-3" />SANDBOX
                </span>
              ) : isLegacy ? (
                <>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                    <Archive className="w-3 h-3" />LEGACY
                  </span>
                  <StatusBadge status={audit.status} />
                </>
              ) : (
                <StatusBadge status={audit.status} />
              )}
              {audit.is_reference && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-50 text-yellow-700 border border-yellow-300">
                  <Star className="w-2.5 h-2.5 fill-yellow-500 text-yellow-500" />
                  Reference Audit
                </span>
              )}
              <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${domainCfg.bg} ${domainCfg.color}`}>{domainCfg.label}</span>
              <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${methodCfg.bg} ${methodCfg.text}`}>{methodCfg.label}</span>
              {engineVer && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                  <Cpu className="w-2.5 h-2.5" />{engineVer}
                </span>
              )}
              {audit.overall_health_score !== null && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 ${isLegacy ? 'text-slate-400' : scoreColor(audit.overall_health_score)}`}>
                  {audit.overall_health_score}/100
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold text-slate-900 truncate">{audit.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{formatDateTime(audit.created_at)}</p>
          </div>
        </div>

        {/* Group selector */}
        <div className="flex items-center gap-1 mb-3">
          {TAB_GROUPS.map(group => (
            <button
              key={group.key}
              onClick={() => { setActiveGroup(group.key); setActiveTab(group.tabs[0].key as TabKey); }}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                activeGroup === group.key
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              {group.label}
            </button>
          ))}
        </div>

        {/* Tab selector within group */}
        <div className="flex gap-0.5 overflow-x-auto">
          {currentGroupTabs.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as TabKey)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                activeTab === key
                  ? 'bg-slate-50 text-slate-900 border border-b-0 border-slate-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {key === 'findings' && criticalFindings.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-full">{criticalFindings.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-slate-50">

          {/* ── Legacy Archive Banner ── */}
          {isLegacy && (
            <div className="bg-slate-100 border-b border-slate-300 px-6 py-4">
              <div className="flex items-start gap-3 max-w-4xl">
                <Archive className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-slate-700">Archived Historical Audit</p>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                    This audit was generated using a superseded Engineering Audit methodology and is retained for historical reference only.
                    It is <strong>permanently excluded</strong> from governance reporting, trend analysis, executive KPIs, dashboard metrics,
                    and cannot be selected as a Previous Audit or Reference Audit.
                  </p>
                  {engineVer && (
                    <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                      <Cpu className="w-3 h-3" />Audit Engine: <strong>{engineVer}</strong>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Sandbox Banner ── */}
          {isSandbox && (
            <div className="bg-amber-50 border-b border-amber-200 px-6 py-3">
              <div className="flex items-center justify-between gap-4 flex-wrap max-w-4xl">
                <div className="flex items-start gap-3">
                  <FlaskConical className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Sandbox Audit</p>
                    <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                      This audit exists solely for engineering validation and is <strong>excluded</strong> from governance reporting,
                      trend analysis, KPIs, comparisons, and dashboards.
                      Validate the output, then promote it to make it a permanent production record.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => { setDraftAction('promote'); setDraftError(null); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    <ArrowUpCircle className="w-3.5 h-3.5" />
                    Promote to Production
                  </button>
                  <button
                    onClick={() => { setDraftAction('delete'); setDraftError(null); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              {/* Confirmation dialogs */}
              {draftAction === 'delete' && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-4 max-w-lg">
                  <p className="text-sm font-semibold text-red-800 mb-1">Delete this sandbox audit?</p>
                  <p className="text-xs text-red-700 mb-3">This will permanently delete the audit, all findings, scores, recommendations, and linked artefacts. This cannot be undone.</p>
                  {draftError && <p className="text-xs text-red-600 mb-2">{draftError}</p>}
                  <div className="flex items-center gap-2">
                    <button onClick={() => setDraftAction(null)} disabled={draftWorking}
                      className="px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-100 rounded-lg text-xs font-medium">Cancel</button>
                    <button onClick={handleDeleteDraft} disabled={draftWorking}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                      {draftWorking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Confirm Delete
                    </button>
                  </div>
                </div>
              )}

              {draftAction === 'promote' && (
                <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4 max-w-lg">
                  <p className="text-sm font-semibold text-emerald-800 mb-1">Promote to Production Audit?</p>
                  <p className="text-xs text-emerald-700 mb-3">
                    This will assign the next official AUD number, move the audit to Production workspace,
                    and include it in governance history, trend analysis, and executive reporting. This cannot be reversed.
                  </p>
                  {draftError && <p className="text-xs text-red-600 mb-2">{draftError}</p>}
                  <div className="flex items-center gap-2">
                    <button onClick={() => setDraftAction(null)} disabled={draftWorking}
                      className="px-3 py-1.5 border border-emerald-200 text-emerald-600 hover:bg-emerald-100 rounded-lg text-xs font-medium">Cancel</button>
                    <button onClick={handlePromoteToProduction} disabled={draftWorking}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                      {draftWorking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Promote to Production
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Reference Audit Banner (production only) ── */}
          {!isSandbox && !isLegacy && (
            <div className={`border-b px-6 py-3 ${audit.is_reference ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-slate-100'}`}>
              <div className="flex items-center justify-between gap-4 flex-wrap max-w-4xl">
                <div className="flex items-start gap-3">
                  <Star className={`w-4 h-4 shrink-0 mt-0.5 ${audit.is_reference ? 'fill-yellow-500 text-yellow-500' : 'text-slate-300'}`} />
                  <div>
                    {audit.is_reference ? (
                      <>
                        <p className="text-sm font-semibold text-yellow-800">Reference Audit — Active Benchmark</p>
                        <p className="text-xs text-yellow-700 mt-0.5 leading-relaxed">
                          This is the official <strong>{(AUDIT_DOMAIN_CFG[audit.audit_type] ?? AUDIT_DOMAIN_CFG.other).label}</strong> domain reference.
                          Engineering governance tools use it as a trusted baseline.
                          {audit.reference_version && <> Version: <strong>{audit.reference_version}</strong>.</>}
                          {audit.reference_approved_by && <> Approved by <strong>{audit.reference_approved_by}</strong>.</>}
                          {audit.reference_date && <> Designated {formatDate(audit.reference_date)}.</>}
                        </p>
                        {audit.reference_reason && (
                          <p className="text-xs text-yellow-600 mt-1 italic">"{audit.reference_reason}"</p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-slate-500">This audit is not a Reference Audit. Designate it to make it the official <strong>{(AUDIT_DOMAIN_CFG[audit.audit_type] ?? AUDIT_DOMAIN_CFG.other).label}</strong> domain baseline.</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {audit.is_reference ? (
                    <button
                      onClick={() => { setRefAction('remove'); setRefError(null); }}
                      className="flex items-center gap-1.5 px-3 py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 border border-yellow-300 rounded-lg text-xs font-semibold transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Remove Reference Status
                    </button>
                  ) : (
                    <button
                      onClick={() => { setRefAction('designate'); setRefError(null); }}
                      className="flex items-center gap-1.5 px-3 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-xs font-semibold transition-colors"
                    >
                      <Star className="w-3.5 h-3.5" />
                      Designate as Reference
                    </button>
                  )}
                </div>
              </div>

              {/* Designate confirmation form */}
              {refAction === 'designate' && (
                <div className="mt-3 bg-yellow-50 border border-yellow-300 rounded-xl p-4 max-w-lg">
                  <p className="text-sm font-semibold text-yellow-900 mb-1">Designate as Reference Audit?</p>
                  <p className="text-xs text-yellow-800 mb-3">
                    This will become the official <strong>{(AUDIT_DOMAIN_CFG[audit.audit_type] ?? AUDIT_DOMAIN_CFG.other).label}</strong> reference baseline.
                    Any existing reference in this domain will be automatically replaced.
                  </p>
                  <div className="space-y-2 mb-3">
                    <div>
                      <label className="text-[10px] font-semibold text-yellow-800 uppercase tracking-wide">Reason *</label>
                      <input
                        value={refReason}
                        onChange={e => setRefReason(e.target.value)}
                        placeholder="Why is this the reference audit?"
                        className="mt-1 w-full px-2.5 py-1.5 border border-yellow-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-yellow-800 uppercase tracking-wide">Approved By *</label>
                      <input
                        value={refApprovedBy}
                        onChange={e => setRefApprovedBy(e.target.value)}
                        placeholder="Name or email of approver"
                        className="mt-1 w-full px-2.5 py-1.5 border border-yellow-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-yellow-800 uppercase tracking-wide">Version Tag <span className="font-normal normal-case text-yellow-700">(optional)</span></label>
                      <input
                        value={refVersion}
                        onChange={e => setRefVersion(e.target.value)}
                        placeholder="e.g. v1.0, Phase 3 Baseline"
                        className="mt-1 w-full px-2.5 py-1.5 border border-yellow-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      />
                    </div>
                  </div>
                  {refError && <p className="text-xs text-red-600 mb-2">{refError}</p>}
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setRefAction(null); setRefError(null); }} disabled={refWorking}
                      className="px-3 py-1.5 border border-yellow-300 text-yellow-700 hover:bg-yellow-100 rounded-lg text-xs font-medium">Cancel</button>
                    <button onClick={handleDesignateReference} disabled={refWorking}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                      {refWorking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <Star className="w-3.5 h-3.5" />
                      Confirm Designation
                    </button>
                  </div>
                </div>
              )}

              {/* Remove confirmation */}
              {refAction === 'remove' && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-4 max-w-lg">
                  <p className="text-sm font-semibold text-red-800 mb-1">Remove Reference Status?</p>
                  <p className="text-xs text-red-700 mb-3">
                    This audit will no longer be the <strong>{(AUDIT_DOMAIN_CFG[audit.audit_type] ?? AUDIT_DOMAIN_CFG.other).label}</strong> reference baseline.
                    Engineering governance tools will have no reference for this domain until a new one is designated.
                  </p>
                  {refError && <p className="text-xs text-red-600 mb-2">{refError}</p>}
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setRefAction(null); setRefError(null); }} disabled={refWorking}
                      className="px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-100 rounded-lg text-xs font-medium">Cancel</button>
                    <button onClick={handleRemoveReference} disabled={refWorking}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                      {refWorking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Confirm Removal
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Overview ── */}
          {activeTab === 'overview' && (
            <div className="p-6 space-y-6 max-w-4xl">
              {/* Health + readiness row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col items-center gap-2">
                  {audit.overall_health_score !== null
                    ? <HealthRing score={audit.overall_health_score} />
                    : <span className="text-2xl font-bold text-slate-300">—</span>}
                  <span className="text-xs text-slate-500 font-medium">Health Score</span>
                </div>
                {(['commercial_readiness', 'compliance_readiness', 'release_readiness'] as const).map(key => {
                  const val = audit[key] as string | null;
                  const cfg = val ? (READINESS_CFG[normalizeReadiness(val)] ?? READINESS_CFG.not_ready) : null;
                  const Icon = cfg ? cfg.Icon : Info;
                  const labels: Record<string, string> = { commercial_readiness: 'Commercial', compliance_readiness: 'Compliance', release_readiness: 'Release' };
                  return (
                    <div key={key} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col items-center gap-2">
                      {cfg ? <Icon className={`w-8 h-8 ${cfg.color}`} /> : <Minus className="w-8 h-8 text-slate-200" />}
                      <span className={`text-xs font-semibold ${cfg ? cfg.color : 'text-slate-300'}`}>{cfg ? cfg.label : 'N/A'}</span>
                      <span className="text-[10px] text-slate-400">{labels[key]}</span>
                    </div>
                  );
                })}
              </div>

              {/* Historical comparison */}
              <HistoricalComparisonSection audit={audit} />

              {/* Executive KPIs */}
              <ExecutiveKPIsSection audit={audit} />

              {/* Engineering Audit scores (BUG-005R.1+) */}
              {audit.is_engineering_audit && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Shield className="w-4 h-4 text-teal-600" />
                    <h3 className="text-sm font-semibold text-slate-800">Engineering Register Scores</h3>
                    {audit.historical_classification && (
                      <span className="ml-auto text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full capitalize">
                        {audit.historical_classification}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { label: 'Register Integrity', score: audit.engineering_register_integrity, icon: Shield },
                      { label: 'Evidence Completeness', score: audit.evidence_completeness, icon: FileText },
                      { label: 'Governance Maturity', score: audit.governance_maturity, icon: CheckCircle2 },
                    ].map(({ label, score, icon: Icon }) => (
                      <div key={label} className="bg-slate-50 rounded-lg p-4 text-center">
                        <Icon className="w-4 h-4 text-slate-400 mx-auto mb-2" />
                        <p className={`text-3xl font-bold ${score !== null ? scoreColor(score) : 'text-slate-300'}`}>
                          {score !== null ? `${score}%` : '—'}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1">{label}</p>
                        {score !== null && (
                          <div className="h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(score)}`} style={{ width: `${score}%` }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {audit.audit_scope && (
                    <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-100">
                      <span className="font-semibold">Scope:</span> {audit.audit_scope}
                    </p>
                  )}
                </div>
              )}

              {/* Engineering Audit findings classification (BUG-005R.1+) */}
              {audit.is_engineering_audit && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-4">Findings Classification</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Confirmed Defects', count: audit.confirmed_defects_count ?? 0, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
                      { label: 'PO Governance Decisions', count: audit.governance_decisions_count ?? 0, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
                      { label: 'Lifecycle Issues', count: audit.lifecycle_issues_count ?? 0, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
                      { label: 'Evidence Issues', count: audit.evidence_issues_count ?? 0, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
                    ].map(({ label, count, color, bg, border }) => (
                      <div key={label} className={`${bg} border ${border} rounded-lg p-3 text-center`}>
                        <p className={`text-2xl font-bold ${color}`}>{count}</p>
                        <p className={`text-xs font-medium ${color} opacity-80`}>{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Engineering Audit source EWOs (BUG-005R.1+) */}
              {audit.is_engineering_audit && audit.source_ewo_refs && audit.source_ewo_refs.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Link2 className="w-4 h-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-800">Source Engineering Work Orders</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {audit.source_ewo_refs.map((ref: string) => (
                      <span key={ref} className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                        {ref}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Engineering Audit remediation packages (BUG-005R.1+) */}
              {audit.is_engineering_audit && audit.remediation_packages && audit.remediation_packages.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Package className="w-4 h-4 text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-800">Remediation Packages</h3>
                  </div>
                  <div className="space-y-3">
                    {audit.remediation_packages.map((pkg: { package_id: string; title: string; description: string; effort: string; status: string; item_count: number }) => (
                      <div key={pkg.package_id} className="border border-slate-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-white bg-slate-700 px-1.5 py-0.5 rounded">PKG-{pkg.package_id}</span>
                          <span className="text-sm font-semibold text-slate-800">{pkg.title}</span>
                          <span className="ml-auto text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{pkg.effort}</span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${pkg.status === 'pending' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {pkg.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">{pkg.description}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{pkg.item_count} items</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Findings summary */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-4">Findings Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Critical', count: audit.critical_findings_count ?? 0, color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200'    },
                    { label: 'High',     count: audit.high_findings_count ?? 0,     color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
                    { label: 'Medium',   count: audit.medium_findings_count ?? 0,   color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
                    { label: 'Low/Info', count: audit.low_findings_count ?? 0,      color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200'   },
                  ].map(({ label, count, color, bg, border }) => (
                    <div key={label} className={`${bg} border ${border} rounded-lg p-3 text-center`}>
                      <p className={`text-2xl font-bold ${color}`}>{count}</p>
                      <p className={`text-xs font-medium ${color} opacity-80`}>{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {audit.executive_summary && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-3">Executive Summary</h3>
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{audit.executive_summary}</p>
                </div>
              )}

              {audit.total_features !== null && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-4">Feature Snapshot</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Total Features',  val: audit.total_features          },
                      { label: 'Released',         val: audit.features_released       },
                      { label: 'In Review',        val: audit.features_in_review      },
                      { label: 'In Development',   val: audit.features_in_development },
                    ].map(({ label, val }) => (
                      <div key={label} className="bg-slate-50 rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-slate-800">{val ?? '—'}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Executive Brief ── */}
          {activeTab === 'executive' && <ExecutiveBriefTab audit={auditFull} />}

          {/* ── Engineering Decision ── */}
          {activeTab === 'decision' && <EngineeringDecisionTab audit={auditFull} />}

          {/* ── Findings ── */}
          {activeTab === 'findings' && (
            <div className="p-6 max-w-4xl space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-500">Filter:</span>
                {['all', 'critical', 'high', 'medium', 'low', 'info'].map(sv => (
                  <button key={sv} onClick={() => setSeverityFilter(sv)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors capitalize ${severityFilter === sv ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {sv === 'all' ? 'All' : SEVERITY_CFG[sv]?.label ?? sv}
                  </button>
                ))}
              </div>
              {filteredFindings.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No findings at this severity level.</p>
                </div>
              ) : (
                filteredFindings.map(f => {
                  const sev  = SEVERITY_CFG[f.severity] ?? SEVERITY_CFG.info;
                  const pri  = PRIORITY_CFG[f.priority] ?? PRIORITY_CFG.could_have;
                  const open = expanded.has(f.id);
                  return (
                    <div key={f.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <button className="w-full flex items-start gap-3 p-4 text-left hover:bg-slate-50 transition-colors" onClick={() => toggleExpand(f.id)}>
                        <div className="flex items-center gap-2 shrink-0 mt-0.5">
                          <span className={`w-2 h-2 rounded-full ${sev.dot}`} />
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${sev.text} ${sev.bg} px-1.5 py-0.5 rounded-full`}>{sev.label}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{f.finding_number}: {f.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{f.category} · <span className={`font-medium ${pri.color}`}>{pri.label}</span></p>
                        </div>
                        {open ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />}
                      </button>
                      {open && (
                        <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/50">
                          <p className="text-sm text-slate-700 leading-relaxed">{f.description}</p>
                          {f.business_impact && <div><p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Business Impact</p><p className="text-sm text-slate-600">{f.business_impact}</p></div>}
                          {f.technical_impact && <div><p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Technical Impact</p><p className="text-sm text-slate-600">{f.technical_impact}</p></div>}
                          <div><p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Recommendation</p><p className="text-sm text-slate-700 font-medium">{f.recommendation}</p></div>
                          {f.evidence && f.evidence.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Evidence</p>
                              <ul className="space-y-1">
                                {f.evidence.map((ev, i) => (
                                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                                    <span className="text-slate-300 shrink-0 mt-0.5">•</span>
                                    <span>{ev}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {f.risk_trend && f.risk_trend !== 'stable' && (
                            <div className="flex items-center gap-1.5 pt-1">
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Risk Trend:</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                f.risk_trend === 'worsening' ? 'bg-red-50 text-red-700' :
                                f.risk_trend === 'improving' ? 'bg-emerald-50 text-emerald-700' :
                                f.risk_trend === 'resolved'  ? 'bg-teal-50 text-teal-700' :
                                'bg-blue-50 text-blue-700'
                              }`}>{f.risk_trend}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── Recommendations ── */}
          {activeTab === 'recommendations' && <RecommendationsTab audit={audit} />}

          {/* ── Scores ── */}
          {activeTab === 'scores' && (
            <div className="p-6 max-w-2xl space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-semibold text-slate-800">Category Scores</h3>
                  {audit.score_deltas && (
                    <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                      Deltas vs. {(audit as Audit & { previous_audit_type_id?: string }).previous_audit_type_id ? 'baseline' : 'previous audit'}
                    </span>
                  )}
                </div>
                {scores.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No scores recorded.</p>
                ) : (
                  <div className="space-y-4">
                    {scores.map(s => {
                      const deltaInfo = audit.score_deltas?.[s.category];
                      const delta = deltaInfo?.delta ?? null;
                      return (
                        <div key={s.id} className="space-y-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-slate-600 font-medium capitalize">{s.category.replace(/_/g, ' ')}</span>
                            <div className="flex items-center gap-2">
                              {delta !== null && delta !== 0 && (
                                <span className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${delta > 0 ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
                                  {delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                  {delta > 0 ? '+' : ''}{delta}
                                </span>
                              )}
                              {delta === 0 && deltaInfo !== null && (
                                <span className="text-[10px] text-slate-400 font-medium px-1.5 py-0.5 bg-slate-50 rounded-full">0</span>
                              )}
                              <span className={`text-xs font-bold ${scoreColor(s.score)}`}>{s.score}/100</span>
                            </div>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(s.score)}`} style={{ width: `${s.score}%` }} />
                          </div>
                          {s.notes && <p className="text-xs text-slate-400 pl-1 mt-0.5">{s.notes}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Confidence breakdown */}
              {audit.confidence_reasoning && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-800">Confidence Breakdown</h3>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      audit.confidence_reasoning.score >= 70 ? 'bg-emerald-50 text-emerald-700' :
                      audit.confidence_reasoning.score >= 45 ? 'bg-amber-50 text-amber-700' :
                      'bg-red-50 text-red-700'
                    }`}>{audit.confidence_reasoning.score}% {audit.confidence_reasoning.level.toUpperCase()}</span>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">Confidence is calculated from engineering evidence completeness — not from the AI assessment itself.</p>
                  <div className="space-y-2">
                    {audit.confidence_reasoning.gates.map((gate, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className={`w-4 h-4 rounded-full shrink-0 mt-0.5 flex items-center justify-center ${gate.passed ? 'bg-emerald-100' : 'bg-red-50'}`}>
                          {gate.passed
                            ? <Check className="w-2.5 h-2.5 text-emerald-600" />
                            : <XCircle className="w-2.5 h-2.5 text-red-400" />}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-medium ${gate.passed ? 'text-slate-700' : 'text-slate-500'}`}>{gate.label}</p>
                          <p className="text-[10px] text-slate-400">{gate.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Trend Analysis ── */}
          {activeTab === 'trends' && <TrendAnalysisTab auditId={audit.id} auditDomain={audit.audit_type} />}

          {/* ── Lifecycle ── */}
          {activeTab === 'lifecycle' && (
            <div className="p-6 max-w-2xl space-y-5">

              {/* Smart lifecycle guidance */}
              <SmartLifecycleGuidance audit={audit} />

              {/* Governance validation errors */}
              {validationErrors.length > 0 && (
                <GovernanceValidationPanel
                  errors={validationErrors}
                  onDismiss={() => setValidationErrors([])}
                />
              )}

              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <h3 className="text-sm font-semibold text-slate-800 mb-4">Audit Lifecycle</h3>
                <div className="flex items-center gap-1 mb-5">
                  {['draft', 'ai_generated', 'under_review', 'approved', 'closed'].map((s, i, arr) => {
                    const statuses = ['draft', 'ai_generated', 'in_progress', 'under_review', 'approved', 'closed', 'archived'];
                    const currentIdx = statuses.indexOf(audit.status);
                    const thisIdx    = statuses.indexOf(s);
                    const done       = currentIdx > thisIdx;
                    const current    = audit.status === s || (s === 'ai_generated' && audit.status === 'in_progress');
                    const cfg        = AUDIT_STATUS_CFG[s];
                    return (
                      <div key={s} className="flex items-center flex-1 gap-1">
                        <div className="flex flex-col items-center flex-1">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${current ? 'bg-slate-900 text-white' : done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            {done ? <Check className="w-3 h-3" /> : i + 1}
                          </div>
                          <span className={`text-[9px] mt-1 font-medium text-center leading-tight ${current ? 'text-slate-800' : done ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {cfg?.label ?? s}
                          </span>
                        </div>
                        {i < arr.length - 1 && <div className={`h-px flex-1 -mt-3 ${done ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
                      </div>
                    );
                  })}
                </div>

                {audit.review_date && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
                    <p className="text-xs text-emerald-700">Approved by <strong>{audit.reviewer}</strong> on {formatDate(audit.review_date)}</p>
                    {audit.review_notes && <p className="text-xs text-emerald-600 mt-1 italic">"{audit.review_notes}"</p>}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1.5">Reviewer Name</label>
                    <input type="text" value={reviewer} onChange={e => setReviewer(e.target.value)} placeholder="Your name..."
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1.5">Review Notes</label>
                    <textarea rows={3} value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Add review notes or comments..."
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-100">
                  {[
                    { action: 'start'         as const, label: 'Start Review',       color: 'bg-blue-600 hover:bg-blue-700 text-white',      show: ['draft'] },
                    { action: 'submit_review' as const, label: 'Submit for Review',  color: 'bg-amber-500 hover:bg-amber-600 text-white',    show: ['draft', 'in_progress', 'ai_generated'] },
                    { action: 'approve'       as const, label: 'Approve',            color: 'bg-emerald-600 hover:bg-emerald-700 text-white', show: ['under_review'] },
                    { action: 'reject'        as const, label: 'Return to Draft',    color: 'bg-slate-200 hover:bg-slate-300 text-slate-700', show: ['under_review'] },
                    { action: 'close'         as const, label: 'Close Audit',        color: 'bg-slate-800 hover:bg-slate-700 text-white',    show: ['approved'] },
                    { action: 'archive'       as const, label: 'Archive',            color: 'bg-slate-100 hover:bg-slate-200 text-slate-600', show: ['closed'] },
                    { action: 'reopen'        as const, label: 'Reopen',             color: 'bg-slate-100 hover:bg-slate-200 text-slate-600', show: ['archived', 'closed'] },
                  ].filter(a => a.show.includes(audit.status)).map(({ action, label, color }) => {
                    const isProtected = audit.is_reference && (action === 'archive');
                    return (
                      <div key={action} className="relative group/btn">
                        <button onClick={() => !isProtected && handleLifecycleAction(action)} disabled={saving || isProtected}
                          className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${isProtected ? 'cursor-not-allowed' : ''} ${color}`}>
                          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}{label}
                        </button>
                        {isProtected && (
                          <div className="hidden group-hover/btn:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-56 bg-yellow-900 text-yellow-100 text-[10px] leading-snug rounded-lg px-2.5 py-2 z-10 text-center shadow-lg">
                            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 mx-auto mb-1" />
                            Reference Audits cannot be archived. Remove reference status first.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Governance events timeline (replaces old status history) */}
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-800">Governance Timeline</h3>
                  <span className="text-[10px] text-slate-400">{govEvents.length} events</span>
                </div>
                <GovernanceEventsTimeline events={govEvents} loading={govEventsLoading} />
              </div>

              {/* Legacy status-history fallback (only if no governance events yet) */}
              {govEvents.length === 0 && (audit as AuditFull).lifecycle_history && (audit as AuditFull).lifecycle_history!.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-4">Status History</h3>
                  <div className="space-y-2">
                    {[...(audit as AuditFull).lifecycle_history!].reverse().map((entry, i) => (
                      <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs py-1">
                        <span className="text-slate-400 shrink-0">{formatDateTime(entry.at)}</span>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full font-medium ${AUDIT_STATUS_CFG[entry.from]?.bg ?? 'bg-slate-100'} ${AUDIT_STATUS_CFG[entry.from]?.text ?? 'text-slate-600'}`}>
                            {AUDIT_STATUS_CFG[entry.from]?.label ?? entry.from}
                          </span>
                          <span className="text-slate-300">→</span>
                          <span className={`px-2 py-0.5 rounded-full font-medium ${AUDIT_STATUS_CFG[entry.to]?.bg ?? 'bg-slate-100'} ${AUDIT_STATUS_CFG[entry.to]?.text ?? 'text-slate-600'}`}>
                            {AUDIT_STATUS_CFG[entry.to]?.label ?? entry.to}
                          </span>
                          {entry.by && <span className="text-slate-400">· {entry.by}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-500 leading-relaxed">
                  <strong className="text-slate-600">Note:</strong> Engineering audit reports are permanent governance records.
                  They do not modify any platform data. Findings and recommendations guide engineering prioritisation.
                </p>
              </div>
            </div>
          )}

          {/* ── Governance Record ── */}
          {activeTab === 'metadata' && (
            <GovernanceMetadataPanel
              audit={audit}
              events={govEvents}
              eventsLoading={govEventsLoading}
              onRefresh={() => { loadGovEvents(); onRefresh(); }}
            />
          )}

          {/* ── Report ── */}
          {activeTab === 'report' && (
            <div className="p-6 max-w-4xl">
              {audit.markdown_report ? (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-700">Markdown Report</span>
                    </div>
                    <div className="flex gap-2">
                      <CopyButton text={audit.markdown_report} label="Copy Markdown" />
                      <button onClick={() => { const blob = new Blob([audit.markdown_report!], { type: 'text/markdown' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${audit.audit_number}.md`; a.click(); URL.revokeObjectURL(url); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors">
                        <Download className="w-3.5 h-3.5" />Download
                      </button>
                    </div>
                  </div>
                  <pre className="p-5 text-xs text-slate-700 font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
                    {audit.markdown_report}
                  </pre>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-dashed border-slate-200 p-10 text-center">
                  <FileText className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">No report generated yet.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Linked Artefacts ── */}
          {activeTab === 'artefacts' && <LinkedArtefactsTab audit={audit} />}

        </div>
      )}

      {/* Footer bar */}
      {!loading && (
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-slate-400 truncate hidden sm:block">
            {audit.audit_number} · {domainCfg.label} · {AUDIT_STATUS_CFG[audit.status]?.label ?? audit.status}
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => generateExecutivePDF(audit, scores, findings)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors">
              <Printer className="w-3.5 h-3.5" /><span className="hidden sm:inline">Executive </span>PDF
            </button>
            {audit.markdown_report && <CopyButton text={audit.markdown_report} label="Copy Report" />}
            <button onClick={onRefresh} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
