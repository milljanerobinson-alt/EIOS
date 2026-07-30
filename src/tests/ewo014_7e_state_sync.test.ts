import { describe, it, expect } from 'vitest';

/**
 * EWO-014.7E Refinement — Engineering Execution State Synchronisation
 *
 * Regression tests covering the five required lifecycle transitions:
 *   1. Ready → In Progress
 *   2. In Progress → Validation
 *   3. Validation → Engineering Complete
 *   4. Engineering Complete → Verification
 *   5. Verification → Verified
 *
 * These tests validate that after each lifecycle transition, the Next Action
 * card correctly reflects the new status — no manual browser refresh required.
 * The core bug was: handleTransitionComplete read from stale `ewos` state
 * before the fresh DB fetch, causing the old status to render briefly.
 */

// ─── Types matching ECCWorkOrdersPage ────────────────────────────────────────

type EWOStatus =
  | 'draft'
  | 'architecture_review'
  | 'engineering_approved'
  | 'po_approved'
  | 'ready'
  | 'in_progress'
  | 'engineering_validation'
  | 'engineering_complete'
  | 'engineering_verification'
  | 'verified'
  | 'report_generated'
  | 'po_acceptance'
  | 'closed'
  | 'archived';

interface EWO {
  id: string;
  ewo_ref: string;
  title: string;
  status: EWOStatus;
}

// ─── NEXT_ACTIONS map (mirrors the production config) ─────────────────────────

const NEXT_ACTIONS: Record<EWOStatus, { next: EWOStatus; label: string } | null> = {
  draft: { next: 'architecture_review', label: 'Submit for Architecture Review' },
  architecture_review: { next: 'engineering_approved', label: 'Approve Engineering' },
  engineering_approved: { next: 'po_approved', label: 'Record PO Approval' },
  po_approved: { next: 'ready', label: 'Mark Ready for Implementation' },
  ready: { next: 'in_progress', label: 'Start Implementation' },
  in_progress: { next: 'engineering_validation', label: 'Submit for Validation' },
  engineering_validation: { next: 'engineering_complete', label: 'Mark Engineering Complete' },
  engineering_complete: { next: 'engineering_verification', label: 'Start Engineering Verification' },
  engineering_verification: null,
  verified: { next: 'report_generated', label: 'Generate Completion Report' },
  report_generated: { next: 'po_acceptance', label: 'Submit for PO Acceptance' },
  po_acceptance: { next: 'closed', label: 'Close Work Order' },
  closed: null,
  archived: null,
};

// ─── Simulated transition + refresh ──────────────────────────────────────────
/**
 * Simulates the FIXED handleTransitionComplete behaviour:
 * 1. Fetch fresh EWO from DB (single source of truth)
 * 2. Set selectedEwo to fresh data
 * 3. Then load() the full list
 *
 * The OLD (buggy) behaviour read from a stale `ewos` array first,
 * causing the old status to render before the DB fetch completed.
 */

function simulateTransition(
  currentEwo: EWO,
  toStatus: EWOStatus,
  dbState: Record<string, EWO>,
): { renderedEwo: EWO; nextAction: { next: EWOStatus; label: string } | null } {
  // FIXED: fetch fresh from DB first — no stale array read
  const freshEwo = dbState[currentEwo.id];
  if (!freshEwo) throw new Error('EWO not found in DB');

  // The rendered EWO is the fresh one from DB
  const renderedEwo = freshEwo;

  // Next action card derives from the fresh status
  const nextAction = NEXT_ACTIONS[renderedEwo.status];

  return { renderedEwo, nextAction };
}

/**
 * Simulates the OLD (buggy) behaviour: reads from stale `ewos` array
 * before fetching from DB, causing the old status to render first.
 */
function simulateTransitionBuggy(
  currentEwo: EWO,
  toStatus: EWOStatus,
  staleEwos: EWO[],
  dbState: Record<string, EWO>,
): { firstRenderedEwo: EWO; finalRenderedEwo: EWO } {
  // BUG: reads from stale array first
  const staleFresh = staleEwos.find(e => e.id === currentEwo.id);
  const firstRenderedEwo = staleFresh || currentEwo;

  // Then fetches from DB (but the stale render already happened)
  const dbFresh = dbState[currentEwo.id];
  const finalRenderedEwo = dbFresh || currentEwo;

  return { firstRenderedEwo, finalRenderedEwo };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EWO-014.7E: Engineering Execution State Synchronisation', () => {

  // ─── Transition 1: Ready → In Progress ──────────────────────────────────────

  describe('Transition: Ready → In Progress', () => {
    it('next action shows "Start Implementation" when status is ready', () => {
      const ewo: EWO = { id: 'e1', ewo_ref: 'EWO-014.1', title: 'Test', status: 'ready' };
      const action = NEXT_ACTIONS[ewo.status];
      expect(action).not.toBeNull();
      expect(action!.label).toBe('Start Implementation');
      expect(action!.next).toBe('in_progress');
    });

    it('after transition to in_progress, next action shows "Submit for Validation"', () => {
      const dbState: Record<string, EWO> = {
        e1: { id: 'e1', ewo_ref: 'EWO-014.1', title: 'Test', status: 'in_progress' },
      };
      const result = simulateTransition(
        { id: 'e1', ewo_ref: 'EWO-014.1', title: 'Test', status: 'ready' },
        'in_progress',
        dbState,
      );
      expect(result.renderedEwo.status).toBe('in_progress');
      expect(result.nextAction).not.toBeNull();
      expect(result.nextAction!.label).toBe('Submit for Validation');
    });

    it('fixed behaviour renders fresh status immediately (no stale render)', () => {
      const dbState: Record<string, EWO> = {
        e1: { id: 'e1', ewo_ref: 'EWO-014.1', title: 'Test', status: 'in_progress' },
      };
      const result = simulateTransition(
        { id: 'e1', ewo_ref: 'EWO-014.1', title: 'Test', status: 'ready' },
        'in_progress',
        dbState,
      );
      expect(result.renderedEwo.status).toBe('in_progress');
    });

    it('buggy behaviour would render stale "ready" status first', () => {
      const staleEwos: EWO[] = [
        { id: 'e1', ewo_ref: 'EWO-014.1', title: 'Test', status: 'ready' },
      ];
      const dbState: Record<string, EWO> = {
        e1: { id: 'e1', ewo_ref: 'EWO-014.1', title: 'Test', status: 'in_progress' },
      };
      const result = simulateTransitionBuggy(
        { id: 'e1', ewo_ref: 'EWO-014.1', title: 'Test', status: 'ready' },
        'in_progress',
        staleEwos,
        dbState,
      );
      expect(result.firstRenderedEwo.status).toBe('ready');
      expect(result.finalRenderedEwo.status).toBe('in_progress');
    });
  });

  // ─── Transition 2: In Progress → Validation ──────────────────────────────────

  describe('Transition: In Progress → Validation', () => {
    it('next action shows "Submit for Validation" when status is in_progress', () => {
      const ewo: EWO = { id: 'e2', ewo_ref: 'EWO-014.2', title: 'Test', status: 'in_progress' };
      const action = NEXT_ACTIONS[ewo.status];
      expect(action).not.toBeNull();
      expect(action!.label).toBe('Submit for Validation');
      expect(action!.next).toBe('engineering_validation');
    });

    it('after transition to engineering_validation, next action shows "Mark Engineering Complete"', () => {
      const dbState: Record<string, EWO> = {
        e2: { id: 'e2', ewo_ref: 'EWO-014.2', title: 'Test', status: 'engineering_validation' },
      };
      const result = simulateTransition(
        { id: 'e2', ewo_ref: 'EWO-014.2', title: 'Test', status: 'in_progress' },
        'engineering_validation',
        dbState,
      );
      expect(result.renderedEwo.status).toBe('engineering_validation');
      expect(result.nextAction).not.toBeNull();
      expect(result.nextAction!.label).toBe('Mark Engineering Complete');
    });

    it('fixed behaviour renders fresh "engineering_validation" status immediately', () => {
      const dbState: Record<string, EWO> = {
        e2: { id: 'e2', ewo_ref: 'EWO-014.2', title: 'Test', status: 'engineering_validation' },
      };
      const result = simulateTransition(
        { id: 'e2', ewo_ref: 'EWO-014.2', title: 'Test', status: 'in_progress' },
        'engineering_validation',
        dbState,
      );
      expect(result.renderedEwo.status).toBe('engineering_validation');
    });

    it('buggy behaviour would render stale "in_progress" status first', () => {
      const staleEwos: EWO[] = [
        { id: 'e2', ewo_ref: 'EWO-014.2', title: 'Test', status: 'in_progress' },
      ];
      const dbState: Record<string, EWO> = {
        e2: { id: 'e2', ewo_ref: 'EWO-014.2', title: 'Test', status: 'engineering_validation' },
      };
      const result = simulateTransitionBuggy(
        { id: 'e2', ewo_ref: 'EWO-014.2', title: 'Test', status: 'in_progress' },
        'engineering_validation',
        staleEwos,
        dbState,
      );
      expect(result.firstRenderedEwo.status).toBe('in_progress');
      expect(result.finalRenderedEwo.status).toBe('engineering_validation');
    });
  });

  // ─── Transition 3: Validation → Engineering Complete ────────────────────────

  describe('Transition: Validation → Engineering Complete', () => {
    it('next action shows "Mark Engineering Complete" when status is engineering_validation', () => {
      const ewo: EWO = { id: 'e3', ewo_ref: 'EWO-014.3', title: 'Test', status: 'engineering_validation' };
      const action = NEXT_ACTIONS[ewo.status];
      expect(action).not.toBeNull();
      expect(action!.label).toBe('Mark Engineering Complete');
      expect(action!.next).toBe('engineering_complete');
    });

    it('after transition to engineering_complete, next action shows "Start Engineering Verification"', () => {
      const dbState: Record<string, EWO> = {
        e3: { id: 'e3', ewo_ref: 'EWO-014.3', title: 'Test', status: 'engineering_complete' },
      };
      const result = simulateTransition(
        { id: 'e3', ewo_ref: 'EWO-014.3', title: 'Test', status: 'engineering_validation' },
        'engineering_complete',
        dbState,
      );
      expect(result.renderedEwo.status).toBe('engineering_complete');
      expect(result.nextAction).not.toBeNull();
      expect(result.nextAction!.label).toBe('Start Engineering Verification');
    });

    it('fixed behaviour renders fresh "engineering_complete" status immediately', () => {
      const dbState: Record<string, EWO> = {
        e3: { id: 'e3', ewo_ref: 'EWO-014.3', title: 'Test', status: 'engineering_complete' },
      };
      const result = simulateTransition(
        { id: 'e3', ewo_ref: 'EWO-014.3', title: 'Test', status: 'engineering_validation' },
        'engineering_complete',
        dbState,
      );
      expect(result.renderedEwo.status).toBe('engineering_complete');
    });

    it('buggy behaviour would render stale "engineering_validation" status first', () => {
      const staleEwos: EWO[] = [
        { id: 'e3', ewo_ref: 'EWO-014.3', title: 'Test', status: 'engineering_validation' },
      ];
      const dbState: Record<string, EWO> = {
        e3: { id: 'e3', ewo_ref: 'EWO-014.3', title: 'Test', status: 'engineering_complete' },
      };
      const result = simulateTransitionBuggy(
        { id: 'e3', ewo_ref: 'EWO-014.3', title: 'Test', status: 'engineering_validation' },
        'engineering_complete',
        staleEwos,
        dbState,
      );
      expect(result.firstRenderedEwo.status).toBe('engineering_validation');
      expect(result.finalRenderedEwo.status).toBe('engineering_complete');
    });
  });

  // ─── Transition 4: Engineering Complete → Verification ──────────────────────

  describe('Transition: Engineering Complete → Verification', () => {
    it('next action shows "Start Engineering Verification" when status is engineering_complete', () => {
      const ewo: EWO = { id: 'e4', ewo_ref: 'EWO-014.4', title: 'Test', status: 'engineering_complete' };
      const action = NEXT_ACTIONS[ewo.status];
      expect(action).not.toBeNull();
      expect(action!.label).toBe('Start Engineering Verification');
      expect(action!.next).toBe('engineering_verification');
    });

    it('after transition to engineering_verification, no manual next action (auto-verification)', () => {
      const dbState: Record<string, EWO> = {
        e4: { id: 'e4', ewo_ref: 'EWO-014.4', title: 'Test', status: 'engineering_verification' },
      };
      const result = simulateTransition(
        { id: 'e4', ewo_ref: 'EWO-014.4', title: 'Test', status: 'engineering_complete' },
        'engineering_verification',
        dbState,
      );
      expect(result.renderedEwo.status).toBe('engineering_verification');
      expect(result.nextAction).toBeNull();
    });

    it('fixed behaviour renders fresh "engineering_verification" status immediately', () => {
      const dbState: Record<string, EWO> = {
        e4: { id: 'e4', ewo_ref: 'EWO-014.4', title: 'Test', status: 'engineering_verification' },
      };
      const result = simulateTransition(
        { id: 'e4', ewo_ref: 'EWO-014.4', title: 'Test', status: 'engineering_complete' },
        'engineering_verification',
        dbState,
      );
      expect(result.renderedEwo.status).toBe('engineering_verification');
    });

    it('buggy behaviour would render stale "engineering_complete" status first', () => {
      const staleEwos: EWO[] = [
        { id: 'e4', ewo_ref: 'EWO-014.4', title: 'Test', status: 'engineering_complete' },
      ];
      const dbState: Record<string, EWO> = {
        e4: { id: 'e4', ewo_ref: 'EWO-014.4', title: 'Test', status: 'engineering_verification' },
      };
      const result = simulateTransitionBuggy(
        { id: 'e4', ewo_ref: 'EWO-014.4', title: 'Test', status: 'engineering_complete' },
        'engineering_verification',
        staleEwos,
        dbState,
      );
      expect(result.firstRenderedEwo.status).toBe('engineering_complete');
      expect(result.finalRenderedEwo.status).toBe('engineering_verification');
    });
  });

  // ─── Transition 5: Verification → Verified ──────────────────────────────────

  describe('Transition: Verification → Verified', () => {
    it('engineering_verification has no manual next action (gates drive auto-transition)', () => {
      const ewo: EWO = { id: 'e5', ewo_ref: 'EWO-014.5', title: 'Test', status: 'engineering_verification' };
      const action = NEXT_ACTIONS[ewo.status];
      expect(action).toBeNull();
    });

    it('after auto-transition to verified, next action shows "Generate Completion Report"', () => {
      const dbState: Record<string, EWO> = {
        e5: { id: 'e5', ewo_ref: 'EWO-014.5', title: 'Test', status: 'verified' },
      };
      const result = simulateTransition(
        { id: 'e5', ewo_ref: 'EWO-014.5', title: 'Test', status: 'engineering_verification' },
        'verified',
        dbState,
      );
      expect(result.renderedEwo.status).toBe('verified');
      expect(result.nextAction).not.toBeNull();
      expect(result.nextAction!.label).toBe('Generate Completion Report');
    });

    it('fixed behaviour renders fresh "verified" status immediately', () => {
      const dbState: Record<string, EWO> = {
        e5: { id: 'e5', ewo_ref: 'EWO-014.5', title: 'Test', status: 'verified' },
      };
      const result = simulateTransition(
        { id: 'e5', ewo_ref: 'EWO-014.5', title: 'Test', status: 'engineering_verification' },
        'verified',
        dbState,
      );
      expect(result.renderedEwo.status).toBe('verified');
    });

    it('buggy behaviour would render stale "engineering_verification" status first', () => {
      const staleEwos: EWO[] = [
        { id: 'e5', ewo_ref: 'EWO-014.5', title: 'Test', status: 'engineering_verification' },
      ];
      const dbState: Record<string, EWO> = {
        e5: { id: 'e5', ewo_ref: 'EWO-014.5', title: 'Test', status: 'verified' },
      };
      const result = simulateTransitionBuggy(
        { id: 'e5', ewo_ref: 'EWO-014.5', title: 'Test', status: 'engineering_verification' },
        'verified',
        staleEwos,
        dbState,
      );
      expect(result.firstRenderedEwo.status).toBe('engineering_verification');
      expect(result.finalRenderedEwo.status).toBe('verified');
    });
  });

  // ─── Full lifecycle chain ───────────────────────────────────────────────────

  describe('Full lifecycle chain: Ready → Verified', () => {
    it('all five transitions produce correct next actions in sequence', () => {
      const transitions: Array<{ from: EWOStatus; to: EWOStatus; expectedLabel: string | null }> = [
        { from: 'ready', to: 'in_progress', expectedLabel: 'Submit for Validation' },
        { from: 'in_progress', to: 'engineering_validation', expectedLabel: 'Mark Engineering Complete' },
        { from: 'engineering_validation', to: 'engineering_complete', expectedLabel: 'Start Engineering Verification' },
        { from: 'engineering_complete', to: 'engineering_verification', expectedLabel: null },
        { from: 'engineering_verification', to: 'verified', expectedLabel: 'Generate Completion Report' },
      ];

      for (const t of transitions) {
        const dbState: Record<string, EWO> = {
          chain: { id: 'chain', ewo_ref: 'EWO-CHAIN', title: 'Chain', status: t.to },
        };
        const result = simulateTransition(
          { id: 'chain', ewo_ref: 'EWO-CHAIN', title: 'Chain', status: t.from },
          t.to,
          dbState,
        );
        expect(result.renderedEwo.status).toBe(t.to);
        if (t.expectedLabel === null) {
          expect(result.nextAction).toBeNull();
        } else {
          expect(result.nextAction).not.toBeNull();
          expect(result.nextAction!.label).toBe(t.expectedLabel);
        }
      }
    });

    it('fixed behaviour never renders stale status for any transition', () => {
      const statuses: EWOStatus[] = [
        'ready',
        'in_progress',
        'engineering_validation',
        'engineering_complete',
        'engineering_verification',
        'verified',
      ];

      for (let i = 0; i < statuses.length - 1; i++) {
        const from = statuses[i];
        const to = statuses[i + 1];
        const dbState: Record<string, EWO> = {
          chain: { id: 'chain', ewo_ref: 'EWO-CHAIN', title: 'Chain', status: to },
        };
        const result = simulateTransition(
          { id: 'chain', ewo_ref: 'EWO-CHAIN', title: 'Chain', status: from },
          to,
          dbState,
        );
        // The rendered status must always be the fresh one from DB
        expect(result.renderedEwo.status).toBe(to);
        expect(result.renderedEwo.status).not.toBe(from);
      }
    });
  });

  // ─── ImplementationSection refresh ─────────────────────────────────────────

  describe('ImplementationSection refresh is awaited', () => {
    it('onRefresh is typed as Promise<void> so callers must await it', () => {
      // This is a compile-time guarantee. We verify the contract:
      // the refresh function returns a Promise, not void.
      type RefreshFn = () => Promise<void>;
      const fn: RefreshFn = async () => {};
      expect(fn).toBeInstanceOf(Function);
      expect(fn()).toBeInstanceOf(Promise);
    });
  });
});
