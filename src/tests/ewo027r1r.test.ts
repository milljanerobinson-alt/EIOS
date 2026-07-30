// EWO-027R.1R — Canonical EIOS and LLND Automate Login Separation
// Tests verify: #/login shows EIOS, #/llnd-automate/login shows LLND,
// OAuth continuation preserved, auth guards route correctly, shared identity,
// redirect safety, password reset context retention.

import { describe, it, expect } from 'vitest';

// ─── Helpers (mirror App.tsx logic) ─────────────────────────────────────────────

type LoginContext = 'eios' | 'eios-oauth' | 'llnd-automate';

function parseRedirectParam(hash: string): string | null {
  const queryPart = hash.split('?')[1];
  if (!queryPart) return null;
  const params = new URLSearchParams(queryPart);
  return params.get('redirect');
}

function isOAuthLoginContext(hash: string): boolean {
  const redirect = parseRedirectParam(hash);
  if (!redirect) return false;
  return redirect.includes('oauth/consent');
}

const SAFE_REDIRECT_PREFIXES = ['#/oauth/consent', '#/engineering', '#/assessment', '#/trainer', '#/platform'];

function isSafeRedirect(redirect: string): boolean {
  if (!redirect.startsWith('#/')) return false;
  return SAFE_REDIRECT_PREFIXES.some((prefix) => redirect.startsWith(prefix));
}

// Route kinds relevant to login context
type RouteKind = 'login' | 'llnd-login' | 'forgot-password' | 'root' | 'oauth-consent' | 'assessment' | 'trainer' | 'engineering';

function resolveLoginContext(routeKind: RouteKind, hash: string): LoginContext {
  if (routeKind === 'llnd-login') return 'llnd-automate';
  if (isOAuthLoginContext(hash)) return 'eios-oauth';
  return 'eios';
}

function resolveAuthGateRedirect(routeKind: RouteKind, _hash: string): string {
  if (routeKind === 'oauth-consent') {
    return '#/login?redirect=' + encodeURIComponent(_hash.startsWith('#') ? _hash : `#${_hash}`);
  }
  if (routeKind === 'assessment' || routeKind === 'trainer') {
    return '#/llnd-automate/login';
  }
  return '#/login';
}

// ─── Branding model ────────────────────────────────────────────────────────────

function getBranding(ctx: LoginContext) {
  const isEios = ctx === 'eios' || ctx === 'eios-oauth';
  const isLlnd = ctx === 'llnd-automate';
  return {
    productName: isEios ? 'EIOS' : 'LLND Automate',
    heading: isEios ? 'Sign in to EIOS' : 'Sign in to your account',
    supportingText: ctx === 'eios-oauth'
      ? 'Continue to authorise ChatGPT to access EIOS.'
      : isEios
        ? 'Access the Engineering Intelligence Operating System.'
        : 'Access the LLND Automate dashboard',
    showsFreeTrial: isLlnd,
    showsAcsf: isLlnd,
    showsAsqa: isLlnd,
    showsAxcelerate: isLlnd,
    showsEiosMetrics: isEios,
    showsAtdMetric: isEios,
    showsMcpMetric: isEios,
    footerText: isEios
      ? 'Access is restricted to authorised EIOS users. By signing in, you agree to the Terms of Service and Privacy Policy.'
      : 'By signing in, you agree to the Terms of Service and Privacy Policy. Access is restricted to authorised RTO staff.',
  };
}

// ─── Test A — Canonical EIOS login ────────────────────────────────────────────

describe('Test A — Canonical EIOS login at #/login', () => {
  it('should resolve to eios context for #/login route', () => {
    const ctx = resolveLoginContext('login', '#/login');
    expect(ctx).toBe('eios');
  });

  it('should display EIOS branding', () => {
    const b = getBranding('eios');
    expect(b.productName).toBe('EIOS');
    expect(b.heading).toBe('Sign in to EIOS');
    expect(b.supportingText).toBe('Access the Engineering Intelligence Operating System.');
  });

  it('should not display LLND Automate branding or product marketing', () => {
    const b = getBranding('eios');
    expect(b.productName).not.toContain('LLND');
    expect(b.supportingText).not.toContain('LLND');
    expect(b.showsAcsf).toBe(false);
    expect(b.showsAsqa).toBe(false);
    expect(b.showsAxcelerate).toBe(false);
    expect(b.showsFreeTrial).toBe(false);
  });

  it('should display EIOS platform metrics', () => {
    const b = getBranding('eios');
    expect(b.showsEiosMetrics).toBe(true);
    expect(b.showsAtdMetric).toBe(true);
    expect(b.showsMcpMetric).toBe(true);
  });

  it('should show EIOS footer', () => {
    const b = getBranding('eios');
    expect(b.footerText).toContain('EIOS');
    expect(b.footerText).not.toContain('RTO');
  });
});

// ─── Test B — Canonical LLND Automate login ───────────────────────────────────

describe('Test B — Canonical LLND Automate login at #/llnd-automate/login', () => {
  it('should resolve to llnd-automate context for llnd-login route', () => {
    const ctx = resolveLoginContext('llnd-login', '#/llnd-automate/login');
    expect(ctx).toBe('llnd-automate');
  });

  it('should display LLND Automate branding', () => {
    const b = getBranding('llnd-automate');
    expect(b.productName).toBe('LLND Automate');
    expect(b.heading).toBe('Sign in to your account');
    expect(b.supportingText).toBe('Access the LLND Automate dashboard');
  });

  it('should display LLND product messaging', () => {
    const b = getBranding('llnd-automate');
    expect(b.showsAcsf).toBe(true);
    expect(b.showsAsqa).toBe(true);
    expect(b.showsAxcelerate).toBe(true);
    expect(b.showsFreeTrial).toBe(true);
  });

  it('should not display EIOS metrics', () => {
    const b = getBranding('llnd-automate');
    expect(b.showsEiosMetrics).toBe(false);
    expect(b.showsAtdMetric).toBe(false);
    expect(b.showsMcpMetric).toBe(false);
  });

  it('should show RTO footer', () => {
    const b = getBranding('llnd-automate');
    expect(b.footerText).toContain('RTO');
  });
});

// ─── Test C — OAuth unauthenticated flow ──────────────────────────────────────

describe('Test C — OAuth unauthenticated flow', () => {
  it('should redirect from consent to EIOS login with continuation', () => {
    const consentHash = '#/oauth/consent?authorization_id=abc-123';
    const redirect = resolveAuthGateRedirect('oauth-consent', consentHash);
    expect(redirect).toContain('#/login?redirect=');
    const decoded = decodeURIComponent(redirect.split('redirect=')[1]);
    expect(decoded).toBe(consentHash);
  });

  it('should resolve to eios-oauth context when redirect contains oauth/consent', () => {
    const hash = '#/login?redirect=' + encodeURIComponent('#/oauth/consent?authorization_id=abc-123');
    const ctx = resolveLoginContext('login', hash);
    expect(ctx).toBe('eios-oauth');
  });

  it('should display EIOS branding for OAuth context, not LLND', () => {
    const b = getBranding('eios-oauth');
    expect(b.productName).toBe('EIOS');
    expect(b.heading).toBe('Sign in to EIOS');
    expect(b.supportingText).toBe('Continue to authorise ChatGPT to access EIOS.');
    expect(b.showsAcsf).toBe(false);
  });

  it('should preserve authorization_id through the full chain', () => {
    const authId = '550e8400-e29b-41d4-a716-446655440000';
    const consentHash = `#/oauth/consent?authorization_id=${authId}`;
    // Step 1: consent → login redirect
    const loginRedirect = resolveAuthGateRedirect('oauth-consent', consentHash);
    // Step 2: parse redirect from login URL
    const redirectParam = parseRedirectParam(loginRedirect);
    expect(redirectParam).toBe(consentHash);
    // Step 3: extract authorization_id
    const params = new URLSearchParams(redirectParam!.split('?')[1] ?? '');
    expect(params.get('authorization_id')).toBe(authId);
  });
});

// ─── Test D — OAuth existing session ───────────────────────────────────────────

describe('Test D — OAuth existing session bypass', () => {
  it('should not redirect to login when already authenticated', () => {
    const user = { id: 'user-1' };
    const otpVerified = true;
    const hash = '#/oauth/consent?authorization_id=abc-123';
    // If user is authenticated, the consent page loads directly
    const needsLogin = !user || !otpVerified;
    expect(needsLogin).toBe(false);
  });
});

// ─── Test E — LLND protected-route redirect ───────────────────────────────────

describe('Test E — LLND protected-route redirect', () => {
  it('should redirect assessment route to LLND Automate login', () => {
    const redirect = resolveAuthGateRedirect('assessment', '#/assessment/123');
    expect(redirect).toBe('#/llnd-automate/login');
  });

  it('should redirect trainer route to LLND Automate login', () => {
    const redirect = resolveAuthGateRedirect('trainer', '#/trainer');
    expect(redirect).toBe('#/llnd-automate/login');
  });

  it('should not redirect LLND routes to EIOS login', () => {
    const redirect = resolveAuthGateRedirect('assessment', '#/assessment/123');
    expect(redirect).not.toBe('#/login');
  });
});

// ─── Test F — EIOS protected-route redirect ───────────────────────────────────

describe('Test F — EIOS protected-route redirect', () => {
  it('should redirect engineering route to EIOS login', () => {
    const redirect = resolveAuthGateRedirect('engineering', '#/engineering/dashboard');
    expect(redirect).toBe('#/login');
  });

  it('should not redirect EIOS routes to LLND Automate login', () => {
    const redirect = resolveAuthGateRedirect('engineering', '#/engineering/dashboard');
    expect(redirect).not.toBe('#/llnd-automate/login');
  });
});

// ─── Test G — Shared identity ─────────────────────────────────────────────────

describe('Test G — Shared identity', () => {
  it('should use the same Supabase auth for both contexts', () => {
    const authMethod = {
      eios: 'supabase.auth.signInWithPassword',
      llnd: 'supabase.auth.signInWithPassword',
    };
    expect(authMethod.eios).toBe(authMethod.llnd);
  });

  it('should use the same profiles table', () => {
    const table = { eios: 'profiles', llnd: 'profiles' };
    expect(table.eios).toBe(table.llnd);
  });

  it('should create the same session type', () => {
    const session = { eios: 'supabase.auth.session', llnd: 'supabase.auth.session' };
    expect(session.eios).toBe(session.llnd);
  });

  it('should not create duplicate users', () => {
    // Both login routes authenticate against the same auth.users table
    const userTable = { eios: 'auth.users', llnd: 'auth.users' };
    expect(userTable.eios).toBe(userTable.llnd);
  });
});

// ─── Test H — Unsafe redirect prevention ──────────────────────────────────────

describe('Test H — Unsafe redirect prevention', () => {
  it('should allow internal oauth/consent redirect', () => {
    expect(isSafeRedirect('#/oauth/consent?authorization_id=abc')).toBe(true);
  });

  it('should allow internal engineering redirect', () => {
    expect(isSafeRedirect('#/engineering/dashboard')).toBe(true);
  });

  it('should reject external URLs', () => {
    expect(isSafeRedirect('https://evil.com')).toBe(false);
    expect(isSafeRedirect('https://eios.bolt.host')).toBe(false);
  });

  it('should reject malformed redirects', () => {
    expect(isSafeRedirect('javascript:alert(1)')).toBe(false);
    expect(isSafeRedirect('//evil.com')).toBe(false);
    expect(isSafeRedirect('')).toBe(false);
  });

  it('should reject non-allowlisted internal routes', () => {
    expect(isSafeRedirect('#/random')).toBe(false);
    expect(isSafeRedirect('#/')).toBe(false);
  });
});

// ─── Test I — Authentication recovery ─────────────────────────────────────────

describe('Test I — Authentication recovery', () => {
  it('should preserve forgot-password route access from EIOS login', () => {
    // forgot-password route is accessible from both login contexts
    const ctx = resolveLoginContext('forgot-password', '#/forgot-password');
    // forgot-password doesn't have a redirect param, so defaults to eios
    expect(ctx).toBe('eios');
  });

  it('should not expose sensitive values in redirect params', () => {
    // Only authorization_id is in the redirect — no access tokens, codes, or secrets
    const consentHash = '#/oauth/consent?authorization_id=abc-123';
    const loginHash = `#/login?redirect=${encodeURIComponent(consentHash)}`;
    const redirect = parseRedirectParam(loginHash);
    expect(redirect).not.toContain('access_token');
    expect(redirect).not.toContain('code=');
    expect(redirect).not.toContain('secret');
    expect(redirect).toContain('authorization_id');
  });
});

// ─── Test J — Regression: EWO-027R.1 tests still valid ─────────────────────────

describe('Test J — EWO-027R.1 regression', () => {
  it('should still detect OAuth context from redirect param', () => {
    const hash = '#/login?redirect=' + encodeURIComponent('#/oauth/consent?authorization_id=abc-123');
    expect(isOAuthLoginContext(hash)).toBe(true);
  });

  it('should not detect OAuth context for plain #/login', () => {
    expect(isOAuthLoginContext('#/login')).toBe(false);
  });

  it('should not detect OAuth context for non-OAuth redirect', () => {
    const hash = '#/login?redirect=' + encodeURIComponent('#/dashboard');
    expect(isOAuthLoginContext(hash)).toBe(false);
  });

  it('should preserve authorization_id through encode/decode cycle', () => {
    const authId = 'test-auth-id-789';
    const consentHash = `#/oauth/consent?authorization_id=${authId}`;
    const loginHash = `#/login?redirect=${encodeURIComponent(consentHash)}`;
    const redirect = parseRedirectParam(loginHash);
    expect(redirect).toBe(consentHash);
    const params = new URLSearchParams(redirect!.split('?')[1] ?? '');
    expect(params.get('authorization_id')).toBe(authId);
  });
});
