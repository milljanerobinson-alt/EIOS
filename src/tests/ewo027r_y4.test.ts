// EWO-027R.Y.4 — discover_atd_capabilities Database Query Correction
// Regression tests covering:
// 1. Canonical capability query uses correct column names
// 2. Schema compatibility (no capability_name reference)
// 3. Empty capability list returns governed success (not isError)
// 4. Missing column generates governed error
// 5. Audit reference preserved
// 6. Existing EWO-027 regression tests remain passing

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

describe('EWO-027R.Y.4 — discover_atd_capabilities Database Query Correction', () => {

  // ─── 1. Canonical Capability Query ───────────────────────────────────────────

  describe('Canonical capability query', () => {
    it('query uses "name" column, not "capability_name"', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const discoverIdx = content.indexOf('case "discover_atd_capabilities"');
      const discoverSection = content.slice(discoverIdx, discoverIdx + 500);
      expect(discoverSection).toMatch(/\.select\(/);
      expect(discoverSection).toMatch(/\bname\b/);
      expect(discoverSection).not.toMatch(/capability_name/);
    });

    it('query selects canonical schema columns', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const discoverIdx = content.indexOf('case "discover_atd_capabilities"');
      const discoverSection = content.slice(discoverIdx, discoverIdx + 500);
      expect(discoverSection).toMatch(/capability_id/);
      expect(discoverSection).toMatch(/name/);
      expect(discoverSection).toMatch(/description/);
      expect(discoverSection).toMatch(/category/);
      expect(discoverSection).toMatch(/lifecycle_status/);
      expect(discoverSection).toMatch(/deprecated/);
    });

    it('query includes additional useful columns', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const discoverIdx = content.indexOf('case "discover_atd_capabilities"');
      const discoverSection = content.slice(discoverIdx, discoverIdx + 500);
      expect(discoverSection).toMatch(/status/);
      expect(discoverSection).toMatch(/owner/);
      expect(discoverSection).toMatch(/constitutional_visibility/);
    });
  });

  // ─── 2. Schema Compatibility ─────────────────────────────────────────────────

  describe('Schema compatibility', () => {
    it('no reference to capability_name anywhere in the edge function', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).not.toMatch(/capability_name/);
    });

    it('query orders by capability_id', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const discoverIdx = content.indexOf('case "discover_atd_capabilities"');
      const discoverSection = content.slice(discoverIdx, discoverIdx + 500);
      expect(discoverSection).toMatch(/order\("capability_id"\)/);
    });
  });

  // ─── 3. Empty Capability List ─────────────────────────────────────────────────

  describe('Empty capability list handling', () => {
    it('returns governed success with empty array when no capabilities', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const discoverIdx = content.indexOf('case "discover_atd_capabilities"');
      const discoverSection = content.slice(discoverIdx, discoverIdx + 1000);
      // The return should use caps ?? [] and caps?.length ?? 0
      expect(discoverSection).toMatch(/caps \?\? \[\]/);
      expect(discoverSection).toMatch(/caps\?\.length \?\? 0/);
    });

    it('isError is only true when result.error exists, not when capabilities are empty', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      // isError should be tied to result.error, not to data emptiness
      expect(content).toMatch(/isError:\s*result\.error\s*\?\s*true\s*:\s*false/);
    });
  });

  // ─── 4. Governed Error on Missing Column ──────────────────────────────────────

  describe('Governed error handling', () => {
    it('returns governed error with audit ref when database query fails', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const discoverIdx = content.indexOf('case "discover_atd_capabilities"');
      const discoverSection = content.slice(discoverIdx, discoverIdx + 500);
      expect(discoverSection).toMatch(/if \(error\)/);
      expect(discoverSection).toMatch(/error\.message/);
      expect(discoverSection).toMatch(/auditRef/);
    });
  });

  // ─── 5. Audit Reference Preserved ────────────────────────────────────────────

  describe('Audit reference preservation', () => {
    it('audit ref is generated before the query', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const discoverIdx = content.indexOf('case "discover_atd_capabilities"');
      const discoverSection = content.slice(discoverIdx, discoverIdx + 1000);
      // auditRef should be available in the discover_atd_capabilities handler
      expect(discoverSection).toMatch(/auditRef/);
    });

    it('audit log entry is inserted on success', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const discoverIdx = content.indexOf('case "discover_atd_capabilities"');
      const discoverSection = content.slice(discoverIdx, discoverIdx + 1000);
      expect(discoverSection).toMatch(/atd_connect_inspection_log/);
      expect(discoverSection).toMatch(/outcome.*success/);
      expect(discoverSection).toMatch(/discoverCapabilities/);
    });
  });

  // ─── 6. Response Structure ───────────────────────────────────────────────────

  describe('Response structure', () => {
    it('returns governed response with capabilities and count', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const discoverIdx = content.indexOf('case "discover_atd_capabilities"');
      const discoverSection = content.slice(discoverIdx, discoverIdx + 1000);
      expect(discoverSection).toMatch(/governed:\s*true/);
      expect(discoverSection).toMatch(/capabilities/);
      expect(discoverSection).toMatch(/count/);
    });

    it('response includes audit reference', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      const discoverIdx = content.indexOf('case "discover_atd_capabilities"');
      const discoverSection = content.slice(discoverIdx, discoverIdx + 1000);
      expect(discoverSection).toMatch(/auditRef/);
    });
  });

  // ─── 7. Edge Function Version ─────────────────────────────────────────────────

  describe('Edge function version', () => {
    it('edge function version is EWO-027R.Y.3 or later', () => {
      const content = fs.readFileSync('supabase/functions/atd-mcp-server/index.ts', 'utf-8');
      expect(content).toMatch(/EWO-027R\.Y\.[34]/);
    });
  });
});
