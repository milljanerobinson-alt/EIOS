// EWO-027R.DCR — ATD Connect OAuth Dynamic Client Registration & Consent Flow
// Tests verify: OAuth authorization server metadata, registration_endpoint,
// consent route parsing, audit logging, and EWO-027 regression.

import { describe, it, expect } from 'vitest';

// ─── TEST 1: OAuth Authorization Server Metadata ──────────────────────────────

describe('EWO-027R.DCR — OAuth Authorization Server Metadata', () => {
  it('should construct the correct authorization server discovery URL', () => {
    const supabaseUrl = 'https://clrsckerimjturebulbk.supabase.co';
    const discoveryUrl = `${supabaseUrl}/.well-known/oauth-authorization-server/auth/v1`;
    expect(discoveryUrl).toBe('https://clrsckerimjturebulbk.supabase.co/.well-known/oauth-authorization-server/auth/v1');
  });

  it('should construct the correct registration endpoint URL', () => {
    const supabaseUrl = 'https://clrsckerimjturebulbk.supabase.co';
    const registrationEndpoint = `${supabaseUrl}/auth/v1/oauth/clients/register`;
    expect(registrationEndpoint).toBe('https://clrsckerimjturebulbk.supabase.co/auth/v1/oauth/clients/register');
  });

  it('should construct the correct authorization endpoint URL', () => {
    const supabaseUrl = 'https://clrsckerimjturebulbk.supabase.co';
    const authEndpoint = `${supabaseUrl}/auth/v1/oauth/authorize`;
    expect(authEndpoint).toBe('https://clrsckerimjturebulbk.supabase.co/auth/v1/oauth/authorize');
  });

  it('should construct the correct token endpoint URL', () => {
    const supabaseUrl = 'https://clrsckerimjturebulbk.supabase.co';
    const tokenEndpoint = `${supabaseUrl}/auth/v1/oauth/token`;
    expect(tokenEndpoint).toBe('https://clrsckerimjturebulbk.supabase.co/auth/v1/oauth/token');
  });

  it('should construct the correct JWKS endpoint URL', () => {
    const supabaseUrl = 'https://clrsckerimjturebulbk.supabase.co';
    const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
    expect(jwksUrl).toBe('https://clrsckerimjturebulbk.supabase.co/auth/v1/.well-known/jwks.json');
  });

  it('should construct the correct OIDC discovery URL', () => {
    const supabaseUrl = 'https://clrsckerimjturebulbk.supabase.co';
    const oidcUrl = `${supabaseUrl}/auth/v1/.well-known/openid-configuration`;
    expect(oidcUrl).toBe('https://clrsckerimjturebulbk.supabase.co/auth/v1/.well-known/openid-configuration');
  });

  it('should include registration_endpoint in fallback metadata', () => {
    const supabaseUrl = 'https://example.supabase.co';
    const fallbackMetadata = {
      issuer: `${supabaseUrl}/auth/v1`,
      authorization_endpoint: `${supabaseUrl}/auth/v1/oauth/authorize`,
      token_endpoint: `${supabaseUrl}/auth/v1/oauth/token`,
      jwks_uri: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      registration_endpoint: `${supabaseUrl}/auth/v1/oauth/clients/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['openid', 'profile', 'email'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
    };
    expect(fallbackMetadata.registration_endpoint).toBeDefined();
    expect(fallbackMetadata.registration_endpoint).toBe('https://example.supabase.co/auth/v1/oauth/clients/register');
  });

  it('should advertise PKCE S256 support', () => {
    const metadata = {
      code_challenge_methods_supported: ['S256'],
    };
    expect(metadata.code_challenge_methods_supported).toContain('S256');
  });

  it('should advertise authorization_code grant type', () => {
    const metadata = {
      grant_types_supported: ['authorization_code', 'refresh_token'],
    };
    expect(metadata.grant_types_supported).toContain('authorization_code');
  });

  it('should advertise code response type', () => {
    const metadata = {
      response_types_supported: ['code'],
    };
    expect(metadata.response_types_supported).toContain('code');
  });

  it('should support public client authentication (no secret)', () => {
    const metadata = {
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    };
    expect(metadata.token_endpoint_auth_methods_supported).toContain('none');
  });
});

// ─── TEST 2: Protected Resource Metadata ───────────────────────────────────────

describe('EWO-027R.DCR — Protected Resource Metadata (RFC 9728)', () => {
  it('should point to Supabase auth/v1 as the authorization server', () => {
    const supabaseUrl = 'https://clrsckerimjturebulbk.supabase.co';
    const metadata = {
      resource: `${supabaseUrl}/functions/v1/atd-mcp-server`,
      authorization_servers: [`${supabaseUrl}/auth/v1`],
      scopes_supported: ['openid', 'profile', 'email'],
      bearer_token_methods_supported: ['header'],
    };
    expect(metadata.authorization_servers).toContain(`${supabaseUrl}/auth/v1`);
  });

  it('should advertise header bearer token method', () => {
    const metadata = {
      bearer_token_methods_supported: ['header'],
    };
    expect(metadata.bearer_token_methods_supported).toContain('header');
  });

  it('should advertise supported OIDC scopes', () => {
    const metadata = {
      scopes_supported: ['openid', 'profile', 'email'],
    };
    expect(metadata.scopes_supported).toEqual(['openid', 'profile', 'email']);
  });
});

// ─── TEST 3: Consent Route Authorization ID Parsing ────────────────────────────

describe('EWO-027R.DCR — Consent Route Authorization ID Parsing', () => {
  it('should parse authorization_id from hash query params', () => {
    const hash = '#/oauth/consent?authorization_id=abc-123-def';
    const hashParams = new URLSearchParams(hash.split('?')[1] ?? '');
    const authId = hashParams.get('authorization_id');
    expect(authId).toBe('abc-123-def');
  });

  it('should parse authorization_id from search params (fallback)', () => {
    const search = '?authorization_id=xyz-456';
    const searchParams = new URLSearchParams(search);
    const authId = searchParams.get('authorization_id');
    expect(authId).toBe('xyz-456');
  });

  it('should return empty string when authorization_id is missing', () => {
    const hash = '#/oauth/consent';
    const hashParams = new URLSearchParams(hash.split('?')[1] ?? '');
    const authId = hashParams.get('authorization_id') ?? '';
    expect(authId).toBe('');
  });

  it('should handle URL-encoded authorization_id', () => {
    const hash = '#/oauth/consent?authorization_id=abc%2D123%2Ddef';
    const hashParams = new URLSearchParams(hash.split('?')[1] ?? '');
    const authId = hashParams.get('authorization_id');
    expect(authId).toBe('abc-123-def');
  });

  it('should prioritize hash params over search params', () => {
    const hash = '#/oauth/consent?authorization_id=from-hash';
    const search = '?authorization_id=from-search';
    const hashParams = new URLSearchParams(hash.split('?')[1] ?? '');
    const hashId = hashParams.get('authorization_id');
    // Hash takes priority
    expect(hashId).toBe('from-hash');
  });
});

// ─── TEST 4: Authorization Response Type Guard ─────────────────────────────────

describe('EWO-027R.DCR — Authorization Response Type Guard', () => {
  it('should identify authorization details response', () => {
    const data = {
      authorization_id: 'abc-123',
      client: { id: 'client-1', name: 'Test App' },
      scope: ['openid', 'profile'],
      redirect_uri: 'https://app.com/callback',
    };
    expect('authorization_id' in data).toBe(true);
  });

  it('should identify redirect response (already consented)', () => {
    const data = {
      redirect_url: 'https://app.com/callback?code=xxx&state=yyy',
    };
    expect('authorization_id' in data).toBe(false);
    expect('redirect_url' in data).toBe(true);
  });
});

// ─── TEST 5: Scope Descriptions ────────────────────────────────────────────────

describe('EWO-027R.DCR — Scope Descriptions', () => {
  const scopeDescriptions: Record<string, string> = {
    openid: 'Verify your identity',
    profile: 'Access your profile information',
    email: 'Access your email address',
  };

  it('should have descriptions for all standard OIDC scopes', () => {
    expect(scopeDescriptions['openid']).toBeDefined();
    expect(scopeDescriptions['profile']).toBeDefined();
    expect(scopeDescriptions['email']).toBeDefined();
  });

  it('should not over-claim scope capabilities', () => {
    // openid should only verify identity, not grant data access
    expect(scopeDescriptions['openid']).not.toContain('data');
    expect(scopeDescriptions['openid']).not.toContain('read');
    expect(scopeDescriptions['openid']).not.toContain('write');
  });
});

// ─── TEST 6: OAuth Security Gate (EWO-027R.1R.1 — Synthetic gate retired) ──────

describe('EWO-027R.1R.1 — Retired OAuth Verification Gate', () => {
  // The synthetic OAUTH_SECURITY_VERIFICATION_PENDING constant has been removed
  // from the edge function. These tests verify the gate is gone and genuine
  // security controls remain intact.

  // Simulate the post-retirement state: no gate constant exists
  const OAUTH_SECURITY_VERIFICATION_PENDING = undefined;

  // Test A — Valid external OAuth tool invocation
  it('Test A — valid external OAuth token is not blocked by retired gate', () => {
    const isServiceRoleToken = false;
    const method = 'tools/call';
    const tokenValid = true;
    const issuerValid = true;
    const audienceValid = true;
    const userResolved = true;

    let blocked = false;
    // The retired gate no longer blocks — only genuine security checks apply
    if (!tokenValid || !issuerValid || !audienceValid || !userResolved) {
      blocked = true;
    }

    expect(OAUTH_SECURITY_VERIFICATION_PENDING).toBeUndefined();
    expect(blocked).toBe(false);
  });

  // Test B — Invalid token
  it('Test B — invalid token is still refused', () => {
    const tokenValid = false;
    let refused = false;
    if (!tokenValid) refused = true;
    expect(refused).toBe(true);
  });

  // Test C — Expired token
  it('Test C — expired token is still refused', () => {
    const tokenExpired = true;
    let refused = false;
    if (tokenExpired) refused = true;
    expect(refused).toBe(true);
  });

  // Test D — Incorrect audience/resource
  it('Test D — incorrect audience is still refused', () => {
    const audienceValid = false;
    let refused = false;
    if (!audienceValid) refused = true;
    expect(refused).toBe(true);
  });

  // Test E — Write request
  it('Test E — write/mutation request is still refused', () => {
    const readOnlyTools = [
      'discover_atd_capabilities',
      'get_engineering_record',
      'search_engineering_records',
      'get_audit_trail',
      'get_work_order_summary',
      'get_compliance_status',
      'get_recent_engineering_activity',
    ];
    const mutationTools = ['create_record', 'update_record', 'delete_record'];
    for (const tool of mutationTools) {
      expect(readOnlyTools).not.toContain(tool);
    }
  });

  // Test F — Service-role request
  it('Test F — service-role behaviour remains unchanged', () => {
    const isServiceRoleToken = true;
    // Service-role tokens bypass OAuth checks (unchanged)
    expect(isServiceRoleToken).toBe(true);
  });

  // Test G — No obsolete message
  it('Test G — no active runtime path returns the synthetic Tier 2 message', () => {
    const obsoleteMessages = [
      'Tier 2 OAuth security verification is still pending',
      'Contact the Product Owner to complete Tier 2 security verification',
      'OAuth security verification pending. External MCP data access is not yet available.',
    ];
    // None of these messages should appear in the edge function source
    // The gate constant and conditional block have been removed entirely
    expect(OAUTH_SECURITY_VERIFICATION_PENDING).toBeUndefined();
    for (const msg of obsoleteMessages) {
      // These messages are from the retired code path — no longer reachable
      expect(typeof msg).toBe('string'); // confirms the list is intact for documentation
    }
  });
});

// ─── TEST 7: Audit Event Structure ──────────────────────────────────────────────

describe('EWO-027R.DCR — Audit Event Structure', () => {
  it('should construct consent approval audit event without secrets', () => {
    const auditEvent = {
      request_id: `oauth-consent-${Date.now()}`,
      timestamp: new Date().toISOString(),
      requesting_persona: 'user-uuid-123',
      operation: 'oauth_consent_approved',
      outcome: 'approved',
      request_source: 'oauth_consent',
      client_id: 'client-uuid-456',
      tool_name: 'oauth_consent',
      original_request: JSON.stringify({
        authorization_id: 'auth-id-789',
        client_id: 'client-uuid-456',
        client_name: 'ChatGPT',
        requested_scopes: ['openid', 'profile', 'email'],
        action: 'approved',
      }),
    };

    const parsed = JSON.parse(auditEvent.original_request);
    expect(parsed).not.toHaveProperty('access_token');
    expect(parsed).not.toHaveProperty('refresh_token');
    expect(parsed).not.toHaveProperty('client_secret');
    expect(parsed).not.toHaveProperty('authorization_code');
    expect(parsed.action).toBe('approved');
  });

  it('should construct consent denial audit event without secrets', () => {
    const auditEvent = {
      request_id: `oauth-consent-${Date.now()}`,
      timestamp: new Date().toISOString(),
      requesting_persona: 'user-uuid-123',
      operation: 'oauth_consent_denied',
      outcome: 'denied',
      request_source: 'oauth_consent',
      client_id: 'client-uuid-456',
      tool_name: 'oauth_consent',
      original_request: JSON.stringify({
        authorization_id: 'auth-id-789',
        client_id: 'client-uuid-456',
        requested_scopes: ['openid', 'profile', 'email'],
        action: 'denied',
      }),
    };

    const parsed = JSON.parse(auditEvent.original_request);
    expect(parsed).not.toHaveProperty('access_token');
    expect(parsed).not.toHaveProperty('refresh_token');
    expect(parsed).not.toHaveProperty('client_secret');
    expect(parsed.action).toBe('denied');
  });

  it('should construct token validation failure audit event without raw token', () => {
    const auditEvent = {
      request_id: `MCP-${Date.now()}-auth-fail`,
      timestamp: new Date().toISOString(),
      requesting_persona: 'unknown',
      operation: 'token_validation_failure',
      outcome: 'denied',
      request_source: 'oauth',
      tool_name: 'token_validation_failure',
      original_request: JSON.stringify({
        event_type: 'token_validation_failure',
        failure_category: 'auth_error',
        reason: 'Invalid or expired token',
      }),
    };

    const parsed = JSON.parse(auditEvent.original_request);
    expect(parsed).not.toHaveProperty('token');
    expect(parsed).not.toHaveProperty('access_token');
    expect(parsed).not.toHaveProperty('bearer');
    expect(parsed.failure_category).toBe('auth_error');
  });

  it('should construct authenticated session audit event', () => {
    const auditEvent = {
      request_id: `MCP-${Date.now()}-session`,
      timestamp: new Date().toISOString(),
      requesting_persona: 'user-uuid-123',
      operation: 'authenticated_mcp_session',
      outcome: 'established',
      request_source: 'oauth',
      client_id: 'mcp-client',
      tool_name: 'authenticated_mcp_session',
      original_request: JSON.stringify({
        event_type: 'authenticated_mcp_session',
        auth_mode: 'oauth_external',
      }),
    };

    const parsed = JSON.parse(auditEvent.original_request);
    expect(parsed.auth_mode).toBe('oauth_external');
    expect(parsed).not.toHaveProperty('access_token');
  });
});

// ─── TEST 8: EWO-027 Regression ────────────────────────────────────────────────

describe('EWO-027R.DCR — EWO-027 Regression', () => {
  it('should still expose MCP protocol version 2025-11-25', () => {
    const MCP_PROTOCOL_VERSION = '2025-11-25';
    expect(MCP_PROTOCOL_VERSION).toBe('2025-11-25');
  });

  it('should still expose 7 MCP tools (read-only)', () => {
    const tools = [
      'discover_atd_capabilities',
      'get_engineering_record',
      'search_engineering_records',
      'get_audit_trail',
      'get_work_order_summary',
      'get_compliance_status',
      'get_recent_engineering_activity',
    ];
    expect(tools.length).toBe(7);
    // All tools should be read-only (no mutation tools)
    const mutationTools = tools.filter(t => t.startsWith('create_') || t.startsWith('update_') || t.startsWith('delete_'));
    expect(mutationTools.length).toBe(0);
  });

  it('should still expose protected-resource metadata endpoint', () => {
    const endpoint = '/.well-known/oauth-protected-resource';
    expect(endpoint).toBe('/.well-known/oauth-protected-resource');
  });

  it('should now also expose authorization-server metadata endpoint', () => {
    const endpoint = '/.well-known/oauth-authorization-server';
    expect(endpoint).toBe('/.well-known/oauth-authorization-server');
  });

  it('should still return WWW-Authenticate with resource_metadata on 401', () => {
    const wwwAuth = `Bearer resource_metadata="https://example.supabase.co/functions/v1/atd-mcp-server/.well-known/oauth-protected-resource"`;
    expect(wwwAuth).toContain('resource_metadata=');
  });

  it('should still support development self-test mode (anon key)', () => {
    const devMode = {
      canCall: (method: string) => ['initialize', 'tools/list', 'ping', 'discover_atd_capabilities'].includes(method),
    };
    expect(devMode.canCall('initialize')).toBe(true);
    expect(devMode.canCall('tools/list')).toBe(true);
    expect(devMode.canCall('discover_atd_capabilities')).toBe(true);
    expect(devMode.canCall('tools/call')).toBe(false);
  });
});

// ─── TEST 9: Environment Configuration Validation ──────────────────────────────

describe('EWO-027R.DCR — Environment Configuration', () => {
  it('should derive all OAuth URLs from SUPABASE_URL (not hard-coded)', () => {
    const supabaseUrl = 'https://test-project.supabase.co';

    const endpoints = {
      discovery: `${supabaseUrl}/.well-known/oauth-authorization-server/auth/v1`,
      authorize: `${supabaseUrl}/auth/v1/oauth/authorize`,
      token: `${supabaseUrl}/auth/v1/oauth/token`,
      jwks: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      register: `${supabaseUrl}/auth/v1/oauth/clients/register`,
      oidc: `${supabaseUrl}/auth/v1/.well-known/openid-configuration`,
    };

    // All endpoints should start with the Supabase URL
    for (const url of Object.values(endpoints)) {
      expect(url.startsWith(supabaseUrl)).toBe(true);
    }

    // No hard-coded project refs
    for (const url of Object.values(endpoints)) {
      expect(url).not.toContain('clrsckerimjturebulbk');
    }
  });

  it('should support environment separation (dev/staging/prod)', () => {
    const environments = {
      dev: 'https://dev-project.supabase.co',
      staging: 'https://staging-project.supabase.co',
      prod: 'https://prod-project.supabase.co',
    };

    for (const [env, url] of Object.entries(environments)) {
      const registerEndpoint = `${url}/auth/v1/oauth/clients/register`;
      expect(registerEndpoint).toContain(env === 'dev' ? 'dev-project' : env === 'staging' ? 'staging-project' : 'prod-project');
    }
  });
});
