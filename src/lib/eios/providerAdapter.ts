/**
 * EWO-044 — Codex-Native ATD Conversation Engine
 *
 * Canonical execution provider adapter interface.
 * All execution providers (Codex, Claude, Gemini, future) must implement this interface.
 * No provider-specific logic may exist outside concrete adapter implementations.
 */

import type { StructuredProviderResponse, ProviderToolCall, ProviderToolResult } from './providerContract';

// ─── Provider Adapter Interface ─────────────────────────────────────────────

export interface IExecutionProviderAdapter {
  /** Unique provider identifier (e.g. 'codex', 'claude', 'gemini') */
  readonly providerId: string;

  /** Human-readable provider name */
  readonly providerName: string;

  /** Provider version string */
  readonly providerVersion: string;

  /**
   * Invoke the provider with a conversation message and available tools.
   *
   * The provider should:
   * 1. Process the conversation messages
   * 2. Optionally request tool calls
   * 3. Return either tool call requests (for EIOS to execute) or a final structured response
   *
   * Returns a ProviderInvocationResult containing either:
   * - tool_calls: provider wants EIOS to execute tools, then continue
   * - final_response: provider is done reasoning, return to user
   */
  invoke(req: ProviderInvocationRequest): Promise<ProviderInvocationResult>;

  /** Check if the provider is healthy and configured */
  healthCheck(): Promise<ProviderHealthStatus>;

  /** Get the provider's supported tool schema format */
  readonly toolFormat: 'openai_tools' | 'anthropic_tools' | 'gemini_functions';
}

// ─── Request / Response Types ────────────────────────────────────────────────

export interface ProviderInvocationRequest {
  /** Conversation messages (system + history + current user message) */
  messages: ProviderMessage[];

  /** Tool definitions available to the provider */
  tools: ToolDefinition[];

  /** System prompt establishing the ATD persona and governance rules */
  systemPrompt: string;

  /** Temperature (0-1) */
  temperature?: number;

  /** Max tokens for response */
  maxTokens?: number;

  /** Conversation ID for tracking */
  conversationId: string;

  /** User ID for audit */
  userId: string;

  /** Previous tool results from this turn (for multi-step reasoning) */
  priorToolResults?: ProviderToolResult[];

  /** Explicit provider config ID override */
  explicitProviderConfigId?: string;
}

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ProviderToolCall[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export type ProviderInvocationResult =
  | { kind: 'tool_calls'; toolCalls: ProviderToolCall[]; diagnostics: Partial<ProviderDiagnostics> }
  | { kind: 'final_response'; response: StructuredProviderResponse };

export interface ProviderDiagnostics {
  provider: string;
  model: string;
  provider_version: string;
  routing_strategy: string;
  prompt_tokens: number;
  completion_tokens: number;
  duration_ms: number;
  tool_calls_made: number;
  cache_hit: boolean;
}

export interface ProviderHealthStatus {
  healthy: boolean;
  configured: boolean;
  message: string;
  latencyMs: number;
}

// ─── Tool Definition Helper ──────────────────────────────────────────────────

export function defineTool(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
): ToolDefinition {
  return { name, description, parameters };
}
