// EWO-014.19A.7S — Engineering Integrity Investigation Workspace
//
// Transforms Engineering Integrity from a diagnostic dashboard into a governed
// investigation workspace with platform maturity awareness, clickable evidence,
// and governed recommended actions. All wording remains constitutionally truthful.

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, RefreshCw,
  AlertCircle, Loader2, X, TrendingUp, Activity, Layers, Database,
  ChevronDown, ChevronRight, Clock, History, GitBranch, Copy,
  Lightbulb, Gauge, Ban, Wand2, Play, FileText, Filter, Eye, ExternalLink,
  ClipboardCheck, RotateCcw,
} from 'lucide-react';
import {
  runIntegrityAudit, getLatestAudit, getLatestBaselineAudit, getAuditHistory,
  getActiveAlerts, getResolvedAlerts, getEwoCount, resolveAlert, dismissAlert,
  getAuditClassifications,
  isActiveIntegrityAlert, isHistoricalIntegrityAlert,
  type IntegrityAudit, type IntegrityAlert, type ReferenceClassification,
} from '../../lib/engineeringIntegrityService';
import { getLifecycleDashboardSummary, type LifecycleDashboardSummary } from '../../lib/lifecycleEvidenceEngine';
import {
  evaluateAllCapabilities, summariseMaturity, MATURITY_DISPLAY,
  type MaturityContext, type MaturitySummary,
} from '../../lib/integrityMaturityModel';
import {
  InvestigationWorkspace, buildInvestigation,
  type InvestigationData,
} from '../../lib/integrityInvestigation';
import {
  classifyAlert, getAlertCategoryCounts, filterAlertsByClassification,
  buildBatchPreview, processBatch, getBatchHistory, getBatchRun, getBatchItems,
  type AlertClassification, type BatchSize, type BatchPreview,
  type BatchRunResult, type BatchRunRecord, type BatchItemResult, CLASSIFICATION_LABELS,
} from '../../lib/integrityBatchService';
import { POReviewPanel } from './POReviewPanel';
import { getReprocessPreview, linkReplacementBatch, type ReprocessPreview } from '../../lib/poReviewService';
import { IntegrityResolutionWorkspace } from '../../components/IntegrityResolutionWorkspace';
import type { EngineeringRecommendation } from '../lib/engineeringRecommendationEngine';
import type { EvidencePackage } from '../lib/evidencePackageService';

interface Props {
  onNavigate?: (section: string, objectRef?: string) => void;
}

const AUDIT_PHASE_LABELS: Record<string, string> = {
  historical_reconciliation: 'Historical Reconciliation',
  validation: 'Validation Audit',
  partial: 'Partial Audit',
  failed: 'Failed Audit',
};

const AUDIT_PHASE_COLOURS: Record<string, string> = {
  historical_reconciliation: 'bg-blue-50 text-blue-700 border-blue-200',
  validation: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
};

const OBJECT_TYPE_COLOURS: Record<string, string> = {
  ewo: 'text-blue-700 bg-blue-50',
  bug: 'text-orange-700 bg-orange-50',
  batch: 'text-purple-700 bg-purple-50',
  constitutional: 'text-indigo-700 bg-indigo-50',
  dev_seed: 'text-slate-500 bg-slate-100',
  test_fixture: 'text-cyan-700 bg-cyan-50',
  superseded: 'text-slate-400 bg-slate-50',
  unknown: 'text-amber-700 bg-amber-50',
};

export function ECCEngineeringIntegrityPage({ onNavigate }: Props) {
  const [latestAudit, setLatestAudit] = useState<IntegrityAudit | null>(null);
  const [baselineAudit, setBaselineAudit] = useState<IntegrityAudit | null>(null);
  const [history, setHistory] = useState<IntegrityAudit[]>([]);
  const [alerts, setAlerts] = useState<IntegrityAlert[]>([]);
  const [ewoCount, setEwoCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [investigation, setInvestigation] = useState<InvestigationData | null>(null);
  const [drillDownAudit, setDrillDownAudit] = useState<IntegrityAudit | null>(null);
  const [drillDownClassifications, setDrillDownClassifications] = useState<ReferenceClassification[]>([]);
  const [expandedSources, setExpandedSources] = useState(false);
  const [lifecycleSummary, setLifecycleSummary] = useState<LifecycleDashboardSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'alerts' | 'cleanup' | 'po-review' | 'maturity' | 'history' | 'resolved'>('overview');
  const [alertFilter, setAlertFilter] = useState<AlertClassification | 'all'>('all');
  const [batchSize, setBatchSize] = useState<BatchSize>(25);
  const [batchPreview, setBatchPreview] = useState<BatchPreview | null>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchRunResult | null>(null);
  const [batchHistory, setBatchHistory] = useState<BatchRunRecord[]>([]);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [batchDetailRun, setBatchDetailRun] = useState<BatchRunRecord | null>(null);
  const [batchDetailItems, setBatchDetailItems] = useState<BatchItemResult[]>([]);
  const [batchDetailLoading, setBatchDetailLoading] = useState(false);
  const [batchDetailError, setBatchDetailError] = useState<string | null>(null);
  const [expandedBatchItems, setExpandedBatchItems] = useState<Set<string>>(new Set());
  const [reprocessPreview, setReprocessPreview] = useState<ReprocessPreview | null>(null);
  const [reprocessLoading, setReprocessLoading] = useState(false);
  const [resolvedAlerts, setResolvedAlerts] = useState<IntegrityAlert[]>([]);
  const [resolvedLoading, setResolvedLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [audit, baseline, hist, alrts, count, lifecycle, batchHist] = await Promise.all([
      getLatestAudit(),
      getLatestBaselineAudit(),
      getAuditHistory(20),
      getActiveAlerts(),
      getEwoCount(),
      getLifecycleDashboardSummary(),
      getBatchHistory(20),
    ]);
    setLatestAudit(audit);
    setBaselineAudit(baseline);
    setHistory(hist);
    setAlerts(alrts);
    setEwoCount(count);
    setLifecycleSummary(lifecycle);
    setBatchHistory(batchHist);
    setLoading(false);
  }, []);

  const loadResolved = useCallback(async () => {
    setResolvedLoading(true);
    const resolved = await getResolvedAlerts(100);
    setResolvedAlerts(resolved);
    setResolvedLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (activeTab === 'resolved') loadResolved(); }, [activeTab, loadResolved]);

  const handleRunAudit = async () => {
    setAuditing(true);
    try {
      await runIntegrityAudit('product_owner', true);
      await load();
    } catch (err) {
      console.error('Audit failed:', err);
    }
    setAuditing(false);
  };

  const [resolutionAlert, setResolutionAlert] = useState<IntegrityAlert | null>(null);
  const [resolutionRecommendation, setResolutionRecommendation] = useState<EngineeringRecommendation | null>(null);
  const [resolutionEvidencePackage, setResolutionEvidencePackage] = useState<EvidencePackage | null>(null);

  const handleOpenResolutionWorkspace = useCallback((alert: IntegrityAlert) => {
    setResolutionAlert(alert);
  }, []);

  const handleResolutionClose = useCallback(() => {
    setResolutionAlert(null);
    load();
    loadResolved();
  }, [load, loadResolved]);

  const handleAlertResolved = useCallback((_alertId: string) => {
    // Alert was closed by the resolution workspace — reload data
    // The workspace stays open to show the resolved state
    load();
    loadResolved();
  }, [load, loadResolved]);

  const handleResolve = async (alert: IntegrityAlert, dismiss: boolean, notes: string) => {
    try {
      if (dismiss) {
        await dismissAlert(alert.id, 'product_owner', notes);
      } else {
        await resolveAlert(alert.id, 'product_owner', notes);
      }
      setInvestigation(null);
      await load();
      await loadResolved();
    } catch (err) {
      console.error('Resolve failed:', err);
    }
  };

  const handleDrillDown = async (audit: IntegrityAudit) => {
    setDrillDownAudit(audit);
    const classifications = await getAuditClassifications(audit.id);
    setDrillDownClassifications(classifications);
  };

  const categoryCounts = useMemo(() => getAlertCategoryCounts(alerts), [alerts]);
  const filteredAlerts = useMemo(() => filterAlertsByClassification(alerts, alertFilter), [alerts, alertFilter]);
  const missingEwoCount = useMemo(() => filterAlertsByClassification(alerts, 'missing_ewo').length, [alerts]);

  const handleBuildBatchPreview = useCallback(() => {
    const preview = buildBatchPreview(alerts, batchSize);
    setBatchPreview(preview);
    setShowBatchConfirm(true);
  }, [alerts, batchSize]);

  const handleProcessBatch = async () => {
    setShowBatchConfirm(false);
    setBatchProcessing(true);
    setBatchResult(null);
    try {
      const result = await processBatch(alerts, batchSize, 'product_owner');
      setBatchResult(result);
      await load();
    } catch (err) {
      console.error('Batch processing failed:', err);
    }
    setBatchProcessing(false);
  };

  const handleCopyReport = () => {
    if (!batchResult) return;
    navigator.clipboard.writeText(batchResult.copyableReport);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  const handleOpenBatch = async (run: BatchRunRecord) => {
    setBatchDetailRun(null);
    setBatchDetailItems([]);
    setBatchDetailError(null);
    setBatchDetailLoading(true);
    setExpandedBatchItems(new Set());
    try {
      const [runRecord, items] = await Promise.all([
        getBatchRun(run.id),
        getBatchItems(run.id),
      ]);
      if (!runRecord) {
        setBatchDetailError('Batch not found or no longer available.');
        setBatchDetailLoading(false);
        return;
      }
      setBatchDetailRun(runRecord);
      setBatchDetailItems(items);
    } catch (err) {
      console.error('Batch detail load failed:', err);
      setBatchDetailError('Failed to load batch results. Please try again.');
    }
    setBatchDetailLoading(false);
  };

  const handleCloseBatchDetail = () => {
    setBatchDetailRun(null);
    setBatchDetailItems([]);
    setBatchDetailError(null);
    setExpandedBatchItems(new Set());
    setReprocessPreview(null);
  };

  const handleReprocessPreview = async () => {
    if (!batchDetailRun) return;
    setReprocessLoading(true);
    try {
      const preview = await getReprocessPreview(batchDetailRun.id, batchDetailRun.requested_batch_size);
      setReprocessPreview(preview);
    } catch (err) {
      console.error('Reprocess preview failed:', err);
      setBatchDetailError('Failed to generate reprocess preview.');
    }
    setReprocessLoading(false);
  };

  const toggleBatchItem = (itemId: string) => {
    setExpandedBatchItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  // ─── Canonical Maturity Context (Req 5: single source of truth) ─────────────
  const maturityContext: MaturityContext = useMemo(() => ({
    hasBaseline: !!baselineAudit,
    latestAuditExists: !!latestAudit,
    allSourcesSucceeded: latestAudit?.all_required_sources_succeeded ?? false,
    sourceCoverage: (() => {
      const envelope = latestAudit?.source_completion_envelope as { sources?: { succeeded: boolean }[] } | undefined;
      const sources = envelope?.sources ?? [];
      return sources.length > 0 ? Math.round((sources.filter(s => s.succeeded).length / sources.length) * 100) : 0;
    })(),
    openAlertsCount: alerts.length,
    integrityScore: latestAudit?.integrity_score ?? 0,
    scoreEligible: latestAudit?.score_eligible ?? false,
    stableResult: latestAudit?.stable_result ?? false,
    prematureClosures: lifecycleSummary?.premature_closures ?? 0,
    ewoCount,
  }), [latestAudit, baselineAudit, alerts, lifecycleSummary, ewoCount]);

  const capabilityEvaluations = useMemo(() => evaluateAllCapabilities(maturityContext), [maturityContext]);
  const maturitySummary: MaturitySummary = useMemo(() => summariseMaturity(capabilityEvaluations), [capabilityEvaluations]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  const audit = latestAudit;
  const hasBaseline = !!baselineAudit;
  const score = audit?.integrity_score ?? 0;
  const scoreEligible = audit?.score_eligible ?? false;
  const allSourcesSucceeded = audit?.all_required_sources_succeeded ?? false;

  let scoreLabel = 'Historical reconciliation required';
  let scoreColour = 'text-slate-500';
  let scoreBg = 'from-slate-400 to-slate-500';
  let scoreIcon = <ShieldAlert className="w-12 h-12 text-white" />;

  if (!audit) {
    scoreLabel = 'Integrity baseline not yet established';
  } else if (!allSourcesSucceeded) {
    scoreLabel = 'Integrity assessment incomplete';
    scoreColour = 'text-red-600';
    scoreBg = 'from-red-500 to-red-600';
    scoreIcon = <ShieldAlert className="w-12 h-12 text-white" />;
  } else if (score === 100 && scoreEligible) {
    scoreLabel = 'Full integrity verified';
    scoreColour = 'text-green-600';
    scoreBg = 'from-green-500 to-green-600';
    scoreIcon = <ShieldCheck className="w-12 h-12 text-white" />;
  } else {
    scoreLabel = score >= 80 ? 'Minor issues detected' : 'Issues detected';
    scoreColour = score >= 80 ? 'text-amber-600' : 'text-red-600';
    scoreBg = score >= 80 ? 'from-amber-500 to-amber-600' : 'from-red-500 to-red-600';
    scoreIcon = <ShieldAlert className="w-12 h-12 text-white" />;
  }

  const envelope = audit?.source_completion_envelope as { sources?: { source_name: string; succeeded: boolean; records_examined: number; canonical_references_discovered: number; failure: string | null; completed_at: string }[] } | undefined;
  const sources = envelope?.sources ?? [];
  const sourceCoverage = maturityContext.sourceCoverage;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-primary-600" />
            Engineering Integrity
          </h1>
          <p className="text-sm text-slate-500 mt-1">Governed investigation workspace for the Engineering Work Order Ledger</p>
        </div>
        <button
          onClick={handleRunAudit}
          disabled={auditing}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          {auditing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {hasBaseline ? 'Run Validation Audit' : 'Run Historical Reconciliation'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {([
          { key: 'overview', label: 'Overview', icon: ShieldCheck },
          { key: 'alerts', label: `Alerts (${alerts.length})`, icon: AlertTriangle },
          { key: 'cleanup', label: 'One-Off Cleanup', icon: Wand2 },
          { key: 'po-review', label: 'PO Review', icon: ClipboardCheck },
          { key: 'maturity', label: 'Platform Maturity', icon: Gauge },
          { key: 'history', label: 'Audit History', icon: Activity },
          { key: 'resolved', label: 'Resolved History', icon: CheckCircle2 },
        ] as const).map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive ? 'border-primary-500 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── Overview Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Phase & Baseline Status */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Current Phase</p>
              {audit ? (
                <span className={`text-sm font-semibold px-2.5 py-1 rounded-full border ${AUDIT_PHASE_COLOURS[audit.audit_phase] ?? 'bg-slate-100 text-slate-600'}`}>
                  {AUDIT_PHASE_LABELS[audit.audit_phase] ?? audit.audit_phase}
                </span>
              ) : (
                <span className="text-sm text-slate-400">Not yet run</span>
              )}
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Baseline Established</p>
              <p className={`text-sm font-semibold ${hasBaseline ? 'text-green-600' : 'text-amber-600'}`}>
                {hasBaseline ? 'Yes' : 'No — reconciliation required'}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Source Coverage</p>
              <p className={`text-sm font-semibold ${sourceCoverage === 100 ? 'text-green-600' : 'text-amber-600'}`}>{sourceCoverage}%</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Reconciliation Passes</p>
              <p className="text-sm font-semibold text-slate-700">{audit?.reconciliation_passes ?? 0}</p>
            </div>
          </div>

          {/* Integrity Score Hero */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Ledger Integrity Score</p>
                <p className={`text-5xl font-bold ${scoreColour} mt-1`}>{audit ? `${score}%` : '—'}</p>
                <p className="text-sm text-slate-500 mt-1">{scoreLabel}</p>
              </div>
              <div className={`w-24 h-24 rounded-full bg-gradient-to-br ${scoreBg} flex items-center justify-center shadow-lg shrink-0`}>
                {scoreIcon}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
              <Metric label="Ledger Integrity" value={audit ? `${score}%` : '—'} colour={scoreColour} />
              <Metric label="Source Coverage" value={`${sourceCoverage}%`} colour={sourceCoverage === 100 ? 'text-green-600' : 'text-amber-600'} />
              <Metric label="Reconciliation" value={audit?.stable_result ? 'Stable' : audit ? 'Incomplete' : 'Not run'} colour={audit?.stable_result ? 'text-green-600' : 'text-amber-600'} />
              <Metric label="Open Blocking Issues" value={alerts.length.toString()} colour={alerts.length === 0 ? 'text-green-600' : 'text-red-600'} />
            </div>
            {audit && (
              <div className="text-xs text-slate-400 flex items-center gap-2 mt-3 flex-wrap">
                <Activity className="w-3.5 h-3.5 shrink-0" />
                <span>Last audit: {new Date(audit.run_at).toLocaleString()} by {audit.run_by}</span>
                {audit.current_run_repairs > 0 && <span className="text-blue-600">· {audit.current_run_repairs} repairs this run</span>}
                {audit.cumulative_historical_repairs > 0 && <span className="text-slate-500">· {audit.cumulative_historical_repairs} cumulative repairs</span>}
              </div>
            )}
          </div>

          {/* Summary Cards — from same canonical context (Req 5) */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <SummaryCard icon={Layers} label="Total EWOs" value={ewoCount} colour="text-slate-700 bg-slate-50" />
            <SummaryCard icon={AlertCircle} label="Missing EWOs" value={audit?.missing_ewos_count ?? 0} colour="text-red-700 bg-red-50" />
            <SummaryCard icon={Copy} label="Duplicates" value={audit?.duplicate_ewos_count ?? 0} colour="text-orange-700 bg-orange-50" />
            <SummaryCard icon={AlertTriangle} label="Orphan Records" value={audit?.records_without_ewo_count ?? 0} colour="text-amber-700 bg-amber-50" />
            <SummaryCard icon={GitBranch} label="Parent-Child Issues" value={audit?.parent_child_issues_count ?? 0} colour="text-teal-700 bg-teal-50" />
            <SummaryCard icon={ShieldAlert} label="Open Alerts" value={alerts.length} colour="text-red-700 bg-red-50" />
            <SummaryCard icon={TrendingUp} label="Current-Run Repairs" value={audit?.current_run_repairs ?? 0} colour="text-blue-700 bg-blue-50" />
            <SummaryCard icon={History} label="Cumulative Repairs" value={audit?.cumulative_historical_repairs ?? 0} colour="text-slate-600 bg-slate-50" />
            <SummaryCard icon={CheckCircle2} label="Stable Result" value={audit?.stable_result ? 1 : 0} colour={audit?.stable_result ? 'text-green-700 bg-green-50' : 'text-amber-700 bg-amber-50'} />
            <SummaryCard icon={ShieldCheck} label="Score Eligible" value={audit?.score_eligible ? 1 : 0} colour={audit?.score_eligible ? 'text-green-700 bg-green-50' : 'text-amber-700 bg-amber-50'} />
          </div>

          {/* Lifecycle Truthfulness (EWO-017R) */}
          {lifecycleSummary && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary-500" />
                  Lifecycle Truthfulness (EWO-017R)
                </h2>
                <p className="text-xs text-slate-500 mt-1">Closure requires Product Owner acceptance. Counts distinguish engineering completion from PO completion.</p>
              </div>
              <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div><p className="text-xs text-slate-400">Engineering Complete</p><p className="text-lg font-bold text-blue-700">{lifecycleSummary.engineering_complete}</p></div>
                <div><p className="text-xs text-slate-400">PO Testing Pending</p><p className="text-lg font-bold text-amber-600">{lifecycleSummary.po_testing_pending}</p></div>
                <div><p className="text-xs text-slate-400">Awaiting Acceptance</p><p className="text-lg font-bold text-orange-600">{lifecycleSummary.awaiting_acceptance}</p></div>
                <div><p className="text-xs text-slate-400">Closed (PO Accepted)</p><p className="text-lg font-bold text-green-700">{lifecycleSummary.closed}</p></div>
                <div><p className="text-xs text-slate-400">Bootstrapped</p><p className="text-lg font-bold text-slate-600">{lifecycleSummary.bootstrapped}</p></div>
                <div><p className="text-xs text-slate-400">Premature Closures</p><p className={`text-lg font-bold ${lifecycleSummary.premature_closures > 0 ? 'text-red-600' : 'text-green-600'}`}>{lifecycleSummary.premature_closures}</p></div>
              </div>
              {lifecycleSummary.premature_closures > 0 && (
                <div className="px-5 pb-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                    {lifecycleSummary.premature_closures} EWO(s) have status='closed' but are not closure eligible. Product Owner acceptance is required before closure.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Source Completion Envelope */}
          {sources.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <button onClick={() => setExpandedSources(!expandedSources)} className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <Database className="w-4 h-4 text-slate-400" />
                  Source Completion Envelope ({sources.filter(s => s.succeeded).length}/{sources.length} succeeded)
                </h2>
                {expandedSources ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              </button>
              {expandedSources && (
                <div className="border-t border-slate-100 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-5 py-2 font-semibold">Source</th>
                        <th className="text-center px-3 py-2 font-semibold">Succeeded</th>
                        <th className="text-right px-3 py-2 font-semibold">Records</th>
                        <th className="text-right px-3 py-2 font-semibold">Refs Found</th>
                        <th className="text-left px-3 py-2 font-semibold">Failure</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sources.map(s => (
                        <tr key={s.source_name} className="hover:bg-slate-50">
                          <td className="px-5 py-2 text-xs font-mono text-slate-600">{s.source_name}</td>
                          <td className="px-3 py-2 text-center">{s.succeeded ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" /> : <X className="w-4 h-4 text-red-500 mx-auto" />}</td>
                          <td className="px-3 py-2 text-right text-xs text-slate-600">{s.records_examined}</td>
                          <td className="px-3 py-2 text-right text-xs text-slate-600">{s.canonical_references_discovered}</td>
                          <td className="px-3 py-2 text-xs text-red-500 max-w-xs truncate">{s.failure ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Alerts Tab (Investigation Workspace) ────────────────────────── */}
      {activeTab === 'alerts' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Active Integrity Alerts ({alerts.length})
            </h2>
            <p className="text-xs text-slate-500 mt-1">Active alerts only. Resolved alerts are in the Resolved History tab.</p>
          </div>
          {/* Alert Filter Buttons (Part 1) */}
          <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-2">
            <button
              onClick={() => setAlertFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${alertFilter === 'all' ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              <Filter className="w-3 h-3 inline mr-1" />All Alerts ({alerts.length})
            </button>
            {categoryCounts.map(cat => (
              <button
                key={cat.classification}
                onClick={() => setAlertFilter(cat.classification)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${alertFilter === cat.classification ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
              >
                {cat.label} ({cat.count})
              </button>
            ))}
          </div>
          {filteredAlerts.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No alerts in this category.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredAlerts.map(alert => (
                <button
                  key={alert.id}
                  onClick={() => setInvestigation(buildInvestigation(alert))}
                  className="w-full px-5 py-3 flex items-start gap-3 hover:bg-slate-50 text-left transition-colors"
                >
                  <div className="shrink-0">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${OBJECT_TYPE_COLOURS[alert.object_type] ?? 'bg-slate-100 text-slate-600'}`}>
                      {alert.object_type.toUpperCase().substring(0, 4)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{alert.evolved_title ?? alert.title}</p>
                    {alert.evolved_title && alert.evolved_title !== alert.title && (
                      <p className="text-[10px] text-slate-400">Original: {alert.title}</p>
                    )}
                    <p className="text-xs text-slate-500 mt-0.5">{alert.description}</p>
                    {alert.classification_reason && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        Classification: {alert.classification_reason}
                        <span className="text-slate-300"> (reference classification confidence: {Math.round(alert.confidence * 100)}%)</span>
                      </p>
                    )}
                    {alert.alert_type === 'missing_ewo' && (
                      <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        <AlertTriangle className="w-2.5 h-2.5" /> Unverified Reference Recovery Candidate
                      </span>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-1" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── One-Off Cleanup Tab (Part 2-9) ──────────────────────────────── */}
      {activeTab === 'cleanup' && (
        <div className="space-y-5">
          {/* Cleanup Warning Banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-amber-800">One-Off Historical Cleanup</h3>
                <p className="text-xs text-amber-700 mt-1">
                  This is a Product Owner controlled one-off process for cleaning the existing integrity alert backlog.
                  It is NOT a permanent recovery engine. No background processor, scheduled reconciliation, or autonomous repair exists.
                  Batch processing is only available for Missing Work Orders. No unrestricted "Fix All" capability is permitted.
                </p>
              </div>
            </div>
          </div>

          {/* Batch Processing Panel */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-4">
              <Wand2 className="w-4 h-4 text-primary-500" />
              Controlled Batch Processing
            </h2>

            {/* Missing EWO Count */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <p className="text-xs text-slate-500">Missing Work Orders</p>
                <p className="text-2xl font-bold text-red-600">{missingEwoCount}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <p className="text-xs text-slate-500">Total Open Alerts</p>
                <p className="text-2xl font-bold text-slate-700">{alerts.length}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <p className="text-xs text-slate-500">Batches Run</p>
                <p className="text-2xl font-bold text-slate-700">{batchHistory.length}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <p className="text-xs text-slate-500">Eligible for Batch</p>
                <p className="text-xs text-amber-600 font-medium mt-1">Missing Work Orders only</p>
              </div>
            </div>

            {/* Batch Size Selector */}
            <div className="mb-4">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 block">Batch Size</label>
              <div className="flex gap-2">
                {([25, 50, 100] as BatchSize[]).map(size => (
                  <button
                    key={size}
                    onClick={() => setBatchSize(size)}
                    disabled={batchProcessing}
                    className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${batchSize === size ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'} ${batchProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {size}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">Default: 25</p>
            </div>

            {/* Batch Preview Button */}
            <button
              onClick={handleBuildBatchPreview}
              disabled={batchProcessing || missingEwoCount === 0}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors ${batchProcessing || missingEwoCount === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Play className="w-4 h-4" />
              Preview Batch of {batchSize}
            </button>
          </div>

          {/* Batch Processing Spinner */}
          {batchProcessing && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <Loader2 className="w-8 h-8 text-primary-500 mx-auto mb-3 animate-spin" />
              <p className="text-sm font-medium text-slate-700">Processing batch...</p>
              <p className="text-xs text-slate-500 mt-1">Running duplicate detection, evidence collection, and Work Order reconstruction.</p>
            </div>
          )}

          {/* Batch Results (Part 7) */}
          {batchResult && !batchProcessing && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Batch Results: {batchResult.batchRef}
                </h2>
                <button
                  onClick={handleCopyReport}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${copiedReport ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedReport ? 'Copied!' : 'Copy Report'}
                </button>
              </div>
              <div className="px-5 py-4">
                {/* Summary Grid */}
                <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2 mb-4">
                  <div className="bg-green-50 rounded-lg p-2 text-center border border-green-100">
                    <p className="text-lg font-bold text-green-700">{batchResult.summary.recovered}</p>
                    <p className="text-[10px] text-green-600">Recovered</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2 text-center border border-blue-100">
                    <p className="text-lg font-bold text-blue-700">{batchResult.summary.alreadyResolved}</p>
                    <p className="text-[10px] text-blue-600">Already Resolved</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-2 text-center border border-amber-100">
                    <p className="text-lg font-bold text-amber-700">{batchResult.summary.needsProductOwnerReview}</p>
                    <p className="text-[10px] text-amber-600">Needs PO Review</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2 text-center border border-slate-200">
                    <p className="text-lg font-bold text-slate-700">{batchResult.summary.invalidReferences}</p>
                    <p className="text-[10px] text-slate-500">Invalid</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2 text-center border border-slate-200">
                    <p className="text-lg font-bold text-slate-700">{batchResult.summary.falsePositives}</p>
                    <p className="text-[10px] text-slate-500">False Positives</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-2 text-center border border-red-100">
                    <p className="text-lg font-bold text-red-700">{batchResult.summary.failed}</p>
                    <p className="text-[10px] text-red-600">Failed</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2 text-center border border-slate-200">
                    <p className="text-lg font-bold text-slate-700">{batchResult.summary.skipped}</p>
                    <p className="text-[10px] text-slate-500">Skipped</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2 text-center border border-slate-200">
                    <p className="text-lg font-bold text-slate-700">{batchResult.summary.attempted}</p>
                    <p className="text-[10px] text-slate-500">Attempted</p>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-2 text-center border border-slate-200">
                    <p className="text-lg font-bold text-slate-700">{batchResult.summary.remainingAlerts}</p>
                    <p className="text-[10px] text-slate-500">Remaining</p>
                  </div>
                </div>

                {/* Expandable Item Results */}
                <details className="mt-3">
                  <summary className="text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700">
                    Item-Level Results ({batchResult.items.length})
                  </summary>
                  <div className="mt-2 space-y-1">
                    {batchResult.items.map((item, i) => (
                      <details key={i} className="bg-slate-50 rounded-lg border border-slate-100">
                        <summary className="px-3 py-2 cursor-pointer hover:bg-slate-100 rounded-lg">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${OUTCOME_COLOURS[item.outcome] ?? 'bg-slate-100 text-slate-600'}`}>
                              {item.outcome}
                            </span>
                            <span className="text-xs font-mono text-slate-600">{item.ewoRef ?? 'N/A'}</span>
                            <span className="text-xs text-slate-400 truncate flex-1">{item.reason}</span>
                          </div>
                        </summary>
                        <div className="px-3 py-2 text-xs text-slate-600 space-y-1">
                          <p><span className="font-semibold">Evidence Searched:</span> {item.evidenceSearched.join(', ') || 'None'}</p>
                          <p><span className="font-semibold">Evidence Used:</span> {item.evidenceUsed.join(', ') || 'None'}</p>
                          <p><span className="font-semibold">Fields Reconstructed:</span> {item.fieldsReconstructed.join(', ') || 'None'}</p>
                          <p><span className="font-semibold">Missing Fields:</span> {item.missingFields.join(', ') || 'None'}</p>
                          <p><span className="font-semibold">Confidence:</span> {Math.round(item.confidence * 100)}%</p>
                          {item.canonicalWorkOrderId && <p><span className="font-semibold">Work Order ID:</span> <span className="font-mono">{item.canonicalWorkOrderId}</span></p>}
                          {item.transactionDetails && <p><span className="font-semibold">Transaction:</span> {JSON.stringify(item.transactionDetails)}</p>}
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              </div>
            </div>
          )}

          {/* Batch History */}
          {batchHistory.length > 0 && !batchProcessing && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                  <History className="w-4 h-4 text-slate-400" />
                  Batch History
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-5 py-2 font-semibold">Batch Ref</th>
                      <th className="text-left px-3 py-2 font-semibold">Type</th>
                      <th className="text-left px-3 py-2 font-semibold">Initiated</th>
                      <th className="text-right px-3 py-2 font-semibold">Size</th>
                      <th className="text-right px-3 py-2 font-semibold">Attempted</th>
                      <th className="text-center px-3 py-2 font-semibold">Status</th>
                      <th className="text-center px-3 py-2 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batchHistory.map(run => (
                      <tr key={run.id} className="hover:bg-slate-50">
                        <td className="px-5 py-2 text-xs font-mono text-slate-600">{run.batch_ref}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{run.alert_type}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{new Date(run.initiated_at).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right text-xs text-slate-600">{run.requested_batch_size}</td>
                        <td className="px-3 py-2 text-right text-xs text-slate-600">{run.attempted_count}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${run.status === 'completed' ? 'bg-green-100 text-green-700' : run.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                            {run.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => handleOpenBatch(run)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-300"
                            aria-label={`View results for batch ${run.batch_ref}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View Results
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Batch Confirmation Modal (Part 2) ────────────────────────────── */}
      {showBatchConfirm && batchPreview && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4 sm:p-6" onClick={() => setShowBatchConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-primary-500" />
                <h2 className="text-base font-semibold text-slate-800">Confirm Batch Processing</h2>
              </div>
              <button onClick={() => setShowBatchConfirm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Alert Type:</span> <span className="font-medium text-slate-700">Missing Work Orders</span></div>
                <div><span className="text-slate-500">Batch Size:</span> <span className="font-medium text-slate-700">{batchPreview.selectedBatchSize}</span></div>
                <div><span className="text-slate-500">Alerts Selected:</span> <span className="font-medium text-slate-700">{batchPreview.alertsSelected}</span></div>
                <div><span className="text-slate-500">Actual to Process:</span> <span className="font-medium text-slate-700">{batchPreview.actualToProcess}</span></div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                <p className="text-xs text-amber-700 font-medium">⚠ Canonical Work Orders may be created</p>
                <p className="text-xs text-amber-600">Ambiguous records will never be fabricated — insufficient evidence routes to Product Owner review.</p>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
              <button onClick={() => setShowBatchConfirm(false)} className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleProcessBatch}
                disabled={batchPreview.actualToProcess === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors ${batchPreview.actualToProcess === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Play className="w-3.5 h-3.5" />
                Process Batch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── PO Review Tab ─────────────────────────────────────────────── */}
      {activeTab === 'po-review' && (
        <POReviewPanel onNavigate={onNavigate} />
      )}

      {/* ─── Platform Maturity Tab (Req 1, 7) ──────────────────────────────── */}
      {activeTab === 'maturity' && (
        <div className="space-y-5">
          {/* Maturity Summary */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-3">
              <Gauge className="w-4 h-4 text-primary-500" />
              Platform Maturity Summary
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {(Object.keys(MATURITY_DISPLAY) as (keyof typeof MATURITY_DISPLAY)[]).map(key => {
                const display = MATURITY_DISPLAY[key];
                const count = maturitySummary[key] ?? 0;
                return (
                  <div key={key} className={`rounded-lg p-3 border ${display.badge}`}>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-[10px] uppercase tracking-wide">{display.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Capability Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {capabilityEvaluations.map(({ capability, state }) => {
              const display = MATURITY_DISPLAY[state.maturity];
              return (
                <div key={capability.key} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-800">{capability.label}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{capability.category}</p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${display.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${display.dot}`} />
                      {display.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mb-2">{state.description}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{state.explanation}</p>
                  {state.recommendedAction && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-600">
                      <Lightbulb className="w-3.5 h-3.5" />
                      {state.recommendedAction}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Audit History Tab ────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-400" />
              Audit History
            </h2>
          </div>
          {history.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No audits have been run yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-5 py-2 font-semibold">Audit</th>
                    <th className="text-left px-3 py-2 font-semibold">Phase</th>
                    <th className="text-left px-3 py-2 font-semibold">Run At</th>
                    <th className="text-right px-3 py-2 font-semibold">EWOs</th>
                    <th className="text-right px-3 py-2 font-semibold">Missing</th>
                    <th className="text-right px-3 py-2 font-semibold">Orphans</th>
                    <th className="text-right px-3 py-2 font-semibold">Passes</th>
                    <th className="text-center px-3 py-2 font-semibold">Stable</th>
                    <th className="text-right px-3 py-2 font-semibold">Score</th>
                    <th className="text-center px-3 py-2 font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map(a => (
                    <tr key={a.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => handleDrillDown(a)}>
                      <td className="px-5 py-2 text-xs font-mono text-slate-600">{a.audit_ref}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${AUDIT_PHASE_COLOURS[a.audit_phase] ?? 'bg-slate-100 text-slate-600'}`}>
                          {AUDIT_PHASE_LABELS[a.audit_phase] ?? a.audit_phase}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">{new Date(a.run_at).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-xs text-slate-600">{a.total_ewos}</td>
                      <td className="px-3 py-2 text-right text-xs text-red-600 font-medium">{a.missing_ewos_count}</td>
                      <td className="px-3 py-2 text-right text-xs text-amber-600 font-medium">{a.records_without_ewo_count}</td>
                      <td className="px-3 py-2 text-right text-xs text-slate-600">{a.reconciliation_passes}</td>
                      <td className="px-3 py-2 text-center">{a.stable_result ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" /> : <X className="w-4 h-4 text-slate-300 mx-auto" />}</td>
                      <td className="px-3 py-2 text-right text-xs font-bold text-slate-700">{a.integrity_score}%</td>
                      <td className="px-3 py-2 text-center"><ChevronRight className="w-4 h-4 text-slate-400" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Resolved History Tab (EWO-014.19A.7SR.6R.2) ──────────────────────── */}
      {activeTab === 'resolved' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Resolved Integrity History
            </h2>
            <button
              onClick={() => loadResolved()}
              disabled={resolvedLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg transition-colors disabled:opacity-50"
            >
              {resolvedLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </button>
          </div>
          <div className="px-5 py-2 bg-slate-50 border-b border-slate-200">
            <p className="text-xs text-slate-500">
              Historical record of resolved and archived integrity alerts. These are immutable audit records and do not appear in active alert lists.
            </p>
          </div>
          {resolvedLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
              <span className="ml-2 text-sm text-slate-500">Loading resolved alerts...</span>
            </div>
          ) : resolvedAlerts.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              No resolved alerts. Alerts will appear here after governed resolution.
              <p className="text-[10px] font-mono text-slate-400 mt-2">EIOS-CHANGELOG-002</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-5 py-2 font-semibold">Evolved Title</th>
                    <th className="text-left px-3 py-2 font-semibold">Original Title</th>
                    <th className="text-left px-3 py-2 font-semibold">Reference</th>
                    <th className="text-left px-3 py-2 font-semibold">Resolution Status</th>
                    <th className="text-left px-3 py-2 font-semibold">Resolved At</th>
                    <th className="text-left px-3 py-2 font-semibold">Resolved By</th>
                    <th className="text-center px-3 py-2 font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resolvedAlerts.map(alert => {
                    const evolvedTitle = alert.evolved_title;
                    const originalTitle = alert.description;
                    const resolutionStatus = alert.resolution_status;
                    const resolvedAt = alert.resolved_at;
                    const resolvedBy = alert.resolved_by;
                    const ewoRef = alert.normalised_reference;
                    return (
                      <tr
                        key={alert.id}
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => setInvestigation(buildInvestigation(alert))}
                      >
                        <td className="px-5 py-2 text-xs font-medium text-slate-700">
                          {evolvedTitle ?? originalTitle ?? 'Untitled'}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">
                          {evolvedTitle && originalTitle && evolvedTitle !== originalTitle ? originalTitle : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs font-mono text-slate-600">{ewoRef ?? '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                            resolutionStatus === 'resolved' ? 'bg-green-100 text-green-700 border-green-200' :
                            resolutionStatus === 'archived' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                            'bg-blue-100 text-blue-700 border-blue-200'
                          }`}>
                            {resolutionStatus ?? 'resolved'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">
                          {resolvedAt ? new Date(resolvedAt).toLocaleString() : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{resolvedBy ?? '—'}</td>
                        <td className="px-3 py-2 text-center">
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── Investigation Workspace Modal ────────────────────────────────── */}
      {investigation && (
        <InvestigationWorkspace
          investigation={investigation}
          onClose={() => { setInvestigation(null); load(); }}
          onNavigate={onNavigate}
          onResolve={(alert, notes) => handleResolve(alert, false, notes)}
          onDismiss={(alert, notes) => handleResolve(alert, true, notes)}
          onRetry={handleRunAudit}
          onCreateMissing={(_objectType, reference) => {
            if (onNavigate) onNavigate('work-orders', reference);
          }}
          onOpenResolutionWorkspace={handleOpenResolutionWorkspace}
          onRecommendationReady={(rec, pkg) => {
            setResolutionRecommendation(rec);
            setResolutionEvidencePackage(pkg);
          }}
        />
      )}

      {/* ─── Integrity Resolution Workspace Modal (EWO-021R.5) ────────────── */}
      {resolutionAlert && (
        <IntegrityResolutionWorkspace
          alert={resolutionAlert}
          recommendation={resolutionRecommendation}
          evidencePackage={resolutionEvidencePackage}
          decisionId={null}
          onClose={handleResolutionClose}
          onNavigate={onNavigate}
          onAlertResolved={handleAlertResolved}
        />
      )}

      {/* ─── Batch Detail Modal ──────────────────────────────────────────── */}
      {(batchDetailLoading || batchDetailRun || batchDetailError) && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4 sm:p-6" onClick={handleCloseBatchDetail}>
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4 sticky top-0 bg-white pb-3 border-b border-slate-200 -mx-6 px-6 -mt-6 pt-6 z-10">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary-500" />
                <h3 className="text-base font-semibold text-slate-800">Batch Results</h3>
              </div>
              <button onClick={handleCloseBatchDetail} className="text-slate-400 hover:text-slate-600" aria-label="Close batch detail">
                <X className="w-5 h-5" />
              </button>
            </div>

            {batchDetailLoading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                <span className="ml-2 text-sm text-slate-500">Loading batch results...</span>
              </div>
            )}

            {batchDetailError && !batchDetailLoading && (
              <div className="py-8">
                <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{batchDetailError}</span>
                </div>
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={handleCloseBatchDetail}
                    className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {batchDetailRun && !batchDetailLoading && !batchDetailError && (
              <>
                {/* Legacy/Superseded Banner */}
                {batchDetailRun.legacy_status === 'SUPERSEDED_INCOMPLETE_AUDIT' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-amber-800">Legacy incomplete batch — item-level outcomes were not persisted.</p>
                        {batchDetailRun.supersession_reason && (
                          <p className="text-xs text-amber-700 mt-1">{batchDetailRun.supersession_reason}</p>
                        )}
                        {batchDetailRun.superseded_by ? (
                          <p className="text-xs text-amber-700 mt-1">Superseded by replacement batch. See batch history for the replacement record.</p>
                        ) : (
                          <div className="mt-3">
                            {!reprocessPreview ? (
                              <button
                                onClick={handleReprocessPreview}
                                disabled={reprocessLoading}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50"
                              >
                                {reprocessLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                Reprocess as New Governed Batch
                              </button>
                            ) : (
                              <div className="mt-2 space-y-2">
                                <p className="text-xs font-semibold text-amber-800">Reprocess Preview — {reprocessPreview.count} alerts will be selected:</p>
                                <div className="max-h-40 overflow-y-auto bg-white border border-amber-200 rounded-lg">
                                  <table className="w-full text-xs">
                                    <thead className="bg-amber-50 text-amber-700">
                                      <tr>
                                        <th className="text-left px-3 py-1.5 font-semibold">#</th>
                                        <th className="text-left px-3 py-1.5 font-semibold">Alert ID</th>
                                        <th className="text-left px-3 py-1.5 font-semibold">EWO Ref</th>
                                        <th className="text-left px-3 py-1.5 font-semibold">Status</th>
                                        <th className="text-left px-3 py-1.5 font-semibold">Detected</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-amber-100">
                                      {reprocessPreview.alerts.map(a => (
                                        <tr key={a.id}>
                                          <td className="px-3 py-1.5 text-slate-400">{a.selection_order}</td>
                                          <td className="px-3 py-1.5 font-mono text-slate-500 text-[10px]">{a.id.slice(0, 8)}...</td>
                                          <td className="px-3 py-1.5 font-mono text-slate-600">{a.ewo_ref}</td>
                                          <td className="px-3 py-1.5 text-slate-500">{a.status}</td>
                                          <td className="px-3 py-1.5 text-slate-500">{new Date(a.created_at).toLocaleDateString()}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <p className="text-xs text-amber-700">No processing will occur until you explicitly confirm. This will create a new batch with corrected persistence logic.</p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setReprocessPreview(null)}
                                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 rounded-lg transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => {
                                      // Navigate to cleanup tab for PO to run the batch with corrected persistence
                                      handleCloseBatchDetail();
                                      setActiveTab('cleanup');
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
                                  >
                                    <Play className="w-3.5 h-3.5" />
                                    Confirm & Go to Cleanup
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Batch Summary */}
                <div className="bg-slate-50 rounded-lg p-4 mb-4">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Batch Summary</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><span className="text-slate-500">Batch Ref:</span> <span className="font-mono font-medium text-slate-700 text-xs">{batchDetailRun.batch_ref}</span></div>
                    <div><span className="text-slate-500">Status:</span> <span className={`font-medium px-2 py-0.5 rounded-full text-xs ${batchDetailRun.status === 'completed' ? 'bg-green-100 text-green-700' : batchDetailRun.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{batchDetailRun.status}</span></div>
                    <div><span className="text-slate-500">Alert Type:</span> <span className="font-medium text-slate-700">{batchDetailRun.alert_type}</span></div>
                    <div><span className="text-slate-500">Initiated By:</span> <span className="font-medium text-slate-700">{batchDetailRun.initiated_by ?? 'Not recorded'}</span></div>
                    <div><span className="text-slate-500">Initiated:</span> <span className="font-medium text-slate-700 text-xs">{new Date(batchDetailRun.initiated_at).toLocaleString()}</span></div>
                    <div><span className="text-slate-500">Completed:</span> <span className="font-medium text-slate-700 text-xs">{batchDetailRun.completed_at ? new Date(batchDetailRun.completed_at).toLocaleString() : 'Not recorded'}</span></div>
                    <div><span className="text-slate-500">Requested Size:</span> <span className="font-medium text-slate-700">{batchDetailRun.requested_batch_size}</span></div>
                    <div><span className="text-slate-500">Attempted:</span> <span className="font-medium text-slate-700">{batchDetailRun.attempted_count}</span></div>
                  </div>
                  {(() => {
                    const s = batchDetailRun.summary as Record<string, unknown> | null;
                    if (!s) return null;
                    const fields: Array<[string, string]> = [
                      ['Recovered', String(s.recovered ?? s.recoveredCount ?? 'Not recorded')],
                      ['Already Resolved', String(s.alreadyResolved ?? s.alreadyResolvedCount ?? 'Not recorded')],
                      ['Needs PO Review', String(s.needsProductOwnerReview ?? s.needsProductOwnerReviewCount ?? 'Not recorded')],
                      ['Invalid Reference', String(s.invalidReferences ?? s.invalidReferenceCount ?? 'Not recorded')],
                      ['False Positive', String(s.falsePositives ?? s.falsePositiveCount ?? 'Not recorded')],
                      ['Failed', String(s.failed ?? s.failedCount ?? 'Not recorded')],
                      ['Skipped', String(s.skipped ?? s.skippedCount ?? 'Not recorded')],
                      ['Remaining Alerts', String(s.remainingAlerts ?? s.remainingAlertCount ?? 'Not recorded')],
                    ];
                    return (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3 pt-3 border-t border-slate-200">
                        {fields.map(([label, value]) => (
                          <div key={label}><span className="text-slate-500">{label}:</span> <span className="font-medium text-slate-700">{value}</span></div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Item-Level Results */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Item-Level Results ({batchDetailItems.length})</h4>
                  {batchDetailItems.length === 0 ? (
                    <div className="text-center py-8 text-sm text-slate-400 bg-slate-50 rounded-lg">
                      No batch item results were recorded.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {batchDetailItems.map(item => {
                        const itemId = (item as { id?: string }).id ?? item.alertId ?? '';
                        const expanded = expandedBatchItems.has(itemId);
                        return (
                          <div key={itemId} className="border border-slate-200 rounded-lg overflow-hidden">
                            <button
                              onClick={() => toggleBatchItem(itemId)}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                              aria-label={`${expanded ? 'Collapse' : 'Expand'} item ${item.ewoRef ?? 'unknown'}`}
                            >
                              {expanded ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                              <span className="text-xs font-mono text-slate-600 shrink-0">{item.ewoRef ?? 'Not recorded'}</span>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${OUTCOME_COLOURS[item.outcome] ?? 'bg-slate-100 text-slate-600'}`}>{item.outcome}</span>
                              {item.confidence != null && (
                                <span className="text-xs text-slate-400 ml-auto">{Math.round(item.confidence * 100)}%</span>
                              )}
                            </button>
                            {expanded && (
                              <div className="px-4 pb-3 pt-1 bg-slate-50 border-t border-slate-100 text-xs space-y-1.5">
                                <div><span className="text-slate-500">Reason:</span> <span className="text-slate-700">{item.reason ?? 'Not recorded'}</span></div>
                                <div><span className="text-slate-500">Evidence Searched:</span> <span className="text-slate-700">{formatJsonField(item.evidenceSearched)}</span></div>
                                <div><span className="text-slate-500">Evidence Used:</span> <span className="text-slate-700">{formatJsonField(item.evidenceUsed)}</span></div>
                                <div><span className="text-slate-500">Fields Reconstructed:</span> <span className="text-slate-700">{formatJsonField(item.fieldsReconstructed)}</span></div>
                                <div><span className="text-slate-500">Missing Fields:</span> <span className="text-slate-700">{formatJsonField(item.missingFields)}</span></div>
                                <div><span className="text-slate-500">Canonical Work Order ID:</span> <span className="text-slate-700 font-mono">{item.canonicalWorkOrderId ?? 'Not applicable'}</span></div>
                                <div><span className="text-slate-500">Transaction Details:</span> <span className="text-slate-700">{formatJsonField(item.transactionDetails)}</span></div>
                                <div><span className="text-slate-500">Processed At:</span> <span className="text-slate-700">{item.processedAt ? new Date(item.processedAt).toLocaleString() : 'Not recorded'}</span></div>
                                {item.canonicalWorkOrderId && onNavigate && (
                                  <button
                                    onClick={() => { handleCloseBatchDetail(); onNavigate('work-orders', item.canonicalWorkOrderId!); }}
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-800 mt-1"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    Open Canonical Work Order
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Audit Drill-Down Modal ───────────────────────────────────────── */}
      {drillDownAudit && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4 sm:p-6" onClick={() => setDrillDownAudit(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Audit Drill-Down: {drillDownAudit.audit_ref}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Phase: {AUDIT_PHASE_LABELS[drillDownAudit.audit_phase] ?? drillDownAudit.audit_phase} ·
                  Run at: {new Date(drillDownAudit.run_at).toLocaleString()} ·
                  Passes: {drillDownAudit.reconciliation_passes} ·
                  Stable: {drillDownAudit.stable_result ? 'Yes' : 'No'}
                </p>
              </div>
              <button onClick={() => setDrillDownAudit(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 mb-4">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Sources Scanned</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-slate-500">Total Sources:</span> <span className="font-bold">{sources.length}</span></div>
                <div><span className="text-slate-500">Succeeded:</span> <span className="font-bold text-green-600">{sources.filter(s => s.succeeded).length}</span></div>
                <div><span className="text-slate-500">Failed:</span> <span className="font-bold text-red-600">{sources.filter(s => !s.succeeded).length}</span></div>
                <div><span className="text-slate-500">Coverage:</span> <span className="font-bold">{sourceCoverage}%</span></div>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 mb-4">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Score Calculation</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-slate-500">Score:</span> <span className="font-bold text-slate-800">{drillDownAudit.integrity_score}%</span></div>
                <div><span className="text-slate-500">Eligible:</span> <span className="font-bold">{drillDownAudit.score_eligible ? 'Yes' : 'No'}</span></div>
                <div><span className="text-slate-500">Sources OK:</span> <span className="font-bold">{drillDownAudit.all_required_sources_succeeded ? 'Yes' : 'No'}</span></div>
                <div><span className="text-slate-500">Unresolved:</span> <span className="font-bold">{drillDownAudit.unresolved_issue_count}</span></div>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 mb-4">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Issue Counts</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-slate-500">Total EWOs:</span> <span className="font-bold">{drillDownAudit.total_ewos}</span></div>
                <div><span className="text-slate-500">Missing:</span> <span className="font-bold text-red-600">{drillDownAudit.missing_ewos_count}</span></div>
                <div><span className="text-slate-500">Duplicates:</span> <span className="font-bold">{drillDownAudit.duplicate_ewos_count}</span></div>
                <div><span className="text-slate-500">Orphans:</span> <span className="font-bold text-amber-600">{drillDownAudit.records_without_ewo_count}</span></div>
              </div>
            </div>
            {drillDownClassifications.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">References Discovered ({drillDownClassifications.length})</h4>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {drillDownClassifications.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={`px-1.5 py-0.5 rounded font-bold ${OBJECT_TYPE_COLOURS[c.inferred_object_type] ?? 'bg-slate-100 text-slate-600'}`}>
                        {c.inferred_object_type.toUpperCase()}
                      </span>
                      <span className="font-mono text-slate-600">{c.normalised_reference}</span>
                      <span className="text-slate-400">from {c.source}</span>
                      <span className="text-slate-400">· {Math.round(c.confidence * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const OUTCOME_COLOURS: Record<string, string> = {
  RECOVERED: 'bg-green-100 text-green-700',
  ALREADY_RESOLVED: 'bg-blue-100 text-blue-700',
  NEEDS_PRODUCT_OWNER_REVIEW: 'bg-amber-100 text-amber-700',
  INVALID_REFERENCE: 'bg-slate-100 text-slate-600',
  FALSE_POSITIVE: 'bg-slate-100 text-slate-600',
  FAILED: 'bg-red-100 text-red-700',
  SKIPPED: 'bg-slate-100 text-slate-500',
};

function Metric({ label, value, colour }: { label: string; value: string; colour: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-lg font-bold ${colour}`}>{value}</p>
    </div>
  );
}

function formatJsonField(field: unknown): string {
  if (field == null) return 'Not recorded';
  if (typeof field === 'string') return field || 'Not recorded';
  if (Array.isArray(field)) return field.length > 0 ? field.join(', ') : 'None';
  if (typeof field === 'object') {
    const entries = Object.entries(field as Record<string, unknown>);
    if (entries.length === 0) return 'None';
    return entries.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join('; ');
  }
  return String(field);
}

function SummaryCard({ icon: Icon, label, value, colour }: { icon: typeof Layers; label: string; value: number; colour: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${colour} mb-2`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
