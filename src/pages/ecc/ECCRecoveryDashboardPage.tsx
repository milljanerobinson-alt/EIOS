import { useState, useEffect, useCallback } from 'react';
import {
  History, Loader2, Search, Filter, CheckCircle2, XCircle, ExternalLink,
  AlertTriangle, Package as PackageIcon, FileText, Database, RefreshCw,
  AlertCircle, ShieldCheck, Trash2, RotateCcw, Ban, X,
} from 'lucide-react';
import {
  type RecoveryPackage,
  type EngineeringConfidence,
  type RecoveryPOStatus,
  type ObjectClassification,
  type RecoveryStatus,
  type ReclassificationHistoryEntry,
  getRecoveryPackages,
  runDiscoveryEngine,
  bulkApproveRecoveries,
  deleteRecoveryPackage,
  getCategoryCounts,
  getReclassificationHistory,
  evaluateBatchEligibility,
  type BatchEligibilitySummary,
  CONFIDENCE_LABELS,
  PO_STATUS_LABELS,
  RECOVERY_STATUS_LABELS,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_CATEGORIES,
  IMPORT_CAPABILITY_MATRIX,
  getImportCapability,
  isImportSupported,
  classifyRecoveryBucket,
  classifyRecoveryOutcome,
  RECOVERY_OUTCOME_LABELS,
  type RecoveryOutcome,
  RECOVERY_SUMMARY_BUCKETS,
  type RecoverySummaryBucket,
} from '../../lib/historicalRecoveryService';
import { BatchApprovalModal } from './ECCBatchApprovalModal';

type CategoryFilter = 'all' | ObjectClassification | 'deleted';

export function ECCRecoveryDashboardPage({ onSelectPackage }: { onSelectPackage?: (id: string) => void }) {
  const [packages, setPackages] = useState<RecoveryPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | RecoveryPOStatus>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | EngineeringConfidence>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('ENGINEERING_WORK_ORDER');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ created: number; skipped: number; ewoSkipped: number; recoverySkipped: number; deletedSkipped: number; dismissedSkipped: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [bulkActing, setBulkActing] = useState(false);
  const [categoryCounts, setCategoryCounts] = useState<{ classification: ObjectClassification; count: number; label: string }[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<RecoveryPackage | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reclassHistoryOpen, setReclassHistoryOpen] = useState(false);
  const [reclassHistoryLoading, setReclassHistoryLoading] = useState(false);
  const [reclassHistoryEntries, setReclassHistoryEntries] = useState<ReclassificationHistoryEntry[]>([]);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [eligibilityOpen, setEligibilityOpen] = useState(false);

  const handleReview = useCallback((id: string, recoveryRef: string) => {
    if (!id) {
      setReviewError('Recovery package identifier is missing. The workspace cannot be opened.');
      return;
    }
    if (onSelectPackage) {
      // Pass recovery_ref (REC-001) as the URL identifier, not the UUID.
      // The routing layer uppercases the objectRef segment, which would
      // corrupt a UUID. recovery_ref is already uppercase-safe.
      onSelectPackage(recoveryRef);
    } else {
      setReviewError('Recovery Workspace navigation is unavailable in this context.');
    }
  }, [onSelectPackage]);

  async function openReclassificationHistory(packageId: string) {
    setReclassHistoryOpen(true);
    setReclassHistoryLoading(true);
    setReclassHistoryEntries([]);
    const entries = await getReclassificationHistory(packageId);
    setReclassHistoryEntries(entries);
    setReclassHistoryLoading(false);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const filter: { po_status?: RecoveryPOStatus; confidence?: EngineeringConfidence; classification?: ObjectClassification; includeDeleted?: boolean; includeDismissed?: boolean } = {};
    if (statusFilter !== 'all') filter.po_status = statusFilter;
    if (confidenceFilter !== 'all') filter.confidence = confidenceFilter;
    if (categoryFilter === 'deleted') {
      filter.includeDeleted = true;
    } else if (categoryFilter !== 'all') {
      filter.classification = categoryFilter;
    }
    const data = await getRecoveryPackages(filter);
    setPackages(data);
    setLoading(false);
    const counts = await getCategoryCounts();
    setCategoryCounts(counts);
  }, [statusFilter, confidenceFilter, categoryFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleRunDiscovery() {
    setRunning(true);
    setRunResult(null);
    const result = await runDiscoveryEngine();
    setRunResult({
      created: result.packagesCreated,
      skipped: result.packagesSkipped,
      ewoSkipped: result.existingEwoSkipped,
      recoverySkipped: result.existingRecoverySkipped,
      deletedSkipped: result.deletedSkipped,
      dismissedSkipped: result.dismissedSkipped,
    });
    setRunning(false);
    await load();
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0) return;
    setBulkActing(true);
    setBulkResult(null);
    const result = await bulkApproveRecoveries([...selectedIds], 'Product Owner', 'Bulk approved');
    setBulkResult(result);
    setBulkActing(false);
    setSelectedIds(new Set());
    await load();
  }

  async function handleDelete() {
    if (!deleteTarget || !deleteReason.trim()) return;
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteRecoveryPackage(deleteTarget.id, 'Product Owner', deleteReason);
    if (result.success) {
      setDeleteTarget(null);
      setDeleteReason('');
      await load();
    } else {
      setDeleteError(result.error || 'Failed to delete');
    }
    setDeleting(false);
  }

  const filtered = packages.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.title.toLowerCase().includes(q) || p.canonical_reference.toLowerCase().includes(q) || p.recovery_ref.toLowerCase().includes(q);
  });

  const pendingCount = packages.filter(p => p.po_status === 'pending').length;
  const approvedCount = packages.filter(p => p.po_status === 'approved').length;
  // EWO-014.19A.6: Recovery summary buckets — decouple governance decisions
  // from implementation limitations. Each package is placed in exactly one
  // bucket based on its classification correctness AND import capability.
  const bucketCounts = packages.reduce<Record<RecoverySummaryBucket, number>>((acc, p) => {
    const b = classifyRecoveryBucket(p);
    acc[b] = (acc[b] || 0) + 1;
    return acc;
  }, { ready_to_import: 0, requires_reclassification: 0, requires_more_evidence: 0, import_not_yet_supported: 0, requires_review: 0, imported: 0, deleted: 0, dismissed: 0 });
  const selectedPending = packages.filter(p => selectedIds.has(p.id) && p.po_status === 'pending');
  const selectedPackages = packages.filter(p => selectedIds.has(p.id));
  const eligibilitySummary = evaluateBatchEligibility(selectedPackages);
  const canBulkApprove = selectedPending.length > 0 &&
    eligibilitySummary.excludedCount === 0 &&
    eligibilitySummary.eligibleCount > 0;
  const selectableIds = packages.filter(p => p.po_status === 'pending' && !p.is_deleted && !p.imported_at).map(p => p.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));
  const handleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(selectableIds));
  };
  const handleBatchComplete = () => {
    setSelectedIds(new Set());
    load();
  };

  const categoryTabs: { key: CategoryFilter; label: string; count?: number }[] = [
    { key: 'ENGINEERING_WORK_ORDER', label: 'Recoverable EWOs', count: categoryCounts.find(c => c.classification === 'ENGINEERING_WORK_ORDER')?.count || 0 },
    { key: 'ENGINEERING_AMENDMENT', label: 'Amendments', count: categoryCounts.find(c => c.classification === 'ENGINEERING_AMENDMENT')?.count || 0 },
    { key: 'CONSTITUTIONAL_RECORD', label: 'Constitutional', count: categoryCounts.find(c => c.classification === 'CONSTITUTIONAL_RECORD')?.count || 0 },
    { key: 'ENGINEERING_RECORD', label: 'Records', count: categoryCounts.find(c => c.classification === 'ENGINEERING_RECORD')?.count || 0 },
    { key: 'ENGINEERING_INTENT', label: 'Workflow Objects', count: (categoryCounts.find(c => c.classification === 'ENGINEERING_INTENT')?.count || 0) + (categoryCounts.find(c => c.classification === 'ENGINEERING_PLAN')?.count || 0) + (categoryCounts.find(c => c.classification === 'PIPELINE_EXECUTION')?.count || 0) },
    { key: 'BUG_OR_INCIDENT', label: 'Bugs & Incidents', count: categoryCounts.find(c => c.classification === 'BUG_OR_INCIDENT')?.count || 0 },
    { key: 'BATCH_OR_MIGRATION', label: 'Batch & Migration', count: categoryCounts.find(c => c.classification === 'BATCH_OR_MIGRATION')?.count || 0 },
    { key: 'UNKNOWN', label: 'Unclassified', count: categoryCounts.find(c => c.classification === 'UNKNOWN')?.count || 0 },
    { key: 'deleted', label: 'Deleted', count: undefined },
    { key: 'all', label: 'All', count: undefined },
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="px-8 py-6 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center">
              <History className="w-5.5 h-5.5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Historical Recovery Engine</h1>
              <p className="text-sm text-slate-500">Discovers, reconstructs, and validates historical engineering work. History must never be invented.</p>
            </div>
          </div>
          <button
            onClick={handleRunDiscovery}
            disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-900 disabled:opacity-40 transition-colors"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Run Discovery Engine
          </button>
        </div>

        {runResult && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4" />
              <span>Discovery complete: <strong>{runResult.created}</strong> package(s) created, <strong>{runResult.skipped}</strong> skipped.</span>
            </div>
            <div className="text-xs text-blue-600 ml-6">
              Existing EWOs skipped: {runResult.ewoSkipped} · Existing recovery packages skipped: {runResult.recoverySkipped} · Deleted candidates skipped: {runResult.deletedSkipped} · Permanently dismissed skipped: {runResult.dismissedSkipped}
            </div>
          </div>
        )}

        {bulkResult && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-sm text-blue-800">
            <ShieldCheck className="w-4 h-4" />
            <span>Bulk approval: <strong>{bulkResult.success}</strong> approved, <strong>{bulkResult.failed}</strong> failed.</span>
            {bulkResult.errors.length > 0 && <span className="text-red-600">{bulkResult.errors.join('; ')}</span>}
          </div>
        )}
      </div>

      {/* Category tabs */}
      <div className="px-8 py-3 bg-white border-b border-slate-200 flex items-center gap-1 flex-wrap">
        {categoryTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setCategoryFilter(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              categoryFilter === tab.key
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${categoryFilter === tab.key ? 'bg-white/20' : 'bg-slate-100'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Recovery Summary — EWO-014.19A.6 Req 5
          Distinguishes governance decisions from implementation limitations.
          Buckets: Ready To Import · Requires Reclassification · Requires More Evidence ·
          Import Not Yet Supported · (Requires Review · Imported · Deleted · Dismissed) */}
      <div className="px-8 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1">Recovery Summary</span>
          {RECOVERY_SUMMARY_BUCKETS.map(bucket => {
            const count = bucketCounts[bucket.key] || 0;
            if (count === 0 && !['ready_to_import','requires_reclassification','requires_more_evidence','import_not_yet_supported'].includes(bucket.key)) return null;
            const colour =
              bucket.key === 'ready_to_import' ? 'text-green-700 bg-green-50 border-green-200' :
              bucket.key === 'requires_reclassification' ? 'text-purple-700 bg-purple-50 border-purple-200' :
              bucket.key === 'requires_more_evidence' ? 'text-amber-700 bg-amber-50 border-amber-200' :
              bucket.key === 'import_not_yet_supported' ? 'text-blue-700 bg-blue-50 border-blue-200' :
              bucket.key === 'requires_review' ? 'text-slate-700 bg-slate-50 border-slate-200' :
              bucket.key === 'imported' ? 'text-blue-700 bg-blue-50 border-blue-200' :
              bucket.key === 'deleted' ? 'text-slate-500 bg-slate-100 border-slate-200' :
              'text-red-700 bg-red-50 border-red-200';
            return (
              <span key={bucket.key} className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border ${colour}`} title={bucket.description}>
                {bucket.label}: <strong>{count}</strong>
              </span>
            );
          })}
        </div>
      </div>

      {/* Stats bar */}
      <div className="px-8 py-3 bg-white border-b border-slate-200 flex items-center gap-6">
        <div className="flex items-center gap-2 text-sm">
          <PackageIcon className="w-4 h-4 text-slate-400" />
          <span className="text-slate-500">Total:</span>
          <span className="font-semibold text-slate-800">{packages.length}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <AlertCircle className="w-4 h-4 text-amber-500" />
          <span className="text-slate-500">Pending:</span>
          <span className="font-semibold text-amber-700">{pendingCount}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          <span className="text-slate-500">Approved:</span>
          <span className="font-semibold text-green-700">{approvedCount}</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-8">
        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search recovery packages…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-slate-400" />
            {(['all', 'pending', 'approved', 'rejected', 'edit', 'request_evidence'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${statusFilter === s ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
              >
                {s === 'all' ? 'All Status' : PO_STATUS_LABELS[s]?.label || s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 ml-2">
            {(['all', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const).map(c => (
              <button
                key={c}
                onClick={() => setConfidenceFilter(c)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${confidenceFilter === c ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
              >
                {c === 'all' ? 'All Confidence' : c}
              </button>
            ))}
          </div>
        </div>

        {/* Bulk actions bar */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAll}
              disabled={selectableIds.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              <input type="checkbox" checked={allSelected} readOnly disabled={selectableIds.length === 0} className="w-3.5 h-3.5 rounded border-slate-300" />
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            {selectedIds.size > 0 && (
              <span className="text-sm text-blue-800 font-medium">{selectedIds.size} package(s) selected</span>
            )}
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              {!canBulkApprove && selectedPending.length > 0 && (
                <button
                  onClick={() => setEligibilityOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {eligibilitySummary.eligibleCount} of {eligibilitySummary.totalSelected} eligible — {eligibilitySummary.excludedCount} require review
                </button>
              )}
              <button
                onClick={() => setBatchModalOpen(true)}
                disabled={!canBulkApprove || bulkActing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                {bulkActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                Approve Selected ({selectedPending.length})
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-500 hover:text-slate-700">Clear Selection</button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-slate-400">
            <History className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium text-slate-500">No recoverable Engineering Work Orders were identified in this scan.</p>
            <p className="text-xs mt-1 text-slate-400">Other historical engineering objects may still be available under the category filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(pkg => (
              <div
                key={pkg.id}
                onClick={() => handleReview(pkg.id, pkg.recovery_ref)}
                className="bg-white rounded-xl border border-slate-200 p-5 cursor-pointer hover:border-primary-300 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {pkg.po_status === 'pending' && !pkg.is_deleted && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(pkg.id)}
                        onChange={e => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(pkg.id); else next.delete(pkg.id);
                          setSelectedIds(next);
                        }}
                        onClick={e => e.stopPropagation()}
                        className="mt-1 w-4 h-4 rounded border-slate-300"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      {/* Hierarchy: REC ref → Object ref → Classification → metadata */}
                      <button
                        onClick={() => handleReview(pkg.id, pkg.recovery_ref)}
                        className="text-xs font-mono text-slate-500 hover:text-primary-600 hover:underline block mb-0.5"
                        title="Open Recovery Workspace"
                      >
                        {pkg.recovery_ref}
                      </button>
                      <button
                        onClick={() => handleReview(pkg.id, pkg.recovery_ref)}
                        className="text-sm font-mono font-bold text-slate-900 hover:text-primary-600 hover:underline block mb-2"
                        title="Open Recovery Workspace"
                      >
                        {pkg.canonical_reference}
                      </button>
                      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                        <SimpleBadge value={CLASSIFICATION_LABELS[pkg.object_classification].label} colour={CLASSIFICATION_LABELS[pkg.object_classification].colour} />
                        <SimpleBadge value={pkg.engineering_confidence} colour={CONFIDENCE_LABELS[pkg.engineering_confidence].colour} />
                        <SimpleBadge value={RECOVERY_STATUS_LABELS[pkg.recovery_status]?.label || pkg.recovery_status} colour={RECOVERY_STATUS_LABELS[pkg.recovery_status]?.colour || 'text-slate-600 bg-slate-50 border-slate-200'} />
                        {(() => {
                          const decision = classifyRecoveryOutcome(pkg);
                          const cfg = RECOVERY_OUTCOME_LABELS[decision.outcome];
                          const colourMap: Record<string, string> = {
                            green: 'text-emerald-700 bg-emerald-50 border-emerald-200',
                            amber: 'text-amber-700 bg-amber-50 border-amber-200',
                            red: 'text-red-700 bg-red-50 border-red-200',
                            blue: 'text-blue-700 bg-blue-50 border-blue-200',
                          };
                          return <SimpleBadge value={cfg.label} colour={colourMap[cfg.colour] || 'text-slate-600 bg-slate-50 border-slate-200'} />;
                        })()}
                        {pkg.imported_at && (
                          <SimpleBadge value="Imported" colour="text-blue-700 bg-blue-50 border-blue-200" />
                        )}
                        {pkg.is_deleted && (
                          <SimpleBadge value="Deleted" colour="text-slate-500 bg-slate-100 border-slate-200" />
                        )}
                        {pkg.is_permanently_dismissed && (
                          <SimpleBadge value="Dismissed" colour="text-red-600 bg-red-50 border-red-200" />
                        )}
                        {pkg.reclassified_at && (
                          <button
                            onClick={e => { e.stopPropagation(); openReclassificationHistory(pkg.id); }}
                            className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100 transition-colors"
                            title="View Reclassification History"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Reclassified
                          </button>
                        )}
                      </div>
                      <h3
                        onClick={() => handleReview(pkg.id, pkg.recovery_ref)}
                        className="text-sm font-semibold text-slate-700 mb-1 cursor-pointer hover:text-primary-700 transition-colors"
                      >
                        {pkg.title}
                      </h3>
                      {pkg.executive_summary && (
                        <p
                          onClick={() => handleReview(pkg.id, pkg.recovery_ref)}
                          className="text-xs text-slate-500 line-clamp-2 cursor-pointer hover:text-slate-700"
                        >
                          {pkg.executive_summary}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Database className="w-3 h-3" />
                          {pkg.evidence_sources?.length || 0} evidence
                        </span>
                        {pkg.evidence_missing && (
                          <span className="flex items-center gap-1 text-amber-600">
                            <AlertTriangle className="w-3 h-3" />
                            Evidence incomplete
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleReview(pkg.id, pkg.recovery_ref)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white text-xs font-semibold rounded-lg hover:bg-primary-700 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Open
                    </button>
                    {!pkg.is_deleted && !pkg.imported_at && (
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteTarget(pkg); setDeleteReason(''); setDeleteError(null); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors border border-red-200"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    )}
                    {pkg.imported_at && (
                      <span className="text-xs text-slate-400 italic">Imported</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reclassification History modal */}
      {reclassHistoryOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6" onClick={() => setReclassHistoryOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                  <RotateCcw className="w-4.5 h-4.5 text-blue-600" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">Reclassification History</h3>
              </div>
              <button onClick={() => setReclassHistoryOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {reclassHistoryLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : reclassHistoryEntries.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-slate-400">
                  <AlertCircle className="w-8 h-8 mb-2" />
                  <p className="text-sm">No reclassification history available.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reclassHistoryEntries.map((entry, idx) => (
                    <div key={idx} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-slate-400 uppercase tracking-wide font-semibold">Previous Classification</span>
                          <p className="text-sm text-slate-700 mt-0.5">{CLASSIFICATION_LABELS[entry.previous_classification as ObjectClassification]?.label || entry.previous_classification}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 uppercase tracking-wide font-semibold">Current Classification</span>
                          <p className="text-sm text-slate-700 mt-0.5">{CLASSIFICATION_LABELS[entry.new_classification as ObjectClassification]?.label || entry.new_classification}</p>
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
      )}

      {/* Governed Batch Eligibility Summary modal */}
      {eligibilityOpen && (
        <EligibilitySummaryModal
          summary={eligibilitySummary}
          onClose={() => setEligibilityOpen(false)}
          onApproveEligible={() => {
            const eligibleIds = new Set(eligibilitySummary.assessments.filter(a => a.eligible).map(a => a.packageId));
            setSelectedIds(eligibleIds);
            setEligibilityOpen(false);
            setBatchModalOpen(true);
          }}
        />
      )}

      {/* Governed Review error modal */}
      {reviewError && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6" onClick={() => setReviewError(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">Unable to Open Recovery Package</h3>
            </div>
            <p className="text-sm text-slate-600 mb-4">{reviewError}</p>
            <div className="flex justify-end">
              <button onClick={() => setReviewError(null)} className="px-4 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-800">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                <Trash2 className="w-4.5 h-4.5 text-red-600" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">Delete Recovery Package</h3>
            </div>

            <div className="space-y-2 mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Recovery Reference:</span>
                <span className="font-mono font-semibold text-slate-800">{deleteTarget.recovery_ref}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Canonical Reference:</span>
                <span className="font-mono font-semibold text-slate-800">{deleteTarget.canonical_reference}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Classification:</span>
                <span className="font-medium text-slate-800">{CLASSIFICATION_LABELS[deleteTarget.object_classification].label}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Evidence Count:</span>
                <span className="font-medium text-slate-800">{deleteTarget.evidence_sources?.length || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">PO Status:</span>
                <span className="font-medium text-slate-800">{PO_STATUS_LABELS[deleteTarget.po_status].label}</span>
              </div>
            </div>

            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <strong>Source engineering evidence will NOT be deleted.</strong> Only this recovery package will be removed from the active queue. The underlying engineering records, lifecycle events, and identity mappings remain unchanged.
            </div>

            {deleteError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {deleteError}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">Deletion Reason (mandatory)</label>
              <textarea
                className="input text-sm resize-none w-full"
                rows={3}
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                placeholder="Explain why this recovery package is being deleted…"
              />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-1.5 text-sm text-slate-500 hover:text-slate-700 font-medium">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={!deleteReason.trim() || deleting}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete Package
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Governed Batch Approval Modal */}
      <BatchApprovalModal
        open={batchModalOpen}
        selectedPackages={selectedPending}
        onClose={() => setBatchModalOpen(false)}
        onComplete={handleBatchComplete}
      />
    </div>
  );
}

// ─── Helper components ──────────────────────────────────────────────────────

function SimpleBadge({ value, colour }: { value: string; colour: string }) {
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colour}`}
    >
      {value}
    </span>
  );
}

// ─── Governed Batch Eligibility Summary modal ────────────────────────────────

function EligibilitySummaryModal({
  summary,
  onClose,
  onApproveEligible,
}: {
  summary: BatchEligibilitySummary;
  onClose: () => void;
  onApproveEligible: () => void;
}) {
  const excluded = summary.assessments.filter(a => !a.eligible);
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                <ShieldCheck className="w-4.5 h-4.5 text-amber-600" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">Batch Approval Eligibility</h3>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Summary counts */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
              <p className="text-2xl font-bold text-slate-800">{summary.totalSelected}</p>
              <p className="text-xs text-slate-500 mt-0.5">packages selected</p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-center">
              <p className="text-2xl font-bold text-emerald-700">{summary.eligibleCount}</p>
              <p className="text-xs text-emerald-600 mt-0.5">eligible for approval</p>
            </div>
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-center">
              <p className="text-2xl font-bold text-amber-700">{summary.excludedCount}</p>
              <p className="text-xs text-amber-600 mt-0.5">require manual review</p>
            </div>
          </div>

          {/* Excluded packages */}
          {excluded.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Excluded Packages</h4>
              <div className="space-y-2">
                {excluded.map(a => (
                  <div key={a.packageId} className="p-3 bg-amber-50/50 border border-amber-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-mono font-semibold text-slate-800">{a.recoveryRef}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-xs text-slate-600 truncate">{a.title}</span>
                    </div>
                    <p className="text-xs text-amber-700 font-medium">{a.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Governance note */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
            Only eligible packages can be batch approved. Excluded packages must be reviewed individually before approval.
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-slate-500 hover:text-slate-700 font-medium">Cancel</button>
          <button
            onClick={onClose}
            disabled={excluded.length === 0}
            className="px-4 py-1.5 text-sm text-slate-600 hover:text-slate-800 font-medium border border-slate-200 rounded-lg disabled:opacity-40"
          >
            Review Remaining
          </button>
          <button
            onClick={onApproveEligible}
            disabled={summary.eligibleCount === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
          >
            <ShieldCheck className="w-4 h-4" />
            Approve Eligible Packages ({summary.eligibleCount})
          </button>
        </div>
      </div>
    </div>
  );
}
