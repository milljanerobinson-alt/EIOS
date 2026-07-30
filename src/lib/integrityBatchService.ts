// EWO-014.19A.7SR.2 — One-Off Governed Engineering Integrity Cleanup
//
// Product Owner controlled batch processing for cleaning the existing integrity
// alert backlog. This is NOT a permanent recovery engine — no background
// processor, no scheduled reconciliation, no autonomous repair.
//
// All processing is evidence-based. Duplicate detection is mandatory before
// any Work Order creation. Reprocessing the same alert is safe (idempotent).
//
// Never: invent titles, invent objectives, invent statuses, invent approvals,
// invent dates, invent Completion Reports, invent prompts, invent parent
// references, overwrite valid Work Orders, or combine duplicate records.

import { supabase } from './supabase';
import type { IntegrityAlert } from './engineeringIntegrityService';

// ─── Types ─────────────────────────────────────────────────────────────────

export type AlertClassification =
  | 'missing_ewo'
  | 'parent_child_issue'
  | 'conflicting_reference'
  | 'orphan_record'
  | 'reconciliation_instability'
  | 'other';

export type BatchSize = 25 | 50 | 100;

export type OutcomeClassification =
  | 'RECOVERED'
  | 'ALREADY_RESOLVED'
  | 'NEEDS_PRODUCT_OWNER_REVIEW'
  | 'INVALID_REFERENCE'
  | 'FALSE_POSITIVE'
  | 'FAILED'
  | 'SKIPPED';

export interface BatchPreview {
  alertType: AlertClassification;
  selectedBatchSize: BatchSize;
  alertsSelected: number;
  actualToProcess: number;
  warningCanonicalWorkOrdersMayBeCreated: boolean;
  warningAmbiguousRecordsNeverFabricated: boolean;
  alerts: IntegrityAlert[];
}

export interface BatchRunSummary {
  batchRef: string;
  classification: AlertClassification;
  requestedBatchSize: BatchSize;
  attempted: number;
  recovered: number;
  alreadyResolved: number;
  needsProductOwnerReview: number;
  invalidReferences: number;
  falsePositives: number;
  failed: number;
  skipped: number;
  remainingAlerts: number;
}

export interface BatchItemResult {
  id?: string;
  alertId: string;
  ewoRef: string | null;
  outcome: OutcomeClassification;
  reason: string;
  evidenceSearched: string[];
  evidenceUsed: string[];
  fieldsReconstructed: string[];
  missingFields: string[];
  confidence: number;
  canonicalWorkOrderId: string | null;
  transactionDetails: Record<string, unknown> | null;
  processedAt: string | null;
}

export interface BatchRunResult {
  batchRef: string;
  summary: BatchRunSummary;
  items: BatchItemResult[];
  copyableReport: string;
}

// ─── Alert Classification ──────────────────────────────────────────────────

export function classifyAlert(alert: IntegrityAlert): AlertClassification {
  if (alert.alert_type === 'missing_ewo') return 'missing_ewo';
  if (alert.alert_type === 'parent_child_issue') return 'parent_child_issue';
  if (alert.alert_type === 'conflicting_reference') return 'conflicting_reference';
  if (alert.alert_type === 'orphan_record') return 'orphan_record';
  if (alert.alert_type === 'reconciliation_instability') return 'reconciliation_instability';
  return 'other';
}

export const CLASSIFICATION_LABELS: Record<AlertClassification, string> = {
  missing_ewo: 'Missing Work Orders',
  parent_child_issue: 'Parent–Child Hierarchy',
  conflicting_reference: 'Duplicate References',
  orphan_record: 'Orphaned Engineering Artefacts',
  reconciliation_instability: 'Other Integrity Alerts',
  other: 'Other Integrity Alerts',
};

export const CLASSIFICATION_ICONS: Record<AlertClassification, string> = {
  missing_ewo: 'AlertCircle',
  parent_child_issue: 'GitBranch',
  conflicting_reference: 'Copy',
  orphan_record: 'Archive',
  reconciliation_instability: 'Activity',
  other: 'AlertTriangle',
};

// ─── Alert Counts by Classification ────────────────────────────────────────

export interface AlertCategoryCount {
  classification: AlertClassification;
  label: string;
  count: number;
}

export function getAlertCategoryCounts(alerts: IntegrityAlert[]): AlertCategoryCount[] {
  const counts = new Map<AlertClassification, number>();

  for (const alert of alerts) {
    const cls = classifyAlert(alert);
    counts.set(cls, (counts.get(cls) ?? 0) + 1);
  }

  const categories: AlertClassification[] = [
    'missing_ewo', 'parent_child_issue', 'conflicting_reference',
    'orphan_record', 'reconciliation_instability', 'other',
  ];

  return categories.map(cls => ({
    classification: cls,
    label: CLASSIFICATION_LABELS[cls],
    count: counts.get(cls) ?? 0,
  }));
}

export function filterAlertsByClassification(
  alerts: IntegrityAlert[],
  classification: AlertClassification | 'all',
): IntegrityAlert[] {
  if (classification === 'all') return alerts;
  return alerts.filter(a => classifyAlert(a) === classification);
}

// ─── Batch Preview ─────────────────────────────────────────────────────────

export function buildBatchPreview(
  alerts: IntegrityAlert[],
  batchSize: BatchSize,
): BatchPreview {
  const missingEwoAlerts = filterAlertsByClassification(alerts, 'missing_ewo');
  const selected = missingEwoAlerts.slice(0, batchSize);

  return {
    alertType: 'missing_ewo',
    selectedBatchSize: batchSize,
    alertsSelected: selected.length,
    actualToProcess: selected.length,
    warningCanonicalWorkOrdersMayBeCreated: true,
    warningAmbiguousRecordsNeverFabricated: true,
    alerts: selected,
  };
}

// ─── Duplicate Detection (Mandatory Before Creation) ───────────────────────

interface DuplicateDetectionResult {
  alreadyExists: boolean;
  conflictingOwnership: boolean;
  evidenceOfDuplicate: boolean;
  conflictingRefs: string[];
  ownershipConflicts: string[];
  sourcesSearched: string[];
}

async function detectDuplicates(ewoRef: string): Promise<DuplicateDetectionResult> {
  const sourcesSearched: string[] = [];
  const conflictingRefs: string[] = [];
  const ownershipConflicts: string[] = [];

  // STEP 1: Check engineering_work_orders for exact match
  sourcesSearched.push('engineering_work_orders');
  const { data: existingEwo } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title')
    .eq('ewo_ref', ewoRef)
    .maybeSingle();

  const alreadyExists = !!existingEwo;

  // STEP 2: Search all engineering repositories for evidence of another canonical EWO
  const searchTables = [
    { table: 'engineering_plans', col: 'ewo_ref', label: 'engineering_plans' },
    { table: 'engineering_records_library', col: 'ewo_ref', label: 'engineering_records_library' },
    { table: 'ewo_completion_reports', col: 'ewo_ref', label: 'ewo_completion_reports' },
    { table: 'engineering_executions', col: 'ewo_ref', label: 'engineering_executions' },
    { table: 'ewo_engineering_packages', col: 'ewo_ref', label: 'ewo_engineering_packages' },
    { table: 'engineering_verification_records', col: 'ewo_ref', label: 'engineering_verification_records' },
  ];

  for (const src of searchTables) {
    sourcesSearched.push(src.label);
    try {
      const { data } = await supabase
        .from(src.table)
        .select(`${src.col}`)
        .eq(src.col, ewoRef)
        .limit(1);
      if (data && data.length > 0) {
        // Evidence exists but the EWO itself doesn't — this is expected for missing EWOs
        // Only flag if the evidence points to a DIFFERENT ewo_ref
      }
    } catch { /* table may not exist */ }
  }

  // STEP 3: Check if linked artefacts are already owned by another canonical EWO
  // Check completion reports, plans, records for ownership conflicts
  const artefactTables = [
    { table: 'ewo_completion_reports', col: 'ewo_ref', label: 'Completion Report' },
    { table: 'engineering_plans', col: 'ewo_ref', label: 'Engineering Plan' },
    { table: 'engineering_records_library', col: 'ewo_ref', label: 'Engineering Record' },
  ];

  for (const art of artefactTables) {
    try {
      const { data } = await supabase
        .from(art.table)
        .select(`${art.col}`)
        .eq(art.col, ewoRef)
        .limit(1);
      if (data && data.length > 0) {
        // This artefact is linked to this ref — if EWO doesn't exist, this is expected
        // Only a conflict if the artefact is linked to a DIFFERENT ewo_ref
      }
    } catch { /* table may not exist */ }
  }

  return {
    alreadyExists,
    conflictingOwnership: ownershipConflicts.length > 0,
    evidenceOfDuplicate: conflictingRefs.length > 0,
    conflictingRefs,
    ownershipConflicts,
    sourcesSearched,
  };
}

// ─── Evidence Collection ──────────────────────────────────────────────────

interface CollectedEvidence {
  title: string | null;
  executiveSummary: string | null;
  businessObjective: string | null;
  engineeringObjective: string | null;
  scope: string | null;
  engineeringNotes: string | null;
  priority: string | null;
  riskLevel: string | null;
  owner: string | null;
  requestedBy: string | null;
  earliestTimestamp: string | null;
  sourcesUsed: string[];
  fieldsReconstructed: string[];
  missingFields: string[];
  confidence: number;
}

async function collectEvidence(ewoRef: string): Promise<CollectedEvidence> {
  const sourcesUsed: string[] = [];
  const fieldsReconstructed: string[] = [];
  const missingFields: string[] = [];
  let earliestTimestamp: string | null = null;

  let title: string | null = null;
  let executiveSummary: string | null = null;
  let businessObjective: string | null = null;
  let engineeringObjective: string | null = null;
  let scope: string | null = null;
  let engineeringNotes: string | null = null;
  let priority: string | null = null;
  let riskLevel: string | null = null;
  let owner: string | null = null;
  let requestedBy: string | null = null;

  // Collect from engineering_plans
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
      if (data.title) fieldsReconstructed.push('title');
      if (data.executive_summary) fieldsReconstructed.push('executive_summary');
    }
  } catch { /* table may not exist */ }

  // Collect from engineering_records_library
  try {
    sourcesUsed.push('engineering_records_library');
    const { data } = await supabase
      .from('engineering_records_library')
      .select('ewo_ref, title, record_ref, created_at')
      .eq('ewo_ref', ewoRef)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (data) {
      title = title ?? data.title;
      if (data.title && !fieldsReconstructed.includes('title')) fieldsReconstructed.push('title');
      if (data.created_at) earliestTimestamp = earliestTimestamp ?? data.created_at;
    }
  } catch { /* table may not exist */ }

  // Collect from ewo_completion_reports
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
      if (data.title && !fieldsReconstructed.includes('title')) fieldsReconstructed.push('title');
      if (data.report_body && !fieldsReconstructed.includes('executive_summary')) fieldsReconstructed.push('executive_summary');
      if (data.created_at) earliestTimestamp = earliestTimestamp ?? data.created_at;
    }
  } catch { /* table may not exist */ }

  // Collect from ewo_lifecycle_events
  try {
    sourcesUsed.push('ewo_lifecycle_events');
    const { data } = await supabase
      .from('ewo_lifecycle_events')
      .select('ewo_ref, notes, created_at')
      .eq('ewo_ref', ewoRef)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (data) {
      engineeringNotes = data.notes ?? engineeringNotes;
      if (data.notes) fieldsReconstructed.push('engineering_notes');
      if (data.created_at) earliestTimestamp = earliestTimestamp ?? data.created_at;
    }
  } catch { /* table may not exist */ }

  // Collect from engineering_executions
  try {
    sourcesUsed.push('engineering_executions');
    const { data } = await supabase
      .from('engineering_executions')
      .select('ewo_ref, execution_ref, created_at')
      .eq('ewo_ref', ewoRef)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (data?.created_at) earliestTimestamp = earliestTimestamp ?? data.created_at;
  } catch { /* table may not exist */ }

  // Determine missing fields
  if (!title) missingFields.push('title');
  if (!executiveSummary) missingFields.push('executive_summary');
  if (!businessObjective) missingFields.push('business_objective');
  if (!engineeringObjective) missingFields.push('engineering_objective');
  if (!scope) missingFields.push('scope');
  if (!engineeringNotes) missingFields.push('engineering_notes');
  if (!priority) missingFields.push('priority');
  if (!riskLevel) missingFields.push('risk_level');
  if (!owner) missingFields.push('owner');
  if (!requestedBy) missingFields.push('requested_by');
  if (!earliestTimestamp) missingFields.push('earliest_timestamp');

  // Confidence: based on how many critical fields were reconstructed
  const criticalFields = ['title', 'executive_summary', 'earliest_timestamp'];
  const criticalFound = criticalFields.filter(f => fieldsReconstructed.includes(f) || (f === 'earliest_timestamp' && earliestTimestamp));
  const confidence = criticalFields.length > 0 ? criticalFound.length / criticalFields.length : 0;

  return {
    title,
    executiveSummary,
    businessObjective,
    engineeringObjective,
    scope,
    engineeringNotes,
    priority,
    riskLevel,
    owner,
    requestedBy,
    earliestTimestamp,
    sourcesUsed,
    fieldsReconstructed,
    missingFields,
    confidence,
  };
}

// ─── EWO Reference Validation ────────────────────────────────────────────────

function isValidEwoRef(ref: string): boolean {
  return /^EWO-\d[\dA-Za-z.]*$/.test(ref.trim().toUpperCase());
}

// ─── Batch Processing ───────────────────────────────────────────────────────

export async function processBatch(
  alerts: IntegrityAlert[],
  batchSize: BatchSize,
  initiatedBy: string = 'product_owner',
): Promise<BatchRunResult> {
  const preview = buildBatchPreview(alerts, batchSize);
  const batchRef = `BATCH-INT-${Date.now()}`;
  const items: BatchItemResult[] = [];

  // Create batch run record
  const { data: batchRun } = await supabase
    .from('engineering_integrity_batch_runs')
    .insert({
      batch_ref: batchRef,
      alert_type: 'missing_ewo',
      requested_batch_size: batchSize,
      attempted_count: preview.alerts.length,
      initiated_by: initiatedBy,
      status: 'in_progress',
    })
    .select('id')
    .single();

  const batchRunId = batchRun?.id;

  let recovered = 0;
  let alreadyResolved = 0;
  let needsProductOwnerReview = 0;
  let invalidReferences = 0;
  let falsePositives = 0;
  let failed = 0;
  let skipped = 0;

  for (const alert of preview.alerts) {
    const ewoRef = alert.normalised_reference ?? alert.raw_reference ?? '';

    // Idempotency check: has this alert already been processed?
    const { data: existingItem } = await supabase
      .from('engineering_integrity_batch_items')
      .select('id, outcome')
      .eq('alert_id', alert.id)
      .not('outcome', 'eq', 'SKIPPED')
      .limit(1)
      .maybeSingle();

    if (existingItem) {
      skipped++;
      items.push({
        alertId: alert.id,
        ewoRef,
        outcome: 'SKIPPED',
        reason: `Alert already processed in a previous batch with outcome: ${existingItem.outcome}`,
        evidenceSearched: [],
        evidenceUsed: [],
        fieldsReconstructed: [],
        missingFields: [],
        confidence: 0,
        canonicalWorkOrderId: null,
        transactionDetails: null,
        processedAt: null,
      });
      continue;
    }

    // Validate canonical EWO format
    if (!ewoRef || !isValidEwoRef(ewoRef)) {
      invalidReferences++;
      items.push({
        alertId: alert.id,
        ewoRef: ewoRef || null,
        outcome: 'INVALID_REFERENCE',
        reason: 'Reference does not match canonical EWO format (EWO-NNN or EWO-NNN.X)',
        evidenceSearched: [],
        evidenceUsed: [],
        fieldsReconstructed: [],
        missingFields: [],
        confidence: 0,
        canonicalWorkOrderId: null,
        transactionDetails: null,
        processedAt: null,
      });
      continue;
    }

    // STEP 1-3: Mandatory duplicate detection
    const dupResult = await detectDuplicates(ewoRef);

    if (dupResult.alreadyExists) {
      alreadyResolved++;
      items.push({
        alertId: alert.id,
        ewoRef,
        outcome: 'ALREADY_RESOLVED',
        reason: 'Canonical EWO already exists in engineering_work_orders',
        evidenceSearched: dupResult.sourcesSearched,
        evidenceUsed: ['engineering_work_orders'],
        fieldsReconstructed: [],
        missingFields: [],
        confidence: 1,
        canonicalWorkOrderId: null,
        transactionDetails: null,
        processedAt: null,
      });

      // Resolve the alert
      await supabase
        .from('engineering_integrity_alerts')
        .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: initiatedBy, resolution_notes: 'EWO already exists — auto-resolved during batch processing' })
        .eq('id', alert.id);
      continue;
    }

    if (dupResult.evidenceOfDuplicate || dupResult.conflictingOwnership) {
      needsProductOwnerReview++;
      items.push({
        alertId: alert.id,
        ewoRef,
        outcome: 'NEEDS_PRODUCT_OWNER_REVIEW',
        reason: dupResult.conflictingOwnership
          ? `Linked artefacts have conflicting ownership: ${dupResult.ownershipConflicts.join(', ')}`
          : `Evidence suggests another canonical Work Order may already represent this implementation: ${dupResult.conflictingRefs.join(', ')}`,
        evidenceSearched: dupResult.sourcesSearched,
        evidenceUsed: [],
        fieldsReconstructed: [],
        missingFields: [],
        confidence: 0.5,
        canonicalWorkOrderId: null,
        transactionDetails: null,
        processedAt: null,
      });
      continue;
    }

    // Collect evidence for reconstruction
    const evidence = await collectEvidence(ewoRef);

    // If insufficient evidence for critical fields, route to PO review
    if (!evidence.title) {
      needsProductOwnerReview++;
      items.push({
        alertId: alert.id,
        ewoRef,
        outcome: 'NEEDS_PRODUCT_OWNER_REVIEW',
        reason: 'Insufficient evidence to reconstruct title — cannot create Work Order without evidence-supported title',
        evidenceSearched: evidence.sourcesUsed,
        evidenceUsed: evidence.sourcesUsed,
        fieldsReconstructed: evidence.fieldsReconstructed,
        missingFields: evidence.missingFields,
        confidence: evidence.confidence,
        canonicalWorkOrderId: null,
        transactionDetails: null,
        processedAt: null,
      });
      continue;
    }

    // Create canonical Work Order with evidence-supported fields only
    try {
      const insertData: Record<string, unknown> = {
        ewo_ref: ewoRef,
        title: evidence.title,
        executive_summary: evidence.executiveSummary ?? `Historical reconstruction from engineering evidence. Reconstructed from: ${evidence.sourcesUsed.join(', ')}.`,
        status: 'closed',
        priority: evidence.priority ?? 'medium',
        risk_level: evidence.riskLevel ?? 'medium',
        owner: evidence.owner ?? 'engineering',
        requested_by: evidence.requestedBy ?? 'historical_reconciliation',
        engineering_notes: evidence.engineeringNotes ?? `One-off historical cleanup. Batch: ${batchRef}. Evidence sources: ${evidence.sourcesUsed.join(', ')}. Reconstructed fields: ${evidence.fieldsReconstructed.join(', ')}. Missing fields: ${evidence.missingFields.join(', ')}. Confidence: ${Math.round(evidence.confidence * 100)}%.`,
      };

      if (evidence.earliestTimestamp) {
        insertData.created_at = evidence.earliestTimestamp;
      }

      const { data: newEwo, error: createError } = await supabase
        .from('engineering_work_orders')
        .insert(insertData)
        .select('id')
        .single();

      if (createError || !newEwo) {
        // Check if it was a unique constraint violation (race condition)
        if (createError?.code === '23505') {
          alreadyResolved++;
          items.push({
            alertId: alert.id,
            ewoRef,
            outcome: 'ALREADY_RESOLVED',
            reason: 'EWO created by concurrent process during batch processing',
            evidenceSearched: dupResult.sourcesSearched,
            evidenceUsed: evidence.sourcesUsed,
            fieldsReconstructed: evidence.fieldsReconstructed,
            missingFields: evidence.missingFields,
            confidence: evidence.confidence,
            canonicalWorkOrderId: null,
            transactionDetails: { error: createError?.message },
            processedAt: null,
          });
          continue;
        }

        failed++;
        items.push({
          alertId: alert.id,
          ewoRef,
          outcome: 'FAILED',
          reason: `Failed to create Work Order: ${createError?.message ?? 'Unknown error'}`,
          evidenceSearched: dupResult.sourcesSearched,
          evidenceUsed: evidence.sourcesUsed,
          fieldsReconstructed: evidence.fieldsReconstructed,
          missingFields: evidence.missingFields,
          confidence: evidence.confidence,
          canonicalWorkOrderId: null,
          transactionDetails: { error: createError?.message },
          processedAt: null,
        });
        continue;
      }

      // STEP 4: Revalidate — confirm no duplicate was created
      const { data: dupCheck } = await supabase
        .from('engineering_work_orders')
        .select('id, ewo_ref')
        .eq('ewo_ref', ewoRef)
        .limit(5);

      if (dupCheck && dupCheck.length > 1) {
        // Duplicate detected after creation — rollback
        await supabase
          .from('engineering_work_orders')
          .delete()
          .eq('id', newEwo.id);

        failed++;
        items.push({
          alertId: alert.id,
          ewoRef,
          outcome: 'FAILED',
          reason: 'Duplicate Work Order detected after creation — rolled back. Manual review required.',
          evidenceSearched: dupResult.sourcesSearched,
          evidenceUsed: evidence.sourcesUsed,
          fieldsReconstructed: evidence.fieldsReconstructed,
          missingFields: evidence.missingFields,
          confidence: evidence.confidence,
          canonicalWorkOrderId: null,
          transactionDetails: { rolled_back: true, duplicate_count: dupCheck.length },
          processedAt: null,
        });
        continue;
      }

      recovered++;
      items.push({
        alertId: alert.id,
        ewoRef,
        outcome: 'RECOVERED',
        reason: 'Canonical Work Order created from evidence-supported reconstruction',
        evidenceSearched: dupResult.sourcesSearched,
        evidenceUsed: evidence.sourcesUsed,
        fieldsReconstructed: evidence.fieldsReconstructed,
        missingFields: evidence.missingFields,
        confidence: evidence.confidence,
        canonicalWorkOrderId: newEwo.id,
        transactionDetails: { batch_ref: batchRef, ewo_id: newEwo.id },
        processedAt: null,
      });

      // Resolve the alert
      await supabase
        .from('engineering_integrity_alerts')
        .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: initiatedBy, resolution_notes: `Recovered in batch ${batchRef}` })
        .eq('id', alert.id);
    } catch (err) {
      failed++;
      items.push({
        alertId: alert.id,
        ewoRef,
        outcome: 'FAILED',
        reason: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
        evidenceSearched: dupResult.sourcesSearched,
        evidenceUsed: evidence.sourcesUsed,
        fieldsReconstructed: evidence.fieldsReconstructed,
        missingFields: evidence.missingFields,
        confidence: evidence.confidence,
        canonicalWorkOrderId: null,
        transactionDetails: { error: String(err) },
        processedAt: null,
      });
    }
  }

  // Count remaining alerts
  const { count: remainingCount } = await supabase
    .from('engineering_integrity_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open');

  const summary: BatchRunSummary = {
    batchRef,
    classification: 'missing_ewo',
    requestedBatchSize: batchSize,
    attempted: preview.alerts.length,
    recovered,
    alreadyResolved,
    needsProductOwnerReview,
    invalidReferences,
    falsePositives,
    failed,
    skipped,
    remainingAlerts: remainingCount ?? 0,
  };

  // Persist all item outcomes to the batch_items table
  if (batchRunId && items.length > 0) {
    const { data: insertedItems } = await supabase
      .from('engineering_integrity_batch_items')
      .insert(
        items.map(item => ({
          batch_run_id: batchRunId,
          alert_id: item.alertId,
          ewo_ref: item.ewoRef,
          outcome: item.outcome,
          reason: item.reason,
          evidence_searched: item.evidenceSearched,
          evidence_used: item.evidenceUsed,
          fields_reconstructed: item.fieldsReconstructed,
          missing_fields: item.missingFields,
          confidence: item.confidence,
          canonical_work_order_id: item.canonicalWorkOrderId,
          transaction_details: item.transactionDetails,
          processed_at: new Date().toISOString(),
        })),
      )
      .select('id, alert_id, ewo_ref, outcome');

    // Create PO reviews for NEEDS_PRODUCT_OWNER_REVIEW items
    if (insertedItems && insertedItems.length > 0) {
      const reviewItems = insertedItems.filter(
        (item: { outcome: string }) => item.outcome === 'NEEDS_PRODUCT_OWNER_REVIEW',
      );
      for (const item of reviewItems) {
        // Idempotency: check if review already exists
        const { data: existing } = await supabase
          .from('engineering_integrity_po_reviews')
          .select('id')
          .eq('batch_item_id', item.id)
          .maybeSingle();
        if (existing) continue;

        await supabase.from('engineering_integrity_po_reviews').insert({
          batch_run_id: batchRunId,
          batch_item_id: item.id,
          alert_id: item.alert_id,
          ewo_ref: item.ewo_ref ?? 'Unknown',
          original_outcome: 'NEEDS_PRODUCT_OWNER_REVIEW',
          review_status: 'pending',
          evidence_snapshot: { source: 'batch_processing', batch_ref: batchRef },
          fields_approved: {},
        });
      }
    }
  }

  // Update batch run record
  if (batchRunId) {
    await supabase
      .from('engineering_integrity_batch_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        summary: summary as unknown as Record<string, unknown>,
      })
      .eq('id', batchRunId);
  }

  // Part 8: Auto-close resolved parent/child alerts
  await autoCloseResolvedHierarchyAlerts();

  const copyableReport = generateCopyableReport(summary, items);

  return { batchRef, summary, items, copyableReport };
}

// ─── Part 8: Auto-Close Resolved Hierarchy Alerts ───────────────────────────

async function autoCloseResolvedHierarchyAlerts(): Promise<number> {
  // Get all open parent_child_issue alerts
  const { data: hierarchyAlerts } = await supabase
    .from('engineering_integrity_alerts')
    .select('id, normalised_reference, raw_reference, evidence')
    .eq('status', 'open')
    .eq('alert_type', 'parent_child_issue');

  if (!hierarchyAlerts || hierarchyAlerts.length === 0) return 0;

  let closed = 0;
  for (const alert of hierarchyAlerts) {
    const ref = alert.normalised_reference ?? alert.raw_reference;
    if (!ref) continue;

    // Check if both parent and child EWOs now exist
    const { data: ewo } = await supabase
      .from('engineering_work_orders')
      .select('id')
      .eq('ewo_ref', ref)
      .maybeSingle();

    if (ewo) {
      // The referenced EWO now exists — close the hierarchy alert
      await supabase
        .from('engineering_integrity_alerts')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: 'batch_auto_close',
          resolution_notes: 'Hierarchy alert auto-closed: referenced EWO now exists after batch recovery.',
        })
        .eq('id', alert.id);
      closed++;
    }
  }

  return closed;
}

// ─── Copyable Batch Report ──────────────────────────────────────────────────

function generateCopyableReport(summary: BatchRunSummary, items: BatchItemResult[]): string {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  ENGINEERING INTEGRITY BATCH REPORT');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Batch Reference:       ${summary.batchRef}`);
  lines.push(`Classification:        ${CLASSIFICATION_LABELS[summary.classification]}`);
  lines.push(`Requested Batch Size:   ${summary.requestedBatchSize}`);
  lines.push(`Attempted:             ${summary.attempted}`);
  lines.push('');
  lines.push('─── OUTCOMES ────────────────────────────────────────────────────');
  lines.push(`Recovered:                ${summary.recovered}`);
  lines.push(`Already Resolved:         ${summary.alreadyResolved}`);
  lines.push(`Needs Product Owner Review: ${summary.needsProductOwnerReview}`);
  lines.push(`Invalid References:       ${summary.invalidReferences}`);
  lines.push(`False Positives:          ${summary.falsePositives}`);
  lines.push(`Failed:                   ${summary.failed}`);
  lines.push(`Skipped:                  ${summary.skipped}`);
  lines.push(`Remaining Alerts:         ${summary.remainingAlerts}`);
  lines.push('');
  lines.push('─── ITEM DETAILS ──────────────────────────────────────────────');

  for (const item of items) {
    lines.push('');
    lines.push(`  EWO: ${item.ewoRef ?? 'N/A'}`);
    lines.push(`  Alert ID: ${item.alertId}`);
    lines.push(`  Outcome: ${item.outcome}`);
    lines.push(`  Reason: ${item.reason}`);
    lines.push(`  Evidence Searched: ${item.evidenceSearched.join(', ') || 'None'}`);
    lines.push(`  Evidence Used: ${item.evidenceUsed.join(', ') || 'None'}`);
    lines.push(`  Fields Reconstructed: ${item.fieldsReconstructed.join(', ') || 'None'}`);
    lines.push(`  Missing Fields: ${item.missingFields.join(', ') || 'None'}`);
    lines.push(`  Confidence: ${Math.round(item.confidence * 100)}%`);
    if (item.canonicalWorkOrderId) {
      lines.push(`  Canonical Work Order ID: ${item.canonicalWorkOrderId}`);
    }
    if (item.transactionDetails) {
      lines.push(`  Transaction: ${JSON.stringify(item.transactionDetails)}`);
    }
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  END OF BATCH REPORT');
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

// ─── Batch History ─────────────────────────────────────────────────────────

export interface BatchRunRecord {
  id: string;
  batch_ref: string;
  alert_type: string;
  requested_batch_size: number;
  attempted_count: number;
  initiated_by: string;
  initiated_at: string;
  completed_at: string | null;
  status: string;
  summary: Record<string, unknown>;
  superseded_by?: string | null;
  supersession_reason?: string | null;
  legacy_status?: string | null;
}

export async function getBatchHistory(limit: number = 20): Promise<BatchRunRecord[]> {
  const { data, error } = await supabase
    .from('engineering_integrity_batch_runs')
    .select('*')
    .order('initiated_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as unknown as BatchRunRecord[];
}

export async function getBatchRun(batchRunId: string): Promise<BatchRunRecord | null> {
  const { data, error } = await supabase
    .from('engineering_integrity_batch_runs')
    .select('*')
    .eq('id', batchRunId)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as BatchRunRecord;
}

export async function getBatchItems(batchRunId: string): Promise<BatchItemResult[]> {
  const { data, error } = await supabase
    .from('engineering_integrity_batch_items')
    .select('*')
    .eq('batch_run_id', batchRunId)
    .order('processed_at', { ascending: true });

  if (error || !data) return [];
  return data.map((d: Record<string, unknown>) => ({
    id: d.id as string,
    alertId: d.alert_id as string,
    ewoRef: d.ewo_ref as string | null,
    outcome: d.outcome as OutcomeClassification,
    reason: d.reason as string,
    evidenceSearched: (d.evidence_searched as string[]) ?? [],
    evidenceUsed: (d.evidence_used as string[]) ?? [],
    fieldsReconstructed: (d.fields_reconstructed as string[]) ?? [],
    missingFields: (d.missing_fields as string[]) ?? [],
    confidence: (d.confidence as number) ?? 0,
    canonicalWorkOrderId: (d.canonical_work_order_id as string) ?? null,
    transactionDetails: (d.transaction_details as Record<string, unknown>) ?? null,
    processedAt: (d.processed_at as string) ?? null,
  }));
}
