/**
 * ATD Stage Execution Modals — EWO-011.8
 *
 * AI-assisted modals for Engineering Analysis and Engineering Planning.
 * ATD automatically generates a draft before the form opens; the Product Owner
 * reviews, optionally edits, then approves. Original AI draft is preserved for
 * learning.
 */

import React, { useState, useEffect } from 'react';
import {
  X, Loader2, AlertCircle, Microscope, FileText, ChevronDown,
  Sparkles, RefreshCw, CheckCircle2, ChevronRight, BookOpen,
} from 'lucide-react';
import { ATDCognitiveEngine } from '../../lib/atdCognitiveEngine';
import type { EngineeringAnalysis, EngineeringPlan, PipelineStage } from '../../lib/atdCognitiveEngine';
import { STAGE_REGISTRY } from '../../lib/pipelineRecommendationEngine';
import {
  EngineeringDraftService,
  type AnalysisDraft,
  type PlanDraft,
  type DraftEvidenceItem,
} from '../../lib/engineeringDraftService';

// ─── Shared ───────────────────────────────────────────────────────────────────

function ModalShell({
  title,
  subtitle,
  icon: Icon,
  iconColour,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  icon: typeof FileText;
  iconColour: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/60 p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${iconColour}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{title}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      {children}
    </div>
  );
}

const inputClass = 'w-full text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 placeholder:text-slate-300';
const textareaClass = `${inputClass} resize-none`;

// ─── AI Generation Loading Screen ─────────────────────────────────────────────

function AIGeneratingScreen({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-4">
      <div className="relative">
        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-blue-500" />
        </div>
        <Loader2 className="w-14 h-14 text-blue-300 animate-spin absolute -inset-1" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-400 mt-1">Analysing intent, constitution, knowledge base…</p>
      </div>
    </div>
  );
}

// ─── Confidence Badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({
  score,
  explanation,
}: {
  score: AnalysisDraft['confidence_score'];
  explanation: string;
}) {
  const { label, colour, bg } = EngineeringDraftService.confidenceDisplay(score);
  const [showExplanation, setShowExplanation] = useState(false);

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${bg}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className={`w-4 h-4 ${colour}`} />
          <span className={`text-xs font-semibold ${colour}`}>{label}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowExplanation(v => !v)}
          className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-0.5"
        >
          Why?
          <ChevronRight className={`w-3 h-3 transition-transform ${showExplanation ? 'rotate-90' : ''}`} />
        </button>
      </div>
      {showExplanation && (
        <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">{explanation}</p>
      )}
    </div>
  );
}

// ─── Evidence Panel ───────────────────────────────────────────────────────────

function EvidencePanel({ evidence }: { evidence: DraftEvidenceItem[] }) {
  const [open, setOpen] = useState(false);
  if (evidence.length === 0) return null;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-600">
            Supporting Evidence ({evidence.length})
          </span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="divide-y divide-slate-100">
          {evidence.map((item, i) => {
            const { label, colour } = EngineeringDraftService.evidenceTypeDisplay(item.type);
            return (
              <li key={i} className="px-3 py-2.5 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${colour}`}>{label}</span>
                  <span className="text-[10px] text-slate-400">{item.ref}</span>
                </div>
                <p className="text-xs font-medium text-slate-700">{item.title}</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">{item.relevance}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── AI Banner ────────────────────────────────────────────────────────────────

function AIBanner({
  onRegenerate,
  regenerating,
  generationCount,
}: {
  onRegenerate: () => void;
  regenerating: boolean;
  generationCount: number;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        <span className="text-xs text-blue-700">
          AI-generated draft{generationCount > 1 ? ` (regenerated ${generationCount - 1}×)` : ''}. Review and edit before approving.
        </span>
      </div>
      <button
        type="button"
        onClick={onRegenerate}
        disabled={regenerating}
        className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50 shrink-0 ml-2"
      >
        <RefreshCw className={`w-3 h-3 ${regenerating ? 'animate-spin' : ''}`} />
        Regenerate
      </button>
    </div>
  );
}

// ─── Run Analysis Modal ───────────────────────────────────────────────────────

interface RunAnalysisModalProps {
  intentId: string;
  pipelineExecutionId: string;
  onClose: () => void;
  onComplete: (analysis: EngineeringAnalysis) => void;
}

export function RunAnalysisModal({
  intentId,
  pipelineExecutionId,
  onClose,
  onComplete,
}: RunAnalysisModalProps) {
  const [draft, setDraft] = useState<AnalysisDraft | null>(null);
  const [generationCount, setGenerationCount] = useState(0);
  const [generating, setGenerating] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [summary, setSummary] = useState('');
  const [complexity, setComplexity] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [constitutionReview, setConstitutionReview] = useState('');
  const [architectureNotes, setArchitectureNotes] = useState('');
  const [productIntelligenceNotes, setProductIntelligenceNotes] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const applyDraft = (d: AnalysisDraft) => {
    setDraft(d);
    setSummary(d.summary);
    setComplexity(d.complexity_assessment);
    setConstitutionReview(d.constitution_review);
    setArchitectureNotes(d.architecture_notes);
    setProductIntelligenceNotes(d.product_intelligence_notes);
    if (d.constitution_review || d.architecture_notes || d.product_intelligence_notes) {
      setAdvancedOpen(true);
    }
  };

  const generateDraft = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const d = await EngineeringDraftService.generateAnalysisDraft(intentId);
      applyDraft(d);
      setGenerationCount(c => c + 1);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate AI draft.');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => { generateDraft(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegenerate = async () => {
    setRegenerating(true);
    setGenerateError(null);
    try {
      const d = await EngineeringDraftService.generateAnalysisDraft(intentId);
      applyDraft(d);
      setGenerationCount(c => c + 1);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to regenerate AI draft.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) { setSubmitError('Analysis summary is required.'); return; }
    setSubmitError(null);
    setSubmitting(true);

    const poEditsMade = draft
      ? EngineeringDraftService.detectEdits(draft, {
          summary,
          constitution_review: constitutionReview,
          architecture_notes: architectureNotes,
          product_intelligence_notes: productIntelligenceNotes,
          complexity_assessment: complexity,
        })
      : false;

    try {
      const analysis = await ATDCognitiveEngine.runAnalysis({
        intent_id: intentId,
        pipeline_execution_id: pipelineExecutionId,
        summary: summary.trim(),
        complexity_assessment: complexity,
        constitution_review: constitutionReview.trim() || undefined,
        architecture_notes: architectureNotes.trim() || undefined,
        product_intelligence_notes: productIntelligenceNotes.trim() || undefined,
        // AI draft learning capture
        ai_draft_summary: draft?.summary,
        ai_draft_constitution_review: draft?.constitution_review,
        ai_draft_architecture_notes: draft?.architecture_notes,
        ai_draft_product_intelligence_notes: draft?.product_intelligence_notes,
        ai_draft_complexity_assessment: draft?.complexity_assessment,
        ai_confidence_score: draft?.confidence_score,
        ai_confidence_explanation: draft?.confidence_explanation,
        ai_evidence: draft?.evidence,
        ai_generated_at: draft?.generated_at,
        po_edits_made: poEditsMade,
        original_ai_draft: draft ? JSON.parse(JSON.stringify(draft)) : undefined,
        generation_count: generationCount,
      });
      onComplete(analysis);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Engineering Analysis failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      title="Engineering Analysis"
      subtitle="Review the AI-generated analysis, edit as needed, then approve."
      icon={Microscope}
      iconColour="bg-blue-50 text-blue-600"
      onClose={onClose}
    >
      {generating ? (
        <AIGeneratingScreen label="Generating Engineering Analysis…" />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto px-6 py-5 space-y-5">

            {generateError && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-amber-700">{generateError}</p>
                  <p className="text-[11px] text-amber-500 mt-0.5">You can still complete the analysis manually below.</p>
                </div>
              </div>
            )}

            {draft && (
              <AIBanner
                onRegenerate={handleRegenerate}
                regenerating={regenerating}
                generationCount={generationCount}
              />
            )}

            {draft && (
              <ConfidenceBadge
                score={draft.confidence_score}
                explanation={draft.confidence_explanation}
              />
            )}

            <FormField label="Analysis Summary" required hint="Summarise your review of this Engineering Intent.">
              <textarea
                className={textareaClass}
                rows={4}
                placeholder="This intent proposes… The key engineering considerations are…"
                value={summary}
                onChange={e => setSummary(e.target.value)}
                disabled={submitting || regenerating}
              />
            </FormField>

            <FormField label="Complexity Assessment" required>
              <select
                className={inputClass}
                value={complexity}
                onChange={e => setComplexity(e.target.value as typeof complexity)}
                disabled={submitting || regenerating}
              >
                <option value="low">Low — straightforward, well-understood domain</option>
                <option value="medium">Medium — some unknowns, moderate coordination required</option>
                <option value="high">High — significant unknowns, cross-cutting concerns</option>
                <option value="critical">Critical — systemic impact, requires Architecture Review Board</option>
              </select>
            </FormField>

            <div>
              <button
                type="button"
                onClick={() => setAdvancedOpen(v => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                Optional fields
              </button>

              {advancedOpen && (
                <div className="mt-4 space-y-5">
                  <FormField label="Constitution Review Notes" hint="How does this intent align with the Engineering Constitution?">
                    <textarea
                      className={textareaClass}
                      rows={3}
                      placeholder="Aligns with constitutional principle C-004…"
                      value={constitutionReview}
                      onChange={e => setConstitutionReview(e.target.value)}
                      disabled={submitting || regenerating}
                    />
                  </FormField>

                  <FormField label="Architecture Notes" hint="Any architectural considerations, patterns, or concerns.">
                    <textarea
                      className={textareaClass}
                      rows={3}
                      placeholder="This will require changes to the data layer…"
                      value={architectureNotes}
                      onChange={e => setArchitectureNotes(e.target.value)}
                      disabled={submitting || regenerating}
                    />
                  </FormField>

                  <FormField label="Product Intelligence Notes" hint="Relevant product context, market signals, or stakeholder needs.">
                    <textarea
                      className={textareaClass}
                      rows={2}
                      placeholder="Users have requested similar functionality in…"
                      value={productIntelligenceNotes}
                      onChange={e => setProductIntelligenceNotes(e.target.value)}
                      disabled={submitting || regenerating}
                    />
                  </FormField>
                </div>
              )}
            </div>

            {draft && draft.evidence.length > 0 && (
              <EvidencePanel evidence={draft.evidence} />
            )}

            {submitError && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700">{submitError}</p>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || regenerating || !summary.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Approving…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Approve Engineering Analysis
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}

// ─── Run Planning Modal ───────────────────────────────────────────────────────

interface RunPlanningModalProps {
  intentId: string;
  analysisId: string;
  pipelineExecutionId: string;
  onClose: () => void;
  onComplete: (plan: EngineeringPlan) => void;
}

export function RunPlanningModal({
  intentId,
  analysisId,
  pipelineExecutionId,
  onClose,
  onComplete,
}: RunPlanningModalProps) {
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [generationCount, setGenerationCount] = useState(0);
  const [generating, setGenerating] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [executiveSummary, setExecutiveSummary] = useState('');
  const [strategy, setStrategy] = useState('');
  const [approach, setApproach] = useState('');
  const [effort, setEffort] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const applyDraft = (d: PlanDraft) => {
    setDraft(d);
    setExecutiveSummary(d.executive_summary);
    setStrategy(d.engineering_strategy);
    setApproach(d.recommended_approach);
    setEffort(d.estimated_effort);
    if (d.engineering_strategy || d.recommended_approach || d.estimated_effort) {
      setAdvancedOpen(true);
    }
  };

  const generateDraft = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const d = await EngineeringDraftService.generatePlanDraft(intentId, analysisId);
      applyDraft(d);
      setGenerationCount(c => c + 1);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate AI draft.');
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => { generateDraft(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRegenerate = async () => {
    setRegenerating(true);
    setGenerateError(null);
    try {
      const d = await EngineeringDraftService.generatePlanDraft(intentId, analysisId);
      applyDraft(d);
      setGenerationCount(c => c + 1);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to regenerate AI draft.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!executiveSummary.trim()) { setSubmitError('Executive summary is required.'); return; }
    setSubmitError(null);
    setSubmitting(true);

    const poEditsMade = draft
      ? EngineeringDraftService.detectPlanEdits(draft, {
          executive_summary: executiveSummary,
          engineering_strategy: strategy,
          recommended_approach: approach,
          estimated_effort: effort,
        })
      : false;

    try {
      const plan = await ATDCognitiveEngine.generatePlan({
        intent_id: intentId,
        analysis_id: analysisId,
        pipeline_execution_id: pipelineExecutionId,
        executive_summary: executiveSummary.trim(),
        engineering_strategy: strategy.trim() || undefined,
        recommended_approach: approach.trim() || undefined,
        estimated_effort: effort.trim() || undefined,
        // AI draft learning capture
        ai_draft_executive_summary: draft?.executive_summary,
        ai_draft_engineering_strategy: draft?.engineering_strategy,
        ai_draft_recommended_approach: draft?.recommended_approach,
        ai_draft_estimated_effort: draft?.estimated_effort,
        ai_confidence_score: draft?.confidence_score,
        ai_confidence_explanation: draft?.confidence_explanation,
        ai_evidence: draft?.evidence,
        ai_generated_at: draft?.generated_at,
        po_edits_made: poEditsMade,
        original_ai_draft: draft ? JSON.parse(JSON.stringify(draft)) : undefined,
        generation_count: generationCount,
      });
      onComplete(plan);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Engineering Planning failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      title="Engineering Planning"
      subtitle="Review the AI-generated plan, edit as needed, then approve."
      icon={FileText}
      iconColour="bg-emerald-50 text-emerald-600"
      onClose={onClose}
    >
      {generating ? (
        <AIGeneratingScreen label="Generating Engineering Plan…" />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto px-6 py-5 space-y-5">

            {generateError && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-amber-700">{generateError}</p>
                  <p className="text-[11px] text-amber-500 mt-0.5">You can still complete the plan manually below.</p>
                </div>
              </div>
            )}

            {draft && (
              <AIBanner
                onRegenerate={handleRegenerate}
                regenerating={regenerating}
                generationCount={generationCount}
              />
            )}

            {draft && (
              <ConfidenceBadge
                score={draft.confidence_score}
                explanation={draft.confidence_explanation}
              />
            )}

            <FormField label="Executive Summary" required hint="A concise summary of the engineering plan.">
              <textarea
                className={textareaClass}
                rows={4}
                placeholder="This plan delivers… through a phased approach that…"
                value={executiveSummary}
                onChange={e => setExecutiveSummary(e.target.value)}
                disabled={submitting || regenerating}
              />
            </FormField>

            <div>
              <button
                type="button"
                onClick={() => setAdvancedOpen(v => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                Optional fields
              </button>

              {advancedOpen && (
                <div className="mt-4 space-y-5">
                  <FormField label="Engineering Strategy" hint="The overall technical strategy for this work.">
                    <textarea
                      className={textareaClass}
                      rows={3}
                      placeholder="Incremental delivery using feature flags to…"
                      value={strategy}
                      onChange={e => setStrategy(e.target.value)}
                      disabled={submitting || regenerating}
                    />
                  </FormField>

                  <FormField label="Recommended Approach" hint="The specific technical approach and tooling.">
                    <textarea
                      className={textareaClass}
                      rows={3}
                      placeholder="Implement using React with Supabase real-time subscriptions…"
                      value={approach}
                      onChange={e => setApproach(e.target.value)}
                      disabled={submitting || regenerating}
                    />
                  </FormField>

                  <FormField label="Estimated Effort" hint="e.g. 2–3 weeks, 40 hours, 3 sprints">
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="2–3 weeks"
                      value={effort}
                      onChange={e => setEffort(e.target.value)}
                      disabled={submitting || regenerating}
                    />
                  </FormField>
                </div>
              )}
            </div>

            {draft && draft.evidence.length > 0 && (
              <EvidencePanel evidence={draft.evidence} />
            )}

            {submitError && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700">{submitError}</p>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || regenerating || !executiveSummary.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Approving…
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Approve Engineering Plan
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}

// ─── Stage Explainer Panel ────────────────────────────────────────────────────

export function StageExplainerPanel({
  stage,
  onClose,
}: {
  stage: PipelineStage;
  onClose: () => void;
}) {
  const config = STAGE_REGISTRY[stage];

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <p className="text-sm font-bold text-slate-800">{config.shortLabel}</p>
        <button onClick={onClose} className="p-0.5 text-slate-400 hover:text-slate-600">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-xs text-slate-600">{config.purpose}</p>
      {config.prerequisites.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Prerequisites</p>
          <ul className="space-y-0.5">
            {config.prerequisites.map((p: string) => (
              <li key={p} className="text-xs text-slate-500 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
      {config.expectedOutputs.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Expected Outputs</p>
          <ul className="space-y-0.5">
            {config.expectedOutputs.map((o: string) => (
              <li key={o} className="text-xs text-slate-500 flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                {o}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
