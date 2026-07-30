/**
 * EWO-016R — Real Runtime Path Verification
 * Invokes the deployed command-centre-ai edge function directly with a real
 * authenticated session, mirroring the exact request the UI sends.
 *
 * This is NOT a mock — it calls the live deployed edge function which runs
 * the Conversation Context Router, Engineering Reference Resolver, and
 * Knowledge Package assembly before the AI provider is invoked.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://clrsckerimjturebulbk.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNscnNja2VyaW1qdHVyZWJ1bGJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MDYzNjgsImV4cCI6IjIwOTgwNDIzNjh9.9eVWnQUInIsRzgo8AIM_CRGLTIcGWUKEqbZ6Dm20BUw';

const BROWSER_TEST_EMAIL = 'engineering.test@eios.local';
const BROWSER_TEST_PASSWORD = 'EiosBrowserTest2026!';

async function runTest() {
  console.log('=== EWO-016R — Real Runtime Path Verification ===\n');

  // Step 1: Authenticate as Engineering Browser Test account
  console.log('Step 1: Authenticating as Engineering Browser Test account...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: BROWSER_TEST_EMAIL,
    password: BROWSER_TEST_PASSWORD,
  });

  if (authError || !authData.session) {
    console.error('FAIL: Authentication failed:', authError?.message);
    process.exit(1);
  }
  console.log(`  Authenticated as ${BROWSER_TEST_EMAIL}`);
  const token = authData.session.access_token;

  // Step 2: Invoke the deployed command-centre-ai edge function
  // This is the EXACT path the real ATD conversation UI uses.
  console.log('\nStep 2: Invoking command-centre-ai edge function with "What is EWO-015?"...');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/command-centre-ai`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'What is EWO-015?' }],
      mode: 'ask',
      ai_role: 'director',
      active_workspace: 'LLND Automate',
    }),
  });

  console.log(`  HTTP status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`FAIL: Edge function returned ${response.status}: ${errorText}`);
    process.exit(1);
  }

  const data = await response.json() as Record<string, unknown>;

  // Step 3: Verify routing diagnostics
  console.log('\nStep 3: Verifying routing diagnostics...');
  const diagnostics = data.routing_diagnostics as Record<string, unknown> | undefined;
  const contextDomain = data.data_context_domain as string | undefined;
  const contextUsed = data.context_used as Record<string, unknown> | undefined;
  const reply = data.reply as string | undefined;

  console.log('  Routing Diagnostics:');
  if (diagnostics) {
    console.log(`    selectedDomain: ${diagnostics.selectedDomain}`);
    console.log(`    routingRule: ${diagnostics.routingRule}`);
    console.log(`    detectedReferences: ${JSON.stringify(diagnostics.detectedReferences)}`);
    console.log(`    detectedIntent: ${diagnostics.detectedIntent}`);
    console.log(`    resolverInvoked: ${diagnostics.resolverInvoked}`);
    console.log(`    canonicalTableQueried: ${diagnostics.canonicalTableQueried}`);
    console.log(`    resolutionOutcome: ${diagnostics.resolutionOutcome}`);
    console.log(`    knowledgePackageVersion: ${diagnostics.knowledgePackageVersion}`);
    console.log(`    aiProviderInvoked: ${diagnostics.aiProviderInvoked}`);
    console.log(`    finalResponseClassification: ${diagnostics.finalResponseClassification}`);
  } else {
    console.log('    (no routing diagnostics returned)');
  }

  console.log(`\n  data_context_domain: ${contextDomain ?? 'not returned'}`);

  console.log('\n  Context Used:');
  if (contextUsed) {
    console.log(`    domain: ${contextUsed.domain}`);
    console.log(`    resolvedObject: ${contextUsed.resolvedObject}`);
    console.log(`    sources: ${JSON.stringify(contextUsed.sources)}`);
  } else {
    console.log('    (no context_used returned)');
  }

  // Step 4: Verify response content
  console.log('\nStep 4: Verifying response content...');
  console.log(`  Reply length: ${reply?.length ?? 0} chars`);
  console.log(`  Reply (first 300 chars): ${(reply ?? '').slice(0, 300)}...`);

  // Assertions
  const checks = {
    'domain is eios-engineering': contextDomain === 'eios-engineering',
    'routing rule is explicit-canonical-engineering-reference': diagnostics?.routingRule === 'explicit-canonical-engineering-reference',
    'resolver was invoked': diagnostics?.resolverInvoked === true,
    'canonical table queried is engineering_work_orders': diagnostics?.canonicalTableQueried === 'engineering_work_orders',
    'resolution outcome is resolved': diagnostics?.resolutionOutcome === 'resolved',
    'knowledge package version present': diagnostics?.knowledgePackageVersion === '1.0.0',
    'response mentions EWO-015': (reply ?? '').toLowerCase().includes('ewo-015'),
    'response does NOT say "not a recognized identifier"': !/not a recognized identifier|not recognized/i.test(reply ?? ''),
    'response does NOT ask for more context': !/provide (more )?(context|information|details)/i.test(reply ?? ''),
    'response does NOT treat EWO-015 as LLND feature only': !/^.*llnd automate.*feature.*$/im.test(reply ?? ''),
    'context_used domain is eios-engineering': contextUsed?.domain === 'eios-engineering',
    'context_used resolvedObject is EWO-015': contextUsed?.resolvedObject === 'EWO-015',
  };

  console.log('\n=== Verification Results ===');
  let allPassed = true;
  for (const [check, result] of Object.entries(checks)) {
    console.log(`  ${result ? 'PASS' : 'FAIL'}: ${check}`);
    if (!result) allPassed = false;
  }

  console.log(`\nOverall: ${allPassed ? 'PASS' : 'FAIL'}`);

  if (!allPassed) {
    process.exit(1);
  }
}

runTest().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
