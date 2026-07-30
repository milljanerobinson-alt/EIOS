import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Shield, Plus, Loader2, AlertCircle, ChevronRight, RefreshCw,
  AlertTriangle, CheckCircle2, Search, Copy, Check,
  Zap, PenLine, History, Download, Calendar, Star,
  Archive, FlaskConical, BookOpen, Clock, User,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { AuditDetail } from './ECCAuditDetail';
import { CreateAuditModal } from './ECCAuditCreateModal';

// ─── Exported Types ────────────────────────────────────────────────────────────

export interface Audit {
  id: string;
  audit_number: string;
  audit_type: string;        // domain: ai_platform, engineering, architecture, etc.
  audit_category: string;
  creation_method: string;   // ai_generated, manual, imported, historical
  status: string;
  name: string;
  overall_health_score: number | null;
  confidence_level: string | null;
  commercial_readiness: string | null;
  compliance_readiness: string | null;
  release_readiness: string | null;
  executive_summary: string | null;
  markdown_report: string | null;
  created_at: string;
  updated_at: string;
  reviewer: string | null;
  review_date: string | null;
  review_notes: string | null;
  total_features: number | null;
  features_released: number | null;
  features_in_review: number | null;
  features_in_development: number | null;
  critical_findings_count: number | null;
  high_findings_count: number | null;
  medium_findings_count: number | null;
  low_findings_count: number | null;
  total_findings_count: number | null;
  audit_date: string | null;
  executive_kpis: Record<string, number> | null;
  lifecycle_history: Array<{ from: string; to: string; at: string; by?: string; notes?: string }> | null;
  previous_audit_id: string | null;
  is_draft: boolean;
  workspace: string;           // 'production' | 'legacy' | 'sandbox'
  audit_engine_version: string;
  is_reference: boolean;
  reference_reason: string | null;
  reference_date: string | null;
  reference_approved_by: string | null;
  reference_version: string | null;
  referenced_by_count: number;
  score_deltas: Record<string, { current: number; previous: number | null; delta: number | null }> | null;
  confidence_reasoning: {
    score: number;
    level: string;
    gates: Array<{ label: string; passed: boolean; detail: string }>;
    breakdown: string[];
  } | null;
  // Governance Phase X columns
  approval_date: string | null;
  approval_notes: string | null;
  governance_notes: string | null;
  governance_version: string | null;
  reference_superseded_by: string | null;
  review_frequency: string | null;
  closure_notes: string | null;
  // Engineering Audit columns (BUG-005R.1+)
  audit_scope: string | null;
  engineering_register_integrity: number | null;
  evidence_completeness: number | null;
  governance_maturity: number | null;
  confirmed_defects_count: number | null;
  governance_decisions_count: number | null;
  lifecycle_issues_count: number | null;
  evidence_issues_count: number | null;
  source_ewo_refs: string[] | null;
  remediation_packages: Array<{ package_id: string; title: string; description: string; effort: string; status: string; item_count: number }> | null;
  is_engineering_audit: boolean | null;
  historical_classification: string | null;
}

export interface AuditScore {
  id: string;
  audit_id: string;
  category: string;
  score: number;
  notes: string | null;
}

export interface AuditFinding {
  id: string;
  audit_id: string;
  finding_number: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  business_impact: string | null;
  technical_impact: string | null;
  recommendation: string;
  priority: string;
  current_status: string;
  evidence: string[] | null;
  risk_trend: string | null;
}

export interface Recommendation {
  id: string;
  rec_number: string;
  audit_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  owner: string | null;
  due_date: string | null;
  completion_notes: string | null;
  created_at: string;
  updated_at: string;
  work_item_created: boolean | null;
  work_item_id: string | null;
}

export interface AuditError {
  error_code: string;
  title: string;
  message: string;
  action: string;
  action_path?: string;
}

// ─── Exported Config ──────────────────────────────────────────────────────────

export const AUDIT_STATUS_CFG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  draft:                { label: 'Draft',                bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-200',  dot: 'bg-slate-400'   },
  ai_generated:         { label: 'AI Generated',         bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',   dot: 'bg-blue-500'    },
  in_progress:          { label: 'In Progress',          bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',   dot: 'bg-blue-500'    },
  under_review:         { label: 'Under Review',         bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',  dot: 'bg-amber-400'   },
  awaiting_review:      { label: 'Awaiting Review',      bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',  dot: 'bg-amber-400'   },
  reviewed:             { label: 'Reviewed',             bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',   dot: 'bg-blue-500'    },
  approved:             { label: 'Approved',             bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200',dot: 'bg-emerald-500' },
  actions_in_progress:  { label: 'Actions In Progress',  bg: 'bg-orange-50',   text: 'text-orange-700',  border: 'border-orange-200', dot: 'bg-orange-400'  },
  actions_complete:     { label: 'Actions Complete',     bg: 'bg-teal-50',     text: 'text-teal-700',    border: 'border-teal-200',   dot: 'bg-teal-500'    },
  closed:               { label: 'Closed',               bg: 'bg-teal-50',     text: 'text-teal-700',    border: 'border-teal-200',   dot: 'bg-teal-500'    },
  archived:             { label: 'Archived',             bg: 'bg-slate-100',   text: 'text-slate-500',   border: 'border-slate-200',  dot: 'bg-slate-300'   },
};

export const SEVERITY_CFG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  critical: { label: 'Critical', bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  high:     { label: 'High',     bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  medium:   { label: 'Medium',   bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
  low:      { label: 'Low',      bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  info:     { label: 'Info',     bg: 'bg-slate-100',  text: 'text-slate-600',  dot: 'bg-slate-400'  },
};

export const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  must_have:   { label: 'Must Have',   color: 'text-red-600'    },
  should_have: { label: 'Should Have', color: 'text-orange-600' },
  could_have:  { label: 'Could Have',  color: 'text-amber-600'  },
  vision:      { label: 'Vision',      color: 'text-blue-600'   },
};

export const READINESS_CFG: Record<string, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  ready:           { label: 'Ready',           color: 'text-emerald-600', Icon: CheckCircle2 },
  nearly_ready:    { label: 'Nearly Ready',    color: 'text-teal-600',    Icon: CheckCircle2 },
  partially_ready: { label: 'Partially Ready', color: 'text-amber-600',   Icon: AlertTriangle },
  not_ready:       { label: 'Not Ready',       color: 'text-red-600',     Icon: AlertTriangle },
};

export const REC_STATUS_CFG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  open:        { label: 'Open',        bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',   dot: 'bg-blue-500'   },
  in_progress: { label: 'In Progress', bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',  dot: 'bg-amber-400'  },
  completed:   { label: 'Completed',   bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200',dot: 'bg-emerald-500'},
  deferred:    { label: 'Deferred',    bg: 'bg-slate-100',  text: 'text-slate-600',   border: 'border-slate-200',  dot: 'bg-slate-400'  },
  cancelled:   { label: 'Cancelled',   bg: 'bg-slate-50',   text: 'text-slate-400',   border: 'border-slate-200',  dot: 'bg-slate-300'  },
};

export const REC_PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  critical: { label: 'Critical', color: 'text-red-600'    },
  high:     { label: 'High',     color: 'text-orange-600' },
  medium:   { label: 'Medium',   color: 'text-amber-600'  },
  low:      { label: 'Low',      color: 'text-slate-500'  },
};

export const CREATION_METHOD_CFG: Record<string, { label: string; bg: string; text: string; Icon: typeof Zap }> = {
  ai_generated: { label: 'AI Generated', bg: 'bg-blue-50',   text: 'text-blue-700',  Icon: Zap     },
  manual:       { label: 'Manual',       bg: 'bg-slate-100', text: 'text-slate-600', Icon: PenLine  },
  imported:     { label: 'Imported',     bg: 'bg-amber-50',  text: 'text-amber-700', Icon: Download },
  historical:   { label: 'Historical',   bg: 'bg-slate-100', text: 'text-slate-600', Icon: History  },
};

export const AUDIT_DOMAIN_CFG: Record<string, { label: string; color: string; bg: string }> = {
  ai_platform:            { label: 'AI Platform',            color: 'text-blue-700',    bg: 'bg-blue-50'    },
  engineering:            { label: 'Engineering',             color: 'text-slate-700',   bg: 'bg-slate-100'  },
  architecture:           { label: 'Architecture',            color: 'text-violet-700',  bg: 'bg-violet-50'  },
  security:               { label: 'Security',                color: 'text-red-600',     bg: 'bg-red-50'     },
  performance:            { label: 'Performance',             color: 'text-orange-600',  bg: 'bg-orange-50'  },
  compliance:             { label: 'Compliance',              color: 'text-emerald-700', bg: 'bg-emerald-50' },
  release_readiness:      { label: 'Release Readiness',       color: 'text-teal-700',    bg: 'bg-teal-50'    },
  commercial_readiness:   { label: 'Commercial Readiness',    color: 'text-amber-700',   bg: 'bg-amber-50'   },
  accessibility:          { label: 'Accessibility',           color: 'text-cyan-700',    bg: 'bg-cyan-50'    },
  infrastructure:         { label: 'Infrastructure',          color: 'text-stone-700',   bg: 'bg-stone-100'  },
  other:                  { label: 'Other',                   color: 'text-slate-500',   bg: 'bg-slate-100'  },
  engineering_register:   { label: 'Engineering Register',    color: 'text-teal-700',    bg: 'bg-teal-50'    },
  // legacy key — kept for backwards compat with pre-migration records
  cost_efficiency:        { label: 'Cost & Efficiency',       color: 'text-amber-700',   bg: 'bg-amber-50'   },
};

// ─── Exported Helpers ─────────────────────────────────────────────────────────

export function scoreColor(s: number): string {
  if (s >= 80) return 'text-emerald-600';
  if (s >= 60) return 'text-teal-600';
  if (s >= 40) return 'text-amber-600';
  return 'text-red-600';
}

export function scoreBarColor(s: number): string {
  if (s >= 80) return 'bg-emerald-500';
  if (s >= 60) return 'bg-teal-500';
  if (s >= 40) return 'bg-amber-500';
  return 'bg-red-500';
}

export function scoreBgColor(s: number): string {
  if (s >= 80) return 'bg-emerald-50 border-emerald-200 text-emerald-800';
  if (s >= 60) return 'bg-teal-50 border-teal-200 text-teal-800';
  if (s >= 40) return 'bg-amber-50 border-amber-200 text-amber-800';
  return 'bg-red-50 border-red-200 text-red-800';
}

export function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(d: string) {
  const dt = new Date(d);
  const datePart = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const timePart = dt.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
  return `${datePart} • ${timePart}`;
}

export function normalizeReadiness(val: string | null): string {
  if (!val) return 'not_ready';
  return val.toLowerCase().replace(/[\s-]+/g, '_');
}

// ─── Exported Sub-components ──────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const cfg = AUDIT_STATUS_CFG[status] ?? AUDIT_STATUS_CFG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export function HealthRing({ score }: { score: number }) {
  const radius = 28;
  const circ   = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const color  = score >= 80 ? '#10b981' : score >= 60 ? '#14b8a6' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="80" height="80">
        <circle cx="40" cy="40" r={radius} fill="none" strokeWidth="6" stroke="#e2e8f0" />
        <circle cx="40" cy="40" r={radius} fill="none" strokeWidth="6"
          stroke={color} strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <span className="text-lg font-bold text-slate-900">{score}</span>
    </div>
  );
}

export function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-600">{label}</span>
        <span className={`text-xs font-bold ${scoreColor(score)}`}>{score}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(score)}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

// ─── Audit Card ────────────────────────────────────────────────────────────────

function AuditCard({ audit, onClick }: { audit: Audit; onClick: () => void }) {
  const score     = audit.overall_health_score;
  const critHigh  = (audit.critical_findings_count ?? 0) + (audit.high_findings_count ?? 0);
  const domainCfg = AUDIT_DOMAIN_CFG[audit.audit_type] ?? AUDIT_DOMAIN_CFG.other;
  const methodCfg = CREATION_METHOD_CFG[audit.creation_method ?? 'manual'] ?? CREATION_METHOD_CFG.manual;
  const MethodIcon = methodCfg.Icon;
  const isSandbox  = audit.workspace === 'sandbox' || (!audit.workspace && audit.is_draft);
  const isLegacy   = audit.workspace === 'legacy';

  return (
    <button
      onClick={onClick}
      className={`w-full border rounded-xl p-4 text-left hover:shadow-md transition-all group ${
        isSandbox
          ? 'bg-amber-50/40 border-amber-200 hover:border-amber-300'
          : isLegacy
            ? 'bg-slate-50 border-slate-200 hover:border-slate-300'
            : audit.is_reference
              ? 'bg-white border-yellow-300 hover:border-yellow-400 ring-1 ring-yellow-200'
              : 'bg-white border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* Row 1: Number + status + workspace badge + score */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded ${
            isSandbox ? 'text-amber-600 bg-amber-100' : isLegacy ? 'text-slate-400 bg-slate-100' : 'text-slate-400 bg-slate-50'
          }`}>{audit.audit_number}</span>
          {isSandbox ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
              <FlaskConical className="w-2.5 h-2.5" />SANDBOX
            </span>
          ) : isLegacy ? (
            <>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                <Archive className="w-2.5 h-2.5" />LEGACY
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
        </div>
        <div className="flex items-center gap-2 shrink-0">
            {score !== null && (
              <span className={`text-sm font-bold ${isLegacy ? 'text-slate-400' : scoreColor(score)}`}>{score}/100</span>
            )}
          </div>
      </div>

      {/* Row 2: Name */}
      <p className={`text-sm font-semibold mb-1 leading-snug ${isLegacy ? 'text-slate-500 group-hover:text-slate-700' : 'text-slate-800 group-hover:text-slate-900'}`}>{audit.name}</p>

      {/* Row 3: Date + type badges */}
      <div className="flex items-center gap-2 flex-wrap mb-2.5">
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <Calendar className="w-3 h-3" />
          {formatDateTime(audit.created_at)}
        </span>
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isLegacy ? 'bg-slate-100 text-slate-400' : `${domainCfg.bg} ${domainCfg.color}`}`}>
          {domainCfg.label}
        </span>
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${methodCfg.bg} ${methodCfg.text}`}>
          <MethodIcon className="w-2.5 h-2.5" />
          {methodCfg.label}
        </span>
        {isSandbox && (
          <span className="text-[10px] text-amber-600">Not included in governance</span>
        )}
        {isLegacy && (
          <span className="text-[10px] text-slate-400 italic">Historical archive — excluded from governance</span>
        )}
      </div>

      {/* Row 4: Findings + chevron */}
      <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
        {audit.critical_findings_count != null && audit.critical_findings_count > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
            <AlertTriangle className="w-3 h-3" />
            {audit.critical_findings_count} critical
          </span>
        )}
        {audit.high_findings_count != null && audit.high_findings_count > 0 && (
          <span className="text-[11px] font-medium text-orange-600">{audit.high_findings_count} high</span>
        )}
        {critHigh === 0 && audit.total_findings_count != null && (
          <span className="text-[11px] text-slate-400">{audit.total_findings_count ?? 0} findings</span>
        )}
        <ChevronRight className="w-4 h-4 text-slate-300 ml-auto group-hover:text-blue-400 transition-colors" />
      </div>
    </button>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color, trendIcon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  trendIcon?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-1">
        <p className={`text-2xl font-bold ${color ?? 'text-slate-800'}`}>{value}</p>
        {trendIcon}
      </div>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-300 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

// ─── Reference Audit Register ─────────────────────────────────────────────────

function ReferenceRegisterSection({ onSelect }: { onSelect: (a: Audit) => void }) {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('ecc_audits')
      .select('*')
      .or('is_reference.eq.true,reference_superseded_by.not.is.null')
      .order('reference_date', { ascending: false, nullsFirst: false })
      .then(({ data }) => { setAudits(data ?? []); setLoading(false); });
  }, []);

  function governanceHealth(a: Audit): { label: string; color: string; bg: string; score: number } {
    let score = 0;
    if (a.reviewer)               score++;
    if (a.review_date)            score++;
    if (a.review_notes)           score++;
    if (a.reference_approved_by)  score++;
    if (a.reference_version)      score++;
    if (a.governance_version)     score++;
    const pct = Math.round((score / 6) * 100);
    if (pct >= 83) return { label: 'Complete',    color: 'text-emerald-700', bg: 'bg-emerald-50',  score: pct };
    if (pct >= 50) return { label: 'Partial',     color: 'text-amber-700',  bg: 'bg-amber-50',    score: pct };
    return              { label: 'Incomplete',  color: 'text-red-700',    bg: 'bg-red-50',      score: pct };
  }

  function auditAge(a: Audit): string {
    const d = new Date(a.reference_date ?? a.created_at);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return '1 day';
    if (days < 30)  return `${days} days`;
    const months = Math.floor(days / 30);
    return months === 1 ? '1 month' : `${months} months`;
  }

  const active     = audits.filter(a => a.is_reference && !a.reference_superseded_by);
  const superseded = audits.filter(a => !a.is_reference || a.reference_superseded_by);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;
  }

  if (audits.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
        <Star className="w-8 h-8 text-slate-200 mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-600">No Reference Audits yet</p>
        <p className="text-xs text-slate-400 mt-1">Designate an approved production audit as the Reference Audit for a domain.</p>
      </div>
    );
  }

  function RegisterRow({ a }: { a: Audit }) {
    const health = governanceHealth(a);
    const domain = AUDIT_DOMAIN_CFG[a.audit_type] ?? AUDIT_DOMAIN_CFG.other;
    const status = AUDIT_STATUS_CFG[a.status];
    const isSuperseded = !!a.reference_superseded_by || !a.is_reference;
    return (
      <button
        onClick={() => onSelect(a)}
        className="w-full text-left hover:bg-slate-50 transition-colors"
      >
        {/* Desktop: table row */}
        <div className="hidden md:grid grid-cols-12 gap-2 items-center px-4 py-3 border-b border-slate-100 last:border-0">
          <div className="col-span-3 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{a.audit_number}</span>
              {isSuperseded ? (
                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">SUPERSEDED</span>
              ) : (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded-full border border-yellow-200">
                  <Star className="w-2 h-2 fill-yellow-500 text-yellow-500" />ACTIVE
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-slate-700 mt-0.5 truncate">{a.name}</p>
          </div>
          <div className="col-span-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${domain.bg} ${domain.color}`}>{domain.label}</span>
          </div>
          <div className="col-span-2 min-w-0">
            <p className="text-[10px] text-slate-600 truncate font-medium">{a.reference_version ?? a.governance_version ?? '—'}</p>
          </div>
          <div className="col-span-1">
            {status && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${status.bg} ${status.text}`}>{status.label}</span>
            )}
          </div>
          <div className="col-span-2 min-w-0">
            <div className="flex items-center gap-1">
              <User className="w-2.5 h-2.5 text-slate-400 shrink-0" />
              <p className="text-[10px] text-slate-500 truncate">{a.reference_approved_by ?? a.reviewer ?? '—'}</p>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <Clock className="w-2.5 h-2.5 text-slate-300 shrink-0" />
              <p className="text-[10px] text-slate-400 truncate">{a.reference_date ? formatDate(a.reference_date) : (a.review_date ? formatDate(a.review_date) : '—')}</p>
            </div>
          </div>
          <div className="col-span-1">
            <span className="text-[10px] text-slate-400">{auditAge(a)}</span>
          </div>
          <div className="col-span-1">
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${health.bg} ${health.color}`}>{health.label}</span>
          </div>
        </div>

        {/* Mobile: card layout */}
        <div className="md:hidden px-4 py-3 border-b border-slate-100 last:border-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                <span className="text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{a.audit_number}</span>
                {isSuperseded ? (
                  <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">SUPERSEDED</span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-yellow-700 bg-yellow-50 px-1.5 py-0.5 rounded-full border border-yellow-200">
                    <Star className="w-2 h-2 fill-yellow-500 text-yellow-500" />ACTIVE
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-slate-700 leading-snug">{a.name}</p>
            </div>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0 ${health.bg} ${health.color}`}>{health.label}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${domain.bg} ${domain.color}`}>{domain.label}</span>
            {status && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${status.bg} ${status.text}`}>{status.label}</span>}
            {(a.reference_version ?? a.governance_version) && (
              <span className="text-[10px] text-slate-500 font-medium">{a.reference_version ?? a.governance_version}</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><User className="w-2.5 h-2.5" />{a.reference_approved_by ?? a.reviewer ?? '—'}</span>
            <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{a.reference_date ? formatDate(a.reference_date) : (a.review_date ? formatDate(a.review_date) : '—')}</span>
            <span>{auditAge(a)}</span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="space-y-5">
      {/* Active references */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-yellow-50 border-b border-yellow-100">
          <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
          <span className="text-xs font-semibold text-yellow-800">Active Reference Baselines</span>
          <span className="ml-auto text-[10px] text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">{active.length}</span>
        </div>
        {/* Header row — desktop only */}
        <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100">
          {['Audit', 'Domain', 'Version', 'Status', 'Designated By / Date', 'Age', 'Governance'].map((h, i) => (
            <div key={h} className={`${i === 0 ? 'col-span-3' : i === 1 ? 'col-span-2' : i === 2 ? 'col-span-2' : i === 3 ? 'col-span-1' : i === 4 ? 'col-span-2' : i === 5 ? 'col-span-1' : 'col-span-1'}`}>
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{h}</span>
            </div>
          ))}
        </div>
        {active.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">No active reference audits.</p>
        ) : (
          active.map(a => <RegisterRow key={a.id} a={a} />)
        )}
      </div>

      {/* Superseded / historical */}
      {superseded.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs font-semibold text-slate-600">Historical Reference Audits</span>
            <span className="ml-auto text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{superseded.length}</span>
          </div>
          <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100">
            {['Audit', 'Domain', 'Version', 'Status', 'Designated By / Date', 'Age', 'Governance'].map((h, i) => (
              <div key={h} className={`${i === 0 ? 'col-span-3' : i === 1 ? 'col-span-2' : i === 2 ? 'col-span-2' : i === 3 ? 'col-span-1' : i === 4 ? 'col-span-2' : i === 5 ? 'col-span-1' : 'col-span-1'}`}>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{h}</span>
              </div>
            ))}
          </div>
          {superseded.map(a => <RegisterRow key={a.id} a={a} />)}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ECCAuditPage() {
  const [audits,     setAudits]     = useState<Audit[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [selected,   setSelected]   = useState<Audit | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search,     setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [viewMode,   setViewMode]   = useState<'audits' | 'register'>('audits');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('ecc_audits')
      .select('*')
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else     setAudits(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleRefreshSelected() {
    if (!selected) return;
    const { data } = await supabase.from('ecc_audits').select('*').eq('id', selected.id).maybeSingle();
    if (data) setSelected(data);
    load();
  }

  // Workspace-separated audit lists
  const productionAudits = useMemo(() => audits.filter(a => a.workspace === 'production'), [audits]);
  const legacyAudits     = useMemo(() => audits.filter(a => a.workspace === 'legacy'),     [audits]);
  const sandboxAudits    = useMemo(() => audits.filter(a => a.workspace === 'sandbox' || (!a.workspace && a.is_draft)), [audits]);

  const avgScore = useMemo(() => {
    const scored = productionAudits.filter(a => a.overall_health_score !== null);
    return scored.length > 0
      ? Math.round(scored.reduce((s, a) => s + a.overall_health_score!, 0) / scored.length)
      : null;
  }, [productionAudits]);

  const totalCritical  = useMemo(() => productionAudits.reduce((s, a) => s + (a.critical_findings_count ?? 0), 0), [productionAudits]);
  const totalFindings  = useMemo(() => productionAudits.reduce((s, a) => s + (a.total_findings_count ?? 0), 0), [productionAudits]);
  const openCount      = useMemo(() => productionAudits.filter(a => ['draft','in_progress','under_review'].includes(a.status)).length, [productionAudits]);
  const thisMonth      = useMemo(() => {
    const now = new Date();
    return productionAudits.filter(a => {
      const d = new Date(a.created_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [productionAudits]);
  const mostRecent     = useMemo(() => productionAudits.length > 0 ? formatDate(productionAudits[0].created_at) : null, [productionAudits]);
  const uniqueTypes    = useMemo(() => new Set(productionAudits.map(a => a.audit_type)).size, [productionAudits]);
  const approvedCount  = useMemo(() => productionAudits.filter(a => a.status === 'approved' || a.status === 'closed').length, [productionAudits]);

  // Filter options
  const allTypes = useMemo(() => Array.from(new Set(productionAudits.map(a => a.audit_type))).sort(), [productionAudits]);

  const filteredProduction = useMemo(() => {
    let list = productionAudits;
    if (typeFilter !== 'all') list = list.filter(a => a.audit_type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a => a.name?.toLowerCase().includes(q) || a.audit_number?.toLowerCase().includes(q));
    }
    return list;
  }, [productionAudits, typeFilter, search]);

  const filteredLegacy = useMemo(() => {
    let list = legacyAudits;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a => a.name?.toLowerCase().includes(q) || a.audit_number?.toLowerCase().includes(q));
    }
    return list;
  }, [legacyAudits, search]);

  const filteredSandbox = useMemo(() => {
    let list = sandboxAudits;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a => a.name?.toLowerCase().includes(q) || a.audit_number?.toLowerCase().includes(q));
    }
    return list;
  }, [sandboxAudits, search]);

  if (selected) {
    return (
      <div className="h-full flex flex-col">
        <AuditDetail audit={selected} onBack={() => setSelected(null)} onRefresh={handleRefreshSelected} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center">
              <Shield className="w-4.5 h-4.5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Engineering Audits</h1>
              <p className="text-xs text-slate-400">Executive governance &amp; health record</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View mode toggle */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('audits')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'audits' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                All Audits
              </button>
              <button
                onClick={() => setViewMode('register')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Star className="w-3 h-3" />
                <span className="hidden sm:inline">Reference </span>Register
              </button>
            </div>
            <button onClick={load} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New </span>Audit
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">

          {/* Reference Register view */}
          {viewMode === 'register' && (
            <ReferenceRegisterSection onSelect={a => setSelected(a)} />
          )}

          {viewMode === 'audits' && (<>
          {productionAudits.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Production Audits" value={productionAudits.length} />
              <StatCard
                label="Avg Health Score"
                value={avgScore !== null ? avgScore : '—'}
                color={avgScore !== null ? scoreColor(avgScore) : 'text-slate-300'}
              />
              <StatCard
                label="Critical Findings"
                value={totalCritical}
                color={totalCritical > 0 ? 'text-red-600' : 'text-slate-800'}
              />
              <StatCard
                label="Open Audits"
                value={openCount}
                color={openCount > 0 ? 'text-blue-600' : 'text-slate-800'}
              />
              <StatCard label="Total Findings"   value={totalFindings}  color={totalFindings > 10 ? 'text-amber-600' : 'text-slate-800'} />
              <StatCard label="Approved / Closed" value={approvedCount} color={approvedCount > 0 ? 'text-emerald-600' : 'text-slate-800'} />
              <StatCard label="Audits This Month"  value={thisMonth} />
              <StatCard label="Audit Types"    value={uniqueTypes} sub={mostRecent ? `Latest: ${mostRecent}` : undefined} />
            </div>
          )}

          {/* Filters (production audits only) */}
          {productionAudits.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search audits..."
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setTypeFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  All Types
                </button>
                {allTypes.map(t => {
                  const cfg = AUDIT_DOMAIN_CFG[t] ?? AUDIT_DOMAIN_CFG.other;
                  return (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${typeFilter === t ? `${cfg.bg} ${cfg.color} ring-1 ring-inset ring-current` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Audit list */}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : error ? (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          ) : filteredProduction.length === 0 && filteredLegacy.length === 0 && filteredSandbox.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Shield className="w-7 h-7 text-slate-300" />
              </div>
              <h3 className="text-base font-semibold text-slate-700 mb-1">
                {search || typeFilter !== 'all' ? 'No audits match your filters' : 'No audits yet'}
              </h3>
              <p className="text-sm text-slate-400 max-w-xs mx-auto mb-5">
                {search || typeFilter !== 'all'
                  ? 'Try adjusting your filters.'
                  : 'Create your first engineering audit to establish a governance and health record for your platform.'}
              </p>
              {!search && typeFilter === 'all' && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create First Audit
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-8">

              {/* ── Production Audits ─────────────────────────────────────────── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Production Audits</span>
                  <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{filteredProduction.length}</span>
                  <span className="text-[10px] text-slate-400 ml-1">Official governance records</span>
                </div>
                {filteredProduction.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-slate-200 p-6 text-center">
                    <p className="text-xs text-slate-400">
                      {search || typeFilter !== 'all' ? 'No production audits match your filters.' : 'No production audits yet.'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredProduction.map(a => (
                      <AuditCard key={a.id} audit={a} onClick={() => setSelected(a)} />
                    ))}
                  </div>
                )}
              </div>

              {/* ── Legacy Audits ─────────────────────────────────────────────── */}
              {(filteredLegacy.length > 0 || legacyAudits.length > 0) && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Archive className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Legacy Audits</span>
                    <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{filteredLegacy.length}</span>
                    <span className="text-[10px] text-slate-400 ml-1">Historical archive — excluded from governance</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3">
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Legacy audits are historical records generated under superseded audit methodologies.
                      They are preserved for reference only and <strong>never</strong> contribute to governance reporting,
                      trend analysis, executive KPIs, or dashboard metrics.
                    </p>
                  </div>
                  {filteredLegacy.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-3">No legacy audits match your search.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {filteredLegacy.map(a => (
                        <AuditCard key={a.id} audit={a} onClick={() => setSelected(a)} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Sandbox Audits ────────────────────────────────────────────── */}
              {(filteredSandbox.length > 0 || sandboxAudits.length > 0) && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FlaskConical className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Sandbox Audits</span>
                    <span className="text-[10px] text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">{filteredSandbox.length}</span>
                    <span className="text-[10px] text-slate-400 ml-1">Engineering validation — always deletable</span>
                  </div>
                  <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 mb-3">
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      Sandbox audits exist solely for engineering validation.
                      They are <strong>never</strong> included in governance, KPIs, trends, or comparisons.
                      Promote a sandbox audit to make it a permanent production record.
                    </p>
                  </div>
                  {filteredSandbox.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-3">No sandbox audits match your search.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {filteredSandbox.map(a => (
                        <AuditCard key={a.id} audit={a} onClick={() => setSelected(a)} />
                      ))}
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </>
      )}
        </div>
      </div>

      {showCreate && (
        <CreateAuditModal onClose={() => setShowCreate(false)} onCreated={load} />
      )}
    </div>
  );
}
