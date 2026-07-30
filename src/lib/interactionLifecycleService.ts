/**
 * Interaction Lifecycle Service — EWO-033R.1 Phase 2
 *
 * Defines the high-level engineering lifecycle (revolving around the three
 * Product Owner decisions) and the canonical Next Action Resolver.
 *
 * Architectural Principle:
 * "The Product Owner should never need to know where they are in the engineering
 * process. ATD always knows the current lifecycle state and always presents the
 * next governed decision."
 *
 * Every interface (conversation, workspace, future channels) consumes this
 * resolver to determine what to show the PO next.
 */

import { supabase } from './supabase';

// ─── High-Level Lifecycle ──────────────────────────────────────────────────────

export type LifecycleStage =
  | 'idea_captured'
  | 'preparing_proposal'
  | 'awaiting_proposal_approval'
  | 'ewo_created'
  | 'preparing_execution'
  | 'awaiting_execution_approval'
  | 'executing'
  | 'validating'
  | 'awaiting_acceptance'
  | 'accepted'
  | 'closed'
  | 'blocked'
  | 'failed'
  | 'archived';

export type PODecisionType =
  | 'proposal_approval'
  | 'execution_approval'
  | 'completion_acceptance';

export type PODecisionValue = 'approved' | 'rejected' | 'changes_requested';

export interface NextAction {
  currentStage: LifecycleStage;
  completedStages: LifecycleStage[];
  nextAction: string;
  blockingReason: string | null;
  requiredPODecision: PODecisionType | null;
  supportingRecords: {
    ideaId?: string;
    ideaRef?: string;
    ewoId?: string;
    ewoRef?: string;
    proposalId?: string;
    proposalRef?: string;
    executionId?: string;
    sessionId?: string;
  };
  /** The in-conversation action available (never a workspace route) */
  conversationAction: string | null;
  /** The conversation identifier associated with this interaction */
  conversationIdentifier: string | null;
  /** Whether an actionable control is available in-conversation */
  actionAvailable: boolean;
  /** Optional inspection links (never required for progression) */
  optionalInspectionLinks: Array<{
    label: string;
    type: 'audit' | 'evidence' | 'diagnostics' | 'relationships' | 'technical_details' | 'execution_history' | 'work_order';
    targetRef?: string;
  }>;
}

// ─── Lifecycle ordering ────────────────────────────────────────────────────────

const STAGE_ORDER: LifecycleStage[] = [
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
];

// ─── EWO status → lifecycle stage mapping ───────────────────────────────────────

const EWO_STATUS_TO_STAGE: Record<string, LifecycleStage> = {
  draft: 'ewo_created',
  architecture_review: 'preparing_execution',
  engineering_approved: 'preparing_execution',
  po_approved: 'preparing_execution',
  ready: 'preparing_execution',
  in_progress: 'executing',
  engineering_validation: 'validating',
  engineering_complete: 'validating',
  engineering_verification: 'validating',
  verified: 'awaiting_acceptance',
  report_generated: 'awaiting_acceptance',
  po_acceptance: 'awaiting_acceptance',
  closed: 'closed',
  archived: 'archived',
};

// ─── Idea status → lifecycle stage mapping ──────────────────────────────────────

const IDEA_STATUS_TO_STAGE: Record<string, LifecycleStage> = {
  draft: 'idea_captured',
  active: 'preparing_proposal',
  queued_for_promotion: 'preparing_proposal',
  promoted: 'ewo_created',
  archived: 'archived',
  superseded: 'archived',
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function completedStagesUpTo(stage: LifecycleStage): LifecycleStage[] {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx < 0) return [];
  return STAGE_ORDER.slice(0, idx);
}

// ─── Canonical Next Action Resolver ─────────────────────────────────────────────

export const InteractionLifecycleService = {
  /**
   * Resolve the current lifecycle state and next action for an engineering idea.
   * This is the single canonical resolver — every interface consumes it.
   */
  async resolveNextAction(ideaId: string): Promise<NextAction> {
    // Load the idea
    const { data: idea, error: ideaErr } = await supabase
      .from('engineering_idea')
      .select('id, idea_ref, title, status, session_id, intent_id, related_ewo_refs')
      .eq('id', ideaId)
      .maybeSingle();

    if (ideaErr || !idea) {
      return {
        currentStage: 'blocked',
        completedStages: [],
        nextAction: 'Idea not found. Please create a new idea.',
        blockingReason: ideaErr?.message ?? 'Idea not found',
        requiredPODecision: null,
        supportingRecords: { ideaId },
        conversationAction: null,
        conversationIdentifier: null,
        actionAvailable: false,
        optionalInspectionLinks: [],
      };
    }

    // Check for an existing proposal
    const { data: proposal } = await supabase
      .from('engineering_proposals')
      .select('id, proposal_ref, status, ewo_id')
      .eq('idea_id', ideaId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    // If we have a proposal, resolve based on proposal + EWO state
    if (proposal) {
      return this.resolveFromProposal(idea, proposal);
    }

    // No proposal yet — map from idea status
    const ideaStage = IDEA_STATUS_TO_STAGE[idea.status] ?? 'idea_captured';

    // Check if there's a linked EWO (promoted idea)
    if (idea.status === 'promoted' && idea.related_ewo_refs?.length > 0) {
      const ewoRef = idea.related_ewo_refs[0];
      const { data: ewo } = await supabase
        .from('engineering_work_orders')
        .select('id, ewo_ref, status, implementation_status')
        .eq('ewo_ref', ewoRef)
        .maybeSingle();

      if (ewo) {
        return this.resolveFromEWO(idea, ewo, proposal ?? undefined);
      }
    }

    // No proposal, no EWO — still in the idea phase
    return {
      currentStage: ideaStage,
      completedStages: completedStagesUpTo(ideaStage),
      nextAction: ideaStage === 'idea_captured'
        ? 'Preparing engineering proposal. ATD is analysing your request...'
        : 'ATD will present an engineering proposal for your review.',
      blockingReason: null,
      requiredPODecision: null,
      supportingRecords: {
        ideaId: idea.id,
        ideaRef: idea.idea_ref,
        sessionId: idea.session_id ?? undefined,
      },
      conversationAction: null,
      conversationIdentifier: idea.session_id ?? null,
      actionAvailable: false,
      optionalInspectionLinks: [
        { label: 'View Audit Trail', type: 'audit', targetRef: idea.idea_ref },
      ],
    };
  },

  /**
   * Resolve lifecycle state when a proposal exists.
   */
  resolveFromProposal(
    idea: { id: string; idea_ref: string; session_id: string | null },
    proposal: { id: string; proposal_ref: string; status: string; ewo_id: string | null },
  ): NextAction {
    const base: NextAction = {
      currentStage: 'awaiting_proposal_approval',
      completedStages: completedStagesUpTo('awaiting_proposal_approval'),
      nextAction: 'Review the engineering proposal and choose: Approve, Request Changes, or Cancel.',
      blockingReason: null,
      requiredPODecision: 'proposal_approval',
      supportingRecords: {
        ideaId: idea.id,
        ideaRef: idea.idea_ref,
        proposalId: proposal.id,
        proposalRef: proposal.proposal_ref,
        sessionId: idea.session_id ?? undefined,
      },
      conversationAction: 'review_proposal',
      conversationIdentifier: idea.session_id ?? null,
      actionAvailable: true,
      optionalInspectionLinks: [
        { label: 'View Audit Trail', type: 'audit', targetRef: idea.idea_ref },
        { label: 'Inspect Engineering Work Order', type: 'work_order' },
        { label: 'View Evidence', type: 'evidence' },
      ],
    };

    if (proposal.status === 'approved' && proposal.ewo_id) {
      // Proposal approved — EWO created, move to execution preparation
      base.currentStage = 'preparing_execution';
      base.completedStages = completedStagesUpTo('preparing_execution');
      base.nextAction = 'Preparing execution. ATD is assembling the execution package...';
      base.requiredPODecision = null;
      base.supportingRecords.ewoId = proposal.ewo_id;
    } else if (proposal.status === 'rejected') {
      base.currentStage = 'archived';
      base.nextAction = 'Proposal rejected. This idea has been archived.';
      base.requiredPODecision = null;
    } else if (proposal.status === 'superseded') {
      base.currentStage = 'preparing_proposal';
      base.nextAction = 'ATD is updating the proposal based on your feedback...';
      base.requiredPODecision = null;
    }

    return base;
  },

  /**
   * Resolve lifecycle state from an EWO's status.
   */
  async resolveFromEWO(
    idea: { id: string; idea_ref: string },
    ewo: { id: string; ewo_ref: string; status: string; implementation_status?: string },
    proposal?: { id: string; proposal_ref: string },
  ): Promise<NextAction> {
    const ewoStage = EWO_STATUS_TO_STAGE[ewo.status] ?? 'ewo_created';

    // Check for active execution
    const { data: execution } = await supabase
      .from('engineering_executions')
      .select('id, implementation_status')
      .eq('ewo_id', ewo.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let stage = ewoStage;
    let nextAction = 'Continue to the next engineering step.';
    let requiredDecision: PODecisionType | null = null;
    let blockingReason: string | null = null;

    // Refine stage based on execution status
    if (execution) {
      const execStatus = execution.implementation_status;
      if (execStatus === 'running' || execStatus === 'submitted') {
        stage = 'executing';
        nextAction = 'Execution in progress. ATD will report when complete.';
      } else if (execStatus === 'awaiting_po_testing' || execStatus === 'completion_received') {
        stage = 'awaiting_acceptance';
        nextAction = 'Execution complete. Review the completion package and choose: Accept, Reject, or Request Refinement.';
        requiredDecision = 'completion_acceptance';
      } else if (execStatus === 'po_accepted' || execStatus === 'released') {
        stage = 'accepted';
        nextAction = 'Engineering work accepted. Completing governance...';
      } else if (execStatus === 'failed') {
        stage = 'failed';
        nextAction = 'Execution failed. ATD can help diagnose and retry.';
        blockingReason = 'Execution failed';
      } else if (execStatus === 'prepared') {
        stage = 'awaiting_execution_approval';
        nextAction = 'Execution is ready. Approve to begin execution.';
        requiredDecision = 'execution_approval';
      }
    }

    // If EWO is ready but no execution yet, we're awaiting execution approval
    if (ewo.status === 'ready' && !execution) {
      stage = 'awaiting_execution_approval';
      nextAction = 'Execution is ready. Approve to begin execution.';
      requiredDecision = 'execution_approval';
    }

    if (ewo.status === 'closed') {
      stage = 'closed';
      nextAction = 'Engineering Work Order closed.';
      requiredDecision = null;
    }

    const decision = requiredDecision as string | null;
    const conversationAction = decision === 'proposal_approval' ? 'review_proposal'
      : decision === 'execution_approval' ? 'approve_execution'
      : decision === 'completion_acceptance' ? 'accept_completion'
      : stage === 'executing' ? 'view_execution_progress'
      : stage === 'closed' ? null
      : null;

    const inspectionLinks: NextAction['optionalInspectionLinks'] = [
      { label: 'View Audit Trail', type: 'audit', targetRef: ewo.ewo_ref },
      { label: 'Inspect Engineering Work Order', type: 'work_order', targetRef: ewo.ewo_ref },
      { label: 'View Evidence', type: 'evidence' },
      { label: 'View Diagnostics', type: 'diagnostics' },
      { label: 'View Relationships', type: 'relationships' },
    ];
    if (execution) {
      inspectionLinks.push({ label: 'View Execution History', type: 'execution_history', targetRef: execution.id });
    }

    return {
      currentStage: stage,
      completedStages: completedStagesUpTo(stage),
      nextAction,
      blockingReason,
      requiredPODecision: requiredDecision,
      supportingRecords: {
        ideaId: idea.id,
        ideaRef: idea.idea_ref,
        ewoId: ewo.id,
        ewoRef: ewo.ewo_ref,
        proposalId: proposal?.id,
        proposalRef: proposal?.proposal_ref,
        executionId: execution?.id,
      },
      conversationAction,
      conversationIdentifier: null,
      actionAvailable: !!requiredDecision || stage === 'executing',
      optionalInspectionLinks: inspectionLinks,
    };
  },

  /**
   * Record a Product Owner decision in the governed po_decisions table.
   */
  async recordDecision(
    decisionType: PODecisionType,
    decision: PODecisionValue,
    options: {
      proposalId?: string;
      ewoId?: string;
      executionId?: string;
      notes?: string;
      decidedBy?: string;
      lifecycleStageBefore?: LifecycleStage;
      lifecycleStageAfter?: LifecycleStage;
      constitutionalValidation?: Record<string, unknown>;
    },
  ): Promise<{ id: string; decisionRef: string }> {
    const decisionRef = `DEC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

    const { data, error } = await supabase
      .from('po_decisions')
      .insert({
        decision_type: decisionType,
        decision_ref: decisionRef,
        proposal_id: options.proposalId ?? null,
        ewo_id: options.ewoId ?? null,
        execution_id: options.executionId ?? null,
        decision,
        notes: options.notes ?? null,
        decided_by: options.decidedBy ?? null,
        lifecycle_stage_before: options.lifecycleStageBefore ?? null,
        lifecycle_stage_after: options.lifecycleStageAfter ?? null,
        constitutional_validation: options.constitutionalValidation ?? {},
      })
      .select('id, decision_ref')
      .single();

    if (error) throw new Error(`Failed to record PO decision: ${error.message}`);

    return { id: data.id, decisionRef: data.decision_ref };
  },

  /**
   * Migrate existing ideas and EWOs into the new lifecycle.
   * Maps current wizard progress and EWO status into lifecycle stages.
   * This is a backfill — it does not modify existing records, only
   * creates engineering_proposals where appropriate to bridge the gap.
   */
  async migrateExistingIdeas(): Promise<{ migrated: number; skipped: number }> {
    // Load all promoted ideas that don't have a proposal yet
    const { data: ideas, error } = await supabase
      .from('engineering_idea')
      .select('id, idea_ref, title, description, status, related_ewo_refs, created_by')
      .eq('status', 'promoted');

    if (error || !ideas) return { migrated: 0, skipped: 0 };

    let migrated = 0;
    let skipped = 0;

    for (const idea of ideas) {
      // Check if a proposal already exists
      const { data: existing } = await supabase
        .from('engineering_proposals')
        .select('id')
        .eq('idea_id', idea.id)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      // Create a backfilled proposal (approved status, since the idea was already promoted)
      const proposalRef = `PROP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

      // Find the EWO
      let ewoId: string | null = null;
      if (idea.related_ewo_refs?.length > 0) {
        const { data: ewo } = await supabase
          .from('engineering_work_orders')
          .select('id')
          .eq('ewo_ref', idea.related_ewo_refs[0])
          .maybeSingle();
        ewoId = ewo?.id ?? null;
      }

      await supabase.from('engineering_proposals').insert({
        proposal_ref: proposalRef,
        idea_id: idea.id,
        ewo_id: ewoId,
        status: 'approved',
        analysis: { summary: idea.description ?? idea.title, backfilled: true },
        plan: { backfilled: true },
        scope: { backfilled: true },
        risks: [],
        dependencies: [],
        similarity_results: [],
        acceptance_criteria: [],
        constitutional_status: { backfilled: true },
        complexity: 'medium',
        impact: 'medium',
        po_decision: 'approved',
        po_decision_at: new Date().toISOString(),
        po_decision_by: idea.created_by,
        version: 1,
        refinement_history: [{ version: 1, change: 'Backfilled from existing promoted idea', timestamp: new Date().toISOString(), source: 'migration' }],
        created_by: idea.created_by,
      });

      migrated++;
    }

    return { migrated, skipped };
  },
};
