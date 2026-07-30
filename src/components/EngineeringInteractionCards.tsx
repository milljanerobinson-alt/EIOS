/**
 * Engineering Interaction Cards — EWO-033R.3
 *
 * Conversation-native cards designed to feel like collaborating with an
 * Engineering Director. Concise, progressive disclosure, one primary
 * decision per card, zero internal terminology.
 */

import { useState } from 'react';
import {
  CheckCircle2, Loader2, AlertTriangle, Shield, FileText,
  Clock, Play, X, ChevronDown, ChevronUp, AlertCircle,
  RefreshCw, Sparkles, MessageSquare, RotateCcw,
} from 'lucide-react';
import type {
  FilteredProposal,
  FilteredExecutionReady,
  FilteredCompletion,
} from '../lib/interactionPresentationFilter';
import type { ExecutionProgressUpdate } from '../lib/interactionExecutionService';

// ─── Shared UI ──────────────────────────────────────────────────────────────────

function Collapsible({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-slate-100">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-2 text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors"
      >
        <span>{label}</span>
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && <div className="pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function ComplexityTag({ complexity }: { complexity: string }) {
  const colors: Record<string, string> = {
    Low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Medium: 'bg-amber-50 text-amber-700 border-amber-200',
    High: 'bg-orange-50 text-orange-700 border-orange-200',
    Critical: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${colors[complexity] ?? colors.Medium}`}>
      {complexity}
    </span>
  );
}

// ─── 1. Proposal Card ───────────────────────────────────────────────────────────

export function ProposalCard({
  proposal,
  onApprove,
  onRequestChanges,
  onCancel,
  busy,
}: {
  proposal: FilteredProposal;
  onApprove: () => void;
  onRequestChanges: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      {/* Title */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-500 shrink-0" />
          <p className="text-sm font-bold text-slate-900">{proposal.title}</p>
          <div className="ml-auto">
            <ComplexityTag complexity={proposal.complexity} />
          </div>
        </div>
      </div>

      {/* Recommendation — the core message */}
      <div className="px-4 py-3">
        <p className="text-sm text-slate-700 leading-relaxed">{proposal.recommendation}</p>
      </div>

      {/* Implementation Overview */}
      {proposal.implementationOverview.length > 0 && (
        <div className="px-4 pb-2">
          <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Implementation Overview</p>
          <ul className="space-y-1">
            {proposal.implementationOverview.map((item, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                <span className="w-1 h-1 rounded-full bg-slate-400 shrink-0 mt-1.5" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Key Risks — only if there are any */}
      {proposal.risks.length > 0 && (
        <div className="px-4 pb-3">
          <p className="text-[11px] font-semibold text-slate-500 mb-1.5">Key Risks</p>
          <div className="space-y-1">
            {proposal.risks.map((risk, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                {risk.description}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* More Details — progressive disclosure */}
      <div className="px-4">
        <Collapsible label="More Details">
          {proposal.scope.whatNot.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Out of Scope</p>
              <ul className="space-y-0.5">
                {proposal.scope.whatNot.map((item, i) => (
                  <li key={i} className="text-xs text-slate-500">• {item}</li>
                ))}
              </ul>
            </div>
          )}
          {proposal.acceptanceCriteria.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Acceptance Criteria</p>
              <ul className="space-y-0.5">
                {proposal.acceptanceCriteria.map((c, i) => (
                  <li key={i} className="text-xs text-slate-500">{i + 1}. {c}</li>
                ))}
              </ul>
            </div>
          )}
          {proposal.dependencies.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Dependencies</p>
              <ul className="space-y-0.5">
                {proposal.dependencies.map((d, i) => (
                  <li key={i} className="text-xs text-slate-500">• {d.description}</li>
                ))}
              </ul>
            </div>
          )}
          {proposal.plan.estimatedEffort && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="w-3 h-3" />
              {proposal.plan.estimatedEffort}
            </div>
          )}
        </Collapsible>
      </div>

      {/* Decision — one primary action */}
      <div className="px-4 py-3 mt-1 bg-slate-50 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <button
            onClick={onApprove}
            disabled={busy}
            className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-sm"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Approve
          </button>
          <button
            onClick={onRequestChanges}
            disabled={busy}
            className="flex items-center gap-1 px-3 py-2 text-slate-500 hover:text-slate-700 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Request Changes
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex items-center gap-1 px-3 py-2 text-slate-400 hover:text-red-500 text-xs font-medium transition-colors disabled:opacity-50 ml-auto"
          >
            <X className="w-3.5 h-3.5" />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 2. Execution Ready Card ─────────────────────────────────────────────────────

export function ExecutionReadyCard({
  prep,
  onExecute,
  onNotYet,
  busy,
}: {
  prep: FilteredExecutionReady;
  onExecute: () => void;
  onNotYet: () => void;
  busy?: boolean;
}) {
  if (!prep.ready) {
    return (
      <div className="rounded-2xl border border-red-200 bg-white overflow-hidden shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <p className="text-sm font-semibold text-red-700">Not ready to execute yet</p>
          </div>
          <div className="space-y-1">
            {prep.blockingReasons.map((reason, i) => (
              <p key={i} className="text-xs text-red-600">{reason}</p>
            ))}
          </div>
          <button
            onClick={onNotYet}
            className="mt-3 text-xs text-slate-500 hover:text-slate-700 font-medium"
          >
            OK
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-teal-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-teal-500 shrink-0" />
          <p className="text-sm font-bold text-slate-900">Ready to Execute</p>
        </div>
      </div>
      <div className="px-4 py-3">
        <p className="text-sm text-slate-700 leading-relaxed">
          Everything is prepared. I'm ready to start the implementation
          {prep.provider ? ` using ${prep.provider}` : ''}.
        </p>
      </div>
      {prep.filesAffected.length > 0 && (
        <div className="px-4">
          <Collapsible label="Files that will be changed">
            <ul className="space-y-0.5">
              {prep.filesAffected.map((file, i) => (
                <li key={i} className="text-xs text-slate-500 font-mono">{file}</li>
              ))}
            </ul>
          </Collapsible>
        </div>
      )}
      <div className="px-4 py-3 mt-1 bg-slate-50 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <button
            onClick={onExecute}
            disabled={busy}
            className="flex items-center gap-1.5 px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-sm"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Execute
          </button>
          <button
            onClick={onNotYet}
            disabled={busy}
            className="text-xs text-slate-500 hover:text-slate-700 font-medium px-3 py-2 transition-colors disabled:opacity-50"
          >
            Not Yet
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 3. Execution Progress Card ──────────────────────────────────────────────────

const STAGE_TONE: Record<string, string> = {
  complete: 'text-slate-600',
  running: 'text-blue-700',
  error: 'text-red-600',
  pending: 'text-slate-400',
};

export function ExecutionProgressCard({ stages }: { stages: ExecutionProgressUpdate[] }) {
  const runningStage = stages.find(s => s.status === 'running');
  const lastComplete = [...stages].reverse().find(s => s.status === 'complete');
  const hasError = stages.some(s => s.status === 'error');

  // Conversational summary line
  let summaryLine: string;
  if (hasError) {
    summaryLine = 'Something went wrong during execution.';
  } else if (runningStage) {
    summaryLine = runningStage.detail ?? runningStage.label;
  } else if (lastComplete) {
    summaryLine = `${lastComplete.label} complete.`;
  } else {
    summaryLine = 'Starting...';
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
          <p className="text-sm font-semibold text-slate-800">{summaryLine}</p>
        </div>
        {/* Compact progress dots — no pipeline stage labels */}
        <div className="flex items-center gap-1.5">
          {stages.map((stage) => (
            <div
              key={stage.stage}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                stage.status === 'complete' ? 'bg-emerald-400' :
                stage.status === 'running' ? 'bg-blue-400' :
                stage.status === 'error' ? 'bg-red-400' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>
      </div>
      {/* Detailed stages behind collapsible */}
      <div className="px-4 pb-2">
        <Collapsible label="Step-by-step detail">
          {stages.map((stage) => (
            <div key={stage.stage} className="flex items-center gap-2">
              {stage.status === 'complete' ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> :
               stage.status === 'running' ? <Loader2 className="w-3 h-3 text-blue-500 animate-spin" /> :
               stage.status === 'error' ? <AlertCircle className="w-3 h-3 text-red-500" /> :
               <div className="w-3 h-3 rounded-full border border-slate-200" />}
              <span className={`text-xs ${STAGE_TONE[stage.status] ?? 'text-slate-400'}`}>
                {stage.label}
              </span>
            </div>
          ))}
        </Collapsible>
      </div>
    </div>
  );
}

// ─── 4. Completion Package Card ───────────────────────────────────────────────────

export function CompletionPackageCard({
  completion,
  onAccept,
  onReject,
  onRequestRefinement,
  busy,
}: {
  completion: FilteredCompletion;
  onAccept: () => void;
  onReject: () => void;
  onRequestRefinement: () => void;
  busy?: boolean;
}) {
  const allTestsPassed = completion.tests.length > 0 && completion.tests.every(t => t.status === 'passed');
  const allValidationPassed = completion.validation.length > 0 && completion.validation.every(v => v.status === 'passed');

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <p className="text-sm font-bold text-slate-900">Implementation Complete</p>
        </div>
      </div>

      {/* Executive summary */}
      <div className="px-4 py-3">
        <p className="text-sm text-slate-700 leading-relaxed">{completion.summary}</p>
      </div>

      {/* What Changed */}
      {completion.filesChanged.length > 0 && (
        <div className="px-4 pb-2">
          <p className="text-[11px] font-semibold text-slate-500 mb-1.5">What Changed</p>
          <ul className="space-y-0.5">
            {completion.filesChanged.map((file, i) => (
              <li key={i} className="text-xs text-slate-600 font-mono">{file}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Validation Outcome — synthesised */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2">
          {allTestsPassed && allValidationPassed ? (
            <>
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs text-slate-600">All checks passed — ready for your review.</span>
            </>
          ) : allTestsPassed ? (
            <>
              <Shield className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs text-slate-600">Tests passed. Some validation checks need attention.</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs text-slate-600">Some checks didn't pass — review the details below.</span>
            </>
          )}
        </div>
      </div>

      {/* Recommendation */}
      {completion.deploymentRecommendation && (
        <div className="px-4 pb-2">
          <p className="text-[11px] font-semibold text-slate-500 mb-1">Recommendation</p>
          <p className="text-xs text-slate-600">{completion.deploymentRecommendation}</p>
        </div>
      )}

      {/* How to Test */}
      {completion.testInstructions.length > 0 && (
        <div className="px-4">
          <Collapsible label="How to Test">
            <ol className="space-y-1">
              {completion.testInstructions.map((instruction, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                  <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  {instruction}
                </li>
              ))}
            </ol>
          </Collapsible>
        </div>
      )}

      {/* Technical Details */}
      {(completion.tests.length > 0 || completion.validation.length > 0) && (
        <div className="px-4">
          <Collapsible label="View Technical Details">
            {completion.tests.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Tests</p>
                <div className="space-y-1">
                  {completion.tests.map((test, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {test.status === 'passed' ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> :
                       test.status === 'failed' ? <AlertCircle className="w-3 h-3 text-red-500" /> :
                       <div className="w-3 h-3 rounded-full border border-slate-200" />}
                      <span className="text-slate-600">{test.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {completion.validation.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Validation</p>
                <div className="space-y-1">
                  {completion.validation.map((check, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {check.status === 'passed' ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> :
                       check.status === 'failed' ? <AlertCircle className="w-3 h-3 text-red-500" /> :
                       <div className="w-3 h-3 rounded-full border border-slate-200" />}
                      <span className="text-slate-600">{check.check}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Collapsible>
        </div>
      )}

      {/* Decision — one primary action */}
      <div className="px-4 py-3 mt-1 bg-slate-50 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <button
            onClick={onAccept}
            disabled={busy}
            className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-sm"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Accept
          </button>
          <button
            onClick={onRequestRefinement}
            disabled={busy}
            className="flex items-center gap-1 px-3 py-2 text-slate-500 hover:text-amber-600 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Request Refinement
          </button>
          <button
            onClick={onReject}
            disabled={busy}
            className="flex items-center gap-1 px-3 py-2 text-slate-400 hover:text-red-500 text-xs font-medium transition-colors disabled:opacity-50 ml-auto"
          >
            <X className="w-3.5 h-3.5" />
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── 5. Closed Card ──────────────────────────────────────────────────────────────

export function ClosedCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Done</p>
          <p className="text-xs text-slate-500 mt-0.5">{message}</p>
        </div>
      </div>
    </div>
  );
}

// ─── 6. Blocked Card ─────────────────────────────────────────────────────────────

export function BlockedCard({ reason }: { reason: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <p className="text-sm font-semibold text-red-700">This needs attention</p>
        </div>
        <p className="text-xs text-red-600">{reason}</p>
      </div>
    </div>
  );
}

// ─── 7. Preparing Card ───────────────────────────────────────────────────────────

export function PreparingCard({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 py-3 px-4 bg-blue-50 border border-blue-100 rounded-xl">
      <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
      <p className="text-xs text-blue-700">{message}</p>
    </div>
  );
}

// ─── 8a. Preparing Execution Card (EWO-033R.4 Correction 4) ─────────────────────

import type { PreparationPhaseUpdate } from '../lib/interactionExecutionService';

export function PreparingExecutionCard({
  phases,
  failedPhase,
  error,
  elapsedMs,
  onRetry,
  onCancel,
}: {
  phases: PreparationPhaseUpdate[];
  failedPhase?: string;
  error?: string;
  elapsedMs?: number;
  onRetry?: () => void;
  onCancel?: () => void;
}) {
  const hasError = !!failedPhase || phases.some(p => p.status === 'error');
  const isComplete = !hasError && phases.every(p => p.status === 'complete');
  const runningPhase = phases.find(p => p.status === 'running');

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          {hasError ? (
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          ) : isComplete ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
          )}
          <p className="text-sm font-bold text-slate-900">
            {hasError ? 'Preparation Failed' : isComplete ? 'Preparation Complete' : 'Preparing implementation'}
          </p>
          {elapsedMs !== undefined && (
            <span className="ml-auto text-[10px] text-slate-400 font-mono">
              {(elapsedMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      </div>

      {hasError && error && (
        <div className="px-4 py-2">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      <div className="px-4 py-3 space-y-2">
        {phases.map((phase, i) => (
          <div key={i} className="flex items-center gap-2.5">
            {phase.status === 'complete' && (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            )}
            {phase.status === 'running' && (
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
            )}
            {phase.status === 'pending' && (
              <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />
            )}
            {phase.status === 'error' && (
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            )}
            <span className={`text-xs ${
              phase.status === 'complete' ? 'text-slate-600' :
              phase.status === 'running' ? 'text-blue-700 font-medium' :
              phase.status === 'error' ? 'text-red-600' :
              'text-slate-400'
            }`}>
              {phase.label}
            </span>
            {phase.detail && phase.status === 'complete' && (
              <span className="text-[10px] text-slate-400 truncate ml-auto">{phase.detail}</span>
            )}
            {phase.durationMs !== undefined && phase.status === 'complete' && (
              <span className="text-[10px] text-slate-300 font-mono">{(phase.durationMs / 1000).toFixed(1)}s</span>
            )}
          </div>
        ))}
      </div>

      {hasError && (
        <div className="px-4 py-3 mt-1 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center gap-2">
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Try Again
              </button>
            )}
            {onCancel && (
              <button
                onClick={onCancel}
                className="flex items-center gap-1 px-3 py-2 text-slate-400 hover:text-red-500 text-xs font-medium transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 8c. Conversation Recovery Card ────────────────────────────────────────────

export function ConversationRecoveryCard({
  onRetry,
  onRestore,
  onViewDetails,
}: {
  onRetry: () => void;
  onRestore: () => void;
  onViewDetails?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-slate-500" />
          <p className="text-sm font-semibold text-slate-700">I couldn't restore this engineering interaction.</p>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          The engineering state is still safe. You can retry restoration or inspect technical details.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
          <button
            onClick={onRestore}
            className="flex items-center gap-1.5 px-3 py-2 text-slate-600 hover:text-slate-800 text-xs font-medium transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restore Conversation
          </button>
          {onViewDetails && (
            <button
              onClick={onViewDetails}
              className="flex items-center gap-1 px-3 py-2 text-slate-400 hover:text-slate-600 text-xs font-medium transition-colors ml-auto"
            >
              <FileText className="w-3.5 h-3.5" />
              View Technical Details
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 8b. Preparation Timeout Card ───────────────────────────────────────────────

export function PreparationTimeoutCard({
  onRetry,
  onContinueWaiting,
  onCancel,
  onViewDetails,
}: {
  onRetry: () => void;
  onContinueWaiting: () => void;
  onCancel: () => void;
  onViewDetails?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-amber-500" />
          <p className="text-sm font-semibold text-amber-700">Preparation is taking longer than expected</p>
        </div>
        <p className="text-xs text-slate-600 mb-3">
          Execution preparation hasn't completed yet. This can happen when the
          system is waiting on a provider response or assembling a large context package.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try Again
          </button>
          <button
            onClick={onContinueWaiting}
            className="flex items-center gap-1.5 px-3 py-2 text-slate-600 hover:text-slate-800 text-xs font-medium transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
            Continue Waiting
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1 px-3 py-2 text-slate-400 hover:text-red-500 text-xs font-medium transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Cancel Preparation
          </button>
          {onViewDetails && (
            <button
              onClick={onViewDetails}
              className="flex items-center gap-1 px-3 py-2 text-slate-400 hover:text-slate-600 text-xs font-medium transition-colors ml-auto"
            >
              <FileText className="w-3.5 h-3.5" />
              View Technical Details
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 8. Execution Failed Card ────────────────────────────────────────────────────

export function ExecutionFailedCard({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <p className="text-sm font-semibold text-red-700">Execution couldn't complete</p>
        </div>
        <p className="text-xs text-red-600 mb-3">{error}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}
