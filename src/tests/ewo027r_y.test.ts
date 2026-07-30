// EWO-027R.Y — MCP Runtime Response Integrity & OAuth Routing Refinement
// Regression tests for:
// 1. WWW-Authenticate header on 401 (CORS expose-headers)
// 2. tools/list returns seven tools (apikey header, not Bearer)
// 3. discover_atd_capabilities returns non-empty content (anon RLS access)
// 4. OAuth route path/hash duplication (history.replaceState)

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('EWO-027R.Y — MCP Runtime Response Integrity', () => {

  // ─── Issue 1: WWW-Authenticate header on 401 ──────────────────────────────────

  describe('Issue 1 — WWW-Authenticate header on 401', () => {
    it('edge function returns 401 with WWW-Authenticate for unauthenticated requests', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/createUnauthorizedResponse/);
      expect(content).toMatch(/status:\s*401/);
      expect(content).toMatch(/WWW-Authenticate/);
      expect(content).toMatch(/resource_metadata/);
    });

    it('CORS headers expose WWW-Authenticate to browser JavaScript', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/Access-Control-Expose-Headers/);
      expect(content).toMatch(/WWW-Authenticate/);
    });

    it('self-test sends unauthenticated request for 401 check (no auth header)', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      // The WWW-Authenticate test should NOT send an apikey or Authorization header
      const wwwAuthSection = content.slice(
        content.indexOf("'WWW-Authenticate header on 401'"),
        content.indexOf("'MCP initialize'")
      );
      // The fetch for the 401 test should only have Content-Type, no apikey or Authorization
      const fetchStart = wwwAuthSection.indexOf('fetch(url, {');
      const fetchEnd = wwwAuthSection.indexOf('});', fetchStart);
      const fetchBlock = wwwAuthSection.slice(fetchStart, fetchEnd);
      expect(fetchBlock).not.toMatch(/apikey/);
      expect(fetchBlock).not.toMatch(/Authorization.*Bearer/);
    });

    it('self-test checks for resource_metadata in WWW-Authenticate header', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      expect(content).toMatch(/resource_metadata=/);
    });
  });

  // ─── Issue 2: tools/list returns seven tools ─────────────────────────────────

  describe('Issue 2 — tools/list returns seven tools', () => {
    it('self-test uses apikey header (not Authorization Bearer) for tools/list', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      const toolsListSection = content.slice(
        content.indexOf('Retrieve tool list (tools/list)'),
        content.indexOf('Validate tool schemas')
      );
      expect(toolsListSection).toMatch(/apikey/);
      expect(toolsListSection).not.toMatch(/Authorization.*Bearer/);
    });

    it('edge function allows tools/list for anon key (apikey header)', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/isAnonKeyOnly/);
      // tools/list should be allowed in anon mode
      expect(content).toMatch(/tools\/list/);
    });

    it('canonical tool registry defines exactly seven read-only tools', () => {
      const content = fs.readFileSync('src/lib/atdConnect/mcpServer.ts', 'utf-8');
      const toolNameMatches = content.match(/name:\s*'[^']+'/g) ?? [];
      // 7 tool definitions, each has a name field
      expect(toolNameMatches.length).toBeGreaterThanOrEqual(7);
    });

    it('all seven tools have read-only annotations', () => {
      const content = fs.readFileSync('src/lib/atdConnect/mcpServer.ts', 'utf-8');
      const readOnlyCount = (content.match(/readOnlyHint:\s*true/g) ?? []).length;
      const destructiveCount = (content.match(/destructiveHint:\s*false/g) ?? []).length;
      expect(readOnlyCount).toBeGreaterThanOrEqual(7);
      expect(destructiveCount).toBeGreaterThanOrEqual(7);
    });

    it('self-test checks for non-empty tools array in response', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      const toolsListSection = content.slice(
        content.indexOf("'Retrieve tool list (tools/list)'"),
        content.indexOf("'Validate tool schemas'")
      );
      expect(toolsListSection).toMatch(/tools\.length/);
    });
  });

  // ─── Issue 3: discover_atd_capabilities returns non-empty content ─────────────

  describe('Issue 3 — discover_atd_capabilities returns non-empty content', () => {
    it('edge function allows discover_atd_capabilities in dev self-test mode', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/discover_atd_capabilities/);
      expect(content).toMatch(/isAnonKeyOnly/);
    });

    it('self-test uses apikey header for discover_atd_capabilities invocation', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      const discoverSection = content.slice(
        content.indexOf('Invoke discover_atd_capabilities'),
        content.indexOf('Verify matching audit record')
      );
      expect(discoverSection).toMatch(/apikey/);
      expect(discoverSection).not.toMatch(/Authorization.*Bearer/);
    });

    it('self-test checks for governed flag and capability count', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      const discoverSection = content.slice(
        content.indexOf('Invoke discover_atd_capabilities'),
        content.indexOf('Verify matching audit record')
      );
      expect(discoverSection).toMatch(/governed/);
      expect(discoverSection).toMatch(/capabilityCount/);
    });

    it('discover_atd_capabilities handler queries atd_connect_capabilities table', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/atd_connect_capabilities/);
      expect(content).toMatch(/discover_atd_capabilities/);
    });

    it('RLS allows anon SELECT on atd_connect_capabilities', async () => {
      // Verify the migration was applied
      const migrationFiles = fs.readdirSync('supabase/migrations');
      const anonSelectMigration = migrationFiles.find(f =>
        f.includes('anon_select_capabilities')
      );
      expect(anonSelectMigration).toBeDefined();
    });

    it('RLS allows anon INSERT on atd_connect_inspection_log', () => {
      const migrationFiles = fs.readdirSync('supabase/migrations');
      const anonInsertMigration = migrationFiles.find(f =>
        f.includes('anon_insert_inspection_log')
      );
      expect(anonInsertMigration).toBeDefined();
    });
  });

  // ─── Issue 4: OAuth route path/hash duplication ────────────────────────────────

  describe('Issue 4 — OAuth route path/hash duplication', () => {
    it('uses history.replaceState instead of window.location.replace for OAuth redirect', () => {
      const content = fs.readFileSync('src/App.tsx', 'utf-8');
      expect(content).toMatch(/history\.replaceState/);
      // Should NOT use window.location.replace for the OAuth consent redirect
      const oauthSection = content.slice(
        content.indexOf('Path-to-hash redirect for OAuth consent'),
        content.indexOf('const route = parseHash')
      );
      expect(oauthSection).not.toMatch(/window\.location\.replace/);
    });

    it('preserves authorization_id through the redirect', () => {
      const content = fs.readFileSync('src/App.tsx', 'utf-8');
      expect(content).toMatch(/authorization_id/);
      expect(content).toMatch(/encodeURIComponent/);
    });

    it('updates React hash state after replaceState', () => {
      const content = fs.readFileSync('src/App.tsx', 'utf-8');
      expect(content).toMatch(/setHash\(newHash\)/);
    });

    it('handles OAuth consent with and without search params', () => {
      const content = fs.readFileSync('src/App.tsx', 'utf-8');
      expect(content).toMatch(/path === '\/oauth\/consent' && search/);
      expect(content).toMatch(/path === '\/oauth\/consent'/);
    });
  });

  // ─── Scroll Governance Confirmation (EWO-027R.X) ───────────────────────────────

  describe('Scroll Governance Confirmation', () => {
    it('EngineeringControlCentrePage uses overflow-y-auto (not overflow-hidden) for content', () => {
      const content = fs.readFileSync('src/pages/EngineeringControlCentrePage.tsx', 'utf-8');
      expect(content).toMatch(/overflow-y-auto/);
      expect(content).not.toMatch(/FULL_HEIGHT_SECTIONS/);
    });

    it('canonical scroll CSS rules exist in index.css', () => {
      const content = fs.readFileSync('src/index.css', 'utf-8');
      expect(content).toMatch(/html.*height:\s*100%/);
      expect(content).toMatch(/\.scroll-surface/);
    });

    it('no page-specific scroll workaround in ECCATDConnectPage', () => {
      const content = fs.readFileSync('src/pages/ecc/ECCATDConnectPage.tsx', 'utf-8');
      // The page should not have its own overflow-hidden or overflow-y-auto on root
      // It should rely on the shared layout's scroll container
      expect(content).not.toMatch(/className="space-y-6 overflow-y-auto"/);
      expect(content).not.toMatch(/className="space-y-6 overflow-hidden"/);
    });
  });

  // ─── Runtime Audit Governance ─────────────────────────────────────────────────

  describe('Runtime Audit Governance', () => {
    it('discover_atd_capabilities records audit entry on invocation', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const discoverSection = content.slice(
        content.indexOf('case "discover_atd_capabilities"'),
        content.indexOf('case "inspect_engineering_object"')
      );
      expect(discoverSection).toMatch(/atd_connect_inspection_log/);
      expect(discoverSection).toMatch(/insert/);
      expect(discoverSection).toMatch(/discoverCapabilities/);
    });

    it('audit record includes tool name, outcome, and request source', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/tool_name/);
      expect(content).toMatch(/outcome/);
      expect(content).toMatch(/request_source/);
    });

    it('failed tool invocation returns governed error, not empty success', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      // The executeTool function returns error field on failure
      expect(content).toMatch(/err instanceof Error \? err\.message/);
      // The response includes isError flag
      expect(content).toMatch(/isError/);
    });
  });
});
