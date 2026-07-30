import React, { useState, useEffect, useCallback } from 'react';
import {
  Brain, Loader2, AlertCircle, Plus, ChevronRight, CheckCircle2,
  Clock, Zap, GitBranch, BookOpen, Shield, Lightbulb, BarChart3,
  FileText, Activity, CheckCheck, ArrowRight, X, ChevronDown, ChevronUp,
  Sparkles, Terminal, Target, Layers, Package, Users, AlertTriangle,
  Circle, RefreshCw, Eye, Network, ThumbsUp, ThumbsDown, Rocket, Link2,
  Trash2, Microscope, Play, CheckSquare, Info,
} from 'lucide-react';
import { ATDCognitiveEngine } from '../../lib/atdCognitiveEngine';
import { ATDCapabilityFramework } from '../../lib/atdCapabilityFramework';
import { AICapabilityEngine } from '../../lib/aiCapabilityEngine';
import { ATDGovernanceService } from '../../lib/atdGovernanceService';
import { supabase } from '../../lib/supabase';
import type { ActiveContext, EccProject, WorkspaceMode } from '../../lib/activeProjectService';
import {
  deleteObject,
  restoreObject,
  resolveDependencies,
} from '../../lib/engineeringLifecycleEngine';
import type { DependencyInfo } from '../../lib/engineeringLifecycleEngine';
import {
  analyseDuplicates,
  recordDuplicateAction,
} from '../../lib/duplicateIntelligenceService';
import type { DuplicateIntelligenceResult } from '../../lib/duplicateIntelligenceService';
import { ConstitutionalExecutionWizard } from './ECCConstitutionalExecutionWizard';
import { RunAnalysisModal, RunPlanningModal, StageExplainerPanel } from './ATDStageModals';
import { beginEngineering, findEwoForPlan, type BeginEngineeringResult } from '../../lib/ewoAutoRegistrationService';
import {
  STAGE_REGISTRY,
  PIPELINE_STAGE_ORDER,
  getNextRecommendation,
} from '../../lib/pipelineRecommendationEngine';
import type {
  EngineeringIntent, PipelineExecution, EngineeringAnalysis,
  EngineeringPlan, EngineeringDecision, KnowledgeRecord, ValidationResult,
  ReviewRequest, PipelineStage,
} from '../../lib/atdCognitiveEngine';
import type { Capability, CapabilityExecution } from '../../lib/atdCapabilityFramework';
import type { WizardState } from './ECCIdeaTypes';

// ─── Sub-types ────────────────────────────────────────────────────────────────

type WorkspaceTab = 'pipeline' | 'intents' | 'capabilities' | 'knowledge' | 'decisions';

const TABS: { key: WorkspaceTab; label: string; icon: typeof Brain }[] = [
  { key: 'pipeline',     label: 'Pipeline',     icon: Terminal    },
  { key: 'intents',      label: 'Intents',      icon: Target      },
  { key: 'capabilities', label: 'Capabilities', icon: Layers      },
  { key: 'knowledge',    label: 'Knowledge',    icon: BookOpen    },
  { key: 'decisions',    label: 'Decisions',    icon: CheckCheck  },
];

// ─── Status & Stage helpers ───────────────────────────────────────────────────

function intentStatusCfg(status: EngineeringIntent['status']): { pill: string; dot: string } {
  const map: Record<string, { pill: string; dot: string }> = {
    captured:            { pill: 'bg-slate-700 text-slate-300 border-slate-600',     dot: 'bg-slate-500' },
    analysing:           { pill: 'bg-blue-500/20 text-blue-300 border-blue-500/30',  dot: 'bg-blue-400 animate-pulse' },
    analysed:            { pill: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',  dot: 'bg-cyan-400' },
    planned:             { pill: 'bg-blue-500/20 text-blue-300 border-blue-500/30',  dot: 'bg-blue-400' },
    awaiting_approval:   { pill: 'bg-amber-500/20 text-amber-300 border-amber-500/30', dot: 'bg-amber-400' },
    in_review:           { pill: 'bg-amber-500/20 text-amber-300 border-amber-500/30',dot: 'bg-amber-400' },
    approved:            { pill: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
    rejected:            { pill: 'bg-red-500/20 text-red-300 border-red-500/30',      dot: 'bg-red-500' },
    implementing:        { pill: 'bg-orange-500/20 text-orange-300 border-orange-500/30', dot: 'bg-orange-400' },
    validating:          { pill: 'bg-teal-500/20 text-teal-300 border-teal-500/30',   dot: 'bg-teal-400' },
    extracting_knowledge:{ pill: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30', dot: 'bg-yellow-400' },
    intelligence_updated:{ pill: 'bg-sky-500/20 text-sky-300 border-sky-500/30',      dot: 'bg-sky-400' },
    complete:            { pill: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-500' },
    cancelled:           { pill: 'bg-slate-700 text-slate-500 border-slate-600',      dot: 'bg-slate-600' },
  };
  return map[status] ?? { pill: 'bg-slate-700 text-slate-400 border-slate-600', dot: 'bg-slate-500' };
}

function pipelineStatusCfg(status: PipelineExecution['status']): { colour: string; bg: string } {
  const map: Record<string, { colour: string; bg: string }> = {
    running:          { colour: 'text-blue-400',    bg: 'bg-blue-500/10' },
    paused:           { colour: 'text-amber-400',   bg: 'bg-amber-500/10' },
    waiting_approval: { colour: 'text-amber-400',   bg: 'bg-amber-500/10' },
    complete:         { colour: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    failed:           { colour: 'text-red-400',     bg: 'bg-red-500/10' },
    cancelled:        { colour: 'text-slate-400',   bg: 'bg-slate-500/10' },
  };
  return map[status] ?? { colour: 'text-slate-400', bg: 'bg-slate-500/10' };
}

function execStatusIcon(status: CapabilityExecution['status']) {
  if (status === 'complete') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
  if (status === 'running')  return <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />;
  if (status === 'failed')   return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
  if (status === 'skipped')  return <Circle className="w-3.5 h-3.5 text-slate-500" />;
  return <Clock className="w-3.5 h-3.5 text-slate-500" />;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: '2-digit' });
}

function fmtRelative(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

// ─── Reasoning result types ───────────────────────────────────────────────────

interface ReasoningPhase {
  phase: number;
  name: string;
  description: string;
  estimated_effort?: string;
}

interface ReasoningResult {
  executive_summary?: string;
  business_objective?: string;
  engineering_objective?: string;
  engineering_analysis?: string;
  recommended_strategy?: string;
  engineering_phases?: ReasoningPhase[];
  estimated_effort?: string;
  risks?: string[];
  standards_affected?: string[];
  recommended_ewos?: string[];
  implementation_recommendation?: string;
  _provider?: string;
  _model?: string;
  _tokens?: number;
  _duration_ms?: number;
  _plan_id?: string;
  _plan_ref?: string;
  _plan_version?: number;
  raw_response?: string;
}

// ─── Lifecycle Confirm Modal ──────────────────────────────────────────────────

type LifecycleConfirmState = 'confirm' | 'checking' | 'deleting' | 'error';

function LifecycleConfirmModal({
  objectType,
  objectId,
  objectRef,
  objectLabel,
  onConfirm,
  onCancel,
}: {
  objectType: 'intent' | 'plan';
  objectId: string;
  objectRef: string;
  objectLabel: string;
  onConfirm: (cascade: boolean, dependents: Array<{ objectType: string; objectId: string }>, reason: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [state, setState] = useState<LifecycleConfirmState>('checking');
  const [dependencies, setDependencies] = useState<DependencyInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    resolveDependencies(objectType, objectId)
      .then(deps => { setDependencies(deps); setState('confirm'); })
      .catch(() => { setDependencies({ dependents: [], count: 0 }); setState('confirm'); });
  }, [objectType, objectId]);

  const handleDelete = async () => {
    setState('deleting');
    setError(null);
    try {
      await onConfirm(
        (dependencies?.count ?? 0) > 0,
        dependencies?.dependents.map(d => ({ objectType: d.objectType, objectId: d.objectId })) ?? [],
        reason.trim(),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deletion failed. Please try again.');
      setState('error');
    }
  };

  const isLoading = state === 'checking' || state === 'deleting';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 bg-red-50">
          <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
            <Trash2 className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-red-900">
              Delete this {objectType === 'intent' ? 'Engineering Intent' : 'Engineering Plan'}?
            </p>
            <p className="text-[10px] font-mono text-red-600">{objectRef}</p>
          </div>
          <button onClick={onCancel} disabled={isLoading} className="ml-auto p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {state === 'checking' ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
              <span className="text-xs text-slate-500">Checking dependencies...</span>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-600">
                This will remove <strong>{objectLabel}</strong> from active engineering work
                while preserving its governance history. This action can be reversed.
              </p>

              {/* Dependency warning */}
              {(dependencies?.count ?? 0) > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="text-xs font-semibold text-amber-800 mb-1">
                    This Engineering Intent contains {dependencies!.count} linked Engineering Plan{dependencies!.count !== 1 ? 's' : ''}.
                  </p>
                  <p className="text-[10px] text-amber-700">
                    Deleting this Intent will also remove all linked Plans from active engineering work.
                  </p>
                  <div className="mt-1.5 space-y-1">
                    {dependencies!.dependents.map(dep => (
                      <p key={dep.objectId} className="text-[10px] font-mono text-amber-600">
                        · {dep.objectRef ?? dep.objectId}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Reason field */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for deletion <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Superseded by a newer intent, duplicate, or no longer required."
                  className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-400 resize-none"
                  disabled={isLoading}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <p className="text-[10px] text-red-700">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          {(dependencies?.count ?? 0) > 0 ? (
            <button
              onClick={handleDelete}
              disabled={isLoading || state === 'checking'}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {state === 'deleting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete Intent and Linked Plans
            </button>
          ) : (
            <button
              onClick={handleDelete}
              disabled={isLoading || state === 'checking'}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {state === 'deleting' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Delete {objectType === 'intent' ? 'Intent' : 'Plan'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Undo Notification ───────────────────────────────────────────────────────

interface UndoNotification {
  message: string;
  objectType: 'intent' | 'plan';
  objectId: string;
  objectRef: string;
  onUndo: () => void;
}

function UndoToast({
  notification,
  onDismiss,
}: {
  notification: UndoNotification;
  onDismiss: () => void;
}) {
  const [undoing, setUndoing] = useState(false);

  const handleUndo = async () => {
    setUndoing(true);
    try {
      await notification.onUndo();
    } finally {
      setUndoing(false);
      onDismiss();
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl min-w-[320px] max-w-md">
      <div className="w-6 h-6 bg-red-500/20 rounded-full flex items-center justify-center shrink-0">
        <Trash2 className="w-3.5 h-3.5 text-red-400" />
      </div>
      <p className="text-xs text-slate-300 flex-1 min-w-0 truncate">{notification.message}</p>
      <button
        onClick={handleUndo}
        disabled={undoing}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-60 shrink-0"
      >
        {undoing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        Undo
      </button>
      <button onClick={onDismiss} className="p-1 text-slate-500 hover:text-slate-300 transition-colors shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Capture Intent Modal ─────────────────────────────────────────────────────

type GovernanceStage = 'idle' | 'approving' | 'rejecting' | 'approved' | 'rejected' | 'governance_error';

function CaptureIntentModal({
  onClose,
  onCreated,
  context,
}: {
  onClose: () => void;
  onCreated: () => void;
  context: ActiveContext;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [reasoningStage, setReasoningStage] = useState<'idle' | 'checking_duplicate' | 'capturing' | 'reasoning' | 'complete' | 'error'>('idle');
  const [reasoningResult, setReasoningResult] = useState<ReasoningResult | null>(null);
  const [capturedIntentId, setCapturedIntentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateResult, setDuplicateResult] = useState<DuplicateIntelligenceResult | null>(null);

  const [governanceStage, setGovernanceStage] = useState<GovernanceStage>('idle');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [governanceError, setGovernanceError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    raw_input: '',
    requested_outcome: '',
    business_objective: '',
    engineering_objective: '',
    scope: '',
    constraints: '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const runCapture = async () => {
    setSaving(true);
    setError(null);
    setReasoningStage('capturing');
    try {
      const { intent } = await ATDCognitiveEngine.captureIntent({
        title: form.title.trim(),
        raw_input: form.raw_input.trim(),
        requested_outcome: form.requested_outcome || undefined,
        business_objective: form.business_objective || undefined,
        engineering_objective: form.engineering_objective || undefined,
        scope: form.scope || undefined,
        constraints: form.constraints || undefined,
        context_type: context.context_type,
        context_id: context.context_id,
        project_id: context.project_id,
      });
      setCapturedIntentId(intent.id);

      // Write Engineering Intelligence timeline event
      await supabase.from('ecc_engineering_audit').insert({
        event_type: 'intent_created',
        event_label: `Intent Created: ${form.title.trim().slice(0, 60)}`,
        entity_type: 'engineering_intent',
        entity_id: intent.id,
        entity_title: form.title.trim(),
        metadata: { intent_ref: intent.intent_ref ?? null, source: 'CaptureIntentModal' },
      }).then(() => {});

      setReasoningStage('reasoning');
      const result = await AICapabilityEngine.executeCapability(
        'reasoning',
        {
          title: form.title.trim(),
          raw_input: form.raw_input.trim(),
          requested_outcome: form.requested_outcome || undefined,
          business_objective: form.business_objective || undefined,
          engineering_objective: form.engineering_objective || undefined,
          scope: form.scope || undefined,
          constraints: form.constraints || undefined,
          intent_id: intent.id,
        },
        { intentId: intent.id },
      );

      if (!result.success) throw new Error(result.error ?? 'Reasoning capability failed');

      setReasoningResult(result.output as ReasoningResult);
      setReasoningStage('complete');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process intent');
      setReasoningStage('error');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.raw_input.trim()) {
      setError('Title and intent description are required.');
      return;
    }
    setSaving(true);
    setError(null);
    setReasoningStage('checking_duplicate');

    try {
      const dup = await analyseDuplicates({
        objectType: 'intent',
        proposedTitle: form.title.trim(),
        rawInput: form.raw_input.trim(),
        source: 'CaptureIntentModal',
      });
      setSaving(false);

      if (dup.hasFindings && dup.recommendation !== 'proceed') {
        setDuplicateResult(dup);
        setReasoningStage('idle');
      } else {
        await runCapture();
      }
    } catch {
      setSaving(false);
      await runCapture();
    }
  };

  const handleApprove = async () => {
    if (!reasoningResult?._plan_id || !capturedIntentId) return;
    setGovernanceStage('approving');
    setGovernanceError(null);
    const result = await ATDGovernanceService.approvePlan({
      planId: reasoningResult._plan_id,
      intentId: capturedIntentId,
    });
    if (result.success) {
      setGovernanceStage('approved');
      onCreated();
    } else {
      setGovernanceError(result.error ?? 'Approval failed');
      setGovernanceStage('governance_error');
    }
  };

  const handleReject = async () => {
    if (!reasoningResult?._plan_id || !capturedIntentId) return;
    if (!rejectionReason.trim()) {
      setGovernanceError('Rejection reason is required.');
      return;
    }
    setGovernanceStage('rejecting');
    setGovernanceError(null);
    const result = await ATDGovernanceService.rejectPlan({
      planId: reasoningResult._plan_id,
      intentId: capturedIntentId,
      rejectionReason: rejectionReason.trim(),
    });
    if (result.success) {
      setGovernanceStage('rejected');
      onCreated();
    } else {
      setGovernanceError(result.error ?? 'Rejection failed');
      setGovernanceStage('governance_error');
    }
  };

  const governanceProcessing = governanceStage === 'approving' || governanceStage === 'rejecting';

  // ── Duplicate check in progress ──────────────────────────────────────────────
  if (reasoningStage === 'checking_duplicate') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-8 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center">
            <Eye className="w-8 h-8 text-blue-400 animate-pulse" />
          </div>
          <div>
            <p className="text-sm font-bold text-white mb-1">Checking for duplicates...</p>
            <p className="text-xs text-slate-400">Scanning the Engineering Object Model for matching intents.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Duplicate detected — show resolution UI ───────────────────────────────────
  if (duplicateResult && duplicateResult.hasFindings && reasoningStage === 'idle') {
    const isActive   = duplicateResult.recommendation === 'continue_existing';
    const isArchived = duplicateResult.recommendation === 'restore_archived';
    const isDeleted  = duplicateResult.recommendation === 'restore_deleted';

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden">
          {/* Header */}
          <div className={`flex items-center gap-3 px-5 py-4 border-b ${
            isActive ? 'bg-amber-50 border-amber-200' : isArchived ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              isActive ? 'bg-amber-100' : isArchived ? 'bg-blue-100' : 'bg-slate-200'
            }`}>
              <AlertTriangle className={`w-4 h-4 ${isActive ? 'text-amber-600' : isArchived ? 'text-blue-600' : 'text-slate-500'}`} />
            </div>
            <div>
              <p className={`text-sm font-bold ${isActive ? 'text-amber-900' : isArchived ? 'text-blue-900' : 'text-slate-800'}`}>
                {isActive ? 'Duplicate Intent Detected' : isArchived ? 'Archived Intent Found' : 'Previously Deleted Intent Found'}
              </p>
              <p className={`text-[10px] font-mono mt-0.5 ${isActive ? 'text-amber-600' : isArchived ? 'text-blue-600' : 'text-slate-500'}`}>
                  {duplicateResult.existingObject?.ref ?? duplicateResult.existingObject?.id}
              </p>
            </div>
            <button onClick={onClose} className="ml-auto p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-3">
            <p className="text-xs text-slate-600">
              {isActive && (
                <>An <strong>active</strong> Engineering Intent with a matching title already exists. Creating a duplicate may cause confusion in the engineering pipeline.</>
              )}
              {isArchived && (
                <>An <strong>archived</strong> Engineering Intent with a matching title exists. You can restore it to active status or create a new separate intent.</>
              )}
              {isDeleted && (
                <>A <strong>deleted</strong> Engineering Intent with a matching title was found in the audit record. You can restore it or create a new intent with a new ID.</>
              )}
            </p>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-[10px] text-slate-500 uppercase font-semibold mb-0.5">Existing Intent</p>
              <p className="text-sm font-semibold text-slate-900">{form.title.trim()}</p>
              <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                {duplicateResult.existingObject?.ref ?? duplicateResult.existingObject?.id} · Status: {duplicateResult.existingObject?.lifecycleStatus}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 px-5 pb-5">
            {/* Active duplicate: block creation */}
            {isActive && (
              <>
                <button
                  onClick={() => { onClose(); setDuplicateResult(null); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Open Existing Intent
                </button>
                <button
                  onClick={() => { setDuplicateResult(null); }}
                  className="w-full px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Cancel
                </button>
              </>
            )}

            {/* Archived duplicate: offer restore or create new */}
            {isArchived && (
              <>
                <button
                  onClick={async () => {
                    if (!duplicateResult.existingObject?.id) return;
                    setSaving(true);
                    try {
                      await restoreObject({ objectType: 'intent', objectId: duplicateResult.existingObject.id, reason: 'Restored via duplicate detection in Capture Intent workflow.' });
                      await supabase.from('ecc_engineering_audit').insert({
                        event_type: 'intent_restored',
                        event_label: `Intent Restored: ${form.title.trim().slice(0, 60)}`,
                        entity_type: 'engineering_intent',
                        entity_id: duplicateResult.existingObject.id,
                        entity_title: form.title.trim(),
                        metadata: { source: 'CaptureIntentModal duplicate detection', from_status: 'archived' },
                      }).then(() => {});
                      if (duplicateResult.recordId) await recordDuplicateAction(duplicateResult.recordId, 'restore', duplicateResult.existingObject.id);
                      setDuplicateResult(null);
                      onCreated();
                      onClose();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Restore failed');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Restore Intent to Active
                </button>
                <button
                  onClick={() => { onClose(); setDuplicateResult(null); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View Archived Intent
                </button>
                <button
                  onClick={async () => { if (duplicateResult?.recordId) await recordDuplicateAction(duplicateResult.recordId, 'create_new'); setDuplicateResult(null); await runCapture(); }}
                  disabled={saving}
                  className="w-full px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
                >
                  Create New Intent Anyway
                </button>
                <button
                  onClick={() => { setDuplicateResult(null); }}
                  className="w-full px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </>
            )}

            {/* Deleted duplicate: offer restore or create new */}
            {isDeleted && (
              <>
                <button
                  onClick={async () => {
                    if (!duplicateResult.existingObject?.id) return;
                    setSaving(true);
                    try {
                      await restoreObject({ objectType: 'intent', objectId: duplicateResult.existingObject.id, reason: 'Restored via duplicate detection in Capture Intent workflow.' });
                      await supabase.from('ecc_engineering_audit').insert({
                        event_type: 'intent_restored',
                        event_label: `Intent Restored: ${form.title.trim().slice(0, 60)}`,
                        entity_type: 'engineering_intent',
                        entity_id: duplicateResult.existingObject.id,
                        entity_title: form.title.trim(),
                        metadata: { source: 'CaptureIntentModal duplicate detection', from_status: 'deleted' },
                      }).then(() => {});
                      if (duplicateResult.recordId) await recordDuplicateAction(duplicateResult.recordId, 'restore', duplicateResult.existingObject.id);
                      setDuplicateResult(null);
                      onCreated();
                      onClose();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Restore failed');
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Restore Deleted Intent
                </button>
                <button
                  onClick={() => { onClose(); setDuplicateResult(null); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View Deleted Intent
                </button>
                <button
                  onClick={async () => { if (duplicateResult?.recordId) await recordDuplicateAction(duplicateResult.recordId, 'create_new'); setDuplicateResult(null); await runCapture(); }}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Create New Intent (New ID)
                </button>
                <button
                  onClick={() => { setDuplicateResult(null); }}
                  className="w-full px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 px-5 pb-4">
              <div className="flex items-center gap-2 w-full px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <p className="text-[10px] text-red-700">{error}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Reasoning in progress ────────────────────────────────────────────────────
  if (reasoningStage === 'capturing' || reasoningStage === 'reasoning') {
    const stageLabel = reasoningStage === 'capturing'
      ? 'Capturing engineering intent...'
      : 'ATD Reasoning Engine analysing — generating Engineering Plan...';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-8 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center">
            <Brain className="w-8 h-8 text-blue-400 animate-pulse" />
          </div>
          <div>
            <p className="text-sm font-bold text-white mb-1">{stageLabel}</p>
            <p className="text-xs text-slate-400">
              {reasoningStage === 'reasoning'
                ? 'Gathering platform context and running engineering analysis. This may take up to 60 seconds.'
                : 'Recording intent in Engineering Object Model...'}
            </p>
          </div>
          <div className="flex gap-1.5 mt-2">
            {['capturing', 'reasoning'].map((s, i) => (
              <div key={s} className={`h-1.5 rounded-full transition-all ${
                (reasoningStage === 'capturing' && i === 0) || (reasoningStage === 'reasoning' && i <= 1)
                  ? 'bg-blue-400 w-8'
                  : 'bg-slate-700 w-4'
              }`} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Post-governance decision ──────────────────────────────────────────────────
  if (governanceStage === 'approved' || governanceStage === 'rejected') {
    const approved = governanceStage === 'approved';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="bg-white rounded-xl w-full max-w-md p-8 flex flex-col items-center text-center gap-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${approved ? 'bg-emerald-100' : 'bg-red-100'}`}>
            {approved
              ? <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              : <AlertCircle className="w-8 h-8 text-red-500" />}
          </div>
          <div>
            <p className="text-base font-bold text-slate-900 mb-1">
              {approved ? 'Plan Approved' : 'Plan Rejected'}
            </p>
            <p className="text-sm text-slate-500">
              {approved
                ? 'The Engineering Plan has been approved and the intent is committed to the engineering pipeline.'
                : 'The Engineering Plan has been rejected. A new analysis can be requested.'}
            </p>
            {reasoningResult?._plan_ref && (
              <p className="text-xs font-mono text-slate-400 mt-2">{reasoningResult._plan_ref}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className={`px-6 py-2 text-sm font-semibold text-white rounded-lg transition-colors ${approved ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-700 hover:bg-slate-800'}`}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // ── Engineering Plan generated — awaiting PO approval ────────────────────────
  if (reasoningStage === 'complete' && reasoningResult) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Engineering Plan Generated</h2>
                <p className="text-xs text-slate-500">
                  {reasoningResult._plan_ref && (
                    <span className="font-mono mr-1">{reasoningResult._plan_ref}</span>
                  )}
                  {reasoningResult._plan_version && reasoningResult._plan_version > 1 && (
                    <span className="mr-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-semibold">
                      v{reasoningResult._plan_version}
                    </span>
                  )}
                  · ATD Reasoning · {reasoningResult._provider} · {reasoningResult._tokens?.toLocaleString()} tokens
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
              <Clock className="w-3.5 h-3.5" />
              Awaiting PO Approval
            </span>
          </div>

          {/* Plan body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {reasoningResult.executive_summary && (
              <PlanSection label="Executive Summary" accent="blue">
                {reasoningResult.executive_summary}
              </PlanSection>
            )}
            {(reasoningResult.business_objective || reasoningResult.engineering_objective) && (
              <div className="grid grid-cols-2 gap-3">
                {reasoningResult.business_objective && (
                  <PlanSection label="Business Objective" accent="emerald">
                    {reasoningResult.business_objective}
                  </PlanSection>
                )}
                {reasoningResult.engineering_objective && (
                  <PlanSection label="Engineering Objective" accent="cyan">
                    {reasoningResult.engineering_objective}
                  </PlanSection>
                )}
              </div>
            )}
            {reasoningResult.engineering_analysis && (
              <PlanSection label="Engineering Analysis" accent="slate">
                {reasoningResult.engineering_analysis}
              </PlanSection>
            )}
            {reasoningResult.recommended_strategy && (
              <PlanSection label="Recommended Strategy" accent="blue">
                {reasoningResult.recommended_strategy}
              </PlanSection>
            )}
            {reasoningResult.engineering_phases && reasoningResult.engineering_phases.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Engineering Phases</p>
                <div className="space-y-2">
                  {reasoningResult.engineering_phases.map(phase => (
                    <div key={phase.phase} className="flex items-start gap-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="text-xs font-bold text-slate-400 shrink-0 mt-0.5">P{phase.phase}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800">{phase.name}</p>
                        <p className="text-xs text-slate-500">{phase.description}</p>
                        {phase.estimated_effort && (
                          <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />{phase.estimated_effort}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {reasoningResult.recommended_ewos && reasoningResult.recommended_ewos.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Recommended EWOs</p>
                  <div className="flex flex-wrap gap-1.5">
                    {reasoningResult.recommended_ewos.map((ewo, i) => (
                      <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded border border-blue-100">{ewo}</span>
                    ))}
                  </div>
                </div>
              )}
              {reasoningResult.risks && reasoningResult.risks.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Risks</p>
                  <ul className="space-y-1">
                    {reasoningResult.risks.map((risk, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                        {risk}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {reasoningResult.implementation_recommendation && (
              <PlanSection label="Implementation Recommendation" accent="emerald">
                {reasoningResult.implementation_recommendation}
              </PlanSection>
            )}
            {reasoningResult.estimated_effort && (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-700">Estimated total effort: <strong>{reasoningResult.estimated_effort}</strong></span>
              </div>
            )}
          </div>

          {/* PO Approval footer */}
          <div className="shrink-0 px-6 py-4 border-t border-slate-200 bg-amber-50">
            {governanceError && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-xs text-red-700">{governanceError}</p>
              </div>
            )}
            {showRejectInput && (
              <div className="mb-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  rows={2}
                  placeholder="Explain why this plan is being rejected..."
                  className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-400 resize-none"
                  disabled={governanceProcessing}
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-amber-800">Product Owner Governance Gate</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Approval commits this intent to the engineering pipeline. Rejection requires a reason.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!showRejectInput ? (
                  <button
                    onClick={() => { setShowRejectInput(true); setGovernanceError(null); }}
                    disabled={governanceProcessing || !reasoningResult._plan_id}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                    Reject Plan
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => { setShowRejectInput(false); setRejectionReason(''); setGovernanceError(null); }}
                      disabled={governanceProcessing}
                      className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={governanceProcessing || !rejectionReason.trim()}
                      className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {governanceStage === 'rejecting'
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <ThumbsDown className="w-3.5 h-3.5" />}
                      Confirm Rejection
                    </button>
                  </>
                )}
                {!showRejectInput && (
                  <button
                    onClick={handleApprove}
                    disabled={governanceProcessing || !reasoningResult._plan_id}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {governanceStage === 'approving'
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <ThumbsUp className="w-3.5 h-3.5" />}
                    Approve Plan
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Brain className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Capture Engineering Intent</h2>
              <p className="text-xs text-slate-400">Stage 1 — Intent Understanding · ATD Cognitive Pipeline</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 px-6 py-3 border-b border-slate-800 shrink-0">
          {['Intent', 'Engineering Context'].map((label, i) => (
            <React.Fragment key={label}>
              <button
                onClick={() => setStep((i + 1) as 1 | 2)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  step === i + 1 ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className={`w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold ${
                  step === i + 1 ? 'bg-white text-blue-600' : 'bg-slate-700 text-slate-400'
                }`}>{i + 1}</span>
                {label}
              </button>
              {i === 0 && <ChevronRight className="w-3 h-3 text-slate-600" />}
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {step === 1 && (
            <>
              <Field label="Intent Title *" hint="A short, clear name for this engineering request">
                <input
                  type="text"
                  value={form.title}
                  onChange={set('title')}
                  placeholder="e.g. Assessment Reports Feature"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </Field>
              <Field label="Product Owner Intent *" hint="Describe exactly what you want in plain language">
                <textarea
                  value={form.raw_input}
                  onChange={set('raw_input')}
                  rows={4}
                  placeholder="I want Assessment Reports. Trainers should be able to generate a PDF report for each learner showing their assessment results, scores, and competency status."
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </Field>
              <Field label="Requested Outcome">
                <input
                  type="text"
                  value={form.requested_outcome}
                  onChange={set('requested_outcome')}
                  placeholder="What does success look like?"
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Business Objective" hint="Why is this needed from a business perspective?">
                <textarea
                  value={form.business_objective}
                  onChange={set('business_objective')}
                  rows={2}
                  placeholder="Enable trainers to report on learner progress for compliance and regulatory requirements."
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </Field>
              <Field label="Engineering Objective" hint="What must the engineering team deliver?">
                <textarea
                  value={form.engineering_objective}
                  onChange={set('engineering_objective')}
                  rows={2}
                  placeholder="Build a PDF generation service and report template engine connected to assessment data."
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </Field>
              <Field label="Scope" hint="What is in and out of scope?">
                <textarea
                  value={form.scope}
                  onChange={set('scope')}
                  rows={2}
                  placeholder="In scope: PDF export, learner data. Out of scope: email delivery, bulk export."
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </Field>
              <Field label="Constraints" hint="Technical, compliance, or timeline constraints">
                <textarea
                  value={form.constraints}
                  onChange={set('constraints')}
                  rows={2}
                  placeholder="Must comply with ACSF privacy standards. No third-party PDF services."
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </Field>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg transition-colors">
              Cancel
            </button>
            {step === 1 ? (
              <button
                onClick={() => {
                  if (!form.title.trim() || !form.raw_input.trim()) { setError('Title and intent description are required.'); return; }
                  setError(null);
                  setStep(2);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {saving ? 'Processing...' : 'Capture & Analyse'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-300 mb-1">{label}</label>
      {hint && <p className="text-[11px] text-slate-500 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

function PlanSection({ label, accent = 'slate', children }: { label: string; accent?: string; children: React.ReactNode }) {
  const accentMap: Record<string, { border: string; label: string; bg: string }> = {
    blue:    { border: 'border-l-blue-400',    label: 'text-blue-700',    bg: 'bg-blue-50'    },
    emerald: { border: 'border-l-emerald-400', label: 'text-emerald-700', bg: 'bg-emerald-50' },
    cyan:    { border: 'border-l-cyan-400',    label: 'text-cyan-700',    bg: 'bg-cyan-50'    },
    slate:   { border: 'border-l-slate-300',   label: 'text-slate-600',   bg: 'bg-slate-50'   },
  };
  const cfg = accentMap[accent] ?? accentMap.slate;
  return (
    <div className={`border-l-4 ${cfg.border} ${cfg.bg} rounded-r-lg px-4 py-3`}>
      <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${cfg.label}`}>{label}</p>
      <p className="text-sm text-slate-700 leading-relaxed">{children as string}</p>
    </div>
  );
}

// ─── Pipeline View ────────────────────────────────────────────────────────────

// ─── Record Decision Modal (EWO-014.7B) ──────────────────────────────────────

type DecisionType = 'approve' | 'reject' | 'defer' | 'request_changes';

const DECISION_OPTIONS: { value: DecisionType; label: string; icon: typeof CheckCircle2; colour: string }[] = [
  { value: 'approve',        label: 'Approve',         icon: CheckCircle2,  colour: 'emerald' },
  { value: 'reject',         label: 'Reject',           icon: X,             colour: 'red' },
  { value: 'defer',          label: 'Defer',            icon: Clock,         colour: 'amber' },
  { value: 'request_changes', label: 'Request Changes', icon: RefreshCw,   colour: 'blue' },
];

function RecordDecisionModal({
  intentRef,
  planRef,
  existingDecision,
  onClose,
  onSubmit,
}: {
  intentRef: string;
  planRef: string;
  existingDecision: EngineeringDecision | null;
  onClose: () => void;
  onSubmit: (decision: DecisionType, comments: string) => Promise<void>;
}) {
  const [decision, setDecision] = useState<DecisionType | null>(null);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReadOnly = !!existingDecision;

  if (isReadOnly) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-slate-400" />
              <h2 className="font-semibold text-slate-800">Existing Governance Decision</h2>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500 font-medium">Decision Ref:</span> <span className="font-mono text-slate-800">{existingDecision!.decision_ref}</span></div>
              <div><span className="text-slate-500 font-medium">Decision:</span> <span className="font-semibold capitalize text-slate-800">{existingDecision!.decision_type}</span></div>
              <div><span className="text-slate-500 font-medium">Decided By:</span> <span className="text-slate-800">{existingDecision!.decided_by}</span></div>
              <div><span className="text-slate-500 font-medium">Decided At:</span> <span className="text-slate-800">{new Date(existingDecision!.decided_at).toLocaleString()}</span></div>
            </div>
            {existingDecision!.rationale && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Rationale</p>
                <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 border border-slate-200">{existingDecision!.rationale}</p>
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">Close</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!decision) { setError('Please select a decision.'); return; }
    if ((decision === 'reject' || decision === 'request_changes') && !comments.trim()) {
      setError(`${decision === 'reject' ? 'Rejection' : 'Change request'} reason is required.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(decision, comments.trim());
    } catch (e: any) {
      const msg = e?.message ?? e?.error_description ?? (typeof e === 'string' ? e : 'Failed to record decision');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-500" />
            <h2 className="font-semibold text-slate-800">Record Governance Decision</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
            <div>Intent: <span className="font-mono font-semibold text-slate-700">{intentRef}</span></div>
            <div>Plan: <span className="font-mono font-semibold text-slate-700">{planRef}</span></div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Decision</label>
            <div className="grid grid-cols-2 gap-2">
              {DECISION_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const selected = decision === opt.value;
                const colourClasses: Record<string, string> = {
                  emerald: selected ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 hover:border-emerald-300 hover:bg-emerald-50',
                  red:     selected ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 hover:border-red-300 hover:bg-red-50',
                  amber:   selected ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50',
                  blue:    selected ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50',
                };
                return (
                  <button key={opt.value} onClick={() => setDecision(opt.value)} disabled={submitting}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors disabled:opacity-50 ${colourClasses[opt.colour]}`}>
                    <Icon className="w-4 h-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Comments / Rationale</label>
            <textarea value={comments} onChange={e => setComments(e.target.value)} disabled={submitting}
              placeholder={decision === 'approve' ? 'Optional approval notes…' : 'Required: explain the rationale…'}
              rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none disabled:opacity-50" />
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={onClose} disabled={submitting}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">Cancel</button>
            <button onClick={handleSubmit} disabled={!decision || submitting}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Record Decision
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Interactive Pipeline Widget (for Intent Detail Panel) ───────────────────

type IntentData = Awaited<ReturnType<typeof ATDCognitiveEngine.getIntentWithPipeline>>;

function InteractivePipelineWidget({
  pipeline,
  data,
  onRunAnalysis,
  onRunPlanning,
  onPrepareReview,
  onRecordDecision,
  onBeginEngineering,
  onRecordValidation,
  onExtractKnowledge,
  onCompleteIntelligence,
  onRefreshed,
}: {
  pipeline: PipelineExecution;
  data: IntentData;
  onRunAnalysis: () => void;
  onRunPlanning: () => void;
  onPrepareReview?: () => void;
  onRecordDecision?: () => void;
  onBeginEngineering?: () => void;
  onRecordValidation?: () => void;
  onExtractKnowledge?: () => void;
  onCompleteIntelligence?: () => void;
  onRefreshed?: () => void;
}) {
  const [selectedStage, setSelectedStage] = useState<PipelineStage | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const visibleStages = PIPELINE_STAGE_ORDER.filter(s => s !== 'complete');
  const currentIdx = PIPELINE_STAGE_ORDER.indexOf(pipeline.current_stage);
  const recommendation = getNextRecommendation(pipeline.current_stage);

  const stageStatus = (stage: PipelineStage): 'complete' | 'current' | 'future' => {
    const idx = PIPELINE_STAGE_ORDER.indexOf(stage);
    if (idx < currentIdx) return 'complete';
    if (stage === pipeline.current_stage) return 'current';
    return 'future';
  };

  const stageOutputLabel = (stage: PipelineStage): string | null => {
    if (stage === 'engineering_analysis' && data.analysis) return data.analysis.analysis_ref ?? 'Analysis complete';
    if (stage === 'engineering_planning' && data.plan) return data.plan.plan_ref ?? 'Plan ready';
    if (stage === 'review_preparation' && data.reviews.length > 0) return data.reviews[0].review_ref ?? 'Review prepared';
    if (stage === 'approval' && data.decisions.length > 0) return data.decisions[0].decision_ref ?? 'Decision recorded';
    if (stage === 'validation' && data.validations.length > 0) return 'Validation recorded';
    if (stage === 'knowledge_extraction' && data.knowledge.length > 0) return `${data.knowledge.length} knowledge record(s)`;
    return null;
  };

  const handleStageClick = (stage: PipelineStage) => {
    const status = stageStatus(stage);
    if (status === 'current') {
      // Launch execution for known actionable stages
      if (stage === 'engineering_analysis') { onRunAnalysis(); return; }
      if (stage === 'engineering_planning') { onRunPlanning(); return; }
      if (stage === 'review_preparation') { onPrepareReview?.(); return; }
      if (stage === 'approval') { onRecordDecision?.(); return; }
      if (stage === 'implementation_coordination') { onBeginEngineering?.(); return; }
      if (stage === 'validation') { onRecordValidation?.(); return; }
      if (stage === 'knowledge_extraction') { onExtractKnowledge?.(); return; }
      if (stage === 'intelligence_update') { onCompleteIntelligence?.(); return; }
    }
    setSelectedStage(prev => prev === stage ? null : stage);
  };

  const stageDotColour = (stage: PipelineStage) => {
    const s = stageStatus(stage);
    if (s === 'complete') return 'bg-emerald-500 border-emerald-600 text-white';
    if (s === 'current') return 'bg-blue-500 border-blue-600 text-white ring-4 ring-blue-100';
    return 'bg-white border-slate-300 text-slate-400';
  };

  const stageBarColour = (stage: PipelineStage) => {
    const s = stageStatus(stage);
    if (s === 'complete') return 'bg-emerald-500';
    if (s === 'current') return 'bg-blue-400';
    return 'bg-slate-200';
  };

  return (
    <div className="space-y-4">
      {/* Pipeline header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold font-mono text-slate-400">{pipeline.pipeline_ref}</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${pipelineStatusCfg(pipeline.status).bg} ${pipelineStatusCfg(pipeline.status).colour}`}>
            {pipeline.status.replace(/_/g, ' ')}
          </span>
        </div>
        <span className="text-[10px] text-slate-400">
          {Math.round((currentIdx / (PIPELINE_STAGE_ORDER.length - 1)) * 100)}% complete
        </span>
      </div>

      {/* Stage dots */}
      <div className="relative">
        <div className="flex items-center gap-0">
          {visibleStages.map((stage, i) => {
            const cfg = STAGE_REGISTRY[stage];
            const isLast = i === visibleStages.length - 1;
            return (
              <React.Fragment key={stage}>
                <button
                  title={cfg.shortLabel}
                  onClick={() => handleStageClick(stage)}
                  className={`relative w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all hover:scale-110 ${stageDotColour(stage)} ${
                    stageStatus(stage) === 'current' ? 'cursor-pointer' : 'cursor-pointer'
                  }`}
                >
                  {stageStatus(stage) === 'complete' && <CheckCircle2 className="w-3 h-3" />}
                  {stageStatus(stage) === 'current' && <Play className="w-2.5 h-2.5" />}
                  {stageStatus(stage) === 'future' && <Circle className="w-2.5 h-2.5" />}
                  {selectedStage === stage && (
                    <span className="absolute -top-1.5 -right-1.5 w-2 h-2 bg-slate-900 rounded-full" />
                  )}
                </button>
                {!isLast && (
                  <div className={`flex-1 h-0.5 ${stageBarColour(stage)}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
        {/* Stage labels */}
        <div className="flex items-start mt-2 gap-0">
          {visibleStages.map((stage, i) => {
            const cfg = STAGE_REGISTRY[stage];
            const isLast = i === visibleStages.length - 1;
            return (
              <React.Fragment key={stage}>
                <div className="w-6 flex flex-col items-center shrink-0">
                  <span className={`text-[8px] font-medium text-center leading-tight ${
                    stage === pipeline.current_stage ? 'text-blue-600 font-bold' :
                    stageStatus(stage) === 'complete' ? 'text-emerald-600' : 'text-slate-400'
                  }`} style={{ width: 40, marginLeft: -17 }}>
                    {cfg.shortLabel}
                  </span>
                </div>
                {!isLast && <div className="flex-1" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Selected stage details */}
      {selectedStage && stageStatus(selectedStage) === 'complete' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <p className="text-xs font-bold text-emerald-800">{STAGE_REGISTRY[selectedStage].shortLabel} — Complete</p>
            </div>
            <button onClick={() => setSelectedStage(null)} className="p-0.5 text-emerald-400 hover:text-emerald-600">
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-xs text-emerald-700">{STAGE_REGISTRY[selectedStage].purpose}</p>
          {stageOutputLabel(selectedStage) && (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] font-semibold text-emerald-600 font-mono bg-emerald-100 px-2 py-0.5 rounded">
                {stageOutputLabel(selectedStage)}
              </span>
            </div>
          )}
        </div>
      )}

      {selectedStage && stageStatus(selectedStage) === 'future' && (
        <StageExplainerPanel stage={selectedStage} onClose={() => setSelectedStage(null)} />
      )}

      {/* Recommendation card for current stage */}
      {pipeline.status !== 'complete' && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-0.5">Next Recommended Action</p>
              <p className="text-sm font-bold text-blue-900">{recommendation.title}</p>
              <p className="text-xs text-blue-700 mt-1 leading-relaxed">{recommendation.body}</p>
            </div>
          </div>
          {recommendation.isActionable && recommendation.actionLabel && (
            <button
              onClick={() => {
                const ACTION_HANDLERS: Record<string, (() => void) | undefined> = {
                  run_analysis: onRunAnalysis,
                  run_planning: onRunPlanning,
                  prepare_review: onPrepareReview,
                  record_decision: onRecordDecision,
                  begin_engineering: onBeginEngineering,
                  record_validation: onRecordValidation,
                  extract_knowledge: onExtractKnowledge,
                  complete_intelligence: onCompleteIntelligence,
                };
                const handler = ACTION_HANDLERS[recommendation.actionKey];
                if (handler) {
                  handler();
                } else {
                  console.error(`[ATD Workspace] Action unavailable: "${recommendation.actionKey}" is not registered.`);
                  setActionError(`Action unavailable: "${recommendation.actionKey}" is not registered.`);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors w-full justify-center"
            >
              <Play className="w-3.5 h-3.5" />
              {recommendation.actionLabel}
            </button>
          )}
          {recommendation.isFuture && (
            <p className="text-[10px] text-blue-500 text-center">Complete prior stages to unlock this action.</p>
          )}
          {actionError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}
        </div>
      )}

      {pipeline.status === 'complete' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-xs font-semibold text-emerald-800">Pipeline complete — all engineering intelligence captured.</p>
        </div>
      )}
    </div>
  );
}

function PipelineView({ pipelines, loading, onRefresh }: {
  pipelines: PipelineExecution[];
  loading: boolean;
  onRefresh: () => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<PipelineExecution | null>(null);
  const [executions, setExecutions] = useState<CapabilityExecution[]>([]);
  const [exLoading, setExLoading] = useState(false);

  const loadExecutions = useCallback(async (pipelineId: string) => {
    setExLoading(true);
    try {
      const data = await ATDCapabilityFramework.listExecutions({ pipeline_execution_id: pipelineId });
      setExecutions(data);
    } finally {
      setExLoading(false);
    }
  }, []);

  const handleSelect = (p: PipelineExecution) => {
    setSelected(p);
    loadExecutions(p.id);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-5">
      {pipelines.length === 0 ? (
        <EmptyState
          icon={Terminal}
          title="No pipeline executions"
          body="Capture an engineering intent to start the first cognitive pipeline."
        />
      ) : (
        <>
          {pipelines.map(p => {
            const cfg = pipelineStatusCfg(p.status);
            const stageIdx = ATDCognitiveEngine.STAGE_ORDER.indexOf(p.current_stage);
            const progress = Math.round((stageIdx / (ATDCognitiveEngine.STAGE_ORDER.length - 1)) * 100);
            const isSelected = selected?.id === p.id;

            return (
              <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => isSelected ? setSelected(null) : handleSelect(p)}
                  className="w-full px-5 py-4 flex items-start justify-between text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold font-mono shrink-0 ${cfg.bg} ${cfg.colour} border border-current/20`}>
                      {p.pipeline_ref}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 capitalize">
                        {ATDCognitiveEngine.STAGE_LABELS[p.current_stage]}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{fmtDate(p.started_at)} · {fmtRelative(p.started_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-900">{progress}%</p>
                      <p className="text-[10px] text-slate-400">progress</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${cfg.bg} ${cfg.colour}`}>
                      {p.status.replace(/_/g, ' ')}
                    </span>
                    {isSelected ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                {/* Stage progress bar */}
                <div className="px-5 pb-3">
                  <div className="flex gap-1">
                    {ATDCognitiveEngine.STAGE_ORDER.filter(s => s !== 'complete').map((stage, i) => {
                      const done = i < stageIdx;
                      const current = stage === p.current_stage;
                      return (
                        <div key={stage} className="flex-1 group relative">
                          <div className={`h-1.5 rounded-full transition-all ${
                            done ? 'bg-emerald-500' : current ? 'bg-blue-500' : 'bg-slate-200'
                          }`} />
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                            {ATDCognitiveEngine.STAGE_LABELS[stage]}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[9px] text-slate-400">Intent Understanding</span>
                    <span className="text-[9px] text-slate-400">Intelligence Update</span>
                  </div>
                </div>

                {/* Capability executions */}
                {isSelected && (
                  <div className="border-t border-slate-100 px-5 py-4 bg-slate-50">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Capability Executions</p>
                    {exLoading ? (
                      <div className="flex items-center gap-2 py-3">
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        <span className="text-xs text-slate-400">Loading...</span>
                      </div>
                    ) : executions.length === 0 ? (
                      <p className="text-xs text-slate-400">No capability executions recorded.</p>
                    ) : (
                      <div className="space-y-2">
                        {executions.map(ex => (
                          <div key={ex.id} className="flex items-center gap-3 px-3 py-2 bg-white rounded-lg border border-slate-200">
                            {execStatusIcon(ex.status)}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-700">{ex.capability_key?.replace(/_/g, ' ')}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{ex.execution_ref}</p>
                            </div>
                            {ex.duration_ms !== null && (
                              <span className="text-[10px] text-slate-400">{ex.duration_ms}ms</span>
                            )}
                            {ex.provider_used && (
                              <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{ex.provider_used}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ─── Intents View ─────────────────────────────────────────────────────────────

function IntentsView({ intents, loading, onSelect }: {
  intents: EngineeringIntent[];
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>;
  }

  if (intents.length === 0) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <EmptyState icon={Target} title="No engineering intents" body="Capture your first intent to begin the cognitive pipeline." />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="space-y-3">
        {intents.map(intent => {
          const cfg = intentStatusCfg(intent.status);
          return (
            <button
              key={intent.id}
              onClick={() => onSelect(intent.id)}
              className="w-full bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-start justify-between hover:border-blue-300 hover:shadow-sm transition-all text-left group"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <Brain className="w-4 h-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold font-mono text-slate-400">{intent.intent_ref}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.pill} capitalize`}>
                      {intent.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{intent.title}</p>
                  {intent.raw_input && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{intent.raw_input}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-slate-400">{fmtRelative(intent.created_at)}</span>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Begin Engineering Gate (EWO-014.7) ──────────────────────────────────────

function BeginEngineeringGate({ plan, intent, onRefresh }: {
  plan: EngineeringPlan;
  intent: EngineeringIntent;
  onRefresh: () => void | Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BeginEngineeringResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [existingEwo, setExistingEwo] = useState<{ ewoId: string; ewoRef: string } | null>(null);

  // Check if an EWO already exists for this plan (duplicate protection)
  // EWO-014.7D: Always check — gate now renders for both 'approved' and 'implementing'
  useEffect(() => {
    findEwoForPlan(plan.plan_ref).then(setExistingEwo);
  }, [plan.status, plan.plan_ref]);

  const handleBegin = async () => {
    setLoading(true);
    setError(null);
    const res = await beginEngineering(plan, intent);
    setResult(res);
    if (res.success) {
      await onRefresh();
    } else {
      setError(res.error ?? 'Failed to begin engineering');
    }
    setLoading(false);
  };

  // Duplicate case: plan already implementing and EWO already exists
  if (existingEwo && !result?.success) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="h-4 w-4 text-amber-600" />
          <h4 className="text-sm font-semibold text-amber-800">Engineering Already In Progress</h4>
        </div>
        <p className="text-sm text-amber-700 mb-3">
          This Engineering Plan already has an Engineering Work Order{' '}
          <span className="font-mono font-bold">{existingEwo.ewoRef}</span>. No duplicate Work Order can be created.
        </p>
        <button
          onClick={() => {
            sessionStorage.setItem('ecc_navigate_to_work_orders', 'true');
            sessionStorage.setItem('ecc_selected_ewo_id', existingEwo.ewoId);
            window.dispatchEvent(new CustomEvent('ecc:navigateToWorkOrders'));
          }}
          className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          Go to Existing Work Order
        </button>
      </div>
    );
  }

  if (result?.success) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <h4 className="text-sm font-semibold text-emerald-800">
            {result.duplicate ? 'Engineering Work Order Already Exists' : 'Engineering Work Order Successfully Created'}
          </h4>
        </div>
        <div className="space-y-1.5 text-sm text-emerald-700">
          <p>Engineering Work Order <span className="font-mono font-bold">{result.ewoRef}</span> {result.duplicate ? 'already exists.' : 'created.'}</p>
          <p>Engineering Package v{result.packageVersion} {result.duplicate ? 'was' : ''} generated.</p>
          <p>Implementation Provider assigned: <span className="font-medium">{result.provider}</span>.</p>
          <p>Ready for implementation.</p>
        </div>
        <button
          onClick={() => {
            sessionStorage.setItem('ecc_navigate_to_work_orders', 'true');
            sessionStorage.setItem('ecc_selected_ewo_id', result.ewoId ?? '');
            window.dispatchEvent(new CustomEvent('ecc:navigateToWorkOrders'));
          }}
          className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          Go to Work Order
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
      <div className="flex items-center gap-2 mb-2">
        <Rocket className="h-4 w-4 text-blue-600" />
        <h4 className="text-sm font-semibold text-blue-800">Begin Engineering</h4>
      </div>
      <p className="text-sm text-blue-700 mb-3">
        This Engineering Plan has been approved. Begin Engineering to automatically create the
        Engineering Work Order, generate Engineering Package v1, and assign the implementation provider.
      </p>
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{error}</div>
      )}
      <button
        onClick={handleBegin}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Rocket className="h-4 w-4" />
        )}
        {loading ? 'Creating...' : 'Begin Engineering'}
      </button>
    </div>
  );
}

// ─── Intent Detail Panel ──────────────────────────────────────────────────────

function IntentDetailPanel({
  intentId,
  onClose,
  onExecute,
  onDeleted,
  onShowUndo,
  onRefresh,
  linkedIdeaRef: linkedIdeaRefProp,
  linkedIdeaId: linkedIdeaIdProp,
  initialSection,
}: {
  intentId: string;
  onClose: () => void;
  onExecute: (intentData: EngineeringIntent, planData: EngineeringPlan | null) => void;
  onDeleted?: () => void;
  onShowUndo?: (notif: UndoNotification) => void;
  onRefresh?: () => void | Promise<void>;
  linkedIdeaRef?: string | null;
  linkedIdeaId?: string | null;
  initialSection?: 'overview' | 'plan' | 'decisions' | 'validations' | 'knowledge';
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof ATDCognitiveEngine.getIntentWithPipeline>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<'overview' | 'plan' | 'decisions' | 'validations' | 'knowledge'>(initialSection ?? 'overview');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'intent' | 'plan'; id: string; ref: string; label: string } | null>(null);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [planningModalOpen, setPlanningModalOpen] = useState(false);
  const [prepareReviewLoading, setPrepareReviewLoading] = useState(false);
  const [prepareReviewError, setPrepareReviewError] = useState<string | null>(null);
  const [prepareReviewSuccess, setPrepareReviewSuccess] = useState<string | null>(null);

  // EWO-011.7: Refresh panel data without closing
  const refreshData = useCallback(async () => {
    await ATDCognitiveEngine.getIntentWithPipeline(intentId)
      .then(setData)
      .catch(console.error);
    onRefresh?.();
  }, [intentId, onRefresh]);

  // EWO-014.7A: Prepare Review handler — creates governed review request
  const handlePrepareReview = useCallback(async () => {
    if (!data?.intent || !data?.plan || !data?.pipeline) return;
    // Idempotency: check if a review already exists for this plan
    const existingReview = data.reviews?.find(
      r => r.plan_id === data.plan!.id && r.status !== 'cancelled'
    );
    if (existingReview) {
      setPrepareReviewSuccess(`Review already prepared: ${existingReview.request_ref}`);
      setPrepareReviewError(null);
      return;
    }
    setPrepareReviewLoading(true);
    setPrepareReviewError(null);
    setPrepareReviewSuccess(null);
    try {
      const review = await ATDCognitiveEngine.prepareReview({
        plan_id: data.plan.id,
        intent_id: data.intent.id,
        pipeline_execution_id: data.pipeline.id,
        reviewer_type: 'architecture',
      });
      setPrepareReviewSuccess(`Review package prepared: ${review.request_ref}`);
      refreshData();
    } catch (e: any) {
      const msg = e?.message ?? e?.error_description ?? (typeof e === 'string' ? e : 'Failed to prepare review');
      setPrepareReviewError(msg);
    } finally {
      setPrepareReviewLoading(false);
    }
  }, [data, refreshData]);

  // EWO-014.7B: Record Decision state
  const [recordDecisionOpen, setRecordDecisionOpen] = useState(false);
  const [recordDecisionLoading, setRecordDecisionLoading] = useState(false);
  const [recordDecisionError, setRecordDecisionError] = useState<string | null>(null);
  const [recordDecisionSuccess, setRecordDecisionSuccess] = useState<string | null>(null);
  const [existingDecision, setExistingDecision] = useState<EngineeringDecision | null>(null);

  // EWO-014.7B: Open the decision modal — loads existing decision for idempotency
  const handleRecordDecision = useCallback(async () => {
    if (!data?.intent || !data?.plan) return;
    setRecordDecisionOpen(true);
    setRecordDecisionError(null);
    // Check for existing decision
    const decisions = await ATDGovernanceService.listDecisionsForIntent(data.intent.id);
    if (decisions.length > 0) {
      // Map governance decision to EngineeringDecision shape for read-only display
      const d = decisions[0];
      setExistingDecision({
        id: d.id,
        decision_ref: d.decision_ref,
        intent_id: d.intent_id,
        pipeline_execution_id: null,
        stage: 'governance',
        decision_type: d.decision === 'approved' ? 'approve' : d.decision === 'approved_with_conditions' ? 'approve' : 'reject',
        rationale: d.notes ?? d.rejection_reason ?? d.conditions ?? '',
        made_by: d.decided_by,
        decided_at: d.decided_at,
        related_ewo_ref: null,
        conditions: d.conditions,
        created_at: d.created_at,
      } as EngineeringDecision);
    } else {
      setExistingDecision(null);
    }
  }, [data]);

  // EWO-014.7B: Submit governance decision
  const handleSubmitDecision = useCallback(async (decision: DecisionType, comments: string) => {
    if (!data?.intent || !data?.plan || !data?.pipeline) return;
    setRecordDecisionLoading(true);
    setRecordDecisionError(null);
    try {
      const result = await ATDCognitiveEngine.recordDecision({
        intent_id: data.intent.id,
        pipeline_execution_id: data.pipeline.id,
        stage: 'governance',
        decision_type: decision,
        rationale: comments || `Decision: ${decision}`,
        made_by: 'product_owner',
      });
      setRecordDecisionSuccess(`Decision recorded: ${result.decision_ref} — ${decision}`);
      setRecordDecisionOpen(false);
      refreshData();
    } catch (e: any) {
      const msg = e?.message ?? e?.error_description ?? (typeof e === 'string' ? e : 'Failed to record decision');
      setRecordDecisionError(msg);
      throw e;
    } finally {
      setRecordDecisionLoading(false);
    }
  }, [data, refreshData]);

  // EWO-014.7D: Begin Engineering — canonical EWO-014.7 orchestration
  const [beginEngLoading, setBeginEngLoading] = useState(false);
  const [beginEngError, setBeginEngError] = useState<string | null>(null);
  const [beginEngSuccess, setBeginEngSuccess] = useState<string | null>(null);

  const handleBeginEngineering = useCallback(async () => {
    if (!data?.intent || !data?.plan) return;
    // Idempotency: check if EWO already exists for this plan
    const existing = await findEwoForPlan(data.plan.plan_ref);
    if (existing) {
      setBeginEngSuccess(`Engineering already started — EWO ${existing.ewoRef} exists. Opening Plan tab...`);
      setSection('plan');
      return;
    }
    setBeginEngLoading(true);
    setBeginEngError(null);
    setBeginEngSuccess(null);
    try {
      const res = await beginEngineering(data.plan, data.intent);
      if (res.success && res.ewoRef) {
        setBeginEngSuccess(`EWO ${res.ewoRef} created. Package v${res.packageVersion ?? 1} generated. Provider assigned: ${res.provider ?? 'Implementation Engine'}.`);
        setSection('plan');
      } else {
        setBeginEngError(res.error ?? 'Failed to begin engineering');
      }
      await refreshData();
    } catch (e: any) {
      const msg = e?.message ?? e?.error_description ?? (typeof e === 'string' ? e : 'Failed to begin engineering');
      setBeginEngError(msg);
    } finally {
      setBeginEngLoading(false);
    }
  }, [data, refreshData]);

  // EWO-014.7D: Record Validation
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationSuccess, setValidationSuccess] = useState<string | null>(null);

  const handleRecordValidation = useCallback(async () => {
    if (!data?.intent || !data?.pipeline) return;
    // Idempotency: check for existing passed validation
    const existing = data.validations?.find(v => v.outcome === 'passed');
    if (existing) {
      setValidationSuccess(`Validation already recorded: ${existing.validation_ref}.`);
      return;
    }
    setValidationLoading(true);
    setValidationError(null);
    setValidationSuccess(null);
    try {
      const result = await ATDCognitiveEngine.recordValidation({
        intent_id: data.intent.id,
        pipeline_execution_id: data.pipeline.id,
        validation_type: 'engineering',
        outcome: 'passed',
        validated_by: 'product_owner',
        notes: 'Validation passed during PO testing.',
      });
      setValidationSuccess(`Validation recorded: ${result.validation_ref}`);
      refreshData();
    } catch (e: any) {
      const msg = e?.message ?? e?.error_description ?? (typeof e === 'string' ? e : 'Failed to record validation');
      setValidationError(msg);
    } finally {
      setValidationLoading(false);
    }
  }, [data, refreshData]);

  // EWO-014.7D: Extract Knowledge
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [knowledgeSuccess, setKnowledgeSuccess] = useState<string | null>(null);

  const handleExtractKnowledge = useCallback(async () => {
    if (!data?.intent || !data?.pipeline) return;
    // Idempotency: check for existing knowledge records
    if (data.knowledge && data.knowledge.length > 0) {
      setKnowledgeSuccess(`Knowledge already extracted: ${data.knowledge.length} record(s) exist.`);
      return;
    }
    setKnowledgeLoading(true);
    setKnowledgeError(null);
    setKnowledgeSuccess(null);
    try {
      const results = await ATDCognitiveEngine.extractKnowledge({
        intent_id: data.intent.id,
        pipeline_execution_id: data.pipeline.id,
        records: [{
          knowledge_type: 'pattern',
          title: `Pattern: ${data.intent.title}`,
          content: `Engineering pattern extracted from intent ${data.intent.intent_ref}.`,
          tags: ['auto-extracted'],
          relevance_score: 80,
        }],
      });
      setKnowledgeSuccess(`Knowledge extracted: ${results.length} record(s) created.`);
      refreshData();
    } catch (e: any) {
      const msg = e?.message ?? e?.error_description ?? (typeof e === 'string' ? e : 'Failed to extract knowledge');
      setKnowledgeError(msg);
    } finally {
      setKnowledgeLoading(false);
    }
  }, [data, refreshData]);

  // EWO-014.7D: Complete Intelligence Update
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null);
  const [intelligenceSuccess, setIntelligenceSuccess] = useState<string | null>(null);

  const handleCompleteIntelligence = useCallback(async () => {
    if (!data?.intent || !data?.pipeline) return;
    setIntelligenceLoading(true);
    setIntelligenceError(null);
    setIntelligenceSuccess(null);
    try {
      await ATDCognitiveEngine.completeIntelligenceUpdate(data.intent.id, data.pipeline.id);
      setIntelligenceSuccess('Intelligence update complete. Pipeline finished.');
      refreshData();
    } catch (e: any) {
      const msg = e?.message ?? e?.error_description ?? (typeof e === 'string' ? e : 'Failed to complete intelligence update');
      setIntelligenceError(msg);
    } finally {
      setIntelligenceLoading(false);
    }
  }, [data, refreshData]);

  const [dbLinkedIdeaRef, setDbLinkedIdeaRef] = useState<string | null>(null);
  const [dbLinkedIdeaId,  setDbLinkedIdeaId]  = useState<string | null>(null);

  useEffect(() => {
    ATDCognitiveEngine.getIntentWithPipeline(intentId)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));

    // EWO-011.2A: Query DB for linked Engineering Idea (persists after page reload)
    supabase
      .from('engineering_idea')
      .select('id, idea_ref')
      .eq('intent_id', intentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data: row }) => {
        if (row) {
          setDbLinkedIdeaRef(row.idea_ref);
          setDbLinkedIdeaId(row.id);
        }
      });
  }, [intentId]);

  // Prop takes precedence during the same session (instant update); DB result is fallback
  const linkedIdeaRef = linkedIdeaRefProp ?? dbLinkedIdeaRef;
  const linkedIdeaId  = linkedIdeaIdProp  ?? dbLinkedIdeaId;

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-xl p-8 flex items-center gap-3">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          <span className="text-sm font-medium text-slate-700">Loading intent...</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { intent, pipeline, analysis, plan, decisions, reviews, validations, knowledge } = data;
  const cfg = intentStatusCfg(intent.status);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-end bg-black/50">
      <div className="bg-white w-full max-w-2xl h-full md:h-auto md:max-h-[90vh] flex flex-col shadow-2xl md:rounded-xl md:mr-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold font-mono text-slate-400 shrink-0">{intent.intent_ref}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.pill} capitalize shrink-0`}>
              {intent.status.replace(/_/g, ' ')}
            </span>
            <p className="text-sm font-bold text-slate-900 truncate">{intent.title}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setDeleteTarget({ type: 'intent', id: intent.id, ref: intent.intent_ref, label: intent.title })}
              className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
              title="Delete Intent"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-slate-100 shrink-0 overflow-x-auto">
          {([
            ['overview', 'Overview'],
            ['plan', `Plan${plan ? '' : ''}`],
            ['decisions', `Decisions (${decisions.length})`],
            ['validations', `Validation (${validations.length})`],
            ['knowledge', `Knowledge (${knowledge.length})`],
          ] as [typeof section, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                section === key ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          {section === 'overview' && (
            <>
              <DetailSection label="Raw Intent">{intent.raw_input}</DetailSection>
              {intent.requested_outcome && <DetailSection label="Requested Outcome">{intent.requested_outcome}</DetailSection>}
              {intent.business_objective && <DetailSection label="Business Objective">{intent.business_objective}</DetailSection>}
              {intent.engineering_objective && <DetailSection label="Engineering Objective">{intent.engineering_objective}</DetailSection>}
              {intent.scope && <DetailSection label="Scope">{intent.scope}</DetailSection>}
              {intent.constraints && <DetailSection label="Constraints">{intent.constraints}</DetailSection>}

              {/* EWO-011.2: Linked Engineering Idea (conversation continuity) */}
              {linkedIdeaRef && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Link2 className="w-3.5 h-3.5 text-emerald-600" />
                    <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Linked Engineering Idea</p>
                  </div>
                  <p className="text-sm font-semibold text-emerald-900 font-mono">{linkedIdeaRef}</p>
                  <p className="text-xs text-emerald-700 mt-1">
                    Created through the Constitutional Execution Platform via EWO-011.2 bridge.
                    Intent, Objective, Session, Similarity Review, Evidence, Engineering Record and Memory have all been recorded.
                  </p>
                </div>
              )}
              {/* EWO-011.7: Interactive Pipeline Widget */}
              {pipeline && (
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <Terminal className="w-3 h-3" />
                    Cognitive Pipeline
                  </p>
                  <InteractivePipelineWidget
                    pipeline={pipeline}
                    data={data}
                    onRunAnalysis={() => setAnalysisModalOpen(true)}
                    onRunPlanning={() => setPlanningModalOpen(true)}
                    onPrepareReview={handlePrepareReview}
                    onRecordDecision={handleRecordDecision}
                    onBeginEngineering={handleBeginEngineering}
                    onRecordValidation={handleRecordValidation}
                    onExtractKnowledge={handleExtractKnowledge}
                    onCompleteIntelligence={handleCompleteIntelligence}
                    onRefreshed={refreshData}
                  />
                  {(prepareReviewLoading || prepareReviewError || prepareReviewSuccess) && (
                    <div className="mt-3">
                      {prepareReviewLoading && (
                        <div className="flex items-center gap-2 text-sm text-blue-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Preparing review package...
                        </div>
                      )}
                      {prepareReviewError && (
                        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{prepareReviewError}</span>
                        </div>
                      )}
                      {prepareReviewSuccess && (
                        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-700">
                          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{prepareReviewSuccess}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {(recordDecisionLoading || recordDecisionError || recordDecisionSuccess) && (
                    <div className="mt-3">
                      {recordDecisionLoading && (
                        <div className="flex items-center gap-2 text-sm text-blue-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Recording governance decision...
                        </div>
                      )}
                      {recordDecisionError && (
                        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{recordDecisionError}</span>
                        </div>
                      )}
                      {recordDecisionSuccess && (
                        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-700">
                          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{recordDecisionSuccess}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {(beginEngLoading || beginEngError || beginEngSuccess) && (
                    <div className="mt-3">
                      {beginEngLoading && (
                        <div className="flex items-center gap-2 text-sm text-blue-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Beginning engineering...
                        </div>
                      )}
                      {beginEngError && (
                        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{beginEngError}</span>
                        </div>
                      )}
                      {beginEngSuccess && (
                        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-700">
                          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{beginEngSuccess}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {(validationLoading || validationError || validationSuccess) && (
                    <div className="mt-3">
                      {validationLoading && (
                        <div className="flex items-center gap-2 text-sm text-blue-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Recording validation...
                        </div>
                      )}
                      {validationError && (
                        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{validationError}</span>
                        </div>
                      )}
                      {validationSuccess && (
                        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-700">
                          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{validationSuccess}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {(knowledgeLoading || knowledgeError || knowledgeSuccess) && (
                    <div className="mt-3">
                      {knowledgeLoading && (
                        <div className="flex items-center gap-2 text-sm text-blue-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Extracting knowledge...
                        </div>
                      )}
                      {knowledgeError && (
                        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{knowledgeError}</span>
                        </div>
                      )}
                      {knowledgeSuccess && (
                        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-700">
                          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{knowledgeSuccess}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {(intelligenceLoading || intelligenceError || intelligenceSuccess) && (
                    <div className="mt-3">
                      {intelligenceLoading && (
                        <div className="flex items-center gap-2 text-sm text-blue-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Completing intelligence update...
                        </div>
                      )}
                      {intelligenceError && (
                        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{intelligenceError}</span>
                        </div>
                      )}
                      {intelligenceSuccess && (
                        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-700">
                          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>{intelligenceSuccess}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {analysis && (
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Analysis · {analysis.analysis_ref}</p>
                  {analysis.summary && <p className="text-sm text-slate-700 mb-2">{analysis.summary}</p>}
                  {analysis.complexity_assessment && (
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                      analysis.complexity_assessment === 'critical' ? 'bg-red-100 text-red-700' :
                      analysis.complexity_assessment === 'high' ? 'bg-amber-100 text-amber-700' :
                      analysis.complexity_assessment === 'medium' ? 'bg-blue-100 text-blue-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      {analysis.complexity_assessment} complexity
                    </span>
                  )}
                </div>
              )}
            </>
          )}

          {section === 'plan' && (
            plan ? (
              <>
                <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 font-mono">{plan.plan_ref}</span>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                      plan.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                      plan.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{plan.status.replace(/_/g, ' ')}</span>
                    <button
                      onClick={() => setDeleteTarget({ type: 'plan', id: plan.id, ref: plan.plan_ref, label: plan.executive_summary?.slice(0, 40) ?? plan.plan_ref })}
                      className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                      title="Delete Plan"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {plan.executive_summary && <DetailSection label="Executive Summary">{plan.executive_summary}</DetailSection>}
                {plan.engineering_strategy && <DetailSection label="Engineering Strategy">{plan.engineering_strategy}</DetailSection>}
                {plan.recommended_approach && <DetailSection label="Recommended Approach">{plan.recommended_approach}</DetailSection>}
                {plan.estimated_effort && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-700">Estimated effort: <strong>{plan.estimated_effort}</strong></span>
                  </div>
                )}
                {plan.required_ewos.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Required EWOs</p>
                    <div className="flex flex-wrap gap-1.5">
                      {plan.required_ewos.map(ref => (
                        <span key={ref} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-mono font-semibold rounded border border-blue-100">{ref}</span>
                      ))}
                    </div>
                  </div>
                )}
                {plan.engineering_phases.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Engineering Phases</p>
                    <div className="space-y-2">
                      {plan.engineering_phases.map(phase => (
                        <div key={phase.phase} className="flex items-start gap-3 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="text-xs font-bold text-slate-400 shrink-0 mt-0.5">P{phase.phase}</span>
                          <div>
                            <p className="text-xs font-semibold text-slate-700">{phase.name}</p>
                            <p className="text-xs text-slate-500">{phase.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* EWO-011.2: Execution Decision Gate */}
              <div className={`rounded-xl border p-4 ${
                linkedIdeaRef
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    linkedIdeaRef ? 'bg-emerald-100' : 'bg-blue-100'
                  }`}>
                    {linkedIdeaRef
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      : <Rocket className="w-4 h-4 text-blue-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    {linkedIdeaRef || plan.status === 'implementing' ? (
                      <>
                        <p className="text-sm font-bold text-emerald-800">Engineering Idea Executed</p>
                        <p className="text-xs text-emerald-700 mt-0.5">
                          This intent has been executed through the Constitutional Execution Platform.
                          Engineering Idea <span className="font-mono font-bold">{linkedIdeaRef}</span> has been created.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-slate-800">Execute this Engineering Idea?</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          The ATD has reviewed this intent and generated an Engineering Plan.
                          Would you like to execute this through the Engineering Execution Platform?
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => onExecute(intent, plan)}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition-colors"
                          >
                            <Rocket className="w-3.5 h-3.5" />
                            Execute Engineering Idea
                          </button>
                          <button
                            onClick={onClose}
                            className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                          >
                            Revise / Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* EWO-014.7: Begin Engineering — auto-creates EWO from approved plan */}
              {/* EWO-014.7D: Gate renders for 'approved' AND 'implementing' so the */}
              {/* amber "Engineering Already In Progress" state is always visible */}
              {(plan.status === 'approved' || plan.status === 'implementing') && (
                <BeginEngineeringGate
                  plan={plan}
                  intent={intent}
                  onRefresh={refreshData}
                />
              )}

            </>
            ) : (
              <div className="space-y-4">
                <EmptyState icon={FileText} title="No plan generated" body={
                  pipeline?.current_stage === 'engineering_analysis'
                    ? 'Next step: run Engineering Analysis via the workspace wizard. Once complete, Engineering Planning can be run to generate a plan.'
                    : pipeline?.current_stage === 'engineering_planning'
                    ? 'Next step: run Engineering Planning via the workspace wizard to generate a plan.'
                    : 'Run Engineering Analysis then Engineering Planning via the workspace wizard to generate an engineering plan.'
                } />
                {/* Direct action buttons on the plan tab so users never hunt for the entry point */}
                {pipeline?.current_stage === 'engineering_analysis' && (
                  <button
                    onClick={() => setAnalysisModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors w-full justify-center"
                  >
                    <Microscope className="w-4 h-4" />
                    Run Engineering Analysis
                  </button>
                )}
                {pipeline?.current_stage === 'engineering_planning' && (
                  <button
                    onClick={() => setPlanningModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors w-full justify-center"
                  >
                    <FileText className="w-4 h-4" />
                    Generate Engineering Plan
                  </button>
                )}
              </div>
            )
          )}

          {section === 'decisions' && (
            decisions.length === 0
              ? <EmptyState icon={CheckCheck} title="No decisions" body="Governance decisions will appear here." />
              : <div className="space-y-2">
                  {decisions.map(d => (
                    <div key={d.id} className="px-3 py-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono text-slate-400">{d.decision_ref}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                          d.decision_type === 'approve' ? 'bg-emerald-100 text-emerald-700' :
                          d.decision_type === 'reject' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>{d.decision_type.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="text-xs text-slate-700">{d.rationale}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{d.made_by} · {d.stage} · {fmtDate(d.decided_at)}</p>
                    </div>
                  ))}
                </div>
          )}

          {section === 'validations' && (
            validations.length === 0
              ? <EmptyState icon={Shield} title="No validations" body="Validation results will appear here after engineering work is validated." />
              : <div className="space-y-2">
                  {validations.map(v => (
                    <div key={v.id} className="px-3 py-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-700 capitalize">{v.validation_type}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                          v.outcome === 'passed' ? 'bg-emerald-100 text-emerald-700' :
                          v.outcome === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>{v.outcome}</span>
                      </div>
                      {v.notes && <p className="text-xs text-slate-600">{v.notes}</p>}
                    </div>
                  ))}
                </div>
          )}

          {section === 'knowledge' && (
            knowledge.length === 0
              ? <EmptyState icon={BookOpen} title="No knowledge extracted" body="Reusable patterns, lessons, and recommendations will appear here." />
              : <div className="space-y-2">
                  {knowledge.map(k => (
                    <div key={k.id} className="px-3 py-3 bg-slate-50 rounded-lg border border-slate-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-700">{k.title}</span>
                        <span className="text-[10px] font-semibold text-slate-400 capitalize bg-slate-200 px-1.5 py-0.5 rounded">{k.knowledge_type.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="text-xs text-slate-600">{k.content}</p>
                      {k.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {k.tags.map(t => <span key={t} className="px-1.5 py-0.5 text-[10px] text-blue-600 bg-blue-50 rounded">{t}</span>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
          )}
        </div>
      </div>

      {/* EWO-011.4B: Lifecycle Confirm Modal */}
      {deleteTarget && (
        <LifecycleConfirmModal
          objectType={deleteTarget.type}
          objectId={deleteTarget.id}
          objectRef={deleteTarget.ref}
          objectLabel={deleteTarget.label}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async (cascade, dependents, reason) => {
            await deleteObject({
              objectType: deleteTarget.type,
              objectId: deleteTarget.id,
              reason: reason || 'No reason provided.',
              cascade,
              cascadeDependents: dependents,
            });

            // Write Engineering Intelligence timeline event
            await supabase.from('ecc_engineering_audit').insert({
              event_type: deleteTarget.type === 'intent' ? 'intent_deleted' : 'plan_deleted',
              event_label: `${deleteTarget.type === 'intent' ? 'Intent' : 'Plan'} Deleted: ${deleteTarget.label.slice(0, 60)}`,
              entity_type: `engineering_${deleteTarget.type}`,
              entity_id: deleteTarget.id,
              entity_title: deleteTarget.label,
              metadata: {
                ref: deleteTarget.ref,
                reason: reason || null,
                cascade,
                cascade_count: dependents.length,
                source: 'IntentDetailPanel',
              },
            }).then(() => {});

            const capturedTarget = { ...deleteTarget };
            setDeleteTarget(null);

            if (capturedTarget.type === 'intent') {
              onDeleted?.();
              onClose();
              // Offer undo
              onShowUndo?.({
                message: `"${capturedTarget.label.slice(0, 40)}" deleted.`,
                objectType: 'intent',
                objectId: capturedTarget.id,
                objectRef: capturedTarget.ref,
                onUndo: async () => {
                  await restoreObject({ objectType: 'intent', objectId: capturedTarget.id, reason: 'Undone by user.' });
                  await supabase.from('ecc_engineering_audit').insert({
                    event_type: 'intent_restored',
                    event_label: `Intent Restored (Undo): ${capturedTarget.label.slice(0, 60)}`,
                    entity_type: 'engineering_intent',
                    entity_id: capturedTarget.id,
                    entity_title: capturedTarget.label,
                    metadata: { source: 'UndoToast', from_status: 'deleted' },
                  }).then(() => {});
                },
              });
            } else {
              // Reload the panel to reflect the deleted plan
              ATDCognitiveEngine.getIntentWithPipeline(intentId)
                .then(setData)
                .catch(console.error);
              // Offer undo for plan deletion
              onShowUndo?.({
                message: `Plan "${capturedTarget.ref}" deleted.`,
                objectType: 'plan',
                objectId: capturedTarget.id,
                objectRef: capturedTarget.ref,
                onUndo: async () => {
                  await restoreObject({ objectType: 'plan', objectId: capturedTarget.id, reason: 'Undone by user.' });
                  await supabase.from('ecc_engineering_audit').insert({
                    event_type: 'plan_restored',
                    event_label: `Plan Restored (Undo): ${capturedTarget.ref}`,
                    entity_type: 'engineering_plan',
                    entity_id: capturedTarget.id,
                    entity_title: capturedTarget.label,
                    metadata: { source: 'UndoToast', from_status: 'deleted' },
                  }).then(() => {});
                },
              });
            }
          }}
        />
      )}

      {/* EWO-011.7: Engineering Analysis modal */}
      {analysisModalOpen && data?.pipeline && (
        <RunAnalysisModal
          intentId={data.intent.id}
          pipelineExecutionId={data.pipeline.id}
          onClose={() => setAnalysisModalOpen(false)}
          onComplete={() => {
            setAnalysisModalOpen(false);
            refreshData();
            setSection('overview');
          }}
        />
      )}

      {/* EWO-011.7: Engineering Planning modal */}
      {planningModalOpen && data?.pipeline && data?.analysis && (
        <RunPlanningModal
          intentId={data.intent.id}
          analysisId={data.analysis.id}
          pipelineExecutionId={data.pipeline.id}
          onClose={() => setPlanningModalOpen(false)}
          onComplete={() => {
            setPlanningModalOpen(false);
            refreshData();
            setSection('plan');
          }}
        />
      )}
      {recordDecisionOpen && data?.intent && data?.plan && (
        <RecordDecisionModal
          intentRef={data.intent.intent_ref ?? data.intent.id}
          planRef={data.plan.plan_ref ?? data.plan.id}
          existingDecision={existingDecision}
          onClose={() => setRecordDecisionOpen(false)}
          onSubmit={handleSubmitDecision}
        />
      )}
    </div>
  );
}

function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{label}</p>
      <p className="text-sm text-slate-700 leading-relaxed">{children}</p>
    </div>
  );
}

// ─── Capabilities View ────────────────────────────────────────────────────────

function CapabilitiesView({ capabilities }: { capabilities: Capability[] }) {
  const categories = [...new Set(capabilities.map(c => c.category))].sort();

  return (
    <div className="flex-1 overflow-auto p-6 space-y-5">
      {categories.map(cat => {
        const caps = capabilities.filter(c => c.category === cat);
        const colourCls = ATDCapabilityFramework.getCategoryColour(cat as Capability['category']);
        return (
          <div key={cat}>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 capitalize">{cat}</p>
            <div className="grid md:grid-cols-2 gap-3">
              {caps.map(cap => (
                <div key={cap.capability_key} className={`rounded-xl border p-4 ${colourCls.split(' ').filter(c => c.startsWith('bg-') || c.startsWith('border-')).join(' ')}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className={`text-sm font-semibold ${colourCls.split(' ').find(c => c.startsWith('text-'))}`}>{cap.name}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {cap.is_active
                        ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        : <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />}
                      <span className="text-[9px] text-slate-500">v{cap.version}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">{cap.description}</p>
                  <span className="text-[10px] text-slate-500 bg-slate-800/40 px-1.5 py-0.5 rounded border border-slate-700/40">
                    {ATDCapabilityFramework.getProviderLabel(cap.provider_type as Capability['provider_type'])}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Knowledge View ───────────────────────────────────────────────────────────

function KnowledgeView({ records, loading }: { records: KnowledgeRecord[]; loading: boolean }) {
  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>;

  const typeColour: Record<string, string> = {
    pattern:                  'bg-blue-50 text-blue-700 border-blue-100',
    lesson:                   'bg-amber-50 text-amber-700 border-amber-100',
    standard:                 'bg-emerald-50 text-emerald-700 border-emerald-100',
    architecture_improvement: 'bg-orange-50 text-orange-700 border-orange-100',
    recommendation:           'bg-teal-50 text-teal-700 border-teal-100',
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      {records.length === 0 ? (
        <EmptyState icon={BookOpen} title="No knowledge records" body="Engineering knowledge is extracted automatically as pipelines complete." />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {records.map(k => (
            <div key={k.id} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="text-sm font-semibold text-slate-900">{k.title}</p>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border capitalize shrink-0 ${typeColour[k.knowledge_type] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                  {k.knowledge_type.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-xs text-slate-600 mb-3 line-clamp-3">{k.content}</p>
              <div className="flex items-center justify-between">
                {k.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {k.tags.map(t => <span key={t} className="px-1.5 py-0.5 text-[10px] text-blue-600 bg-blue-50 rounded border border-blue-100">{t}</span>)}
                  </div>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  <BarChart3 className="w-3 h-3 text-slate-400" />
                  <span className="text-[10px] text-slate-500">{k.relevance_score}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Decisions View ───────────────────────────────────────────────────────────

function DecisionsView({ decisions, loading }: { decisions: EngineeringDecision[]; loading: boolean }) {
  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>;

  const decisionCfg: Record<string, { bg: string; text: string }> = {
    approve:         { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    reject:          { bg: 'bg-red-100',     text: 'text-red-700'     },
    defer:           { bg: 'bg-slate-100',   text: 'text-slate-600'   },
    escalate:        { bg: 'bg-amber-100',   text: 'text-amber-700'   },
    request_changes: { bg: 'bg-orange-100',  text: 'text-orange-700'  },
    accept_risk:     { bg: 'bg-teal-100',    text: 'text-teal-700'    },
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      {decisions.length === 0 ? (
        <EmptyState icon={CheckCheck} title="No engineering decisions" body="Governance decisions made during pipeline execution will appear here." />
      ) : (
        <div className="space-y-3">
          {decisions.map(d => {
            const cfg = decisionCfg[d.decision_type] ?? decisionCfg.defer;
            return (
              <div key={d.id} className="bg-white rounded-xl border border-slate-200 shadow-sm px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono text-slate-400">{d.decision_ref}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${cfg.bg} ${cfg.text}`}>
                        {d.decision_type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] text-slate-400 capitalize bg-slate-100 px-1.5 py-0.5 rounded">{d.stage}</span>
                    </div>
                    <p className="text-sm text-slate-700">{d.rationale}</p>
                    {d.conditions && <p className="text-xs text-slate-500 mt-1">Conditions: {d.conditions}</p>}
                    {d.related_ewo_ref && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-[10px] text-blue-700 bg-blue-50 border border-blue-100 rounded font-mono">
                        {d.related_ewo_ref}
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-slate-700">{d.made_by}</p>
                    <p className="text-[10px] text-slate-400">{fmtDate(d.decided_at)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, body }: { icon: typeof Brain; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-slate-400" />
      </div>
      <p className="text-base font-semibold text-slate-700 mb-1">{title}</p>
      <p className="text-sm text-slate-400 max-w-xs">{body}</p>
    </div>
  );
}

// ─── Header stats strip ───────────────────────────────────────────────────────

function StatsStrip({
  intents, pipelines, knowledge, decisions,
}: {
  intents: EngineeringIntent[];
  pipelines: PipelineExecution[];
  knowledge: KnowledgeRecord[];
  decisions: EngineeringDecision[];
}) {
  const active = pipelines.filter(p => p.status === 'running' || p.status === 'waiting_approval').length;
  const complete = intents.filter(i => i.status === 'complete').length;
  const pending = intents.filter(i => i.status === 'in_review' || i.status === 'planned').length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-b border-slate-800/60 shrink-0">
      {[
        { label: 'Total Intents',     value: intents.length,      icon: Target,    colour: 'text-blue-400' },
        { label: 'Active Pipelines',  value: active,              icon: Activity,  colour: 'text-emerald-400' },
        { label: 'Awaiting Action',   value: pending,             icon: Clock,     colour: 'text-amber-400' },
        { label: 'Knowledge Records', value: knowledge.length,    icon: BookOpen,  colour: 'text-teal-400' },
      ].map(({ label, value, icon: Icon, colour }) => (
        <div key={label} className="px-5 py-3 flex items-center gap-3 border-r border-slate-800/40 last:border-r-0">
          <Icon className={`w-4 h-4 ${colour} shrink-0`} />
          <div>
            <p className="text-lg font-bold text-white leading-none">{value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ECCATDWorkspacePage({
  workspaceMode,
  activeProject,
}: {
  workspaceMode?: WorkspaceMode;
  activeProject?: EccProject | null;
}) {
  // Derive ActiveContext from workspace props
  const activeContext: ActiveContext = React.useMemo(() => {
    if (!workspaceMode || workspaceMode === 'platform' || !activeProject) {
      return { context_type: 'platform', context_id: 'platform', project_id: null, label: 'Platform' };
    }
    return {
      context_type: 'project',
      context_id: activeProject.id,
      project_id: activeProject.id,
      label: activeProject.name,
    };
  }, [workspaceMode, activeProject]);
  const [tab, setTab] = useState<WorkspaceTab>('pipeline');
  const [capturing, setCapturing] = useState(false);
  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(null);
  const [intentInitialSection, setIntentInitialSection] = useState<'overview' | 'plan' | undefined>(undefined);
  // EWO-011.4A: pending intent stored in sessionStorage by navigateToIntent()
  const [pendingIntentId, setPendingIntentId] = useState<string | null>(() => {
    const id = sessionStorage.getItem('atd_pending_intent');
    if (id) sessionStorage.removeItem('atd_pending_intent');
    return id;
  });

  // EWO-011.4B: Undo support — auto-expires after 8 seconds
  const [undoNotification, setUndoNotification] = useState<UndoNotification | null>(null);
  const undoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showUndo = useCallback((notif: UndoNotification) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoNotification(notif);
    undoTimerRef.current = setTimeout(() => setUndoNotification(null), 8000);
  }, []);

  const dismissUndo = useCallback(() => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoNotification(null);
  }, []);

  // EWO-011.2: Execution bridge state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardPrefill, setWizardPrefill] = useState<Partial<WizardState> | undefined>(undefined);
  // Map of intentId → completed idea ref/id for same-session fast update (cache)
  const [linkedIdeas, setLinkedIdeas] = useState<Record<string, { ref: string; id: string }>>({});
  // Increment to force IntentDetailPanel to re-mount and re-query DB after wizard completes
  const [panelRefreshKey, setPanelRefreshKey] = useState(0);

  const [intents, setIntents]       = useState<EngineeringIntent[]>([]);
  const [pipelines, setPipelines]   = useState<PipelineExecution[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [knowledge, setKnowledge]   = useState<KnowledgeRecord[]>([]);
  const [decisions, setDecisions]   = useState<EngineeringDecision[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const ctx = { context_type: activeContext.context_type, context_id: activeContext.context_id };
      const [i, p, c, k, d] = await Promise.all([
        ATDCognitiveEngine.listIntents(30, ctx),
        ATDCognitiveEngine.listPipelines(20, ctx),
        ATDCapabilityFramework.listCapabilities(),
        ATDCognitiveEngine.listKnowledge(30, ctx),
        ATDCognitiveEngine.listDecisions(30, ctx),
      ]);
      setIntents(i);
      setPipelines(p);
      setCapabilities(c);
      setKnowledge(k);
      setDecisions(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [activeContext]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Clear selected session when context changes to prevent cross-context detail panel
  useEffect(() => {
    setSelectedIntentId(null);
    setIntentInitialSection(undefined);
  }, [activeContext.context_type, activeContext.context_id]);

  // EWO-011.6: Listen for atd:openIntent events dispatched by navigateToIntent()
  // when this workspace is already mounted (hash navigation is a no-op in that case).
  useEffect(() => {
    const handler = (e: Event) => {
      const intentId = (e as CustomEvent<{ intentId: string }>).detail?.intentId;
      if (intentId) setPendingIntentId(intentId);
    };
    window.addEventListener('atd:openIntent', handler);
    return () => window.removeEventListener('atd:openIntent', handler);
  }, []);

  // EWO-011.4A: After data is loaded, apply pending deep-link from sessionStorage
  useEffect(() => {
    if (loading || !pendingIntentId) return;
    const intent = intents.find(i => i.id === pendingIntentId);
    setSelectedIntentId(pendingIntentId);
    setTab('intents');
    // Destination tab: Plan only if plan exists (status implies it), else Overview
    const hasPlan = intent
      ? !['captured', 'analysing', 'analysed'].includes(intent.status)
      : false;
    setIntentInitialSection(hasPlan ? 'plan' : 'overview');
    setPendingIntentId(null);
  }, [loading, pendingIntentId, intents]);

  // EWO-011.2: Launch wizard from ATD — prefill from intent + plan data
  const handleExecuteFromATD = useCallback((intent: EngineeringIntent, plan: EngineeringPlan | null) => {
    const prefill: Partial<WizardState> = {
      intent: {
        title:           intent.title,
        description:     intent.raw_input ?? '',
        business_driver: intent.business_objective ?? '',
        priority:        'medium',
        programme:       'EIOS',
      },
      objective: {
        title:           plan?.executive_summary ? `Deliver: ${intent.title}` : intent.title,
        description:     plan?.engineering_strategy ?? intent.engineering_objective ?? '',
        success_metrics: plan?.recommended_approach ? [plan.recommended_approach] : [''],
      },
      strategy: {
        strategy_type: 'incremental',
        approach:      plan?.engineering_strategy ?? intent.engineering_objective ?? '',
        success_criteria: plan?.recommended_approach ? [plan.recommended_approach] : [''],
      },
      idea: {
        title:        intent.title,
        description:  intent.raw_input ?? '',
        category:     'general',
        priority:     'medium',
        tags:         [],
        products:     ['EIOS Platform'],
        applications: ['EIOS Engineering Control Centre'],
      },
    };
    setWizardPrefill(prefill);
    setWizardOpen(true);
  }, []);

  // EWO-011.2: Wizard completion — record session-level linkage cache and refresh
  const handleWizardComplete = useCallback((ideaRef: string, ideaId: string) => {
    if (selectedIntentId) {
      setLinkedIdeas(prev => ({ ...prev, [selectedIntentId]: { ref: ideaRef, id: ideaId } }));
    }
    // Force IntentDetailPanel to re-mount so it re-queries DB for persisted linkage
    setPanelRefreshKey(k => k + 1);
    loadAll();
  }, [selectedIntentId, loadAll]);

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Top Header */}
      <div className="shrink-0 bg-slate-900 border-b border-slate-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
              <Brain className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Engineering Sessions</h1>
              <p className="text-xs text-slate-400">Context: {activeContext.label} · Cognitive Engine v1.0 · Engineering Object Model</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadAll}
              className="p-2 text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCapturing(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Engineering Session
            </button>
          </div>
        </div>
      </div>

      {/* Stats Strip */}
      {!loading && !error && (
        <StatsStrip intents={intents} pipelines={pipelines} knowledge={knowledge} decisions={decisions} />
      )}

      {/* Tab Bar */}
      <div className="shrink-0 bg-slate-900 border-b border-slate-800 px-6">
        <div className="flex gap-1">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors -mb-px ${
                  active ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 px-6 py-3 bg-red-500/10 border-b border-red-500/20 shrink-0">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
          <button onClick={loadAll} className="ml-auto text-xs text-red-400 hover:text-red-200 underline">Retry</button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col bg-slate-50">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-500">Loading Cognitive Engine...</p>
            </div>
          </div>
        ) : (
          <>
            {tab === 'pipeline' && (
              <PipelineView pipelines={pipelines} loading={false} onRefresh={loadAll} />
            )}
            {tab === 'intents' && (
              <IntentsView intents={intents} loading={false} onSelect={setSelectedIntentId} />
            )}
            {tab === 'capabilities' && (
              <CapabilitiesView capabilities={capabilities} />
            )}
            {tab === 'knowledge' && (
              <KnowledgeView records={knowledge} loading={false} />
            )}
            {tab === 'decisions' && (
              <DecisionsView decisions={decisions} loading={false} />
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {capturing && (
        <CaptureIntentModal
          onClose={() => setCapturing(false)}
          onCreated={() => { loadAll(); setTab('intents'); }}
          context={activeContext}
        />
      )}
      {selectedIntentId && !wizardOpen && (
        <IntentDetailPanel
          key={panelRefreshKey}
          intentId={selectedIntentId}
          onClose={() => { setSelectedIntentId(null); setIntentInitialSection(undefined); }}
          onExecute={handleExecuteFromATD}
          onRefresh={loadAll}
          onDeleted={() => {
            setSelectedIntentId(null);
            setIntentInitialSection(undefined);
            // Preserve current tab — do NOT switch away from user's active view
            loadAll();
          }}
          onShowUndo={showUndo}
          linkedIdeaRef={linkedIdeas[selectedIntentId]?.ref ?? null}
          linkedIdeaId={linkedIdeas[selectedIntentId]?.id ?? null}
          initialSection={intentInitialSection}
        />
      )}
      {/* EWO-011.2: Constitutional Execution Wizard — launched from ATD */}
      {wizardOpen && (
        <ConstitutionalExecutionWizard
          prefill={wizardPrefill}
          onClose={() => {
            setWizardOpen(false);
            setWizardPrefill(undefined);
          }}
          onComplete={handleWizardComplete}
          onNavigateToIdea={(ref, id) => {
            handleWizardComplete(ref, id);
            setWizardOpen(false);
            setWizardPrefill(undefined);
            window.location.hash = '#/engineering/engineering-ideas';
          }}
        />
      )}

      {/* EWO-011.4B: Undo toast notification */}
      {undoNotification && (
        <UndoToast notification={undoNotification} onDismiss={dismissUndo} />
      )}
    </div>
  );
}
