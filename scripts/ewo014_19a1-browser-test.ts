import { chromium } from 'playwright';
import fs from 'fs';
import { authenticate } from './browser-test-auth';

const BASE = 'http://localhost:4173';
const SHOTS_DIR = '/tmp/ewo014_19a1-screenshots';
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const consoleLogs: { type: string; text: string }[] = [];
const networkErrors: { url: string; failure: string }[] = [];
const networkRequests: { method: string; url: string; status: number }[] = [];

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== EWO-014.19A.1 Real Browser Workflow Test ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Base URL:', BASE);
  console.log('Test Account: Engineering Browser Test (dedicated non-human account)');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => consoleLogs.push({ type: msg.type(), text: msg.text() }));
  page.on('requestfailed', req => networkErrors.push({ url: req.url(), failure: req.failure()?.errorText || 'unknown' }));
  page.on('response', resp => {
    const req = resp.request();
    if (req.url().includes('supabase') || req.url().includes('functions/v1')) {
      networkRequests.push({ method: req.method(), url: req.url(), status: resp.status() });
    }
  });

  // ─── Step 1: Authenticate using dedicated Engineering Browser Test account ────
  console.log('\n--- Step 1: Authenticate ---');
  const authResult = await authenticate(page, BASE);
  await page.screenshot({ path: `${SHOTS_DIR}/01-after-auth.png` });
  console.log('Auth result:', JSON.stringify(authResult));
  let currentHash = authResult.hash;

  // Check if we need OTP
  const otpVisible = await page.locator('h2:has-text("Verify")').isVisible({ timeout: 2000 }).catch(() => false);
  console.log('OTP view visible:', otpVisible);

  if (otpVisible) {
    // otp_disabled should skip OTP, but if it still shows, handle it
    const sendBtn = page.locator('button:has-text("Send")');
    if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sendBtn.click();
      await sleep(3000);
      await page.screenshot({ path: `${SHOTS_DIR}/04-otp-sent.png` });
      const bodyText = await page.textContent('body') || '';
      const devCodeMatch = bodyText.match(/dev code.*?(\d{6})/i) || bodyText.match(/\b(\d{6})\b/);
      const devCode = devCodeMatch ? devCodeMatch[1] : null;
      console.log('Dev code:', devCode);
      if (devCode) {
        const otpInputs = page.locator('input[maxlength="1"]');
        const count = await otpInputs.count();
        if (count >= 6) {
          for (let i = 0; i < 6; i++) await otpInputs.nth(i).fill(devCode[i]);
          await page.locator('button:has-text("Verify")').click();
          await sleep(4000);
          await page.screenshot({ path: `${SHOTS_DIR}/05-after-verify.png` });
          currentHash = page.url().split('#')[1] || '';
          console.log('After verify, hash:', currentHash);
        }
      }
    }
  }

  // ─── Step 3: Navigate to Historical Recovery ────────────────────────────────
  console.log('\n--- Step 3: Navigate to Historical Recovery ---');
  await page.goto(`${BASE}/#/engineering/historical-recovery`, { waitUntil: 'networkidle' });
  await sleep(5000);
  await page.screenshot({ path: `${SHOTS_DIR}/06-recovery-dashboard.png` });
  currentHash = page.url().split('#')[1] || '';
  console.log('Recovery hash:', currentHash);

  const bodyText = await page.textContent('body') || '';
  console.log('Has "recovery" text:', bodyText.toLowerCase().includes('recovery'));
  console.log('Has "historical" text:', bodyText.toLowerCase().includes('historical'));
  console.log('Page text (first 300):', bodyText.substring(0, 300));

  // Check if redirected to login
  if (currentHash.includes('login')) {
    console.log('REDIRECTED TO LOGIN - auth failed');
    const lsContent = await page.evaluate(() => {
      const items: Record<string,string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        items[key] = (localStorage.getItem(key) || '').substring(0, 80);
      }
      return items;
    });
    console.log('localStorage keys:', Object.keys(lsContent).join(', '));
    
    // Check network requests for auth errors
    const authReqs = networkRequests.filter(r => r.url.includes('auth'));
    console.log('Auth requests:');
    authReqs.forEach(r => console.log(`  ${r.method} ${r.status} ${r.url.substring(0, 120)}`));
  }

  // ─── Step 4: Find and click Open ─────────────────────────────────────────────
  console.log('\n--- Step 4: Find and click Open ---');
  const openButtons = page.locator('button:has-text("Open"), [title="Open Recovery Workspace"]');
  const openCount = await openButtons.count();
  console.log(`Found ${openCount} Open button(s)`);

  if (openCount === 0) {
    const allButtons = page.locator('button');
    const btnCount = Math.min(await allButtons.count(), 30);
    console.log(`All buttons (${btnCount}):`);
    for (let i = 0; i < btnCount; i++) {
      const txt = (await allButtons.nth(i).textContent())?.trim();
      if (txt) console.log(`  [${i}] "${txt}"`);
    }
  }

  if (openCount > 0) {
    const urlBefore = page.url();
    console.log('URL before click:', urlBefore);
    
    const firstBtn = openButtons.first();
    const card = firstBtn.locator('xpath=ancestor::div[contains(@class,"border") or contains(@class,"rounded")][1]');
    const cardText = await card.textContent().catch(() => '');
    console.log('Card text (first 200):', cardText?.substring(0, 200));

    await firstBtn.click();
    await sleep(5000);
    const urlAfter = page.url();
    console.log('URL after click:', urlAfter);
    await page.screenshot({ path: `${SHOTS_DIR}/07-after-open-click.png` });

    if (urlBefore !== urlAfter) {
      console.log('✓ URL CHANGED');
    } else {
      console.log('✗ URL DID NOT CHANGE');
    }

    const afterText = await page.textContent('body') || '';
    console.log('After click (first 300):', afterText.substring(0, 300));
    
    const hasWorkspace = afterText.toLowerCase().includes('recovery workspace') ||
                         afterText.toLowerCase().includes('recovery package') ||
                         urlAfter.includes('REC-');
    console.log('Recovery workspace visible:', hasWorkspace);
  }

  // ─── Step 5: Deep link ───────────────────────────────────────────────────────
  console.log('\n--- Step 5: Deep link REC-001 ---');
  await page.goto(`${BASE}/#/engineering/historical-recovery/REC-001`, { waitUntil: 'networkidle' });
  await sleep(5000);
  await page.screenshot({ path: `${SHOTS_DIR}/08-deep-link-rec001.png` });
  console.log('Deep link hash:', page.url().split('#')[1] || '');
  const deepText = await page.textContent('body') || '';
  console.log('Deep link text (first 300):', deepText.substring(0, 300));

  // ─── Step 6: Console/Network ────────────────────────────────────────────────
  console.log('\n--- Step 6: Console/Network ---');
  const errors = consoleLogs.filter(l => l.type === 'error');
  console.log(`Console: ${consoleLogs.length} total, ${errors.length} errors`);
  errors.slice(0, 10).forEach((l, i) => console.log(`  [${i}] ${l.text.substring(0, 200)}`));
  console.log(`Network errors: ${networkErrors.length}`);
  networkErrors.slice(0, 5).forEach((e) => console.log(`  ${e.url.substring(0, 100)} - ${e.failure}`));
  console.log(`Supabase requests: ${networkRequests.length}`);
  networkRequests.forEach(r => console.log(`  ${r.method} ${r.status} ${r.url.substring(0, 120)}`));

  console.log('\n=== Screenshots ===');
  console.log('Files:', fs.readdirSync(SHOTS_DIR).join(', '));
  await browser.close();
  console.log('\n=== Test Complete ===');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
