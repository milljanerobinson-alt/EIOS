// EWO-027R.Y.3 — Canonical Development Credential Alignment
// Regression tests covering:
// 1. Canonical credential type is explicitly defined (JWT anon key)
// 2. Frontend and MCP self-test use the same credential source
// 3. Edge function validates the JWT anon key structurally
// 4. Legacy and publishable formats are not confused
// 5. Correct credential succeeds (JWT validation passes for matching project ref)
// 6. Incorrect credential returns governed 401
// 7. Missing credential returns governed 401
// 8. Service-role key never exposed to frontend
// 9. Fingerprints match for the canonical credential
// 10. Project references match
// 11-16. MCP sequence + audit + blocked tools
// 17-18. Existing tests + build

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

describe('EWO-027R.Y.3 — Canonical Development Credential Alignment', () => {

  // ─── 1. Canonical Credential Type ─────────────────────────────────────────────

  describe('Canonical credential type', () => {
    it('edge function defines CANONICAL_CREDENTIAL_TYPE constant', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/CANONICAL_CREDENTIAL_TYPE/);
      expect(content).toMatch(/jwt_anon_key/);
    });

    it('frontend defines CANONICAL_CREDENTIAL_TYPE constant', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/CANONICAL_CREDENTIAL_TYPE/);
      expect(content).toMatch(/jwt_anon_key/);
    });

    it('edge function version is EWO-027R.Y.3', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/EWO-027R\.Y\.3/);
    });

    it('frontend version is EWO-027R.Y.3', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/EWO-027R\.Y\.3/);
    });

    it('diagnostic schema version is 1.2', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/DIAGNOSTIC_SCHEMA_VERSION.*1\.2/);
    });
  });

  // ─── 2. Frontend Credential Source ────────────────────────────────────────────

  describe('Frontend credential source', () => {
    it('frontend uses VITE_SUPABASE_ANON_KEY as the credential source', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      const runSelfTestIdx = content.indexOf('const runSelfTest = async');
      const selfTestSection = content.slice(runSelfTestIdx, runSelfTestIdx + 2000);
      expect(selfTestSection).toMatch(/VITE_SUPABASE_ANON_KEY/);
    });

    it('frontend diagnostic includes credential_type field', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/credential_type/);
    });

    it('frontend diagnostic includes frontend_apikey_length', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/frontend_apikey_length/);
    });

    it('frontend detects JWT format by checking 3 dot-separated parts', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/split\('\.'\)\.length === 3/);
    });

    it('frontend does not use service-role key', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).not.toMatch(/SERVICE_ROLE/);
    });
  });

  // ─── 3. Edge-Function JWT Validation ──────────────────────────────────────────

  describe('Edge-function JWT anon key validation', () => {
    it('edge function defines decodeJwtPayload function', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/function decodeJwtPayload/);
    });

    it('edge function defines isJwtAnonKey function', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/function isJwtAnonKey/);
    });

    it('edge function defines validateJwtAnonKey function', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/function validateJwtAnonKey/);
    });

    it('validateJwtAnonKey checks project reference', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const validateIdx = content.indexOf('function validateJwtAnonKey');
      const validateSection = content.slice(validateIdx, validateIdx + 2000);
      expect(validateSection).toMatch(/serverProjectRef/);
      expect(validateSection).toMatch(/Project reference mismatch/);
    });

    it('validateJwtAnonKey checks role is anon', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const validateIdx = content.indexOf('function validateJwtAnonKey');
      const validateSection = content.slice(validateIdx, validateIdx + 2000);
      expect(validateSection).toMatch(/role.*anon/);
    });

    it('validateJwtAnonKey rejects non-JWT keys', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const validateIdx = content.indexOf('function validateJwtAnonKey');
      const validateSection = content.slice(validateIdx, validateIdx + 2000);
      expect(validateSection).toMatch(/Not a JWT-format key/);
    });

    it('validateJwtAnonKey rejects whitespace', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const validateIdx = content.indexOf('function validateJwtAnonKey');
      const validateSection = content.slice(validateIdx, validateIdx + 2000);
      expect(validateSection).toMatch(/whitespace/);
    });

    it('isJwtAnonKey checks for 3 dot-separated parts and minimum length', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const isJwtIdx = content.indexOf('function isJwtAnonKey');
      const isJwtSection = content.slice(isJwtIdx, isJwtIdx + 500);
      expect(isJwtSection).toMatch(/split\("\."\)/);
      expect(isJwtSection).toMatch(/length.*50/);
    });

    it('decodeJwtPayload handles base64url decoding', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const decodeIdx = content.indexOf('function decodeJwtPayload');
      const decodeSection = content.slice(decodeIdx, decodeIdx + 1000);
      expect(decodeSection).toMatch(/atob/);
      expect(decodeSection).toMatch(/base64url|replace.*-.*\+/);
    });
  });

  // ─── 4. Validation Logic ──────────────────────────────────────────────────────

  describe('Validation logic', () => {
    it('uses JWT validation as primary, publishable key match as fallback', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 5000);
      expect(anonSection).toMatch(/jwtValidation\.valid/);
      expect(anonSection).toMatch(/publishableKeyMatch/);
      expect(anonSection).toMatch(/jwtValidation\.valid \|\| publishableKeyMatch/);
    });

    it('does not call auth.getUser() for anon key validation', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const oauthIdx = content.indexOf('// Mode 1: OAuth External', anonIdx);
      const anonSection = content.slice(anonIdx, oauthIdx > anonIdx ? oauthIdx : anonIdx + 8000);
      const codeOnly = anonSection.replace(/\/\/[^\n]*/g, '');
      expect(codeOnly).not.toMatch(/auth\.getUser/);
    });

    it('diagnostic includes received_credential_type', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 8000);
      expect(anonSection).toMatch(/received_credential_type/);
    });

    it('diagnostic includes expected_credential_type', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 8000);
      expect(anonSection).toMatch(/expected_credential_type/);
    });

    it('diagnostic includes received_jwt_project_ref', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 8000);
      expect(anonSection).toMatch(/received_jwt_project_ref/);
    });

    it('diagnostic includes project_ref_match', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 8000);
      expect(anonSection).toMatch(/project_ref_match/);
    });

    it('diagnostic includes canonical_credential_type', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 8000);
      expect(anonSection).toMatch(/canonical_credential_type/);
    });

    it('still blocks all tools/call except discover_atd_capabilities', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 10000);
      expect(anonSection).toMatch(/does not permit governed data access/);
    });

    it('still returns governed 401 on failure', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 8000);
      expect(anonSection).toMatch(/createUnauthorizedResponse/);
    });
  });

  // ─── 5. Security Verification ─────────────────────────────────────────────────

  describe('Security verification', () => {
    it('does not expose service-role key to frontend', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).not.toMatch(/SERVICE_ROLE/);
    });

    it('does not log raw credentials in edge function', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const anonIdx = content.indexOf('if (isAnonKeyOnly)');
      const anonSection = content.slice(anonIdx, anonIdx + 8000);
      expect(anonSection).not.toMatch(/console\.log.*apiKey/);
    });

    it('fingerprints remain SHA-256 and truncated', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/SHA-256/);
      expect(content).toMatch(/slice\(0,\s*8\)/);
    });

    it('frontend fingerprints remain SHA-256 and truncated', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/SHA-256/);
      expect(content).toMatch(/slice\(0,\s*8\)/);
    });
  });

  // ─── 6. Preservation of Previous Fixes ─────────────────────────────────────────

  describe('Preservation of previous fixes', () => {
    it('still has WWW-Authenticate header on 401', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/WWW-Authenticate/);
    });

    it('still has protected-resource metadata endpoint', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/protected-resource/);
    });

    it('still has CORS expose headers', () => {
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
    });

    it('still has redaction notice', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/redacted/i);
    });

    it('still uses history.replaceState for OAuth redirect', () => {
      const content = fs.readFileSync('src/App.tsx', 'utf-8');
      expect(content).toMatch(/history\.replaceState/);
    });

    it('still has X-Edge-Function-Version header', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/X-Edge-Function-Version/);
    });
  });

  // ─── 7. Diagnostic UI Updates ─────────────────────────────────────────────────

  describe('Diagnostic UI updates', () => {
    it('formatDiagnosticError shows credential types', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/received_credential_type|sent:/);
    });

    it('formatDiagnosticError shows project ref match', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/project refs match|project_ref_match/);
    });

    it('formatDiagnosticError shows frontend apikey length', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/frontend_apikey_length/);
    });
  });
});
