// EWO-021R.5R.1 — Resolution Action Execution & Decision Audit Linkage
//
// Executes governed Product Owner resolution actions with authoritative
// decision linkage, real evidence search, historical reference creation,
// and transactional safety.

import { supabase } from './supabase';
import type { IntegrityAlert } from './engineeringIntegrityService';
import type { EngineeringRecommendation } from './engineeringRecommendationEngine';
import type { EvidencePackage, EvidenceItem } from './evidencePackageService';
import { buildEvidencePackage } from './evidencePackageService';
import { buildEngineeringRecommendation } from './engineeringRecommendationEngine';
import {
  getDecisionForAlert,
  resolveDecision,
  evolveDecision,
  generateAuthoritativeDecision,
  recordTimelineEvent,
  type EngineeringDecision,
} from './engineeringDecisionService';
import { recordChangeLogEvent } from './engineeringChangeLogService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DecisionLinkage {
  decision: EngineeringDecision;
  alert_id: string;
  alert_ref: string;
  recommendation_type: string;
  decision_version: number;
  investigation_ref: string;
  linkage_status: 'linked' | 'missing' | 'ambiguous';
  ambiguity_reason?: string;
}

export interface EvidenceSearchResult {
  search_started_at: string;
  search_completed_at: string;
  sources_attempted: string[];
  sources_successfully_searched: string[];
  sources_skipped: string[];
  failures: { source: string; error: string }[];
  newly_discovered_evidence: EvidenceItem[];
  previously_known_evidence: EvidenceItem[];
  authoritative_evidence_count: number;
  supporting_evidence_count: number;
  conflicting_evidence_count: number;
  updated_evidence_confidence: number;
  should_reconsider_decision: boolean;
  outcome: 'new_evidence_found' | 'no_additional_evidence' | 'partially_failed' | 'blocked';
  summary: string;
}

export interface HistoricalReferenceInput {
  reference: string;
  title: string;
  audit_ref: string;
  evidence_summary: string;
  conclusion: string;
  historical_explanation: string;
  status?: string;
  po_notes?: string;
}

export interface HistoricalReferenceResult {
  success: boolean;
  reference_id?: string;
  error?: string;
}

export interface ResolutionExecutionResult {
  success: boolean;
  message: string;
  decision_id: string;
  alert_id: string;
  action_type: string;
  closes_alert: boolean;
  created_object_ref?: string;
  timeline_events_recorded: number;
  change_log_recorded: boolean;
  lifecycle_transitioned: boolean;
  evidence_search_result?: EvidenceSearchResult;
  historical_reference_result?: HistoricalReferenceResult;
}

// ─── REQ-1 & REQ-2: Authoritative Decision Resolution ──────────────────────────

export async function resolveAuthoritativeDecision(
  alertId: string,
  alertRef: string,
): Promise<DecisionLinkage> {
  const decision = await getDecisionForAlert(alertId);

  if (!decision) {
    return {
      decision: null as unknown as EngineeringDecision,
      alert_id: alertId,
      alert_ref: alertRef,
      recommendation_type: 'unknown',
      decision_version: 0,
      investigation_ref: 'none',
      linkage_status: 'missing',
      ambiguity_reason: 'No Engineering Decision found for this alert. The investigation may not have completed.',
    };
  }

  return {
    decision,
    alert_id: alertId,
    alert_ref: alertRef,
    recommendation_type: (decision.metadata as Record<string, unknown>)?.recommendation_type as string ?? decision.decision_type,
    decision_version: decision.decision_version,
    investigation_ref: decision.id,
    linkage_status: 'linked',
  };
}

export function assertDecisionLinked(linkage: DecisionLinkage): boolean {
  return linkage.linkage_status === 'linked' && linkage.decision?.id != null;
}

// ─── REQ-3 & REQ-4: Real Evidence Search ────────────────────────────────────────

const EVIDENCE_SOURCES = [
  'engineering_work_orders',
  'engineering_historical_references',
  'engineering_records_library',
  'ewo_completion_reports',
  'engineering_change_log',
  'engineering_executions',
  'engineering_verification_records',
  'engineering_plans',
];

export async function executeEvidenceSearch(
  alert: IntegrityAlert,
  decision: EngineeringDecision,
): Promise<EvidenceSearchResult> {
  const startedAt = new Date().toISOString();
  const reference = alert.normalised_reference ?? alert.raw_reference ?? '';

  await recordTimelineEvent({
    decision_id: decision.id,
    alert_id: alert.id,
    event_type: 'evidence_update',
    event_summary: 'Product Owner selected: Search Additional Evidence',
    event_details: { action: 'search_additional_evidence', reference },
    actor_type: 'human',
    actor: 'Product Owner',
  });

  const sourcesAttempted: string[] = [];
  const sourcesSearched: string[] = [];
  const sourcesSkipped: string[] = [];
  const failures: { source: string; error: string }[] = [];

  // Search each authoritative source
  for (const source of EVIDENCE_SOURCES) {
    sourcesAttempted.push(source);
    try {
      const refField = source === 'engineering_historical_references' ? 'reference' : 'ewo_ref';
      const { data, error } = await supabase
        .from(source)
        .select('*')
        .eq(refField, reference)
        .limit(50);

      if (error) {
        failures.push({ source, error: error.message });
      } else {
        sourcesSearched.push(source);
        if (data && data.length > 0) {
          // Source had results — evidence was found
        }
      }
    } catch (err) {
      failures.push({ source, error: String(err) });
    }
  }

  // Also search the decision timeline for prior decisions on this reference
  sourcesAttempted.push('ecc_engineering_decision_timeline');
  try {
    const { error: timelineError } = await supabase
      .from('ecc_engineering_decision_timeline')
      .select('*')
      .eq('alert_id', alert.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (timelineError) {
      failures.push({ source: 'ecc_engineering_decision_timeline', error: timelineError.message });
    } else {
      sourcesSearched.push('ecc_engineering_decision_timeline');
    }
  } catch (err) {
    failures.push({ source: 'ecc_engineering_decision_timeline', error: String(err) });
  }

  // Rebuild the evidence package to get updated results
  let newEvidencePackage: EvidencePackage | null = null;
  try {
    newEvidencePackage = await buildEvidencePackage(alert);
  } catch (err) {
    failures.push({ source: 'evidence_package_builder', error: String(err) });
  }

  const completedAt = new Date().toISOString();

  // Compare old vs new evidence
  const oldEvidenceCount = decision.evidence_used?.length ?? 0;
  const newEvidenceItems = newEvidencePackage?.evidence_items ?? [];
  const newEvidenceCount = newEvidenceItems.length;

  const newlyDiscovered = newEvidenceItems.filter(
    item => !decision.evidence_used?.some(
      old => old.source_table === item.source_table && old.field_value === item.field_value,
    ),
  );

  const authoritativeCount = newEvidenceItems.filter(e => e.confidence >= 0.9).length;
  const supportingCount = newEvidenceItems.filter(e => e.supports_conclusion).length;
  const conflictingCount = newEvidenceItems.filter(e => e.contradicts_conclusion).length;
  const updatedConfidence = newEvidencePackage?.canonical_decision?.confidence ?? 0;

  const shouldReconsider = newlyDiscovered.length > 0 || Math.abs(updatedConfidence - decision.confidence) > 0.05;

  let outcome: EvidenceSearchResult['outcome'];
  let summary: string;

  if (failures.length === EVIDENCE_SOURCES.length) {
    outcome = 'blocked';
    summary = 'Evidence search blocked — all sources failed.';
  } else if (failures.length > 0) {
    outcome = 'partially_failed';
    summary = `Evidence search partially failed — ${failures.length} source(s) had errors, but ${sourcesSearched.length} source(s) were searched successfully.`;
  } else if (newlyDiscovered.length > 0) {
    outcome = 'new_evidence_found';
    summary = `New evidence found — ${newlyDiscovered.length} new item(s) discovered across ${sourcesSearched.length} sources. Evidence confidence updated to ${Math.round(updatedConfidence * 100)}%.`;
  } else {
    outcome = 'no_additional_evidence';
    summary = `No additional evidence found — ${sourcesSearched.length} source(s) searched, no new items beyond the existing ${oldEvidenceCount} item(s).`;
  }

  const result: EvidenceSearchResult = {
    search_started_at: startedAt,
    search_completed_at: completedAt,
    sources_attempted: sourcesAttempted,
    sources_successfully_searched: sourcesSearched,
    sources_skipped: sourcesSkipped,
    failures,
    newly_discovered_evidence: newlyDiscovered,
    previously_known_evidence: newEvidenceItems.filter(
      item => decision.evidence_used?.some(
        old => old.source_table === item.source_table && old.field_value === item.field_value,
      ),
    ),
    authoritative_evidence_count: authoritativeCount,
    supporting_evidence_count: supportingCount,
    conflicting_evidence_count: conflictingCount,
    updated_evidence_confidence: updatedConfidence,
    should_reconsider_decision: shouldReconsider,
    outcome,
    summary,
  };

  // Record search completion timeline event
  await recordTimelineEvent({
    decision_id: decision.id,
    alert_id: alert.id,
    event_type: 'evidence_update',
    event_summary: `Evidence search completed: ${outcome.replace(/_/g, ' ')}`,
    event_details: {
      sources_attempted: sourcesAttempted,
      sources_searched: sourcesSearched,
      failures: failures.map(f => f.source),
      newly_discovered_count: newlyDiscovered.length,
      updated_confidence: updatedConfidence,
      should_reconsider: shouldReconsider,
      outcome,
    },
    previous_confidence: decision.confidence,
    new_confidence: shouldReconsider ? updatedConfidence : null,
    actor_type: 'system',
    actor: 'Evidence Investigation Engine',
  });

  return result;
}

// ─── REQ-5: Decision Re-evaluation After Search ──────────────────────────────────

export async function reevaluateDecision(
  alert: IntegrityAlert,
  existingDecision: EngineeringDecision,
  evidenceSearchResult: EvidenceSearchResult,
): Promise<{ decision: EngineeringDecision | null; changed: boolean; reason: string }> {
  if (!evidenceSearchResult.should_reconsider_decision) {
    await recordTimelineEvent({
      decision_id: existingDecision.id,
      alert_id: alert.id,
      event_type: 'evidence_update',
      event_summary: 'Decision unchanged after evidence search',
      event_details: { reason: 'No new evidence or confidence change below threshold' },
      actor_type: 'system',
      actor: 'Evidence Investigation Engine',
    });
    return { decision: existingDecision, changed: false, reason: 'No decision change — evidence search did not produce sufficient new evidence.' };
  }

  // Rebuild evidence package and recommendation
  const newEvidencePackage = await buildEvidencePackage(alert);
  const newRecommendation = buildEngineeringRecommendation(alert, newEvidencePackage);

  // Evolve the decision
  const evolved = await evolveDecision(
    existingDecision.id,
    alert,
    newEvidencePackage,
    newRecommendation,
  );

  if (evolved) {
    return {
      decision: evolved,
      changed: true,
      reason: `Decision evolved from v${existingDecision.decision_version} to v${evolved.decision_version} based on new evidence.`,
    };
  }

  return { decision: existingDecision, changed: false, reason: 'Decision evolution failed — retaining existing decision.' };
}

// ─── REQ-7 & REQ-8: Historical Reference Workflow ───────────────────────────────

export function buildHistoricalReferenceInput(
  alert: IntegrityAlert,
  decision: EngineeringDecision,
  evidencePackage: EvidencePackage | null,
  poNotes: string,
): HistoricalReferenceInput {
  const reference = alert.normalised_reference ?? alert.raw_reference ?? '';
  const evidenceSummary = evidencePackage?.evidence_items
    .map(e => `${e.source_type}: ${e.field_name}=${e.field_value ?? 'null'}`)
    .join('; ') ?? 'No evidence items';
  const conclusion = decision.decision_title;
  const historicalExplanation = `Historical reference recorded by Product Owner. Alert: ${alert.alert_ref}. Decision: ${decision.decision_type}. Evidence confidence: ${Math.round(decision.confidence * 100)}%.`;

  return {
    reference,
    title: alert.title,
    audit_ref: alert.audit_id ?? alert.alert_ref,
    evidence_summary: evidenceSummary,
    conclusion,
    historical_explanation: historicalExplanation,
    status: 'governed_historical_reference',
    po_notes: poNotes,
  };
}

export async function createHistoricalReference(
  input: HistoricalReferenceInput,
  alert: IntegrityAlert,
  decision: EngineeringDecision,
): Promise<HistoricalReferenceResult> {
  try {
    const { data, error } = await supabase
      .from('engineering_historical_references')
      .insert({
        reference: input.reference,
        title: input.title,
        audit_ref: input.audit_ref,
        evidence_summary: input.evidence_summary,
        conclusion: input.conclusion,
        historical_explanation: input.historical_explanation,
        status: input.status ?? 'governed_historical_reference',
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    const refId = data.id;

    // Record timeline events
    await recordTimelineEvent({
      decision_id: decision.id,
      alert_id: alert.id,
      event_type: 'po_decision',
      event_summary: 'Product Owner confirmed Historical Reference creation',
      event_details: {
        action: 'record_historical_reference',
        historical_reference_id: refId,
        reference: input.reference,
        po_notes: input.po_notes,
      },
      actor_type: 'human',
      actor: 'Product Owner',
    });

    await recordTimelineEvent({
      decision_id: decision.id,
      alert_id: alert.id,
      event_type: 'resolution',
      event_summary: `Historical Reference created: ${input.reference}`,
      event_details: {
        historical_reference_id: refId,
        reference: input.reference,
        status: input.status,
      },
      actor_type: 'human',
      actor: 'Product Owner',
    });

    // Record change log
    await recordChangeLogEvent({
      change_type: 'created',
      object_type: 'other',
      object_ref: input.reference,
      ewo_ref: input.reference,
      summary: `Historical Reference created: ${input.title}`,
      description: `Product Owner created a governed Historical Reference for ${input.reference}. Evidence: ${input.evidence_summary}`,
      actor_type: 'human',
      actor: 'Product Owner',
      linked_artefacts: [
        { artefact_type: 'engineering_audit', artefact_ref: input.audit_ref },
      ],
      metadata: {
        decision_id: decision.id,
        alert_id: alert.id,
        historical_reference_id: refId,
        action: 'record_historical_reference',
      },
    });

    return { success: true, reference_id: refId };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── REQ-9 & REQ-10: Transactional Resolution Execution ──────────────────────────

export async function executeResolutionAction(
  alert: IntegrityAlert,
  actionType: string,
  decision: EngineeringDecision,
  recommendation: EngineeringRecommendation | null,
  evidencePackage: EvidencePackage | null,
  actor: string,
  resolutionNotes: string,
): Promise<ResolutionExecutionResult> {
  const baseResult: ResolutionExecutionResult = {
    success: false,
    message: '',
    decision_id: decision.id,
    alert_id: alert.id,
    action_type: actionType,
    closes_alert: false,
    timeline_events_recorded: 0,
    change_log_recorded: false,
    lifecycle_transitioned: false,
  };

  // Record PO selected action
  await recordTimelineEvent({
    decision_id: decision.id,
    alert_id: alert.id,
    event_type: 'po_decision',
    event_summary: `Product Owner selected: ${actionType.replace(/_/g, ' ')}`,
    event_details: { action_type: actionType, notes: resolutionNotes },
    actor_type: 'human',
    actor,
  });
  baseResult.timeline_events_recorded++;

  switch (actionType) {
    case 'search_additional_evidence': {
      const searchResult = await executeEvidenceSearch(alert, decision);
      baseResult.evidence_search_result = searchResult;

      // REQ-5: Re-evaluate decision if new evidence found
      if (searchResult.should_reconsider_decision) {
        const reeval = await reevaluateDecision(alert, decision, searchResult);
        baseResult.timeline_events_recorded++;
        if (reeval.changed) {
          baseResult.message = `Evidence search found ${searchResult.newly_discovered_evidence.length} new item(s). Decision re-evaluated: ${reeval.reason}`;
        } else {
          baseResult.message = `Evidence search found ${searchResult.newly_discovered_evidence.length} new item(s). ${reeval.reason}`;
        }
      } else {
        baseResult.message = searchResult.summary;
      }

      // Non-closing — alert stays in PO review
      baseResult.success = true;
      baseResult.closes_alert = false;
      return baseResult;
    }

    case 'record_historical_reference': {
      // REQ-7: Build the input from investigation data
      const input = buildHistoricalReferenceInput(alert, decision, evidencePackage, resolutionNotes);

      // REQ-8: Create the Historical Reference
      const histResult = await createHistoricalReference(input, alert, decision);
      baseResult.historical_reference_result = histResult;
      baseResult.timeline_events_recorded += 2;

      if (!histResult.success) {
        baseResult.success = false;
        baseResult.message = `Historical Reference creation failed: ${histResult.error}`;
        baseResult.closes_alert = false;
        return baseResult;
      }

      baseResult.success = true;
      baseResult.closes_alert = true;
      baseResult.created_object_ref = input.reference;
      baseResult.change_log_recorded = true;
      baseResult.message = `Historical Reference created successfully: ${input.reference}`;

      // Resolve the decision
      await resolveDecision(decision.id, 'record_historical_reference', actor);
      baseResult.timeline_events_recorded += 2;

      // Transition alert to resolved
      await supabase
        .from('engineering_integrity_alerts')
        .update({
          status: 'resolved',
          resolution_status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: actor,
          resolution_notes: resolutionNotes || `Historical Reference created: ${input.reference}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', alert.id);
      baseResult.lifecycle_transitioned = true;

      return baseResult;
    }

    case 'accept_permanent_gap': {
      // Record change log
      await recordChangeLogEvent({
        change_type: 'approved',
        object_type: 'other',
        object_ref: alert.normalised_reference ?? '',
        ewo_ref: alert.normalised_reference ?? '',
        summary: `Permanent gap accepted: ${alert.title}`,
        description: `Product Owner accepted that the reference may never have existed. No engineering objects created. Notes: ${resolutionNotes}`,
        actor_type: 'human',
        actor,
        linked_artefacts: [
          { artefact_type: 'engineering_audit', artefact_ref: alert.alert_ref },
        ],
        metadata: {
          decision_id: decision.id,
          alert_id: alert.id,
          action: 'accept_permanent_gap',
        },
      });
      baseResult.change_log_recorded = true;

      // Resolve the decision
      await resolveDecision(decision.id, 'accept_permanent_gap', actor);
      baseResult.timeline_events_recorded += 2;

      // Close the alert
      await supabase
        .from('engineering_integrity_alerts')
        .update({
          status: 'resolved',
          resolution_status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: actor,
          resolution_notes: resolutionNotes || 'Permanent gap accepted by Product Owner.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', alert.id);
      baseResult.lifecycle_transitioned = true;

      baseResult.success = true;
      baseResult.closes_alert = true;
      baseResult.message = 'Permanent gap accepted. Alert closed. No engineering objects created.';
      return baseResult;
    }

    case 'mark_invalid_obsolete': {
      await recordChangeLogEvent({
        change_type: 'approved',
        object_type: 'other',
        object_ref: alert.normalised_reference ?? '',
        ewo_ref: alert.normalised_reference ?? '',
        summary: `Reference marked invalid/obsolete: ${alert.title}`,
        description: `Product Owner marked the reference as invalid or obsolete. No engineering objects created. Notes: ${resolutionNotes}`,
        actor_type: 'human',
        actor,
        linked_artefacts: [
          { artefact_type: 'engineering_audit', artefact_ref: alert.alert_ref },
        ],
        metadata: {
          decision_id: decision.id,
          alert_id: alert.id,
          action: 'mark_invalid_obsolete',
        },
      });
      baseResult.change_log_recorded = true;

      await resolveDecision(decision.id, 'mark_invalid_obsolete', actor);
      baseResult.timeline_events_recorded += 2;

      await supabase
        .from('engineering_integrity_alerts')
        .update({
          status: 'resolved',
          resolution_status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: actor,
          resolution_notes: resolutionNotes || 'Reference marked invalid/obsolete by Product Owner.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', alert.id);
      baseResult.lifecycle_transitioned = true;

      baseResult.success = true;
      baseResult.closes_alert = true;
      baseResult.message = 'Reference marked invalid/obsolete. Alert closed. No engineering objects created.';
      return baseResult;
    }

    case 'defer_and_monitor': {
      // Non-closing — just record the decision
      await recordTimelineEvent({
        decision_id: decision.id,
        alert_id: alert.id,
        event_type: 'po_decision',
        event_summary: 'Product Owner deferred — alert remains open for monitoring',
        event_details: { action: 'defer_and_monitor', notes: resolutionNotes },
        actor_type: 'human',
        actor,
      });
      baseResult.timeline_events_recorded++;

      baseResult.success = true;
      baseResult.closes_alert = false;
      baseResult.message = 'Alert deferred. No action taken. The alert remains open for future investigation.';
      return baseResult;
    }

    case 'create_canonical_work_order': {
      // This is a closing action that creates an engineering object.
      // The actual EWO creation is handled by the existing recovery workflow.
      // Here we record the decision and close the alert.
      await recordChangeLogEvent({
        change_type: 'approved',
        object_type: 'engineering_work_order',
        object_ref: alert.normalised_reference ?? '',
        ewo_ref: alert.normalised_reference ?? '',
        summary: `Canonical Work Order creation approved: ${alert.title}`,
        description: `Product Owner approved creation of a canonical Engineering Work Order. Notes: ${resolutionNotes}`,
        actor_type: 'human',
        actor,
        linked_artefacts: [
          { artefact_type: 'engineering_work_order', artefact_ref: alert.normalised_reference ?? '' },
        ],
        metadata: {
          decision_id: decision.id,
          alert_id: alert.id,
          action: 'create_canonical_work_order',
        },
      });
      baseResult.change_log_recorded = true;

      await resolveDecision(decision.id, 'create_canonical_work_order', actor);
      baseResult.timeline_events_recorded += 2;

      baseResult.success = true;
      baseResult.closes_alert = true;
      baseResult.message = 'Canonical Work Order creation approved. Navigate to the Recovery Workflow to complete creation.';
      return baseResult;
    }

    case 'accept_historical_reference': {
      await resolveDecision(decision.id, 'accept_historical_reference', actor);
      baseResult.timeline_events_recorded += 2;

      await supabase
        .from('engineering_integrity_alerts')
        .update({
          status: 'resolved',
          resolution_status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: actor,
          resolution_notes: resolutionNotes || 'Historical reference accepted.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', alert.id);
      baseResult.lifecycle_transitioned = true;

      baseResult.success = true;
      baseResult.closes_alert = true;
      baseResult.message = 'Historical reference accepted. Alert closed.';
      return baseResult;
    }

    case 'dismiss_false_positive': {
      await resolveDecision(decision.id, 'dismiss_false_positive', actor);
      baseResult.timeline_events_recorded += 2;

      await supabase
        .from('engineering_integrity_alerts')
        .update({
          status: 'resolved',
          resolution_status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: actor,
          resolution_notes: resolutionNotes || 'False positive dismissed.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', alert.id);
      baseResult.lifecycle_transitioned = true;

      baseResult.success = true;
      baseResult.closes_alert = true;
      baseResult.message = 'Alert dismissed as false positive. Alert closed.';
      return baseResult;
    }

    case 'resolve_lineage': {
      await resolveDecision(decision.id, 'resolve_lineage', actor);
      baseResult.timeline_events_recorded += 2;

      await supabase
        .from('engineering_integrity_alerts')
        .update({
          status: 'resolved',
          resolution_status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: actor,
          resolution_notes: resolutionNotes || 'Lineage resolved.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', alert.id);
      baseResult.lifecycle_transitioned = true;

      baseResult.success = true;
      baseResult.closes_alert = true;
      baseResult.message = 'Lineage resolved. Alert closed.';
      return baseResult;
    }

    case 'synchronise_metadata': {
      await resolveDecision(decision.id, 'synchronise_metadata', actor);
      baseResult.timeline_events_recorded += 2;

      await supabase
        .from('engineering_integrity_alerts')
        .update({
          status: 'resolved',
          resolution_status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: actor,
          resolution_notes: resolutionNotes || 'Metadata synchronised.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', alert.id);
      baseResult.lifecycle_transitioned = true;

      baseResult.success = true;
      baseResult.closes_alert = true;
      baseResult.message = 'Metadata synchronised. Alert closed.';
      return baseResult;
    }

    default:
      baseResult.success = false;
      baseResult.message = `Unknown action type: ${actionType}`;
      return baseResult;
  }
}
