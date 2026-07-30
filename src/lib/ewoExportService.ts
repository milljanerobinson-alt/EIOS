// EWO-022 — Engineering Work Order Export & Audit
//
// Authoritative spreadsheet export for closed Engineering Work Orders.
// Retrieves all closed EWOs directly from the database (not from UI state),
// with deterministic batching, deduplication, and count reconciliation.
//
// Generates an XLSX workbook with:
//   1. "Closed Work Orders" worksheet — one row per unique canonical EWO
//   2. "Export Summary" worksheet — metadata, counts, reconciliation, warnings
//
// Security:
//   - Formula injection protection (neutralises values starting with =, +, -, @, tab)
//   - No secrets, tokens, or credentials exported
//   - References preserved as text (not converted to dates/numbers)
//
// Audit:
//   - Records one Engineering Change Ledger event on successful export
//   - Failed exports do NOT record a success event

import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import { buildGovernedResponse, type GovernedResponse } from './governedResponse';
import { recordChangeLogEvent } from './engineeringChangeLogService';

export const EXPORT_GENERATOR_VERSION = 'EWO-022R.1';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EWOExportRow {
  workOrderReference: string;
  normalisedReference: string;
  title: string;
  classification: string;
  status: string;
  lifecycleState: string;
  priority: string;
  engineeringOwner: string;
  productOwner: string;
  risk: string;
  effort: string;
  targetDate: string;
  createdDate: string;
  updatedDate: string;
  engineeringStartedDate: string;
  engineeringCompletedDate: string;
  verificationStatus: string;
  verificationCompletedDate: string;
  productOwnerTestingStatus: string;
  productOwnerTestingCompletedDate: string;
  productOwnerAcceptanceStatus: string;
  productOwnerAcceptanceDate: string;
  closedDate: string;
  supersededStatus: string;
  supersededBy: string;
  parentWorkOrder: string;
  originatingEngineeringIntent: string;
  originatingEngineeringPlan: string;
  promptArtefactAvailable: string;
  promptArtefactReference: string;
  completionReportAvailable: string;
  completionReportReference: string;
  verificationEvidenceAvailable: string;
  verificationEvidenceReference: string;
  acceptanceEvidenceAvailable: string;
  acceptanceEvidenceReference: string;
  changeLedgerEventCount: string;
  liveOrHistorical: string;
  reconstructed: string;
  historicalReference: string;
  canonicalRecordId: string;
  createdBy: string;
  lastUpdatedBy: string;
  dataQualityWarnings: string;
  notes: string;
}

export interface EWOExportSummary {
  generatedTimestamp: string;
  exportReference: string;
  exportScope: string;
  appliedSearchText: string;
  appliedFilters: string;
  platformProjectScope: string;
  authoritativeClosedCount: number;
  workspaceDisplayedClosedCount: number;
  totalRecordsExported: number;
  uniqueCanonicalRecordCount: number;
  countReconciliationResult: string;
  reconciliationExplanation: string;
  workspaceCountDifference: number;
  differenceReason: string;
  differenceResolution: string;
  historicalReferenceCount: number;
  engineeringClassificationCount: number;
  refinementClassificationCount: number;
  bugClassificationCount: number;
  constitutionalClassificationCount: number;
  historicalMigrationClassificationCount: number;
  historicalRecoveryClassificationCount: number;
  otherClassificationCount: number;
  liveWorkOrderCount: number;
  historicalWorkOrderCount: number;
  reconstructedWorkOrderCount: number;
  missingPromptArtefactCount: number;
  missingCompletionReportCount: number;
  missingVerificationEvidenceCount: number;
  missingProductOwnerAcceptanceEvidenceCount: number;
  missingClosureDateCount: number;
  referenceWarningCount: number;
  lifecycleInconsistencyCount: number;
  duplicateCanonicalReferenceCount: number;
  earliestCreatedDate: string;
  latestCreatedDate: string;
  earliestClosedDate: string;
  latestClosedDate: string;
  exportGeneratorVersion: string;
  authoritativeSourceName: string;
}

export interface EWOExportResult {
  success: boolean;
  workbook: ArrayBuffer | null;
  filename: string;
  summary: EWOExportSummary | null;
  governedResponse: GovernedResponse | null;
  isPartial: boolean;
}

export interface EWOExportFilters {
  searchText: string;
  classification: string | null;
  closedOnly: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;
const CLOSED_STATUSES = ['closed', 'archived'];
const UNAVAILABLE = 'Unavailable';
const NOT_APPLICABLE = 'Not applicable';

const COLUMN_HEADERS = [
  'Work Order Reference', 'Normalised Reference', 'Title', 'Classification',
  'Status', 'Lifecycle State', 'Priority', 'Engineering Owner', 'Product Owner',
  'Risk', 'Effort', 'Target Date', 'Created Date', 'Updated Date',
  'Engineering Started Date', 'Engineering Completed Date',
  'Verification Status', 'Verification Completed Date',
  'Product Owner Testing Status', 'Product Owner Testing Completed Date',
  'Product Owner Acceptance Status', 'Product Owner Acceptance Date',
  'Closed Date', 'Superseded Status', 'Superseded By', 'Parent Work Order',
  'Originating Engineering Intent', 'Originating Engineering Plan',
  'Prompt Artefact Available', 'Prompt Artefact Reference',
  'Completion Report Available', 'Completion Report Reference',
  'Verification Evidence Available', 'Verification Evidence Reference',
  'Acceptance Evidence Available', 'Acceptance Evidence Reference',
  'Change Ledger Event Count', 'Live or Historical', 'Reconstructed',
  'Historical Reference', 'Canonical Record ID', 'Created By', 'Last Updated By',
  'Data Quality Warnings', 'Notes',
];

// ─── Canonical Engineering Reference Sort ─────────────────────────────────────
//
// Sorts EWO references in canonical engineering order:
//   EWO-001, EWO-002, ..., EWO-018, EWO-018R, EWO-018R.1, EWO-018R.2,
//   EWO-019, EWO-020, EWO-020R, EWO-020R.1, EWO-021, EWO-021R.1, ...
//   BUG-001, BUG-002, BUG-003, BUG-004
//   Other prefixes (alphabetical)
//
// Parsing: prefix (EWO/BUG/etc) → numeric sequence → refinement hierarchy

interface ParsedRef {
  prefix: string;
  number: number;
  refinements: number[];
  raw: string;
}

function parseEWORef(ref: string): ParsedRef {
  const match = ref.match(/^([A-Za-z]+)-?(\d+)(.*)$/);
  if (!match) {
    return { prefix: ref, number: 0, refinements: [], raw: ref };
  }
  const prefix = match[1].toUpperCase();
  const number = parseInt(match[2], 10);
  const suffix = match[3] || '';

  // Parse refinement hierarchy: R, R.1, R.2, .1, .2, etc.
  const refinements: number[] = [];
  const refinementParts = suffix.split('.').filter(s => s.length > 0);
  for (const part of refinementParts) {
    const rMatch = part.match(/^R(\d*)$/i);
    if (rMatch) {
      refinements.push(rMatch[1] ? parseInt(rMatch[1], 10) : 0);
    } else {
      const nMatch = part.match(/^(\d+)$/);
      if (nMatch) {
        refinements.push(parseInt(nMatch[1], 10));
      }
    }
  }

  return { prefix, number, refinements, raw: ref };
}

const PREFIX_ORDER: Record<string, number> = {
  EWO: 0,
  BUG: 1,
};

function compareEWORef(a: string, b: string): number {
  const pa = parseEWORef(a);
  const pb = parseEWORef(b);

  // 1. Sort by prefix type (EWO before BUG before others)
  const aOrder = PREFIX_ORDER[pa.prefix] ?? 99;
  const bOrder = PREFIX_ORDER[pb.prefix] ?? 99;
  if (aOrder !== bOrder) return aOrder - bOrder;

  // 2. Sort by prefix alphabetically for unknown prefixes
  if (aOrder === 99 && pa.prefix !== pb.prefix) {
    return pa.prefix.localeCompare(pb.prefix);
  }

  // 3. Sort by numeric sequence
  if (pa.number !== pb.number) return pa.number - pb.number;

  // 4. Sort by refinement hierarchy
  const maxLen = Math.max(pa.refinements.length, pb.refinements.length);
  for (let i = 0; i < maxLen; i++) {
    const aVal = pa.refinements[i] ?? -1;
    const bVal = pb.refinements[i] ?? -1;
    if (aVal !== bVal) return aVal - bVal;
  }

  // 5. Fallback: alphabetical
  return a.localeCompare(b);
}

function sortRowsByEngineeringRef(rows: EWOExportRow[]): EWOExportRow[] {
  return [...rows].sort((a, b) => compareEWORef(a.workOrderReference, b.workOrderReference));
}

// ─── Formula Injection Protection ──────────────────────────────────────────────

function neutraliseFormulaInjection(value: string): string {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.length === 0) return value;
  const firstChar = trimmed[0];
  if (['=', '+', '-', '@', '\t', '\r'].includes(firstChar)) {
    return `'${value}`;
  }
  return value;
}

function safeCell(value: string | null | undefined): string {
  const v = value ?? UNAVAILABLE;
  return neutraliseFormulaInjection(v);
}

// ─── Date Formatting ──────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return UNAVAILABLE;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
}

function formatTimestamp(dateStr: string | null | undefined): string {
  if (!dateStr) return UNAVAILABLE;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toISOString();
  } catch {
    return dateStr;
  }
}

// ─── Authoritative Query with Batching ─────────────────────────────────────────

interface RawEWO {
  id: string;
  ewo_ref: string;
  title: string;
  executive_summary: string | null;
  status: string;
  priority: string;
  risk_level: string;
  estimated_effort: string | null;
  owner: string | null;
  product_owner: string | null;
  parent_ref: string | null;
  engineering_classification: string | null;
  closed_at: string | null;
  closed_by: string | null;
  closure_reason: string | null;
  closure_method: string | null;
  po_accepted_at: string | null;
  po_accepted_by: string | null;
  po_acceptance_statement: string | null;
  verification_status: string | null;
  verified_at: string | null;
  report_generation_status: string | null;
  is_historical_import: boolean | null;
  import_source: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  approved_at: string | null;
  target_date: string | null;
  implementation_started_at: string | null;
  implementation_completed_at: string | null;
  implementation_provider: string | null;
  implementation_status: string | null;
  engineering_package_status: string | null;
  implementation_reference: string | null;
  requested_by: string | null;
  historical_notes: string | null;
  engineering_notes: string | null;
}

interface BatchResult {
  records: RawEWO[];
  totalRetrieved: number;
  batchesAttempted: number;
  batchesFailed: number;
  failedBatchRanges: string[];
}

async function retrieveAllClosedEWOs(filters: EWOExportFilters): Promise<BatchResult> {
  const allRecords: RawEWO[] = [];
  const seenIds = new Set<string>();
  let batchesAttempted = 0;
  let batchesFailed = 0;
  const failedBatchRanges: string[] = [];
  let offset = 0;

  while (true) {
    batchesAttempted++;
    const batchStart = offset;
    const batchEnd = offset + BATCH_SIZE - 1;

    let query = supabase
      .from('engineering_work_orders')
      .select('*')
      .in('status', CLOSED_STATUSES)
      .order('closed_at', { ascending: false, nullsFirst: false })
      .order('ewo_ref', { ascending: true })
      .range(batchStart, batchEnd);

    if (filters.searchText) {
      query = query.or(`ewo_ref.ilike.%${filters.searchText}%,title.ilike.%${filters.searchText}%`);
    }
    if (filters.classification) {
      query = query.eq('engineering_classification', filters.classification);
    }

    const { data, error } = await query;

    if (error) {
      batchesFailed++;
      failedBatchRanges.push(`${batchStart}-${batchEnd}`);
      break;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data as RawEWO[]) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        allRecords.push(row);
      }
    }

    if (data.length < BATCH_SIZE) {
      break;
    }

    offset += BATCH_SIZE;
  }

  return {
    records: allRecords,
    totalRetrieved: allRecords.length,
    batchesAttempted,
    batchesFailed,
    failedBatchRanges,
  };
}

// ─── Authoritative Count ──────────────────────────────────────────────────────

async function getAuthoritativeClosedCount(filters: EWOExportFilters): Promise<number | null> {
  let countQuery = supabase
    .from('engineering_work_orders')
    .select('id', { count: 'exact', head: true })
    .in('status', CLOSED_STATUSES);

  if (filters.searchText) {
    countQuery = countQuery.or(`ewo_ref.ilike.%${filters.searchText}%,title.ilike.%${filters.searchText}%`);
  }
  if (filters.classification) {
    countQuery = countQuery.eq('engineering_classification', filters.classification);
  }

  const countResult = await countQuery;
  const count = countResult.count;
  const countError = countResult.error;

  if (countError) return null;
  return count ?? 0;
}

// ─── Change Ledger Count ──────────────────────────────────────────────────────

async function getChangeLedgerCounts(ewoRefs: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ewoRefs.length === 0) return counts;

  const { data, error } = await supabase
    .from('engineering_change_log')
    .select('ewo_ref')
    .in('ewo_ref', ewoRefs);

  if (error || !data) return counts;

  for (const row of data) {
    const ref = row.ewo_ref;
    if (ref) {
      counts.set(ref, (counts.get(ref) ?? 0) + 1);
    }
  }

  return counts;
}

// ─── Data Quality Warnings ────────────────────────────────────────────────────

function extractSupersededBy(ewo: RawEWO): string | null {
  if (ewo.closure_method !== 'Automated Governance') return null;
  if (!ewo.closure_reason) return null;
  const match = ewo.closure_reason.match(/Superseded by\s+(EWO-[A-Za-z0-9.-]+[A-Za-z0-9])/i);
  return match ? match[1] : null;
}

function calculateWarnings(
  ewo: RawEWO,
  hasCompletionReport: boolean,
  hasPromptArtefact: boolean,
  isDuplicate: boolean,
  supersededBy: string | null,
): string[] {
  const warnings: string[] = [];

  if (!hasPromptArtefact) warnings.push('Missing prompt artefact');
  if (!hasCompletionReport) warnings.push('Missing Completion Report');
  if (!ewo.verification_status || ewo.verification_status === 'not_started') {
    warnings.push('Missing verification evidence');
  }
  if (ewo.status === 'closed' && !ewo.po_accepted_at && ewo.closure_method !== 'Automated Governance') {
    warnings.push('Closed without Product Owner acceptance evidence');
  }
  if (ewo.status === 'closed' && !ewo.closed_at) {
    warnings.push('Closed without closure date');
  }
  if (hasCompletionReport && (!ewo.verification_status || ewo.verification_status === 'not_started')) {
    warnings.push('Completion Report recorded without verification');
  }
  if (ewo.engineering_classification === 'Refinement' && !ewo.parent_ref) {
    warnings.push('Refinement missing parent reference');
  }
  if (ewo.closure_method === 'Automated Governance' && !supersededBy) {
    warnings.push('Superseded record missing superseding reference');
  }
  if (isDuplicate) {
    warnings.push('Duplicate Work Order reference');
  }
  if (!ewo.id) {
    warnings.push('Canonical record ID missing');
  }
  if (ewo.po_accepted_at && !ewo.po_accepted_by) {
    warnings.push('Accepted record missing acceptance date');
  }

  return warnings;
}

// ─── Row Transformation ───────────────────────────────────────────────────────

function transformToExportRow(
  ewo: RawEWO,
  ledgerCount: number,
  isDuplicate: boolean,
): EWOExportRow {
  const hasCompletionReport = ewo.report_generation_status === 'available';
  const hasPromptArtefact = ewo.implementation_reference != null;
  const hasVerificationEvidence = ewo.verification_status != null && ewo.verification_status !== 'not_started';
  const hasAcceptanceEvidence = ewo.po_accepted_at != null;

  const supersededBy = extractSupersededBy(ewo);
  const warnings = calculateWarnings(ewo, hasCompletionReport, hasPromptArtefact, isDuplicate, supersededBy);

  const isHistorical = ewo.is_historical_import === true;
  const isReconstructed = isHistorical && ewo.import_source != null;

  return {
    workOrderReference: safeCell(ewo.ewo_ref),
    normalisedReference: safeCell(ewo.ewo_ref?.replace(/[-.]/g, '_')),
    title: safeCell(ewo.title),
    classification: safeCell(ewo.engineering_classification ?? UNAVAILABLE),
    status: safeCell(ewo.status),
    lifecycleState: safeCell(ewo.status),
    priority: safeCell(ewo.priority),
    engineeringOwner: safeCell(ewo.owner ?? UNAVAILABLE),
    productOwner: safeCell(ewo.product_owner ?? UNAVAILABLE),
    risk: safeCell(ewo.risk_level),
    effort: safeCell(ewo.estimated_effort ?? UNAVAILABLE),
    targetDate: formatDate(ewo.target_date),
    createdDate: formatDate(ewo.created_at),
    updatedDate: formatTimestamp(ewo.updated_at),
    engineeringStartedDate: formatDate(ewo.started_at ?? ewo.approved_at),
    engineeringCompletedDate: formatDate(ewo.completed_at ?? ewo.implementation_completed_at),
    verificationStatus: safeCell(ewo.verification_status ?? UNAVAILABLE),
    verificationCompletedDate: formatDate(ewo.verified_at),
    productOwnerTestingStatus: ewo.po_accepted_at ? 'Completed' : (ewo.closure_method === 'Automated Governance' ? 'Not applicable (superseded)' : UNAVAILABLE),
    productOwnerTestingCompletedDate: formatDate(ewo.po_accepted_at),
    productOwnerAcceptanceStatus: ewo.po_accepted_at ? 'Accepted' : (ewo.closure_method === 'Automated Governance' ? 'Not applicable (superseded)' : UNAVAILABLE),
    productOwnerAcceptanceDate: formatDate(ewo.po_accepted_at),
    closedDate: formatDate(ewo.closed_at),
    supersededStatus: ewo.closure_method === 'Automated Governance' ? 'Superseded' : NOT_APPLICABLE,
    supersededBy: supersededBy ?? (ewo.closure_method === 'Automated Governance' ? UNAVAILABLE : NOT_APPLICABLE),
    parentWorkOrder: safeCell(ewo.parent_ref ?? NOT_APPLICABLE),
    originatingEngineeringIntent: NOT_APPLICABLE,
    originatingEngineeringPlan: NOT_APPLICABLE,
    promptArtefactAvailable: hasPromptArtefact ? 'Yes' : 'No',
    promptArtefactReference: hasPromptArtefact ? safeCell(ewo.implementation_reference) : UNAVAILABLE,
    completionReportAvailable: hasCompletionReport ? 'Yes' : 'No',
    completionReportReference: hasCompletionReport ? 'Referenced but inaccessible' : UNAVAILABLE,
    verificationEvidenceAvailable: hasVerificationEvidence ? 'Yes' : 'No',
    verificationEvidenceReference: hasVerificationEvidence ? 'Referenced but inaccessible' : UNAVAILABLE,
    acceptanceEvidenceAvailable: hasAcceptanceEvidence ? 'Yes' : 'No',
    acceptanceEvidenceReference: hasAcceptanceEvidence ? 'Referenced but inaccessible' : UNAVAILABLE,
    changeLedgerEventCount: String(ledgerCount),
    liveOrHistorical: isHistorical ? 'Historical' : 'Live',
    reconstructed: isReconstructed ? 'Yes' : 'No',
    historicalReference: isHistorical ? safeCell(ewo.import_source) : NOT_APPLICABLE,
    canonicalRecordId: safeCell(ewo.id),
    createdBy: safeCell(ewo.requested_by ?? 'system'),
    lastUpdatedBy: safeCell(ewo.closed_by ?? ewo.owner ?? 'system'),
    dataQualityWarnings: warnings.length > 0 ? safeCell(warnings.join('; ')) : 'None',
    notes: safeCell(ewo.historical_notes ?? ewo.engineering_notes ?? ''),
  };
}

// ─── Summary Calculation ──────────────────────────────────────────────────────

function calculateSummary(
  rows: EWOExportRow[],
  rawRecords: RawEWO[],
  filters: EWOExportFilters,
  authoritativeCount: number,
  workspaceDisplayedCount: number,
  historicalReferenceCount: number,
  duplicateCount: number,
  isPartial: boolean,
  batchResult: BatchResult,
): EWOExportSummary {
  const classificationCounts = {
    Engineering: 0, Refinement: 0, Bug: 0, Constitutional: 0,
    'Historical Migration': 0, 'Historical Recovery': 0, Other: 0,
  };

  let liveCount = 0;
  let historicalCount = 0;
  let reconstructedCount = 0;
  let missingPrompt = 0;
  let missingCompletionReport = 0;
  let missingVerification = 0;
  let missingAcceptance = 0;
  let missingClosureDate = 0;
  let referenceWarnings = 0;
  let lifecycleInconsistencies = 0;

  const createdDates: string[] = [];
  const closedDates: string[] = [];

  for (const row of rows) {
    const cls = row.classification;
    if (cls in classificationCounts) (classificationCounts as any)[cls]++;
    else classificationCounts.Other++;

    if (row.liveOrHistorical === 'Live') liveCount++;
    else historicalCount++;
    if (row.reconstructed === 'Yes') reconstructedCount++;

    if (row.promptArtefactAvailable === 'No') missingPrompt++;
    if (row.completionReportAvailable === 'No') missingCompletionReport++;
    if (row.verificationEvidenceAvailable === 'No') missingVerification++;
    if (row.acceptanceEvidenceAvailable === 'No') missingAcceptance++;
    if (row.closedDate === UNAVAILABLE) missingClosureDate++;

    if (row.dataQualityWarnings !== 'None') {
      const warnings = row.dataQualityWarnings.split('; ');
      for (const w of warnings) {
        if (w.includes('reference') || w.includes('Duplicate') || w.includes('Invalid')) referenceWarnings++;
        if (w.includes('lifecycle') || w.includes('Closed without')) lifecycleInconsistencies++;
      }
    }

    if (row.createdDate && row.createdDate !== UNAVAILABLE) createdDates.push(row.createdDate);
    if (row.closedDate && row.closedDate !== UNAVAILABLE) closedDates.push(row.closedDate);
  }

  createdDates.sort();
  closedDates.sort();

  const exportMatchesAuthoritative = rows.length === authoritativeCount;
  const workspaceDifference = workspaceDisplayedCount - authoritativeCount;
  const workspaceDifferenceExplained = workspaceDifference === historicalReferenceCount;

  let reconciliationResult: string;
  let reconciliationExplanation: string;
  let differenceReason: string;
  let differenceResolution: string;

  if (isPartial) {
    reconciliationResult = `Partial — ${batchResult.failedBatchRanges.length} batch(es) failed: ${batchResult.failedBatchRanges.join(', ')}`;
    reconciliationExplanation = `Export is partial due to batch failures. Exported: ${rows.length}. Authoritative: ${authoritativeCount}. Missing batches may contain additional records.`;
    differenceReason = workspaceDifference !== 0 ? `Workspace count differs by ${workspaceDifference}. This may be due to historical references or archived records not included in the export.` : 'No workspace difference.';
    differenceResolution = 'Retry the export to attempt complete retrieval.';
  } else if (exportMatchesAuthoritative) {
    reconciliationResult = 'Reconciled';
    if (workspaceDifference !== 0) {
      if (workspaceDifferenceExplained) {
        reconciliationExplanation = `Export count (${rows.length}) matches authoritative count (${authoritativeCount}). Workspace count (${workspaceDisplayedCount}) differs by ${workspaceDifference} due to ${historicalReferenceCount} historical reference(s) included in the workspace count but not in the authoritative export.`;
        differenceReason = `Workspace includes ${historicalReferenceCount} historical reference(s) that are not canonical engineering_work_orders records.`;
        differenceResolution = 'No action required. The difference is a legitimate scope difference between the workspace (which includes historical references) and the authoritative export (which includes only canonical engineering_work_orders records).';
      } else {
        reconciliationExplanation = `Export count (${rows.length}) matches authoritative count (${authoritativeCount}). Workspace count (${workspaceDisplayedCount}) differs by ${workspaceDifference}. The difference is not fully explained by historical references (${historicalReferenceCount} found).`;
        differenceReason = `Unexplained difference of ${workspaceDifference - historicalReferenceCount} record(s) beyond historical references.`;
        differenceResolution = 'Investigate the workspace count calculation for additional scope differences.';
      }
    } else {
      reconciliationExplanation = `Export count (${rows.length}) matches authoritative count (${authoritativeCount}). Workspace count (${workspaceDisplayedCount}) also matches. All counts reconciled.`;
      differenceReason = 'No difference.';
      differenceResolution = 'No action required.';
    }
  } else {
    reconciliationResult = `Mismatch — exported ${rows.length} vs authoritative ${authoritativeCount}`;
    reconciliationExplanation = `Export count (${rows.length}) does not match authoritative count (${authoritativeCount}). This indicates a retrieval or deduplication issue.`;
    differenceReason = workspaceDifference !== 0 ? `Workspace count also differs by ${workspaceDifference}.` : 'No workspace difference.';
    differenceResolution = 'Investigate the batch retrieval and deduplication logic.';
  }

  const scope = filters.searchText || filters.classification
    ? 'Filtered closed Work Orders'
    : 'All closed Work Orders';

  const appliedFilters = [
    filters.searchText ? `Search: "${filters.searchText}"` : null,
    filters.classification ? `Classification: ${filters.classification}` : null,
  ].filter(Boolean).join('; ') || 'None';

  return {
    generatedTimestamp: new Date().toISOString(),
    exportReference: `EWO-EXPORT-${Date.now()}`,
    exportScope: scope,
    appliedSearchText: filters.searchText || 'None',
    appliedFilters,
    platformProjectScope: 'All projects',
    authoritativeClosedCount: authoritativeCount,
    workspaceDisplayedClosedCount: workspaceDisplayedCount,
    totalRecordsExported: rows.length,
    uniqueCanonicalRecordCount: rows.length,
    countReconciliationResult: reconciliationResult,
    reconciliationExplanation,
    workspaceCountDifference: workspaceDifference,
    differenceReason,
    differenceResolution,
    historicalReferenceCount,
    engineeringClassificationCount: classificationCounts.Engineering,
    refinementClassificationCount: classificationCounts.Refinement,
    bugClassificationCount: classificationCounts.Bug,
    constitutionalClassificationCount: classificationCounts.Constitutional,
    historicalMigrationClassificationCount: classificationCounts['Historical Migration'],
    historicalRecoveryClassificationCount: classificationCounts['Historical Recovery'],
    otherClassificationCount: classificationCounts.Other,
    liveWorkOrderCount: liveCount,
    historicalWorkOrderCount: historicalCount,
    reconstructedWorkOrderCount: reconstructedCount,
    missingPromptArtefactCount: missingPrompt,
    missingCompletionReportCount: missingCompletionReport,
    missingVerificationEvidenceCount: missingVerification,
    missingProductOwnerAcceptanceEvidenceCount: missingAcceptance,
    missingClosureDateCount: missingClosureDate,
    referenceWarningCount: referenceWarnings,
    lifecycleInconsistencyCount: lifecycleInconsistencies,
    duplicateCanonicalReferenceCount: duplicateCount,
    earliestCreatedDate: createdDates[0] ?? UNAVAILABLE,
    latestCreatedDate: createdDates[createdDates.length - 1] ?? UNAVAILABLE,
    earliestClosedDate: closedDates[0] ?? UNAVAILABLE,
    latestClosedDate: closedDates[closedDates.length - 1] ?? UNAVAILABLE,
    exportGeneratorVersion: EXPORT_GENERATOR_VERSION,
    authoritativeSourceName: 'engineering_work_orders (Supabase)',
  };
}

// ─── Workbook Generation ──────────────────────────────────────────────────────

function generateWorkbook(rows: EWOExportRow[], summary: EWOExportSummary): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  // ── Closed Work Orders worksheet ─────────────────────────────────────────────
  const dataAoA: (string | number)[][] = [COLUMN_HEADERS];
  for (const row of rows) {
    dataAoA.push([
      row.workOrderReference, row.normalisedReference, row.title, row.classification,
      row.status, row.lifecycleState, row.priority, row.engineeringOwner, row.productOwner,
      row.risk, row.effort, row.targetDate, row.createdDate, row.updatedDate,
      row.engineeringStartedDate, row.engineeringCompletedDate,
      row.verificationStatus, row.verificationCompletedDate,
      row.productOwnerTestingStatus, row.productOwnerTestingCompletedDate,
      row.productOwnerAcceptanceStatus, row.productOwnerAcceptanceDate,
      row.closedDate, row.supersededStatus, row.supersededBy, row.parentWorkOrder,
      row.originatingEngineeringIntent, row.originatingEngineeringPlan,
      row.promptArtefactAvailable, row.promptArtefactReference,
      row.completionReportAvailable, row.completionReportReference,
      row.verificationEvidenceAvailable, row.verificationEvidenceReference,
      row.acceptanceEvidenceAvailable, row.acceptanceEvidenceReference,
      row.changeLedgerEventCount, row.liveOrHistorical, row.reconstructed,
      row.historicalReference, row.canonicalRecordId, row.createdBy, row.lastUpdatedBy,
      row.dataQualityWarnings, row.notes,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(dataAoA);

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  // Enable filters
  ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_cell({ r: 0, c: COLUMN_HEADERS.length - 1 })}1` };

  // Set column widths
  ws['!cols'] = COLUMN_HEADERS.map((header) => {
    if (header.includes('Reference') || header.includes('ID') || header.includes('Date')) {
      return { wch: 22 };
    }
    if (header === 'Title' || header === 'Notes' || header === 'Data Quality Warnings') {
      return { wch: 40 };
    }
    return { wch: 15 };
  });

  XLSX.utils.book_append_sheet(wb, ws, 'Closed Work Orders');

  // ── Export Summary worksheet ──────────────────────────────────────────────────
  const summaryAoA: (string | number)[][] = [
    ['Field', 'Value'],
    ['Generated Timestamp', summary.generatedTimestamp],
    ['Export Reference', summary.exportReference],
    ['Export Scope', summary.exportScope],
    ['Applied Search Text', summary.appliedSearchText],
    ['Applied Filters', summary.appliedFilters],
    ['Platform/Project Scope', summary.platformProjectScope],
    ['Authoritative Closed Count', summary.authoritativeClosedCount],
    ['Workspace Displayed Closed Count', summary.workspaceDisplayedClosedCount],
    ['Total Records Exported', summary.totalRecordsExported],
    ['Unique Canonical Record Count', summary.uniqueCanonicalRecordCount],
    ['Count Reconciliation Result', summary.countReconciliationResult],
    ['Reconciliation Explanation', summary.reconciliationExplanation],
    ['Workspace Count Difference', summary.workspaceCountDifference],
    ['Difference Reason', summary.differenceReason],
    ['Difference Resolution', summary.differenceResolution],
    ['Historical Reference Count', summary.historicalReferenceCount],
    ['Engineering Classification Count', summary.engineeringClassificationCount],
    ['Refinement Classification Count', summary.refinementClassificationCount],
    ['Bug Classification Count', summary.bugClassificationCount],
    ['Constitutional Classification Count', summary.constitutionalClassificationCount],
    ['Historical Migration Classification Count', summary.historicalMigrationClassificationCount],
    ['Historical Recovery Classification Count', summary.historicalRecoveryClassificationCount],
    ['Other Classification Count', summary.otherClassificationCount],
    ['Live Work Order Count', summary.liveWorkOrderCount],
    ['Historical Work Order Count', summary.historicalWorkOrderCount],
    ['Reconstructed Work Order Count', summary.reconstructedWorkOrderCount],
    ['Missing Prompt Artefact Count', summary.missingPromptArtefactCount],
    ['Missing Completion Report Count', summary.missingCompletionReportCount],
    ['Missing Verification Evidence Count', summary.missingVerificationEvidenceCount],
    ['Missing Product Owner Acceptance Evidence Count', summary.missingProductOwnerAcceptanceEvidenceCount],
    ['Missing Closure Date Count', summary.missingClosureDateCount],
    ['Reference Warning Count', summary.referenceWarningCount],
    ['Lifecycle Inconsistency Count', summary.lifecycleInconsistencyCount],
    ['Duplicate Canonical Reference Count', summary.duplicateCanonicalReferenceCount],
    ['Earliest Created Date', summary.earliestCreatedDate],
    ['Latest Created Date', summary.latestCreatedDate],
    ['Earliest Closed Date', summary.earliestClosedDate],
    ['Latest Closed Date', summary.latestClosedDate],
    ['Export Generator Version', summary.exportGeneratorVersion],
    ['Authoritative Source Name', summary.authoritativeSourceName],
  ];

  const summaryWs = XLSX.utils.aoa_to_sheet(summaryAoA);
  summaryWs['!cols'] = [{ wch: 45 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Export Summary');

  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

// ─── Main Export Function ──────────────────────────────────────────────────────

export async function exportClosedWorkOrders(
  filters: EWOExportFilters,
  workspaceDisplayedCount: number,
  actor: string = 'Product Owner',
): Promise<EWOExportResult> {
  // ── 1. Retrieve authoritative closed count ──────────────────────────────────
  const authoritativeCount = await getAuthoritativeClosedCount(filters);

  if (authoritativeCount === null) {
    return {
      success: false,
      workbook: null,
      filename: '',
      summary: null,
      governedResponse: buildGovernedResponse('EIOS-WOEXPORT-002'),
      isPartial: false,
    };
  }

  // ── 2. Retrieve all closed EWOs with batching ────────────────────────────────
  const batchResult = await retrieveAllClosedEWOs(filters);

  if (batchResult.totalRetrieved === 0 && batchResult.batchesFailed > 0) {
    return {
      success: false,
      workbook: null,
      filename: '',
      summary: null,
      governedResponse: buildGovernedResponse('EIOS-WOEXPORT-002'),
      isPartial: false,
    };
  }

  // ── 3. Deduplicate by canonical record identity ─────────────────────────────
  const seenRefs = new Set<string>();
  const uniqueRecords: RawEWO[] = [];
  let duplicateCount = 0;

  for (const record of batchResult.records) {
    if (seenRefs.has(record.ewo_ref)) {
      duplicateCount++;
    } else {
      seenRefs.add(record.ewo_ref);
      uniqueRecords.push(record);
    }
  }

  // ── 4. Get change ledger counts ──────────────────────────────────────────────
  const ewoRefs = uniqueRecords.map(r => r.ewo_ref);
  const ledgerCounts = await getChangeLedgerCounts(ewoRefs);

  // ── 4a. Get historical reference count for reconciliation explanation ────────
  let historicalReferenceCount = 0;
  try {
    const { count: histCount } = await supabase
      .from('engineering_historical_references')
      .select('id', { count: 'exact', head: true });
    historicalReferenceCount = histCount ?? 0;
  } catch {
    // Best-effort — if we can't get the count, the difference will be unexplained
  }

  // ── 5. Transform to export rows ──────────────────────────────────────────────
  const rows: EWOExportRow[] = uniqueRecords.map(ewo => {
    const isDup = seenRefs.has(ewo.ewo_ref) && batchResult.records.filter(r => r.ewo_ref === ewo.ewo_ref).length > 1;
    return transformToExportRow(ewo, ledgerCounts.get(ewo.ewo_ref) ?? 0, isDup);
  });

  // ── 5a. Sort by canonical engineering reference order ────────────────────────
  const sortedRows = sortRowsByEngineeringRef(rows);

  // ── 6. Count reconciliation ──────────────────────────────────────────────────
  const isPartial = batchResult.batchesFailed > 0;
  const countMatches = rows.length === authoritativeCount;

  if (!countMatches && !isPartial) {
    return {
      success: false,
      workbook: null,
      filename: '',
      summary: null,
      governedResponse: buildGovernedResponse('EIOS-WOEXPORT-003'),
      isPartial: false,
    };
  }

  // ── 7. Calculate summary ──────────────────────────────────────────────────────
  const summary = calculateSummary(
    sortedRows, uniqueRecords, filters,
    authoritativeCount, workspaceDisplayedCount,
    historicalReferenceCount,
    duplicateCount, isPartial, batchResult,
  );

  // ── 8. Generate workbook ──────────────────────────────────────────────────────
  let workbook: ArrayBuffer;
  try {
    workbook = generateWorkbook(sortedRows, summary);
  } catch (err) {
    return {
      success: false,
      workbook: null,
      filename: '',
      summary: null,
      governedResponse: buildGovernedResponse('EIOS-WOEXPORT-004'),
      isPartial: false,
    };
  }

  // ── 9. Generate filename ──────────────────────────────────────────────────────
  const dateStr = new Date().toISOString().split('T')[0];
  const scopeStr = (filters.searchText || filters.classification) ? 'filtered' : 'all';
  const filename = `engineering-work-orders-closed-${scopeStr}-${dateStr}.xlsx`;

  // ── 10. Record audit event ────────────────────────────────────────────────────
  try {
    await recordChangeLogEvent({
      change_type: 'updated',
      object_type: 'engineering_work_order',
      object_id: 'export-audit',
      object_ref: summary.exportReference,
      ewo_ref: 'EWO-022',
      summary: `EWO Export: ${summary.exportScope} — ${sortedRows.length} records exported`,
      description: `Export audit event. Scope: ${summary.exportScope}. Filters: ${summary.appliedFilters}. Exported: ${sortedRows.length}. Authoritative: ${authoritativeCount}. Reconciliation: ${summary.countReconciliationResult}. Generator: ${EXPORT_GENERATOR_VERSION}.`,
      actor_type: 'human',
      actor,
      linked_artefacts: [summary.exportReference] as any,
    });
  } catch {
    // Best-effort audit — don't fail the export
  }

  // ── 11. Return result ──────────────────────────────────────────────────────────
  return {
    success: true,
    workbook,
    filename,
    summary,
    governedResponse: isPartial ? buildGovernedResponse('EIOS-WOEXPORT-005') : null,
    isPartial,
  };
}

// ─── Test Helpers (exported for testing) ────────────────────────────────────────

export { neutraliseFormulaInjection, safeCell, formatDate, calculateWarnings, transformToExportRow, COLUMN_HEADERS, parseEWORef, compareEWORef, sortRowsByEngineeringRef, extractSupersededBy };
