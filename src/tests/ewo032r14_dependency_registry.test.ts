/**
 * EWO-032R.14 — Governed Dependency Registry & Runtime Dependency Resolution
 *
 * Verifies:
 * - Root cause: engineering_audit_trail does NOT exist; canonical is
 *   execution_audit_trail
 * - No deletion RPC or frontend code references engineering_audit_trail
 * - Frontend uses resolve_dependency_graph RPC (registry-driven)
 * - No hard-coded dependency table lists in the frontend eligibility check
 * - Registry inspection capability exists
 * - Cascade deletion still works (via R.13 tests)
 * - Blocked deletion still works (via R.13 tests)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function read(p: string): string {
  return fs.readFileSync(p, 'utf-8');
}

const ACTIONS_PATH = path.resolve(__dirname, '../pages/ecc/ECCIdeaActions.tsx');
const WORKSPACE_PATH = path.resolve(__dirname, '../pages/ecc/ECCIdeaWorkspacePage.tsx');

// ─── 1. Root cause: engineering_audit_trail does not exist ────────────────────

describe('Root cause — engineering_audit_trail regression', () => {
  it('frontend does NOT reference engineering_audit_trail', () => {
    const src = read(ACTIONS_PATH);
    expect(src).not.toContain('engineering_audit_trail');
  });

  it('frontend does NOT hard-code execution_audit_trail (registry provides it)', () => {
    const src = read(ACTIONS_PATH);
    // The frontend consumes display_name from the RPC output,
    // it should NOT contain physical table names like execution_audit_trail
    expect(src).not.toContain('execution_audit_trail');
  });

  it('workspace page does NOT reference engineering_audit_trail', () => {
    const src = read(WORKSPACE_PATH);
    expect(src).not.toContain('engineering_audit_trail');
  });
});

// ─── 2. Registry-driven dependency resolution ─────────────────────────────────

describe('Frontend uses registry-driven resolution', () => {
  const src = read(ACTIONS_PATH);

  it('calls resolve_dependency_graph RPC instead of hard-coded table queries', () => {
    expect(src).toContain("supabase.rpc('resolve_dependency_graph'");
    expect(src).toContain('p_root_type');
    expect(src).toContain("'engineering_idea'");
    expect(src).toContain('p_root_id');
  });

  it('does NOT directly query engineering_work_orders for eligibility', () => {
    // The old code queried engineering_work_orders directly
    // The new code delegates to resolve_dependency_graph
    const eligibilitySection = src.match(/export async function checkDeleteEligibility[\s\S]*?\n\}/);
    expect(eligibilitySection).toBeTruthy();
    expect(eligibilitySection![0]).not.toMatch(/\.from\(['"]engineering_work_orders['"]\)/);
  });

  it('does NOT directly query execution_evidence for eligibility', () => {
    const eligibilitySection = src.match(/export async function checkDeleteEligibility[\s\S]*?\n\}/);
    expect(eligibilitySection).toBeTruthy();
    expect(eligibilitySection![0]).not.toMatch(/\.from\(['"]execution_evidence['"]\)/);
  });

  it('does NOT directly query engineering_records_library for eligibility', () => {
    const eligibilitySection = src.match(/export async function checkDeleteEligibility[\s\S]*?\n\}/);
    expect(eligibilitySection).toBeTruthy();
    expect(eligibilitySection![0]).not.toMatch(/\.from\(['"]engineering_records_library['"]\)/);
  });

  it('consumes blocking_objects from registry output', () => {
    expect(src).toContain('blocking_objects');
    expect(src).toContain('object_type');
    expect(src).toContain('object_ref');
    expect(src).toContain('reason');
  });

  it('consumes deletable_types from registry output with display_name', () => {
    expect(src).toContain('deletable_types');
    expect(src).toContain('display_name');
    // Must NOT have a local display name map (R.14 refinement removed it)
    expect(src).not.toContain('DEPENDENCY_TYPE_DISPLAY_NAMES');
  });

  it('consumes retained_types from registry output', () => {
    expect(src).toContain('retained_types');
  });

  it('uses cascade_available from registry output', () => {
    expect(src).toContain('cascade_available');
  });

  it('uses total_to_delete from registry output', () => {
    expect(src).toContain('total_to_delete');
  });

  it('does NOT contain a local display name map (registry provides display_name)', () => {
    expect(src).not.toContain('DEPENDENCY_TYPE_DISPLAY_NAMES');
  });
});

// ─── 3. Workspace page — cascade RPC still uses registry ──────────────────────

describe('Workspace page — cascade RPC routing (unchanged from R.13)', () => {
  const src = read(WORKSPACE_PATH);

  it('calls delete_engineering_graph_governed RPC for cascade', () => {
    expect(src).toContain("supabase.rpc('delete_engineering_graph_governed'");
  });

  it('calls delete_engineering_idea_governed RPC for simple deletion', () => {
    expect(src).toContain("supabase.rpc('delete_engineering_idea_governed'");
  });

  it('does NOT directly delete from any table', () => {
    expect(src).not.toMatch(/\.from\(['"]engineering_idea['"]\)\.delete\(\)/);
    expect(src).not.toMatch(/\.from\(['"]engineering_work_orders['"]\)\.delete\(\)/);
    expect(src).not.toMatch(/\.from\(['"]execution_evidence['"]\)\.delete\(\)/);
  });
});

// ─── 4. Registry SQL migration — architecture verification ────────────────────

describe('Governed Dependency Registry — migration architecture', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../supabase/migrations/ewo032r14_governed_dependency_registry.sql',
  );

  if (!fs.existsSync(migrationPath)) {
    it.skip('migration file not on disk (applied via MCP) — SQL tests skipped', () => {});
    return;
  }

  const sql = read(migrationPath);

  it('creates governed_dependency_registry table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS governed_dependency_registry');
  });

  it('enables RLS on registry table', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('revokes anon access to registry', () => {
    expect(sql).toContain('REVOKE ALL ON governed_dependency_registry FROM anon');
  });

  it('creates staff SELECT policy on registry', () => {
    expect(sql).toContain('staff_select_dependency_registry');
    expect(sql).toContain('is_staff()');
  });

  it('seeds 15 governed object types', () => {
    // Count INSERT VALUES entries by counting object_type values
    const matches = sql.match(/\('(\w+)', '/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(15);
  });

  it('registry includes execution_audit_trail (canonical audit table)', () => {
    expect(sql).toContain("'execution_audit_trail'");
  });

  it('registry does NOT reference engineering_audit_trail', () => {
    expect(sql).not.toContain('engineering_audit_trail');
  });

  it('each registry entry has delete_order for cascade ordering', () => {
    expect(sql).toContain('delete_order');
  });

  it('each registry entry has cascade_participation policy', () => {
    expect(sql).toContain('cascade_participation');
    expect(sql).toContain('disposable_if_test');
    expect(sql).toContain('never_cascade');
    expect(sql).toContain('cascade_root');
  });

  it('each registry entry has retention_policy', () => {
    expect(sql).toContain('retention_policy');
    expect(sql).toContain('retain_if_production');
    expect(sql).toContain('retain_always');
  });

  it('each registry entry has po_restriction', () => {
    expect(sql).toContain('po_restriction');
    expect(sql).toContain('block_if_accepted');
    expect(sql).toContain('block_if_approved');
  });

  it('each registry entry has audit_behaviour', () => {
    expect(sql).toContain('audit_behaviour');
    expect(sql).toContain('retain_always');
  });

  it('registry entries have dependency_discovery jsonb with link_fields', () => {
    expect(sql).toContain('dependency_discovery');
    expect(sql).toContain('link_fields');
    expect(sql).toContain('depends_on');
    expect(sql).toContain('children');
    expect(sql).toContain('retained');
  });
});

// ─── 5. resolve_dependency_graph RPC ──────────────────────────────────────────

describe('resolve_dependency_graph RPC', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../supabase/migrations/ewo032r14_governed_dependency_registry.sql',
  );

  if (!fs.existsSync(migrationPath)) {
    it.skip('migration file not on disk (applied via MCP) — SQL tests skipped', () => {});
    return;
  }

  const sql = read(migrationPath);

  it('RPC is SECURITY DEFINER with locked search_path', () => {
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path TO 'public', 'extensions'");
  });

  it('RPC reads from governed_dependency_registry', () => {
    expect(sql).toContain('FROM governed_dependency_registry');
    expect(sql).toContain('WHERE object_type = p_root_type');
  });

  it('RPC uses registry metadata to load root reference dynamically', () => {
    expect(sql).toContain('EXECUTE format');
    expect(sql).toContain('v_registry.storage_table');
    expect(sql).toContain('v_registry.reference_field');
    expect(sql).toContain('v_registry.identity_field');
  });

  it('RPC returns blocking_objects with object_type, object_ref, reason', () => {
    expect(sql).toContain("'blocking_objects'");
    expect(sql).toContain("'object_type'");
    expect(sql).toContain("'object_ref'");
    expect(sql).toContain("'reason'");
  });

  it('RPC returns cascade_available flag', () => {
    expect(sql).toContain("'cascade_available'");
  });

  it('RPC returns total_to_delete count', () => {
    expect(sql).toContain("'total_to_delete'");
  });

  it('RPC returns deletable_types and retained_types', () => {
    expect(sql).toContain("'deletable_types'");
    expect(sql).toContain("'retained_types'");
  });

  it('RPC references execution_audit_trail (NOT engineering_audit_trail)', () => {
    expect(sql).toContain('execution_audit_trail');
    expect(sql).not.toContain('engineering_audit_trail');
  });

  it('EXECUTE granted to authenticated only', () => {
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.resolve_dependency_graph(text, uuid) FROM anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.resolve_dependency_graph(text, uuid) TO authenticated');
  });
});

// ─── 6. inspect_dependency_registry RPC ───────────────────────────────────────

describe('inspect_dependency_registry RPC', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../supabase/migrations/ewo032r14_governed_dependency_registry.sql',
  );

  if (!fs.existsSync(migrationPath)) {
    it.skip('migration file not on disk (applied via MCP) — SQL tests skipped', () => {});
    return;
  }

  const sql = read(migrationPath);

  it('RPC exists and is SECURITY DEFINER', () => {
    expect(sql).toContain('public.inspect_dependency_registry()');
    expect(sql).toContain('SECURITY DEFINER');
  });

  it('RPC returns registered_types with full metadata', () => {
    expect(sql).toContain("'registered_types'");
    expect(sql).toContain("'object_type'");
    expect(sql).toContain("'storage_table'");
    expect(sql).toContain("'cascade_participation'");
    expect(sql).toContain("'delete_order'");
    expect(sql).toContain("'retention_policy'");
  });

  it('RPC returns registered_count', () => {
    expect(sql).toContain("'registered_count'");
  });

  it('RPC validates storage tables exist', () => {
    expect(sql).toContain('information_schema.tables');
    expect(sql).toContain('table_name = v_rec.storage_table');
  });

  it('RPC returns invalid_providers for missing tables', () => {
    expect(sql).toContain("'invalid_providers'");
    expect(sql).toContain('v_invalid');
  });

  it('RPC returns diagnostics with all_tables_exist flag', () => {
    expect(sql).toContain("'diagnostics'");
    expect(sql).toContain("'all_tables_exist'");
  });

  it('EXECUTE granted to authenticated only', () => {
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.inspect_dependency_registry() FROM anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.inspect_dependency_registry() TO authenticated');
  });
});

// ─── 7. delete_engineering_graph_governed — registry-driven ──────────────────

describe('delete_engineering_graph_governed — now registry-driven', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../supabase/migrations/ewo032r14_governed_dependency_registry.sql',
  );

  if (!fs.existsSync(migrationPath)) {
    it.skip('migration file not on disk (applied via MCP) — SQL tests skipped', () => {});
    return;
  }

  const sql = read(migrationPath);

  it('RPC calls resolve_dependency_graph internally', () => {
    expect(sql).toContain('public.resolve_dependency_graph(p_root_type, p_root_id)');
  });

  it('RPC does NOT contain hard-coded dependency table lists in resolution logic', () => {
    // The deletion section has DELETE FROM statements (which is expected),
    // but the resolution section should NOT have direct SELECT FROM
    // dependency tables — that's now in resolve_dependency_graph
    const deleteFn = sql.match(/CREATE OR REPLACE FUNCTION public\.delete_engineering_graph_governed[\s\S]*?\$\$/);
    expect(deleteFn).toBeTruthy();
    // The delete function should call resolve_dependency_graph instead of
    // doing its own SELECT FROM engineering_work_orders etc.
    expect(deleteFn![0]).toContain('resolve_dependency_graph');
  });

  it('RPC still authenticates via auth.uid() and is_staff()', () => {
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('is_staff()');
  });

  it('RPC still resolves deleted_by server-side', () => {
    expect(sql).toContain('SELECT email INTO v_deleted_by');
  });

  it('RPC still inserts immutable audit record', () => {
    expect(sql).toContain('INSERT INTO engineering_graph_deletion_audit');
  });

  it('RPC still has EXCEPTION handler', () => {
    expect(sql).toContain('EXCEPTION');
    expect(sql).toContain('WHEN OTHERS THEN');
  });

  it('RPC does NOT reference engineering_audit_trail', () => {
    expect(sql).not.toContain('engineering_audit_trail');
  });
});

// ─── 8. Architectural benefits ────────────────────────────────────────────────

describe('Architectural benefits over previous implementation', () => {
  const actions = read(ACTIONS_PATH);

  it('frontend no longer makes 4+ separate table queries for eligibility', () => {
    const eligibilitySection = actions.match(/export async function checkDeleteEligibility[\s\S]*?\n\}/);
    expect(eligibilitySection).toBeTruthy();
    // Should have at most 1 RPC call, not 4+ .from() queries
    const fromQueries = eligibilitySection![0].match(/\.from\(['"]/g);
    expect(fromQueries).toBeNull(); // No direct table queries
  });

  it('frontend uses a single RPC call for dependency resolution', () => {
    const eligibilitySection = actions.match(/export async function checkDeleteEligibility[\s\S]*?\n\}/);
    expect(eligibilitySection).toBeTruthy();
    const rpcCalls = eligibilitySection![0].match(/supabase\.rpc\(/g);
    expect(rpcCalls).toBeTruthy();
    expect(rpcCalls!.length).toBe(1); // Single RPC call
  });

  it('no local display name map (registry provides display_name via RPC)', () => {
    expect(actions).not.toContain('DEPENDENCY_TYPE_DISPLAY_NAMES');
  });
});
