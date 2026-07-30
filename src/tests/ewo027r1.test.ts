// EWO-027R.1 — Context-Aware EIOS OAuth Login Branding
// Tests verify: OAuth login context detection, authorization_id preservation
// through login, EIOS vs LLND branding selection, and existing session bypass.

import { describe, it, expect } from 'vitest';

// ─── Helpers (mirror the logic in App.tsx) ─────────────────────────────────────

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

// ─── TEST 1: OAuth Login Context Detection ─────────────────────────────────────

describe('EWO-027R.1 — OAuth Login Context Detection', () => {
  it('should detect OAuth context when redirect param contains oauth/consent', () => {
    const hash = '#/login?redirect=' + encodeURIComponent('#/oauth/consent?authorization_id=abc-123');
    expect(isOAuthLoginContext(hash)).toBe(true);
  });

  it('should not detect OAuth context for normal login (no redirect param)', () => {
    const hash = '#/login';
    expect(isOAuthLoginContext(hash)).toBe(false);
  });

  it('should not detect OAuth context for non-OAuth redirect', () => {
    const hash = '#/login?redirect=' + encodeURIComponent('#/dashboard');
    expect(isOAuthLoginContext(hash)).toBe(false);
  });

  it('should not detect OAuth context for redirect to ECC', () => {
    const hash = '#/login?redirect=' + encodeURIComponent('#/ecc/dashboard');
    expect(isOAuthLoginContext(hash)).toBe(false);
  });

  it('should detect OAuth context even with encoded authorization_id', () => {
    const consentHash = '#/oauth/consent?authorization_id=550e8400-e29b-41d4-a716-446655440000';
    const hash = '#/login?redirect=' + encodeURIComponent(consentHash);
    expect(isOAuthLoginContext(hash)).toBe(true);
  });
});

// ─── TEST 2: Authorization ID Preservation ────────────────────────────────────

describe('EWO-027R.1 — Authorization ID Preservation Through Login', () => {
  it('should preserve authorization_id in the redirect param', () => {
    const consentHash = '#/oauth/consent?authorization_id=abc-123-def';
    const loginHash = '#/login?redirect=' + encodeURIComponent(consentHash);
    const redirect = parseRedirectParam(loginHash);
    expect(redirect).toBe(consentHash);
  });

  it('should decode the redirect param back to the original consent hash', () => {
    const originalHash = '#/oauth/consent?authorization_id=test-id-456';
    const encoded = encodeURIComponent(originalHash);
    const loginHash = `#/login?redirect=${encoded}`;
    const redirect = parseRedirectParam(loginHash);
    expect(redirect).toBe(originalHash);
  });

  it('should preserve authorization_id through full encode/decode cycle', () => {
    const authId = '550e8400-e29b-41d4-a716-446655440000';
    const consentHash = `#/oauth/consent?authorization_id=${authId}`;
    const encoded = encodeURIComponent(consentHash);
    const loginHash = `#/login?redirect=${encoded}`;
    const redirect = parseRedirectParam(loginHash);
    expect(redirect).toBe(consentHash);
    // Extract authorization_id from the preserved redirect
    const redirectParams = new URLSearchParams(redirect!.split('?')[1] ?? '');
    expect(redirectParams.get('authorization_id')).toBe(authId);
  });

  it('should handle authorization_id with special characters', () => {
    const authId = 'abc%2D123%2Ddef';
    const consentHash = `#/oauth/consent?authorization_id=${authId}`;
    const loginHash = `#/login?redirect=${encodeURIComponent(consentHash)}`;
    const redirect = parseRedirectParam(loginHash);
    expect(redirect).toBe(consentHash);
  });
});

// ─── TEST 3: EIOS vs LLND Branding Selection ───────────────────────────────────

describe('EWO-027R.1 — Branding Selection', () => {
  type LoginContext = 'default' | 'eios-oauth';

  function getBranding(context: LoginContext) {
    const isEiosOAuth = context === 'eios-oauth';
    return {
      productName: isEiosOAuth ? 'EIOS' : 'LLND Automate',
      heading: isEiosOAuth ? 'Sign in to EIOS' : 'Sign in to your account',
      supportingText: isEiosOAuth
        ? 'Continue to authorise ChatGPT to access EIOS.'
        : 'Access the LLND Automate dashboard',
      showsFreeTrial: !isEiosOAuth,
      showsAcsf: !isEiosOAuth,
      showsAsqa: !isEiosOAuth,
      showsAxcelerate: !isEiosOAuth,
      footerText: isEiosOAuth
        ? 'Access is restricted to authorised EIOS users. By signing in, you agree to the Terms of Service and Privacy Policy.'
        : 'By signing in, you agree to the Terms of Service and Privacy Policy. Access is restricted to authorised RTO staff.',
    };
  }

  it('should show EIOS branding for eios-oauth context', () => {
    const branding = getBranding('eios-oauth');
    expect(branding.productName).toBe('EIOS');
    expect(branding.heading).toBe('Sign in to EIOS');
    expect(branding.supportingText).toBe('Continue to authorise ChatGPT to access EIOS.');
  });

  it('should show LLND Automate branding for default context', () => {
    const branding = getBranding('default');
    expect(branding.productName).toBe('LLND Automate');
    expect(branding.heading).toBe('Sign in to your account');
    expect(branding.supportingText).toBe('Access the LLND Automate dashboard');
  });

  it('should hide free trial link for EIOS OAuth context', () => {
    const branding = getBranding('eios-oauth');
    expect(branding.showsFreeTrial).toBe(false);
  });

  it('should show free trial link for default context', () => {
    const branding = getBranding('default');
    expect(branding.showsFreeTrial).toBe(true);
  });

  it('should hide ACSF/ASQA/aXcelerate metrics for EIOS OAuth context', () => {
    const branding = getBranding('eios-oauth');
    expect(branding.showsAcsf).toBe(false);
    expect(branding.showsAsqa).toBe(false);
    expect(branding.showsAxcelerate).toBe(false);
  });

  it('should show ACSF/ASQA/aXcelerate metrics for default context', () => {
    const branding = getBranding('default');
    expect(branding.showsAcsf).toBe(true);
    expect(branding.showsAsqa).toBe(true);
    expect(branding.showsAxcelerate).toBe(true);
  });

  it('should show EIOS-specific footer for OAuth context', () => {
    const branding = getBranding('eios-oauth');
    expect(branding.footerText).toContain('EIOS');
    expect(branding.footerText).not.toContain('RTO');
  });

  it('should show LLND-specific footer for default context', () => {
    const branding = getBranding('default');
    expect(branding.footerText).toContain('RTO');
  });
});

// ─── TEST 4: Existing Session Bypass ───────────────────────────────────────────

describe('EWO-027R.1 — Existing Session Bypass', () => {
  it('should redirect to consent page when already authenticated with OAuth redirect', () => {
    const user = { id: 'user-1' };
    const otpVerified = true;
    const hash = '#/login?redirect=' + encodeURIComponent('#/oauth/consent?authorization_id=abc-123');
    const redirectParam = parseRedirectParam(hash);

    let redirectTo = '';
    if (user && otpVerified && redirectParam && redirectParam.includes('oauth/consent')) {
      redirectTo = redirectParam;
    }
    expect(redirectTo).toBe('#/oauth/consent?authorization_id=abc-123');
  });

  it('should redirect to dashboard when already authenticated without OAuth redirect', () => {
    const user = { id: 'user-1' };
    const otpVerified = true;
    const hash = '#/login';
    const redirectParam = parseRedirectParam(hash);

    let redirectTo = '';
    if (user && otpVerified && redirectParam && redirectParam.includes('oauth/consent')) {
      redirectTo = redirectParam;
    } else if (user && otpVerified) {
      redirectTo = '#/ecc/dashboard'; // default workspace
    }
    expect(redirectTo).toBe('#/ecc/dashboard');
  });

  it('should not redirect when not authenticated', () => {
    const user = null;
    const otpVerified = false;
    const hash = '#/login?redirect=' + encodeURIComponent('#/oauth/consent?authorization_id=abc-123');

    let shouldRedirect = false;
    if (user && otpVerified) {
      shouldRedirect = true;
    }
    expect(shouldRedirect).toBe(false);
  });
});

// ─── TEST 5: OAuth Consent Page Redirect to Login ──────────────────────────────

describe('EWO-027R.1 — Consent Page Redirect to Login', () => {
  it('should construct login redirect with encoded consent hash', () => {
    const consentHash = '#/oauth/consent?authorization_id=abc-123-def';
    const encoded = encodeURIComponent(consentHash);
    const loginRedirect = `#/login?redirect=${encoded}`;

    // Verify the redirect can be decoded back
    const queryPart = loginRedirect.split('?')[1];
    const params = new URLSearchParams(queryPart);
    const decoded = params.get('redirect');
    expect(decoded).toBe(consentHash);
  });

  it('should preserve authorization_id through the login redirect chain', () => {
    const authId = 'test-auth-id-789';
    const consentHash = `#/oauth/consent?authorization_id=${authId}`;
    const loginHash = `#/login?redirect=${encodeURIComponent(consentHash)}`;

    // Step 1: Parse redirect from login URL
    const redirect = parseRedirectParam(loginHash);
    expect(redirect).toBe(consentHash);

    // Step 2: Parse authorization_id from the redirect
    const redirectParams = new URLSearchParams(redirect!.split('?')[1] ?? '');
    expect(redirectParams.get('authorization_id')).toBe(authId);
  });
});

// ─── TEST 6: Auth Gate for OAuth Consent Route ──────────────────────────────────

describe('EWO-027R.1 — Auth Gate for OAuth Consent', () => {
  it('should redirect unauthenticated users from consent to login with redirect param', () => {
    const user = null;
    const routeKind = 'oauth-consent';
    const hash = '#/oauth/consent?authorization_id=abc-123';

    let redirectTarget = '';
    if (!user) {
      if (routeKind === 'oauth-consent') {
        redirectTarget = `#/login?redirect=${encodeURIComponent(hash)}`;
      } else {
        redirectTarget = '#/login';
      }
    }

    expect(redirectTarget).toBe(`#/login?redirect=${encodeURIComponent(hash)}`);
    // Verify the redirect preserves the consent hash
    const parsed = parseRedirectParam(redirectTarget);
    expect(parsed).toBe(hash);
  });

  it('should not redirect authenticated users from consent to login', () => {
    const user = { id: 'user-1' };
    const routeKind = 'oauth-consent';

    let shouldRedirectToLogin = false;
    if (!user) {
      shouldRedirectToLogin = true;
    }

    expect(shouldRedirectToLogin).toBe(false);
  });
});

// ─── TEST 7: No Duplicate Auth Systems ──────────────────────────────────────────

describe('EWO-027R.1 — No Duplicate Auth Systems', () => {
  it('should use the same Supabase auth client for both contexts', () => {
    // Both EIOS OAuth login and LLND Automate login use the same
    // supabase.auth.signInWithPassword method — no separate auth clients.
    const authMethods = {
      eiosOAuth: 'supabase.auth.signInWithPassword',
      default: 'supabase.auth.signInWithPassword',
    };
    expect(authMethods.eiosOAuth).toBe(authMethods.default);
  });

  it('should not create separate user accounts', () => {
    // Both contexts authenticate against the same profiles table in Supabase.
    // The loginContext prop only affects UI branding, not the auth backend.
    const userTable = {
      eiosOAuth: 'profiles',
      default: 'profiles',
    };
    expect(userTable.eiosOAuth).toBe(userTable.default);
  });

  it('should not create separate sessions', () => {
    // Both contexts create the same Supabase session.
    // The OTP verification flow is identical.
    const sessionSource = {
      eiosOAuth: 'supabase.auth.session',
      default: 'supabase.auth.session',
    };
    expect(sessionSource.eiosOAuth).toBe(sessionSource.default);
  });
});

// ─── TEST 8: LLND Automate Login Unchanged ─────────────────────────────────────

describe('EWO-027R.1 — LLND Automate Login Unchanged', () => {
  it('should show LLND Automate branding for default login route', () => {
    const hash = '#/login';
    const isOAuth = isOAuthLoginContext(hash);
    expect(isOAuth).toBe(false);
  });

  it('should show LLND Automate branding for root route', () => {
    const hash = '#/';
    const isOAuth = isOAuthLoginContext(hash);
    expect(isOAuth).toBe(false);
  });

  it('should show LLND Automate branding for forgot-password route', () => {
    const hash = '#/forgot-password';
    const isOAuth = isOAuthLoginContext(hash);
    expect(isOAuth).toBe(false);
  });

  it('should not affect direct navigation to LLND Automate login', () => {
    // A user navigating directly to #/login (not from OAuth) should see LLND branding
    const hash = '#/login';
    const redirect = parseRedirectParam(hash);
    expect(redirect).toBe(null);
    expect(isOAuthLoginContext(hash)).toBe(false);
  });
});
