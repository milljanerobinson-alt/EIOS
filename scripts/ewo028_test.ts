import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

async function callEdgeFunction(slug: string, body: unknown): Promise<any> {
  const url = `${SUPABASE_URL}/functions/v1/${slug}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`${slug} failed (${resp.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function mcpCall(token: string, method: string, params: Record<string, unknown>): Promise<any> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/atd-mcp-server`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const text = await resp.text();
  if (!resp.ok) return { error: text.slice(0, 300) };
  const body = JSON.parse(text);
  const contentText = body?.result?.content?.[0]?.text;
  if (!contentText) return body;
  const parsed = JSON.parse(contentText);
  return parsed.data || parsed;
}

let passCount = 0;
let failCount = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passCount++;
    console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failCount++;
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function main() {
  const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await s.auth.signInWithPassword({
    email: 'engineering.test@eios.local', password: 'EiosBrowserTest2026!',
  });
  if (authError || !authData.session) { console.error('Auth failed:', authError?.message); process.exit(1); }
  const token = authData.session.access_token;

  // ═══ TEST 1: Knowledge extraction after PO acceptance (EWO-017R.2R) ═══
  console.log('\n=== TEST 1: Knowledge extraction after acceptance ===');
  const extraction = await callEdgeFunction('engineering-knowledge-extraction', { ewo_ref: 'EWO-017R.2R' });
  console.log(JSON.stringify({
    extraction_status: extraction.extraction_status,
    knowledge_records_created: extraction.knowledge_records_created,
    knowledge_records_merged: extraction.knowledge_records_merged,
    knowledge_records_skipped: extraction.knowledge_records_skipped,
    completion_report_linked: extraction.completion_report_linked,
    provenance_recorded: extraction.provenance_recorded,
  }, null, 2));
  check('Knowledge extraction completed', extraction.extraction_status === 'completed');
  check('Knowledge records created > 0', extraction.knowledge_records_created > 0, `${extraction.knowledge_records_created} created`);
  check('Completion report linked', extraction.completion_report_linked === true);
  check('Provenance recorded', extraction.provenance_recorded === true);
  check('Extraction is governed', extraction.governed === true);

  // ═══ TEST 2: Idempotency — second extraction returns same result ═══
  console.log('\n=== TEST 2: Idempotency ===');
  const extraction2 = await callEdgeFunction('engineering-knowledge-extraction', { ewo_ref: 'EWO-017R.2R' });
  check('Second extraction is idempotent', extraction2.idempotent === true);
  check('Same records created count', extraction2.knowledge_records_created === extraction.knowledge_records_created);
  check('Same records merged count', extraction2.knowledge_records_merged === extraction.knowledge_records_merged);

  // ═══ TEST 3: Provenance maintained ═══
  console.log('\n=== TEST 3: Provenance ===');
  const { data: provenance } = await s
    .from('engineering_knowledge_provenance')
    .select('*')
    .eq('ewo_ref', 'EWO-017R.2R');
  check('Provenance records exist', (provenance?.length || 0) > 0, `${provenance?.length || 0} provenance records`);
  if (provenance && provenance.length > 0) {
    const p = provenance[0];
    check('Provenance has ewo_ref', !!p.ewo_ref);
    check('Provenance has ewo_id', !!p.ewo_id);
    check('Provenance has extraction_id', !!p.extraction_id);
    check('Provenance has extraction_timestamp', !!p.extraction_timestamp);
    check('Provenance has knowledge_record_id', !!p.knowledge_record_id);
  }

  // ═══ TEST 4: Deduplication ═══
  console.log('\n=== TEST 4: Deduplication ===');
  const { data: allMemory } = await s
    .from('engineering_memory')
    .select('id, title, knowledge_category, content')
    .in('knowledge_category', ['architecture', 'pattern', 'lesson_learned', 'anti_pattern', 'implementation_strategy', 'validation_outcome', 'engineering_decision']);
  // Check for duplicates by title + category
  const seen = new Set<string>();
  let duplicates = 0;
  for (const m of allMemory || []) {
    const key = `${m.title}|${m.knowledge_category}`;
    if (seen.has(key)) duplicates++;
    seen.add(key);
  }
  check('No duplicate knowledge records by title+category', duplicates === 0, `${duplicates} duplicates found`);

  // ═══ TEST 5: EWO knowledge_extraction_status updated ═══
  console.log('\n=== TEST 5: EWO knowledge_extraction_status ===');
  const { data: ewoAfter } = await s
    .from('engineering_work_orders')
    .select('knowledge_extraction_status')
    .eq('ewo_ref', 'EWO-017R.2R')
    .maybeSingle();
  check('EWO knowledge_extraction_status is "extracted"', ewoAfter?.knowledge_extraction_status === 'extracted');

  // ═══ TEST 6: Inspection — inspect_knowledge_extraction tool ═══
  console.log('\n=== TEST 6: Inspection capability ===');
  const inspection = await mcpCall(token, 'tools/call', {
    name: 'inspect_knowledge_extraction',
    arguments: { ewo_ref: 'EWO-017R.2R' },
  });
  console.log(JSON.stringify({
    governed: inspection.governed,
    ewo_ref: inspection.ewo_ref,
    knowledge_extraction_status: inspection.knowledge_extraction_status,
    has_extraction_record: !!inspection.extraction_record,
    has_extracted_records: (inspection.extracted_knowledge_records?.length || 0) > 0,
    has_provenance: !!inspection.provenance,
    has_reconciliation_history: (inspection.lifecycle_reconciliation_history?.length || 0) > 0,
    linkage_integrity: inspection.linkage_integrity,
  }, null, 2));
  check('Inspection returns governed', inspection.governed === true);
  check('Inspection returns ewo_ref', inspection.ewo_ref === 'EWO-017R.2R');
  check('Inspection returns extraction status', !!inspection.knowledge_extraction_status);
  check('Inspection returns extraction record', !!inspection.extraction_record);
  check('Inspection returns extracted knowledge records', (inspection.extracted_knowledge_records?.length || 0) > 0);
  check('Inspection returns provenance', !!inspection.provenance);
  check('Inspection returns linkage integrity', !!inspection.linkage_integrity);
  check('Inspection returns completion report link', !!inspection.linked_completion_report);
  check('Inspection returns extraction diagnostics', !!inspection.extraction_diagnostics);

  // ═══ TEST 7: Lifecycle reconciliation — testing EWOs remain active ═══
  console.log('\n=== TEST 7: Lifecycle reconciliation ===');
  const recon = await callEdgeFunction('lifecycle-reconciliation', {});
  console.log(JSON.stringify({
    candidates_identified: recon.candidates_identified,
    ewos_closed: recon.ewos_closed,
    testing_ewos_untouched: recon.testing_ewos_untouched,
    message: recon.message,
  }, null, 2));
  check('Reconciliation is governed', recon.governed === true);
  check('Testing EWOs untouched', recon.testing_ewos_untouched >= 0);
  check('No testing EWOs were closed', recon.testing_ewos.every((e: { untouched: boolean }) => e.untouched === true));

  // ═══ TEST 8: EWO-028 registered ═══
  console.log('\n=== TEST 8: EWO-028 registration ===');
  const { data: ewo028 } = await s
    .from('engineering_work_orders')
    .select('ewo_ref, title, status')
    .eq('ewo_ref', 'EWO-028')
    .maybeSingle();
  check('EWO-028 registered', !!ewo028);
  check('EWO-028 title correct', ewo028?.title?.includes('Engineering Knowledge Extraction') === true);
  check('EWO-028 status is in_progress', ewo028?.status === 'in_progress');

  // ═══ TEST 9: Post-acceptance pipeline (using EWO-017R.2R which is already closed) ═══
  console.log('\n=== TEST 9: Post-acceptance pipeline ===');
  // EWO-017R.2R is already closed — test the pipeline with a simulated acceptance
  // We'll test that the pipeline correctly handles an already-closed EWO
  const pipelineResult = await callEdgeFunction('post-acceptance-pipeline', {
    ewo_ref: 'EWO-017R.2R',
    po_accepted_by: 'Millie Robinson',
    po_acceptance_statement: 'Test pipeline: ACCEPTED by Millie Robinson on 2026-07-25',
    acceptance_audit_reference: 'ATD-MCP-TEST-PIPELINE',
    accepted_implementation_version: '1.0',
  });
  console.log(JSON.stringify({
    pipeline_status: pipelineResult.pipeline_status,
    pipeline_steps: pipelineResult.pipeline_steps?.map((s: { step: string; status: string }) => `${s.step}:${s.status}`),
    ewo_closed: pipelineResult.ewo_closed,
    closure_method: pipelineResult.closure_method,
  }, null, 2));
  check('Pipeline completed', pipelineResult.pipeline_status === 'completed');
  check('Pipeline has steps', (pipelineResult.pipeline_steps?.length || 0) > 0);
  check('Pipeline recorded PO acceptance', pipelineResult.po_acceptance_recorded === true);
  check('Pipeline closed EWO', pipelineResult.ewo_closed === true);
  check('Pipeline closure method is Product Owner Acceptance', pipelineResult.closure_method === 'Product Owner Acceptance');

  // ═══ TEST 10: Relationship inspection includes knowledge ═══
  console.log('\n=== TEST 10: Relationship inspection with knowledge ===');
  const relInspection = await mcpCall(token, 'tools/call', {
    name: 'inspect_relationships',
    arguments: { object_reference: 'EWO-017R.2R' },
  });
  console.log(JSON.stringify({
    has_knowledge_relationships: (relInspection.knowledge_relationships?.length || 0) > 0,
    knowledge_relationship_count: relInspection.knowledge_relationship_count,
    total_relationships: relInspection.total_relationships,
  }, null, 2));
  check('Relationship inspection includes knowledge relationships', (relInspection.knowledge_relationships?.length || 0) > 0);
  check('Relationship inspection has total count', relInspection.total_relationships > 0);

  // ═══ SUMMARY ═══
  console.log('\n=== EWO-028 TEST SUMMARY ===');
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total: ${passCount + failCount}`);
  console.log(`Result: ${failCount === 0 ? 'ALL TESTS PASSED' : 'TESTS FAILED'}`);
  if (failCount > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
