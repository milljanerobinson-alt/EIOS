/**
 * Platform AI Service — Multi-Provider
 *
 * Single entry point for all LLM calls across the platform.
 * Supports OpenAI, Google Gemini, and Anthropic Claude.
 *
 * Config resolution order:
 *  1. `ai_provider_configs` table — multi-provider registry (new)
 *  2. Legacy `settings` keys (llm_api_key, llm_model, etc.) — backward compat
 *
 * Callers must NEVER import provider SDKs or call provider APIs directly.
 * Use generate() for all AI requests.
 */

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIRequest {
  /** Caller identifier used for usage logging */
  feature: string;
  messages: AIMessage[];
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** SHA-256 hex cache key. If provided and a cached result exists, it is returned. */
  cacheKey?: string;
  cacheTtlSeconds?: number;
  userId?: string;
  /**
   * When set, routes to this specific ai_provider_configs row instead of the default.
   * Enables deterministic routing from the capability engine.
   */
  explicitProviderConfigId?: string;
}

export interface AIRoutingMetadata {
  configId: string;
  provider: string;
  model: string;
  routingStrategy: "explicit" | "default_provider" | "fallback";
  usedDefault: boolean;
  fallbackOccurred: boolean;
  fallbackReason?: string;
  routingTimestamp: string;
}

export interface AIResponse {
  content: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  cacheHit: boolean;
  routingMetadata?: AIRoutingMetadata;
}

export interface AIConfig {
  provider: string;   // "openai" | "gemini" | "anthropic"
  apiKey: string;
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  retryCount: number;
  timeoutMs: number;
}

// ── Config loader — multi-provider first, legacy fallback ──────────────────────

export async function loadAIConfig(
  svc: SupabaseClient,
  explicitProviderConfigId?: string,
): Promise<{ config: AIConfig; routingMetadata: AIRoutingMetadata } | null> {
  const routingTimestamp = new Date().toISOString();

  // ── 1. Explicit provider override ────────────────────────────────────────────
  if (explicitProviderConfigId) {
    const { data: explicit } = await svc
      .from("ai_provider_configs")
      .select("*")
      .eq("id", explicitProviderConfigId)
      .eq("is_enabled", true)
      .eq("has_api_key", true)
      .maybeSingle();

    if (explicit?.api_key) {
      return {
        config: {
          provider: explicit.provider,
          apiKey: explicit.api_key,
          model: explicit.model || defaultModelFor(explicit.provider),
          baseUrl: explicit.base_url || "",
          temperature: 0.7,
          maxTokens: 4096,
          retryCount: 1,
          timeoutMs: 90_000,
        },
        routingMetadata: {
          configId: explicit.id,
          provider: explicit.provider,
          model: explicit.model || defaultModelFor(explicit.provider),
          routingStrategy: "explicit",
          usedDefault: false,
          fallbackOccurred: false,
          routingTimestamp,
        },
      };
    }
    // Explicit config unavailable — fall through to default with fallback flag
  }

  // ── 2. Multi-provider registry — default provider ────────────────────────────
  const { data: providerCfg } = await svc
    .from("ai_provider_configs")
    .select("*")
    .eq("is_default", true)
    .eq("is_enabled", true)
    .eq("has_api_key", true)
    .maybeSingle();

  if (providerCfg?.api_key) {
    const fallbackOccurred = !!explicitProviderConfigId;
    return {
      config: {
        provider: providerCfg.provider,
        apiKey: providerCfg.api_key,
        model: providerCfg.model || defaultModelFor(providerCfg.provider),
        baseUrl: providerCfg.base_url || "",
        temperature: 0.7,
        maxTokens: 4096,
        retryCount: 1,
        timeoutMs: 90_000,
      },
      routingMetadata: {
        configId: providerCfg.id,
        provider: providerCfg.provider,
        model: providerCfg.model || defaultModelFor(providerCfg.provider),
        routingStrategy: fallbackOccurred ? "fallback" : "default_provider",
        usedDefault: true,
        fallbackOccurred,
        fallbackReason: fallbackOccurred
          ? `Explicit provider config ${explicitProviderConfigId} unavailable; fell back to default`
          : undefined,
        routingTimestamp,
      },
    };
  }

  // ── 3. Legacy settings fallback ──────────────────────────────────────────────
  const keys = [
    "llm_api_key", "llm_model", "llm_base_url",
    "ai_provider", "ai_temperature", "ai_max_tokens",
    "ai_retry_count", "ai_request_timeout",
  ];
  const { data: rows } = await svc.from("settings").select("key, value").in("key", keys);
  if (!rows || rows.length === 0) return null;

  const m: Record<string, string> = {};
  for (const row of rows) m[row.key] = typeof row.value === "string" ? row.value : String(row.value ?? "");

  const apiKey = m["llm_api_key"];
  if (!apiKey) return null;

  const model = m["llm_model"] || "gpt-4o";
  const rawBase = m["llm_base_url"] || "";
  const provider = m["ai_provider"] || detectProviderFromModel(rawBase, model);

  return {
    config: {
      provider,
      apiKey,
      model,
      baseUrl: rawBase,
      temperature: parseFloat(m["ai_temperature"] || "0.7"),
      maxTokens: parseInt(m["ai_max_tokens"] || "4096", 10),
      retryCount: Math.min(5, parseInt(m["ai_retry_count"] || "2", 10)),
      timeoutMs: Math.min(120_000, parseInt(m["ai_request_timeout"] || "30", 10) * 1000),
    },
    routingMetadata: {
      configId: "legacy",
      provider,
      model,
      routingStrategy: "fallback",
      usedDefault: false,
      fallbackOccurred: true,
      fallbackReason: "No ai_provider_configs found; using legacy settings",
      routingTimestamp,
    },
  };
}

function defaultModelFor(provider: string): string {
  switch (provider) {
    case "gemini":    return "gemini-2.5-flash";
    case "anthropic": return "claude-3-5-sonnet-20241022";
    default:          return "gpt-4o";
  }
}

function detectProviderFromModel(baseUrl: string, model: string): string {
  if (baseUrl.includes("anthropic") || model.includes("claude")) return "anthropic";
  if (baseUrl.includes("generativelanguage") || model.includes("gemini")) return "gemini";
  return "openai";
}

// ── Message sanitization ──────────────────────────────────────────────────────
// EWO-032R.3: Import from standalone module so browser tests can import the
// same logic without pulling Deno-specific dependencies.
import { sanitizeMessages } from "./sanitizeMessages.ts";
export { sanitizeMessages };

// ── Provider: OpenAI ──────────────────────────────────────────────────────────

async function callOpenAI(
  cfg: AIConfig,
  messages: AIMessage[],
  temperature: number,
  maxTokens: number,
): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
  const url = cfg.baseUrl
    ? `${cfg.baseUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://api.openai.com/v1/chat/completions";

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: sanitizeMessages(messages),
      temperature,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${body.slice(0, 300)}`);
  }

  const data = await resp.json();
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
  };
}

// ── Provider: Anthropic ───────────────────────────────────────────────────────

async function callAnthropic(
  cfg: AIConfig,
  messages: AIMessage[],
  systemPrompt: string,
  temperature: number,
  maxTokens: number,
): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
  const url = cfg.baseUrl || "https://api.anthropic.com/v1/messages";

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: sanitizeMessages(messages)
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content })),
    }),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${body.slice(0, 300)}`);
  }

  const data = await resp.json();
  return {
    content: data.content?.[0]?.text ?? "",
    promptTokens: data.usage?.input_tokens ?? 0,
    completionTokens: data.usage?.output_tokens ?? 0,
  };
}

// ── Provider: Google Gemini ───────────────────────────────────────────────────

async function callGemini(
  cfg: AIConfig,
  messages: AIMessage[],
  systemPrompt: string,
  temperature: number,
  maxTokens: number,
): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
  const model = cfg.model || "gemini-2.5-flash";
  const baseUrl = cfg.baseUrl || "https://generativelanguage.googleapis.com";
  const url = `${baseUrl.replace(/\/$/, "")}/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`;

  const contents = sanitizeMessages(messages)
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(cfg.timeoutMs),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${errBody.slice(0, 300)}`);
  }

  const data = await resp.json();
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
    promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
    completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

// ── Cost estimator ────────────────────────────────────────────────────────────

function estimateCost(provider: string, model: string, promptTokens: number, completionTokens: number): number {
  const pricing: Record<string, [number, number]> = {
    "gpt-4o":                  [0.000005,    0.000015    ],
    "gpt-4o-mini":             [0.00000015,  0.0000006   ],
    "gpt-4-turbo":             [0.00001,     0.00003     ],
    "gpt-3.5-turbo":           [0.0000005,   0.0000015   ],
    "o1":                      [0.000015,    0.00006     ],
    "o1-mini":                 [0.000003,    0.000012    ],
    "o3-mini":                 [0.0000011,   0.0000044   ],
    "claude-opus-4-5":         [0.000015,    0.000075    ],
    "claude-3-5-sonnet":       [0.000003,    0.000015    ],
    "claude-3-5-haiku":        [0.00000025,  0.00000125  ],
    "claude-3-opus":           [0.000015,    0.000075    ],
    "gemini-2.5-flash":        [0.0000003,   0.0000025   ],
    "gemini-2.5-pro":          [0.00000125,  0.00001     ],
    "gemini-1.5-flash":        [0.000000075, 0.0000003   ],
    "gemini-1.5-pro":          [0.00000125,  0.000005    ],
    "gemini-flash-8b":         [0.0000000375,0.00000015  ],
  };

  const key = Object.keys(pricing).find((k) => model.toLowerCase().includes(k.toLowerCase()));
  if (!key) return 0;
  const [inRate, outRate] = pricing[key];
  return promptTokens * inRate + completionTokens * outRate;
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

async function getCached(svc: SupabaseClient, cacheKey: string): Promise<AIResponse | null> {
  const { data } = await svc
    .from("ai_response_cache")
    .select("response_body, hit_count")
    .eq("cache_key", cacheKey)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!data) return null;

  svc.from("ai_response_cache")
    .update({ hit_count: data.hit_count + 1 })
    .eq("cache_key", cacheKey)
    .then(() => {});

  return { ...(data.response_body as Omit<AIResponse, "cacheHit">), cacheHit: true };
}

async function setCached(
  svc: SupabaseClient,
  cacheKey: string,
  feature: string,
  response: Omit<AIResponse, "cacheHit">,
  ttlSeconds: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await svc.from("ai_response_cache").upsert({
    cache_key: cacheKey,
    feature,
    response_body: response,
    expires_at: expiresAt,
    hit_count: 0,
  }, { onConflict: "cache_key" });
}

// ── Usage logger ──────────────────────────────────────────────────────────────

async function logUsage(
  svc: SupabaseClient,
  feature: string,
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  estimatedCost: number,
  durationMs: number,
  success: boolean,
  cacheHit: boolean,
  userId?: string,
  errorMessage?: string,
): Promise<void> {
  try {
    await svc.from("ai_usage_log").insert({
      feature, provider, model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      estimated_cost_usd: estimatedCost,
      duration_ms: durationMs,
      success, cache_hit: cacheHit,
      user_id: userId ?? null,
      error_message: errorMessage ?? null,
    });
  } catch (_) {
    // Non-fatal
  }
}

// ── Health check ──────────────────────────────────────────────────────────────

export interface HealthCheckResult {
  status: "healthy" | "error";
  latencyMs: number;
  message: string;
  model: string;
}

export async function checkProviderHealth(
  provider: string,
  apiKey: string,
  model: string,
  baseUrl: string,
  timeoutMs = 15_000,
): Promise<HealthCheckResult> {
  const cfg: AIConfig = {
    provider, apiKey,
    model: model || defaultModelFor(provider),
    baseUrl, temperature: 0, maxTokens: 8,
    retryCount: 0, timeoutMs,
  };

  const testMessages: AIMessage[] = [{ role: "user", content: "Reply with the single word: OK" }];
  const start = Date.now();

  try {
    let result: { content: string } | null = null;

    if (provider === "anthropic") {
      result = await callAnthropic(cfg, testMessages, "", 0, 8);
    } else if (provider === "gemini") {
      result = await callGemini(cfg, testMessages, "", 0, 16);
    } else {
      result = await callOpenAI(cfg, testMessages, 0, 8);
    }

    return {
      status: "healthy",
      latencyMs: Date.now() - start,
      message: `Connected. Model: ${cfg.model}. Response: "${result.content.slice(0, 60).trim()}"`,
      model: cfg.model,
    };
  } catch (e) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      message: e instanceof Error ? e.message.slice(0, 200) : String(e),
      model: cfg.model,
    };
  }
}

// ── Main generate function ────────────────────────────────────────────────────

export async function generate(svc: SupabaseClient, req: AIRequest): Promise<AIResponse> {
  // Cache check
  if (req.cacheKey) {
    const cached = await getCached(svc, req.cacheKey);
    if (cached) {
      await logUsage(svc, req.feature, cached.provider, cached.model, 0, 0, 0, 0, true, true, req.userId);
      return cached;
    }
  }

  const resolved = await loadAIConfig(svc, req.explicitProviderConfigId);
  if (!resolved) {
    throw new Error("NO_API_KEY: AI provider not configured. Go to Settings → AI Provider.");
  }

  const { config: cfg, routingMetadata } = resolved;

  const temperature = req.temperature ?? cfg.temperature;
  const maxTokens = req.maxTokens ?? cfg.maxTokens;
  const model = req.model ?? cfg.model;
  const effectiveCfg = { ...cfg, model };

  let messages = [...req.messages];
  let systemPrompt = req.systemPrompt ?? "";

  if (!systemPrompt) {
    const sysMsg = messages.find((m) => m.role === "system");
    if (sysMsg) {
      systemPrompt = sysMsg.content;
      messages = messages.filter((m) => m.role !== "system");
    }
  } else {
    messages = messages.filter((m) => m.role !== "system");
  }

  const openAIMessages: AIMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }, ...messages]
    : messages;

  const startMs = Date.now();
  let lastError: Error | null = null;
  let result: { content: string; promptTokens: number; completionTokens: number } | null = null;

  for (let attempt = 0; attempt <= effectiveCfg.retryCount; attempt++) {
    try {
      if (effectiveCfg.provider === "anthropic") {
        result = await callAnthropic(effectiveCfg, messages, systemPrompt, temperature, maxTokens);
      } else if (effectiveCfg.provider === "gemini") {
        result = await callGemini(effectiveCfg, messages, systemPrompt, temperature, maxTokens);
      } else {
        result = await callOpenAI(effectiveCfg, openAIMessages, temperature, maxTokens);
      }
      lastError = null;
      break;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < effectiveCfg.retryCount) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  const durationMs = Date.now() - startMs;

  if (!result) {
    await logUsage(
      svc, req.feature, effectiveCfg.provider, effectiveCfg.model,
      0, 0, 0, durationMs, false, false, req.userId, lastError?.message,
    );
    throw lastError ?? new Error("AI request failed after retries");
  }

  const estimatedCost = estimateCost(
    effectiveCfg.provider, effectiveCfg.model, result.promptTokens, result.completionTokens,
  );

  await logUsage(
    svc, req.feature, effectiveCfg.provider, effectiveCfg.model,
    result.promptTokens, result.completionTokens, estimatedCost, durationMs,
    true, false, req.userId,
  );

  const response: AIResponse = {
    content: result.content,
    provider: effectiveCfg.provider,
    model: effectiveCfg.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    durationMs,
    cacheHit: false,
    routingMetadata,
  };

  if (req.cacheKey) {
    await setCached(svc, req.cacheKey, req.feature, response, req.cacheTtlSeconds ?? 3600);
  }

  return response;
}

// ── Convenience: create service-role client ───────────────────────────────────

export function createServiceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
