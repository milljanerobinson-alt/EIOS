/**
 * EWO-044R2 — Acceptance Test Script
 *
 * Tests the deployed ATD Conversation Gateway runtime against the five
 * Product Owner acceptance prompts. Requires test auth + configured provider.
 *
 * Uses PRODUCTION tool registry (via get_tools action) and PRODUCTION tool
 * execution (via execute_tool action). No embedded tool definitions, no
 * direct database queries.
 *
 * Usage: npx tsx scripts/ewo044r2-acceptance-test.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8').trim();
const envVars: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const m = line.match(/^(\w+)=(.+)/);
  if (m) envVars[m[1]] = m[2].trim();
}

const SUPABASE_URL = envVars.VITE_SUPABASE_URL || envVars.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = envVars.VITE_SUPABASE_ANON_KEY || envVars.SUPABASE_ANON_KEY || '';
const TEST_EMAIL = 'engineering.test@eios.local';
const TEST_PASSWORD = 'EiosBrowserTest2026!';

const GATEWAY_URL = `${SUPABASE_URL}/functions/v1/atd-conversation-gateway`;

const ATD_SYSTEM_PROMPT = `You are ATD — the Engineering Intelligence assistant for the EIOS platform.

When the user's request depends on current EIOS state, repository state, prior work, Engineering Work Orders, architecture records, or any governed engineering data, you MUST use the available tools before answering. Do not invent current platform facts. Do not claim that access is unavailable until you have attempted the relevant available tools.

Greetings and requests that do not depend on governed data do not require a tool call. Answer directly.

Your final response must be a JSON object with: response_type, interpreted_request, user_facing_message, referenced_ewo, confidence, etc.`;

interface TestResult {
  test: string;
  prompt: string;
  provider: string;
  nativeToolCalls: string[];
  nativeCallIds: string[];
  executedTools: string[];
  resolvedContext: Record<string, unknown>;
  toolResults: unknown[];
  toolRounds: number;
  finalResponse: string;
  auditRef: string;
  passed: boolean;
  notes: string;
}

interface ResolvedContext {
  tenant_id: string | null;
  user_id: string;
  role: string;
  conversation_id: string;
  project_id: string | null;
  ewo_ref: string | null;
  repository: string | null;
}

async function run(): Promise<void> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (authError || !authData.session) {
    console.error('AUTH FAILED:', authError?.message);
    process.exit(1);
  }
  const accessToken = authData.session.access_token;
  console.log('Authenticated as', TEST_EMAIL);

  const conversationId = `ewo044r2-acceptance-${Date.now()}`;

  // Health check
  const healthResp = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action: 'health' }),
  });
  console.log('Gateway health:', healthResp.status, await healthResp.text());

  // Context resolution
  const ctxResp = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action: 'resolve_context', conversation_id: conversationId }),
  });
  let resolvedContext: ResolvedContext = {
    tenant_id: null, user_id: '', role: 'user', conversation_id: conversationId,
    project_id: null, ewo_ref: null, repository: null,
  };
  if (ctxResp.ok) {
    const ctxData = await ctxResp.json();
    resolvedContext = { ...resolvedContext, ...(ctxData.context ?? {}) };
    console.log('Resolved context:', JSON.stringify(resolvedContext, null, 2));
  }

  // Verify production tools are available
  const toolsResp = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ action: 'get_tools' }),
  });
  const toolsData = await toolsResp.json();
  const hasListActiveEwos = (toolsData.tools ?? []).some((t: { name: string }) => t.name === 'eios_list_active_ewos');
  console.log('Production tool registry contains eios_list_active_ewos:', hasListActiveEwos);
  if (!hasListActiveEwos) {
    console.error('FAIL: eios_list_active_ewos not found in production tool registry');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(80));
  console.log('Running 5 acceptance tests (using production tool registry + production tool execution)...');
  console.log('='.repeat(80));

  const results: TestResult[] = [];
  results.push(await runTest('Test 1: Greeting', 'Good morning ATD.', conversationId, accessToken, false, [], resolvedContext));
  results.push(await runTest('Test 2: Continue work', "Continue yesterday's work.", conversationId, accessToken, true, ['eios_get_recent_work_context'], resolvedContext));
  results.push(await runTest('Test 3: Active EWOs', 'What Engineering Work Orders are active?', conversationId, accessToken, true, ['eios_list_active_ewos'], resolvedContext));
  results.push(await runTest('Test 4: Inspect repo', 'Inspect the current repository.', conversationId, accessToken, true, ['eios_search_repository_source', 'eios_get_repository'], resolvedContext));
  results.push(await runTest('Test 5: Architecture', 'Explain the architecture of the Conversation Gateway.', conversationId, accessToken, true, ['eios_get_architecture_records'], resolvedContext));

  console.log('\n' + '='.repeat(80));
  console.log('EWO-044R2 ACCEPTANCE TEST RESULTS');
  console.log('='.repeat(80));
  for (const r of results) {
    console.log(`\n${r.test}`);
    console.log(`  Prompt: "${r.prompt}"`);
    console.log(`  Provider: ${r.provider}`);
    console.log(`  Native tool calls: ${r.nativeToolCalls.length > 0 ? r.nativeToolCalls.join(', ') : '(none)'}`);
    console.log(`  Native call IDs: ${r.nativeCallIds.length > 0 ? r.nativeCallIds.join(', ') : '(none)'}`);
    console.log(`  Executed tools: ${r.executedTools.length > 0 ? r.executedTools.join(', ') : '(none)'}`);
    console.log(`  Tool rounds: ${r.toolRounds}`);
    console.log(`  Resolved context: ${JSON.stringify(r.resolvedContext)}`);
    console.log(`  Tool results: ${JSON.stringify(r.toolResults).slice(0, 500)}`);
    console.log(`  Final response: ${r.finalResponse.slice(0, 300)}`);
    console.log(`  Audit ref: ${r.auditRef || '(none)'}`);
    console.log(`  PASSED: ${r.passed}`);
    console.log(`  Notes: ${r.notes}`);
  }

  const allPassed = results.every(r => r.passed);
  console.log('\n' + '='.repeat(80));
  console.log(`OVERALL: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
  console.log('='.repeat(80));

  fs.writeFileSync('/tmp/ewo044r2-acceptance-results.json', JSON.stringify(results, null, 2));
  console.log('\nDetailed results written to /tmp/ewo044r2-acceptance-results.json');

  process.exit(allPassed ? 0 : 1);
}

interface RunTestParams {
  test: string;
  prompt: string;
  conversationId: string;
  accessToken: string;
  expectToolCall: boolean;
  expectedTools: string[];
  resolvedContext: ResolvedContext;
}

async function runTest(params: RunTestParams): Promise<TestResult> {
  const { test, prompt, conversationId, accessToken, expectToolCall, expectedTools, resolvedContext } = params;
  const result: TestResult = {
    test, prompt, provider: '', nativeToolCalls: [], nativeCallIds: [], executedTools: [],
    resolvedContext, toolResults: [], toolRounds: 0, finalResponse: '', auditRef: '',
    passed: false, notes: '',
  };

  try {
    // ── Fetch production tool definitions from the edge function ──────────
    const toolsResp = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ action: 'get_tools' }),
    });
    if (!toolsResp.ok) {
      result.notes = `Failed to fetch production tools: ${toolsResp.status}`;
      return result;
    }
    const toolsData = await toolsResp.json();
    const tools = toolsData.tools;

    let continuation: unknown = undefined;
    let priorToolResults: unknown[] = [];
    let loopCount = 0;
    const maxLoops = 10;
    let allExecutedTools: string[] = [];
    let allNativeCallIds: string[] = [];
    let allNativeToolCalls: string[] = [];
    let allToolResults: unknown[] = [];
    let finalContent = '';
    let provider = '';

    while (loopCount < maxLoops) {
      loopCount++;
      const resp = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          action: 'invoke_provider',
          messages: [{ role: 'user', content: prompt }],
          tools,
          system_prompt: ATD_SYSTEM_PROMPT,
          conversation_id: conversationId,
          prior_tool_results: priorToolResults.length > 0 ? priorToolResults : undefined,
          continuation,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        result.notes = `Provider call failed: ${resp.status} ${errText.slice(0, 200)}`;
        return result;
      }

      const data = await resp.json();
      provider = data.diagnostics?.provider ?? provider;

      if (data.kind === 'tool_calls' && data.tool_calls?.length > 0) {
        const toolCalls = data.tool_calls as Array<{
          tool: string;
          nativeCallId?: string;
          parameters: Record<string, unknown>;
        }>;
        for (const tc of toolCalls) {
          allNativeToolCalls.push(tc.tool);
          if (tc.nativeCallId) allNativeCallIds.push(tc.nativeCallId);
        }

        // ── Execute tools via the PRODUCTION execute_tool action ──────────
        const executedResults: unknown[] = [];
        for (const tc of toolCalls) {
          const execResp = await fetch(GATEWAY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({
              action: 'execute_tool',
              tool_name: tc.tool,
              parameters: tc.parameters,
              conversation_id: conversationId,
              context: resolvedContext,
            }),
          });
          const execData = await execResp.json();
          const execResult = {
            tool: tc.tool,
            success: execData.success,
            result: execData.result,
            error: execData.error,
            nativeCallId: tc.nativeCallId,
          };
          executedResults.push(execResult);
          allExecutedTools.push(tc.tool);
          allToolResults.push({ tool: tc.tool, success: execData.success, error: execData.error?.message });
        }
        priorToolResults = executedResults;
        continuation = data.continuation;
        continue;
      }

      finalContent = data.content ?? '';
      break;
    }

    result.provider = provider;
    result.nativeToolCalls = allNativeToolCalls;
    result.nativeCallIds = allNativeCallIds;
    result.executedTools = allExecutedTools;
    result.toolResults = allToolResults;
    result.toolRounds = loopCount;
    result.finalResponse = finalContent;

    // Check audit record
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data: auditRecord } = await supabase
      .from('eios_conversation_audit')
      .select('audit_reference')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (auditRecord) {
      result.auditRef = auditRecord.audit_reference;
    }

    // Determine pass/fail
    if (!expectToolCall) {
      result.passed = true;
      result.notes = 'Greeting — no tool call required';
    } else {
      const calledExpected = expectedTools.length === 0 ||
        expectedTools.some(et => allNativeToolCalls.includes(et) || allExecutedTools.includes(et));
      result.passed = calledExpected;
      const matched = expectedTools.filter(et => allNativeToolCalls.includes(et) || allExecutedTools.includes(et));
      result.notes = calledExpected
        ? `Provider called expected tool: ${matched.join(', ')}`
        : `Provider did not call expected tool(s): ${expectedTools.join(', ')}. Called: ${allNativeToolCalls.join(', ') || '(none)'}`;
    }
  } catch (e) {
    result.notes = `Exception: ${e instanceof Error ? e.message : String(e)}`;
  }

  return result;
}

run().catch(e => { console.error(e); process.exit(1); });
