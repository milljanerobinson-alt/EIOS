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

function check(name: string, condition: boolean, detail?: string) {
  if (condition) { passCount++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); }
  else { failCount++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const CONV_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

async function main() {
  const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await s.auth.signInWithPassword({
    email: 'engineering.test@eios.local', password: 'EiosBrowserTest2026!',
  });
  if (authError || !authData.session) { console.error('Auth failed:', authError?.message); process.exit(1); }
  const token = authData.session.access_token;

  // ═══ ACCEPTANCE TEST 1: Inspect EWO with knowledge info ═══
  console.log('\n=== ACCEPTANCE TEST 1: Inspect EWO-017R.2R with Engineering Knowledge ===');
  const ewoInsp = await mcpCall(token, {
    name: 'inspect_engineering_object',
    arguments: { capability: 'engineering-work-orders', operation: 'inspectEngineeringWorkOrder', object_reference: 'EWO-017R.2R' },
  });
  const ke = ewoInsp?.knowledge_extraction;
  console.log(JSON.stringify({
    has_knowledge_extraction: !!ke,
    extraction_status: ke?.extraction_status,
    provenance_records: ke?.provenance_records,
    extraction_id: ke?.extraction_id,
  }, null, 2));
  check('EWO inspection includes knowledge_extraction', !!ke);
  check('Knowledge extraction status present', !!ke?.extraction_status);
  check('Provenance records > 0', (ke?.provenance_records ?? 0) > 0, `${ke?.provenance_records} records`);
  check('Extraction ID present', !!ke?.extraction_id);

  // ═══ ACCEPTANCE TEST 2: Show Engineering Knowledge ═══
  console.log('\n=== ACCEPTANCE TEST 2: Show Engineering Knowledge for EWO-017R.2R ===');
  const keInsp = await mcpCall(token, {
    name: 'inspect_knowledge_extraction',
    arguments: { ewo_ref: 'EWO-017R.2R' },
  });
  console.log(JSON.stringify({
    governed: keInsp?.governed,
    ewo_ref: keInsp?.ewo_ref,
    knowledge_extraction_status: keInsp?.knowledge_extraction_status,
    knowledge_record_count: keInsp?.extracted_knowledge_records?.length,
    has_provenance: !!keInsp?.provenance,
    linkage_integrity: keInsp?.linkage_integrity,
    has_reconciliation_history: (keInsp?.lifecycle_reconciliation_history?.length || 0) > 0,
    has_extraction_diagnostics: !!keInsp?.extraction_diagnostics,
  }, null, 2));
  check('Knowledge extraction inspection is governed', keInsp?.governed === true);
  check('Returns ewo_ref', keInsp?.ewo_ref === 'EWO-017R.2R');
  check('Returns extraction status', keInsp?.knowledge_extraction_status === 'extracted');
  check('Returns extraction record', !!keInsp?.extraction_record);
  check('Returns knowledge records', (keInsp?.extracted_knowledge_records?.length || 0) > 0, `${keInsp?.extracted_knowledge_records?.length} records`);
  check('Returns provenance', !!keInsp?.provenance);
  check('Returns linkage integrity', !!keInsp?.linkage_integrity);
  check('Returns completion report', !!keInsp?.linked_completion_report);
  check('Returns extraction diagnostics', !!keInsp?.extraction_diagnostics);

  // ═══ ACCEPTANCE TEST 3: Conversation Bridge Routing ═══
  console.log('\n=== ACCEPTANCE TEST 3: Conversation Bridge Routing ===');
  const phrases = [
    'Show Engineering Knowledge for EWO-017R.2R',
    'Inspect the extracted knowledge for EWO-017R.2R',
    'Show Knowledge Extraction for EWO-017R.2R',
    'Include Engineering Knowledge for EWO-017R.2R',
    'What is the knowledge extraction for EWO-017R.2R',
  ];
  for (const phrase of phrases) {
    const routing = await mcpCall(token, {
      name: 'submit_conversation_inspection',
      arguments: { natural_language_request: phrase, conversation_id: CONV_ID, requesting_persona: 'atd' },
    });
    const resolvedOp = routing?.resolved_operation || routing?.operation;
    const resolvedCap = routing?.resolved_capability || routing?.capability;
    const confidence = routing?.routing_confidence || routing?.confidence;
    const hasInspectionResult = !!routing?.inspection_result;
    console.log(`  "${phrase}" → ${resolvedCap}/${resolvedOp} (confidence: ${confidence}, has_result: ${hasInspectionResult})`);
    check(`Routes "${phrase}" to inspectKnowledgeExtraction`, resolvedOp === 'inspectKnowledgeExtraction', `got ${resolvedOp}`);
  }

  // ═══ ACCEPTANCE TEST 4: Capability lists inspectKnowledgeExtraction ═══
  console.log('\n=== ACCEPTANCE TEST 4: Capability Registry Lists inspectKnowledgeExtraction ===');
  const capInsp = await mcpCall(token, {
    name: 'inspect_capability_metadata',
    arguments: { capability_request: 'engineering-work-orders' },
  });
  const capMeta = capInsp?.capability_metadata;
  const ops = capMeta?.operations_exposed || capMeta?.supported_operations || [];
  console.log(JSON.stringify({
    resolved_capability_id: capInsp?.resolved_capability_id,
    operations_exposed: ops,
  }, null, 2));
  check('Capability lists inspectKnowledgeExtraction', ops.includes('inspectKnowledgeExtraction'), `ops: ${JSON.stringify(ops)}`);

  // ═══ ACCEPTANCE TEST 5: Relationship inspection includes knowledge ═══
  console.log('\n=== ACCEPTANCE TEST 5: Relationship Inspection with Knowledge ===');
  const relInsp = await mcpCall(token, {
    name: 'inspect_relationships',
    arguments: { object_reference: 'EWO-017R.2R' },
  });
  console.log(JSON.stringify({
    has_knowledge_relationships: (relInsp?.knowledge_relationships?.length || 0) > 0,
    knowledge_relationship_count: relInsp?.knowledge_relationship_count,
    total_relationships: relInsp?.total_relationships,
  }, null, 2));
  check('Relationship inspection includes knowledge relationships', (relInsp?.knowledge_relationships?.length || 0) > 0);
  check('Relationship inspection has total count', (relInsp?.total_relationships ?? 0) > 0);

  // ═══ SUMMARY ═══
  console.log('\n=== EWO-028R.1 TEST SUMMARY ===');
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total: ${passCount + failCount}`);
  console.log(`Result: ${failCount === 0 ? 'ALL TESTS PASSED' : 'TESTS FAILED'}`);
  if (failCount > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
