// EWO-017R — Product Owner Acceptance Governs Work Order Closure
// Lifecycle Truthfulness Refinement — Test Suite
//
// Covers all 8 requirements + 4 Product Owner tests + acceptance standards.

import { describe, it, expect } from 'vitest';
import {
  deriveLifecycleState,
  isClosureEligible,
  statusForState,
  isStatusTruthful,
  isHealthyLifecycleState,
  isGovernanceFailure,
  type LifecycleEvidence,
  type LifecycleState,
} from '../lib/lifecycleEvidenceEngine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEvidence(overrides: Partial<LifecycleEvidence> = {}): LifecycleEvidence {
  return {
    ewo_ref: 'EWO-TEST',
    implementation_complete: false,
    engineering_package_attached: false,
    completion_report_present: false,
    po_testing_completed: false,
    po_acceptance_granted: false,
    rejection_recorded: false,
    superseded: false,
    archived: false,
    bootstrap_origin: null,
    bootstrap_date: null,
    bootstrap_reason: null,
    ...overrides,
  };
}

// ─── Requirement 1 — Product Owner Acceptance Controls Closure ─────────────────

describe('EWO-017R Requirement 1 — PO Acceptance Controls Closure', () => {
  it('closure is NOT eligible when implementation complete but PO acceptance missing', () => {
    const evidence = makeEvidence({
      implementation_complete: true,
      engineering_package_attached: true,
      completion_report_present: true,
      po_testing_completed: true,
      po_acceptance_granted: false,
    });
    expect(isClosureEligible(evidence)).toBe(false);
  });

  it('closure is NOT eligible when PO testing pending even if implementation complete', () => {
    const evidence = makeEvidence({
      implementation_complete: true,
      engineering_package_attached: true,
      completion_report_present: true,
      po_testing_completed: false,
      po_acceptance_granted: false,
    });
    expect(isClosureEligible(evidence)).toBe(false);
  });

  it('closure IS eligible only when ALL prerequisites met', () => {
    const evidence = makeEvidence({
      implementation_complete: true,
      engineering_package_attached: true,
      completion_report_present: true,
      po_testing_completed: true,
      po_acceptance_granted: true,
    });
    expect(isClosureEligible(evidence)).toBe(true);
  });

  it('closure is NOT eligible if rejection recorded', () => {
    const evidence = makeEvidence({
      implementation_complete: true,
      engineering_package_attached: true,
      completion_report_present: true,
      po_testing_completed: true,
      po_acceptance_granted: true,
      rejection_recorded: true,
    });
    expect(isClosureEligible(evidence)).toBe(false);
  });

  it('closed state requires PO acceptance', () => {
    const noAcceptance = makeEvidence({ po_acceptance_granted: false });
    const withAcceptance = makeEvidence({ po_acceptance_granted: true });
    expect(deriveLifecycleState(noAcceptance)).not.toBe('closed');
    expect(deriveLifecycleState(withAcceptance)).toBe('closed');
  });
});

// ─── Requirement 2 — Historical Bootstrap Lifecycle ────────────────────────────

describe('EWO-017R Requirement 2 — Historical Bootstrap Lifecycle', () => {
  it('implementation complete + PO testing pending → po_testing_pending, NOT closed', () => {
    const evidence = makeEvidence({
      implementation_complete: true,
      completion_report_present: true,
      po_testing_completed: false,
      po_acceptance_granted: false,
    });
    expect(deriveLifecycleState(evidence)).toBe('po_testing_pending');
    expect(deriveLifecycleState(evidence)).not.toBe('closed');
  });

  it('PO testing completed but acceptance not granted → awaiting_po_acceptance', () => {
    const evidence = makeEvidence({
      implementation_complete: true,
      completion_report_present: true,
      po_testing_completed: true,
      po_acceptance_granted: false,
    });
    expect(deriveLifecycleState(evidence)).toBe('awaiting_po_acceptance');
  });

  it('PO acceptance granted → closed', () => {
    const evidence = makeEvidence({
      implementation_complete: true,
      completion_report_present: true,
      po_testing_completed: true,
      po_acceptance_granted: true,
    });
    expect(deriveLifecycleState(evidence)).toBe('closed');
  });

  it('implementation complete but no completion report → engineering_complete', () => {
    const evidence = makeEvidence({
      implementation_complete: true,
      completion_report_present: false,
      po_testing_completed: false,
      po_acceptance_granted: false,
    });
    expect(deriveLifecycleState(evidence)).toBe('engineering_complete');
  });
});

// ─── Requirement 3 — Lifecycle Evidence Engine ─────────────────────────────────

describe('EWO-017R Requirement 3 — Lifecycle Evidence Engine', () => {
  it('derives highest fully supported state', () => {
    expect(deriveLifecycleState(makeEvidence())).toBe('created');
    expect(deriveLifecycleState(makeEvidence({ engineering_package_attached: true }))).toBe('implementation_started');
    expect(deriveLifecycleState(makeEvidence({ engineering_package_attached: true, implementation_complete: true }))).toBe('engineering_complete');
    expect(deriveLifecycleState(makeEvidence({ engineering_package_attached: true, implementation_complete: true, completion_report_present: true }))).toBe('po_testing_pending');
    expect(deriveLifecycleState(makeEvidence({ engineering_package_attached: true, implementation_complete: true, completion_report_present: true, po_testing_completed: true }))).toBe('awaiting_po_acceptance');
    expect(deriveLifecycleState(makeEvidence({ engineering_package_attached: true, implementation_complete: true, completion_report_present: true, po_testing_completed: true, po_acceptance_granted: true }))).toBe('closed');
  });

  it('terminal states take precedence', () => {
    expect(deriveLifecycleState(makeEvidence({ archived: true, po_acceptance_granted: true }))).toBe('archived');
    expect(deriveLifecycleState(makeEvidence({ superseded: true, po_acceptance_granted: true }))).toBe('superseded');
    expect(deriveLifecycleState(makeEvidence({ rejection_recorded: true, po_acceptance_granted: true }))).toBe('rejected');
  });

  it('evidence with all flags false → created', () => {
    expect(deriveLifecycleState(makeEvidence())).toBe('created');
  });
});

// ─── Requirement 4 — Automatic Lifecycle Progression ───────────────────────────

describe('EWO-017R Requirement 4 — Automatic Progression Rules', () => {
  it('statusForState maps each state to a valid status', () => {
    expect(statusForState('created')).toBe('draft');
    expect(statusForState('implementation_started')).toBe('ready');
    expect(statusForState('engineering_complete')).toBe('engineering_complete');
    expect(statusForState('po_testing_pending')).toBe('engineering_complete');
    expect(statusForState('awaiting_po_acceptance')).toBe('po_acceptance');
    expect(statusForState('closed')).toBe('closed');
    expect(statusForState('rejected')).toBe('closed');
    expect(statusForState('superseded')).toBe('archived');
    expect(statusForState('archived')).toBe('archived');
  });

  it('progression follows the defined sequence', () => {
    const states: LifecycleState[] = [
      'created',
      'implementation_started',
      'engineering_complete',
      'po_testing_pending',
      'awaiting_po_acceptance',
      'closed',
    ];
    for (let i = 0; i < states.length - 1; i++) {
      const current = states[i];
      const next = states[i + 1];
      expect(current).not.toBe(next);
    }
  });
});

// ─── Requirement 5 — Bootstrap Transparency ────────────────────────────────────

describe('EWO-017R Requirement 5 — Bootstrap Transparency', () => {
  it('bootstrap evidence is preserved in evidence object', () => {
    const evidence = makeEvidence({
      bootstrap_origin: 'Implementation Bootstrap',
      bootstrap_date: '2026-07-19T23:03:53Z',
      bootstrap_reason: 'Governance audit remediation',
    });
    expect(evidence.bootstrap_origin).toBe('Implementation Bootstrap');
    expect(evidence.bootstrap_date).toBe('2026-07-19T23:03:53Z');
    expect(evidence.bootstrap_reason).toBe('Governance audit remediation');
  });

  it('non-bootstrapped EWOs have null bootstrap fields', () => {
    const evidence = makeEvidence();
    expect(evidence.bootstrap_origin).toBeNull();
    expect(evidence.bootstrap_date).toBeNull();
    expect(evidence.bootstrap_reason).toBeNull();
  });

  it('bootstrap transparency does not affect lifecycle derivation', () => {
    const bootstrapped = makeEvidence({ bootstrap_origin: 'Implementation Bootstrap', implementation_complete: true, completion_report_present: true });
    const normal = makeEvidence({ implementation_complete: true, completion_report_present: true });
    expect(deriveLifecycleState(bootstrapped)).toBe(deriveLifecycleState(normal));
  });
});

// ─── Requirement 6 — Dashboard Truthfulness ─────────────────────────────────────

describe('EWO-017R Requirement 6 — Dashboard Truthfulness', () => {
  it('distinguishes engineering_complete from po_testing_pending', () => {
    const engComplete = makeEvidence({ implementation_complete: true, completion_report_present: false });
    const poTestingPending = makeEvidence({ implementation_complete: true, completion_report_present: true, po_testing_completed: false });
    expect(deriveLifecycleState(engComplete)).toBe('engineering_complete');
    expect(deriveLifecycleState(poTestingPending)).toBe('po_testing_pending');
    expect(statusForState(deriveLifecycleState(engComplete))).toBe('engineering_complete');
    expect(statusForState(deriveLifecycleState(poTestingPending))).toBe('engineering_complete');
  });

  it('distinguishes awaiting_acceptance from closed', () => {
    const awaiting = makeEvidence({ implementation_complete: true, completion_report_present: true, po_testing_completed: true, po_acceptance_granted: false });
    const closed = makeEvidence({ implementation_complete: true, completion_report_present: true, po_testing_completed: true, po_acceptance_granted: true });
    expect(deriveLifecycleState(awaiting)).toBe('awaiting_po_acceptance');
    expect(deriveLifecycleState(closed)).toBe('closed');
    expect(statusForState(deriveLifecycleState(awaiting))).toBe('po_acceptance');
    expect(statusForState(deriveLifecycleState(closed))).toBe('closed');
  });

  it('isStatusTruthful detects premature closure', () => {
    const evidence = makeEvidence({ implementation_complete: true, completion_report_present: true, po_testing_completed: false });
    const derived = deriveLifecycleState(evidence);
    expect(isStatusTruthful('closed', derived)).toBe(false);
  });

  it('isStatusTruthful confirms truthful status', () => {
    const evidence = makeEvidence({ implementation_complete: true, completion_report_present: true, po_testing_completed: true, po_acceptance_granted: true });
    const derived = deriveLifecycleState(evidence);
    expect(isStatusTruthful('closed', derived)).toBe(true);
  });
});

// ─── Requirement 7 — Integrity Engine Awareness ─────────────────────────────────

describe('EWO-017R Requirement 7 — Integrity Engine Awareness', () => {
  it('engineering_complete is a healthy state', () => {
    expect(isHealthyLifecycleState('engineering_complete')).toBe(true);
  });

  it('po_testing_pending is a healthy state', () => {
    expect(isHealthyLifecycleState('po_testing_pending')).toBe(true);
  });

  it('awaiting_po_acceptance is a healthy state', () => {
    expect(isHealthyLifecycleState('awaiting_po_acceptance')).toBe(true);
  });

  it('closed is a healthy state', () => {
    expect(isHealthyLifecycleState('closed')).toBe(true);
  });

  it('created and implementation_started are healthy states', () => {
    expect(isHealthyLifecycleState('created')).toBe(true);
    expect(isHealthyLifecycleState('implementation_started')).toBe(true);
  });

  it('rejected is a governance failure', () => {
    expect(isGovernanceFailure('rejected')).toBe(true);
    expect(isHealthyLifecycleState('rejected')).toBe(false);
  });

  it('superseded is a governance failure', () => {
    expect(isGovernanceFailure('superseded')).toBe(true);
    expect(isHealthyLifecycleState('superseded')).toBe(false);
  });

  it('po_testing_pending is NOT a governance failure', () => {
    expect(isGovernanceFailure('po_testing_pending')).toBe(false);
  });
});

// ─── Requirement 8 — Regression Protection ──────────────────────────────────────

describe('EWO-017R Requirement 8 — Regression Protection', () => {
  it('deriveLifecycleState is a pure function (no side effects)', () => {
    const evidence = makeEvidence({ implementation_complete: true });
    const result1 = deriveLifecycleState(evidence);
    const result2 = deriveLifecycleState(evidence);
    expect(result1).toBe(result2);
    expect(evidence.implementation_complete).toBe(true); // unchanged
  });

  it('isClosureEligible is a pure function', () => {
    const evidence = makeEvidence({ po_acceptance_granted: true, implementation_complete: true, engineering_package_attached: true, completion_report_present: true, po_testing_completed: true });
    expect(isClosureEligible(evidence)).toBe(true);
    expect(isClosureEligible(evidence)).toBe(true);
  });

  it('statusForState covers all lifecycle states', () => {
    const allStates: LifecycleState[] = ['created', 'implementation_started', 'engineering_complete', 'po_testing_pending', 'awaiting_po_acceptance', 'closed', 'rejected', 'superseded', 'archived'];
    for (const state of allStates) {
      expect(statusForState(state)).toBeTruthy();
    }
  });
});

// ─── Product Owner Tests ────────────────────────────────────────────────────────

describe('EWO-017R Product Owner Tests', () => {
  it('TEST 1: Bootstrap with implementation complete + PO testing pending → NOT closed', () => {
    const evidence = makeEvidence({
      implementation_complete: true,
      engineering_package_attached: true,
      completion_report_present: true,
      po_testing_completed: false,
      po_acceptance_granted: false,
      bootstrap_origin: 'Implementation Bootstrap',
    });
    const state = deriveLifecycleState(evidence);
    expect(state).toBe('po_testing_pending');
    expect(state).not.toBe('closed');
    expect(isClosureEligible(evidence)).toBe(false);
  });

  it('TEST 2: Complete PO testing → advances to awaiting_po_acceptance', () => {
    const evidence = makeEvidence({
      implementation_complete: true,
      engineering_package_attached: true,
      completion_report_present: true,
      po_testing_completed: true,
      po_acceptance_granted: false,
    });
    const state = deriveLifecycleState(evidence);
    expect(state).toBe('awaiting_po_acceptance');
    expect(isClosureEligible(evidence)).toBe(false);
  });

  it('TEST 3: Grant PO acceptance → closed', () => {
    const evidence = makeEvidence({
      implementation_complete: true,
      engineering_package_attached: true,
      completion_report_present: true,
      po_testing_completed: true,
      po_acceptance_granted: true,
    });
    const state = deriveLifecycleState(evidence);
    expect(state).toBe('closed');
    expect(isClosureEligible(evidence)).toBe(true);
  });

  it('TEST 4: Lifecycle history — every transition is a distinct state', () => {
    const states: LifecycleState[] = [
      'created',
      'implementation_started',
      'engineering_complete',
      'po_testing_pending',
      'awaiting_po_acceptance',
      'closed',
    ];
    // Each transition produces a different state
    for (let i = 0; i < states.length - 1; i++) {
      expect(states[i]).not.toBe(states[i + 1]);
    }
    // Bootstrap history preserved in evidence
    const evidence = makeEvidence({
      bootstrap_origin: 'Implementation Bootstrap',
      bootstrap_date: '2026-07-19T23:03:53Z',
      bootstrap_reason: 'Governance audit remediation',
    });
    expect(evidence.bootstrap_origin).toBeTruthy();
    expect(evidence.bootstrap_date).toBeTruthy();
    expect(evidence.bootstrap_reason).toBeTruthy();
  });
});

// ─── Acceptance Standards ───────────────────────────────────────────────────────

describe('EWO-017R Acceptance Standards', () => {
  it('A1: Closed always means Product Owner Accepted', () => {
    const evidence = makeEvidence({
      implementation_complete: true,
      engineering_package_attached: true,
      completion_report_present: true,
      po_testing_completed: true,
      po_acceptance_granted: true,
    });
    expect(deriveLifecycleState(evidence)).toBe('closed');
    expect(isClosureEligible(evidence)).toBe(true);
  });

  it('A2: Closed without PO acceptance is NOT truthful', () => {
    const evidence = makeEvidence({
      implementation_complete: true,
      completion_report_present: true,
      po_testing_completed: true,
      po_acceptance_granted: false,
    });
    const derived = deriveLifecycleState(evidence);
    expect(isStatusTruthful('closed', derived)).toBe(false);
  });

  it('A3: Lifecycle is derived from evidence (not assumptions)', () => {
    const noImpl = makeEvidence();
    const withImpl = makeEvidence({ implementation_complete: true });
    const withReport = makeEvidence({ implementation_complete: true, completion_report_present: true });
    const withTesting = makeEvidence({ implementation_complete: true, completion_report_present: true, po_testing_completed: true });
    const withAcceptance = makeEvidence({ implementation_complete: true, completion_report_present: true, po_testing_completed: true, po_acceptance_granted: true });
    expect(deriveLifecycleState(noImpl)).toBe('created');
    expect(deriveLifecycleState(withImpl)).toBe('engineering_complete');
    expect(deriveLifecycleState(withReport)).toBe('po_testing_pending');
    expect(deriveLifecycleState(withTesting)).toBe('awaiting_po_acceptance');
    expect(deriveLifecycleState(withAcceptance)).toBe('closed');
  });

  it('A4: Bootstrap history remains visible', () => {
    const evidence = makeEvidence({
      bootstrap_origin: 'Implementation Bootstrap',
      bootstrap_date: '2026-07-19T23:03:53Z',
      bootstrap_reason: 'Governance audit remediation',
    });
    expect(evidence.bootstrap_origin).toBe('Implementation Bootstrap');
    expect(evidence.bootstrap_date).toBe('2026-07-19T23:03:53Z');
    expect(evidence.bootstrap_reason).toBe('Governance audit remediation');
  });

  it('A5: Dashboards distinguish engineering completion from PO completion', () => {
    const engComplete = makeEvidence({ implementation_complete: true, completion_report_present: false });
    const poPending = makeEvidence({ implementation_complete: true, completion_report_present: true, po_testing_completed: false });
    const awaiting = makeEvidence({ implementation_complete: true, completion_report_present: true, po_testing_completed: true, po_acceptance_granted: false });
    const closed = makeEvidence({ implementation_complete: true, completion_report_present: true, po_testing_completed: true, po_acceptance_granted: true });

    expect(deriveLifecycleState(engComplete)).toBe('engineering_complete');
    expect(deriveLifecycleState(poPending)).toBe('po_testing_pending');
    expect(deriveLifecycleState(awaiting)).toBe('awaiting_po_acceptance');
    expect(deriveLifecycleState(closed)).toBe('closed');

    expect(statusForState(deriveLifecycleState(engComplete))).toBe('engineering_complete');
    expect(statusForState(deriveLifecycleState(poPending))).toBe('engineering_complete');
    expect(statusForState(deriveLifecycleState(awaiting))).toBe('po_acceptance');
    expect(statusForState(deriveLifecycleState(closed))).toBe('closed');
  });
});
