/**
 * EWO-042 — Governed Execution Package Inspection
 *
 * Regression tests proving:
 * ✓ inspect_execution_package intent is classified correctly
 * ✓ Natural language patterns resolve to inspect_execution_package
 * ✓ The intent is read-only (no lifecycle change)
 * ✓ Inspection requests are never interpreted as approval/cancellation/execution
 */

import { describe, it, expect } from 'vitest';
import { classifyExecutionIntent } from '../lib/executionIntentRouter';

describe('EWO-042 — Governed Execution Package Inspection', () => {
  // ─── Intent Classification ────────────────────────────────────────────────

  describe('Natural language pattern matching', () => {
    const inspectionPhrases = [
      'Show me the execution package.',
      'Review the execution package.',
      'Inspect the execution package.',
      'Show the planned changes.',
      'Show the execution summary.',
      'What files will be modified?',
      'Show the rollback plan.',
      'Show validation steps.',
      'Show execution risks.',
      'Why was this provider selected?',
      'Show everything that will happen if I approve this.',
    ];

    for (const phrase of inspectionPhrases) {
      it(`should classify "${phrase}" as inspect_execution_package`, () => {
        const result = classifyExecutionIntent(phrase, 'EWO-042');
        expect(result.intent).toBe('inspect_execution_package');
      });
    }

    it('should classify "Inspect the execution package for EWO-042" with correct EWO ref', () => {
      const result = classifyExecutionIntent('Inspect the execution package for EWO-042', null);
      expect(result.intent).toBe('inspect_execution_package');
      expect(result.ewoRef).toBe('EWO-042');
    });

    it('should classify "Show me the execution package for EWO-042" with correct EWO ref', () => {
      const result = classifyExecutionIntent('Show me the execution package for EWO-042', null);
      expect(result.intent).toBe('inspect_execution_package');
      expect(result.ewoRef).toBe('EWO-042');
    });
  });

  // ─── Read-Only Guarantees ──────────────────────────────────────────────────

  describe('Read-only behavior', () => {
    it('should not request execution', () => {
      const result = classifyExecutionIntent('Show me the execution package for EWO-042', null);
      expect(result.executionRequested).toBe(false);
    });

    it('should not detect approval intent', () => {
      const result = classifyExecutionIntent('Show me the execution package for EWO-042', null);
      expect(result.executionApprovalDetected).toBe(false);
    });

    it('should not request lifecycle change', () => {
      const result = classifyExecutionIntent('Show me the execution package for EWO-042', null);
      expect(result.lifecycleChangeRequested).toBe(false);
    });

    it('should not require confirmation', () => {
      const result = classifyExecutionIntent('Show me the execution package for EWO-042', null);
      expect(result.confirmationRequired).toBe(false);
    });

    it('should route to execution_package_inspection', () => {
      const result = classifyExecutionIntent('Show me the execution package for EWO-042', null);
      expect(result.routingDecision).toBe('route_to_execution_package_inspection');
    });
  });

  // ─── Non-Interference with Lifecycle Actions ──────────────────────────────

  describe('Does not interfere with lifecycle actions', () => {
    it('should NOT classify "approve EWO-042" as inspection', () => {
      const result = classifyExecutionIntent('Approve EWO-042', null);
      expect(result.intent).not.toBe('inspect_execution_package');
    });

    it('should NOT classify "execute EWO-042" as inspection', () => {
      const result = classifyExecutionIntent('Execute EWO-042', null);
      expect(result.intent).not.toBe('inspect_execution_package');
    });

    it('should NOT classify "cancel EWO-042" as inspection', () => {
      const result = classifyExecutionIntent('Cancel EWO-042', null);
      expect(result.intent).not.toBe('inspect_execution_package');
    });

    it('should NOT classify "accept EWO-042" as inspection', () => {
      const result = classifyExecutionIntent('Accept EWO-042', null);
      expect(result.intent).not.toBe('inspect_execution_package');
    });
  });

  // ─── Source Code Verification ──────────────────────────────────────────────

  describe('Source code verification', () => {
    it('should export inspect_execution_package in ConversationIntent type', async () => {
      const module = await import('../lib/executionIntentRouter?raw');
      const source = module.default as string;
      expect(source).toContain("'inspect_execution_package'");
    });

    it('should have inspectExecutionPackage operation in INTENT_PATTERNS', async () => {
      const module = await import('../lib/executionIntentRouter?raw');
      const source = module.default as string;
      expect(source).toContain('inspectExecutionPackage');
    });

    it('should have route_to_execution_package_inspection routing decision', async () => {
      const module = await import('../lib/executionIntentRouter?raw');
      const source = module.default as string;
      expect(source).toContain('route_to_execution_package_inspection');
    });
  });
});
