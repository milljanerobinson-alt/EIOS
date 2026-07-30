/**
 * Engineering Intelligence Service — EWO-012
 *
 * Universal client for the Engineering Intelligence Layer.
 * All AI requests MUST flow through this service — no component may call
 * providers or edge functions directly.
 *
 * Architecture:
 *   Component → EngineeringIntelligenceService → engineering-intelligence edge fn
 *                                              → EIL tables (audit / cost / learning)
 */

import { supabase } from './supabase';

// ─── Public Types ─────────────────────────────────────────────────────────────

export type EILCapability =
  | 'engineering_analysis'
  | 'engineering_planning'
  | 'continuity_assessment'
  | 'confidence_assessment'
  | 'knowledge_extraction'
  | 'execution_guidance'
  | 'custom';

export type EILConfidenceLevel = 'high' | 'medium' | 'low';
export type EILReviewLevel = 'none' | 'spot_check' | 'full_review' | 'mandatory';
export type EILContinuityType = 'continuation' | 'branch' | 'reference' | 'new';

export interface EILConfidenceFactor {
  factor: string;
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
}

export interface EILEvidenceItem {
  type: string;
  ref: string;
  title: string;
  relevance: string;
}

export interface EILContextSource {
  type: string;
  ref: string;
  title: string;
  relevance_score: number;
}

export interface IntelligenceRequest {
  capability: EILCapability;
  conversation_id?: string;
  intent_id?: string;
  plan_id?: string;
  session_id?: string;
  context?: Record<string, unknown>;
  prompt_key?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface IntelligenceResult {
  request_id: string;
  result_id: string;
  capability: string;
  // Parsed output (type depends on capability)
  structured_output: Record<string, unknown> | null;
  raw_response: string;
  // Confidence
  confidence: number;
  confidence_level: EILConfidenceLevel;
  confidence_factors: EILConfidenceFactor[];
  confidence_rationale: string;
  missing_information: string[];
  recommended_review_level: EILReviewLevel;
  // Evidence
  evidence: EILEvidenceItem[];
  // Context
  context_sources: EILContextSource[];
  context_token_count: number;
  // Continuity
  continuity_type: EILContinuityType;
  continuity_confidence: number;
  continuity_conversation_ids: string[];
  // Provider metadata
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  duration_ms: number;
  estimated_cost_usd: number;
  // Validation
  validation_passed: boolean;
  validation_issues: string[];
}

// ─── Learning Event ───────────────────────────────────────────────────────────

export interface LearningEventInput {
  request_id: string;
  result_id?: string;
  capability: string;
  original_draft: string;
  po_edits?: string;
  has_edits: boolean;
  regeneration_count: number;
  accepted: boolean;
  acceptance_time_ms?: number;
  conversation_id?: string;
  intent_id?: string;
  provider?: string;
  model?: string;
  confidence_at_accept?: number;
}

// ─── Provider Health ──────────────────────────────────────────────────────────

export interface ProviderHealthSnapshot {
  id: string;
  provider: string;
  model: string;
  status: 'healthy' | 'degraded' | 'error' | 'unknown';
  latency_ms: number | null;
  health_score: number;
  is_recommended: boolean;
  checked_at: string;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export interface EILDashboardStats {
  todayRequests: number;
  successRate: number;
  avgConfidence: number;
  acceptanceRate: number;
  humanEditRate: number;
  totalLearningEvents: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  capabilityBreakdown: Array<{ capability: string; count: number }>;
  confidenceDistribution: { high: number; medium: number; low: number };
  providerUsage: Array<{ provider: string; count: number; cost: number }>;
  recentRequests: Array<{
    id: string;
    request_ref: string;
    capability: string;
    provider: string;
    model: string;
    confidence: number | null;
    duration_ms: number;
    status: string;
    created_at: string;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function edgeFnUrl(slug: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${slug}`;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ─── EngineeringIntelligenceService ──────────────────────────────────────────

export const EngineeringIntelligenceService = {

  /**
   * EWO-017R.1: Execution Platform Knowledge — provides grounded answers
   * about the implemented Engineering Execution Platform. Used by ATD to
   * answer execution-related queries without falling back to generic
   * engineering process guidance.
   */
  getExecutionPlatformGuidance: (query: string) => {
    // Delegates to conversationContextRouter.getExecutionPlatformGuidance
    // to ensure a single source of truth for execution knowledge.
    try {
      // Lazy import to avoid circular dependency
      const router = require('./conversationContextRouter');
      if (router && typeof router.getExecutionPlatformGuidance === 'function') {
        return router.getExecutionPlatformGuidance(query);
      }
    } catch (_) {
      // Non-fatal — execution guidance is optional
    }
    return null;
  },

  /**
   * Execute an intelligence request through the EIL edge function.
   * This is the single entry point for all AI work in EIOS.
   */
  async execute(req: IntelligenceRequest): Promise<IntelligenceResult> {
    const resp = await fetch(edgeFnUrl('engineering-intelligence'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(req),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
      throw new Error(body.error ?? `EIL request failed (${resp.status})`);
    }
    const data = await resp.json();
    if (data.error && !data.partial) throw new Error(data.error);
    return data.partial ?? data;
  },

  /**
   * Capture a learning event after PO review.
   * Call after every analysis/plan approval, rejection, or edit.
   */
  async captureLearning(input: LearningEventInput): Promise<void> {
    try {
      await supabase.from('eil_learning_events').insert({
        request_id: input.request_id,
        result_id: input.result_id ?? null,
        capability: input.capability,
        original_draft: input.original_draft,
        po_edits: input.po_edits ?? null,
        has_edits: input.has_edits,
        edit_distance: input.po_edits ? Math.abs((input.po_edits.length) - (input.original_draft.length)) : 0,
        regeneration_count: input.regeneration_count,
        accepted: input.accepted,
        acceptance_time_ms: input.acceptance_time_ms ?? null,
        conversation_id: input.conversation_id ?? null,
        intent_id: input.intent_id ?? null,
        provider: input.provider ?? null,
        model: input.model ?? null,
        confidence_at_accept: input.confidence_at_accept ?? null,
        fine_tuning_eligible: input.accepted && !input.has_edits,
      });
    } catch (_) {
      // Learning capture is non-fatal
    }
  },

  /**
   * Record a provider health snapshot from the latest usage log.
   */
  async snapshotProviderHealth(
    provider: string,
    model: string,
    latencyMs: number,
    success: boolean,
  ): Promise<void> {
    try {
      // Compute rolling window metrics from eil_requests (last 100)
      const { data: recent } = await supabase
        .from('eil_requests')
        .select('duration_ms, status')
        .eq('provider', provider)
        .order('created_at', { ascending: false })
        .limit(100);

      const total = recent?.length ?? 0;
      const errors = recent?.filter((r) => r.status === 'error').length ?? 0;
      const avgLatency = total > 0
        ? Math.round((recent ?? []).reduce((s, r) => s + (r.duration_ms ?? 0), 0) / total)
        : latencyMs;

      const availability = total > 0 ? ((total - errors) / total) * 100 : (success ? 100 : 0);
      const failureRate = total > 0 ? (errors / total) * 100 : (success ? 0 : 100);
      const healthScore = Math.round(availability * 0.7 + Math.max(0, 100 - avgLatency / 100) * 0.3);

      await supabase.from('eil_provider_health').insert({
        provider,
        model,
        status: success ? (avgLatency < 5000 ? 'healthy' : 'degraded') : 'error',
        latency_ms: avgLatency,
        availability: Math.round(availability * 100) / 100,
        failure_rate: Math.round(failureRate * 100) / 100,
        window_requests: total,
        window_errors: errors,
        window_start: new Date(Date.now() - 3600000).toISOString(),
        window_end: new Date().toISOString(),
        health_score: Math.max(0, Math.min(100, healthScore)),
        is_recommended: healthScore >= 80 && availability >= 95,
      });
    } catch (_) {
      // Health snapshots are non-fatal
    }
  },

  /**
   * Upsert conversation lineage when a new conversation references prior work.
   */
  async recordConversationLineage(
    conversationId: string,
    parentConversationId: string | null,
    options: {
      relatedIntentIds?: string[];
      relatedPlanIds?: string[];
      relatedIdeaIds?: string[];
      continuityType?: EILContinuityType;
      continuityConfidence?: number;
      lineageSummary?: string;
    } = {},
  ): Promise<void> {
    try {
      await supabase.from('eil_conversation_lineage').upsert({
        conversation_id: conversationId,
        parent_conversation_id: parentConversationId,
        related_intent_ids: options.relatedIntentIds ?? [],
        related_plan_ids: options.relatedPlanIds ?? [],
        related_idea_ids: options.relatedIdeaIds ?? [],
        continuity_type: options.continuityType ?? 'new',
        continuity_confidence: options.continuityConfidence ?? 0,
        lineage_summary: options.lineageSummary ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id' });
    } catch (_) {}
  },

  /**
   * Load the latest provider health snapshots.
   */
  async getProviderHealth(): Promise<ProviderHealthSnapshot[]> {
    const { data } = await supabase
      .from('eil_provider_health')
      .select('id, provider, model, status, latency_ms, health_score, is_recommended, checked_at')
      .order('checked_at', { ascending: false })
      .limit(50);

    if (!data) return [];

    // Deduplicate — keep the latest snapshot per provider
    const seen = new Map<string, ProviderHealthSnapshot>();
    for (const row of data) {
      const key = `${row.provider}::${row.model}`;
      if (!seen.has(key)) seen.set(key, row as ProviderHealthSnapshot);
    }
    return Array.from(seen.values());
  },

  /**
   * Load dashboard statistics for the Engineering Intelligence dashboard.
   */
  async getDashboardStats(): Promise<EILDashboardStats> {
    const today = new Date().toISOString().slice(0, 10);

    const [requestsRes, resultsRes, learningRes, costRes] = await Promise.all([
      supabase
        .from('eil_requests')
        .select('id, request_ref, capability, provider, model, duration_ms, status, created_at, estimated_cost_usd')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('eil_results')
        .select('confidence, confidence_level, accepted, validation_passed')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('eil_learning_events')
        .select('accepted, has_edits')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('eil_cost_events')
        .select('total_cost_usd, provider, capability, event_date')
        .gte('event_date', today),
    ]);

    const requests = requestsRes.data ?? [];
    const results = resultsRes.data ?? [];
    const learning = learningRes.data ?? [];
    const costs = costRes.data ?? [];

    const todayRequests = requests.filter((r) => r.created_at.startsWith(today)).length;
    const completed = requests.filter((r) => r.status === 'complete');
    const successRate = requests.length > 0 ? Math.round((completed.length / requests.length) * 100) : 0;

    const avgConfidence = results.length > 0
      ? Math.round(results.reduce((s, r) => s + (r.confidence ?? 0), 0) / results.length)
      : 0;

    const reviewed = learning.filter((l) => l.accepted !== null);
    const accepted = learning.filter((l) => l.accepted === true);
    const acceptanceRate = reviewed.length > 0 ? Math.round((accepted.length / reviewed.length) * 100) : 0;
    const humanEdits = learning.filter((l) => l.has_edits);
    const humanEditRate = accepted.length > 0 ? Math.round((humanEdits.length / accepted.length) * 100) : 0;

    const totalCostUsd = costs.reduce((s, c) => s + (c.total_cost_usd ?? 0), 0);
    const avgLatencyMs = completed.length > 0
      ? Math.round(completed.reduce((s, r) => s + (r.duration_ms ?? 0), 0) / completed.length)
      : 0;

    // Capability breakdown
    const capMap = new Map<string, number>();
    for (const r of requests) capMap.set(r.capability, (capMap.get(r.capability) ?? 0) + 1);
    const capabilityBreakdown = Array.from(capMap.entries()).map(([capability, count]) => ({ capability, count }));

    // Confidence distribution
    const confDist = { high: 0, medium: 0, low: 0 };
    for (const r of results) {
      if (r.confidence_level === 'high') confDist.high++;
      else if (r.confidence_level === 'medium') confDist.medium++;
      else confDist.low++;
    }

    // Provider usage
    const provMap = new Map<string, { count: number; cost: number }>();
    for (const r of requests) {
      if (r.provider) {
        const cur = provMap.get(r.provider) ?? { count: 0, cost: 0 };
        provMap.set(r.provider, { count: cur.count + 1, cost: cur.cost + (r.estimated_cost_usd ?? 0) });
      }
    }
    const providerUsage = Array.from(provMap.entries()).map(([provider, { count, cost }]) => ({ provider, count, cost }));

    const recentRequests = requests.slice(0, 20).map((r) => ({
      id: r.id,
      request_ref: r.request_ref,
      capability: r.capability,
      provider: r.provider ?? 'unknown',
      model: r.model ?? 'unknown',
      confidence: null as number | null,
      duration_ms: r.duration_ms,
      status: r.status,
      created_at: r.created_at,
    }));

    return {
      todayRequests,
      successRate,
      avgConfidence,
      acceptanceRate,
      humanEditRate,
      totalLearningEvents: learning.length,
      totalCostUsd,
      avgLatencyMs,
      capabilityBreakdown,
      confidenceDistribution: confDist,
      providerUsage,
      recentRequests,
    };
  },

  /**
   * Load prompt library entries.
   */
  async getPromptLibrary() {
    const { data } = await supabase
      .from('eil_prompt_library')
      .select('id, prompt_key, version, capability, title, description, is_active, is_default, usage_count, last_used_at, created_at')
      .order('capability')
      .order('version', { ascending: false });
    return data ?? [];
  },

  /**
   * Mark a result as accepted or rejected (triggers learning capture).
   */
  async reviewResult(
    resultId: string,
    accepted: boolean,
    rejectionReason?: string,
  ): Promise<void> {
    await supabase.from('eil_results').update({
      accepted,
      accepted_at: new Date().toISOString(),
      rejection_reason: rejectionReason ?? null,
    }).eq('id', resultId);
  },
};
