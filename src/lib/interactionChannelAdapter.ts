/**
 * Interaction Channel Adapter — EWO-033R.1 Phase 10
 *
 * The native EIOS chat channel adapter. Translates between the channel-agnostic
 * interaction protocol and the chat UI. This is the first concrete channel —
 * future adapters (ChatGPT, Teams, Slack) follow the same protocol.
 *
 * This adapter:
 * 1. Detects when a user message is an engineering idea ("I have an idea...")
 * 2. Triggers the Proposal Engine to auto-run the constitutional pipeline
 * 3. Renders the governed proposal, execution, and completion cards inline
 * 4. Handles the three PO decisions (approve/execute/accept) in-channel
 * 5. Resumes interactions at the correct lifecycle point
 */

import { supabase } from './supabase';
import { ProposalEngine } from './proposalEngine';
import type { EngineeringProposal, ProposalResult } from './proposalEngine';
import { ProposalRefinementService } from './proposalRefinementService';
import { InteractionExecutionService, PREPARATION_PHASES } from './interactionExecutionService';
import type { ExecutionProgressUpdate, PreparationPhaseUpdate } from './interactionExecutionService';
import { InteractionCompletionService } from './interactionCompletionService';
import { InteractionResumeService } from './interactionResumeService';
import type { ResumeCard, ResumeCardType } from './interactionResumeService';
import { InteractionPresentationFilter } from './interactionPresentationFilter';
import { InteractionLifecycleService } from './interactionLifecycleService';
import type { LifecycleStage } from './interactionLifecycleService';
import { ConversationAssociationService } from './conversationAssociationService';
import { ensureEngineeringWorkOrderExists } from './ensureEngineeringWorkOrder';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface InteractionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  interactionCard?: InteractionCard;
}

export type InteractionCard =
  | { type: 'proposal'; proposal: EngineeringProposal }
  | { type: 'proposal_refining'; changeDescription: string; proposal: EngineeringProposal }
  | { type: 'execution_ready'; ewoId: string; ewoRef: string; provider: string; estimatedImpact: string; filesAffected: string[]; validation: string[]; ready: boolean; blockingReasons: string[] }
  | { type: 'executing'; stages: ExecutionProgressUpdate[] }
  | { type: 'execution_failed'; error: string; ewoRef: string }
  | { type: 'completion'; summary: string; filesChanged: string[]; tests: Array<{ name: string; status: string }>; validation: Array<{ check: string; status: string }>; deploymentRecommendation: string; testInstructions: string[] }
  | { type: 'closed'; message: string }
  | { type: 'blocked'; reason: string }
  | { type: 'preparing'; message: string }
  | { type: 'preparing_execution'; phases: import('./interactionExecutionService').PreparationPhaseUpdate[]; failedPhase?: string; error?: string; elapsedMs?: number }
  | { type: 'preparing_timeout'; ideaId: string; conversationId?: string };

export interface ProcessMessageResult {
  messages: InteractionMessage[];
  ideaId?: string;
  proposalId?: string;
  ewoId?: string;
  ewoRef?: string;
  lifecycleStage?: string;
}

// EWO-033R.4 Correction 4: Preparation progress callback
export type PreparationProgressCallback = (
  phases: import('./interactionExecutionService').PreparationPhaseUpdate[],
) => void;

// ─── Idea detection ────────────────────────────────────────────────────────────

function isEngineeringIdea(message: string): boolean {
  const lower = message.toLowerCase().trim();
  if (lower.length < 10) return false;

  const ideaPatterns = [
    /\bi have an idea\b/,
    /\bi want to (add|build|create|implement|improve|fix|change)\b/,
    /\bi need to (add|build|create|implement|improve|fix|change)\b/,
    /\bwe should (add|build|create|implement|improve|fix|change)\b/,
    /\blet'?s (add|build|create|implement|improve|fix|change)\b/,
    /\bcan we (add|build|create|implement|improve|fix|change)\b/,
    /\bi'?d like to (add|build|create|implement|improve|fix|change)\b/,
  ];

  return ideaPatterns.some((p) => p.test(lower));
}

function isRefinementInstruction(message: string): boolean {
  const lower = message.toLowerCase().trim();
  const refinementPatterns = [
    /\b(reduce|narrow|trim|expand|broaden)\b.*\bscope\b/,
    /\b(ignore|exclude|skip)\b/,
    /\b(include|add|also)\b/,
    /\b(deploy|deployment|github|gitlab)\b/,
    /\b(priority|urgent|critical)\b/,
    /\b(approach|strategy|method)\b/,
    /\b(split|separate)\b.*\b(ewo|work order)\b/,
    /\brather\b/,
  ];
  return refinementPatterns.some((p) => p.test(lower));
}

function isApproval(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return /\b(approve|approved|proceed|go ahead|looks good|let'?s do it)\b/.test(lower);
}

function isRejection(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return /\b(reject|rejected|no|cancel|abort)\b/.test(lower);
}

function isChangesRequest(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return /\b(changes|change|modify|update|adjust|refine|different)\b/.test(lower) && !isApproval(lower);
}

function isExecuteCommand(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return /\b(execute|run|start|launch|begin|go)\b/.test(lower);
}

function isAcceptCommand(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return /\b(accept|accepted|ship it|looks great|well done)\b/.test(lower);
}

// ─── Channel Adapter ────────────────────────────────────────────────────────────

export const InteractionChannelAdapter = {
  /**
   * Process an incoming user message and produce interaction messages.
   * This is the main entry point for the native EIOS chat channel.
   */
  async processMessage(
    message: string,
    context: { userId?: string; ideaId?: string; proposalId?: string; ewoId?: string; conversationId?: string },
    options?: { onPreparationProgress?: PreparationProgressCallback },
  ): Promise<ProcessMessageResult> {
    // If we have an existing idea, check for refinement/decision messages
    if (context.ideaId) {
      return this.processExistingInteraction(message, { ...context, ideaId: context.ideaId }, options);
    }

    // New idea detection
    if (isEngineeringIdea(message)) {
      return this.startNewProposal(message, context);
    }

    // Default: not an engineering interaction
    return {
      messages: [
        {
          role: 'assistant',
          content: 'I can help you with engineering ideas. Tell me what you\'d like to build or improve, and I\'ll prepare an engineering proposal for you.',
        },
      ],
    };
  },

  /**
   * Start a new engineering proposal from a natural-language idea.
   */
  async startNewProposal(
    message: string,
    context: { userId?: string; conversationId?: string },
  ): Promise<ProcessMessageResult> {
    const preparingMsg: InteractionMessage = {
      role: 'assistant',
      content: 'I\'m analysing your request and preparing an engineering proposal. This includes guardian validation, memory search, and similarity review...',
    };

    try {
      const result = await ProposalEngine.generateProposal({
        userMessage: message,
        userId: context.userId,
        onProgress: () => {
          // Progress is tracked by the UI — no action needed here
        },
      });

      const filtered = InteractionPresentationFilter.filterProposal(result.proposal);

      const proposalCard: InteractionCard = {
        type: 'proposal',
        proposal: result.proposal,
      };

      const proposalMsg: InteractionMessage = {
        role: 'assistant',
        content: `I've prepared an engineering proposal for your review.\n\n**${filtered.title}**\n\n${filtered.summary}\n\n**Approach:** ${filtered.plan.approach}\n**Complexity:** ${filtered.complexity} | **Impact:** ${filtered.impact}\n\nPlease review and choose: **Approve**, **Request Changes**, or **Cancel**.`,
        interactionCard: proposalCard,
      };

      // EWO-033R.4: Persist conversation association BEFORE any lifecycle progression
      if (context.conversationId && result.proposal.ideaId) {
        await ConversationAssociationService.upsert({
          conversationId: context.conversationId,
          ideaId: result.proposal.ideaId,
          proposalId: result.proposal.id,
          ideaRef: result.proposal.ideaRef,
          proposalRef: result.proposal.proposalRef ?? undefined,
          ewoRef: result.proposal.ewoRef ?? undefined,
          lifecycleStage: 'awaiting_proposal_approval',
          pendingDecision: 'proposal_approval',
          lastInteractionCard: { type: 'proposal' },
        });
      }

      return {
        messages: [preparingMsg, proposalMsg],
        ideaId: result.proposal.ideaId,
        proposalId: result.proposal.id,
        ewoRef: result.proposal.ewoRef ?? undefined,
        lifecycleStage: 'awaiting_proposal_approval',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        messages: [
          preparingMsg,
          {
            role: 'assistant',
            content: `I encountered an issue while preparing the proposal: ${msg}. Please try again or rephrase your idea.`,
          },
        ],
      };
    }
  },

  /**
   * Process a message in an existing interaction (refinement, approval, execution, etc.)
   */
  async processExistingInteraction(
    message: string,
    context: { userId?: string; ideaId: string; proposalId?: string; ewoId?: string; conversationId?: string },
    options?: { onPreparationProgress?: PreparationProgressCallback },
  ): Promise<ProcessMessageResult> {
    // EWO-033R.4 Correction 4: Skip resume for approval/execute commands — we know
    // the intent from the message itself. Calling resumeInteraction here would make
    // 6+ Supabase queries (including the one that returns HTTP 400) and can hang
    // indefinitely if the backend is slow. The approval handler creates the EWO
    // directly and runs preparation — no resume needed.
    const isApprovalMsg = isApproval(message) || message === '%%APPROVE%%';
    const isExecuteMsg = isExecuteCommand(message) || isApproval(message);
    const isRejectMsg = isRejection(message) || message === '%%CANCEL%%';

    if (!isApprovalMsg && !isExecuteMsg && !isRejectMsg) {
      // Only call resume for non-decision messages (refinement, status queries, etc.)
      const resumeCard = await InteractionResumeService.resumeInteraction(context.ideaId);

      switch (resumeCard.type) {
        case 'proposal':
          return this.handleProposalStageMessage(message, context, resumeCard);

        case 'execution_ready':
          return this.handleExecutionApprovalMessage(message, context, resumeCard);

        case 'executing':
          return {
            messages: [{
              role: 'assistant',
              content: 'Execution is in progress. I\'ll let you know when it\'s complete.',
            }],
          };

        case 'completion':
          return this.handleCompletionMessage(message, context, resumeCard);

        case 'preparing':
          if (context.proposalId && isRefinementInstruction(message)) {
            return this.handleRefinement(message, { userId: context.userId, proposalId: context.proposalId });
          }
          return {
            messages: [{
              role: 'assistant',
              content: resumeCard.nextAction,
            }],
          };

        case 'closed':
          return {
            messages: [{
              role: 'assistant',
              content: 'This engineering work has been completed and closed.',
            }],
          };

        case 'blocked':
          return {
            messages: [{
              role: 'assistant',
              content: `This engineering work is blocked: ${resumeCard.blockingReason ?? 'unknown reason'}.`,
            }],
          };

        case 'failed':
          return {
            messages: [{
              role: 'assistant',
              content: 'The previous execution failed. Would you like me to try again?',
            }],
          };

        default:
          return {
            messages: [{
              role: 'assistant',
              content: resumeCard.nextAction,
            }],
          };
      }
    }

    // For approval/execute/reject messages, we need the proposal stage to proceed.
    // Construct a minimal resume card from context — no backend queries needed.
    const resumeCard: ResumeCard = {
      type: context.proposalId ? 'proposal' : 'preparing',
      lifecycleStage: 'awaiting_proposal_approval',
      nextAction: 'Processing your decision...',
      blockingReason: null,
      requiredPODecision: 'proposal_approval',
      supportingRecords: {
        ideaId: context.ideaId,
        proposalId: context.proposalId,
        ewoId: context.ewoId,
      },
    };

    if (isApprovalMsg && context.proposalId) {
      return this.handleProposalStageMessage(message, context, resumeCard, options);
    }

    // Execute or reject on an existing execution_ready state
    if (isExecuteMsg || isRejectMsg) {
      return this.handleExecutionApprovalMessage(message, context, resumeCard);
    }

    return {
      messages: [{
        role: 'assistant',
        content: 'I\'m not sure what you\'d like to do. Could you rephrase?',
      }],
    };
  },

  /**
   * Handle messages when a proposal is awaiting approval.
   */
  async handleProposalStageMessage(
    message: string,
    context: { userId?: string; ideaId: string; proposalId?: string; conversationId?: string },
    resumeCard: ResumeCard,
    options?: { onPreparationProgress?: PreparationProgressCallback },
  ): Promise<ProcessMessageResult> {
    if (!context.proposalId) {
      return { messages: [{ role: 'assistant', content: 'I cannot find the proposal. Please try again.' }] };
    }

    // Check for approval
    if (isApproval(message)) {
      await ProposalEngine.recordProposalDecision(context.proposalId, 'approved', {
        decidedBy: context.userId,
      });

      // EWO-033R.4 Correction 2: Ensure a governed EWO exists BEFORE execution preparation.
      // The proposal carries an ewoRef from the constitutional pipeline; if no canonical
      // EWO has been materialised yet, create it now via the governed entry point.
      const proposal = await ProposalEngine.loadProposal(context.proposalId);
      let ewoId = proposal?.ewoId ?? undefined;
      let ewoRef = proposal?.ewoRef ?? undefined;

      if (!ewoRef) {
        // No ewoRef on the proposal — generate one and persist it
        ewoRef = `EWO-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      }

      if (!ewoId) {
        const ensureResult = await ensureEngineeringWorkOrderExists(
          ewoRef,
          proposal?.plan?.executiveSummary ?? `Engineering Work Order for ${proposal?.ideaRef ?? context.ideaId}`,
          proposal?.analysis?.summary ?? 'Engineering implementation requested by Product Owner',
          {
            implementationProvider: 'codex',
            priority: proposal?.complexity === 'critical' ? 'critical' : proposal?.complexity === 'high' ? 'high' : 'medium',
            riskLevel: proposal?.impact === 'critical' ? 'critical' : proposal?.impact === 'high' ? 'high' : 'medium',
          },
        );
        if (!ensureResult.success || !ensureResult.ewoId) {
          return {
            messages: [{
              role: 'assistant',
              content: `I couldn't create the Engineering Work Order: ${ensureResult.error}. The engineering state is still safe. You can retry or inspect the technical details.`,
              interactionCard: { type: 'execution_failed', error: ensureResult.error ?? 'EWO creation failed', ewoRef: ewoRef ?? '' },
            }],
            proposalId: context.proposalId,
            lifecycleStage: 'failed',
          };
        }
        ewoId = ensureResult.ewoId;
        ewoRef = ensureResult.ewoRef ?? ewoRef;
      }

      // EWO-033R.4: Update conversation association to preparing_execution
      if (context.conversationId) {
        await ConversationAssociationService.upsert({
          conversationId: context.conversationId,
          ideaId: context.ideaId,
          proposalId: context.proposalId,
          ewoId,
          ewoRef,
          lifecycleStage: 'preparing_execution',
          pendingDecision: null,
          lastInteractionCard: { type: 'preparing_execution', phases: [] },
        });
      }

      // EWO-033R.4 Correction 4: Emit initial preparing_execution phases before starting
      options?.onPreparationProgress?.(
        PREPARATION_PHASES.map(p => ({ ...p, status: 'pending' as const })),
      );

      // EWO-033R.4: Actually start execution preparation with timeout
      try {
        const prepResult = await this.prepareExecutionWithTimeout(ewoId!, ewoRef!, context.ideaId, context.conversationId, options);

        if (prepResult.timedOut) {
          return {
            messages: [{
              role: 'assistant',
              content: 'Preparation is taking longer than expected. You can try again, keep waiting, or cancel.',
              interactionCard: { type: 'preparing_timeout', ideaId: context.ideaId, conversationId: context.conversationId },
            }],
            proposalId: context.proposalId,
            lifecycleStage: 'preparing_execution',
          };
        }

        if (prepResult.error) {
          return {
            messages: [{
              role: 'assistant',
              content: `I couldn't prepare the execution: ${prepResult.error}. Would you like me to try again?`,
              interactionCard: { type: 'execution_failed', error: prepResult.error, ewoRef: '' },
            }],
            proposalId: context.proposalId,
            lifecycleStage: 'failed',
          };
        }

        // Preparation succeeded — check readiness before presenting Execution Ready
        const prepEwoId = prepResult.ewoId;
        const prepEwoRef = prepResult.ewoRef;
        const prepData = prepResult.executionReady as Record<string, unknown> | undefined;
        const isReady = typeof prepData?.ready === 'boolean' ? prepData.ready : true;
        const prepBlockingReasons: string[] = Array.isArray(prepData?.blockingReasons) ? prepData.blockingReasons as string[] : [];

        // EWO-033R.4 Correction 6: Exactly ONE execution readiness state may exist.
        // If readiness validation failed, produce a Blocked card — NOT an Execution
        // Ready card. Previously the adapter always produced execution_ready even
        // when ready=false, causing contradictory states ("prepared and ready" +
        // "not ready to execute yet").
        if (!isReady) {
          // Update association to blocked
          if (context.conversationId) {
            await ConversationAssociationService.upsert({
              conversationId: context.conversationId,
              ideaId: context.ideaId,
              proposalId: context.proposalId,
              ewoId: prepEwoId,
              ewoRef: prepEwoRef,
              lifecycleStage: 'blocked',
              pendingDecision: null,
              lastInteractionCard: { type: 'blocked' },
            });
          }

          return {
            messages: [{
              role: 'assistant',
              content: 'Execution cannot begin yet. Some prerequisites need to be resolved first.',
              interactionCard: {
                type: 'blocked',
                reason: prepBlockingReasons.length > 0
                  ? prepBlockingReasons.join('; ')
                  : 'Execution readiness validation failed. No specific blocking reason was returned. Please retry or contact support.',
              },
            }],
            proposalId: context.proposalId,
            ewoId: prepEwoId,
            ewoRef: prepEwoRef,
            lifecycleStage: 'blocked',
          };
        }

        // Readiness validated — construct the Execution Ready card
        const execCard: InteractionCard = {
          type: 'execution_ready',
          ewoId: prepEwoId ?? '',
          ewoRef: prepEwoRef ?? (typeof prepData?.ewoRef === 'string' ? prepData.ewoRef : ''),
          provider: typeof prepData?.provider === 'string' ? prepData.provider : '',
          estimatedImpact: typeof prepData?.estimatedImpact === 'string' ? prepData.estimatedImpact : '',
          filesAffected: Array.isArray(prepData?.filesAffected) ? prepData.filesAffected as string[] : [],
          validation: Array.isArray(prepData?.validation) ? prepData.validation as string[] : [],
          ready: true,
          blockingReasons: [],
        };

        // Update association to awaiting_execution_approval
        if (context.conversationId) {
          await ConversationAssociationService.upsert({
            conversationId: context.conversationId,
            ideaId: context.ideaId,
            proposalId: context.proposalId,
            ewoId: prepEwoId,
            ewoRef: prepEwoRef,
            lifecycleStage: 'awaiting_execution_approval',
            pendingDecision: 'execution_approval',
            lastInteractionCard: { type: 'execution_ready' },
          });
        }

        return {
          messages: [{
            role: 'assistant',
            content: 'Execution is prepared and ready. Review the details below and choose: **Execute** or **Not Yet**.',
            interactionCard: execCard,
          }],
          proposalId: context.proposalId,
          ewoId: prepEwoId,
          ewoRef: prepEwoRef,
          lifecycleStage: 'awaiting_execution_approval',
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          messages: [{
            role: 'assistant',
            content: `I encountered an issue while preparing execution: ${msg}. Please try again.`,
            interactionCard: { type: 'execution_failed', error: msg, ewoRef: '' },
          }],
          proposalId: context.proposalId,
          lifecycleStage: 'failed',
        };
      }
    }

    // Check for rejection
    if (isRejection(message)) {
      await ProposalEngine.recordProposalDecision(context.proposalId, 'rejected', {
        decidedBy: context.userId,
      });

      // EWO-033R.4: Update conversation association to archived
      if (context.conversationId) {
        const assoc = await ConversationAssociationService.findCanonical(context.ideaId);
        if (assoc) {
          await ConversationAssociationService.updateStage(assoc.id, 'archived', null);
        }
      }

      return {
        messages: [{
          role: 'assistant',
          content: 'Proposal cancelled. The idea has been archived. You can start a new idea anytime.',
        }],
      };
    }

    // Everything else is treated as a refinement request
    return this.handleRefinement(message, { userId: context.userId, proposalId: context.proposalId });
  },

  /**
   * Handle a refinement instruction.
   */
  async handleRefinement(
    message: string,
    context: { userId?: string; proposalId: string },
  ): Promise<ProcessMessageResult> {
    try {
      const result = await ProposalRefinementService.refineProposal({
        proposalId: context.proposalId,
        instruction: message,
        userId: context.userId,
      });

      const filtered = InteractionPresentationFilter.filterProposal(result.proposal);

      return {
        messages: [{
          role: 'assistant',
          content: `I've updated the proposal based on your feedback: ${result.changeDescription}.\n\n**${filtered.title}**\n\n${filtered.summary}\n\nPlease review and choose: **Approve**, **Request Changes**, or **Cancel**.`,
          interactionCard: {
            type: 'proposal_refining',
            changeDescription: result.changeDescription,
            proposal: result.proposal,
          },
        }],
        proposalId: context.proposalId,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        messages: [{
          role: 'assistant',
          content: `I couldn't update the proposal: ${msg}. Please try rephrasing your request.`,
        }],
      };
    }
  },

  /**
   * Handle execution approval messages.
   */
  async handleExecutionApprovalMessage(
    message: string,
    context: { userId?: string; ideaId: string; ewoId?: string; proposalId?: string; conversationId?: string },
    resumeCard: ResumeCard,
  ): Promise<ProcessMessageResult> {
    // EWO-033R.4 Correction 7: Use the canonical ewoId from the execution contract.
    // The ewoId is passed through the context (from the Execution Ready card's
    // persisted metadata) and the resume card's supporting records.
    // Previously only resumeCard.supportingRecords.ewoId was checked, which was
    // undefined because the page never stored ewoId in message metadata.
    const ewoId = resumeCard.supportingRecords.ewoId ?? context.ewoId;
    if (!ewoId) {
      // EWO-033R.4 Correction 7: Governed blocked recovery — not a bare error.
      return {
        messages: [{
          role: 'assistant',
          content: 'Execution cannot begin because the Engineering Work Order context could not be restored. This may happen after a long period of inactivity. You can prepare the execution again or cancel.',
          interactionCard: {
            type: 'blocked',
            reason: 'The Engineering Work Order referenced by this conversation could not be found. The execution context may have expired or been archived. You can prepare the execution again to create a fresh context.',
          },
        }],
        lifecycleStage: 'blocked',
      };
    }

    if (isExecuteCommand(message) || isApproval(message)) {
      // EWO-033R.4 Correction 7: Idempotency — check for existing active execution.
      // Prevents duplicate execution from repeated Execute clicks, refresh after
      // clicking, or retry after network interruption.
      const { data: existingExec } = await supabase
        .from('engineering_executions')
        .select('id, implementation_status, execution_ref')
        .eq('ewo_id', ewoId)
        .in('implementation_status', ['running', 'queued', 'completed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingExec) {
        // Execution already started or completed — resume instead of duplicate
        if (existingExec.implementation_status === 'completed') {
          // EWO-033R.4 Correction 8: Assemble the completion package for the
          // already-completed execution, not just a progress card.
          const completion = await InteractionCompletionService.assembleCompletionPackage(existingExec.id);
          if (completion) {
            const filtered = InteractionPresentationFilter.filterCompletion(completion);
            return {
              messages: [{
                role: 'assistant',
                content: `Execution has already completed. Here's your completion package.\n\n**Summary:** ${filtered.summary}\n**Files changed:** ${filtered.filesChanged.length}\n\nPlease choose: **Accept**, **Reject**, or **Request Refinement**.`,
                interactionCard: {
                  type: 'completion',
                  summary: filtered.summary,
                  filesChanged: filtered.filesChanged,
                  tests: filtered.tests,
                  validation: filtered.validation,
                  deploymentRecommendation: filtered.deploymentRecommendation,
                  testInstructions: filtered.testInstructions,
                },
              }],
              ewoId,
              ewoRef: resumeCard.supportingRecords.ewoRef,
              lifecycleStage: 'awaiting_acceptance',
            };
          }
          // Fallback if completion package cannot be assembled
          return {
            messages: [{
              role: 'assistant',
              content: 'Execution has already completed. The completion package is being assembled...',
              interactionCard: { type: 'executing', stages: [] },
            }],
            ewoId,
            ewoRef: resumeCard.supportingRecords.ewoRef,
            lifecycleStage: 'awaiting_acceptance',
          };
        }
        // Running/queued — show progress
        return {
          messages: [{
            role: 'assistant',
            content: 'Execution is already in progress. I\'ll let you know when it completes.',
            interactionCard: { type: 'executing', stages: [] },
          }],
          ewoId,
          ewoRef: resumeCard.supportingRecords.ewoRef,
          lifecycleStage: 'executing',
        };
      }

      // Launch execution
      const stages: ExecutionProgressUpdate[] = [
        { stage: 'preparing_context', label: 'Preparing Context', status: 'pending' },
        { stage: 'selecting_provider', label: 'Selecting Provider', status: 'pending' },
        { stage: 'executing', label: 'Executing', status: 'pending' },
        { stage: 'running_tests', label: 'Running Tests', status: 'pending' },
        { stage: 'validating', label: 'Validating', status: 'pending' },
        { stage: 'building_completion', label: 'Building Completion Package', status: 'pending' },
      ];

      const result = await InteractionExecutionService.launchExecution(ewoId, {
        userId: context.userId,
        onProgress: (update) => {
          const idx = stages.findIndex((s) => s.stage === update.stage);
          if (idx >= 0) stages[idx] = update;
        },
      });

      if (result.success) {
        // EWO-033R.4 Correction 8: Assemble the completion package and return a
        // completion card — NOT an executing progress card. Previously the adapter
        // returned an executing card saying "I'm assembling the completion package..."
        // and stopped there, so the Product Owner never saw the completion package.
        let completionCard: InteractionCard;
        let content: string;
        let lifecycleStage: string;

        if (result.executionId) {
          const completion = await InteractionCompletionService.assembleCompletionPackage(result.executionId);
          if (completion) {
            const filtered = InteractionPresentationFilter.filterCompletion(completion);
            content = `Execution complete. Here's your completion package.\n\n**Summary:** ${filtered.summary}\n**Files changed:** ${filtered.filesChanged.length}\n**Tests:** ${filtered.tests.length}\n\nPlease choose: **Accept**, **Reject**, or **Request Refinement**.`;
            completionCard = {
              type: 'completion',
              summary: filtered.summary,
              filesChanged: filtered.filesChanged,
              tests: filtered.tests,
              validation: filtered.validation,
              deploymentRecommendation: filtered.deploymentRecommendation,
              testInstructions: filtered.testInstructions,
            };
            lifecycleStage = 'awaiting_acceptance';

            // EWO-033R.4 Correction 8: Update the conversation association with the
            // execution ID so resume/refresh can reconstruct the completion card.
            if (context.conversationId) {
              await ConversationAssociationService.upsert({
                conversationId: context.conversationId,
                ideaId: context.ideaId,
                proposalId: context.proposalId,
                ewoId,
                ewoRef: result.ewoRef,
                executionId: result.executionId,
                lifecycleStage: 'awaiting_acceptance',
                pendingDecision: 'completion_acceptance',
                lastInteractionCard: { type: 'completion' },
              });
            }
          } else {
            // Completion package could not be assembled — show a governed blocked card
            content = 'Execution completed but the completion package could not be assembled. You can retry or contact support.';
            completionCard = {
              type: 'blocked',
              reason: 'Execution completed but the completion package could not be assembled. The execution record may be incomplete. Please retry or contact support.',
            };
            lifecycleStage = 'blocked';
          }
        } else {
          // No execution ID — show a governed blocked card
          content = 'Execution completed but the execution record could not be found. Please retry or contact support.';
          completionCard = {
            type: 'blocked',
            reason: 'Execution completed but the execution ID was not captured. The execution record may need to be looked up manually. Please retry or contact support.',
          };
          lifecycleStage = 'blocked';
        }

        return {
          messages: [{
            role: 'assistant',
            content,
            interactionCard: completionCard,
          }],
          ewoId,
          ewoRef: result.ewoRef,
          lifecycleStage,
        };
      } else {
        return {
          messages: [{
            role: 'assistant',
            content: `Execution failed: ${result.error}. Would you like me to try again?`,
            interactionCard: { type: 'execution_failed', error: result.error ?? 'Unknown error', ewoRef: result.ewoRef },
          }],
          ewoId,
          lifecycleStage: 'failed',
        };
      }
    }

    if (isRejection(message)) {
      return {
        messages: [{
          role: 'assistant',
          content: 'Execution cancelled. You can approve it later when you\'re ready.',
        }],
      };
    }

    return {
      messages: [{
        role: 'assistant',
        content: 'Execution is ready. Would you like me to proceed? Say **Execute** to begin, or **Cancel** to hold.',
      }],
    };
  },

  /**
   * Handle completion acceptance messages.
   */
  async handleCompletionMessage(
    message: string,
    context: { userId?: string; ideaId: string; conversationId?: string },
    resumeCard: ResumeCard,
  ): Promise<ProcessMessageResult> {
    const executionId = resumeCard.supportingRecords.executionId;
    if (!executionId) {
      return { messages: [{ role: 'assistant', content: 'I cannot find the execution to accept. Please try again.' }] };
    }

    if (isAcceptCommand(message) || isApproval(message)) {
      const result = await InteractionCompletionService.acceptCompletion(executionId, {
        userId: context.userId,
      });

      if (result.success) {
        const assoc = await ConversationAssociationService.findCanonical(context.ideaId);
        if (assoc) {
          await ConversationAssociationService.updateStage(assoc.id, 'closed', null);
        }
      }

      return {
        messages: [{
          role: 'assistant',
          content: result.success
            ? result.message
            : `Failed to accept: ${result.error}. Please try again.`,
          interactionCard: result.success
            ? { type: 'closed', message: result.message }
            : undefined,
        }],
      };
    }

    if (isRejection(message)) {
      const result = await InteractionCompletionService.rejectCompletion(executionId, {
        userId: context.userId,
      });

      if (result.success) {
        const assoc = await ConversationAssociationService.findCanonical(context.ideaId);
        if (assoc) {
          await ConversationAssociationService.updateStage(assoc.id, 'failed', null);
        }
      }

      return {
        messages: [{
          role: 'assistant',
          content: result.message,
        }],
      };
    }

    if (isChangesRequest(message)) {
      const result = await InteractionCompletionService.requestRefinement(executionId, {
        userId: context.userId,
      });

      if (result.success) {
        const assoc = await ConversationAssociationService.findCanonical(context.ideaId);
        if (assoc) {
          await ConversationAssociationService.updateStage(assoc.id, 'preparing_execution', null);
        }
      }

      return {
        messages: [{
          role: 'assistant',
          content: result.message,
        }],
      };
    }

    return {
      messages: [{
        role: 'assistant',
        content: 'Execution is complete. Please review the completion package and choose: **Accept**, **Reject**, or **Request Refinement**.',
      }],
    };
  },

  /**
   * Resume an interaction — returns the correct card for the current lifecycle stage.
   */
  async resumeInteraction(ideaId: string): Promise<{ card: ResumeCard; message: InteractionMessage }> {
    const card = await InteractionResumeService.resumeInteraction(ideaId);

    let content = card.nextAction;
    let interactionCard: InteractionCard | undefined;

    switch (card.type) {
      case 'proposal':
        if (card.proposal) {
          const filtered = InteractionPresentationFilter.filterProposal(card.proposal);
          content = `Here's your engineering proposal for review.\n\n**${filtered.title}**\n\n${filtered.summary}\n\nPlease choose: **Approve**, **Request Changes**, or **Cancel**.`;
          interactionCard = { type: 'proposal', proposal: card.proposal };
        }
        break;
      case 'execution_ready':
        if (card.executionPreparation) {
          const filtered = InteractionPresentationFilter.filterExecutionReady(card.executionPreparation);
          // EWO-033R.4 Correction 6: If readiness validation failed, produce a
          // Blocked card — NOT an Execution Ready card. This prevents contradictory
          // states on resume/refresh.
          if (!filtered.ready) {
            content = 'Execution cannot begin yet. Some prerequisites need to be resolved first.';
            interactionCard = {
              type: 'blocked',
              reason: filtered.blockingReasons.length > 0
                ? filtered.blockingReasons.join('; ')
                : 'Execution readiness validation failed. No specific blocking reason was returned. Please retry or contact support.',
            };
          } else {
            content = `Execution is ready.\n\n**Provider:** ${filtered.provider}\n**Impact:** ${filtered.estimatedImpact}\n\nSay **Execute** to begin.`;
            interactionCard = {
              type: 'execution_ready',
              ewoId: card.executionPreparation.ewoId,
              ewoRef: card.executionPreparation.ewoRef,
              provider: filtered.provider,
              estimatedImpact: filtered.estimatedImpact,
              filesAffected: filtered.filesAffected,
              validation: filtered.validation,
              ready: true,
              blockingReasons: [],
            };
          }
        }
        break;
      case 'completion':
        if (card.completionPackage) {
          const filtered = InteractionPresentationFilter.filterCompletion(card.completionPackage);
          content = `Execution complete. Here's your completion package.\n\n**Summary:** ${filtered.summary}\n**Files changed:** ${filtered.filesChanged.length}\n**Tests:** ${filtered.tests.length}\n\nPlease choose: **Accept**, **Reject**, or **Request Refinement**.`;
          interactionCard = {
            type: 'completion',
            summary: filtered.summary,
            filesChanged: filtered.filesChanged,
            tests: filtered.tests,
            validation: filtered.validation,
            deploymentRecommendation: filtered.deploymentRecommendation,
            testInstructions: filtered.testInstructions,
          };
        }
        break;
      case 'closed':
        interactionCard = { type: 'closed', message: card.nextAction };
        break;
      case 'blocked':
        interactionCard = { type: 'blocked', reason: card.blockingReason ?? 'Unknown' };
        break;
      case 'preparing':
        interactionCard = { type: 'preparing', message: card.nextAction };
        break;
    }

    // EWO-033R.4 Correction 5: Mandatory interaction cards must NEVER degrade to
    // plain assistant text. If the card type is a mandatory lifecycle stage but
    // the card wasn't constructed (e.g. missing proposal data), show a governed
    // recovery card instead of silently falling back to plain text.
    const MANDATORY_STAGES: ResumeCardType[] = ['proposal', 'execution_ready', 'completion'];
    if (!interactionCard && MANDATORY_STAGES.includes(card.type)) {
      interactionCard = {
        type: 'blocked',
        reason: `Engineering interaction is in the "${card.type}" stage but the interaction card could not be rendered. Please retry or contact support.`,
      };
    }

    return { card, message: { role: 'assistant', content, interactionCard } };
  },

  /**
   * EWO-033R.4 Correction 5: Resume from a conversation identifier.
   * Returns a canonical InteractionCard (with real data) — never a placeholder.
   * This is the single canonical resume path used by the page on refresh/restore.
   */
  async resumeFromConversation(conversationId: string): Promise<{
    card: ResumeCard | null;
    interactionCard: InteractionCard | null;
    message: string;
    supportingRecords: ResumeCard['supportingRecords'];
  } | null> {
    const card = await InteractionResumeService.resumeFromConversation(conversationId);
    if (!card) return null;

    // Use the canonical resumeInteraction path when we have an ideaId — this
    // builds proper cards with real data (proposal content, execution prep
    // details, completion packages) instead of placeholder objects.
    if (card.supportingRecords.ideaId) {
      const result = await this.resumeInteraction(card.supportingRecords.ideaId);
      return {
        card: result.card,
        interactionCard: result.message.interactionCard ?? null,
        message: result.message.content,
        supportingRecords: card.supportingRecords,
      };
    }

    // Fallback for cards without an ideaId — map stage to card type
    let interactionCard: InteractionCard | null = null;
    let message = card.nextAction;

    switch (card.type) {
      case 'closed':
        interactionCard = { type: 'closed', message: card.nextAction };
        break;
      case 'blocked':
        interactionCard = { type: 'blocked', reason: card.blockingReason ?? 'Unknown' };
        break;
      case 'failed':
        interactionCard = { type: 'execution_failed', error: card.blockingReason ?? card.nextAction, ewoRef: card.supportingRecords.ewoRef ?? '' };
        break;
      case 'preparing':
        interactionCard = { type: 'preparing', message: card.nextAction };
        break;
      default:
        // EWO-033R.4 Correction 5: Mandatory stages without data get a recovery card
        interactionCard = {
          type: 'blocked',
          reason: `Engineering interaction is in the "${card.type}" stage but could not be restored. Please retry.`,
        };
    }

    return {
      card,
      interactionCard,
      message,
      supportingRecords: card.supportingRecords,
    };
  },

  /**
   * EWO-033R.4 — Prepare execution with a governed timeout.
   *
   * Actually starts execution preparation (context assembly, provider
   * resolution, eligibility check) and enforces a 30-second timeout.
   * If the timeout fires, returns a timedOut result so the UI can show
   * an in-conversation recovery card instead of an endless spinner.
   */
  async prepareExecutionWithTimeout(
    ewoId: string,
    ewoRef: string,
    ideaId: string,
    conversationId?: string,
    options?: { onPreparationProgress?: PreparationProgressCallback },
  ): Promise<{
    timedOut: boolean;
    error: string | null;
    ewoId?: string;
    ewoRef?: string;
    executionReady?: Record<string, unknown>;
  }> {
    const PREPARATION_TIMEOUT_MS = 45_000; // 45 seconds (EWO-033R.4 Correction 4: increased from 30s)

    // EWO-033R.4 Correction 4: Wrap EVERYTHING in the timeout race, including the
    // duplicate-prevention query. Previously the pre-timeout query was outside
    // the race — if it hung, the user was stuck indefinitely.
    const timeoutPromise = new Promise<{ timedOut: true }>((resolve) =>
      setTimeout(() => resolve({ timedOut: true }), PREPARATION_TIMEOUT_MS),
    );

    const prepPromise = (async () => {
      // Check for existing execution preparation to prevent duplicates
      const { data: existingExec, error: dupErr } = await supabase
        .from('engineering_executions')
        .select('id, implementation_status')
        .eq('ewo_id', ewoId)
        .in('implementation_status', ['prepared', 'queued', 'running'])
        .limit(1)
        .maybeSingle();

      if (dupErr) throw new Error(`Duplicate check failed: ${dupErr.message}`);

      if (existingExec) {
        // Duplicate prevention — resume existing preparation
        const prep = await InteractionExecutionService.prepareExecution(ewoId, {
          onProgress: (phaseUpdate) => {
            const phases = phaseUpdate.phase === 'ewo_verified'
              ? [{ ...phaseUpdate }]
              : [phaseUpdate];
            options?.onPreparationProgress?.(phases);
          },
        });
        return {
          timedOut: false as const,
          error: null as string | null,
          ewoId,
          ewoRef,
          executionReady: prep as unknown as Record<string, unknown>,
        };
      }

      // EWO-033R.4 Correction 4: Run preparation with progress callback
      const prep = await InteractionExecutionService.prepareExecution(ewoId, {
        onProgress: (phaseUpdate, diag) => {
          options?.onPreparationProgress?.(diag.phases);
        },
      });
      return {
        timedOut: false as const,
        error: null as string | null,
        ewoId,
        ewoRef,
        executionReady: prep as unknown as Record<string, unknown>,
      };
    })().catch((err) => ({
      timedOut: false as const,
      error: err instanceof Error ? err.message : 'Preparation failed',
      ewoId,
      ewoRef,
    }));

    const result = await Promise.race([prepPromise, timeoutPromise]);

    if ('timedOut' in result && result.timedOut) {
      // Persist the timed-out state so resume can recover
      if (conversationId) {
        await ConversationAssociationService.updateExecutionState(
          (await ConversationAssociationService.findCanonical(ideaId))?.id ?? '',
          { status: 'timed_out', timestamp: new Date().toISOString() },
        ).catch(() => {});
      }
      return { timedOut: true, error: null, ewoId, ewoRef };
    }

    return result;
  },
};
