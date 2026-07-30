/**
 * EWO-016R.X — Real Runtime Path Verification
 * Verifies the deployed edge function routes relationship discovery queries
 * correctly and builds the Engineering Relationship Graph.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://clrsckerimjturebulbk.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNscnNja2VyaW1qdHVyZWJ1bGJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MDYzNjgsImV4cCI6IjIwOTgwNDIzNjh9.9eVWnQUInIsRzgo8AIM_CRGLTIcGWUKEqbZ6Dm20BUw';

const BROWSER_TEST_EMAIL = 'engineering.test@eios.local';
const BROWSER_TEST_PASSWORD = 'EiosBrowserTest2026!';

async function runTest() {
  console.log('=== EWO-016R.X — Relationship Discovery Runtime Verification ===\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: BROWSER_TEST_EMAIL,
    password: BROWSER_TEST_PASSWORD,
  });
  if (authError || !authData.session) {
    console.error('FAIL: Authentication failed:', authError?.message);
    process.exit(1);
  }
  const token = authData.session.access_token;

  console.log('Invoking command-centre-ai with relationship query...');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/command-centre-ai`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'What engineering records are related to EWO-014.19A?' }],
      mode: 'ask',
      ai_role: 'director',
      active_workspace: 'LLND Automate',
    }),
  });

  console.log(`HTTP status: ${response.status}`);
  if (!response.ok) {
    console.error(`FAIL: ${response.status}: ${await response.text()}`);
    process.exit(1);
  }

  const data = await response.json() as Record<string, unknown>;
  const diagnostics = data.routing_diagnostics as Record<string, unknown> | undefined;
  const intent = data.detected_intent as string | undefined;
  const domain = data.data_context_domain as string | undefined;
  const graph = data.relationship_graph as Record<string, unknown> | undefined;
  const reply = data.reply as string | undefined;

  console.log('\n=== Routing Diagnostics ===');
  if (diagnostics) {
    console.log(`  selectedDomain: ${diagnostics.selectedDomain}`);
    console.log(`  routingRule: ${diagnostics.routingRule}`);
    console.log(`  detectedIntent: ${diagnostics.detectedIntent}`);
    console.log(`  resolverInvoked: ${diagnostics.resolverInvoked}`);
    console.log(`  resolutionOutcome: ${diagnostics.resolutionOutcome}`);
    console.log(`  finalResponseClassification: ${diagnostics.finalResponseClassification}`);
    console.log(`  relationshipGraphNodes: ${diagnostics.relationshipGraphNodes ?? 0}`);
    console.log(`  relationshipGraphPending: ${diagnostics.relationshipGraphPending ?? 0}`);
  }

  console.log(`\n  detected_intent: ${intent}`);
  console.log(`  data_context_domain: ${domain}`);

  console.log('\n=== Relationship Graph ===');
  if (graph) {
    console.log(`  rootRef: ${graph.rootRef}`);
    console.log(`  totalFound: ${graph.totalFound}`);
    console.log(`  totalPending: ${graph.totalPending}`);
    const nodes = graph.nodes as Array<Record<string, unknown>> | undefined;
    if (nodes) {
      console.log(`  nodes:`);
      for (const n of nodes.slice(0, 10)) {
        console.log(`    - ${n.ref} (${n.type}) — ${n.title} [${n.status}] rel: ${n.relationship}`);
      }
    }
    const pending = graph.pendingArtefacts as Array<Record<string, unknown>> | undefined;
    if (pending && pending.length > 0) {
      console.log(`  pending artefacts:`);
      for (const p of pending) {
        console.log(`    - ${p.type}: ${p.title} — ${p.status} — ${p.pendingReason}`);
      }
    }
  } else {
    console.log('  (no relationship graph returned)');
  }

  console.log('\n=== Reply (first 500 chars) ===');
  console.log((reply ?? '').slice(0, 500));

  const checks = {
    'intent is relationship_discovery': intent === 'relationship_discovery',
    'domain is eios-engineering': domain === 'eios-engineering',
    'routing rule is explicit-canonical-engineering-reference': diagnostics?.routingRule === 'explicit-canonical-engineering-reference',
    'resolver was invoked': diagnostics?.resolverInvoked === true,
    'finalResponseClassification is relationship-discovery': diagnostics?.finalResponseClassification === 'eios-engineering-relationship-discovery',
    'relationship graph returned': graph !== null,
    'response mentions EWO-014.19A': (reply ?? '').toLowerCase().includes('ewo-014.19a'),
    'response does NOT say "not a recognized identifier"': !/not a recognized identifier|not recognized/i.test(reply ?? ''),
    'response does NOT ask for more context': !/provide (more )?(context|information|details)/i.test(reply ?? ''),
  };

  console.log('\n=== Verification Results ===');
  let allPassed = true;
  for (const [check, result] of Object.entries(checks)) {
    console.log(`  ${result ? 'PASS' : 'FAIL'}: ${check}`);
    if (!result) allPassed = false;
  }

  console.log(`\nOverall: ${allPassed ? 'PASS' : 'FAIL'}`);
  if (!allPassed) process.exit(1);
}

runTest().catch(err => { console.error(err); process.exit(1); });
