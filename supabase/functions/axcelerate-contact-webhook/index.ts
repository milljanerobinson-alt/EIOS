import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Webhook-Secret",
};

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Extract a numeric ID from several possible field name conventions.
function extractId(obj: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const raw = obj[key] ?? obj[key.toLowerCase()] ?? obj[key.toUpperCase()];
    if (raw != null) {
      const n = Number(raw);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return null;
}

// Parse body as JSON or fall back to application/x-www-form-urlencoded.
async function parseBody(req: Request): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type") || "";
  const text = await req.text().catch(() => "");
  if (!text) return {};

  if (contentType.includes("application/json")) {
    try { return JSON.parse(text); } catch { return {}; }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(text);
    const out: Record<string, unknown> = {};
    params.forEach((v, k) => { out[k] = v; });
    return out;
  }

  // Try JSON regardless of content-type header
  try { return JSON.parse(text); } catch { return {}; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── 1. Validate webhook secret ──────────────────────────────────────────────
  const url = new URL(req.url);
  const secretParam = url.searchParams.get("secret") || req.headers.get("X-Webhook-Secret") || "";

  const { data: secretRow } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "axcelerate_webhook_secret")
    .maybeSingle();

  const storedSecret = typeof secretRow?.value === "string" ? secretRow.value : "";

  if (!storedSecret) {
    return err(503, "Webhook not configured. Set a webhook secret in Settings first.");
  }

  if (!secretParam || secretParam !== storedSecret) {
    return err(401, "Invalid webhook secret.");
  }

  // ── 2. Handle GET (aXcelerate connectivity check) ───────────────────────────
  if (req.method === "GET") {
    return ok({ status: "ok", message: "LLND Automate webhook endpoint is active." });
  }

  // ── 3. Parse body ───────────────────────────────────────────────────────────
  const body = await parseBody(req);

  const contactId = extractId(body, "contactID", "contact_id", "contactId", "id", "CONTACT_ID");
  const courseId = extractId(body, "courseID", "course_id", "courseId", "COURSE_ID");

  if (!contactId) {
    // Log the unknown payload for debugging but return 200 so aXcelerate doesn't retry
    await supabase.from("audit_trail").insert({
      event_type: "axcelerate.webhook.unknown_payload",
      category: "axcelerate_integration",
      severity: "warning",
      description: "Received webhook with no recognisable contactID",
      source: "system",
      actor: "system",
      event_data: { raw_keys: Object.keys(body) },
      timestamp: new Date().toISOString(),
    }).catch(() => {});
    return ok({ status: "ignored", reason: "no contactID found in payload" });
  }

  // ── 4. Run inbound sync synchronously so the contact is created before we reply ──
  const syncPayload: Record<string, unknown> = { contact_id: contactId };
  if (courseId) syncPayload.axcelerate_course_id = courseId;

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  let syncResult: Record<string, unknown> = {};
  let syncStatus = "ok";
  try {
    const syncRes = await fetch(`${supabaseUrl}/functions/v1/axcelerate-inbound-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(syncPayload),
    });
    syncResult = await syncRes.json().catch(() => ({}));
    if (!syncRes.ok) {
      syncStatus = "sync_failed";
      await supabase.from("audit_trail").insert({
        event_type: "axcelerate.webhook.sync_error",
        category: "axcelerate_integration",
        severity: "error",
        description: `Webhook-triggered inbound sync returned HTTP ${syncRes.status} for contact ${contactId}`,
        source: "system",
        actor: "system",
        event_data: { contact_id: contactId, course_id: courseId, response: syncResult },
        timestamp: new Date().toISOString(),
      }).catch(() => {});
    }
  } catch (e: any) {
    syncStatus = "sync_error";
    await supabase.from("audit_trail").insert({
      event_type: "axcelerate.webhook.sync_error",
      category: "axcelerate_integration",
      severity: "error",
      description: `Webhook-triggered inbound sync threw for contact ${contactId}: ${e.message}`,
      source: "system",
      actor: "system",
      event_data: { contact_id: contactId, course_id: courseId, error: e.message },
      timestamp: new Date().toISOString(),
    }).catch(() => {});
  }

  return ok({
    status: syncStatus,
    contact_id: contactId,
    course_id: courseId ?? null,
    message: `Inbound sync triggered for contact ${contactId}.`,
  });
});
