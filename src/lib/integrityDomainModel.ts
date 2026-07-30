// EWO-014.19A.7SR.6R.3 — Integrity-Domain Isolation & Recommendation Context Fidelity
//
// Every investigation declares one authoritative primary integrity domain.
// Recommendations are validated against that domain. Child metadata cannot
// override expected-parent reasoning. Cross-domain recommendation leakage
// is prevented.

import type { IntegrityAlert } from './engineeringIntegrityService';
import type { EvidencePackage } from './evidencePackageService';
import type { RecommendationType } from './engineeringRecommendationEngine';

// ─── Domain Model ───────────────────────────────────────────────────────────

export type IntegrityDomain =
  | 'missing_work_order'
  | 'parent_child_lineage'
  | 'duplicate_reference'
  | 'orphaned_artifact'
  | 'metadata_conflict'
  | 'reconciliation_instability'
  | 'historical_reference'
  | 'other_governed_integrity_domain';

export const DOMAIN_LABELS: Record<IntegrityDomain, string> = {
  missing_work_order: 'Missing Work Order',
  parent_child_lineage: 'Parent–Child Lineage',
  duplicate_reference: 'Duplicate Reference',
  orphaned_artifact: 'Orphaned Artifact',
  metadata_conflict: 'Metadata Conflict',
  reconciliation_instability: 'Reconciliation Instability',
  historical_reference: 'Historical Reference',
  other_governed_integrity_domain: 'Governed Integrity Domain',
};

// ─── Domain Determination ────────────────────────────────────────────────────

export function determinePrimaryDomain(alert: IntegrityAlert): IntegrityDomain {
  if (alert.alert_type === 'parent_child_issue') return 'parent_child_lineage';
  if (alert.alert_type === 'missing_ewo') return 'missing_work_order';
  if (alert.alert_type === 'duplicate_ewo') return 'duplicate_reference';
  if (alert.alert_type === 'orphaned_artifact') return 'orphaned_artifact';
  if (alert.alert_type === 'metadata_conflict') return 'metadata_conflict';
  if (alert.alert_type === 'reconciliation_instability') return 'reconciliation_instability';
  if (alert.alert_type === 'historical_reference') return 'historical_reference';
  return 'other_governed_integrity_domain';
}

// ─── Domain-Valid Recommendations ────────────────────────────────────────────

const DOMAIN_VALID_RECOMMENDATIONS: Record<IntegrityDomain, RecommendationType[]> = {
  missing_work_order: [
    'accept_historical_reference',
    'begin_historical_recovery',
    'no_action_required',
    'po_review_required',
    'unverified_reference_recovery_candidate',
  ],
  parent_child_lineage: [
    'accept_historical_reference',
    'accept_historical_root',
    'begin_historical_recovery',
    'repair_relationship',
    'no_action_required',
    'po_review_required',
    'engineering_investigation_required',
    'unsafe_to_repair',
    'unverified_reference_recovery_candidate',
  ],
  duplicate_reference: [
    'resolve_duplicate',
    'archive_superseded_record',
    'po_review_required',
  ],
  orphaned_artifact: [
    'archive_superseded_record',
    'po_review_required',
    'engineering_investigation_required',
  ],
  metadata_conflict: [
    'synchronise_metadata',
    'po_review_required',
    'resolve_duplicate',
  ],
  reconciliation_instability: [
    'po_review_required',
    'engineering_investigation_required',
  ],
  historical_reference: [
    'accept_historical_reference',
    'accept_historical_root',
    'begin_historical_recovery',
  ],
  other_governed_integrity_domain: [
    'po_review_required',
    'engineering_investigation_required',
    'no_action_required',
  ],
};

export function isRecommendationValidForDomain(
  type: RecommendationType,
  domain: IntegrityDomain,
): boolean {
  return DOMAIN_VALID_RECOMMENDATIONS[domain].includes(type);
}

// ─── Secondary Findings ──────────────────────────────────────────────────────

export interface SecondaryFinding {
  domain: IntegrityDomain;
  reference: string;
  field: string;
  description: string;
  recommendation_type: RecommendationType;
  recommendation_label: string;
  rejected: true;
  rejection_reason: string;
}

export interface DomainDiagnostics {
  primary_integrity_domain: IntegrityDomain;
  primary_subject_reference: string | null;
  relationship_subject_reference: string | null;
  secondary_findings_count: number;
  secondary_findings: SecondaryFinding[];
  recommendation_domain: IntegrityDomain | null;
  domain_match: boolean;
  rejected_cross_domain_recommendations: SecondaryFinding[];
}

// ─── Domain-Aware Canonical Decision ─────────────────────────────────────────

export function buildLineageCanonicalDecision(
  alert: IntegrityAlert,
  evidencePackage: EvidencePackage,
): {
  canonical_value: string | null;
  canonical_object_type: string | null;
  reasoning: string;
  po_review_required: boolean;
} {
  const alertAny = alert as unknown as Record<string, unknown>;
  const classification = (alertAny.parent_child_classification as string) ?? '';
  const existence = evidencePackage.existence_resolution;
  const expectedParent = (alert.evidence as Record<string, unknown>).expected_parent as string ?? null;

  if (classification === 'HISTORICAL_PARENT_SATISFIED') {
    return {
      canonical_value: 'Historical Parent Satisfied',
      canonical_object_type: 'historical_reference',
      reasoning: `Historical Reference authoritatively satisfies lineage for expected parent ${expectedParent ?? 'unknown'}. The parent is governed and lineage is satisfied.`,
      po_review_required: false,
    };
  }

  if (classification === 'CANONICAL_PARENT_SATISFIED') {
    return {
      canonical_value: 'Parent Exists',
      canonical_object_type: 'engineering_work_order',
      reasoning: `Canonical parent Work Order exists for expected parent ${expectedParent ?? 'unknown'}. Lineage is correctly recorded.`,
      po_review_required: false,
    };
  }

  if (classification === 'PARENT_GENUINELY_MISSING') {
    const hasHistoricalRef = (alertAny.authoritative_source_type as string) === 'historical_reference';
    const hasGoverningEvidence = !!(alertAny.governing_evidence as string);
    const hasAuditConclusion = !!(alertAny.audit_conclusion as string);

    if (!hasHistoricalRef && !hasGoverningEvidence && !hasAuditConclusion) {
      return {
        canonical_value: 'Accept Child as Historical Root',
        canonical_object_type: null,
        reasoning: `No authoritative parent ${expectedParent ?? ''} can be established from any source. The child is the earliest governed lineage point. Historical root acceptance is recommended.`,
        po_review_required: true,
      };
    }
    return {
      canonical_value: 'Parent Recovery Required',
      canonical_object_type: null,
      reasoning: `Expected parent ${expectedParent ?? ''} is genuinely missing but credible historical evidence exists. Historical recovery should be initiated to determine whether the parent should be reconstructed.`,
      po_review_required: true,
    };
  }

  if (classification === 'PARENT_EVIDENCE_ONLY') {
    return {
      canonical_value: 'Parent Recovery Required',
      canonical_object_type: null,
      reasoning: `Evidence exists for expected parent ${expectedParent ?? ''} but no governed authority satisfies lineage. Further investigation is needed.`,
      po_review_required: true,
    };
  }

  if (classification === 'PARENT_AUTHORITY_CONFLICT') {
    return {
      canonical_value: 'Product Owner Lineage Decision Required',
      canonical_object_type: null,
      reasoning: `Conflicting or ambiguous parent evidence for ${expectedParent ?? ''}. Product Owner governance is required to resolve the lineage.`,
      po_review_required: true,
    };
  }

  if (classification === 'RELATIONSHIP_FIELD_INCOMPLETE') {
    return {
      canonical_value: 'Parent Exists',
      canonical_object_type: 'engineering_work_order',
      reasoning: `Parent ${expectedParent ?? ''} exists but the child is missing the relationship link. The field can be safely populated.`,
      po_review_required: false,
    };
  }

  if (classification === 'PARENT_REFERENCE_MISMATCH') {
    return {
      canonical_value: 'Parent Exists',
      canonical_object_type: 'engineering_work_order',
      reasoning: `Parent ${expectedParent ?? ''} exists but the child points to a different parent. The reference should be corrected.`,
      po_review_required: false,
    };
  }

  return {
    canonical_value: null,
    canonical_object_type: null,
    reasoning: 'Lineage assessment incomplete.',
    po_review_required: true,
  };
}

// ─── Domain Diagnostics Builder ──────────────────────────────────────────────

export function buildDomainDiagnostics(
  alert: IntegrityAlert,
  evidencePackage: EvidencePackage,
  recommendationType: RecommendationType | null,
  rejectedCrossDomain: SecondaryFinding[],
): DomainDiagnostics {
  const domain = determinePrimaryDomain(alert);
  const alertAny = alert as unknown as Record<string, unknown>;
  const expectedParent = (alert.evidence as Record<string, unknown>).expected_parent as string ?? null;

  const secondaryFindings = extractSecondaryFindings(alert, evidencePackage, domain);

  return {
    primary_integrity_domain: domain,
    primary_subject_reference: alert.normalised_reference ?? null,
    relationship_subject_reference: expectedParent,
    secondary_findings_count: secondaryFindings.length,
    secondary_findings: secondaryFindings,
    recommendation_domain: recommendationType
      ? isRecommendationValidForDomain(recommendationType, domain) ? domain : mapRecommendationToDomain(recommendationType)
      : null,
    domain_match: recommendationType
      ? isRecommendationValidForDomain(recommendationType, domain)
      : true,
    rejected_cross_domain_recommendations: rejectedCrossDomain,
  };
}

function mapRecommendationToDomain(type: RecommendationType): IntegrityDomain {
  if (type === 'synchronise_metadata') return 'metadata_conflict';
  if (type === 'resolve_duplicate' || type === 'archive_superseded_record') return 'duplicate_reference';
  if (type === 'accept_historical_reference' || type === 'accept_historical_root' || type === 'begin_historical_recovery') return 'parent_child_lineage';
  if (type === 'repair_relationship') return 'parent_child_lineage';
  return 'other_governed_integrity_domain';
}

export function extractSecondaryFindings(
  alert: IntegrityAlert,
  evidencePackage: EvidencePackage,
  primaryDomain: IntegrityDomain,
): SecondaryFinding[] {
  const findings: SecondaryFinding[] = [];

  if (primaryDomain === 'parent_child_lineage') {
    for (const conflict of evidencePackage.conflicts) {
      findings.push({
        domain: 'metadata_conflict',
        reference: alert.normalised_reference ?? '',
        field: conflict.conflicting_field,
        description: `${conflict.conflicting_field} inconsistency detected on ${alert.normalised_reference ?? 'the child object'}`,
        recommendation_type: 'synchronise_metadata',
        recommendation_label: 'Synchronise Metadata',
        rejected: true,
        rejection_reason: 'Cross-domain recommendation rejected — primary domain is parent_child_lineage, not metadata_conflict',
      });
    }
  }

  return findings;
}
