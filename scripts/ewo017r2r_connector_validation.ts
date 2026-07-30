import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

async function mcpCall(token: string, method: string, params: Record<string, unknown> | undefined): Promise<any> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/atd-mcp-server`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const text = await resp.text();
  if (!resp.ok) { console.error(`HTTP ${resp.status}: ${text.slice(0, 300)}`); return null; }
  return JSON.parse(text);
}

function extractData(body: any): Record<string, unknown> {
  if (!body) return {};
  if (body.error) { console.error('RPC error:', body.error.message); return { error: body.error.message }; }
  const text = body.result?.content?.[0]?.text;
  if (!text) { console.error('No content text'); return {}; }
  const parsed = JSON.parse(text);
  return (parsed.data || parsed) as Record<string, unknown>;
}

function uuidv4(): string {
  return crypto.randomUUID();
}

async function main() {
  const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await s.auth.signInWithPassword({
    email: 'engineering.test@eios.local',
    password: 'EiosBrowserTest2026!',
  });
  if (authError || !authData.session) { console.error('Auth failed:', authError?.message); process.exit(1); }
  const token = authData.session.access_token;

  const { data: ewoBefore } = await s
    .from('engineering_work_orders')
    .select('ewo_ref, status, verification_status, report_generation_status')
    .eq('ewo_ref', 'EWO-017R.2R')
    .single();

  const convAId = uuidv4();
  console.log('=== CONVERSATION A — conversation_id (model-generated UUID) ===');
  console.log('conversation_id:', convAId);

  const testABody = await mcpCall(token, 'tools/call', {
    name: 'submit_conversation_inspection',
    arguments: {
      natural_language_request: 'Inspect Engineering Work Order EWO-017R.2R and make it the active Engineering Work Order for this conversation. Do not perform any lifecycle changes.',
      conversation_id: convAId,
      requesting_persona: 'engineering_lead',
      client_id: 'chatgpt-connector',
    },
  });
  const aData = extractData(testABody);
  console.log('\n=== TEST A — Bind through actual ChatGPT tool ===');
  console.log(JSON.stringify({
    detected_intent: aData.detected_intent,
    routing_decision: aData.routing_decision,
    resolved_engineering_object_reference: aData.resolved_engineering_object_reference,
    object_resolution_method: aData.object_resolution_method,
    active_object_updated: aData.active_object_updated,
    conversation_identifier: aData.conversation_identifier,
    conversation_identifier_source: aData.conversation_identifier_source,
    conversation_scope_verified: aData.conversation_scope_verified,
    lifecycle_change_performed: aData.lifecycle_change_performed,
    audit_reference: aData.audit_reference,
  }, null, 2));

  const testBBody = await mcpCall(token, 'tools/call', {
    name: 'submit_conversation_inspection',
    arguments: {
      natural_language_request: 'Expand the Engineering Analysis for the current Engineering Work Order.',
      conversation_id: convAId,
      requesting_persona: 'engineering_lead',
      client_id: 'chatgpt-connector',
    },
  });
  const bData = extractData(testBBody);
  console.log('\n=== TEST B — Natural-language continuation (same conversation) ===');
  console.log(JSON.stringify({
    detected_intent: bData.detected_intent,
    routing_decision: bData.routing_decision,
    resolved_engineering_object_reference: bData.resolved_engineering_object_reference,
    conversation_identifier: bData.conversation_identifier,
    conversation_identifier_source: bData.conversation_identifier_source,
    context_resolution_source: bData.context_first_diagnostics?.context_resolution_source,
    audit_reference: bData.audit_reference,
  }, null, 2));

  const convBId = uuidv4();
  console.log('\n=== CONVERSATION B — conversation_id (model-generated UUID) ===');
  console.log('conversation_id:', convBId);

  const testCBody = await mcpCall(token, 'tools/call', {
    name: 'submit_conversation_inspection',
    arguments: {
      natural_language_request: 'Expand the Engineering Analysis for the current Engineering Work Order.',
      conversation_id: convBId,
      requesting_persona: 'engineering_lead',
      client_id: 'chatgpt-connector',
    },
  });
  const cData = extractData(testCBody);
  console.log('\n=== TEST C — Separate conversation isolation ===');
  console.log(JSON.stringify({
    detected_intent: cData.detected_intent,
    routing_decision: cData.routing_decision,
    resolved_engineering_object_reference: cData.resolved_engineering_object_reference,
    conversation_identifier: cData.conversation_identifier,
    conversation_identifier_source: cData.conversation_identifier_source,
    conversation_scope_verified: cData.conversation_scope_verified,
    context_resolution_source: cData.context_first_diagnostics?.context_resolution_source,
    lifecycle_change_performed: cData.lifecycle_change_performed,
    audit_reference: cData.audit_reference,
  }, null, 2));

  const { data: ewoAfter } = await s
    .from('engineering_work_orders')
    .select('ewo_ref, status, verification_status, report_generation_status')
    .eq('ewo_ref', 'EWO-017R.2R')
    .single();

  console.log('\n=== TEST D — Lifecycle integrity ===');
  console.log('BEFORE:', JSON.stringify(ewoBefore));
  console.log('AFTER: ', JSON.stringify(ewoAfter));
  const lifecycleChanged =
    ewoBefore?.status !== ewoAfter?.status ||
    ewoBefore?.verification_status !== ewoAfter?.verification_status ||
    ewoBefore?.report_generation_status !== ewoAfter?.report_generation_status;
  console.log('LIFECYCLE CHANGED:', lifecycleChanged);

  const testEBody = await mcpCall(token, 'tools/call', {
    name: 'submit_conversation_inspection',
    arguments: {
      natural_language_request: 'Inspect EWO-017R.2R.',
      requesting_persona: 'engineering_lead',
      client_id: 'chatgpt-connector',
    },
  });
  const eData = extractData(testEBody);
  console.log('\n=== TEST E — Missing conversation_id governed refusal ===');
  console.log(JSON.stringify({
    detected_intent: eData.detected_intent,
    routing_decision: eData.routing_decision,
    conversation_identifier: eData.conversation_identifier,
    conversation_identifier_source: eData.conversation_identifier_source,
    failure_reason: eData.failure_reason,
    instruction: eData.instruction,
    audit_reference: eData.audit_reference,
  }, null, 2));

  console.log('\n=== CONVERSATION IDENTITY SUMMARY ===');
  console.log('Conversation A ID:', convAId);
  console.log('Conversation B ID:', convBId);
  console.log('IDs differ:', convAId !== convBId);

  const { data: auditCheck } = await s
    .from('atd_connect_inspection_log')
    .select('request_id, session_id, tool_name')
    .eq('tool_name', 'submit_conversation_inspection')
    .order('timestamp', { ascending: false })
    .limit(5);
  console.log('\n=== AUDIT LOG session_id POPULATION ===');
  console.log(JSON.stringify(auditCheck, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
