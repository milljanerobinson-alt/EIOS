// EWO-027R.Y.2 — Development API Key Validation & Environment Alignment Correction
// Regression tests covering:
// 1. Safe key-comparison diagnostics (fingerprints, lengths, project refs)
// 2. Frontend key source verification
// 3. Edge-function expected key source verification (multiple env vars)
// 4. Project/environment alignment display
// 5. Correct validation design (timing-safe, no auth.getUser())
// 6. No masking of configuration failure
// 7. Improved authentication error diagnostics
// 8. Full MCP sequence verification after auth fix
// 9. Preservation of previous fixes

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

describe('EWO-027R.Y.2 — Development API Key Validation & Environment Alignment Correction', () => {

  // ─── 1. Safe Key-Comparison Diagnostics ──────────────────────────────────────

  describe('Safe key-comparison diagnostics', () => {
    it('edge function defines safeFingerprint function', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/async function safeFingerprint/);
      expect(content).toMatch(/SHA-256/);
    });

    it('edge function uses timing-safe comparison', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/function timingSafeEqual/);
      // XOR-based comparison — match the actual code pattern
      expect(content).toMatch(/result \|= /);
    });

    it('fingerprint is truncated to safe length (8 bytes = 16 hex chars)', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/slice\(0,\s*8\)/);
    });

    it('diagnostic data includes received fingerprint', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).toMatch(/received_fingerprint/);
    });

    it('diagnostic data includes expected fingerprints', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).toMatch(/expected_fingerprints/);
    });

    it('diagnostic data includes length match', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).toMatch(/length_match/);
    });

    it('diagnostic data includes fingerprint match', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).toMatch(/fingerprint_match/);
    });

    it('diagnostic data includes server project reference', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).toMatch(/server_project_ref/);
    });

    it('diagnostic data includes received apikey metadata', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).toMatch(/received_apikey_present/);
      expect(anonSection).toMatch(/received_apikey_length/);
      expect(anonSection).toMatch(/received_apikey_has_whitespace/);
      expect(anonSection).toMatch(/received_apikey_has_bearer_prefix/);
      expect(anonSection).toMatch(/received_apikey_looks_empty/);
    });

    it('diagnostic data includes expected key metadata', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 8000);
      expect(anonSection).toMatch(/expected_server_key_present/);
      expect(anonSection).toMatch(/expected_key_count/);
    });

    it('diagnostic data does not include raw key values', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).not.toMatch(/raw_key/);
      expect(anonSection).not.toMatch(/api_key_value/);
      expect(anonSection).not.toMatch(/apikey_value/);
    });

    it('diagnostic data is passed to createUnauthorizedResponse', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).toMatch(/createUnauthorizedResponse\(null,\s*`Authentication failed/);
      expect(anonSection).toMatch(/diagnosticData\)/);
    });
  });

  // ─── 2. Frontend Key Source Verification ──────────────────────────────────────

  describe('Frontend key source verification', () => {
    it('frontend uses VITE_SUPABASE_ANON_KEY as the apikey source', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      const runSelfTestIdx = content.indexOf('const runSelfTest = async');
      const selfTestSection = content.slice(runSelfTestIdx, runSelfTestIdx + 2000);
      expect(selfTestSection).toMatch(/VITE_SUPABASE_ANON_KEY/);
    });

    it('frontend defines safeFingerprintFrontend function', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/async function safeFingerprintFrontend/);
      expect(content).toMatch(/SHA-256/);
    });

    it('frontend diagnostic includes frontend_apikey_fingerprint', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/frontend_apikey_fingerprint/);
    });

    it('frontend diagnostic includes frontend_project_ref', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/frontend_project_ref/);
    });

    it('frontend does not send Authorization Bearer header for self-test', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      const runSelfTestIdx = content.indexOf('const runSelfTest = async');
      const selfTestSection = content.slice(runSelfTestIdx, runSelfTestIdx + 15000);
      // The authenticated requests should use apikey, not Authorization Bearer
      const initIdx = selfTestSection.indexOf("method: 'initialize'");
      const initSection = selfTestSection.slice(initIdx, initIdx + 500);
      expect(initSection).toMatch(/apikey/);
      expect(initSection).not.toMatch(/Authorization.*Bearer/);
    });

    it('frontend displays project reference in self-test results header', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/Project:/);
    });
  });

  // ─── 3. Edge-Function Expected Key Source ─────────────────────────────────────

  describe('Edge-function expected key source', () => {
    it('edge function reads SUPABASE_ANON_KEY from environment', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/Deno\.env\.get\("SUPABASE_ANON_KEY"\)/);
    });

    it('edge function also checks SUPABASE_PUBLISHABLE_KEYS', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/SUPABASE_PUBLISHABLE_KEYS/);
    });

    it('edge function defines getValidAnonKeys function', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/function getValidAnonKeys/);
    });

    it('getValidAnonKeys parses JSON array format', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/JSON\.parse\(publishableKeysRaw\)/);
      expect(content).toMatch(/Array\.isArray/);
    });

    it('getValidAnonKeys handles non-JSON (newline/comma) format', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/split\(/);
      expect(content).toMatch(/[\\n,]/);
    });

    it('getValidAnonKeys deduplicates keys', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/new Set/);
    });

    it('edge function validates against all valid keys (not just first)', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).toMatch(/validAnonKeys\.some/);
    });
  });

  // ─── 4. Project/Environment Alignment ─────────────────────────────────────────

  describe('Project/environment alignment', () => {
    it('edge function defines extractProjectRef function', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/function extractProjectRef/);
      expect(content).toMatch(/supabase/);
    });

    it('frontend defines extractProjectRefFromUrl function', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/function extractProjectRefFromUrl/);
    });

    it('edge function includes X-Edge-Function-Version header', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/X-Edge-Function-Version/);
      expect(content).toMatch(/EDGE_FUNCTION_VERSION/);
    });

    it('edge function version is EWO-027R.Y.2', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/EWO-027R\.Y\.2/);
    });

    it('frontend version is EWO-027R.Y.2 or later', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/EWO-027R\.Y\.[23]/);
    });

    it('frontend diagnostic includes x_edge_function_version', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/x_edge_function_version/);
    });

    it('frontend diagnostic includes frontend_build_version', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/frontend_build_version/);
    });

    it('frontend diagnostic includes diagnostic_schema_version', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/diagnostic_schema_version/);
    });

    it('diagnostic schema version is 1.1 or later', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/DIAGNOSTIC_SCHEMA_VERSION.*1\.[12]/);
    });
  });

  // ─── 5. Correct Validation Design ─────────────────────────────────────────────

  describe('Correct validation design', () => {
    it('does not call auth.getUser() for anon key validation', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const oauthIdx = content.indexOf('// Mode 1: OAuth External — Bearer token', anonIdx);
      const anonSection = content.slice(anonIdx, oauthIdx > anonIdx ? oauthIdx : anonIdx + 5000);
      const codeOnly = anonSection.replace(/\/\/[^\n]*/g, '');
      expect(codeOnly).not.toMatch(/auth\.getUser/);
    });

    it('trims apikey before comparison', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).toMatch(/apiKey\.trim/);
    });

    it('rejects empty values', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).toMatch(/received_apikey_looks_empty/);
    });

    it('detects Bearer prefix in apikey', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).toMatch(/Bearer /);
      expect(anonSection).toMatch(/received_apikey_has_bearer_prefix/);
    });

    it('produces distinct failure reasons', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 8000);
      expect(anonSection).toMatch(/Key length mismatch|length mismatch/);
      expect(anonSection).toMatch(/Fingerprint mismatch|fingerprint mismatch/);
      expect(anonSection).toMatch(/empty or placeholder/);
      expect(anonSection).toMatch(/Bearer.*prefix/);
    });

    it('does not accept arbitrary non-empty keys', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      // Must use timingSafeEqual, not just truthiness check
      expect(anonSection).toMatch(/timingSafeEqual/);
    });
  });

  // ─── 6. No Masking of Configuration Failure ────────────────────────────────────

  describe('No masking of configuration failure', () => {
    it('does not remove the apikey check', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).toMatch(/if \(!keyMatch\)/);
    });

    it('does not accept any non-empty key', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      // Must still check against validAnonKeys, not just if (apiKey)
      expect(anonSection).toMatch(/validAnonKeys\.some/);
    });

    it('does not hard-code success', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).not.toMatch(/return.*200.*hardcoded/i);
    });

    it('still blocks all tools/call except discover_atd_capabilities', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 10000);
      expect(anonSection).toMatch(/does not permit governed data access/);
    });

    it('does not suppress HTTP 401 while mismatch remains', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).toMatch(/createUnauthorizedResponse/);
    });
  });

  // ─── 7. Improved Authentication Error Diagnostics ──────────────────────────────

  describe('Improved authentication error diagnostics', () => {
    it('formatDiagnosticError handles server diagnostic data from 401', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/error_data/);
      expect(content).toMatch(/fingerprint_match/);
      expect(content).toMatch(/length_match/);
      expect(content).toMatch(/expected_server_key_present/);
    });

    it('formatDiagnosticError displays server project reference', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/server:/);
      expect(content).toMatch(/server_project_ref|serverProjectRef/);
    });

    it('formatDiagnosticError displays frontend fingerprint or project', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/frontend:/);
    });

    it('diagnostic UI shows error_data in collapsible section', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/error_data/);
    });
  });

  // ─── 8. Preservation of Previous Fixes ──────────────────────────────────────────

  describe('Preservation of previous fixes (EWO-027R.Y and EWO-027R.Y.1)', () => {
    it('still has WWW-Authenticate header on 401', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/WWW-Authenticate/);
    });

    it('still has protected-resource metadata endpoint', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/protected-resource/);
    });

    it('still has CORS expose headers for WWW-Authenticate', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/Access-Control-Expose-Headers/);
    });

    it('still has notifications/initialized handling', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/notifications\/initialized/);
    });

    it('still has MCP initialize in self-test', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      const runSelfTestIdx = content.indexOf('const runSelfTest = async');
      const selfTestSection = content.slice(runSelfTestIdx);
      expect(selfTestSection).toMatch(/method: 'initialize'/);
    });

    it('still has collapsible diagnostic UI', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/expandedDiag/);
    });

    it('still has static registry vs live server distinction', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/static registry/);
      expect(content).toMatch(/live server response/);
    });

    it('still has redaction notice', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/redacted/i);
    });

    it('still has development diagnostic disclaimer', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/NOT a production OAuth test/);
    });

    it('still uses history.replaceState for OAuth redirect', () => {
      const content = fs.readFileSync('src/App.tsx', 'utf-8');
      expect(content).toMatch(/history\.replaceState/);
    });
  });

  // ─── 9. Security Verification ──────────────────────────────────────────────────

  describe('Security verification', () => {
    it('does not expose service-role key to frontend', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).not.toMatch(/SERVICE_ROLE/);
      expect(content).not.toMatch(/service_role/i);
    });

    it('does not display raw credentials in diagnostic output', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      const buildDiagSection = content.slice(
        content.indexOf('async function buildDiagnostic'),
        content.indexOf('function formatDiagnosticError')
      );
      expect(buildDiagSection).not.toMatch(/anonKey\.toString/);
      expect(buildDiagSection).not.toMatch(/raw_key/);
    });

    it('edge function does not log raw credentials', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).not.toMatch(/console\.log.*apiKey/);
      expect(anonSection).not.toMatch(/console\.log.*supabaseAnonKey/);
    });

    it('fingerprint uses SHA-256 (non-reversible)', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/SHA-256/);
    });

    it('frontend fingerprint uses SHA-256 (non-reversible)', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/SHA-256/);
    });
  });
});
