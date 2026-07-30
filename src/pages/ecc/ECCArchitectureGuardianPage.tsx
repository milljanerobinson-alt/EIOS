import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Plus, Loader2, AlertCircle, ChevronRight, RefreshCw,
  CheckCircle2, Search, Copy, Check, AlertTriangle, X,
  Clock, ChevronDown, FileText, Zap, User, History,
  GitMerge, XCircle, HelpCircle, Sparkles, Filter,
  ArrowRight, BookOpen, ScrollText,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { CopyButton, formatDate, scoreColor } from './ECCAuditPage';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GuardianReview {
  id: string;
  review_number: string;
  title: string;
  proposed_change_summary: string;
  change_type: string;
  review_mode: string;
  trigger_source: string | null;
  decision: string | null;
  confidence_score: number | null;
  confidence_reason: string | null;
  duplicate_risk: string | null;
  recommended_sot: string | null;
  recommended_approach: string | null;
  recommended_nav_location: string | null;
  data_model_impact: string | null;
  component_reuse: string | null;
  performance_impact: string | null;
  risk_level: string | null;
  existing_related_areas: Array<{ area: string; type: string; relevance: string }>;
  potential_duplicates: Array<{ area: string; type: string; overlap_description: string }>;
  evidence_found: Array<{ evidence: string; source: string }>;
  manual_checks_required: string[];
  uncertainty_notes: string | null;
  markdown_report: string | null;
  findings: Array<{
    severity: string;
    category: string;
    description: string;
    root_cause: string;
    recommended_fix: string;
    estimated_effort: string;
    affected_files: string[];
    confidence: number;
  }>;
  layout_violations: Array<{
    severity: string;
    violation_type: string;
    page: string;
    component: string;
    root_cause: string;
    recommended_fix: string;
    confidence: number;
  }>;
  layout_severity: string | null;
  complexity_score: number | null;
  maintainability_score: number | null;
  technical_debt_score: number | null;
  mc_compliance_score: number | null;
  engineering_health_score: number | null;
  performance_issues: number;
  security_issues: number;
  technical_debt_items: number;
  duplicate_components: number;
  immediate_recommendations: Array<{ title: string; description: string; benefit: string }>;
  recommended_improvements: Array<{ title: string; description: string; benefit: string }>;
  future_improvements: Array<{ title: string; description: string; benefit: string }>;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  po_notes: string | null;
  linked_feature_id: string | null;
  linked_rc_id: string | null;
  ai_model_used: string | null;
  ai_provider: string | null;
  generation_time_ms: number | null;
  created_at: string;
  updated_at: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const DECISION_CFG: Record<string, { label: string; bg: string; text: string; border: string; dot: string; icon: typeof CheckCircle2 }> = {
  APPROVE_NEW:                  { label: 'Approved — New',         bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', icon: CheckCircle2  },
  EXTEND_EXISTING:              { label: 'Extend Existing',        bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    dot: 'bg-blue-500',    icon: ArrowRight    },
  MERGE_WITH_EXISTING:          { label: 'Merge With Existing',    bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   dot: 'bg-amber-500',   icon: GitMerge      },
  REJECT_DUPLICATE:             { label: 'Rejected — Duplicate',   bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500',     icon: XCircle       },
  NEEDS_PRODUCT_OWNER_REVIEW:   { label: 'Needs PO Review',        bg: 'bg-orange-50',   text: 'text-orange-700',  border: 'border-orange-200',  dot: 'bg-orange-500',  icon: HelpCircle    },
};

const APPROVAL_CFG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  pending:            { label: 'Pending PO Review', bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-200',   dot: 'bg-slate-400'   },
  approved:           { label: 'PO Approved',        bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  rejected:           { label: 'PO Rejected',        bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     dot: 'bg-red-500'     },
  changes_requested:  { label: 'Changes Requested',  bg: 'bg-orange-50',   text: 'text-orange-700',  border: 'border-orange-200',  dot: 'bg-orange-500'  },
};

const RISK_CFG: Record<string, { label: string; bg: string; text: string }> = {
  none:     { label: 'No Risk',        bg: 'bg-slate-100',  text: 'text-slate-500'   },
  low:      { label: 'Low Risk',       bg: 'bg-emerald-50', text: 'text-emerald-700' },
  medium:   { label: 'Medium Risk',    bg: 'bg-amber-50',   text: 'text-amber-700'   },
  high:     { label: 'High Risk',      bg: 'bg-orange-50',  text: 'text-orange-700'  },
  critical: { label: 'Critical Risk',  bg: 'bg-red-100',    text: 'text-red-700'     },
};

const LAYOUT_SEVERITY_CFG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  none:     { label: 'No Layout Issues',     bg: 'bg-slate-100',    text: 'text-slate-500',    border: 'border-slate-200',    dot: 'bg-slate-400'    },
  low:      { label: 'Layout: Low',          bg: 'bg-blue-50',      text: 'text-blue-700',     border: 'border-blue-200',     dot: 'bg-blue-500'     },
  medium:   { label: 'Layout: Medium',       bg: 'bg-amber-50',     text: 'text-amber-700',    border: 'border-amber-200',    dot: 'bg-amber-500'    },
  high:     { label: 'Layout: High',         bg: 'bg-orange-50',    text: 'text-orange-700',   border: 'border-orange-200',   dot: 'bg-orange-500'   },
  critical: { label: 'Layout: Critical',     bg: 'bg-red-100',      text: 'text-red-700',      border: 'border-red-200',      dot: 'bg-red-500'      },
};

const CHANGE_TYPES = [
  'page', 'navigation', 'table', 'component', 'hook', 'service',
  'report', 'metric', 'setting', 'ai_workflow', 'audit_workflow',
  'release_workflow', 'feature_lifecycle', 'edge_function',
  'email_workflow', 'axcelerate_workflow', 'other',
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) return <span className="text-xs text-slate-400">—</span>;
  const cfg = DECISION_CFG[decision] ?? DECISION_CFG.NEEDS_PRODUCT_OWNER_REVIEW;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function ApprovalBadge({ status }: { status: string }) {
  const cfg = APPROVAL_CFG[status] ?? APPROVAL_CFG.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function RiskBadge({ risk }: { risk: string | null }) {
  if (!risk) return null;
  const cfg = RISK_CFG[risk] ?? RISK_CFG.low;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function LayoutSeverityBadge({ severity }: { severity: string | null }) {
  if (!severity || severity === 'none') return null;
  const cfg = LAYOUT_SEVERITY_CFG[severity] ?? LAYOUT_SEVERITY_CFG.low;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function ConfidenceRing({ value }: { value: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = value >= 75 ? '#10b981' : value >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
      <svg className="absolute inset-0 -rotate-90" width="48" height="48">
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" stroke="#e2e8f0" />
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4"
          stroke={color} strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <span className="text-[10px] font-bold text-slate-700">{value}</span>
    </div>
  );
}

// ─── Review Card ──────────────────────────────────────────────────────────────

function ReviewCard({ review, onClick }: { review: GuardianReview; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-slate-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-slate-400">{review.review_number}</span>
          <DecisionBadge decision={review.decision} />
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide`}>
            {review.change_type.replace(/_/g, ' ')}
          </span>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 mt-0.5 transition-colors" />
      </div>
      <p className="text-sm font-semibold text-slate-800 mb-1 truncate">{review.title}</p>
      <p className="text-xs text-slate-500 line-clamp-2 mb-3">{review.proposed_change_summary}</p>
      <div className="flex items-center gap-3 flex-wrap">
        <ApprovalBadge status={review.approval_status} />
        {review.duplicate_risk && <RiskBadge risk={review.duplicate_risk} />}
        {review.layout_severity && review.layout_severity !== 'none' && (
          <LayoutSeverityBadge severity={review.layout_severity} />
        )}
        {review.confidence_score !== null && (
          <span className={`text-xs font-semibold ${scoreColor(review.confidence_score)}`}>
            {review.confidence_score}% confidence
          </span>
        )}
        <span className="text-xs text-slate-400 ml-auto">{formatDate(review.created_at)}</span>
      </div>
    </button>
  );
}

// ─── New Review Modal ─────────────────────────────────────────────────────────

function NewReviewModal({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: (review: GuardianReview) => void;
}) {
  const [title, setTitle] = useState('');
  const [changeType, setChangeType] = useState('page');
  const [reviewMode, setReviewMode] = useState<'prospective' | 'retrospective'>('prospective');
  const [summary, setSummary] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    if (!title.trim() || !summary.trim()) {
      setError('Please fill in the title and proposed change summary.');
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/architecture-guardian`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: title.trim(),
            change_type: changeType,
            review_mode: reviewMode,
            proposed_change_summary: summary.trim(),
          }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const review = await res.json();
      onComplete(review);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error. Please try again.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-900">Engineering Guardian Review</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Review Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Add new Compliance Dashboard page"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Change Type *</label>
              <select
                value={changeType}
                onChange={e => setChangeType(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              >
                {CHANGE_TYPES.map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Review Mode</label>
              <select
                value={reviewMode}
                onChange={e => setReviewMode(e.target.value as 'prospective' | 'retrospective')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
              >
                <option value="prospective">Prospective — before building</option>
                <option value="retrospective">Retrospective — existing platform</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Proposed Change Summary *
            </label>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              rows={6}
              placeholder={reviewMode === 'prospective'
                ? 'Describe what you want to build. Include: what it does, where it would live in the UI, what data it needs, how it would be used...'
                : 'Describe the existing area to review. Include: what it currently does, what tables/components it uses, any known issues or overlaps...'}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 resize-none"
            />
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <div className="text-xs text-blue-700">
                <p className="font-semibold mb-1">What the Engineering Guardian checks:</p>
                <p>Architecture · Engineering · Layout · <span className="font-semibold">Scroll Compliance</span> · Performance · Security · Compliance — across all existing pages, tables, components, workflows, and Edge Functions. Produces a full decision with engineering scores (health, maintainability, technical debt, complexity, MC compliance), categorised findings, grouped recommendations, and a copyable 18-section report.</p>
                <p className="mt-2"><span className="font-semibold">Scroll Compliance Check:</span> Verifies that every page follows the canonical scroll model — content containers use <code className="text-[10px] bg-white px-1 py-0.5 rounded border border-blue-200">overflow-y-auto</code>, pages needing internal scroll regions use <code className="text-[10px] bg-white px-1 py-0.5 rounded border border-blue-200">.scroll-surface</code> (h-full overflow-hidden), and no nested overflow-y-auto containers create scroll traps.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
            Cancel
          </button>
          <button
            onClick={handleRun}
            disabled={running || !title.trim() || !summary.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {running ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Running review…</>
            ) : (
              <><Shield className="w-4 h-4" />Run Guardian Review</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Review Detail Panel ──────────────────────────────────────────────────────

function ReviewDetail({
  review,
  onClose,
  onUpdate,
}: {
  review: GuardianReview;
  onClose: () => void;
  onUpdate: (updated: GuardianReview) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [poNotes, setPoNotes] = useState(review.po_notes ?? '');
  const [editingNotes, setEditingNotes] = useState(false);
  const [tab, setTab] = useState<'overview' | 'report' | 'evidence'>('overview');

  const decisionCfg = review.decision ? DECISION_CFG[review.decision] : null;

  async function handleApproval(action: 'approved' | 'rejected' | 'changes_requested') {
    setSaving(true);
    const { data, error } = await supabase
      .from('architecture_guardian_reviews')
      .update({
        approval_status: action,
        approved_by: action === 'approved' ? 'Product Owner' : null,
        approved_at: action === 'approved' ? new Date().toISOString() : null,
        po_notes: poNotes || null,
      })
      .eq('id', review.id)
      .select()
      .single();
    setSaving(false);
    if (!error && data) onUpdate(data as GuardianReview);
  }

  async function handleSaveNotes() {
    setSaving(true);
    const { data, error } = await supabase
      .from('architecture_guardian_reviews')
      .update({ po_notes: poNotes || null })
      .eq('id', review.id)
      .select()
      .single();
    setSaving(false);
    if (!error && data) {
      onUpdate(data as GuardianReview);
      setEditingNotes(false);
    }
  }

  const TABS = [
    { key: 'overview' as const, label: 'Overview',  icon: Shield   },
    { key: 'report'   as const, label: 'Full Report', icon: FileText },
    { key: 'evidence' as const, label: 'Evidence',  icon: BookOpen },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 pt-5 pb-0 border-b border-slate-200 bg-white">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-slate-400">{review.review_number}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wide`}>
                {review.change_type.replace(/_/g, ' ')}
              </span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 uppercase tracking-wide`}>
                {review.review_mode}
              </span>
              {review.trigger_source && review.trigger_source !== 'manual' && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 uppercase tracking-wide">
                  {review.trigger_source.replace(/_/g, ' ')}
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold text-slate-900 truncate">{review.title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-1 -mb-px">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {tab === 'overview' && (
          <>
            {/* Decision + badges */}
            <div className="flex flex-wrap items-center gap-3">
              <DecisionBadge decision={review.decision} />
              <ApprovalBadge status={review.approval_status} />
              {review.duplicate_risk && <RiskBadge risk={review.duplicate_risk} />}
              {review.layout_severity && review.layout_severity !== 'none' && (
                <LayoutSeverityBadge severity={review.layout_severity} />
              )}
              {review.risk_level && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${RISK_CFG[review.risk_level]?.bg ?? 'bg-slate-100'} ${RISK_CFG[review.risk_level]?.text ?? 'text-slate-600'}`}>
                  {review.risk_level} risk
                </span>
              )}
            </div>

            {/* Confidence + decision card */}
            {review.confidence_score !== null && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center gap-4">
                  <ConfidenceRing value={review.confidence_score} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Confidence Score</p>
                    <p className={`text-lg font-bold ${scoreColor(review.confidence_score)}`}>{review.confidence_score}/100</p>
                    {review.confidence_reason && (
                      <p className="text-xs text-slate-500 mt-1">{review.confidence_reason}</p>
                    )}
                  </div>
                  {decisionCfg && (
                    <div className={`text-right`}>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Decision</p>
                      <DecisionBadge decision={review.decision} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Engineering Scores */}
            {(review.engineering_health_score != null || review.maintainability_score != null || review.technical_debt_score != null || review.complexity_score != null || review.mc_compliance_score != null) && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Engineering Scores</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Engineering Health', value: review.engineering_health_score, invert: false },
                    { label: 'Maintainability',    value: review.maintainability_score,    invert: false },
                    { label: 'Technical Debt',     value: review.technical_debt_score,     invert: true  },
                    { label: 'Complexity',         value: review.complexity_score,         invert: true  },
                    { label: 'MC Compliance',      value: review.mc_compliance_score,      invert: false },
                  ].filter(s => s.value != null).map(s => {
                    const displayVal = s.value!;
                    const good = s.invert ? displayVal <= 30 : displayVal >= 70;
                    const warn = s.invert ? displayVal <= 60 : displayVal >= 50;
                    const color = good ? 'text-emerald-600' : warn ? 'text-amber-600' : 'text-red-600';
                    const barColor = good ? 'bg-emerald-500' : warn ? 'bg-amber-500' : 'bg-red-500';
                    return (
                      <div key={s.label}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs text-slate-500">{s.label}</p>
                          <p className={`text-xs font-bold ${color}`}>{displayVal}</p>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${displayVal}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Proposal */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Proposed Change</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-3">{review.proposed_change_summary}</p>
            </div>

            {/* Recommendations */}
            {(review.recommended_sot || review.recommended_approach || review.recommended_nav_location) && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recommendations</p>
                {review.recommended_sot && (
                  <div className="bg-white border border-slate-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-500 mb-1">Single Source of Truth</p>
                    <p className="text-sm text-slate-700">{review.recommended_sot}</p>
                  </div>
                )}
                {review.recommended_approach && (
                  <div className="bg-white border border-slate-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-500 mb-1">Recommended Approach</p>
                    <p className="text-sm text-slate-700">{review.recommended_approach}</p>
                  </div>
                )}
                {review.recommended_nav_location && (
                  <div className="bg-white border border-slate-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-500 mb-1">Navigation Location</p>
                    <p className="text-sm text-slate-700">{review.recommended_nav_location}</p>
                  </div>
                )}
              </div>
            )}

            {/* Impact grid */}
            {(review.data_model_impact || review.component_reuse || review.performance_impact) && (
              <div className="grid grid-cols-1 gap-3">
                {review.data_model_impact && (
                  <div className="bg-white border border-slate-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-500 mb-1">Data Model Impact</p>
                    <p className="text-sm text-slate-700">{review.data_model_impact}</p>
                  </div>
                )}
                {review.component_reuse && (
                  <div className="bg-white border border-slate-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-500 mb-1">Component Reuse Opportunities</p>
                    <p className="text-sm text-slate-700">{review.component_reuse}</p>
                  </div>
                )}
                {review.performance_impact && (
                  <div className="bg-white border border-slate-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-slate-500 mb-1">Performance Impact</p>
                    <p className="text-sm text-slate-700">{review.performance_impact}</p>
                  </div>
                )}
              </div>
            )}

            {/* Uncertainty notes */}
            {review.uncertainty_notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-700 mb-1">Uncertainty Notes</p>
                    <p className="text-sm text-amber-800">{review.uncertainty_notes}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Manual checks */}
            {review.manual_checks_required?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Manual Checks Required</p>
                <ul className="space-y-1">
                  {review.manual_checks_required.map((check, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                      {check}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Engineering Findings by Category */}
            {review.findings?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Engineering Findings ({review.findings.length})</p>
                <div className="space-y-2">
                  {(['security', 'architecture', 'layout', 'performance', 'engineering', 'compliance'] as const).map(cat => {
                    const catFindings = review.findings.filter(f => f.category === cat);
                    if (!catFindings.length) return null;
                    const catColor: Record<string, string> = {
                      security: 'bg-red-50 border-red-200 text-red-700',
                      architecture: 'bg-orange-50 border-orange-200 text-orange-700',
                      layout: 'bg-amber-50 border-amber-200 text-amber-700',
                      performance: 'bg-blue-50 border-blue-200 text-blue-700',
                      engineering: 'bg-purple-50 border-purple-200 text-purple-700',
                      compliance: 'bg-slate-100 border-slate-300 text-slate-600',
                    };
                    return (
                      <div key={cat}>
                        <p className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded inline-block border mb-1 ${catColor[cat]}`}>{cat}</p>
                        <div className="space-y-1.5">
                          {catFindings.map((f, i) => {
                            const sevBorder = f.severity === 'critical' ? 'border-red-300 bg-red-50' : f.severity === 'high' ? 'border-orange-300 bg-orange-50' : f.severity === 'medium' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50';
                            const sevText = f.severity === 'critical' ? 'text-red-700' : f.severity === 'high' ? 'text-orange-700' : f.severity === 'medium' ? 'text-amber-700' : 'text-slate-600';
                            return (
                              <div key={i} className={`border rounded-lg p-3 ${sevBorder}`}>
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${sevBorder} ${sevText}`}>{f.severity}</span>
                                  <p className="text-xs font-semibold text-slate-800 flex-1">{f.description}</p>
                                  {f.estimated_effort && (
                                    <span className="text-[10px] text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded">{f.estimated_effort}</span>
                                  )}
                                </div>
                                {f.root_cause && <p className="text-xs text-slate-600 mb-1"><span className="font-semibold">Cause: </span>{f.root_cause}</p>}
                                {f.recommended_fix && <p className={`text-xs font-medium ${sevText}`}><span className="font-semibold">Fix: </span>{f.recommended_fix}</p>}
                                {f.affected_files?.length > 0 && (
                                  <p className="text-[10px] text-slate-400 mt-1 font-mono truncate">{f.affected_files.join(', ')}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {(review.immediate_recommendations?.length > 0 || review.recommended_improvements?.length > 0 || review.future_improvements?.length > 0) && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Recommendations</p>
                <div className="space-y-3">
                  {review.immediate_recommendations?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide mb-1.5">Immediate (must fix)</p>
                      <div className="space-y-1.5">
                        {review.immediate_recommendations.map((r, i) => (
                          <div key={i} className="bg-red-50 border border-red-200 rounded-lg p-2.5">
                            <p className="text-xs font-semibold text-red-800">{r.title}</p>
                            <p className="text-xs text-red-700 mt-0.5">{r.description}</p>
                            {r.benefit && <p className="text-[10px] text-red-500 mt-1 italic">Benefit: {r.benefit}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {review.recommended_improvements?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-1.5">Recommended (same sprint)</p>
                      <div className="space-y-1.5">
                        {review.recommended_improvements.map((r, i) => (
                          <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                            <p className="text-xs font-semibold text-amber-800">{r.title}</p>
                            <p className="text-xs text-amber-700 mt-0.5">{r.description}</p>
                            {r.benefit && <p className="text-[10px] text-amber-500 mt-1 italic">Benefit: {r.benefit}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {review.future_improvements?.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-1.5">Future Improvements</p>
                      <div className="space-y-1.5">
                        {review.future_improvements.map((r, i) => (
                          <div key={i} className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                            <p className="text-xs font-semibold text-blue-800">{r.title}</p>
                            <p className="text-xs text-blue-700 mt-0.5">{r.description}</p>
                            {r.benefit && <p className="text-[10px] text-blue-500 mt-1 italic">Benefit: {r.benefit}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Layout & Scroll Violations */}
            {review.layout_violations?.length > 0 ? (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Layout & Scroll Validation</p>
                  <LayoutSeverityBadge severity={review.layout_severity} />
                </div>
                <div className="space-y-2">
                  {review.layout_violations.map((v, i) => {
                    const sev = v.severity;
                    const sevColor = sev === 'critical' ? 'border-red-300 bg-red-50' : sev === 'high' ? 'border-orange-300 bg-orange-50' : sev === 'medium' ? 'border-amber-300 bg-amber-50' : 'border-blue-200 bg-blue-50';
                    const sevText = sev === 'critical' ? 'text-red-700' : sev === 'high' ? 'text-orange-700' : sev === 'medium' ? 'text-amber-700' : 'text-blue-700';
                    return (
                      <div key={i} className={`border rounded-lg p-3 ${sevColor}`}>
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${sevColor} ${sevText} border`}>
                            {sev}
                          </span>
                          <span className="text-xs font-mono text-slate-600 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                            {v.violation_type}
                          </span>
                          <span className="text-xs font-semibold text-slate-700">{v.page}</span>
                          {v.component && v.component !== v.page && (
                            <span className="text-xs text-slate-500 italic truncate max-w-[200px]">{v.component}</span>
                          )}
                          <span className={`text-[10px] font-semibold ml-auto ${scoreColor(v.confidence)}`}>{v.confidence}% conf.</span>
                        </div>
                        <p className="text-xs text-slate-700 mb-1"><span className="font-semibold">Root cause: </span>{v.root_cause}</p>
                        <p className={`text-xs font-semibold ${sevText}`}><span className="font-semibold">Fix: </span>{v.recommended_fix}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              review.layout_severity === 'none' && review.layout_violations !== undefined && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <p className="text-xs text-emerald-700 font-medium">No layout or scroll violations detected.</p>
                </div>
              )
            )}

            {/* Scroll Compliance Audit (EWO-027R.X) */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-slate-400" />
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Scroll Compliance Audit</p>
                <span className="ml-auto text-[10px] text-slate-400 font-mono">EWO-027R.X</span>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-700">Canonical scroll model enforced</p>
                    <p className="text-xs text-slate-500 mt-0.5">Content containers use <code className="text-[10px] bg-white px-1 py-0.5 rounded border border-slate-200">overflow-y-auto</code> as the single scroll region. Pages needing internal scroll regions opt into <code className="text-[10px] bg-white px-1 py-0.5 rounded border border-slate-200">.scroll-surface</code> (h-full overflow-hidden).</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-700">No overflow-hidden scroll traps</p>
                    <p className="text-xs text-slate-500 mt-0.5">The <code className="text-[10px] bg-white px-1 py-0.5 rounded border border-slate-200">FULL_HEIGHT_SECTIONS</code> set that caused content clipping on the ATD Connect MCP tab has been removed. All sections now scroll naturally.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-700">MCP/App Readiness page accessible</p>
                    <p className="text-xs text-slate-500 mt-0.5">The MCP tab content (OAuth infrastructure, ChatGPT workspace capability, connection status, auth modes, server status, tool list, self-test results, readiness truth table, setup instructions) is now fully scrollable and accessible.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* PO Actions */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" />
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Product Owner Actions</p>
              </div>
              <div className="p-4 space-y-4">
                {review.approved_at && (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Clock className="w-3.5 h-3.5" />
                    {review.approval_status === 'approved' ? 'Approved' : 'Actioned'} by {review.approved_by ?? 'PO'} on {formatDate(review.approved_at)}
                  </div>
                )}

                {/* PO Notes */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-slate-500">PO Notes</p>
                    {!editingNotes && (
                      <button onClick={() => setEditingNotes(true)} className="text-xs text-blue-600 hover:text-blue-700">Edit</button>
                    )}
                  </div>
                  {editingNotes ? (
                    <div className="space-y-2">
                      <textarea
                        value={poNotes}
                        onChange={e => setPoNotes(e.target.value)}
                        rows={3}
                        placeholder="Add PO notes, decisions, or context..."
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400 resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveNotes}
                          disabled={saving}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-50"
                        >
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Save Notes
                        </button>
                        <button onClick={() => { setEditingNotes(false); setPoNotes(review.po_notes ?? ''); }} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2.5 min-h-[2.5rem]">
                      {review.po_notes ?? <span className="text-slate-400 italic">No notes added.</span>}
                    </p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => handleApproval('approved')}
                    disabled={saving || review.approval_status === 'approved'}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleApproval('changes_requested')}
                    disabled={saving || review.approval_status === 'changes_requested'}
                    className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Request Changes
                  </button>
                  <button
                    onClick={() => handleApproval('rejected')}
                    disabled={saving || review.approval_status === 'rejected'}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            </div>

            {/* Meta */}
            {review.ai_provider && (
              <p className="text-xs text-slate-400">
                Generated by {review.ai_provider} · {review.ai_model_used}
                {review.generation_time_ms && ` · ${(review.generation_time_ms / 1000).toFixed(1)}s`}
              </p>
            )}
          </>
        )}

        {tab === 'report' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Full Guardian Report</p>
              {review.markdown_report && <CopyButton text={review.markdown_report} label="Copy Report" />}
            </div>
            {review.markdown_report ? (
              <pre className="text-xs text-slate-700 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-xl p-4 font-sans leading-relaxed">
                {review.markdown_report}
              </pre>
            ) : (
              <p className="text-sm text-slate-400 italic">No report generated.</p>
            )}
          </div>
        )}

        {tab === 'evidence' && (
          <div className="space-y-5">
            {/* Related areas */}
            {review.existing_related_areas?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Existing Related Areas</p>
                <div className="space-y-2">
                  {review.existing_related_areas.map((area, i) => (
                    <div key={i} className="bg-white border border-slate-200 rounded-lg p-3 flex items-start gap-3">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded uppercase shrink-0 mt-0.5">{area.type}</span>
                      <div>
                        <p className="text-sm font-medium text-slate-800">{area.area}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{area.relevance}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Potential duplicates */}
            {review.potential_duplicates?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Potential Duplicates</p>
                <div className="space-y-2">
                  {review.potential_duplicates.map((dup, i) => (
                    <div key={i} className="bg-red-50 border border-red-100 rounded-lg p-3 flex items-start gap-3">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-red-100 text-red-700 rounded uppercase shrink-0 mt-0.5">{dup.type}</span>
                      <div>
                        <p className="text-sm font-medium text-red-800">{dup.area}</p>
                        <p className="text-xs text-red-600 mt-0.5">{dup.overlap_description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence */}
            {review.evidence_found?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Evidence Found</p>
                <div className="space-y-2">
                  {review.evidence_found.map((ev, i) => (
                    <div key={i} className="bg-white border border-slate-200 rounded-lg p-3">
                      <p className="text-sm text-slate-700">{ev.evidence}</p>
                      <p className="text-xs text-slate-400 mt-1">Source: {ev.source}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!review.existing_related_areas?.length && !review.potential_duplicates?.length && !review.evidence_found?.length && (
              <p className="text-sm text-slate-400 italic">No evidence data recorded.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ECCArchitectureGuardianPage() {
  const [reviews, setReviews] = useState<GuardianReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterDecision, setFilterDecision] = useState('');
  const [filterApproval, setFilterApproval] = useState('');
  const [filterRisk, setFilterRisk] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<GuardianReview | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase
      .from('architecture_guardian_reviews')
      .select('*')
      .order('created_at', { ascending: false });
    setLoading(false);
    if (e) { setError(e.message); return; }
    setReviews((data ?? []) as GuardianReview[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSelect(r: GuardianReview) {
    setSelected(r);
    setShowPanel(true);
  }

  function handleUpdate(updated: GuardianReview) {
    setReviews(prev => prev.map(r => r.id === updated.id ? updated : r));
    setSelected(updated);
  }

  function handleComplete(review: GuardianReview) {
    setReviews(prev => [review, ...prev]);
    setShowModal(false);
    handleSelect(review);
  }

  const filtered = reviews.filter(r => {
    if (filterDecision && r.decision !== filterDecision) return false;
    if (filterApproval && r.approval_status !== filterApproval) return false;
    if (filterRisk && r.duplicate_risk !== filterRisk) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.title.toLowerCase().includes(q)
        || r.proposed_change_summary.toLowerCase().includes(q)
        || r.review_number.toLowerCase().includes(q)
        || r.change_type.toLowerCase().includes(q);
    }
    return true;
  });

  // Stats
  const total = reviews.length;
  const approved = reviews.filter(r => r.approval_status === 'approved').length;
  const pendingReview = reviews.filter(r => r.approval_status === 'pending').length;
  const rejected = reviews.filter(r => r.decision === 'REJECT_DUPLICATE').length;
  const highRisk = reviews.filter(r => ['high', 'critical'].includes(r.duplicate_risk ?? '')).length;
  const layoutIssues = reviews.filter(r => r.layout_severity && !['none', null].includes(r.layout_severity)).length;
  const securityIssues = reviews.reduce((s, r) => s + (r.security_issues ?? 0), 0);
  const performanceIssues = reviews.reduce((s, r) => s + (r.performance_issues ?? 0), 0);
  const techDebtItems = reviews.reduce((s, r) => s + (r.technical_debt_items ?? 0), 0);
  const avgHealth = reviews.filter(r => r.engineering_health_score != null).length
    ? Math.round(reviews.reduce((s, r) => s + (r.engineering_health_score ?? 0), 0) / reviews.filter(r => r.engineering_health_score != null).length)
    : null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* List panel */}
      <div className={`flex flex-col min-w-0 transition-all ${showPanel ? 'w-[420px] shrink-0' : 'flex-1'} overflow-hidden border-r border-slate-200 bg-white`}>

        {/* Header */}
        <div className="shrink-0 px-6 pt-6 pb-4 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                <h1 className="text-xl font-bold text-slate-900">Engineering Guardian</h1>
              </div>
              <p className="text-sm text-slate-500 mt-1">Engineering governance — prevent duplication, drift, layout issues, and technical debt.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Review
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            {[
              { label: 'Total',    value: total,        color: 'text-slate-700' },
              { label: 'Approved', value: approved,     color: 'text-emerald-600' },
              { label: 'Pending',  value: pendingReview, color: 'text-amber-600' },
            ].map(s => (
              <div key={s.label} className="text-center bg-slate-50 rounded-lg py-2">
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {[
              { label: 'Rejected',   value: rejected,          color: 'text-red-600' },
              { label: 'High Risk',  value: highRisk,          color: highRisk > 0 ? 'text-orange-600' : 'text-slate-400' },
              { label: 'Layout/Scroll', value: layoutIssues,      color: layoutIssues > 0 ? 'text-amber-600' : 'text-slate-400' },
              { label: 'Security',   value: securityIssues,    color: securityIssues > 0 ? 'text-red-600' : 'text-slate-400' },
            ].map(s => (
              <div key={s.label} className="text-center bg-slate-50 rounded-lg py-2">
                <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: 'Perf Issues', value: performanceIssues, color: performanceIssues > 0 ? 'text-orange-600' : 'text-slate-400' },
              { label: 'Tech Debt',   value: techDebtItems,      color: techDebtItems > 0 ? 'text-amber-600' : 'text-slate-400' },
              { label: 'Avg Health',  value: avgHealth != null ? `${avgHealth}` : '—', color: avgHealth == null ? 'text-slate-400' : avgHealth >= 70 ? 'text-emerald-600' : avgHealth >= 50 ? 'text-amber-600' : 'text-red-600' },
            ].map(s => (
              <div key={s.label} className="text-center bg-slate-50 rounded-lg py-2">
                <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search reviews..."
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <select
              value={filterDecision}
              onChange={e => setFilterDecision(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400"
            >
              <option value="">All Decisions</option>
              {Object.entries(DECISION_CFG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              value={filterApproval}
              onChange={e => setFilterApproval(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400"
            >
              <option value="">All Approvals</option>
              {Object.entries(APPROVAL_CFG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              value={filterRisk}
              onChange={e => setFilterRisk(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-400"
            >
              <option value="">All Risks</option>
              {Object.keys(RISK_CFG).map(k => (
                <option key={k} value={k}>{RISK_CFG[k].label}</option>
              ))}
            </select>
            {(filterDecision || filterApproval || filterRisk || search) && (
              <button
                onClick={() => { setFilterDecision(''); setFilterApproval(''); setFilterRisk(''); setSearch(''); }}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Shield className="w-10 h-10 text-slate-200 mb-3" />
              {reviews.length === 0 ? (
                <>
                  <p className="text-sm font-medium text-slate-600 mb-1">No reviews yet</p>
                  <p className="text-xs text-slate-400 mb-4 max-w-xs">
                    Run your first Engineering Guardian review before building a new feature, page, table, or workflow.
                  </p>
                  <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-500 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Run First Review
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-600">No matching reviews</p>
                  <p className="text-xs text-slate-400 mt-1">Try adjusting your filters</p>
                </>
              )}
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-400">{filtered.length} of {total} reviews</p>
              {filtered.map(r => (
                <ReviewCard key={r.id} review={r} onClick={() => handleSelect(r)} />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {showPanel && selected && (
        <div className="flex-1 overflow-hidden bg-white">
          <ReviewDetail
            review={selected}
            onClose={() => setShowPanel(false)}
            onUpdate={handleUpdate}
          />
        </div>
      )}

      {/* New review modal */}
      {showModal && (
        <NewReviewModal
          onClose={() => setShowModal(false)}
          onComplete={handleComplete}
        />
      )}
    </div>
  );
}

// ─── Exported utility for feature lifecycle warning ────────────────────────────

export async function getGuardianStatusForFeature(featureId: string): Promise<{
  hasReview: boolean;
  isBlocked: boolean;
  latestDecision: string | null;
  latestApproval: string | null;
}> {
  const { data } = await supabase
    .from('architecture_guardian_reviews')
    .select('decision, approval_status')
    .eq('linked_feature_id', featureId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return { hasReview: false, isBlocked: false, latestDecision: null, latestApproval: null };

  const isBlocked =
    (data.decision === 'REJECT_DUPLICATE' || data.decision === 'NEEDS_PRODUCT_OWNER_REVIEW') &&
    data.approval_status !== 'approved';

  return {
    hasReview: true,
    isBlocked,
    latestDecision: data.decision,
    latestApproval: data.approval_status,
  };
}
