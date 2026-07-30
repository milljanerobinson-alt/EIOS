/**
 * EWO-016R.Y — Live Runtime Diagnostic Fidelity Verification
 *
 * Sequence:
 * 1. Initial request: "What engineering records are related to EWO-014.19A?"
 *    → captures the Runtime Diagnostic Envelope.
 * 2. Follow-up: "Which relationship graph tables did you actually query to
 *    produce the previous answer? List only the tables actually queried at
 *    runtime. Do not infer or guess."
 *    → passes the prior envelope; response must reflect it exactly.
 * 3. Debug mode: same initial request with debug_mode=true.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://clrsckerimjturebulbk.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNscnNja2VyaW1qdHVyZWJ1bGJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MDYzNjgsImV4cCI6MjA5ODA0MjM2OH0.9eVWnQUInIsRzgo8AIM_CRGLTIcGWUKEqbZ6Dm20BUw';
const BROWSER_TEST_EMAIL = 'engineering.test@eios.local';
const BROWSER_TEST_PASSWORD = 'EiosBrowserTest2026!';

const RELATIONSHIP_GRAPH_SOURCES = [
  'engineering_object_relationships',
  'engineering_work_orders',
  'ewo_verification_sessions',
  'ewo_completion_reports',
  'engineering_executions',
  'ecc_engineering_reviews',
  'engineering_recovery_packages',
  'ewo_engineering_packages',
  'ewo_lifecycle_events',
  'engineering_records_library',
  'atd_engineering_decisions',
];

const PRODUCT_IMPACT_TABLES = [
  'ecc_backlog_items', 'ecc_release_candidates', 'ecc_product_features',
  'ecc_engineering_audit', 'ecc_documentation', 'ecc_decisions',
  'ecc_testing_reports', 'ecc_architecture_reviews', 'ecc_engineering_standards',
];

async function invoke(token: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/command-centre-ai`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json() as Promise<Record<string, any>>;
}

async function run() {
  console.log('=== EWO-016R.Y — Live Runtime Diagnostic Fidelity ===\n');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: BROWSER_TEST_EMAIL, password: BROWSER_TEST_PASSWORD,
  });
  if (authError || !authData.session) { console.error('Auth failed:', authError?.message); process.exit(1); }
  const token = authData.session.access_token;

  // ─── Step 1: Initial relationship discovery request ───────────────────────
  console.log('--- Step 1: Initial request ---');
  const initial = await invoke(token, {
    messages: [{ role: 'user', content: 'What engineering records are related to EWO-014.19A?' }],
    mode: 'ask', ai_role: 'director', active_workspace: 'LLND Automate',
  });
  const env1 = initial.runtime_diagnostic_envelope;
  console.log('Detected intent:', initial.detected_intent);
  console.log('Envelope request_id:', env1?.request_id);
  console.log('Envelope runtime_pipeline:', env1?.runtime_pipeline);
  console.log('Tables attempted:', env1?.tables_attempted);
  console.log('Tables successfully queried:', env1?.tables_successfully_queried);
  console.log('Query failures:', env1?.query_failures);
  console.log('Relationships found:', env1?.relationships_found_count);
  console.log('Pending artefacts:', env1?.pending_artefacts_count);
  console.log('Diagnostic confidence:', env1?.diagnostic_confidence);

  // ─── Step 2: Follow-up diagnostic question with prior envelope ─────────────
  console.log('\n--- Step 2: Follow-up with prior envelope ---');
  const followup = await invoke(token, {
    messages: [{ role: 'user', content: 'Which relationship graph tables did you actually query to produce the previous answer? List only the tables actually queried at runtime. Do not infer or guess.' }],
    mode: 'ask', ai_role: 'director', active_workspace: 'LLND Automate',
    prior_diagnostic_envelope: env1,
  });
  const env2 = followup.runtime_diagnostic_envelope;
  console.log('Follow-up detected intent:', followup.detected_intent);
  console.log('Follow-up envelope request_id:', env2?.request_id);
  console.log('Follow-up reply (first 600 chars):\n', (followup.reply ?? '').slice(0, 600));

  // ─── Step 3: Debug mode ─────────────────────────────────────────────────────
  console.log('\n--- Step 3: Debug mode ---');
  const debug = await invoke(token, {
    messages: [{ role: 'user', content: 'What engineering records are related to EWO-014.19A?' }],
    mode: 'ask', ai_role: 'director', active_workspace: 'LLND Automate',
    debug_mode: true,
  });
  console.log('Debug output:\n', debug.debug_output);

  // ─── Verification ───────────────────────────────────────────────────────────
  console.log('\n=== Verification Results ===');
  const checks: Record<string, boolean> = {
    '1. Initial envelope produced': !!env1,
    '2. Initial intent is relationship_discovery': initial.detected_intent === 'relationship_discovery',
    '3. Envelope runtime_pipeline is buildEngineeringRelationshipGraph': env1?.runtime_pipeline === 'buildEngineeringRelationshipGraph',
    '4. Envelope tables_attempted includes relationship graph sources':
      RELATIONSHIP_GRAPH_SOURCES.every(s => (env1?.tables_attempted ?? []).includes(s)),
    '5. Envelope does NOT include product-impact tables':
      PRODUCT_IMPACT_TABLES.every(t => !(env1?.tables_attempted ?? []).includes(t)),
    '6. Follow-up intent is diagnostic_followup': followup.detected_intent === 'diagnostic_followup',
    '7. Follow-up envelope bound to prior request_id': env2?.request_id === env1?.request_id,
    '8. Follow-up reply mentions relationship graph tables':
      RELATIONSHIP_GRAPH_SOURCES.some(s => (followup.reply ?? '').toLowerCase().includes(s)),
    '9. Follow-up reply does NOT mention product-impact tables':
      PRODUCT_IMPACT_TABLES.every(t => !(followup.reply ?? '').toLowerCase().includes(t)),
    '10. Debug output is structured (contains ENGINEERING RUNTIME DIAGNOSTICS)':
      typeof debug.debug_output === 'string' && debug.debug_output.includes('ENGINEERING RUNTIME DIAGNOSTICS'),
    '11. Debug output contains Request ID':
      typeof debug.debug_output === 'string' && debug.debug_output.includes('Request ID:'),
    '12. Debug output contains Tables Successfully Queried':
      typeof debug.debug_output === 'string' && debug.debug_output.includes('Tables Successfully Queried:'),
    '13. Debug output does not expose secrets':
      typeof debug.debug_output === 'string' && !/password|secret|token|api[_-]?key|bearer|authorization/i.test(debug.debug_output),
    '14. Envelope pending_artefacts_count is 3': env1?.pending_artefacts_count === 3,
    '15. Envelope query_failures is empty (all sources succeeded)': (env1?.query_failures ?? []).length === 0,
  };

  let allPassed = true;
  for (const [check, result] of Object.entries(checks)) {
    console.log(`  ${result ? 'PASS' : 'FAIL'}: ${check}`);
    if (!result) allPassed = false;
  }
  console.log(`\nOverall: ${allPassed ? 'PASS' : 'FAIL'}`);
  if (!allPassed) process.exit(1);
}

run().catch(err => { console.error(err); process.exit(1); });
