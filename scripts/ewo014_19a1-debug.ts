import { chromium } from 'playwright';
import { BROWSER_TEST_EMAIL, BROWSER_TEST_PASSWORD } from './browser-test-auth';

const BASE = 'http://localhost:4173';

async function main() {
  console.log('=== Create Engineering Browser Test Account via Real Signup ===');
  console.log('Timestamp:', new Date().toISOString());

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

  await page.goto(`${BASE}/#/signup`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Step 0: Choose Plan
  console.log('Step 0: Choose Plan');
  await page.locator('button:has-text("Continue with")').click();
  await page.waitForTimeout(1000);

  // Step 1: Organisation
  console.log('Step 1: Organisation');
  await page.fill('input[placeholder*="Gold Coast"]', 'EIOS Engineering Test');
  await page.fill('input[placeholder*="45678"]', '99999');
  await page.locator('select').selectOption('QLD');
  await page.locator('button:has-text("Continue")').click();
  await page.waitForTimeout(2000);

  // Step 2: Create Account
  console.log('Step 2: Create Account');
  await page.fill('input[placeholder*="Jane"]', 'Engineering Browser Test');
  await page.fill('input[type="email"]', BROWSER_TEST_EMAIL);
  await page.fill('input[type="password"]', BROWSER_TEST_PASSWORD);
  await page.locator('button:has-text("Review")').click();
  await page.waitForTimeout(2000);

  // Step 3: Review and confirm
  console.log('Step 3: Review');
  const buttons = page.locator('button');
  const count = await buttons.count();
  console.log(`Buttons (${count}):`);
  for (let i = 0; i < count; i++) {
    const txt = (await buttons.nth(i).textContent())?.trim();
    console.log(`  [${i}] "${txt}"`);
  }
  
  // Look for a "Start" or "Create" or "Confirm" button
  const startBtn = page.locator('button:has-text("Start"), button:has-text("Create"), button:has-text("Confirm"), button:has-text("Submit")');
  if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log('Found confirm button, clicking...');
    await startBtn.first().click();
    await page.waitForTimeout(5000);
  }

  const finalHash = page.url().split('#')[1] || '(none)';
  console.log('Signup complete, hash:', finalHash);

  const bodyText = await page.textContent('body') || '';
  const success = bodyText.includes("all set") || !finalHash.includes('login');
  console.log('Signup success:', success);
  console.log('Body text (first 200):', bodyText.substring(0, 200));

  await browser.close();
  console.log('=== Done ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
