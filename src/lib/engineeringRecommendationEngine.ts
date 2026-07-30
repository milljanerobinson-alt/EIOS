// EWO-014.19A.7SR.5 — Governed Engineering Recommendation Engine
//
// Transforms Engineering Integrity from evidence presentation into
// Engineering Intelligence. Every investigation ends with a structured,
// evidence-backed Engineering Recommendation.
//
// Analyses: investigation classification, authoritative evidence, evidence
// confidence, canonical object, conflicting evidence, engineering standards,
// constitutional rules, historical references, engineering relationships,
// object lifecycle, governance constraints.
//
// Produces: recommended action, engineering reasoning, evidence used, three
// separate confidence values (evidence/recommendation/repair), risk assessment,
// automatic repair suitability, PO decision support, expected impact,
// alternative actions, known limitations.

import { supabase } from './supabase';
import type { IntegrityAlert } from './engineeringIntegrityService';
import type { EvidencePackage, EvidenceItem, ConflictDetail } from './evidencePackageService';
import type { ExistenceResolution } from './authoritativeEngineeringExistenceService';
import {
  determinePrimaryDomain,
  isRecommendationValidForDomain,
  extractSecondaryFindings,
  type IntegrityDomain,
  type SecondaryFinding,
} from './integrityDomainModel';

// ─── Types ─────────────────────────────────────────────────────────────────

export type RecommendationType =
  | 'synchronise_metadata'
  | 'repair_relationship'
  | 'accept_historical_reference'
  | 'accept_historical_root'
  | 'resolve_duplicate'
  | 'archive_superseded_record'
  | 'update_completion_report'
  | 'update_engineering_record'
  | 'update_engineering_plan'
  | 'no_action_required'
  | 'po_review_required'
  | 'unsafe_to_repair'
  | 'engineering_investigation_required'
  | 'begin_historical_recovery'
  | 'unverified_reference_recovery_candidate';

export type RiskLevel = 'low' | 'medium' | 'high';
export type AutoRepairSuitability = 'recommended' | 'safe' | 'possible' | 'blocked' | 'unsafe';
export type PODecision = 'approve' | 'reject' | 'modify' | 'request_further_investigation' | 'defer' | 'no_safe_action';

export interface AlternativeAction {
  action: string;
  tradeoffs: string;
  risk_comparison: string;
  governance_implications: string;
  confidence: number;
}

export interface EngineeringRecommendation {
  recommendation_ref: string;
  alert_id: string;
  ewo_ref: string | null;
  recommendation_type: RecommendationType;
  recommended_action: string;
  engineering_reasoning: string;
  summary: string;
  evidence_confidence: number;
  recommendation_confidence: number;
  repair_confidence: number;
  risk_level: RiskLevel;
  risk_reason: string;
  auto_repair_suitability: AutoRepairSuitability;
  auto_repair_reason: string;
  po_review_required: boolean;
  expected_impact: string;
  alternative_actions: AlternativeAction[];
  known_limitations: string[];
  evidence_used: EvidenceItem[];
  po_decision_options: PODecision[];
  // EWO-014.19A.7SR.6R.3: Domain isolation fields
  primary_integrity_domain: IntegrityDomain;
  secondary_findings: SecondaryFinding[];
  rejected_cross_domain_recommendations: SecondaryFinding[];
  domain_match: boolean;
  // BUG-006R.3: Separated confidence model — prevents pattern-match confidence
  // from being presented as evidence that an object existed.
  reference_classification_confidence: number;
  decision_confidence: number;
  recovery_justification: 'justified' | 'not_justified' | 'blocked_pending_evidence' | 'blocked_pending_po_decision';
  recovery_justification_reason: string;
  investigation_stage: 'reference_detected' | 'evidence_investigation' | 'governed_decision';
}

export interface RecommendationDiagnostics {
  recommendations_generated: number;
  automatic_repairs_recommended: number;
  po_reviews_required: number;
  unsafe_repairs: number;
  alternative_recommendations: number;
  recommendation_confidence: number;
}

// ─── Recommendation Builder ─────────────────────────────────────────────────

export function buildEngineeringRecommendation(
  alert: IntegrityAlert,
  evidencePackage: EvidencePackage,
): EngineeringRecommendation {
  const alertAny = alert as unknown as Record<string, unknown>;
  const parentChildClassification = (alertAny.parent_child_classification as string) ?? '';
  const existence = evidencePackage.existence_resolution;
  const conflicts = evidencePackage.conflicts;
  const evidenceItems = evidencePackage.evidence_items;

  // EWO-014.19A.7SR.6R.3: Determine the primary integrity domain FIRST.
  // Recommendations must resolve the primary domain. Cross-domain recommendations
  // (e.g. metadata sync for a parent-child alert) are rejected as secondary findings.
  const primaryDomain = determinePrimaryDomain(alert);

  // Determine recommendation type based on primary domain and evidence
  const {
    type,
    action,
    reasoning,
    summary,
    poReviewRequired,
  } = determineRecommendation(alert, parentChildClassification, existence, conflicts, evidenceItems, primaryDomain);

  // EWO-014.19A.7SR.6R.3: Validate recommendation against primary domain.
  // If the recommendation is cross-domain, reject it and re-evaluate.
  let finalType = type;
  let finalAction = action;
  let finalReasoning = reasoning;
  let finalSummary = summary;
  let finalPoReviewRequired = poReviewRequired;
  const rejectedCrossDomain: SecondaryFinding[] = [];

  if (!isRecommendationValidForDomain(finalType, primaryDomain)) {
    // The initial recommendation is cross-domain — record it as rejected
    rejectedCrossDomain.push({
      domain: finalType === 'synchronise_metadata' ? 'metadata_conflict' : 'other_governed_integrity_domain',
      reference: alert.normalised_reference ?? '',
      field: conflicts.find(c => c.conflicting_field === 'title')?.conflicting_field ?? '',
      description: `Cross-domain recommendation "${finalAction}" rejected for ${primaryDomain} alert`,
      recommendation_type: finalType,
      recommendation_label: finalAction,
      rejected: true,
      rejection_reason: `Primary domain is ${primaryDomain}; recommendation ${finalType} belongs to a different domain`,
    });

    // Re-evaluate using domain-valid recommendations only
    const domainValid = determineDomainValidRecommendation(alert, parentChildClassification, existence, evidenceItems, primaryDomain);
    finalType = domainValid.type;
    finalAction = domainValid.action;
    finalReasoning = domainValid.reasoning;
    finalSummary = domainValid.summary;
    finalPoReviewRequired = domainValid.poReviewRequired;
  }

  // Extract secondary findings (e.g. child metadata conflicts in a parent-child investigation)
  const secondaryFindings = extractSecondaryFindings(alert, evidencePackage, primaryDomain);

  // Calculate three separate confidence values
  const evidenceConfidence = calculateEvidenceConfidence(evidenceItems, existence);
  const recommendationConfidence = calculateRecommendanceConfidence(
    type, evidenceConfidence, conflicts, existence,
  );
  const repairConfidence = calculateRepairConfidence(type, conflicts, existence);

  // Calculate risk
  const { riskLevel, riskReason } = calculateRisk(type, conflicts, existence, alert);

  // Determine automatic repair suitability
  const { autoRepairSuitability, autoRepairReason } = determineAutoRepairSuitability(
    type, riskLevel, poReviewRequired, conflicts,
  );

  // Determine expected impact
  const expectedImpact = determineExpectedImpact(type, conflicts);

  // Build alternative actions
  const alternativeActions = buildAlternativeActions(type, conflicts, existence, evidenceItems);

  // Build known limitations
  const knownLimitations = buildKnownLimitations(type, existence, conflicts);

  // Build PO decision options
  const poDecisionOptions = buildPODecisionOptions(type, poReviewRequired, riskLevel);

  // BUG-006R.3: Reference classification confidence is the pattern-match
  // confidence (string matches a known EWO reference pattern). This is separate
  // from evidence confidence (whether authoritative sources confirm existence).
  const referenceClassificationConfidence = calculateReferenceClassificationConfidence(alert);

  // BUG-006R.3: Decision confidence is the confidence in the recommendation
  // itself — distinct from evidence confidence and repair confidence.
  const decisionConfidence = calculateDecisionConfidence(
    finalType, evidenceConfidence, recommendationConfidence, evidenceItems,
  );

  // BUG-006R.3: Recovery justification — only justified when positive evidence
  // supports recovery. Absence of a canonical Work Order is not positive evidence.
  const { recoveryJustification, recoveryJustificationReason } = assessRecoveryJustification(
    finalType, evidenceItems, existence,
  );

  // BUG-006R.3: Investigation stage — tracks where in the three-stage model
  // the investigation currently sits.
  const investigationStage = determineInvestigationStage(
    finalType, evidenceItems, existence,
  );

  return {
    recommendation_ref: `REC-${alert.id.substring(0, 8)}-${Date.now().toString(36)}`,
    alert_id: alert.id,
    ewo_ref: alert.normalised_reference,
    recommendation_type: finalType,
    recommended_action: finalAction,
    engineering_reasoning: finalReasoning,
    summary: finalSummary,
    evidence_confidence: evidenceConfidence,
    recommendation_confidence: recommendationConfidence,
    repair_confidence: repairConfidence,
    risk_level: riskLevel,
    risk_reason: riskReason,
    auto_repair_suitability: autoRepairSuitability,
    auto_repair_reason: autoRepairReason,
    po_review_required: finalPoReviewRequired,
    expected_impact: expectedImpact,
    alternative_actions: alternativeActions,
    known_limitations: knownLimitations,
    evidence_used: evidenceItems,
    po_decision_options: poDecisionOptions,
    primary_integrity_domain: primaryDomain,
    secondary_findings: secondaryFindings,
    rejected_cross_domain_recommendations: rejectedCrossDomain,
    domain_match: rejectedCrossDomain.length === 0,
    reference_classification_confidence: referenceClassificationConfidence,
    decision_confidence: decisionConfidence,
    recovery_justification: recoveryJustification,
    recovery_justification_reason: recoveryJustificationReason,
    investigation_stage: investigationStage,
  };
}

// ─── Recommendation Determination ──────────────────────────────────────────

function determineRecommendation(
  alert: IntegrityAlert,
  parentChildClassification: string,
  existence: ExistenceResolution | null,
  conflicts: ConflictDetail[],
  evidenceItems: EvidenceItem[],
  primaryDomain: IntegrityDomain,
): {
  type: RecommendationType;
  action: string;
  reasoning: string;
  summary: string;
  poReviewRequired: boolean;
} {
  // EWO-014.19A.7SR.6R.3: Parent-child lineage alerts are evaluated FIRST.
  // Child metadata conflicts are secondary findings and must not override
  // the primary lineage recommendation.
  if (primaryDomain === 'parent_child_lineage' && alert.alert_type === 'parent_child_issue') {
    if (parentChildClassification === 'HISTORICAL_PARENT_SATISFIED') {
      return {
        type: 'accept_historical_reference',
        action: 'Accept Historical Reference as Authoritative Parent',
        reasoning: 'Historical Reference exists with governed status "historical_not_issued". The reference was intentionally not issued as a canonical Work Order — only sub-numbered refinements were issued. Lineage is satisfied by the governed historical record. No repair is needed. Execution remains prohibited because Historical References are non-executable.',
        summary: 'Historical Reference authoritatively satisfies parent lineage. No action required.',
        poReviewRequired: false,
      };
    }
    if (parentChildClassification === 'CANONICAL_PARENT_SATISFIED') {
      return {
        type: 'no_action_required',
        action: 'No Action Required',
        reasoning: 'Canonical parent Work Order exists and the child relationship is correctly recorded. No integrity issue remains.',
        summary: 'Canonical parent exists and relationship is correct.',
        poReviewRequired: false,
      };
    }
    if (parentChildClassification === 'RELATIONSHIP_FIELD_INCOMPLETE') {
      return {
        type: 'repair_relationship',
        action: 'Repair Relationship Field',
        reasoning: 'An authoritative parent exists but the child is missing the required lineage link. The relationship field can be safely populated with the expected parent reference. No data loss occurs — only a metadata field is updated.',
        summary: 'Child is missing parent reference. Relationship field can be safely repaired.',
        poReviewRequired: false,
      };
    }
    if (parentChildClassification === 'PARENT_REFERENCE_MISMATCH') {
      return {
        type: 'repair_relationship',
        action: 'Update Parent Reference',
        reasoning: 'The child points to a different parent than the authoritative expected parent. The parent_ref field should be updated to match the authoritative expected parent. This is a metadata correction, not a structural change.',
        summary: 'Child points to wrong parent. Parent reference should be corrected.',
        poReviewRequired: false,
      };
    }
    if (parentChildClassification === 'PARENT_GENUINELY_MISSING') {
      // BUG-006R.3: Three-stage investigation gate.
      // Stage 1: Reference detected (the alert exists).
      // Stage 2: Evidence investigation (searched authoritative sources).
      // Stage 3: Governed decision (only with positive evidence).
      //
      // A reference without a canonical Work Order is NOT evidence that the
      // object existed. The engine must not state "genuinely missing" or
      // "recovery required" unless positive evidence supports that conclusion.
      const alertAny = alert as unknown as Record<string, unknown>;
      const hasHistoricalRef = (alertAny.authoritative_source_type as string) === 'historical_reference';
      const hasGoverningEvidence = !!(alertAny.governing_evidence as string);
      const hasAuditConclusion = !!(alertAny.audit_conclusion as string);
      const hasPositiveEvidence = evidenceItems.length > 0 && evidenceItems.some(e => e.confidence > 0.3);

      if (!hasHistoricalRef && !hasGoverningEvidence && !hasAuditConclusion && !hasPositiveEvidence) {
        // Stage 1 only: reference detected, no evidence found.
        // Do NOT recommend recovery. Do NOT state "genuinely missing".
        return {
          type: 'unverified_reference_recovery_candidate',
          action: 'Unverified Reference Recovery Candidate',
          reasoning: 'A reference was detected, but no authoritative evidence confirms that a corresponding Engineering Work Order previously existed. Product Owner review or further evidence is required before recovery can be justified. The reference may be intentionally omitted, superseded, obsolete, malformed, or belong to a legacy convention.',
          summary: 'Reference detected. No evidence confirms the object existed. Recovery not justified.',
          poReviewRequired: true,
        };
      }

      if (hasHistoricalRef || hasGoverningEvidence || hasAuditConclusion) {
        // Stage 2-3: positive evidence exists — recovery may be justified.
        return {
          type: 'begin_historical_recovery',
          action: 'Begin Historical Recovery',
          reasoning: 'Positive evidence was found in authoritative sources. Historical recovery should be initiated to determine whether the parent should be reconstructed or recorded as a historical reference. Product Owner review is required to authorise recovery.',
          summary: 'Positive evidence found. Historical recovery may be justified.',
          poReviewRequired: true,
        };
      }

      // Fallback: evidence items exist but low confidence — still unverified.
      return {
        type: 'unverified_reference_recovery_candidate',
        action: 'Unverified Reference Recovery Candidate',
        reasoning: 'A reference was detected with limited evidence. No authoritative source confirms that a corresponding Engineering Work Order previously existed. Product Owner review or further evidence is required before recovery can be justified.',
        summary: 'Reference detected with limited evidence. Recovery not justified.',
        poReviewRequired: true,
      };
    }
    if (parentChildClassification === 'PARENT_EVIDENCE_ONLY') {
      return {
        type: 'engineering_investigation_required',
        action: 'Engineering Investigation Required',
        reasoning: 'Evidence exists for the expected parent but no governed authority satisfies lineage. Further investigation is needed to determine whether the evidence is sufficient to establish a Historical Reference or whether the parent should be created. Product Owner review is required.',
        summary: 'Evidence exists but no governed authority. Investigation needed.',
        poReviewRequired: true,
      };
    }
    if (parentChildClassification === 'PARENT_AUTHORITY_CONFLICT') {
      return {
        type: 'unsafe_to_repair',
        action: 'Unsafe to Repair — Product Owner Review Required',
        reasoning: 'Multiple authoritative records conflict about the expected parent reference. Automatic repair is unsafe because it is unclear which authority should prevail. Product Owner must review the conflicting evidence and determine the correct canonical reference.',
        summary: 'Conflicting authorities. Automatic repair is unsafe.',
        poReviewRequired: true,
      };
    }
  }

  // EWO-014.19A.7SR.6R.3: Conflict-based recommendations are only evaluated
  // for non-parent-child domains. For parent-child alerts, conflicts are
  // preserved as secondary findings and never override the lineage decision.
  if (conflicts.length > 0 && primaryDomain !== 'parent_child_lineage') {
    const titleConflict = conflicts.find(c => c.conflicting_field === 'title');
    if (titleConflict) {
      if (titleConflict.canonical_candidate) {
        return {
          type: 'synchronise_metadata',
          action: 'Synchronise Metadata to Canonical Title',
          reasoning: `Title conflict detected. Canonical Work Order title "${titleConflict.canonical_candidate}" has Product Owner approval. Other sources predate the canonical title refinement. Recommendation: synchronise metadata across sources to match the canonical title. ${titleConflict.canonical_reason ?? ''}`,
          summary: 'Title conflict. Synchronise to canonical Work Order title.',
          poReviewRequired: false,
        };
      }
      return {
        type: 'po_review_required',
        action: 'Product Owner Review Required',
        reasoning: 'Title conflict detected but no canonical candidate can be safely determined. Multiple sources have different titles with no clear authoritative source. Product Owner must determine the correct canonical title.',
        summary: 'Title conflict with no safe canonical. PO review required.',
        poReviewRequired: true,
      };
    }
    if (conflicts.some(c => c.conflicting_field === 'status')) {
      return {
        type: 'po_review_required',
        action: 'Product Owner Review Required',
        reasoning: 'Status conflict detected across sources. Different lifecycle statuses may indicate a state synchronisation issue. Product Owner must determine which status is correct.',
        summary: 'Status conflict. PO review required.',
        poReviewRequired: true,
      };
    }
  }
  if (alert.alert_type === 'missing_ewo') {
    if (existence?.authoritative_status === 'HISTORICALLY_SATISFIED') {
      return {
        type: 'accept_historical_reference',
        action: 'Accept Historical Reference',
        reasoning: 'The reference is not genuinely missing — a governed Historical Reference authoritatively represents it. The reference was intentionally not issued as a canonical Work Order. No repair is needed. The alert should be resolved as historically satisfied.',
        summary: 'Reference is historically satisfied, not genuinely missing.',
        poReviewRequired: false,
      };
    }
    // BUG-006R.3: Do not recommend recovery solely because the reference
    // exists without a canonical Work Order. Check for positive evidence.
    const hasPositiveEvidence = evidenceItems.length > 0 && evidenceItems.some(e => e.confidence > 0.3);
    if (!hasPositiveEvidence) {
      return {
        type: 'unverified_reference_recovery_candidate',
        action: 'Unverified Reference Recovery Candidate',
        reasoning: 'A reference was detected, but no authoritative evidence confirms that a corresponding Engineering Work Order previously existed. Product Owner review or further evidence is required before recovery can be justified.',
        summary: 'Reference detected. No evidence confirms the object existed. Recovery not justified.',
        poReviewRequired: true,
      };
    }
    return {
      type: 'begin_historical_recovery',
      action: 'Begin Historical Recovery',
      reasoning: 'Positive evidence was found in authoritative sources. Historical recovery should be initiated to determine whether the reference was intentionally omitted, superseded, or should be reconstructed.',
      summary: 'Positive evidence found. Historical recovery may be justified.',
      poReviewRequired: true,
    };
  }

  // Duplicate EWO alerts
  if (alert.alert_type === 'duplicate_ewo') {
    return {
      type: 'resolve_duplicate',
      action: 'Resolve Duplicate Work Order',
      reasoning: 'Multiple canonical Work Orders exist with the same reference. Product Owner must determine which Work Order is canonical and which should be archived or superseded. Automatic repair is unsafe because it requires a governance decision.',
      summary: 'Duplicate Work Orders detected. PO review required to resolve.',
      poReviewRequired: true,
    };
  }

  // Default: no action required
  return {
    type: 'no_action_required',
    action: 'No Action Required',
    reasoning: 'No integrity issue detected that requires engineering action.',
    summary: 'No action required.',
    poReviewRequired: false,
  };
}

// ─── Domain-Valid Re-Evaluation (EWO-014.19A.7SR.6R.3) ────────────────────────
// When the initial recommendation is cross-domain, this function re-evaluates
// using only domain-valid recommendations.

function determineDomainValidRecommendation(
  alert: IntegrityAlert,
  parentChildClassification: string,
  existence: ExistenceResolution | null,
  evidenceItems: EvidenceItem[],
  primaryDomain: IntegrityDomain,
): {
  type: RecommendationType;
  action: string;
  reasoning: string;
  summary: string;
  poReviewRequired: boolean;
} {
  const alertAny = alert as unknown as Record<string, unknown>;
  const hasHistoricalRef = (alertAny.authoritative_source_type as string) === 'historical_reference';
  const hasGoverningEvidence = !!(alertAny.governing_evidence as string);
  const hasAuditConclusion = !!(alertAny.audit_conclusion as string);

  if (parentChildClassification === 'PARENT_GENUINELY_MISSING') {
    const hasPositiveEvidence = evidenceItems.length > 0 && evidenceItems.some(e => e.confidence > 0.3);
    if (!hasHistoricalRef && !hasGoverningEvidence && !hasAuditConclusion && !hasPositiveEvidence) {
      return {
        type: 'unverified_reference_recovery_candidate',
        action: 'Unverified Reference Recovery Candidate',
        reasoning: 'A reference was detected, but no authoritative evidence confirms that a corresponding Engineering Work Order previously existed. Product Owner review or further evidence is required before recovery can be justified.',
        summary: 'Reference detected. No evidence confirms the object existed. Recovery not justified.',
        poReviewRequired: true,
      };
    }
    return {
      type: 'begin_historical_recovery',
      action: 'Begin Historical Recovery',
      reasoning: 'Positive evidence was found in authoritative sources. Historical recovery should be initiated to determine whether the parent should be reconstructed.',
      summary: 'Positive evidence found. Historical recovery may be justified.',
      poReviewRequired: true,
    };
  }

  if (parentChildClassification === 'HISTORICAL_PARENT_SATISFIED') {
    return {
      type: 'accept_historical_reference',
      action: 'Accept Historical Reference',
      reasoning: 'Historical Reference authoritatively satisfies lineage. The parent is governed and lineage is satisfied.',
      summary: 'Historical parent satisfied. Accept historical reference.',
      poReviewRequired: false,
    };
  }

  if (parentChildClassification === 'CANONICAL_PARENT_SATISFIED') {
    return {
      type: 'no_action_required',
      action: 'No Action Required',
      reasoning: 'Canonical parent Work Order exists and lineage is correctly recorded.',
      summary: 'Canonical parent verified. No action required.',
      poReviewRequired: false,
    };
  }

  if (parentChildClassification === 'RELATIONSHIP_FIELD_INCOMPLETE' || parentChildClassification === 'PARENT_REFERENCE_MISMATCH') {
    return {
      type: 'repair_relationship',
      action: 'Resolve Parent Linkage',
      reasoning: 'Parent exists but the child is missing or has an incorrect relationship link. The field can be safely populated.',
      summary: 'Parent exists. Resolve parent linkage.',
      poReviewRequired: false,
    };
  }

  if (parentChildClassification === 'PARENT_AUTHORITY_CONFLICT' || parentChildClassification === 'PARENT_EVIDENCE_ONLY') {
    return {
      type: 'po_review_required',
      action: 'Route to Product Owner',
      reasoning: 'Conflicting or ambiguous parent evidence. Product Owner governance is required to resolve the lineage.',
      summary: 'Parent evidence ambiguous. Route to Product Owner.',
      poReviewRequired: true,
    };
  }

  return {
    type: 'po_review_required',
    action: 'Route to Product Owner',
    reasoning: 'Unable to determine a domain-valid recommendation automatically. Product Owner review is required.',
    summary: 'Unable to determine recommendation. Route to Product Owner.',
    poReviewRequired: true,
  };
}

// ─── Confidence Calculation ─────────────────────────────────────────────────

// ─── BUG-006R.3: Separated Confidence Model ────────────────────────────────────

function calculateReferenceClassificationConfidence(alert: IntegrityAlert): number {
  const ref = alert.normalised_reference ?? '';
  if (!ref) return 0;
  if (/^EWO-\d{3}/i.test(ref)) return 0.95;
  if (/^EWO-\d{3}[A-Z]/i.test(ref)) return 0.9;
  if (/^AMD-\d{3}/i.test(ref)) return 0.9;
  if (/^ES\d{3}/i.test(ref)) return 0.85;
  if (/^BUG/i.test(ref)) return 0.8;
  return 0.5;
}

function calculateDecisionConfidence(
  type: RecommendationType,
  evidenceConfidence: number,
  recommendationConfidence: number,
  evidenceItems: EvidenceItem[],
): number {
  if (type === 'unverified_reference_recovery_candidate') {
    return Math.min(0.15, evidenceConfidence);
  }
  if (type === 'begin_historical_recovery') {
    return Math.min(recommendationConfidence, Math.max(evidenceConfidence, 0.3));
  }
  return recommendationConfidence;
}

function assessRecoveryJustification(
  type: RecommendationType,
  evidenceItems: EvidenceItem[],
  existence: ExistenceResolution | null,
): { recoveryJustification: 'justified' | 'not_justified' | 'blocked_pending_evidence' | 'blocked_pending_po_decision'; recoveryJustificationReason: string } {
  if (type === 'unverified_reference_recovery_candidate') {
    return {
      recoveryJustification: 'blocked_pending_evidence',
      recoveryJustificationReason: 'A reference was detected, but no authoritative evidence confirms that a corresponding Engineering Work Order previously existed. Recovery is not justified without positive evidence. Product Owner review or further evidence is required.',
    };
  }
  if (type === 'begin_historical_recovery') {
    const hasPositiveEvidence = evidenceItems.length > 0 && evidenceItems.some(e => e.confidence > 0.3);
    if (!hasPositiveEvidence) {
      return {
        recoveryJustification: 'blocked_pending_evidence',
        recoveryJustificationReason: 'Recovery was considered but no positive evidence supports it. Recovery is not justified without positive evidence.',
      };
    }
    return {
      recoveryJustification: 'blocked_pending_po_decision',
      recoveryJustificationReason: 'Positive evidence was found. Recovery may be justified but requires Product Owner authorisation before proceeding.',
    };
  }
  if (type === 'accept_historical_reference' || type === 'accept_historical_root' || type === 'no_action_required') {
    return {
      recoveryJustification: 'not_justified',
      recoveryJustificationReason: 'Recovery is not required. The engineering record is governed and correct, or a Historical Reference authoritatively satisfies the lineage.',
    };
  }
  return {
    recoveryJustification: 'not_justified',
    recoveryJustificationReason: 'No recovery action is recommended.',
  };
}

function determineInvestigationStage(
  type: RecommendationType,
  evidenceItems: EvidenceItem[],
  existence: ExistenceResolution | null,
): 'reference_detected' | 'evidence_investigation' | 'governed_decision' {
  if (type === 'unverified_reference_recovery_candidate') {
    if (evidenceItems.length === 0) return 'reference_detected';
    return 'evidence_investigation';
  }
  if (type === 'begin_historical_recovery' || type === 'engineering_investigation_required') {
    return 'evidence_investigation';
  }
  return 'governed_decision';
}

function calculateEvidenceConfidence(
  evidenceItems: EvidenceItem[],
  existence: ExistenceResolution | null,
): number {
  if (evidenceItems.length === 0 && existence) {
    return existence.confidence;
  }
  if (evidenceItems.length === 0) return 0;
  const maxConfidence = Math.max(...evidenceItems.map(e => e.confidence));
  const existenceConfidence = existence?.confidence ?? 0;
  return Math.max(maxConfidence, existenceConfidence);
}

function calculateRecommendanceConfidence(
  type: RecommendationType,
  evidenceConfidence: number,
  conflicts: ConflictDetail[],
  existence: ExistenceResolution | null,
): number {
  // Start with evidence confidence as base
  let confidence = evidenceConfidence;

  // Reduce confidence if conflicts exist
  if (conflicts.length > 0) {
    confidence -= conflicts.length * 0.1;
  }

  // Reduce confidence if existence is uncertain
  if (existence?.authoritative_status === 'GENUINELY_MISSING') {
    confidence = Math.min(confidence, 0.3);
  }

  // Boost confidence for clear-cut recommendations
  if (type === 'accept_historical_reference' || type === 'no_action_required') {
    confidence = Math.max(confidence, 0.95);
  }
  if (type === 'unsafe_to_repair' || type === 'po_review_required') {
    confidence = Math.min(confidence, 0.5);
  }

  return Math.max(0, Math.min(1, confidence));
}

function calculateRepairConfidence(
  type: RecommendationType,
  conflicts: ConflictDetail[],
  existence: ExistenceResolution | null,
): number {
  // Repair confidence is about whether the repair itself will succeed
  if (type === 'no_action_required' || type === 'accept_historical_reference' || type === 'accept_historical_root') {
    return 1.0; // No repair needed, so "repair" (no-op) is 100% safe
  }
  if (type === 'repair_relationship') {
    return 0.99; // Metadata field update is highly reliable
  }
  if (type === 'synchronise_metadata') {
    return 0.95; // Metadata sync is reliable but involves multiple records
  }
  if (type === 'unsafe_to_repair' || type === 'po_review_required') {
    return 0.0; // Repair is unsafe or blocked
  }
  if (type === 'begin_historical_recovery' || type === 'engineering_investigation_required' || type === 'unverified_reference_recovery_candidate') {
    return 0.3; // Recovery outcome is uncertain
  }
  if (conflicts.length > 0) {
    return 0.2; // Conflicts reduce repair confidence
  }
  return 0.5;
}

// ─── Risk Assessment ─────────────────────────────────────────────────────────

function calculateRisk(
  type: RecommendationType,
  conflicts: ConflictDetail[],
  existence: ExistenceResolution | null,
  alert: IntegrityAlert,
): { riskLevel: RiskLevel; riskReason: string } {
  if (type === 'unsafe_to_repair') {
    return {
      riskLevel: 'high',
      riskReason: 'Conflicting canonical objects. Potential governance breach if repaired incorrectly.',
    };
  }
  if (type === 'resolve_duplicate') {
    return {
      riskLevel: 'high',
      riskReason: 'Duplicate canonical objects. Incorrect resolution may cause data loss or audit history loss.',
    };
  }
  if (type === 'begin_historical_recovery') {
    return {
      riskLevel: 'medium',
      riskReason: 'Historical recovery involves reconstructing missing engineering history. Outcome is uncertain.',
    };
  }
  if (type === 'unverified_reference_recovery_candidate') {
    return {
      riskLevel: 'low',
      riskReason: 'No recovery action is recommended. The reference is unverified. Product Owner review or further evidence is required.',
    };
  }
  if (type === 'engineering_investigation_required') {
    return {
      riskLevel: 'medium',
      riskReason: 'Evidence is insufficient for automatic resolution. Manual investigation may reveal additional complexity.',
    };
  }
  if (type === 'po_review_required') {
    return {
      riskLevel: 'medium',
      riskReason: 'Multiple authoritative records disagree. Product Owner decision required to resolve safely.',
    };
  }
  if (conflicts.length > 0 && type === 'synchronise_metadata') {
    return {
      riskLevel: 'low',
      riskReason: 'Metadata inconsistency only. Canonical value is determined. Synchronisation is safe.',
    };
  }
  if (type === 'repair_relationship') {
    return {
      riskLevel: 'low',
      riskReason: 'Relationship field update only. No structural change to engineering objects.',
    };
  }
  if (type === 'accept_historical_reference' || type === 'accept_historical_root' || type === 'no_action_required') {
    return {
      riskLevel: 'low',
      riskReason: 'No repair required. Existing state is governed and correct.',
    };
  }
  return {
    riskLevel: 'low',
    riskReason: 'No significant engineering risk identified.',
  };
}

// ─── Automatic Repair Suitability ───────────────────────────────────────────

function determineAutoRepairSuitability(
  type: RecommendationType,
  riskLevel: RiskLevel,
  poReviewRequired: boolean,
  conflicts: ConflictDetail[],
): { autoRepairSuitability: AutoRepairSuitability; autoRepairReason: string } {
  if (type === 'unsafe_to_repair') {
    return {
      autoRepairSuitability: 'unsafe',
      autoRepairReason: 'Conflicting authorities make automatic repair unsafe. Product Owner decision required.',
    };
  }
  if (poReviewRequired) {
    return {
      autoRepairSuitability: 'blocked',
      autoRepairReason: 'Product Owner decision required before repair can proceed.',
    };
  }
  if (type === 'no_action_required' || type === 'accept_historical_reference' || type === 'accept_historical_root') {
    return {
      autoRepairSuitability: 'safe',
      autoRepairReason: 'No repair needed. Existing state is correct and governed.',
    };
  }
  if (type === 'repair_relationship') {
    return {
      autoRepairSuitability: 'recommended',
      autoRepairReason: 'Metadata field update only. No loss of audit history. Repair is safe and recommended.',
    };
  }
  if (type === 'synchronise_metadata') {
    return {
      autoRepairSuitability: 'recommended',
      autoRepairReason: 'Metadata synchronisation only. No loss of audit history. Canonical value is determined.',
    };
  }
  if (riskLevel === 'high') {
    return {
      autoRepairSuitability: 'unsafe',
      autoRepairReason: 'High risk detected. Automatic repair is unsafe.',
    };
  }
  return {
    autoRepairSuitability: 'possible',
    autoRepairReason: 'Repair is possible but requires validation before execution.',
  };
}

// ─── Expected Impact ─────────────────────────────────────────────────────────

function determineExpectedImpact(
  type: RecommendationType,
  conflicts: ConflictDetail[],
): string {
  switch (type) {
    case 'synchronise_metadata':
      return 'Metadata across multiple sources will be updated to match the canonical value. No structural changes to engineering objects.';
    case 'repair_relationship':
      return 'The parent_ref field on the child Work Order will be updated. No other fields are affected.';
    case 'accept_historical_reference':
      return 'The alert will be resolved as historically satisfied. No engineering objects will be modified.';
    case 'accept_historical_root':
      return 'The alert will be resolved as a historical root. No parent was ever issued. No engineering objects will be modified.';
    case 'resolve_duplicate':
      return 'One Work Order will be designated canonical. The duplicate may be archived or superseded. Audit history is preserved.';
    case 'archive_superseded_record':
      return 'The superseded record will be marked as archived. No data will be deleted.';
    case 'begin_historical_recovery':
      return 'A historical recovery process will be initiated. New Historical Reference records may be created. Existing data is not modified.';
    case 'unverified_reference_recovery_candidate':
      return 'No engineering objects will be created or modified. The alert remains open for Product Owner review or further evidence gathering.';
    case 'no_action_required':
      return 'No changes will be made. The investigation will be closed.';
    case 'po_review_required':
      return 'No automatic changes. Product Owner will determine the appropriate action.';
    case 'unsafe_to_repair':
      return 'No automatic changes. Product Owner must resolve the conflict manually.';
    default:
      return 'Impact assessment requires further investigation.';
  }
}

// ─── Alternative Actions ─────────────────────────────────────────────────────

function buildAlternativeActions(
  type: RecommendationType,
  conflicts: ConflictDetail[],
  existence: ExistenceResolution | null,
  evidenceItems: EvidenceItem[],
): AlternativeAction[] {
  const alternatives: AlternativeAction[] = [];

  if (type === 'synchronise_metadata') {
    alternatives.push({
      action: 'Accept Existing Non-Canonical Title',
      tradeoffs: 'Avoids metadata changes but leaves inconsistency across sources',
      risk_comparison: 'Lower repair risk but higher long-term integrity risk',
      governance_implications: 'May require future reconciliation to resolve the inconsistency',
      confidence: 0.4,
    });
    alternatives.push({
      action: 'Mark Historical Title Preserved',
      tradeoffs: 'Preserves the historical record without synchronising',
      risk_comparison: 'No repair risk but does not resolve the conflict',
      governance_implications: 'Historical record is preserved but conflict remains open',
      confidence: 0.3,
    });
  }

  if (type === 'repair_relationship') {
    alternatives.push({
      action: 'Defer Repair',
      tradeoffs: 'No immediate change but relationship remains incomplete',
      risk_comparison: 'No repair risk but integrity alert remains open',
      governance_implications: 'Alert will reappear on next reconciliation',
      confidence: 0.2,
    });
  }

  if (type === 'begin_historical_recovery' || type === 'unverified_reference_recovery_candidate') {
    alternatives.push({
      action: 'Request More Evidence',
      tradeoffs: 'Defers decision until more evidence is available',
      risk_comparison: 'No repair risk but integrity alert remains open',
      governance_implications: 'Alert will reappear on each reconciliation cycle until evidence is found',
      confidence: 0.2,
    });
    alternatives.push({
      action: 'Accept Permanent Gap',
      tradeoffs: 'Acknowledges the reference may never have existed',
      risk_comparison: 'No repair risk — closes the alert as a permanent gap',
      governance_implications: 'Requires Product Owner approval to accept a permanent gap',
      confidence: 0.15,
    });
    alternatives.push({
      action: 'Defer and Monitor',
      tradeoffs: 'No action taken — alert remains open for future investigation',
      risk_comparison: 'No repair risk but integrity issue persists',
      governance_implications: 'Alert will reappear on each reconciliation cycle',
      confidence: 0.15,
    });
  }

  if (type === 'begin_historical_recovery') {
    alternatives.push({
      action: 'Create Missing Parent Work Order',
      tradeoffs: 'Creates a new canonical Work Order but may not reflect engineering intent',
      risk_comparison: 'Higher risk — may create a Work Order that was intentionally never issued',
      governance_implications: 'Requires Product Owner authorisation and may violate historical engineering decisions',
      confidence: 0.1,
    });
  }

  if (type === 'accept_historical_reference') {
    alternatives.push({
      action: 'Create Canonical Work Order',
      tradeoffs: 'Creates an executable Work Order but contradicts the historical decision not to issue one',
      risk_comparison: 'Higher risk — overrides governed historical decision',
      governance_implications: 'Violates the Historical Reference governance model',
      confidence: 0.05,
    });
  }

  if (type === 'accept_historical_root') {
    alternatives.push({
      action: 'Create Missing Parent Work Order',
      tradeoffs: 'Creates a new canonical Work Order but contradicts the conclusion that no parent was ever issued',
      risk_comparison: 'Higher risk — may create a Work Order that was intentionally never issued',
      governance_implications: 'Requires Product Owner authorisation and may violate historical engineering decisions',
      confidence: 0.05,
    });
    alternatives.push({
      action: 'Defer and Monitor',
      tradeoffs: 'No action taken — alert remains open for future investigation',
      risk_comparison: 'No repair risk but integrity issue persists',
      governance_implications: 'Alert will reappear on each reconciliation cycle',
      confidence: 0.1,
    });
  }

  if (type === 'unsafe_to_repair') {
    alternatives.push({
      action: 'Defer Until Investigation Complete',
      tradeoffs: 'No action until further evidence is gathered',
      risk_comparison: 'No repair risk but conflict remains unresolved',
      governance_implications: 'Alert remains open and may block downstream processes',
      confidence: 0.2,
    });
  }

  return alternatives;
}

// ─── Known Limitations ───────────────────────────────────────────────────────

function buildKnownLimitations(
  type: RecommendationType,
  existence: ExistenceResolution | null,
  conflicts: ConflictDetail[],
): string[] {
  const limitations: string[] = [];

  if (conflicts.length === 0 && existence?.authoritative_status === 'GENUINELY_MISSING') {
    limitations.push('No evidence sources were found. Recommendation is based on absence of data.');
  }
  if (conflicts.length > 2) {
    limitations.push('Multiple conflicts detected. Recommendation addresses the primary conflict only.');
  }
  if (existence?.limitations && existence.limitations.length > 0) {
    limitations.push(...existence.limitations);
  }
  if (type === 'synchronise_metadata') {
    limitations.push('Metadata synchronisation does not resolve structural conflicts. Only field values are updated.');
  }
  if (type === 'begin_historical_recovery' || type === 'unverified_reference_recovery_candidate') {
    limitations.push('No positive evidence confirms the Engineering object previously existed. Recovery is not justified without further evidence.');
  }
  if (type === 'accept_historical_reference') {
    limitations.push('Historical References are non-executable. This recommendation does not create an executable Work Order.');
  }
  if (type === 'accept_historical_root') {
    limitations.push('Acceptance of a historical root is a governed decision. No parent Work Order will be created.');
  }

  return limitations;
}

// ─── PO Decision Options ─────────────────────────────────────────────────────

function buildPODecisionOptions(
  type: RecommendationType,
  poReviewRequired: boolean,
  riskLevel: RiskLevel,
): PODecision[] {
  if (!poReviewRequired) {
    return ['approve'];
  }

  const options: PODecision[] = ['approve', 'reject', 'modify', 'defer'];

  if (riskLevel === 'high' || type === 'unsafe_to_repair') {
    options.push('request_further_investigation');
    options.push('no_safe_action');
  } else if (riskLevel === 'medium') {
    options.push('request_further_investigation');
  }

  return options;
}

// ─── Recommendation Persistence ──────────────────────────────────────────────

export async function persistRecommendation(
  recommendation: EngineeringRecommendation,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('engineering_recommendations')
      .insert({
        recommendation_ref: recommendation.recommendation_ref,
        alert_id: recommendation.alert_id,
        ewo_ref: recommendation.ewo_ref,
        recommendation_type: recommendation.recommendation_type,
        recommended_action: recommendation.recommended_action,
        engineering_reasoning: recommendation.engineering_reasoning,
        summary: recommendation.summary,
        evidence_confidence: recommendation.evidence_confidence,
        recommendation_confidence: recommendation.recommendation_confidence,
        repair_confidence: recommendation.repair_confidence,
        risk_level: recommendation.risk_level,
        risk_reason: recommendation.risk_reason,
        auto_repair_suitability: recommendation.auto_repair_suitability,
        auto_repair_reason: recommendation.auto_repair_reason,
        po_review_required: recommendation.po_review_required,
        expected_impact: recommendation.expected_impact,
        alternative_actions: recommendation.alternative_actions,
        known_limitations: recommendation.known_limitations,
        evidence_used: recommendation.evidence_used,
      });

    return !error;
  } catch {
    return false;
  }
}

export async function recordPODecision(
  recommendationRef: string,
  decision: PODecision,
  notes: string,
  decidedBy: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('engineering_recommendations')
      .update({
        po_decision: decision,
        po_decision_notes: notes,
        po_decided_at: new Date().toISOString(),
        po_decided_by: decidedBy,
        updated_at: new Date().toISOString(),
      })
      .eq('recommendation_ref', recommendationRef);

    return !error;
  } catch {
    return false;
  }
}

// ─── Recommendation Diagnostics ──────────────────────────────────────────────

export function buildRecommendationDiagnostics(
  recommendations: EngineeringRecommendation[],
): RecommendationDiagnostics {
  return {
    recommendations_generated: recommendations.length,
    automatic_repairs_recommended: recommendations.filter(
      r => r.auto_repair_suitability === 'recommended' || r.auto_repair_suitability === 'safe',
    ).length,
    po_reviews_required: recommendations.filter(r => r.po_review_required).length,
    unsafe_repairs: recommendations.filter(r => r.auto_repair_suitability === 'unsafe').length,
    alternative_recommendations: recommendations.reduce(
      (sum, r) => sum + r.alternative_actions.length, 0,
    ),
    recommendation_confidence: recommendations.length > 0
      ? recommendations.reduce((sum, r) => sum + r.recommendation_confidence, 0) / recommendations.length
      : 0,
  };
}
