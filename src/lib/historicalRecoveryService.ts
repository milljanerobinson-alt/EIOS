import { supabase } from './supabase';
import { generateApprovalNote } from './approvalNoteGenerator';

// ─── Types ──────────────────────────────────────────────────────────────────

export type EngineeringConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type RecoveryPOStatus = 'pending' | 'approved' | 'rejected' | 'edit' | 'request_evidence';

export type RecoveryStatus =
  | 'discovered' | 'pending_review' | 'evidence_requested'
  | 'approved' | 'rejected' | 'imported'
  | 'deleted' | 'permanently_dismissed' | 'restored';

export type ObjectClassification =
  | 'ENGINEERING_WORK_ORDER'
  | 'ENGINEERING_AMENDMENT'
  | 'CONSTITUTIONAL_RECORD'
  | 'ENGINEERING_RECORD'
  | 'ENGINEERING_INTENT'
  | 'ENGINEERING_PLAN'
  | 'PIPELINE_EXECUTION'
  | 'BUG_OR_INCIDENT'
  | 'BATCH_OR_MIGRATION'
  | 'UNKNOWN';

export type RecoveryAuditAction =
  | 'discovered' | 'reviewed' | 'approved' | 'rejected'
  | 'edited' | 'requested_evidence' | 'imported'
  | 'classified' | 'automatically_reclassified'
  | 'product_owner_reclassified'
  | 'deleted' | 'restored' | 'permanently_dismissed'
  | 'import_blocked_wrong_object_type' | 'rediscovery_skipped';

export interface RecoveryPackage {
  id: string;
  recovery_ref: string;
  canonical_reference: string;
  title: string;
  executive_summary: string | null;
  engineering_objective: string | null;
  known_deliverables: string | null;
  known_verification_evidence: string | null;
  known_po_decisions: string | null;
  related_artefacts: string | null;
  historical_references: string | null;
  evidence_sources: string[];
  evidence_missing: string | null;
  recovery_notes: string | null;
  engineering_confidence: EngineeringConfidence;
  confidence_explanation: string | null;
  recovery_recommendation: string | null;
  po_status: RecoveryPOStatus;
  po_reviewed_by: string | null;
  po_reviewed_at: string | null;
  po_review_notes: string | null;
  imported_at: string | null;
  imported_ewo_id: string | null;
  recovered_by: string | null;
  recovered_at: string;
  created_at: string;
  updated_at: string;
  // EWO-014.17R fields
  object_classification: ObjectClassification;
  previous_classification: string | null;
  reclassified_by: string | null;
  reclassified_at: string | null;
  reclassification_reason: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  deletion_reason: string | null;
  is_deleted: boolean;
  permanently_dismissed_at: string | null;
  permanently_dismissed_by: string | null;
  permanently_dismissed_reason: string | null;
  is_permanently_dismissed: boolean;
  // EWO-014.17R.1 fields
  recovery_status: RecoveryStatus;
}

export interface RecoveryEvidence {
  id: string;
  recovery_package_id: string;
  source_table: string;
  source_record_ref: string | null;
  source_record_id: string | null;
  evidence_type: string;
  evidence_summary: string | null;
  is_duplicate: boolean;
  is_superseded: boolean;
  has_conflict: boolean;
  conflict_notes: string | null;
  created_at: string;
}

export interface RecoveryAuditEvent {
  id: string;
  recovery_package_id: string;
  action: RecoveryAuditAction;
  acted_by: string;
  acted_at: string;
  evidence_used: string | null;
  confidence: string | null;
  reason: string | null;
  import_result: string | null;
  metadata: Record<string, unknown>;
}

export interface DiscoveryResult {
  packagesCreated: number;
  packagesSkipped: number;
  existingEwoSkipped: number;
  existingRecoverySkipped: number;
  deletedSkipped: number;
  dismissedSkipped: number;
  candidates: Array<{
    canonical_reference: string;
    title: string;
    evidence_count: number;
    confidence: EngineeringConfidence;
    classification: ObjectClassification;
  }>;
}

export interface CategoryCount {
  classification: ObjectClassification;
  count: number;
  label: string;
}

export interface EwoSearchResult {
  id: string;
  ewo_ref: string;
  title: string;
  executive_summary: string | null;
  status?: string | null;
}

export interface ReclassificationHistoryEntry {
  previous_classification: string;
  new_classification: string;
  previous_canonical_reference: string;
  new_canonical_reference: string;
  acted_by: string;
  acted_at: string;
  reason: string | null;
  action: string;
}

// ─── Recovery Status Labels ──────────────────────────────────────────────────

export const RECOVERY_STATUS_LABELS: Record<RecoveryStatus, { label: string; colour: string; description: string }> = {
  discovered: { label: 'Discovered', colour: 'text-slate-600 bg-slate-50 border-slate-200', description: 'Recovery package created by the Discovery Engine.' },
  pending_review: { label: 'Pending Review', colour: 'text-amber-700 bg-amber-50 border-amber-200', description: 'Awaiting Product Owner review.' },
  evidence_requested: { label: 'Evidence Requested', colour: 'text-purple-700 bg-purple-50 border-purple-200', description: 'Product Owner has requested more evidence.' },
  approved: { label: 'Approved', colour: 'text-green-700 bg-green-50 border-green-200', description: 'Product Owner has approved the recovery package.' },
  rejected: { label: 'Rejected', colour: 'text-red-700 bg-red-50 border-red-200', description: 'Product Owner has rejected the recovery package.' },
  imported: { label: 'Imported', colour: 'text-blue-700 bg-blue-50 border-blue-200', description: 'Recovery package has been imported into the Engineering Ledger.' },
  deleted: { label: 'Deleted', colour: 'text-slate-500 bg-slate-100 border-slate-200', description: 'Recovery package has been soft-deleted.' },
  permanently_dismissed: { label: 'Permanently Dismissed', colour: 'text-red-600 bg-red-50 border-red-200', description: 'Candidate has been permanently dismissed and will not be rediscovered.' },
  restored: { label: 'Restored', colour: 'text-blue-700 bg-blue-50 border-blue-200', description: 'Deleted package has been restored to the active queue.' },
};

// ─── EWO Ledger Search ───────────────────────────────────────────────────────
// Searches the Engineering Ledger by reference, title, alias, or identity mapping.
// Only valid, existing Engineering Work Orders can be selected for reclassification.

export async function searchEngineeringWorkOrders(query: string): Promise<EwoSearchResult[]> {
  if (!query.trim()) return [];
  const q = query.trim();
  // Search by ewo_ref or title (ilike)
  const { data, error } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, executive_summary, status')
    .or(`ewo_ref.ilike.%${q}%,title.ilike.%${q}%`)
    .order('ewo_ref', { ascending: true })
    .limit(20);
  if (error || !data) return [];
  const results = data as EwoSearchResult[];

  // Also resolve via identity mappings (historical aliases) — merge unique EWOs
  const { data: aliasMaps } = await supabase
    .from('engineering_identity_map')
    .select('canonical_reference, historical_reference')
    .eq('reconciliation_status', 'accepted')
    .or(`historical_reference.ilike.%${q}%,canonical_reference.ilike.%${q}%`)
    .limit(20);
  if (aliasMaps && aliasMaps.length > 0) {
    const aliasRefs = aliasMaps
      .map(m => m.canonical_reference as string)
      .filter(r => /^EWO-/.test(r) && !results.some(r2 => r2.ewo_ref === r));
    if (aliasRefs.length > 0) {
      const { data: aliasEwos } = await supabase
        .from('engineering_work_orders')
        .select('id, ewo_ref, title, executive_summary, status')
        .in('ewo_ref', aliasRefs)
        .limit(20);
      if (aliasEwos) {
        for (const e of aliasEwos) {
          if (!results.some(r => r.ewo_ref === e.ewo_ref)) {
            results.push(e as EwoSearchResult);
          }
        }
      }
    }
  }

  return results;
}

export async function validateEwoReference(ewoRef: string): Promise<{ valid: boolean; ewo?: EwoSearchResult; error?: string }> {
  if (!ewoRef.trim()) return { valid: false, error: 'Engineering Work Order reference is required' };
  const { data, error } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, executive_summary')
    .eq('ewo_ref', ewoRef.trim())
    .maybeSingle();
  if (error) return { valid: false, error: error.message };
  if (!data) return { valid: false, error: 'Engineering Work Order not found.' };
  return { valid: true, ewo: data as EwoSearchResult };
}

// ─── Classification Engine ──────────────────────────────────────────────────
// Classifies discovered historical objects based on reference prefix, source
// table, identity mapping, record type, and metadata. Never classifies an
// object as an EWO solely because it appears in a lifecycle/evidence table.

export function classifyObject(
  canonicalRef: string,
  evidence: EvidenceItem[]
): ObjectClassification {
  const ref = canonicalRef.toUpperCase();

  // 1. EWO reference patterns (including refinements like EWO-007R, EWO-014.17)
  if (/^EWO-\d+/.test(ref)) return 'ENGINEERING_WORK_ORDER';

  // 2. Engineering Amendment
  if (/^AMD-/.test(ref) || /^CONST-\d+-AMD-/.test(ref)) return 'ENGINEERING_AMENDMENT';

  // 3. Constitutional Record
  if (/^CONST-/.test(ref)) return 'CONSTITUTIONAL_RECORD';

  // 4. Engineering Intent
  if (/^ATD-INT-/.test(ref) || /^INT-/.test(ref)) return 'ENGINEERING_INTENT';

  // 5. Engineering Plan
  if (/^ATD-PLN-/.test(ref) || /^PLN-/.test(ref)) return 'ENGINEERING_PLAN';

  // 6. Bug or Incident
  if (/^BUG-/.test(ref) || /^BUG-BF-/.test(ref) || /^INC-/.test(ref)) return 'BUG_OR_INCIDENT';

  // 7. Batch or Migration
  if (/^BATCH-/.test(ref)) return 'BATCH_OR_MIGRATION';

  // 8. Pipeline execution
  if (/^PIPELINE-/.test(ref) || /^EXEC-/.test(ref)) return 'PIPELINE_EXECUTION';

  // 9. Engineering Record (from record_ref pattern)
  if (/^ERC-/.test(ref) || /^REC-/.test(ref)) return 'ENGINEERING_RECORD';

  // 10. Check if an accepted identity mapping links this to an EWO
  const hasIdentityToEwo = evidence.some(
    e => e.source_table === 'engineering_identity_map' && e.evidence_summary?.includes('EWO-')
  );
  if (hasIdentityToEwo) {
    // Only classify as EWO if the identity mapping explicitly links to an EWO ref
    const ewoMatch = evidence.find(
      e => e.source_table === 'engineering_identity_map' && /EWO-\d+/.test(e.evidence_summary || '')
    );
    if (ewoMatch) return 'ENGINEERING_WORK_ORDER';
  }

  // 11. Check source table for ewo_ref linkage
  const hasEwoRefEvidence = evidence.some(
    e => e.source_table === 'engineering_records_library' && e.evidence_type === 'completion_report'
  );
  if (hasEwoRefEvidence && !isNonEwoPrefix(ref)) return 'ENGINEERING_WORK_ORDER';

  return 'UNKNOWN';
}

function isNonEwoPrefix(ref: string): boolean {
  const nonEwoPrefixes = ['ATD-INT-', 'ATD-PLN-', 'BUG-', 'BATCH-', 'CONST-', 'AMD-', 'PIPELINE-', 'EXEC-', 'INC-', 'ERC-', 'REC-'];
  return nonEwoPrefixes.some(p => ref.startsWith(p));
}

// ─── Classification Labels ──────────────────────────────────────────────────

export const CLASSIFICATION_LABELS: Record<ObjectClassification, { label: string; colour: string; description: string }> = {
  ENGINEERING_WORK_ORDER: {
    label: 'Engineering Work Order',
    colour: 'text-blue-700 bg-blue-50 border-blue-200',
    description: 'Recoverable Engineering Work Order candidate.',
  },
  ENGINEERING_AMENDMENT: {
    label: 'Engineering Amendment',
    colour: 'text-purple-700 bg-purple-50 border-purple-200',
    description: 'Engineering amendment record.',
  },
  CONSTITUTIONAL_RECORD: {
    label: 'Constitutional Record',
    colour: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    description: 'Constitutional document or record.',
  },
  ENGINEERING_RECORD: {
    label: 'Engineering Record',
    colour: 'text-cyan-700 bg-cyan-50 border-cyan-200',
    description: 'Engineering record from the records library.',
  },
  ENGINEERING_INTENT: {
    label: 'Engineering Intent',
    colour: 'text-amber-700 bg-amber-50 border-amber-200',
    description: 'Historical engineering intent (ATD-INT). Not an EWO.',
  },
  ENGINEERING_PLAN: {
    label: 'Engineering Plan',
    colour: 'text-teal-700 bg-teal-50 border-teal-200',
    description: 'Historical engineering plan (ATD-PLN). Not an EWO.',
  },
  PIPELINE_EXECUTION: {
    label: 'Pipeline Execution',
    colour: 'text-slate-700 bg-slate-50 border-slate-200',
    description: 'Pipeline execution record.',
  },
  BUG_OR_INCIDENT: {
    label: 'Bug or Incident',
    colour: 'text-red-700 bg-red-50 border-red-200',
    description: 'Bug report or incident record.',
  },
  BATCH_OR_MIGRATION: {
    label: 'Batch or Migration',
    colour: 'text-orange-700 bg-orange-50 border-orange-200',
    description: 'Batch or migration record.',
  },
  UNKNOWN: {
    label: 'Unclassified',
    colour: 'text-slate-600 bg-slate-50 border-slate-200',
    description: 'Object classification could not be determined.',
  },
};

export const CLASSIFICATION_CATEGORIES: { key: ObjectClassification; label: string }[] = [
  { key: 'ENGINEERING_WORK_ORDER', label: 'Recoverable Engineering Work Orders' },
  { key: 'ENGINEERING_AMENDMENT', label: 'Engineering Amendments' },
  { key: 'CONSTITUTIONAL_RECORD', label: 'Constitutional Records' },
  { key: 'ENGINEERING_RECORD', label: 'Engineering Records' },
  { key: 'ENGINEERING_INTENT', label: 'Historical Workflow Objects' },
  { key: 'ENGINEERING_PLAN', label: 'Historical Workflow Objects' },
  { key: 'PIPELINE_EXECUTION', label: 'Historical Workflow Objects' },
  { key: 'BUG_OR_INCIDENT', label: 'Bugs and Incidents' },
  { key: 'BATCH_OR_MIGRATION', label: 'Batch and Migration Records' },
  { key: 'UNKNOWN', label: 'Unclassified Objects' },
];

// ─── Import Capability Matrix (EWO-014.19A.6) ──────────────────────────────
// Classification correctness and import capability are independent concepts.
// The Historical Recovery Engine must never encourage Product Owners to
// reclassify a correctly classified object merely because the import
// pipeline does not yet support its domain. Historical truth always takes
// precedence over implementation convenience.
//
// When a new domain import pipeline is implemented, flip its capability flag
// here — previously recovered packages become importable without any
// modification to their classification. The architecture is capability-driven,
// not classification-driven.

export interface ImportCapability {
  classification: ObjectClassification;
  supported: boolean;
  ledgerLabel: string;
  statusLabel: string;
}

export const IMPORT_CAPABILITY_MATRIX: Record<ObjectClassification, ImportCapability> = {
  ENGINEERING_WORK_ORDER: {
    classification: 'ENGINEERING_WORK_ORDER',
    supported: true,
    ledgerLabel: 'Engineering Work Order Ledger',
    statusLabel: 'Supported',
  },
  ENGINEERING_INTENT: {
    classification: 'ENGINEERING_INTENT',
    supported: true,
    ledgerLabel: 'Engineering Intent Ledger',
    statusLabel: 'Supported',
  },
  ENGINEERING_RECORD: {
    classification: 'ENGINEERING_RECORD',
    ledgerLabel: 'Engineering Records Library',
    supported: true,
    statusLabel: 'Supported',
  },
  ENGINEERING_AMENDMENT: {
    classification: 'ENGINEERING_AMENDMENT',
    supported: true,
    ledgerLabel: 'Engineering Amendment Ledger',
    statusLabel: 'Supported',
  },
  CONSTITUTIONAL_RECORD: {
    classification: 'CONSTITUTIONAL_RECORD',
    supported: true,
    ledgerLabel: 'Constitutional Record Ledger',
    statusLabel: 'Supported',
  },
  ENGINEERING_PLAN: {
    classification: 'ENGINEERING_PLAN',
    supported: true,
    ledgerLabel: 'Engineering Plan Ledger',
    statusLabel: 'Supported',
  },
  PIPELINE_EXECUTION: {
    classification: 'PIPELINE_EXECUTION',
    supported: true,
    ledgerLabel: 'Pipeline Execution Ledger',
    statusLabel: 'Supported',
  },
  BATCH_OR_MIGRATION: {
    classification: 'BATCH_OR_MIGRATION',
    supported: true,
    ledgerLabel: 'Batch & Migration Ledger',
    statusLabel: 'Supported',
  },
  BUG_OR_INCIDENT: {
    classification: 'BUG_OR_INCIDENT',
    supported: false,
    ledgerLabel: 'Bug & Incident Ledger',
    statusLabel: 'Not Yet Supported',
  },
  UNKNOWN: {
    classification: 'UNKNOWN',
    supported: false,
    ledgerLabel: 'Unclassified',
    statusLabel: 'Not Yet Supported',
  },
};

export function getImportCapability(classification: ObjectClassification | string | null | undefined): ImportCapability {
  if (!classification) return IMPORT_CAPABILITY_MATRIX.UNKNOWN;
  return IMPORT_CAPABILITY_MATRIX[classification as ObjectClassification] ?? IMPORT_CAPABILITY_MATRIX.UNKNOWN;
}

export function isImportSupported(classification: ObjectClassification | string | null | undefined): boolean {
  return getImportCapability(classification).supported;
}

// Recovery summary bucket — decouples governance decisions from
// implementation limitations. Used by the Recovery Dashboard to group
// packages by the action the Product Owner should take next.
export type RecoverySummaryBucket =
  | 'ready_to_import'
  | 'requires_reclassification'
  | 'requires_more_evidence'
  | 'import_not_yet_supported'
  | 'requires_review'
  | 'imported'
  | 'deleted'
  | 'dismissed';

// ─── Recovery Decision Engine (BUG-006R.2) ──────────────────────────────────────
//
// Replaces the single "Needs Product Owner Review" outcome with four governed
// recovery outcomes:
// A. Recover Automatically — sufficient evidence, safe for automatic recovery
// B. Product Owner Decision — evidence exists, multiple legitimate outcomes
// C. Unrecoverable — evidence insufficient to reconstruct the object
// D. Legacy Reference — older numbering/governance convention

export type RecoveryOutcome =
  | 'recover_automatically'
  | 'product_owner_decision'
  | 'unrecoverable'
  | 'legacy_reference';

export interface RecoveryExplanation {
  evidence_searched: string[];
  evidence_found: string[];
  evidence_missing: string[];
  recovery_confidence: EngineeringConfidence;
  recovery_rationale: string;
  recommended_action: string;
  po_options: string[];
}

export interface RecoveryDecision {
  outcome: RecoveryOutcome;
  explanation: RecoveryExplanation;
}

export const RECOVERY_OUTCOME_LABELS: Record<RecoveryOutcome, { label: string; description: string; colour: string }> = {
  recover_automatically: {
    label: 'Recover Automatically',
    description: 'Sufficient authoritative evidence exists. Safe for automatic recovery.',
    colour: 'green',
  },
  product_owner_decision: {
    label: 'Product Owner Decision',
    description: 'Evidence exists but multiple legitimate outcomes remain. Requires Product Owner decision.',
    colour: 'amber',
  },
  unrecoverable: {
    label: 'Unrecoverable',
    description: 'Authoritative evidence is insufficient to reconstruct the Engineering object.',
    colour: 'red',
  },
  legacy_reference: {
    label: 'Legacy Reference',
    description: 'Reference belongs to an older numbering or governance convention.',
    colour: 'blue',
  },
};

export const UNRECOVERABLE_PO_OPTIONS = [
  'Accept permanent gap',
  'Create Historical Reference',
  'Ignore permanently',
  'Record governance decision',
] as const;

export const LEGACY_PO_OPTIONS = [
  'Map to canonical reference',
  'Migrate to current convention',
  'Archive as historical',
  'Retain as-is',
] as const;

export interface RecoveryBucketLabel {
  key: RecoverySummaryBucket;
  label: string;
  description: string;
}

export const RECOVERY_SUMMARY_BUCKETS: RecoveryBucketLabel[] = [
  { key: 'ready_to_import', label: 'Ready To Import', description: 'Approved and import-supported. Awaiting ledger import.' },
  { key: 'requires_reclassification', label: 'Requires Reclassification', description: 'Classification is incorrect and should be corrected before proceeding.' },
  { key: 'requires_more_evidence', label: 'Requires More Evidence', description: 'Product Owner has requested additional evidence.' },
  { key: 'import_not_yet_supported', label: 'Import Not Yet Supported', description: 'Correctly classified, but the import pipeline does not yet support this domain.' },
  { key: 'requires_review', label: 'Requires Review', description: 'Awaiting Product Owner review.' },
  { key: 'imported', label: 'Imported', description: 'Already imported into the Engineering Ledger.' },
  { key: 'deleted', label: 'Deleted', description: 'Soft-deleted recovery packages.' },
  { key: 'dismissed', label: 'Dismissed', description: 'Permanently dismissed candidates.' },
];

export function classifyRecoveryBucket(pkg: RecoveryPackage): RecoverySummaryBucket {
  if (pkg.is_deleted) return 'deleted';
  if (pkg.is_permanently_dismissed) return 'dismissed';
  if (pkg.imported_at && pkg.imported_ewo_id) return 'imported';
  if (pkg.recovery_status === 'evidence_requested' || pkg.po_status === 'request_evidence') return 'requires_more_evidence';
  if (pkg.po_status !== 'approved') return 'requires_review';
  // Approved — evaluate import capability independently of classification correctness.
  if (!isImportSupported(pkg.object_classification)) return 'import_not_yet_supported';
  return 'ready_to_import';
}

// ─── Recovery Decision Engine (BUG-006R.2) ──────────────────────────────────────

const LEGACY_PREFIXES = ['EWO-007R', 'EWO-008-AMD', 'EWO-009.', 'EWO-011.', 'EWO-014.7E', 'EWO-014.3.2B'];

function isLegacyReference(ref: string): boolean {
  return LEGACY_PREFIXES.some(p => ref.startsWith(p));
}

export function classifyRecoveryOutcome(
  pkg: RecoveryPackage,
  evidence: RecoveryEvidence[] = [],
): RecoveryDecision {
  const evidenceSearched = [
    'engineering_work_orders',
    'engineering_records_library',
    'engineering_identity_map',
    'engineering_lifecycle_events',
    'ewo_engineering_packages',
    'ewo_completion_reports',
  ];

  const evidenceFound = evidence.map(e => `${e.source_table}: ${e.evidence_summary || e.evidence_type}`);
  const evidenceMissing: string[] = [];
  if (!evidence.some(e => e.source_table === 'engineering_work_orders')) {
    evidenceMissing.push('No canonical Engineering Work Order record');
  }
  if (!evidence.some(e => e.source_table === 'ewo_engineering_packages')) {
    evidenceMissing.push('No engineering package with scope/deliverables');
  }
  if (!evidence.some(e => e.source_table === 'ewo_completion_reports')) {
    evidenceMissing.push('No completion report');
  }

  const confidence = pkg.engineering_confidence;
  const ref = pkg.canonical_reference;

  // D. Legacy Reference
  if (isLegacyReference(ref)) {
    return {
      outcome: 'legacy_reference',
      explanation: {
        evidence_searched: evidenceSearched,
        evidence_found: evidenceFound,
        evidence_missing: evidenceMissing,
        recovery_confidence: confidence,
        recovery_rationale: `Reference ${ref} belongs to an older numbering or governance convention. Recommend mapping, migrating, archiving, or retaining rather than treating as invalid.`,
        recommended_action: 'Map or migrate to current convention, or archive as historical.',
        po_options: [...LEGACY_PO_OPTIONS],
      },
    };
  }

  // A. Recover Automatically
  if (confidence === 'HIGH' && isImportSupported(pkg.object_classification) && pkg.po_status === 'approved') {
    return {
      outcome: 'recover_automatically',
      explanation: {
        evidence_searched: evidenceSearched,
        evidence_found: evidenceFound,
        evidence_missing: evidenceMissing,
        recovery_confidence: confidence,
        recovery_rationale: 'Sufficient authoritative evidence exists across multiple sources. Safe for automatic recovery.',
        recommended_action: 'Import to Engineering Ledger automatically.',
        po_options: [],
      },
    };
  }

  // C. Unrecoverable
  if (confidence === 'UNKNOWN' || (confidence === 'LOW' && evidence.length <= 1)) {
    return {
      outcome: 'unrecoverable',
      explanation: {
        evidence_searched: evidenceSearched,
        evidence_found: evidenceFound,
        evidence_missing: evidenceMissing.length > 0 ? evidenceMissing : ['Insufficient evidence to reconstruct the Engineering object'],
        recovery_confidence: confidence,
        recovery_rationale: `Authoritative evidence is insufficient to reconstruct ${ref}. Do not continually resurface this object without a new evidence source.`,
        recommended_action: 'Product Owner to select: accept permanent gap, create historical reference, ignore permanently, or record governance decision.',
        po_options: [...UNRECOVERABLE_PO_OPTIONS],
      },
    };
  }

  // B. Product Owner Decision
  return {
    outcome: 'product_owner_decision',
    explanation: {
      evidence_searched: evidenceSearched,
      evidence_found: evidenceFound,
      evidence_missing: evidenceMissing,
      recovery_confidence: confidence,
      recovery_rationale: `Evidence exists for ${ref} but multiple legitimate outcomes remain. Requires Product Owner decision to determine the correct recovery path.`,
      recommended_action: 'Product Owner to review evidence and approve, reject, request more evidence, or reclassify.',
      po_options: [],
    },
  };
}

// ─── Canonical Closure Method Resolver (EWO-014.19A.3R Fix) ────────────────────
// Central resolver for the closure_method vocabulary governed by the
// engineering_work_orders_closure_method_check constraint. Recovery import,
// batch import, retry, and any service that creates an EWO must use this
// resolver. Never invent historical state; never write an unsupported value.

export const PERMITTED_CLOSURE_METHODS = [
  'Product Owner Acceptance',
  'Historical Migration',
  'Administrative Override',
  'Automated Governance',
] as const;

export type ClosureMethod = typeof PERMITTED_CLOSURE_METHODS[number];

// Governed mappings from legacy/observed closure labels to the canonical value.
// Only add a mapping when the legacy label has a clear, evidenced semantic
// equivalent in the permitted set. Never map an unsupported value to null
// implicitly — return null and let the caller decide the truthful state.
const LEGACY_CLOSURE_METHOD_MAP: Record<string, ClosureMethod> = {
  'Historical Recovery': 'Historical Migration',
  'Historical Import': 'Historical Migration',
  'Historical': 'Historical Migration',
  'PO Acceptance': 'Product Owner Acceptance',
  'Product Owner': 'Product Owner Acceptance',
  'Admin Override': 'Administrative Override',
  'Automated': 'Automated Governance',
};

export interface ClosureMethodResolution {
  closureMethod: string | null;
  source: 'as-is' | 'normalised' | 'absent' | 'unsupported';
  sourceValue: string | null;
  normalised: boolean;
  permittedValues: readonly string[];
  reason: string;
}

// Resolves a recovered/source closure_method to a value permitted by the
// engineering_work_orders_closure_method_check constraint.
//
// - If the source value is already permitted, it is preserved as-is.
// - If the source value is a recognised legacy label, it is normalised.
// - If no source value is present (null/undefined/empty), returns null —
//   the schema allows closure_method to be null. The caller must NOT mark
//   the EWO as closed when closure_method is null; an open/historical
//   EWO uses status='closed' only when a valid closure_method is supplied.
//   For recovered EWOs with no closure evidence, the truthful state is
//   an open historical EWO (status reflects the recovered lifecycle, not
//   'closed'). See resolveRecoveryClosureMethod for the recovery-specific
//   policy.
// - If the source value is present but unsupported, returns null with
//   source='unsupported' so the caller can surface a governed error.
export function resolveClosureMethod(sourceValue: string | null | undefined): ClosureMethodResolution {
  const permitted = PERMITTED_CLOSURE_METHODS;
  if (sourceValue === null || sourceValue === undefined || sourceValue.trim() === '') {
    return {
      closureMethod: null,
      source: 'absent',
      sourceValue: null,
      normalised: false,
      permittedValues: permitted,
      reason: 'No historical closure_method evidence present.',
    };
  }
  const trimmed = sourceValue.trim();
  if ((permitted as readonly string[]).includes(trimmed)) {
    return {
      closureMethod: trimmed,
      source: 'as-is',
      sourceValue: trimmed,
      normalised: false,
      permittedValues: permitted,
      reason: 'Source closure_method is already a permitted value.',
    };
  }
  const mapped = LEGACY_CLOSURE_METHOD_MAP[trimmed];
  if (mapped) {
    return {
      closureMethod: mapped,
      source: 'normalised',
      sourceValue: trimmed,
      normalised: true,
      permittedValues: permitted,
      reason: `Legacy closure_method '${trimmed}' normalised to canonical '${mapped}'.`,
    };
  }
  return {
    closureMethod: null,
    source: 'unsupported',
    sourceValue: trimmed,
    normalised: false,
    permittedValues: permitted,
    reason: `Source closure_method '${trimmed}' is not in the permitted set and no governed mapping exists.`,
  };
}

// Recovery-specific closure policy: recovered EWOs are historical imports.
// The canonical closure_method for a recovered EWO is 'Historical Migration'
// because the EWO is being migrated from the historical recovery ledger into
// the Engineering Ledger. This is truthful — the recovery process IS a
// historical migration. It does not invent Product Owner Acceptance or
// Automated Governance. If the source carried a different permitted value
// supported by evidence, that value is preserved.
//
// For open/incomplete recovered EWOs (no closure evidence), the EWO is still
// imported with closure_method='Historical Migration' and status='closed'
// because the recovery import itself is the closure event — the historical
// record is being closed into the ledger. This does NOT invent a PO acceptance
// event; po_acceptance_notes/po_accepted_by/po_accepted_at remain null unless
// the recovery package carried explicit PO review evidence.
export function resolveRecoveryClosureMethod(sourceValue: string | null | undefined): ClosureMethodResolution {
  const base = resolveClosureMethod(sourceValue);
  if (base.closureMethod !== null) {
    return base;
  }
  // No permitted value resolved — use Historical Migration as the truthful
  // closure method for a recovered EWO import. This is the governed default
  // for recovery imports: the act of importing a historical record into the
  // ledger is itself a Historical Migration closure.
  return {
    closureMethod: 'Historical Migration',
    source: base.source === 'unsupported' ? 'normalised' : 'absent',
    sourceValue: base.sourceValue,
    normalised: base.source === 'unsupported',
    permittedValues: PERMITTED_CLOSURE_METHODS,
    reason: base.source === 'unsupported'
      ? `Unsupported source closure_method '${base.sourceValue}' normalised to 'Historical Migration' for recovery import.`
      : 'No historical closure_method evidence present; defaulted to Historical Migration for recovery import.',
  };
}

export function isValidClosureMethod(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return true; // schema allows null
  return (PERMITTED_CLOSURE_METHODS as readonly string[]).includes(value.trim());
}

// ─── Discovery Engine ────────────────────────────────────────────────────────
// Scans all engineering repositories, groups artefacts by identity, classifies
// each candidate, and produces Recovery Packages. Only EWO-classified objects
// enter the default recovery queue. Non-EWO objects are retained but visible
// under their category filters. History must never be invented.

interface EvidenceItem {
  source_table: string;
  source_record_ref: string;
  source_record_id: string;
  evidence_type: string;
  evidence_summary: string;
  title?: string;
  executive_summary?: string;
  engineering_objective?: string;
  deliverables?: string;
  verification_evidence?: string;
  po_decisions?: string;
  is_superseded?: boolean;
}

export async function runDiscoveryEngine(): Promise<DiscoveryResult> {
  const allEvidence = new Map<string, EvidenceItem[]>();

  // 1. Scan engineering_records_library for records with ewo_ref
  const { data: records } = await supabase
    .from('engineering_records_library')
    .select('id, record_ref, record_type, title, ewo_ref, engineering_objective, implementation_summary, validation_summary, status, supersedes_record_id, source_evidence')
    .not('ewo_ref', 'is', null);

  if (records) {
    for (const rec of records) {
      const ref = rec.ewo_ref as string;
      if (!allEvidence.has(ref)) allEvidence.set(ref, []);
      allEvidence.get(ref)!.push({
        source_table: 'engineering_records_library',
        source_record_ref: rec.record_ref,
        source_record_id: rec.id,
        evidence_type: rec.record_type || 'completion_report',
        evidence_summary: rec.title || '',
        title: rec.title,
        engineering_objective: rec.engineering_objective,
        deliverables: rec.implementation_summary,
        verification_evidence: rec.validation_summary,
        is_superseded: !!rec.supersedes_record_id,
      });
    }
  }

  // 2. Scan engineering_identity_map for canonical groupings
  const { data: identityMaps } = await supabase
    .from('engineering_identity_map')
    .select('canonical_reference, historical_reference, historical_type, relationship_type, confidence')
    .eq('reconciliation_status', 'accepted');

  if (identityMaps) {
    for (const im of identityMaps) {
      const ref = im.canonical_reference as string;
      if (!allEvidence.has(ref)) allEvidence.set(ref, []);
      allEvidence.get(ref)!.push({
        source_table: 'engineering_identity_map',
        source_record_ref: im.historical_reference,
        source_record_id: '',
        evidence_type: im.historical_type || 'identity_mapping',
        evidence_summary: `Identity mapping: ${im.historical_reference} → ${im.canonical_reference} (${im.relationship_type})`,
      });
    }
  }

  // 3. Scan engineering_lifecycle_events for historical events
  const { data: lifecycleEvents } = await supabase
    .from('engineering_lifecycle_events')
    .select('id, event_ref, object_ref, object_type, transition, actor, reason, metadata')
    .not('object_ref', 'is', null);

  if (lifecycleEvents) {
    for (const ev of lifecycleEvents) {
      const ref = ev.object_ref as string;
      if (!ref) continue;
      if (!allEvidence.has(ref)) allEvidence.set(ref, []);
      allEvidence.get(ref)!.push({
        source_table: 'engineering_lifecycle_events',
        source_record_ref: ev.event_ref,
        source_record_id: ev.id,
        evidence_type: 'lifecycle_event',
        evidence_summary: `${ev.transition || 'event'} by ${ev.actor || 'unknown'}: ${ev.reason || ''}`,
      });
    }
  }

  // 4. Scan ewo_engineering_packages for packages linked to EWOs
  const { data: ewoPackages } = await supabase
    .from('ewo_engineering_packages')
    .select('id, ewo_id, version, summary, engineering_objectives, implementation_scope, acceptance_criteria, expected_deliverables, verification_requirements')
    .not('ewo_id', 'is', null);

  if (ewoPackages) {
    const ewoIds = ewoPackages.map(p => p.ewo_id).filter(Boolean);
    if (ewoIds.length > 0) {
      const { data: ewos } = await supabase
        .from('engineering_work_orders')
        .select('id, ewo_ref')
        .in('id', ewoIds);
      const ewoMap = new Map(ewos?.map(e => [e.id, e.ewo_ref]) || []);

      for (const pkg of ewoPackages) {
        const ref = ewoMap.get(pkg.ewo_id);
        if (!ref) continue;
        if (!allEvidence.has(ref)) allEvidence.set(ref, []);
        allEvidence.get(ref)!.push({
          source_table: 'ewo_engineering_packages',
          source_record_ref: `PKG-v${pkg.version}`,
          source_record_id: pkg.id,
          evidence_type: 'engineering_package',
          evidence_summary: pkg.summary || '',
          engineering_objective: pkg.engineering_objectives,
          deliverables: pkg.expected_deliverables,
          verification_evidence: pkg.verification_requirements,
        });
      }
    }
  }

  // 5. Check which EWO refs already exist — skip those
  const existingRefs = new Set<string>();
  const { data: existingEwos } = await supabase
    .from('engineering_work_orders')
    .select('ewo_ref');
  if (existingEwos) {
    for (const e of existingEwos) existingRefs.add(e.ewo_ref);
  }

  // 6. Check existing recovery packages (all statuses) — skip those
  const existingRecoveryRefs = new Set<string>();
  const deletedRefs = new Set<string>();
  const dismissedRefs = new Set<string>();
  const { data: existingRecoveries } = await supabase
    .from('engineering_recovery_packages')
    .select('canonical_reference, is_deleted, is_permanently_dismissed');
  if (existingRecoveries) {
    for (const r of existingRecoveries) {
      existingRecoveryRefs.add(r.canonical_reference);
      if (r.is_deleted) deletedRefs.add(r.canonical_reference);
      if (r.is_permanently_dismissed) dismissedRefs.add(r.canonical_reference);
    }
  }

  // 7. Generate recovery packages
  let packagesCreated = 0;
  let packagesSkipped = 0;
  let existingEwoSkipped = 0;
  let existingRecoverySkipped = 0;
  let deletedSkipped = 0;
  let dismissedSkipped = 0;
  const candidates: DiscoveryResult['candidates'] = [];

  // Get next recovery ref number
  const { count } = await supabase
    .from('engineering_recovery_packages')
    .select('*', { count: 'exact', head: true });
  let nextNum = (count || 0) + 1;

  for (const [canonicalRef, evidenceItems] of allEvidence) {
    // Skip if EWO already exists
    if (existingRefs.has(canonicalRef)) {
      existingEwoSkipped++;
      continue;
    }
    // Skip if recovery package already exists (active or deleted)
    if (existingRecoveryRefs.has(canonicalRef)) {
      existingRecoverySkipped++;
      continue;
    }
    // Skip permanently dismissed — never recreate
    if (dismissedRefs.has(canonicalRef)) {
      dismissedSkipped++;
      continue;
    }

    // Classify the object
    const classification = classifyObject(canonicalRef, evidenceItems);

    const recoveryRef = `REC-${String(nextNum).padStart(3, '0')}`;
    nextNum++;

    const pkg = buildRecoveryPackage(recoveryRef, canonicalRef, evidenceItems);

    const { data: inserted, error } = await supabase
      .from('engineering_recovery_packages')
      .insert({
        recovery_ref: pkg.recovery_ref,
        canonical_reference: pkg.canonical_reference,
        title: pkg.title,
        executive_summary: pkg.executive_summary,
        engineering_objective: pkg.engineering_objective,
        known_deliverables: pkg.known_deliverables,
        known_verification_evidence: pkg.known_verification_evidence,
        known_po_decisions: pkg.known_po_decisions,
        related_artefacts: pkg.related_artefacts,
        historical_references: pkg.historical_references,
        evidence_sources: pkg.evidence_sources,
        evidence_missing: pkg.evidence_missing,
        recovery_notes: pkg.recovery_notes,
        engineering_confidence: pkg.engineering_confidence,
        confidence_explanation: pkg.confidence_explanation,
        recovery_recommendation: pkg.recovery_recommendation,
        po_status: 'pending',
        recovery_status: 'pending_review',
        recovered_by: 'Recovery Engine',
        object_classification: classification,
      })
      .select('id')
      .single();

    if (error || !inserted) {
      packagesSkipped++;
      continue;
    }

    packagesCreated++;

    // Insert evidence items
    const evidenceRows = evidenceItems.map(e => ({
      recovery_package_id: inserted.id,
      source_table: e.source_table,
      source_record_ref: e.source_record_ref,
      source_record_id: e.source_record_id,
      evidence_type: e.evidence_type,
      evidence_summary: e.evidence_summary,
      is_duplicate: false,
      is_superseded: e.is_superseded || false,
      has_conflict: false,
      conflict_notes: null,
    }));

    if (evidenceRows.length > 0) {
      await supabase.from('engineering_recovery_evidence').insert(evidenceRows);
    }

    // Create audit events: discovered + classified
    await supabase.from('engineering_recovery_audit').insert([
      {
        recovery_package_id: inserted.id,
        action: 'discovered',
        acted_by: 'Recovery Engine',
        evidence_used: `${evidenceItems.length} evidence item(s) from ${new Set(evidenceItems.map(e => e.source_table)).size} source(s)`,
        confidence: pkg.engineering_confidence,
        reason: 'Automated discovery scan',
        metadata: {},
      },
      {
        recovery_package_id: inserted.id,
        action: 'classified',
        acted_by: 'Recovery Engine',
        reason: `Classified as ${classification} based on reference prefix and evidence`,
        metadata: { classification, canonical_reference: canonicalRef },
      },
    ]);

    candidates.push({
      canonical_reference: canonicalRef,
      title: pkg.title,
      evidence_count: evidenceItems.length,
      confidence: pkg.engineering_confidence,
      classification,
    });
  }

  return {
    packagesCreated,
    packagesSkipped,
    existingEwoSkipped,
    existingRecoverySkipped,
    deletedSkipped,
    dismissedSkipped,
    candidates,
  };
}

// ─── Recovery Package Builder ───────────────────────────────────────────────

function buildRecoveryPackage(
  recoveryRef: string,
  canonicalRef: string,
  evidence: EvidenceItem[]
): {
  recovery_ref: string;
  canonical_reference: string;
  title: string;
  executive_summary: string;
  engineering_objective: string;
  known_deliverables: string;
  known_verification_evidence: string;
  known_po_decisions: string;
  related_artefacts: string;
  historical_references: string;
  evidence_sources: string[];
  evidence_missing: string;
  recovery_notes: string;
  engineering_confidence: EngineeringConfidence;
  confidence_explanation: string;
  recovery_recommendation: string;
} {
  const sources = [...new Set(evidence.map(e => e.source_table))];
  const evidenceSources = evidence.map(e => `${e.source_table}:${e.source_record_ref || e.source_record_id}`);

  const title = evidence.find(e => e.title)?.title || canonicalRef;
  const execSummary = evidence.find(e => e.evidence_summary)?.evidence_summary || '';
  const engObjective = evidence.find(e => e.engineering_objective)?.engineering_objective || '';
  const deliverables = evidence.find(e => e.deliverables)?.deliverables || '';
  const verificationEvidence = evidence.find(e => e.verification_evidence)?.verification_evidence || '';

  const historicalRefs = evidence
    .filter(e => e.source_table === 'engineering_identity_map')
    .map(e => e.source_record_ref)
    .filter(Boolean)
    .join(', ');

  const relatedArtefacts = evidence.map(e => `${e.evidence_type}: ${e.source_record_ref || ''}`).join(', ');

  const { confidence, explanation, missing, recommendation } = assessConfidence(evidence);

  return {
    recovery_ref: recoveryRef,
    canonical_reference: canonicalRef,
    title,
    executive_summary: execSummary,
    engineering_objective: engObjective,
    known_deliverables: deliverables,
    known_verification_evidence: verificationEvidence,
    known_po_decisions: '',
    related_artefacts: relatedArtefacts,
    historical_references: historicalRefs,
    evidence_sources: evidenceSources,
    evidence_missing: missing,
    recovery_notes: `Recovered from ${evidence.length} evidence item(s) across ${sources.length} source(s): ${sources.join(', ')}.`,
    engineering_confidence: confidence,
    confidence_explanation: explanation,
    recovery_recommendation: recommendation,
  };
}

// ─── Confidence Assessment ───────────────────────────────────────────────────

interface ConfidenceResult {
  confidence: EngineeringConfidence;
  explanation: string;
  missing: string;
  recommendation: string;
}

function assessConfidence(evidence: EvidenceItem[]): ConfidenceResult {
  const evidenceTypes = new Set(evidence.map(e => e.evidence_type));
  const sources = new Set(evidence.map(e => e.source_table));
  const hasSuperseded = evidence.some(e => e.is_superseded);

  const hasRecord = evidenceTypes.has('completion_report') || evidenceTypes.has('engineering_record');
  const hasPackage = evidenceTypes.has('engineering_package');
  const hasLifecycle = evidenceTypes.has('lifecycle_event');
  const hasIdentity = evidenceTypes.has('identity_mapping');

  const categories = [hasRecord, hasPackage, hasLifecycle, hasIdentity].filter(Boolean).length;

  const missing: string[] = [];
  if (!hasRecord) missing.push('Engineering Records / Completion Reports');
  if (!hasPackage) missing.push('Engineering Package');
  if (!hasLifecycle) missing.push('Lifecycle Events');
  if (!hasIdentity) missing.push('Identity Mapping');

  let confidence: EngineeringConfidence;
  let explanation: string;
  let recommendation: string;

  if (categories >= 3 && evidence.length >= 5) {
    confidence = 'HIGH';
    explanation = `${categories} of 4 evidence categories present across ${sources.size} source(s). ${evidence.length} total evidence items.`;
    recommendation = 'Sufficient evidence for recovery. Recommend Product Owner review and approval.';
  } else if (categories >= 2 && evidence.length >= 3) {
    confidence = 'MEDIUM';
    explanation = `${categories} of 4 evidence categories present across ${sources.size} source(s). ${evidence.length} total evidence items. Missing: ${missing.join(', ')}.`;
    recommendation = 'Partial evidence available. Product Owner should review and supplement if possible.';
  } else if (categories >= 1 && evidence.length >= 1) {
    confidence = 'LOW';
    explanation = `${categories} of 4 evidence categories present across ${sources.size} source(s). ${evidence.length} total evidence item(s). Missing: ${missing.join(', ')}.`;
    recommendation = 'Minimal evidence. Product Owner should request more evidence before approval.';
  } else {
    confidence = 'UNKNOWN';
    explanation = 'Insufficient evidence to assess recovery confidence.';
    recommendation = 'Do not import without additional evidence.';
  }

  if (hasSuperseded) {
    explanation += ' Note: some evidence is from superseded records.';
  }

  return {
    confidence,
    explanation,
    missing: missing.length > 0 ? `Missing evidence: ${missing.join(', ')}` : 'No missing evidence identified.',
    recommendation,
  };
}

// ─── CRUD: Recovery Packages ─────────────────────────────────────────────────

export async function getRecoveryPackages(filter?: {
  po_status?: RecoveryPOStatus;
  confidence?: EngineeringConfidence;
  classification?: ObjectClassification;
  includeDeleted?: boolean;
  includeDismissed?: boolean;
}): Promise<RecoveryPackage[]> {
  let query = supabase
    .from('engineering_recovery_packages')
    .select('*')
    .order('created_at', { ascending: false });

  // By default, exclude deleted and dismissed
  if (!filter?.includeDeleted) query = query.eq('is_deleted', false);
  if (!filter?.includeDismissed) query = query.eq('is_permanently_dismissed', false);

  if (filter?.po_status) query = query.eq('po_status', filter.po_status);
  if (filter?.confidence) query = query.eq('engineering_confidence', filter.confidence);
  if (filter?.classification) query = query.eq('object_classification', filter.classification);

  const { data, error } = await query;
  if (error) return [];
  return (data || []) as RecoveryPackage[];
}

export async function getRecoveryPackage(id: string): Promise<RecoveryPackage | null> {
  const { data, error } = await supabase
    .from('engineering_recovery_packages')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as RecoveryPackage;
}

// Resolve by recovery_ref (e.g. REC-001) — used for URL-driven routing where
// the canonical UUID is not known. Returns null if not found or if multiple
// matches exist (should never happen — recovery_ref is unique).
export async function getRecoveryPackageByRef(recoveryRef: string): Promise<RecoveryPackage | null> {
  const { data, error } = await supabase
    .from('engineering_recovery_packages')
    .select('*')
    .eq('recovery_ref', recoveryRef)
    .maybeSingle();
  if (error || !data) return null;
  return data as RecoveryPackage;
}

export async function getRecoveryEvidence(packageId: string): Promise<RecoveryEvidence[]> {
  const { data, error } = await supabase
    .from('engineering_recovery_evidence')
    .select('*')
    .eq('recovery_package_id', packageId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return (data || []) as RecoveryEvidence[];
}

export async function getRecoveryAuditTrail(packageId?: string): Promise<RecoveryAuditEvent[]> {
  let query = supabase
    .from('engineering_recovery_audit')
    .select('*')
    .order('acted_at', { ascending: false });
  if (packageId) query = query.eq('recovery_package_id', packageId);
  const { data, error } = await query;
  if (error) return [];
  return (data || []) as RecoveryAuditEvent[];
}

export async function getReclassificationHistory(packageId: string): Promise<ReclassificationHistoryEntry[]> {
  const audit = await getRecoveryAuditTrail(packageId);
  const reclassActions = new Set(['product_owner_reclassified', 'automatically_reclassified']);
  return audit
    .filter(a => reclassActions.has(a.action))
    .map(a => {
      const md = (a.metadata || {}) as Record<string, unknown>;
      return {
        previous_classification: String(md.previous_classification ?? 'UNKNOWN'),
        new_classification: String(md.new_classification ?? 'UNKNOWN'),
        previous_canonical_reference: String(md.previous_canonical_reference ?? '—'),
        new_canonical_reference: String(md.new_canonical_reference ?? '—'),
        acted_by: a.acted_by,
        acted_at: a.acted_at,
        reason: a.reason,
        action: a.action,
      };
    });
}

export async function getCategoryCounts(): Promise<CategoryCount[]> {
  const { data, error } = await supabase
    .from('engineering_recovery_packages')
    .select('object_classification')
    .eq('is_deleted', false)
    .eq('is_permanently_dismissed', false);

  if (error || !data) return [];

  const counts = new Map<ObjectClassification, number>();
  for (const row of data) {
    const c = row.object_classification as ObjectClassification;
    counts.set(c, (counts.get(c) || 0) + 1);
  }

  const result: CategoryCount[] = [];
  for (const cls of Object.keys(CLASSIFICATION_LABELS) as ObjectClassification[]) {
    const count = counts.get(cls) || 0;
    if (count > 0) {
      result.push({ classification: cls, count, label: CLASSIFICATION_LABELS[cls].label });
    }
  }
  return result;
}

// ─── PO Actions ──────────────────────────────────────────────────────────────

export async function approveRecovery(
  packageId: string,
  reviewedBy: string,
  reviewNotes: string,
  defaultGeneratedNote?: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('engineering_recovery_packages')
    .update({
      po_status: 'approved',
      recovery_status: 'approved',
      po_reviewed_by: reviewedBy,
      po_reviewed_at: new Date().toISOString(),
      po_review_notes: reviewNotes,
    })
    .eq('id', packageId);
  if (error) return { success: false, error: error.message };

  await supabase.from('engineering_recovery_audit').insert({
    recovery_package_id: packageId,
    action: 'approved',
    acted_by: reviewedBy,
    reason: reviewNotes,
    metadata: {
      default_generated_note: defaultGeneratedNote ?? null,
      note_edited_by_po: defaultGeneratedNote ? (reviewNotes !== defaultGeneratedNote) : false,
    },
  });

  return { success: true };
}

export async function rejectRecovery(
  packageId: string,
  reviewedBy: string,
  reviewNotes: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('engineering_recovery_packages')
    .update({
      po_status: 'rejected',
      recovery_status: 'rejected',
      po_reviewed_by: reviewedBy,
      po_reviewed_at: new Date().toISOString(),
      po_review_notes: reviewNotes,
    })
    .eq('id', packageId);
  if (error) return { success: false, error: error.message };

  await supabase.from('engineering_recovery_audit').insert({
    recovery_package_id: packageId,
    action: 'rejected',
    acted_by: reviewedBy,
    reason: reviewNotes,
    metadata: {},
  });

  return { success: true };
}

export async function editRecovery(
  packageId: string,
  editedBy: string,
  updates: Partial<Pick<RecoveryPackage,
    'title' | 'executive_summary' | 'engineering_objective' |
    'known_deliverables' | 'known_verification_evidence' | 'known_po_decisions' |
    'recovery_notes' | 'engineering_confidence' | 'confidence_explanation'
  >>,
  editNotes: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('engineering_recovery_packages')
    .update({
      ...updates,
      po_status: 'edit',
      recovery_status: 'pending_review',
      po_reviewed_by: editedBy,
      po_reviewed_at: new Date().toISOString(),
      po_review_notes: editNotes,
    })
    .eq('id', packageId);
  if (error) return { success: false, error: error.message };

  await supabase.from('engineering_recovery_audit').insert({
    recovery_package_id: packageId,
    action: 'edited',
    acted_by: editedBy,
    reason: editNotes,
    metadata: updates as Record<string, unknown>,
  });

  return { success: true };
}

export async function requestMoreEvidence(
  packageId: string,
  reviewedBy: string,
  reviewNotes: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('engineering_recovery_packages')
    .update({
      po_status: 'request_evidence',
      recovery_status: 'evidence_requested',
      po_reviewed_by: reviewedBy,
      po_reviewed_at: new Date().toISOString(),
      po_review_notes: reviewNotes,
    })
    .eq('id', packageId);
  if (error) return { success: false, error: error.message };

  await supabase.from('engineering_recovery_audit').insert({
    recovery_package_id: packageId,
    action: 'requested_evidence',
    acted_by: reviewedBy,
    reason: reviewNotes,
    metadata: {},
  });

  return { success: true };
}

// ─── Reclassification ───────────────────────────────────────────────────────

export async function reclassifyObject(
  packageId: string,
  reclassifiedBy: string,
  newClassification: ObjectClassification,
  newCanonicalRef: string | null,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  if (!reason.trim()) return { success: false, error: 'A reason is mandatory for reclassification' };

  const pkg = await getRecoveryPackage(packageId);
  if (!pkg) return { success: false, error: 'Recovery package not found' };

  const previousClassification = pkg.object_classification;
  const previousCanonicalRef = pkg.canonical_reference;

  // If reclassifying as EWO, validate against the Engineering Ledger
  if (newClassification === 'ENGINEERING_WORK_ORDER' && newCanonicalRef) {
    const validation = await validateEwoReference(newCanonicalRef);
    if (!validation.valid) {
      return { success: false, error: validation.error || 'Engineering Work Order not found.' };
    }
  }

  const updateData: Record<string, unknown> = {
    object_classification: newClassification,
    previous_classification: previousClassification,
    reclassified_by: reclassifiedBy,
    reclassified_at: new Date().toISOString(),
    reclassification_reason: reason,
  };
  if (newCanonicalRef) updateData.canonical_reference = newCanonicalRef;

  const { error } = await supabase
    .from('engineering_recovery_packages')
    .update(updateData)
    .eq('id', packageId);
  if (error) return { success: false, error: error.message };

  await supabase.from('engineering_recovery_audit').insert({
    recovery_package_id: packageId,
    action: 'product_owner_reclassified',
    acted_by: reclassifiedBy,
    reason,
    metadata: {
      previous_classification: previousClassification,
      new_classification: newClassification,
      previous_canonical_reference: previousCanonicalRef,
      new_canonical_reference: newCanonicalRef || previousCanonicalRef,
    },
  });

  return { success: true };
}

// ─── Governed Deletion (Soft Delete) ─────────────────────────────────────────

export async function deleteRecoveryPackage(
  packageId: string,
  deletedBy: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  if (!reason.trim()) return { success: false, error: 'A deletion reason is mandatory' };

  const pkg = await getRecoveryPackage(packageId);
  if (!pkg) return { success: false, error: 'Recovery package not found' };

  // Cannot delete already-imported packages
  if (pkg.imported_at && pkg.imported_ewo_id) {
    return { success: false, error: 'Deletion unavailable — this recovery package has already been imported.' };
  }

  // Create audit event BEFORE soft-deleting
  await supabase.from('engineering_recovery_audit').insert({
    recovery_package_id: packageId,
    action: 'deleted',
    acted_by: deletedBy,
    reason,
    metadata: {
      recovery_ref: pkg.recovery_ref,
      canonical_reference: pkg.canonical_reference,
      object_classification: pkg.object_classification,
      po_status: pkg.po_status,
    },
  });

  // Soft delete — source evidence is never touched
  const { error } = await supabase
    .from('engineering_recovery_packages')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy,
      deletion_reason: reason,
      recovery_status: 'deleted',
    })
    .eq('id', packageId);
  if (error) return { success: false, error: error.message };

  return { success: true };
}

// ─── Restore ─────────────────────────────────────────────────────────────────

export async function restoreRecoveryPackage(
  packageId: string,
  restoredBy: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  if (!reason.trim()) return { success: false, error: 'A restore reason is mandatory' };

  const { error } = await supabase
    .from('engineering_recovery_packages')
    .update({
      is_deleted: false,
      deleted_at: null,
      deleted_by: null,
      deletion_reason: null,
      recovery_status: 'restored',
    })
    .eq('id', packageId);
  if (error) return { success: false, error: error.message };

  await supabase.from('engineering_recovery_audit').insert({
    recovery_package_id: packageId,
    action: 'restored',
    acted_by: restoredBy,
    reason,
    metadata: {},
  });

  return { success: true };
}

// ─── Permanently Dismiss ─────────────────────────────────────────────────────

export async function permanentlyDismissCandidate(
  packageId: string,
  dismissedBy: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  if (!reason.trim()) return { success: false, error: 'A dismissal reason is mandatory' };

  const pkg = await getRecoveryPackage(packageId);
  if (!pkg) return { success: false, error: 'Recovery package not found' };

  // Create audit event BEFORE dismissing
  await supabase.from('engineering_recovery_audit').insert({
    recovery_package_id: packageId,
    action: 'permanently_dismissed',
    acted_by: dismissedBy,
    reason,
    metadata: {
      recovery_ref: pkg.recovery_ref,
      canonical_reference: pkg.canonical_reference,
      object_classification: pkg.object_classification,
    },
  });

  const { error } = await supabase
    .from('engineering_recovery_packages')
    .update({
      is_permanently_dismissed: true,
      permanently_dismissed_at: new Date().toISOString(),
      permanently_dismissed_by: dismissedBy,
      permanently_dismissed_reason: reason,
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: dismissedBy,
      deletion_reason: `Permanently dismissed: ${reason}`,
      recovery_status: 'permanently_dismissed',
    })
    .eq('id', packageId);
  if (error) return { success: false, error: error.message };

  return { success: true };
}

// ─── Bulk Approval ───────────────────────────────────────────────────────────
// Only packages with identical confidence AND identical object classification
// may be bulk approved. Only ENGINEERING_WORK_ORDER packages may participate
// in bulk approval intended for EWO import.

export async function bulkApproveRecoveries(
  packageIds: string[],
  reviewedBy: string,
  reviewNotes: string
): Promise<{ success: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let success = 0;
  let failed = 0;

  const { data: packages } = await supabase
    .from('engineering_recovery_packages')
    .select('id, engineering_confidence, object_classification, po_status, is_deleted, is_permanently_dismissed')
    .in('id', packageIds);

  if (!packages || packages.length === 0) {
    return { success: 0, failed: 0, errors: ['No packages found'] };
  }

  // Check confidence uniformity
  const confidences = new Set(packages.map((p: Record<string, unknown>) => p.engineering_confidence));
  if (confidences.size > 1) {
    return { success: 0, failed: packageIds.length, errors: ['Cannot bulk approve packages with different confidence levels'] };
  }

  // Check classification uniformity
  const classifications = new Set(packages.map((p: Record<string, unknown>) => p.object_classification));
  if (classifications.size > 1) {
    return { success: 0, failed: packageIds.length, errors: ['Cannot bulk approve packages with different object classifications'] };
  }

  // Only ENGINEERING_WORK_ORDER packages may be bulk approved for EWO import
  const allEwo = packages.every((p: Record<string, unknown>) => p.object_classification === 'ENGINEERING_WORK_ORDER');
  if (!allEwo) {
    return { success: 0, failed: packageIds.length, errors: ['Only ENGINEERING_WORK_ORDER packages may be bulk approved for EWO import'] };
  }

  // Check no deleted/dismissed packages
  const hasInvalid = packages.some((p: Record<string, unknown>) => p.is_deleted || p.is_permanently_dismissed);
  if (hasInvalid) {
    return { success: 0, failed: packageIds.length, errors: ['Cannot bulk approve deleted or dismissed packages'] };
  }

  for (const id of packageIds) {
    const result = await approveRecovery(id, reviewedBy, reviewNotes);
    if (result.success) success++;
    else { failed++; errors.push(result.error || 'Unknown error'); }
  }

  return { success, failed, errors };
}

// ─── Import to Ledger ─────────────────────────────────────────────────────────
// Creates a new EWO in engineering_work_orders from an approved recovery package.
// HARD VALIDATION: only ENGINEERING_WORK_ORDER classified packages may be imported.

export async function importRecoveryToLedger(
  packageId: string,
  importedBy: string
): Promise<{ success: boolean; ewoId?: string; ewoRef?: string; error?: string }> {
  const pkg = await getRecoveryPackage(packageId);
  if (!pkg) return { success: false, error: 'Recovery package not found' };
  if (pkg.po_status !== 'approved') return { success: false, error: 'Package must be approved before import' };

  // EWO-014.19A.6: Import capability is evaluated independently of
  // classification correctness. The object may be correctly classified
  // but belong to a domain whose import pipeline is not yet supported.
  // We never imply the classification is wrong when it is correct.
  if (!isImportSupported(pkg.object_classification)) {
    const capability = getImportCapability(pkg.object_classification);
    await supabase.from('engineering_recovery_audit').insert({
      recovery_package_id: packageId,
      action: 'import_blocked_wrong_object_type',
      acted_by: importedBy,
      reason: `Import not yet supported for classification ${pkg.object_classification}.`,
      metadata: {
        object_classification: pkg.object_classification,
        canonical_reference: pkg.canonical_reference,
        import_capability: capability.statusLabel,
        target_ledger: capability.ledgerLabel,
      },
    });
    return {
      success: false,
      error: `This recovery package is correctly classified as ${capability.ledgerLabel.replace(' Ledger', '')}. Import into the ${capability.ledgerLabel} is ${capability.statusLabel.toLowerCase()}.`,
    };
  }

  // Check if EWO already exists for this reference (duplicate protection)
  const { data: existing } = await supabase
    .from('engineering_work_orders')
    .select('id')
    .eq('ewo_ref', pkg.canonical_reference)
    .maybeSingle();
  if (existing) return { success: false, error: 'EWO already exists for this reference' };

  // ─── Canonical closure_method resolution (EWO-014.19A.3R fix) ──────────────
  // Recovery packages carry no closure_method column; the source value is
  // null. The resolver maps the truthful recovery state to the canonical
  // 'Historical Migration' closure method — the act of importing a historical
  // record into the ledger IS a historical migration. This does NOT invent
  // Product Owner Acceptance or Automated Governance.
  const closureResolution = resolveRecoveryClosureMethod(null);

  // Pre-insert validation: never rely solely on PostgreSQL to detect an
  // invalid value. Validate against the permitted set before insert.
  if (!isValidClosureMethod(closureResolution.closureMethod)) {
    const governedError = {
      recovery_ref: pkg.recovery_ref,
      ewo_ref: pkg.canonical_reference,
      attempted_closure_method: closureResolution.closureMethod,
      permitted_closure_methods: PERMITTED_CLOSURE_METHODS,
      pipeline_stage: 'Engineering Import',
      remediation: 'Update the closure method resolver to map the source value to a permitted canonical value.',
    };
    await supabase.from('engineering_recovery_audit').insert({
      recovery_package_id: packageId,
      action: 'import_failed_closure_method_validation',
      acted_by: importedBy,
      reason: `Closure method validation failed: ${closureResolution.closureMethod}`,
      import_result: 'Failed pre-insert validation',
      metadata: governedError,
    });
    return {
      success: false,
      error: `Import blocked: closure_method '${closureResolution.closureMethod}' is not permitted. Permitted values: ${PERMITTED_CLOSURE_METHODS.join(', ')}.`,
    };
  }

  // ─── Historical truth preservation ──────────────────────────────────────────
  // Only carry forward PO acceptance evidence that was actually recorded in
  // the recovery package. Never invent PO acceptance for a recovered EWO.
  const hasPoEvidence = Boolean(pkg.po_reviewed_by || pkg.po_reviewed_at || pkg.po_review_notes);
  const poAcceptanceNotes = pkg.po_review_notes || null;
  const poAcceptedBy = pkg.po_reviewed_by || null;
  const poAcceptedAt = pkg.po_reviewed_at || null;

  const { data: ewo, error: ewoErr } = await supabase
    .from('engineering_work_orders')
    .insert({
      ewo_ref: pkg.canonical_reference,
      title: pkg.title,
      executive_summary: pkg.executive_summary || '',
      engineering_objective: pkg.engineering_objective || '',
      scope: pkg.known_deliverables || '',
      validation_requirements: pkg.known_verification_evidence || '',
      status: 'closed',
      closure_method: closureResolution.closureMethod,
      closure_reason: 'Imported from Historical Recovery Ledger',
      is_historical_import: true,
      import_source: 'recovery_engine',
      imported_at: new Date().toISOString(),
      imported_by: importedBy,
      historical_notes: pkg.recovery_notes || '',
      po_acceptance_notes: poAcceptanceNotes,
      po_accepted_by: poAcceptedBy,
      po_accepted_at: poAcceptedAt,
      engineering_notes: `Recovered by Historical Recovery Engine. Confidence: ${pkg.engineering_confidence}. ${pkg.confidence_explanation || ''}. Closure method: ${closureResolution.closureMethod} (${closureResolution.reason})`,
    })
    .select('id, ewo_ref')
    .single();

  if (ewoErr || !ewo) {
    // Record failed import attempt in audit history (preserved for retry safety)
    await supabase.from('engineering_recovery_audit').insert({
      recovery_package_id: packageId,
      action: 'import_failed',
      acted_by: importedBy,
      reason: `EWO insert failed: ${ewoErr?.message || 'Unknown error'}`,
      import_result: 'Failed',
      metadata: {
        ewo_ref: pkg.canonical_reference,
        attempted_closure_method: closureResolution.closureMethod,
        error: ewoErr?.message || 'Unknown error',
        pipeline_stage: 'Engineering Import',
      },
    });
    return { success: false, error: ewoErr?.message || 'Failed to create EWO' };
  }

  await supabase
    .from('engineering_recovery_packages')
    .update({
      imported_at: new Date().toISOString(),
      imported_ewo_id: ewo.id,
      recovery_status: 'imported',
    })
    .eq('id', packageId);

  await supabase.from('engineering_recovery_audit').insert({
    recovery_package_id: packageId,
    action: 'imported',
    acted_by: importedBy,
    evidence_used: `${pkg.evidence_sources.length} evidence source(s)`,
    confidence: pkg.engineering_confidence,
    import_result: `Created EWO ${ewo.ewo_ref} (${ewo.id})`,
    metadata: {
      ewo_id: ewo.id,
      ewo_ref: ewo.ewo_ref,
      closure_method: closureResolution.closureMethod,
      source_closure_method: closureResolution.sourceValue,
      normalised: closureResolution.normalised,
      closure_resolution_reason: closureResolution.reason,
      po_acceptance_evidence_present: hasPoEvidence,
    },
  });

  return { success: true, ewoId: ewo.id, ewoRef: ewo.ewo_ref };
}

// ─── Governed Batch Approval & Recovery Completion (EWO-014.19A.3) ───────────
// Sequential batch pipeline: validate → approve → import → archive → audit.
// Failures never stop the remaining packages. No package may import twice.
// No ledger duplication. All failures visible. All operations auditable.

export type BatchItemOutcome = 'success' | 'skipped' | 'failed';

export type BatchPipelineStage =
  | 'Validation'
  | 'Classification'
  | 'Duplicate Protection'
  | 'Approval'
  | 'Engineering Import'
  | 'Ledger Update'
  | 'Archive'
  | 'Audit Recording'
  | 'Completed';

export interface BatchItemResult {
  packageId: string;
  recoveryRef: string;
  canonicalReference: string;
  title: string;
  outcome: BatchItemOutcome;
  reason?: string;
  pipelineStage?: BatchPipelineStage;
  ewoRef?: string;
  objectsImported: number;
}

export type BatchEligibilityReason =
  | 'Unknown confidence'
  | 'Mixed confidence'
  | 'Classification not Engineering Work Order'
  | 'Import not yet supported for this classification'
  | 'Evidence incomplete'
  | 'Already imported'
  | 'Duplicate Engineering Record'
  | 'Pending manual review'
  | 'Deleted or dismissed';

export interface BatchEligibilityAssessment {
  packageId: string;
  recoveryRef: string;
  canonicalReference: string;
  title: string;
  eligible: boolean;
  reason: BatchEligibilityReason | null;
}

export interface BatchEligibilitySummary {
  totalSelected: number;
  eligibleCount: number;
  excludedCount: number;
  assessments: BatchEligibilityAssessment[];
}

export function evaluateBatchEligibility(
  selected: RecoveryPackage[]
): BatchEligibilitySummary {
  // First pass: per-package checks
  const firstPass = selected.map(pkg => {
    let eligible = false;
    let reason: BatchEligibilityReason | null = null;

    if (pkg.is_deleted || pkg.is_permanently_dismissed) {
      reason = 'Deleted or dismissed';
    } else if (pkg.imported_at && pkg.imported_ewo_id) {
      reason = 'Already imported';
    } else if (pkg.po_status !== 'pending') {
      reason = 'Pending manual review';
    } else if (!isImportSupported(pkg.object_classification)) {
      reason = 'Import not yet supported for this classification';
    } else if (pkg.evidence_missing) {
      reason = 'Evidence incomplete';
    } else if (pkg.engineering_confidence === 'UNKNOWN') {
      reason = 'Unknown confidence';
    } else {
      eligible = true;
    }

    return {
      packageId: pkg.id,
      recoveryRef: pkg.recovery_ref,
      canonicalReference: pkg.canonical_reference,
      title: pkg.title,
      eligible,
      reason,
      _confidence: pkg.engineering_confidence,
    };
  });

  // Second pass: among individually eligible packages, check for mixed confidence
  const individuallyEligible = firstPass.filter(a => a.eligible);
  const confidences = new Set(individuallyEligible.map(a => a._confidence));
  const mixedConfidence = confidences.size > 1;

  const assessments: BatchEligibilityAssessment[] = firstPass.map(a => {
    if (a.eligible && mixedConfidence) {
      return {
        packageId: a.packageId,
        recoveryRef: a.recoveryRef,
        canonicalReference: a.canonicalReference,
        title: a.title,
        eligible: false,
        reason: 'Mixed confidence' as BatchEligibilityReason,
      };
    }
    return {
      packageId: a.packageId,
      recoveryRef: a.recoveryRef,
      canonicalReference: a.canonicalReference,
      title: a.title,
      eligible: a.eligible,
      reason: a.reason,
    };
  });

  const eligibleCount = assessments.filter(a => a.eligible).length;
  return {
    totalSelected: selected.length,
    eligibleCount,
    excludedCount: assessments.length - eligibleCount,
    assessments,
  };
}

export interface BatchApprovalResult {
  packagesProcessed: number;
  approved: number;
  skipped: number;
  failed: number;
  objectsImported: number;
  ledgerEntriesCreated: number;
  durationSeconds: number;
  items: BatchItemResult[];
  batchId: string;
}

export interface BatchProgressUpdate {
  currentIndex: number;
  total: number;
  packageId: string;
  recoveryRef: string;
  stage: 'validating' | 'approving' | 'importing' | 'archiving' | 'done' | 'failed' | 'skipped';
  outcome?: BatchItemOutcome;
  reason?: string;
}

export async function governedBatchApproval(
  packageIds: string[],
  reviewedBy: string,
  reviewNotes: string,
  onProgress?: (update: BatchProgressUpdate) => void
): Promise<BatchApprovalResult> {
  const startTime = Date.now();
  const batchId = `BATCH-${Date.now()}`;
  const items: BatchItemResult[] = [];
  let approved = 0;
  let skipped = 0;
  let failed = 0;
  let objectsImported = 0;
  let ledgerEntriesCreated = 0;

  for (let i = 0; i < packageIds.length; i++) {
    const packageId = packageIds[i];

    // Fetch package fresh each time to avoid stale state
    const pkg = await getRecoveryPackage(packageId);
    if (!pkg) {
      failed++;
      items.push({ packageId, recoveryRef: '—', canonicalReference: '—', title: '—', outcome: 'failed', reason: 'Package not found', pipelineStage: 'Validation', objectsImported: 0 });
      onProgress?.({ currentIndex: i, total: packageIds.length, packageId, recoveryRef: '—', stage: 'failed', outcome: 'failed', reason: 'Package not found' });
      continue;
    }

    // Stage 1: Validate package
    onProgress?.({ currentIndex: i, total: packageIds.length, packageId, recoveryRef: pkg.recovery_ref, stage: 'validating' });

    if (pkg.is_deleted || pkg.is_permanently_dismissed) {
      skipped++;
      items.push({ packageId, recoveryRef: pkg.recovery_ref, canonicalReference: pkg.canonical_reference, title: pkg.title, outcome: 'skipped', reason: 'Deleted or dismissed', pipelineStage: 'Validation', objectsImported: 0 });
      onProgress?.({ currentIndex: i, total: packageIds.length, packageId, recoveryRef: pkg.recovery_ref, stage: 'skipped', outcome: 'skipped', reason: 'Deleted or dismissed' });
      continue;
    }

    if (pkg.imported_at && pkg.imported_ewo_id) {
      skipped++;
      items.push({ packageId, recoveryRef: pkg.recovery_ref, canonicalReference: pkg.canonical_reference, title: pkg.title, outcome: 'skipped', reason: 'Already imported', pipelineStage: 'Validation', objectsImported: 0 });
      onProgress?.({ currentIndex: i, total: packageIds.length, packageId, recoveryRef: pkg.recovery_ref, stage: 'skipped', outcome: 'skipped', reason: 'Already imported' });
      continue;
    }

    // Stage 2: Validate import capability (EWO-014.19A.6)
    // Classification correctness and import capability are independent.
    // A correctly classified Bug/Incident is not "wrong" — its import pipeline
    // is simply not yet supported. We block on capability, not classification.
    if (!isImportSupported(pkg.object_classification)) {
      const cap = getImportCapability(pkg.object_classification);
      failed++;
      items.push({ packageId, recoveryRef: pkg.recovery_ref, canonicalReference: pkg.canonical_reference, title: pkg.title, outcome: 'failed', reason: `Import not yet supported for ${pkg.object_classification}`, pipelineStage: 'Classification', objectsImported: 0 });
      await supabase.from('engineering_recovery_audit').insert({
        recovery_package_id: packageId,
        action: 'import_blocked_wrong_object_type',
        acted_by: reviewedBy,
        reason: `Batch ${batchId}: import not yet supported for ${pkg.object_classification}`,
        metadata: { batch_id: batchId, object_classification: pkg.object_classification, import_capability: cap.statusLabel },
      });
      onProgress?.({ currentIndex: i, total: packageIds.length, packageId, recoveryRef: pkg.recovery_ref, stage: 'failed', outcome: 'failed', reason: 'Import not yet supported' });
      continue;
    }

    // Stage 3: Validate duplicate protection
    const { data: existingEwo } = await supabase
      .from('engineering_work_orders')
      .select('id')
      .eq('ewo_ref', pkg.canonical_reference)
      .maybeSingle();
    if (existingEwo) {
      skipped++;
      items.push({ packageId, recoveryRef: pkg.recovery_ref, canonicalReference: pkg.canonical_reference, title: pkg.title, outcome: 'skipped', reason: 'Duplicate Engineering Record', pipelineStage: 'Duplicate Protection', objectsImported: 0 });
      onProgress?.({ currentIndex: i, total: packageIds.length, packageId, recoveryRef: pkg.recovery_ref, stage: 'skipped', outcome: 'skipped', reason: 'Duplicate Engineering Record' });
      continue;
    }

    // Stage 4: Approve — generate governed default note per package
    onProgress?.({ currentIndex: i, total: packageIds.length, packageId, recoveryRef: pkg.recovery_ref, stage: 'approving' });
    const batchDefaultNote = generateApprovalNote({
      type: 'historical_recovery',
      objectRef: pkg.recovery_ref,
      objectTitle: pkg.title,
      engineeringConfidence: pkg.engineering_confidence,
      evidenceSourceCount: pkg.evidence_sources?.length ?? null,
      evidenceArtefactCount: 0,
    }).note;
    const finalBatchNote = `Batch ${batchId}: ${reviewNotes || batchDefaultNote}`;
    const approveResult = await approveRecovery(packageId, reviewedBy, finalBatchNote, batchDefaultNote);
    if (!approveResult.success) {
      failed++;
      items.push({ packageId, recoveryRef: pkg.recovery_ref, canonicalReference: pkg.canonical_reference, title: pkg.title, outcome: 'failed', reason: approveResult.error || 'Approval failed', pipelineStage: 'Approval', objectsImported: 0 });
      onProgress?.({ currentIndex: i, total: packageIds.length, packageId, recoveryRef: pkg.recovery_ref, stage: 'failed', outcome: 'failed', reason: approveResult.error });
      continue;
    }

    // Stage 5: Import Engineering Objects
    onProgress?.({ currentIndex: i, total: packageIds.length, packageId, recoveryRef: pkg.recovery_ref, stage: 'importing' });
    const importResult = await importRecoveryToLedger(packageId, reviewedBy);
    if (!importResult.success) {
      failed++;
      items.push({ packageId, recoveryRef: pkg.recovery_ref, canonicalReference: pkg.canonical_reference, title: pkg.title, outcome: 'failed', reason: importResult.error || 'Import failed', pipelineStage: 'Engineering Import', objectsImported: 0 });
      onProgress?.({ currentIndex: i, total: packageIds.length, packageId, recoveryRef: pkg.recovery_ref, stage: 'failed', outcome: 'failed', reason: importResult.error });
      continue;
    }

    // Stage 6: Archive (recovery_status already 'imported' from importRecoveryToLedger)
    onProgress?.({ currentIndex: i, total: packageIds.length, packageId, recoveryRef: pkg.recovery_ref, stage: 'archiving' });

    // Stage 7: Record Recovery Audit — batch-level event
    await supabase.from('engineering_recovery_audit').insert({
      recovery_package_id: packageId,
      action: 'imported',
      acted_by: reviewedBy,
      evidence_used: `Batch ${batchId}`,
      confidence: pkg.engineering_confidence,
      import_result: `Batch import: Created EWO ${importResult.ewoRef}`,
      metadata: { batch_id: batchId, ewo_id: importResult.ewoId, ewo_ref: importResult.ewoRef },
    });

    approved++;
    objectsImported++;
    ledgerEntriesCreated++;
    items.push({
      packageId,
      recoveryRef: pkg.recovery_ref,
      canonicalReference: pkg.canonical_reference,
      title: pkg.title,
      outcome: 'success',
      reason: 'Imported to Engineering Ledger',
      pipelineStage: 'Completed',
      ewoRef: importResult.ewoRef,
      objectsImported: 1,
    });
    onProgress?.({ currentIndex: i, total: packageIds.length, packageId, recoveryRef: pkg.recovery_ref, stage: 'done', outcome: 'success' });
  }

  const durationSeconds = Math.round((Date.now() - startTime) / 1000);

  // Record batch-level audit event
  await supabase.from('engineering_recovery_audit').insert({
    recovery_package_id: packageIds[0] || '00000000-0000-0000-0000-000000000000',
    action: 'imported',
    acted_by: reviewedBy,
    reason: `Batch ${batchId} complete: ${approved} approved, ${skipped} skipped, ${failed} failed`,
    metadata: {
      batch_id: batchId,
      packages_processed: packageIds.length,
      approved,
      skipped,
      failed,
      objects_imported: objectsImported,
      ledger_entries_created: ledgerEntriesCreated,
      duration_seconds: durationSeconds,
      review_notes: reviewNotes,
    },
  });

  return {
    packagesProcessed: packageIds.length,
    approved,
    skipped,
    failed,
    objectsImported,
    ledgerEntriesCreated,
    durationSeconds,
    items,
    batchId,
  };
}

// ─── Confidence Labels ──────────────────────────────────────────────────────

export const CONFIDENCE_LABELS: Record<EngineeringConfidence, { label: string; description: string; colour: string }> = {
  HIGH: {
    label: 'HIGH',
    description: 'Majority of engineering artefacts present. Strong evidence for recovery.',
    colour: 'text-green-700 bg-green-50 border-green-200',
  },
  MEDIUM: {
    label: 'MEDIUM',
    description: 'Partial engineering evidence available. Some gaps remain.',
    colour: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  LOW: {
    label: 'LOW',
    description: 'Minimal engineering evidence. Significant gaps remain.',
    colour: 'text-orange-700 bg-orange-50 border-orange-200',
  },
  UNKNOWN: {
    label: 'UNKNOWN',
    description: 'Insufficient evidence to assess recovery confidence.',
    colour: 'text-slate-600 bg-slate-50 border-slate-200',
  },
};

export const PO_STATUS_LABELS: Record<RecoveryPOStatus, { label: string; colour: string }> = {
  pending: { label: 'Pending Review', colour: 'text-amber-700 bg-amber-50 border-amber-200' },
  approved: { label: 'Approved', colour: 'text-green-700 bg-green-50 border-green-200' },
  rejected: { label: 'Rejected', colour: 'text-red-700 bg-red-50 border-red-200' },
  edit: { label: 'Edited', colour: 'text-blue-700 bg-blue-50 border-blue-200' },
  request_evidence: { label: 'Evidence Requested', colour: 'text-purple-700 bg-purple-50 border-purple-200' },
};
