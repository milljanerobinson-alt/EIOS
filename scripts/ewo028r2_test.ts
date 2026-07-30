import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

async function mcpCall(token: string, params: Record<string, unknown>): Promise<any> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/atd-mcp-server`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params }),
  });
  const text = await resp.text();
  if (!resp.ok) return { error: text.slice(0, 500) };
  const body = JSON.parse(text);
  const contentText = body?.result?.content?.[0]?.text;
  if (!contentText) return body;
  const parsed = JSON.parse(contentText);
  return parsed.data || parsed;
}

let passCount = 0;
let failCount = 0;
const auditRefs: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  if (condition) { passCount++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); }
  else { failCount++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const CONV_ID = 'ewo028r2-conv-0001-aaaa-bbbb-cccccccccccc';

// The complete, unabridged Product Owner prompt that was failing
const FULL_PO_PROMPT = `Show Engineering Knowledge for EWO-017R.2R

Please return the complete governed inspection DTO including:

- detected_intent
- resolved_capability
- resolved_operation
- routing_decision
- routing_confidence
- resolution_method
- object_reference
- lifecycle_change_performed
- runtime diagnostics
- intent_diagnostics
- audit reference
- confirmation of read-only behaviour
- confirmation of resolved capability and operation`;

async function main() {
  const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await s.auth.signInWithPassword({
    email: 'engineering.test@eios.local', password: 'EiosBrowserTest2026!',
  });
  if (authError || !authData.session) { console.error('Auth failed:', authError?.message); process.exit(1); }
  const token = authData.session.access_token;

  // ═══ TEST 1: Short phrase ═══
  console.log('\n=== TEST 1: Short phrase ===');
  const r1 = await mcpCall(token, {
    name: 'submit_conversation_inspection',
    arguments: { natural_language_request: 'Show Engineering Knowledge for EWO-017R.2R.', conversation_id: CONV_ID, requesting_persona: 'atd' },
  });
  if (r1?.audit_reference || r1?.auditRef) auditRefs.push(r1?.audit_reference || r1?.auditRef);
  console.log(`  resolved_operation: ${r1?.resolved_operation}, object: ${r1?.resolved_object_reference}`);
  check('Routes to inspectKnowledgeExtraction', r1?.resolved_operation === 'inspectKnowledgeExtraction', `got ${r1?.resolved_operation}`);
  check('Object is EWO-017R.2R', r1?.resolved_object_reference === 'EWO-017R.2R', `got ${r1?.resolved_object_reference}`);
  check('Capability is engineering-work-orders', r1?.resolved_capability === 'engineering-work-orders');
  check('Confidence >= 0.95', (r1?.routing_confidence ?? 0) >= 0.95, `${r1?.routing_confidence}`);
  check('Has inspection_result', !!r1?.inspection_result);
  check('lifecycle_change_performed is false', r1?.lifecycle_change_performed === false);

  // ═══ TEST 2: Full multiline request containing all DTO fields ═══
  console.log('\n=== TEST 2: Full multiline PO request with all DTO fields ===');
  const r2 = await mcpCall(token, {
    name: 'submit_conversation_inspection',
    arguments: { natural_language_request: FULL_PO_PROMPT, conversation_id: CONV_ID, requesting_persona: 'atd' },
  });
  if (r2?.audit_reference || r2?.auditRef) auditRefs.push(r2?.audit_reference || r2?.auditRef);
  console.log(`  resolved_operation: ${r2?.resolved_operation}, object: ${r2?.resolved_object_reference}`);
  console.log(`  interpretation: ${r2?.interpretation?.slice(0, 120)}`);
  check('Routes to inspectKnowledgeExtraction (not inspectCapabilityMetadata)', r2?.resolved_operation === 'inspectKnowledgeExtraction', `got ${r2?.resolved_operation}`);
  check('Object is EWO-017R.2R', r2?.resolved_object_reference === 'EWO-017R.2R', `got ${r2?.resolved_object_reference}`);
  check('Capability is engineering-work-orders', r2?.resolved_capability === 'engineering-work-orders');
  check('Confidence >= 0.95', (r2?.routing_confidence ?? 0) >= 0.95, `${r2?.routing_confidence}`);
  check('Has inspection_result with knowledge records', (r2?.inspection_result?.knowledge_records?.length ?? 0) > 0, `${r2?.inspection_result?.knowledge_records?.length} records`);
  check('lifecycle_change_performed is false', r2?.lifecycle_change_performed === false);

  // ═══ TEST 3: Request asking for runtime diagnostics and intent_diagnostics ═══
  console.log('\n=== TEST 3: Request with runtime diagnostics and intent_diagnostics ===');
  const r3 = await mcpCall(token, {
    name: 'submit_conversation_inspection',
    arguments: { natural_language_request: 'Show Engineering Knowledge for EWO-017R.2R. Include runtime diagnostics and intent_diagnostics in the response.', conversation_id: CONV_ID, requesting_persona: 'atd' },
  });
  if (r3?.audit_reference || r3?.auditRef) auditRefs.push(r3?.audit_reference || r3?.auditRef);
  check('Routes to inspectKnowledgeExtraction', r3?.resolved_operation === 'inspectKnowledgeExtraction', `got ${r3?.resolved_operation}`);
  check('Object is EWO-017R.2R', r3?.resolved_object_reference === 'EWO-017R.2R');

  // ═══ TEST 4: Request asking to confirm resolved capability and operation ═══
  console.log('\n=== TEST 4: Request confirming resolved capability and operation ===');
  const r4 = await mcpCall(token, {
    name: 'submit_conversation_inspection',
    arguments: { natural_language_request: 'Show Engineering Knowledge for EWO-017R.2R. Please confirm the resolved capability and resolved operation in the response.', conversation_id: CONV_ID, requesting_persona: 'atd' },
  });
  if (r4?.audit_reference || r4?.auditRef) auditRefs.push(r4?.audit_reference || r4?.auditRef);
  check('Routes to inspectKnowledgeExtraction', r4?.resolved_operation === 'inspectKnowledgeExtraction', `got ${r4?.resolved_operation}`);
  check('Resolved capability present', r4?.resolved_capability === 'engineering-work-orders');

  // ═══ TEST 5: Request asking whether a lifecycle change was performed ═══
  console.log('\n=== TEST 5: Request asking whether lifecycle change was performed ===');
  const r5 = await mcpCall(token, {
    name: 'submit_conversation_inspection',
    arguments: { natural_language_request: 'Show Engineering Knowledge for EWO-017R.2R. Was any lifecycle change performed? Confirm read-only behaviour.', conversation_id: CONV_ID, requesting_persona: 'atd' },
  });
  if (r5?.audit_reference || r5?.auditRef) auditRefs.push(r5?.audit_reference || r5?.auditRef);
  check('Routes to inspectKnowledgeExtraction', r5?.resolved_operation === 'inspectKnowledgeExtraction', `got ${r5?.resolved_operation}`);
  check('lifecycle_change_performed is false', r5?.lifecycle_change_performed === false);

  // ═══ TEST 6: Actual capability metadata request still routes correctly ═══
  console.log('\n=== TEST 6: Genuine capability metadata request ===');
  const r6 = await mcpCall(token, {
    name: 'submit_conversation_inspection',
    arguments: { natural_language_request: 'Inspect the Engineering Work Orders capability.', conversation_id: CONV_ID, requesting_persona: 'atd' },
  });
  if (r6?.audit_reference || r6?.auditRef) auditRefs.push(r6?.audit_reference || r6?.auditRef);
  console.log(`  interpretation: ${r6?.interpretation?.slice(0, 80)}`);
  check('Routes to capability metadata inspection', r6?.interpretation?.includes('capability metadata inspection'), `got: ${r6?.interpretation?.slice(0, 80)}`);
  check('Returns resolved_capability_id', !!r6?.resolved_capability_id, `got ${r6?.resolved_capability_id}`);

  // ═══ TEST 7: Another genuine capability metadata request ═══
  console.log('\n=== TEST 7: Another genuine capability metadata request ===');
  const r7 = await mcpCall(token, {
    name: 'submit_conversation_inspection',
    arguments: { natural_language_request: 'Explain the engineering-records capability.', conversation_id: CONV_ID, requesting_persona: 'atd' },
  });
  if (r7?.audit_reference || r7?.auditRef) auditRefs.push(r7?.audit_reference || r7?.auditRef);
  check('Routes to capability metadata inspection', r7?.interpretation?.includes('capability metadata inspection'), `got: ${r7?.interpretation?.slice(0, 80)}`);
  check('Returns resolved_capability_id', !!r7?.resolved_capability_id, `got ${r7?.resolved_capability_id}`);

  // ═══ SUMMARY ═══
  console.log('\n=== EWO-028R.2 TEST SUMMARY ===');
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total: ${passCount + failCount}`);
  console.log(`Audit References: ${auditRefs.join(', ')}`);
  console.log(`Result: ${failCount === 0 ? 'ALL TESTS PASSED' : 'TESTS FAILED'}`);
  if (failCount > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
