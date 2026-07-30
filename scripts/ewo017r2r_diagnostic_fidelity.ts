import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

async function mcpCall(token: string, method: string, params: Record<string, unknown> | undefined): Promise<any> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/atd-mcp-server`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const text = await resp.text();
  if (!resp.ok) { console.error(`HTTP ${resp.status}: ${text.slice(0, 300)}`); return null; }
  return JSON.parse(text);
}

function extractData(body: any): Record<string, unknown> {
  if (!body) return {};
  if (body.error) { return { error: body.error.message }; }
  const text = body.result?.content?.[0]?.text;
  if (!text) return {};
  const parsed = JSON.parse(text);
  return (parsed.data || parsed) as Record<string, unknown>;
}

function uuidv4(): string { return crypto.randomUUID(); }

let invariantViolations = 0;

function checkInvariant(testName: string, data: Record<string, unknown>): void {
  const topLevel = data.conversation_scope_verified;
  const nested = (data.context_first_diagnostics as Record<string, unknown>)?.conversation_scope_verified;
  const agree = topLevel === nested;
  if (!agree) invariantViolations++;
  console.log(`  [INVARIANT] top-level=${topLevel} nested=${nested} agree=${agree}`);
}

async function main() {
  const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await s.auth.signInWithPassword({
    email: 'engineering.test@eios.local', password: 'EiosBrowserTest2026!',
  });
  if (authError || !authData.session) { console.error('Auth failed:', authError?.message); process.exit(1); }
  const token = authData.session.access_token;

  const { data: ewoBefore } = await s
    .from('engineering_work_orders')
    .select('ewo_ref, status, verification_status, report_generation_status')
    .eq('ewo_ref', 'EWO-017R.2R')
    .single();

  const convA = uuidv4();

  // ═══ TEST 1 — Successful active-object binding ═══
  const t1 = extractData(await mcpCall(token, 'tools/call', {
    name: 'submit_conversation_inspection',
    arguments: {
      natural_language_request: 'Inspect Engineering Work Order EWO-017R.2R and make it the active Engineering Work Order for this conversation. Do not perform any lifecycle changes.',
      conversation_id: convA, requesting_persona: 'engineering_lead', client_id: 'chatgpt-connector',
    },
  }));
  console.log('\n=== TEST 1 — Successful active-object binding ===');
  console.log(JSON.stringify({
    resolved_engineering_object_reference: t1.resolved_engineering_object_reference,
    active_object_updated: t1.active_object_updated,
    conversation_identifier: t1.conversation_identifier,
    conversation_identifier_source: t1.conversation_identifier_source,
    conversation_scope_verified: t1.conversation_scope_verified,
    lifecycle_change_performed: t1.lifecycle_change_performed,
    nested_csv: (t1.context_first_diagnostics as any)?.conversation_scope_verified,
    routing_decision: t1.routing_decision,
    audit_reference: t1.audit_reference,
  }, null, 2));
  checkInvariant('Test 1', t1);

  // ═══ TEST 2 — Same-conversation continuation ═══
  const t2 = extractData(await mcpCall(token, 'tools/call', {
    name: 'submit_conversation_inspection',
    arguments: {
      natural_language_request: 'Expand the Engineering Analysis for the current Engineering Work Order.',
      conversation_id: convA, requesting_persona: 'engineering_lead', client_id: 'chatgpt-connector',
    },
  }));
  console.log('\n=== TEST 2 — Same-conversation continuation ===');
  console.log(JSON.stringify({
    resolved_engineering_object_reference: t2.resolved_engineering_object_reference,
    conversation_identifier: t2.conversation_identifier,
    conversation_scope_verified: t2.conversation_scope_verified,
    nested_csv: (t2.context_first_diagnostics as any)?.conversation_scope_verified,
    context_resolution_source: (t2.context_first_diagnostics as any)?.context_resolution_source,
    routing_decision: t2.routing_decision,
    audit_reference: t2.audit_reference,
  }, null, 2));
  checkInvariant('Test 2', t2);

  // ═══ TEST 3 — Valid isolated conversation with no active object ═══
  const convB = uuidv4();
  const t3 = extractData(await mcpCall(token, 'tools/call', {
    name: 'submit_conversation_inspection',
    arguments: {
      natural_language_request: 'Expand the Engineering Analysis for the current Engineering Work Order.',
      conversation_id: convB, requesting_persona: 'engineering_lead', client_id: 'chatgpt-connector',
    },
  }));
  console.log('\n=== TEST 3 — Valid isolated conversation with no active object ===');
  console.log(JSON.stringify({
    resolved_engineering_object_reference: t3.resolved_engineering_object_reference,
    conversation_identifier: t3.conversation_identifier,
    conversation_scope_verified: t3.conversation_scope_verified,
    nested_csv: (t3.context_first_diagnostics as any)?.conversation_scope_verified,
    routing_decision: t3.routing_decision,
    audit_reference: t3.audit_reference,
  }, null, 2));
  checkInvariant('Test 3', t3);

  // ═══ TEST 4 — Missing conversation identity ═══
  const t4body = await mcpCall(token, 'tools/call', {
    name: 'submit_conversation_inspection',
    arguments: {
      natural_language_request: 'Inspect EWO-017R.2R.',
      requesting_persona: 'engineering_lead', client_id: 'chatgpt-connector',
    },
  });
  const t4 = extractData(t4body);
  console.log('\n=== TEST 4 — Missing conversation identity ===');
  console.log(JSON.stringify({
    conversation_scope_verified: t4.conversation_scope_verified,
    nested_csv: (t4.context_first_diagnostics as any)?.conversation_scope_verified,
    failure_reason: t4.failure_reason,
    routing_decision: t4.routing_decision,
    active_object_updated: t4.active_object_updated,
    error: t4.error,
  }, null, 2));
  // Test 4 may return an RPC error (missing required param) or a governed refusal
  // Both are acceptable — the key is that no binding occurs
  if (t4.error) {
    console.log('  [INVARIANT] RPC validation rejected missing conversation_id — no binding occurs');
  } else {
    checkInvariant('Test 4', t4);
  }

  // ═══ TEST 5 — Lifecycle integrity ═══
  const { data: ewoAfter } = await s
    .from('engineering_work_orders')
    .select('ewo_ref, status, verification_status, report_generation_status')
    .eq('ewo_ref', 'EWO-017R.2R')
    .single();
  console.log('\n=== TEST 5 — Lifecycle integrity ===');
  console.log('BEFORE:', JSON.stringify(ewoBefore));
  console.log('AFTER: ', JSON.stringify(ewoAfter));
  const lifecycleChanged =
    ewoBefore?.status !== ewoAfter?.status ||
    ewoBefore?.verification_status !== ewoAfter?.verification_status ||
    ewoBefore?.report_generation_status !== ewoAfter?.report_generation_status;
  console.log('LIFECYCLE CHANGED:', lifecycleChanged);

  // ═══ Summary ═══
  console.log('\n=== DIAGNOSTIC FIDELITY SUMMARY ===');
  console.log('Invariant violations:', invariantViolations);
  console.log('All top-level and nested conversation_scope_verified values agree:', invariantViolations === 0);
}

main().catch(e => { console.error(e); process.exit(1); });
