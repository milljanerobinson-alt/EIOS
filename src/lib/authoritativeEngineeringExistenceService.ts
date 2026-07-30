// EWO-014.19A.7SR.3 — Authoritative Engineering Existence Resolver
//
// Central resolver that determines whether an engineering reference is authoritatively
// represented in the engineering ledger. Searches sources in governed priority order:
// 1. Canonical Engineering Work Orders
// 2. Historical References
// 3. Engineering Records
// 4. Engineering Plans
// 5. Engineering Intents
// 6. Completion Reports
// 7. Prompt Artefacts
// 8. Other Engineering Records Library artefacts
//
// The first two sources can satisfy lineage directly. Lower-order sources are
// classified as EVIDENCE_ONLY unless stronger governed authority is present.

import { supabase } from './supabase';

// ─── Types ─────────────────────────────────────────────────────────────────

export type AuthoritativeExistenceStatus =
  | 'CANONICALLY_SATISFIED'
  | 'HISTORICALLY_SATISFIED'
  | 'EVIDENCE_ONLY'
  | 'GENUINELY_MISSING'
  | 'CONFLICTING_AUTHORITY';

export type ParentChildClassification =
  | 'CANONICAL_PARENT_SATISFIED'
  | 'HISTORICAL_PARENT_SATISFIED'
  | 'RELATIONSHIP_FIELD_INCOMPLETE'
  | 'PARENT_REFERENCE_MISMATCH'
  | 'PARENT_EVIDENCE_ONLY'
  | 'PARENT_GENUINELY_MISSING'
  | 'PARENT_AUTHORITY_CONFLICT'
  | 'NUMBERING_DERIVED_PARENT_NOT_FOUND';

export type IntegrityGovernedCategory =
  | 'confirmed_engineering_defect'
  | 'product_owner_governance_decision'
  | 'detection_rule_improvement'
  | 'already_resolved';

export const GOVERNED_CATEGORY_LABELS: Record<IntegrityGovernedCategory, string> = {
  confirmed_engineering_defect: 'Confirmed Engineering Defect',
  product_owner_governance_decision: 'Product Owner Governance Decision',
  detection_rule_improvement: 'Detection Rule Improvement',
  already_resolved: 'Already Resolved',
};

export type SourceObjectType =
  | 'engineering_work_order'
  | 'historical_reference'
  | 'engineering_record'
  | 'engineering_plan'
  | 'engineering_intent'
  | 'completion_report'
  | 'prompt_artefact'
  | 'other_record'
  | 'none';

export interface ExistenceResolution {
  reference: string;
  authoritative_status: AuthoritativeExistenceStatus;
  source_object_type: SourceObjectType;
  source_object_id: string | null;
  lifecycle_or_historical_status: string | null;
  confidence: number;
  governing_evidence: string | null;
  audit_conclusion: string | null;
  limitations: string[];
  lineage_satisfied: boolean;
  execution_permitted: boolean;
  sources_searched: string[];
  evidence_sources_found: Array<{ source: string; object_id: string }>;
}

export interface ParentChildValidationResult {
  child_ref: string;
  expected_parent: string;
  actual_parent: string | null;
  classification: ParentChildClassification;
  existence_resolution: ExistenceResolution;
  repair_needed: boolean;
  auto_repair_safe: boolean;
  resolution_reason: string;
}

// ─── Historical Reference Statuses That Satisfy Lineage ─────────────────────

const HISTORICAL_STATES_SATISFYING_LINEAGE = new Set([
  'historical_not_issued',
  'intentionally_reserved',
  'numbering_preserved',
  'historical_placeholder',
  'governed_historical_reference',
  'superseded_historical_identity',
  'historical',
]);

const HISTORICAL_STATES_NOT_SATISFYING_LINEAGE = new Set([
  'draft',
  'unverified',
  'invalidated',
  'ambiguous',
]);

// ─── Normalisation ─────────────────────────────────────────────────────────

function normaliseRef(ref: string): string {
  let n = ref.trim().toUpperCase();
  while (n.endsWith('.')) n = n.slice(0, -1);
  return n;
}

// ─── Source Hierarchy Search ───────────────────────────────────────────────

async function searchCanonicalWorkOrder(
  ref: string,
): Promise<{ id: string; status: string; title: string } | null> {
  const { data } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, status, title')
    .eq('ewo_ref', ref)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, status: data.status, title: data.title };
}

async function searchHistoricalReference(
  ref: string,
): Promise<{
  id: string;
  status: string;
  title: string;
  evidence_summary: string;
  conclusion: string;
  historical_explanation: string;
  audit_ref: string;
} | null> {
  const { data } = await supabase
    .from('engineering_historical_references')
    .select('id, reference, title, status, evidence_summary, conclusion, historical_explanation, audit_ref')
    .eq('reference', ref)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    status: data.status,
    title: data.title,
    evidence_summary: data.evidence_summary,
    conclusion: data.conclusion,
    historical_explanation: data.historical_explanation,
    audit_ref: data.audit_ref,
  };
}

async function searchEvidenceSources(
  ref: string,
): Promise<Array<{ source: string; object_id: string }>> {
  const found: Array<{ source: string; object_id: string }> = [];
  const sources = [
    { table: 'engineering_records_library', label: 'engineering_record', col: 'ewo_ref' },
    { table: 'engineering_plans', label: 'engineering_plan', col: 'ewo_ref' },
    { table: 'ewo_completion_reports', label: 'completion_report', col: 'ewo_ref' },
    { table: 'engineering_executions', label: 'engineering_intent', col: 'ewo_ref' },
    { table: 'ewo_engineering_packages', label: 'prompt_artefact', col: 'ewo_ref' },
    { table: 'engineering_verification_records', label: 'other_record', col: 'ewo_ref' },
  ];
  for (const src of sources) {
    try {
      const { data } = await supabase
        .from(src.table)
        .select('id')
        .eq(src.col, ref)
        .limit(1);
      if (data && data.length > 0) {
        found.push({ source: src.label, object_id: data[0].id });
      }
    } catch { /* table may not exist */ }
  }
  return found;
}

// ─── Main Resolver ──────────────────────────────────────────────────────────

export async function resolveAuthoritativeExistence(
  rawRef: string,
): Promise<ExistenceResolution> {
  const ref = normaliseRef(rawRef);
  const sourcesSearched: string[] = [
    'engineering_work_orders',
    'engineering_historical_references',
  ];
  const limitations: string[] = [];

  // 1. Check Canonical Engineering Work Orders (highest priority)
  const canonical = await searchCanonicalWorkOrder(ref);
  if (canonical) {
    return {
      reference: ref,
      authoritative_status: 'CANONICALLY_SATISFIED',
      source_object_type: 'engineering_work_order',
      source_object_id: canonical.id,
      lifecycle_or_historical_status: canonical.status,
      confidence: 1.0,
      governing_evidence: `Canonical Work Order found: ${canonical.title}`,
      audit_conclusion: null,
      limitations: [],
      lineage_satisfied: true,
      execution_permitted: true,
      sources_searched: sourcesSearched,
      evidence_sources_found: [],
    };
  }

  // 2. Check Historical References (second priority)
  const historical = await searchHistoricalReference(ref);
  if (historical) {
    const satisfiesLineage = HISTORICAL_STATES_SATISFYING_LINEAGE.has(historical.status);
    const notSatisfying = HISTORICAL_STATES_NOT_SATISFYING_LINEAGE.has(historical.status);

    if (satisfiesLineage && !notSatisfying) {
      return {
        reference: ref,
        authoritative_status: 'HISTORICALLY_SATISFIED',
        source_object_type: 'historical_reference',
        source_object_id: historical.id,
        lifecycle_or_historical_status: historical.status,
        confidence: 0.95,
        governing_evidence: historical.evidence_summary,
        audit_conclusion: historical.conclusion,
        limitations: ['Historical Reference — not executable as a Work Order'],
        lineage_satisfied: true,
        execution_permitted: false,
        sources_searched: sourcesSearched,
        evidence_sources_found: [],
      };
    }

    if (notSatisfying) {
      limitations.push(`Historical Reference status "${historical.status}" does not satisfy lineage`);
    }
  }

  // 3. Search lower-order evidence sources
  const evidenceSources = await searchEvidenceSources(ref);
  sourcesSearched.push(
    'engineering_records_library',
    'engineering_plans',
    'ewo_completion_reports',
    'engineering_executions',
    'ewo_engineering_packages',
    'engineering_verification_records',
  );

  // Check for conflicting authority: both historical (non-satisfying) and evidence exist
  if (historical && evidenceSources.length > 0 && historical.status !== 'historical_not_issued') {
    return {
      reference: ref,
      authoritative_status: 'CONFLICTING_AUTHORITY',
      source_object_type: 'historical_reference',
      source_object_id: historical.id,
      lifecycle_or_historical_status: historical.status,
      confidence: 0.5,
      governing_evidence: `Historical Reference with status "${historical.status}" conflicts with ${evidenceSources.length} evidence source(s)`,
      audit_conclusion: historical.conclusion,
      limitations: ['Multiple authoritative records conflict about this reference'],
      lineage_satisfied: false,
      execution_permitted: false,
      sources_searched: sourcesSearched,
      evidence_sources_found: evidenceSources,
    };
  }

  if (evidenceSources.length > 0) {
    return {
      reference: ref,
      authoritative_status: 'EVIDENCE_ONLY',
      source_object_type: evidenceSources[0].source as SourceObjectType,
      source_object_id: evidenceSources[0].object_id,
      lifecycle_or_historical_status: null,
      confidence: 0.3,
      governing_evidence: `Evidence found in ${evidenceSources.length} source(s): ${evidenceSources.map(e => e.source).join(', ')}`,
      audit_conclusion: null,
      limitations: ['Evidence exists but no governed authority satisfies lineage'],
      lineage_satisfied: false,
      execution_permitted: false,
      sources_searched: sourcesSearched,
      evidence_sources_found: evidenceSources,
    };
  }

  // 4. Genuinely missing
  return {
    reference: ref,
    authoritative_status: 'GENUINELY_MISSING',
    source_object_type: 'none',
    source_object_id: null,
    lifecycle_or_historical_status: null,
    confidence: 0.1,
    governing_evidence: null,
    audit_conclusion: null,
    limitations: ['No authoritative engineering object or evidence found'],
    lineage_satisfied: false,
    execution_permitted: false,
    sources_searched: sourcesSearched,
    evidence_sources_found: [],
  };
}

// ─── Parent-Child Validation ────────────────────────────────────────────────

function deriveExpectedParent(childRef: string): string | null {
  // EWO-014.13 → EWO-014
  // EWO-014.19A.7SR.3 → EWO-014.19A.7SR
  // EWO-014 → null (no parent)
  // Strategy: find the last dot-separated segment and remove it
  // The reference format is EWO-<number>.<segment>.<segment>...
  // We need to remove only the last segment after the last dot
  const lastDotIndex = childRef.lastIndexOf('.');
  if (lastDotIndex <= 4) return null; // "EWO-014" has dot at index 3, but no parent segment
  // Check that the part before the last dot still has the EWO- prefix
  const parent = childRef.substring(0, lastDotIndex);
  if (!parent.match(/^EWO-\d/i)) return null;
  return parent;
}

export async function validateParentChildRelationship(
  childRef: string,
  actualParent: string | null,
): Promise<ParentChildValidationResult> {
  const expectedParent = deriveExpectedParent(childRef);
  const childRefNormalised = normaliseRef(childRef);

  if (!expectedParent) {
    const resolution = await resolveAuthoritativeExistence(childRefNormalised);
    return {
      child_ref: childRefNormalised,
      expected_parent: '',
      actual_parent: actualParent,
      classification: 'CANONICAL_PARENT_SATISFIED',
      existence_resolution: resolution,
      repair_needed: false,
      auto_repair_safe: false,
      resolution_reason: 'No parent expected — root EWO',
    };
  }

  const expectedParentNormalised = normaliseRef(expectedParent);
  const actualParentNormalised = actualParent ? normaliseRef(actualParent) : null;

  // EVIDENCE-FIRST PRINCIPLE (BUG-006R.1):
  // Engineering history is authoritative; numbering is advisory.
  // If the child has a recorded parent, validate THAT parent authoritatively
  // rather than insisting it must match the numbering-derived expected parent.
  if (actualParentNormalised) {
    const actualResolution = await resolveAuthoritativeExistence(actualParentNormalised);

    // If the actual parent is canonically satisfied, the lineage is valid
    // regardless of whether it matches the numbering-derived expected parent.
    if (actualResolution.authoritative_status === 'CANONICALLY_SATISFIED') {
      return {
        child_ref: childRefNormalised,
        expected_parent: expectedParentNormalised,
        actual_parent: actualParent,
        classification: 'CANONICAL_PARENT_SATISFIED',
        existence_resolution: actualResolution,
        repair_needed: false,
        auto_repair_safe: false,
        resolution_reason: `Actual parent ${actualParentNormalised} is canonically satisfied. Numbering-derived expected parent (${expectedParentNormalised}) is advisory only — engineering history is authoritative.`,
      };
    }

    // If the actual parent is historically satisfied, lineage is valid
    if (actualResolution.authoritative_status === 'HISTORICALLY_SATISFIED') {
      return {
        child_ref: childRefNormalised,
        expected_parent: expectedParentNormalised,
        actual_parent: actualParent,
        classification: 'HISTORICAL_PARENT_SATISFIED',
        existence_resolution: actualResolution,
        repair_needed: false,
        auto_repair_safe: false,
        resolution_reason: `Actual parent ${actualParentNormalised} is historically satisfied (status: ${actualResolution.lifecycle_or_historical_status}). Numbering-derived expected parent is advisory only.`,
      };
    }

    // If the actual parent is evidence-only or genuinely missing,
    // the child's recorded parent itself needs investigation — not a mismatch.
    if (actualResolution.authoritative_status === 'EVIDENCE_ONLY') {
      return {
        child_ref: childRefNormalised,
        expected_parent: actualParentNormalised,
        actual_parent: actualParent,
        classification: 'PARENT_EVIDENCE_ONLY',
        existence_resolution: actualResolution,
        repair_needed: false,
        auto_repair_safe: false,
        resolution_reason: `Recorded parent ${actualParentNormalised} has evidence but no governed authority. Product Owner review required.`,
      };
    }

    if (actualResolution.authoritative_status === 'CONFLICTING_AUTHORITY') {
      return {
        child_ref: childRefNormalised,
        expected_parent: actualParentNormalised,
        actual_parent: actualParent,
        classification: 'PARENT_AUTHORITY_CONFLICT',
        existence_resolution: actualResolution,
        repair_needed: false,
        auto_repair_safe: false,
        resolution_reason: `Authoritative records conflict about recorded parent ${actualParentNormalised}`,
      };
    }

    // Actual parent is genuinely missing — this is a real defect
    if (actualResolution.authoritative_status === 'GENUINELY_MISSING') {
      return {
        child_ref: childRefNormalised,
        expected_parent: actualParentNormalised,
        actual_parent: actualParent,
        classification: 'PARENT_GENUINELY_MISSING',
        existence_resolution: actualResolution,
        repair_needed: false,
        auto_repair_safe: false,
        resolution_reason: `Recorded parent ${actualParentNormalised} does not exist in any authoritative source. Confirmed engineering defect.`,
      };
    }
  }

  // No actual parent recorded — use numbering as a hint, but verify with evidence
  const resolution = await resolveAuthoritativeExistence(expectedParentNormalised);

  switch (resolution.authoritative_status) {
    case 'CANONICALLY_SATISFIED':
      return {
        child_ref: childRefNormalised,
        expected_parent: expectedParentNormalised,
        actual_parent: actualParent,
        classification: 'RELATIONSHIP_FIELD_INCOMPLETE',
        existence_resolution: resolution,
        repair_needed: true,
        auto_repair_safe: true,
        resolution_reason: `Canonical parent ${expectedParentNormalised} exists but child's parent field is null`,
      };

    case 'HISTORICALLY_SATISFIED':
      return {
        child_ref: childRefNormalised,
        expected_parent: expectedParentNormalised,
        actual_parent: actualParent,
        classification: 'HISTORICAL_PARENT_SATISFIED',
        existence_resolution: resolution,
        repair_needed: false,
        auto_repair_safe: false,
        resolution_reason: `Historical Reference ${expectedParentNormalised} (status: ${resolution.lifecycle_or_historical_status}) authoritatively satisfies lineage. No executable parent required.`,
      };

    case 'EVIDENCE_ONLY':
      return {
        child_ref: childRefNormalised,
        expected_parent: expectedParentNormalised,
        actual_parent: actualParent,
        classification: 'PARENT_EVIDENCE_ONLY',
        existence_resolution: resolution,
        repair_needed: false,
        auto_repair_safe: false,
        resolution_reason: `Evidence exists for numbering-derived parent ${expectedParentNormalised} but no governed authority satisfies lineage. Product Owner review required.`,
      };

    case 'GENUINELY_MISSING':
      // Numbering-derived parent doesn't exist AND no actual parent recorded.
      // This is a numbering-derived assumption, NOT a confirmed defect.
      return {
        child_ref: childRefNormalised,
        expected_parent: expectedParentNormalised,
        actual_parent: actualParent,
        classification: 'NUMBERING_DERIVED_PARENT_NOT_FOUND',
        existence_resolution: resolution,
        repair_needed: false,
        auto_repair_safe: false,
        resolution_reason: `Numbering suggests parent ${expectedParentNormalised} but no authoritative evidence confirms it should exist. Engineering history is authoritative; numbering is advisory. Product Owner review required.`,
      };

    case 'CONFLICTING_AUTHORITY':
      return {
        child_ref: childRefNormalised,
        expected_parent: expectedParentNormalised,
        actual_parent: actualParent,
        classification: 'PARENT_AUTHORITY_CONFLICT',
        existence_resolution: resolution,
        repair_needed: false,
        auto_repair_safe: false,
        resolution_reason: `Authoritative records conflict about numbering-derived parent ${expectedParentNormalised}`,
      };

    default:
      return {
        child_ref: childRefNormalised,
        expected_parent: expectedParentNormalised,
        actual_parent: actualParent,
        classification: 'NUMBERING_DERIVED_PARENT_NOT_FOUND',
        existence_resolution: resolution,
        repair_needed: false,
        auto_repair_safe: false,
        resolution_reason: 'Unable to resolve authoritative existence for numbering-derived parent',
      };
  }
}

// ─── Recommended Actions ────────────────────────────────────────────────────

export function getRecommendedActions(classification: ParentChildClassification): string[] {
  switch (classification) {
    case 'CANONICAL_PARENT_SATISFIED':
      return ['open_child_work_order', 'view_lineage_evidence'];
    case 'HISTORICAL_PARENT_SATISFIED':
      return ['open_historical_reference', 'open_child_work_order', 'view_lineage_evidence'];
    case 'RELATIONSHIP_FIELD_INCOMPLETE':
      return ['review_proposed_relationship', 'link_historical_parent', 'link_canonical_parent', 'defer', 'mark_no_safe_repair'];
    case 'PARENT_REFERENCE_MISMATCH':
      return ['review_proposed_relationship', 'link_canonical_parent', 'defer', 'mark_no_safe_repair'];
    case 'PARENT_EVIDENCE_ONLY':
      return ['investigate_evidence', 'route_to_po_review', 'defer'];
    case 'PARENT_GENUINELY_MISSING':
      return ['investigate_evidence', 'route_to_po_review', 'begin_historical_recovery'];
    case 'PARENT_AUTHORITY_CONFLICT':
      return ['route_to_po_review', 'investigate_conflict'];
    case 'NUMBERING_DERIVED_PARENT_NOT_FOUND':
      return ['route_to_po_review', 'improve_detection_rule', 'defer'];
    default:
      return ['route_to_po_review'];
  }
}

// ─── Batch Resolution ───────────────────────────────────────────────────────

export interface BatchResolutionResult {
  resolutions: Map<string, ExistenceResolution>;
  canonical_matches: number;
  historical_matches: number;
  evidence_only_matches: number;
  genuinely_missing: number;
  authoritative_conflicts: number;
  historically_satisfied_lineage: number;
}

export async function batchResolveExistence(
  references: string[],
): Promise<BatchResolutionResult> {
  const resolutions = new Map<string, ExistenceResolution>();
  let canonical_matches = 0;
  let historical_matches = 0;
  let evidence_only_matches = 0;
  let genuinely_missing = 0;
  let authoritative_conflicts = 0;
  let historically_satisfied_lineage = 0;

  for (const ref of references) {
    const normalised = normaliseRef(ref);
    if (resolutions.has(normalised)) continue;
    const resolution = await resolveAuthoritativeExistence(normalised);
    resolutions.set(normalised, resolution);

    switch (resolution.authoritative_status) {
      case 'CANONICALLY_SATISFIED': canonical_matches++; break;
      case 'HISTORICALLY_SATISFIED':
        historical_matches++;
        historically_satisfied_lineage++;
        break;
      case 'EVIDENCE_ONLY': evidence_only_matches++; break;
      case 'GENUINELY_MISSING': genuinely_missing++; break;
      case 'CONFLICTING_AUTHORITY': authoritative_conflicts++; break;
    }
  }

  return {
    resolutions,
    canonical_matches,
    historical_matches,
    evidence_only_matches,
    genuinely_missing,
    authoritative_conflicts,
    historically_satisfied_lineage,
  };
}
