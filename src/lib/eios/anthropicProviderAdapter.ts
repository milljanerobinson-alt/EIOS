/**
 * EWO-044R1 — Concrete IExecutionProviderAdapter implementation for Anthropic Claude.
 *
 * Uses Anthropic's native tool calling API.
 */

import type {
  IExecutionProviderAdapter,
  ProviderInvocationRequest,
  ProviderInvocationResult,
  ProviderHealthStatus,
  ToolDefinition,
} from './providerAdapter';
import type { StructuredProviderResponse, ProviderToolCall, ProviderDiagnostics } from './providerContract';

export interface AnthropicAdapterConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  providerId: string;
  providerName: string;
  providerVersion: string;
  timeoutMs: number;
}

interface AnthropicToolCall {
  id: string;
  type: 'tool_use';
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicMessageResponse {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  >;
  usage?: { input_tokens: number; output_tokens: number };
  model: string;
  stop_reason: string | null;
}

export class AnthropicExecutionProviderAdapter implements IExecutionProviderAdapter {
  readonly providerId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  readonly toolFormat = 'anthropic_tools' as const;

  private readonly config: AnthropicAdapterConfig;

  constructor(config: AnthropicAdapterConfig) {
    this.config = config;
    this.providerId = config.providerId;
    this.providerName = config.providerName;
    this.providerVersion = config.providerVersion;
  }

  async invoke(req: ProviderInvocationRequest): Promise<ProviderInvocationResult> {
    const startMs = Date.now();
    const url = this.config.baseUrl || 'https://api.anthropic.com/v1/messages';

    const messages = this.buildMessages(req);
    const tools = this.buildToolDefinitions(req.tools);

    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.4,
      system: req.systemPrompt ?? '',
      messages,
    };
    if (tools.length > 0) {
      body.tools = tools;
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Anthropic API error ${resp.status}: ${errorText.slice(0, 300)}`);
    }

    const data = (await resp.json()) as AnthropicMessageResponse;
    const durationMs = Date.now() - startMs;
    const promptTokens = data.usage?.input_tokens ?? 0;
    const completionTokens = data.usage?.output_tokens ?? 0;

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

    const toolUseBlocks = data.content?.filter((b) => b.type === 'tool_use') as AnthropicToolCall[] | undefined;
    if (toolUseBlocks && toolUseBlocks.length > 0) {
      const toolCalls: ProviderToolCall[] = toolUseBlocks.map((tc) => ({
        tool: tc.name,
        parameters: tc.input ?? {},
      }));
      diagnostics.tool_calls_made = toolCalls.length;
      return { kind: 'tool_calls', toolCalls, diagnostics };
    }

    const textBlock = data.content?.find((b) => b.type === 'text') as { text: string } | undefined;
    const content = textBlock?.text ?? '';
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
      const url = this.config.baseUrl || 'https://api.anthropic.com/v1/messages';
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 8,
          messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
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

  private buildMessages(req: ProviderInvocationRequest): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    for (const msg of req.messages) {
      if (msg.role === 'system') continue;
      out.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
    }
    if (req.priorToolResults && req.priorToolResults.length > 0) {
      out.push({
        role: 'user',
        content: 'Previous tool results:\n' + JSON.stringify(req.priorToolResults, null, 2),
      });
    }
    return out;
  }

  private buildToolDefinitions(tools: ToolDefinition[]): Array<Record<string, unknown>> {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
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
