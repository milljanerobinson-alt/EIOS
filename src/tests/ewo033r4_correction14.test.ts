import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..');

function readSource(rel: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, rel), 'utf-8');
}

/**
 * EWO-033R.4 Correction 14 — Resolve Stale Execution Eligibility Contradiction
 *
 * The eligibility resolver (executionEligibilityResolver.ts) must NOT include
 * !staleExecution in the final eligible boolean. Stale sessions remain visible
 * in executionState and evidenceSources for diagnostics and recovery, but
 * must not block execution.
 *
 * This aligns the Execute path with the preparation path
 * (executionReadinessValidator.ts) which already treats stale sessions as
 * non-blocking warnings.
 */
describe('EWO-033R.4 Correction 14 — Stale Execution Eligibility', () => {

  // ─── Source Code Verification ──────────────────────────────────────────────

  describe('Source code: eligibility calculation', () => {
    const src = readSource('lib/executionEligibilityResolver.ts');

    it('does not include !staleExecution in the eligible boolean', () => {
      const eligibleIdx = src.indexOf('const eligible =');
      expect(eligibleIdx).toBeGreaterThan(-1);
      const eligibleBlock = src.substring(eligibleIdx, eligibleIdx + 300);
      expect(eligibleBlock).not.toContain('!staleExecution');
    });

    it('includes !activeExecution in the eligible boolean (active sessions still block)', () => {
      const eligibleIdx = src.indexOf('const eligible =');
      const eligibleBlock = src.substring(eligibleIdx, eligibleIdx + 300);
      expect(eligibleBlock).toContain('!activeExecution');
    });

    it('includes !workOrderClosed in the eligible boolean', () => {
      const eligibleIdx = src.indexOf('const eligible =');
      const eligibleBlock = src.substring(eligibleIdx, eligibleIdx + 300);
      expect(eligibleBlock).toContain('!workOrderClosed');
    });

    it('includes !alreadyExecuted in the eligible boolean', () => {
      const eligibleIdx = src.indexOf('const eligible =');
      const eligibleBlock = src.substring(eligibleIdx, eligibleIdx + 300);
      expect(eligibleBlock).toContain('!alreadyExecuted');
    });

    it('includes targetAvailable in the eligible boolean', () => {
      const eligibleIdx = src.indexOf('const eligible =');
      const eligibleBlock = src.substring(eligibleIdx, eligibleIdx + 300);
      expect(eligibleBlock).toContain('targetAvailable');
    });

    it('contains Correction 14 comment explaining the change', () => {
      expect(src).toContain('Correction 14');
      expect(src).toContain('Stale execution sessions do NOT block eligibility');
    });
  });

  // ─── Stale Execution Detection Preserved ───────────────────────────────────

  describe('Stale execution detection still exists', () => {
    const src = readSource('lib/executionEligibilityResolver.ts');

    it('still defines staleStatuses array', () => {
      expect(src).toContain("staleStatuses");
      expect(src).toContain('awaiting_po_testing');
      expect(src).toContain('awaiting_review');
      expect(src).toContain('awaiting_po');
      expect(src).toContain('po_accepted');
    });

    it('still detects staleExecution from executions', () => {
      expect(src).toContain('staleExecution');
      expect(src).toContain('staleStatuses.includes');
    });

    it('still exposes stale execution in evidenceSources', () => {
      expect(src).toContain('staleExecution');
      expect(src).toContain('Stale:');
    });

    it('still assigns executionState for stale sessions', () => {
      const staleIdx = src.indexOf('else if (staleExecution)');
      expect(staleIdx).toBeGreaterThan(-1);
      const staleBlock = src.substring(staleIdx, staleIdx + 400);
      expect(staleBlock).toContain('active_session');
    });
  });

  // ─── Active Execution Still Blocks ─────────────────────────────────────────

  describe('Active execution detection still blocks', () => {
    const src = readSource('lib/executionEligibilityResolver.ts');

    it('still defines genuinelyActiveStatuses array', () => {
      expect(src).toContain('genuinelyActiveStatuses');
      expect(src).toContain('queued');
      expect(src).toContain('running');
      expect(src).toContain('prepared');
      expect(src).toContain('submitted');
      expect(src).toContain('awaiting_completion');
    });

    it('still detects activeExecution from executions', () => {
      expect(src).toContain('activeExecution');
      expect(src).toContain('genuinelyActiveStatuses.includes');
    });

    it('still assigns executionState = active_session for active executions', () => {
      const activeIdx = src.indexOf('else if (activeExecution)');
      expect(activeIdx).toBeGreaterThan(-1);
      const activeBlock = src.substring(activeIdx, activeIdx + 100);
      expect(activeBlock).toContain('active_session');
    });

    it('still includes !activeExecution in eligible (active blocks)', () => {
      const eligibleIdx = src.indexOf('const eligible =');
      const eligibleBlock = src.substring(eligibleIdx, eligibleIdx + 300);
      expect(eligibleBlock).toContain('!activeExecution');
    });
  });

  // ─── Consistency: Preparation vs Execute Path ──────────────────────────────

  describe('Consistency: preparation and execute paths treat stale sessions identically', () => {
    const resolverSrc = readSource('lib/executionEligibilityResolver.ts');
    const validatorSrc = readSource('lib/executionReadinessValidator.ts');

    it('resolver does not block on stale (Correction 14)', () => {
      const eligibleIdx = resolverSrc.indexOf('const eligible =');
      const eligibleBlock = resolverSrc.substring(eligibleIdx, eligibleIdx + 300);
      expect(eligibleBlock).not.toContain('!staleExecution');
    });

    it('validator does not block on stale (Correction 10)', () => {
      // The readiness validator treats stale as a warning, not a blocker.
      // Check the else-if (staleExecution) block specifically.
      const staleBlockIdx = validatorSrc.indexOf('else if (staleExecution)');
      expect(staleBlockIdx).toBeGreaterThan(-1);
      const staleBlock = validatorSrc.substring(staleBlockIdx, staleBlockIdx + 400);
      expect(staleBlock).toContain('warnings.push');
      // The stale block itself must not push to blockingReasons
      const staleBlockEnd = staleBlock.indexOf('}\n');
      const staleOnly = staleBlock.substring(0, staleBlockEnd > 0 ? staleBlockEnd : 400);
      expect(staleOnly).not.toContain('blockingReasons.push');
    });

    it('both paths classify the same statuses as stale', () => {
      // Resolver
      expect(resolverSrc).toContain('awaiting_po_testing');
      expect(resolverSrc).toContain('awaiting_review');
      expect(resolverSrc).toContain('awaiting_po');
      expect(resolverSrc).toContain('po_accepted');
      // Validator
      expect(validatorSrc).toContain('awaiting_po_testing');
      expect(validatorSrc).toContain('awaiting_review');
      expect(validatorSrc).toContain('awaiting_po');
      expect(validatorSrc).toContain('po_accepted');
    });

    it('both paths classify the same statuses as genuinely active', () => {
      // Resolver
      expect(resolverSrc).toContain("'queued'");
      expect(resolverSrc).toContain("'running'");
      expect(resolverSrc).toContain("'prepared'");
      expect(resolverSrc).toContain("'submitted'");
      expect(resolverSrc).toContain("'awaiting_completion'");
      // Validator
      expect(validatorSrc).toContain("'queued'");
      expect(validatorSrc).toContain("'running'");
      expect(validatorSrc).toContain("'prepared'");
      expect(validatorSrc).toContain("'submitted'");
      expect(validatorSrc).toContain("'awaiting_completion'");
    });
  });

  // ─── Execution State Matrix ────────────────────────────────────────────────

  describe('Execution state matrix: eligibility by execution status', () => {
    const src = readSource('lib/executionEligibilityResolver.ts');

    // For each status, determine whether it appears in the active or stale list
    const activeStatuses = ['queued', 'running', 'prepared', 'submitted', 'awaiting_completion'];
    const staleStatuses = ['awaiting_review', 'awaiting_po', 'awaiting_po_testing', 'po_accepted'];
    const terminalStatuses = ['complete', 'cancelled', 'failed', 'rejected'];

    for (const status of activeStatuses) {
      it(`active status '${status}' blocks eligibility (in !activeExecution)`, () => {
        expect(src).toContain(`'${status}'`);
        // activeExecution is in the eligible check
        const eligibleIdx = src.indexOf('const eligible =');
        const eligibleBlock = src.substring(eligibleIdx, eligibleIdx + 300);
        expect(eligibleBlock).toContain('!activeExecution');
      });
    }

    for (const status of staleStatuses) {
      it(`stale status '${status}' does NOT block eligibility (not in eligible check)`, () => {
        expect(src).toContain(`'${status}'`);
        // staleExecution must NOT be in the eligible check
        const eligibleIdx = src.indexOf('const eligible =');
        const eligibleBlock = src.substring(eligibleIdx, eligibleIdx + 300);
        expect(eligibleBlock).not.toContain('!staleExecution');
      });
    }

    for (const status of terminalStatuses) {
      it(`terminal status '${status}' is not in active or stale lists`, () => {
        // Terminal statuses should not appear in the genuinelyActiveStatuses or staleStatuses arrays
        // They are handled separately (alreadyExecuted, failedExecution)
        const activeListMatch = src.match(/genuinelyActiveStatuses.*?\]/s);
        const staleListMatch = src.match(/staleStatuses.*?\]/s);
        if (activeListMatch) {
          expect(activeListMatch[0]).not.toContain(`'${status}'`);
        }
        if (staleListMatch) {
          expect(staleListMatch[0]).not.toContain(`'${status}'`);
        }
      });
    }
  });

  // ─── Recovery Metadata Preserved ────────────────────────────────────────────

  describe('Recovery metadata preserved for stale sessions', () => {
    const src = readSource('lib/executionEligibilityResolver.ts');

    it('executionState for stale sessions is active_session (resumable)', () => {
      const staleIdx = src.indexOf('else if (staleExecution)');
      const staleBlock = src.substring(staleIdx, staleIdx + 400);
      expect(staleBlock).toContain('active_session');
    });

    it('evidenceSources includes stale execution ref and status', () => {
      expect(src).toContain('staleExecution');
      expect(src).toContain('Stale:');
    });

    it('activeExecutionSession does not include stale session ref', () => {
      // activeExecutionSession only reports genuinely active sessions
      const activeSessionIdx = src.indexOf('activeExecutionSession:');
      expect(activeSessionIdx).toBeGreaterThan(-1);
      const activeSessionBlock = src.substring(activeSessionIdx, activeSessionIdx + 200);
      expect(activeSessionBlock).toContain('activeExecution');
      expect(activeSessionBlock).not.toContain('staleExecution');
    });
  });

  // ─── Launch Service Behavior ────────────────────────────────────────────────

  describe('Launch service: stale execution does not trigger duplicate prevention', () => {
    const launchSrc = readSource('lib/executionLaunchService.ts');

    it('launch service checks activeExecutionSession.hasActive (not stale)', () => {
      expect(launchSrc).toContain('activeExecutionSession.hasActive');
    });

    it('launch service checks eligibility.eligible for final decision', () => {
      expect(launchSrc).toContain('!eligibility.eligible');
    });

    it('launch service produces "Prerequisite validation failed" message', () => {
      expect(launchSrc).toContain('Prerequisite validation failed');
    });
  });
});
