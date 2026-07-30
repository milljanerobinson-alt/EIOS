import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

// ─── EWO-032R.6: False Cancellation Detection and Short-Circuit Response Contract ─
// The cancellation detector was incorrectly interpreting negative engineering
// constraints ("do not modify files", "do not deploy") as cancellation commands.
// Short-circuit responses used `message:` but the frontend expects `reply:`.

// ─── Extract patterns from the edge function source for testing ───────────────

const edgeFnSource = fs.readFileSync('supabase/functions/command-centre-ai/index.ts', 'utf-8');

// Extract CANCELLATION_PATTERNS from source by evaluating the array literal
function extractCancellationPatterns(source: string): RegExp[] {
  const match = source.match(/const CANCELLATION_PATTERNS = \[([\s\S]*?)\];/);
  if (!match) return [];
  const body = match[1];
  const patternStrings = body.match(/\/(.*?)\/[gimsuy]*/g) ?? [];
  return patternStrings.map(s => {
    const flags = s.match(/\/([gimsuy]*)$/)?.[1] ?? '';
    const pattern = s.slice(1, s.lastIndexOf('/'));
    return new RegExp(pattern, flags);
  });
}

// Extract NEGATED_CONSTRAINT_PATTERNS from source
function extractNegatedConstraintPatterns(source: string): RegExp[] {
  const match = source.match(/const NEGATED_CONSTRAINT_PATTERNS = \[([\s\S]*?)\];/);
  if (!match) return [];
  const body = match[1];
  const patternStrings = body.match(/\/(.*?)\/[gimsuy]*/g) ?? [];
  return patternStrings.map(s => {
    const flags = s.match(/\/([gimsuy]*)$/)?.[1] ?? '';
    const pattern = s.slice(1, s.lastIndexOf('/'));
    return new RegExp(pattern, flags);
  });
}

const cancellationPatterns = extractCancellationPatterns(edgeFnSource);
const negatedConstraintPatterns = extractNegatedConstraintPatterns(edgeFnSource);

// Replicate the isCancellationRequest logic from the edge function
function isNegatedConstraint(text: string): boolean {
  return negatedConstraintPatterns.some(p => p.test(text));
}

function isCancellationRequest(text: string): boolean {
  if (isNegatedConstraint(text)) return false;
  return cancellationPatterns.some(p => p.test(text));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EWO-032R.6 — False Cancellation Detection', () => {

  // ─── REQ-1: "Do not modify any existing files" does not trigger cancellation ──
  describe('REQ-1 — negated file constraints do not trigger cancellation', () => {
    it('"Do not modify any existing files" does not trigger cancellation', () => {
      expect(isCancellationRequest('Do not modify any existing files.')).toBe(false);
    });

    it('"Do not change existing files" does not trigger cancellation', () => {
      expect(isCancellationRequest('Do not change existing files.')).toBe(false);
    });

    it('"No modification of existing files" does not trigger cancellation', () => {
      expect(isCancellationRequest('No modification of existing files.')).toBe(false);
    });

    it('"Modification is prohibited" does not trigger cancellation', () => {
      expect(isCancellationRequest('Modification is prohibited.')).toBe(false);
    });
  });

  // ─── REQ-2: "Do not deploy" does not trigger cancellation ───────────────────────
  describe('REQ-2 — deployment constraints do not trigger cancellation', () => {
    it('"Do not deploy" does not trigger cancellation', () => {
      expect(isCancellationRequest('Do not deploy.')).toBe(false);
    });
  });

  // ─── REQ-3: "Do not merge" does not trigger cancellation ───────────────────────
  describe('REQ-3 — merge constraints do not trigger cancellation', () => {
    it('"Do not merge" does not trigger cancellation', () => {
      expect(isCancellationRequest('Do not merge.')).toBe(false);
    });
  });

  // ─── REQ-4: "Do not simulate execution" does not trigger cancellation ─────────
  describe('REQ-4 — simulation constraints do not trigger cancellation', () => {
    it('"Do not simulate execution" does not trigger cancellation', () => {
      expect(isCancellationRequest('Do not simulate execution.')).toBe(false);
    });
  });

  // ─── REQ-5: Full governed Codex canary prompt follows the planning route ───────
  describe('REQ-5 — full governed Codex canary prompt does not trigger cancellation', () => {
    it('full canary prompt with all constraints does not trigger cancellation', () => {
      const canaryPrompt = `
        Create a fresh governed Codex canary engineering work order.
        Do not modify any existing files.
        Do not deploy.
        Do not merge.
        Do not simulate execution.
        Ensure all changes are isolated to the canary branch.
      `;
      expect(isCancellationRequest(canaryPrompt)).toBe(false);
    });
  });

  // ─── REQ-6: "Cancel this work order" triggers cancellation ────────────────────
  describe('REQ-6 — genuine cancellation commands trigger cancellation', () => {
    it('"Cancel this work order" triggers cancellation', () => {
      expect(isCancellationRequest('Cancel this work order.')).toBe(true);
    });
  });

  // ─── REQ-7: "Abort the execution" triggers cancellation ───────────────────────
  describe('REQ-7 — abort commands trigger cancellation', () => {
    it('"Abort the execution" triggers cancellation', () => {
      expect(isCancellationRequest('Abort the execution.')).toBe(true);
    });
  });

  // ─── REQ-8: "Withdraw my approval" triggers cancellation ──────────────────────
  describe('REQ-8 — withdraw approval triggers cancellation', () => {
    it('"Withdraw my approval" triggers cancellation', () => {
      expect(isCancellationRequest('Withdraw my approval.')).toBe(true);
    });
  });

  // ─── REQ-9: "Modify the existing work order" triggers modification handling ───
  describe('REQ-9 — modification requests trigger cancellation (modification route)', () => {
    it('"Modify the existing work order" triggers cancellation', () => {
      expect(isCancellationRequest('Modify the existing work order to change the scope.')).toBe(true);
    });
  });

  // ─── REQ-10: Negated cancellation phrase does not cancel ──────────────────────
  describe('REQ-10 — negated cancellation phrases do not trigger cancellation', () => {
    it('"Do not cancel the work order" does not trigger cancellation', () => {
      expect(isCancellationRequest('Do not cancel the work order.')).toBe(false);
    });

    it('"Cancel fallback behaviour" does not trigger cancellation', () => {
      expect(isCancellationRequest('Cancel fallback behaviour.')).toBe(false);
    });
  });

  // ─── REQ-15: Existing cancellation patterns still work ───────────────────────
  describe('REQ-15 — additional genuine cancellation commands', () => {
    it('"Stop this execution" triggers cancellation', () => {
      expect(isCancellationRequest('Stop this execution.')).toBe(true);
    });

    it('"Stop the work order" triggers cancellation', () => {
      expect(isCancellationRequest('Stop the work order.')).toBe(true);
    });

    it('"Abort the current request" triggers cancellation', () => {
      expect(isCancellationRequest('Abort the current request.')).toBe(true);
    });

    it('"Hold execution" triggers cancellation', () => {
      expect(isCancellationRequest('Hold execution until further notice.')).toBe(true);
    });

    it('"Do not proceed with execution" triggers cancellation', () => {
      expect(isCancellationRequest('Do not proceed with execution.')).toBe(true);
    });

    it('"Do not proceed" triggers cancellation', () => {
      expect(isCancellationRequest('Do not proceed.')).toBe(true);
    });
  });
});

// ─── Response Contract Tests ───────────────────────────────────────────────────

describe('EWO-032R.6 — Response Contract: reply field on short-circuit responses', () => {

  // ─── REQ-11: Cancellation short-circuit responses render visible text ─────────
  describe('REQ-11 — cancellation short-circuit has reply field', () => {
    it('edge function source has reply: in cancellation response', () => {
      // Find the cancellation short-circuit block
      const cancelBlock = edgeFnSource.match(/detected_intent:\s*"cancellation_or_modification"[\s\S]*?}\)/);
      expect(cancelBlock).toBeTruthy();
      expect(cancelBlock![0]).toContain('reply:');
    });
  });

  // ─── REQ-12: Approval short-circuit responses render visible text ──────────────
  describe('REQ-12 — approval short-circuit has reply field', () => {
    it('approval refused (no pending plan) has reply field', () => {
      const block = edgeFnSource.match(/detected_intent:\s*"approval_without_pending_plan"[\s\S]*?}\)/);
      expect(block).toBeTruthy();
      expect(block![0]).toContain('reply:');
    });

    it('approval refused (EWO not found) has reply field', () => {
      const block = edgeFnSource.match(/detected_intent:\s*"approval_ewo_not_found"[\s\S]*?}\)/);
      expect(block).toBeTruthy();
      expect(block![0]).toContain('reply:');
    });

    it('approval refused (no plan) has reply field', () => {
      const block = edgeFnSource.match(/detected_intent:\s*"approval_without_plan"[\s\S]*?}\)/);
      expect(block).toBeTruthy();
      expect(block![0]).toContain('reply:');
    });

    it('approval dispatched has reply field', () => {
      const block = edgeFnSource.match(/detected_intent:\s*"approval_handoff_dispatched"[\s\S]*?}\)/);
      expect(block).toBeTruthy();
      expect(block![0]).toContain('reply:');
    });

    it('approval execution failed has reply field', () => {
      const block = edgeFnSource.match(/detected_intent:\s*"approval_handoff_execution_failed"[\s\S]*?}\)/);
      expect(block).toBeTruthy();
      expect(block![0]).toContain('reply:');
    });
  });

  // ─── REQ-13: Inspection responses render visible text ─────────────────────────
  describe('REQ-13 — inspection short-circuits have reply field', () => {
    it('provider policy inspection success has reply field', () => {
      const blocks = edgeFnSource.match(/detected_intent:\s*"provider_policy_inspection"[\s\S]*?}\)/g);
      expect(blocks).toBeTruthy();
      expect(blocks!.length).toBeGreaterThanOrEqual(2);
      // At least one block (the success path) should have reply:
      const hasReply = blocks!.some(b => b.includes('reply:'));
      expect(hasReply).toBe(true);
    });

    it('execution handoff inspection has reply field', () => {
      const blocks = edgeFnSource.match(/detected_intent:\s*"execution_handoff_inspection"[\s\S]*?}\)/g);
      expect(blocks).toBeTruthy();
      expect(blocks!.length).toBeGreaterThanOrEqual(2);
      const hasReply = blocks!.some(b => b.includes('reply:'));
      expect(hasReply).toBe(true);
    });
  });

  // ─── REQ-14: No blank assistant bubble from HTTP 200 ───────────────────────────
  describe('REQ-14 — frontend parses reply field with fallback', () => {
    it('frontend source uses data.reply ?? data.message fallback', () => {
      const frontendSource = fs.readFileSync('src/pages/ecc/CCAIProductManagerPage.tsx', 'utf-8');
      expect(frontendSource).toContain('data.reply ?? data.message');
    });
  });
});
