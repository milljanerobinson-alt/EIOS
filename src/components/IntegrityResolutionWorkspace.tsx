// EWO-021R.5R.1 — Integrity Resolution Workspace
//
// Governed decision-centric resolution workspace with:
// - Authoritative decision linkage (REQ-1, REQ-2)
// - Real evidence search (REQ-3, REQ-4, REQ-5, REQ-6)
// - Historical reference workflow (REQ-7, REQ-8)
// - Transactional safety (REQ-9, REQ-10)
// - Timeline/audit linkage (REQ-11)
// - Progress, results, duplicate prevention (REQ-12)

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ShieldCheck, AlertTriangle, Search, FileText, Ban, Clock,
  CheckCircle2, XCircle, Lock, Loader2, Gavel, ArrowRight,
  AlertCircle, Info, Link2, Database, Activity,
} from 'lucide-react';
import type { IntegrityAlert } from '../lib/engineeringIntegrityService';
import type { EngineeringRecommendation } from '../lib/engineeringRecommendationEngine';
import type { EvidencePackage } from '../lib/evidencePackageService';
import {
  generateDynamicActions,
  buildInvestigationOutcome,
  getNavigationDestination,
  type DynamicResolutionAction,
} from '../lib/integrityResolutionEngine';
import {
  RESOLUTION_STATUS_LABELS,
  type ResolutionStatus,
} from '../lib/engineeringIntelligenceWorkflow';
import {
  resolveAuthoritativeDecision,
  assertDecisionLinked,
  executeResolutionAction,
  buildHistoricalReferenceInput,
  createHistoricalReference,
  type DecisionLinkage,
  type EvidenceSearchResult,
  type ResolutionExecutionResult,
  type HistoricalReferenceInput,
} from '../lib/integrityResolutionExecutionService';

interface Props {
  alert: IntegrityAlert;
  recommendation: EngineeringRecommendation | null;
  evidencePackage: EvidencePackage | null;
  decisionId: string | null;
  onClose: () => void;
  onNavigate?: (section: string, objectRef?: string) => void;
  onAlertResolved?: (alertId: string) => void;
  onDecisionChanged?: (newDecisionId: string, newRecommendation: EngineeringRecommendation | null) => void;
}

export function IntegrityResolutionWorkspace({
  alert,
  recommendation,
  evidencePackage,
  decisionId: _initialDecisionId,
  onClose,
  onNavigate: _onNavigate,
  onAlertResolved,
  onDecisionChanged,
}: Props) {
  const [lifecycleState, setLifecycleState] = useState<ResolutionStatus>(
    (alert.resolution_status as ResolutionStatus) ?? 'detected',
  );
  const [executing, setExecuting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultSuccess, setResultSuccess] = useState<boolean | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [selectedAction, setSelectedAction] = useState<DynamicResolutionAction | null>(null);
  const [decisionLinkage, setDecisionLinkage] = useState<DecisionLinkage | null>(null);
  const [linkageLoading, setLinkageLoading] = useState(true);
  const [linkageError, setLinkageError] = useState<string | null>(null);
  const [evidenceSearchResult, setEvidenceSearchResult] = useState<EvidenceSearchResult | null>(null);
  const [searchProgress, setSearchProgress] = useState<string | null>(null);
  const [showHistoricalForm, setShowHistoricalForm] = useState(false);
  const [historicalInput, setHistoricalInput] = useState<HistoricalReferenceInput | null>(null);
  const [historicalCreating, setHistoricalCreating] = useState(false);
  const [executionResult, setExecutionResult] = useState<ResolutionExecutionResult | null>(null);
  const executedRef = useRef<string | null>(null);

  // REQ-1 & REQ-2: Resolve authoritative decision on mount
  useEffect(() => {
    let cancelled = false;
    setLinkageLoading(true);
    setLinkageError(null);

    resolveAuthoritativeDecision(alert.id, alert.alert_ref)
      .then(linkage => {
        if (cancelled) return;
        setDecisionLinkage(linkage);
        if (linkage.linkage_status === 'missing') {
          setLinkageError(linkage.ambiguity_reason ?? 'No authoritative decision found.');
        }
      })
      .catch(err => {
        if (cancelled) return;
        setLinkageError(`Decision lookup failed: ${String(err)}`);
      })
      .finally(() => {
        if (!cancelled) setLinkageLoading(false);
      });

    return () => { cancelled = true; };
  }, [alert.id, alert.alert_ref]);

  const isReadOnly = lifecycleState === 'resolved' || lifecycleState === 'archived';
  const hasDecision = decisionLinkage ? assertDecisionLinked(decisionLinkage) : false;

  const actions = generateDynamicActions(alert, recommendation, evidencePackage, {
    isProductOwner: true,
    currentLifecycleState: lifecycleState,
  });

  const outcomeSteps = buildInvestigationOutcome(recommendation);

  // REQ-12: Duplicate prevention — track executed action
  const handleAction = useCallback(async (action: DynamicResolutionAction) => {
    if (!action.available || isReadOnly || executing) return;

    // REQ-1: Block execution if decision linkage is missing
    if (!hasDecision || !decisionLinkage?.decision?.id) {
      setResultSuccess(false);
      setResultMessage('Cannot execute resolution: No authoritative decision linked to this alert. The investigation may not have completed. Please ensure the investigation has generated an Engineering Decision before attempting resolution.');
      return;
    }

    // REQ-12: Duplicate prevention
    const execKey = `${alert.id}-${action.action_type}-${Date.now()}`;
    if (executedRef.current === execKey) return;
    executedRef.current = execKey;

    setExecuting(true);
    setResultMessage(null);
    setResultSuccess(null);
    setEvidenceSearchResult(null);
    setSearchProgress(null);
    setSelectedAction(action);

    // For search_additional_evidence, show progress
    if (action.action_type === 'search_additional_evidence') {
      setSearchProgress('Searching authoritative sources...');
    }

    // For record_historical_reference, show the form first
    if (action.action_type === 'record_historical_reference') {
      const input = buildHistoricalReferenceInput(
        alert,
        decisionLinkage.decision,
        evidencePackage,
        resolutionNotes,
      );
      setHistoricalInput(input);
      setShowHistoricalForm(true);
      setExecuting(false);
      return;
    }

    try {
      const result = await executeResolutionAction(
        alert,
        action.action_type,
        decisionLinkage.decision,
        recommendation,
        evidencePackage,
        'Product Owner',
        resolutionNotes,
      );

      setExecutionResult(result);
      setResultMessage(result.message);
      setResultSuccess(result.success);

      if (result.evidence_search_result) {
        setEvidenceSearchResult(result.evidence_search_result);
        setSearchProgress(null);
      }

      if (result.success) {
        // Update lifecycle state
        if (result.closes_alert) {
          setLifecycleState('resolved');
          onAlertResolved?.(alert.id);
        } else {
          setLifecycleState('po_review');
        }

        // If decision was re-evaluated, notify parent
        if (action.action_type === 'search_additional_evidence' && result.evidence_search_result?.should_reconsider_decision) {
          onDecisionChanged?.(decisionLinkage.decision.id, recommendation);
        }
      }
    } catch (err) {
      setResultSuccess(false);
      setResultMessage(`Resolution execution failed: ${String(err)}`);
    } finally {
      setExecuting(false);
      executedRef.current = null;
    }
  }, [isReadOnly, executing, hasDecision, decisionLinkage, alert, recommendation, evidencePackage, resolutionNotes, onAlertResolved, onDecisionChanged]);

  // REQ-8: Historical Reference confirmation handler
  const handleConfirmHistoricalReference = useCallback(async () => {
    if (!historicalInput || !decisionLinkage?.decision?.id || historicalCreating) return;

    setHistoricalCreating(true);

    try {
      const result = await createHistoricalReference(
        historicalInput,
        alert,
        decisionLinkage.decision,
      );

      if (result.success) {
        setResultSuccess(true);
        setResultMessage(`Historical Reference created successfully: ${historicalInput.reference}`);
        setLifecycleState('resolved');
        setShowHistoricalForm(false);
        onAlertResolved?.(alert.id);
      } else {
        setResultSuccess(false);
        setResultMessage(`Historical Reference creation failed: ${result.error ?? 'Unknown error'}`);
      }
    } catch (err) {
      setResultSuccess(false);
      setResultMessage(`Historical Reference creation failed: ${String(err)}`);
    } finally {
      setHistoricalCreating(false);
    }
  }, [historicalInput, decisionLinkage, alert, onAlertResolved]);

  const _navDestination = recommendation
    ? getNavigationDestination(recommendation.recommendation_type, recommendation.recovery_justification, false)
    : 'integrity_resolution_workspace';

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Gavel className="w-5 h-5 text-blue-600 shrink-0" />
              <h2 className="text-lg font-semibold text-slate-800 truncate">
                Integrity Resolution Workspace
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              {alert.alert_ref} · {RESOLUTION_STATUS_LABELS[lifecycleState] ?? lifecycleState}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0 ml-4">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* REQ-1: Decision Linkage Status */}
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" /> Authoritative Decision Linkage
            </h3>
            {linkageLoading ? (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
                <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                <p className="text-xs text-slate-500">Resolving authoritative decision...</p>
              </div>
            ) : hasDecision && decisionLinkage ? (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-slate-700">
                      Decision Linked: {decisionLinkage.decision.decision_title}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        ID: {decisionLinkage.decision.id.slice(0, 8)}...
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        Version: {decisionLinkage.decision_version}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        Type: {decisionLinkage.recommendation_type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        Confidence: {Math.round(decisionLinkage.decision.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-red-700">Decision Linkage Missing</p>
                    <p className="text-xs text-red-600 mt-1">{linkageError ?? 'No authoritative decision found.'}</p>
                    <p className="text-[10px] text-red-500 mt-1">
                      Resolution actions are blocked until an Engineering Decision is linked. Run the investigation first to generate a decision.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Investigation Outcome */}
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Investigation Outcome
            </h3>
            <div className="space-y-1.5">
              {outcomeSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  {step.completed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-slate-700">{step.label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Recommendation Summary */}
          {recommendation && (
            <section>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" /> Engineering Recommendation
              </h3>
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-sm font-semibold text-slate-800">{recommendation.recommended_action}</p>
                <p className="text-xs text-slate-600 mt-1">{recommendation.summary}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    Recovery: {recommendation.recovery_justification.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    Stage: {recommendation.investigation_stage.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    Evidence: {Math.round(recommendation.evidence_confidence * 100)}%
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* REQ-4: Evidence Search Results */}
          {evidenceSearchResult && (
            <section>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" /> Evidence Search Results
              </h3>
              <div className={`p-3 rounded-lg border ${
                evidenceSearchResult.outcome === 'new_evidence_found'
                  ? 'bg-emerald-50 border-emerald-200'
                  : evidenceSearchResult.outcome === 'partially_failed'
                    ? 'bg-amber-50 border-amber-200'
                    : evidenceSearchResult.outcome === 'blocked'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-slate-50 border-slate-200'
              }`}>
                <p className="text-xs font-semibold text-slate-700">{evidenceSearchResult.summary}</p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="text-[10px] text-slate-500">
                    <span className="font-bold">Sources attempted:</span> {evidenceSearchResult.sources_attempted.length}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    <span className="font-bold">Sources searched:</span> {evidenceSearchResult.sources_successfully_searched.length}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    <span className="font-bold">New evidence:</span> {evidenceSearchResult.newly_discovered_evidence.length}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    <span className="font-bold">Updated confidence:</span> {Math.round(evidenceSearchResult.updated_evidence_confidence * 100)}%
                  </div>
                  <div className="text-[10px] text-slate-500">
                    <span className="font-bold">Authoritative:</span> {evidenceSearchResult.authoritative_evidence_count}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    <span className="font-bold">Conflicting:</span> {evidenceSearchResult.conflicting_evidence_count}
                  </div>
                </div>
                {evidenceSearchResult.failures.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] font-bold text-amber-600">Failures:</p>
                    {evidenceSearchResult.failures.map((f, i) => (
                      <p key={i} className="text-[10px] text-amber-600 ml-2">{f.source}: {f.error}</p>
                    ))}
                  </div>
                )}
                {evidenceSearchResult.should_reconsider_decision && (
                  <div className="mt-2 p-2 rounded bg-blue-100 border border-blue-200">
                    <p className="text-[10px] font-bold text-blue-700">
                      Decision re-evaluation triggered — new evidence may change the recommendation.
                    </p>
                  </div>
                )}
                <p className="text-[10px] text-slate-400 mt-1">
                  Search: {new Date(evidenceSearchResult.search_started_at).toLocaleTimeString()} → {new Date(evidenceSearchResult.search_completed_at).toLocaleTimeString()}
                </p>
              </div>
            </section>
          )}

          {/* REQ-7: Historical Reference Form */}
          {showHistoricalForm && historicalInput && (
            <section>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Historical Reference Confirmation
              </h3>
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 space-y-2">
                <p className="text-xs text-slate-600">
                  Review the Historical Reference details below. No reference will be created until you confirm.
                </p>
                <div className="space-y-1.5">
                  <FormField label="Reference" value={historicalInput.reference} onChange={v => setHistoricalInput({ ...historicalInput, reference: v })} />
                  <FormField label="Title" value={historicalInput.title} onChange={v => setHistoricalInput({ ...historicalInput, title: v })} />
                  <FormField label="Audit Ref" value={historicalInput.audit_ref} onChange={v => setHistoricalInput({ ...historicalInput, audit_ref: v })} />
                  <FormField label="Evidence Summary" value={historicalInput.evidence_summary} onChange={v => setHistoricalInput({ ...historicalInput, evidence_summary: v })} textarea />
                  <FormField label="Conclusion" value={historicalInput.conclusion} onChange={v => setHistoricalInput({ ...historicalInput, conclusion: v })} textarea />
                  <FormField label="Historical Explanation" value={historicalInput.historical_explanation} onChange={v => setHistoricalInput({ ...historicalInput, historical_explanation: v })} textarea />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleConfirmHistoricalReference}
                    disabled={historicalCreating}
                    className="px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {historicalCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    {historicalCreating ? 'Creating...' : 'Confirm & Create Historical Reference'}
                  </button>
                  <button
                    onClick={() => { setShowHistoricalForm(false); setHistoricalInput(null); }}
                    className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Product Owner Decision Panel */}
          {!isReadOnly && (
            <section>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Gavel className="w-3.5 h-3.5" /> Product Owner Decision Required
              </h3>

              {/* Resolution Notes */}
              <div className="mb-3">
                <button
                  onClick={() => setShowNotes(!showNotes)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  {showNotes ? 'Hide' : 'Add'} resolution notes
                </button>
                {showNotes && (
                  <textarea
                    value={resolutionNotes}
                    onChange={e => setResolutionNotes(e.target.value)}
                    placeholder="Enter governance notes for this decision..."
                    className="mt-1.5 w-full p-2.5 text-xs border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                )}
              </div>

              {/* Search Progress */}
              {searchProgress && (
                <div className="mb-3 p-2.5 rounded-lg bg-blue-50 border border-blue-200 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                  <p className="text-xs text-blue-700">{searchProgress}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2">
                {actions.map(action => {
                  const icon = getActionIcon(action.action_type);
                  const disabled = !action.available || executing || !hasDecision;
                  return (
                    <button
                      key={action.id}
                      onClick={() => handleAction(action)}
                      disabled={disabled}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                        !disabled
                          ? action.creates_engineering_object
                            ? 'border-amber-200 bg-amber-50 hover:bg-amber-100'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                          : 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <div className="shrink-0 mt-0.5">
                        {executing && selectedAction?.id === action.id ? (
                          <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                        ) : action.available && hasDecision ? (
                          icon
                        ) : (
                          <Lock className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">{action.label}</span>
                          {action.creates_engineering_object && (
                            <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">CREATES OBJECT</span>
                          )}
                          {action.closes_alert && (
                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">CLOSES ALERT</span>
                          )}
                          {action.requires_po_approval && (
                            <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full">PO APPROVAL</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{action.description}</p>
                        {action.unavailable_reason && (
                          <p className="text-[10px] text-amber-600 mt-1 font-medium">{action.unavailable_reason}</p>
                        )}
                        {!hasDecision && action.available && (
                          <p className="text-[10px] text-red-500 mt-1 font-medium">Blocked: No decision linkage</p>
                        )}
                        <p className="text-[10px] text-slate-400 mt-0.5 italic">{action.governance_notes}</p>
                      </div>
                      {!disabled && <ArrowRight className="w-4 h-4 text-slate-300 shrink-0 mt-1" />}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Result Message */}
          {resultMessage && (
            <section>
              <div className={`p-3 rounded-lg border ${
                resultSuccess
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-start gap-2">
                  {resultSuccess ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="text-xs text-slate-700">{resultMessage}</p>
                    {executionResult && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          Timeline events: {executionResult.timeline_events_recorded}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          Change log: {executionResult.change_log_recorded ? 'Yes' : 'No'}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          Lifecycle: {executionResult.lifecycle_transitioned ? 'Transitioned' : 'Unchanged'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Resolution Lifecycle */}
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Resolution Lifecycle
            </h3>
            <div className="flex flex-wrap items-center gap-1">
              {(['detected', 'investigating', 'decision_produced', 'po_review', 'resolution_selected', 'resolution_executed', 'resolved', 'archived'] as ResolutionStatus[]).map((stage, i, arr) => {
                const order = ['detected', 'investigating', 'decision_produced', 'po_review', 'resolution_selected', 'resolution_executed', 'resolved', 'archived'];
                const currentIdx = order.indexOf(lifecycleState);
                const stageIdx = order.indexOf(stage);
                const isComplete = stageIdx < currentIdx;
                const isCurrent = stageIdx === currentIdx;
                return (
                  <div key={stage} className="flex items-center">
                    <div className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                      isComplete ? 'bg-emerald-100 text-emerald-700'
                      : isCurrent ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-400'
                    }`}>
                      {RESOLUTION_STATUS_LABELS[stage] ?? stage}
                    </div>
                    {i < arr.length - 1 && <span className="text-slate-300 mx-0.5">→</span>}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Read-only banner for resolved alerts */}
          {isReadOnly && (
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              <p className="text-xs text-slate-500">
                This alert has been {lifecycleState === 'archived' ? 'archived' : 'resolved'} and is read-only.
                {alert.resolved_at && ` Resolved on ${new Date(alert.resolved_at).toLocaleString()} by ${alert.resolved_by ?? 'unknown'}.`}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-400">
            Detected: {new Date(alert.created_at).toLocaleString()}
          </p>
          {executing && <span className="text-xs text-slate-400 flex items-center gap-1"><Activity className="w-3 h-3 animate-pulse" /> Executing...</span>}
        </div>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, textarea }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean }) {
  return (
    <div>
      <label className="text-[10px] font-bold text-slate-500 uppercase">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          className="mt-0.5 w-full p-2 text-xs border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={2}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="mt-0.5 w-full p-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
    </div>
  );
}

function getActionIcon(actionType: string): React.ReactElement {
  const iconClass = 'w-4 h-4 text-slate-500';
  switch (actionType) {
    case 'search_additional_evidence':
      return <Search className={iconClass} />;
    case 'record_historical_reference':
      return <FileText className={iconClass} />;
    case 'accept_permanent_gap':
      return <CheckCircle2 className={iconClass} />;
    case 'mark_invalid_obsolete':
      return <Ban className={iconClass} />;
    case 'defer_and_monitor':
      return <Clock className={iconClass} />;
    case 'create_canonical_work_order':
      return <AlertTriangle className="w-4 h-4 text-amber-600" />;
    case 'accept_historical_reference':
      return <CheckCircle2 className={iconClass} />;
    case 'resolve_lineage':
      return <ArrowRight className={iconClass} />;
    case 'synchronise_metadata':
      return <ArrowRight className={iconClass} />;
    case 'escalate_to_po':
      return <Gavel className={iconClass} />;
    case 'dismiss_false_positive':
      return <XCircle className={iconClass} />;
    default:
      return <Info className={iconClass} />;
  }
}
