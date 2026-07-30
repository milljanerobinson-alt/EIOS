/**
 * EWO-033R.4 — Conversation Boundary Guard
 *
 * Governed architectural policy validator that determines whether a proposed
 * Product Owner workflow violates the conversation boundary rule.
 *
 * Constitutional Product Rule:
 * "Every Product Owner engineering lifecycle must be completable entirely within
 * the active conversation. Workspace interfaces may support inspection, audit,
 * evidence and diagnostics, but must never be required to continue, approve,
 * execute, refine, accept or close engineering work."
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ConversationBoundaryViolation {
  type: ViolationType;
  reason: string;
  context?: string;
}

export type ViolationType =
  | 'required_navigation_away'
  | 'missing_in_conversation_action'
  | 'no_resumable_card'
  | 'decision_only_in_workspace'
  | 'execution_only_outside_conversation'
  | 'completion_only_outside_conversation'
  | 'conversation_association_missing'
  | 'conversation_association_ambiguous'
  | 'redirect_after_decision'
  | 'workspace_route_as_required_action';

export interface ConversationActionInfo {
  /** The lifecycle stage the interaction is in */
  currentStage: string;
  /** The pending PO decision, if any */
  pendingDecision: string | null;
  /** The in-conversation action available to the PO */
  conversationAction: string | null;
  /** The conversation identifier associated with this interaction */
  conversationIdentifier: string | null;
  /** Whether an actionable control is available in-conversation */
  actionAvailable: boolean;
  /** Why the action is blocked, if it is */
  blockingReason: string | null;
  /** Optional inspection links (never required for progression) */
  optionalInspectionLinks: InspectionLink[];
  /** Whether a resumable conversation card exists for this stage */
  hasResumableCard: boolean;
  /** Whether the next required action resolves to a workspace route */
  nextActionIsWorkspaceRoute: boolean;
  /** Whether a conversation association exists */
  hasConversationAssociation: boolean;
  /** Whether the conversation association is ambiguous (multiple matches) */
  conversationAssociationAmbiguous: boolean;
}

export interface InspectionLink {
  label: string;
  type: 'audit' | 'evidence' | 'diagnostics' | 'relationships' | 'technical_details' | 'execution_history' | 'work_order';
  targetRef?: string;
  required: false;
}

export interface BoundaryGuardResult {
  passed: boolean;
  violations: ConversationBoundaryViolation[];
}

// ─── Prohibited workspace route patterns ────────────────────────────────────────

const PROHIBITED_ROUTE_PATTERNS = [
  /\/ecc\//i,
  /\/workspace\//i,
  /\/engineering-control-centre/i,
  /\/mission-control/i,
  /\/wizard/i,
  /\/backlog/i,
  /\/work-orders/i,
  /\/execution/i,
  /\/completion/i,
  /\/review/i,
];

const PROHIBITED_ACTION_LABELS = [
  'continue in workspace',
  'continue in wizard',
  'approve in workspace',
  'prepare execution in workspace',
  'execute in workspace',
  'review completion in workspace',
  'accept in workspace',
  'complete setup',
  'open another screen',
  'go to workspace',
  'navigate to workspace',
];

// ─── Guard ──────────────────────────────────────────────────────────────────────

export const ConversationBoundaryGuard = {
  /**
   * Validate a conversation action info object against the conversation
   * boundary rule. Returns violations if any are found.
   */
  validate(info: ConversationActionInfo): BoundaryGuardResult {
    const violations: ConversationBoundaryViolation[] = [];

    // 1. Required navigation away from conversation
    if (info.nextActionIsWorkspaceRoute) {
      violations.push({
        type: 'required_navigation_away',
        reason: 'The next required action resolves to a workspace route. The Product Owner must be able to progress without leaving the conversation.',
      });
    }

    // 2. Missing in-conversation action
    if (info.actionAvailable && !info.conversationAction) {
      violations.push({
        type: 'missing_in_conversation_action',
        reason: 'An action is available but no in-conversation action is defined. The Product Owner must not need to navigate elsewhere to act.',
      });
    }

    // 3. No resumable conversation card
    if (!info.hasResumableCard && info.actionAvailable) {
      violations.push({
        type: 'no_resumable_card',
        reason: `Lifecycle stage "${info.currentStage}" has no resumable conversation card. The Product Owner cannot resume this interaction in-conversation.`,
      });
    }

    // 4. Decision only in workspace
    if (info.pendingDecision && !info.conversationAction) {
      violations.push({
        type: 'decision_only_in_workspace',
        reason: `A pending decision ("${info.pendingDecision}") exists but no in-conversation action is available to resolve it.`,
      });
    }

    // 5. Conversation association missing
    if (!info.hasConversationAssociation) {
      violations.push({
        type: 'conversation_association_missing',
        reason: 'No canonical conversation association exists for this engineering interaction. Resume cannot reconstruct the correct conversation.',
      });
    }

    // 6. Conversation association ambiguous
    if (info.conversationAssociationAmbiguous) {
      violations.push({
        type: 'conversation_association_ambiguous',
        reason: 'Multiple conversation associations exist for this engineering interaction. A canonical conversation must be deterministically resolved.',
      });
    }

    // 7. Blocking reason without in-conversation recovery
    if (info.blockingReason && !info.conversationAction && !info.actionAvailable) {
      violations.push({
        type: 'missing_in_conversation_action',
        reason: `The interaction is blocked ("${info.blockingReason}") but no in-conversation recovery action is available.`,
      });
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  },

  /**
   * Validate a next-action route string to ensure it does not resolve to
   * a workspace route as a required action.
   */
  validateRoute(route: string | null | undefined): { isWorkspaceRoute: boolean; reason?: string } {
    if (!route) return { isWorkspaceRoute: false };
    for (const pattern of PROHIBITED_ROUTE_PATTERNS) {
      if (pattern.test(route)) {
        return {
          isWorkspaceRoute: true,
          reason: `Route "${route}" matches prohibited workspace pattern. Workspace routes may only be optional inspection links, never required actions.`,
        };
      }
    }
    return { isWorkspaceRoute: false };
  },

  /**
   * Validate an action label to ensure it does not contain prohibited
   * workspace-navigation language.
   */
  validateActionLabel(label: string | null | undefined): { isProhibited: boolean; reason?: string } {
    if (!label) return { isProhibited: false };
    const normalized = label.toLowerCase();
    for (const prohibited of PROHIBITED_ACTION_LABELS) {
      if (normalized.includes(prohibited)) {
        return {
          isProhibited: true,
          reason: `Action label "${label}" contains prohibited workspace-navigation language. The Product Owner must not be directed to leave the conversation.`,
        };
      }
    }
    return { isProhibited: false };
  },

  /**
   * Check whether a lifecycle stage has a resumable conversation card type.
   */
  hasResumableCard(stage: string): boolean {
    const RESUMABLE_STAGES = [
      'idea_captured',
      'preparing_proposal',
      'awaiting_proposal_approval',
      'ewo_created',
      'preparing_execution',
      'awaiting_execution_approval',
      'executing',
      'validating',
      'awaiting_acceptance',
      'accepted',
      'closed',
      'blocked',
      'failed',
    ];
    return RESUMABLE_STAGES.includes(stage);
  },

  /**
   * Produce the canonical constitutional rule text for display or audit.
   */
  constitutionalRule(): string {
    return 'Every Product Owner engineering lifecycle must be completable entirely within the active conversation. Workspace interfaces may support inspection, audit, evidence and diagnostics, but must never be required to continue, approve, execute, refine, accept or close engineering work.';
  },
};
