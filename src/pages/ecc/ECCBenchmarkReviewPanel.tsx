import { useState, useEffect, useCallback } from 'react';
import {
  X, Lock, Star, CheckCircle2, Clock, ArrowRight, RefreshCw,
  FileText, Shield, Eye, AlertTriangle, BarChart3,
  ChevronDown, ChevronRight, User, Calendar,
  ThumbsUp, ThumbsDown, Minus, Save, Send, Copy, Check,
  Zap, TrendingUp, TrendingDown, Flag, Printer, Target,
} from 'lucide-react';
import {
  loadBenchmarkRuns,
  loadReviewForSession,
  saveReview,
  submitReview,
  loadPODecisionForSession,
  recordPODecision,
  loadCapabilityDelta,
  calculateEIS,
  CAPABILITY_DIMENSIONS,
  type BenchmarkSession,
  type BenchmarkRun,
  type BenchmarkReview,
  type PODecision,
  type SaveReviewInput,
  type ReviewRating,
  type ReviewRecommendation,
  type PODecisionValue,
  type CapabilityScores,
  type CapabilityDelta,
  type ObservationFlag,
  type ObservationFlagType,
} from '../../lib/atdBenchmarkService';
import { MarkdownContent } from '../../lib/MarkdownContent';
import { CapabilityScoreInput, EISDisplay, type ScoreMap } from '../../components/CapabilityScoreInput';

// ─── Constants ────────────────────────────────────────────────────────────────

const RATING_CONFIG: Record<ReviewRating, { label: string; color: string; bg: string; border: string; stars: number }> = {
  exceptional:  { label: 'Exceptional',  color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-400', stars: 5 },
  strong:       { label: 'Strong',       color: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-400',    stars: 4 },
  adequate:     { label: 'Adequate',     color: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-400',   stars: 3 },
  developing:   { label: 'Developing',   color: 'text-orange-700',  bg: 'bg-orange-50',   border: 'border-orange-400',  stars: 2 },
  insufficient: { label: 'Insufficient', color: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-400',     stars: 1 },
};

const RECOMMENDATION_CONFIG: Record<ReviewRecommendation, { label: string; color: string; bg: string; border: string; icon: typeof ThumbsUp }> = {
  accept:                  { label: 'Accept',                   color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-400', icon: ThumbsUp   },
  accept_with_observations:{ label: 'Accept with Observations', color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-400',   icon: Minus      },
  return_for_improvement:  { label: 'Return for Improvement',   color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-400',     icon: ThumbsDown },
};

const PO_DECISION_CONFIG: Record<PODecisionValue, { label: string; color: string; bg: string; border: string }> = {
  accepted:                  { label: 'Accepted',                   color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-400' },
  accepted_with_observations:{ label: 'Accepted with Observations', color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-400'  },
  returned_for_improvement:  { label: 'Returned for Improvement',   color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-400'    },
};

const SESSION_STATUS_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  awaiting_review:           { label: 'Awaiting Review',            color: 'text-slate-600',   bg: 'bg-slate-50',   border: 'border-slate-200'   },
  under_review:              { label: 'Under Review',               color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200'   },
  reviewed:                  { label: 'Reviewed',                   color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200'    },
  review_complete:           { label: 'Review Complete',            color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200'    },
  awaiting_po_acceptance:    { label: 'Awaiting PO Acceptance',     color: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-200'  },
  accepted:                  { label: 'Accepted',                   color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  accepted_with_observations:{ label: 'Accepted with Observations', color: 'text-teal-700',    bg: 'bg-teal-50',    border: 'border-teal-200'    },
  returned_for_improvement:  { label: 'Returned for Improvement',   color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200'     },
};

const OBSERVATION_FLAG_CONFIG: Record<ObservationFlagType, { label: string; color: string; bg: string; border: string }> = {
  major_improvement:    { label: 'Major Improvement',    color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-300' },
  regression:           { label: 'Regression',           color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-300'     },
  hallucination:        { label: 'Hallucination',        color: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-300'  },
  commercial_insight:   { label: 'Commercial Insight',   color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-300'    },
  architecture_insight: { label: 'Architecture Insight', color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-300'  },
  governance_insight:   { label: 'Governance Insight',   color: 'text-slate-700',   bg: 'bg-slate-100',  border: 'border-slate-300'   },
};

const EMPTY_SCORES: CapabilityScores = {
  commercial_understanding: 0, product_understanding: 0, platform_knowledge: 0,
  architecture_quality: 0, engineering_governance: 0, roadmap_planning: 0,
  risk_assessment: 0, technical_accuracy: 0, recommendation_quality: 0,
};

const EIS_WEIGHTS: Record<string, number> = {
  commercial_understanding: 1.0, product_understanding: 1.0, platform_knowledge: 1.0,
  architecture_quality: 1.2, engineering_governance: 1.0, roadmap_planning: 1.0,
  risk_assessment: 1.0, technical_accuracy: 1.2, recommendation_quality: 1.1,
};

const SCORE_DIMENSIONS = CAPABILITY_DIMENSIONS.map(d => ({ ...d, weight: EIS_WEIGHTS[d.key] ?? 1 }));

type PanelTab = 'responses' | 'review' | 'po-decision' | 'governance';

// ─── Review Template ──────────────────────────────────────────────────────────

function buildReviewTemplate(sessionName: string): string {
  return `# Engineering Review — ${sessionName}

## Executive Summary

_Provide a concise executive-level summary of the benchmark assessment._

---

## Overall Rating

_[Exceptional / Strong / Adequate / Developing / Insufficient]_

---

## Capability Scores

| Capability Dimension | Score (0–10) | Notes |
|---|---|---|
| Commercial Understanding | | |
| Product Understanding | | |
| Platform Knowledge | | |
| Architecture Quality | | |
| Engineering Governance | | |
| Roadmap Planning | | |
| Technical Accuracy | | |
| Risk Assessment | | |
| Recommendation Quality | | |

**Engineering Intelligence Score (EIS): ** / 100

---

## Capability Delta

_Compare against the most recent accepted benchmark session. Note improvements and regressions._

---

## Strengths

-

---

## Weaknesses

-

---

## Hallucinations / Unsupported Assumptions

_Document any factual errors, hallucinations, or unsupported claims identified in the ATD responses._

---

## Engineering Risks

-

---

## Recommendations

1.

---

## Overall Verdict

_Provide your overall assessment of the ATD's current engineering intelligence level and fitness for purpose._
`;
}

// ─── Shared Primitives ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = SESSION_STATUS_LABELS[status] ?? SESSION_STATUS_LABELS.awaiting_review;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
}

function SectionField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</p>
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
        <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{value}</p>
      </div>
    </div>
  );
}

function EISBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const color = score >= 80 ? 'text-emerald-700' : score >= 60 ? 'text-blue-700' : score >= 40 ? 'text-amber-700' : 'text-red-700';
  const bg    = score >= 80 ? 'bg-emerald-50'    : score >= 60 ? 'bg-blue-50'    : score >= 40 ? 'bg-amber-50'    : 'bg-red-50';
  const ring  = score >= 80 ? 'ring-emerald-300' : score >= 60 ? 'ring-blue-300' : score >= 40 ? 'ring-amber-300' : 'ring-red-300';
  const label = score >= 80 ? 'Exceptional' : score >= 65 ? 'Strong' : score >= 50 ? 'Adequate' : score >= 35 ? 'Developing' : 'Insufficient';
  if (size === 'sm') {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${bg} ${color}`}>
        <Zap className="w-3 h-3" />EIS {score.toFixed(1)}
      </span>
    );
  }
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl ${bg} ring-1 ${ring}`}>
      <Zap className={`w-4 h-4 ${color}`} />
      <span className={`text-lg font-black ${color}`}>{score.toFixed(1)}</span>
      <span className={`text-xs ${color} opacity-60`}>/ 100</span>
      <span className={`text-xs font-semibold ${color} border-l border-current/20 pl-2`}>{label}</span>
    </div>
  );
}

function StarRating({ rating }: { rating: ReviewRating | null }) {
  if (!rating) return null;
  const cfg = RATING_CONFIG[rating];
  return (
    <div className="flex items-center gap-1">
      {[1,2,3,4,5].map(n => (
        <Star key={n} className={`w-4 h-4 ${n <= cfg.stars ? `${cfg.color} fill-current` : 'text-slate-200'}`} />
      ))}
      <span className={`text-xs font-semibold ml-1 ${cfg.color}`}>{cfg.label}</span>
    </div>
  );
}

function scoreFill(v: number) {
  if (v >= 8) return 'bg-emerald-500';
  if (v >= 6) return 'bg-blue-500';
  if (v >= 4) return 'bg-amber-500';
  return 'bg-red-500';
}

function CapabilityDeltaGrid({ delta, baselineRef, currentEis, baselineEis }: {
  delta: CapabilityDelta; baselineRef: string; currentEis: number; baselineEis: number | null;
}) {
  const eisDelta = baselineEis != null ? currentEis - baselineEis : null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">vs {baselineRef}</p>
        {eisDelta != null && (
          <div className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${eisDelta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {eisDelta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            EIS {eisDelta >= 0 ? '+' : ''}{eisDelta.toFixed(1)}
          </div>
        )}
      </div>
      {CAPABILITY_DIMENSIONS.map(dim => {
        const entry = delta[dim.key];
        const d = entry.delta;
        return (
          <div key={dim.key} className="flex items-center gap-2 text-xs">
            <span className="w-40 text-slate-600 truncate font-medium">{dim.label}</span>
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${scoreFill(entry.current)}`} style={{ width: `${entry.current * 10}%` }} />
            </div>
            <span className="w-10 text-right font-semibold text-slate-700">{entry.current % 1 === 0 ? entry.current.toFixed(1) : entry.current}</span>
            <span className={`w-12 text-center font-bold rounded px-1 ${d === 0 ? 'text-slate-400' : d > 0 ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
              {d === 0 ? '—' : `${d > 0 ? '+' : ''}${Number(d.toFixed(2))}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Responses Tab ────────────────────────────────────────────────────────────

function ResponsesTab({ runs }: { runs: BenchmarkRun[] }) {
  const [expanded, setExpanded] = useState<string | null>(runs[0]?.id ?? null);
  return (
    <div className="space-y-4 p-6">
      <div>
        <p className="text-sm font-semibold text-slate-800">AI Technical Director Responses</p>
        <p className="text-xs text-slate-400 mt-0.5">{runs.length} benchmark run{runs.length !== 1 ? 's' : ''} — permanently locked governance artefacts.</p>
      </div>
      {runs.length === 0 && (
        <div className="text-center py-10 text-slate-400 text-sm">No responses captured for this session.</div>
      )}
      {runs.map(run => {
        const isOpen = expanded === run.id;
        return (
          <div key={run.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : run.id)}
              className="w-full text-left p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center flex-shrink-0">
                  <BarChart3 className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-500">{run.benchmark_id_code}</span>
                    <span className="text-sm font-semibold text-slate-800">{run.benchmark_name}</span>
                    <Lock className="w-3 h-3 text-slate-300" />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(run.execution_timestamp).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                    {run.model_used && ` · ${run.model_used}`}
                    {run.provider_used && ` (${run.provider_used})`}
                    {` · ${run.response_length.toLocaleString()} chars`}
                  </p>
                </div>
              </div>
              {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
            </button>
            {isOpen && (
              <div className="border-t border-slate-100 p-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Benchmark Prompt</p>
                  <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                    <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans">{run.benchmark_prompt}</pre>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">AI Technical Director Response</p>
                  <div className="bg-slate-900 rounded-xl p-4 max-h-96 overflow-y-auto">
                    <pre className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed font-mono">{run.ai_response}</pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Engineering Review Tab ───────────────────────────────────────────────────

type ReviewMode = 'edit' | 'preview';

function parseCapabilityScores(raw: unknown): CapabilityScores | null {
  if (!raw) return null;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
  return raw as CapabilityScores;
}

function parseObservationFlags(raw: unknown): ObservationFlag[] {
  if (!raw) return [];
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
  return Array.isArray(raw) ? (raw as ObservationFlag[]) : [];
}

function parseCapabilityDelta(raw: unknown): CapabilityDelta | null {
  if (!raw) return null;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return null; } }
  return raw as CapabilityDelta;
}

function toScoreMap(scores: CapabilityScores): ScoreMap {
  return scores as unknown as ScoreMap;
}

function fromScoreMap(map: ScoreMap): CapabilityScores {
  return map as unknown as CapabilityScores;
}

function EngineeringReviewTab({
  session,
  review,
  onReviewSaved,
}: {
  session: BenchmarkSession;
  review: BenchmarkReview | null;
  onReviewSaved: (r: BenchmarkReview) => void;
}) {
  const isLocked = review?.is_locked ?? false;
  const isSubmitted = review?.review_status === 'submitted' || review?.review_status === 'finalised';
  const canBeginReview = ['awaiting_review', 'under_review', 'reviewed'].includes(session.overall_review_status);

  const [mode, setMode] = useState<ReviewMode>(isLocked ? 'preview' : 'edit');
  const [reviewer, setReviewer] = useState(review?.reviewer ?? '');
  const [reviewDate, setReviewDate] = useState(review?.review_date?.split('T')[0] ?? new Date().toISOString().split('T')[0]);
  const [reviewTitle, setReviewTitle] = useState(review?.review_title ?? `Engineering Review — ${session.session_name}`);
  const [content, setContent] = useState(review?.review_content ?? buildReviewTemplate(session.session_name));
  const [rating, setRating] = useState<ReviewRating | undefined>(review?.overall_rating ?? undefined);
  const [recommendation, setRecommendation] = useState<ReviewRecommendation | undefined>(review?.overall_recommendation ?? undefined);
  const [capScores, setCapScores] = useState<CapabilityScores>(parseCapabilityScores(review?.capability_scores) ?? { ...EMPTY_SCORES });
  const [obFlags, setObFlags] = useState<ObservationFlag[]>(parseObservationFlags(review?.observation_flags));
  const [addingFlag, setAddingFlag] = useState(false);
  const [newFlagType, setNewFlagType] = useState<ObservationFlagType>('major_improvement');
  const [newFlagNote, setNewFlagNote] = useState('');
  const [newFlagSeverity, setNewFlagSeverity] = useState<ObservationFlag['severity']>('info');

  const [deltaState, setDeltaState] = useState<{ session: { session_ref: string; eis_score: number | null }; delta: CapabilityDelta } | null>(null);
  const [deltaLoading, setDeltaLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasAnyScore = Object.values(capScores).some(v => v > 0);
  const currentEis = hasAnyScore ? calculateEIS(capScores) : 0;

  // Load capability delta when scores change
  useEffect(() => {
    if (!hasAnyScore) { setDeltaState(null); return; }
    const t = setTimeout(async () => {
      setDeltaLoading(true);
      try {
        const result = await loadCapabilityDelta(session.id, capScores);
        if (result) {
          setDeltaState({ session: { session_ref: result.session.session_ref, eis_score: result.session.eis_score }, delta: result.delta });
        } else {
          setDeltaState(null);
        }
      } catch { setDeltaState(null); }
      finally { setDeltaLoading(false); }
    }, 800);
    return () => clearTimeout(t);
  }, [capScores, hasAnyScore, session.id]);

  const buildSaveInput = (): SaveReviewInput => ({
    session_id: session.id,
    reviewer: reviewer || undefined,
    review_date: reviewDate || undefined,
    review_title: reviewTitle || undefined,
    review_content: content || undefined,
    overall_rating: rating,
    overall_recommendation: recommendation,
    capability_scores: hasAnyScore ? capScores : undefined,
    eis_score: hasAnyScore ? calculateEIS(capScores) : undefined,
    observation_flags: obFlags,
    capability_delta: deltaState?.delta ?? undefined,
  });

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const saved = await saveReview(review?.id ?? null, buildSaveInput());
      onReviewSaved(saved);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save review');
    } finally { setSaving(false); }
  };

  const handleSubmit = async () => {
    if (!reviewer.trim()) { setError('Reviewer name is required before submitting.'); return; }
    if (!content.trim() || content === buildReviewTemplate(session.session_name)) {
      setError('Engineering Review content is required before submitting.'); return;
    }
    if (!rating) { setError('Overall Rating is required before submitting.'); return; }
    if (!recommendation) { setError('Overall Recommendation is required before submitting.'); return; }

    setSubmitting(true); setError(null);
    try {
      let activeReview = review;
      if (!activeReview || !activeReview.is_locked) {
        activeReview = await saveReview(review?.id ?? null, buildSaveInput());
      }
      await submitReview(activeReview.id, session.id);
      onReviewSaved({ ...activeReview, review_status: 'submitted' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit review');
    } finally { setSubmitting(false); }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!canBeginReview && !review) {
    return (
      <div className="p-6 flex items-center justify-center h-48">
        <div className="text-center">
          <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Awaiting benchmark capture before review can begin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Review header */}
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex-shrink-0 space-y-3">
        {isLocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-amber-600" />
            <p className="text-xs text-amber-700">This Engineering Review is permanently locked.</p>
          </div>
        )}

        {/* Review title + metadata row */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Review Title</label>
            <input
              type="text"
              value={reviewTitle}
              onChange={e => setReviewTitle(e.target.value)}
              disabled={isLocked}
              className="w-full px-3 py-1.5 text-sm font-semibold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Reviewer <span className="text-red-500">*</span></label>
              <div className="relative">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input type="text" value={reviewer} onChange={e => setReviewer(e.target.value)} disabled={isLocked}
                  placeholder="Reviewer name" className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Review Date</label>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)} disabled={isLocked}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Rating + recommendation + mode toggle */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Rating */}
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(RATING_CONFIG) as ReviewRating[]).map(r => {
              const cfg = RATING_CONFIG[r];
              const selected = rating === r;
              return (
                <button key={r} disabled={isLocked} onClick={() => setRating(r)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${selected ? `${cfg.color} ${cfg.bg} ${cfg.border} shadow-sm` : 'text-slate-500 bg-white border-slate-200 hover:border-slate-300'} disabled:cursor-default`}>
                  <div className="flex gap-0.5">{[1,2,3,4,5].map(n => <Star key={n} className={`w-2.5 h-2.5 ${n <= cfg.stars ? (selected ? `${cfg.color} fill-current` : 'text-slate-300 fill-current') : 'text-slate-200'}`} />)}</div>
                  {cfg.label}
                </button>
              );
            })}
          </div>

          {/* Recommendation */}
          <div className="flex gap-1 flex-wrap">
            {(Object.keys(RECOMMENDATION_CONFIG) as ReviewRecommendation[]).map(r => {
              const cfg = RECOMMENDATION_CONFIG[r];
              const Icon = cfg.icon;
              const selected = recommendation === r;
              return (
                <button key={r} disabled={isLocked} onClick={() => setRecommendation(r)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${selected ? `${cfg.color} ${cfg.bg} ${cfg.border} shadow-sm` : 'text-slate-500 bg-white border-slate-200 hover:border-slate-300'} disabled:cursor-default`}>
                  <Icon className="w-3 h-3" />{cfg.label}
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setMode('edit')} disabled={isLocked}
              className={`px-3 py-1.5 text-xs font-medium rounded-l-lg border border-r-0 transition-colors ${mode === 'edit' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 disabled:cursor-default'}`}>
              Edit
            </button>
            <button onClick={() => setMode('preview')}
              className={`px-3 py-1.5 text-xs font-medium rounded-r-lg border transition-colors ${mode === 'preview' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              Preview
            </button>
          </div>
        </div>
      </div>

      {/* Editor / Preview */}
      <div className="flex-1 overflow-y-auto">
        {mode === 'edit' && !isLocked ? (
          <div className="p-5 space-y-4">
            {/* Markdown toolbar hint */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-slate-500 flex-wrap">
              <span className="font-semibold text-slate-600">Markdown supported:</span>
              <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded"># Heading</code>
              <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded">**bold**</code>
              <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded">- list</code>
              <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded">| table |</code>
              <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded">&gt; callout</code>
              <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded">- [ ] checklist</code>
            </div>

            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={28}
              className="w-full px-4 py-3 text-sm font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y leading-relaxed bg-white"
              placeholder="Write the Engineering Review using markdown..."
            />

            {/* Capability Scores */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Capability Scores (Optional — structured extract)</p>
              <CapabilityScoreInput
                dimensions={SCORE_DIMENSIONS}
                scores={toScoreMap(capScores)}
                onChange={map => setCapScores(fromScoreMap(map))}
                summaryLabel="Engineering Intelligence Score (EIS)"
                showSummary
              />

              {hasAnyScore && (
                <div className="pt-3 border-t border-slate-100">
                  {deltaLoading ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />Computing capability delta...
                    </div>
                  ) : deltaState ? (
                    <CapabilityDeltaGrid delta={deltaState.delta} baselineRef={deltaState.session.session_ref}
                      currentEis={currentEis} baselineEis={deltaState.session.eis_score} />
                  ) : (
                    <p className="text-xs text-slate-400 italic">No previous accepted session with scores — delta unavailable.</p>
                  )}
                </div>
              )}
            </div>

            {/* Observation flags */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Observation Flags</p>
                {!addingFlag && (
                  <button onClick={() => setAddingFlag(true)} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                    <Flag className="w-3 h-3" />Add Flag
                  </button>
                )}
              </div>
              {obFlags.length === 0 && !addingFlag && <p className="text-xs text-slate-400 italic">No observation flags.</p>}
              {obFlags.map((f, i) => {
                const cfg = OBSERVATION_FLAG_CONFIG[f.type];
                return (
                  <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 border ${cfg.bg} ${cfg.border}`}>
                    <Flag className={`w-3 h-3 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                      {f.severity !== 'info' && <span className={`ml-2 text-xs px-1 rounded ${f.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{f.severity}</span>}
                      <p className="text-xs text-slate-700 mt-0.5">{f.note}</p>
                    </div>
                    <button onClick={() => setObFlags(obFlags.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-500 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
              {addingFlag && (
                <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Type</label>
                      <select value={newFlagType} onChange={e => setNewFlagType(e.target.value as ObservationFlagType)}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {(Object.keys(OBSERVATION_FLAG_CONFIG) as ObservationFlagType[]).map(k => (
                          <option key={k} value={k}>{OBSERVATION_FLAG_CONFIG[k].label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Severity</label>
                      <select value={newFlagSeverity} onChange={e => setNewFlagSeverity(e.target.value as ObservationFlag['severity'])}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option>
                      </select>
                    </div>
                  </div>
                  <input type="text" value={newFlagNote} onChange={e => setNewFlagNote(e.target.value)} placeholder="Describe the observation..."
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setAddingFlag(false)} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-white">Cancel</button>
                    <button onClick={() => {
                      if (!newFlagNote.trim()) return;
                      setObFlags([...obFlags, { type: newFlagType, note: newFlagNote.trim(), severity: newFlagSeverity }]);
                      setNewFlagNote(''); setAddingFlag(false);
                    }} disabled={!newFlagNote.trim()} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">Add Flag</button>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-medium hover:bg-slate-50 transition-colors">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy Markdown'}
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors">
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : saved ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Save className="w-3.5 h-3.5" />}
                  {saving ? 'Saving...' : saved ? 'Saved' : 'Save Draft'}
                </button>
              </div>
              <button onClick={handleSubmit} disabled={submitting || saving}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {submitting ? 'Submitting...' : 'Submit Review'}
              </button>
            </div>
          </div>
        ) : (
          /* Preview / locked read view */
          <div className="p-6 space-y-6">
            {/* Metadata block */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-base font-bold text-slate-900">{reviewTitle || review?.review_title || 'Engineering Review'}</p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-slate-500">
                    {(reviewer || review?.reviewer) && (
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{reviewer || review?.reviewer}</span>
                    )}
                    {(reviewDate || review?.review_date) && (
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />
                        {new Date(reviewDate || review!.review_date!).toLocaleDateString('en-AU', { dateStyle: 'long' })}
                      </span>
                    )}
                    {review?.review_ref && (
                      <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{review.review_ref}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {(rating || review?.overall_rating) && <StarRating rating={rating ?? review?.overall_rating ?? null} />}
                  {(recommendation || review?.overall_recommendation) && (() => {
                    const r = recommendation ?? review?.overall_recommendation!;
                    const cfg = RECOMMENDATION_CONFIG[r];
                    const Icon = cfg.icon;
                    return (
                      <span className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${cfg.color} ${cfg.bg} ${cfg.border}`}>
                        <Icon className="w-3 h-3" />{cfg.label}
                      </span>
                    );
                  })()}
                  {(hasAnyScore || review?.eis_score) && (
                    <EISBadge score={review?.eis_score ?? currentEis} />
                  )}
                </div>
              </div>
              {isSubmitted && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <Lock className="w-3.5 h-3.5" />Review submitted and permanently locked.
                </div>
              )}
            </div>

            {/* Markdown content */}
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              {(content || review?.review_content) ? (
                <MarkdownContent content={content || review?.review_content || ''} />
              ) : (
                <p className="text-sm text-slate-400 italic">No review content yet.</p>
              )}
            </div>

            {/* Capability scores */}
            {(hasAnyScore || parseCapabilityScores(review?.capability_scores)) && (() => {
              const scores = hasAnyScore ? capScores : parseCapabilityScores(review?.capability_scores)!;
              const delta = deltaState?.delta ?? parseCapabilityDelta(review?.capability_delta);
              return (
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
                  <CapabilityScoreInput
                    dimensions={SCORE_DIMENSIONS}
                    scores={toScoreMap(scores)}
                    disabled
                    summaryLabel="Engineering Intelligence Score (EIS)"
                    showSummary
                  />
                  {delta && deltaState && (
                    <div className="pt-4 border-t border-slate-100">
                      <CapabilityDeltaGrid delta={delta} baselineRef={deltaState.session.session_ref}
                        currentEis={calculateEIS(scores)} baselineEis={deltaState.session.eis_score} />
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Observation flags */}
            {obFlags.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Observation Flags</p>
                {obFlags.map((f, i) => {
                  const cfg = OBSERVATION_FLAG_CONFIG[f.type];
                  return (
                    <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 border text-xs ${cfg.bg} ${cfg.border}`}>
                      <Flag className={`w-3 h-3 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                      <div>
                        <span className={`font-semibold ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-slate-600 ml-2">{f.note}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!isLocked && (
              <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                <button onClick={() => setMode('edit')} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-medium hover:bg-slate-50">
                  Edit Review
                </button>
                <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-medium hover:bg-slate-50">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy Markdown'}
                </button>
              </div>
            )}
            {isLocked && (
              <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-medium hover:bg-slate-50">
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy Review Markdown'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PO Decision Tab ──────────────────────────────────────────────────────────

function PODecisionTab({
  session, review, poDecision, onDecisionRecorded,
}: {
  session: BenchmarkSession; review: BenchmarkReview | null;
  poDecision: PODecision | null; onDecisionRecorded: (d: PODecision) => void;
}) {
  const canDecide = session.overall_review_status === 'awaiting_po_acceptance';
  const [decision, setDecision] = useState<PODecisionValue | null>(poDecision?.decision ?? null);
  const [productOwner, setProductOwner] = useState(poDecision?.product_owner ?? '');
  const [reason, setReason] = useState(poDecision?.reason ?? '');
  const [decisionSummary, setDecisionSummary] = useState(poDecision?.decision_summary ?? '');
  const [comments, setComments] = useState(poDecision?.comments ?? '');
  const [futureRecs, setFutureRecs] = useState(poDecision?.future_recommendations ?? '');
  const [poNotes, setPoNotes] = useState(poDecision?.po_notes ?? '');
  const [lockDecision, setLockDecision] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (poDecision) {
    const cfg = PO_DECISION_CONFIG[poDecision.decision];
    return (
      <div className="p-6 space-y-5">
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${cfg.bg} ${cfg.border}`}>
          <CheckCircle2 className={`w-5 h-5 flex-shrink-0 mt-0.5 ${cfg.color}`} />
          <div>
            <p className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</p>
            <p className="text-xs text-slate-600 mt-0.5">
              {poDecision.decision_ref} · {poDecision.product_owner ?? 'Unknown'} ·{' '}
              {new Date(poDecision.decision_date).toLocaleDateString('en-AU', { dateStyle: 'long' })}
            </p>
            {poDecision.locked_at && (
              <p className="text-xs text-slate-500 mt-0.5">
                Formally locked: {new Date(poDecision.locked_at).toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'short' })}
              </p>
            )}
          </div>
        </div>

        {/* Engineering Review reference */}
        {review && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Engineering Review Referenced</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono bg-white text-blue-800 border border-blue-200 px-2 py-0.5 rounded">{review.review_ref}</span>
              {review.overall_rating && <StarRating rating={review.overall_rating} />}
              {review.eis_score != null && <EISBadge score={review.eis_score} size="sm" />}
            </div>
            {review.review_title && <p className="text-xs text-blue-800 font-medium">{review.review_title}</p>}
          </div>
        )}

        <SectionField label="Decision Reason" value={poDecision.reason} />
        <SectionField label="Decision Summary" value={poDecision.decision_summary} />
        <SectionField label="Product Owner Comments" value={poDecision.comments} />
        <SectionField label="Future Recommendations" value={poDecision.future_recommendations} />
        <SectionField label="Product Owner Notes" value={poDecision.po_notes} />
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-600" />
          <p className="text-xs text-amber-700">This decision is permanently locked as a governance artefact.</p>
        </div>
      </div>
    );
  }

  if (!canDecide) {
    const isBeforeReview = ['awaiting_review', 'under_review', 'reviewed', 'review_complete'].includes(session.overall_review_status);
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-center max-w-xs">
          <Eye className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          {isBeforeReview ? (
            <><p className="text-sm font-medium text-slate-600">Engineering Review Required</p>
            <p className="text-xs text-slate-400 mt-1">The Engineering Review must be submitted before a Product Owner decision can be recorded.</p></>
          ) : (
            <><p className="text-sm font-medium text-slate-600">Decision Already Recorded</p>
            <p className="text-xs text-slate-400 mt-1">A Product Owner decision has been recorded for this session.</p></>
          )}
        </div>
      </div>
    );
  }

  const handleRecord = async () => {
    if (!decision) { setError('Please select a decision.'); return; }
    if (!productOwner.trim()) { setError('Product Owner name is required.'); return; }
    setSaving(true); setError(null);
    try {
      const recorded = await recordPODecision({
        session_id: session.id, review_id: review?.id, decision,
        product_owner: productOwner || undefined, comments: comments || undefined,
        reason: reason || undefined, decision_summary: decisionSummary || undefined,
        future_recommendations: futureRecs || undefined, po_notes: poNotes || undefined,
        lock_decision: lockDecision,
      });
      onDecisionRecorded(recorded);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record decision');
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Engineering review summary */}
      {review && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Engineering Review</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono bg-white text-blue-800 border border-blue-200 px-2 py-0.5 rounded">{review.review_ref}</span>
            {review.overall_rating && <StarRating rating={review.overall_rating} />}
            {review.eis_score != null && <EISBadge score={review.eis_score} size="sm" />}
            {review.overall_recommendation && (() => {
              const cfg = RECOMMENDATION_CONFIG[review.overall_recommendation];
              return <span className={`text-xs font-medium px-2 py-0.5 rounded border ${cfg.color} ${cfg.bg} ${cfg.border}`}>Recommend: {cfg.label}</span>;
            })()}
          </div>
          {review.review_title && <p className="text-xs text-blue-800 font-medium">{review.review_title}</p>}
        </div>
      )}

      <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-orange-600" />
        <p className="text-xs text-orange-700 font-medium">This decision will be permanently locked once recorded and cannot be reversed.</p>
      </div>

      {/* Decision selection */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-2">Product Owner Decision <span className="text-red-500">*</span></label>
        <div className="space-y-2">
          {(Object.keys(PO_DECISION_CONFIG) as PODecisionValue[]).map(d => {
            const cfg = PO_DECISION_CONFIG[d];
            const selected = decision === d;
            return (
              <button key={d} onClick={() => setDecision(d)}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${selected ? `${cfg.color} ${cfg.bg} ${cfg.border}` : 'text-slate-700 bg-white border-slate-200 hover:border-slate-300'}`}>
                <p className={`text-sm font-semibold ${selected ? cfg.color : 'text-slate-800'}`}>{cfg.label}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Product Owner */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Product Owner <span className="text-red-500">*</span></label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input type="text" value={productOwner} onChange={e => setProductOwner(e.target.value)} placeholder="Product Owner name (serves as signature)"
            className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {[
        { label: 'Decision Reason', value: reason, set: setReason, placeholder: 'Explain the rationale behind this decision...' },
        { label: 'Decision Summary', value: decisionSummary, set: setDecisionSummary, placeholder: 'Executive summary of the decision for governance records...' },
        { label: 'Product Owner Comments', value: comments, set: setComments, placeholder: 'Any observations, conditions, or notes accompanying this decision...' },
        { label: 'Future Recommendations', value: futureRecs, set: setFutureRecs, placeholder: 'Forward-looking recommendations for the next benchmark cycle...' },
        { label: 'Product Owner Notes (Private)', value: poNotes, set: setPoNotes, placeholder: 'Private notes not for the formal governance record...' },
      ].map(f => (
        <div key={f.label}>
          <label className="block text-xs font-semibold text-slate-600 mb-1">{f.label}</label>
          <textarea value={f.value} onChange={e => f.set(e.target.value)} rows={3} placeholder={f.placeholder}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
        </div>
      ))}

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-700">Decision Date</p>
          <p className="text-xs text-slate-500">{new Date().toLocaleDateString('en-AU', { dateStyle: 'long' })}</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={lockDecision} onChange={e => setLockDecision(e.target.checked)} className="w-4 h-4 accent-blue-600" />
          <span className="text-xs font-medium text-slate-600">Formally lock decision</span>
        </label>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      <div className="flex justify-end pt-2 border-t border-slate-100">
        <button onClick={handleRecord} disabled={saving || !decision}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 transition-colors">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
          {saving ? 'Recording...' : 'Record Decision'}
        </button>
      </div>
    </div>
  );
}

// ─── Governance Report Tab ────────────────────────────────────────────────────

function GovernanceReportTab({
  session, runs, review, poDecision,
}: {
  session: BenchmarkSession; runs: BenchmarkRun[];
  review: BenchmarkReview | null; poDecision: PODecision | null;
}) {
  const statusCfg = SESSION_STATUS_LABELS[session.overall_review_status] ?? SESSION_STATUS_LABELS.awaiting_review;
  const poDecisionCfg = poDecision ? PO_DECISION_CONFIG[poDecision.decision] : null;
  const capScores = parseCapabilityScores(review?.capability_scores);
  const capDelta = parseCapabilityDelta(review?.capability_delta);
  const obFlags = parseObservationFlags(review?.observation_flags);

  const handlePrint = () => {
    const formatDate = (d: string) => new Date(d).toLocaleDateString('en-AU', { dateStyle: 'long' });
    const runsHtml = runs.map(r => `
      <div class="run-item">
        <strong>${r.benchmark_id_code} — ${r.benchmark_name}</strong><br/>
        <small>${new Date(r.execution_timestamp).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}${r.model_used ? ` · ${r.model_used}` : ''}${r.provider_used ? ` (${r.provider_used})` : ''} · ${r.response_length.toLocaleString()} chars · LOCKED</small>
        <pre class="response-preview">${(r.ai_response ?? '').slice(0, 800)}${r.ai_response?.length > 800 ? '\n...[truncated]' : ''}</pre>
      </div>`).join('');

    const reviewHtml = review ? `
      <h2>Engineering Review</h2>
      <p><strong>${review.review_ref}</strong> · ${review.reviewer ?? ''} · ${review.review_date ? formatDate(review.review_date) : ''}</p>
      ${review.review_title ? `<p><em>${review.review_title}</em></p>` : ''}
      ${review.eis_score != null ? `<p><strong>EIS: ${review.eis_score.toFixed(1)} / 100</strong></p>` : ''}
      <div class="review-content">${(review.review_content ?? '').replace(/\n/g, '<br/>')}</div>
    ` : '<p><em>Engineering Review not yet submitted.</em></p>';

    const poHtml = poDecision ? `
      <h2>Product Owner Decision</h2>
      <p><strong>${poDecision.decision_ref}</strong> · ${poDecisionCfg?.label ?? poDecision.decision}</p>
      <p>Product Owner: ${poDecision.product_owner ?? 'Unknown'} · ${formatDate(poDecision.decision_date)}</p>
      ${poDecision.reason ? `<p><strong>Reason:</strong> ${poDecision.reason}</p>` : ''}
      ${poDecision.decision_summary ? `<p><strong>Summary:</strong> ${poDecision.decision_summary}</p>` : ''}
      ${poDecision.comments ? `<p><strong>Comments:</strong> ${poDecision.comments}</p>` : ''}
      ${poDecision.future_recommendations ? `<p><strong>Future Recommendations:</strong> ${poDecision.future_recommendations}</p>` : ''}
      ${poDecision.locked_at ? `<p><small>Formally locked: ${new Date(poDecision.locked_at).toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'short' })}</small></p>` : ''}
    ` : '<p><em>Product Owner decision not yet recorded.</em></p>';

    const html = `<!DOCTYPE html>
<html>
<head>
<title>Governance Report — ${session.session_ref}</title>
<style>
  body { font-family: system-ui, sans-serif; font-size: 12px; color: #1e293b; max-width: 900px; margin: 0 auto; padding: 40px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 14px; margin-top: 32px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .meta { color: #64748b; font-size: 11px; margin-bottom: 24px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #f1f5f9; color: #475569; margin: 2px; }
  .run-item { margin-bottom: 16px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
  .response-preview { font-family: monospace; font-size: 10px; background: #0f172a; color: #86efac; padding: 12px; border-radius: 6px; overflow: hidden; white-space: pre-wrap; max-height: 200px; overflow-y: hidden; }
  .review-content { white-space: pre-wrap; line-height: 1.6; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
<h1>Benchmark Governance Report</h1>
<div class="meta">
  <span class="badge">${session.session_ref}</span>
  ${session.is_baseline ? '<span class="badge">Baseline</span>' : ''}
  ${session.benchmark_milestone ? `<span class="badge">${session.benchmark_milestone.replace(/_/g, ' ')}</span>` : ''}
  <span class="badge">${statusCfg.label}</span>
  ${review?.eis_score != null ? `<span class="badge">EIS ${review.eis_score.toFixed(1)}</span>` : ''}
</div>
<p><strong>Session:</strong> ${session.session_name}</p>
<p><strong>Created:</strong> ${formatDate(session.created_at)} · <strong>Benchmarks:</strong> ${session.benchmarks_count} of 3</p>
${session.atd_version ? `<p><strong>ATD Version:</strong> ${session.atd_version}</p>` : ''}
${session.ecc_version ? `<p><strong>ECC Version:</strong> ${session.ecc_version}</p>` : ''}
<h2>AI Technical Director Responses</h2>
${runsHtml}
${reviewHtml}
${poHtml}
<p class="meta" style="margin-top:40px; border-top:1px solid #e2e8f0; padding-top:16px;">
  Generated: ${new Date().toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'short' })} — Permanent governance artefact. Immutable.
</p>
<script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">Governance Report</p>
          <p className="text-xs text-slate-400 mt-0.5">Complete, permanent, printable artefact for {session.session_ref}.</p>
        </div>
        <button onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
          <Printer className="w-4 h-4" />View / Print
        </button>
      </div>

      {/* Lifecycle */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Benchmark Lifecycle</p>
        <div className="flex items-center gap-2 flex-wrap">
          {[
            { label: 'Captured', done: session.benchmarks_count > 0 },
            { label: 'Engineering Review', done: ['awaiting_po_acceptance','accepted','accepted_with_observations','returned_for_improvement'].includes(session.overall_review_status) },
            { label: 'PO Decision', done: ['accepted','accepted_with_observations','returned_for_improvement'].includes(session.overall_review_status) },
          ].map((step, i, arr) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${step.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {step.done ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}{step.label}
              </div>
              {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300" />}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 pt-3 border-t border-slate-100 flex-wrap">
          <StatusBadge status={session.overall_review_status} />
          {review?.eis_score != null && <EISBadge score={review.eis_score} size="sm" />}
          {session.benchmark_milestone && (
            <span className="flex items-center gap-1 text-xs bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded font-medium capitalize">
              <Target className="w-2.5 h-2.5" />{session.benchmark_milestone.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      </div>

      {/* Session metadata */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Session Details</p>
        {[
          { k: 'Session Reference', v: session.session_ref },
          { k: 'Session Name', v: session.session_name },
          { k: 'Created', v: new Date(session.created_at).toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'short' }) },
          { k: 'Benchmarks Captured', v: `${session.benchmarks_count} of 3` },
          session.atd_version ? { k: 'ATD Version', v: session.atd_version } : null,
          session.ecc_version ? { k: 'ECC Version', v: session.ecc_version } : null,
        ].filter(Boolean).map(row => {
          const r = row as { k: string; v: string };
          return (
            <div key={r.k} className="flex justify-between text-sm">
              <dt className="text-slate-500">{r.k}</dt>
              <dd className="font-medium text-slate-800">{r.v}</dd>
            </div>
          );
        })}
      </div>

      {/* Version refs */}
      {(session.platform_state_id || session.pis_snapshot_id || session.context_package_id) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-2">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Platform Version References</p>
          {session.platform_state_id && <div className="flex justify-between text-xs"><dt className="text-blue-700">Platform State</dt><dd className="font-mono text-blue-900">{session.platform_state_id}</dd></div>}
          {session.pis_snapshot_id && <div className="flex justify-between text-xs"><dt className="text-blue-700">PIS Snapshot</dt><dd className="font-mono text-blue-900">{session.pis_snapshot_id}</dd></div>}
          {session.context_package_id && <div className="flex justify-between text-xs"><dt className="text-blue-700">Context Package</dt><dd className="font-mono text-blue-900">{session.context_package_id}</dd></div>}
        </div>
      )}

      {/* AI Responses */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AI Technical Director Responses</p>
        {runs.map(run => (
          <div key={run.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs font-mono text-slate-500">{run.benchmark_id_code}</span>
              <span className="text-sm text-slate-700">{run.benchmark_name}</span>
              <Lock className="w-3 h-3 text-slate-300" />
            </div>
            <span className="text-xs text-slate-400">{run.response_length.toLocaleString()} chars</span>
          </div>
        ))}
      </div>

      {/* Engineering Review summary */}
      {review ? (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Engineering Review</p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{review.review_ref}</span>
            {review.overall_rating && <StarRating rating={review.overall_rating} />}
            {review.eis_score != null && <EISBadge score={review.eis_score} size="sm" />}
            {review.overall_recommendation && (() => {
              const cfg = RECOMMENDATION_CONFIG[review.overall_recommendation];
              return <span className={`text-xs font-medium px-2 py-0.5 rounded border ${cfg.color} ${cfg.bg} ${cfg.border}`}>{cfg.label}</span>;
            })()}
          </div>
          {review.review_title && <p className="text-sm font-semibold text-slate-700">{review.review_title}</p>}
          <dl className="space-y-1.5">
            {review.reviewer && <div className="flex justify-between text-sm"><dt className="text-slate-500">Reviewer</dt><dd className="font-medium text-slate-800">{review.reviewer}</dd></div>}
            {review.review_date && <div className="flex justify-between text-sm"><dt className="text-slate-500">Review Date</dt><dd className="font-medium text-slate-800">{new Date(review.review_date).toLocaleDateString('en-AU', { dateStyle: 'long' })}</dd></div>}
          </dl>
          {capScores && Object.values(capScores).some(v => v > 0) && (
            <div className="pt-3 border-t border-slate-100">
              <CapabilityScoreInput
                dimensions={SCORE_DIMENSIONS}
                scores={toScoreMap(capScores)}
                disabled
                summaryLabel="Engineering Intelligence Score (EIS)"
                showSummary
              />
            </div>
          )}
          {capDelta && review.compared_session_id && (
            <div className="pt-3 border-t border-slate-100">
              <CapabilityDeltaGrid delta={capDelta} baselineRef="previous session"
                currentEis={capScores ? calculateEIS(capScores) : 0} baselineEis={null} />
            </div>
          )}
          {obFlags.length > 0 && (
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <p className="text-xs font-semibold text-slate-500">Observation Flags</p>
              {obFlags.map((f, i) => {
                const cfg = OBSERVATION_FLAG_CONFIG[f.type];
                return (
                  <div key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 border text-xs ${cfg.bg} ${cfg.border}`}>
                    <Flag className={`w-3 h-3 mt-0.5 ${cfg.color}`} /><span className={`font-semibold ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-slate-600">{f.note}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-5 text-center">
          <FileText className="w-6 h-6 text-slate-300 mx-auto mb-1" />
          <p className="text-sm text-slate-500">Engineering Review not yet submitted.</p>
        </div>
      )}

      {/* PO Decision */}
      {poDecision ? (
        <div className={`rounded-xl border p-5 space-y-3 ${poDecisionCfg?.bg ?? 'bg-white'} ${poDecisionCfg?.border ?? 'border-slate-200'}`}>
          <p className={`text-xs font-semibold uppercase tracking-wider ${poDecisionCfg?.color ?? 'text-slate-400'}`}>Product Owner Decision</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono bg-white/60 text-slate-600 px-2 py-0.5 rounded border border-white/80">{poDecision.decision_ref}</span>
            <span className={`text-sm font-bold ${poDecisionCfg?.color ?? 'text-slate-800'}`}>{poDecisionCfg?.label}</span>
            {poDecision.locked_at && <span className="flex items-center gap-1 text-xs text-slate-500"><Lock className="w-3 h-3" />Locked</span>}
          </div>
          <dl className="space-y-1.5">
            {poDecision.product_owner && <div className="flex justify-between text-sm"><dt className="text-slate-500">Product Owner</dt><dd className="font-medium text-slate-800">{poDecision.product_owner}</dd></div>}
            <div className="flex justify-between text-sm"><dt className="text-slate-500">Decision Date</dt><dd className="font-medium text-slate-800">{new Date(poDecision.decision_date).toLocaleDateString('en-AU', { dateStyle: 'long' })}</dd></div>
          </dl>
          {poDecision.reason && <div className="pt-2 border-t border-black/5"><p className="text-xs font-semibold text-slate-500 mb-1">Reason</p><p className="text-sm text-slate-700 leading-relaxed">{poDecision.reason}</p></div>}
          {poDecision.decision_summary && <div className="pt-2 border-t border-black/5"><p className="text-xs font-semibold text-slate-500 mb-1">Decision Summary</p><p className="text-sm text-slate-700 leading-relaxed">{poDecision.decision_summary}</p></div>}
          {poDecision.comments && <div className="pt-2 border-t border-black/5"><p className="text-xs font-semibold text-slate-500 mb-1">Comments</p><p className="text-sm text-slate-700 leading-relaxed">{poDecision.comments}</p></div>}
          {poDecision.future_recommendations && <div className="pt-2 border-t border-black/5"><p className="text-xs font-semibold text-slate-500 mb-1">Future Recommendations</p><p className="text-sm text-slate-700 leading-relaxed">{poDecision.future_recommendations}</p></div>}
        </div>
      ) : (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-5 text-center">
          <Shield className="w-6 h-6 text-slate-300 mx-auto mb-1" />
          <p className="text-sm text-slate-500">Product Owner decision not yet recorded.</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface ECCBenchmarkReviewPanelProps {
  session: BenchmarkSession;
  onClose: () => void;
  onSessionUpdated: (session: BenchmarkSession) => void;
}

export function ECCBenchmarkReviewPanel({ session: initialSession, onClose, onSessionUpdated }: ECCBenchmarkReviewPanelProps) {
  const [session, setSession] = useState(initialSession);
  const [activeTab, setActiveTab] = useState<PanelTab>('responses');
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [review, setReview] = useState<BenchmarkReview | null>(null);
  const [poDecision, setPODecision] = useState<PODecision | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [runsData, reviewData, poData] = await Promise.all([
        loadBenchmarkRuns(session.id),
        loadReviewForSession(session.id),
        loadPODecisionForSession(session.id),
      ]);
      setRuns(runsData);
      setReview(reviewData);
      setPODecision(poData);
    } finally { setLoading(false); }
  }, [session.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleReviewSaved = useCallback((r: BenchmarkReview) => {
    setReview(r);
    if (r.review_status === 'submitted') {
      const updated = { ...session, overall_review_status: 'awaiting_po_acceptance' as const, review_id: r.id };
      setSession(updated);
      onSessionUpdated(updated);
    }
  }, [session, onSessionUpdated]);

  const handlePODecisionRecorded = useCallback((d: PODecision) => {
    setPODecision(d);
    const updated = { ...session, overall_review_status: d.decision as typeof session.overall_review_status, po_decision_id: d.id, benchmark_outcome: d.decision };
    setSession(updated);
    onSessionUpdated(updated);
    setActiveTab('governance');
  }, [session, onSessionUpdated]);

  const statusCfg = SESSION_STATUS_LABELS[session.overall_review_status] ?? SESSION_STATUS_LABELS.awaiting_review;

  const TABS: { key: PanelTab; label: string; icon: typeof FileText; badge?: number | string }[] = [
    { key: 'responses',  label: 'AI Responses',        icon: BarChart3,  badge: runs.length },
    { key: 'review',     label: 'Engineering Review',  icon: FileText,   badge: review ? (review.review_status === 'submitted' || review.review_status === 'finalised' ? '✓' : 'Draft') : undefined },
    { key: 'po-decision',label: 'PO Decision',         icon: Shield,     badge: poDecision ? '✓' : undefined },
    { key: 'governance', label: 'Governance Report',   icon: Eye },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-stretch justify-end" onClick={onClose}>
      <div className="bg-slate-50 w-full max-w-3xl flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-mono font-bold text-slate-500">{session.session_ref}</span>
                {session.is_baseline && (
                  <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                    <Star className="w-2.5 h-2.5" />Baseline
                  </span>
                )}
                {session.benchmark_milestone && (
                  <span className="flex items-center gap-1 text-xs bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded font-medium capitalize">
                    <Target className="w-2.5 h-2.5" />{session.benchmark_milestone.replace(/_/g, ' ')}
                  </span>
                )}
                <StatusBadge status={session.overall_review_status} />
                {review?.eis_score != null && <EISBadge score={review.eis_score} size="sm" />}
              </div>
              <p className="text-base font-bold text-slate-900 truncate">{session.session_name}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {new Date(session.created_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                {session.atd_version && ` · ATD ${session.atd_version}`}
                {session.ecc_version && ` · ECC ${session.ecc_version}`}
              </p>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-1 mt-4 -mb-4 overflow-x-auto">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 whitespace-nowrap transition-colors ${
                    activeTab === t.key ? 'text-slate-900 border-slate-900 bg-slate-50/50' : 'text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300'
                  }`}>
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                  {t.badge !== undefined && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${activeTab === t.key ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-500'}`}>
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
          ) : (
            <>
              {activeTab === 'responses'   && <ResponsesTab runs={runs} />}
              {activeTab === 'review'      && <EngineeringReviewTab session={session} review={review} onReviewSaved={handleReviewSaved} />}
              {activeTab === 'po-decision' && <PODecisionTab session={session} review={review} poDecision={poDecision} onDecisionRecorded={handlePODecisionRecorded} />}
              {activeTab === 'governance'  && <GovernanceReportTab session={session} runs={runs} review={review} poDecision={poDecision} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
