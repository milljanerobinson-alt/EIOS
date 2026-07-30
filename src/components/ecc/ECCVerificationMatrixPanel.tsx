import { useEffect, useState, useCallback } from 'react';
import {
  type TestClassification,
  type VerificationMatrixRow,
  type POWorkflow,
  type POWorkflowStep,
  type VerificationStatus,
  type WorkflowStatus,
  type EngineeringConfidence,
  type CompletionReportStatus,
  type VerificationHistoryEntry,
  type ConfidenceExplanation,
  type EvidenceRecord,
  type TrustScoreResult,
  getTestClassifications,
  getVerificationMatrix,
  getPOWorkflows,
  getWorkflowSteps,
  upsertVerificationMatrixRow,
  updateWorkflowStatus,
  recalculateAndStoreConfidence,
  getCompletionReportStatus,
  updateCompletionReportStatus,
  calculateEngineeringConfidence,
  getVerificationHistory,
  recordVerificationEvidence,
  checkVerificationDependencies,
  explainEngineeringConfidence,
  calculateAndStoreTrustScore,
  getTrustScore,
  type TrustScoreRecord,
} from '../../lib/verificationFrameworkService';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Clock, Ban, CircleDot,
  Loader2, ListChecks, Workflow, History, Info, Lock, RefreshCw, Award, TrendingUp,
} from 'lucide-react';

const STATUS_META: Record<VerificationStatus, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  not_run:               { label: 'Not Run',               icon: CircleDot,    color: 'text-slate-500',   bg: 'bg-slate-100'  },
  pending:               { label: 'Pending',               icon: Clock,        color: 'text-amber-600',   bg: 'bg-amber-50'   },
  passed:                { label: 'Passed',                icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  failed:                { label: 'Failed',                icon: XCircle,      color: 'text-red-600',     bg: 'bg-red-50'     },
  blocked:               { label: 'Blocked',               icon: Ban,          color: 'text-orange-600',  bg: 'bg-orange-50'  },
  not_applicable:        { label: 'Not Applicable',        icon: Ban,          color: 'text-slate-400',   bg: 'bg-slate-50'   },
  pending_reverification:{ label: 'Pending Reverification',icon: RefreshCw,   color: 'text-amber-700',   bg: 'bg-amber-100'  },
};

const CONFIDENCE_META: Record<EngineeringConfidence, { label: string; color: string; bg: string }> = {
  unknown:  { label: 'Unknown',  color: 'text-slate-600',   bg: 'bg-slate-100'   },
  low:      { label: 'Low',      color: 'text-red-700',     bg: 'bg-red-100'     },
  medium:   { label: 'Medium',   color: 'text-amber-700',   bg: 'bg-amber-100'   },
  high:     { label: 'High',     color: 'text-blue-700',    bg: 'bg-blue-100'    },
  verified: { label: 'Verified', color: 'text-emerald-700', bg: 'bg-emerald-100' },
};

const TRUST_META: Record<string, { label: string; color: string; bg: string }> = {
  excellent: { label: 'Excellent', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  good:      { label: 'Good',      color: 'text-blue-700',    bg: 'bg-blue-100'   },
  moderate:  { label: 'Moderate',  color: 'text-amber-700',   bg: 'bg-amber-100'  },
  low:       { label: 'Low',       color: 'text-orange-700',  bg: 'bg-orange-100' },
  critical:  { label: 'Critical',  color: 'text-red-700',     bg: 'bg-red-100'    },
};

const COMPLETION_LABELS: Record<keyof CompletionReportStatus, string> = {
  implementation: 'Implementation',
  verification: 'Verification',
  po_testing: 'Product Owner Testing',
  po_acceptance: 'Product Owner Acceptance',
  build: 'Build',
};

const COMPLETION_STATUS_COLOR: Record<string, string> = {
  pending:        'bg-slate-100 text-slate-600',
  partial:        'bg-amber-100 text-amber-700',
  complete:       'bg-emerald-100 text-emerald-700',
  failed:         'bg-red-100 text-red-700',
  not_applicable: 'bg-slate-50 text-slate-400',
};

const STATUS_ORDER: VerificationStatus[] = [
  'not_run', 'pending', 'passed', 'failed', 'blocked', 'not_applicable', 'pending_reverification',
];

const EVIDENCE_TYPES: { value: string; label: string }[] = [
  { value: 'product_owner_test', label: 'Product Owner Test' },
  { value: 'automated_test_suite', label: 'Automated Test Suite' },
  { value: 'engineering_completion_report', label: 'Engineering Completion Report' },
  { value: 'build_verification', label: 'Build Verification' },
  { value: 'manual_verification', label: 'Manual Verification' },
  { value: 'regression_test', label: 'Regression Test' },
  { value: 'integration_test', label: 'Integration Test' },
  { value: 'external_evidence', label: 'External Evidence' },
];

const VERIFICATION_ROLES = [
  'Implementation Engineer',
  'Product Owner',
  'Engineering Director',
];

interface Props {
  ewoId: string;
  ewoRef: string;
  // EWO-017R.11B: Bump counter incremented after any verification operation completes.
  // Triggers a canonical reload of the matrix without a page refresh.
  verificationBump?: number;
}

export function ECCVerificationMatrixPanel({ ewoId, ewoRef, verificationBump }: Props) {
  const [classifications, setClassifications] = useState<TestClassification[]>([]);
  const [matrixRows, setMatrixRows] = useState<VerificationMatrixRow[]>([]);
  const [workflows, setWorkflows] = useState<POWorkflow[]>([]);
  const [workflowSteps, setWorkflowSteps] = useState<Record<string, POWorkflowStep[]>>({});
  const [completion, setCompletion] = useState<CompletionReportStatus | null>(null);
  const [confidence, setConfidence] = useState<EngineeringConfidence>('unknown');
  const [confidenceExplanation, setConfidenceExplanation] = useState<ConfidenceExplanation | null>(null);
  const [history, setHistory] = useState<VerificationHistoryEntry[]>([]);
  const [trustScore, setTrustScore] = useState<TrustScoreRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showEvidenceModal, setShowEvidenceModal] = useState<TestClassification | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showConfidenceExplanation, setShowConfidenceExplanation] = useState(false);
  const [showTrustExplanation, setShowTrustExplanation] = useState(false);
  const [evidenceForm, setEvidenceForm] = useState<EvidenceRecord>({
    status: 'passed',
    verifiedBy: '',
    verificationRole: 'Implementation Engineer',
    verificationMethod: '',
    evidenceRef: '',
    evidenceType: 'manual_verification',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [cls, matrix, wfs, comp, hist, trust] = await Promise.all([
      getTestClassifications(),
      getVerificationMatrix(ewoId),
      getPOWorkflows(ewoId),
      getCompletionReportStatus(ewoId),
      getVerificationHistory(ewoId),
      getTrustScore(ewoId),
    ]);
    setClassifications(cls);
    setMatrixRows(matrix);
    setWorkflows(wfs);
    setCompletion(comp);
    setHistory(hist);
    setTrustScore(trust);
    const expl = explainEngineeringConfidence(matrix, wfs, cls);
    setConfidenceExplanation(expl);
    setConfidence(expl.confidence);

    const stepsMap: Record<string, POWorkflowStep[]> = {};
    await Promise.all(wfs.map(async wf => {
      stepsMap[wf.id] = await getWorkflowSteps(wf.id);
    }));
    setWorkflowSteps(stepsMap);
    setLoading(false);
  }, [ewoId]);

  // EWO-017R.11B: Reload matrix when the canonical verification bump changes.
  // This ensures the matrix reflects persisted state immediately after batch
  // verification without requiring a browser refresh.
  useEffect(() => { load(); }, [load, verificationBump]);

  async function handleStatusChange(testType: typeof matrixRows[number]['test_type'], newStatus: VerificationStatus) {
    setSaving(testType);
    await upsertVerificationMatrixRow(ewoId, testType, newStatus, 'Product Owner');
    await recalculateAndStoreConfidence(ewoId);
    await load();
    setSaving(null);
  }

  async function handleWorkflowStatusChange(workflowId: string, newStatus: WorkflowStatus) {
    setSaving(`wf-${workflowId}`);
    await updateWorkflowStatus(workflowId, newStatus);
    await recalculateAndStoreConfidence(ewoId);
    await load();
    setSaving(null);
  }

  async function handleCompletionChange(dim: keyof CompletionReportStatus, value: string) {
    if (!completion) return;
    const updated = { ...completion, [dim]: value } as CompletionReportStatus;
    setCompletion(updated);
    await updateCompletionReportStatus(ewoId, { [dim]: value } as Partial<CompletionReportStatus>);
  }

  function openEvidenceModal(cls: TestClassification) {
    const existing = matrixRows.find(r => r.test_type === cls.code);
    setEvidenceForm({
      status: existing?.status ?? 'passed',
      verifiedBy: existing?.verified_by ?? '',
      verificationRole: (existing?.verification_role as EvidenceRecord['verificationRole']) ?? (cls.default_role as EvidenceRecord['verificationRole']) ?? 'Implementation Engineer',
      verificationMethod: existing?.verification_method ?? '',
      evidenceRef: existing?.evidence_ref ?? '',
      evidenceType: (existing?.evidence_type as EvidenceRecord['evidenceType']) ?? 'manual_verification',
      notes: existing?.notes ?? '',
    });
    setShowEvidenceModal(cls);
  }

  async function handleSaveEvidence() {
    if (!showEvidenceModal) return;
    setSaving(showEvidenceModal.code);
    await recordVerificationEvidence(ewoId, showEvidenceModal.code, evidenceForm, ewoRef);
    await recalculateAndStoreConfidence(ewoId);
    await load();
    setShowEvidenceModal(null);
    setSaving(null);
  }

  async function handleRecalculateTrust() {
    setSaving('trust');
    // Gather trust inputs from current state.
    const poAcceptance = matrixRows.find(r => r.test_type === 'po_acceptance');
    const poStatus = poAcceptance?.status === 'passed' ? 'passed' : 'pending';
    const failedRegs = matrixRows.filter(r => r.test_type === 'regression' && r.status === 'failed').length;
    const changesSince = matrixRows.filter(r => r.requires_reverification).length;
    const verifiedAt = matrixRows.find(r => r.verified_at)?.verified_at;
    const ageDays = verifiedAt
      ? Math.floor((Date.now() - new Date(verifiedAt).getTime()) / 86400000)
      : 0;
    await calculateAndStoreTrustScore(ewoId, {
      verificationAgeDays: ageDays,
      reopeningsCount: history.filter(h => h.previous_status === 'passed' && h.new_status === 'pending_reverification').length,
      outstandingDefects: matrixRows.filter(r => r.status === 'failed').length,
      failedRegressions: failedRegs,
      outstandingTechDebt: 0,
      changesSinceVerification: changesSince,
      poAcceptanceStatus: poStatus,
      releaseCount: 1,
    });
    await load();
    setSaving(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    );
  }

  const hasFailedWorkflow = workflows.some(w => w.status === 'failed');
  const hasReverification = matrixRows.some(r => r.requires_reverification);

  return (
    <div className="space-y-6">
      <div id="section-verification-matrix" className="scroll-mt-32" />

      {/* Header with confidence + trust */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-800">Engineering Verification Matrix</h3>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowConfidenceExplanation(s => !s)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            <span>Confidence:</span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${CONFIDENCE_META[confidence].bg} ${CONFIDENCE_META[confidence].color}`}>
              {CONFIDENCE_META[confidence].label}
            </span>
            <Info className="w-3 h-3" />
          </button>
          {trustScore && (
            <button
              onClick={() => setShowTrustExplanation(s => !s)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              <span>Trust:</span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${TRUST_META[trustScore.trust_level]?.bg ?? 'bg-slate-100'} ${TRUST_META[trustScore.trust_level]?.color ?? 'text-slate-600'}`}>
                {TRUST_META[trustScore.trust_level]?.label ?? trustScore.trust_level} ({trustScore.trust_score})
              </span>
              <Info className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Failed workflow warning */}
      {hasFailedWorkflow && (
        <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-800">Product Owner Workflow Failed</p>
            <p className="text-xs text-red-700 mt-0.5">
              A Primary Product Owner Workflow has failed. The Engineering Completion Report cannot claim full verification until this is resolved.
            </p>
          </div>
        </div>
      )}

      {/* Reverification warning */}
      {hasReverification && (
        <div className="flex items-start gap-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <RefreshCw className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-800">Verification Requires Revalidation</p>
            <p className="text-xs text-amber-700 mt-0.5">
              This verification requires revalidation because engineering changed after the previous verification.
            </p>
          </div>
        </div>
      )}

      {/* Confidence Explanation */}
      {showConfidenceExplanation && confidenceExplanation && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <p className="text-sm font-bold text-blue-900">Engineering Confidence Explanation — {confidenceExplanation.percentage}%</p>
          </div>
          <div className="space-y-1">
            {confidenceExplanation.contributors.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {c.passed
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  : c.status === 'not_applicable'
                    ? <Ban className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                <span className={c.passed ? 'text-slate-700' : 'text-slate-500'}>
                  {c.label}
                </span>
                <span className={`ml-auto text-[11px] font-medium ${
                  c.passed ? 'text-emerald-600' :
                  c.status === 'not_applicable' ? 'text-slate-400' :
                  c.status === 'pending_reverification' ? 'text-amber-600' :
                  'text-red-500'
                }`}>
                  {c.status === 'not_applicable' ? 'N/A' :
                   c.passed ? 'Passed' :
                   c.status === 'pending_reverification' ? 'Pending Reverification' :
                   c.status === 'not_run' ? 'Pending' :
                   c.status === 'failed' ? 'Failed' :
                   c.status === 'blocked' ? 'Blocked' : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trust Score Explanation */}
      {showTrustExplanation && trustScore && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-slate-700" />
            <p className="text-sm font-bold text-slate-900">
              Engineering Trust Score — {TRUST_META[trustScore.trust_level]?.label ?? trustScore.trust_level} ({trustScore.trust_score}/100)
            </p>
          </div>
          <div className="space-y-1">
            {(trustScore.explanation as { contributor: string; value: string; impact: string }[]).map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-slate-600 w-48 truncate">{e.contributor}</span>
                <span className="text-slate-400">{e.value}</span>
                <span className={`ml-auto font-medium ${e.impact.startsWith('-') ? 'text-red-500' : 'text-emerald-600'}`}>
                  {e.impact}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={handleRecalculateTrust}
            disabled={saving === 'trust'}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 mt-1"
          >
            {saving === 'trust' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Recalculate Trust Score
          </button>
        </div>
      )}

      {/* Verification Matrix Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Test Type</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Evidence</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Change</th>
            </tr>
          </thead>
          <tbody>
            {classifications.map(cls => {
              const row = matrixRows.find(r => r.test_type === cls.code);
              const status = row?.status ?? 'not_run';
              const meta = STATUS_META[status] ?? STATUS_META.not_run;
              const StatusIcon = meta.icon;
              const depCheck = checkVerificationDependencies(cls.code, matrixRows, classifications);
              return (
                <tr key={cls.code} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <ListChecks className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-slate-700">{cls.label}</p>
                        <p className="text-[11px] text-slate-400">{cls.description}</p>
                        {depCheck.blockedBy.length > 0 && (
                          <p className="text-[11px] text-orange-600 mt-0.5">
                            <Lock className="w-2.5 h-2.5 inline mr-1" />
                            Requires: {depCheck.blockedBy.map(b => b.testType).join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-slate-500">
                      {row?.verification_role ?? cls.default_role ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.bg} ${meta.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {meta.label}
                      </span>
                      {saving === cls.code && <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {row?.evidence_ref ? (
                      <span className="text-[11px] text-blue-600 underline cursor-pointer" title={row.evidence_type ?? ''}>
                        {row.evidence_ref}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openEvidenceModal(cls)}
                        className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Record Evidence
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Primary PO Workflows */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Workflow className="w-4 h-4 text-blue-600" />
          <h4 className="text-sm font-bold text-slate-800">Primary Product Owner Workflows</h4>
        </div>
        {workflows.length === 0 ? (
          <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
            <p className="text-xs text-slate-500">No Primary Product Owner Workflows have been defined for this EWO.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {workflows.map(wf => {
              const steps = workflowSteps[wf.id] ?? [];
              return (
                <div key={wf.id} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{wf.name}</p>
                      {wf.description && <p className="text-xs text-slate-500 mt-0.5">{wf.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        wf.status === 'passed' ? 'bg-emerald-100 text-emerald-700' :
                        wf.status === 'failed' ? 'bg-red-100 text-red-700' :
                        wf.status === 'executed' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {wf.status.charAt(0).toUpperCase() + wf.status.slice(1)}
                      </span>
                      <select
                        value={wf.status}
                        onChange={e => handleWorkflowStatusChange(wf.id, e.target.value as WorkflowStatus)}
                        disabled={saving === `wf-${wf.id}`}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="defined">Defined</option>
                        <option value="executed">Executed</option>
                        <option value="passed">Passed</option>
                        <option value="failed">Failed</option>
                      </select>
                    </div>
                  </div>
                  {steps.length > 0 && (
                    <ol className="px-4 py-3 space-y-2">
                      {steps.map((step, idx) => (
                        <li key={step.id} className="flex items-start gap-2.5">
                          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-700">{step.step_label}</p>
                            {step.step_description && <p className="text-xs text-slate-500 mt-0.5">{step.step_description}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completion Report Status */}
      {completion && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <h4 className="text-sm font-bold text-slate-800">Completion Report Status</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {(Object.keys(completion) as (keyof CompletionReportStatus)[]).map(dim => (
              <div key={dim} className="border border-slate-200 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{COMPLETION_LABELS[dim]}</p>
                <select
                  value={completion[dim]}
                  onChange={e => handleCompletionChange(dim, e.target.value)}
                  className={`w-full text-xs font-medium rounded-lg px-2 py-1.5 border-0 ${COMPLETION_STATUS_COLOR[completion[dim]] ?? 'bg-slate-100 text-slate-600'}`}
                >
                  <option value="pending">Pending</option>
                  <option value="partial">Partial</option>
                  <option value="complete">Complete</option>
                  <option value="failed">Failed</option>
                  <option value="not_applicable">Not Applicable</option>
                </select>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400">
            Completion Reports must never state "Verified" when Verification is partial or pending, and must never state "Accepted" when Product Owner Acceptance is pending.
          </p>
        </div>
      )}

      {/* Verification History */}
      <div className="space-y-3">
        <button
          onClick={() => setShowHistory(s => !s)}
          className="flex items-center gap-2 text-sm font-bold text-slate-800 hover:text-slate-900"
        >
          <History className="w-4 h-4 text-blue-600" />
          Verification History
          <span className="text-xs font-normal text-slate-400">({history.length} events)</span>
        </button>
        {showHistory && (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            {history.length === 0 ? (
              <p className="text-xs text-slate-400 p-4 text-center">No verification history recorded yet.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">Test Type</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">Previous</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">New</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">Changed By</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">Reason</th>
                    <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 text-xs text-slate-700">{h.test_type}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{h.previous_status}</td>
                      <td className="px-3 py-2 text-xs font-medium text-slate-700">{h.new_status}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{h.changed_by}</td>
                      <td className="px-3 py-2 text-xs text-slate-400 max-w-32 truncate" title={h.reason ?? ''}>{h.reason ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-400">
                        {new Date(h.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400">
        Governed by the Engineering Verification Standard (ES-VER-001) and Constitutional Amendments CONST-001-AMD-006 / CONST-001-AMD-007.
        EWO: {ewoRef}
      </p>

      {/* Evidence Modal */}
      {showEvidenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowEvidenceModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Record Verification Evidence — {showEvidenceModal.label}</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Status</label>
                <select
                  value={evidenceForm.status}
                  onChange={e => setEvidenceForm(f => ({ ...f, status: e.target.value as VerificationStatus }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {STATUS_ORDER.map(s => (
                    <option key={s} value={s}>{STATUS_META[s]?.label ?? s}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Verified By</label>
                  <input
                    type="text"
                    value={evidenceForm.verifiedBy}
                    onChange={e => setEvidenceForm(f => ({ ...f, verifiedBy: e.target.value }))}
                    placeholder="Name"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Verification Role</label>
                  <select
                    value={evidenceForm.verificationRole}
                    onChange={e => setEvidenceForm(f => ({ ...f, verificationRole: e.target.value as EvidenceRecord['verificationRole'] }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {VERIFICATION_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Verification Method</label>
                <input
                  type="text"
                  value={evidenceForm.verificationMethod}
                  onChange={e => setEvidenceForm(f => ({ ...f, verificationMethod: e.target.value }))}
                  placeholder="e.g. Manual execution, Automated suite run"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Evidence Type</label>
                  <select
                    value={evidenceForm.evidenceType}
                    onChange={e => setEvidenceForm(f => ({ ...f, evidenceType: e.target.value as EvidenceRecord['evidenceType'] }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {EVIDENCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Evidence Reference</label>
                  <input
                    type="text"
                    value={evidenceForm.evidenceRef}
                    onChange={e => setEvidenceForm(f => ({ ...f, evidenceRef: e.target.value }))}
                    placeholder="e.g. EWO-014.18R, test-run-001"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Notes</label>
                <textarea
                  value={evidenceForm.notes}
                  onChange={e => setEvidenceForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes"
                  rows={2}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowEvidenceModal(null)}
                className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEvidence}
                disabled={saving === showEvidenceModal.code}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg"
              >
                {saving === showEvidenceModal.code && <Loader2 className="w-3 h-3 animate-spin" />}
                Save Evidence
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
