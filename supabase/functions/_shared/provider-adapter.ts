/**
 * EWO-044R1 — Provider Adapter for Edge Functions (Deno runtime).
 *
 * Concrete IExecutionProviderAdapter implementations using native provider tool calling.
 * The Conversation Gateway edge function routes ALL provider invocations through this module.
 * No prompt-based JSON tool simulation.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ─── Types (mirrors src/lib/eios/providerAdapter.ts + providerContract.ts) ────

export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ProviderToolCall {
  tool: string;
  parameters: Record<string, unknown>;
}

export interface ProviderToolResult {
  tool: string;
  success: boolean;
  result: unknown;
  error: { code: string; message: string } | null;
}

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

export type ProviderInvocationResult =
  | { kind: "tool_calls"; toolCalls: ProviderToolCall[]; diagnostics: Partial<ProviderDiagnostics> }
  | { kind: "final_response"; content: string; diagnostics: Partial<ProviderDiagnostics> };

export interface ProviderInvocationRequest {
  messages: ProviderMessage[];
  tools: ToolDefinition[];
  systemPrompt: string;
  temperature?: number;
  maxTokens?: number;
  conversationId: string;
  userId: string;
  priorToolResults?: ProviderToolResult[];
}

// ─── Config ────────────────────────────────────────────────────────────────────

interface ProviderConfig {
  configId: string;
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  isDefault: boolean;
}

async function loadProviderConfig(
  svc: SupabaseClient,
  explicitConfigId?: string,
): Promise<ProviderConfig | null> {
  if (explicitConfigId) {
    const { data } = await svc
      .from("ai_provider_configs")
      .select("id, provider, api_key, model, base_url, is_default")
      .eq("id", explicitConfigId)
      .eq("is_enabled", true)
      .eq("has_api_key", true)
      .maybeSingle();
    if (data?.api_key) {
      return {
        configId: data.id,
        provider: data.provider,
        apiKey: data.api_key,
        model: data.model || defaultModel(data.provider),
        baseUrl: data.base_url || "",
        isDefault: !!data.is_default,
      };
    }
  }

  const { data: def } = await svc
    .from("ai_provider_configs")
    .select("id, provider, api_key, model, base_url, is_default")
    .eq("is_default", true)
    .eq("is_enabled", true)
    .eq("has_api_key", true)
    .maybeSingle();
  if (def?.api_key) {
    return {
      configId: def.id,
      provider: def.provider,
      apiKey: def.api_key,
      model: def.model || defaultModel(def.provider),
      baseUrl: def.base_url || "",
      isDefault: true,
    };
  }

  const { data: any } = await svc
    .from("ai_provider_configs")
    .select("id, provider, api_key, model, base_url, is_default")
    .eq("is_enabled", true)
    .eq("has_api_key", true)
    .limit(1)
    .maybeSingle();
  if (any?.api_key) {
    return {
      configId: any.id,
      provider: any.provider,
      apiKey: any.api_key,
      model: any.model || defaultModel(any.provider),
      baseUrl: any.base_url || "",
      isDefault: !!any.is_default,
    };
  }

  return null;
}

function defaultModel(provider: string): string {
  switch (provider) {
    case "gemini": return "gemini-2.5-flash";
    case "anthropic": return "claude-3-5-sonnet-20241022";
    default: return "gpt-4o";
  }
}

// ─── Adapter: OpenAI ───────────────────────────────────────────────────────────

interface OpenAIToolCallRaw {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

function invokeOpenAI(
  cfg: ProviderConfig,
  req: ProviderInvocationRequest,
): Promise<ProviderInvocationResult> {
  return invokeOpenAICompatible(cfg, req, false);
}

async function invokeOpenAICompatible(
  cfg: ProviderConfig,
  req: ProviderInvocationRequest,
  isAnthropic: boolean,
): Promise<ProviderInvocationResult> {
  const startMs = Date.now();
  const url = cfg.baseUrl
    ? `${cfg.baseUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://api.openai.com/v1/chat/completions";

  const messages: Array<Record<string, unknown>> = [];
  if (req.systemPrompt) {
    messages.push({ role: "system", content: req.systemPrompt });
  }
  for (const msg of req.messages) {
    if (msg.role === "system") continue;
    messages.push({ role: msg.role, content: msg.content });
  }
  if (req.priorToolResults && req.priorToolResults.length > 0) {
    messages.push({
      role: "system",
      content: "Previous tool results (use these to answer the user's question. Return ONLY a JSON object conforming to the provider contract schema. Do NOT call tools again.):\n" + JSON.stringify(req.priorToolResults, null, 2),
    });
  }

  const tools = req.tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const isFinalRound = !!(req.priorToolResults && req.priorToolResults.length > 0);

  const body: Record<string, unknown> = {
    model: cfg.model,
    messages,
    temperature: req.temperature ?? 0.4,
    max_tokens: req.maxTokens ?? 4096,
  };
  if (tools.length > 0 && !isFinalRound) {
    body.tools = tools;
    body.tool_choice = "auto";
  } else {
    body.response_format = { type: "json_object" };
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Provider API error ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  const durationMs = Date.now() - startMs;
  const choice = data.choices?.[0];
  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? 0;

  const diagnostics: Partial<ProviderDiagnostics> = {
    provider: cfg.provider,
    model: cfg.model,
    provider_version: "1.0",
    routing_strategy: "adapter",
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    duration_ms: durationMs,
    tool_calls_made: 0,
    cache_hit: false,
  };

  if (!choice) {
    return { kind: "final_response", content: "", diagnostics };
  }

  const nativeToolCalls = choice.message?.tool_calls as OpenAIToolCallRaw[] | undefined;
  if (nativeToolCalls && nativeToolCalls.length > 0) {
    const toolCalls: ProviderToolCall[] = nativeToolCalls.map((tc) => ({
      tool: tc.function.name,
      parameters: safeParseArgs(tc.function.arguments),
    }));
    diagnostics.tool_calls_made = toolCalls.length;
    return { kind: "tool_calls", toolCalls, diagnostics };
  }

  const content = choice.message?.content ?? "";
  return { kind: "final_response", content, diagnostics };
}

// ─── Adapter: Anthropic ────────────────────────────────────────────────────────

async function invokeAnthropic(
  cfg: ProviderConfig,
  req: ProviderInvocationRequest,
): Promise<ProviderInvocationResult> {
  const startMs = Date.now();
  const url = cfg.baseUrl || "https://api.anthropic.com/v1/messages";

  const messages: Array<Record<string, unknown>> = [];
  for (const msg of req.messages) {
    if (msg.role === "system") continue;
    messages.push({ role: msg.role === "assistant" ? "assistant" : "user", content: msg.content });
  }
  if (req.priorToolResults && req.priorToolResults.length > 0) {
    messages.push({
      role: "user",
      content: "Previous tool results:\n" + JSON.stringify(req.priorToolResults, null, 2),
    });
  }

  const tools = req.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  const body: Record<string, unknown> = {
    model: cfg.model,
    max_tokens: req.maxTokens ?? 4096,
    temperature: req.temperature ?? 0.4,
    system: req.systemPrompt ?? "",
    messages,
  };
  if (tools.length > 0) body.tools = tools;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  const durationMs = Date.now() - startMs;
  const promptTokens = data.usage?.input_tokens ?? 0;
  const completionTokens = data.usage?.output_tokens ?? 0;

  const diagnostics: Partial<ProviderDiagnostics> = {
    provider: cfg.provider,
    model: cfg.model,
    provider_version: "1.0",
    routing_strategy: "adapter",
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    duration_ms: durationMs,
    tool_calls_made: 0,
    cache_hit: false,
  };

  const toolUseBlocks = (data.content ?? []).filter((b: { type: string }) => b.type === "tool_use");
  if (toolUseBlocks.length > 0) {
    const toolCalls: ProviderToolCall[] = toolUseBlocks.map((tc: { name: string; input: Record<string, unknown> }) => ({
      tool: tc.name,
      parameters: tc.input ?? {},
    }));
    diagnostics.tool_calls_made = toolCalls.length;
    return { kind: "tool_calls", toolCalls, diagnostics };
  }

  const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === "text");
  const content = textBlock?.text ?? "";
  return { kind: "final_response", content, diagnostics };
}

// ─── Adapter: Gemini ───────────────────────────────────────────────────────────

async function invokeGemini(
  cfg: ProviderConfig,
  req: ProviderInvocationRequest,
): Promise<ProviderInvocationResult> {
  const startMs = Date.now();
  const model = cfg.model || "gemini-2.5-flash";
  const baseUrl = cfg.baseUrl || "https://generativelanguage.googleapis.com";
  const url = `${baseUrl.replace(/\/$/, "")}/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`;

  const contents = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  if (req.priorToolResults && req.priorToolResults.length > 0) {
    contents.push({
      role: "user",
      parts: [{ text: "Previous tool results:\n" + JSON.stringify(req.priorToolResults, null, 2) }],
    });
  }

  const tools = req.tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: req.temperature ?? 0.4,
      maxOutputTokens: req.maxTokens ?? 4096,
    },
  };
  if (req.systemPrompt) {
    body.systemInstruction = { parts: [{ text: req.systemPrompt }] };
  }
  if (tools.length > 0) {
    body.tools = [{ functionDeclarations: tools }];
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  const durationMs = Date.now() - startMs;
  const promptTokens = data.usageMetadata?.promptTokenCount ?? 0;
  const completionTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

  const diagnostics: Partial<ProviderDiagnostics> = {
    provider: cfg.provider,
    model: cfg.model,
    provider_version: "1.0",
    routing_strategy: "adapter",
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    duration_ms: durationMs,
    tool_calls_made: 0,
    cache_hit: false,
  };

  const candidate = data.candidates?.[0];
  if (!candidate) {
    return { kind: "final_response", content: "", diagnostics };
  }

  const functionCalls = (candidate.content?.parts ?? []).filter((p: Record<string, unknown>) => "functionCall" in p);
  if (functionCalls.length > 0) {
    const toolCalls: ProviderToolCall[] = functionCalls.map((fc: { functionCall: { name: string; args: Record<string, unknown> } }) => ({
      tool: fc.functionCall.name,
      parameters: fc.functionCall.args ?? {},
    }));
    diagnostics.tool_calls_made = toolCalls.length;
    return { kind: "tool_calls", toolCalls, diagnostics };
  }

  const textPart = (candidate.content?.parts ?? []).find((p: Record<string, unknown>) => "text" in p);
  const content = textPart?.text ?? "";
  return { kind: "final_response", content, diagnostics };
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────────

export async function invokeProvider(
  svc: SupabaseClient,
  req: ProviderInvocationRequest,
  explicitConfigId?: string,
): Promise<ProviderInvocationResult> {
  const cfg = await loadProviderConfig(svc, explicitConfigId);
  if (!cfg) {
    throw new Error("NO_API_KEY: AI provider not configured. Go to Settings → AI Provider.");
  }

  const providerType = cfg.provider.toLowerCase();
  if (providerType === "anthropic") {
    return await invokeAnthropic(cfg, req);
  }
  if (providerType === "gemini") {
    return await invokeGemini(cfg, req);
  }
  return await invokeOpenAI(cfg, req);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
