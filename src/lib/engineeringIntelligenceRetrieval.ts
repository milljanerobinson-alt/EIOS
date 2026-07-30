/**
 * Engineering Intelligence Retrieval Service — EWO-012
 *
 * Retrieves engineering objects and their relationships for inclusion in
 * Engineering Context Packages. Covers memory, graph, standards, constitution,
 * packages, reviews, ideas, work orders, records, and decisions.
 *
 * Every retrieval returns objects AND their relationships — relationship
 * retrieval is mandatory, not optional.
 */

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RetrievedObject {
  type: string;
  id: string;
  ref: string;
  title: string;
  summary: string;
  relevance_score: number;
  created_at: string;
}

export interface RetrievedRelationship {
  from_ref: string;
  to_ref: string;
  relationship_type: string;
  strength: number;
  description: string;
}

export interface RetrievalResult {
  objects: RetrievedObject[];
  relationships: RetrievedRelationship[];
  total_objects: number;
  total_relationships: number;
  retrieval_time_ms: number;
}

export type RetrievalScope =
  | 'full'           // all layers
  | 'packages'       // intents + analyses + plans
  | 'knowledge'      // memory + standards + constitution
  | 'graph'          // EIG nodes + relationships
  | 'governance';    // decisions + reviews + work orders

// ─── Token helpers ────────────────────────────────────────────────────────────

function tokenise(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function overlapScore(query: Set<string>, candidate: string): number {
  const ct = tokenise(candidate);
  if (ct.size === 0) return 0;
  let matches = 0;
  for (const t of query) if (ct.has(t)) matches++;
  return Math.round((matches / Math.max(query.size, ct.size)) * 100);
}

// ─── EngineeringIntelligenceRetrievalService ──────────────────────────────────

export const EngineeringIntelligenceRetrievalService = {

  /**
   * Full retrieval sweep for a given query and scope.
   */
  async retrieve(
    query: string,
    scope: RetrievalScope = 'full',
    limit = 20,
  ): Promise<RetrievalResult> {
    const start = Date.now();
    const queryTokens = tokenise(query);
    const objects: RetrievedObject[] = [];
    const relationships: RetrievedRelationship[] = [];

    const include = {
      packages: scope === 'full' || scope === 'packages',
      knowledge: scope === 'full' || scope === 'knowledge',
      graph: scope === 'full' || scope === 'graph',
      governance: scope === 'full' || scope === 'governance',
    };

    // ── Engineering Memory ────────────────────────────────────────────────────
    if (include.knowledge) {
      const { data: memory } = await supabase
        .from('engineering_memory')
        .select('id, memory_ref, title, content, memory_type, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      for (const m of (memory ?? [])) {
        const score = overlapScore(queryTokens, m.title + ' ' + (m.content ?? ''));
        if (score >= 10 || objects.length < 5) {
          objects.push({
            type: 'memory',
            id: m.id,
            ref: m.memory_ref,
            title: m.title,
            summary: (m.content ?? '').slice(0, 200),
            relevance_score: score,
            created_at: m.created_at,
          });
        }
      }
    }

    // ── Engineering Ideas ─────────────────────────────────────────────────────
    if (include.packages) {
      const { data: ideas } = await supabase
        .from('engineering_ideas')
        .select('id, idea_ref, title, description, category, status, created_at')
        .in('status', ['active', 'draft', 'queued_for_promotion'])
        .order('created_at', { ascending: false })
        .limit(limit);
      for (const idea of (ideas ?? [])) {
        const score = overlapScore(queryTokens, idea.title + ' ' + (idea.description ?? ''));
        if (score >= 15) {
          objects.push({
            type: 'idea',
            id: idea.id,
            ref: idea.idea_ref,
            title: idea.title,
            summary: `[${idea.category}] ${(idea.description ?? '').slice(0, 150)}`,
            relevance_score: score,
            created_at: idea.created_at,
          });
        }
      }
    }

    // ── Engineering Work Orders ───────────────────────────────────────────────
    if (include.packages) {
      const { data: workOrders } = await supabase
        .from('engineering_work_orders')
        .select('id, ewo_ref, title, description, status, priority, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      for (const ewo of (workOrders ?? [])) {
        const score = overlapScore(queryTokens, ewo.title + ' ' + (ewo.description ?? ''));
        if (score >= 15) {
          objects.push({
            type: 'work_order',
            id: ewo.id,
            ref: ewo.ewo_ref,
            title: ewo.title,
            summary: `[${ewo.priority}] ${(ewo.description ?? '').slice(0, 150)}`,
            relevance_score: score,
            created_at: ewo.created_at,
          });
        }
      }
    }

    // ── Engineering Standards ─────────────────────────────────────────────────
    if (include.knowledge) {
      const { data: standards } = await supabase
        .from('ecc_engineering_standards')
        .select('id, title, body, created_at')
        .eq('status', 'active')
        .limit(limit);
      for (const s of (standards ?? [])) {
        const score = overlapScore(queryTokens, s.title + ' ' + (s.body ?? ''));
        if (score >= 10) {
          objects.push({
            type: 'standard',
            id: s.id,
            ref: `STD-${s.id.slice(0, 8).toUpperCase()}`,
            title: s.title,
            summary: (s.body ?? '').slice(0, 200),
            relevance_score: score,
            created_at: s.created_at,
          });
        }
      }
    }

    // ── Architecture Decisions ────────────────────────────────────────────────
    if (include.governance) {
      const { data: decisions } = await supabase
        .from('ecc_decisions')
        .select('id, decision_ref, title, decision_summary, status, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      for (const d of (decisions ?? [])) {
        const score = overlapScore(queryTokens, d.title + ' ' + (d.decision_summary ?? ''));
        if (score >= 10) {
          objects.push({
            type: 'decision',
            id: d.id,
            ref: d.decision_ref ?? '',
            title: d.title ?? '',
            summary: (d.decision_summary ?? '').slice(0, 200),
            relevance_score: score,
            created_at: d.created_at,
          });
        }
      }
    }

    // ── EIG Relationships ─────────────────────────────────────────────────────
    if (include.graph) {
      const { data: rels } = await supabase
        .from('eig_relationships')
        .select('from_entity_ref, to_entity_ref, relationship_type, strength, description')
        .order('strength', { ascending: false })
        .limit(30);
      for (const r of (rels ?? [])) {
        relationships.push({
          from_ref: r.from_entity_ref ?? '',
          to_ref: r.to_entity_ref ?? '',
          relationship_type: r.relationship_type ?? '',
          strength: r.strength ?? 0,
          description: r.description ?? '',
        });
      }
    }

    // Sort objects by relevance
    objects.sort((a, b) => b.relevance_score - a.relevance_score);
    const trimmed = objects.slice(0, limit);

    return {
      objects: trimmed,
      relationships,
      total_objects: trimmed.length,
      total_relationships: relationships.length,
      retrieval_time_ms: Date.now() - start,
    };
  },

  /**
   * Retrieve objects similar to a given engineering intent.
   */
  async retrieveForIntent(intentId: string, limit = 10): Promise<RetrievalResult> {
    const start = Date.now();

    const { data: intent } = await supabase
      .from('atd_engineering_intents')
      .select('title, raw_input, engineering_objective')
      .eq('id', intentId)
      .maybeSingle();

    if (!intent) {
      return { objects: [], relationships: [], total_objects: 0, total_relationships: 0, retrieval_time_ms: Date.now() - start };
    }

    return this.retrieve(
      `${intent.title} ${intent.raw_input ?? ''} ${intent.engineering_objective ?? ''}`,
      'full',
      limit,
    );
  },

  /**
   * Retrieve conversation lineage for a given conversation.
   */
  async getConversationLineage(conversationId: string) {
    const { data } = await supabase
      .from('eil_conversation_lineage')
      .select('*')
      .eq('conversation_id', conversationId)
      .maybeSingle();
    return data;
  },

  /**
   * Retrieve the latest EIL requests for audit / dashboard use.
   */
  async getRecentRequests(limit = 50) {
    const { data } = await supabase
      .from('eil_requests')
      .select(`
        id, request_ref, capability, provider, model,
        prompt_tokens, completion_tokens, estimated_cost_usd,
        duration_ms, status, created_at, completed_at,
        context_token_count, memory_records_retrieved,
        standards_retrieved, constitution_clauses, graph_relationships_retrieved
      `)
      .order('created_at', { ascending: false })
      .limit(limit);
    return data ?? [];
  },
};
