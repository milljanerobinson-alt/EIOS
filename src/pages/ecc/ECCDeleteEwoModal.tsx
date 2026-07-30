// EWO-032R.12 — Governed EWO Delete Confirmation Modal
// Handles: normal deletion, test-artefact bypass, evaluation failure, retry, archive alternative.

import { useEffect, useState, useCallback } from 'react';
import {
  Trash2, X, AlertCircle, Loader2, Archive, CheckCircle2, ShieldAlert, Link2,
  FlaskConical, RotateCcw, Zap,
} from 'lucide-react';
import {
  checkEwoDeleteEligibility,
  deleteEngineeringWorkOrderGoverned,
  type EwoDeleteEligibility,
  type EwoDeleteResult,
  type DependencyCheckResult,
} from '../../lib/ewoDeletionService';

interface EWO {
  id: string;
  ewo_ref: string;
  title: string;
  status: string;
  is_test_artifact?: boolean;
  test_artifact_marked_at?: string | null;
  test_artifact_marked_by?: string | null;
  test_artifact_reason?: string | null;
}

export function EwoDeleteModal({
  ewo,
  onClose,
  onDeleted,
  onArchive,
}: {
  ewo: EWO;
  onClose: () => void;
  onDeleted: (result: EwoDeleteResult) => void;
  onArchive: (ewo: EWO) => void;
}) {
  const [eligibility, setEligibility] = useState<EwoDeleteEligibility | null>(null);
  const [checking, setChecking] = useState(true);
  const [reason, setReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const elig = await checkEwoDeleteEligibility(ewo.id);
      setEligibility(elig);
    } catch (e) {
      setEligibility({
        eligible: false,
        evaluationSucceeded: false,
        isTestArtifact: false,
        bypassApplied: false,
        bypassReason: null,
        bypassedBlockingReasons: [],
        blockingReasons: [],
        evaluationErrors: [{
          dependency: 'unknown',
          message: e instanceof Error ? e.message : 'Unknown error during eligibility check.',
          recoverable: true,
        }],
        linkedIdeaIds: [],
        linkedIdeaRefs: [],
        dependencySummary: {},
      });
    } finally {
      setChecking(false);
    }
  }, [ewo.id]);

  useEffect(() => { runCheck(); }, [runCheck]);

  const blocked = eligibility && eligibility.evaluationSucceeded && !eligibility.eligible && !eligibility.bypassApplied;
  const evalFailed = eligibility && !eligibility.evaluationSucceeded;
  const testBypass = eligibility && eligibility.bypassApplied;
  const canSubmit = !checking && !blocked && !evalFailed && reason.trim().length > 0 && !deleting;

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteEngineeringWorkOrderGoverned(ewo.id, {
        reason: reason.trim(),
        requestedBy: 'ATD Operator',
      });
      if (result.success) {
        onDeleted(result);
      } else {
        setError(result.error ?? 'Deletion failed.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deletion failed.');
    } finally {
      setDeleting(false);
    }
  }

  function handleArchive() {
    onClose();
    onArchive(ewo);
  }

  // Determine heading
  let heading = 'Delete Engineering Work Order?';
  let headingColor = 'text-red-900';
  let headingBg = 'bg-red-50';
  let iconBg = 'bg-red-100';
  let Icon = Trash2;

  if (testBypass) {
    heading = 'Permanently Delete Test EWO';
    headingColor = 'text-amber-900';
    headingBg = 'bg-amber-50';
    iconBg = 'bg-amber-100';
    Icon = FlaskConical;
  } else if (evalFailed) {
    heading = 'Deletion Eligibility Could Not Be Evaluated';
    headingColor = 'text-slate-900';
    headingBg = 'bg-slate-100';
    iconBg = 'bg-slate-200';
    Icon = AlertCircle;
  } else if (blocked) {
    heading = 'Deletion Blocked — Governed Relationships Exist';
    headingColor = 'text-amber-900';
    headingBg = 'bg-amber-50';
    iconBg = 'bg-amber-100';
    Icon = ShieldAlert;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={`flex items-center gap-3 px-5 py-4 border-b border-slate-200 ${headingBg} shrink-0`}>
          <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center shrink-0`}>
            <Icon className="w-4 h-4 text-slate-700" />
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-bold ${headingColor}`}>{heading}</p>
            <p className="text-[10px] font-mono text-slate-500">{ewo.ewo_ref}</p>
          </div>
          <button onClick={onClose} disabled={deleting} className="ml-auto p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3 overflow-y-auto">
          {/* EWO identity */}
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-sm font-semibold text-slate-800">{ewo.title}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs font-mono text-slate-500">{ewo.ewo_ref}</span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">Status: {ewo.status}</span>
              {ewo.is_test_artifact && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                  <FlaskConical className="w-2.5 h-2.5" /> Test Artefact
                </span>
              )}
            </div>
          </div>

          {/* Test bypass notice */}
          {testBypass && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
              <p className="text-xs font-bold text-amber-800 mb-1 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" /> Test Artefact Bypass Active
              </p>
              <p className="text-[10px] text-amber-700 leading-relaxed">
                This EWO is explicitly marked as a disposable test artefact. Standard governance blockers are being bypassed.
                Detected dependencies will be permanently removed or detached. This action is irreversible.
              </p>
              {ewo.test_artifact_reason && (
                <p className="text-[10px] text-amber-600 mt-1.5">
                  <strong>Classification reason:</strong> {ewo.test_artifact_reason}
                </p>
              )}
              {ewo.test_artifact_marked_by && (
                <p className="text-[10px] text-amber-600">
                  <strong>Marked by:</strong> {ewo.test_artifact_marked_by}
                  {ewo.test_artifact_marked_at && ` on ${new Date(ewo.test_artifact_marked_at).toLocaleString()}`}
                </p>
              )}
            </div>
          )}

          {checking ? (
            <div className="flex items-center gap-2 py-4">
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
              <span className="text-xs text-slate-500">Checking governed dependencies...</span>
            </div>
          ) : (
            <>
              {/* Dependency summary */}
              {eligibility && Object.keys(eligibility.dependencySummary).length > 0 && (
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-slate-600 mb-2">Dependency Summary</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {Object.entries(eligibility.dependencySummary).map(([key, dep]: [string, DependencyCheckResult]) => (
                      <DepRow key={key} label={key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())} dep={dep} />
                    ))}
                  </div>
                </div>
              )}

              {/* Linked Ideas */}
              {eligibility && eligibility.linkedIdeaRefs.length > 0 && (
                <div className="bg-violet-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-violet-700 mb-1.5 flex items-center gap-1.5">
                    <Link2 className="w-3 h-3" /> Linked Engineering Ideas ({eligibility.linkedIdeaRefs.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {eligibility.linkedIdeaRefs.map(ref => (
                      <span key={ref} className="text-xs font-mono bg-white text-violet-600 px-2 py-0.5 rounded border border-violet-100">{ref}</span>
                    ))}
                  </div>
                  {!blocked && !evalFailed && (
                    <p className="text-[10px] text-violet-600 mt-1.5">
                      These Ideas will be unlinked (EWO ref removed). The Ideas themselves will not be deleted.
                    </p>
                  )}
                </div>
              )}

              {/* Bypassed blockers */}
              {testBypass && eligibility!.bypassedBlockingReasons.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="text-xs font-semibold text-amber-800 mb-1.5">Blockers Being Bypassed</p>
                  <div className="space-y-1">
                    {eligibility!.bypassedBlockingReasons.map((r, i) => (
                      <p key={i} className="text-[10px] text-amber-700 leading-relaxed">· {r}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Evaluation failure */}
              {evalFailed && (
                <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5">
                  <p className="text-xs font-semibold text-slate-700 mb-1.5">Failed Dependency Inspections</p>
                  <div className="space-y-1">
                    {eligibility!.evaluationErrors.map((err, i) => (
                      <div key={i} className="text-[10px] text-slate-600">
                        <span className="font-mono font-semibold text-slate-700">{err.dependency}</span>: {err.message}
                        {err.code && <span className="text-slate-400 ml-1">({err.code})</span>}
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-2">
                    An inspection failure is not evidence that a relationship exists. Fix the failing checks and retry.
                  </p>
                  <button
                    onClick={runCheck}
                    disabled={deleting}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> Retry Eligibility Check
                  </button>
                </div>
              )}

              {/* Blocking reasons (normal) */}
              {blocked && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="text-xs font-semibold text-amber-800 mb-1.5 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5" /> Deletion Blocked — Governed Relationships Exist
                  </p>
                  <div className="space-y-1">
                    {eligibility!.blockingReasons.map((r, i) => (
                      <p key={i} className="text-[10px] text-amber-700 leading-relaxed">· {r}</p>
                    ))}
                  </div>
                  <p className="text-[10px] text-amber-700 mt-2 font-medium">
                    Archive this Work Order instead to preserve engineering history and audit records.
                  </p>
                </div>
              )}

              {/* Eligible (no bypass) */}
              {!blocked && !evalFailed && !testBypass && eligibility && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <p className="text-xs text-red-700 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    No governed dependencies found. This action is <strong>irreversible</strong>.
                  </p>
                </div>
              )}

              {/* Reason input (eligible or test bypass) */}
              {!blocked && !evalFailed && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reason for deletion <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={2}
                    placeholder={testBypass ? 'e.g. Disposable test EWO, no longer needed for QA.' : 'e.g. Test work order created in error, disposable EWO, duplicate.'}
                    className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-red-400 resize-none"
                    disabled={deleting}
                  />
                </div>
              )}

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
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
          <button onClick={onClose} disabled={deleting} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-50">
            Cancel
          </button>
          {(blocked || evalFailed) && (
            <button
              onClick={handleArchive}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Archive className="w-3.5 h-3.5" /> Archive Work Order
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-50 bg-red-600 hover:bg-red-700"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : testBypass ? <FlaskConical className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
            {testBypass ? 'Permanently Delete Test EWO' : blocked || evalFailed ? 'Deletion Blocked' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DepRow({ label, dep }: { label: string; dep: DependencyCheckResult }) {
  let display: string;
  let color: string;

  if (dep.status === 'error') {
    display = 'Could not inspect';
    color = 'text-slate-400';
  } else if (dep.count === null) {
    display = '—';
    color = 'text-slate-400';
  } else {
    display = String(dep.count);
    color = dep.count > 0 ? 'text-amber-600' : 'text-slate-400';
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className={`text-[10px] font-mono font-semibold ${color}`}>{display}</span>
    </div>
  );
}

// ─── Success Toast ─────────────────────────────────────────────────────────────

export function EwoDeleteSuccessToast({ ewoRef, onDismiss }: { ewoRef: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-xs font-medium rounded-xl shadow-2xl">
      <CheckCircle2 className="w-3.5 h-3.5" />
      Work Order <span className="font-mono font-bold">{ewoRef}</span> deleted successfully.
      <button onClick={onDismiss} className="ml-2 opacity-70 hover:opacity-100">dismiss</button>
    </div>
  );
}

// ─── Mark as Test Modal ───────────────────────────────────────────────────────

export function MarkAsTestModal({
  ewo,
  onClose,
  onMarked,
}: {
  ewo: EWO;
  onClose: () => void;
  onMarked: () => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const { markEngineeringWorkOrderAsTest } = await import('../../lib/ewoDeletionService');
      const result = await markEngineeringWorkOrderAsTest(ewo.id, {
        reason: reason.trim(),
        requestedBy: 'ATD Operator',
      });
      if (result.success) {
        onMarked();
      } else {
        setError(result.error ?? 'Failed to mark as test artefact.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark as test artefact.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 bg-amber-50">
          <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
            <FlaskConical className="w-4 h-4 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-900">Mark as Test Artefact</p>
            <p className="text-[10px] font-mono text-amber-600">{ewo.ewo_ref}</p>
          </div>
          <button onClick={onClose} disabled={submitting} className="ml-auto p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-sm font-semibold text-slate-800">{ewo.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">Status: {ewo.status}</p>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="text-[10px] text-amber-700 leading-relaxed">
              Test classification allows deletion governance blockers to be bypassed. This feature is for
              <strong> disposable development and QA artefacts only</strong>. The classification is persisted
              and auditable. A title containing "Test" does not automatically activate the bypass — explicit
              confirmation is required.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason for test classification <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Disposable EWO created for QA testing the deletion workflow."
              className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400 resize-none"
              disabled={submitting}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <p className="text-[10px] text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button onClick={onClose} disabled={submitting} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={reason.trim().length === 0 || submitting}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
            Mark as Test Artefact
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Remove Test Classification Modal ──────────────────────────────────────────

export function RemoveTestClassificationModal({
  ewo,
  onClose,
  onRemoved,
}: {
  ewo: EWO;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const { removeEngineeringWorkOrderTestClassification } = await import('../../lib/ewoDeletionService');
      const result = await removeEngineeringWorkOrderTestClassification(ewo.id, {
        reason: reason.trim(),
        requestedBy: 'ATD Operator',
      });
      if (result.success) {
        onRemoved();
      } else {
        setError(result.error ?? 'Failed to remove test classification.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove test classification.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 bg-slate-100">
          <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center shrink-0">
            <RotateCcw className="w-4 h-4 text-slate-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">Remove Test Classification</p>
            <p className="text-[10px] font-mono text-slate-500">{ewo.ewo_ref}</p>
          </div>
          <button onClick={onClose} disabled={submitting} className="ml-auto p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-sm font-semibold text-slate-800">{ewo.title}</p>
            {ewo.test_artifact_reason && (
              <p className="text-[10px] text-slate-500 mt-1">
                <strong>Previous classification reason:</strong> {ewo.test_artifact_reason}
              </p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] text-slate-600 leading-relaxed">
              Removing test classification will immediately restore normal deletion eligibility rules.
              The EWO will no longer be able to bypass governance blockers for deletion.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason for removing classification <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. EWO is no longer a test artefact, restoring normal governance."
              className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-slate-400 resize-none"
              disabled={submitting}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <p className="text-[10px] text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button onClick={onClose} disabled={submitting} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={reason.trim().length === 0 || submitting}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-700 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            Remove Test Classification
          </button>
        </div>
      </div>
    </div>
  );
}
