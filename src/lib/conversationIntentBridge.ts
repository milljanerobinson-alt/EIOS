/**
 * EWO-011.4 — Conversation-to-Intent Bridge
 *
 * Connects the AI Technical Director conversation system (CCAIProductManagerPage /
 * cc_ai_conversations) to the governed ATD Workspace intent pipeline
 * (ECCATDWorkspacePage / atd_engineering_intents).
 *
 * Responsibilities:
 * - Map a structured EngineeringDecision to ATDCognitiveEngine.captureIntent() input
 * - Persist a durable link (conversation → intent) for idempotency + continuity
 * - Expose lookup helpers for both directions of the relationship
 * - Run Duplicate Intelligence analysis before intent creation (EWO-011.5)
 */

import { supabase } from './supabase';
import { ATDCognitiveEngine } from './atdCognitiveEngine';
import type { EngineeringIntent } from './atdCognitiveEngine';
export { runDuplicateIntelligenceForConversation } from './duplicateIntelligenceService';
export type {
  DuplicateIntelligenceResult,
  DuplicateRecommendation,
  DuplicateActionTaken,
} from './duplicateIntelligenceService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BridgeDecision {
  recommendation: string;
  priority_score: number;
  priority_level: string;
  engineering_confidence: number;
  business_value: number;
  engineering_value: number;
  compliance_value: number;
  customer_value: number;
  estimated_effort: string;
  estimated_complexity: string;
  why_now: string;
  suggested_phase: string;
  suggested_milestone: string;
  suggested_release: string;
  feature_intelligence?: {
    creates_new_feature: boolean;
    updates_existing_feature: string | null;
    existing_epic: string | null;
    existing_goal: string | null;
    creates_new_spec: boolean;
    reasoning: string;
  };
  impact_summary?: {
    affected_features: string[];
    affected_specs: string[];
    affected_tests: string[];
    affected_documentation: string[];
    affected_releases: string[];
    affected_architecture: string[];
    affected_integrations: string[];
    affected_apis: string[];
    affected_db_objects: string[];
  };
  testing_recommendations?: Array<{ type: string; required: boolean; reason: string }>;
  documentation_recommendations?: Array<{ type: string; required: boolean; title: string }>;
  duplicate_analysis?: {
    similar_records_found: boolean;
    recommendation: string;
    existing_record: string | null;
    reasoning: string;
  };
  implementation_readiness?: {
    percentage: number;
    items_complete: string[];
    items_outstanding: string[];
  };
  director_summary: {
    recommendation: string;
    priority: number;
    reason: string;
    estimated_effort: string;
    suggested_phase: string;
    suggested_release: string;
    required_testing: string[];
  };
}

export interface BridgeConversation {
  id: string;
  title: string;
  context_type?: string;
}

export interface ConversationIntentLink {
  id: string;
  conversation_id: string;
  intent_id: string;
  intent_ref: string;
  pipeline_execution_id: string | null;
  source_message_context: Record<string, unknown>;
  created_at: string;
}

export interface HandoffResult {
  intent: EngineeringIntent;
  link: ConversationIntentLink;
  isNew: boolean;
}

// ─── Handoff mapping ──────────────────────────────────────────────────────────

export function buildCaptureInput(
  decision: BridgeDecision,
  conversation: BridgeConversation,
  userQuery: string,
): Parameters<typeof ATDCognitiveEngine.captureIntent>[0] {
  const ds = decision.director_summary;
  const imp = decision.impact_summary;

  const scopeParts: string[] = [];
  if (imp?.affected_features?.length) scopeParts.push(`Features: ${imp.affected_features.join(', ')}`);
  if (imp?.affected_architecture?.length) scopeParts.push(`Architecture: ${imp.affected_architecture.join(', ')}`);
  if (imp?.affected_db_objects?.length) scopeParts.push(`Database: ${imp.affected_db_objects.join(', ')}`);
  if (imp?.affected_apis?.length) scopeParts.push(`APIs: ${imp.affected_apis.join(', ')}`);

  const constraintParts: string[] = [];
  const outstanding = decision.implementation_readiness?.items_outstanding ?? [];
  if (outstanding.length) constraintParts.push(`Outstanding: ${outstanding.join('; ')}`);
  if (decision.testing_recommendations?.filter(t => t.required).length) {
    constraintParts.push(`Required testing: ${decision.testing_recommendations.filter(t => t.required).map(t => t.type).join(', ')}`);
  }

  const title = userQuery.length > 80 ? `${userQuery.slice(0, 77)}...` : userQuery;

  return {
    title,
    raw_input: userQuery,
    requested_outcome: `${decision.recommendation} — ${ds.recommendation}`,
    business_objective: decision.why_now,
    engineering_objective: ds.reason,
    scope: scopeParts.length ? scopeParts.join('\n') : undefined,
    constraints: constraintParts.length ? constraintParts.join('\n') : undefined,
  };
}

// ─── Idempotency check ────────────────────────────────────────────────────────

export async function getExistingLink(conversationId: string): Promise<ConversationIntentLink | null> {
  const { data, error } = await supabase
    .from('atd_intent_conversation_links')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (error) throw error;
  return data as ConversationIntentLink | null;
}

export async function getLinkForIntent(intentId: string): Promise<ConversationIntentLink | null> {
  const { data, error } = await supabase
    .from('atd_intent_conversation_links')
    .select('*')
    .eq('intent_id', intentId)
    .maybeSingle();
  if (error) throw error;
  return data as ConversationIntentLink | null;
}

// ─── Core bridge function ─────────────────────────────────────────────────────

export async function sendConversationToATD(
  decision: BridgeDecision,
  conversation: BridgeConversation,
  userQuery: string,
): Promise<HandoffResult> {
  // Idempotency: return existing link if already sent
  const existing = await getExistingLink(conversation.id);
  if (existing) {
    const { data: intentData, error: intentErr } = await supabase
      .from('atd_engineering_intents')
      .select('*')
      .eq('id', existing.intent_id)
      .single();
    if (intentErr) throw intentErr;
    return {
      intent: intentData as EngineeringIntent,
      link: existing,
      isNew: false,
    };
  }

  // Build the governed input from decision data
  const captureInput = buildCaptureInput(decision, conversation, userQuery);

  // Create intent + pipeline via the cognitive engine (single authority)
  const { intent, pipeline } = await ATDCognitiveEngine.captureIntent(captureInput);

  // Stamp source_conversation_id on the intent for reverse traceability
  await supabase
    .from('atd_engineering_intents')
    .update({ source_conversation_id: conversation.id })
    .eq('id', intent.id);

  // Persist the durable link
  const { data: linkData, error: linkErr } = await supabase
    .from('atd_intent_conversation_links')
    .insert({
      conversation_id: conversation.id,
      decision_snapshot: decision as unknown as Record<string, unknown>,
      intent_id: intent.id,
      intent_ref: intent.intent_ref,
      pipeline_execution_id: pipeline.id,
      source_message_context: {
        conversation_title: conversation.title,
        context_type: conversation.context_type ?? null,
        user_query: userQuery,
        sent_at: new Date().toISOString(),
      },
    })
    .select()
    .single();
  if (linkErr) throw linkErr;

  return {
    intent: { ...intent, source_conversation_id: conversation.id } as EngineeringIntent,
    link: linkData as ConversationIntentLink,
    isNew: true,
  };
}

// ─── Navigation helper ────────────────────────────────────────────────────────
//
// EWO-033R.4: This function no longer redirects to a workspace route.
// The conversation is the lifecycle owner. It dispatches an in-conversation
// event so the active conversation can react. The workspace remains available
// as optional inspection but is never required for progression.

export function navigateToIntent(intentId: string): void {
  sessionStorage.setItem('atd_pending_intent', intentId);
  // Dispatch event so the active conversation can react in-place.
  // No workspace navigation — the conversation stays in context.
  window.dispatchEvent(new CustomEvent('atd:openIntent', { detail: { intentId } }));
}
