/**
 * EWO-044R1 — Concrete IExecutionProviderAdapter implementation for OpenAI-compatible providers.
 *
 * Uses the provider's native function/tool calling API.
 * No prompt-based JSON tool simulation.
 */

import type {
  IExecutionProviderAdapter,
  ProviderInvocationRequest,
  ProviderInvocationResult,
  ProviderHealthStatus,
  ToolDefinition,
} from './providerAdapter';
import type { StructuredProviderResponse, ProviderToolCall, ProviderDiagnostics } from './providerContract';

export interface OpenAIAdapterConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  providerId: string;
  providerName: string;
  providerVersion: string;
  timeoutMs: number;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAIChatResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
  model: string;
}

export class OpenAIExecutionProviderAdapter implements IExecutionProviderAdapter {
  readonly providerId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  readonly toolFormat = 'openai_tools' as const;

  private readonly config: OpenAIAdapterConfig;

  constructor(config: OpenAIAdapterConfig) {
    this.config = config;
    this.providerId = config.providerId;
    this.providerName = config.providerName;
    this.providerVersion = config.providerVersion;
  }

  async invoke(req: ProviderInvocationRequest): Promise<ProviderInvocationResult> {
    const startMs = Date.now();
    const url = this.config.baseUrl
      ? `${this.config.baseUrl.replace(/\/$/, '')}/v1/chat/completions`
      : 'https://api.openai.com/v1/chat/completions';

    const messages = this.buildMessages(req);
    const tools = this.buildToolDefinitions(req.tools);

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: req.temperature ?? 0.4,
      max_tokens: req.maxTokens ?? 4096,
    };
    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`${this.providerName} API error ${resp.status}: ${errorText.slice(0, 300)}`);
    }

    const data = (await resp.json()) as OpenAIChatResponse;
    const durationMs = Date.now() - startMs;
    const choice = data.choices?.[0];
    const promptTokens = data.usage?.prompt_tokens ?? 0;
    const completionTokens = data.usage?.completion_tokens ?? 0;

    const diagnostics: Partial<ProviderDiagnostics> = {
      provider: this.providerId,
      model: this.config.model,
      provider_version: this.providerVersion,
      routing_strategy: 'adapter',
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      duration_ms: durationMs,
      tool_calls_made: 0,
      cache_hit: false,
    };

    if (!choice) {
      return {
        kind: 'final_response',
        response: this.buildFallback(req, diagnostics, 'No response choices returned.'),
      };
    }

    const nativeToolCalls = choice.message.tool_calls;
    if (nativeToolCalls && nativeToolCalls.length > 0) {
      const toolCalls: ProviderToolCall[] = nativeToolCalls.map((tc) => ({
        tool: tc.function.name,
        parameters: this.parseToolArguments(tc.function.arguments),
      }));
      diagnostics.tool_calls_made = toolCalls.length;
      return { kind: 'tool_calls', toolCalls, diagnostics };
    }

    const content = choice.message.content ?? '';
    const parsed = this.parseStructuredResponse(content);
    if (parsed) {
      return { kind: 'final_response', response: { ...parsed, provider_diagnostics: this.mergeDiagnostics(parsed, diagnostics) } };
    }

    return {
      kind: 'final_response',
      response: this.buildFallback(req, diagnostics, 'Failed to parse provider response as structured JSON.'),
    };
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    const startMs = Date.now();
    try {
      const url = this.config.baseUrl
        ? `${this.config.baseUrl.replace(/\/$/, '')}/v1/chat/completions`
        : 'https://api.openai.com/v1/chat/completions';
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
          max_tokens: 8,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      return {
        healthy: resp.ok,
        configured: !!this.config.apiKey,
        message: resp.ok ? 'Connected' : `HTTP ${resp.status}`,
        latencyMs: Date.now() - startMs,
      };
    } catch (e) {
      return {
        healthy: false,
        configured: !!this.config.apiKey,
        message: e instanceof Error ? e.message.slice(0, 200) : String(e),
        latencyMs: Date.now() - startMs,
      };
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private buildMessages(req: ProviderInvocationRequest): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    if (req.systemPrompt) {
      out.push({ role: 'system', content: req.systemPrompt });
    }
    for (const msg of req.messages) {
      if (msg.role === 'system') continue;
      out.push({ role: msg.role, content: msg.content });
    }
    if (req.priorToolResults && req.priorToolResults.length > 0) {
      out.push({
        role: 'system',
        content: 'Previous tool results:\n' + JSON.stringify(req.priorToolResults, null, 2),
      });
    }
    return out;
  }

  private buildToolDefinitions(tools: ToolDefinition[]): Array<Record<string, unknown>> {
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  private parseToolArguments(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private parseStructuredResponse(content: string): StructuredProviderResponse | null {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && 'response_type' in parsed) {
        return parsed as StructuredProviderResponse;
      }
      return null;
    } catch {
      return null;
    }
  }

  private mergeDiagnostics(
    resp: StructuredProviderResponse,
    adapterDiagnostics: Partial<ProviderDiagnostics>,
  ): ProviderDiagnostics {
    const d = resp.provider_diagnostics;
    return {
      provider: adapterDiagnostics.provider ?? d?.provider ?? this.providerId,
      model: adapterDiagnostics.model ?? d?.model ?? this.config.model,
      provider_version: adapterDiagnostics.provider_version ?? d?.provider_version ?? this.providerVersion,
      routing_strategy: adapterDiagnostics.routing_strategy ?? d?.routing_strategy ?? 'adapter',
      prompt_tokens: adapterDiagnostics.prompt_tokens ?? d?.prompt_tokens ?? 0,
      completion_tokens: adapterDiagnostics.completion_tokens ?? d?.completion_tokens ?? 0,
      duration_ms: adapterDiagnostics.duration_ms ?? d?.duration_ms ?? 0,
      tool_calls_made: adapterDiagnostics.tool_calls_made ?? d?.tool_calls_made ?? 0,
      cache_hit: adapterDiagnostics.cache_hit ?? d?.cache_hit ?? false,
    };
  }

  private buildFallback(
    req: ProviderInvocationRequest,
    diagnostics: Partial<ProviderDiagnostics>,
    error: string,
  ): StructuredProviderResponse {
    const lastUserMessage = [...req.messages].reverse().find((m) => m.role === 'user');
    return {
      response_type: 'tool_error',
      interpreted_request: lastUserMessage?.content ?? '',
      user_facing_message:
        'I encountered an issue processing that request. Could you rephrase or try again?',
      referenced_project: null,
      referenced_repository: null,
      referenced_ewo: null,
      proposed_action: null,
      proposed_lifecycle_action: null,
      clarification_required: false,
      clarification_question: null,
      confidence: 0,
      governance_check_required: false,
      approval_required: false,
      execution_required: false,
      requested_tools: [],
      tool_results: [],
      warnings: [error],
      provider_diagnostics: {
        provider: diagnostics.provider ?? this.providerId,
        model: diagnostics.model ?? this.config.model,
        provider_version: diagnostics.provider_version ?? this.providerVersion,
        routing_strategy: diagnostics.routing_strategy ?? 'adapter',
        prompt_tokens: diagnostics.prompt_tokens ?? 0,
        completion_tokens: diagnostics.completion_tokens ?? 0,
        duration_ms: diagnostics.duration_ms ?? 0,
        tool_calls_made: 0,
        cache_hit: false,
      },
    };
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createOpenAIAdapter(config: OpenAIAdapterConfig): OpenAIExecutionProviderAdapter {
  return new OpenAIExecutionProviderAdapter(config);
}

// ─── Provider Registry ────────────────────────────────────────────────────────

import type { IExecutionProviderAdapter as IAdapter } from './providerAdapter';

interface ProviderConfigRow {
  id: string;
  provider: string;
  model: string;
  base_url: string;
  api_key: string;
}

interface RegistryEntry {
  configId: string;
  providerType: string;
  adapter: IAdapter;
}

const registry: Map<string, RegistryEntry> = new Map();
let defaultAdapter: RegistryEntry | null = null;

export function registerProvider(configId: string, adapter: IAdapter, isDefault: boolean): void {
  const entry: RegistryEntry = { configId, providerType: adapter.providerId, adapter };
  registry.set(configId, entry);
  if (isDefault) {
    defaultAdapter = entry;
  }
}

export function getProviderByConfigId(configId: string): IAdapter | null {
  return registry.get(configId)?.adapter ?? null;
}

export function getDefaultProvider(): IAdapter | null {
  return defaultAdapter?.adapter ?? null;
}

export function clearProviderRegistry(): void {
  registry.clear();
  defaultAdapter = null;
}

export async function resolveProviderFromConfigRow(
  row: ProviderConfigRow,
): Promise<IAdapter> {
  const providerType = row.provider.toLowerCase();
  const version = '1.0';

  if (providerType === 'anthropic') {
    const { AnthropicExecutionProviderAdapter } = await import('./anthropicProviderAdapter');
    return new AnthropicExecutionProviderAdapter({
      apiKey: row.api_key,
      model: row.model,
      baseUrl: row.base_url,
      providerId: 'anthropic',
      providerName: 'Anthropic Claude',
      providerVersion: version,
      timeoutMs: 90_000,
    });
  }

  if (providerType === 'gemini') {
    const { GeminiExecutionProviderAdapter } = await import('./geminiProviderAdapter');
    return new GeminiExecutionProviderAdapter({
      apiKey: row.api_key,
      model: row.model,
      baseUrl: row.base_url,
      providerId: 'gemini',
      providerName: 'Google Gemini',
      providerVersion: version,
      timeoutMs: 90_000,
    });
  }

  return new OpenAIExecutionProviderAdapter({
    apiKey: row.api_key,
    model: row.model,
    baseUrl: row.base_url,
    providerId: row.provider,
    providerName: row.provider,
    providerVersion: version,
    timeoutMs: 90_000,
  });
}
