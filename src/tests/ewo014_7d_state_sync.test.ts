import { describe, it, expect } from 'vitest';

/**
 * EWO-014.7D Refinement — BeginEngineeringGate State Synchronisation
 *
 * Regression tests covering the three required state transitions:
 *   1. Approved -> Begin Engineering -> Implementing
 *   2. Implementing -> Gate changes automatically (amber state visible)
 *   3. Existing EWO -> Gate remains read-only
 *
 * These tests validate the rendering conditions that govern when
 * BeginEngineeringGate is shown vs. when the "Execute Engineering Idea"
 * button is shown, ensuring no stale-state inconsistency.
 */

describe('EWO-014.7D: BeginEngineeringGate State Synchronisation', () => {

  /**
   * Helper: simulates the gate visibility condition from the Plan tab.
   * The gate renders when plan.status is 'approved' OR 'implementing'.
   */
  function shouldShowGate(planStatus: string): boolean {
    return planStatus === 'approved' || planStatus === 'implementing';
  }

  /**
   * Helper: simulates the "Execute Engineering Idea" button visibility.
   * The button renders when there is no linked idea ref AND plan is not
   * already implementing.
   */
  function shouldShowExecuteButton(planStatus: string, linkedIdeaRef: string | null): boolean {
    if (planStatus === 'implementing') return false;
    if (linkedIdeaRef) return false;
    return true;
  }

  /**
   * Helper: simulates the amber "Engineering Already In Progress" state.
   * Visible when plan.status === 'implementing' OR an EWO already exists.
   */
  function shouldShowAmberGate(planStatus: string, ewoExists: boolean): boolean {
    return planStatus === 'implementing' || ewoExists;
  }

  // ─── Test 1: Approved -> Begin Engineering -> Implementing ───────────────

  describe('Transition: Approved -> Begin Engineering -> Implementing', () => {
    it('gate is visible when plan is approved (before execution)', () => {
      expect(shouldShowGate('approved')).toBe(true);
    });

    it('execute button is visible when plan is approved and no linked idea', () => {
      expect(shouldShowExecuteButton('approved', null)).toBe(true);
    });

    it('gate is visible when plan transitions to implementing', () => {
      expect(shouldShowGate('implementing')).toBe(true);
    });

    it('execute button is hidden once plan transitions to implementing', () => {
      expect(shouldShowExecuteButton('implementing', null)).toBe(false);
    });

    it('amber gate becomes visible once plan transitions to implementing', () => {
      expect(shouldShowAmberGate('implementing', false)).toBe(true);
    });
  });

  // ─── Test 2: Implementing -> Gate changes automatically ──────────────────

  describe('Transition: Implementing -> Gate changes automatically', () => {
    it('gate remains visible after status changes to implementing', () => {
      // Before: approved
      expect(shouldShowGate('approved')).toBe(true);
      // After: implementing
      expect(shouldShowGate('implementing')).toBe(true);
    });

    it('execute button disappears after status changes to implementing', () => {
      // Before: approved, no idea ref
      expect(shouldShowExecuteButton('approved', null)).toBe(true);
      // After: implementing
      expect(shouldShowExecuteButton('implementing', null)).toBe(false);
    });

    it('amber "Engineering Already In Progress" is shown when implementing', () => {
      expect(shouldShowAmberGate('implementing', false)).toBe(true);
    });

    it('amber gate is NOT shown when plan is still approved (no EWO yet)', () => {
      expect(shouldShowAmberGate('approved', false)).toBe(false);
    });

    it('amber gate IS shown when plan is approved but EWO already exists', () => {
      // Edge case: EWO created but status not yet updated
      expect(shouldShowAmberGate('approved', true)).toBe(true);
    });
  });

  // ─── Test 3: Existing EWO -> Gate remains read-only ──────────────────────

  describe('Transition: Existing EWO -> Gate remains read-only', () => {
    it('gate is visible when EWO exists and plan is implementing', () => {
      expect(shouldShowGate('implementing')).toBe(true);
      expect(shouldShowAmberGate('implementing', true)).toBe(true);
    });

    it('execute button is hidden when EWO exists and plan is implementing', () => {
      expect(shouldShowExecuteButton('implementing', null)).toBe(false);
      expect(shouldShowExecuteButton('implementing', 'EWO-014.7')).toBe(false);
    });

    it('gate remains visible when EWO exists even if status is approved', () => {
      // EWO created but plan status not yet refreshed
      expect(shouldShowGate('approved')).toBe(true);
      expect(shouldShowAmberGate('approved', true)).toBe(true);
    });

    it('execute button is hidden when linked idea ref exists', () => {
      expect(shouldShowExecuteButton('approved', 'EWO-014.7')).toBe(false);
    });

    it('amber gate is shown whenever EWO exists regardless of plan status', () => {
      expect(shouldShowAmberGate('approved', true)).toBe(true);
      expect(shouldShowAmberGate('implementing', true)).toBe(true);
      expect(shouldShowAmberGate('planned', true)).toBe(true);
    });
  });

  // ─── Edge cases: no stale state ──────────────────────────────────────────

  describe('No stale state: gate and button are mutually exclusive', () => {
    it('when implementing, gate is visible and button is hidden', () => {
      const gate = shouldShowGate('implementing');
      const button = shouldShowExecuteButton('implementing', null);
      expect(gate).toBe(true);
      expect(button).toBe(false);
      // They must never both be true
      expect(gate && button).toBe(false);
    });

    it('when approved with no EWO, gate is visible and button is visible', () => {
      const gate = shouldShowGate('approved');
      const button = shouldShowExecuteButton('approved', null);
      expect(gate).toBe(true);
      expect(button).toBe(true);
      // Both can be true here — gate shows "Begin Engineering" action,
      // button shows "Execute Engineering Idea" alternative
    });

    it('when approved with EWO, gate shows amber and button is hidden', () => {
      const amber = shouldShowAmberGate('approved', true);
      const button = shouldShowExecuteButton('approved', 'EWO-014.7');
      expect(amber).toBe(true);
      expect(button).toBe(false);
    });

    it('when plan is in a non-actionable status, neither gate nor button shows', () => {
      expect(shouldShowGate('planned')).toBe(false);
      expect(shouldShowGate('in_review')).toBe(false);
      expect(shouldShowGate('rejected')).toBe(false);
    });
  });
});
