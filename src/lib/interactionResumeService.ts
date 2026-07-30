/**
 * Interaction Resume Service — EWO-033R.1 Phase 7
 *
 * When the PO returns to an engineering idea, this service detects the current
 * lifecycle stage and returns the correct resume card.
 *
 * The PO never needs to discover which page contains the next action.
 * ATD always knows the current state and presents the next governed decision.
 */

import { supabase } from './supabase';
import { InteractionLifecycleService } from './interactionLifecycleService';
import type { NextAction, LifecycleStage } from './interactionLifecycleService';
import { ProposalEngine } from './proposalEngine';
import type { EngineeringProposal } from './proposalEngine';
import { InteractionExecutionService } from './interactionExecutionService';
import type { ExecutionPreparationResult } from './interactionExecutionService';
import { InteractionCompletionService } from './interactionCompletionService';
import type { CompletionPackage } from './interactionCompletionService';
import { ConversationAssociationService } from './conversationAssociationService';
import { ConversationBoundaryGuard } from './conversationBoundaryGuard';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type ResumeCardType =
  | 'proposal'           // Show the engineering proposal for approval
  | 'execution_ready'    // Show execution ready card with Execute button
  | 'executing'          // Show live execution progress
  | 'completion'         // Show completion package for acceptance
  | 'closed'             // Show closed message
  | 'blocked'            // Show blocking reason
  | 'failed'             // Show failure with retry option
  | 'preparing'          // Show preparing message
  | 'idea_captured';     // Show idea captured, preparing proposal

export interface ResumeCard {
  type: ResumeCardType;
  lifecycleStage: LifecycleStage;
  nextAction: string;
  blockingReason: string | null;
  requiredPODecision: NextAction['requiredPODecision'];
  supportingRecords: NextAction['supportingRecords'];
  // Optional payloads depending on card type
  proposal?: EngineeringProposal;
  executionPreparation?: ExecutionPreparationResult;
  completionPackage?: CompletionPackage;
}

// ─── Service ────────────────────────────────────────────────────────────────────

export const InteractionResumeService = {
  /**
   * Resolve the correct resume card for an engineering idea.
   * This is the single entry point for resuming any engineering interaction.
   */
  async resumeInteraction(ideaId: string): Promise<ResumeCard> {
    const nextAction = await InteractionLifecycleService.resolveNextAction(ideaId);

    const baseCard: ResumeCard = {
      type: 'preparing',
      lifecycleStage: nextAction.currentStage,
      nextAction: nextAction.nextAction,
      blockingReason: nextAction.blockingReason,
      requiredPODecision: nextAction.requiredPODecision,
      supportingRecords: nextAction.supportingRecords,
    };

    switch (nextAction.currentStage) {
      case 'idea_captured':
      case 'preparing_proposal':
        return { ...baseCard, type: 'preparing' };

      case 'awaiting_proposal_approval': {
        // Load the proposal
        if (nextAction.supportingRecords.proposalId) {
          const proposal = await ProposalEngine.loadProposal(
            nextAction.supportingRecords.proposalId,
          );
          if (proposal) {
            return { ...baseCard, type: 'proposal', proposal };
          }
        }
        // Fallback: check by idea_id
        const { data: propRow } = await supabase
          .from('engineering_proposals')
          .select('id')
          .eq('idea_id', ideaId)
          .order('version', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (propRow) {
          const proposal = await ProposalEngine.loadProposal(propRow.id);
          if (proposal) {
            return { ...baseCard, type: 'proposal', proposal };
          }
        }
        return { ...baseCard, type: 'preparing' };
      }

      case 'ewo_created':
      case 'preparing_execution':
        return { ...baseCard, type: 'preparing' };

      case 'awaiting_execution_approval': {
        // Load execution preparation
        const ewoId = nextAction.supportingRecords.ewoId;
        if (ewoId) {
          const preparation = await InteractionExecutionService.prepareExecution(ewoId);
          return { ...baseCard, type: 'execution_ready', executionPreparation: preparation };
        }
        return { ...baseCard, type: 'preparing' };
      }

      case 'executing':
        return { ...baseCard, type: 'executing' };

      case 'validating':
        return { ...baseCard, type: 'executing' };

      case 'awaiting_acceptance': {
        // Load the completion package
        const executionId = nextAction.supportingRecords.executionId;
        if (executionId) {
          const completionPackage =
            await InteractionCompletionService.assembleCompletionPackage(executionId);
          if (completionPackage) {
            return { ...baseCard, type: 'completion', completionPackage };
          }
        }
        // Fallback: find the latest execution for this EWO
        const ewoId = nextAction.supportingRecords.ewoId;
        if (ewoId) {
          const { data: exec } = await supabase
            .from('engineering_executions')
            .select('id')
            .eq('ewo_id', ewoId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (exec) {
            const completionPackage =
              await InteractionCompletionService.assembleCompletionPackage(exec.id);
            if (completionPackage) {
              return { ...baseCard, type: 'completion', completionPackage };
            }
          }
        }
        return { ...baseCard, type: 'preparing' };
      }

      case 'accepted':
        return { ...baseCard, type: 'preparing' };

      case 'closed':
        return { ...baseCard, type: 'closed' };

      case 'blocked':
        return { ...baseCard, type: 'blocked' };

      case 'failed':
        return { ...baseCard, type: 'failed' };

      case 'archived':
        return { ...baseCard, type: 'closed' };

      default:
        return { ...baseCard, type: 'preparing' };
    }
  },

  /**
   * EWO-033R.4 — Resume from a conversation identifier.
   *
   * Uses the canonical conversation association to find the linked engineering
   * interaction and reconstruct the correct conversation card. This is the
   * primary resume path — the Product Owner returns to their conversation and
   * the correct card is restored from persisted state.
   */
  async resumeFromConversation(conversationId: string): Promise<ResumeCard | null> {
    const assoc = await ConversationAssociationService.findByConversationId(conversationId);
    if (!assoc) return null;

    // If we have an idea ID, use the full resume path
    if (assoc.ideaId) {
      return this.resumeInteraction(assoc.ideaId);
    }

    // If we have an EWO ID but no idea, try to find the idea
    if (assoc.ewoId) {
      const { data: ewo } = await supabase
        .from('engineering_work_orders')
        .select('idea_id')
        .eq('id', assoc.ewoId)
        .maybeSingle();
      if (ewo?.idea_id) {
        return this.resumeInteraction(ewo.idea_id as string);
      }
    }

    // Fallback — return a card based on the persisted lifecycle stage
    return {
      type: this.stageToCardType(assoc.lifecycleStage as LifecycleStage),
      lifecycleStage: assoc.lifecycleStage as LifecycleStage,
      nextAction: 'Resume this interaction to continue.',
      blockingReason: null,
      requiredPODecision: null,
      supportingRecords: {
        ideaId: assoc.ideaId,
        ideaRef: assoc.ideaRef,
        ewoId: assoc.ewoId,
        ewoRef: assoc.ewoRef,
        proposalId: assoc.proposalId,
        proposalRef: assoc.proposalRef,
        executionId: assoc.executionId,
      },
    };
  },

  /**
   * Validate that a resume card complies with the conversation boundary guard.
   * Returns violations if the card would require workspace navigation.
   */
  validateResumeCompliance(card: ResumeCard) {
    const hasResumable = ConversationBoundaryGuard.hasResumableCard(card.lifecycleStage);
    return ConversationBoundaryGuard.validate({
      currentStage: card.lifecycleStage,
      pendingDecision: card.requiredPODecision ?? null,
      conversationAction: card.nextAction,
      conversationIdentifier: null,
      actionAvailable: !!card.requiredPODecision,
      blockingReason: card.blockingReason,
      optionalInspectionLinks: [],
      hasResumableCard: hasResumable,
      nextActionIsWorkspaceRoute: false,
      hasConversationAssociation: true,
      conversationAssociationAmbiguous: false,
    });
  },

  /**
   * Map a lifecycle stage to a resume card type.
   */
  stageToCardType(stage: LifecycleStage): ResumeCardType {
    const map: Record<LifecycleStage, ResumeCardType> = {
      idea_captured: 'idea_captured',
      preparing_proposal: 'preparing',
      awaiting_proposal_approval: 'proposal',
      ewo_created: 'preparing',
      preparing_execution: 'preparing',
      awaiting_execution_approval: 'execution_ready',
      executing: 'executing',
      validating: 'executing',
      awaiting_acceptance: 'completion',
      accepted: 'completion',
      closed: 'closed',
      blocked: 'blocked',
      failed: 'failed',
      archived: 'closed',
    };
    return map[stage] ?? 'preparing';
  },
};
