// EWO-014.19A.7SR.4 — Evidence Package Service
//
// Builds governed Evidence Packages for integrity investigations.
// Every investigation must answer:
//   What evidence was found? Where was it found? Why was this classification
//   reached? What authoritative object is considered correct? Exactly what
//   needs to change? What should the Product Owner approve?
//
// Never displays "unknown source" or "unknown column" where authoritative
// evidence exists.

import { supabase } from './supabase';
import type { IntegrityAlert } from './engineeringIntegrityService';
import {
  resolveAuthoritativeExistence,
  type ExistenceResolution,
} from './authoritativeEngineeringExistenceService';
import { buildLineageCanonicalDecision } from './integrityDomainModel';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface EvidenceItem {
  source_type: string;
  source_table: string;
  object_type: string;
  object_id: string | null;
  reference: string;
  field_name: string;
  field_value: string | null;
  confidence: number;
  why_selected: string;
  supports_conclusion: boolean;
  contradicts_conclusion: boolean;
  evidence_priority: number;
}

export interface ConflictValue {
  source_type: string;
  source_table: string;
  object_id: string | null;
  field_name: string;
  field_value: string;
}

export interface ConflictDetail {
  reference: string;
  conflicting_field: string;
  values: ConflictValue[];
  conflict_summary: string;
  canonical_candidate: string | null;
  canonical_reason: string | null;
  po_review_required: boolean;
}

export interface ClassificationExplanation {
  classification: string;
  chosen_reason: string;
  rejected_alternatives: string[];
  authoritative_rules_applied: string[];
}

export interface EvidenceGraphNode {
  object_type: string;
  reference: string;
  label: string;
  status: 'supporting' | 'conflicting' | 'missing' | 'neutral';
}

export interface EvidenceGraphEdge {
  from: string;
  to: string;
  label: string;
}

export interface EvidenceGraph {
  nodes: EvidenceGraphNode[];
  edges: EvidenceGraphEdge[];
}

export interface CanonicalDecision {
  canonical_object_type: string | null;
  canonical_reference: string | null;
  canonical_value: string | null;
  supporting_evidence_count: number;
  conflicting_evidence_count: number;
  confidence: number;
  reasoning: string;
  po_review_required: boolean;
}

export interface EvidencePackage {
  alert: IntegrityAlert;
  evidence_items: EvidenceItem[];
  conflicts: ConflictDetail[];
  classification_explanation: ClassificationExplanation;
  evidence_graph: EvidenceGraph;
  canonical_decision: CanonicalDecision;
  runtime_diagnostics: EvidenceRuntimeDiagnostics;
  existence_resolution: ExistenceResolution | null;
}

export interface EvidenceRuntimeDiagnostics {
  sources_searched: string[];
  sources_contributing_evidence: string[];
  conflicting_evidence_count: number;
  supporting_evidence_count: number;
  authoritative_evidence_count: number;
  unknown_evidence_count: number;
  po_decisions_required: number;
  automatic_repairs_possible: number;
}

// ─── Source Registry (mirrors engineeringIntegrityService) ─────────────────

const SOURCE_TABLES = [
  { table: 'engineering_work_orders', refCol: 'ewo_ref', label: 'Engineering Work Order', type: 'ewo' },
  { table: 'engineering_historical_references', refCol: 'reference', label: 'Historical Reference', type: 'historical_reference' },
  { table: 'engineering_records_library', refCol: 'ewo_ref', label: 'Engineering Record', type: 'engineering_record' },
  { table: 'engineering_plans', refCol: 'ewo_ref', label: 'Engineering Plan', type: 'engineering_plan' },
  { table: 'ewo_completion_reports', refCol: 'ewo_ref', label: 'Completion Report', type: 'completion_report' },
  { table: 'engineering_executions', refCol: 'ewo_ref', label: 'Engineering Execution', type: 'engineering_intent' },
  { table: 'ewo_engineering_packages', refCol: 'ewo_ref', label: 'Prompt Artefact', type: 'prompt_artefact' },
  { table: 'engineering_verification_records', refCol: 'ewo_ref', label: 'Verification Record', type: 'other_record' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function safeStr(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return String(val);
}

function normaliseRef(ref: string): string {
  let n = ref.trim().toUpperCase();
  while (n.endsWith('.')) n = n.slice(0, -1);
  return n;
}

// ─── Source Evidence Collection ────────────────────────────────────────────

async function collectSourceEvidence(
  ref: string,
): Promise<EvidenceItem[]> {
  const items: EvidenceItem[] = [];
  const normalised = normaliseRef(ref);

  for (const src of SOURCE_TABLES) {
    try {
      const { data, error } = await supabase
        .from(src.table)
        .select('*')
        .eq(src.refCol, normalised)
        .limit(10);

      if (error || !data || data.length === 0) continue;

      for (const record of data) {
        const recordAny = record as Record<string, unknown>;
        const objectId = safeStr(recordAny.id);
        const title = safeStr(recordAny.title) ?? safeStr(recordAny.ewo_ref) ?? normalised;
        const status = safeStr(recordAny.status);

        // Primary reference field
        items.push({
          source_type: src.label,
          source_table: src.table,
          object_type: src.type,
          object_id: objectId,
          reference: normalised,
          field_name: src.refCol,
          field_value: normalised,
          confidence: src.type === 'ewo' ? 1.0 : src.type === 'historical_reference' ? 0.95 : 0.5,
          why_selected: `Found in ${src.table}.${src.refCol} matching reference ${normalised}`,
          supports_conclusion: src.type === 'ewo' || src.type === 'historical_reference',
          contradicts_conclusion: false,
          evidence_priority: src.type === 'ewo' ? 1 : src.type === 'historical_reference' ? 2 : 5,
        });

        // Title field if present
        if (title && title !== normalised) {
          items.push({
            source_type: src.label,
            source_table: src.table,
            object_type: src.type,
            object_id: objectId,
            reference: normalised,
            field_name: 'title',
            field_value: title,
            confidence: 0.8,
            why_selected: `Title field from ${src.table} record`,
            supports_conclusion: false,
            contradicts_conclusion: false,
            evidence_priority: 3,
          });
        }

        // Status field if present
        if (status) {
          items.push({
            source_type: src.label,
            source_table: src.table,
            object_type: src.type,
            object_id: objectId,
            reference: normalised,
            field_name: 'status',
            field_value: status,
            confidence: 0.7,
            why_selected: `Status field from ${src.table} record`,
            supports_conclusion: false,
            contradicts_conclusion: false,
            evidence_priority: 4,
          });
        }
      }
    } catch {
      // Table may not exist or be accessible — skip
    }
  }

  return items.sort((a, b) => a.evidence_priority - b.evidence_priority);
}

// ─── Conflict Detection ────────────────────────────────────────────────────

function detectConflicts(
  ref: string,
  evidenceItems: EvidenceItem[],
): ConflictDetail[] {
  const conflicts: ConflictDetail[] = [];

  // Group title values by source
  const titleValues = evidenceItems.filter(e => e.field_name === 'title' && e.field_value);
  if (titleValues.length > 1) {
    const uniqueValues = new Map<string, ConflictValue[]>();
    for (const item of titleValues) {
      const val = item.field_value!;
      if (!uniqueValues.has(val)) uniqueValues.set(val, []);
      uniqueValues.get(val)!.push({
        source_type: item.source_type,
        source_table: item.source_table,
        object_id: item.object_id,
        field_name: item.field_name,
        field_value: val,
      });
    }

    if (uniqueValues.size > 1) {
      // Try to determine canonical candidate
      const ewoTitles = titleValues.filter(e => e.object_type === 'ewo');
      const canonicalCandidate = ewoTitles.length > 0 ? ewoTitles[0].field_value! : null;
      const canonicalReason = canonicalCandidate
        ? 'Newest Product Owner approved canonical Work Order title'
        : null;

      conflicts.push({
        reference: ref,
        conflicting_field: 'title',
        values: Array.from(uniqueValues.values()).flat(),
        conflict_summary: `${uniqueValues.size} different titles detected across ${titleValues.length} source(s)`,
        canonical_candidate: canonicalCandidate,
        canonical_reason: canonicalReason,
        po_review_required: canonicalCandidate === null,
      });
    }
  }

  // Group status values by source
  const statusValues = evidenceItems.filter(e => e.field_name === 'status' && e.field_value);
  if (statusValues.length > 1) {
    const uniqueStatuses = new Set(statusValues.map(e => e.field_value!));
    if (uniqueStatuses.size > 1) {
      conflicts.push({
        reference: ref,
        conflicting_field: 'status',
        values: statusValues.map(e => ({
          source_type: e.source_type,
          source_table: e.source_table,
          object_id: e.object_id,
          field_name: e.field_name,
          field_value: e.field_value!,
        })),
        conflict_summary: `${uniqueStatuses.size} different statuses detected across ${statusValues.length} source(s)`,
        canonical_candidate: null,
        canonical_reason: null,
        po_review_required: true,
      });
    }
  }

  return conflicts;
}

// ─── Classification Explanation ─────────────────────────────────────────────

function buildClassificationExplanation(
  alert: IntegrityAlert,
  existenceResolution: ExistenceResolution | null,
): ClassificationExplanation {
  const alertAny = alert as unknown as Record<string, unknown>;
  const classification = (alertAny.parent_child_classification as string) ??
    alert.alert_type ?? 'unclassified';

  const chosenReason: string[] = [];
  const rejectedAlternatives: string[] = [];
  const rulesApplied: string[] = [];

  if (alert.alert_type === 'parent_child_issue') {
    const authStatus = existenceResolution?.authoritative_status ?? (alertAny.authoritative_status as string) ?? 'GENUINELY_MISSING';

    if (classification === 'HISTORICAL_PARENT_SATISFIED') {
      chosenReason.push('Historical Reference exists for the expected parent.');
      chosenReason.push(`Status: ${existenceResolution?.lifecycle_or_historical_status ?? 'Historical — Not Issued'}.`);
      chosenReason.push('Lineage satisfied — the governed historical record authoritatively represents the reference.');
      chosenReason.push('Execution prohibited — Historical References are non-executable.');
      chosenReason.push('Canonical Work Order intentionally absent — only sub-numbered refinements were issued.');
      rejectedAlternatives.push('CANONICAL_PARENT_SATISFIED — rejected because no canonical Work Order exists.');
      rejectedAlternatives.push('PARENT_GENUINELY_MISSING — rejected because a governed Historical Reference authoritatively represents the parent.');
      rejectedAlternatives.push('PARENT_EVIDENCE_ONLY — rejected because the Historical Reference is governed, not merely evidence.');
      rulesApplied.push('Authoritative Engineering Existence — Historical References can satisfy lineage when their governed status permits.');
      rulesApplied.push('Historical Reference Rules — status "historical_not_issued" satisfies lineage, execution remains prohibited.');
    } else if (classification === 'CANONICAL_PARENT_SATISFIED') {
      chosenReason.push('Canonical parent Work Order exists and the relationship is correctly recorded.');
      rejectedAlternatives.push('HISTORICAL_PARENT_SATISFIED — rejected because a canonical Work Order exists (stronger authority).');
      rulesApplied.push('Authoritative Source Hierarchy — Canonical Work Orders checked first and found.');
    } else if (classification === 'PARENT_GENUINELY_MISSING') {
      chosenReason.push('No canonical Work Order, Historical Reference, or sufficient governed evidence exists for the expected parent.');
      rejectedAlternatives.push('HISTORICAL_PARENT_SATISFIED — rejected because no governed Historical Reference was found.');
      rejectedAlternatives.push('PARENT_EVIDENCE_ONLY — rejected because no evidence sources were found either.');
      rulesApplied.push('Authoritative Source Hierarchy — all 8 source types searched with no match.');
    } else if (classification === 'PARENT_EVIDENCE_ONLY') {
      chosenReason.push('Evidence exists for the expected parent but no governed authority satisfies lineage.');
      rejectedAlternatives.push('HISTORICALLY_SATISFIED — rejected because no approved Historical Reference exists.');
      rulesApplied.push('Authoritative Source Hierarchy — lower-order sources classified as EVIDENCE_ONLY.');
    } else if (classification === 'PARENT_AUTHORITY_CONFLICT') {
      chosenReason.push('Multiple authoritative records conflict about the expected parent reference.');
      rejectedAlternatives.push('Automatic resolution — rejected because conflicting authority requires Product Owner review.');
      rulesApplied.push('Data Safety — conflicting records are never silently resolved.');
    } else if (classification === 'RELATIONSHIP_FIELD_INCOMPLETE') {
      chosenReason.push('An authoritative parent exists but the child is missing the required lineage link.');
      rulesApplied.push('Parent-Child Validation — relationship field must be populated when parent exists.');
    } else if (classification === 'PARENT_REFERENCE_MISMATCH') {
      chosenReason.push('The child points to a different parent than the authoritative expected parent.');
      rulesApplied.push('Parent-Child Validation — child parent_ref must match the authoritative expected parent.');
    }
  } else if (alert.alert_type === 'missing_ewo') {
    chosenReason.push('No canonical Engineering Work Order exists for this reference in the ledger.');
    if (existenceResolution?.authoritative_status === 'HISTORICALLY_SATISFIED') {
      chosenReason.push('However, a governed Historical Reference authoritatively represents this reference.');
      chosenReason.push('The reference is NOT genuinely missing — it is historically satisfied.');
      rejectedAlternatives.push('GENUINELY_MISSING — rejected because a Historical Reference exists.');
      rulesApplied.push('Authoritative Engineering Existence — Historical References satisfy existence.');
    } else {
      rejectedAlternatives.push('HISTORICALLY_SATISFIED — rejected because no Historical Reference was found.');
      rulesApplied.push('Canonical Ledger Validation — reference not found in engineering_work_orders.');
    }
  } else if (alert.alert_type === 'duplicate_ewo') {
    chosenReason.push('Multiple canonical Work Orders exist with the same reference.');
    rulesApplied.push('Canonical Ledger Validation — references must be unique.');
  } else {
    chosenReason.push(alert.classification_reason ?? 'Alert detected during integrity reconciliation.');
    rulesApplied.push('Integrity Reconciliation — automated detection.');
  }

  return {
    classification,
    chosen_reason: chosenReason.join(' '),
    rejected_alternatives: rejectedAlternatives,
    authoritative_rules_applied: rulesApplied,
  };
}

// ─── Evidence Graph ──────────────────────────────────────────────────────────

function buildEvidenceGraph(
  ref: string,
  evidenceItems: EvidenceItem[],
  existenceResolution: ExistenceResolution | null,
): EvidenceGraph {
  const nodes: EvidenceGraphNode[] = [];
  const edges: EvidenceGraphEdge[] = [];
  const nodeRefs = new Set<string>();

  function addNode(objectType: string, reference: string, label: string, status: EvidenceGraphNode['status']) {
    const key = `${objectType}:${reference}`;
    if (nodeRefs.has(key)) return;
    nodeRefs.add(key);
    nodes.push({ object_type: objectType, reference, label, status });
  }

  // Add the primary reference node
  addNode('reference', ref, ref, 'neutral');

  // Add nodes for each evidence source
  for (const item of evidenceItems) {
    if (item.field_name === item.reference) continue; // skip ref fields
    const status: EvidenceGraphNode['status'] = item.supports_conclusion
      ? 'supporting'
      : item.contradicts_conclusion
        ? 'conflicting'
        : 'neutral';
    addNode(item.object_type, item.source_table, item.source_type, status);
    edges.push({ from: ref, to: item.source_table, label: item.field_name });
  }

  // Add historical reference node if resolved
  if (existenceResolution?.source_object_type === 'historical_reference') {
    addNode('historical_reference', ref, 'Historical Reference', 'supporting');
    edges.push({ from: ref, to: 'historical_reference', label: 'governed by' });
  }

  // Add canonical work order node if resolved
  if (existenceResolution?.source_object_type === 'engineering_work_order') {
    addNode('engineering_work_order', ref, 'Canonical Work Order', 'supporting');
    edges.push({ from: ref, to: 'engineering_work_order', label: 'canonically represented by' });
  }

  // Add missing node if genuinely missing
  if (existenceResolution?.authoritative_status === 'GENUINELY_MISSING') {
    addNode('missing', ref, 'No Authoritative Object Found', 'missing');
    edges.push({ from: ref, to: 'missing', label: 'not found in' });
  }

  return { nodes, edges };
}

// ─── Canonical Decision ─────────────────────────────────────────────────────

function buildCanonicalDecision(
  ref: string,
  evidenceItems: EvidenceItem[],
  conflicts: ConflictDetail[],
  existenceResolution: ExistenceResolution | null,
  alert: IntegrityAlert,
): CanonicalDecision {
  const supportingCount = evidenceItems.filter(e => e.supports_conclusion).length;
  const conflictingCount = conflicts.length;
  const authoritativeCount = evidenceItems.filter(e =>
    e.object_type === 'ewo' || e.object_type === 'historical_reference'
  ).length;

  if (existenceResolution?.authoritative_status === 'CANONICALLY_SATISFIED') {
    return {
      canonical_object_type: 'engineering_work_order',
      canonical_reference: ref,
      canonical_value: evidenceItems.find(e => e.object_type === 'ewo' && e.field_name === 'title')?.field_value ?? ref,
      supporting_evidence_count: supportingCount,
      conflicting_evidence_count: conflictingCount,
      confidence: existenceResolution.confidence,
      reasoning: 'Canonical Work Order exists and is the authoritative source.',
      po_review_required: false,
    };
  }

  if (existenceResolution?.authoritative_status === 'HISTORICALLY_SATISFIED') {
    return {
      canonical_object_type: 'historical_reference',
      canonical_reference: ref,
      canonical_value: existenceResolution.governing_evidence ?? ref,
      supporting_evidence_count: supportingCount,
      conflicting_evidence_count: conflictingCount,
      confidence: existenceResolution.confidence,
      reasoning: 'Governed Historical Reference authoritatively represents the reference. Non-executable but satisfies lineage.',
      po_review_required: false,
    };
  }

  // EWO-014.19A.7SR.6R.3: For parent-child alerts, the canonical decision must
  // address the expected parent relationship, not an incidental child title conflict.
  // Child metadata conflicts are preserved as secondary findings only.
  if (alert.alert_type === 'parent_child_issue') {
    const lineageDecision = buildLineageCanonicalDecision(alert, {
      evidence_items: evidenceItems,
      conflicts,
      existence_resolution: existenceResolution,
      classification_explanation: { classification: '', chosen_reason: '', rejected_alternatives: [], authoritative_rules_applied: [] },
      evidence_graph: { nodes: [], edges: [] },
      canonical_decision: { canonical_object_type: null, canonical_reference: null, canonical_value: null, supporting_evidence_count: 0, conflicting_evidence_count: 0, confidence: 0, reasoning: '', po_review_required: true },
      runtime_diagnostics: { sources_searched: [], sources_contributing_evidence: [], conflicting_evidence_count: 0, supporting_evidence_count: 0, authoritative_evidence_count: 0, unknown_evidence_count: 0, po_decisions_required: 0, automatic_repairs_possible: 0 },
      alert,
    } as unknown as EvidencePackage);
    return {
      canonical_object_type: lineageDecision.canonical_object_type,
      canonical_reference: lineageDecision.canonical_value ? ref : null,
      canonical_value: lineageDecision.canonical_value,
      supporting_evidence_count: supportingCount,
      conflicting_evidence_count: conflictingCount,
      confidence: existenceResolution?.confidence ?? 0.5,
      reasoning: lineageDecision.reasoning,
      po_review_required: lineageDecision.po_review_required,
    };
  }

  if (conflicts.length > 0) {
    const titleConflict = conflicts.find(c => c.conflicting_field === 'title');
    return {
      canonical_object_type: titleConflict?.canonical_candidate ? 'engineering_work_order' : null,
      canonical_reference: titleConflict?.canonical_candidate ? ref : null,
      canonical_value: titleConflict?.canonical_candidate ?? null,
      supporting_evidence_count: supportingCount,
      conflicting_evidence_count: conflictingCount,
      confidence: 0.5,
      reasoning: titleConflict?.canonical_reason ?? 'Conflicting evidence prevents automatic canonical determination. Product Owner review required.',
      po_review_required: titleConflict?.po_review_required ?? true,
    };
  }

  if (existenceResolution?.authoritative_status === 'GENUINELY_MISSING') {
    return {
      canonical_object_type: null,
      canonical_reference: null,
      canonical_value: null,
      supporting_evidence_count: 0,
      conflicting_evidence_count: 0,
      confidence: 0.1,
      reasoning: 'No authoritative engineering object or evidence exists. Product Owner review required to determine next steps.',
      po_review_required: true,
    };
  }

  return {
    canonical_object_type: null,
    canonical_reference: null,
    canonical_value: null,
    supporting_evidence_count: supportingCount,
    conflicting_evidence_count: conflictingCount,
    confidence: 0.3,
    reasoning: 'Insufficient evidence for canonical determination. Product Owner review required.',
    po_review_required: true,
  };
}

// ─── Runtime Diagnostics ────────────────────────────────────────────────────

function buildRuntimeDiagnostics(
  evidenceItems: EvidenceItem[],
  conflicts: ConflictDetail[],
  existenceResolution: ExistenceResolution | null,
): EvidenceRuntimeDiagnostics {
  const sourcesContributing = new Set(evidenceItems.map(e => e.source_table));
  const sourcesSearched = existenceResolution?.sources_searched ?? SOURCE_TABLES.map(s => s.table);
  const supportingCount = evidenceItems.filter(e => e.supports_conclusion).length;
  const authoritativeCount = evidenceItems.filter(e =>
    e.object_type === 'ewo' || e.object_type === 'historical_reference'
  ).length;
  const unknownCount = evidenceItems.filter(e =>
    e.source_table === 'unknown' || e.field_name === 'unknown'
  ).length;
  const poDecisions = conflicts.filter(c => c.po_review_required).length + (existenceResolution?.authoritative_status === 'GENUINELY_MISSING' ? 1 : 0);
  const autoRepairs = evidenceItems.filter(e =>
    e.supports_conclusion && (e.object_type === 'ewo' || e.object_type === 'historical_reference')
  ).length;

  return {
    sources_searched: sourcesSearched,
    sources_contributing_evidence: Array.from(sourcesContributing),
    conflicting_evidence_count: conflicts.length,
    supporting_evidence_count: supportingCount,
    authoritative_evidence_count: authoritativeCount,
    unknown_evidence_count: unknownCount,
    po_decisions_required: poDecisions,
    automatic_repairs_possible: autoRepairs,
  };
}

// ─── Main Evidence Package Builder ──────────────────────────────────────────

export async function buildEvidencePackage(
  alert: IntegrityAlert,
): Promise<EvidencePackage> {
  const ref = alert.normalised_reference ?? alert.raw_reference ?? '';

  // Resolve authoritative existence for the reference
  const existenceResolution = ref ? await resolveAuthoritativeExistence(ref) : null;

  // Collect evidence from all source tables
  const evidenceItems = ref ? await collectSourceEvidence(ref) : [];

  // Detect conflicts
  const conflicts = detectConflicts(ref, evidenceItems);

  // Build classification explanation
  const classificationExplanation = buildClassificationExplanation(alert, existenceResolution);

  // Build evidence graph
  const evidenceGraph = buildEvidenceGraph(ref, evidenceItems, existenceResolution);

  // Build canonical decision
  const canonicalDecision = buildCanonicalDecision(ref, evidenceItems, conflicts, existenceResolution, alert);

  // Build runtime diagnostics
  const runtimeDiagnostics = buildRuntimeDiagnostics(evidenceItems, conflicts, existenceResolution);

  return {
    alert,
    evidence_items: evidenceItems,
    conflicts,
    classification_explanation: classificationExplanation,
    evidence_graph: evidenceGraph,
    canonical_decision: canonicalDecision,
    runtime_diagnostics: runtimeDiagnostics,
    existence_resolution: existenceResolution,
  };
}

// ─── Evidence-Aware Recommended Actions ─────────────────────────────────────

export function getEvidenceAwareActions(
  alert: IntegrityAlert,
  evidencePackage: EvidencePackage,
): Array<{ label: string; type: string; available: boolean; targetRef?: string }> {
  const actions: Array<{ label: string; type: string; available: boolean; targetRef?: string }> = [];
  const ref = alert.normalised_reference ?? '';
  const alertAny = alert as unknown as Record<string, unknown>;
  const parentChildClassification = (alertAny.parent_child_classification as string) ?? '';

  // Parent-child specific actions
  if (alert.alert_type === 'parent_child_issue') {
    if (parentChildClassification === 'HISTORICAL_PARENT_SATISFIED') {
      const expectedParent = (alert.evidence as Record<string, unknown>).expected_parent as string ?? '';
      actions.push({ label: 'Open Historical Reference', type: 'open_engineering', available: true, targetRef: expectedParent });
      actions.push({ label: 'Open Child Work Order', type: 'open_engineering', available: true, targetRef: ref });
      actions.push({ label: 'View Lineage Evidence', type: 'review_diagnostics', available: true });
      actions.push({ label: 'No Repair Required', type: 'dismiss_alert', available: true });
      return actions;
    }
    if (parentChildClassification === 'PARENT_GENUINELY_MISSING') {
      actions.push({ label: 'Investigate Evidence', type: 'review_diagnostics', available: true });
      actions.push({ label: 'Route to PO Review', type: 'resolve_alert', available: true });
      actions.push({ label: 'Begin Historical Recovery', type: 'resolve_alert', available: true });
      return actions;
    }
  }

  // Conflict-based actions
  for (const conflict of evidencePackage.conflicts) {
    if (conflict.conflicting_field === 'title') {
      if (conflict.canonical_candidate) {
        actions.push({ label: 'Accept Existing Canonical Title', type: 'resolve_alert', available: true });
      }
      for (const val of conflict.values) {
        if (val.field_value !== conflict.canonical_candidate) {
          actions.push({
            label: `Update ${val.source_type} Title`,
            type: 'resolve_alert',
            available: true,
          });
        }
      }
      actions.push({ label: 'View Conflicting Sources', type: 'review_diagnostics', available: true });
    }
    if (conflict.conflicting_field === 'status') {
      actions.push({ label: 'Escalate to Product Owner', type: 'resolve_alert', available: true });
    }
  }

  // Missing EWO actions
  if (alert.alert_type === 'missing_ewo') {
    if (evidencePackage.existence_resolution?.authoritative_status === 'HISTORICALLY_SATISFIED') {
      actions.push({ label: 'Mark Historical Title Preserved', type: 'dismiss_alert', available: true });
      actions.push({ label: 'View Historical Reference', type: 'open_engineering', available: true, targetRef: ref });
    } else {
      actions.push({ label: 'Investigate Evidence', type: 'review_diagnostics', available: true });
      actions.push({ label: 'Route to PO Review', type: 'resolve_alert', available: true });
    }
    return actions;
  }

  // Duplicate EWO actions
  if (alert.alert_type === 'duplicate_ewo') {
    actions.push({ label: 'View Conflicting Sources', type: 'review_diagnostics', available: true });
    actions.push({ label: 'Escalate to Product Owner', type: 'resolve_alert', available: true });
    return actions;
  }

  // Canonical decision-based actions
  if (evidencePackage.canonical_decision.po_review_required) {
    actions.push({ label: 'Escalate to Product Owner', type: 'resolve_alert', available: true });
  }

  // Default: open the related engineering object if it exists
  if (ref && actions.length === 0) {
    actions.push({ label: 'Open Related Engineering', type: 'open_engineering', available: true, targetRef: ref });
  }

  // Always allow dismiss
  actions.push({ label: 'Dismiss Alert', type: 'dismiss_alert', available: true });

  return actions;
}
