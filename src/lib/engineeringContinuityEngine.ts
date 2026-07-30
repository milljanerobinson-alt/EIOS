/**
 * Engineering Continuity Engine — EWO-012
 *
 * Determines whether a new engineering conversation continues prior work.
 * EIOS resolves continuity before any provider call — the provider never
 * needs to infer conversation history.
 *
 * Confidence tiers:
 *   ≥ 75  → auto-continue (high confidence)
 *   40–74 → present options to PO (medium confidence)
 *   < 40  → new context (low confidence)
 */

import { supabase } from './supabase';
import type { EILContinuityType } from './engineeringIntelligenceService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContinuitySignal {
  type: 'title_overlap' | 'keyword_overlap' | 'intent_link' | 'lineage_record' | 'time_proximity';
  score: number;          // 0–100 contribution
  description: string;
}

export interface RelatedConversation {
  id: string;
  title: string;
  overlap_score: number;
  related_intents: string[];
  relationship: EILContinuityType;
}

export interface ContinuityAssessment {
  continuity_type: EILContinuityType;
  confidence: number;         // 0–100
  strategy: 'auto_continue' | 'present_options' | 'new_context';
  signals: ContinuitySignal[];
  related_conversations: RelatedConversation[];
  related_intent_ids: string[];
  related_plan_ids: string[];
  summary: string;
}

// ─── Token helpers ────────────────────────────────────────────────────────────

function tokenise(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let matches = 0;
  for (const t of a) if (b.has(t)) matches++;
  return Math.round((matches / Math.max(a.size, b.size)) * 100);
}

// ─── EngineeringContinuityEngine ─────────────────────────────────────────────

export const EngineeringContinuityEngine = {

  /**
   * Assess whether this conversation continues prior engineering work.
   * Returns a full continuity assessment used by Context Builder and EIL.
   */
  async assess(
    conversationId: string,
    conversationTitle: string,
    userQuery: string,
  ): Promise<ContinuityAssessment> {
    const signals: ContinuitySignal[] = [];
    const relatedConversations: RelatedConversation[] = [];
    const relatedIntentIds: string[] = [];
    const relatedPlanIds: string[] = [];

    const queryTokens = tokenise(userQuery + ' ' + conversationTitle);

    // 1. Check existing lineage record
    const { data: lineage } = await supabase
      .from('eil_conversation_lineage')
      .select('*')
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (lineage && lineage.continuity_confidence > 0) {
      signals.push({
        type: 'lineage_record',
        score: lineage.continuity_confidence,
        description: `Existing lineage record found (${lineage.continuity_type})`,
      });
      return {
        continuity_type: lineage.continuity_type as EILContinuityType,
        confidence: lineage.continuity_confidence,
        strategy: lineage.continuity_confidence >= 75 ? 'auto_continue'
          : lineage.continuity_confidence >= 40 ? 'present_options'
          : 'new_context',
        signals,
        related_conversations: [],
        related_intent_ids: lineage.related_intent_ids ?? [],
        related_plan_ids: lineage.related_plan_ids ?? [],
        summary: lineage.lineage_summary ?? 'Continuing prior engineering work.',
      };
    }

    // 2. Scan recent conversations for title/keyword overlap
    const { data: recent } = await supabase
      .from('atd_conversations')
      .select('id, title, summary')
      .neq('id', conversationId)
      .order('updated_at', { ascending: false })
      .limit(20);

    let topOverlap = 0;

    for (const conv of (recent ?? [])) {
      const convTokens = tokenise((conv.title ?? '') + ' ' + (conv.summary ?? ''));
      const overlap = tokenOverlap(queryTokens, convTokens);
      if (overlap >= 20) {
        relatedConversations.push({
          id: conv.id,
          title: conv.title ?? '',
          overlap_score: overlap,
          related_intents: [],
          relationship: overlap >= 60 ? 'continuation' : overlap >= 35 ? 'branch' : 'reference',
        });
        topOverlap = Math.max(topOverlap, overlap);
      }
    }

    if (topOverlap > 0) {
      signals.push({
        type: 'title_overlap',
        score: Math.min(60, topOverlap),
        description: `${relatedConversations.length} related conversation(s) found (top overlap: ${topOverlap}%)`,
      });
    }

    // 3. Check for intents linked to this conversation
    const { data: linkedIntents } = await supabase
      .from('atd_engineering_intents')
      .select('id, intent_ref, title')
      .eq('source_conversation_id', conversationId)
      .limit(5);

    if (linkedIntents && linkedIntents.length > 0) {
      relatedIntentIds.push(...linkedIntents.map((i) => i.id));
      signals.push({
        type: 'intent_link',
        score: 40,
        description: `${linkedIntents.length} existing intent(s) linked to this conversation`,
      });
    }

    // 4. Cross-reference intents from related conversations
    for (const related of relatedConversations.slice(0, 3)) {
      const { data: relIntents } = await supabase
        .from('atd_engineering_intents')
        .select('id, intent_ref')
        .eq('source_conversation_id', related.id)
        .limit(3);
      if (relIntents) {
        related.related_intents = relIntents.map((i) => i.intent_ref);
        relatedIntentIds.push(...relIntents.map((i) => i.id));
      }
    }

    // 5. Plans linked to any found intents
    if (relatedIntentIds.length > 0) {
      const { data: plans } = await supabase
        .from('atd_engineering_plans')
        .select('id')
        .in('intent_id', relatedIntentIds.slice(0, 5))
        .limit(5);
      relatedPlanIds.push(...(plans ?? []).map((p) => p.id));
    }

    // Compute composite confidence
    const totalScore = signals.reduce((s, sig) => s + sig.score, 0);
    const confidence = Math.min(95, Math.round(totalScore / Math.max(1, signals.length)));

    const continuityType: EILContinuityType =
      relatedConversations.length === 0 ? 'new'
      : confidence >= 60 ? 'continuation'
      : confidence >= 35 ? 'branch'
      : 'reference';

    const strategy =
      confidence >= 75 ? 'auto_continue'
      : confidence >= 40 ? 'present_options'
      : 'new_context';

    const summary =
      continuityType === 'new' ? 'No related prior engineering work found.'
      : continuityType === 'continuation' ? `Continues ${relatedConversations[0]?.title ?? 'prior engineering work'}.`
      : `Related to ${relatedConversations.length} prior conversation(s).`;

    // Persist lineage
    await supabase.from('eil_conversation_lineage').upsert({
      conversation_id: conversationId,
      related_intent_ids: [...new Set(relatedIntentIds)],
      related_plan_ids: [...new Set(relatedPlanIds)],
      continuity_type: continuityType,
      continuity_confidence: confidence,
      lineage_summary: summary,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'conversation_id' }).then(() => {});

    return {
      continuity_type: continuityType,
      confidence,
      strategy,
      signals,
      related_conversations: relatedConversations.sort((a, b) => b.overlap_score - a.overlap_score).slice(0, 5),
      related_intent_ids: [...new Set(relatedIntentIds)],
      related_plan_ids: [...new Set(relatedPlanIds)],
      summary,
    };
  },

  /**
   * Check whether a conversation has an existing lineage record.
   */
  async getLineage(conversationId: string) {
    const { data } = await supabase
      .from('eil_conversation_lineage')
      .select('*')
      .eq('conversation_id', conversationId)
      .maybeSingle();
    return data;
  },
};
