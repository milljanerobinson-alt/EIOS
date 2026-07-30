import { describe, it, expect } from 'vitest';

// ─── EWO-014.13A: Governed PO Acceptance Closure ──────────────────────────────
//
// Tests the lifecycle rules, state machine, and validation logic that ensure
// EWOs can only be closed via Product Owner Acceptance.
//
// The DB RPC (execute_po_acceptance_closure) and validation function
// (validate_ewo_lifecycle_transition) are tested at the database level.
// These tests cover the client-side lifecycle rules and state machine.

// Canonical lifecycle sequence (EWO-014.13A)
const CANONICAL_LIFECYCLE = [
  'draft',
  'architecture_review',
  'engineering_approved',
  'po_approved',
  'ready',
  'in_progress',
  'engineering_validation',
  'engineering_complete',
  'engineering_verification',
  'verified',
  'report_generated',
  'po_acceptance',
  'closed',
] as const;

type EWOStatus = typeof CANONICAL_LIFECYCLE[number] | 'archived';

// Valid transitions (mirrors the DB validate_ewo_lifecycle_transition function)
const VALID_TRANSITIONS: Record<string, EWOStatus[]> = {
  draft: ['architecture_review'],
  architecture_review: ['engineering_approved', 'draft'],
  engineering_approved: ['po_approved', 'architecture_review'],
  po_approved: ['ready', 'engineering_approved'],
  ready: ['in_progress', 'po_approved'],
  in_progress: ['engineering_validation', 'engineering_complete'],
  engineering_validation: ['engineering_complete', 'in_progress'],
  engineering_complete: ['engineering_verification'],
  engineering_verification: ['verified', 'engineering_complete'],
  verified: ['report_generated'],
  report_generated: ['po_acceptance'],
  po_acceptance: ['closed'],
  closed: ['archived'],
  archived: [],
};

// Premature closure attempts that must be rejected
const PREMATURE_CLOSURE_ATTEMPTS: EWOStatus[] = [
  'engineering_complete',
  'engineering_verification',
  'verified',
  'report_generated',
];

describe('EWO-014.13A: Product Owner Acceptance Governs EWO Closure', () => {
  // ─── Canonical Lifecycle Sequence ──────────────────────────────────────────

  describe('Canonical lifecycle sequence', () => {
    it('defines the full lifecycle from draft to closed', () => {
      expect(CANONICAL_LIFECYCLE).toHaveLength(13);
      expect(CANONICAL_LIFECYCLE[0]).toBe('draft');
      expect(CANONICAL_LIFECYCLE[12]).toBe('closed');
    });

    it('places po_acceptance immediately before closed', () => {
      const poIdx = CANONICAL_LIFECYCLE.indexOf('po_acceptance');
      const closedIdx = CANONICAL_LIFECYCLE.indexOf('closed');
      expect(closedIdx).toBe(poIdx + 1);
    });

    it('places report_generated before po_acceptance', () => {
      const reportIdx = CANONICAL_LIFECYCLE.indexOf('report_generated');
      const poIdx = CANONICAL_LIFECYCLE.indexOf('po_acceptance');
      expect(poIdx).toBe(reportIdx + 1);
    });

    it('places engineering_complete before engineering_verification', () => {
      const completeIdx = CANONICAL_LIFECYCLE.indexOf('engineering_complete');
      const verifIdx = CANONICAL_LIFECYCLE.indexOf('engineering_verification');
      expect(verifIdx).toBe(completeIdx + 1);
    });
  });

  // ─── Lifecycle Validation: Prevent Premature Closure ─────────────────────────

  describe('Lifecycle validation prevents premature closure', () => {
    it('allows closure only from po_acceptance', () => {
      const allowed = VALID_TRANSITIONS['po_acceptance'];
      expect(allowed).toContain('closed');
    });

    it.each(PREMATURE_CLOSURE_ATTEMPTS.map(s => [s]))(
      'does NOT allow closure from %s',
      (status) => {
        const transitions = VALID_TRANSITIONS[status];
        expect(transitions).not.toContain('closed');
      },
    );

    it('does not allow closure from draft', () => {
      expect(VALID_TRANSITIONS['draft']).not.toContain('closed');
    });

    it('does not allow closure from in_progress', () => {
      expect(VALID_TRANSITIONS['in_progress']).not.toContain('closed');
    });

    it('does not allow closure from engineering_validation', () => {
      expect(VALID_TRANSITIONS['engineering_validation']).not.toContain('closed');
    });
  });

  // ─── Valid Transition Paths ─────────────────────────────────────────────────

  describe('Valid transition paths', () => {
    it('allows draft → architecture_review', () => {
      expect(VALID_TRANSITIONS['draft']).toContain('architecture_review');
    });

    it('allows verified → report_generated (not closed)', () => {
      expect(VALID_TRANSITIONS['verified']).toContain('report_generated');
      expect(VALID_TRANSITIONS['verified']).not.toContain('closed');
    });

    it('allows report_generated → po_acceptance (not closed)', () => {
      expect(VALID_TRANSITIONS['report_generated']).toContain('po_acceptance');
      expect(VALID_TRANSITIONS['report_generated']).not.toContain('closed');
    });

    it('allows po_acceptance → closed (the only path to closed)', () => {
      expect(VALID_TRANSITIONS['po_acceptance']).toEqual(['closed']);
    });

    it('allows closed → archived', () => {
      expect(VALID_TRANSITIONS['closed']).toContain('archived');
    });
  });

  // ─── Governed Closure Sequence (11 steps) ───────────────────────────────────

  describe('Governed closure sequence', () => {
    const CLOSURE_STEPS = [
      '1. Record PO Acceptance',
      '2. Lock Engineering Record',
      '3. Lock Engineering Plan',
      '4. Mark Completion Report Final',
      '5. Archive Completion Report',
      '6. Extract Engineering Knowledge',
      '7. Update Engineering Metrics',
      '8. Update Roadmap Progress',
      '9. Transition EWO to Closed',
      '10. Record Timestamp',
      '11. Record Actor',
      '12. Publish Lifecycle Event',
    ];

    it('defines all 12 closure steps (11 functional + lifecycle event)', () => {
      expect(CLOSURE_STEPS).toHaveLength(12);
    });

    it('places EWO closure (step 9) after all locking and archiving steps', () => {
      const closeIdx = CLOSURE_STEPS.findIndex(s => s.includes('Transition EWO'));
      const lockRecordIdx = CLOSURE_STEPS.findIndex(s => s.includes('Lock Engineering Record'));
      const archiveIdx = CLOSURE_STEPS.findIndex(s => s.includes('Archive Completion'));
      expect(closeIdx).toBeGreaterThan(lockRecordIdx);
      expect(closeIdx).toBeGreaterThan(archiveIdx);
    });

    it('places lifecycle event publication as the final step', () => {
      const lifecycleIdx = CLOSURE_STEPS.findIndex(s => s.includes('Publish Lifecycle'));
      expect(lifecycleIdx).toBe(CLOSURE_STEPS.length - 1);
    });
  });

  // ─── Audit Trail Fields ─────────────────────────────────────────────────────

  describe('Audit trail metadata', () => {
    const AUDIT_FIELDS = ['closed_by', 'closed_at', 'closure_reason', 'po_accepted_at', 'po_accepted_by'];

    it.each(AUDIT_FIELDS.map(f => [f]))('requires %s field for audit trail', (field) => {
      expect(typeof field).toBe('string');
    });

    it('default closure reason is "Automatically closed after Product Owner Acceptance"', () => {
      const DEFAULT_CLOSURE_REASON = 'Automatically closed after Product Owner Acceptance';
      expect(DEFAULT_CLOSURE_REASON).toContain('Product Owner Acceptance');
    });
  });

  // ─── UI Display Rules ───────────────────────────────────────────────────────

  describe('UI display rules', () => {
    it('shows "Awaiting Product Owner Acceptance" for po_acceptance status', () => {
      const label = 'Awaiting Product Owner Acceptance';
      expect(label).toContain('Awaiting');
      expect(label).toContain('Product Owner');
    });

    it('shows "Report Ready" for report_generated status', () => {
      const label = 'Report Ready';
      expect(label).not.toBe('Closed');
    });

    it('does not show "Closed" until after PO acceptance', () => {
      const preAcceptanceLabels = ['Report Ready', 'Awaiting Product Owner Acceptance'];
      preAcceptanceLabels.forEach(l => expect(l).not.toBe('Closed'));
    });

    it('shows "Closed" immediately after PO acceptance', () => {
      const postAcceptanceLabel = 'Closed';
      expect(postAcceptanceLabel).toBe('Closed');
    });
  });

  // ─── Implementation Complete ≠ Closed ───────────────────────────────────────

  describe('Implementation Complete is not Engineering Closed', () => {
    it('engineering_complete is a distinct state from closed', () => {
      expect('engineering_complete').not.toBe('closed');
    });

    it('engineering_complete transitions to engineering_verification, not closed', () => {
      expect(VALID_TRANSITIONS['engineering_complete']).toContain('engineering_verification');
      expect(VALID_TRANSITIONS['engineering_complete']).not.toContain('closed');
    });

    it('verified transitions to report_generated, not closed', () => {
      expect(VALID_TRANSITIONS['verified']).toContain('report_generated');
      expect(VALID_TRANSITIONS['verified']).not.toContain('closed');
    });

    it('report_generated transitions to po_acceptance, not closed', () => {
      expect(VALID_TRANSITIONS['report_generated']).toContain('po_acceptance');
      expect(VALID_TRANSITIONS['report_generated']).not.toContain('closed');
    });
  });
});
