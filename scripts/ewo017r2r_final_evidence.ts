import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

async function callMcp(token: string, request: string, conversationId: string) {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/atd-mcp-server`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'submit_conversation_inspection',
        arguments: { natural_language_request: request, conversation_id: conversationId },
      },
    }),
  });
  const data = await resp.json();
  const content = JSON.parse(data.result.content[0].text);
  return content.data || content;
}

async function main() {
  const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await s.auth.signInWithPassword({
    email: 'engineering.test@eios.local',
    password: 'EiosBrowserTest2026!',
  });
  if (error || !data.session) {
    console.error('Auth failed:', error?.message);
    process.exit(1);
  }
  const token = data.session.access_token;

  // Check EWO lifecycle BEFORE
  const { data: ewoBefore } = await s
    .from('engineering_work_orders')
    .select('ewo_ref, status, verification_status, report_generation_status')
    .eq('ewo_ref', 'EWO-017R.2R')
    .single();

  // === TEST A: Bind EWO-017R.2R to Conversation A ===
  const convAId = 'chatgpt-conv-a-final-' + Date.now();
  const testA = await callMcp(
    token,
    'Inspect Engineering Work Order EWO-017R.2R and make it the active Engineering Work Order for this conversation. Do not perform any lifecycle changes.',
    convAId
  );
  console.log('=== TEST A — Bind within Conversation A ===');
  console.log(JSON.stringify({
    resolved_engineering_object_reference: testA.resolved_engineering_object_reference,
    conversation_identifier: testA.conversation_identifier,
    conversation_identifier_source: testA.conversation_identifier_source,
    conversation_scope_verified: testA.conversation_scope_verified,
    active_object_updated: testA.active_object_updated,
    lifecycle_change_performed: testA.lifecycle_change_performed,
    audit_reference: testA.audit_reference,
  }, null, 2));

  // === TEST B: Continue in Conversation A ===
  const testB = await callMcp(
    token,
    'Expand the Engineering Analysis for the current Engineering Work Order.',
    convAId
  );
  console.log('\n=== TEST B — Continue within Conversation A ===');
  console.log(JSON.stringify({
    resolved_engineering_object_reference: testB.resolved_engineering_object_reference,
    conversation_identifier: testB.conversation_identifier,
    conversation_identifier_source: testB.conversation_identifier_source,
    context_resolution_source: testB.context_first_diagnostics?.context_resolution_source,
    audit_reference: testB.audit_reference,
  }, null, 2));

  // === RETEST TEST C: Conversation B isolation (unresolved path) ===
  const convBId = 'chatgpt-conv-b-final-' + Date.now();
  const testC = await callMcp(
    token,
    'Expand the Engineering Analysis for the current Engineering Work Order.',
    convBId
  );
  console.log('\n=== RETEST TEST C — Separate Conversation B isolation ===');
  console.log(JSON.stringify({
    detected_intent: testC.detected_intent,
    routing_decision: testC.routing_decision,
    resolved_engineering_object_reference: testC.resolved_engineering_object_reference,
    conversation_identifier: testC.conversation_identifier,
    conversation_identifier_source: testC.conversation_identifier_source,
    conversation_scope_verified: testC.conversation_scope_verified,
    active_object_updated: testC.active_object_updated,
    context_resolution_source: testC.context_first_diagnostics?.context_resolution_source,
    lifecycle_mutation_attempted: testC.context_first_diagnostics?.lifecycle_mutation_attempted,
    lifecycle_mutation_performed: testC.context_first_diagnostics?.lifecycle_mutation_performed,
    lifecycle_change_performed: testC.lifecycle_change_performed,
    audit_reference: testC.audit_reference,
  }, null, 2));

  // === CONVERSATION A RECONFIRMATION ===
  const reconfA = await callMcp(
    token,
    'Expand the Engineering Analysis for the current Engineering Work Order.',
    convAId
  );
  console.log('\n=== CONVERSATION A RECONFIRMATION ===');
  console.log(JSON.stringify({
    resolved_engineering_object_reference: reconfA.resolved_engineering_object_reference,
    conversation_identifier: reconfA.conversation_identifier,
    conversation_identifier_source: reconfA.conversation_identifier_source,
    context_resolution_source: reconfA.context_first_diagnostics?.context_resolution_source,
    active_object_updated: reconfA.active_object_updated,
    audit_reference: reconfA.audit_reference,
  }, null, 2));

  // Check EWO lifecycle AFTER
  const { data: ewoAfter } = await s
    .from('engineering_work_orders')
    .select('ewo_ref, status, verification_status, report_generation_status')
    .eq('ewo_ref', 'EWO-017R.2R')
    .single();

  console.log('\n=== EWO-017R.2R LIFECYCLE INTEGRITY ===');
  console.log('BEFORE:', JSON.stringify(ewoBefore));
  console.log('AFTER: ', JSON.stringify(ewoAfter));
  const lifecycleChanged =
    ewoBefore?.status !== ewoAfter?.status ||
    ewoBefore?.verification_status !== ewoAfter?.verification_status ||
    ewoBefore?.report_generation_status !== ewoAfter?.report_generation_status;
  console.log('LIFECYCLE CHANGED:', lifecycleChanged);
}

main().catch(e => { console.error(e); process.exit(1); });
