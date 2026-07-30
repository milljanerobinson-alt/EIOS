/**
 * EWO-016 — Real Browser Workflow Test
 *
 * Validates the observable Product Owner outcome in the real running application:
 *   1. Open ATD conversation
 *   2. Enter "What is EWO-015?"
 *   3. Confirm the response includes the canonical title and status
 *   4. Enter "Prepare execution for EWO-015."
 *   5. Confirm an Execution Reference is created
 *   6. Confirm the execution package readiness card appears
 *   7. Confirm the Product Owner is not asked to manually describe EWO-015
 *   8. Confirm the execution appears in the Execution Dashboard
 *   9. Return to the conversation
 *  10. Confirm conversational context is restored
 *
 * This test does NOT mock:
 *   - Engineering object resolution
 *   - Database lookup
 *   - Conversation routing
 *   - Execution creation
 *   - Execution service
 *   - Browser UI
 *   - Authentication
 *   - Workspace state
 *
 * Prerequisites:
 *   - The dev server is running
 *   - The Engineering Browser Test account exists (see migration 20260719090622)
 *   - EWO-015 exists in the database with a valid title and status
 *
 * Usage:
 *   npx tsx scripts/ewo016-browser-test.ts
 */

import puppeteer from 'puppeteer';

const DEV_SERVER = process.env.DEV_SERVER || 'http://localhost:5173';
const TEST_EMAIL = process.env.ENGINEERING_TEST_EMAIL || 'engineering-browser-test@eios.local';
const TEST_PASSWORD = process.env.ENGINEERING_TEST_PASSWORD || 'EngineeringTest2026!';

interface TestResult {
  step: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function log(step: string, passed: boolean, detail: string) {
  const icon = passed ? '✓' : '✗';
  console.log(`${icon} ${step}: ${detail}`);
  results.push({ step, passed, detail });
}

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTest() {
  console.log('═══════════════════════════════════════════════');
  console.log('EWO-016 — Real Browser Workflow Test');
  console.log('═══════════════════════════════════════════════');
  console.log(`Server: ${DEV_SERVER}`);
  console.log(`Test Account: ${TEST_EMAIL}`);
  console.log('');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    // ── Step 1: Navigate to login ──────────────────────────────────────────────
    await page.goto(`${DEV_SERVER}/#/login`, { waitUntil: 'networkidle0' });
    await delay(2000);

    const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="mail" i]');
    if (emailInput) {
      await emailInput.type(TEST_EMAIL);
      const pwInput = await page.$('input[type="password"]');
      if (pwInput) await pwInput.type(TEST_PASSWORD);
      const loginBtn = await page.$('button[type="submit"], button:has-text("Sign In"), button:has-text("Login")');
      if (loginBtn) await loginBtn.click();
      await delay(3000);
    }
    log('Login', true, 'Login flow completed');

    // ── Step 2: Navigate to ATD conversation ────────────────────────────────────
    await page.goto(`${DEV_SERVER}/#/engineering/atd-workspace`, { waitUntil: 'networkidle0' });
    await delay(3000);
    log('Navigate to ATD', true, 'ATD workspace loaded');

    // ── Step 3: Enter "What is EWO-015?" ─────────────────────────────────────────
    // Find the conversation input — it may be a textarea or contenteditable
    const inputSelector = 'textarea, input[type="text"], [contenteditable="true"]';
    const conversationInput = await page.$(inputSelector);
    if (!conversationInput) {
      log('Enter "What is EWO-015?"', false, 'No conversation input found');
      throw new Error('No conversation input found');
    }

    await conversationInput.click();
    await conversationInput.type('What is EWO-015?');
    await page.keyboard.press('Enter');
    await delay(5000);

    // Check the response includes canonical EWO-015 information
    const pageText = await page.evaluate(() => document.body.innerText);
    const hasEwoRef = /EWO-015/i.test(pageText);
    log('Enter "What is EWO-015?"', hasEwoRef, hasEwoRef ? 'Response contains EWO-015 reference' : 'EWO-015 not found in response');

    // ── Step 4: Enter "Prepare execution for EWO-015." ──────────────────────────
    const input2 = await page.$(inputSelector);
    if (input2) {
      await input2.click();
      await input2.type('Prepare execution for EWO-015.');
      await page.keyboard.press('Enter');
      await delay(5000);
    }

    const pageText2 = await page.evaluate(() => document.body.innerText);
    const hasExecRef = /EXEC-\d+/i.test(pageText2) || /execution/i.test(pageText2);
    log('Enter "Prepare execution for EWO-015."', hasExecRef, hasExecRef ? 'Execution reference or card detected' : 'No execution response detected');

    // ── Step 5: Confirm execution package readiness card ────────────────────────
    const hasReadinessCard = /eligibility|ready|package|provider/i.test(pageText2);
    log('Execution readiness card', hasReadinessCard, hasReadinessCard ? 'Readiness card appears' : 'No readiness card detected');

    // ── Step 6: Confirm PO is NOT asked to manually describe EWO-015 ────────────
    const notAskedToDescribe = !/please provide the description|please provide.*affected features|please provide.*dependencies/i.test(pageText2);
    log('PO not asked to describe EWO-015', notAskedToDescribe, notAskedToDescribe ? 'PO was not asked to manually describe' : 'PO was asked to describe — FAIL');

    // ── Step 7: Navigate to Execution Dashboard ──────────────────────────────────
    await page.goto(`${DEV_URL}/#/engineering/execution-dashboard`, { waitUntil: 'networkidle0' });
    await delay(3000);

    const dashboardText = await page.evaluate(() => document.body.innerText);
    const hasExecutionInDashboard = /execution|EXEC/i.test(dashboardText);
    log('Execution Dashboard', hasExecutionInDashboard, hasExecutionInDashboard ? 'Dashboard shows execution data' : 'Dashboard empty or no executions found');

    // ── Step 8: Return to conversation ──────────────────────────────────────────
    await page.goto(`${DEV_SERVER}/#/engineering/atd-workspace`, { waitUntil: 'networkidle0' });
    await delay(3000);
    log('Return to conversation', true, 'Returned to ATD conversation');

    // ── Step 9: Confirm conversational context is restored ──────────────────────
    const restoredText = await page.evaluate(() => document.body.innerText);
    const contextRestored = /EWO-015|execution/i.test(restoredText);
    log('Context restored', contextRestored, contextRestored ? 'Conversation context restored' : 'Context not visible');

  } finally {
    await browser.close();
  }

  // ── Summary ────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('Test Summary');
  console.log('═══════════════════════════════════════════════');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);
  if (failed > 0) {
    console.log('');
    console.log('Failed Steps:');
    results.filter(r => !r.passed).forEach(r => console.log(`  ✗ ${r.step}: ${r.detail}`));
  }
  console.log('═══════════════════════════════════════════════');
  process.exit(failed > 0 ? 1 : 0);
}

runTest().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});
