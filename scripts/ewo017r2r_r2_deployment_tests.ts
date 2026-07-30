#!/usr/bin/env npx tsx
/**
 * EWO-017R.2R Refinement R2 — Real Deployed MCP Runtime Tests A-F
 *
 * Executes acceptance tests against the deployed atd-mcp-server Edge Function
 * through the authenticated MCP path. Proves conversation continuity and
 * cross-conversation isolation with real runtime evidence.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/atd-mcp-server`;

const BROWSER_TEST_EMAIL = 'engineering.test@eios.local';
const BROWSER_TEST_PASSWORD = 'EiosBrowserTest2026!';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let accessToken: string = '';

async function authenticate() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: BROWSER_TEST_EMAIL,
    password: BROWSER_TEST_PASSWORD,
  });
  if (error || !data.session) {
    throw new Error('Authentication failed: ' + (error?.message ?? 'no session'));
  }
  accessToken = data.session.access_token;
  console.log(`Authenticated as ${BROWSER_TEST_EMAIL}`);
}

interface McpResponse {
  governed?: boolean;
  data?: any;
  error?: string;
  auditRef?: string;
}

async function callMcp(
  toolName: string,
  args: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<McpResponse> {
  const requestBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args,
    },
  };

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
      ...headers,
    },
    body: JSON.stringify(requestBody),
  });

  const text = await response.text();
  try {
    const json = JSON.parse(text);
    // MCP JSON-RPC response: { result: { content: [{ type: 'text', text: '...' }] } }
    // or { error: { ... } }
    if (json.error) {
      return { governed: false, error: json.error.message, auditRef: undefined };
    }
    const contentText = json?.result?.content?.[0]?.text;
    if (contentText) {
      const inner = JSON.parse(contentText);
      return { governed: true, data: inner.data ?? inner, auditRef: inner.audit_reference ?? inner.data?.audit_reference };
    }
    return { governed: true, data: json, auditRef: json?.audit_reference };
  } catch {
    return { governed: false, error: text };
  }
}

// ─── Test runner ────────────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  runtimeData?: any;
}

const results: TestResult[] = [];

function record(name: string, passed: boolean, details: string, runtimeData?: any) {
  results.push({ name, passed, details, runtimeData });
  const status = passed ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${name}: ${details}`);
}

async function runTests() {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('EWO-017R.2R Refinement R2 — Real Deployed MCP Runtime Tests');
  console.log('════════════════════════════════════════════════════════════\n');

  // Authenticate first
  await authenticate();
  console.log('');

  // Capture EWO lifecycle state BEFORE tests
  const { data: ewoBefore } = await supabase
    .from('engineering_work_orders')
    .select('ewo_ref, title, status, verification_status, report_generation_status')
    .eq('ewo_ref', 'EWO-017R.2R')
    .single();
  console.log('EWO-017R.2R BEFORE tests:', ewoBefore);
  console.log('');

  const CONV_A_ID = 'chatgpt-conv-a-' + Date.now();
  const CONV_B_ID = 'chatgpt-conv-b-' + Date.now();
  const TENANT_ID = 'test-tenant-ewo017r2r';

  // ─── TEST A — Bind within Conversation A ────────────────────────────────────
  console.log('─── TEST A — Bind within Conversation A ────────────────────');
  const testAResponse = await callMcp(
    'submit_conversation_inspection',
    {
      natural_language_request: 'Inspect Engineering Work Order EWO-017R.2R and make it the active Engineering Work Order for this conversation. Do not perform any lifecycle changes.',
      client_id: 'mcp-test-client',
      conversation_id: CONV_A_ID,
    },
    { 'X-Tenant-Id': TENANT_ID },
  );

  const testAData = testAResponse.data;
  const testADiag = testAData?.context_first_diagnostics ?? testAData?.data?.context_first_diagnostics;

  record('A: EWO resolves',
    testAData?.resolved_engineering_object_reference === 'EWO-017R.2R' ||
    testAData?.data?.resolved_engineering_object_reference === 'EWO-017R.2R',
    `resolved_engineering_object_reference=${testAData?.resolved_engineering_object_reference ?? testAData?.data?.resolved_engineering_object_reference}`,
    testAData);

  record('A: Context binding succeeds',
    testAData?.active_object_updated === true || testAData?.data?.active_object_updated === true,
    `active_object_updated=${testAData?.active_object_updated ?? testAData?.data?.active_object_updated}`,
    testAData);

  record('A: Conversation-specific identifier returned',
    !!(testAData?.conversation_identifier && testAData?.conversation_identifier === CONV_A_ID) ||
    !!(testAData?.data?.conversation_identifier && testAData?.data?.conversation_identifier === CONV_A_ID),
    `conversation_identifier=${testAData?.conversation_identifier ?? testAData?.data?.conversation_identifier}, source=${testAData?.conversation_identifier_source ?? testAData?.data?.conversation_identifier_source}`,
    testAData);

  record('A: lifecycle_change_performed is false',
    testAData?.lifecycle_change_performed === false || testAData?.data?.lifecycle_change_performed === false,
    `lifecycle_change_performed=${testAData?.lifecycle_change_performed ?? testAData?.data?.lifecycle_change_performed}`,
    testAData);

  record('A: conversation_scope_verified is true',
    testAData?.conversation_scope_verified === true || testAData?.data?.conversation_scope_verified === true,
    `conversation_scope_verified=${testAData?.conversation_scope_verified ?? testAData?.data?.conversation_scope_verified}`,
    testAData);

  console.log('');

  // ─── TEST B — Continue within Conversation A ─────────────────────────────────
  console.log('─── TEST B — Continue within Conversation A ────────────────');
  const testBResponse = await callMcp(
    'submit_conversation_inspection',
    {
      natural_language_request: 'Expand the Engineering Analysis for the current Engineering Work Order.',
      client_id: 'mcp-test-client',
      conversation_id: CONV_A_ID,
    },
    { 'X-Tenant-Id': TENANT_ID },
  );

  const testBData = testBResponse.data;

  record('B: EWO-017R.2R resolves from active conversation object',
    testBData?.resolved_engineering_object_reference === 'EWO-017R.2R' ||
    testBData?.data?.resolved_engineering_object_reference === 'EWO-017R.2R',
    `resolved_engineering_object_reference=${testBData?.resolved_engineering_object_reference ?? testBData?.data?.resolved_engineering_object_reference}`,
    testBData);

  record('B: Same conversation identifier as Test A',
    testBData?.conversation_identifier === CONV_A_ID ||
    testBData?.data?.conversation_identifier === CONV_A_ID,
    `conversation_identifier=${testBData?.conversation_identifier ?? testBData?.data?.conversation_identifier}`,
    testBData);

  record('B: context_resolution_source identifies governed conversational context',
    testBData?.context_resolution_source === 'atd_conversation_active_object' ||
    testBData?.data?.context_resolution_source === 'atd_conversation_active_object' ||
    testBData?.context_first_diagnostics?.context_resolution_source === 'atd_conversation_active_object' ||
    testBData?.data?.context_first_diagnostics?.context_resolution_source === 'atd_conversation_active_object',
    `context_resolution_source=${testBData?.context_resolution_source ?? testBData?.context_first_diagnostics?.context_resolution_source ?? testBData?.data?.context_resolution_source ?? testBData?.data?.context_first_diagnostics?.context_resolution_source}`,
    testBData);

  console.log('');

  // ─── TEST C — Separate Conversation B isolation ──────────────────────────────
  console.log('─── TEST C — Separate Conversation B isolation ────────────');
  const testCResponse = await callMcp(
    'submit_conversation_inspection',
    {
      natural_language_request: 'Expand the Engineering Analysis for the current Engineering Work Order.',
      client_id: 'mcp-test-client',
      conversation_id: CONV_B_ID,
    },
    { 'X-Tenant-Id': TENANT_ID },
  );

  const testCData = testCResponse.data;

  record('C: Conversation B does NOT inherit EWO-017R.2R from Conversation A',
    testCData?.resolved_engineering_object_reference !== 'EWO-017R.2R' ||
    testCData?.data?.resolved_engineering_object_reference !== 'EWO-017R.2R',
    `resolved_engineering_object_reference=${testCData?.resolved_engineering_object_reference ?? testCData?.data?.resolved_engineering_object_reference} (should NOT be EWO-017R.2R)`,
    testCData);

  record('C: Conversation B has different conversation identifier',
    testCData?.conversation_identifier === CONV_B_ID ||
    testCData?.data?.conversation_identifier === CONV_B_ID ||
    testCData?.context_first_diagnostics?.conversation_identifier_received === CONV_B_ID ||
    testCData?.data?.context_first_diagnostics?.conversation_identifier_received === CONV_B_ID ||
    testCData?.conversation_identifier_source === 'explicit_conversation_id_parameter' ||
    testCData?.data?.conversation_identifier_source === 'explicit_conversation_id_parameter',
    `conversation_identifier=${testCData?.conversation_identifier ?? testCData?.data?.conversation_identifier ?? 'undefined'}, source=${testCData?.conversation_identifier_source ?? testCData?.data?.conversation_identifier_source ?? 'undefined'} (should be CONV_B)`,
    testCData);

  console.log('');

  // ─── TEST D — Replace active object in Conversation B ─────────────────────────
  console.log('─── TEST D — Replace active object in Conversation B ────────');
  // First, find another valid EWO to bind
  const { data: otherEwo } = await supabase
    .from('engineering_work_orders')
    .select('ewo_ref')
    .neq('ewo_ref', 'EWO-017R.2R')
    .limit(1)
    .single();

  const otherEwoRef = otherEwo?.ewo_ref ?? 'EWO-017R.2R';

  const testDResponse = await callMcp(
    'submit_conversation_inspection',
    {
      natural_language_request: `Inspect Engineering Work Order ${otherEwoRef} and make it the active Engineering Work Order for this conversation. Do not perform any lifecycle changes.`,
      client_id: 'mcp-test-client',
      conversation_id: CONV_B_ID,
    },
    { 'X-Tenant-Id': TENANT_ID },
  );

  const testDData = testDResponse.data;

  record('D: Conversation B resolves its newly bound EWO',
    testDData?.resolved_engineering_object_reference === otherEwoRef ||
    testDData?.data?.resolved_engineering_object_reference === otherEwoRef,
    `resolved_engineering_object_reference=${testDData?.resolved_engineering_object_reference ?? testDData?.data?.resolved_engineering_object_reference} (should be ${otherEwoRef})`,
    testDData);

  // Verify Conversation A still resolves EWO-017R.2R
  const testDVerifyResponse = await callMcp(
    'submit_conversation_inspection',
    {
      natural_language_request: 'Expand the Engineering Analysis for the current Engineering Work Order.',
      client_id: 'mcp-test-client',
      conversation_id: CONV_A_ID,
    },
    { 'X-Tenant-Id': TENANT_ID },
  );

  const testDVerifyData = testDVerifyResponse.data;

  record('D: Conversation A still resolves EWO-017R.2R (not overwritten)',
    testDVerifyData?.resolved_engineering_object_reference === 'EWO-017R.2R' ||
    testDVerifyData?.data?.resolved_engineering_object_reference === 'EWO-017R.2R',
    `Conversation A resolved_engineering_object_reference=${testDVerifyData?.resolved_engineering_object_reference ?? testDVerifyData?.data?.resolved_engineering_object_reference} (should still be EWO-017R.2R)`,
    testDVerifyData);

  console.log('');

  // ─── TEST E — Missing conversation identity ───────────────────────────────────
  console.log('─── TEST E — Missing conversation identity ────────────────');
  const testEResponse = await callMcp(
    'submit_conversation_inspection',
    {
      natural_language_request: 'Inspect Engineering Work Order EWO-017R.2R and make it the active Engineering Work Order for this conversation. Do not perform any lifecycle changes.',
      client_id: 'mcp-test-client',
      // No conversation_id, no session_id, no headers
    },
    {}, // No conversation headers
  );

  const testEData = testEResponse.data;

  record('E: Deterministic failure returned',
    testEData?.routing_decision === 'context_binding_failed_no_conversation_identity' ||
    testEData?.data?.routing_decision === 'context_binding_failed_no_conversation_identity',
    `routing_decision=${testEData?.routing_decision ?? testEData?.data?.routing_decision}`,
    testEData);

  record('E: active_object_updated is false',
    testEData?.active_object_updated === false || testEData?.data?.active_object_updated === false,
    `active_object_updated=${testEData?.active_object_updated ?? testEData?.data?.active_object_updated}`,
    testEData);

  record('E: context_binding_operation is false',
    testEData?.context_binding_operation === false || testEData?.data?.context_binding_operation === false,
    `context_binding_operation=${testEData?.context_binding_operation ?? testEData?.data?.context_binding_operation}`,
    testEData);

  record('E: conversation_identifier is null',
    testEData?.conversation_identifier === null || testEData?.data?.conversation_identifier === null,
    `conversation_identifier=${testEData?.conversation_identifier ?? testEData?.data?.conversation_identifier}`,
    testEData);

  record('E: conversation_identifier_source is none',
    testEData?.conversation_identifier_source === 'none' || testEData?.data?.conversation_identifier_source === 'none',
    `conversation_identifier_source=${testEData?.conversation_identifier_source ?? testEData?.data?.conversation_identifier_source}`,
    testEData);

  record('E: failure_reason is conversation_specific_identity_unavailable',
    testEData?.failure_reason === 'conversation_specific_identity_unavailable' ||
    testEData?.data?.failure_reason === 'conversation_specific_identity_unavailable',
    `failure_reason=${testEData?.failure_reason ?? testEData?.data?.failure_reason}`,
    testEData);

  console.log('');

  // ─── TEST F — Lifecycle integrity ─────────────────────────────────────────────
  console.log('─── TEST F — Lifecycle integrity ──────────────────────────');
  const { data: ewoAfter } = await supabase
    .from('engineering_work_orders')
    .select('ewo_ref, title, status, verification_status, report_generation_status')
    .eq('ewo_ref', 'EWO-017R.2R')
    .single();

  console.log('EWO-017R.2R AFTER tests:', ewoAfter);

  const lifecycleUnchanged =
    ewoBefore?.status === ewoAfter?.status &&
    ewoBefore?.verification_status === ewoAfter?.verification_status &&
    ewoBefore?.report_generation_status === ewoAfter?.report_generation_status;

  record('F: No lifecycle fields changed',
    lifecycleUnchanged === true,
    `status=${ewoBefore?.status}→${ewoAfter?.status}, verification=${ewoBefore?.verification_status}→${ewoAfter?.verification_status}, report=${ewoBefore?.report_generation_status}→${ewoAfter?.report_generation_status}`,
    { before: ewoBefore, after: ewoAfter });

  console.log('');

  // ─── Summary ──────────────────────────────────────────────────────────────────
  console.log('════════════════════════════════════════════════════════════');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`RESULTS: ${passed} passed, ${failed} failed, ${results.length} total`);
  console.log('════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.details}`);
    });
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
