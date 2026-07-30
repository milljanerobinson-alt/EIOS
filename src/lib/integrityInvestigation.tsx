// EWO-014.19A.7S + EWO-014.19A.7SR.1 — Reusable Investigation Workspace
//
// Selecting an alert opens a dedicated investigation panel containing:
// Executive Summary, Root Cause, Affected Components, Evidence, Timeline,
// Recommended Actions, Related Engineering, Confidence.
//
// EWO-014.19A.7SR.1: Evidence and actions now resolve to canonical engineering
// objects via engineeringNavigationService. Missing objects display governed
// guidance instead of navigating to placeholders.

import { useState, useCallback, useEffect } from 'react';
import {
  X, ShieldAlert, AlertTriangle, CheckCircle2, Clock, FileText,
  Package, GitBranch, ExternalLink, Activity, ChevronRight, AlertCircle,
  Lightbulb, Gauge, Ban, Database, Loader2, Network, GitFork, Target, XCircle,
  Copy, Check, Download, Bot, Info,
} from 'lucide-react';
import type { IntegrityAlert } from './engineeringIntegrityService';
import type { CapabilityState } from './integrityMaturityModel';
import {
  navigateToCanonical, formatNavigationFailure,
  type NavigationFailure,
} from './engineeringNavigationService';
import { GovernedNavigationDialog } from './governedNavigationDialog';
import {
  buildEvidencePackage,
  getEvidenceAwareActions,
  type EvidencePackage,
  type EvidenceItem,
} from './evidencePackageService';
import {
  buildEngineeringRecommendation,
  persistRecommendation,
  type EngineeringRecommendation,
  type RecommendationType,
  type RiskLevel,
  type AutoRepairSuitability,
  type PODecision,
} from './engineeringRecommendationEngine';
import {
  buildGovernedActions,
  evolveAlertTitle,
  executeGovernedResolution,
  updateResolutionStatus,
  updateEvolvedTitle,
  getAlertResolutionStatus,
  reloadAlert,
  RESOLUTION_LIFECYCLE,
  RESOLUTION_STATUS_LABELS,
  type GovernedAction,
  type ResolutionActionType,
  type ResolutionStatus,
} from './engineeringIntelligenceWorkflow';
import { buildGovernedResponse, type GovernedResponse } from './governedResponse';
import { DOMAIN_LABELS, type SecondaryFinding } from './integrityDomainModel';
import {
  generateAuthoritativeDecision,
  getDecisionForAlert,
  getDecisionTimeline,
  DECISION_LABELS,
  RELATIONSHIP_LABELS,
  type EngineeringDecision,
  type DecisionTimelineEvent,
} from './engineeringDecisionService';
import {
  generateInvestigationExport, generateAIContextExport,
  buildCanonicalExportModel, checkExportReadiness,
  type CanonicalExportInput, type ExportReadinessResult,
} from './investigationExportService';
import {
  downloadInvestigationPDF, RENDERER_VERSION,
  type InvestigationSchemaData, type ExportDiagnostic,
} from './investigationPDFRenderer';
import { serializeAIContext } from './investigationSchema';

export interface InvestigationEvidence {
  label: string;
  type: 'ewo' | 'completion_report' | 'standard' | 'constitution' | 'historical_recovery' | 'engineering_record' | 'runtime_diagnostic' | 'source' | 'text';
  reference: string;
  description?: string;
}

export interface InvestigationAction {
  label: string;
  type: 'review_diagnostics' | 'open_engineering' | 'open_completion_report' | 'review_constitutional' | 'open_standard' | 'review_change_history' | 'retry_diagnostic' | 'resolve_alert' | 'dismiss_alert' | 'create_missing_ewo' | 'open_resolution_workspace';
  available: boolean;
  unavailableReason?: string;
  targetRef?: string;
}

export interface AuthoritativeLineageDetail {
  childRef: string;
  expectedParent: string;
  actualParent: string | null;
  classification: string;
  authoritativeStatus: string;
  sourceObjectType: string;
  sourceObjectId: string | null;
  lifecycleOrHistoricalStatus: string | null;
  lineageSatisfied: boolean;
  executionPermitted: boolean;
  governingEvidence: string | null;
  auditConclusion: string | null;
  resolutionReason: string;
}

export interface InvestigationData {
  alert: IntegrityAlert;
  executiveSummary: string;
  rootCause: string;
  affectedComponents: string[];
  evidence: InvestigationEvidence[];
  timeline: { timestamp: string; event: string }[];
  recommendedActions: InvestigationAction[];
  relatedEngineering: { ref: string; title: string; type: string }[];
  confidence: number;
  confidenceExplanation: string;
  capabilityState?: CapabilityState;
  authoritativeLineage?: AuthoritativeLineageDetail;
  evidencePackage?: EvidencePackage;
  // EWO-021R.5: Recommendation is set asynchronously by InvestigationWorkspace.
  // The IntegrityResolutionWorkspace receives it as a prop.
  recommendation?: EngineeringRecommendation;
}

interface Props {
  investigation: InvestigationData;
  onClose: () => void;
  onNavigate?: (section: string, objectRef?: string) => void;
  onResolve?: (alert: IntegrityAlert, notes: string) => void;
  onDismiss?: (alert: IntegrityAlert, notes: string) => void;
  onRetry?: () => void;
  onCreateMissing?: (objectType: string, reference: string) => void;
  onOpenResolutionWorkspace?: (alert: IntegrityAlert) => void;
  onRecommendationReady?: (recommendation: EngineeringRecommendation | null, evidencePackage: EvidencePackage | null) => void;
}

const EVIDENCE_ICONS: Record<InvestigationEvidence['type'], typeof FileText> = {
  ewo: FileText,
  completion_report: Package,
  standard: FileText,
  constitution: ShieldAlert,
  historical_recovery: GitBranch,
  engineering_record: FileText,
  runtime_diagnostic: Activity,
  source: Database,
  text: FileText,
};

const EVIDENCE_HINT_MAP: Record<InvestigationEvidence['type'], string | undefined> = {
  ewo: 'ewo',
  completion_report: 'completion_report',
  standard: 'standard',
  constitution: 'constitution',
  historical_recovery: 'historical_recovery',
  engineering_record: 'engineering_record',
  runtime_diagnostic: 'runtime_diagnostic',
  source: undefined,
  text: undefined,
};

const ACTION_HINT_MAP: Record<InvestigationAction['type'], string | undefined> = {
  open_engineering: 'ewo',
  open_completion_report: 'completion_report',
  review_constitutional: 'constitution',
  open_standard: 'standard',
  review_change_history: 'ewo',
  review_diagnostics: 'runtime_diagnostic',
  retry_diagnostic: undefined,
  resolve_alert: undefined,
  dismiss_alert: undefined,
  create_missing_ewo: 'ewo',
};

export function InvestigationWorkspace({ investigation, onClose, onNavigate, onResolve, onDismiss, onRetry, onCreateMissing, onOpenResolutionWorkspace, onRecommendationReady }: Props) {
  const { alert, executiveSummary, rootCause, affectedComponents, evidence, timeline, recommendedActions, relatedEngineering, confidence, confidenceExplanation } = investigation;

  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolving, setResolving] = useState(false);
  const [navigating, setNavigating] = useState<string | null>(null);
  const [navFailure, setNavFailure] = useState<NavigationFailure | null>(null);
  const [evidencePackage, setEvidencePackage] = useState<EvidencePackage | null>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [recommendation, setRecommendation] = useState<EngineeringRecommendation | null>(null);
  const [persistingRec, setPersistingRec] = useState(false);
  const [governedActions, setGovernedActions] = useState<GovernedAction[]>([]);
  const [evolvedTitle, setEvolvedTitle] = useState<string | null>(null);
  // EWO-014.19A.7SR.6R.1: Initialize resolution status from the persisted DB value,
  // not a hardcoded default. The DB is the single authoritative source.
  const initialStatus = (alert.resolution_status as ResolutionStatus) ?? 'detected';
  const [resolutionStatus, setResolutionStatus] = useState<ResolutionStatus>(initialStatus);
  const [executingResolution, setExecutingResolution] = useState(false);
  const [resolutionMessage, setResolutionMessage] = useState<string | null>(null);
  const [resolutionTimestamp, setResolutionTimestamp] = useState<string | null>(alert.resolved_at ?? null);
  const [resolutionActor, setResolutionActor] = useState<string | null>(alert.resolved_by ?? null);
  // EWO-020: Governed response state for ES-003 compliance
  const [governedResponseState, setGovernedResponseState] = useState<GovernedResponse | null>(null);
  // EWO-021: Authoritative engineering decision
  const [decision, setDecision] = useState<EngineeringDecision | null>(null);
  const [decisionTimeline, setDecisionTimeline] = useState<DecisionTimelineEvent[]>([]);
  const [copied, setCopied] = useState(false);
  const [pdfDownloaded, setPdfDownloaded] = useState(false);
  const [aiContextCopied, setAiContextCopied] = useState(false);
  const [exportWarning, setExportWarning] = useState<string | null>(null);
  const [exportWarningRef, setExportWarningRef] = useState<string | null>(null);
  const [lastDiagnostic, setLastDiagnostic] = useState<ExportDiagnostic | null>(null);

  // EWO-014.19A.7SR.6R.1: Derived read-only flag — resolved/archived alerts are read-only
  const isReadOnly = resolutionStatus === 'resolved' || resolutionStatus === 'archived';

  // Load evidence package on mount or when alert changes
  // EWO-014.19A.7SR.6R.1: Never overwrite a resolved/archived status with decision_produced
  useEffect(() => {
    let cancelled = false;

    // EWO-014.19A.7SR.6R.1: Load the authoritative resolution status from DB first
    getAlertResolutionStatus(alert.id).then(dbStatus => {
      if (cancelled) return;
      if (dbStatus && dbStatus !== resolutionStatus) {
        setResolutionStatus(dbStatus);
        if (dbStatus === 'resolved' || dbStatus === 'archived') {
          setResolutionTimestamp(alert.resolved_at);
          setResolutionActor(alert.resolved_by);
        }
      }
    });

    // EWO-014.19A.7SR.6R.1: Skip evidence/recommendation loading for resolved alerts
    const currentStatus = resolutionStatus;
    if (currentStatus === 'resolved' || currentStatus === 'archived') {
      // Still show evolved title if available
      if (alert.evolved_title) setEvolvedTitle(alert.evolved_title);
      // EWO-020R.1: Build governed response from registry for read-only resolved alerts
      const refCode = currentStatus === 'archived' ? 'EIOS-INTEGRITY-001' : 'EIOS-INTEGRITY-001';
      const govResponse = buildGovernedResponse(refCode, {
        title: alert.evolved_title ?? 'Integrity Alert Resolved',
        summary: 'This alert has been resolved through governed resolution and is now read-only.',
      });
      setGovernedResponseState(govResponse);
      return;
    }

    if (investigation.evidencePackage) {
      setEvidencePackage(investigation.evidencePackage);
    } else {
      setLoadingEvidence(true);
      setEvidencePackage(null);
      buildEvidencePackage(alert).then(pkg => {
        if (!cancelled) {
          setEvidencePackage(pkg);
          setLoadingEvidence(false);
          // Build engineering recommendation from evidence package
          const rec = buildEngineeringRecommendation(alert, pkg);
          setRecommendation(rec);
          onRecommendationReady?.(rec, pkg);
          // EWO-014.19A.7SR.6: Build governed actions from final recommendation
          const actions = buildGovernedActions(alert, rec, pkg);
          setGovernedActions(actions);
          // EWO-014.19A.7SR.6: Evolve alert title from final recommendation
          const title = evolveAlertTitle(alert, rec, pkg);
          setEvolvedTitle(title);
          // EWO-021: Generate authoritative engineering decision
          generateAuthoritativeDecision(alert, pkg, rec).then(dec => {
            if (!cancelled && dec) {
              setDecision(dec);
              getDecisionTimeline(dec.id).then(tl => {
                if (!cancelled) setDecisionTimeline(tl);
              });
            }
          });
          // EWO-014.19A.7SR.6R.1: Only transition to decision_produced if not already resolved/archived
          setResolutionStatus(prev => {
            if (prev === 'resolved' || prev === 'archived') return prev;
            updateResolutionStatus(alert.id, 'decision_produced');
            return 'decision_produced';
          });
          // Persist evolved title to database
          updateEvolvedTitle(alert.id, title);
          // Persist recommendation for audit (fire and forget)
          setPersistingRec(true);
          persistRecommendation(rec).then(() => {
            if (!cancelled) setPersistingRec(false);
          }).catch(() => {
            if (!cancelled) setPersistingRec(false);
          });
        }
      }).catch(() => {
        if (!cancelled) setLoadingEvidence(false);
      });
    }
    return () => { cancelled = true; };
  }, [alert, investigation.evidencePackage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCanonicalNavigation = useCallback(async (reference: string, hint?: string) => {
    setNavigating(reference);
    setNavFailure(null);

    try {
      const result = await navigateToCanonical(reference, hint, { validateExists: true });

      if (!result.success) {
        // EWO-021R.5: Decision-driven navigation — if the recommendation is
        // unverified_reference_recovery_candidate, open the Resolution Workspace
        // instead of the GovernedNavigationDialog with "Create Missing" button.
        if (recommendation?.recommendation_type === 'unverified_reference_recovery_candidate'
            || recommendation?.recommendation_type === 'begin_historical_recovery'
            || recommendation?.recommendation_type === 'po_review_required'
            || recommendation?.recommendation_type === 'unsafe_to_repair') {
          onOpenResolutionWorkspace?.(alert);
        } else {
          setNavFailure(result.failure);
        }
      }
      // If successful, the navigation service has already updated the browser URL.
      // Notify parent so any internal state can sync.
      if (onNavigate && result.success) {
        onNavigate(result.destination.objectType, result.destination.objectRef);
      }
    } catch {
      setNavFailure({
        reference,
        objectType: 'ewo',
        reason: 'Navigation could not be completed due to an unexpected error. This does not indicate the object is missing — only that resolution failed at this time.',
        referenceCode: 'EIOS-NAV-003',
        recommendedAction: 'Retry navigation or contact engineering support.',
      });
    } finally {
      setNavigating(null);
    }
  }, [onNavigate, recommendation, alert, onOpenResolutionWorkspace]);

  const handleGovernedResolution = useCallback(async (action: GovernedAction) => {
    if (!action.available || !action.resolution_action) return;
    // EWO-014.19A.7SR.6R.1: Prevent execution when already resolved
    if (isReadOnly) return;
    setExecutingResolution(true);
    setResolutionMessage(null);
    const result = await executeGovernedResolution(
      alert,
      action.resolution_action,
      recommendation,
      'Product Owner',
    );
    setExecutingResolution(false);
    setResolutionMessage(result.message);
    if (result.success) {
      // EWO-020: Show governed success response
      const govResponse = buildGovernedResponse('EIOS-INTEGRITY-001', {
        title: evolvedTitle ?? 'Integrity Alert Resolved',
        summary: result.message,
      });
      setGovernedResponseState(govResponse);
      // EWO-014.19A.7SR.6R.1: Reload the alert from the authoritative DB source
      const reloaded = await reloadAlert(alert.id);
      if (reloaded) {
        setResolutionStatus('resolved');
        setResolutionTimestamp(reloaded.resolved_at);
        setResolutionActor(reloaded.resolved_by);
        // Clear governed actions so buttons disappear
        setGovernedActions([]);
      } else {
        setResolutionStatus('resolved');
      }
    } else if (result.message.includes('already been resolved')) {
      // EWO-020: Show governed failure response for duplicate resolution
      const govResponse = buildGovernedResponse('EIOS-INTEGRITY-003', {
        summary: result.message,
      });
      setGovernedResponseState(govResponse);
    }
  }, [alert, recommendation, isReadOnly]);

  const handleAction = (action: InvestigationAction) => {
    if (!action.available) return;
    switch (action.type) {
      case 'open_engineering':
      case 'open_completion_report':
      case 'review_constitutional':
      case 'open_standard':
      case 'review_change_history':
      case 'review_diagnostics':
        if (action.targetRef) {
          handleCanonicalNavigation(action.targetRef, ACTION_HINT_MAP[action.type]);
        }
        break;
      case 'retry_diagnostic':
        onRetry?.();
        break;
      case 'resolve_alert':
        setResolving(true);
        onResolve?.(alert, resolutionNotes);
        setResolving(false);
        break;
      case 'dismiss_alert':
        setResolving(true);
        onDismiss?.(alert, resolutionNotes);
        setResolving(false);
        break;
      case 'open_resolution_workspace':
        onOpenResolutionWorkspace?.(alert);
        break;
      case 'create_missing_ewo':
        if (action.targetRef) {
          onCreateMissing?.('ewo', action.targetRef);
        }
        break;
    }
  };

  const confidenceLabel = confidence >= 0.9 ? 'High' : confidence >= 0.7 ? 'Medium' : confidence >= 0.5 ? 'Low' : 'Very Low';
  const confidenceColour = confidence >= 0.9 ? 'text-emerald-600' : confidence >= 0.7 ? 'text-amber-600' : 'text-red-600';

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
        <div
          className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 shrink-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                <h2 className="text-lg font-semibold text-slate-800 truncate">
                  {evolvedTitle ?? alert.title}
                </h2>
              </div>
              {evolvedTitle && evolvedTitle !== alert.title && (
                <p className="text-[10px] text-slate-400 ml-7">Original: {alert.title}</p>
              )}
              <p className="text-xs text-slate-500">{alert.alert_ref} · {alert.severity.toUpperCase()} · {alert.object_type.toUpperCase()}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <button
                onClick={() => {
                  const input: CanonicalExportInput = {
                    alert,
                    evolvedTitle,
                    executiveSummary,
                    rootCause,
                    affectedComponents,
                    evidence,
                    timeline,
                    recommendedActions,
                    relatedEngineering,
                    confidence,
                    confidenceExplanation,
                    evidencePackage,
                    recommendation,
                    decision,
                    decisionTimeline,
                    authoritativeLineage: investigation.authoritativeLineage,
                    governedActions,
                    resolutionStatus,
                    resolutionTimestamp,
                    resolutionActor,
                    resolutionMessage,
                    governedResponseState,
                    isReadOnly,
                  };
                  const schemaData = buildCanonicalExportModel(input);
                  const result = downloadInvestigationPDF(schemaData);
                  if (!result.success && result.readiness) {
                    setExportWarning(result.readiness.governedResponse?.summary ?? 'Export not ready.');
                    setExportWarningRef(result.readiness.governedResponse?.referenceCode ?? null);
                    setTimeout(() => { setExportWarning(null); setExportWarningRef(null); }, 5000);
                  } else if (result.success && result.diagnostic) {
                    setLastDiagnostic(result.diagnostic);
                    setPdfDownloaded(true);
                    setTimeout(() => setPdfDownloaded(false), 2000);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                title="Download Investigation PDF"
              >
                {pdfDownloaded ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                {pdfDownloaded ? 'Downloaded!' : 'Download PDF'}
              </button>
              <button
                onClick={() => {
                  const input: CanonicalExportInput = {
                    alert,
                    evolvedTitle,
                    executiveSummary,
                    rootCause,
                    affectedComponents,
                    evidence,
                    timeline,
                    recommendedActions,
                    relatedEngineering,
                    confidence,
                    confidenceExplanation,
                    evidencePackage,
                    recommendation,
                    decision,
                    decisionTimeline,
                    authoritativeLineage: investigation.authoritativeLineage,
                    governedActions,
                    resolutionStatus,
                    resolutionTimestamp,
                    resolutionActor,
                    resolutionMessage,
                    governedResponseState,
                    isReadOnly,
                  };
                  const schemaData = buildCanonicalExportModel(input);
                  const readiness = checkExportReadiness(schemaData);
                  if (!readiness.ready) {
                    setExportWarning(readiness.governedResponse?.summary ?? 'Export not ready.');
                    setExportWarningRef(readiness.governedResponse?.referenceCode ?? null);
                    setTimeout(() => { setExportWarning(null); setExportWarningRef(null); }, 5000);
                    return;
                  }
                  const aiContext = serializeAIContext(schemaData);
                  navigator.clipboard.writeText(aiContext).then(() => {
                    setAiContextCopied(true);
                    setTimeout(() => setAiContextCopied(false), 2000);
                  });
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                title="Copy AI Context Package to clipboard"
              >
                {aiContextCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Bot className="w-3.5 h-3.5" />}
                {aiContextCopied ? 'Copied!' : 'Copy AI Context'}
              </button>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            {exportWarning && (
              <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-amber-700">{exportWarning}</p>
                  {exportWarningRef && (
                    <span className="text-[10px] font-mono text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200 mt-1 inline-block">{exportWarningRef}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Executive Summary */}
            <section>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5" /> Executive Summary
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed">{executiveSummary}</p>
            </section>

            {/* Root Cause */}
            <section>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Root Cause
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed">{rootCause}</p>
            </section>

            {/* Affected Components */}
            {affectedComponents.length > 0 && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" /> Affected Components
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {affectedComponents.map(c => (
                    <span key={c} className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded-lg border border-slate-200">{c}</span>
                  ))}
                </div>
              </section>
            )}

            {/* Confidence */}
            <section>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5" /> Confidence
              </h3>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${confidence >= 0.9 ? 'bg-emerald-500' : confidence >= 0.7 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.round(confidence * 100)}%` }}
                  />
                </div>
                <span className={`text-sm font-bold ${confidenceColour}`}>{confidenceLabel} ({Math.round(confidence * 100)}%)</span>
              </div>
              <p className="text-xs text-slate-500 mt-1.5">{confidenceExplanation}</p>
            </section>

            {/* Evidence */}
            {evidence.length > 0 && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Evidence ({evidence.length})
                </h3>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {evidence.map((ev, i) => {
                    const Icon = EVIDENCE_ICONS[ev.type] ?? FileText;
                    const isNavigable = ev.type !== 'text' && ev.type !== 'source';
                    const isNavigating = navigating === ev.reference;
                    return (
                      <button
                        key={i}
                        onClick={() => isNavigable && handleCanonicalNavigation(ev.reference, EVIDENCE_HINT_MAP[ev.type])}
                        disabled={!isNavigable || isNavigating}
                        className={`w-full flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-lg text-left ${isNavigable ? 'hover:bg-slate-100 cursor-pointer' : 'cursor-default'} ${isNavigating ? 'opacity-60' : ''}`}
                      >
                        {isNavigating ? (
                          <Loader2 className="w-4 h-4 text-slate-400 shrink-0 mt-0.5 animate-spin" />
                        ) : (
                          <Icon className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-700">{ev.label}</p>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">{ev.reference}</p>
                          {ev.description && <p className="text-[11px] text-slate-400 mt-0.5">{ev.description}</p>}
                        </div>
                        {isNavigable && !isNavigating && <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-1" />}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Evidence Package — Source Traceability */}
            {evidencePackage && evidencePackage.evidence_items.length > 0 && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" /> Evidence Package ({evidencePackage.evidence_items.length})
                </h3>
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {evidencePackage.evidence_items.map((item, i) => (
                    <div key={i} className="bg-slate-50 rounded-lg border border-slate-200 p-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <Database className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-xs font-semibold text-slate-700">{item.source_type}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{item.source_table}</span>
                        {item.supports_conclusion && (
                          <span className="text-[10px] text-green-600 font-semibold ml-auto">Supports</span>
                        )}
                        {item.contradicts_conclusion && (
                          <span className="text-[10px] text-red-600 font-semibold ml-auto">Conflicts</span>
                        )}
                      </div>
                      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                        <span className="text-slate-400">Field:</span>
                        <span className="font-mono text-slate-600">{item.field_name}</span>
                        {item.field_value && (
                          <>
                            <span className="text-slate-400">Value:</span>
                            <span className="text-slate-700 truncate">{item.field_value}</span>
                          </>
                        )}
                        <span className="text-slate-400">Object ID:</span>
                        <span className="font-mono text-slate-500 truncate">{item.object_id ?? 'N/A'}</span>
                        <span className="text-slate-400">Confidence:</span>
                        <span className="text-slate-600">{(item.confidence * 100).toFixed(0)}%</span>
                        <span className="text-slate-400">Priority:</span>
                        <span className="text-slate-600">{item.evidence_priority}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 italic">{item.why_selected}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Loading evidence indicator */}
            {loadingEvidence && !evidencePackage && (
              <section>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading evidence package...
                </div>
              </section>
            )}

            {/* Conflict Investigation */}
            {evidencePackage && evidencePackage.conflicts.length > 0 && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> Conflicting Values ({evidencePackage.conflicts.length})
                </h3>
                <div className="space-y-2">
                  {evidencePackage.conflicts.map((conflict, i) => (
                    <div key={i} className="bg-amber-50 rounded-lg border border-amber-200 p-3 space-y-2">
                      <p className="text-xs font-semibold text-amber-800">{conflict.conflict_summary}</p>
                      <div className="space-y-1.5">
                        {conflict.values.map((val, j) => (
                          <div key={j} className="flex items-start gap-2 text-xs">
                            <div className="flex-1 min-w-0">
                              <span className="text-slate-500 font-medium">{val.source_type}: </span>
                              <span className="text-slate-700 font-mono break-all">{val.field_value}</span>
                              <span className="text-slate-400 text-[10px] block mt-0.5">{val.source_table} · {val.field_name}</span>
                            </div>
                            {conflict.canonical_candidate === val.field_value && (
                              <span className="text-[10px] text-green-600 font-semibold shrink-0">Canonical</span>
                            )}
                          </div>
                        ))}
                      </div>
                      {conflict.canonical_candidate ? (
                        <div className="pt-1.5 border-t border-amber-200">
                          <p className="text-[11px] text-slate-600">
                            <span className="font-semibold">Canonical candidate: </span>
                            <span className="font-mono">{conflict.canonical_candidate}</span>
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{conflict.canonical_reason}</p>
                        </div>
                      ) : (
                        <div className="pt-1.5 border-t border-amber-200">
                          <p className="text-[11px] text-amber-700 font-semibold">Product Owner review required — canonical value cannot be safely determined.</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Classification Explanation */}
            {evidencePackage && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5" /> Classification Explanation
                </h3>
                <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 space-y-2">
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Classification</p>
                    <p className="text-xs font-semibold text-slate-700">{evidencePackage.classification_explanation.classification}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Why Chosen</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{evidencePackage.classification_explanation.chosen_reason}</p>
                  </div>
                  {evidencePackage.classification_explanation.rejected_alternatives.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Rejected Alternatives</p>
                      <ul className="space-y-0.5">
                        {evidencePackage.classification_explanation.rejected_alternatives.map((alt, i) => (
                          <li key={i} className="text-xs text-slate-500 flex items-start gap-1.5">
                            <Ban className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                            <span>{alt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Authoritative Rules Applied</p>
                    <ul className="space-y-0.5">
                      {evidencePackage.classification_explanation.authoritative_rules_applied.map((rule, i) => (
                        <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                          <ShieldAlert className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
                          <span>{rule}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            )}

            {/* Evidence Graph */}
            {evidencePackage && evidencePackage.evidence_graph.nodes.length > 0 && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5" /> Evidence Graph
                </h3>
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                  <div className="space-y-1">
                    {evidencePackage.evidence_graph.nodes.map((node, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          node.status === 'supporting' ? 'bg-green-500' :
                          node.status === 'conflicting' ? 'bg-red-500' :
                          node.status === 'missing' ? 'bg-amber-500' :
                          'bg-slate-300'
                        }`} />
                        <span className="font-mono text-slate-600">{node.reference}</span>
                        <span className="text-slate-400">→</span>
                        <span className="text-slate-700">{node.label}</span>
                        <span className="text-[10px] text-slate-400 ml-auto">{node.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* EWO-014.19A.7SR.6R.3: Primary Integrity Domain */}
            {recommendation && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" /> Primary Integrity Domain
                </h3>
                <div className="bg-blue-50 rounded-lg border border-blue-200 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-blue-700">{DOMAIN_LABELS[recommendation.primary_integrity_domain]}</span>
                    {recommendation.domain_match ? (
                      <span className="text-[10px] text-green-600 font-semibold">Domain Match: Yes</span>
                    ) : (
                      <span className="text-[10px] text-red-600 font-semibold">Domain Match: No</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                    <span className="text-slate-500">Primary Subject:</span>
                    <span className="font-mono text-slate-700">{alert.normalised_reference ?? '—'}</span>
                    {investigation.authoritativeLineage && (
                      <>
                        <span className="text-slate-500">Relationship Subject:</span>
                        <span className="font-mono text-slate-700">{investigation.authoritativeLineage.expectedParent}</span>
                      </>
                    )}
                    <span className="text-slate-500">Secondary Findings:</span>
                    <span className="font-semibold text-slate-700">{recommendation.secondary_findings.length}</span>
                    <span className="text-slate-500">Rejected Cross-Domain:</span>
                    <span className="font-semibold text-slate-700">{recommendation.rejected_cross_domain_recommendations.length}</span>
                  </div>
                </div>
              </section>
            )}

            {/* EWO-014.19A.7SR.6R.3: Secondary Findings */}
            {recommendation && recommendation.secondary_findings.length > 0 && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" /> Secondary Findings ({recommendation.secondary_findings.length})
                </h3>
                <div className="space-y-2">
                  {recommendation.secondary_findings.map((finding: SecondaryFinding, i: number) => (
                    <div key={i} className="bg-amber-50 rounded-lg border border-amber-200 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Ban className="w-3 h-3 text-amber-600 shrink-0" />
                        <span className="text-xs font-semibold text-amber-800">{finding.description}</span>
                      </div>
                      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                        <span className="text-slate-500">Domain:</span>
                        <span className="text-slate-700">{DOMAIN_LABELS[finding.domain]}</span>
                        <span className="text-slate-500">Field:</span>
                        <span className="font-mono text-slate-600">{finding.field}</span>
                        <span className="text-slate-500">Recommendation:</span>
                        <span className="text-slate-600 line-through">{finding.recommendation_label}</span>
                      </div>
                      <p className="text-[10px] text-amber-700 mt-1 italic">{finding.rejection_reason}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* EWO-014.19A.7SR.6R.3: Rejected Cross-Domain Recommendations */}
            {recommendation && recommendation.rejected_cross_domain_recommendations.length > 0 && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Ban className="w-3.5 h-3.5" /> Rejected Cross-Domain Recommendations ({recommendation.rejected_cross_domain_recommendations.length})
                </h3>
                <div className="space-y-2">
                  {recommendation.rejected_cross_domain_recommendations.map((finding: SecondaryFinding, i: number) => (
                    <div key={i} className="bg-red-50 rounded-lg border border-red-200 p-3">
                      <p className="text-xs font-semibold text-red-800">{finding.recommendation_label}</p>
                      <p className="text-[10px] text-red-600 mt-1 italic">{finding.rejection_reason}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Canonical Decision */}
            {evidencePackage && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" /> Canonical Decision
                </h3>
                <div className={`rounded-lg border p-3 space-y-1.5 ${
                  evidencePackage.canonical_decision.po_review_required
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-green-50 border-green-200'
                }`}>
                  {evidencePackage.canonical_decision.canonical_value ? (
                    <div>
                      <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Canonical Value</p>
                      <p className="text-xs font-mono font-semibold text-slate-700">{evidencePackage.canonical_decision.canonical_value}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Type: {evidencePackage.canonical_decision.canonical_object_type}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-700 font-semibold">No canonical value determined — Product Owner review required.</p>
                  )}
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Reasoning</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{evidencePackage.canonical_decision.reasoning}</p>
                  </div>
                  <div className="flex gap-4 text-[11px]">
                    <span className="text-slate-500">Supporting: <span className="font-semibold text-green-600">{evidencePackage.canonical_decision.supporting_evidence_count}</span></span>
                    <span className="text-slate-500">Conflicting: <span className="font-semibold text-red-600">{evidencePackage.canonical_decision.conflicting_evidence_count}</span></span>
                    <span className="text-slate-500">Confidence: <span className="font-semibold text-slate-700">{(evidencePackage.canonical_decision.confidence * 100).toFixed(0)}%</span></span>
                  </div>
                </div>
              </section>
            )}

            {/* Runtime Diagnostics */}
            {evidencePackage && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5" /> Runtime Diagnostics
                </h3>
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <span className="text-slate-500">Sources Searched:</span>
                    <span className="font-semibold text-slate-700">{evidencePackage.runtime_diagnostics.sources_searched.length}</span>
                    <span className="text-slate-500">Sources Contributing:</span>
                    <span className="font-semibold text-slate-700">{evidencePackage.runtime_diagnostics.sources_contributing_evidence.length}</span>
                    <span className="text-slate-500">Supporting Evidence:</span>
                    <span className="font-semibold text-green-600">{evidencePackage.runtime_diagnostics.supporting_evidence_count}</span>
                    <span className="text-slate-500">Conflicting Evidence:</span>
                    <span className="font-semibold text-red-600">{evidencePackage.runtime_diagnostics.conflicting_evidence_count}</span>
                    <span className="text-slate-500">Authoritative Evidence:</span>
                    <span className="font-semibold text-slate-700">{evidencePackage.runtime_diagnostics.authoritative_evidence_count}</span>
                    <span className="text-slate-500">Unknown Evidence:</span>
                    <span className="font-semibold text-slate-700">{evidencePackage.runtime_diagnostics.unknown_evidence_count}</span>
                    <span className="text-slate-500">PO Decisions Required:</span>
                    <span className="font-semibold text-amber-600">{evidencePackage.runtime_diagnostics.po_decisions_required}</span>
                    <span className="text-slate-500">Auto Repairs Possible:</span>
                    <span className="font-semibold text-slate-700">{evidencePackage.runtime_diagnostics.automatic_repairs_possible}</span>
                    {recommendation && (
                      <>
                        <span className="text-slate-500 font-bold pt-1 border-t border-slate-200 col-span-2">Recommendation Diagnostics</span>
                        <span className="text-slate-500">Recommendations Generated:</span>
                        <span className="font-semibold text-slate-700">1</span>
                        <span className="text-slate-500">Auto Repair Recommended:</span>
                        <span className="font-semibold text-green-600">{recommendation.auto_repair_suitability === 'recommended' || recommendation.auto_repair_suitability === 'safe' ? 'Yes' : 'No'}</span>
                        <span className="text-slate-500">PO Review Required:</span>
                        <span className="font-semibold text-amber-600">{recommendation.po_review_required ? 'Yes' : 'No'}</span>
                        <span className="text-slate-500">Unsafe Repairs:</span>
                        <span className="font-semibold text-red-600">{recommendation.auto_repair_suitability === 'unsafe' ? 1 : 0}</span>
                        <span className="text-slate-500">Alternative Actions:</span>
                        <span className="font-semibold text-slate-700">{recommendation.alternative_actions.length}</span>
                        <span className="text-slate-500">Rec. Confidence:</span>
                        <span className="font-semibold text-slate-700">{(recommendation.recommendation_confidence * 100).toFixed(0)}%</span>
                        {recommendation && (
                          <>
                            <span className="text-slate-500 font-bold pt-1 border-t border-slate-200 col-span-2">Domain Fidelity Diagnostics</span>
                            <span className="text-slate-500">Primary Domain:</span>
                            <span className="font-semibold text-slate-700">{DOMAIN_LABELS[recommendation.primary_integrity_domain]}</span>
                            <span className="text-slate-500">Recommendation Domain:</span>
                            <span className="font-semibold text-slate-700">{DOMAIN_LABELS[recommendation.primary_integrity_domain]}</span>
                            <span className="text-slate-500">Domain Match:</span>
                            <span className={`font-semibold ${recommendation.domain_match ? 'text-green-600' : 'text-red-600'}`}>{recommendation.domain_match ? 'true' : 'false'}</span>
                            <span className="text-slate-500">Rejected Cross-Domain:</span>
                            <span className="font-semibold text-slate-700">{recommendation.rejected_cross_domain_recommendations.length}</span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Engineering Assessment */}
            {/* EWO-021: Authoritative Engineering Decision */}
            {decision && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" /> Authoritative Engineering Decision
                  <span className="ml-auto text-[10px] font-normal text-slate-400">v{decision.decision_version}</span>
                </h3>
                <div className="space-y-2">
                  {/* Decision Type Badge */}
                  <div className={`rounded-lg border p-3 ${
                    decision.resolution_status === 'resolved' ? 'bg-green-50 border-green-200' :
                    decision.decision_type === 'product_owner_decision_required' ? 'bg-amber-50 border-amber-200' :
                    'bg-blue-50 border-blue-200'
                  }`}>
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Decision</p>
                    <p className="text-sm font-bold text-slate-800">{decision.decision_title}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{DECISION_LABELS[decision.decision_type]}</p>
                  </div>

                  {/* Executive Summary */}
                  <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Executive Summary</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{decision.executive_summary}</p>
                  </div>

                  {/* Decision Reasoning */}
                  <div className="bg-blue-50 rounded-lg border border-blue-200 p-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Decision Reasoning</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{decision.decision_reasoning}</p>
                  </div>

                  {/* Confidence */}
                  <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Confidence</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div className="bg-blue-500 h-full rounded-full" style={{ width: `${decision.confidence * 100}%` }} />
                      </div>
                      <span className="text-xs font-bold text-slate-700 shrink-0">{(decision.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">{decision.confidence_explanation}</p>
                  </div>

                  {/* Alternatives Rejected */}
                  {decision.alternatives_rejected.length > 0 && (
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                      <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Alternatives Rejected</p>
                      <div className="space-y-1">
                        {decision.alternatives_rejected.map((alt, i) => (
                          <div key={i} className="text-xs border-l-2 border-slate-300 pl-2">
                            <p className="font-medium text-slate-600">{DECISION_LABELS[alt.decision_type] ?? alt.decision_type}</p>
                            <p className="text-slate-500 text-[11px]">{alt.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommended Next Action */}
                  <div className={`rounded-lg border p-3 ${
                    decision.resolution_status === 'resolved' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                  }`}>
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Recommended Next Action</p>
                    <p className="text-xs font-semibold text-slate-700">{decision.recommended_next_action}</p>
                  </div>

                  {/* Decision Timeline */}
                  {decisionTimeline.length > 0 && (
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                      <p className="text-[11px] font-bold text-slate-500 uppercase mb-1.5">Decision Timeline</p>
                      <div className="space-y-1.5">
                        {decisionTimeline.map((event, i) => (
                          <div key={i} className="flex gap-2 text-xs">
                            <span className="text-slate-400 font-mono whitespace-nowrap shrink-0 text-[10px]">
                              {new Date(event.created_at).toLocaleString()}
                            </span>
                            <div className="min-w-0">
                              <span className="text-slate-600 font-medium">{event.event_summary}</span>
                              {event.actor_type === 'human' && (
                                <span className="text-[10px] text-slate-400 ml-1">({event.actor})</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Engineering Assessment (recommendation details) */}
            {recommendation && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" /> Engineering Assessment
                  {persistingRec && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                </h3>
                <div className="space-y-2">
                  {/* Summary */}
                  <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Summary</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{recommendation.summary}</p>
                  </div>

                  {/* Recommended Action */}
                  <div className={`rounded-lg border p-3 ${
                    recommendation.po_review_required
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-green-50 border-green-200'
                  }`}>
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Recommended Action</p>
                    <p className="text-xs font-semibold text-slate-700">{recommendation.recommended_action}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Type: {recommendation.recommendation_type.replace(/_/g, ' ')}</p>
                  </div>

                  {/* Engineering Reasoning */}
                  <div className="bg-blue-50 rounded-lg border border-blue-200 p-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Engineering Reasoning</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{recommendation.engineering_reasoning}</p>
                  </div>

                  {/* Confidence — three separate values */}
                  <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Confidence</p>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Evidence Confidence</span>
                        <span className="font-semibold text-slate-700">{(recommendation.evidence_confidence * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Recommendation Confidence</span>
                        <span className="font-semibold text-slate-700">{(recommendation.recommendation_confidence * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Repair Confidence</span>
                        <span className="font-semibold text-slate-700">{(recommendation.repair_confidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Risk */}
                  <div className={`rounded-lg border p-3 ${
                    recommendation.risk_level === 'high' ? 'bg-red-50 border-red-200' :
                    recommendation.risk_level === 'medium' ? 'bg-amber-50 border-amber-200' :
                    'bg-green-50 border-green-200'
                  }`}>
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Risk</p>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold uppercase ${
                        recommendation.risk_level === 'high' ? 'text-red-600' :
                        recommendation.risk_level === 'medium' ? 'text-amber-600' :
                        'text-green-600'
                      }`}>{recommendation.risk_level}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{recommendation.risk_reason}</p>
                  </div>

                  {/* Automatic Repair Suitability */}
                  <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Automatic Repair Suitability</p>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold uppercase ${
                        recommendation.auto_repair_suitability === 'recommended' ? 'text-green-600' :
                        recommendation.auto_repair_suitability === 'safe' ? 'text-green-600' :
                        recommendation.auto_repair_suitability === 'unsafe' ? 'text-red-600' :
                        recommendation.auto_repair_suitability === 'blocked' ? 'text-amber-600' :
                        'text-slate-600'
                      }`}>{recommendation.auto_repair_suitability}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{recommendation.auto_repair_reason}</p>
                  </div>

                  {/* PO Review Requirement */}
                  <div className={`rounded-lg border p-3 ${
                    recommendation.po_review_required
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-green-50 border-green-200'
                  }`}>
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Product Owner Review</p>
                    <p className="text-xs text-slate-700">
                      {recommendation.po_review_required
                        ? 'Required — Product Owner must approve before action is taken.'
                        : 'Not required — recommendation can proceed automatically.'}
                    </p>
                    {recommendation.po_review_required && recommendation.po_decision_options.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {recommendation.po_decision_options.map(opt => (
                          <span key={opt} className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                            {opt.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Expected Impact */}
                  <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-0.5">Expected Impact</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{recommendation.expected_impact}</p>
                  </div>

                  {/* Alternative Actions */}
                  {recommendation.alternative_actions.length > 0 && (
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                      <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Alternative Actions</p>
                      <div className="space-y-1.5">
                        {recommendation.alternative_actions.map((alt, i) => (
                          <div key={i} className="text-xs border-l-2 border-slate-300 pl-2">
                            <p className="font-medium text-slate-700">{alt.action}</p>
                            <p className="text-slate-500 mt-0.5">Trade-offs: {alt.tradeoffs}</p>
                            <p className="text-slate-500">Risk: {alt.risk_comparison}</p>
                            <p className="text-slate-500">Governance: {alt.governance_implications}</p>
                            <p className="text-slate-400 mt-0.5">Confidence: {(alt.confidence * 100).toFixed(0)}%</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Known Limitations */}
                  {recommendation.known_limitations.length > 0 && (
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                      <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Known Limitations</p>
                      <ul className="space-y-0.5">
                        {recommendation.known_limitations.map((lim, i) => (
                          <li key={i} className="text-xs text-slate-500 flex items-start gap-1.5">
                            <AlertCircle className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                            <span>{lim}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Timeline */}
            {timeline.length > 0 && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Timeline
                </h3>
                <div className="space-y-2">
                  {timeline.map((t, i) => (
                    <div key={i} className="flex gap-2.5 text-xs">
                      <span className="text-slate-400 font-mono whitespace-nowrap shrink-0">{new Date(t.timestamp).toLocaleString()}</span>
                      <span className="text-slate-600">{t.event}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Authoritative Lineage Detail (parent-child alerts) */}
            {investigation.authoritativeLineage && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5" /> Authoritative Lineage
                </h3>
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 space-y-2">
                  {/* Child */}
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Child</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                      <span className="text-slate-500">Child Reference:</span>
                      <span className="font-mono text-slate-700">{investigation.authoritativeLineage.childRef}</span>
                      <span className="text-slate-500">Recorded Parent:</span>
                      <span className="font-mono text-slate-700">{investigation.authoritativeLineage.actualParent ?? 'null'}</span>
                    </div>
                  </div>
                  {/* Expected Parent */}
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Expected Parent</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                      <span className="text-slate-500">Expected Parent Ref:</span>
                      <span className="font-mono text-slate-700">{investigation.authoritativeLineage.expectedParent}</span>
                    </div>
                  </div>
                  {/* Authoritative Existence */}
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Authoritative Existence</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                      <span className="text-slate-500">Classification:</span>
                      <span className="font-semibold text-slate-700">{investigation.authoritativeLineage.classification}</span>
                      <span className="text-slate-500">Authoritative Status:</span>
                      <span className="font-semibold text-slate-700">{investigation.authoritativeLineage.authoritativeStatus}</span>
                      <span className="text-slate-500">Source Type:</span>
                      <span className="text-slate-700">{investigation.authoritativeLineage.sourceObjectType}</span>
                      <span className="text-slate-500">Historical Status:</span>
                      <span className="text-slate-700">{investigation.authoritativeLineage.lifecycleOrHistoricalStatus ?? 'N/A'}</span>
                      <span className="text-slate-500">Lineage Satisfied:</span>
                      <span className={`font-semibold ${investigation.authoritativeLineage.lineageSatisfied ? 'text-green-600' : 'text-red-600'}`}>
                        {investigation.authoritativeLineage.lineageSatisfied ? 'Yes' : 'No'}
                      </span>
                      <span className="text-slate-500">Execution Permitted:</span>
                      <span className={`font-semibold ${investigation.authoritativeLineage.executionPermitted ? 'text-green-600' : 'text-slate-500'}`}>
                        {investigation.authoritativeLineage.executionPermitted ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                  {/* Historical Explanation */}
                  {investigation.authoritativeLineage.governingEvidence && (
                    <div>
                      <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Historical Explanation</p>
                      <p className="text-xs text-slate-600 leading-relaxed">{investigation.authoritativeLineage.governingEvidence}</p>
                    </div>
                  )}
                  {investigation.authoritativeLineage.auditConclusion && (
                    <div>
                      <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Audit Conclusion</p>
                      <p className="text-xs text-slate-600 leading-relaxed">{investigation.authoritativeLineage.auditConclusion}</p>
                    </div>
                  )}
                  {/* Relationship Assessment */}
                  <div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Relationship Assessment</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{investigation.authoritativeLineage.resolutionReason}</p>
                  </div>
                </div>
              </section>
            )}

            {/* BUG-006R.3: Three-Stage Investigation Model */}
            {recommendation && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5" /> Investigation Model (BUG-006R.3)
                </h3>
                <div className="space-y-2">
                  {/* Stage 1: Reference Detected */}
                  <div className={`p-2.5 rounded-lg border ${recommendation.investigation_stage === 'reference_detected' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${recommendation.investigation_stage === 'reference_detected' ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-500'}`}>1</span>
                      <span className="text-xs font-semibold text-slate-700">Reference Detected</span>
                      {recommendation.investigation_stage === 'reference_detected' && <span className="text-[9px] text-amber-600 font-bold ml-auto">CURRENT</span>}
                    </div>
                    <p className="text-[10px] text-slate-500 ml-6">A reference was found in an Engineering source. This establishes only that the reference text exists.</p>
                  </div>
                  {/* Stage 2: Evidence Investigation */}
                  <div className={`p-2.5 rounded-lg border ${recommendation.investigation_stage === 'evidence_investigation' ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${recommendation.investigation_stage === 'evidence_investigation' ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-500'}`}>2</span>
                      <span className="text-xs font-semibold text-slate-700">Evidence Investigation</span>
                      {recommendation.investigation_stage === 'evidence_investigation' && <span className="text-[9px] text-blue-600 font-bold ml-auto">CURRENT</span>}
                    </div>
                    <p className="text-[10px] text-slate-500 ml-6">Search authoritative sources for evidence of the Engineering object's existence.</p>
                  </div>
                  {/* Stage 3: Governed Decision */}
                  <div className={`p-2.5 rounded-lg border ${recommendation.investigation_stage === 'governed_decision' ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${recommendation.investigation_stage === 'governed_decision' ? 'bg-green-200 text-green-800' : 'bg-slate-200 text-slate-500'}`}>3</span>
                      <span className="text-xs font-semibold text-slate-700">Governed Decision</span>
                      {recommendation.investigation_stage === 'governed_decision' && <span className="text-[9px] text-green-600 font-bold ml-auto">CURRENT</span>}
                    </div>
                    <p className="text-[10px] text-slate-500 ml-6">Only after evaluating evidence may the engine recommend recovery.</p>
                  </div>
                </div>
              </section>
            )}

            {/* BUG-006R.3: Recovery Justification Status */}
            {recommendation && (
              <section>
                <div className={`rounded-lg border p-3 ${
                  recommendation.recovery_justification === 'justified' ? 'bg-green-50 border-green-200' :
                  recommendation.recovery_justification === 'not_justified' ? 'bg-slate-50 border-slate-200' :
                  recommendation.recovery_justification === 'blocked_pending_evidence' ? 'bg-amber-50 border-amber-200' :
                  'bg-blue-50 border-blue-200'
                }`}>
                  <div className="flex items-start gap-2">
                    {recommendation.recovery_justification === 'blocked_pending_evidence' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : recommendation.recovery_justification === 'justified' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                    ) : (
                      <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-slate-800">Recovery Justification: {recommendation.recovery_justification.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{recommendation.recovery_justification_reason}</p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* BUG-006R.3: Separated Confidence Model */}
            {recommendation && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" /> Confidence Model
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-0.5">Reference Classification</p>
                    <p className="text-sm font-bold text-slate-700">{Math.round(recommendation.reference_classification_confidence * 100)}%</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">Pattern-match confidence</p>
                  </div>
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-0.5">Evidence Confidence</p>
                    <p className="text-sm font-bold text-slate-700">{Math.round(recommendation.evidence_confidence * 100)}%</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">Authoritative source evidence</p>
                  </div>
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-0.5">Decision Confidence</p>
                    <p className="text-sm font-bold text-slate-700">{Math.round(recommendation.decision_confidence * 100)}%</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">Confidence in recommendation</p>
                  </div>
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-0.5">Repair Confidence</p>
                    <p className="text-sm font-bold text-slate-700">{Math.round(recommendation.repair_confidence * 100)}%</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">Auto-repair suitability</p>
                  </div>
                </div>
                {recommendation.reference_classification_confidence > 0.8 && recommendation.evidence_confidence < 0.3 && (
                  <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-[10px] text-amber-700">
                      <AlertTriangle className="w-3 h-3 inline mr-1" />
                      High pattern-match confidence does not confirm the object existed. Evidence confidence is low.
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* BUG-006R.3: Unverified Reference Recovery Candidate Badge */}
            {recommendation?.recommendation_type === 'unverified_reference_recovery_candidate' && (
              <section>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <p className="text-xs font-bold text-amber-800">Unverified Reference Recovery Candidate</p>
                  </div>
                  <p className="text-xs text-amber-700">
                    A reference was detected, but no authoritative evidence confirms that a corresponding Engineering Work Order previously existed. Recovery is not justified without positive evidence.
                  </p>
                  <p className="text-[10px] text-amber-600 mt-1.5 font-semibold">
                    Evidence required before recovery can be considered.
                  </p>
                </div>
              </section>
            )}

            {/* Related Engineering */}
            {relatedEngineering.length > 0 && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5" /> Related Engineering ({relatedEngineering.length})
                </h3>
                <div className="space-y-1">
                  {relatedEngineering.map((re, i) => {
                    const isNavigating = navigating === re.ref;
                    return (
                      <button
                        key={i}
                        onClick={() => handleCanonicalNavigation(re.ref, 'ewo')}
                        disabled={isNavigating}
                        className={`w-full flex items-center gap-2 p-2 bg-slate-50 rounded-lg hover:bg-slate-100 text-left ${isNavigating ? 'opacity-60' : ''}`}
                      >
                        {isNavigating ? (
                          <Loader2 className="w-3.5 h-3.5 text-slate-400 shrink-0 animate-spin" />
                        ) : null}
                        <span className="text-xs font-mono font-bold text-slate-500 shrink-0">{re.ref}</span>
                        <span className="text-xs text-slate-600 truncate flex-1">{re.title}</span>
                        <span className="text-[10px] text-slate-400">{re.type}</span>
                        {!isNavigating && <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Resolution Lifecycle Indicator (EWO-014.19A.7SR.6) */}
            {resolutionStatus !== 'detected' && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" /> Resolution Lifecycle
                </h3>
                <div className="flex items-center gap-1 flex-wrap">
                  {RESOLUTION_LIFECYCLE.map((stage, i) => {
                    const currentIdx = RESOLUTION_LIFECYCLE.indexOf(resolutionStatus);
                    const isPast = i < currentIdx;
                    const isCurrent = i === currentIdx;
                    return (
                      <div key={stage} className="flex items-center gap-1">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isCurrent ? 'bg-blue-100 text-blue-700' :
                          isPast ? 'bg-green-50 text-green-600' :
                          'bg-slate-100 text-slate-400'
                        }`}>
                          {RESOLUTION_STATUS_LABELS[stage]}
                        </span>
                        {i < RESOLUTION_LIFECYCLE.length - 1 && (
                          <span className="text-slate-300 text-[10px]">→</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Resolution Message (EWO-014.19A.7SR.6 / EWO-020 ES-003) */}
            {resolutionMessage && !isReadOnly && !governedResponseState && (
              <section>
                <div className="rounded-lg border p-3 bg-blue-50 border-blue-200">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-blue-600 shrink-0 animate-spin" />
                    <p className="text-xs text-slate-700 font-medium">{resolutionMessage}</p>
                  </div>
                </div>
              </section>
            )}
            {/* EWO-020: Governed Response Banner for ES-003 compliance */}
            {governedResponseState && !isReadOnly && (
              <section>
                <div className={`rounded-lg border p-3 ${
                  governedResponseState.classification === 'success' ? 'bg-green-50 border-green-200' :
                  governedResponseState.classification === 'failure' ? 'bg-red-50 border-red-200' :
                  'bg-blue-50 border-blue-200'
                }`}>
                  <div className="flex items-start gap-2">
                    {governedResponseState.classification === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-slate-800">{governedResponseState.title}</p>
                      <p className="text-xs text-slate-700 mt-0.5">{governedResponseState.summary}</p>
                      <p className="text-xs text-slate-600 mt-1">{governedResponseState.recommendedNextAction}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">Reference Code</span>
                        <span className="text-[10px] font-mono text-slate-700 bg-white/60 px-1.5 py-0.5 rounded border border-slate-200">{governedResponseState.referenceCode}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* EWO-014.19A.7SR.6R.1: Resolved Read-Only Panel */}
            {isReadOnly && (
              <section>
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-green-800">
                        {evolvedTitle ?? 'Resolved'}
                      </p>
                      <p className="text-xs text-green-600">Resolution completed successfully.</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 ml-7">
                    {resolutionTimestamp && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-green-700 uppercase w-20">Timestamp</span>
                        <span className="text-xs text-green-700">{new Date(resolutionTimestamp).toLocaleString()}</span>
                      </div>
                    )}
                    {resolutionActor && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-green-700 uppercase w-20">Actor</span>
                        <span className="text-xs text-green-700">{resolutionActor}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-green-700 uppercase w-20">Status</span>
                      <span className="text-xs text-green-700 font-semibold">{RESOLUTION_STATUS_LABELS[resolutionStatus]}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-green-700 uppercase w-20">Ref Code</span>
                      <span className="text-[10px] font-mono text-green-800 bg-white/60 px-1.5 py-0.5 rounded border border-green-200">{governedResponseState?.referenceCode ?? 'EIOS-INTEGRITY-001'}</span>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Recommended Actions — hidden when read-only (EWO-014.19A.7SR.6R.1) */}
            {governedActions.length > 0 && !isReadOnly && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Recommended Actions
                </h3>
                <div className="space-y-1.5">
                  {governedActions.map((action, i) => (
                    <div key={i} className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${
                      action.available ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'
                    }`}>
                      {action.available ? (
                        <button
                          onClick={() => {
                            if (action.action_type === 'open_engineering' && action.target_ref) {
                              handleCanonicalNavigation(action.target_ref, 'ewo');
                            } else if (action.action_type === 'review_diagnostics') {
                              // Scroll to evidence section
                            } else if (action.action_type === 'governed_resolution') {
                              handleGovernedResolution(action);
                            }
                          }}
                          disabled={executingResolution || isReadOnly}
                          className="flex items-center gap-2 text-xs font-medium text-blue-700 hover:text-blue-800 flex-1 text-left disabled:opacity-50"
                        >
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          {action.label}
                          {action.requires_po_approval && (
                            <span className="text-[9px] text-amber-600 font-semibold ml-1">PO APPROVAL</span>
                          )}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-slate-400 flex-1">
                          <Ban className="w-3.5 h-3.5 shrink-0" />
                          <span>{action.label}</span>
                          {action.unavailable_reason && <span className="text-slate-400">— {action.unavailable_reason}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Legacy Recommended Actions (shown only before recommendation loads, hidden when read-only) */}
            {governedActions.length === 0 && recommendedActions.length > 0 && !isReadOnly && (
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Recommended Actions
                </h3>
                <div className="space-y-1.5">
                  {recommendedActions.map((action, i) => (
                    <div key={i} className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${action.available ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                      {action.available ? (
                        <button
                          onClick={() => handleAction(action)}
                          className="flex items-center gap-2 text-xs font-medium text-blue-700 hover:text-blue-800 flex-1 text-left"
                        >
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          {action.label}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-slate-400 flex-1">
                          <Ban className="w-3.5 h-3.5 shrink-0" />
                          <span>{action.label}</span>
                          {action.unavailableReason && <span className="text-slate-400">— {action.unavailableReason}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Resolution notes (for resolve/dismiss actions) — hidden when read-only */}
            {governedActions.length === 0 && !isReadOnly && (recommendedActions.some(a => a.type === 'resolve_alert' || a.type === 'dismiss_alert')) && (
              <section>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Resolution Notes</label>
                <textarea
                  value={resolutionNotes}
                  onChange={e => setResolutionNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Describe the action taken..."
                />
              </section>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between shrink-0">
            <p className="text-xs text-slate-400">
              Detected: {new Date(alert.created_at).toLocaleString()}
            </p>
            {resolving && <span className="text-xs text-slate-400">Processing...</span>}
          </div>
        </div>
      </div>

      {/* Governed Missing Object Dialog */}
      {navFailure && (
        <GovernedNavigationDialog
          failure={navFailure}
          onClose={() => setNavFailure(null)}
          onCreateMissing={onCreateMissing}
        />
      )}
    </>
  );
}

// ─── Investigation Builder ──────────────────────────────────────────────────
// Builds an InvestigationData from an IntegrityAlert using its evidence field.
// All wording is grounded in the alert's actual evidence — never invented.

export function buildInvestigation(alert: IntegrityAlert): InvestigationData {
  const evidence = alert.evidence as Record<string, unknown>;
  // EWO-014.19A.7SR.4: Eliminate "unknown source" / "unknown column" labels.
  // Use actual source and column names from the evidence, or omit them entirely
  // rather than displaying placeholder text.
  const sourceName = (evidence.source as string) ?? null;
  const columnName = (evidence.column as string) ?? null;
  const sourceTable = (evidence.source_table as string) ?? null;
  const objectId = (evidence.object_id as string) ?? null;

  const evidenceItems: InvestigationEvidence[] = [];
  if (alert.normalised_reference) {
    // Build description from actual source data — never "unknown source"
    const descParts: string[] = [];
    if (sourceTable) descParts.push(`Found in ${sourceTable}`);
    else if (sourceName) descParts.push(`Found in ${sourceName}`);
    if (columnName) descParts.push(`Column: ${columnName}`);
    if (objectId) descParts.push(`Object ID: ${objectId}`);
    evidenceItems.push({
      label: 'Normalised Reference',
      type: alert.object_type === 'ewo' ? 'ewo' : 'text',
      reference: alert.normalised_reference,
      description: descParts.length > 0 ? descParts.join(' · ') : undefined,
    });
  }
  if (alert.raw_reference && alert.raw_reference !== alert.normalised_reference) {
    evidenceItems.push({
      label: 'Raw Reference',
      type: 'text',
      reference: alert.raw_reference,
      description: 'Original reference as found in the source',
    });
  }
  // Only show Authoritative Source if we have actual source data — never "unknown source"
  if (sourceName || sourceTable) {
    evidenceItems.push({
      label: 'Authoritative Source',
      type: 'source',
      reference: sourceTable ?? sourceName ?? '',
      description: columnName ? `Column: ${columnName}` : undefined,
    });
  }

  // Build authoritative lineage detail for parent-child alerts
  let authoritativeLineage: AuthoritativeLineageDetail | undefined;
  if (alert.alert_type === 'parent_child_issue') {
    const expectedParent = (evidence.expected_parent as string) ?? '';
    const actualParent = (evidence.actual_parent as string) ?? null;
    const classification = (evidence.classification as string) ??
      (alert as unknown as Record<string, unknown>).parent_child_classification as string ??
      'parent_child_issue';
    const authoritativeStatus = (evidence.authoritative_status as string) ??
      (alert as unknown as Record<string, unknown>).authoritative_status as string ??
      'UNVERIFIED_REFERENCE';
    const sourceObjectType = (evidence.authoritative_source_type as string) ??
      (alert as unknown as Record<string, unknown>).authoritative_source_type as string ??
      'none';
    const sourceObjectId = (evidence.authoritative_source_id as string) ??
      (alert as unknown as Record<string, unknown>).authoritative_source_id as string ?? null;
    const lifecycleStatus = (evidence.lifecycle_or_historical_status as string) ?? null;
    const lineageSatisfied = (evidence.lineage_satisfied as boolean) ??
      (alert as unknown as Record<string, unknown>).lineage_satisfied as boolean ?? false;
    const executionPermitted = (evidence.execution_permitted as boolean) ??
      (alert as unknown as Record<string, unknown>).execution_permitted as boolean ?? false;
    const governingEvidence = (evidence.governing_evidence as string) ?? null;
    const auditConclusion = (evidence.audit_conclusion as string) ?? null;
    const resolutionReason = (evidence.resolution_reason as string) ??
      alert.description ?? '';

    authoritativeLineage = {
      childRef: alert.normalised_reference ?? '',
      expectedParent,
      actualParent,
      classification,
      authoritativeStatus,
      sourceObjectType,
      sourceObjectId,
      lifecycleOrHistoricalStatus: lifecycleStatus,
      lineageSatisfied,
      executionPermitted,
      governingEvidence,
      auditConclusion,
      resolutionReason,
    };

    // Add historical reference as evidence if found
    if (sourceObjectType === 'historical_reference' && sourceObjectId) {
      evidenceItems.push({
        label: 'Historical Reference',
        type: 'historical_recovery',
        reference: expectedParent,
        description: governingEvidence ?? undefined,
      });
    }
  }

  // Build recommended actions based on classification
  const actions: InvestigationAction[] = [];
  if (alert.alert_type === 'parent_child_issue' && authoritativeLineage) {
    const cls = authoritativeLineage.classification;
    if (cls === 'HISTORICAL_PARENT_SATISFIED') {
      actions.push({
        label: 'Open Historical Reference',
        type: 'open_engineering',
        available: true,
        targetRef: authoritativeLineage.expectedParent,
      });
      actions.push({
        label: 'Open Child Work Order',
        type: 'open_engineering',
        available: true,
        targetRef: authoritativeLineage.childRef,
      });
      actions.push({
        label: 'View Lineage Evidence',
        type: 'review_diagnostics',
        available: true,
      });
    } else if (cls === 'RELATIONSHIP_FIELD_INCOMPLETE') {
      actions.push({ label: 'Review Proposed Relationship', type: 'review_diagnostics', available: true });
      actions.push({ label: 'Link Canonical Parent', type: 'resolve_alert', available: true });
      actions.push({ label: 'Defer', type: 'dismiss_alert', available: true });
    } else if (cls === 'PARENT_GENUINELY_MISSING') {
      // EWO-021R.5: Decision-driven navigation — open Resolution Workspace
      // instead of routing to Create Missing Engineering Work Order.
      actions.push({ label: 'Open Integrity Resolution Workspace', type: 'open_resolution_workspace', available: true });
      actions.push({ label: 'Search Additional Evidence', type: 'review_diagnostics', available: true });
      actions.push({ label: 'Product Owner Review', type: 'resolve_alert', available: true });
      actions.push({ label: 'Accept Permanent Gap', type: 'dismiss_alert', available: true });
      actions.push({ label: 'Record Historical Reference Only', type: 'resolve_alert', available: true });
      actions.push({ label: 'Mark as Invalid or Obsolete', type: 'dismiss_alert', available: true });
      actions.push({ label: 'Defer and Monitor', type: 'dismiss_alert', available: true });
      if (alert.normalised_reference) {
        actions.push({ label: 'Open Related Engineering', type: 'open_engineering', available: true, targetRef: alert.normalised_reference });
      }
    } else if (cls === 'PARENT_AUTHORITY_CONFLICT') {
      actions.push({ label: 'Route to PO Review', type: 'resolve_alert', available: true });
      actions.push({ label: 'Investigate Conflict', type: 'review_diagnostics', available: true });
    } else if (cls === 'PARENT_EVIDENCE_ONLY') {
      actions.push({ label: 'Investigate Evidence', type: 'review_diagnostics', available: true });
      actions.push({ label: 'Route to PO Review', type: 'resolve_alert', available: true });
    } else if (cls === 'PARENT_REFERENCE_MISMATCH') {
      actions.push({ label: 'Review Proposed Relationship', type: 'review_diagnostics', available: true });
      actions.push({ label: 'Link Canonical Parent', type: 'resolve_alert', available: true });
    } else {
      // CANONICAL_PARENT_SATISFIED or fallback
      if (alert.normalised_reference) {
        actions.push({ label: 'Open Related Engineering', type: 'open_engineering', available: true, targetRef: alert.normalised_reference });
      }
    }
  } else {
    // Non parent-child alerts — keep existing behaviour
    if (alert.normalised_reference) {
      actions.push({
        label: 'Open Related Engineering',
        type: 'open_engineering',
        available: true,
        targetRef: alert.normalised_reference,
      });
    }
    if (alert.suggested_action) {
      actions.push({
        label: alert.suggested_action,
        type: 'resolve_alert',
        available: true,
      });
    }
  }
  actions.push({
    label: 'Dismiss Alert',
    type: 'dismiss_alert',
    available: true,
  });

  const relatedEng: { ref: string; title: string; type: string }[] = [];
  if (alert.normalised_reference) {
    relatedEng.push({
      ref: alert.normalised_reference,
      title: alert.title,
      type: alert.object_type.toUpperCase(),
    });
  }
  if (authoritativeLineage && authoritativeLineage.expectedParent) {
    relatedEng.push({
      ref: authoritativeLineage.expectedParent,
      title: `Expected Parent: ${authoritativeLineage.expectedParent}`,
      type: authoritativeLineage.sourceObjectType === 'historical_reference' ? 'HISTORICAL REFERENCE' : 'EWO',
    });
  }

  return {
    alert,
    executiveSummary: alert.description,
    rootCause: alert.classification_reason ?? 'Root cause has not been classified. The alert was detected during integrity reconciliation.',
    affectedComponents: [sourceTable ?? sourceName, alert.object_type].filter(c => c !== null && c !== undefined) as string[],
    evidence: evidenceItems,
    timeline: [
      { timestamp: alert.created_at, event: `Alert detected: ${alert.title}` },
      ...(alert.resolved_at ? [{ timestamp: alert.resolved_at, event: `Resolved by ${alert.resolved_by ?? 'unknown'}` }] : []),
    ],
    recommendedActions: actions,
    relatedEngineering: relatedEng,
    confidence: alert.confidence,
    confidenceExplanation: `Confidence is based on the reference classification: ${alert.classification_reason ?? 'Unclassified'}. Higher confidence means the reference pattern more strongly matches a known engineering object type.`,
    authoritativeLineage,
  };
}
