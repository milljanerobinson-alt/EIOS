import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowRight, ArrowLeft, Search, Filter, RefreshCw,
  GitBranch, Shield, AlertCircle, CheckCircle2, Clock,
  FileJson, Scale, RotateCcw, ListChecks, Gauge,
  Loader2, ChevronRight, X, Plus, Eye, Play, Zap,
  FileText, AlertTriangle, Ban, RotateCw, Timer,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  listMigrationPlans,
  getMigrationPlan,
  generateMigrationPlan,
  getRollbackPreview,
  getConstitutionalFingerprint,
  getMigrationPlanMetrics,
  type MigrationPlan,
  type MigrationPlanMetrics,
  type RollbackPreview,
  type ConstitutionalFingerprint,
} from '../../lib/migrationPlannerService';
import { listReviews, deleteMigrationPlan, type GovernedReview } from '../../lib/reviewService';
import { Trash2 } from 'lucide-react';
import {
  executeMigration,
  validateExecution,
  getLatestExecutionForPlan,
  getExecutionMetrics,
  retryExecution,
  type MigrationExecution,
  type ExecutionMetrics,
  type ValidationResult,
  type ExecutionOperation,
} from '../../lib/migrationExecutionService';

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  draft:     { label: 'Draft',     bg: 'bg-slate-50',  text: 'text-slate-600',  border: 'border-slate-200',  dot: 'bg-slate-400'  },
  ready:     { label: 'Ready',     bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200',dot: 'bg-emerald-500' },
  frozen:    { label: 'Frozen',    bg: 'bg-blue-50',   text: 'text-blue-700',  border: 'border-blue-200',   dot: 'bg-blue-500'   },
  superseded:{ label: 'Superseded',bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',   dot: 'bg-amber-400'  },
  blocked:   { label: 'Blocked',   bg: 'bg-red-50',    text: 'text-red-700',   border: 'border-red-200',     dot: 'bg-red-500'    },
};

const EXEC_STATUS_CFG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  queued:     { label: 'Queued',     bg: 'bg-slate-50',  text: 'text-slate-600',  border: 'border-slate-200',  dot: 'bg-slate-400'   },
  executing:  { label: 'Executing',  bg: 'bg-blue-50',   text: 'text-blue-700',  border: 'border-blue-200',   dot: 'bg-blue-500'    },
  completed:  { label: 'Completed',  bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200',dot: 'bg-emerald-500' },
  rolled_back:{ label: 'Rolled Back',bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',   dot: 'bg-amber-400'   },
  failed:     { label: 'Failed',     bg: 'bg-red-50',    text: 'text-red-700',   border: 'border-red-200',     dot: 'bg-red-500'     },
  cancelled:  { label: 'Cancelled',  bg: 'bg-slate-50',  text: 'text-slate-500',  border: 'border-slate-200',  dot: 'bg-slate-300'   },
};

const RISK_CFG: Record<string, { label: string; bg: string; text: string; border: string }> = {
  low:    { label: 'Low Risk',    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  medium: { label: 'Medium Risk', bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   },
  high:   { label: 'High Risk',   bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'     },
};

function readinessColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 50) return 'text-blue-600';
  if (score >= 25) return 'text-amber-600';
  return 'text-red-600';
}

function readinessBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 50) return 'bg-blue-500';
  if (score >= 25) return 'bg-amber-500';
  return 'bg-red-500';
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtRelative(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

// ─── Generate Plan Modal ───────────────────────────────────────────────────────

function GeneratePlanModal({ onClose, onGenerated }: {
  onClose: () => void;
  onGenerated: () => void;
}) {
  const [approvedReviews, setApprovedReviews] = useState<GovernedReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listReviews({ status: 'approved' })
      .then(setApprovedReviews)
      .catch(() => setApprovedReviews([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleGenerate() {
    if (!selectedReviewId) return;
    setGenerating(true);
    setError(null);
    try {
      await generateMigrationPlan(selectedReviewId);
      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate plan');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-900">Generate Migration Plan</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
            </div>
          ) : approvedReviews.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-600">No approved reviews available</p>
              <p className="text-xs text-slate-400 mt-1">Migration plans can only be generated from approved ECRs.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                Select an approved Engineering Classification Review to generate an immutable Migration Plan.
                The plan will describe exactly what will happen if the migration is executed — nothing is modified.
              </p>
              <div className="space-y-2">
                {approvedReviews.map(review => (
                  <button
                    key={review.id}
                    onClick={() => setSelectedReviewId(review.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      selectedReviewId === review.id
                        ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 ${
                        selectedReviewId === review.id ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{review.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {review.review_reference ?? review.id.slice(0, 8)} · {review.subject_object_type}
                        </p>
                        {review.ecr_extension && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {review.ecr_extension.migration_review && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">MIGRATION</span>
                            )}
                            {review.ecr_extension.promotion_review && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">PROMOTION</span>
                            )}
                            {review.ecr_extension.promotion_eligible && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200">ELIGIBLE</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 leading-relaxed">{error}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700">
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!selectedReviewId || generating}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Generate Plan
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Plan Detail View ──────────────────────────────────────────────────────────

// ─── Execution Tab ─────────────────────────────────────────────────────────────

function ExecutionTab({
  plan, execution, execLoading, executing, execError, validation, showBlocked,
  canExecute, isCompleted, isFailed, isExecuting, onExecute, onRetry, onRefresh,
}: {
  plan: MigrationPlan;
  execution: MigrationExecution | null;
  execLoading: boolean;
  executing: boolean;
  execError: string | null;
  validation: ValidationResult | null;
  showBlocked: boolean;
  canExecute: boolean;
  isCompleted: boolean;
  isFailed: boolean;
  isExecuting: boolean;
  onExecute: () => void;
  onRetry: () => void;
  onRefresh: () => void;
}) {
  const ops = (execution?.operations_json ?? []) as ExecutionOperation[];
  const report = execution?.report_json as ExecutionReport | undefined;
  const totalOps = plan.estimated_operations || ops.length;
  const completedOps = ops.length;
  const progress = totalOps > 0 ? Math.round((completedOps / totalOps) * 100) : 0;

  return (
    <div className="max-w-3xl space-y-4">
      {/* Execute button / Status */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Migration Execution</p>
          {execution && (
            (() => {
              const cfg = EXEC_STATUS_CFG[execution.status] ?? EXEC_STATUS_CFG.queued;
              return (
                <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text} ${cfg.border} border`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${isExecuting ? 'animate-pulse' : ''}`} />
                  {cfg.label}
                </span>
              );
            })()
          )}
        </div>

        {/* No execution yet */}
        {!execution && !execLoading && !executing && (
          <div className="text-center py-6">
            <Zap className="w-8 h-8 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600 mb-1">No execution yet</p>
            <p className="text-xs text-slate-400 mb-4">
              This migration plan has not been executed. Execute it to perform the governed ownership changes.
            </p>
            {canExecute ? (
              <button
                onClick={onExecute}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors"
              >
                <Play className="w-3.5 h-3.5" /> Execute Migration
              </button>
            ) : (
              <p className="text-xs text-slate-400 italic">Plan must be in "ready" status to execute</p>
            )}
          </div>
        )}

        {/* Loading */}
        {(execLoading || executing) && (
          <div className="text-center py-8">
            <Loader2 className="w-6 h-6 text-blue-500 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">
              {executing ? 'Executing migration...' : 'Loading execution...'}
            </p>
            {executing && (
              <div className="mt-4 max-w-xs mx-auto">
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
                </div>
                <p className="text-xs text-slate-400 mt-2">Processing operations in transaction...</p>
              </div>
            )}
          </div>
        )}

        {/* Blocked validation */}
        {showBlocked && validation && !validation.passed && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Ban className="w-4 h-4 text-red-500" />
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Execution Blocked</p>
            </div>
            <ul className="space-y-1.5">
              {validation.blocking_reasons.map((reason, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-red-700">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{reason}
                </li>
              ))}
            </ul>
            <p className="text-xs text-red-500 italic mt-3">No engineering records have been modified.</p>
          </div>
        )}

        {/* Error */}
        {execError && !showBlocked && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Execution Failed</p>
            </div>
            <p className="text-xs text-red-700">{execError}</p>
            <p className="text-xs text-red-500 italic mt-2">
              The transaction was rolled back. No partial ownership updates were applied.
            </p>
            {isFailed && (
              <button
                onClick={onRetry}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors"
              >
                <RotateCw className="w-3 h-3" /> Retry Execution
              </button>
            )}
          </div>
        )}

        {/* Completed */}
        {isCompleted && execution && report && (
          <div className="space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Execution Completed Successfully</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div><p className="text-[10px] text-slate-400">Objects Affected</p><p className="text-lg font-bold text-slate-800">{execution.objects_affected}</p></div>
                <div><p className="text-[10px] text-slate-400">Ownership Records</p><p className="text-lg font-bold text-slate-800">{execution.ownership_records_created}</p></div>
                <div><p className="text-[10px] text-slate-400">Lineage Records</p><p className="text-lg font-bold text-slate-800">{execution.lineage_records_created}</p></div>
                <div><p className="text-[10px] text-slate-400">SPC Records</p><p className="text-lg font-bold text-slate-800">{execution.spc_records_created}</p></div>
              </div>
              <div className="mt-3 pt-3 border-t border-emerald-100 flex items-center gap-2 text-xs text-slate-500">
                <Timer className="w-3.5 h-3.5" />
                Duration: {execution.duration_seconds}s · Ref: {execution.execution_ref}
              </div>
            </div>

            {/* Operation steps */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Executed Operations</p>
              <ol className="space-y-2">
                {ops.map((op) => (
                  <li key={op.order} className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700 shrink-0">
                      {op.order}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-slate-800">{op.operation}</p>
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      </div>
                      <p className="text-[10px] text-slate-400">{op.duration_ms}ms</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Execution Report */}
            <div className="bg-slate-900 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-slate-400" />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Execution Report (Immutable)</p>
              </div>
              <pre className="text-xs text-slate-300 font-mono overflow-auto max-h-[40vh] leading-relaxed">
{JSON.stringify(report, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Failed execution from DB */}
        {isFailed && execution && !execError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Previous Execution Failed</p>
            </div>
            <p className="text-xs text-red-700">{execution.error_message}</p>
            <p className="text-xs text-red-500 italic mt-2">
              Transaction was rolled back. No partial updates were applied.
            </p>
            {canExecute && (
              <button
                onClick={onRetry}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors"
              >
                <RotateCw className="w-3 h-3" /> Retry Execution
              </button>
            )}
          </div>
        )}

        {/* Refresh */}
        {execution && !executing && (
          <div className="mt-3 flex justify-end">
            <button onClick={onRefresh} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600">
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanDetail({ plan, onClose }: { plan: MigrationPlan; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'operations' | 'diff' | 'readiness' | 'risk' | 'rollback' | 'fingerprint' | 'snapshot' | 'execution'>('overview');
  const [execution, setExecution] = useState<MigrationExecution | null>(null);
  const [execLoading, setExecLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);

  const loadExecution = useCallback(async () => {
    setExecLoading(true);
    try {
      const exec = await getLatestExecutionForPlan(plan.id);
      setExecution(exec);
    } catch { /* ignore */ }
    finally { setExecLoading(false); }
  }, [plan.id]);

  useEffect(() => { loadExecution(); }, [loadExecution]);

  async function handleExecute() {
    setExecuting(true);
    setExecError(null);
    setShowBlocked(false);
    try {
      const val = await validateExecution(plan.id);
      setValidation(val);
      if (!val.passed) {
        setShowBlocked(true);
        return;
      }
      const result = await executeMigration(plan.id);
      if (!result.success) {
        setExecError(result.error ?? 'Execution failed');
      } else {
        await loadExecution();
      }
    } catch (err) {
      setExecError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setExecuting(false);
    }
  }

  async function handleRetry() {
    setExecuting(true);
    setExecError(null);
    setShowBlocked(false);
    try {
      const result = await retryExecution(plan.id);
      if (!result.success) {
        setExecError(result.error ?? 'Retry failed');
      } else {
        await loadExecution();
      }
    } catch (err) {
      setExecError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setExecuting(false);
    }
  }

  const rollback = useMemo(() => getRollbackPreview(plan), [plan]);
  const fingerprint = useMemo(() => getConstitutionalFingerprint(plan), [plan]);
  const snapshot = plan.snapshot_json;
  const diff = plan.diff_json;
  const planValidation = plan.validation_json;

  const canExecute = plan.status === 'ready' && !executing && (plan.record_purpose ?? 'production') === 'production';
  const isTestPlan = (plan.record_purpose ?? 'production') !== 'production';
  const execStatus = execution?.status;
  const isCompleted = execStatus === 'completed';
  const isFailed = execStatus === 'failed';
  const isExecuting = execStatus === 'executing' || executing;

  const TABS = [
    { key: 'overview',    label: 'Overview',    icon: Eye },
    { key: 'operations',  label: 'Operations',  icon: ListChecks },
    { key: 'diff',         label: 'Diff',        icon: GitBranch },
    { key: 'readiness',    label: 'Readiness',   icon: Gauge },
    { key: 'risk',         label: 'Risk',         icon: AlertCircle },
    { key: 'rollback',     label: 'Rollback',     icon: RotateCcw },
    { key: 'fingerprint',  label: 'Fingerprint', icon: Scale },
    { key: 'execution',    label: 'Execution',   icon: Zap },
    { key: 'snapshot',     label: 'Snapshot',    icon: FileJson },
  ] as const;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-5 py-4 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 mt-0.5">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-slate-900">{plan.plan_ref}</span>
                {(() => {
                  const cfg = STATUS_CFG[plan.status] ?? STATUS_CFG.draft;
                  return (
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text} ${cfg.border} border`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                  );
                })()}
                {(() => {
                  const cfg = RISK_CFG[plan.risk_score] ?? RISK_CFG.low;
                  return (
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text} ${cfg.border} border`}>
                      {cfg.label}
                    </span>
                  );
                })()}
              </div>
              <p className="text-sm text-slate-500">
                Generated {fmtRelative(plan.created_at)} · {plan.estimated_operations} operations · {plan.estimated_duration_seconds}s estimated
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Execution Readiness</p>
              <p className={`text-2xl font-bold ${readinessColor(plan.execution_ready_score)}`}>{plan.execution_ready_score}</p>
            </div>
            <div className="w-16">
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${readinessBg(plan.execution_ready_score)}`} style={{ width: `${plan.execution_ready_score}%` }} />
              </div>
            </div>
            {canExecute && (
              <button
                onClick={() => setActiveTab('execution')}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors ml-2"
              >
                <Play className="w-3.5 h-3.5" /> Execute
              </button>
            )}
            {isCompleted && execution && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold ml-2">
                <CheckCircle2 className="w-3 h-3" /> Executed
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-5 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  active ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-5">
        {activeTab === 'overview' && (
          <div className="max-w-3xl space-y-4">
            {/* Current → Target */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Current State</p>
                <dl className="space-y-2">
                  <div><dt className="text-xs text-slate-400">Owner</dt><dd className="text-sm font-semibold text-slate-800">{snapshot.current_state.owner}</dd></div>
                  <div><dt className="text-xs text-slate-400">Classification</dt><dd className="text-sm font-semibold text-slate-800">{snapshot.current_state.classification}</dd></div>
                  <div><dt className="text-xs text-slate-400">Registry</dt><dd className="text-sm font-semibold text-slate-800">{snapshot.current_state.registry}</dd></div>
                  <div><dt className="text-xs text-slate-400">Lineage</dt><dd className="text-sm font-semibold text-slate-800">{snapshot.current_state.lineage_status}</dd></div>
                </dl>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Target State</p>
                <dl className="space-y-2">
                  <div><dt className="text-xs text-slate-400">Owner</dt><dd className="text-sm font-semibold text-slate-800">{snapshot.target_state.owner}</dd></div>
                  <div><dt className="text-xs text-slate-400">Classification</dt><dd className="text-sm font-semibold text-slate-800">{snapshot.target_state.classification}</dd></div>
                  <div><dt className="text-xs text-slate-400">Registry</dt><dd className="text-sm font-semibold text-slate-800">{snapshot.target_state.registry}</dd></div>
                  <div><dt className="text-xs text-slate-400">Lineage</dt><dd className="text-sm font-semibold text-slate-800">{snapshot.target_state.lineage}</dd></div>
                </dl>
              </div>
            </div>

            {/* Migration flags */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Migration Flags</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(snapshot.migration_flags).map(([key, value]) => (
                  <span key={key} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${
                    value ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-50 text-slate-400 border border-slate-200'
                  }`}>
                    {value ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                    {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                ))}
              </div>
            </div>

            {/* Dependencies */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Dependencies</p>
              <ul className="space-y-1.5">
                {snapshot.dependencies.map((dep, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-slate-600">
                    <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                    {dep}
                  </li>
                ))}
              </ul>
            </div>

            {/* Review reference */}
            <div className="bg-slate-900 rounded-xl p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Source Review</p>
              <p className="text-sm font-semibold text-white">{snapshot.review.title}</p>
              <p className="text-xs text-slate-400 mt-1">
                {snapshot.review.review_reference ?? snapshot.review.id.slice(0, 8)} ·
                Status: {snapshot.review.status} ·
                Evidence: {snapshot.evidence_count} record(s)
              </p>
            </div>

            {/* Execution Readiness Summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Execution Readiness</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-400">Executable</p>
                  <span className={`text-sm font-bold ${canExecute ? 'text-emerald-600' : 'text-red-600'}`}>
                    {canExecute ? 'Yes' : 'No'}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Subject Identity</p>
                  <span className={`text-sm font-bold ${
                    planValidation?.subject_identity_status === 'resolved' ? 'text-emerald-600' :
                    planValidation?.subject_identity_status === 'test_only' ? 'text-amber-600' :
                    'text-red-600'
                  }`}>
                    {planValidation?.subject_identity_status === 'resolved' ? 'Resolved' :
                     planValidation?.subject_identity_status === 'test_only' ? 'Test-only' :
                     planValidation?.subject_identity_status === 'missing' ? 'Missing' :
                     planValidation?.subject_identity_status === 'invalid' ? 'Invalid' :
                     'Unknown'}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Record Purpose</p>
                  <span className={`text-sm font-bold ${(plan.record_purpose ?? 'production') === 'production' ? 'text-slate-700' : 'text-amber-600'}`}>
                    {(plan.record_purpose ?? 'production').toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Readiness Score</p>
                  <span className={`text-sm font-bold ${readinessColor(plan.execution_ready_score)}`}>
                    {plan.execution_ready_score} / 100
                  </span>
                </div>
              </div>
              {planValidation && planValidation.blocking_issues.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-2">Blocking Prerequisites</p>
                  <ul className="space-y-1.5">
                    {planValidation.blocking_issues.map((issue, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-red-600">
                        <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                        {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-3 text-[10px] text-slate-400 italic">
                The readiness score is diagnostic. Executable state requires all mandatory constitutional prerequisites.
              </p>
            </div>

            {/* Non-Executable Test Plan banner */}
            {isTestPlan && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-amber-800">Non-Executable Test Plan</p>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    This is a {plan.record_purpose} plan. It cannot execute production ownership changes.
                    It may be permanently deleted if no production governance data was changed.
                  </p>
                </div>
              </div>
            )}

            {/* Delete button for test/validation plans */}
            {isTestPlan && plan.status !== 'frozen' && (
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    if (confirm(
                      `Delete this ${plan.record_purpose} migration plan?\n\n` +
                      `Reference: ${plan.plan_ref}\n\n` +
                      'Test/validation plans can be permanently deleted. References are never reused.\nThis action cannot be undone.'
                    )) {
                      deleteMigrationPlan(plan.id)
                        .then(() => onClose())
                        .catch(e => alert(e.message));
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors border border-red-200"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Test Plan
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'operations' && (
          <div className="max-w-3xl">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">Ordered Migration Operations</p>
              <ol className="space-y-3">
                {snapshot.migration_operations.map((op) => (
                  <li key={op.order} className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 border border-blue-200 text-xs font-bold text-blue-700 shrink-0">
                      {op.order}
                    </span>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800">{op.operation}</p>
                        {op.reversible ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">REVERSIBLE</span>
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">IRREVERSIBLE</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{op.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-400 italic">
                  These operations describe what will happen. Nothing executes — this is planning only.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'diff' && (
          <div className="max-w-3xl">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">Migration Diff</p>
              <div className="space-y-3">
                {diff.fields.map((entry, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <span className="text-xs font-bold text-slate-500 w-28 shrink-0">{entry.field}</span>
                    <span className="text-sm text-slate-600 flex-1 min-w-0 truncate">{entry.from}</span>
                    <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                    <span className="text-sm font-semibold text-slate-900 flex-1 min-w-0 truncate">{entry.to}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'readiness' && (
          <div className="max-w-3xl space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Execution Readiness Score</p>
                <p className={`text-3xl font-bold ${readinessColor(plan.execution_ready_score)}`}>{plan.execution_ready_score}<span className="text-sm text-slate-400">/100</span></p>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-4">
                <div className={`h-full rounded-full ${readinessBg(plan.execution_ready_score)}`} style={{ width: `${plan.execution_ready_score}%` }} />
              </div>
              <div className="space-y-3">
                <ReadinessRow label="Evidence Completeness" value={planValidation.evidence_completeness} />
                <ReadinessRow label="Review Approved" value={planValidation.review_approved ? 100 : 0} boolean={planValidation.review_approved} />
                <ReadinessRow label="Dependencies Satisfied" value={planValidation.dependencies_satisfied ? 100 : 0} boolean={planValidation.dependencies_satisfied} />
                <ReadinessRow label="Confidence" value={planValidation.confidence} />
              </div>
            </div>

            {planValidation.blocking_issues.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-2">Blocking Issues</p>
                <ul className="space-y-1">
                  {planValidation.blocking_issues.map((issue, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-red-700">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{issue}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {planValidation.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-2">Warnings</p>
                <ul className="space-y-1">
                  {planValidation.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-amber-700">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {planValidation.missing_references.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Missing References</p>
                <ul className="space-y-1">
                  {planValidation.missing_references.map((ref, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                      <ChevronRight className="w-3.5 h-3.5 shrink-0 mt-0.5" />{ref}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {planValidation.outstanding_validation.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-2">Outstanding Validation</p>
                <ul className="space-y-1">
                  {planValidation.outstanding_validation.map((v, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-blue-700">
                      <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />{v}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === 'risk' && (
          <div className="max-w-3xl space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-3 mb-4">
                {(() => {
                  const cfg = RISK_CFG[plan.risk_score] ?? RISK_CFG.low;
                  return (
                    <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold ${cfg.bg} ${cfg.text} ${cfg.border} border`}>
                      <AlertCircle className="w-4 h-4" />
                      {cfg.label}
                    </span>
                  );
                })()}
              </div>
              <div className="space-y-3">
                {planValidation.blocking_issues.length > 0 && (
                  <RiskReason icon="AlertCircle" color="text-red-500" text="Blocking issues detected" details={planValidation.blocking_issues} />
                )}
                {planValidation.warnings.length > 0 && (
                  <RiskReason icon="AlertCircle" color="text-amber-500" text="Warnings detected" details={planValidation.warnings} />
                )}
                {snapshot.migration_flags.constitutional_boundary_case && (
                  <RiskReason icon="Scale" color="text-slate-500" text="Constitutional boundary case — requires additional scrutiny" />
                )}
                {snapshot.current_state.lineage_events.length > 2 && (
                  <RiskReason icon="GitBranch" color="text-slate-500" text={`Multiple lineage events (${snapshot.current_state.lineage_events.length}) — complex ownership history`} />
                )}
                {snapshot.migration_flags.promotion_eligible && (
                  <RiskReason icon="Shield" color="text-blue-500" text="Promotion to Platform ownership — higher impact" />
                )}
                {planValidation.missing_references.length > 0 && (
                  <RiskReason icon="AlertCircle" color="text-amber-500" text="Missing references detected" details={planValidation.missing_references} />
                )}
                {plan.risk_score === 'low' && planValidation.blocking_issues.length === 0 && planValidation.warnings.length === 0 && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" />
                    No risk factors detected — migration is straightforward.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rollback' && (
          <div className="max-w-3xl space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rollback Preview</p>
                {rollback.rollback_available ? (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Available
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
                    <X className="w-3.5 h-3.5" /> Not Available
                  </span>
                )}
              </div>
              <ol className="space-y-3">
                {rollback.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600 shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-sm text-slate-700 pt-0.5">{step}</p>
                  </li>
                ))}
              </ol>
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs text-slate-400">
                  Estimated rollback duration: <span className="font-semibold text-slate-700">{rollback.estimated_rollback_duration_seconds}s</span>
                </p>
                <p className="text-xs text-slate-400 italic mt-2">
                  This is planning only — no rollback is executed.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fingerprint' && (
          <div className="max-w-3xl space-y-4">
            <div className="bg-slate-900 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Scale className="w-4 h-4 text-slate-400" />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Constitutional Fingerprint</p>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Applicable Standards</p>
                  <div className="flex flex-wrap gap-2">
                    {fingerprint.applicable_standards.map((s, i) => (
                      <span key={i} className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 text-xs font-semibold border border-slate-700">{s}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Applicable Sections</p>
                  <ul className="space-y-1">
                    {fingerprint.applicable_sections.map((s, i) => (
                      <li key={i} className="text-xs text-slate-300 flex items-center gap-2">
                        <ChevronRight className="w-3 h-3 text-slate-600" />{s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Decision Hash</p>
                  <p className="text-xs font-mono text-slate-300 break-all">{fingerprint.decision_hash || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Constitution Version</p>
                  <p className="text-xs text-slate-200">{fingerprint.constitution_version}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Engineering Standard Versions</p>
                  <div className="flex flex-wrap gap-2">
                    {fingerprint.engineering_standard_versions.map((s, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono border border-slate-700">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-400 italic px-1">
              This fingerprint becomes permanent evidence of the constitutional basis for the migration.
            </p>
          </div>
        )}

        {activeTab === 'execution' && (
          <ExecutionTab
            plan={plan}
            execution={execution}
            execLoading={execLoading}
            executing={executing}
            execError={execError}
            validation={validation}
            showBlocked={showBlocked}
            canExecute={canExecute}
            isCompleted={isCompleted}
            isFailed={isFailed}
            isExecuting={isExecuting}
            onExecute={handleExecute}
            onRetry={handleRetry}
            onRefresh={loadExecution}
          />
        )}

        {activeTab === 'snapshot' && (
          <div className="max-w-4xl">
            <div className="bg-slate-900 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <FileJson className="w-4 h-4 text-slate-400" />
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Snapshot JSON (Developer)</p>
              </div>
              <pre className="text-xs text-slate-300 font-mono overflow-auto max-h-[60vh] leading-relaxed">
{JSON.stringify(snapshot, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReadinessRow({ label, value, boolean }: { label: string; value: number; boolean?: boolean }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs font-semibold text-slate-700">
          {boolean !== undefined ? (boolean ? 'Yes' : 'No') : `${value}%`}
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${readinessBg(value)}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function RiskReason({ icon, color, text, details }: { icon: string; color: string; text: string; details?: string[] }) {
  const Icon = icon === 'AlertCircle' ? AlertCircle : icon === 'Scale' ? Scale : icon === 'GitBranch' ? GitBranch : icon === 'Shield' ? Shield : CheckCircle2;
  return (
    <div className="flex items-start gap-2">
      <Icon className={`w-4 h-4 ${color} shrink-0 mt-0.5`} />
      <div>
        <p className="text-xs text-slate-700">{text}</p>
        {details && details.length > 0 && (
          <ul className="mt-1 ml-4 space-y-0.5">
            {details.map((d, i) => <li key={i} className="text-xs text-slate-500">• {d}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function ECCMigrationPlannerPage() {
  const [plans, setPlans] = useState<MigrationPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<MigrationPlan | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [filterReadyScore, setFilterReadyScore] = useState<string>('all');
  const [metrics, setMetrics] = useState<MigrationPlanMetrics | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planData, metricsData] = await Promise.all([
        listMigrationPlans(),
        getMigrationPlanMetrics().catch(() => null),
      ]);
      setPlans(planData);
      setMetrics(metricsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load migration plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return plans.filter(plan => {
      if (search) {
        const q = search.toLowerCase();
        const matchesRef = plan.plan_ref.toLowerCase().includes(q);
        const matchesOwner = plan.snapshot_json?.current_state?.owner?.toLowerCase().includes(q) ?? false;
        const matchesReview = plan.snapshot_json?.review?.title?.toLowerCase().includes(q) ?? false;
        if (!matchesRef && !matchesOwner && !matchesReview) return false;
      }
      if (filterStatus !== 'all' && plan.status !== filterStatus) return false;
      if (filterRisk !== 'all' && plan.risk_score !== filterRisk) return false;
      if (filterReadyScore !== 'all') {
        const score = plan.execution_ready_score;
        if (filterReadyScore === 'high' && score < 80) return false;
        if (filterReadyScore === 'medium' && (score < 50 || score >= 80)) return false;
        if (filterReadyScore === 'low' && score >= 50) return false;
      }
      return true;
    });
  }, [plans, search, filterStatus, filterRisk, filterReadyScore]);

  if (selectedPlan) {
    return <PlanDetail plan={selectedPlan} onClose={() => setSelectedPlan(null)} />;
  }

  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-5">
        {/* Header */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
                <GitBranch className="w-5 h-5 text-slate-300" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">Migration Plans</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Governed migration planning — analyses approved ECRs and generates immutable migration plan snapshots.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowGenerateModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Generate Plan
            </button>
          </div>
        </div>

        {/* Metrics */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <MetricCard label="Draft" value={metrics.draft} color="text-slate-600" />
            <MetricCard label="Ready" value={metrics.ready} color="text-emerald-600" />
            <MetricCard label="Blocked" value={metrics.blocked} color="text-red-600" />
            <MetricCard label="Avg Readiness" value={`${metrics.average_readiness}`} color={readinessColor(metrics.average_readiness)} />
            <MetricCard label="Avg Risk" value={metrics.average_risk ?? '—'} color={metrics.average_risk === 'high' ? 'text-red-600' : metrics.average_risk === 'medium' ? 'text-amber-600' : 'text-emerald-600'} />
          </div>
        )}

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-300" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search plan ref, review, owner..."
                className="flex-1 text-xs text-slate-700 placeholder:text-slate-300 outline-none bg-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-300" />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 outline-none focus:border-slate-300">
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="ready">Ready</option>
                <option value="blocked">Blocked</option>
                <option value="frozen">Frozen</option>
                <option value="superseded">Superseded</option>
              </select>
              <select value={filterRisk} onChange={e => setFilterRisk(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 outline-none focus:border-slate-300">
                <option value="all">All Risk</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <select value={filterReadyScore} onChange={e => setFilterReadyScore(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 outline-none focus:border-slate-300">
                <option value="all">All Scores</option>
                <option value="high">Ready (80+)</option>
                <option value="medium">Moderate (50-79)</option>
                <option value="low">Low (&lt;50)</option>
              </select>
            </div>
            <button onClick={load} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Queue table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
            </div>
          ) : error ? (
            <div className="p-6 text-center">
              <AlertCircle className="w-8 h-8 text-red-200 mx-auto mb-3" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <GitBranch className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-600">No migration plans yet</p>
              <p className="text-xs text-slate-400 mt-1">
                {plans.length === 0
                  ? 'Generate a plan from an approved ECR to get started.'
                  : 'No plans match the current filters.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Plan Ref</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Review</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ready Score</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Risk</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Created</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Owner</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(plan => {
                    const statusCfg = STATUS_CFG[plan.status] ?? STATUS_CFG.draft;
                    const riskCfg = RISK_CFG[plan.risk_score] ?? RISK_CFG.low;
                    return (
                      <tr
                        key={plan.id}
                        onClick={() => setSelectedPlan(plan)}
                        className="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold text-slate-800">{plan.plan_ref}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-600 truncate max-w-[200px] block">
                            {plan.snapshot_json?.review?.title ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border} border w-fit`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-bold ${readinessColor(plan.execution_ready_score)}`}>
                            {plan.execution_ready_score}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${riskCfg.bg} ${riskCfg.text} ${riskCfg.border} border`}>
                            {riskCfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-500">{fmtRelative(plan.created_at)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-slate-600 truncate max-w-[120px] block">
                            {plan.snapshot_json?.current_state?.owner ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showGenerateModal && (
        <GeneratePlanModal
          onClose={() => setShowGenerateModal(false)}
          onGenerated={() => { setShowGenerateModal(false); load(); }}
        />
      )}
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
