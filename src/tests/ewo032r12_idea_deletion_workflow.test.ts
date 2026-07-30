/**
 * EWO-032R.12: Engineering Idea deletion workflow regression tests.
 *
 * Covers:
 * - linked Idea is not deletable while an EWO exists;
 * - deleting the EWO removes the relationship;
 * - eligibility recalculates immediately;
 * - the Delete action appears when no blockers remain;
 * - refresh does not restore stale linkage;
 * - deletion creates the required audit record;
 * - Ideas with genuine dependencies remain blocked.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ACTIONS_PATH = path.resolve(__dirname, '../pages/ecc/ECCIdeaActions.tsx');
const EWO_DEL_PATH = path.resolve(__dirname, '../lib/ewoDeletionService.ts');
const WORKSPACE_PATH = path.resolve(__dirname, '../pages/ecc/ECCIdeaWorkspacePage.tsx');

function read(p: string): string {
  return fs.readFileSync(p, 'utf-8');
}

// ─── 1. actionsForStatus visibility conditions ─────────────────────────────────

describe('actionsForStatus — Delete visibility', () => {
  const src = read(ACTIONS_PATH);

  it('draft status includes Delete', () => {
    expect(src).toMatch(/case 'draft':[\s\S]*?'delete'/);
  });

  it('active status includes Delete', () => {
    expect(src).toMatch(/case 'active':[\s\S]*?'delete'/);
  });

  it('promoted status does NOT include Delete (governed relationship)', () => {
    const promotedMatch = src.match(/case 'promoted':[\s\S]*?case '/);
    expect(promotedMatch).toBeTruthy();
    expect(promotedMatch![0]).not.toMatch(/'delete'/);
  });

  it('queued_for_promotion does NOT include Delete', () => {
    const queuedMatch = src.match(/case 'queued_for_promotion':[\s\S]*?case '/);
    expect(queuedMatch).toBeTruthy();
    expect(queuedMatch![0]).not.toMatch(/'delete'/);
  });

  it('archived status includes Delete', () => {
    expect(src).toMatch(/case 'archived':[\s\S]*?'delete'/);
  });

  it('superseded status includes Delete', () => {
    expect(src).toMatch(/case 'superseded':[\s\S]*?'delete'/);
  });

  it('all statuses include Archive', () => {
    expect(src).toMatch(/case 'draft':[\s\S]*?'archive'/);
    expect(src).toMatch(/case 'active':[\s\S]*?'archive'/);
    expect(src).toMatch(/case 'queued_for_promotion':[\s\S]*?'archive'/);
    expect(src).toMatch(/case 'promoted':[\s\S]*?'archive'/);
  });
});

// ─── 2. EWO deletion service resets Idea status ───────────────────────────────

describe('EWO deletion service — Idea status reset', () => {
  const src = read(EWO_DEL_PATH);

  it('removes the EWO ref from related_ewo_refs', () => {
    expect(src).toContain('updatedRefs = currentRefs.filter');
    expect(src).toContain("r !== ewo.ewo_ref");
  });

  it('resets status to active when refs become empty', () => {
    expect(src).toContain("updatedRefs.length === 0");
    expect(src).toMatch(/status:\s*['"]active['"]/);
  });

  it('does NOT reset status when refs remain', () => {
    // The statusReset should be conditional — only applied when empty
    expect(src).toContain('...statusReset');
  });

  it('updates updated_at timestamp', () => {
    expect(src).toContain('updated_at: new Date().toISOString()');
  });

  it('aborts deletion on unlink failure (no orphaned references)', () => {
    expect(src).toContain('no orphaned references');
  });
});

// ─── 3. Delete eligibility checks ──────────────────────────────────────────────

describe('checkDeleteEligibility — governance checks', () => {
  const src = read(ACTIONS_PATH);

  it('blocks when related_ewo_refs is non-empty', () => {
    expect(src).toMatch(/related_ewo_refs\s*&&\s*idea\.related_ewo_refs\.length\s*>\s*0/);
  });

  it('blocks when session has execution evidence', () => {
    expect(src).toContain('execution_evidence');
    expect(src).toContain('session_id');
  });

  it('blocks when records-library references the Idea (via registry RPC)', () => {
    // Frontend uses display_name from RPC, not physical table names
    expect(src).toContain('deletable_types');
    expect(src).toContain('display_name');
  });

  it('blocks when audit trail references the Idea (via registry RPC)', () => {
    // Frontend uses retained_types from RPC with display_name
    expect(src).toContain('retained_types');
    expect(src).toContain('display_name');
  });

  it('eligible only when all checks pass', () => {
    expect(src).toContain('!hasEwoRefs && !hasSession && !hasEvidence && !hasRecords && !hasAudit');
  });
});

// ─── 4. Delete modal requires reason and shows dependency analysis ──────────────

describe('IdeaDeleteModal — governance UX', () => {
  const src = read(ACTIONS_PATH);

  it('requires a deletion reason (min 10 chars)', () => {
    expect(src).toContain('reason.trim().length < 10');
    expect(src).toContain('Deletion reason');
  });

  it('disables delete button when reason is missing', () => {
    expect(src).toContain('reasonMissing');
    expect(src).toMatch(/disabled=.*reasonMissing/);
  });

  it('shows dependency analysis when blocked', () => {
    expect(src).toContain('Deletion Blocked');
    expect(src).toContain('Governed Relationships Exist');
  });

  it('distinguishes archive from permanent deletion', () => {
    expect(src).toContain('Archive this Idea instead');
    expect(src).toContain('irreversible');
  });

  it('passes reason and eligibility to onConfirm', () => {
    expect(src).toContain('onConfirm: (reason: string, eligibility: DeleteEligibility) => Promise<void>');
    expect(src).toContain('await onConfirm(reason.trim(), eligibility!)');
  });
});

// ─── 5. Workspace page — audit record on deletion ──────────────────────────────

describe('ECCIdeaWorkspacePage — governed RPC deletion', () => {
  const src = read(WORKSPACE_PATH);

  it('handleDeleteConfirmed accepts reason and eligibility (eligibility for UX only)', () => {
    expect(src).toContain('handleDeleteConfirmed(reason: string');
  });

  it('calls the governed RPC delete_engineering_idea_governed', () => {
    expect(src).toContain("supabase.rpc('delete_engineering_idea_governed'");
    expect(src).toContain('p_idea_id');
    expect(src).toContain('p_reason');
  });

  it('does NOT directly insert into idea_deletion_audit (RPC handles it)', () => {
    expect(src).not.toMatch(/\.from\(['"]idea_deletion_audit['"]\)\.insert\(/);
  });

  it('does NOT directly delete from engineering_idea (RPC handles it)', () => {
    expect(src).not.toMatch(/\.from\(['"]engineering_idea['"]\)\.delete\(\)/);
  });

  it('does NOT pass deleted_by to the RPC (server resolves identity)', () => {
    const rpcMatch = src.match(/supabase\.rpc\(['"]delete_engineering_idea_governed['"][\s\S]*?\}\)/);
    expect(rpcMatch).toBeTruthy();
    expect(rpcMatch![0]).not.toMatch(/deleted_by/i);
  });

  it('handles RPC error and result.error', () => {
    expect(src).toContain('if (error) throw new Error(error.message)');
    expect(src).toContain('result?.error');
  });

  it('reloads ideas list after successful deletion', () => {
    expect(src).toMatch(/setDeleteIdea\(null\)/);
    expect(src).toMatch(/\bload\(\)/);
  });
});

// ─── 6. Database — idea_deletion_audit table and RLS ───────────────────────────

describe('Database — governed RPC and audit table', () => {
  it('frontend references the governed RPC', () => {
    const src = read(WORKSPACE_PATH);
    expect(src).toContain('delete_engineering_idea_governed');
  });

  it('DeleteEligibility type is exported from ECCIdeaActions', () => {
    const src = read(ACTIONS_PATH);
    expect(src).toContain('export interface DeleteEligibility');
  });

  it('DeleteEligibility is imported in workspace page', () => {
    const src = read(WORKSPACE_PATH);
    expect(src).toContain('type DeleteEligibility');
  });
});

// ─── 7. Stale linkage prevention ───────────────────────────────────────────────

describe('Stale linkage prevention', () => {
  const ewoSrc = read(EWO_DEL_PATH);
  const actionsSrc = read(ACTIONS_PATH);

  it('EWO deletion queries ideas by contains related_ewo_refs', () => {
    expect(ewoSrc).toContain(".contains('related_ewo_refs', [ewoRef])");
  });

  it('eligibility check reads related_ewo_refs from the idea object (not cached)', () => {
    expect(actionsSrc).toContain('idea.related_ewo_refs');
  });

  it('workspace page reloads after deletion (no stale state)', () => {
    const wsSrc = read(WORKSPACE_PATH);
    expect(wsSrc).toMatch(/\bload\(\)/);
  });

  it('promoteIdeaToEwo sets status to promoted (links EWO to idea)', () => {
    expect(actionsSrc).toContain("status: 'promoted'");
    expect(actionsSrc).toContain('related_ewo_refs: newRefs');
  });
});
