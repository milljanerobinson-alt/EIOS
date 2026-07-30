import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function verifyAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "");
  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data: { user }, error } = await anonClient.auth.getUser(token);
  if (error || !user) return null;

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") return null;
  return serviceClient;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const serviceClient = await verifyAdmin(req);
    if (!serviceClient) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { api_key, model, base_url } = await req.json();

    if (!api_key) {
      return new Response(
        JSON.stringify({ error: "No API key provided." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const upserts = [
      { key: "llm_api_key", value: api_key, updated_at: new Date().toISOString() },
    ];
    if (model) upserts.push({ key: "llm_model", value: model, updated_at: new Date().toISOString() });
    if (base_url) upserts.push({ key: "llm_base_url", value: base_url, updated_at: new Date().toISOString() });

    for (const row of upserts) {
      const { error } = await serviceClient.from("settings").upsert(row);
      if (error) throw new Error(`Failed to save ${row.key}: ${error.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: "LLM configuration saved." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
