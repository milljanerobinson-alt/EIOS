import { supabase } from './supabase';
import { AIProviderManager } from './aiProviderManager';
import { ATDCapabilityFramework } from './atdCapabilityFramework';
import type { CapabilityExecution } from './atdCapabilityFramework';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CapabilityInput {
  [key: string]: unknown;
}

export interface CapabilityResult {
  success: boolean;
  output: Record<string, unknown>;
  executionId: string;
  executionRef: string;
  provider: string;
  model: string;
  durationMs: number;
  error?: string;
  failureCategory?: string;
}

export interface CapabilityExecutionOptions {
  intentId?: string;
  pipelineExecutionId?: string;
  /** Request a specific provider config ID — engine will fall back to default if unavailable */
  providerConfigId?: string;
  /** Override the default timeout in milliseconds */
  timeoutMs?: number;
  /** Tenant organisation ID — threaded to execution record and edge function for data isolation */
  organisationId?: string;
}

// ─── Failure categories ───────────────────────────────────────────────────────

export type FailureCategory =
  | 'no_provider'
  | 'no_edge_function'
  | 'edge_function_error'
  | 'ai_provider_error'
  | 'schema_validation_error'
  | 'timeout'
  | 'unknown';

function categoriseError(message: string): FailureCategory {
  if (message.includes('No AI provider')) return 'no_provider';
  if (message.includes('No edge function')) return 'no_edge_function';
  if (message.includes('timed out') || message.includes('AbortError')) return 'timeout';
  if (message.includes('Edge function') && message.includes('returned')) return 'edge_function_error';
  if (message.includes('API error')) return 'ai_provider_error';
  if (message.includes('schema') || message.includes('validation')) return 'schema_validation_error';
  return 'unknown';
}

// ─── Edge function base URL ───────────────────────────────────────────────────

function edgeFnUrl(slug: string): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${slug}`;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ─── Capability → edge function routing map ───────────────────────────────────

const CAPABILITY_EDGE_FN: Record<string, string> = {
  reasoning: 'atd-reasoning',
};

// ─── AI Capability Engine ─────────────────────────────────────────────────────

export const AICapabilityEngine = {

  async executeCapability(
    capabilityKey: string,
    input: CapabilityInput,
    options: CapabilityExecutionOptions = {},
  ): Promise<CapabilityResult> {
    const startMs = Date.now();

    // 1. Route to a provider
    const routing = await AIProviderManager.routeCapabilityRequest(options.providerConfigId);
    if (!routing.available || !routing.provider) {
      throw new Error(routing.reason);
    }

    const providerName = routing.provider.provider;
    const providerConfigId = routing.provider.id;
    const selectedModel = routing.provider.model;

    // 2. Record execution start with routing metadata
    const execution: CapabilityExecution = await ATDCapabilityFramework.recordExecution({
      capability_key: capabilityKey,
      pipeline_execution_id: options.pipelineExecutionId,
      intent_id: options.intentId,
      input_payload: input as Record<string, unknown>,
      provider_used: providerName,
      organisation_id: options.organisationId,
    });

    // Patch routing columns asynchronously (non-blocking, non-fatal)
    supabase.from('atd_capability_executions').update({
      requested_provider_config_id: options.providerConfigId ?? providerConfigId,
      actual_provider_config_id: providerConfigId,
      provider_type: providerName,
      selected_model: selectedModel,
      routing_strategy: routing.routingStrategy,
      used_default_provider: routing.usedDefault,
      fallback_occurred: routing.fallbackOccurred,
      fallback_reason: routing.fallbackReason ?? null,
      routing_metadata: {
        reason: routing.reason,
        routingStrategy: routing.routingStrategy,
        providerDisplayName: routing.provider.display_name,
        requestedProviderConfigId: options.providerConfigId ?? null,
        actualProviderConfigId: providerConfigId,
      },
      routing_timestamp: routing.routingTimestamp,
      validation_status: 'pending',
    }).eq('id', execution.id).then(() => {});

    // 3. Determine edge function slug
    const slug = CAPABILITY_EDGE_FN[capabilityKey];
    if (!slug) {
      const errMsg = `No edge function mapped for capability: ${capabilityKey}`;
      await patchFailure(execution.id, errMsg, 'no_edge_function');
      await ATDCapabilityFramework.failExecution(execution.id, errMsg);
      throw new Error(errMsg);
    }

    // 4. Call the edge function
    let output: Record<string, unknown> = {};
    let errorMessage: string | undefined;
    let failureCategory: FailureCategory | undefined;

    try {
      const timeoutMs = options.timeoutMs ?? 120_000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(edgeFnUrl(slug), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ...input,
          _providerConfigId: providerConfigId,
          _intentId: options.intentId,
          _executionId: execution.id,
          organisation_id: options.organisationId ?? null,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Edge function ${slug} returned ${resp.status}: ${text.slice(0, 300)}`);
      }

      const data = await resp.json();
      if (data && typeof data === 'object' && !data.error) {
        output = data as Record<string, unknown>;
      } else if (data?.error) {
        throw new Error(data.error as string);
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      failureCategory = categoriseError(errorMessage);
    }

    const durationMs = Date.now() - startMs;

    // 5. Persist outcome
    if (errorMessage) {
      await patchFailure(execution.id, errorMessage, failureCategory ?? 'unknown');
      await ATDCapabilityFramework.failExecution(execution.id, errorMessage);
      return {
        success: false,
        output: {},
        executionId: execution.id,
        executionRef: execution.execution_ref,
        provider: providerName,
        model: selectedModel,
        durationMs,
        error: errorMessage,
        failureCategory,
      };
    }

    // Record token/cost data returned by the edge function
    const promptTokens = typeof output._tokens_prompt === 'number' ? output._tokens_prompt : undefined;
    const completionTokens = typeof output._tokens_completion === 'number' ? output._tokens_completion : undefined;
    const providerLatencyMs = typeof output._duration_ms === 'number' ? output._duration_ms : undefined;
    const resultPlanId = typeof output._plan_id === 'string' ? output._plan_id : undefined;
    const planVersion = typeof output._plan_version === 'number' ? output._plan_version : undefined;

    supabase.from('atd_capability_executions').update({
      validation_status: 'passed',
      prompt_tokens: promptTokens ?? null,
      completion_tokens: completionTokens ?? null,
      provider_latency_ms: providerLatencyMs ?? null,
      result_plan_id: resultPlanId ?? null,
      plan_version: planVersion ?? null,
    }).eq('id', execution.id).then(() => {});

    await ATDCapabilityFramework.completeExecution(execution.id, output, durationMs);

    return {
      success: true,
      output,
      executionId: execution.id,
      executionRef: execution.execution_ref,
      provider: providerName,
      model: selectedModel,
      durationMs,
    };
  },
};

async function patchFailure(
  executionId: string,
  errorMessage: string,
  failureCategory: FailureCategory,
): Promise<void> {
  await supabase.from('atd_capability_executions').update({
    validation_status: 'failed',
    failure_category: failureCategory,
  }).eq('id', executionId);
}
