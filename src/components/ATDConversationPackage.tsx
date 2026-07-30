/**
 * ATD Conversation Package — EWO-011.8.1 / EWO-011.8.2
 *
 * Inline Engineering Package rendered directly in the ATD conversation.
 * Shows the full intent → analysis → plan → execution pipeline.
 * Approve / Edit / Regenerate / Execute / View Workspace — all inline.
 *
 * Architecture: purely presentational. All orchestration logic lives in
 * engineeringOrchestrator.ts. The parent passes all callbacks.
 */

import { useState } from 'react';
import {
  Brain, ChevronDown, ChevronUp, CheckCircle2, Clock, Loader2,
  AlertTriangle, RefreshCw, ArrowRight, FileText, BarChart2,
  Layers, Sparkles, BookOpen, Shield, GitBranch, Target,
  Edit3, Check, X, Info, Award, Zap, Play, Database,
  Package, Server, Eye, ExternalLink,
} from 'lucide-react';
import type { EngineeringIntent, EngineeringAnalysis, EngineeringPlan } from '../lib/atdCognitiveEngine';
import type { AnalysisDraft, PlanDraft } from '../lib/engineeringDraftService';
import { EngineeringDraftService } from '../lib/engineeringDraftService';
import type {
  OrchestrationStatus,
  ExecutionPreparationStep,
  ConversationExecutionResult,
} from '../lib/engineeringOrchestrator';
import type { DuplicateIntelligenceResult } from '../lib/duplicateIntelligenceService';
import type { ExecutionPipelineStage } from '../pages/ecc/ECCIdeaTypes';
import { navigateToIntent } from '../lib/conversationIntentBridge';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ATDConversationPackageProps {
  status: OrchestrationStatus;
  intent: EngineeringIntent | null;
  analysisDraft: AnalysisDraft | null;
  planDraft: PlanDraft | null;
  analysis: EngineeringAnalysis | null;
  plan: EngineeringPlan | null;
  duplicateResult: DuplicateIntelligenceResult | null;
  errorMessage: string | null;
  // EWO-011.8.2: Execution state
  executionPreparationSteps: ExecutionPreparationStep[] | null;
  executionPipeline: ExecutionPipelineStage[] | null;
  executionResult: ConversationExecutionResult | null;
  // Duplicate decision handlers
  onDuplicateProceed: () => void;
  onDuplicateContinueExisting: (intentId: string) => void;
  // Analysis approval
  onApproveAnalysis: (approved: ApprovedAnalysis) => void;
  onRegenerateAnalysis: () => void;
  // Plan approval
  onApprovePlan: (approved: ApprovedPlan) => void;
  onRegeneratePlan: () => void;
  // EWO-011.8.2: Execution
  onPrepareExecution: () => void;
  onExecute: () => void;
  onCreateAnother: () => void;
}

export interface ApprovedAnalysis {
  summary: string;
  complexity: 'low' | 'medium' | 'high' | 'critical';
  constitution_review: string;
  architecture_notes: string;
  product_intelligence_notes: string;
}

export interface ApprovedPlan {
  executive_summary: string;
  engineering_strategy: string;
  recommended_approach: string;
  estimated_effort: string;
}

// ─── Complexity config ────────────────────────────────────────────────────────

const COMPLEXITY_CFG = {
  low:      { label: 'Low',      bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  medium:   { label: 'Medium',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  high:     { label: 'High',     bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
  critical: { label: 'Critical', bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' },
};

// ─── Status progress indicator ─────────────────────────────────────────────────

function PipelineProgress({ status }: { status: OrchestrationStatus }) {
  const stages = [
    { key: 'duplicate_check',            label: 'Duplicate Check' },
    { key: 'creating_intent',            label: 'Intent' },
    { key: 'awaiting_analysis_approval', label: 'Analysis' },
    { key: 'awaiting_plan_approval',     label: 'Plan' },
    { key: 'awaiting_execution',         label: 'Execute' },
    { key: 'complete',                   label: 'Complete' },
  ];

  const statusOrder: OrchestrationStatus[] = [
    'idle', 'assessing', 'duplicate_check', 'duplicate_found',
    'creating_intent', 'generating_analysis', 'awaiting_analysis_approval',
    'generating_plan', 'awaiting_plan_approval',
    'preparing_execution', 'awaiting_execution', 'executing', 'complete',
  ];
  const currentIdx = statusOrder.indexOf(status);

  return (
    <div className="flex items-center gap-0 overflow-x-auto py-1">
      {stages.map((stage, i) => {
        const stageIdx = statusOrder.indexOf(stage.key as OrchestrationStatus);
        const isActive  = status === stage.key ||
          (stage.key === 'awaiting_execution' && (status === 'preparing_execution' || status === 'executing'));
        const isDone    = currentIdx > stageIdx && status !== 'error';
        const isPending = !isActive && !isDone;
        return (
          <div key={stage.key} className="flex items-center">
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all ${
              isDone    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
              isActive  ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm' :
              isPending ? 'bg-slate-50 text-slate-400 border border-slate-200' : ''
            }`}>
              {isDone   ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" /> :
               isActive ? <Loader2 className="w-2.5 h-2.5 text-blue-600 animate-spin" /> :
               <div className="w-2 h-2 rounded-full bg-slate-300" />}
              {stage.label}
            </div>
            {i < stages.length - 1 && (
              <div className={`w-3 h-px mx-0.5 ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Loading stage ────────────────────────────────────────────────────────────

function OrchestrationLoader({ status }: { status: OrchestrationStatus }) {
  const labels: Partial<Record<OrchestrationStatus, string>> = {
    assessing:           'Assessing engineering readiness…',
    duplicate_check:     'Checking for duplicate intents…',
    creating_intent:     'Creating Engineering Intent…',
    generating_analysis: 'AI is generating Engineering Analysis draft…',
    generating_plan:     'AI is generating Engineering Plan draft…',
    preparing_execution: 'Preparing Execution Context…',
    executing:           'Executing Engineering Package…',
  };
  const label = labels[status] ?? 'Processing…';
  return (
    <div className="flex items-center gap-3 py-4 px-5 bg-blue-50 border border-blue-200 rounded-xl">
      <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
      <div>
        <p className="text-xs font-semibold text-blue-700">{label}</p>
        <p className="text-[10px] text-blue-500 mt-0.5">This takes a few seconds</p>
      </div>
    </div>
  );
}

// ─── Duplicate found banner ────────────────────────────────────────────────────

function DuplicateBanner({
  result,
  onProceed,
  onContinueExisting,
}: {
  result: DuplicateIntelligenceResult;
  onProceed: () => void;
  onContinueExisting: (intentId: string) => void;
}) {
  const [loading, setLoading] = useState<'new' | 'existing' | null>(null);

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 overflow-hidden">
      <div className="px-4 py-3 bg-amber-100 border-b border-amber-200 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <div>
          <p className="text-xs font-bold text-amber-800">Potential Duplicate Detected</p>
          <p className="text-[10px] text-amber-600">Review before proceeding</p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {result.recommendationLabel && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
              {result.recommendationLabel}
            </span>
            {typeof result.confidence === 'number' && result.confidence > 0 && (
              <span className="text-[10px] text-slate-500">{result.confidence}% confidence</span>
            )}
          </div>
        )}

        {result.explanationText && (
          <p className="text-xs text-amber-800">{result.explanationText}</p>
        )}

        {result.hasFindings && result.existingObject && (
          <div className="flex items-start justify-between gap-3 bg-white rounded-lg p-2.5 border border-amber-200">
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-700">{result.existingObject.ref ?? result.existingObject.id}</p>
              <p className="text-[10px] text-slate-500">Lifecycle: {result.existingObject.lifecycleStatus}</p>
            </div>
            <button
              onClick={async () => {
                setLoading('existing');
                await onContinueExisting(result.existingObject!.id);
                setLoading(null);
              }}
              disabled={loading !== null}
              className="shrink-0 flex items-center gap-1 px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 text-[10px] font-semibold rounded-lg border border-amber-300 transition-colors disabled:opacity-50"
            >
              {loading === 'existing' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <ArrowRight className="w-2.5 h-2.5" />}
              Open Existing
            </button>
          </div>
        )}

        {result.hasFindings && !result.existingObject && (
          <p className="text-[10px] text-amber-600">A potential duplicate was detected but no existing object details are available.</p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={async () => { setLoading('new'); await onProceed(); setLoading(null); }}
            disabled={loading !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {loading === 'new' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Create New Intent Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Confidence badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ score, explanation }: { score: 'high' | 'medium' | 'low'; explanation?: string }) {
  const d = EngineeringDraftService.confidenceDisplay(score);
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${d.bg} ${d.colour}`}
      title={explanation}>
      <Award className="w-2.5 h-2.5" />
      {d.label}
      {explanation && <Info className="w-2.5 h-2.5 opacity-60" />}
    </div>
  );
}

// ─── Evidence panel ──────────────────────────────────────────────────────────

function EvidencePanel({ evidence }: { evidence: AnalysisDraft['evidence'] }) {
  const [open, setOpen] = useState(false);
  if (!evidence || evidence.length === 0) return null;
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(s => !s)}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
          <BookOpen className="w-2.5 h-2.5" />
          Evidence ({evidence.length})
        </span>
        {open ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
      </button>
      {open && (
        <div className="p-2 space-y-1.5">
          {evidence.map((item, i) => {
            const d = EngineeringDraftService.evidenceTypeDisplay(item.type);
            return (
              <div key={i} className="bg-white border border-slate-100 rounded-lg p-2">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`text-[9px] font-bold uppercase tracking-wide ${d.colour}`}>{d.label}</span>
                  <span className="text-[9px] font-mono text-slate-500">{item.ref}</span>
                </div>
                <p className="text-[10px] font-semibold text-slate-700 leading-tight">{item.title}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{item.relevance}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Analysis section ─────────────────────────────────────────────────────────

function AnalysisSection({
  draft,
  onApprove,
  onRegenerate,
  generating,
}: {
  draft: AnalysisDraft;
  onApprove: (approved: ApprovedAnalysis) => void;
  onRegenerate: () => void;
  generating: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary]         = useState(draft.summary);
  const [complexity, setComplexity]   = useState<ApprovedAnalysis['complexity']>(draft.complexity_assessment);
  const [constitutionReview, setConstitutionReview] = useState(draft.constitution_review);
  const [architectureNotes, setArchitectureNotes]   = useState(draft.architecture_notes);
  const [productNotes, setProductNotes]             = useState(draft.product_intelligence_notes);
  const [submitting, setSubmitting] = useState(false);

  const complexityKeys: ApprovedAnalysis['complexity'][] = ['low', 'medium', 'high', 'critical'];

  async function handleApprove() {
    setSubmitting(true);
    await onApprove({ summary, complexity, constitution_review: constitutionReview, architecture_notes: architectureNotes, product_intelligence_notes: productNotes });
    setSubmitting(false);
  }

  const cfg = COMPLEXITY_CFG[complexity];

  if (generating) {
    return <OrchestrationLoader status="generating_analysis" />;
  }

  return (
    <div className="space-y-3">
      {/* AI banner */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-teal-50 rounded-xl border border-blue-200">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-blue-600" />
          <span className="text-[10px] font-semibold text-blue-700">AI-Generated Analysis Draft</span>
        </div>
        <div className="flex items-center gap-2">
          <ConfidenceBadge score={draft.confidence_score} explanation={draft.confidence_explanation} />
          <button
            onClick={onRegenerate}
            disabled={generating || submitting}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold text-slate-600 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition-all disabled:opacity-40"
          >
            <RefreshCw className="w-2.5 h-2.5" />
            Regenerate
          </button>
        </div>
      </div>

      {/* Complexity */}
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Complexity Assessment</p>
        {editing ? (
          <div className="flex gap-1.5">
            {complexityKeys.map(k => {
              const c = COMPLEXITY_CFG[k];
              return (
                <button
                  key={k}
                  onClick={() => setComplexity(k)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${
                    complexity === k ? `${c.bg} ${c.text} ${c.border}` : 'bg-slate-50 text-slate-400 border-slate-200 hover:border-slate-300'
                  }`}
                >{c.label}</button>
              );
            })}
          </div>
        ) : (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
            {cfg.label}
          </span>
        )}
      </div>

      {/* Summary */}
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Summary</p>
        {editing ? (
          <textarea
            value={summary}
            onChange={e => setSummary(e.target.value)}
            rows={3}
            className="w-full text-xs text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
          />
        ) : (
          <p className="text-xs text-slate-700 leading-relaxed">{summary}</p>
        )}
      </div>

      {/* Constitution review */}
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
          <Shield className="w-2.5 h-2.5" /> Constitution Review
        </p>
        {editing ? (
          <textarea value={constitutionReview} onChange={e => setConstitutionReview(e.target.value)} rows={2}
            className="w-full text-xs text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
        ) : (
          <p className="text-xs text-slate-600 leading-relaxed">{constitutionReview}</p>
        )}
      </div>

      {/* Architecture notes */}
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
          <GitBranch className="w-2.5 h-2.5" /> Architecture Notes
        </p>
        {editing ? (
          <textarea value={architectureNotes} onChange={e => setArchitectureNotes(e.target.value)} rows={2}
            className="w-full text-xs text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
        ) : (
          <p className="text-xs text-slate-600 leading-relaxed">{architectureNotes}</p>
        )}
      </div>

      {/* Product intelligence */}
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
          <Target className="w-2.5 h-2.5" /> Product Intelligence
        </p>
        {editing ? (
          <textarea value={productNotes} onChange={e => setProductNotes(e.target.value)} rows={2}
            className="w-full text-xs text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
        ) : (
          <p className="text-xs text-slate-600 leading-relaxed">{productNotes}</p>
        )}
      </div>

      <EvidencePanel evidence={draft.evidence} />

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleApprove}
          disabled={submitting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Approve Analysis
        </button>
        <button
          onClick={() => setEditing(s => !s)}
          disabled={submitting}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-50 ${
            editing ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-slate-600 border-slate-300 hover:border-blue-300 hover:text-blue-600'
          }`}
        >
          {editing ? <X className="w-3 h-3" /> : <Edit3 className="w-3 h-3" />}
          {editing ? 'Cancel Edit' : 'Edit'}
        </button>
      </div>
    </div>
  );
}

// ─── Plan section ─────────────────────────────────────────────────────────────

function PlanSection({
  draft,
  onApprove,
  onRegenerate,
  generating,
}: {
  draft: PlanDraft;
  onApprove: (approved: ApprovedPlan) => void;
  onRegenerate: () => void;
  generating: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [execSummary, setExecSummary]     = useState(draft.executive_summary);
  const [strategy, setStrategy]           = useState(draft.engineering_strategy);
  const [approach, setApproach]           = useState(draft.recommended_approach);
  const [effort, setEffort]               = useState(draft.estimated_effort);
  const [submitting, setSubmitting]       = useState(false);

  async function handleApprove() {
    setSubmitting(true);
    await onApprove({ executive_summary: execSummary, engineering_strategy: strategy, recommended_approach: approach, estimated_effort: effort });
    setSubmitting(false);
  }

  if (generating) {
    return <OrchestrationLoader status="generating_plan" />;
  }

  return (
    <div className="space-y-3">
      {/* AI banner */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-teal-50 rounded-xl border border-blue-200">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-blue-600" />
          <span className="text-[10px] font-semibold text-blue-700">AI-Generated Plan Draft</span>
        </div>
        <div className="flex items-center gap-2">
          <ConfidenceBadge score={draft.confidence_score} explanation={draft.confidence_explanation} />
          <button
            onClick={onRegenerate}
            disabled={generating || submitting}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold text-slate-600 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition-all disabled:opacity-40"
          >
            <RefreshCw className="w-2.5 h-2.5" />
            Regenerate
          </button>
        </div>
      </div>

      {/* Executive summary */}
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Executive Summary</p>
        {editing ? (
          <textarea value={execSummary} onChange={e => setExecSummary(e.target.value)} rows={3}
            className="w-full text-xs text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
        ) : (
          <p className="text-xs text-slate-700 leading-relaxed">{execSummary}</p>
        )}
      </div>

      {/* Engineering strategy */}
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
          <Brain className="w-2.5 h-2.5" /> Engineering Strategy
        </p>
        {editing ? (
          <textarea value={strategy} onChange={e => setStrategy(e.target.value)} rows={2}
            className="w-full text-xs text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
        ) : (
          <p className="text-xs text-slate-600 leading-relaxed">{strategy}</p>
        )}
      </div>

      {/* Recommended approach */}
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
          <Zap className="w-2.5 h-2.5" /> Recommended Approach
        </p>
        {editing ? (
          <textarea value={approach} onChange={e => setApproach(e.target.value)} rows={2}
            className="w-full text-xs text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
        ) : (
          <p className="text-xs text-slate-600 leading-relaxed">{approach}</p>
        )}
      </div>

      {/* Estimated effort */}
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
          <Clock className="w-2.5 h-2.5" /> Estimated Effort
        </p>
        {editing ? (
          <input value={effort} onChange={e => setEffort(e.target.value)}
            className="w-full text-xs text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
        ) : (
          <p className="text-xs font-semibold text-slate-700">{effort}</p>
        )}
      </div>

      <EvidencePanel evidence={draft.evidence} />

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleApprove}
          disabled={submitting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Approve Plan
        </button>
        <button
          onClick={() => setEditing(s => !s)}
          disabled={submitting}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-50 ${
            editing ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-slate-600 border-slate-300 hover:border-blue-300 hover:text-blue-600'
          }`}
        >
          {editing ? <X className="w-3 h-3" /> : <Edit3 className="w-3 h-3" />}
          {editing ? 'Cancel Edit' : 'Edit'}
        </button>
      </div>
    </div>
  );
}

// ─── Approved analysis display ────────────────────────────────────────────────

function ApprovedAnalysisDisplay({ analysis }: { analysis: EngineeringAnalysis }) {
  const complexity = analysis.complexity_assessment ?? 'medium';
  const cfg = COMPLEXITY_CFG[complexity as keyof typeof COMPLEXITY_CFG] ?? COMPLEXITY_CFG.medium;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        <span className="text-[10px] font-bold text-emerald-700">Analysis Approved</span>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
          {cfg.label}
        </span>
        <span className="text-[10px] font-mono text-slate-400">{analysis.analysis_ref}</span>
      </div>
      {analysis.summary && (
        <p className="text-xs text-slate-600 leading-relaxed pl-5">{analysis.summary}</p>
      )}
    </div>
  );
}

// ─── Approved plan display ────────────────────────────────────────────────────

function ApprovedPlanDisplay({ plan }: { plan: EngineeringPlan }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
        <span className="text-[10px] font-bold text-emerald-700">Plan Approved</span>
        <span className="text-[10px] font-mono text-slate-400">{plan.plan_ref}</span>
        {plan.estimated_effort && (
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            <Clock className="w-2.5 h-2.5" />
            {plan.estimated_effort}
          </span>
        )}
      </div>
      {plan.executive_summary && (
        <p className="text-xs text-slate-600 leading-relaxed pl-5">{plan.executive_summary}</p>
      )}
    </div>
  );
}

// ─── Execution Preparation checklist ─────────────────────────────────────────

function ExecutionPreparationChecklist({
  steps,
  onExecute,
  isExecuting,
}: {
  steps: ExecutionPreparationStep[];
  onExecute: () => void;
  isExecuting: boolean;
}) {
  const allDone = steps.every(s => s.status === 'complete');
  const hasError = steps.some(s => s.status === 'error');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl border border-slate-200">
        <Server className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        <div>
          <p className="text-xs font-bold text-slate-700">Execution Preparation</p>
          <p className="text-[10px] text-slate-500">Validating requirements and preparing pipeline</p>
        </div>
      </div>
      <div className="space-y-1.5 pl-1">
        {steps.map(step => (
          <div key={step.key} className="flex items-center gap-2">
            {step.status === 'complete' ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
            ) : step.status === 'running' ? (
              <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0" />
            ) : step.status === 'error' ? (
              <X className="w-3 h-3 text-red-500 shrink-0" />
            ) : (
              <div className="w-3 h-3 rounded-full border-2 border-slate-300 shrink-0" />
            )}
            <span className={`text-[11px] font-medium ${
              step.status === 'complete' ? 'text-emerald-700' :
              step.status === 'running'  ? 'text-blue-700 font-semibold' :
              step.status === 'error'    ? 'text-red-600' :
              'text-slate-400'
            }`}>{step.label}</span>
          </div>
        ))}
      </div>
      {allDone && !isExecuting && (
        <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <p className="text-[10px] font-semibold text-emerald-700 mb-2">Execution Ready</p>
          <button
            onClick={onExecute}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white text-sm font-bold rounded-xl transition-all shadow-sm"
          >
            <Play className="w-4 h-4" />
            Execute Engineering Package
          </button>
        </div>
      )}
      {hasError && (
        <p className="text-xs text-red-600 pl-1">Preparation encountered an error. Please try again.</p>
      )}
    </div>
  );
}

// ─── Execution pipeline progress ──────────────────────────────────────────────

function ExecutionPipelineProgress({ pipeline }: { pipeline: ExecutionPipelineStage[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-teal-50 rounded-xl border border-blue-200">
        <Zap className="w-3.5 h-3.5 text-blue-600 shrink-0 animate-pulse" />
        <div>
          <p className="text-xs font-bold text-blue-700">Executing Engineering Package…</p>
          <p className="text-[10px] text-blue-500">Constitutional execution pipeline is running</p>
        </div>
      </div>
      <div className="space-y-1.5 pl-1">
        {pipeline.map(stage => (
          <div key={stage.key} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {stage.status === 'complete' ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
              ) : stage.status === 'running' ? (
                <Loader2 className="w-3 h-3 text-blue-500 animate-spin shrink-0" />
              ) : stage.status === 'error' ? (
                <X className="w-3 h-3 text-red-500 shrink-0" />
              ) : (
                <div className="w-3 h-3 rounded-full border-2 border-slate-300 shrink-0" />
              )}
              <span className={`text-[11px] font-medium ${
                stage.status === 'complete' ? 'text-emerald-700' :
                stage.status === 'running'  ? 'text-blue-700 font-semibold' :
                stage.status === 'error'    ? 'text-red-600' :
                'text-slate-400'
              }`}>{stage.label}</span>
            </div>
            {stage.record_ref && (
              <span className="text-[9px] font-mono text-slate-400 shrink-0">{stage.record_ref}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Execution completion card ────────────────────────────────────────────────

function ExecutionCompleteCard({
  result,
  intent,
  onViewWorkspace,
  onCreateAnother,
}: {
  result: ConversationExecutionResult;
  intent: EngineeringIntent;
  onViewWorkspace: () => void;
  onCreateAnother: () => void;
}) {
  return (
    <div className="space-y-3">
      {/* Success header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-bold text-emerald-800">Engineering Package Executed</p>
          <p className="text-[10px] text-emerald-600">Constitutional pipeline completed successfully</p>
        </div>
      </div>

      {/* Created objects */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white border border-slate-200 rounded-lg p-2.5">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Engineering Objects</p>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <FileText className="w-2.5 h-2.5 text-blue-500" />
              <span className="text-[10px] text-slate-600">Intent</span>
              <span className="text-[9px] font-mono text-slate-400 ml-auto">{result.intentRef}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Package className="w-2.5 h-2.5 text-amber-500" />
              <span className="text-[10px] text-slate-600">Idea</span>
              <span className="text-[9px] font-mono text-slate-400 ml-auto">{result.ideaRef}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Server className="w-2.5 h-2.5 text-teal-500" />
              <span className="text-[10px] text-slate-600">Session</span>
              <span className="text-[9px] font-mono text-slate-400 ml-auto">{result.sessionRef}</span>
            </div>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-2.5">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Records & Evidence</p>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Database className="w-2.5 h-2.5 text-slate-500" />
              <span className="text-[10px] text-slate-600">Record</span>
              <span className="text-[9px] font-mono text-slate-400 ml-auto">{result.recordRef}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-2.5 h-2.5 text-emerald-500" />
              <span className="text-[10px] text-slate-600">Evidence captured</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Brain className="w-2.5 h-2.5 text-violet-500" />
              <span className="text-[10px] text-slate-600">Memory updated</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onViewWorkspace}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-colors"
        >
          <Eye className="w-3 h-3" />
          View in Workspace
        </button>
        <button
          onClick={onCreateAnother}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 transition-colors"
        >
          <Sparkles className="w-3 h-3" />
          Create Another
        </button>
      </div>
    </div>
  );
}

export function ATDConversationPackage({
  status,
  intent,
  analysisDraft,
  planDraft,
  analysis,
  plan,
  duplicateResult,
  errorMessage,
  executionPreparationSteps,
  executionPipeline,
  executionResult,
  onDuplicateProceed,
  onDuplicateContinueExisting,
  onApproveAnalysis,
  onRegenerateAnalysis,
  onApprovePlan,
  onRegeneratePlan,
  onPrepareExecution,
  onExecute,
  onCreateAnother,
}: ATDConversationPackageProps) {

  const generatingAnalysis  = status === 'generating_analysis';
  const generatingPlan      = status === 'generating_plan';
  const isComplete          = status === 'complete';
  const isPreparing         = status === 'preparing_execution';
  const isAwaitingExecution = status === 'awaiting_execution';
  const isExecuting         = status === 'executing';

  // Plan has been approved but execution hasn't started yet
  const planApprovedPreExecution =
    !!plan &&
    !isPreparing &&
    !isAwaitingExecution &&
    !isExecuting &&
    !isComplete &&
    status === 'awaiting_plan_approval';

  if (status === 'error') {
    return (
      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <X className="w-3.5 h-3.5 text-red-600" />
          <span className="text-xs font-bold text-red-700">Engineering Orchestration Error</span>
        </div>
        <p className="text-xs text-red-600">{errorMessage ?? 'An error occurred during engineering orchestration.'}</p>
      </div>
    );
  }

  const isLoading = ['assessing', 'duplicate_check', 'creating_intent'].includes(status);

  return (
    <div className="mt-3 rounded-2xl border-2 border-slate-200 overflow-hidden bg-white shadow-sm">

      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-600 to-teal-500 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">Engineering Package</p>
            {intent && (
              <p className="text-xs font-bold text-white leading-tight">{intent.title}</p>
            )}
          </div>
        </div>
        {intent && (
          <button
            onClick={() => navigateToIntent(intent.id)}
            className="flex items-center gap-1 px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white text-[10px] font-semibold rounded-lg transition-colors"
          >
            <Eye className="w-2.5 h-2.5" />
            View in Workspace
          </button>
        )}
      </div>

      {/* Pipeline progress — shown while navigating pre-execution stages */}
      {!isComplete && !isExecuting && (
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 overflow-x-auto">
          <PipelineProgress status={status} />
        </div>
      )}

      <div className="p-4 space-y-4">

        {/* Loading state */}
        {isLoading && <OrchestrationLoader status={status} />}

        {/* Duplicate found */}
        {status === 'duplicate_found' && duplicateResult && (
          <DuplicateBanner
            result={duplicateResult}
            onProceed={onDuplicateProceed}
            onContinueExisting={onDuplicateContinueExisting}
          />
        )}

        {/* Intent created */}
        {intent && (
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
              <FileText className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Engineering Intent</span>
                <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                  {intent.intent_ref}
                </span>
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              </div>
              <p className="text-xs font-semibold text-slate-800 mt-0.5 leading-tight">{intent.title}</p>
              {intent.engineering_objective && (
                <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{intent.engineering_objective}</p>
              )}
            </div>
          </div>
        )}

        {/* Analysis section */}
        {intent && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <BarChart2 className="w-3 h-3 text-slate-500" />
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Engineering Analysis</span>
              {analysis && <CheckCircle2 className="w-3 h-3 text-emerald-500 ml-auto" />}
            </div>
            <div className="p-3">
              {analysis ? (
                <ApprovedAnalysisDisplay analysis={analysis} />
              ) : generatingAnalysis ? (
                <OrchestrationLoader status="generating_analysis" />
              ) : analysisDraft ? (
                <AnalysisSection
                  draft={analysisDraft}
                  onApprove={onApproveAnalysis}
                  onRegenerate={onRegenerateAnalysis}
                  generating={false}
                />
              ) : (
                status === 'awaiting_analysis_approval' && (
                  <p className="text-xs text-amber-600">Analysis draft unavailable — please fill in manually via the Workspace.</p>
                )
              )}
            </div>
          </div>
        )}

        {/* Plan section */}
        {analysis && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <Layers className="w-3 h-3 text-slate-500" />
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Engineering Plan</span>
              {plan && <CheckCircle2 className="w-3 h-3 text-emerald-500 ml-auto" />}
            </div>
            <div className="p-3">
              {plan ? (
                <ApprovedPlanDisplay plan={plan} />
              ) : generatingPlan ? (
                <OrchestrationLoader status="generating_plan" />
              ) : planDraft ? (
                <PlanSection
                  draft={planDraft}
                  onApprove={onApprovePlan}
                  onRegenerate={onRegeneratePlan}
                  generating={false}
                />
              ) : (
                status === 'awaiting_plan_approval' && (
                  <p className="text-xs text-amber-600">Plan draft unavailable — please fill in manually via the Workspace.</p>
                )
              )}
            </div>
          </div>
        )}

        {/* ── Execution section ─────────────────────────────────────────────── */}

        {/* Prepare Execution CTA — plan approved, nothing started yet */}
        {planApprovedPreExecution && (
          <div className="flex items-center justify-between gap-3 p-3 bg-blue-50 rounded-xl border border-blue-200">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                <Play className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-blue-800">Ready to Execute</p>
                <p className="text-[10px] text-blue-600">Engineering Package approved — proceed to execution.</p>
              </div>
            </div>
            <button
              onClick={onPrepareExecution}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              <Play className="w-3 h-3" />
              Prepare Execution
            </button>
          </div>
        )}

        {/* Execution Preparation Checklist */}
        {(isPreparing || isAwaitingExecution) && executionPreparationSteps && (
          <ExecutionPreparationChecklist
            steps={executionPreparationSteps}
            onExecute={onExecute}
            isExecuting={isExecuting}
          />
        )}

        {/* Live Execution Pipeline Progress */}
        {isExecuting && executionPipeline && (
          <ExecutionPipelineProgress pipeline={executionPipeline} />
        )}

        {/* Execution Complete Card */}
        {isComplete && executionResult && intent && (
          <ExecutionCompleteCard
            result={executionResult}
            intent={intent}
            onViewWorkspace={() => navigateToIntent(intent.id)}
            onCreateAnother={onCreateAnother}
          />
        )}

        {/* Fallback: complete but no execution result (plan-only completion) */}
        {isComplete && !executionResult && intent && analysis && plan && (
          <div className="flex items-center justify-between gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-800">Engineering Package Complete</p>
                <p className="text-[10px] text-emerald-600">Intent, Analysis, and Plan approved and persisted.</p>
              </div>
            </div>
            <button
              onClick={() => navigateToIntent(intent.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
            >
              <Eye className="w-3 h-3" />
              View in Workspace
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
