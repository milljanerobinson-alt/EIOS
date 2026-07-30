import { useState, useEffect } from 'react';
import {
  ChevronLeft, Loader2, CheckCircle2, XCircle, Eye, AlertTriangle, X,
  FileText, Database, History, ShieldCheck, Edit3, Package as PackageIcon,
  AlertCircle, Info, Trash2, RotateCcw, Ban, RefreshCw, Search,
} from 'lucide-react';
import {
  type RecoveryPackage,
  type RecoveryEvidence,
  type RecoveryAuditEvent,
  type EngineeringConfidence,
  type ObjectClassification,
  type EwoSearchResult,
  type ReclassificationHistoryEntry,
  getRecoveryPackage,
  getRecoveryPackageByRef,
  getRecoveryEvidence,
  getRecoveryAuditTrail,
  getReclassificationHistory,
  approveRecovery,
  rejectRecovery,
  editRecovery,
  requestMoreEvidence,
  importRecoveryToLedger,
  reclassifyObject,
  deleteRecoveryPackage,
  restoreRecoveryPackage,
  permanentlyDismissCandidate,
  searchEngineeringWorkOrders,
  validateEwoReference,
  CONFIDENCE_LABELS,
  PO_STATUS_LABELS,
  RECOVERY_STATUS_LABELS,
  CLASSIFICATION_LABELS,
} from '../../lib/historicalRecoveryService';
import { generateApprovalNote as generateGovernedApprovalNote } from '../../lib/approvalNoteGenerator';
import { getImportCapability, isImportSupported, IMPORT_CAPABILITY_MATRIX, classifyRecoveryBucket, RECOVERY_SUMMARY_BUCKETS, type ImportCapability, type RecoverySummaryBucket } from '../../lib/recoveryImportCapability';
import { classifyRecoveryOutcome, RECOVERY_OUTCOME_LABELS, type RecoveryOutcome } from '../../lib/historicalRecoveryService';

type ActionMode = 'approve' | 'reject' | 'edit' | 'request_evidence' | 'reclassify' | 'delete' | 'restore' | 'dismiss' | null;

// EWO-014.19A.5: Safe classification lookup — prevents render crashes if the
// database returns a classification value not present in CLASSIFICATION_LABELS.
// Direct indexing (CLASSIFICATION_LABELS[cls].label) throws when cls is
// undefined/unknown, which would blank the entire workspace page.
function classLabel(cls: ObjectClassification | string | null | undefined): string {
  if (!cls) return 'Unclassified';
  return CLASSIFICATION_LABELS[cls as ObjectClassification]?.label ?? 'Unclassified';
}
function classColour(cls: ObjectClassification | string | null | undefined): string {
  if (!cls) return 'text-slate-600 bg-slate-50 border-slate-200';
  return CLASSIFICATION_LABELS[cls as ObjectClassification]?.colour ?? 'text-slate-600 bg-slate-50 border-slate-200';
}

export function ECCRecoveryWorkspacePage({
  packageId,
  onBack,
}: {
  packageId: string;
  onBack: () => void;
}) {
  const [pkg, setPkg] = useState<RecoveryPackage | null>(null);
  const [evidence, setEvidence] = useState<RecoveryEvidence[]>([]);
  const [audit, setAudit] = useState<RecoveryAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [defaultGeneratedNote, setDefaultGeneratedNote] = useState('');
  const [editFields, setEditFields] = useState<Partial<RecoveryPackage>>({});
  const [reclassifyFields, setReclassifyFields] = useState<{ classification: ObjectClassification; canonicalRef: string }>({ classification: 'UNKNOWN', canonicalRef: '' });
  const [ewoSearchQuery, setEwoSearchQuery] = useState('');
  const [ewoSearchResults, setEwoSearchResults] = useState<EwoSearchResult[]>([]);
  const [ewoSearching, setEwoSearching] = useState(false);
  const [ewoResolved, setEwoResolved] = useState<EwoSearchResult | null>(null);
  const [ewoValidationError, setEwoValidationError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; ewoRef?: string; error?: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [view, setView] = useState<'package' | 'ledger-preview' | 'audit'>('package');
  const [reclassHistoryOpen, setReclassHistoryOpen] = useState(false);
  const [reclassHistoryLoading, setReclassHistoryLoading] = useState(false);
  const [reclassHistoryEntries, setReclassHistoryEntries] = useState<ReclassificationHistoryEntry[]>([]);

  async function openReclassHistory() {
    if (!pkg) return;
    setReclassHistoryOpen(true);
    setReclassHistoryLoading(true);
    setReclassHistoryEntries([]);
    const entries = await getReclassificationHistory(pkg.id);
    setReclassHistoryEntries(entries);
    setReclassHistoryLoading(false);
  }

  // packageId may be a UUID (direct lookup) or a recovery_ref (REC-001).
  // Recovery_ref is the URL-safe identifier — the routing layer uppercases
  // the objectRef segment, which would corrupt a UUID. Resolve both forms.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(packageId);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const pkg = isUuid
        ? await getRecoveryPackage(packageId)
        : await getRecoveryPackageByRef(packageId);
      if (!pkg) {
        setPkg(null);
        setLoading(false);
        return;
      }
      const [ev, au] = await Promise.all([
        getRecoveryEvidence(pkg.id),
        getRecoveryAuditTrail(pkg.id),
      ]);
      setPkg(pkg);
      setEvidence(ev);
      setAudit(au);
      if (pkg) {
        setEditFields({
          title: pkg.title,
          executive_summary: pkg.executive_summary || '',
          engineering_objective: pkg.engineering_objective || '',
          known_deliverables: pkg.known_deliverables || '',
          known_verification_evidence: pkg.known_verification_evidence || '',
          known_po_decisions: pkg.known_po_decisions || '',
          recovery_notes: pkg.recovery_notes || '',
          engineering_confidence: pkg.engineering_confidence,
          confidence_explanation: pkg.confidence_explanation || '',
        });
        setReclassifyFields({ classification: pkg.object_classification, canonicalRef: pkg.canonical_reference });
      }
      setLoading(false);
    }
    load();
  }, [packageId, isUuid]);

  async function reload() {
    if (!pkg) return;
    const [p, ev, au] = await Promise.all([
      getRecoveryPackage(pkg.id),
      getRecoveryEvidence(pkg.id),
      getRecoveryAuditTrail(pkg.id),
    ]);
    setPkg(p);
    setEvidence(ev);
    setAudit(au);
  }

  async function handleAction() {
    if (!pkg || !actionMode) return;
    setActing(true);
    setActionError(null);
    const actor = 'Product Owner';

    try {
      if (actionMode === 'approve') {
        await approveRecovery(pkg.id, actor, actionNotes, actionMode === 'approve' ? defaultGeneratedNote : undefined);
      } else if (actionMode === 'reject') {
        await rejectRecovery(pkg.id, actor, actionNotes);
      } else if (actionMode === 'request_evidence') {
        await requestMoreEvidence(pkg.id, actor, actionNotes);
      } else if (actionMode === 'edit') {
        await editRecovery(pkg.id, actor, {
          title: editFields.title,
          executive_summary: editFields.executive_summary,
          engineering_objective: editFields.engineering_objective,
          known_deliverables: editFields.known_deliverables,
          known_verification_evidence: editFields.known_verification_evidence,
          known_po_decisions: editFields.known_po_decisions,
          recovery_notes: editFields.recovery_notes,
          engineering_confidence: editFields.engineering_confidence as EngineeringConfidence,
          confidence_explanation: editFields.confidence_explanation,
        }, actionNotes);
      } else if (actionMode === 'reclassify') {
        const result = await reclassifyObject(pkg.id, actor, reclassifyFields.classification, reclassifyFields.canonicalRef || null, actionNotes);
        if (!result.success) { setActionError(result.error || 'Reclassification failed'); setActing(false); return; }
      } else if (actionMode === 'delete') {
        const result = await deleteRecoveryPackage(pkg.id, actor, actionNotes);
        if (!result.success) { setActionError(result.error || 'Deletion failed'); setActing(false); return; }
      } else if (actionMode === 'restore') {
        const result = await restoreRecoveryPackage(pkg.id, actor, actionNotes);
        if (!result.success) { setActionError(result.error || 'Restore failed'); setActing(false); return; }
      } else if (actionMode === 'dismiss') {
        const result = await permanentlyDismissCandidate(pkg.id, actor, actionNotes);
        if (!result.success) { setActionError(result.error || 'Dismissal failed'); setActing(false); return; }
      }
    } catch (err: unknown) {
      // EWO-014.19A.5 Req 6 — Governed error handling for database failures.
      // Without this catch, an unexpected DB error would propagate as an
      // unhandled promise rejection, blanking the workspace page.
      const message = err instanceof Error ? err.message : 'An unexpected error occurred while performing this action.';
      setActionError(message);
      setActing(false);
      return;
    } finally {
      setActing(false);
    }

    setActionMode(null);
    setActionNotes('');
    setDefaultGeneratedNote('');
    await reload();
  }

  async function handleImport() {
    if (!pkg) return;
    setActing(true);
    setImportResult(null);
    setActionError(null);
    const result = await importRecoveryToLedger(pkg.id, 'Product Owner');
    setImportResult(result);
    setActing(false);
    if (result.success) await reload();
    else setActionError(result.error || 'Import failed');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8">
        <div className="max-w-md w-full bg-white rounded-xl border border-amber-200 shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recovery Package Not Found</h2>
              <p className="text-xs text-slate-500">Engineering Recovery Workspace · EWO-014.19A</p>
            </div>
          </div>
          <div className="space-y-2 text-xs text-slate-600">
            <div className="flex items-start gap-2">
              <span className="font-mono text-slate-400 shrink-0 w-20">Reference</span>
              <span className="font-mono font-semibold text-slate-800">{packageId || '(none)'}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono text-slate-400 shrink-0 w-20">Stage</span>
              <span>Recovery Package Resolution</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono text-slate-400 shrink-0 w-20">Cause</span>
              <span>No recovery package matched the provided reference. The package may have been permanently dismissed, deleted, or the reference may be malformed.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-mono text-slate-400 shrink-0 w-20">Action</span>
              <span>Return to the Recovery Dashboard and select a different package, or run Historical Discovery to generate new recovery candidates.</span>
            </div>
          </div>
          <button onClick={onBack} className="mt-5 w-full flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back to Recovery Dashboard
          </button>
        </div>
      </div>
    );
  }

  const isImported = !!(pkg.imported_at && pkg.imported_ewo_id);
  const isDeleted = pkg.is_deleted;
  const isDismissed = pkg.is_permanently_dismissed;
  // EWO-014.19A.6: Import capability is decoupled from classification correctness.
  // canImport is true when the package is approved, not yet imported, AND the
  // classification's import pipeline is supported (not just EWO).
  const importCapability = getImportCapability(pkg.object_classification);
  const canImport = pkg.po_status === 'approved' && !isImported && isImportSupported(pkg.object_classification);

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="px-8 py-5 bg-white border-b border-slate-200">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
          <ChevronLeft className="w-4 h-4" /> Back to Recovery Dashboard
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
              <History className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-slate-400">{pkg.recovery_ref}</span>
                <span className="text-slate-300">·</span>
                <span className="text-sm font-mono font-semibold text-slate-800">{pkg.canonical_reference}</span>
                <SimpleBadge value={classLabel(pkg.object_classification)} colour={classColour(pkg.object_classification)} />
                <SimpleBadge value={pkg.engineering_confidence} colour={CONFIDENCE_LABELS[pkg.engineering_confidence].colour} />
                <SimpleBadge value={RECOVERY_STATUS_LABELS[pkg.recovery_status]?.label || pkg.recovery_status} colour={RECOVERY_STATUS_LABELS[pkg.recovery_status]?.colour || 'text-slate-600 bg-slate-50 border-slate-200'} />
                {isImported && (
                  <SimpleBadge value="Imported" colour="text-blue-700 bg-blue-50 border-blue-200" />
                )}
                {isDeleted && (
                  <SimpleBadge value="Deleted" colour="text-slate-500 bg-slate-100 border-slate-200" />
                )}
                {isDismissed && (
                  <SimpleBadge value="Dismissed" colour="text-red-600 bg-red-50 border-red-200" />
                )}
                {pkg.reclassified_at && (
                  <button
                    onClick={() => openReclassHistory()}
                    className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100 transition-colors"
                    title="View Reclassification History"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reclassified
                  </button>
                )}
              </div>
              <h1 className="text-lg font-bold text-slate-900 mt-0.5">{pkg.title}</h1>
            </div>
          </div>
        </div>

        {/* View tabs */}
        <div className="flex items-center gap-1 mt-4">
          {([
            { key: 'package', label: 'Recovery Package', icon: PackageIcon },
            { key: 'ledger-preview', label: 'Ledger Preview', icon: FileText },
            { key: 'audit', label: 'Audit Trail', icon: History },
          ] as const).map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setView(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${view === t.key ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="p-8">
        {/* Confidence explanation banner */}
        <div className="mb-6 p-4 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${CONFIDENCE_LABELS[pkg.engineering_confidence].colour}`}>
              <ShieldCheck className="w-4.5 h-4.5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-slate-800">Engineering Confidence: {pkg.engineering_confidence}</span>
              </div>
              <p className="text-xs text-slate-600">{pkg.confidence_explanation || CONFIDENCE_LABELS[pkg.engineering_confidence].description}</p>
              {pkg.recovery_recommendation && (
                <p className="text-xs text-blue-700 mt-2 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  {pkg.recovery_recommendation}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Recovery Decision Engine (BUG-006R.2) */}
        {view === 'package' && !isImported && !isDeleted && !isDismissed && (() => {
          const decision = classifyRecoveryOutcome(pkg, evidence);
          const outcomeCfg = RECOVERY_OUTCOME_LABELS[decision.outcome];
          const outcomeColourMap: Record<string, string> = {
            green: 'border-emerald-200 bg-emerald-50',
            amber: 'border-amber-200 bg-amber-50',
            red: 'border-red-200 bg-red-50',
            blue: 'border-blue-200 bg-blue-50',
          };
          const iconColourMap: Record<string, string> = {
            green: 'bg-emerald-100 text-emerald-700',
            amber: 'bg-amber-100 text-amber-700',
            red: 'bg-red-100 text-red-700',
            blue: 'bg-blue-100 text-blue-700',
          };
          const OutcomeIcon = decision.outcome === 'recover_automatically' ? CheckCircle2
            : decision.outcome === 'unrecoverable' ? AlertCircle
            : decision.outcome === 'legacy_reference' ? History
            : AlertTriangle;
          return (
            <div className={`mb-6 p-4 rounded-xl border ${outcomeColourMap[outcomeCfg.colour] || 'border-slate-200 bg-white'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconColourMap[outcomeCfg.colour] || 'bg-slate-100 text-slate-600'}`}>
                  <OutcomeIcon className="w-4.5 h-4.5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-800">Recovery Decision: {outcomeCfg.label}</span>
                  </div>
                  <p className="text-xs text-slate-600 mb-3">{outcomeCfg.description}</p>

                  {/* Recovery Explanation */}
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Recovery Rationale</span>
                      <p className="text-slate-700 mt-0.5">{decision.explanation.recovery_rationale}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Recommended Action</span>
                      <p className="text-slate-700 mt-0.5">{decision.explanation.recommended_action}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <div>
                        <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Evidence Searched</span>
                        <ul className="mt-0.5 space-y-0.5">
                          {decision.explanation.evidence_searched.map(s => <li key={s} className="text-slate-600 font-mono text-[10px]">{s}</li>)}
                        </ul>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Evidence Found</span>
                        {decision.explanation.evidence_found.length > 0 ? (
                          <ul className="mt-0.5 space-y-0.5">
                            {decision.explanation.evidence_found.map(s => <li key={s} className="text-slate-600 text-[10px]">{s}</li>)}
                          </ul>
                        ) : (
                          <p className="text-slate-400 italic mt-0.5">No evidence found</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Evidence Missing</span>
                      {decision.explanation.evidence_missing.length > 0 ? (
                        <ul className="mt-0.5 space-y-0.5">
                          {decision.explanation.evidence_missing.map(s => <li key={s} className="text-red-600 text-[10px]">{s}</li>)}
                        </ul>
                      ) : (
                        <p className="text-emerald-600 italic mt-0.5">No gaps detected</p>
                      )}
                    </div>
                    {decision.explanation.po_options.length > 0 && (
                      <div className="pt-2">
                        <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Product Owner Options</span>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {decision.explanation.po_options.map(opt => (
                            <span key={opt} className="text-[10px] px-2 py-1 rounded-full border border-slate-200 bg-white text-slate-700 font-medium">{opt}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Import capability banner for approved non-imported packages (EWO-014.19A.6)
            Replaces the former import-blocked banner.
            Classification correctness and import capability are independent:
            a correctly classified Bug/Incident is not "wrong" — its import
            pipeline is simply not yet supported. We never encourage the PO to
            reclassify a correctly classified object to satisfy an implementation
            limitation. Historical truth always takes precedence. */}
        {pkg.po_status === 'approved' && !isImported && !isImportSupported(pkg.object_classification) && (
          <div className="mb-6 p-4 rounded-xl border border-blue-200 bg-blue-50 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-800">Import Not Yet Supported</p>
              <p className="text-xs text-blue-700 mt-1">
                This recovery package is correctly classified as <strong>{classLabel(pkg.object_classification)}</strong>.
                Import into the {importCapability.ledgerLabel} is <strong>{importCapability.statusLabel.toLowerCase()}</strong>.
                The classification is correct and should not be changed. When the {importCapability.ledgerLabel} import pipeline is implemented, this package will become importable automatically.
              </p>
            </div>
          </div>
        )}

        {/* Import Capability Matrix reference (EWO-014.19A.6 Req 3)
            Shows the PO the full import capability matrix so they understand
            which classifications are import-supported vs not-yet-supported.
            This decouples classification correctness from import capability. */}
        {view === 'package' && !isImported && !isDeleted && !isDismissed && (
          <div className="mb-6 bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-800">Import Capability Matrix</h3>
            </div>
            <p className="text-xs text-slate-500 mb-3">Classification correctness and import capability are evaluated independently. A correctly classified object is never "wrong" — some import pipelines are not yet implemented.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
              {(Object.keys(IMPORT_CAPABILITY_MATRIX) as ObjectClassification[]).map(cls => {
                const cap = IMPORT_CAPABILITY_MATRIX[cls];
                const isCurrent = pkg.object_classification === cls;
                return (
                  <div key={cls} className={`px-3 py-2 rounded-lg border text-xs ${isCurrent ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="font-semibold text-slate-700">{classLabel(cls)}</div>
                    <div className={cap.supported ? 'text-green-700 flex items-center gap-1 mt-0.5' : 'text-blue-700 flex items-center gap-1 mt-0.5'}>
                      {cap.supported ? <CheckCircle2 className="w-3 h-3" /> : <Info className="w-3 h-3" />}
                      {cap.statusLabel}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === 'package' && (
          <div className="space-y-6">
            {/* Historical Evidence */}
            {(pkg.deleted_by || pkg.deletion_reason) && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4 h-4 text-amber-600" />
                  <h3 className="text-sm font-semibold text-amber-900">Historical Evidence</h3>
                </div>
                <div className="space-y-2">
                  {pkg.deleted_by && (
                    <div>
                      <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Deleted by Product Owner</span>
                      <p className="text-sm text-amber-800 mt-0.5">{pkg.deleted_by}</p>
                    </div>
                  )}
                  {pkg.deletion_reason && (
                    <div>
                      <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Reason</span>
                      <p className="text-sm text-amber-800 mt-0.5">{pkg.deletion_reason}</p>
                    </div>
                  )}
                </div>
                <p className="text-xs text-amber-600 mt-3 italic">This evidence was recovered by the Historical Recovery Engine from past engineering records.</p>
              </div>
            )}

            {/* Package fields */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <h3 className="text-sm font-semibold text-slate-800">Recovery Package</h3>
              <Field label="Executive Summary" value={pkg.executive_summary} />
              <Field label="Engineering Objective" value={pkg.engineering_objective} />
              <Field label="Known Deliverables" value={pkg.known_deliverables} />
              <Field label="Known Verification Evidence" value={pkg.known_verification_evidence} />
              <Field label="Known PO Decisions" value={pkg.known_po_decisions} />
              <Field label="Related Artefacts" value={pkg.related_artefacts} />
              <Field label="Historical References" value={pkg.historical_references} />
              <Field label="Evidence Gaps Detected" value={pkg.evidence_missing} warning />
              <Field label="Recovery Notes" value={pkg.recovery_notes} />
              {pkg.reclassified_at && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reclassification History</span>
                  <p className="text-sm text-slate-700 mt-1">
                    Reclassified from <strong>{pkg.previous_classification || 'UNKNOWN'}</strong> to <strong>{pkg.object_classification}</strong>
                    {pkg.reclassified_by && ` by ${pkg.reclassified_by}`}
                    {pkg.reclassification_reason && ` — ${pkg.reclassification_reason}`}
                  </p>
                </div>
              )}
            </div>

            {/* Evidence items */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Database className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-800">Evidence Sources ({evidence.length})</h3>
              </div>
              {evidence.length === 0 ? (
                <p className="text-sm text-slate-400">No evidence items linked.</p>
              ) : (
                <div className="space-y-2">
                  {evidence.map(ev => (
                    <div key={ev.id} className={`p-3 rounded-lg border ${ev.has_conflict ? 'border-red-200 bg-red-50/50' : ev.is_superseded ? 'border-slate-200 bg-slate-50/50 opacity-60' : 'border-slate-200 bg-slate-50/50'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-slate-500">{ev.source_table}</span>
                        <span className="text-slate-300">·</span>
                        <span className="text-xs font-medium text-slate-700">{ev.evidence_type}</span>
                        {ev.source_record_ref && <span className="text-xs font-mono text-slate-400">{ev.source_record_ref}</span>}
                        {ev.is_superseded && <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">superseded</span>}
                        {ev.has_conflict && <span className="text-[10px] text-red-600 bg-red-100 px-1.5 py-0.5 rounded">conflict</span>}
                      </div>
                      {ev.evidence_summary && <p className="text-xs text-slate-600">{ev.evidence_summary}</p>}
                      {ev.conflict_notes && <p className="text-xs text-red-600 mt-1">{ev.conflict_notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* PO Actions */}
            {!isDeleted && !isDismissed && pkg.po_status === 'pending' && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-800 mb-4">Product Owner Actions</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => {
                    setActionMode('approve');
                    setActionError(null);
                    const generated = generateGovernedApprovalNote({
                      type: 'historical_recovery',
                      objectRef: pkg.recovery_ref,
                      objectTitle: pkg.title,
                      engineeringConfidence: pkg.engineering_confidence,
                      evidenceSourceCount: pkg.evidence_sources?.length ?? null,
                      evidenceArtefactCount: evidence.length,
                    });
                    setDefaultGeneratedNote(generated.note);
                    setActionNotes(generated.note);
                  }} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors">
                    <CheckCircle2 className="w-4 h-4" /> Approve
                  </button>
                  <button onClick={() => { setActionMode('reject'); setActionNotes(''); setActionError(null); }} className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors border border-red-200">
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                  <button onClick={() => { setActionMode('edit'); setActionNotes(''); setActionError(null); }} className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-100 transition-colors border border-blue-200">
                    <Edit3 className="w-4 h-4" /> Edit Package
                  </button>
                  <button onClick={() => { setActionMode('request_evidence'); setActionNotes(''); setActionError(null); }} className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 text-amber-700 text-xs font-semibold rounded-lg hover:bg-amber-100 transition-colors border border-amber-200">
                    <AlertTriangle className="w-4 h-4" /> Request More Evidence
                  </button>
                  <button onClick={() => { setActionMode('delete'); setActionNotes(''); setActionError(null); }} className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors border border-red-200">
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              </div>
            )}

            {/* Reclassify action — always available for non-deleted, non-dismissed packages.
                EWO-014.19A.5: Previously gated on po_status==='pending', which hid the
                Reclassify button for approved Bug/Incident packages and left the PO on a
                dead-end page with an "Import Blocked — Use the Reclassify action" banner
                but no button. Reclassification is a classification correction, not a
                review decision, so it must be available in every non-terminal state.
                EWO-014.19A.6: Reclassification is for correcting a MISCLASSIFICATION —
                never for working around an import capability limitation. When the
                classification is correct but import is not yet supported, the PO is
                explicitly told NOT to reclassify. */}
            {!isDeleted && !isDismissed && !isImported && pkg.po_status !== 'pending' && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-800 mb-1">Classification Correction</h3>
                <p className="text-xs text-slate-500 mb-2">Use this only if the Historical Recovery Engine <strong>misclassified</strong> the object. If the classification is correct but import is not yet supported, do not reclassify — the package will become importable automatically when its domain import pipeline is implemented.</p>
                {isImportSupported(pkg.object_classification) === false && (
                  <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4">
                    This object is correctly classified as {classLabel(pkg.object_classification)}. Reclassification is not recommended.
                  </p>
                )}
                {isImportSupported(pkg.object_classification) === true && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                    Review the evidence before reclassifying. An incorrect classification will propagate to the Engineering Ledger.
                  </p>
                )}
                <button onClick={() => { setActionMode('reclassify'); setActionNotes(''); setActionError(null); setEwoSearchQuery(''); setEwoSearchResults([]); setEwoResolved(null); setEwoValidationError(null); setReclassifyFields({ classification: pkg.object_classification, canonicalRef: pkg.canonical_reference }); }} className="flex items-center gap-1.5 px-4 py-2 bg-purple-50 text-purple-700 text-xs font-semibold rounded-lg hover:bg-purple-100 transition-colors border border-purple-200">
                  <RefreshCw className="w-4 h-4" /> Reclassify
                </button>
              </div>
            )}

            {/* Import action */}
            {canImport && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-green-800 mb-1">Approved — Ready for Ledger Import</h3>
                    <p className="text-xs text-green-700">This recovery package has been approved and is classified as {classLabel(pkg.object_classification)}. Import into the {importCapability.ledgerLabel} is {importCapability.statusLabel.toLowerCase()}.</p>
                  </div>
                  <button
                    onClick={handleImport}
                    disabled={acting}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors shrink-0"
                  >
                    {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageIcon className="w-4 h-4" />}
                    Import to Ledger
                  </button>
                </div>
              </div>
            )}

            {/* Deleted/dismissed actions */}
            {isDeleted && !isDismissed && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-slate-700 mb-4">Deleted Package Actions</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setActionMode('restore'); setActionNotes(''); setActionError(null); }} className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-100 transition-colors border border-blue-200">
                    <RotateCcw className="w-4 h-4" /> Restore Recovery Package
                  </button>
                  <button onClick={() => { setActionMode('dismiss'); setActionNotes(''); setActionError(null); }} className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors border border-red-200">
                    <Ban className="w-4 h-4" /> Permanently Dismiss Candidate
                  </button>
                </div>
              </div>
            )}

            {isImported && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-2 text-sm text-blue-800">
                <CheckCircle2 className="w-4 h-4" />
                <span>Imported to Engineering Ledger on {new Date(pkg.imported_at!).toLocaleString('en-AU')}</span>
                <span className="text-xs text-slate-400 ml-2">Deletion unavailable — this recovery package has already been imported.</span>
              </div>
            )}

            {actionError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {actionError}
              </div>
            )}

            {importResult && (
              <div className={`p-3 rounded-lg text-sm ${importResult.success ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                {importResult.success ? `Successfully created EWO ${importResult.ewoRef}` : `Import failed: ${importResult.error}`}
              </div>
            )}
          </div>
        )}

        {view === 'ledger-preview' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-800">Engineering Ledger Preview</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">This is exactly how the recovered EWO will appear in the Engineering Ledger after import. No import occurs until Product Owner approval.</p>

            {pkg.object_classification !== 'ENGINEERING_WORK_ORDER' && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  This package is correctly classified as {classLabel(pkg.object_classification)}. The Engineering Work Order ledger preview below is illustrative only.
                  Import into the {importCapability.ledgerLabel} is {importCapability.statusLabel.toLowerCase()}.
                </span>
              </div>
            )}

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-bold text-slate-800">{pkg.canonical_reference}</span>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border text-slate-600 bg-slate-50 border-slate-200">Historical Recovery</span>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Title</span>
                  <p className="text-sm text-slate-800 mt-0.5">{pkg.title}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Executive Summary</span>
                  <p className="text-sm text-slate-700 mt-0.5">{pkg.executive_summary || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Engineering Objective</span>
                  <p className="text-sm text-slate-700 mt-0.5">{pkg.engineering_objective || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Scope / Deliverables</span>
                  <p className="text-sm text-slate-700 mt-0.5">{pkg.known_deliverables || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Validation Requirements</span>
                  <p className="text-sm text-slate-700 mt-0.5">{pkg.known_verification_evidence || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</span>
                  <p className="text-sm text-slate-700 mt-0.5">Closed (Historical Recovery)</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Historical Notes</span>
                  <p className="text-sm text-slate-700 mt-0.5">{pkg.recovery_notes || '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">PO Acceptance</span>
                  <p className="text-sm text-slate-700 mt-0.5">Accepted by {pkg.po_reviewed_by || '—'} on {pkg.po_reviewed_at ? new Date(pkg.po_reviewed_at).toLocaleDateString('en-AU') : '—'}</p>
                </div>
              </div>
            </div>

            {/* Related artefacts that will be linked */}
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Artefacts to be Linked on Import</h4>
              <div className="flex flex-wrap gap-2">
                {evidence.map(ev => (
                  <span key={ev.id} className="text-xs px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg border border-slate-200">
                    {ev.evidence_type}: {ev.source_record_ref || ev.source_table}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'audit' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-800">Recovery Audit Trail ({audit.length})</h3>
            </div>
            {audit.length === 0 ? (
              <p className="text-sm text-slate-400">No audit events yet.</p>
            ) : (
              <div className="space-y-2">
                {audit.map(a => (
                  <div key={a.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex items-start gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-semibold ${
                      a.action === 'discovered' ? 'bg-blue-50 text-blue-600' :
                      a.action === 'approved' ? 'bg-green-50 text-green-600' :
                      a.action === 'rejected' ? 'bg-red-50 text-red-600' :
                      a.action === 'imported' ? 'bg-blue-50 text-blue-600' :
                      a.action === 'deleted' ? 'bg-slate-100 text-slate-500' :
                      a.action === 'restored' ? 'bg-blue-50 text-blue-600' :
                      a.action === 'permanently_dismissed' ? 'bg-red-50 text-red-600' :
                      a.action === 'product_owner_reclassified' ? 'bg-purple-50 text-purple-600' :
                      a.action === 'import_blocked_wrong_object_type' ? 'bg-red-50 text-red-600' :
                      a.action === 'classified' ? 'bg-teal-50 text-teal-600' :
                      'bg-slate-100 text-slate-500'
                    }`}>
                      {a.action === 'discovered' ? <Database className="w-3.5 h-3.5" /> :
                       a.action === 'approved' ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                       a.action === 'rejected' ? <XCircle className="w-3.5 h-3.5" /> :
                       a.action === 'imported' ? <PackageIcon className="w-3.5 h-3.5" /> :
                       a.action === 'deleted' ? <Trash2 className="w-3.5 h-3.5" /> :
                       a.action === 'restored' ? <RotateCcw className="w-3.5 h-3.5" /> :
                       a.action === 'permanently_dismissed' ? <Ban className="w-3.5 h-3.5" /> :
                       a.action === 'product_owner_reclassified' ? <RefreshCw className="w-3.5 h-3.5" /> :
                       a.action === 'import_blocked_wrong_object_type' ? <AlertCircle className="w-3.5 h-3.5" /> :
                       a.action === 'classified' ? <ShieldCheck className="w-3.5 h-3.5" /> :
                       <Eye className="w-3.5 h-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-semibold text-slate-800 capitalize">{a.action.replace(/_/g, ' ')}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">{a.acted_by}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-xs text-slate-400">{new Date(a.acted_at).toLocaleString('en-AU')}</span>
                      </div>
                      {a.reason && <p className="text-xs text-slate-600 mt-0.5">{a.reason}</p>}
                      {a.evidence_used && <p className="text-xs text-slate-400 mt-0.5">Evidence: {a.evidence_used}</p>}
                      {a.import_result && <p className="text-xs text-blue-600 mt-0.5">{a.import_result}</p>}
                      {a.metadata && Object.keys(a.metadata).length > 0 && (
                        <div className="text-xs text-slate-400 mt-1 font-mono">
                          {Object.entries(a.metadata).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action modal */}
      {actionMode && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6" onClick={() => setActionMode(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900 mb-1">
              {actionMode === 'approve' ? 'Approve Recovery Package' :
               actionMode === 'reject' ? 'Reject Recovery Package' :
               actionMode === 'edit' ? 'Edit Recovery Package' :
               actionMode === 'request_evidence' ? 'Request More Evidence' :
               actionMode === 'reclassify' ? 'Reclassify Historical Object' :
               actionMode === 'delete' ? 'Delete Recovery Package' :
               actionMode === 'restore' ? 'Restore Recovery Package' :
               'Permanently Dismiss Candidate'}
            </h3>
            <p className="text-sm text-slate-500 mb-4">{pkg.canonical_reference} — {pkg.title}</p>

            {actionMode === 'delete' && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <strong>Source engineering evidence will NOT be deleted.</strong> Only this recovery package will be removed from the active queue.
              </div>
            )}

            {actionMode === 'dismiss' && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                <strong>Permanent dismissal</strong> prevents this candidate from being recreated on future discovery scans. The underlying engineering evidence is not deleted.
              </div>
            )}

            {actionMode === 'edit' && (
              <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                <EditField label="Title" value={editFields.title || ''} onChange={v => setEditFields(f => ({ ...f, title: v }))} />
                <EditField label="Executive Summary" value={editFields.executive_summary || ''} onChange={v => setEditFields(f => ({ ...f, executive_summary: v }))} textarea />
                <EditField label="Engineering Objective" value={editFields.engineering_objective || ''} onChange={v => setEditFields(f => ({ ...f, engineering_objective: v }))} textarea />
                <EditField label="Known Deliverables" value={editFields.known_deliverables || ''} onChange={v => setEditFields(f => ({ ...f, known_deliverables: v }))} textarea />
                <EditField label="Known Verification Evidence" value={editFields.known_verification_evidence || ''} onChange={v => setEditFields(f => ({ ...f, known_verification_evidence: v }))} textarea />
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Engineering Confidence</label>
                  <select
                    value={editFields.engineering_confidence || 'UNKNOWN'}
                    onChange={e => setEditFields(f => ({ ...f, engineering_confidence: e.target.value as EngineeringConfidence }))}
                    className="input text-sm w-full"
                  >
                    {(['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            )}

            {actionMode === 'reclassify' && (
              <div className="space-y-3 mb-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Current Classification</label>
                  <p className="text-sm text-slate-700">{classLabel(pkg.object_classification)}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">New Classification</label>
                  <select
                    value={reclassifyFields.classification}
                    onChange={e => setReclassifyFields(f => ({ ...f, classification: e.target.value as ObjectClassification }))}
                    className="input text-sm w-full"
                  >
                    {(Object.keys(CLASSIFICATION_LABELS) as ObjectClassification[]).map(c => (
                      <option key={c} value={c}>{CLASSIFICATION_LABELS[c].label} — {IMPORT_CAPABILITY_MATRIX[c].statusLabel}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Canonical EWO Reference (optional)</label>

                  {/* Resolved EWO display */}
                  {ewoResolved ? (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-mono font-semibold text-slate-800">{ewoResolved.ewo_ref}</span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5 ml-6">{ewoResolved.title}</p>
                      </div>
                      <button
                        onClick={() => { setEwoResolved(null); setReclassifyFields(f => ({ ...f, canonicalRef: '' })); }}
                        className="text-xs text-slate-400 hover:text-slate-600"
                      >
                        Clear
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={ewoSearchQuery}
                          onChange={async (e) => {
                            setEwoSearchQuery(e.target.value);
                            setEwoValidationError(null);
                            if (e.target.value.trim().length >= 2) {
                              setEwoSearching(true);
                              const results = await searchEngineeringWorkOrders(e.target.value);
                              setEwoSearchResults(results);
                              setEwoSearching(false);
                            } else {
                              setEwoSearchResults([]);
                            }
                          }}
                          placeholder="Search by reference, title, or alias…"
                          className="input text-sm w-full pl-8"
                        />
                        {ewoSearching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />}
                      </div>

                      {/* Search results */}
                      {ewoSearchResults.length > 0 && !ewoResolved && (
                        <div className="mt-1 border border-slate-200 rounded-lg max-h-48 overflow-y-auto bg-white shadow-sm">
                          {ewoSearchResults.map(ewo => (
                            <button
                              key={ewo.id}
                              onClick={() => {
                                setEwoResolved(ewo);
                                setReclassifyFields(f => ({ ...f, canonicalRef: ewo.ewo_ref }));
                                setEwoSearchQuery('');
                                setEwoSearchResults([]);
                                setEwoValidationError(null);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-mono font-semibold text-slate-800">{ewo.ewo_ref}</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">{ewo.title}</p>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* No results */}
                      {ewoSearchQuery.trim().length >= 2 && !ewoSearching && ewoSearchResults.length === 0 && !ewoResolved && (
                        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Engineering Work Order not found.
                        </p>
                      )}

                      {ewoValidationError && (
                        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {ewoValidationError}
                        </p>
                      )}

                      <p className="text-xs text-slate-400 mt-1">If reclassifying as an EWO, search for and select a valid Engineering Work Order from the ledger. Only existing EWOs can be selected.</p>
                    </>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
                {actionMode === 'edit' ? 'Edit Notes' : actionMode === 'reclassify' ? 'Reason (mandatory)' : actionMode === 'delete' ? 'Deletion Reason (mandatory)' : actionMode === 'restore' ? 'Restore Reason (mandatory)' : actionMode === 'dismiss' ? 'Dismissal Reason (mandatory)' : 'Reason / Notes'}
              </label>
              <textarea
                className="input text-sm resize-none w-full"
                rows={3}
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
                placeholder="Explain the decision…"
              />
            </div>

            {actionError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {actionError}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setActionMode(null)} className="px-4 py-1.5 text-sm text-slate-500 hover:text-slate-700 font-medium">Cancel</button>
              <button
                onClick={handleAction}
                disabled={acting || (actionMode !== 'edit' && !actionNotes.trim())}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition-colors ${
                  actionMode === 'reject' || actionMode === 'delete' || actionMode === 'dismiss' ? 'bg-red-600 hover:bg-red-700' :
                  actionMode === 'edit' ? 'bg-blue-600 hover:bg-blue-700' :
                  actionMode === 'request_evidence' ? 'bg-amber-600 hover:bg-amber-700' :
                  actionMode === 'reclassify' ? 'bg-purple-600 hover:bg-purple-700' :
                  actionMode === 'restore' ? 'bg-blue-600 hover:bg-blue-700' :
                  'bg-green-600 hover:bg-green-700'
                }`}
              >
                {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {actionMode === 'approve' ? 'Approve' :
                 actionMode === 'reject' ? 'Reject' :
                 actionMode === 'edit' ? 'Save Edits' :
                 actionMode === 'request_evidence' ? 'Request Evidence' :
                 actionMode === 'reclassify' ? 'Save Reclassification' :
                 actionMode === 'delete' ? 'Delete Package' :
                 actionMode === 'restore' ? 'Restore' :
                 'Permanently Dismiss'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReclassificationHistoryModal
        open={reclassHistoryOpen}
        onClose={() => setReclassHistoryOpen(false)}
        loading={reclassHistoryLoading}
        entries={reclassHistoryEntries}
      />
    </div>
  );
}

// ─── Helper components ──────────────────────────────────────────────────────

function Field({ label, value, warning }: { label: string; value: string | null; warning?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
      <p className={`text-sm mt-0.5 ${warning ? 'text-amber-700' : 'text-slate-700'}`}>{value}</p>
    </div>
  );
}

function EditField({ label, value, onChange, textarea }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">{label}</label>
      {textarea ? (
        <textarea className="input text-sm resize-none w-full" rows={2} value={value} onChange={e => onChange(e.target.value)} />
      ) : (
        <input className="input text-sm w-full" value={value} onChange={e => onChange(e.target.value)} />
      )}
    </div>
  );
}

// ─── Reclassification History modal ─────────────────────────────────────────
function ReclassificationHistoryModal({
  open, onClose, loading, entries,
}: {
  open: boolean; onClose: () => void; loading: boolean; entries: ReclassificationHistoryEntry[];
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
              <RotateCcw className="w-4.5 h-4.5 text-blue-600" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">Reclassification History</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-slate-400">
              <AlertCircle className="w-8 h-8 mb-2" />
              <p className="text-sm">No reclassification history available.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry, idx) => (
                <div key={idx} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 uppercase tracking-wide font-semibold">Previous Classification</span>
                      <p className="text-sm text-slate-700 mt-0.5">{entry.previous_classification.replace(/_/g, ' ')}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 uppercase tracking-wide font-semibold">Current Classification</span>
                      <p className="text-sm text-slate-700 mt-0.5">{entry.new_classification.replace(/_/g, ' ')}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 uppercase tracking-wide font-semibold">Previous Reference</span>
                      <p className="text-sm font-mono text-slate-700 mt-0.5">{entry.previous_canonical_reference}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 uppercase tracking-wide font-semibold">Current Reference</span>
                      <p className="text-sm font-mono text-slate-700 mt-0.5">{entry.new_canonical_reference}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 uppercase tracking-wide font-semibold">Product Owner</span>
                      <p className="text-sm text-slate-700 mt-0.5">{entry.acted_by}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 uppercase tracking-wide font-semibold">Date</span>
                      <p className="text-sm text-slate-700 mt-0.5">{new Date(entry.acted_at).toLocaleString('en-AU')}</p>
                    </div>
                  </div>
                  {entry.reason && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <span className="text-slate-400 uppercase tracking-wide font-semibold text-xs">Reason</span>
                      <p className="text-sm text-slate-700 mt-0.5">{entry.reason}</p>
                    </div>
                  )}
                  <div className="mt-2 text-[10px] text-slate-400 uppercase tracking-wide">
                    Audit event: {entry.action.replace(/_/g, ' ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SimpleBadge helper ────────────────────────────────────────────────────
function SimpleBadge({ value, colour }: { value: string; colour: string }) {
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colour}`}
    >
      {value}
    </span>
  );
}
