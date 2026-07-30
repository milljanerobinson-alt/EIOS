// EWO-021R.5 — Governed Integrity Resolution Engine
//
// Decision-driven navigation and dynamic action generation for Engineering
// Integrity alerts. Replaces object-centric navigation with governed
// decision-centric resolution.

import type { IntegrityAlert } from './engineeringIntegrityService';
import type { EngineeringRecommendation, RecommendationType } from './engineeringRecommendationEngine';
import type { EvidencePackage } from './evidencePackageService';
import type { ResolutionStatus, ResolutionActionType } from './engineeringIntelligenceWorkflow';

// ─── Resolution Action Types (extended) ──────────────────────────────────────

export type GovernedResolutionActionType =
  | ResolutionActionType
  | 'search_additional_evidence'
  | 'accept_permanent_gap'
  | 'record_historical_reference'
  | 'mark_invalid_obsolete'
  | 'defer_and_monitor';

// ─── Dynamic Action Interface ───────────────────────────────────────────────

export interface DynamicResolutionAction {
  id: string;
  label: string;
  action_type: GovernedResolutionActionType;
  available: boolean;
  unavailable_reason?: string;
  requires_po_approval: boolean;
  closes_alert: boolean;
  creates_engineering_object: boolean;
  opens_workflow: 'resolution_workspace' | 'recovery_workflow' | 'historical_reference_workflow' | 'legacy_mapping_workflow' | 'archive_invalidation_workflow' | 'evidence_investigation' | 'none';
  description: string;
  governance_notes: string;
}

// ─── Extended Resolution Lifecycle ───────────────────────────────────────────

export const EXTENDED_RESOLUTION_LIFECYCLE: ResolutionStatus[] = [
  'detected',
  'investigating',
  'decision_produced',
  'po_review',
  'resolution_selected',
  'resolution_executed',
  'resolved',
  'archived',
];

export const EXTENDED_RESOLUTION_STATUS_LABELS: Record<string, string> = {
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

// ─── Decision-Driven Navigation Mapping ──────────────────────────────────────

export type NavigationDestination =
  | 'integrity_resolution_workspace'
  | 'recovery_workflow'
  | 'historical_reference_workflow'
  | 'legacy_mapping_workflow'
  | 'archive_invalidation_workflow'
  | 'evidence_investigation'
  | 'open_engineering_object';

export function getNavigationDestination(
  recommendationType: RecommendationType,
  recoveryJustification: EngineeringRecommendation['recovery_justification'],
  objectExists: boolean,
): NavigationDestination {
  switch (recommendationType) {
    case 'unverified_reference_recovery_candidate':
      return 'integrity_resolution_workspace';

    case 'begin_historical_recovery':
      if (recoveryJustification === 'justified' || recoveryJustification === 'blocked_pending_po_decision') {
        return 'recovery_workflow';
      }
      return 'integrity_resolution_workspace';

    case 'accept_historical_reference':
      return 'historical_reference_workflow';

    case 'accept_historical_root':
      return 'integrity_resolution_workspace';

    case 'no_action_required':
      if (objectExists) return 'open_engineering_object';
      return 'integrity_resolution_workspace';

    case 'engineering_investigation_required':
      return 'evidence_investigation';

    case 'po_review_required':
    case 'unsafe_to_repair':
      return 'integrity_resolution_workspace';

    default:
      if (objectExists) return 'open_engineering_object';
      return 'integrity_resolution_workspace';
  }
}

// ─── Dynamic Action Generation ──────────────────────────────────────────────

export function generateDynamicActions(
  alert: IntegrityAlert,
  recommendation: EngineeringRecommendation | null,
  _evidencePackage: EvidencePackage | null,
  options: {
    isProductOwner: boolean;
    currentLifecycleState: ResolutionStatus;
  },
): DynamicResolutionAction[] {
  const actions: DynamicResolutionAction[] = [];
  const isReadOnly = options.currentLifecycleState === 'resolved' || options.currentLifecycleState === 'archived';

  if (isReadOnly || !recommendation) {
    return actions;
  }

  const type = recommendation.recommendation_type;
  const recoveryJustified = recommendation.recovery_justification === 'justified';
  const recoveryBlocked = recommendation.recovery_justification === 'blocked_pending_evidence' || recommendation.recovery_justification === 'blocked_pending_po_decision';

  switch (type) {
    case 'unverified_reference_recovery_candidate':
      actions.push({
        id: 'search_evidence',
        label: 'Search Additional Evidence',
        action_type: 'search_additional_evidence',
        available: true,
        requires_po_approval: false,
        closes_alert: false,
        creates_engineering_object: false,
        opens_workflow: 'evidence_investigation',
        description: 'Search additional authoritative sources for evidence that the Engineering object existed.',
        governance_notes: 'Does not close the alert. Investigation continues.',
      });

      actions.push({
        id: 'record_hist_ref',
        label: 'Record Historical Reference',
        action_type: 'record_historical_reference',
        available: true,
        requires_po_approval: true,
        closes_alert: true,
        creates_engineering_object: false,
        opens_workflow: 'historical_reference_workflow',
        description: 'Create a governed Historical Reference record without creating a canonical Work Order.',
        governance_notes: 'Creates a Historical Reference only. No canonical Work Order is created. Alert is closed.',
      });

      actions.push({
        id: 'accept_gap',
        label: 'Accept Permanent Gap',
        action_type: 'accept_permanent_gap',
        available: true,
        requires_po_approval: true,
        closes_alert: true,
        creates_engineering_object: false,
        opens_workflow: 'none',
        description: 'Accept that the reference may never have existed. No engineering objects are created.',
        governance_notes: 'Records a governance decision. Alert is closed. No objects created.',
      });

      actions.push({
        id: 'mark_invalid',
        label: 'Mark Invalid / Obsolete',
        action_type: 'mark_invalid_obsolete',
        available: true,
        requires_po_approval: true,
        closes_alert: true,
        creates_engineering_object: false,
        opens_workflow: 'archive_invalidation_workflow',
        description: 'Mark the reference as invalid, obsolete, or belonging to a legacy convention.',
        governance_notes: 'Records an invalidation decision. Alert is closed. No objects created.',
      });

      actions.push({
        id: 'defer_monitor',
        label: 'Defer and Monitor',
        action_type: 'defer_and_monitor',
        available: true,
        requires_po_approval: false,
        closes_alert: false,
        creates_engineering_object: false,
        opens_workflow: 'none',
        description: 'No action taken. The alert remains open for future investigation.',
        governance_notes: 'Alert remains open. Will reappear on each reconciliation cycle.',
      });

      actions.push({
        id: 'create_ewo',
        label: 'Create Canonical Engineering Work Order',
        action_type: 'create_canonical_work_order',
        available: recoveryJustified,
        unavailable_reason: recoveryBlocked
          ? 'Recovery is not justified. No positive evidence confirms the object existed. This action is only available when recovery justification becomes JUSTIFIED.'
          : 'Recovery justification must be JUSTIFIED before this action is available.',
        requires_po_approval: true,
        closes_alert: true,
        creates_engineering_object: true,
        opens_workflow: 'recovery_workflow',
        description: 'Create a canonical Engineering Work Order. Only available when recovery is evidence-justified.',
        governance_notes: 'Requires positive evidence and Product Owner authorisation. Creates a canonical Work Order.',
      });
      break;

    case 'begin_historical_recovery':
      if (recoveryJustified) {
        actions.push({
          id: 'create_ewo',
          label: 'Create Canonical Engineering Work Order',
          action_type: 'create_canonical_work_order',
          available: true,
          requires_po_approval: true,
          closes_alert: true,
          creates_engineering_object: true,
          opens_workflow: 'recovery_workflow',
          description: 'Positive evidence supports recovery. Create a canonical Engineering Work Order.',
          governance_notes: 'Requires Product Owner authorisation. Creates a canonical Work Order.',
        });
      } else {
        actions.push({
          id: 'search_evidence',
          label: 'Search Additional Evidence',
          action_type: 'search_additional_evidence',
          available: true,
          requires_po_approval: false,
          closes_alert: false,
          creates_engineering_object: false,
          opens_workflow: 'evidence_investigation',
          description: 'Search for additional evidence to justify recovery.',
          governance_notes: 'Does not close the alert.',
        });
      }

      actions.push({
        id: 'record_hist_ref',
        label: 'Record Historical Reference',
        action_type: 'record_historical_reference',
        available: true,
        requires_po_approval: true,
        closes_alert: true,
        creates_engineering_object: false,
        opens_workflow: 'historical_reference_workflow',
        description: 'Record a Historical Reference without creating a canonical Work Order.',
        governance_notes: 'Creates a Historical Reference only. Alert is closed.',
      });
      break;

    case 'accept_historical_reference':
      actions.push({
        id: 'accept_hist_ref',
        label: 'Accept Historical Reference',
        action_type: 'accept_historical_reference',
        available: true,
        requires_po_approval: false,
        closes_alert: true,
        creates_engineering_object: false,
        opens_workflow: 'none',
        description: 'Accept the Historical Reference as authoritative. No action needed.',
        governance_notes: 'Alert is closed. No objects created.',
      });
      break;

    case 'no_action_required':
      actions.push({
        id: 'dismiss',
        label: 'Dismiss — No Action Required',
        action_type: 'dismiss_false_positive',
        available: true,
        requires_po_approval: false,
        closes_alert: true,
        creates_engineering_object: false,
        opens_workflow: 'none',
        description: 'No integrity issue exists. Dismiss the alert.',
        governance_notes: 'Alert is closed as false positive.',
      });
      break;

    case 'repair_relationship':
      actions.push({
        id: 'resolve_lineage',
        label: 'Resolve Lineage',
        action_type: 'resolve_lineage',
        available: true,
        requires_po_approval: false,
        closes_alert: true,
        creates_engineering_object: false,
        opens_workflow: 'none',
        description: 'Update the parent reference field to match the authoritative parent.',
        governance_notes: 'Metadata field update only. Alert is closed.',
      });
      break;

    case 'synchronise_metadata':
      actions.push({
        id: 'sync_metadata',
        label: 'Synchronise Metadata',
        action_type: 'synchronise_metadata',
        available: true,
        requires_po_approval: false,
        closes_alert: true,
        creates_engineering_object: false,
        opens_workflow: 'none',
        description: 'Synchronise metadata to the canonical value across all sources.',
        governance_notes: 'Metadata sync. Alert is closed.',
      });
      break;

    case 'po_review_required':
    case 'unsafe_to_repair':
      actions.push({
        id: 'escalate_po',
        label: 'Escalate to Product Owner',
        action_type: 'escalate_to_po',
        available: true,
        requires_po_approval: true,
        closes_alert: false,
        creates_engineering_object: false,
        opens_workflow: 'integrity_resolution_workspace',
        description: 'Escalate to Product Owner for governed decision.',
        governance_notes: 'Alert remains open until PO decides.',
      });
      break;

    default:
      actions.push({
        id: 'defer',
        label: 'Defer and Monitor',
        action_type: 'defer_and_monitor',
        available: true,
        requires_po_approval: false,
        closes_alert: false,
        creates_engineering_object: false,
        opens_workflow: 'none',
        description: 'No action taken. The alert remains open.',
        governance_notes: 'Alert remains open.',
      });
  }

  return actions;
}

// ─── Investigation Outcome Summary ───────────────────────────────────────────

export interface InvestigationOutcomeStep {
  label: string;
  completed: boolean;
  detail: string;
}

export function buildInvestigationOutcome(
  recommendation: EngineeringRecommendation | null,
): InvestigationOutcomeStep[] {
  if (!recommendation) {
    return [
      { label: 'Reference detected', completed: true, detail: 'A reference was found in an Engineering source.' },
      { label: 'Investigation completed', completed: false, detail: 'Investigation in progress.' },
    ];
  }

  const steps: InvestigationOutcomeStep[] = [
    { label: 'Reference detected', completed: true, detail: 'A reference was found in an Engineering source.' },
  ];

  const hasEvidence = recommendation.evidence_used.length > 0;
  steps.push({
    label: 'Investigation completed',
    completed: true,
    detail: hasEvidence
      ? `${recommendation.evidence_used.length} evidence item(s) found across authoritative sources.`
      : 'No evidence items found in authoritative sources.',
  });

  steps.push({
    label: 'Authoritative evidence found',
    completed: recommendation.evidence_confidence > 0.3,
    detail: recommendation.evidence_confidence > 0.3
      ? `Evidence confidence: ${Math.round(recommendation.evidence_confidence * 100)}%`
      : 'No authoritative evidence confirms the object existed.',
  });

  steps.push({
    label: 'Recovery justified',
    completed: recommendation.recovery_justification === 'justified',
    detail: recommendation.recovery_justification === 'justified'
      ? 'Recovery is justified — positive evidence supports it.'
      : recommendation.recovery_justification === 'blocked_pending_po_decision'
        ? 'Evidence found but PO authorisation required.'
        : 'Recovery is not justified without positive evidence.',
  });

  return steps;
}

// ─── Resolution Lifecycle Validation ──────────────────────────────────────────

export function canTransitionTo(
  current: ResolutionStatus,
  target: ResolutionStatus,
): boolean {
  const order: Record<string, number> = {
    detected: 0,
    investigating: 1,
    decision_produced: 2,
    po_review: 3,
    resolution_selected: 4,
    resolution_executed: 5,
    repair_executed: 5,
    resolved: 6,
    archived: 7,
  };
  const currentIdx = order[current] ?? 0;
  const targetIdx = order[target] ?? 0;
  return targetIdx > currentIdx || (target === 'archived' && current === 'resolved');
}

export function getNextLifecycleState(
  action: GovernedResolutionActionType,
  closesAlert: boolean,
): ResolutionStatus {
  if (action === 'search_additional_evidence') return 'investigating';
  if (action === 'defer_and_monitor') return 'decision_produced';
  if (closesAlert) return 'resolved';
  return 'po_review';
}
