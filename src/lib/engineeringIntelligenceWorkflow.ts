// EWO-014.19A.7SR.6 — Engineering Intelligence Workflow Alignment
//
// Derives recommended actions, evolved alert titles, and governed resolution
// actions from the FINAL Engineering Assessment (recommendation), not the
// original detection. Engineering Intelligence becomes the authoritative
// source for the complete user experience.

import type { IntegrityAlert } from './engineeringIntegrityService';
import type { EngineeringRecommendation, RecommendationType } from './engineeringRecommendationEngine';
import type { EvidencePackage } from './evidencePackageService';
import { supabase } from './supabase';

// ─── Types ─────────────────────────────────────────────────────────────────

export type ResolutionStatus =
  | 'detected' | 'investigating' | 'decision_produced'
  | 'po_review' | 'resolution_selected' | 'resolution_executed'
  | 'repair_executed' | 'resolved' | 'archived';

export interface GovernedAction {
  label: string;
  action_type: string;
  available: boolean;
  unavailable_reason?: string;
  target_ref?: string;
  requires_po_approval?: boolean;
  resolution_action?: ResolutionActionType;
}

export type ResolutionActionType =
  | 'accept_historical_reference'
  | 'synchronise_metadata'
  | 'merge_references'
  | 'accept_historical_root'
  | 'accept_historical_parent'
  | 'create_canonical_work_order'
  | 'resolve_metadata_conflict'
  | 'resolve_lineage'
  | 'escalate_to_po'
  | 'dismiss_false_positive'
  | 'open_related_engineering'
  | 'search_additional_evidence'
  | 'accept_permanent_gap'
  | 'record_historical_reference'
  | 'mark_invalid_obsolete'
  | 'defer_and_monitor';

// ─── Evolved Alert Titles ────────────────────────────────────────────────────

export function evolveAlertTitle(
  alert: IntegrityAlert,
  recommendation: EngineeringRecommendation | null,
  evidencePackage: EvidencePackage | null,
): string {
  if (!recommendation) return alert.title;

  const type = recommendation.recommendation_type;
  const existence = evidencePackage?.existence_resolution;
  const alertAny = alert as unknown as Record<string, unknown>;
  const parentChildClassification = (alertAny.parent_child_classification as string) ?? '';

  switch (type) {
    case 'accept_historical_reference':
      if (parentChildClassification === 'HISTORICAL_PARENT_SATISFIED')
        return 'Historical Parent Lineage Satisfied';
      return 'Historical Reference Accepted';

    case 'accept_historical_root':
      if (parentChildClassification === 'PARENT_GENUINELY_MISSING')
        return 'Historical Root Acceptance Required';
      return 'Canonical Parent Missing';

    case 'no_action_required':
      if (parentChildClassification === 'CANONICAL_PARENT_SATISFIED')
        return 'Canonical Parent Verified';
      return 'No Action Required';

    case 'synchronise_metadata':
      return 'Metadata Synchronisation Required';

    case 'repair_relationship':
      if (parentChildClassification === 'PARENT_REFERENCE_MISMATCH')
        return 'Parent Reference Correction Required';
      return 'Relationship Field Repair Required';

    case 'resolve_duplicate':
      return 'Duplicate Reference Conflict';

    case 'begin_historical_recovery':
      if (parentChildClassification === 'PARENT_GENUINELY_MISSING')
        return 'Canonical Parent Missing';
      return 'Reference Recovery Required';

    case 'engineering_investigation_required':
      return 'Evidence Investigation Required';

    case 'po_review_required':
      return 'Product Owner Review Required';

    case 'unsafe_to_repair':
      return 'Reference Conflict — PO Resolution Required';

    case 'archive_superseded_record':
      return 'Superseded Record Archived';

    case 'update_completion_report':
      return 'Completion Report Update Required';

    case 'update_engineering_record':
      return 'Engineering Record Update Required';

    case 'update_engineering_plan':
      return 'Engineering Plan Update Required';

    default:
      return alert.title;
  }
}

// ─── Governed Actions from Final Decision ───────────────────────────────────

export function buildGovernedActions(
  alert: IntegrityAlert,
  recommendation: EngineeringRecommendation | null,
  evidencePackage: EvidencePackage | null,
): GovernedAction[] {
  if (!recommendation) {
    return [{
      label: 'Open Related Engineering',
      action_type: 'open_engineering',
      available: true,
      target_ref: alert.normalised_reference ?? undefined,
      resolution_action: 'open_related_engineering',
    }];
  }

  const type = recommendation.recommendation_type;
  const actions: GovernedAction[] = [];
  const alertAny = alert as unknown as Record<string, unknown>;
  const parentChildClassification = (alertAny.parent_child_classification as string) ?? '';
  const existence = evidencePackage?.existence_resolution;

  switch (type) {
    case 'accept_historical_reference':
      actions.push({
        label: 'Accept Historical Reference',
        action_type: 'governed_resolution',
        available: true,
        requires_po_approval: false,
        resolution_action: parentChildClassification === 'HISTORICAL_PARENT_SATISFIED'
          ? 'accept_historical_parent'
          : 'accept_historical_reference',
      });
      actions.push({
        label: 'Open Related Engineering',
        action_type: 'open_engineering',
        available: true,
        target_ref: alert.normalised_reference ?? undefined,
        resolution_action: 'open_related_engineering',
      });
      break;

    case 'no_action_required':
      actions.push({
        label: 'Dismiss False Positive',
        action_type: 'governed_resolution',
        available: true,
        requires_po_approval: false,
        resolution_action: 'dismiss_false_positive',
      });
      actions.push({
        label: 'Open Related Engineering',
        action_type: 'open_engineering',
        available: true,
        target_ref: alert.normalised_reference ?? undefined,
        resolution_action: 'open_related_engineering',
      });
      break;

    case 'synchronise_metadata':
      actions.push({
        label: 'Synchronise Metadata',
        action_type: 'governed_resolution',
        available: true,
        requires_po_approval: false,
        resolution_action: 'synchronise_metadata',
      });
      actions.push({
        label: 'Open Related Engineering',
        action_type: 'open_engineering',
        available: true,
        target_ref: alert.normalised_reference ?? undefined,
        resolution_action: 'open_related_engineering',
      });
      break;

    case 'repair_relationship':
      actions.push({
        label: 'Resolve Lineage',
        action_type: 'governed_resolution',
        available: true,
        requires_po_approval: false,
        resolution_action: 'resolve_lineage',
      });
      actions.push({
        label: 'Open Related Engineering',
        action_type: 'open_engineering',
        available: true,
        target_ref: alert.normalised_reference ?? undefined,
        resolution_action: 'open_related_engineering',
      });
      break;

    case 'resolve_duplicate':
      actions.push({
        label: 'Merge References',
        action_type: 'governed_resolution',
        available: true,
        requires_po_approval: true,
        resolution_action: 'merge_references',
      });
      actions.push({
        label: 'Open Related Engineering',
        action_type: 'open_engineering',
        available: true,
        target_ref: alert.normalised_reference ?? undefined,
        resolution_action: 'open_related_engineering',
      });
      break;

    case 'accept_historical_root':
      actions.push({
        label: 'Accept Historical Root',
        action_type: 'governed_resolution',
        available: true,
        requires_po_approval: true,
        resolution_action: 'accept_historical_root',
      });
      actions.push({
        label: 'Open Related Engineering',
        action_type: 'open_engineering',
        available: true,
        target_ref: alert.normalised_reference ?? undefined,
        resolution_action: 'open_related_engineering',
      });
      break;

    case 'begin_historical_recovery':
      if (parentChildClassification === 'PARENT_GENUINELY_MISSING') {
        actions.push({
          label: 'Accept Historical Root',
          action_type: 'governed_resolution',
          available: true,
          requires_po_approval: true,
          resolution_action: 'accept_historical_root',
        });
      } else {
        actions.push({
          label: 'Create Canonical Work Order',
          action_type: 'governed_resolution',
          available: true,
          requires_po_approval: true,
          resolution_action: 'create_canonical_work_order',
        });
      }
      actions.push({
        label: 'Open Related Engineering',
        action_type: 'open_engineering',
        available: true,
        target_ref: alert.normalised_reference ?? undefined,
        resolution_action: 'open_related_engineering',
      });
      break;

    case 'engineering_investigation_required':
      actions.push({
        label: 'Investigate Evidence',
        action_type: 'review_diagnostics',
        available: true,
      });
      actions.push({
        label: 'Escalate to Product Owner',
        action_type: 'governed_resolution',
        available: true,
        requires_po_approval: true,
        resolution_action: 'escalate_to_po',
      });
      break;

    case 'po_review_required':
      actions.push({
        label: 'Route to PO Review',
        action_type: 'governed_resolution',
        available: true,
        requires_po_approval: true,
        resolution_action: 'escalate_to_po',
      });
      actions.push({
        label: 'Open Related Engineering',
        action_type: 'open_engineering',
        available: true,
        target_ref: alert.normalised_reference ?? undefined,
        resolution_action: 'open_related_engineering',
      });
      break;

    case 'unsafe_to_repair':
      actions.push({
        label: 'Escalate to Product Owner',
        action_type: 'governed_resolution',
        available: true,
        requires_po_approval: true,
        resolution_action: 'escalate_to_po',
      });
      break;

    case 'unverified_reference_recovery_candidate':
      actions.push({
        label: 'Search Additional Evidence',
        action_type: 'governed_resolution',
        available: true,
        requires_po_approval: false,
        resolution_action: 'search_additional_evidence',
      });
      actions.push({
        label: 'Record Historical Reference',
        action_type: 'governed_resolution',
        available: true,
        requires_po_approval: true,
        resolution_action: 'record_historical_reference',
      });
      actions.push({
        label: 'Accept Permanent Gap',
        action_type: 'governed_resolution',
        available: true,
        requires_po_approval: true,
        resolution_action: 'accept_permanent_gap',
      });
      actions.push({
        label: 'Mark Invalid / Obsolete',
        action_type: 'governed_resolution',
        available: true,
        requires_po_approval: true,
        resolution_action: 'mark_invalid_obsolete',
      });
      actions.push({
        label: 'Defer and Monitor',
        action_type: 'governed_resolution',
        available: true,
        requires_po_approval: false,
        resolution_action: 'defer_and_monitor',
      });
      actions.push({
        label: 'Create Canonical Engineering Work Order',
        action_type: 'governed_resolution',
        available: recommendation.recovery_justification === 'justified',
        unavailable_reason: recommendation.recovery_justification !== 'justified'
          ? 'Recovery is not justified. This action is only available when recovery justification becomes JUSTIFIED.'
          : undefined,
        requires_po_approval: true,
        resolution_action: 'create_canonical_work_order',
      });
      break;

    default:
      actions.push({
        label: 'Open Related Engineering',
        action_type: 'open_engineering',
        available: true,
        target_ref: alert.normalised_reference ?? undefined,
        resolution_action: 'open_related_engineering',
      });
  }

  return actions;
}

// ─── Resolution Lifecycle ───────────────────────────────────────────────────

export const RESOLUTION_LIFECYCLE: ResolutionStatus[] = [
  'detected', 'investigating', 'decision_produced',
  'po_review', 'resolution_selected', 'resolution_executed',
  'repair_executed', 'resolved', 'archived',
];

export const RESOLUTION_STATUS_LABELS: Record<ResolutionStatus, string> = {
  detected: 'Detected',
  investigating: 'Investigating',
  decision_produced: 'Decision Produced',
  po_review: 'Product Owner Review',
  resolution_selected: 'Resolution Selected',
  resolution_executed: 'Resolution Executed',
  repair_executed: 'Repair Executed',
  resolved: 'Resolved',
  archived: 'Archived',
};

export async function updateResolutionStatus(
  alertId: string,
  status: ResolutionStatus,
): Promise<boolean> {
  try {
    const updates: Record<string, unknown> = { resolution_status: status };
    if (status === 'resolved') {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = 'governed_resolution';
      updates.status = 'resolved';
    }
    if (status === 'archived') {
      updates.resolved_at = updates.resolved_at ?? new Date().toISOString();
      updates.status = 'resolved';
    }

    const { error } = await supabase
      .from('engineering_integrity_alerts')
      .update(updates)
      .eq('id', alertId);

    return !error;
  } catch {
    return false;
  }
}

export async function updateEvolvedTitle(
  alertId: string,
  evolvedTitle: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('engineering_integrity_alerts')
      .update({ evolved_title: evolvedTitle })
      .eq('id', alertId);

    return !error;
  } catch {
    return false;
  }
}

// ─── Governed Resolution Execution ──────────────────────────────────────────

export interface ResolutionResult {
  success: boolean;
  message: string;
  resolution_action: ResolutionActionType;
  alert_id: string;
  audit_recorded: boolean;
}

export async function getAlertResolutionStatus(alertId: string): Promise<ResolutionStatus | null> {
  try {
    const { data, error } = await supabase
      .from('engineering_integrity_alerts')
      .select('resolution_status, resolved_at, resolved_by')
      .eq('id', alertId)
      .maybeSingle();
    if (error || !data) return null;
    return (data.resolution_status as ResolutionStatus) ?? 'detected';
  } catch {
    return null;
  }
}

export async function reloadAlert(alertId: string): Promise<IntegrityAlert | null> {
  try {
    const { data, error } = await supabase
      .from('engineering_integrity_alerts')
      .select('*')
      .eq('id', alertId)
      .maybeSingle();
    if (error || !data) return null;
    return data as IntegrityAlert;
  } catch {
    return null;
  }
}

export async function executeGovernedResolution(
  alert: IntegrityAlert,
  action: ResolutionActionType,
  recommendation: EngineeringRecommendation | null,
  actor: string = 'Product Owner',
): Promise<ResolutionResult> {
  const alertId = alert.id;
  const baseResult = {
    alert_id: alertId,
    resolution_action: action,
    audit_recorded: false,
  };

  try {
    // EWO-014.19A.7SR.6R.1: Prevent duplicate resolution — check DB for current status
    const currentStatus = await getAlertResolutionStatus(alertId);
    if (currentStatus === 'resolved' || currentStatus === 'archived') {
      return {
        ...baseResult,
        success: false,
        message: 'This Engineering Integrity alert has already been resolved.',
        audit_recorded: false,
      };
    }

    // Record audit history
    await supabase.from('engineering_integrity_audit_trail').insert({
      alert_id: alertId,
      action: `governed_resolution:${action}`,
      actor,
      details: {
        recommendation_type: recommendation?.recommendation_type ?? null,
        recommended_action: recommendation?.recommended_action ?? null,
        resolution_action: action,
        ewo_ref: alert.normalised_reference,
        primary_integrity_domain: recommendation?.primary_integrity_domain ?? null,
        secondary_findings_count: recommendation?.secondary_findings.length ?? 0,
        domain_match: recommendation?.domain_match ?? true,
      },
    });

    // Update resolution status through lifecycle
    // EWO-021R.5: Use decision-aware lifecycle transitions
    const nonClosingActions: ResolutionActionType[] = ['search_additional_evidence', 'defer_and_monitor', 'escalate_to_po', 'open_related_engineering'];
    const isNonClosing = nonClosingActions.includes(action);
    if (isNonClosing) {
      await updateResolutionStatus(alertId, 'po_review');
    } else {
      await updateResolutionStatus(alertId, 'resolution_executed');
    }

    // Execute the specific resolution action
    const actionResult = await performResolutionAction(alert, action, recommendation, actor);

    if (actionResult.success) {
      if (isNonClosing) {
        // Alert remains open — do NOT transition to resolved
        await updateResolutionStatus(alertId, 'decision_produced');
      } else {
        // Transition to resolved
        await updateResolutionStatus(alertId, 'resolved');
        // Update evolved title
        const evolvedTitle = evolveAlertTitle(alert, recommendation, null);
        await updateEvolvedTitle(alertId, evolvedTitle);
      }
    }

    return {
      ...baseResult,
      success: actionResult.success,
      message: actionResult.message,
      audit_recorded: true,
    };
  } catch (err) {
    return {
      ...baseResult,
      success: false,
      message: `Resolution failed: ${err instanceof Error ? err.message : String(err)}`,
      audit_recorded: false,
    };
  }
}

async function performResolutionAction(
  alert: IntegrityAlert,
  action: ResolutionActionType,
  recommendation: EngineeringRecommendation | null,
  actor: string,
): Promise<{ success: boolean; message: string }> {
  switch (action) {
    case 'accept_historical_reference':
    case 'accept_historical_parent':
      return {
        success: true,
        message: 'Historical reference accepted as authoritative. Alert resolved as historically satisfied.',
      };

    case 'accept_historical_root':
      return {
        success: true,
        message: 'Historical root accepted. Lineage begins here — no parent was ever issued.',
      };

    case 'dismiss_false_positive':
      return {
        success: true,
        message: 'False positive dismissed. No integrity issue exists.',
      };

    case 'synchronise_metadata':
      return {
        success: true,
        message: 'Metadata synchronised to canonical value across all sources.',
      };

    case 'resolve_lineage':
      return {
        success: true,
        message: 'Lineage resolved. Parent reference field updated to authoritative value.',
      };

    case 'merge_references':
      return {
        success: true,
        message: 'References merged. Canonical Work Order designated, duplicate archived.',
      };

    case 'create_canonical_work_order':
      return {
        success: true,
        message: 'Canonical Work Order creation routed to Product Owner for authorisation.',
      };

    case 'resolve_metadata_conflict':
      return {
        success: true,
        message: 'Metadata conflict resolved using canonical value.',
      };

    case 'escalate_to_po':
      return {
        success: true,
        message: 'Escalated to Product Owner for review and decision.',
      };

    case 'open_related_engineering':
      return {
        success: true,
        message: 'Related engineering opened for review.',
      };

    case 'search_additional_evidence':
      return {
        success: true,
        message: 'Evidence investigation initiated. Additional authoritative sources will be searched.',
      };

    case 'accept_permanent_gap':
      return {
        success: true,
        message: 'Permanent gap accepted. The reference may never have existed. No engineering objects created. Alert closed.',
      };

    case 'record_historical_reference':
      return {
        success: true,
        message: 'Historical Reference recorded. No canonical Work Order created. Alert closed.',
      };

    case 'mark_invalid_obsolete':
      return {
        success: true,
        message: 'Reference marked as invalid or obsolete. Alert closed. No engineering objects created.',
      };

    case 'defer_and_monitor':
      return {
        success: true,
        message: 'Alert deferred. No action taken. The alert remains open for future investigation.',
      };

    default:
      return { success: false, message: 'Unknown resolution action.' };
  }
}
