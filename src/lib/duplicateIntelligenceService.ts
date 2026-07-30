/**
 * Duplicate Intelligence Service — EWO-011.5
 *
 * Reusable cognitive layer for analysing proposed Engineering Objects against
 * existing governed objects, understanding lifecycle state, and returning
 * structured recommendations.
 *
 * Design principles:
 * - Owns the COGNITIVE ANALYSIS. UI components call this service and display results.
 * - Reuses the lifecycle engine's checkForDuplicate() — no duplication of search logic.
 * - Extensible: objectSearchScope allows future Product Ideas, Goals, Epics, etc.
 * - Persists analysis records to duplicate_intelligence_records for analytics.
 */

import { supabase } from './supabase';
import { checkForDuplicate } from './engineeringLifecycleEngine';
import type { LifecycleStatus } from './engineeringLifecycleEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

/** What object types to search against. Future: add 'idea', 'goal', 'epic'. */
export type DuplicateSearchScope = 'intent' | 'plan';

export type DuplicateRecommendation =
  | 'continue_existing'   // active duplicate — recommend continuing existing work
  | 'restore_archived'    // archived match — recommend restoring
  | 'restore_deleted'     // deleted match — offer restore OR create new
  | 'related_work'        // similar but below threshold — flag without blocking
  | 'proceed';            // no match — create freely

/** What the Product Owner chose to do after seeing the recommendation. */
export type DuplicateActionTaken =
  | 'open_existing'
  | 'continue_existing'
  | 'restore'
  | 'create_new'
  | 'cancelled'
  | 'dismissed';

export interface DuplicateAnalysisInput {
  /** The object type being created. */
  objectType: DuplicateSearchScope;
  /** Proposed title to search against. */
  proposedTitle: string;
  /** Optional: raw intent description (future semantic analysis). */
  rawInput?: string;
  /** DB field to match against. Defaults to 'title'. */
  titleField?: string;
  /** Optional: conversation ID if invoked from the ICD flow. */
  conversationId?: string;
  /** Source context for analytics. */
  source?: 'ICD_conversation' | 'CaptureIntentModal' | 'API';
}

export interface DuplicateIntelligenceResult {
  /** Persisted record ID (null if DB write failed — result still valid). */
  recordId: string | null;
  /** Whether any matching objects were found. */
  hasFindings: boolean;
  /** Structured recommendation for the Product Owner. */
  recommendation: DuplicateRecommendation;
  /** Confidence 0–100. Currently based on exact title match; future: semantic. */
  confidence: number;
  /** Natural language explanation for display in conversation or modal. */
  explanationText: string;
  /** Short label for conversation/card display. */
  recommendationLabel: string;
  /** Details of the matched existing object, if any. */
  existingObject?: {
    id: string;
    ref: string | null;
    lifecycleStatus: LifecycleStatus;
  };
  /** ISO timestamp. */
  analysedAt: string;
}

// ─── Recommendation config ────────────────────────────────────────────────────

const RECOMMENDATION_LABELS: Record<DuplicateRecommendation, string> = {
  continue_existing: 'Continue Existing Work',
  restore_archived:  'Restore Archived Intent',
  restore_deleted:   'Restore or Create New',
  related_work:      'Related Work Found',
  proceed:           'Proceed — No Duplicates Found',
};

function buildResult(
  recommendation: DuplicateRecommendation,
  confidence: number,
  explanationText: string,
  existingObject?: DuplicateIntelligenceResult['existingObject'],
): Omit<DuplicateIntelligenceResult, 'recordId' | 'analysedAt'> {
  return {
    hasFindings: recommendation !== 'proceed',
    recommendation,
    confidence,
    explanationText,
    recommendationLabel: RECOMMENDATION_LABELS[recommendation],
    existingObject,
  };
}

// ─── Core analysis ────────────────────────────────────────────────────────────

/**
 * Analyse a proposed Engineering Object title for duplicates across existing
 * governed objects. Returns a structured recommendation and persists the
 * analysis to duplicate_intelligence_records.
 */
export async function analyseDuplicates(
  input: DuplicateAnalysisInput,
): Promise<DuplicateIntelligenceResult> {
  const now = new Date().toISOString();
  const { objectType, proposedTitle, titleField = 'title', conversationId, source = 'CaptureIntentModal' } = input;

  let partial: Omit<DuplicateIntelligenceResult, 'recordId' | 'analysedAt'>;

  try {
    const dupCheck = await checkForDuplicate(objectType, proposedTitle, titleField);

    switch (dupCheck.status) {
      case 'active_duplicate':
        partial = buildResult(
          'continue_existing',
          95,
          `An active Engineering Intent with a matching title already exists (${dupCheck.existingRef ?? dupCheck.existingId}). ` +
          `Continuing the existing work is recommended to avoid fragmented engineering effort and duplicated pipeline costs.`,
          dupCheck.existingId
            ? { id: dupCheck.existingId, ref: dupCheck.existingRef ?? null, lifecycleStatus: dupCheck.existingLifecycleStatus ?? 'active' }
            : undefined,
        );
        break;

      case 'archived_duplicate':
        partial = buildResult(
          'restore_archived',
          90,
          `A matching Engineering Intent was previously archived (${dupCheck.existingRef ?? dupCheck.existingId}). ` +
          `Restoring it would preserve the existing engineering history, plans, and audit lineage rather than starting fresh.`,
          dupCheck.existingId
            ? { id: dupCheck.existingId, ref: dupCheck.existingRef ?? null, lifecycleStatus: 'archived' }
            : undefined,
        );
        break;

      case 'deleted_duplicate':
        partial = buildResult(
          'restore_deleted',
          85,
          `A previously deleted Engineering Intent with this title exists in the governance record (${dupCheck.existingRef ?? dupCheck.existingId}). ` +
          `You can create a new Intent with a fresh ID, or restore the historical record and its existing audit trail.`,
          dupCheck.existingId
            ? { id: dupCheck.existingId, ref: dupCheck.existingRef ?? null, lifecycleStatus: 'deleted' }
            : undefined,
        );
        break;

      default:
        partial = buildResult(
          'proceed',
          0,
          `No matching Engineering Intents found for "${proposedTitle}". This work appears to be new and unique — proceed with creation.`,
        );
    }
  } catch {
    // Analysis failure is non-blocking — recommend proceed so creation can continue
    partial = buildResult(
      'proceed',
      0,
      'Duplicate analysis could not complete. Proceeding with intent creation.',
    );
  }

  // Persist analysis record for Engineering Intelligence analytics
  let recordId: string | null = null;
  try {
    const { data } = await supabase
      .from('duplicate_intelligence_records')
      .insert({
        object_type:           objectType,
        proposed_title:        proposedTitle,
        conversation_id:       conversationId ?? null,
        recommendation:        partial.recommendation,
        confidence:            partial.confidence,
        explanation_text:      partial.explanationText,
        existing_object_id:    partial.existingObject?.id ?? null,
        existing_object_ref:   partial.existingObject?.ref ?? null,
        existing_lifecycle_status: partial.existingObject?.lifecycleStatus ?? null,
        source,
        metadata:              { raw_input: input.rawInput ?? null },
      })
      .select('id')
      .single();
    recordId = data?.id ?? null;
  } catch {
    // Non-blocking — analysis result is valid even if persistence fails
  }

  return { ...partial, recordId, analysedAt: now };
}

/**
 * Record the Product Owner's chosen action against an existing analysis record.
 * Call this after the PO makes a decision.
 */
export async function recordDuplicateAction(
  recordId: string,
  actionTaken: DuplicateActionTaken,
  resultObjectId?: string,
): Promise<void> {
  try {
    await supabase
      .from('duplicate_intelligence_records')
      .update({
        selected_action: actionTaken,
        action_result:   resultObjectId ? 'executed' : 'cancelled',
        new_object_id:   resultObjectId ?? null,
      })
      .eq('id', recordId);
  } catch {
    // Non-blocking
  }
}

/**
 * Entry point for ICD Conversation flow.
 * Called from conversationIntentBridge before intent creation to present
 * duplicate intelligence naturally in the conversation.
 */
export async function runDuplicateIntelligenceForConversation(
  proposedTitle: string,
  conversationId: string,
  rawInput?: string,
): Promise<DuplicateIntelligenceResult> {
  return analyseDuplicates({
    objectType: 'intent',
    proposedTitle,
    rawInput,
    conversationId,
    source: 'ICD_conversation',
  });
}
