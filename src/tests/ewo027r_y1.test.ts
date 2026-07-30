// EWO-027R.Y.1 — MCP Runtime Diagnostics & Response-Path Correction
// Regression tests covering:
// 1. Edge function anon key validation (no auth.getUser() call)
// 2. Self-test initialize + notifications/initialized sequence
// 3. Governed diagnostic capture (HTTP status, raw body, auth mode, etc.)
// 4. Collapsible diagnostic UI
// 5. Deployment/version identifiers
// 6. Specific error message detection (no more "No tools in response")
// 7. Redaction of secrets in diagnostic output
// 8. OAuth route preservation

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

describe('EWO-027R.Y.1 — MCP Runtime Diagnostics & Response-Path Correction', () => {

  // ─── 1. Edge Function Anon Key Validation ─────────────────────────────────────

  describe('Edge function anon key validation', () => {
    it('does not call auth.getUser() for anon key validation', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      // Find the actual isAnonKeyOnly code block — use the block between isAnonKeyOnly and the next mode
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      // The anon block ends before the OAuth block — find the next major section
      const oauthIdx = content.indexOf('// Mode 1: OAuth External — Bearer token', anonIdx);
      const anonSection = content.slice(anonIdx, oauthIdx > anonIdx ? oauthIdx : anonIdx + 3000);
      // Check that auth.getUser() is not called as code (not just mentioned in comments)
      // Remove comments before checking
      const codeOnly = anonSection.replace(/\/\/[^\n]*/g, '');
      expect(codeOnly).not.toMatch(/auth\\.getUser/);
    });

    it('validates apikey by comparing against environment anon key', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).toMatch(/timingSafeEqual|apiKey !== supabaseAnonKey/);
    });

    it('handles notifications/initialized in dev self-test mode', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/notifications\/initialized/);
    });
  });

  // ─── 2. Self-Test MCP Sequence ────────────────────────────────────────────────

  describe('Self-test MCP sequence', () => {
    it('sends initialize before tools/list', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      // Find initialize and tools/list in the runSelfTest function
      const runSelfTestIdx = content.indexOf('const runSelfTest = async');
      const selfTestSection = content.slice(runSelfTestIdx);
      const initIdx = selfTestSection.indexOf("method: 'initialize'");
      // Find the tools/list that comes AFTER initialize (not the one in the 401 test)
      const toolsListIdx = selfTestSection.indexOf("method: 'tools/list'", initIdx);
      expect(initIdx).toBeGreaterThan(-1);
      expect(toolsListIdx).toBeGreaterThan(-1);
      expect(initIdx).toBeLessThan(toolsListIdx);
    });

    it('sends notifications/initialized after initialize', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      const runSelfTestIdx = content.indexOf('const runSelfTest = async');
      const selfTestSection = content.slice(runSelfTestIdx);
      const initIdx = selfTestSection.indexOf("method: 'initialize'");
      const notifIdx = selfTestSection.indexOf("notifications/initialized");
      expect(notifIdx).toBeGreaterThan(initIdx);
    });

    it('sends tools/list after notifications/initialized', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      const runSelfTestIdx = content.indexOf('const runSelfTest = async');
      const selfTestSection = content.slice(runSelfTestIdx);
      const notifIdx = selfTestSection.indexOf("notifications/initialized");
      // Find the tools/list that comes AFTER notifications/initialized
      const toolsListIdx = selfTestSection.indexOf("method: 'tools/list'", notifIdx);
      expect(toolsListIdx).toBeGreaterThan(notifIdx);
    });

    it('sends discover_atd_capabilities after tools/list', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      const runSelfTestIdx = content.indexOf('const runSelfTest = async');
      const selfTestSection = content.slice(runSelfTestIdx);
      const toolsListIdx = selfTestSection.indexOf("method: 'tools/list'");
      const discoverIdx = selfTestSection.indexOf("method: 'tools/call'");
      expect(discoverIdx).toBeGreaterThan(toolsListIdx);
    });

    it('uses apikey header for all authenticated requests', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      const runSelfTestIdx = content.indexOf('const runSelfTest = async');
      const selfTestSection = content.slice(runSelfTestIdx, runSelfTestIdx + 15000);
      // The initialize stage should have apikey
      const initIdx = selfTestSection.indexOf("method: 'initialize'");
      const initSection = selfTestSection.slice(initIdx, initIdx + 500);
      expect(initSection).toMatch(/apikey/);
      // The tools/list stage (after initialize) should have apikey
      const toolsListIdx = selfTestSection.indexOf("method: 'tools/list'", selfTestSection.indexOf("notifications/initialized"));
      const toolsListSection = selfTestSection.slice(toolsListIdx, toolsListIdx + 500);
      expect(toolsListSection).toMatch(/apikey/);
      // The tools/call stage should have apikey
      const discoverIdx = selfTestSection.indexOf("method: 'tools/call'");
      const discoverSection = selfTestSection.slice(discoverIdx, discoverIdx + 500);
      expect(discoverSection).toMatch(/apikey/);
    });

    it('uses MCP-Protocol-Version header on initialize and tools/list', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/MCP-Protocol-Version/);
    });

    it('retains MCP-Session-Id if returned by server', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/MCP-Session-Id/);
      expect(content).toMatch(/mcpSessionId/);
    });

    it('uses negotiated protocol version from initialize response', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/negotiatedProtocolVersion/);
    });
  });

  // ─── 3. Governed Diagnostic Capture ─────────────────────────────────────────

  describe('Governed diagnostic capture', () => {
    it('defines McpDiagnostic interface with required fields', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/interface McpDiagnostic/);
      expect(content).toMatch(/http_status/);
      expect(content).toMatch(/http_status_text/);
      expect(content).toMatch(/content_type/);
      expect(content).toMatch(/mcp_protocol_version/);
      expect(content).toMatch(/x_auth_mode/);
      expect(content).toMatch(/raw_body/);
      expect(content).toMatch(/jsonrpc_version/);
      expect(content).toMatch(/response_id/);
      expect(content).toMatch(/result_present/);
      expect(content).toMatch(/error_present/);
      expect(content).toMatch(/error_code/);
      expect(content).toMatch(/error_message/);
      expect(content).toMatch(/result_keys/);
      expect(content).toMatch(/tools_array_present/);
      expect(content).toMatch(/tools_count/);
      expect(content).toMatch(/content_array_present/);
      expect(content).toMatch(/content_count/);
      expect(content).toMatch(/parsing_failure/);
      expect(content).toMatch(/timestamp/);
      expect(content).toMatch(/auth_mode/);
      expect(content).toMatch(/apikey_present/);
      expect(content).toMatch(/authorization_present/);
    });

    it('buildDiagnostic function captures HTTP status', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/function buildDiagnostic/);
      expect(content).toMatch(/resp\?\.status/);
    });

    it('truncates raw body to safe length', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/rawBody\.slice\(0,\s*500\)/);
    });

    it('captures parsing failure for non-JSON responses', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/Non-JSON response/);
    });

    it('captures SSE/text-event-stream detection', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/text\/event-stream/);
    });
  });

  // ─── 4. Collapsible Diagnostic UI ────────────────────────────────────────────

  describe('Collapsible diagnostic UI', () => {
    it('has expandedDiag state for collapsible diagnostics', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/expandedDiag/);
      expect(content).toMatch(/setExpandedDiag/);
    });

    it('renders diagnostic toggle button for failed stages', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/result\.diagnostic/);
      expect(content).toMatch(/Diagnostic/);
    });

    it('renders diagnostic JSON in collapsible section', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/JSON\.stringify\(result\.diagnostic/);
    });
  });

  // ─── 5. Deployment/Version Identifiers ───────────────────────────────────────

  describe('Deployment/version identifiers', () => {
    it('defines FRONTEND_BUILD_VERSION constant', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/FRONTEND_BUILD_VERSION/);
    });

    it('defines DIAGNOSTIC_SCHEMA_VERSION constant', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/DIAGNOSTIC_SCHEMA_VERSION/);
    });

    it('displays version identifiers in self-test results section', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/Frontend:/);
      expect(content).toMatch(/Diagnostic Schema:/);
    });

    it('sends frontend version in initialize clientInfo', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/clientInfo.*FRONTEND_BUILD_VERSION/);
    });
  });

  // ─── 6. Specific Error Message Detection ─────────────────────────────────────

  describe('Specific error message detection', () => {
    it('formatDiagnosticError function exists', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/function formatDiagnosticError/);
    });

    it('detects HTTP 401 with specific message', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/HTTP 401: Authentication required/);
    });

    it('detects HTTP 404 with specific message', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/HTTP 404: MCP endpoint unavailable/);
    });

    it('detects JSON-RPC errors with code and message', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/JSON-RPC error/);
    });

    it('detects missing result object', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/Result object missing/);
    });

    it('detects empty tools array', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/tools array empty/);
    });

    it('detects missing tools array', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/tools array missing/);
    });

    it('detects empty content array', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/content array empty/);
    });

    it('detects missing content array', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/content array missing/);
    });

    it('does not use "No tools in response" as a failure message', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).not.toMatch(/'No tools in response'/);
      expect(content).not.toMatch(/"No tools in response"/);
    });

    it('does not use "No content in response" as a failure message', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).not.toMatch(/'No content in response'/);
      expect(content).not.toMatch(/"No content in response"/);
    });

    it('distinguishes static registry validation from live server response', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/static registry/);
      expect(content).toMatch(/live server response/);
    });
  });

  // ─── 7. Redaction of Secrets ─────────────────────────────────────────────────

  describe('Redaction of secrets in diagnostic output', () => {
    it('does not include anon key value in diagnostic output', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      // The buildDiagnostic function should not include the raw apikey value
      const buildDiagSection = content.slice(
        content.indexOf('async function buildDiagnostic'),
        content.indexOf('function formatDiagnosticError')
      );
      // anonKey is passed as parameter but only used for fingerprinting, not stored raw
      expect(buildDiagSection).not.toMatch(/anonKey\.toString/);
      expect(buildDiagSection).not.toMatch(/raw_key/);
      expect(buildDiagSection).not.toMatch(/VITE_SUPABASE_ANON_KEY/);
    });

    it('redacts endpoint URL in diagnostic output', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/\.replace.*functions.*v1/);
    });

    it('includes redaction notice in self-test UI', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/redacted/i);
    });

    it('includes development diagnostic disclaimer', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/NOT a production OAuth test/);
    });
  });

  // ─── 8. OAuth Route Preservation ─────────────────────────────────────────────

  describe('OAuth route preservation (EWO-027R.Y)', () => {
    it('uses history.replaceState for OAuth redirect', () => {
      const content = fs.readFileSync('src/App.tsx', 'utf-8');
      expect(content).toMatch(/history\.replaceState/);
    });

    it('does not use window.location.replace for OAuth redirect', () => {
      const content = fs.readFileSync('src/App.tsx', 'utf-8');
      const oauthSection = content.slice(
        content.indexOf('Path-to-hash redirect for OAuth consent'),
        content.indexOf('const route = parseHash')
      );
      expect(oauthSection).not.toMatch(/window\.location\.replace/);
    });

    it('preserves authorization_id through redirect', () => {
      const content = fs.readFileSync('src/App.tsx', 'utf-8');
      expect(content).toMatch(/authorization_id/);
      expect(content).toMatch(/encodeURIComponent/);
    });
  });

  // ─── 9. Authentication Governance ─────────────────────────────────────────────

  describe('Authentication governance', () => {
    it('dev self-test mode only allows discover_atd_capabilities for tools/call', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 10000);
      // Only discover_atd_capabilities should be allowed via tools/call
      expect(anonSection).toMatch(/discover_atd_capabilities/);
      // Other tools/call should fail closed
      expect(anonSection).toMatch(/does not permit governed data access/);
    });

    it('unauthenticated requests still return 401 with WWW-Authenticate', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/createUnauthorizedResponse/);
      expect(content).toMatch(/WWW-Authenticate/);
    });

    it('CORS exposes WWW-Authenticate header', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/Access-Control-Expose-Headers/);
      expect(content).toMatch(/WWW-Authenticate/);
    });
  });
});
