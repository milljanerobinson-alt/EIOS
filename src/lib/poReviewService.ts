import { supabase } from './supabase';
import type { BatchRunRecord, BatchItemResult, OutcomeClassification } from './integrityBatchService';

// ─── Types ──────────────────────────────────────────────────────────────────

export type FinalDecision =
  | 'APPROVE_HISTORICAL_RECOVERY'
  | 'LINK_EXISTING_WORK_ORDER'
  | 'INVALID_REFERENCE'
  | 'FALSE_POSITIVE'
  | 'DEFER_REVIEW'
  | 'NO_SAFE_RECOVERY';

export type ReviewStatus = 'pending' | 'deferred' | 'resolved';

export interface POReviewRecord {
  id: string;
  batch_run_id: string | null;
  batch_item_id: string | null;
  alert_id: string;
  ewo_ref: string;
  original_outcome: string;
  review_status: ReviewStatus;
  final_decision: FinalDecision | null;
  decision_note: string | null;
  selected_existing_work_order_id: string | null;
  resulting_work_order_id: string | null;
  evidence_snapshot: Record<string, unknown>;
  fields_approved: Record<string, unknown>;
  integrity_status_before: string | null;
  integrity_status_after: string | null;
  revalidation_result: string | null;
  transaction_details: Record<string, unknown>;
  deferred_until: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface POReviewQueueItem {
  review: POReviewRecord;
  batchItem: BatchItemResult | null;
  batchRef: string | null;
}

export interface ReviewDetailData {
  review: POReviewRecord;
  batchItem: BatchItemResult | null;
  batchRun: BatchRunRecord | null;
  alert: Record<string, unknown> | null;
  evidence: Record<string, unknown>;
  proposedFields: Record<string, unknown>;
  conflicts: Record<string, unknown>;
  missingFields: string[];
}

export interface ReprocessPreview {
  alerts: Array<{
    id: string;
    ewo_ref: string;
    classification: string;
    status: string;
    created_at: string;
    selection_order: number;
  }>;
  count: number;
  supersededBatchRef: string;
}

// ─── Queue ───────────────────────────────────────────────────────────────────

export async function getReviewQueue(
  filter: ReviewStatus | 'all' = 'all',
  batchRefFilter?: string,
  ewoRefFilter?: string,
  decisionFilter?: FinalDecision | 'all',
): Promise<POReviewQueueItem[]> {
  let query = supabase
    .from('engineering_integrity_po_reviews')
    .select('*')
    .order('created_at', { ascending: false });

  if (filter !== 'all') {
    query = query.eq('review_status', filter);
  }
  if (decisionFilter && decisionFilter !== 'all') {
    query = query.eq('final_decision', decisionFilter);
  }
  if (ewoRefFilter) {
    query = query.ilike('ewo_ref', `%${ewoRefFilter}%`);
  }

  const { data: reviews, error } = await query;

  if (error || !reviews) return [];

  const results: POReviewQueueItem[] = [];

  for (const review of reviews) {
    let batchItem: BatchItemResult | null = null;
    let batchRef: string | null = null;

    if (review.batch_item_id) {
      const { data: item } = await supabase
        .from('engineering_integrity_batch_items')
        .select('*')
        .eq('id', review.batch_item_id)
        .maybeSingle();
      if (item) {
        batchItem = {
          alertId: item.alert_id as string,
          ewoRef: item.ewo_ref as string | null,
          outcome: item.outcome as OutcomeClassification,
          reason: item.reason as string,
          evidenceSearched: (item.evidence_searched as string[]) ?? [],
          evidenceUsed: (item.evidence_used as string[]) ?? [],
          fieldsReconstructed: (item.fields_reconstructed as string[]) ?? [],
          missingFields: (item.missing_fields as string[]) ?? [],
          confidence: (item.confidence as number) ?? 0,
          canonicalWorkOrderId: (item.canonical_work_order_id as string) ?? null,
          transactionDetails: (item.transaction_details as Record<string, unknown>) ?? null,
          processedAt: (item.processed_at as string) ?? null,
        };
      }
    }

    if (review.batch_run_id) {
      const { data: run } = await supabase
        .from('engineering_integrity_batch_runs')
        .select('batch_ref')
        .eq('id', review.batch_run_id)
        .maybeSingle();
      batchRef = run?.batch_ref ?? null;
    }

    if (batchRefFilter && batchRef && !batchRef.toLowerCase().includes(batchRefFilter.toLowerCase())) {
      continue;
    }

    results.push({
      review: mapReviewRecord(review),
      batchItem,
      batchRef,
    });
  }

  return results;
}

export async function getReviewCount(): Promise<{ pending: number; deferred: number; resolved: number }> {
  const { data, error } = await supabase
    .from('engineering_integrity_po_reviews')
    .select('review_status');

  if (error || !data) return { pending: 0, deferred: 0, resolved: 0 };

  const counts = { pending: 0, deferred: 0, resolved: 0 };
  for (const row of data) {
    const status = row.review_status as ReviewStatus;
    if (status in counts) counts[status]++;
  }
  return counts;
}

// ─── Review Detail ───────────────────────────────────────────────────────────

export async function getReviewDetail(reviewId: string): Promise<ReviewDetailData | null> {
  const { data: review, error } = await supabase
    .from('engineering_integrity_po_reviews')
    .select('*')
    .eq('id', reviewId)
    .maybeSingle();

  if (error || !review) return null;

  let batchItem: BatchItemResult | null = null;
  let batchRun: BatchRunRecord | null = null;
  let alert: Record<string, unknown> | null = null;

  if (review.batch_item_id) {
    const { data: item } = await supabase
      .from('engineering_integrity_batch_items')
      .select('*')
      .eq('id', review.batch_item_id)
      .maybeSingle();
    if (item) {
      batchItem = {
        alertId: item.alert_id as string,
        ewoRef: item.ewo_ref as string | null,
        outcome: item.outcome as OutcomeClassification,
        reason: item.reason as string,
        evidenceSearched: (item.evidence_searched as string[]) ?? [],
        evidenceUsed: (item.evidence_used as string[]) ?? [],
        fieldsReconstructed: (item.fields_reconstructed as string[]) ?? [],
        missingFields: (item.missing_fields as string[]) ?? [],
        confidence: (item.confidence as number) ?? 0,
        canonicalWorkOrderId: (item.canonical_work_order_id as string) ?? null,
        transactionDetails: (item.transaction_details as Record<string, unknown>) ?? null,
        processedAt: (item.processed_at as string) ?? null,
      };
    }
  }

  if (review.batch_run_id) {
    const { data: run } = await supabase
      .from('engineering_integrity_batch_runs')
      .select('*')
      .eq('id', review.batch_run_id)
      .maybeSingle();
    if (run) {
      batchRun = run as unknown as BatchRunRecord;
    }
  }

  const { data: alertData } = await supabase
    .from('engineering_integrity_alerts')
    .select('*')
    .eq('id', review.alert_id)
    .maybeSingle();
  alert = alertData as Record<string, unknown> | null;

  const evidence = (review.evidence_snapshot as Record<string, unknown>) ?? {};
  const proposedFields = (review.fields_approved as Record<string, unknown>) ?? {};
  const missingFields = batchItem?.missingFields ?? [];
  const conflicts = extractConflicts(batchItem, alert);

  return {
    review: mapReviewRecord(review),
    batchItem,
    batchRun,
    alert,
    evidence,
    proposedFields,
    conflicts,
    missingFields,
  };
}

function extractConflicts(batchItem: BatchItemResult | null, alert: Record<string, unknown> | null): Record<string, unknown> {
  const conflicts: Record<string, unknown> = {};
  if (batchItem) {
    conflicts.reason = batchItem.reason;
    conflicts.confidence = batchItem.confidence;
    conflicts.transactionDetails = batchItem.transactionDetails;
  }
  if (alert) {
    conflicts.alertDescription = alert.description;
    conflicts.alertEvidence = alert.evidence;
    conflicts.classificationReason = alert.classification_reason;
  }
  return conflicts;
}

// ─── Create Reviews from Batch Items ─────────────────────────────────────────

export async function createReviewsForBatchItems(batchRunId: string): Promise<number> {
  const { data: items, error } = await supabase
    .from('engineering_integrity_batch_items')
    .select('*')
    .eq('batch_run_id', batchRunId)
    .eq('outcome', 'NEEDS_PRODUCT_OWNER_REVIEW');

  if (error || !items || items.length === 0) return 0;

  let created = 0;
  for (const item of items) {
    // Idempotency: check if review already exists for this batch item
    const { data: existing } = await supabase
      .from('engineering_integrity_po_reviews')
      .select('id')
      .eq('batch_item_id', item.id)
      .maybeSingle();

    if (existing) continue;

    const { error: insertError } = await supabase
      .from('engineering_integrity_po_reviews')
      .insert({
        batch_run_id: batchRunId,
        batch_item_id: item.id,
        alert_id: item.alert_id,
        ewo_ref: item.ewo_ref ?? 'Unknown',
        original_outcome: item.outcome,
        review_status: 'pending',
        evidence_snapshot: {
          evidence_searched: item.evidence_searched,
          evidence_used: item.evidence_used,
          fields_reconstructed: item.fields_reconstructed,
          missing_fields: item.missing_fields,
          confidence: item.confidence,
          reason: item.reason,
        },
        fields_approved: {},
      });

    if (!insertError) created++;
  }

  return created;
}

// ─── Decision Submission ─────────────────────────────────────────────────────

export interface DecisionRequest {
  reviewId: string;
  decision: FinalDecision;
  decisionNote: string;
  selectedExistingWorkOrderId?: string | null;
  deferredUntil?: string | null;
}

export interface DecisionResult {
  success: boolean;
  error?: string;
  resultingWorkOrderId?: string;
  revalidationResult?: string;
  alertStatusAfter?: string;
}

export async function submitDecision(req: DecisionRequest, reviewedBy: string = 'product_owner'): Promise<DecisionResult> {
  // Idempotency: check if already resolved
  const { data: existing, error: fetchError } = await supabase
    .from('engineering_integrity_po_reviews')
    .select('review_status, final_decision, alert_id, ewo_ref, batch_item_id')
    .eq('id', req.reviewId)
    .maybeSingle();

  if (fetchError || !existing) {
    return { success: false, error: 'Review not found.' };
  }

  if (existing.review_status === 'resolved' && existing.final_decision) {
    return { success: false, error: 'This review has already been finalised and cannot be changed.' };
  }

  const alertId = existing.alert_id as string;
  const ewoRef = existing.ewo_ref as string;
  const batchItemId = existing.batch_item_id as string | null;

  // Get current alert status
  const { data: alert } = await supabase
    .from('engineering_integrity_alerts')
    .select('status')
    .eq('id', alertId)
    .maybeSingle();
  const statusBefore = (alert?.status as string) ?? 'unknown';

  let resultingWorkOrderId: string | null = null;
  let revalidationResult = 'remains_open';
  let alertStatusAfter = statusBefore;

  // Execute decision-specific logic
  if (req.decision === 'APPROVE_HISTORICAL_RECOVERY') {
    // Rerun duplicate detection
    const { data: dupCheck } = await supabase
      .from('engineering_work_orders')
      .select('id')
      .eq('ewo_ref', ewoRef)
      .maybeSingle();

    if (dupCheck) {
      return { success: false, error: 'A canonical Work Order with this reference already exists. Use "Link to Existing Work Order" instead.' };
    }

    // Collect evidence for reconstruction
    const evidence = await collectEvidenceForRecovery(ewoRef);
    if (!evidence.title) {
      return { success: false, error: 'Insufficient evidence to create Work Order — no evidence-supported title found. Use "No Safe Historical Recovery" instead.' };
    }

    // Create canonical Work Order
    const insertData: Record<string, unknown> = {
      ewo_ref: ewoRef,
      title: evidence.title,
      executive_summary: evidence.executiveSummary ?? `Historical reconstruction approved by Product Owner. Evidence sources: ${evidence.sourcesUsed.join(', ')}.`,
      status: 'closed',
      priority: 'medium',
      risk_level: 'medium',
      owner: 'engineering',
      requested_by: 'product_owner_review',
      engineering_notes: `Historically reconstructed via PO Review. Decision note: ${req.decisionNote}. Evidence: ${evidence.sourcesUsed.join(', ')}. Missing: ${evidence.missingFields.join(', ')}.`,
    };
    if (evidence.earliestTimestamp) insertData.created_at = evidence.earliestTimestamp;

    const { data: newEwo, error: createError } = await supabase
      .from('engineering_work_orders')
      .insert(insertData)
      .select('id')
      .single();

    if (createError || !newEwo) {
      if (createError?.code === '23505') {
        return { success: false, error: 'A Work Order with this reference was created concurrently. Use "Link to Existing Work Order" instead.' };
      }
      return { success: false, error: `Failed to create Work Order: ${createError?.message ?? 'Unknown error'}` };
    }

    resultingWorkOrderId = newEwo.id;

    // Revalidate: check for duplicates
    const { data: postCheck } = await supabase
      .from('engineering_work_orders')
      .select('id')
      .eq('ewo_ref', ewoRef)
      .limit(5);

    if (postCheck && postCheck.length > 1) {
      // Rollback
      await supabase.from('engineering_work_orders').delete().eq('id', newEwo.id);
      return { success: false, error: 'Duplicate detected after creation — rolled back. Manual intervention required.' };
    }

    revalidationResult = 'resolved';
    alertStatusAfter = 'resolved';

    await supabase
      .from('engineering_integrity_alerts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: reviewedBy, resolution_notes: `Recovered via PO Review: ${req.decisionNote}` })
      .eq('id', alertId);

    // Update batch item outcome
    if (batchItemId) {
      await supabase
        .from('engineering_integrity_batch_items')
        .update({ outcome: 'RECOVERED_AFTER_PRODUCT_OWNER_REVIEW', canonical_work_order_id: newEwo.id })
        .eq('id', batchItemId);
    }

  } else if (req.decision === 'LINK_EXISTING_WORK_ORDER') {
    if (!req.selectedExistingWorkOrderId) {
      return { success: false, error: 'An existing Work Order must be selected.' };
    }

    const { data: linkedEwo } = await supabase
      .from('engineering_work_orders')
      .select('id, ewo_ref')
      .eq('id', req.selectedExistingWorkOrderId)
      .maybeSingle();

    if (!linkedEwo) {
      return { success: false, error: 'Selected Work Order not found.' };
    }

    resultingWorkOrderId = linkedEwo.id;

    // Revalidate: check if alert can be resolved
    const { data: ewoExists } = await supabase
      .from('engineering_work_orders')
      .select('id')
      .eq('ewo_ref', ewoRef)
      .maybeSingle();

    if (ewoExists) {
      revalidationResult = 'resolved';
      alertStatusAfter = 'resolved';
      await supabase
        .from('engineering_integrity_alerts')
        .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: reviewedBy, resolution_notes: `Linked to existing Work Order ${linkedEwo.ewo_ref}: ${req.decisionNote}` })
        .eq('id', alertId);
    } else {
      revalidationResult = 'remains_open';
      alertStatusAfter = statusBefore;
    }

    if (batchItemId) {
      await supabase
        .from('engineering_integrity_batch_items')
        .update({ outcome: 'LINKED_TO_EXISTING', canonical_work_order_id: linkedEwo.id })
        .eq('id', batchItemId);
    }

  } else if (req.decision === 'INVALID_REFERENCE') {
    revalidationResult = 'resolved';
    alertStatusAfter = 'resolved';
    await supabase
      .from('engineering_integrity_alerts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: reviewedBy, resolution_notes: `Rejected as invalid reference: ${req.decisionNote}` })
      .eq('id', alertId);

    if (batchItemId) {
      await supabase
        .from('engineering_integrity_batch_items')
        .update({ outcome: 'INVALID_REFERENCE' })
        .eq('id', batchItemId);
    }

  } else if (req.decision === 'FALSE_POSITIVE') {
    revalidationResult = 'resolved';
    alertStatusAfter = 'resolved';
    await supabase
      .from('engineering_integrity_alerts')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: reviewedBy, resolution_notes: `Marked as false positive: ${req.decisionNote}` })
      .eq('id', alertId);

    if (batchItemId) {
      await supabase
        .from('engineering_integrity_batch_items')
        .update({ outcome: 'FALSE_POSITIVE' })
        .eq('id', batchItemId);
    }

  } else if (req.decision === 'DEFER_REVIEW') {
    revalidationResult = 'remains_open';
    alertStatusAfter = statusBefore;
    // Alert stays open, review stays deferred

  } else if (req.decision === 'NO_SAFE_RECOVERY') {
    revalidationResult = 'remains_open';
    alertStatusAfter = statusBefore;
    // Alert stays open as a governed historical exception

    if (batchItemId) {
      await supabase
        .from('engineering_integrity_batch_items')
        .update({ outcome: 'NO_SAFE_RECOVERY' })
        .eq('id', batchItemId);
    }
  }

  // Persist the review decision
  const reviewStatus: ReviewStatus = req.decision === 'DEFER_REVIEW' ? 'deferred' : 'resolved';

  const { error: updateError } = await supabase
    .from('engineering_integrity_po_reviews')
    .update({
      review_status: reviewStatus,
      final_decision: req.decision,
      decision_note: req.decisionNote,
      selected_existing_work_order_id: req.selectedExistingWorkOrderId ?? null,
      resulting_work_order_id: resultingWorkOrderId,
      integrity_status_before: statusBefore,
      integrity_status_after: alertStatusAfter,
      revalidation_result: revalidationResult,
      transaction_details: { reviewed_at: new Date().toISOString(), ewo_ref: ewoRef },
      deferred_until: req.deferredUntil ?? null,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.reviewId);

  if (updateError) {
    return { success: false, error: `Failed to persist decision: ${updateError.message}` };
  }

  return {
    success: true,
    resultingWorkOrderId: resultingWorkOrderId ?? undefined,
    revalidationResult,
    alertStatusAfter,
  };
}

// ─── Evidence Collection for Recovery ─────────────────────────────────────────

async function collectEvidenceForRecovery(ewoRef: string): Promise<{
  title: string | null;
  executiveSummary: string | null;
  sourcesUsed: string[];
  missingFields: string[];
  confidence: number;
  earliestTimestamp: string | null;
}> {
  const sourcesUsed: string[] = [];
  const missingFields: string[] = [];
  let title: string | null = null;
  let executiveSummary: string | null = null;
  let earliestTimestamp: string | null = null;

  try {
    sourcesUsed.push('engineering_plans');
    const { data } = await supabase
      .from('engineering_plans')
      .select('ewo_ref, title, executive_summary, created_at')
      .eq('ewo_ref', ewoRef)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) {
      title = data.title ?? title;
      executiveSummary = data.executive_summary ?? executiveSummary;
      if (data.created_at) earliestTimestamp = earliestTimestamp ?? data.created_at;
    }
  } catch { /* table may not exist */ }

  try {
    sourcesUsed.push('engineering_records_library');
    const { data } = await supabase
      .from('engineering_records_library')
      .select('ewo_ref, title, created_at')
      .eq('ewo_ref', ewoRef)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) {
      title = title ?? data.title;
      if (data.created_at) earliestTimestamp = earliestTimestamp ?? data.created_at;
    }
  } catch { /* table may not exist */ }

  try {
    sourcesUsed.push('ewo_completion_reports');
    const { data } = await supabase
      .from('ewo_completion_reports')
      .select('ewo_ref, title, report_body, created_at')
      .eq('ewo_ref', ewoRef)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) {
      title = title ?? data.title;
      executiveSummary = executiveSummary ?? data.report_body;
      if (data.created_at) earliestTimestamp = earliestTimestamp ?? data.created_at;
    }
  } catch { /* table may not exist */ }

  if (!title) missingFields.push('title');
  if (!executiveSummary) missingFields.push('executive_summary');
  if (!earliestTimestamp) missingFields.push('earliest_timestamp');

  const criticalFields = ['title', 'executive_summary', 'earliest_timestamp'];
  const criticalFound = criticalFields.filter(f => !missingFields.includes(f));
  const confidence = criticalFields.length > 0 ? criticalFound.length / criticalFields.length : 0;

  return { title, executiveSummary, sourcesUsed, missingFields, confidence, earliestTimestamp };
}

// ─── Default Decision Note Generator ─────────────────────────────────────────

export function generateDefaultDecisionNote(
  ewoRef: string,
  batchRef: string | null,
  decision: FinalDecision,
  evidenceSources: string[],
  missingFields: string[],
): string {
  const evidenceStr = evidenceSources.length > 0 ? evidenceSources.join(', ') : 'No evidence sources found';
  const missingStr = missingFields.length > 0 ? `Missing fields: ${missingFields.join(', ')}.` : 'All critical fields available.';
  const batchStr = batchRef ? `Batch: ${batchRef}.` : 'No batch reference recorded.';

  const decisionContext: Record<FinalDecision, string> = {
    APPROVE_HISTORICAL_RECOVERY: `Evidence supports creating canonical Work Order ${ewoRef}. ${batchStr} Evidence reviewed: ${evidenceStr}. ${missingStr} No existing duplicate detected. Approved for historical reconstruction.`,
    LINK_EXISTING_WORK_ORDER: `Reference ${ewoRef} corresponds to an existing canonical Work Order. ${batchStr} Evidence reviewed: ${evidenceStr}. No new Work Order created. Linked to existing record.`,
    INVALID_REFERENCE: `Reference ${ewoRef} does not conform to canonical Engineering Work Order format. ${batchStr} No Work Order created. Reference rejected as invalid.`,
    FALSE_POSITIVE: `Reconciliation engine incorrectly flagged ${ewoRef} as a missing Work Order. ${batchStr} Evidence reviewed: ${evidenceStr}. No Work Order created. Alert resolved as false positive.`,
    DEFER_REVIEW: `Further investigation required for ${ewoRef}. ${batchStr} Evidence reviewed: ${evidenceStr}. ${missingStr} Review deferred pending additional evidence.`,
    NO_SAFE_RECOVERY: `Evidence indicates reference ${ewoRef} existed but insufficient evidence to safely reconstruct canonical Work Order. ${batchStr} Evidence reviewed: ${evidenceStr}. ${missingStr} No Work Order fabricated. Recorded as governed historical exception.`,
  };

  return decisionContext[decision];
}

// ─── Supersession & Reprocess ────────────────────────────────────────────────

export async function getSupersededBatch(batchRunId: string): Promise<BatchRunRecord | null> {
  const { data, error } = await supabase
    .from('engineering_integrity_batch_runs')
    .select('*')
    .eq('id', batchRunId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as BatchRunRecord;
}

export async function getReplacementBatch(batchRunId: string): Promise<BatchRunRecord | null> {
  const { data, error } = await supabase
    .from('engineering_integrity_batch_runs')
    .select('*')
    .eq('superseded_by', batchRunId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as BatchRunRecord;
}

export async function linkReplacementBatch(originalBatchRunId: string, replacementBatchRunId: string): Promise<boolean> {
  const { error } = await supabase
    .from('engineering_integrity_batch_runs')
    .update({ superseded_by: replacementBatchRunId })
    .eq('id', originalBatchRunId);
  return !error;
}

export async function getReprocessPreview(originalBatchRunId: string, batchSize: number = 25): Promise<ReprocessPreview | null> {
  const { data: originalBatch } = await supabase
    .from('engineering_integrity_batch_runs')
    .select('batch_ref, alert_type')
    .eq('id', originalBatchRunId)
    .maybeSingle();

  if (!originalBatch) return null;

  // Get current open alerts of the same type
  const { data: alerts, error } = await supabase
    .from('engineering_integrity_alerts')
    .select('id, normalised_reference, raw_reference, alert_type, status, created_at')
    .eq('alert_type', originalBatch.alert_type)
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(batchSize);

  if (error || !alerts) return null;

  return {
    alerts: alerts.map((a: Record<string, unknown>, i: number) => ({
      id: a.id as string,
      ewo_ref: (a.normalised_reference ?? a.raw_reference ?? 'Unknown') as string,
      classification: (a.alert_type as string) ?? 'unknown',
      status: (a.status as string) ?? 'unknown',
      created_at: (a.created_at as string) ?? 'Not recorded',
      selection_order: i + 1,
    })),
    count: alerts.length,
    supersededBatchRef: originalBatch.batch_ref as string,
  };
}

// ─── Search Existing Work Orders ─────────────────────────────────────────────

export async function searchExistingWorkOrders(query: string): Promise<Array<{ id: string; ewo_ref: string; title: string; status: string }>> {
  if (!query || query.length < 2) return [];

  const { data, error } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, status')
    .or(`ewo_ref.ilike.%${query}%,title.ilike.%${query}%`)
    .limit(10);

  if (error || !data) return [];
  return data as Array<{ id: string; ewo_ref: string; title: string; status: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapReviewRecord(d: Record<string, unknown>): POReviewRecord {
  return {
    id: d.id as string,
    batch_run_id: (d.batch_run_id as string) ?? null,
    batch_item_id: (d.batch_item_id as string) ?? null,
    alert_id: d.alert_id as string,
    ewo_ref: d.ewo_ref as string,
    original_outcome: (d.original_outcome as string) ?? 'NEEDS_PRODUCT_OWNER_REVIEW',
    review_status: (d.review_status as ReviewStatus) ?? 'pending',
    final_decision: (d.final_decision as FinalDecision) ?? null,
    decision_note: (d.decision_note as string) ?? null,
    selected_existing_work_order_id: (d.selected_existing_work_order_id as string) ?? null,
    resulting_work_order_id: (d.resulting_work_order_id as string) ?? null,
    evidence_snapshot: (d.evidence_snapshot as Record<string, unknown>) ?? {},
    fields_approved: (d.fields_approved as Record<string, unknown>) ?? {},
    integrity_status_before: (d.integrity_status_before as string) ?? null,
    integrity_status_after: (d.integrity_status_after as string) ?? null,
    revalidation_result: (d.revalidation_result as string) ?? null,
    transaction_details: (d.transaction_details as Record<string, unknown>) ?? {},
    deferred_until: (d.deferred_until as string) ?? null,
    reviewed_by: (d.reviewed_by as string) ?? null,
    reviewed_at: (d.reviewed_at as string) ?? null,
    created_at: (d.created_at as string) ?? '',
    updated_at: (d.updated_at as string) ?? '',
  };
}
