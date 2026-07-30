// EWO-014.19A.7SR.2 — Product Owner Review Queue & Decision Workflow
//
// Provides a permanent, persisted Product Owner Review workflow for
// NEEDS_PRODUCT_OWNER_REVIEW batch items. Supports 6 governed decisions,
// evidence inspection, duplicate detection, and integrity revalidation.

import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck, Loader2, X, AlertCircle, ChevronRight, ChevronDown,
  CheckCircle2, ExternalLink, Search, Calendar, Filter, Eye, Link2,
  Ban, ThumbsDown, Clock, ShieldX, FileText, AlertTriangle,
} from 'lucide-react';
import {
  getReviewQueue, getReviewCount, getReviewDetail,
  submitDecision, searchExistingWorkOrders, generateDefaultDecisionNote,
  type POReviewQueueItem, type ReviewDetailData,
  type FinalDecision, type ReviewStatus,
} from '../../lib/poReviewService';
import type { BatchItemResult } from '../../lib/integrityBatchService';

interface Props {
  batchRefFilter?: string;
  onNavigate?: (section: string, objectRef?: string) => void;
}

const DECISION_LABELS: Record<FinalDecision, string> = {
  APPROVE_HISTORICAL_RECOVERY: 'Approve Historical Recovery',
  LINK_EXISTING_WORK_ORDER: 'Link to Existing Work Order',
  INVALID_REFERENCE: 'Reject as Invalid Reference',
  FALSE_POSITIVE: 'Mark as False Positive',
  DEFER_REVIEW: 'Defer Review',
  NO_SAFE_RECOVERY: 'No Safe Historical Recovery',
};

const DECISION_ICONS: Record<FinalDecision, typeof CheckCircle2> = {
  APPROVE_HISTORICAL_RECOVERY: CheckCircle2,
  LINK_EXISTING_WORK_ORDER: Link2,
  INVALID_REFERENCE: Ban,
  FALSE_POSITIVE: ThumbsDown,
  DEFER_REVIEW: Clock,
  NO_SAFE_RECOVERY: ShieldX,
};

const DECISION_COLOURS: Record<FinalDecision, string> = {
  APPROVE_HISTORICAL_RECOVERY: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100',
  LINK_EXISTING_WORK_ORDER: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  INVALID_REFERENCE: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100',
  FALSE_POSITIVE: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  DEFER_REVIEW: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
  NO_SAFE_RECOVERY: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
};

const REVIEW_STATUS_COLOURS: Record<ReviewStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  deferred: 'bg-orange-100 text-orange-700',
  resolved: 'bg-green-100 text-green-700',
};

export function POReviewPanel({ batchRefFilter: initialBatchRef, onNavigate }: Props) {
  const [queue, setQueue] = useState<POReviewQueueItem[]>([]);
  const [counts, setCounts] = useState({ pending: 0, deferred: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | 'all'>('pending');
  const [batchRefFilter, setBatchRefFilter] = useState(initialBatchRef ?? '');
  const [ewoRefFilter, setEwoRefFilter] = useState('');
  const [decisionFilter, setDecisionFilter] = useState<FinalDecision | 'all'>('all');
  const [detailData, setDetailData] = useState<ReviewDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activeDecision, setActiveDecision] = useState<FinalDecision | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);
  const [workOrderSearch, setWorkOrderSearch] = useState('');
  const [workOrderResults, setWorkOrderResults] = useState<Array<{ id: string; ewo_ref: string; title: string; status: string }>>([]);
  const [deferredUntil, setDeferredUntil] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, countData] = await Promise.all([
        getReviewQueue(statusFilter, batchRefFilter || undefined, ewoRefFilter || undefined, decisionFilter),
        getReviewCount(),
      ]);
      setQueue(items);
      setCounts(countData);
    } catch (err) {
      console.error('Review queue load failed:', err);
      setError('Failed to load Product Owner Review queue.');
    }
    setLoading(false);
  }, [statusFilter, batchRefFilter, ewoRefFilter, decisionFilter]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const handleOpenReview = async (reviewId: string) => {
    setDetailData(null);
    setDetailError(null);
    setDetailLoading(true);
    setActiveDecision(null);
    setSubmitResult(null);
    try {
      const data = await getReviewDetail(reviewId);
      if (!data) {
        setDetailError('Review not found or no longer available.');
      } else {
        setDetailData(data);
      }
    } catch (err) {
      console.error('Review detail load failed:', err);
      setDetailError('Failed to load review detail.');
    }
    setDetailLoading(false);
  };

  const handleCloseDetail = () => {
    setDetailData(null);
    setDetailError(null);
    setActiveDecision(null);
    setDecisionNote('');
    setSelectedWorkOrderId(null);
    setWorkOrderSearch('');
    setWorkOrderResults([]);
    setDeferredUntil('');
    setSubmitResult(null);
  };

  const handleSelectDecision = (decision: FinalDecision) => {
    setActiveDecision(decision);
    setSubmitResult(null);
    if (detailData) {
      const evidenceSources = (detailData.review.evidence_snapshot as { evidence_searched?: string[] })?.evidence_searched ?? [];
      const missingFields = detailData.missingFields;
      const batchRef = detailData.batchRun?.batch_ref ?? null;
      setDecisionNote(generateDefaultDecisionNote(detailData.review.ewo_ref, batchRef, decision, evidenceSources, missingFields));
    }
  };

  const handleSearchWorkOrders = async (query: string) => {
    setWorkOrderSearch(query);
    if (query.length >= 2) {
      const results = await searchExistingWorkOrders(query);
      setWorkOrderResults(results);
    } else {
      setWorkOrderResults([]);
    }
  };

  const handleSubmitDecision = async () => {
    if (!activeDecision || !detailData) return;
    if (!decisionNote.trim()) {
      setSubmitResult({ success: false, message: 'A decision note is required.' });
      return;
    }
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const result = await submitDecision({
        reviewId: detailData.review.id,
        decision: activeDecision,
        decisionNote: decisionNote.trim(),
        selectedExistingWorkOrderId: activeDecision === 'LINK_EXISTING_WORK_ORDER' ? selectedWorkOrderId : null,
        deferredUntil: activeDecision === 'DEFER_REVIEW' ? deferredUntil || null : null,
      });
      if (result.success) {
        setSubmitResult({ success: true, message: `Decision recorded. Revalidation: ${result.revalidationResult}. Alert status: ${result.alertStatusAfter}.` });
        await loadQueue();
        // Reload detail to show updated state
        setTimeout(() => handleOpenReview(detailData.review.id), 1500);
      } else {
        setSubmitResult({ success: false, message: result.error ?? 'Failed to submit decision.' });
      }
    } catch (err) {
      setSubmitResult({ success: false, message: 'An unexpected error occurred.' });
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-4">
      {/* Header with counts */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-primary-500" />
            Product Owner Review Queue
          </h2>
          <div className="flex gap-2">
            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${counts.pending > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
              {counts.pending} Unresolved
            </span>
            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-700">
              {counts.deferred} Deferred
            </span>
            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">
              {counts.resolved} Resolved
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          {(['pending', 'deferred', 'resolved', 'all'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${statusFilter === status ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
          <input
            type="text"
            placeholder="Filter by batch ref..."
            value={batchRefFilter}
            onChange={e => setBatchRefFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-300 w-40"
          />
          <input
            type="text"
            placeholder="Filter by EWO ref..."
            value={ewoRefFilter}
            onChange={e => setEwoRefFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-300 w-40"
          />
          <select
            value={decisionFilter}
            onChange={e => setDecisionFilter(e.target.value as FinalDecision | 'all')}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-300 bg-white"
          >
            <option value="all">All Decisions</option>
            {(Object.keys(DECISION_LABELS) as FinalDecision[]).map(d => (
              <option key={d} value={d}>{DECISION_LABELS[d]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Queue Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            <span className="ml-2 text-sm text-slate-500">Loading review queue...</span>
          </div>
        ) : error ? (
          <div className="py-8 px-5">
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        ) : queue.length === 0 ? (
          <div className="py-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No review items match the current filters.</p>
            <p className="text-xs text-slate-400 mt-1">Items appear here when batch processing produces NEEDS_PRODUCT_OWNER_REVIEW outcomes.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-2 font-semibold">EWO Ref</th>
                  <th className="text-left px-3 py-2 font-semibold">Batch</th>
                  <th className="text-left px-3 py-2 font-semibold">Reason</th>
                  <th className="text-center px-3 py-2 font-semibold">Confidence</th>
                  <th className="text-left px-3 py-2 font-semibold">Decision</th>
                  <th className="text-left px-3 py-2 font-semibold">Created</th>
                  <th className="text-center px-3 py-2 font-semibold">Status</th>
                  <th className="text-center px-3 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queue.map(({ review, batchItem, batchRef }) => (
                  <tr key={review.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2 text-xs font-mono text-slate-600">{review.ewo_ref}</td>
                    <td className="px-3 py-2 text-xs font-mono text-slate-500">{batchRef ?? 'N/A'}</td>
                    <td className="px-3 py-2 text-xs text-slate-500 max-w-xs truncate">{batchItem?.reason ?? review.original_outcome}</td>
                    <td className="px-3 py-2 text-center text-xs text-slate-600">
                      {batchItem ? `${Math.round(batchItem.confidence * 100)}%` : 'N/A'}
                    </td>
                    <td className="px-3 py-2">
                      {review.final_decision ? (
                        <span className="text-xs font-medium text-slate-600">{DECISION_LABELS[review.final_decision]}</span>
                      ) : (
                        <span className="text-xs text-slate-400">Pending</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{new Date(review.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${REVIEW_STATUS_COLOURS[review.review_status]}`}>
                        {review.review_status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => handleOpenReview(review.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-300"
                        aria-label={`Review ${review.ewo_ref}`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Review Detail Modal ─────────────────────────────────────────── */}
      {(detailLoading || detailData || detailError) && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4 sm:p-6" onClick={handleCloseDetail}>
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[85vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4 sticky top-0 bg-white pb-3 border-b border-slate-200 -mx-6 px-6 -mt-6 pt-6 z-10">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-primary-500" />
                <h3 className="text-base font-semibold text-slate-800">Review Detail</h3>
              </div>
              <button onClick={handleCloseDetail} className="text-slate-400 hover:text-slate-600" aria-label="Close review detail">
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading && (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                <span className="ml-2 text-sm text-slate-500">Loading review detail...</span>
              </div>
            )}

            {detailError && !detailLoading && (
              <div className="py-8">
                <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{detailError}</span>
                </div>
              </div>
            )}

            {detailData && !detailLoading && !detailError && (
              <ReviewDetailContent
                data={detailData}
                activeDecision={activeDecision}
                decisionNote={decisionNote}
                setDecisionNote={setDecisionNote}
                onSelectDecision={handleSelectDecision}
                selectedWorkOrderId={selectedWorkOrderId}
                setSelectedWorkOrderId={setSelectedWorkOrderId}
                workOrderSearch={workOrderSearch}
                setWorkOrderSearch={handleSearchWorkOrders}
                workOrderResults={workOrderResults}
                deferredUntil={deferredUntil}
                setDeferredUntil={setDeferredUntil}
                submitting={submitting}
                submitResult={submitResult}
                onSubmit={handleSubmitDecision}
                onCancelDecision={() => { setActiveDecision(null); setDecisionNote(''); setSubmitResult(null); }}
                onNavigate={onNavigate}
                onClose={handleCloseDetail}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Review Detail Content ──────────────────────────────────────────────────

function ReviewDetailContent({
  data, activeDecision, decisionNote, setDecisionNote, onSelectDecision,
  selectedWorkOrderId, setSelectedWorkOrderId, workOrderSearch, setWorkOrderSearch,
  workOrderResults, deferredUntil, setDeferredUntil, submitting, submitResult,
  onSubmit, onCancelDecision, onNavigate, onClose,
}: {
  data: ReviewDetailData;
  activeDecision: FinalDecision | null;
  decisionNote: string;
  setDecisionNote: (v: string) => void;
  onSelectDecision: (d: FinalDecision) => void;
  selectedWorkOrderId: string | null;
  setSelectedWorkOrderId: (v: string | null) => void;
  workOrderSearch: string;
  setWorkOrderSearch: (v: string) => void;
  workOrderResults: Array<{ id: string; ewo_ref: string; title: string; status: string }>;
  deferredUntil: string;
  setDeferredUntil: (v: string) => void;
  submitting: boolean;
  submitResult: { success: boolean; message: string } | null;
  onSubmit: () => void;
  onCancelDecision: () => void;
  onNavigate?: (section: string, objectRef?: string) => void;
  onClose: () => void;
}) {
  const { review, batchItem, batchRun, alert, evidence, proposedFields, conflicts, missingFields } = data;
  const isResolved = review.review_status === 'resolved' && review.final_decision;

  return (
    <div className="space-y-4">
      {/* Identity Section */}
      <Section title="Identity" icon={FileText}>
        <DataRow label="EWO Reference" value={review.ewo_ref} mono />
        <DataRow label="Alert ID" value={review.alert_id} mono />
        <DataRow label="Batch Reference" value={batchRun?.batch_ref ?? 'Not recorded'} mono />
        <DataRow label="Alert Classification" value={(alert?.alert_type as string) ?? 'Not recorded'} />
        <DataRow label="Original Alert Reason" value={(alert?.description as string) ?? batchItem?.reason ?? 'Not recorded'} />
        <DataRow label="Detection Source" value={(alert?.source as string) ?? 'Not recorded'} />
        <DataRow label="Detection Timestamp" value={alert?.created_at ? new Date(alert.created_at as string).toLocaleString() : 'Not recorded'} />
      </Section>

      {/* Candidate Work Order Data */}
      <Section title="Candidate Work Order Data" icon={AlertTriangle}>
        <DataRow label="Proposed Title" value={(proposedFields.title as string) ?? (evidenceSnapshotField(evidence, 'title')) ?? 'Not found'} />
        <DataRow label="Proposed Objective" value={(proposedFields.executive_summary as string) ?? (evidenceSnapshotField(evidence, 'executiveSummary')) ?? 'Not found'} />
        <DataRow label="Proposed Status" value="closed (historical)" />
        <DataRow label="Proposed Parent" value="Not applicable" />
        <DataRow label="Earliest Timestamp" value={evidenceSnapshotField(evidence, 'earliestTimestamp') ?? 'Not found'} />
        <DataRow label="Engineering Classification" value="historical_reconstruction" />
        <DataRow label="Fields Available" value={formatArray(batchItem?.fieldsReconstructed)} />
        <DataRow label="Fields Unknown" value={missingFields.length > 0 ? missingFields.join(', ') : 'None'} />
      </Section>

      {/* Evidence Section */}
      <Section title="Evidence" icon={Search}>
        <DataRow label="Evidence Sources Searched" value={formatArray(batchItem?.evidenceSearched)} />
        <DataRow label="Evidence Sources Found" value={formatArray(batchItem?.evidenceUsed)} />
        <DataRow label="Evidence Sources Used" value={formatArray(batchItem?.evidenceUsed)} />
        <DataRow label="Confidence Score" value={batchItem ? `${Math.round(batchItem.confidence * 100)}%` : 'Not recorded'} />
        <DataRow label="Engineering Plan" value={evidenceSnapshotField(evidence, 'engineeringPlan') ?? 'Not found'} />
        <DataRow label="Completion Report" value={evidenceSnapshotField(evidence, 'completionReport') ?? 'Not found'} />
        <DataRow label="Engineering Record" value={evidenceSnapshotField(evidence, 'engineeringRecord') ?? 'Not found'} />
        <DataRow label="Lifecycle Events" value={evidenceSnapshotField(evidence, 'lifecycleEvents') ?? 'Not found'} />
        <DataRow label="PO Testing Evidence" value={evidenceSnapshotField(evidence, 'poTestingEvidence') ?? 'Not found'} />
        <DataRow label="PO Acceptance Evidence" value={evidenceSnapshotField(evidence, 'poAcceptanceEvidence') ?? 'Not found'} />
      </Section>

      {/* Conflicts and Risks */}
      <Section title="Conflicts and Risks" icon={AlertCircle}>
        <DataRow label="Duplicate Candidates" value={(conflicts.duplicateCandidates as string) ?? 'Not found'} />
        <DataRow label="Conflicting References" value={(conflicts.conflictingReferences as string) ?? 'Not found'} />
        <DataRow label="Missing Required Fields" value={missingFields.length > 0 ? missingFields.join(', ') : 'None'} />
        <DataRow label="Confidence Score" value={batchItem ? `${Math.round(batchItem.confidence * 100)}%` : 'Not recorded'} />
        <DataRow label="Transaction Details" value={formatJson(batchItem?.transactionDetails)} />
      </Section>

      {/* Previous Decision (if resolved) */}
      {isResolved && (
        <Section title="Final Decision (Immutable)" icon={CheckCircle2}>
          <DataRow label="Decision" value={DECISION_LABELS[review.final_decision!]} />
          <DataRow label="Decision Note" value={review.decision_note ?? 'Not recorded'} />
          <DataRow label="Reviewed By" value={review.reviewed_by ?? 'Not recorded'} />
          <DataRow label="Reviewed At" value={review.reviewed_at ? new Date(review.reviewed_at).toLocaleString() : 'Not recorded'} />
          <DataRow label="Integrity Status Before" value={review.integrity_status_before ?? 'Not recorded'} />
          <DataRow label="Integrity Status After" value={review.integrity_status_after ?? 'Not recorded'} />
          <DataRow label="Revalidation Result" value={review.revalidation_result ?? 'Not recorded'} />
          {review.resulting_work_order_id && (
            <div className="pt-2">
              <button
                onClick={() => { onClose(); onNavigate?.('work-orders', review.resulting_work_order_id!); }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-800"
              >
                <ExternalLink className="w-3 h-3" />
                Open Resulting Work Order
              </button>
            </div>
          )}
        </Section>
      )}

      {/* Decision Actions (only if not resolved) */}
      {!isResolved && (
        <Section title="Product Owner Decision" icon={ClipboardCheck}>
          {!activeDecision ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(Object.keys(DECISION_LABELS) as FinalDecision[]).map(decision => {
                const Icon = DECISION_ICONS[decision];
                return (
                  <button
                    key={decision}
                    onClick={() => onSelectDecision(decision)}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-lg border transition-colors text-left ${DECISION_COLOURS[decision]}`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {DECISION_LABELS[decision]}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Decision confirmation */}
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                {(() => { const Icon = DECISION_ICONS[activeDecision]; return <Icon className="w-4 h-4" />; })()}
                {DECISION_LABELS[activeDecision]}
                <button onClick={onCancelDecision} className="ml-auto text-xs text-slate-400 hover:text-slate-600">Change</button>
              </div>

              {/* Work Order search for LINK_EXISTING_WORK_ORDER */}
              {activeDecision === 'LINK_EXISTING_WORK_ORDER' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500">Search for existing Work Order:</label>
                  <input
                    type="text"
                    value={workOrderSearch}
                    onChange={e => setWorkOrderSearch(e.target.value)}
                    placeholder="Search by EWO ref or title..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-300"
                  />
                  {workOrderResults.length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {workOrderResults.map(wo => (
                        <button
                          key={wo.id}
                          onClick={() => setSelectedWorkOrderId(wo.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg border transition-colors text-left ${selectedWorkOrderId === wo.id ? 'bg-primary-50 border-primary-300' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                        >
                          <span className="font-mono text-slate-600">{wo.ewo_ref}</span>
                          <span className="text-slate-500 truncate">{wo.title}</span>
                          <span className="ml-auto text-slate-400">{wo.status}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedWorkOrderId && (
                    <p className="text-xs text-green-600">Selected: {workOrderResults.find(w => w.id === selectedWorkOrderId)?.ewo_ref}</p>
                  )}
                </div>
              )}

              {/* Deferral date for DEFER_REVIEW */}
              {activeDecision === 'DEFER_REVIEW' && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Optional follow-up date:
                  </label>
                  <input
                    type="date"
                    value={deferredUntil}
                    onChange={e => setDeferredUntil(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-300"
                  />
                </div>
              )}

              {/* Decision note */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">Decision Note (required):</label>
                <textarea
                  value={decisionNote}
                  onChange={e => setDecisionNote(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-300 resize-y"
                  placeholder="Enter your decision note..."
                />
                <p className="text-xs text-slate-400">A context-aware default has been generated. Edit as needed before confirming.</p>
              </div>

              {/* Submit result feedback */}
              {submitResult && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${submitResult.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {submitResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{submitResult.message}</span>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={onCancelDecision}
                  disabled={submitting}
                  className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={onSubmit}
                  disabled={submitting || !decisionNote.trim() || (activeDecision === 'LINK_EXISTING_WORK_ORDER' && !selectedWorkOrderId)}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Confirm Decision
                </button>
              </div>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

// ─── Helper Components ──────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: { title: string; icon: typeof FileText; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-100 transition-colors"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        <Icon className="w-4 h-4 text-slate-500" />
        <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{title}</h4>
      </button>
      {expanded && (
        <div className="px-4 pb-3 pt-1 space-y-1.5">{children}</div>
      )}
    </div>
  );
}

function DataRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-slate-500 shrink-0 min-w-[140px]">{label}:</span>
      <span className={`text-slate-700 ${mono ? 'font-mono' : ''} break-words`}>{value}</span>
    </div>
  );
}

function evidenceSnapshotField(evidence: Record<string, unknown>, field: string): string | null {
  const val = evidence[field];
  if (val == null) return null;
  if (typeof val === 'string') return val || null;
  if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : null;
  return String(val);
}

function formatArray(arr: string[] | undefined): string {
  if (!arr || arr.length === 0) return 'None';
  return arr.join(', ');
}

function formatJson(val: unknown): string {
  if (val == null) return 'Not recorded';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}
