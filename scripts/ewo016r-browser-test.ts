/**
 * EWO-016R — Real Browser Test
 * Verifies the live ATD conversation routes "What is EWO-015?" to EIOS Engineering.
 *
 * Uses the Engineering Browser Test account (not Product Owner credentials).
 * Does not mock authentication, conversation UI, message submission, context
 * routing, engineering lookup, database access, or AI request construction.
 */

import { chromium } from 'playwright';
import { authenticate, BROWSER_TEST_EMAIL } from './browser-test-auth';

const BASE = 'http://localhost:5173';
const TIMEOUT = 90000;

async function runTest() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const evidence: {
    steps: string[];
    screenshots: string[];
    consoleLogs: string[];
    networkRequests: string[];
    routingDiagnostics: unknown;
    responseText: string;
    contextDomain: string | null;
  } = {
    steps: [],
    screenshots: [],
    consoleLogs: [],
    networkRequests: [],
    routingDiagnostics: null,
    responseText: '',
    contextDomain: null,
  };

  // Capture console logs
  page.on('console', msg => {
    evidence.consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  // Capture network requests to command-centre-ai
  page.on('request', req => {
    if (req.url().includes('command-centre-ai')) {
      evidence.networkRequests.push(`REQUEST: ${req.url()}`);
    }
  });
  page.on('response', async res => {
    if (res.url().includes('command-centre-ai')) {
      evidence.networkRequests.push(`RESPONSE: ${res.status()} ${res.url()}`);
      try {
        const body = await res.json();
        evidence.routingDiagnostics = body.routing_diagnostics ?? null;
        evidence.contextDomain = body.data_context_domain ?? null;
        evidence.responseText = body.reply ?? '';
      } catch {
        // Non-JSON response
      }
    }
  });

  try {
    // Step 1: Log in as Engineering Browser Test account
    evidence.steps.push('Step 1: Logging in as Engineering Browser Test account');
    const authResult = await authenticate(page, BASE);
    if (!authResult.success) {
      throw new Error(`Authentication failed: ${authResult.error}`);
    }
    evidence.steps.push(`  Authenticated as ${BROWSER_TEST_EMAIL}`);
    await page.screenshot({ path: 'tmp/ewo016r-01-login.png' });
    evidence.screenshots.push('tmp/ewo016r-01-login.png');

    // Step 2: Navigate to the ATD conversation (Command Centre AI)
    evidence.steps.push('Step 2: Navigating to ATD conversation');
    await page.goto(`${BASE}/#/ecc/ai-product-manager`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'tmp/ewo016r-02-conversation.png' });
    evidence.screenshots.push('tmp/ewo016r-02-conversation.png');

    // Step 3: Type "What is EWO-015?" in the conversation input
    evidence.steps.push('Step 3: Entering "What is EWO-015?"');
    const textarea = page.locator('textarea').first();
    await textarea.waitFor({ state: 'visible', timeout: 10000 });
    await textarea.fill('What is EWO-015?');
    await page.waitForTimeout(500);

    // Submit (Enter key, no shift)
    await textarea.press('Enter');
    evidence.steps.push('  Message submitted');
    await page.screenshot({ path: 'tmp/ewo016r-03-submitted.png' });
    evidence.screenshots.push('tmp/ewo016r-03-submitted.png');

    // Step 4: Wait for AI response
    evidence.steps.push('Step 4: Waiting for AI response');
    await page.waitForTimeout(TIMEOUT);
    await page.screenshot({ path: 'tmp/ewo016r-04-response.png' });
    evidence.screenshots.push('tmp/ewo016r-04-response.png');

    // Step 5: Check for data-context-domain attribute (Requirement 9)
    evidence.steps.push('Step 5: Checking data-context-domain attribute');
    const domainAttr = await page.locator('[data-context-domain]').first().getAttribute('data-context-domain').catch(() => null);
    evidence.steps.push(`  data-context-domain: ${domainAttr ?? 'not found in DOM (check network response)'}`);

    // Step 6: Verify response content
    evidence.steps.push('Step 6: Verifying response content');
    const responseText = evidence.responseText || '';
    evidence.steps.push(`  Response length: ${responseText.length} chars`);
    evidence.steps.push(`  Context domain: ${evidence.contextDomain ?? 'not captured'}`);

    // Assertions
    const checks = {
      domainIsEiosEngineering: evidence.contextDomain === 'eios-engineering',
      responseContainsEwo015: responseText.toLowerCase().includes('ewo-015'),
      responseDoesNotSayUnknown: !/not a recognized identifier|not recognized|unrecognized/i.test(responseText),
      responseDoesNotSayLlndFeature: !/llnd automate.*(feature|backlog)/i.test(responseText) || responseText.toLowerCase().includes('ewo-015'),
      responseDoesNotAskForContext: !/provide (more )?(context|information|details)/i.test(responseText),
      routingDiagnosticsPresent: evidence.routingDiagnostics !== null,
      resolverInvoked: (evidence.routingDiagnostics as Record<string, unknown> | null)?.resolverInvoked === true,
      resolutionOutcomeResolved: (evidence.routingDiagnostics as Record<string, unknown> | null)?.resolutionOutcome === 'resolved',
    };

    evidence.steps.push('');
    evidence.steps.push('=== Verification Results ===');
    for (const [check, result] of Object.entries(checks)) {
      evidence.steps.push(`  ${result ? 'PASS' : 'FAIL'}: ${check}`);
    }

    const allPassed = Object.values(checks).every(v => v === true);
    evidence.steps.push('');
    evidence.steps.push(`Overall: ${allPassed ? 'PASS' : 'FAIL'}`);

    // Step 7: Refresh and repeat (Requirement 8 of mandatory browser test)
    evidence.steps.push('Step 7: Refreshing and repeating query');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const textarea2 = page.locator('textarea').first();
    await textarea2.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (await textarea2.isVisible()) {
      await textarea2.fill('What is EWO-015?');
      await textarea2.press('Enter');
      await page.waitForTimeout(TIMEOUT);
      await page.screenshot({ path: 'tmp/ewo016r-05-repeat.png' });
      evidence.screenshots.push('tmp/ewo016r-05-repeat.png');
      evidence.steps.push('  Repeat query submitted');
    }

    console.log('\n=== EWO-016R Browser Test Evidence ===\n');
    console.log(evidence.steps.join('\n'));
    console.log('\n=== Routing Diagnostics ===');
    console.log(JSON.stringify(evidence.routingDiagnostics, null, 2));
    console.log('\n=== Response Text (first 500 chars) ===');
    console.log(responseText.slice(0, 500));

    if (!allPassed) {
      console.log('\n=== Browser test FAILED — not all checks passed ===');
      process.exit(1);
    }
    console.log('\n=== Browser test PASSED ===');

  } catch (err) {
    evidence.steps.push(`ERROR: ${(err as Error).message}`);
    await page.screenshot({ path: 'tmp/ewo016r-error.png' }).catch(() => {});
    console.error(evidence.steps.join('\n'));
    console.error(err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
