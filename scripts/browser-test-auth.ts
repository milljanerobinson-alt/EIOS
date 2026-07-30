/**
 * Shared authentication helper for Playwright browser tests.
 *
 * Uses the dedicated Engineering Browser Test account — a non-human account
 * created exclusively for automated browser testing. Product Owner accounts
 * are never used by automated tests.
 *
 * See ES-BROWSER-TEST-001 for governance rules.
 */

export const BROWSER_TEST_EMAIL = 'engineering.test@eios.local';
export const BROWSER_TEST_PASSWORD = 'EiosBrowserTest2026!';

export interface AuthResult {
  success: boolean;
  hash: string;
  error?: string;
}

/**
 * Authenticate using the dedicated Engineering Browser Test account.
 * Returns the hash after authentication.
 */
export async function authenticate(page: import('playwright').Page, base: string): Promise<AuthResult> {
  await page.goto(`${base}/#/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.fill('input[type="email"]', BROWSER_TEST_EMAIL);
  await page.fill('input[type="password"]', BROWSER_TEST_PASSWORD);
  await page.locator('button[type="submit"], button:has-text("Sign In")').first().click();
  await page.waitForTimeout(5000);

  const hash = page.url().split('#')[1] || '';
  const success = !hash.includes('login');

  return { success, hash, error: success ? undefined : 'Authentication failed' };
}
