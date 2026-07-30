/**
 * Engineering Context Builder — EWO-012
 *
 * Assembles a governed Engineering Context Package before every AI request.
 * The provider always receives a rich, structured context — never just a raw prompt.
 *
 * Context layers (assembled in priority order):
 *   1. Engineering Constitution
 *   2. Engineering Standards
 *   3. Engineering Intent / Plan (if linked)
 *   4. Engineering Memory
 *   5. Engineering Intelligence Graph
 *   6. Historical Engineering Packages
 *   7. Architecture Decisions
 *   8. Platform Intelligence
 *   9. Conversation continuity context
 *  10. Caller-supplied context
 */

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContextLayer {
  type: string;
  ref: string;
  title: string;
  content: string;
  relevance_score: number;
  token_estimate: number;
}

export interface EngineeredContextPackage {
  layers: ContextLayer[];
  rendered_text: string;
  total_tokens: number;
  source_count: number;
  has_constitution: boolean;
  has_standards: boolean;
  has_memory: boolean;
  has_graph: boolean;
  has_intent: boolean;
  constitution_clauses: number;
  standards_count: number;
  memory_records: number;
  graph_nodes: number;
  graph_relationships: number;
}

export interface ContextBuildOptions {
  intent_id?: string;
  plan_id?: string;
  conversation_id?: string;
  extra_context?: Record<string, unknown>;
  max_tokens?: number;
  include_constitution?: boolean;
  include_standards?: boolean;
  include_memory?: boolean;
  include_graph?: boolean;
  include_prior_intents?: boolean;
  include_architecture_decisions?: boolean;
}

// ─── EngineeringContextBuilder ────────────────────────────────────────────────

export const EngineeringContextBuilder = {

  /**
   * Build the full Engineering Context Package for an AI request.
   */
  async build(options: ContextBuildOptions = {}): Promise<EngineeredContextPackage> {
    const {
      intent_id,
      conversation_id,
      extra_context,
      max_tokens = 12000,
      include_constitution = true,
      include_standards = true,
      include_memory = true,
      include_graph = true,
      include_prior_intents = true,
      include_architecture_decisions = true,
    } = options;

    const layers: ContextLayer[] = [];

    const addLayer = (
      type: string,
      ref: string,
      title: string,
      content: string,
      relevance: number,
    ) => {
      const tokenEstimate = Math.ceil(content.length / 4);
      layers.push({ type, ref, title, content, relevance_score: relevance, token_estimate: tokenEstimate });
    };

    // ── 1. Engineering Constitution ──────────────────────────────────────────
    if (include_constitution) {
      const { data: clauses } = await supabase
        .from('engineering_constitution')
        .select('clause_ref, title, description, category, enforcement_level')
        .eq('is_active', true)
        .order('clause_ref')
        .limit(15);
      for (const c of (clauses ?? [])) {
        addLayer(
          'constitution', c.clause_ref, c.title,
          `[${c.enforcement_level ?? 'REQUIRED'}] ${c.description ?? ''}`,
          0.95,
        );
      }
    }

    // ── 2. Engineering Standards ─────────────────────────────────────────────
    if (include_standards) {
      const { data: standards } = await supabase
        .from('ecc_engineering_standards')
        .select('id, title, body, category')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(6);
      for (const s of (standards ?? [])) {
        addLayer('standard', `STD-${s.id.slice(0, 8).toUpperCase()}`, s.title, s.body ?? '', 0.85);
      }
    }

    // ── 3. Engineering Intent ─────────────────────────────────────────────────
    if (intent_id) {
      const { data: intent } = await supabase
        .from('atd_engineering_intents')
        .select('intent_ref, title, raw_input, requested_outcome, business_objective, engineering_objective, scope, constraints, status')
        .eq('id', intent_id)
        .maybeSingle();
      if (intent) {
        addLayer(
          'intent', intent.intent_ref, intent.title,
          [
            `Title: ${intent.title}`,
            `Objective: ${intent.engineering_objective ?? ''}`,
            `Business Driver: ${intent.business_objective ?? ''}`,
            `Scope: ${intent.scope ?? ''}`,
            `Constraints: ${intent.constraints ?? ''}`,
            `Raw Input: ${intent.raw_input ?? ''}`,
          ].join('\n'),
          1.0,
        );
      }
    }

    // ── 4. Architecture Decisions (ADRs) ─────────────────────────────────────
    if (include_architecture_decisions) {
      const { data: adrs } = await supabase
        .from('ecc_decisions')
        .select('decision_ref, title, decision_summary, status')
        .in('status', ['accepted', 'active', 'approved'])
        .order('created_at', { ascending: false })
        .limit(5);
      for (const adr of (adrs ?? [])) {
        addLayer('adr', adr.decision_ref ?? '', adr.title ?? '', adr.decision_summary ?? '', 0.75);
      }
    }

    // ── 5. Engineering Memory ─────────────────────────────────────────────────
    if (include_memory) {
      const { data: memory } = await supabase
        .from('engineering_memory')
        .select('memory_ref, title, content, memory_type, confidence_score')
        .order('created_at', { ascending: false })
        .limit(6);
      for (const m of (memory ?? [])) {
        addLayer('memory', m.memory_ref, m.title, (m.content ?? '').slice(0, 400), 0.7);
      }
    }

    // ── 6. Engineering Intelligence Graph ─────────────────────────────────────
    if (include_graph) {
      const { data: entities } = await supabase
        .from('eig_entities')
        .select('entity_ref, entity_type, name, description')
        .order('created_at', { ascending: false })
        .limit(10);
      for (const e of (entities ?? [])) {
        addLayer('graph_node', e.entity_ref, e.name, `[${e.entity_type}] ${e.description ?? ''}`, 0.65);
      }
    }

    // ── 7. Prior Intents from same conversation ───────────────────────────────
    if (include_prior_intents && conversation_id) {
      const { data: priorIntents } = await supabase
        .from('atd_engineering_intents')
        .select('intent_ref, title, status')
        .eq('source_conversation_id', conversation_id)
        .order('created_at', { ascending: false })
        .limit(4);
      for (const pi of (priorIntents ?? [])) {
        addLayer('prior_intent', pi.intent_ref, pi.title, `Status: ${pi.status}`, 0.8);
      }
    }

    // ── 8. Extra context ──────────────────────────────────────────────────────
    if (extra_context && Object.keys(extra_context).length > 0) {
      addLayer('caller_context', 'CTX', 'Caller Context', JSON.stringify(extra_context, null, 2).slice(0, 1500), 0.9);
    }

    // Sort by relevance
    layers.sort((a, b) => b.relevance_score - a.relevance_score);

    // Render and enforce token budget
    const sections: string[] = [];
    let tokenBudget = max_tokens;

    for (const layer of layers) {
      if (layer.token_estimate > tokenBudget) break;
      const header = `## [${layer.type.toUpperCase()}] ${layer.ref}: ${layer.title}`;
      sections.push(`${header}\n${layer.content}`);
      tokenBudget -= layer.token_estimate;
    }

    const rendered_text = sections.join('\n\n---\n\n');

    const constitutionLayers = layers.filter((l) => l.type === 'constitution');
    const standardLayers = layers.filter((l) => l.type === 'standard');
    const memoryLayers = layers.filter((l) => l.type === 'memory');
    const graphLayers = layers.filter((l) => l.type === 'graph_node');

    return {
      layers,
      rendered_text,
      total_tokens: Math.ceil(rendered_text.length / 4),
      source_count: layers.length,
      has_constitution: constitutionLayers.length > 0,
      has_standards: standardLayers.length > 0,
      has_memory: memoryLayers.length > 0,
      has_graph: graphLayers.length > 0,
      has_intent: layers.some((l) => l.type === 'intent'),
      constitution_clauses: constitutionLayers.length,
      standards_count: standardLayers.length,
      memory_records: memoryLayers.length,
      graph_nodes: graphLayers.length,
      graph_relationships: 0,
    };
  },

  /**
   * Build a minimal context package (constitution + intent only).
   * Used when latency matters more than richness.
   */
  async buildMinimal(intentId?: string): Promise<EngineeredContextPackage> {
    return this.build({
      intent_id: intentId,
      include_standards: false,
      include_memory: false,
      include_graph: false,
      include_prior_intents: false,
      include_architecture_decisions: false,
      max_tokens: 3000,
    });
  },
};
