import { createClient } from "jsr:@supabase/supabase-js@2";
import { generate } from "../_shared/ai-service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ok(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EXTRACTION_PROMPT = `You are an expert in the Australian Core Skills Framework (ACSF) and VET unit analysis.

Analyse the Foundation Skills section of the VET unit descriptor below and return a structured JSON object.

Unit Code: {CODE}
Unit Title: {TITLE}

Foundation Skills Text:
---
{TEXT}
---

Extract and return ONLY valid JSON with these fields (no markdown, no explanation):
{
  "task_tags": ["array of 3-8 specific task types performed in this unit, e.g. 'interpret technical drawings', 'complete incident reports'"],
  "complexity_indicators": ["array of 3-6 phrases describing cognitive or linguistic complexity, e.g. 'multi-step calculations', 'specialist terminology'"],
  "reading_level": <integer 1-5>,
  "writing_level": <integer 1-5>,
  "oral_comm_level": <integer 1-5>,
  "numeracy_level": <integer 1-5>,
  "learning_level": <integer 1-5>,
  "evidence_basis": "<one sentence summarising why these levels were assigned>"
}

ACSF Level guide:
1 = very basic, single-step, familiar context
2 = simple, predictable context, some support needed
3 = routine workplace tasks, some complexity
4 = complex tasks, specialised knowledge, some independent judgment
5 = highly complex, abstract, expert-level judgment

Assign levels that genuinely reflect what the Foundation Skills text demands. Do not default to 3 for everything.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return err("Unauthorized", 401);

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) return err("Unauthorized", 401);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || !["admin", "trainer"].includes(profile.role)) {
      return err("Unauthorized", 401);
    }

    const { unit_code, unit_title, foundation_skills_text } = await req.json();
    if (!unit_code) return err("unit_code is required");
    if (!foundation_skills_text || foundation_skills_text.trim().length < 20) {
      return err("foundation_skills_text must be at least 20 characters");
    }

    const prompt = EXTRACTION_PROMPT
      .replace("{CODE}", unit_code.toUpperCase())
      .replace("{TITLE}", unit_title ?? unit_code)
      .replace("{TEXT}", foundation_skills_text.trim());

    // Stable cache key based on unit code + text fingerprint
    const encoder = new TextEncoder();
    const hashBuf = await crypto.subtle.digest("SHA-256", encoder.encode(`fetch-tga-unit:${unit_code}:${foundation_skills_text.trim()}`));
    const cacheKey = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");

    let content: string;
    try {
      const aiResponse = await generate(serviceClient, {
        feature: "fetch-tga-unit",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        maxTokens: 600,
        cacheKey,
        cacheTtlSeconds: 86400 * 7, // cache unit analyses for 7 days
        userId: user.id,
      });
      content = aiResponse.content;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("NO_API_KEY")) {
        return err("AI provider not configured. Go to Settings → AI Provider.", 422);
      }
      return err(`AI error: ${msg}`, 502);
    }

    // Strip any markdown fences before parsing
    const jsonStr = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(jsonStr);
    } catch {
      return err(`AI returned non-JSON response: ${content.slice(0, 200)}`, 502);
    }

    const tpMatch = unit_code.match(/^([A-Z]+)/i);
    const training_package = tpMatch ? tpMatch[1].toUpperCase() : "";

    function clamp(v: unknown): number {
      const n = typeof v === "number" ? v : parseInt(String(v));
      return isNaN(n) ? 0 : Math.max(0, Math.min(5, n));
    }

    return ok({
      uoc_code: unit_code.toUpperCase(),
      uoc_title: unit_title ?? unit_code,
      training_package,
      task_tags: Array.isArray(extracted.task_tags) ? extracted.task_tags : [],
      complexity_indicators: Array.isArray(extracted.complexity_indicators) ? extracted.complexity_indicators : [],
      reading_level: clamp(extracted.reading_level),
      writing_level: clamp(extracted.writing_level),
      oral_comm_level: clamp(extracted.oral_comm_level),
      numeracy_level: clamp(extracted.numeracy_level),
      learning_level: clamp(extracted.learning_level),
      evidence_basis: typeof extracted.evidence_basis === "string" ? extracted.evidence_basis : "",
      source_type: "inferred",
      confidence: "medium",
    });
  } catch (e) {
    return err(`Internal error: ${e instanceof Error ? e.message : String(e)}`, 500);
  }
});
