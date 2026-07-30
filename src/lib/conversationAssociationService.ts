/**
 * EWO-033R.4 — Conversation Association Service
 *
 * Manages the canonical conversation association for every engineering
 * interaction. Persists to `engineering_conversation_associations` so
 * the association survives browser refresh, sign-out, network failure,
 * and provider failure.
 *
 * The association links:
 *   conversation_id ↔ idea_id ↔ ewo_id ↔ proposal_id ↔ execution_id
 * and tracks the current lifecycle stage, pending decision, and last
 * interaction card so resume can reconstruct the correct card.
 */

import { supabase } from './supabase';
import { ConversationBoundaryGuard } from './conversationBoundaryGuard';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ConversationAssociation {
  id: string;
  conversationId: string;
  ideaId?: string;
  ewoId?: string;
  proposalId?: string;
  executionId?: string;
  ideaRef?: string;
  ewoRef?: string;
  proposalRef?: string;
  lifecycleStage: string;
  pendingDecision: string | null;
  lastInteractionCard: Record<string, unknown> | null;
  executionState: Record<string, unknown> | null;
  completionState: Record<string, unknown> | null;
  isCanonical: boolean;
  supersededBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssociationInput {
  conversationId: string;
  ideaId?: string;
  ewoId?: string;
  proposalId?: string;
  executionId?: string;
  ideaRef?: string;
  ewoRef?: string;
  proposalRef?: string;
  lifecycleStage?: string;
  pendingDecision?: string | null;
  lastInteractionCard?: Record<string, unknown> | null;
  executionState?: Record<string, unknown> | null;
  completionState?: Record<string, unknown> | null;
}

export interface CanonicalResolution {
  association: ConversationAssociation | null;
  alternatives: ConversationAssociation[];
  ambiguous: boolean;
}

// ─── Service ────────────────────────────────────────────────────────────────────

export const ConversationAssociationService = {
  /**
   * Create or update a conversation association. If a canonical association
   * already exists for the same idea_id (or ewo_id if no idea), update it
   * rather than creating a duplicate.
   */
  async upsert(input: AssociationInput): Promise<ConversationAssociation | null> {
    // Check for existing canonical association
    const existing = await this.findCanonical(input.ideaId, input.ewoId);

    if (existing) {
      // Update existing association — don't fragment
      const updates: Record<string, unknown> = {
        lifecycle_stage: input.lifecycleStage ?? existing.lifecycleStage,
        pending_decision: input.pendingDecision ?? existing.pendingDecision,
        updated_at: new Date().toISOString(),
      };
      if (input.ewoId && !existing.ewoId) updates.ewo_id = input.ewoId;
      if (input.proposalId && !existing.proposalId) updates.proposal_id = input.proposalId;
      if (input.executionId && !existing.executionId) updates.execution_id = input.executionId;
      if (input.ewoRef && !existing.ewoRef) updates.ewo_ref = input.ewoRef;
      if (input.proposalRef && !existing.proposalRef) updates.proposal_ref = input.proposalRef;
      if (input.lastInteractionCard) updates.last_interaction_card = input.lastInteractionCard;
      if (input.executionState) updates.execution_state = input.executionState;
      if (input.completionState) updates.completion_state = input.completionState;

      const { data, error } = await supabase
        .from('engineering_conversation_associations')
        .update(updates)
        .eq('id', existing.id)
        .select('*')
        .maybeSingle();

      if (error) {
        console.error('[ConversationAssociationService] upsert update error:', error.message);
        return null;
      }
      return data ? this.mapRow(data) : null;
    }

    // Create new association
    const row: Record<string, unknown> = {
      conversation_id: input.conversationId,
      lifecycle_stage: input.lifecycleStage ?? 'idea_captured',
      pending_decision: input.pendingDecision ?? null,
      is_canonical: true,
    };
    if (input.ideaId) row.idea_id = input.ideaId;
    if (input.ewoId) row.ewo_id = input.ewoId;
    if (input.proposalId) row.proposal_id = input.proposalId;
    if (input.executionId) row.execution_id = input.executionId;
    if (input.ideaRef) row.idea_ref = input.ideaRef;
    if (input.ewoRef) row.ewo_ref = input.ewoRef;
    if (input.proposalRef) row.proposal_ref = input.proposalRef;
    if (input.lastInteractionCard) row.last_interaction_card = input.lastInteractionCard;
    if (input.executionState) row.execution_state = input.executionState;
    if (input.completionState) row.completion_state = input.completionState;

    const { data, error } = await supabase
      .from('engineering_conversation_associations')
      .insert(row)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[ConversationAssociationService] upsert insert error:', error.message);
      return null;
    }
    return data ? this.mapRow(data) : null;
  },

  /**
   * Find the canonical association for an idea or EWO.
   * Returns null if none exists.
   */
  async findCanonical(ideaId?: string, ewoId?: string): Promise<ConversationAssociation | null> {
    let query = supabase
      .from('engineering_conversation_associations')
      .select('*')
      .eq('is_canonical', true)
      .order('updated_at', { ascending: false });

    if (ideaId) {
      query = query.eq('idea_id', ideaId);
    } else if (ewoId) {
      query = query.eq('ewo_id', ewoId);
    } else {
      return null;
    }

    const { data, error } = await query.limit(1).maybeSingle();

    if (error) {
      console.error('[ConversationAssociationService] findCanonical error:', error.message);
      return null;
    }
    return data ? this.mapRow(data) : null;
  },

  /**
   * Resolve the canonical association for an engineering interaction.
   * If multiple canonical associations exist, mark all but the latest as
   * superseded and return the latest. This implements the deterministic
   * canonical resolution strategy.
   */
  async resolveCanonical(ideaId?: string, ewoId?: string): Promise<CanonicalResolution> {
    let query = supabase
      .from('engineering_conversation_associations')
      .select('*')
      .eq('is_canonical', true)
      .order('updated_at', { ascending: false });

    if (ideaId) {
      query = query.eq('idea_id', ideaId);
    } else if (ewoId) {
      query = query.eq('ewo_id', ewoId);
    } else {
      return { association: null, alternatives: [], ambiguous: false };
    }

    const { data, error } = await query;

    if (error) {
      console.error('[ConversationAssociationService] resolveCanonical error:', error.message);
      return { association: null, alternatives: [], ambiguous: false };
    }

    if (!data || data.length === 0) {
      return { association: null, alternatives: [], ambiguous: false };
    }

    if (data.length === 1) {
      return {
        association: this.mapRow(data[0]),
        alternatives: [],
        ambiguous: false,
      };
    }

    // Multiple canonical associations — resolve deterministically
    // Keep the most recently updated as canonical, supersede the rest
    const canonical = data[0];
    const alternatives = data.slice(1);

    // Supersede the older ones
    const olderIds = alternatives.map((a) => a.id);
    if (olderIds.length > 0) {
      await supabase
        .from('engineering_conversation_associations')
        .update({
          is_canonical: false,
          superseded_by: canonical.id,
          updated_at: new Date().toISOString(),
        })
        .in('id', olderIds);
    }

    return {
      association: this.mapRow(canonical),
      alternatives: alternatives.map((a) => this.mapRow(a)),
      ambiguous: false,
    };
  },

  /**
   * Find an association by conversation ID.
   */
  async findByConversationId(conversationId: string): Promise<ConversationAssociation | null> {
    const { data, error } = await supabase
      .from('engineering_conversation_associations')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('is_canonical', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[ConversationAssociationService] findByConversationId error:', error.message);
      return null;
    }
    return data ? this.mapRow(data) : null;
  },

  /**
   * Update the lifecycle stage and pending decision on an existing association.
   */
  async updateStage(
    associationId: string,
    lifecycleStage: string,
    pendingDecision?: string | null,
    lastInteractionCard?: Record<string, unknown> | null,
  ): Promise<ConversationAssociation | null> {
    const updates: Record<string, unknown> = {
      lifecycle_stage: lifecycleStage,
      updated_at: new Date().toISOString(),
    };
    if (pendingDecision !== undefined) updates.pending_decision = pendingDecision;
    if (lastInteractionCard) updates.last_interaction_card = lastInteractionCard;

    const { data, error } = await supabase
      .from('engineering_conversation_associations')
      .update(updates)
      .eq('id', associationId)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[ConversationAssociationService] updateStage error:', error.message);
      return null;
    }
    return data ? this.mapRow(data) : null;
  },

  /**
   * Update execution state on an existing association.
   */
  async updateExecutionState(
    associationId: string,
    executionState: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await supabase
      .from('engineering_conversation_associations')
      .update({
        execution_state: executionState,
        updated_at: new Date().toISOString(),
      })
      .eq('id', associationId);

    if (error) {
      console.error('[ConversationAssociationService] updateExecutionState error:', error.message);
    }
  },

  /**
   * Update completion state on an existing association.
   */
  async updateCompletionState(
    associationId: string,
    completionState: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await supabase
      .from('engineering_conversation_associations')
      .update({
        completion_state: completionState,
        updated_at: new Date().toISOString(),
      })
      .eq('id', associationId);

    if (error) {
      console.error('[ConversationAssociationService] updateCompletionState error:', error.message);
    }
  },

  /**
   * Validate the association against the conversation boundary guard.
   */
  validateAssociation(assoc: ConversationAssociation) {
    const hasResumableCard = ConversationBoundaryGuard.hasResumableCard(assoc.lifecycleStage);
    const info = {
      currentStage: assoc.lifecycleStage,
      pendingDecision: assoc.pendingDecision,
      conversationAction: assoc.pendingDecision ? 'in_conversation' : null,
      conversationIdentifier: assoc.conversationId,
      actionAvailable: !!assoc.pendingDecision,
      blockingReason: null as string | null,
      optionalInspectionLinks: [] as never[],
      hasResumableCard,
      nextActionIsWorkspaceRoute: false,
      hasConversationAssociation: true,
      conversationAssociationAmbiguous: false,
    };
    return ConversationBoundaryGuard.validate(info);
  },

  /**
   * Map a database row to a ConversationAssociation.
   */
  mapRow(row: Record<string, unknown>): ConversationAssociation {
    return {
      id: row.id as string,
      conversationId: row.conversation_id as string,
      ideaId: (row.idea_id as string) ?? undefined,
      ewoId: (row.ewo_id as string) ?? undefined,
      proposalId: (row.proposal_id as string) ?? undefined,
      executionId: (row.execution_id as string) ?? undefined,
      ideaRef: (row.idea_ref as string) ?? undefined,
      ewoRef: (row.ewo_ref as string) ?? undefined,
      proposalRef: (row.proposal_ref as string) ?? undefined,
      lifecycleStage: row.lifecycle_stage as string,
      pendingDecision: (row.pending_decision as string) ?? null,
      lastInteractionCard: (row.last_interaction_card as Record<string, unknown>) ?? null,
      executionState: (row.execution_state as Record<string, unknown>) ?? null,
      completionState: (row.completion_state as Record<string, unknown>) ?? null,
      isCanonical: row.is_canonical as boolean,
      supersededBy: (row.superseded_by as string) ?? null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  },
};
