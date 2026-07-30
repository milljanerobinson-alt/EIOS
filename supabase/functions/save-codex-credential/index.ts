import { createClient } from "jsr:@supabase/supabase-js@2";

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

/**
 * EWO-032R.9: DEPRECATED — Independent Codex credential storage is removed.
 *
 * The Codex Execution Provider now reuses the existing OpenAI credential
 * managed by AI Infrastructure (settings.openai_api_key + ai_provider_configs).
 *
 * This edge function is retained for backward compatibility but always returns
 * a deprecation notice. It no longer accepts or stores API keys.
 *
 * To configure the Codex credential, configure the OpenAI provider in
 * AI Infrastructure instead.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  return ok({
    success: false,
    deprecated: true,
    error: "Independent Codex credential storage is deprecated. Configure the OpenAI provider in AI Infrastructure instead.",
    credential_reference: "shared-provider://openai/default",
    message: "The Codex provider now reuses the existing OpenAI credential. No separate key is required.",
  });
});
