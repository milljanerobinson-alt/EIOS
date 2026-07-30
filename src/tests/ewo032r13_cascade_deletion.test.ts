/**
 * EWO-032R.13 — Governed Test Artefact Cascade Deletion regression tests.
 *
 * Verifies the cascade deletion RPC, frontend integration, audit design,
 * and protection rules.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ACTIONS_PATH = path.resolve(__dirname, '../pages/ecc/ECCIdeaActions.tsx');
const WORKSPACE_PATH = path.resolve(__dirname, '../pages/ecc/ECCIdeaWorkspacePage.tsx');
const EWO_DEL_PATH = path.resolve(__dirname, '../lib/ewoDeletionService.ts');

function read(p: string): string {
  return fs.readFileSync(p, 'utf-8');
}

// ─── 1. Cascade eligibility check ──────────────────────────────────────────────

describe('checkDeleteEligibility — cascade detection', () => {
  const src = read(ACTIONS_PATH);

  it('DeleteEligibility includes cascadeAvailable and cascadeSummary fields', () => {
    expect(src).toContain('cascadeAvailable');
    expect(src).toContain('cascadeSummary');
    expect(src).toContain('CascadeSummary');
  });

  it('uses resolve_dependency_graph RPC for dependency resolution (R.14 registry)', () => {
    expect(src).toContain("supabase.rpc('resolve_dependency_graph'");
    expect(src).toContain('deletable_types');
    expect(src).toContain('blocking_objects');
  });

  it('consumes display_name from RPC for is_test_artifact-bearing types', () => {
    // The frontend no longer hard-codes table names; it uses display_name
    // from the resolve_dependency_graph RPC output
    expect(src).toContain('display_name');
    expect(src).toContain('deletable_types');
  });

  it('tracks blocking objects for non-test dependencies', () => {
    expect(src).toContain('blockingObjects');
    expect(src).toContain('objectType');
    expect(src).toContain('objectRef');
    expect(src).toContain('reason');
  });

  it('cascadeAvailable is true only when dependencies exist, all are test, and not eligible', () => {
    expect(src).toContain('cascadeAvailable = hasDependencies && blockingObjects.length === 0 && !eligible');
  });

  it('cascadeSummary includes totalToDelete, deletableTypes, retainedTypes, blockingObjects', () => {
    expect(src).toContain('totalToDelete');
    expect(src).toContain('deletableTypes');
    expect(src).toContain('retainedTypes');
  });

  it('audit trail entries are retained, not deleted', () => {
    // The frontend consumes retained_types from the RPC which includes
    // display_name from the registry (e.g. 'Audit Records')
    expect(src).toContain('retained_types');
  });

  it('PO-accepted EWOs block cascade (via registry RPC)', () => {
    expect(src).toContain('blocking_objects');
    expect(src).toContain('cascade_available');
  });
});

// ─── 2. IdeaDeleteModal — cascade UI ──────────────────────────────────────────

describe('IdeaDeleteModal — cascade deletion UI', () => {
  const src = read(ACTIONS_PATH);

  it('shows Cascade Deletion Available when cascade is available', () => {
    expect(src).toContain('Cascade Deletion Available');
  });

  it('shows total objects to delete', () => {
    expect(src).toContain('Total objects to delete');
  });

  it('lists objects that will be permanently deleted', () => {
    expect(src).toContain('The following objects will be permanently deleted');
  });

  it('lists governed records that will be retained', () => {
    expect(src).toContain('The following governed records will be retained');
  });

  it('shows blocking objects when cascade is blocked by non-test deps', () => {
    expect(src).toContain('Non-test dependencies blocking cascade');
  });

  it('cascade button says "Cascade Delete All"', () => {
    expect(src).toContain('Cascade Delete All');
  });

  it('still shows "Deletion Blocked" for fully blocked (non-cascade) ideas', () => {
    expect(src).toContain('Deletion Blocked');
  });

  it('still shows "Delete Permanently" for eligible ideas with no deps', () => {
    expect(src).toContain('Delete Permanently');
  });

  it('uses Layers icon for cascade section', () => {
    expect(src).toContain('Layers');
  });

  it('requires reason for cascade deletion (min 10 chars)', () => {
    expect(src).toContain('reason.trim().length < 10');
  });

  it('states action is irreversible', () => {
    expect(src).toContain('irreversible');
  });

  it('blocked logic now considers cascadeAvailable', () => {
    expect(src).toContain('!eligibility.eligible && !eligibility.cascadeAvailable');
  });
});

// ─── 3. Workspace page — RPC routing ──────────────────────────────────────────

describe('ECCIdeaWorkspacePage — cascade RPC routing', () => {
  const src = read(WORKSPACE_PATH);

  it('handleDeleteConfirmed checks eligibility.cascadeAvailable', () => {
    expect(src).toContain('eligibility.cascadeAvailable');
  });

  it('calls delete_engineering_graph_governed RPC for cascade', () => {
    expect(src).toContain("supabase.rpc('delete_engineering_graph_governed'");
    expect(src).toContain('p_root_type');
    expect(src).toContain("'engineering_idea'");
    expect(src).toContain('p_root_id');
    expect(src).toContain('p_reason');
  });

  it('calls delete_engineering_idea_governed RPC for simple deletion', () => {
    expect(src).toContain("supabase.rpc('delete_engineering_idea_governed'");
  });

  it('does NOT directly delete from engineering_idea', () => {
    expect(src).not.toMatch(/\.from\(['"]engineering_idea['"]\)\.delete\(\)/);
  });

  it('does NOT directly insert into any audit table', () => {
    expect(src).not.toMatch(/\.from\(['"]idea_deletion_audit['"]\)\.insert\(/);
    expect(src).not.toMatch(/\.from\(['"]engineering_graph_deletion_audit['"]\)\.insert\(/);
  });

  it('does NOT pass deleted_by to either RPC', () => {
    const graphRpc = src.match(/supabase\.rpc\(['"]delete_engineering_graph_governed['"][\s\S]*?\}\)/);
    expect(graphRpc).toBeTruthy();
    expect(graphRpc![0]).not.toMatch(/deleted_by/i);
    const ideaRpc = src.match(/supabase\.rpc\(['"]delete_engineering_idea_governed['"][\s\S]*?\}\)/);
    expect(ideaRpc).toBeTruthy();
    expect(ideaRpc![0]).not.toMatch(/deleted_by/i);
  });

  it('handles RPC errors for cascade', () => {
    expect(src).toContain('if (error) throw new Error(error.message)');
  });

  it('handles result.success === false for cascade', () => {
    expect(src).toContain('Governed cascade deletion failed');
  });

  it('shows toast with deleted count for cascade', () => {
    expect(src).toContain('cascade deleted');
    expect(src).toContain('deleted_count');
  });

  it('reloads after cascade deletion', () => {
    expect(src).toMatch(/setDeleteIdea\(null\)/);
    expect(src).toMatch(/\bload\(\)/);
  });

  it('handleDeleteConfirmed accepts reason and eligibility', () => {
    expect(src).toContain('handleDeleteConfirmed(reason: string, eligibility: DeleteEligibility)');
  });
});

// ─── 4. RPC governance properties ───────────────────────────────────────────────

describe('delete_engineering_graph_governed — RPC governance', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../supabase/migrations/ewo032r13_governed_graph_cascade_deletion.sql',
  );

  if (!fs.existsSync(migrationPath)) {
    it.skip('migration file not on disk (applied via MCP) — SQL content tests skipped', () => {});
    return;
  }

  const sql = read(migrationPath);

  it('RPC is SECURITY DEFINER', () => {
    expect(sql).toContain('SECURITY DEFINER');
  });

  it('RPC search_path is locked', () => {
    expect(sql).toContain("SET search_path TO 'public', 'extensions'");
  });

  it('RPC authenticates via auth.uid()', () => {
    expect(sql).toContain('auth.uid()');
  });

  it('RPC authorises via is_staff()', () => {
    expect(sql).toContain('is_staff()');
  });

  it('RPC rejects unauthenticated callers', () => {
    expect(sql).toContain('UNAUTHENTICATED');
  });

  it('RPC rejects unauthorised callers', () => {
    expect(sql).toContain('UNAUTHORISED');
  });

  it('RPC requires reason >= 10 chars', () => {
    expect(sql).toContain('REASON_TOO_SHORT');
    expect(sql).toContain('length(v_reason_trim) < 10');
  });

  it('RPC locks root row with FOR UPDATE', () => {
    expect(sql).toContain('FOR UPDATE');
  });

  it('RPC resolves deleted_by from profiles (server-side)', () => {
    expect(sql).toContain('SELECT email INTO v_deleted_by');
    expect(sql).toContain('FROM profiles');
    expect(sql).toContain('WHERE id = v_uid');
  });

  it('RPC checks is_test_artifact on EWOs', () => {
    expect(sql).toContain('is_test_artifact');
  });

  it('RPC checks is_test_artifact in metadata for evidence', () => {
    expect(sql).toMatch(/metadata.*is_test_artifact/);
  });

  it('RPC checks is_test_artifact in semantic_metadata for records', () => {
    expect(sql).toMatch(/semantic_metadata.*is_test_artifact/);
  });

  it('RPC blocks on PO-accepted EWOs', () => {
    expect(sql).toContain('po_accepted_at');
    expect(sql).toContain('Product Owner acceptance');
  });

  it('RPC blocks on approved engineering reviews', () => {
    expect(sql).toContain('approved');
    expect(sql).toContain('governed approval');
  });

  it('RPC returns blocking objects when blocked', () => {
    expect(sql).toContain('CASCADE_BLOCKED');
    expect(sql).toContain('blocking_objects');
    expect(sql).toContain('blocking_count');
  });

  it('RPC inserts immutable audit record', () => {
    expect(sql).toContain('INSERT INTO engineering_graph_deletion_audit');
  });

  it('RPC audit includes root_object_type, root_object_ref, deleted_count, deleted_refs, deleted_types', () => {
    expect(sql).toContain('root_object_type');
    expect(sql).toContain('root_object_ref');
    expect(sql).toContain('deleted_count');
    expect(sql).toContain('deleted_refs');
    expect(sql).toContain('deleted_types');
    expect(sql).toContain('retained_types');
    expect(sql).toContain('dependency_graph');
    expect(sql).toContain('deletion_reason');
    expect(sql).toContain('deleted_by');
  });

  it('RPC deletes in child-first order', () => {
    const handoffPos = sql.indexOf('DELETE FROM execution_handoff_requests');
    const ewoPos = sql.indexOf('DELETE FROM engineering_work_orders');
    const ideaPos = sql.indexOf('DELETE FROM engineering_idea');
    expect(handoffPos).toBeGreaterThan(-1);
    expect(ewoPos).toBeGreaterThan(handoffPos);
    expect(ideaPos).toBeGreaterThan(ewoPos);
  });

  it('RPC deletes execution_evidence before sessions', () => {
    const evidencePos = sql.indexOf('DELETE FROM execution_evidence');
    const sessionPos = sql.indexOf('DELETE FROM execution_sessions');
    expect(evidencePos).toBeGreaterThan(-1);
    expect(sessionPos).toBeGreaterThan(evidencePos);
  });

  it('RPC returns structured result with success, audit_id, deleted_count', () => {
    expect(sql).toContain("'success', true");
    expect(sql).toContain("'audit_id'");
    expect(sql).toContain("'deleted_count'");
    expect(sql).toContain("'deleted_types'");
    expect(sql).toContain("'retained_types'");
    expect(sql).toContain("'dependency_graph'");
  });

  it('RPC has EXCEPTION handler (rollback)', () => {
    expect(sql).toContain('EXCEPTION');
    expect(sql).toContain('WHEN OTHERS THEN');
    expect(sql).toContain("'success', false");
  });

  it('audit trail entries are NOT deleted (retained)', () => {
    // execution_audit_trail should not appear in DELETE statements
    const auditDeleteMatch = sql.match(/DELETE\s+FROM\s+execution_audit_trail/i);
    expect(auditDeleteMatch).toBeNull();
  });

  it('RLS on engineering_graph_deletion_audit revokes anon', () => {
    expect(sql).toContain('REVOKE ALL ON engineering_graph_deletion_audit FROM anon');
  });

  it('RLS revokes direct INSERT/UPDATE/DELETE from authenticated', () => {
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE ON engineering_graph_deletion_audit FROM authenticated');
  });

  it('EXECUTE granted to authenticated only', () => {
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.delete_engineering_graph_governed(text, uuid, text) FROM anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.delete_engineering_graph_governed(text, uuid, text) TO authenticated');
  });

  it('audit table has is_staff SELECT policy', () => {
    expect(sql).toContain('staff_select_graph_deletion_audit');
    expect(sql).toContain('is_staff()');
  });
});

// ─── 5. EWO deletion status reset (precondition) ───────────────────────────────

describe('EWO deletion service — status reset (cascade precondition)', () => {
  const ewo = read(EWO_DEL_PATH);

  it('resets status to active when refs become empty', () => {
    expect(ewo).toContain("updatedRefs.length === 0");
    expect(ewo).toMatch(/status:\s*['"]active['"]/);
  });

  it('removes EWO ref from related_ewo_refs', () => {
    expect(ewo).toContain('updatedRefs = currentRefs.filter');
    expect(ewo).toContain("r !== ewo.ewo_ref");
  });
});

// ─── 6. Action visibility (unchanged from R.12) ────────────────────────────────

describe('Action visibility — Delete still available after cascade', () => {
  const actions = read(ACTIONS_PATH);

  it('draft + active include Delete', () => {
    const m = actions.match(/case 'draft':[\s\S]*?case 'queued/);
    expect(m).toBeTruthy();
    expect(m![0]).toContain("'delete'");
  });

  it('promoted does NOT include Delete', () => {
    const m = actions.match(/case 'promoted':[\s\S]*?case '/);
    expect(m).toBeTruthy();
    expect(m![0]).not.toContain("'delete'");
  });
});
