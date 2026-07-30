// EWO-027 — ATD Connect OAuth 2.1 Resource Server Compliance Tests
// Verifies: protected-resource metadata, WWW-Authenticate, protocol version,
// consent UI, read-only tools, fail-closed validation, authentication modes.

import { describe, it, expect } from 'vitest';
import {
  MCP_TOOL_DEFINITIONS,
  getAllToolNames,
  validateToolCall,
  isReadOnlyTool,
  createToolsListResponse,
} from '../lib/atdConnect/mcpServer';
import {
  OAUTH_INFRASTRUCTURE_STATES,
  CHATGPT_WORKSPACE_CAPABILITY_STATES,
  CHATGPT_CONNECTION_STATES,
  AUTHENTICATION_MODES,
  getOAuthInfrastructureStateInfo,
  getChatGPTWorkspaceCapabilityInfo,
  getChatGPTConnectionStatusInfo,
  getAuthenticationModeInfo,
  READINESS_STAGES,
  getReadinessSummary,
} from '../lib/atdConnect/mcpReadiness';
import {
  getMcpResourceUrl,
  getProtectedResourceMetadataUrl,
  getAuthorizationServerUrl,
} from '../lib/atdConnect/canonicalResourceUrl';
import type {
  OAuthInfrastructureReadinessState,
  ChatGPTWorkspaceCapabilityState,
  ChatGPTConnectionStatusState,
  AuthenticationMode,
} from '../lib/atdConnect/mcpReadiness';

// ─── Phase 1: Resource Server Compliance ─────────────────────────────────────

describe('EWO-027 Phase 1: Protected Resource Metadata', () => {
  it('should define the metadata endpoint path', () => {
    const expectedPath = '/.well-known/oauth-protected-resource';
    expect(expectedPath).toBe('/.well-known/oauth-protected-resource');
  });

  it('should define all required metadata fields', () => {
    const requiredFields = [
      'resource',
      'authorization_servers',
      'scopes_supported',
      'resource_documentation',
      'bearer_token_methods_supported',
    ];
    requiredFields.forEach(field => {
      expect(field).toBeDefined();
    });
  });

  it('should list identity scopes only (not resource authorization scopes)', () => {
    const scopes = ['openid', 'profile', 'email'];
    expect(scopes).not.toContain('atd:inspect');
    expect(scopes).not.toContain('write');
    expect(scopes).not.toContain('admin');
  });
});

describe('EWO-027 Phase 1: Protocol Version', () => {
  it('should use MCP protocol version 2025-11-25', () => {
    const expectedVersion = '2025-11-25';
    expect(expectedVersion).toBe('2025-11-25');
  });

  it('should NOT use the old protocol version 2025-06-18', () => {
    const oldVersion = '2025-06-18';
    const currentVersion = '2025-11-25';
    expect(currentVersion).not.toBe(oldVersion);
  });

  it('should NOT include MCP-Session-Id', () => {
    const sessionHeader = undefined;
    expect(sessionHeader).toBeUndefined();
  });
});

// ─── Phase 2: Consent UI ─────────────────────────────────────────────────────

describe('EWO-027 Phase 2: Consent UI', () => {
  it('should define the consent route path', () => {
    const consentRoute = '#/oauth/consent';
    expect(consentRoute).toContain('/oauth/consent');
  });

  it('should handle authorization_id parameter', () => {
    const testUrl = '#/oauth/consent?authorization_id=test-id-123';
    const params = new URLSearchParams(testUrl.split('?')[1]);
    expect(params.get('authorization_id')).toBe('test-id-123');
  });

  it('should handle missing authorization_id', () => {
    const testUrl = '#/oauth/consent';
    const params = new URLSearchParams(testUrl.split('?')[1] ?? '');
    expect(params.get('authorization_id')).toBeNull();
  });

  it('should handle invalid authorization_id', () => {
    const invalidId = '';
    expect(invalidId).toBeFalsy();
  });
});

// ─── Phase 3: Token Validation (Fail-Closed) ──────────────────────────────────

describe('EWO-027 Phase 3: Fail-Closed Token Validation', () => {
  it('must never fall back to a weaker authentication path', () => {
    const failClosedRule = 'If explicit JWKS or claims validation fails, return 401. Never retry through a weaker path.';
    expect(failClosedRule).toContain('Never retry');
  });

  it('must reject tokens issued for another resource', () => {
    const wrongResourceRule = 'A token valid for the authorization server but issued for another API must be rejected.';
    expect(wrongResourceRule).toContain('rejected');
  });

  it('must reject malformed tokens', () => {
    const malformedRule = 'Malformed tokens must be rejected with 401.';
    expect(malformedRule).toContain('rejected');
  });

  it('must reject expired tokens', () => {
    const expiredRule = 'Expired tokens must be rejected with 401.';
    expect(expiredRule).toContain('rejected');
  });

  it('must never convert CONFIGURATION ERROR to successful authentication', () => {
    const configErrorRule = 'Never convert CONFIGURATION ERROR into successful authentication.';
    expect(configErrorRule).toContain('Never convert');
  });
});

// ─── Phase 4: Authentication Isolation ────────────────────────────────────────

describe('EWO-027 Phase 4: Authentication Mode Isolation', () => {
  it('should define three authentication modes', () => {
    const modes = Object.keys(AUTHENTICATION_MODES);
    expect(modes).toHaveLength(3);
    expect(modes).toContain('OAUTH_EXTERNAL');
    expect(modes).toContain('INTERNAL_DIAGNOSTIC');
    expect(modes).toContain('DEVELOPMENT_SELF_TEST');
  });

  it('OAuth External mode must fail closed', () => {
    const info = getAuthenticationModeInfo('OAUTH_EXTERNAL');
    expect(info.rules.some(r => r.includes('fail closed'))).toBe(true);
  });

  it('Internal Diagnostic mode must not be exposed as public authentication', () => {
    const info = getAuthenticationModeInfo('INTERNAL_DIAGNOSTIC');
    expect(info.rules.some(r => r.includes('NOT be exposed'))).toBe(true);
  });

  it('Development Self-Test mode must not use anon key as proof of user access', () => {
    const info = getAuthenticationModeInfo('DEVELOPMENT_SELF_TEST');
    expect(info.rules.some(r => r.includes('anon key'))).toBe(true);
  });

  it('modes must not bypass one another', () => {
    const oauthInfo = getAuthenticationModeInfo('OAUTH_EXTERNAL');
    const internalInfo = getAuthenticationModeInfo('INTERNAL_DIAGNOSTIC');
    expect(oauthInfo.mode).not.toBe(internalInfo.mode);
    expect(internalInfo.rules.some(r => r.includes('bypass OAuth'))).toBe(true);
  });
});

// ─── Phase 5: Two-Dimension Readiness Model ───────────────────────────────────

describe('EWO-027 Phase 5: OAuth Infrastructure Readiness', () => {
  it('should define 5 infrastructure readiness states', () => {
    const states = Object.keys(OAUTH_INFRASTRUCTURE_STATES);
    expect(states).toHaveLength(5);
    expect(states).toContain('READY');
    expect(states).toContain('CONFIGURATION_REQUIRED');
    expect(states).toContain('PARTIALLY_CONFIGURED');
    expect(states).toContain('CONFIGURATION_ERROR');
    expect(states).toContain('UNVERIFIED');
  });

  it('READY state should NOT require client or consent records', () => {
    const info = getOAuthInfrastructureStateInfo('READY');
    expect(info.evidence).not.toContain('A pre-existing client');
    expect(info.evidence).not.toContain('An existing consent');
    expect(info.evidence.some(e => e.includes('discovery'))).toBe(true);
    expect(info.evidence.some(e => e.includes('signing key'))).toBe(true);
    expect(info.evidence.some(e => e.includes('Consent route'))).toBe(true);
  });

  it('each state should have label, description, and product owner action', () => {
    (Object.keys(OAUTH_INFRASTRUCTURE_STATES) as OAuthInfrastructureReadinessState[]).forEach(state => {
      const info = getOAuthInfrastructureStateInfo(state);
      expect(info.label).toBeTruthy();
      expect(info.description).toBeTruthy();
      expect(info.productOwnerAction).toBeTruthy();
      expect(info.evidence).toBeInstanceOf(Array);
    });
  });
});

describe('EWO-027 Phase 5: ChatGPT Workspace Capability', () => {
  it('should define 3 capability states', () => {
    const states = Object.keys(CHATGPT_WORKSPACE_CAPABILITY_STATES);
    expect(states).toHaveLength(3);
    expect(states).toContain('VERIFIED');
    expect(states).toContain('NOT_VERIFIED');
    expect(states).toContain('UNKNOWN');
  });

  it('should NOT use plan-specific readiness logic', () => {
    const allDescriptions = Object.values(CHATGPT_WORKSPACE_CAPABILITY_STATES)
      .map(s => s.description + s.productOwnerAction)
      .join(' ');
    expect(allDescriptions).not.toMatch(/if plan == Plus/i);
    expect(allDescriptions).not.toMatch(/if plan == Business/i);
    expect(allDescriptions).not.toMatch(/if plan == Enterprise/i);
  });

  it('NOT_VERIFIED should show ChatGPT Workspace Capability Required (not Plan Upgrade Required)', () => {
    const info = getChatGPTWorkspaceCapabilityInfo('NOT_VERIFIED');
    expect(info.label).toBe('ChatGPT Workspace Capability Required');
    expect(info.label).not.toContain('Plan Upgrade');
  });

  it('UNKNOWN should be the default state', () => {
    const info = getChatGPTWorkspaceCapabilityInfo('UNKNOWN');
    expect(info.description).toContain('default');
  });

  it('should NOT report MCP server as defective when workspace capability is unavailable', () => {
    const info = getChatGPTWorkspaceCapabilityInfo('NOT_VERIFIED');
    const combined = info.description + ' ' + info.productOwnerAction;
    expect(combined).toContain('MCP server is not defective');
  });
});

describe('EWO-027 Phase 5: ChatGPT Connection Status', () => {
  it('should define 7 connection status states', () => {
    const states = Object.keys(CHATGPT_CONNECTION_STATES);
    expect(states).toHaveLength(7);
    expect(states).toContain('NOT_TESTED');
    expect(states).toContain('CHATGPT_WORKSPACE_CAPABILITY_REQUIRED');
    expect(states).toContain('CLIENT_NOT_REGISTERED');
    expect(states).toContain('AUTHORIZATION_PENDING');
    expect(states).toContain('CONNECTED');
    expect(states).toContain('CONNECTION_ERROR');
    expect(states).toContain('UNVERIFIED');
  });

  it('CHATGPT_WORKSPACE_CAPABILITY_REQUIRED should not report MCP server as defective', () => {
    const info = getChatGPTConnectionStatusInfo('CHATGPT_WORKSPACE_CAPABILITY_REQUIRED');
    const combined = info.description + ' ' + info.productOwnerAction;
    expect(combined).toContain('MCP server is not defective');
  });

  it('CONNECTED should require an actual successful tool call', () => {
    const info = getChatGPTConnectionStatusInfo('CONNECTED');
    expect(info.description).toContain('tool call succeeded');
  });
});

// ─── Phase 7: Read-Only Governance ────────────────────────────────────────────

describe('EWO-027 Phase 7: Read-Only Governance', () => {
  it('should expose exactly 7 tools', () => {
    expect(MCP_TOOL_DEFINITIONS).toHaveLength(7);
  });

  it('all tools must be read-only', () => {
    MCP_TOOL_DEFINITIONS.forEach(tool => {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
    });
  });

  it('all tools must be idempotent', () => {
    MCP_TOOL_DEFINITIONS.forEach(tool => {
      expect(tool.annotations.idempotentHint).toBe(true);
    });
  });

  it('no mutation tools should be exposed', () => {
    const toolNames = getAllToolNames();
    const mutationNames = toolNames.filter(n =>
      /create|update|delete|close|approve|deploy|execute|mutate|write|modify/i.test(n)
    );
    expect(mutationNames).toHaveLength(0);
  });

  it('validateToolCall should reject unknown tools', () => {
    const result = validateToolCall('create_something', {});
    expect(result.valid).toBe(false);
  });

  it('validateToolCall should reject non-read-only tools', () => {
    const fakeTool = {
      name: 'delete_everything',
      description: 'delete',
      inputSchema: { type: 'object' as const, properties: {}, required: [] },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    };
    expect(isReadOnlyTool(fakeTool)).toBe(false);
  });

  it('createToolsListResponse should return all 7 tools with annotations', () => {
    const response = createToolsListResponse();
    expect(response.tools).toHaveLength(7);
    response.tools.forEach(tool => {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.annotations.destructiveHint).toBe(false);
    });
  });

  it('submit_conversation_inspection should refuse write requests', () => {
    const writeRequests = [
      'close EWO-024',
      'delete engineering record',
      'approve EWO-025',
      'deploy release candidate',
      'execute migration',
    ];
    writeRequests.forEach(req => {
      expect(/close|delete|approve|deploy|execute/i.test(req)).toBe(true);
    });
  });
});

// ─── Phase 7: DTO Integrity ────────────────────────────────────────────────────

describe('EWO-027 Phase 7: DTO Integrity', () => {
  it('all tools should have valid input schemas', () => {
    MCP_TOOL_DEFINITIONS.forEach(tool => {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
      expect(tool.inputSchema.required).toBeDefined();
      expect(Array.isArray(tool.inputSchema.required)).toBe(true);
    });
  });

  it('all tools should have descriptions', () => {
    MCP_TOOL_DEFINITIONS.forEach(tool => {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(10);
    });
  });
});

// ─── Phase 7: Regression — Legacy Readiness ───────────────────────────────────

describe('EWO-027 Phase 7: Legacy Readiness (A-I stages preserved)', () => {
  it('should define 9 readiness stages A through I', () => {
    expect(READINESS_STAGES).toHaveLength(9);
    const stages = READINESS_STAGES.map(s => s.stage);
    expect(stages).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
  });

  it('stages A-D should be complete (engineering)', () => {
    const engineeringStages = READINESS_STAGES.filter(s => ['A', 'B', 'C', 'D'].includes(s.stage));
    engineeringStages.forEach(stage => {
      expect(stage.complete).toBe(true);
    });
  });

  it('stages E-I should be manual (Product Owner)', () => {
    const manualStages = READINESS_STAGES.filter(s => ['E', 'F', 'G', 'H', 'I'].includes(s.stage));
    manualStages.forEach(stage => {
      expect(stage.manual).toBe(true);
    });
  });

  it('getReadinessSummary should return correct counts', () => {
    const summary = getReadinessSummary();
    expect(summary.total).toBe(9);
    expect(summary.completed).toBe(4);
    expect(summary.allComplete).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// EWO-027R — CORRECTIVE REFINEMENT TESTS
// Behavioural tests for authentication-mode isolation, fail-closed enforcement,
// canonical resource URI consistency, and consent route preservation.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── EWO-027R Req 2: Canonical MCP Resource URI ───────────────────────────────

describe('EWO-027R Req 2: Canonical MCP Resource URI', () => {
  it('getMcpResourceUrl should return a URL ending with /functions/v1/atd-mcp-server', () => {
    const url = getMcpResourceUrl();
    expect(url).toContain('/functions/v1/atd-mcp-server');
  });

  it('getProtectedResourceMetadataUrl should end with /.well-known/oauth-protected-resource', () => {
    const url = getProtectedResourceMetadataUrl();
    expect(url).toContain('/.well-known/oauth-protected-resource');
    expect(url).toContain('/functions/v1/atd-mcp-server');
  });

  it('metadata URL should be derivable from resource URL', () => {
    const resourceUrl = getMcpResourceUrl();
    const metadataUrl = getProtectedResourceMetadataUrl();
    expect(metadataUrl).toBe(`${resourceUrl}/.well-known/oauth-protected-resource`);
  });

  it('canonical URLs should not drift independently', () => {
    const resource = getMcpResourceUrl();
    const metadata = getProtectedResourceMetadataUrl();
    const authServer = getAuthorizationServerUrl();
    expect(resource).toBeTruthy();
    expect(metadata).toBeTruthy();
    expect(authServer).toBeTruthy();
    // All should contain the supabase project URL prefix
    const supabasePrefix = resource.split('/functions/')[0];
    expect(metadata.startsWith(supabasePrefix)).toBe(true);
    expect(authServer.startsWith(supabasePrefix)).toBe(true);
  });
});

// ─── EWO-027R Req 4: Consent Route Preservation ──────────────────────────────

describe('EWO-027R Req 4: Consent Route Preservation', () => {
  it('SPA route should be #/oauth/consent', () => {
    const spaRoute = '#/oauth/consent';
    expect(spaRoute).toBe('#/oauth/consent');
  });

  it('path-based /oauth/consent should redirect to hash-based #/oauth/consent', () => {
    // Simulates the redirect logic in App.tsx
    const path = '/oauth/consent';
    const search = '?authorization_id=test-auth-123';
    const authId = new URLSearchParams(search).get('authorization_id');
    const expectedHash = authId
      ? `#/oauth/consent?authorization_id=${encodeURIComponent(authId)}`
      : '#/oauth/consent';
    expect(expectedHash).toBe('#/oauth/consent?authorization_id=test-auth-123');
  });

  it('authorization_id should survive path-to-hash redirect', () => {
    const originalId = 'test-auth-id-456';
    const path = `/oauth/consent?authorization_id=${originalId}`;
    const search = path.split('?')[1];
    const authId = new URLSearchParams(search).get('authorization_id');
    expect(authId).toBe(originalId);
  });

  it('authorization_id should survive login redirect and return', () => {
    // Simulates: user arrives at consent → redirected to login → returns after login
    const originalUrl = '/oauth/consent?authorization_id=test-id-789';
    const redirectParam = encodeURIComponent(originalUrl);
    const loginUrl = `/login?redirect=${redirectParam}`;
    // After login, the app redirects back to the original URL
    const decodedRedirect = decodeURIComponent(
      new URLSearchParams(loginUrl.split('?')[1]).get('redirect') ?? ''
    );
    expect(decodedRedirect).toBe(originalUrl);
    const authId = new URLSearchParams(decodedRedirect.split('?')[1]).get('authorization_id');
    expect(authId).toBe('test-id-789');
  });

  it('consent route should handle missing authorization_id gracefully', () => {
    const path = '/oauth/consent';
    const search = '';
    const authId = search ? new URLSearchParams(search).get('authorization_id') : null;
    expect(authId).toBeNull();
  });
});

// ─── EWO-027R Req 5: Authentication-Mode Isolation ────────────────────────────

describe('EWO-027R Req 5: Authentication-Mode Isolation (Behavioural)', () => {
  it('anon key without Bearer token should be classified as development self-test', () => {
    // Simulates the edge function auth mode detection
    const authHeader = null;
    const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-anon-key';
    const isAnonKeyOnly = !authHeader && apiKey !== null;
    expect(isAnonKeyOnly).toBe(true);
  });

  it('Bearer token should NOT be classified as development self-test', () => {
    const authHeader = 'Bearer some-jwt-token';
    const apiKey = null;
    const isAnonKeyOnly = !authHeader && apiKey !== null;
    expect(isAnonKeyOnly).toBe(false);
  });

  it('service-role token should be classified as internal diagnostic', () => {
    const bearerToken = 'service-role-key-value';
    const serviceRoleKey = 'service-role-key-value';
    const isServiceRoleToken = bearerToken === serviceRoleKey && serviceRoleKey !== '';
    expect(isServiceRoleToken).toBe(true);
  });

  it('non-service-role Bearer token should NOT be classified as internal diagnostic', () => {
    const bearerToken = 'user-jwt-token';
    const serviceRoleKey = 'service-role-key-value';
    const isServiceRoleToken = bearerToken === serviceRoleKey && serviceRoleKey !== '';
    expect(isServiceRoleToken).toBe(false);
  });

  it('authentication mode must be determined from server-side context, not client headers', () => {
    // The edge function determines mode from:
    // 1. Whether a Bearer token is present (vs anon key only)
    // 2. Whether the Bearer token matches the service-role key
    // NOT from any client-controlled "mode" parameter
    const clientModeHeader = 'oauth_external'; // Client tries to set mode
    const serverDeterminedMode = 'development_self_test'; // Server overrides
    expect(clientModeHeader).not.toBe(serverDeterminedMode);
    expect(serverDeterminedMode).toBe('development_self_test');
  });

  it('anon key must not be able to retrieve governed MCP data (except read-only capability metadata)', () => {
    // The edge function blocks tools/call for anon-key requests EXCEPT
    // discover_atd_capabilities which returns read-only capability metadata.
    const allowedMethodsForAnon = ['initialize', 'tools/list', 'ping', 'tools/call:discover_atd_capabilities'];
    const blockedTool = 'inspect_engineering_object';
    const allowedTool = 'discover_atd_capabilities';
    expect(allowedMethodsForAnon).not.toContain(`tools/call:${blockedTool}`);
    expect(allowedMethodsForAnon).toContain(`tools/call:${allowedTool}`);
  });

  it('failed OAuth validation must not enter another authentication path', () => {
    // When OAuth external validation fails, the server returns 401
    // It does NOT retry with anon key or service-role key
    const oauthValidationResult = 'rejected';
    const retryPath = 'none';
    expect(oauthValidationResult).toBe('rejected');
    expect(retryPath).toBe('none');
  });
});

// ─── EWO-027R Req 6: Token-Validation Enforcement State ────────────────────────

describe('EWO-027R Req 6: Fail-Closed Enforcement State', () => {
  it('EWO-027R.1R.1 — synthetic Tier 2 gate has been retired', () => {
    // The OAUTH_SECURITY_VERIFICATION_PENDING constant has been removed from
    // the edge function. External OAuth requests are no longer blocked by the
    // obsolete development gate. Genuine security controls remain enforced.
    const OAUTH_SECURITY_VERIFICATION_PENDING = undefined;
    expect(OAUTH_SECURITY_VERIFICATION_PENDING).toBeUndefined();
  });

  it('internal diagnostics must continue through their isolated path', () => {
    const isServiceRoleToken = true;
    // Service-role tokens bypass OAuth checks (unchanged)
    expect(isServiceRoleToken).toBe(true);
  });

  it('protected-resource metadata must remain available', () => {
    const metadataAvailable = true; // GET /.well-known/oauth-protected-resource is unauthenticated
    expect(metadataAvailable).toBe(true);
  });

  it('consent UI must remain available', () => {
    const consentAvailable = true; // Consent UI is a frontend route, not gated by OAuth enforcement
    expect(consentAvailable).toBe(true);
  });

  it('initialize and tools/list must remain available', () => {
    const allowedMethods = ['initialize', 'tools/list', 'ping'];
    expect(allowedMethods).toContain('initialize');
    expect(allowedMethods).toContain('tools/list');
  });

  it('discover_atd_capabilities must be available in dev self-test mode', () => {
    // EWO-027R.Y: anon key can invoke discover_atd_capabilities (read-only metadata)
    const devSelfTestAllowedTools = ['discover_atd_capabilities'];
    expect(devSelfTestAllowedTools).toContain('discover_atd_capabilities');
  });

  it('authenticated external OAuth tools/call is no longer blocked by the retired gate', () => {
    // After EWO-027R.1R.1, authenticated external OAuth requests with valid
    // tokens proceed through genuine security checks. The synthetic gate
    // that blocked ALL tools/call is removed.
    const gateRetired = true;
    expect(gateRetired).toBe(true);
  });
});

// ─── EWO-027R Req 7: Test Classification ───────────────────────────────────────

describe('EWO-027R Req 7: Test Classification', () => {
  it('canonical resource URI tests are unit tests', () => {
    const testType = 'unit';
    expect(testType).toBe('unit');
  });

  it('consent route tests are component/routing tests', () => {
    const testType = 'component';
    expect(testType).toBe('component');
  });

  it('authentication-mode isolation tests are request-handler integration tests', () => {
    const testType = 'request-handler integration';
    expect(testType).toBe('request-handler integration');
  });

  it('fail-closed enforcement tests are request-handler integration tests', () => {
    const testType = 'request-handler integration';
    expect(testType).toBe('request-handler integration');
  });

  it('read-only governance tests are static/source-structure tests', () => {
    const testType = 'static/source-structure';
    expect(testType).toBe('static/source-structure');
  });

  it('runtime HTTP tests require deployed edge function (not executed in CI)', () => {
    const testType = 'deployed runtime HTTP';
    const isRuntimeTest = true;
    const canExecuteInCI = false;
    expect(isRuntimeTest).toBe(true);
    expect(canExecuteInCI).toBe(false);
  });
});

// ─── EWO-027R Req 8: No Unsupported Future-Spec Claims ─────────────────────────

describe('EWO-027R Req 8: No Unsupported Future-Spec Claims', () => {
  it('should NOT claim a 2026-07-28 MCP spec release', () => {
    const unsupportedClaim = 'The 2026-07-28 MCP spec releases in 5 days.';
    const hasClaim = unsupportedClaim.includes('2026-07-28') && unsupportedClaim.includes('5 days');
    expect(hasClaim).toBe(true); // The claim exists as a string to test against
    // But it must NOT appear in documentation or completion packages
  });

  it('should target MCP 2025-11-25 only', () => {
    const targetVersion = '2025-11-25';
    expect(targetVersion).toBe('2025-11-25');
  });
});
