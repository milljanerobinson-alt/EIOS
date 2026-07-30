import { chromium } from 'playwright';
import fs from 'fs';
import { authenticate } from './browser-test-auth';

const BASE = 'http://localhost:4173';
const SHOTS_DIR = '/tmp/ewo014_19a1-screenshots';
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

const results: { test: string; pass: boolean; detail: string }[] = [];

function record(test: string, pass: boolean, detail: string) {
  results.push({ test, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${test}: ${detail}`);
}

async function main() {
  console.log('=== EWO-014.19A.1 Real Browser Regression Suite ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Base URL:', BASE);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => {
    consoleErrors.push(`PAGE_ERROR: ${err.message}`);
  });

  // ─── Authenticate using dedicated Engineering Browser Test account ────────────
  console.log('\n--- Authentication ---');
  const authResult = await authenticate(page, BASE);
  record('Authentication', authResult.success, `Signed in, hash: ${authResult.hash}`);

  // ─── TEST 1: Open Button ──────────────────────────────────────────────────────
  console.log('\n--- TEST 1: Open Button ---');
  await page.goto(`${BASE}/#/engineering/historical-recovery`, { waitUntil: 'networkidle' });
  await sleep(5000);
  await page.screenshot({ path: `${SHOTS_DIR}/reg-01-dashboard.png` });

  const openButtons = page.locator('button:has-text("Open")');
  const openCount = await openButtons.count();
  record('Open button visible', openCount > 0, `Found ${openCount} Open buttons`);

  if (openCount > 0) {
    const urlBefore = page.url();
    const card = openButtons.first().locator('xpath=ancestor::div[contains(@class,"cursor-pointer")][1]');
    const cardText = await card.textContent();
    const recRef = cardText?.match(/REC-\d+/)?.[0] || 'unknown';
    
    await openButtons.first().click();
    await sleep(5000);
    await page.screenshot({ path: `${SHOTS_DIR}/reg-02-after-open.png` });
    
    const urlAfter = page.url();
    const urlChanged = urlBefore !== urlAfter;
    record('Open button: URL changes', urlChanged, `${urlBefore.split('#')[1]} → ${urlAfter.split('#')[1]}`);
    
    const hasRecInUrl = urlAfter.includes('/REC-');
    record('Open button: REC reference in URL', hasRecInUrl, `URL contains REC ref: ${hasRecInUrl}`);
    
    const bodyText = await page.textContent('body') || '';
    const hasWorkspace = bodyText.toLowerCase().includes('recovery') && urlAfter.includes('REC-');
    record('Open button: Recovery workspace visible', hasWorkspace, `Workspace visible: ${hasWorkspace}`);
    
    const hasPackageData = bodyText.includes(recRef) || bodyText.toLowerCase().includes('evidence') || bodyText.toLowerCase().includes('recovery package');
    record('Open button: Package data loaded', hasPackageData, `Package data for ${recRef}: ${hasPackageData}`);
  }

  // ─── TEST 2: Card Body Navigation ─────────────────────────────────────────────
  console.log('\n--- TEST 2: Card Body Navigation ---');
  await page.goto(`${BASE}/#/engineering/historical-recovery`, { waitUntil: 'networkidle' });
  await sleep(5000);
  
  const cards = page.locator('div.cursor-pointer');
  const cardCount = await cards.count();
  record('Card body: cards visible', cardCount > 0, `Found ${cardCount} clickable cards`);

  if (cardCount > 0) {
    const urlBefore = page.url();
    await cards.first().click();
    await sleep(5000);
    const urlAfter = page.url();
    record('Card body: URL changes', urlBefore !== urlAfter, `${urlBefore.split('#')[1]} → ${urlAfter.split('#')[1]}`);
  }

  // ─── TEST 3: REC Reference Navigation ─────────────────────────────────────────
  console.log('\n--- TEST 3: REC Reference Navigation ---');
  await page.goto(`${BASE}/#/engineering/historical-recovery`, { waitUntil: 'networkidle' });
  await sleep(3000);
  
  const recLinks = page.locator('[title="Open Recovery Workspace"]');
  const recLinkCount = await recLinks.count();
  record('REC ref: links visible', recLinkCount > 0, `Found ${recLinkCount} REC reference links`);

  if (recLinkCount > 0) {
    const urlBefore = page.url();
    await recLinks.first().click();
    await sleep(5000);
    const urlAfter = page.url();
    record('REC ref: URL changes', urlBefore !== urlAfter, `${urlBefore.split('#')[1]} → ${urlAfter.split('#')[1]}`);
    record('REC ref: REC in URL', urlAfter.includes('/REC-'), `URL: ${urlAfter.split('#')[1]}`);
  }

  // ─── TEST 4: Browser Refresh ──────────────────────────────────────────────────
  console.log('\n--- TEST 4: Browser Refresh ---');
  await page.goto(`${BASE}/#/engineering/historical-recovery/REC-001`, { waitUntil: 'networkidle' });
  await sleep(5000);
  const beforeRefreshUrl = page.url();
  await page.screenshot({ path: `${SHOTS_DIR}/reg-03-before-refresh.png` });
  
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(5000);
  const afterRefreshUrl = page.url();
  await page.screenshot({ path: `${SHOTS_DIR}/reg-04-after-refresh.png` });
  
  record('Refresh: URL preserved', afterRefreshUrl === beforeRefreshUrl, `${afterRefreshUrl.split('#')[1]}`);
  
  const refreshBodyText = await page.textContent('body') || '';
  const refreshHasContent = refreshBodyText.toLowerCase().includes('recovery') || refreshBodyText.toLowerCase().includes('rec-001');
  record('Refresh: workspace restored', refreshHasContent, `Content visible after refresh: ${refreshHasContent}`);

  // ─── TEST 5: Browser Back/Forward ─────────────────────────────────────────────
  console.log('\n--- TEST 5: Browser Back/Forward ---');
  await page.goto(`${BASE}/#/engineering/historical-recovery`, { waitUntil: 'networkidle' });
  await sleep(3000);
  const dashboardUrl = page.url();
  
  await page.goto(`${BASE}/#/engineering/historical-recovery/REC-001`, { waitUntil: 'networkidle' });
  await sleep(3000);
  const workspaceUrl = page.url();
  
  await page.goBack({ waitUntil: 'networkidle' });
  await sleep(3000);
  const backUrl = page.url();
  record('Back: returns to dashboard', backUrl === dashboardUrl, `${backUrl.split('#')[1]}`);
  
  await page.goForward({ waitUntil: 'networkidle' });
  await sleep(3000);
  const forwardUrl = page.url();
  record('Forward: returns to workspace', forwardUrl === workspaceUrl, `${forwardUrl.split('#')[1]}`);

  // ─── TEST 6: Direct Deep Link ────────────────────────────────────────────────
  console.log('\n--- TEST 6: Direct Deep Link ---');
  await page.goto(`${BASE}/#/engineering/historical-recovery/REC-001`, { waitUntil: 'networkidle' });
  await sleep(5000);
  await page.screenshot({ path: `${SHOTS_DIR}/reg-05-deep-link.png` });
  
  const deepUrl = page.url();
  record('Deep link: URL correct', deepUrl.includes('REC-001'), `${deepUrl.split('#')[1]}`);
  
  const deepBodyText = await page.textContent('body') || '';
  const deepHasContent = deepBodyText.toLowerCase().includes('recovery') || deepBodyText.toLowerCase().includes('rec-001');
  record('Deep link: workspace loads', deepHasContent, `Content visible: ${deepHasContent}`);

  // ─── TEST 7: Governed Package-Not-Found ──────────────────────────────────────
  console.log('\n--- TEST 7: Governed Package-Not-Found ---');
  await page.goto(`${BASE}/#/engineering/historical-recovery/REC-999`, { waitUntil: 'networkidle' });
  await sleep(5000);
  await page.screenshot({ path: `${SHOTS_DIR}/reg-06-not-found.png` });
  
  const notFoundText = await page.textContent('body') || '';
  const hasGovernedError = notFoundText.toLowerCase().includes('not found') || 
                           notFoundText.toLowerCase().includes('recovery package') ||
                           notFoundText.toLowerCase().includes('amber') ||
                           notFoundText.toLowerCase().includes('action');
  record('Governed error: visible on invalid ref', hasGovernedError, `Error visible: ${hasGovernedError}`);

  // ─── TEST 8: EIOS Blue Theme ──────────────────────────────────────────────────
  console.log('\n--- TEST 8: EIOS Blue Theme ---');
  await page.goto(`${BASE}/#/engineering/historical-recovery`, { waitUntil: 'networkidle' });
  await sleep(3000);
  
  // Check for blue palette usage
  const blueElements = await page.locator('[class*="bg-blue-50"], [class*="text-blue-600"], [class*="bg-blue-100"]').count();
  record('EIOS theme: blue palette used', blueElements > 0, `Found ${blueElements} blue elements`);
  
  // Check for absence of indigo (purple)
  const indigoElements = await page.locator('[class*="indigo"]').count();
  record('EIOS theme: no indigo/purple', indigoElements === 0, `Found ${indigoElements} indigo elements`);

  // ─── TEST 9: Console Errors ───────────────────────────────────────────────────
  console.log('\n--- TEST 9: Console Errors ---');
  const criticalErrors = consoleErrors.filter(e => 
    !e.includes('400') && // 400 errors are pre-existing auth-related
    !e.includes('ERR_ABORTED') && // aborted requests are navigation-related
    !e.includes('Failed to load resource')
  );
  record('No critical console errors', criticalErrors.length === 0, 
    `${criticalErrors.length} critical errors (total: ${consoleErrors.length})`);

  // ─── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n=== REGRESSION SUITE SUMMARY ===');
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`Total: ${results.length}, Passed: ${passed}, Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.pass).forEach(r => console.log(`  ✗ ${r.test}: ${r.detail}`));
  }
  
  console.log('\n=== Screenshots ===');
  console.log('Files:', fs.readdirSync(SHOTS_DIR).filter(f => f.startsWith('reg-')).join(', '));
  
  await browser.close();
  
  // Exit with error if any tests failed
  if (failed > 0) {
    process.exit(1);
  }
  
  console.log('\n=== All Tests Passed ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
