// EWO-021 — Engineering Intelligence Authority Engine
//
// The authoritative engineering reasoning layer for EIOS.
// Produces a single governed, evidence-based engineering decision per
// investigation. Decisions evolve as new evidence arrives. Downstream UI
// renders decisions from this service — never calculates its own.
//
// Architecture supports future autonomous engineering consumption.

import { supabase } from './supabase';
import type { IntegrityAlert } from './engineeringIntegrityService';
import type { EvidencePackage, EvidenceItem } from './evidencePackageService';
import type { EngineeringRecommendation, RecommendationType } from './engineeringRecommendationEngine';
import { determinePrimaryDomain, isRecommendationValidForDomain, DOMAIN_LABELS, type IntegrityDomain } from './integrityDomainModel';
import { recordChangeLogEvent, type ChangeLogEntry, type LinkedArtefact } from './engineeringChangeLogService';

// ─── Decision Types ──────────────────────────────────────────────────────────

export type DecisionType =
  | 'create_engineering_work_order'
  | 'create_refinement'
  | 'historical_reference_accepted'
  | 'no_action_required'
  | 'await_further_evidence'
  | 'product_owner_decision_required'
  | 'duplicate_existing_engineering'
  | 'canonical_object_missing'
  | 'data_inconsistency'
  | 'investigation_incomplete'
  | 'unverified_reference_recovery_candidate';

export const DECISION_LABELS: Record<DecisionType, string> = {
  create_engineering_work_order: 'Create Engineering Work Order',
  create_refinement: 'Create Refinement',
  historical_reference_accepted: 'Historical Reference Accepted',
  no_action_required: 'No Action Required',
  await_further_evidence: 'Await Further Evidence',
  product_owner_decision_required: 'Product Owner Decision Required',
  duplicate_existing_engineering: 'Duplicate Existing Engineering',
  canonical_object_missing: 'Canonical Object Missing',
  data_inconsistency: 'Data Inconsistency',
  investigation_incomplete: 'Investigation Incomplete',
  unverified_reference_recovery_candidate: 'Unverified Reference Recovery Candidate',
};

// ─── Relationship Types ──────────────────────────────────────────────────────

export type AlertRelationshipType =
  | 'root_issue'
  | 'parent_alert'
  | 'child_alert'
  | 'duplicate_alert'
  | 'derived_symptom'
  | 'independent_issue';

export const RELATIONSHIP_LABELS: Record<AlertRelationshipType, string> = {
  root_issue: 'Root Issue',
  parent_alert: 'Parent Alert',
  child_alert: 'Child Alert',
  duplicate_alert: 'Duplicate Alert',
  derived_symptom: 'Derived Symptom',
  independent_issue: 'Independent Issue',
};

// ─── Decision Model ──────────────────────────────────────────────────────────

export interface AlternativesRejected {
  decision_type: DecisionType;
  reason: string;
}

export interface EngineeringDecision {
  id: string;
  alert_id: string;
  ewo_ref: string;
  decision_type: DecisionType;
  decision_title: string;
  executive_summary: string;
  decision_reasoning: string;
  evidence_used: EvidenceItem[];
  confidence: number;
  confidence_explanation: string;
  alternatives_rejected: AlternativesRejected[];
  recommended_next_action: string;
  primary_integrity_domain: IntegrityDomain;
  parent_alert_id: string | null;
  relationship_type: AlertRelationshipType;
  resolution_status: 'open' | 'evolved' | 'resolved' | 'superseded';
  superseded_by: string | null;
  decision_version: number;
  po_decision: string | null;
  po_decision_actor: string | null;
  po_decision_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Timeline Model ──────────────────────────────────────────────────────────

export type TimelineEventType =
  | 'initial_decision'
  | 'evidence_update'
  | 'decision_revision'
  | 'resolution'
  | 'po_decision'
  | 'final_outcome';

export interface DecisionTimelineEvent {
  id: string;
  decision_id: string;
  alert_id: string;
  event_type: TimelineEventType;
  event_summary: string;
  event_details: Record<string, unknown>;
  previous_decision_type: DecisionType | null;
  new_decision_type: DecisionType | null;
  previous_confidence: number | null;
  new_confidence: number | null;
  change_log_ref: string | null;
  actor_type: 'human' | 'ai' | 'system';
  actor: string;
  created_at: string;
}

// ─── Parent/Child Analysis ────────────────────────────────────────────────────

export interface AlertRelationship {
  alert_id: string;
  ewo_ref: string;
  relationship_type: AlertRelationshipType;
  parent_alert_id: string | null;
  reasoning: string;
}

export function analyzeAlertRelationships(
  primaryAlert: IntegrityAlert,
  allAlerts: IntegrityAlert[],
): AlertRelationship[] {
  const relationships: AlertRelationship[] = [];
  const primaryRef = primaryAlert.normalised_reference ?? '';

  for (const alert of allAlerts) {
    if (alert.id === primaryAlert.id) {
      relationships.push({
        alert_id: alert.id,
        ewo_ref: alert.normalised_reference ?? '',
        relationship_type: 'root_issue',
        parent_alert_id: null,
        reasoning: 'This is the primary alert under investigation.',
      });
      continue;
    }

    const alertRef = alert.normalised_reference ?? '';
    const alertAny = alert as unknown as Record<string, unknown>;
    const primaryAny = primaryAlert as unknown as Record<string, unknown>;

    // Check for duplicate reference
    if (alertRef === primaryRef && alert.alert_type === primaryAlert.alert_type) {
      relationships.push({
        alert_id: alert.id,
        ewo_ref: alertRef,
        relationship_type: 'duplicate_alert',
        parent_alert_id: primaryAlert.id,
        reasoning: `Duplicate alert for the same reference ${alertRef}. Recommendation suppressed — parent alert governs resolution.`,
      });
      continue;
    }

    // Check for parent-child relationship via expected_parent
    const primaryEvidence = primaryAny.evidence as Record<string, unknown> | undefined;
    const expectedParent = primaryEvidence?.expected_parent as string | undefined;

    if (expectedParent && alertRef === expectedParent) {
      relationships.push({
        alert_id: alert.id,
        ewo_ref: alertRef,
        relationship_type: 'parent_alert',
        parent_alert_id: null,
        reasoning: `This alert concerns the expected parent ${expectedParent} of the primary alert.`,
      });
      continue;
    }

    // Check if this alert's expected parent is the primary alert's reference
    const alertEvidence = alertAny.evidence as Record<string, unknown> | undefined;
    const alertExpectedParent = alertEvidence?.expected_parent as string | undefined;

    if (alertExpectedParent && alertExpectedParent === primaryRef) {
      relationships.push({
        alert_id: alert.id,
        ewo_ref: alertRef,
        relationship_type: 'child_alert',
        parent_alert_id: primaryAlert.id,
        reasoning: `This alert's expected parent is ${primaryRef}. It is a downstream symptom of the primary alert.`,
      });
      continue;
    }

    // Check for derived symptom — same domain, different reference
    const primaryDomain = determinePrimaryDomain(primaryAlert);
    const alertDomain = determinePrimaryDomain(alert);
    if (primaryDomain === alertDomain && primaryDomain !== 'other_governed_integrity_domain') {
      relationships.push({
        alert_id: alert.id,
        ewo_ref: alertRef,
        relationship_type: 'derived_symptom',
        parent_alert_id: primaryAlert.id,
        reasoning: `Same integrity domain (${DOMAIN_LABELS[primaryDomain]}). Likely a derived symptom of the primary alert.`,
      });
      continue;
    }

    relationships.push({
      alert_id: alert.id,
      ewo_ref: alertRef,
      relationship_type: 'independent_issue',
      parent_alert_id: null,
      reasoning: 'No relationship detected to the primary alert.',
    });
  }

  return relationships;
}

// ─── Decision Generation ─────────────────────────────────────────────────────

function mapRecommendationToDecision(
  type: RecommendationType,
  alert: IntegrityAlert,
  recommendation: EngineeringRecommendation,
): { decisionType: DecisionType; title: string; reasoning: string } {
  const alertAny = alert as unknown as Record<string, unknown>;
  const parentChildClassification = (alertAny.parent_child_classification as string) ?? '';

  switch (type) {
    case 'accept_historical_reference':
      return {
        decisionType: 'historical_reference_accepted',
        title: 'Historical Reference Accepted',
        reasoning: 'A governed Historical Reference authoritatively satisfies the engineering lineage. No further action is required.',
      };
    case 'accept_historical_root':
      return {
        decisionType: 'historical_reference_accepted',
        title: 'Historical Root Accepted',
        reasoning: 'No authoritative parent can be established from any source. The child is accepted as the earliest governed lineage point.',
      };
    case 'no_action_required':
      return {
        decisionType: 'no_action_required',
        title: 'No Action Required',
        reasoning: 'The engineering record is governed and correct. No integrity issue remains.',
      };
    case 'begin_historical_recovery':
      return {
        decisionType: 'canonical_object_missing',
        title: 'Canonical Object Missing — Recovery May Be Justified',
        reasoning: 'Positive evidence was found in authoritative sources. Historical recovery should be initiated to determine whether the object should be reconstructed. Product Owner authorisation is required.',
      };
    case 'unverified_reference_recovery_candidate':
      return {
        decisionType: 'unverified_reference_recovery_candidate',
        title: 'Unverified Reference Recovery Candidate',
        reasoning: 'A reference was detected, but no authoritative evidence confirms that a corresponding Engineering Work Order previously existed. Recovery is not justified without positive evidence. Product Owner review or further evidence is required before recovery can be justified. The reference may be intentionally omitted, superseded, obsolete, malformed, or belong to a legacy convention.',
      };
    case 'repair_relationship':
      return {
        decisionType: 'data_inconsistency',
        title: 'Data Inconsistency — Resolve Parent Linkage',
        reasoning: 'The parent exists but the child is missing or has an incorrect relationship link. The field can be safely populated.',
      };
    case 'synchronise_metadata':
      return {
        decisionType: 'data_inconsistency',
        title: 'Data Inconsistency — Synchronise Metadata',
        reasoning: 'Metadata conflict detected. Canonical value is determined. Synchronisation is safe.',
      };
    case 'resolve_duplicate':
      return {
        decisionType: 'duplicate_existing_engineering',
        title: 'Duplicate Existing Engineering',
        reasoning: 'Multiple canonical objects exist with the same reference. Product Owner must determine which is canonical.',
      };
    case 'po_review_required':
    case 'unsafe_to_repair':
      return {
        decisionType: 'product_owner_decision_required',
        title: 'Product Owner Decision Required',
        reasoning: 'Conflicting or ambiguous evidence. Product Owner governance is required to resolve safely.',
      };
    case 'engineering_investigation_required':
      return {
        decisionType: 'await_further_evidence',
        title: 'Await Further Evidence',
        reasoning: 'Evidence is insufficient for a definitive decision. Further investigation is needed.',
      };
    default:
      if (parentChildClassification === 'PARENT_GENUINELY_MISSING') {
        return {
          decisionType: 'unverified_reference_recovery_candidate',
          title: 'Unverified Reference Recovery Candidate',
          reasoning: 'The expected parent reference was detected, but no authoritative evidence confirms that a corresponding Engineering Work Order previously existed. Recovery is not justified without positive evidence.',
        };
      }
      return {
        decisionType: 'investigation_incomplete',
        title: 'Investigation Incomplete',
        reasoning: 'The investigation has not reached a definitive conclusion.',
      };
  }
}

function buildAlternativesRejected(
  recommendation: EngineeringRecommendation,
  decisionType: DecisionType,
): AlternativesRejected[] {
  const rejected: AlternativesRejected[] = [];

  for (const finding of recommendation.rejected_cross_domain_recommendations) {
    rejected.push({
      decision_type: 'data_inconsistency',
      reason: `${finding.recommendation_label} rejected: ${finding.rejection_reason}`,
    });
  }

  for (const alt of recommendation.alternative_actions) {
    const altDecisionType: DecisionType = alt.action.includes('Synchronise') ? 'data_inconsistency' : 'product_owner_decision_required';
    if (altDecisionType !== decisionType) {
      rejected.push({
        decision_type: altDecisionType,
        reason: alt.tradeoffs ?? 'Alternative action considered but not selected as primary.',
      });
    }
  }

  return rejected;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generateAuthoritativeDecision(
  alert: IntegrityAlert,
  evidencePackage: EvidencePackage,
  recommendation: EngineeringRecommendation,
  allAlerts: IntegrityAlert[] = [],
): Promise<EngineeringDecision | null> {
  const domain = determinePrimaryDomain(alert);
  const { decisionType, title, reasoning } = mapRecommendationToDecision(
    recommendation.recommendation_type,
    alert,
    recommendation,
  );

  const relationships = analyzeAlertRelationships(alert, allAlerts);
  const primaryRelationship = relationships.find(r => r.alert_id === alert.id);
  const relationshipType = primaryRelationship?.relationship_type ?? 'independent_issue';
  const parentAlertId = relationships.find(r => r.relationship_type === 'parent_alert')?.alert_id ?? null;

  const confidence = recommendation.recommendation_confidence;
  const confidenceExplanation = `Confidence based on ${recommendation.evidence_used.length} evidence items, ${recommendation.evidence_confidence * 100}% evidence confidence, and ${recommendation.repair_confidence * 100}% repair confidence.`;

  const alternativesRejected = buildAlternativesRejected(recommendation, decisionType);

  const executiveSummary = `${DOMAIN_LABELS[domain]}: ${recommendation.summary}`;
  const recommendedNextAction = recommendation.recommended_action;

  const decisionData = {
    alert_id: alert.id,
    ewo_ref: alert.normalised_reference ?? '',
    decision_type: decisionType,
    decision_title: title,
    executive_summary: executiveSummary,
    decision_reasoning: reasoning,
    evidence_used: recommendation.evidence_used,
    confidence,
    confidence_explanation: confidenceExplanation,
    alternatives_rejected: alternativesRejected,
    recommended_next_action: recommendedNextAction,
    primary_integrity_domain: domain,
    parent_alert_id: parentAlertId,
    relationship_type: relationshipType,
    resolution_status: 'open',
    decision_version: 1,
    metadata: {
      recommendation_type: recommendation.recommendation_type,
      risk_level: recommendation.risk_level,
      auto_repair_suitability: recommendation.auto_repair_suitability,
      secondary_findings_count: recommendation.secondary_findings.length,
      domain_match: recommendation.domain_match,
      relationships: relationships.map(r => ({
        alert_id: r.alert_id,
        ewo_ref: r.ewo_ref,
        relationship_type: r.relationship_type,
        reasoning: r.reasoning,
      })),
    },
  };

  try {
    const { data, error } = await supabase
      .from('ecc_engineering_decisions')
      .insert(decisionData)
      .select()
      .single();

    if (error) {
      console.error('[EngineeringDecision] Failed to create decision:', error.message);
      return null;
    }

    const decision = data as unknown as EngineeringDecision;

    await recordTimelineEvent({
      decision_id: decision.id,
      alert_id: alert.id,
      event_type: 'initial_decision',
      event_summary: `Initial decision: ${title}`,
      event_details: {
        decision_type: decisionType,
        confidence,
        evidence_count: recommendation.evidence_used.length,
        primary_integrity_domain: domain,
      },
      new_decision_type: decisionType,
      new_confidence: confidence,
      actor_type: 'system',
      actor: 'Engineering Intelligence Authority Engine',
    });

    await recordChangeLogEvent({
      change_type: 'created',
      object_type: 'other',
      object_ref: alert.normalised_reference,
      ewo_ref: alert.normalised_reference,
      summary: `Engineering Decision created: ${title}`,
      description: executiveSummary,
      actor_type: 'system',
      actor: 'Engineering Intelligence Authority Engine',
      linked_artefacts: [
        { artefact_type: 'engineering_work_order', artefact_ref: alert.normalised_reference ?? '' },
      ] as LinkedArtefact[],
      metadata: {
        decision_id: decision.id,
        decision_type: decisionType,
        confidence,
        primary_integrity_domain: domain,
      },
    });

    return decision;
  } catch (err) {
    console.error('[EngineeringDecision] Exception creating decision:', err);
    return null;
  }
}

// ─── Decision Evolution ──────────────────────────────────────────────────────

export async function evolveDecision(
  existingDecisionId: string,
  alert: IntegrityAlert,
  evidencePackage: EvidencePackage,
  recommendation: EngineeringRecommendation,
): Promise<EngineeringDecision | null> {
  try {
    const { data: existing, error: fetchError } = await supabase
      .from('ecc_engineering_decisions')
      .select('*')
      .eq('id', existingDecisionId)
      .maybeSingle();

    if (fetchError || !existing) {
      console.error('[EngineeringDecision] Cannot evolve — decision not found:', fetchError?.message);
      return null;
    }

    const existingDecision = existing as unknown as EngineeringDecision;
    const { decisionType, title, reasoning } = mapRecommendationToDecision(
      recommendation.recommendation_type,
      alert,
      recommendation,
    );

    const confidenceChanged = Math.abs(existingDecision.confidence - recommendation.recommendation_confidence) > 0.01;
    const decisionChanged = existingDecision.decision_type !== decisionType;

    if (!decisionChanged && !confidenceChanged) {
      return existingDecision;
    }

    // Supersede the old decision
    await supabase
      .from('ecc_engineering_decisions')
      .update({
        resolution_status: 'superseded',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingDecisionId);

    // Create new version
    const newVersion = existingDecision.decision_version + 1;
    const newDecisionData = {
      alert_id: alert.id,
      ewo_ref: alert.normalised_reference ?? '',
      decision_type: decisionType,
      decision_title: title,
      executive_summary: `${DOMAIN_LABELS[determinePrimaryDomain(alert)]}: ${recommendation.summary}`,
      decision_reasoning: reasoning,
      evidence_used: recommendation.evidence_used,
      confidence: recommendation.recommendation_confidence,
      confidence_explanation: `Confidence based on ${recommendation.evidence_used.length} evidence items. Decision evolved from version ${existingDecision.decision_version}.`,
      alternatives_rejected: buildAlternativesRejected(recommendation, decisionType),
      recommended_next_action: recommendation.recommended_action,
      primary_integrity_domain: determinePrimaryDomain(alert),
      parent_alert_id: existingDecision.parent_alert_id,
      relationship_type: existingDecision.relationship_type,
      resolution_status: 'evolved',
      decision_version: newVersion,
      metadata: {
        ...existingDecision.metadata,
        recommendation_type: recommendation.recommendation_type,
        evolved_from: existingDecisionId,
        evolution_reason: decisionChanged ? 'Decision type changed' : 'Confidence changed',
      },
    };

    const { data: newDecision, error: insertError } = await supabase
      .from('ecc_engineering_decisions')
      .insert(newDecisionData)
      .select()
      .single();

    if (insertError || !newDecision) {
      console.error('[EngineeringDecision] Failed to create evolved decision:', insertError?.message);
      return null;
    }

    const evolved = newDecision as unknown as EngineeringDecision;

    // Update old decision's superseded_by
    await supabase
      .from('ecc_engineering_decisions')
      .update({ superseded_by: evolved.id })
      .eq('id', existingDecisionId);

    // Record timeline event
    await recordTimelineEvent({
      decision_id: evolved.id,
      alert_id: alert.id,
      event_type: 'decision_revision',
      event_summary: `Decision evolved: ${existingDecision.decision_title} → ${title}`,
      event_details: {
        previous_decision_type: existingDecision.decision_type,
        new_decision_type: decisionType,
        previous_confidence: existingDecision.confidence,
        new_confidence: recommendation.recommendation_confidence,
        reason: decisionChanged ? 'Decision type changed based on new evidence' : 'Confidence changed based on new evidence',
      },
      previous_decision_type: existingDecision.decision_type,
      new_decision_type: decisionType,
      previous_confidence: existingDecision.confidence,
      new_confidence: recommendation.recommendation_confidence,
      actor_type: 'system',
      actor: 'Engineering Intelligence Authority Engine',
    });

    // Record change log entry
    await recordChangeLogEvent({
      change_type: 'updated',
      object_type: 'other',
      object_ref: alert.normalised_reference,
      ewo_ref: alert.normalised_reference,
      summary: `Engineering Decision evolved: ${existingDecision.decision_title} → ${title}`,
      description: `Decision version ${existingDecision.decision_version} superseded by version ${newVersion}. ${decisionChanged ? 'Decision type changed.' : 'Confidence updated.'}`,
      actor_type: 'system',
      actor: 'Engineering Intelligence Authority Engine',
      linked_artefacts: [
        { artefact_type: 'engineering_work_order', artefact_ref: alert.normalised_reference ?? '' },
      ] as LinkedArtefact[],
      metadata: {
        previous_decision_id: existingDecisionId,
        new_decision_id: evolved.id,
        previous_decision_type: existingDecision.decision_type,
        new_decision_type: decisionType,
        decision_version: newVersion,
      },
    });

    return evolved;
  } catch (err) {
    console.error('[EngineeringDecision] Exception evolving decision:', err);
    return null;
  }
}

// ─── Decision Resolution ─────────────────────────────────────────────────────

export async function resolveDecision(
  decisionId: string,
  poDecision: string,
  actor: string = 'Product Owner',
): Promise<EngineeringDecision | null> {
  try {
    const { data, error } = await supabase
      .from('ecc_engineering_decisions')
      .update({
        resolution_status: 'resolved',
        po_decision: poDecision,
        po_decision_actor: actor,
        po_decision_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', decisionId)
      .select()
      .single();

    if (error || !data) {
      console.error('[EngineeringDecision] Failed to resolve decision:', error?.message);
      return null;
    }

    const decision = data as unknown as EngineeringDecision;

    await recordTimelineEvent({
      decision_id: decisionId,
      alert_id: decision.alert_id,
      event_type: 'po_decision',
      event_summary: `Product Owner decision: ${poDecision}`,
      event_details: { po_decision: poDecision, actor },
      actor_type: 'human',
      actor,
    });

    await recordTimelineEvent({
      decision_id: decisionId,
      alert_id: decision.alert_id,
      event_type: 'resolution',
      event_summary: `Decision resolved: ${decision.decision_title}`,
      event_details: { resolution_status: 'resolved', po_decision: poDecision },
      actor_type: 'human',
      actor,
    });

    await recordChangeLogEvent({
      change_type: 'approved',
      object_type: 'other',
      object_ref: decision.ewo_ref,
      ewo_ref: decision.ewo_ref,
      summary: `Engineering Decision resolved: ${decision.decision_title}`,
      description: `Product Owner decision: ${poDecision}`,
      actor_type: 'human',
      actor,
      linked_artefacts: [
        { artefact_type: 'engineering_work_order', artefact_ref: decision.ewo_ref },
      ] as LinkedArtefact[],
      metadata: {
        decision_id: decisionId,
        decision_type: decision.decision_type,
        resolution: 'resolved',
      },
    });

    return decision;
  } catch (err) {
    console.error('[EngineeringDecision] Exception resolving decision:', err);
    return null;
  }
}

// ─── Timeline Recording ──────────────────────────────────────────────────────

export async function recordTimelineEvent(params: {
  decision_id: string;
  alert_id: string;
  event_type: TimelineEventType;
  event_summary: string;
  event_details: Record<string, unknown>;
  previous_decision_type?: DecisionType | null;
  new_decision_type?: DecisionType | null;
  previous_confidence?: number | null;
  new_confidence?: number | null;
  actor_type: 'human' | 'ai' | 'system';
  actor: string;
}): Promise<void> {
  try {
    await supabase.from('ecc_engineering_decision_timeline').insert({
      decision_id: params.decision_id,
      alert_id: params.alert_id,
      event_type: params.event_type,
      event_summary: params.event_summary,
      event_details: params.event_details,
      previous_decision_type: params.previous_decision_type ?? null,
      new_decision_type: params.new_decision_type ?? null,
      previous_confidence: params.previous_confidence ?? null,
      new_confidence: params.new_confidence ?? null,
      actor_type: params.actor_type,
      actor: params.actor,
    });
  } catch (err) {
    console.error('[EngineeringDecision] Failed to record timeline event:', err);
  }
}

// ─── Decision Retrieval ──────────────────────────────────────────────────────

export async function getDecisionForAlert(alertId: string): Promise<EngineeringDecision | null> {
  try {
    const { data, error } = await supabase
      .from('ecc_engineering_decisions')
      .select('*')
      .eq('alert_id', alertId)
      .order('decision_version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[EngineeringDecision] Failed to fetch decision:', error.message);
      return null;
    }

    return data as unknown as EngineeringDecision | null;
  } catch (err) {
    console.error('[EngineeringDecision] Exception fetching decision:', err);
    return null;
  }
}

export async function getDecisionTimeline(decisionId: string): Promise<DecisionTimelineEvent[]> {
  try {
    const { data, error } = await supabase
      .from('ecc_engineering_decision_timeline')
      .select('*')
      .eq('decision_id', decisionId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[EngineeringDecision] Failed to fetch timeline:', error.message);
      return [];
    }

    return (data ?? []) as unknown as DecisionTimelineEvent[];
  } catch (err) {
    console.error('[EngineeringDecision] Exception fetching timeline:', err);
    return [];
  }
}

export async function getAlertRelationships(alertId: string, allAlerts: IntegrityAlert[]): Promise<AlertRelationship[]> {
  const primaryAlert = allAlerts.find(a => a.id === alertId);
  if (!primaryAlert) return [];
  return analyzeAlertRelationships(primaryAlert, allAlerts);
}

// ─── Decision Explanation ────────────────────────────────────────────────────

export interface DecisionExplanation {
  executive_summary: string;
  decision: string;
  evidence_used: EvidenceItem[];
  confidence: number;
  alternatives_rejected: AlternativesRejected[];
  recommended_next_action: string;
}

export function buildDecisionExplanation(decision: EngineeringDecision): DecisionExplanation {
  return {
    executive_summary: decision.executive_summary,
    decision: decision.decision_title,
    evidence_used: decision.evidence_used,
    confidence: decision.confidence,
    alternatives_rejected: decision.alternatives_rejected,
    recommended_next_action: decision.recommended_next_action,
  };
}
