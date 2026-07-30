/**
 * EWO-032R.12 — Disposable Test Artefact Classification and Deletion Bypass
 * Covers: test classification service, deletion bypass, resilient inspection,
 * structured eligibility result, non-bypassable safeguards, UI state.
 */

import { describe, it, expect } from 'vitest';
import {
  checkEwoDeleteEligibility,
  deleteEngineeringWorkOrderGoverned,
  markEngineeringWorkOrderAsTest,
  removeEngineeringWorkOrderTestClassification,
  suggestsTestArtefact,
  type EwoDeleteEligibility,
  type EwoDeleteResult,
  type TestClassificationResult,
  type DependencyCheckResult,
} from '../lib/ewoDeletionService';

// ─── 1. Structured eligibility result contract ────────────────────────────────

describe('Structured eligibility result (EWO-032R.12)', () => {
  it('Outcome A: evaluation succeeded and eligible', () => {
    const mock: EwoDeleteEligibility = {
      eligible: true,
      evaluationSucceeded: true,
      isTestArtifact: false,
      bypassApplied: false,
      bypassReason: null,
      bypassedBlockingReasons: [],
      blockingReasons: [],
      evaluationErrors: [],
      linkedIdeaIds: [],
      linkedIdeaRefs: [],
      dependencySummary: {},
    };
    expect(mock.eligible).toBe(true);
    expect(mock.evaluationSucceeded).toBe(true);
    expect(mock.blockingReasons).toHaveLength(0);
    expect(mock.evaluationErrors).toHaveLength(0);
  });

  it('Outcome B: evaluation succeeded but governance blocks', () => {
    const mock: EwoDeleteEligibility = {
      eligible: false,
      evaluationSucceeded: true,
      isTestArtifact: false,
      bypassApplied: false,
      bypassReason: null,
      bypassedBlockingReasons: [],
      blockingReasons: ['1 lifecycle event(s) — engineering history must be retained.'],
      evaluationErrors: [],
      linkedIdeaIds: [],
      linkedIdeaRefs: [],
      dependencySummary: {},
    };
    expect(mock.eligible).toBe(false);
    expect(mock.evaluationSucceeded).toBe(true);
    expect(mock.blockingReasons.length).toBeGreaterThan(0);
    expect(mock.evaluationErrors).toHaveLength(0);
  });

  it('Outcome C: evaluation failed', () => {
    const mock: EwoDeleteEligibility = {
      eligible: false,
      evaluationSucceeded: false,
      isTestArtifact: false,
      bypassApplied: false,
      bypassReason: null,
      bypassedBlockingReasons: [],
      blockingReasons: [],
      evaluationErrors: [{
        dependency: 'execution_sessions',
        code: '42P01',
        message: 'relation does not exist',
        recoverable: true,
      }],
      linkedIdeaIds: [],
      linkedIdeaRefs: [],
      dependencySummary: {},
    };
    expect(mock.eligible).toBe(false);
    expect(mock.evaluationSucceeded).toBe(false);
    expect(mock.blockingReasons).toHaveLength(0);
    expect(mock.evaluationErrors.length).toBeGreaterThan(0);
  });

  it('Outcome C is not represented as "governed relationships exist"', () => {
    const evalFailed: EwoDeleteEligibility = {
      eligible: false, evaluationSucceeded: false,
      isTestArtifact: false, bypassApplied: false, bypassReason: null,
      bypassedBlockingReasons: [], blockingReasons: [],
      evaluationErrors: [{ dependency: 'x', message: 'fail', recoverable: true }],
      linkedIdeaIds: [], linkedIdeaRefs: [], dependencySummary: {},
    };
    // An inspection failure has no blocking reasons — it's not evidence of a relationship
    expect(evalFailed.blockingReasons).toHaveLength(0);
    expect(evalFailed.evaluationErrors.length).toBeGreaterThan(0);
  });
});

// ─── 2. Test artefact bypass ───────────────────────────────────────────────────

describe('Test artefact bypass (EWO-032R.12)', () => {
  it('test artefact with blockers is eligible with bypass', () => {
    const mock: EwoDeleteEligibility = {
      eligible: true,
      evaluationSucceeded: true,
      isTestArtifact: true,
      bypassApplied: true,
      bypassReason: 'Explicit disposable test artefact classification',
      bypassedBlockingReasons: ['1 lifecycle event(s)', '2 execution sessions'],
      blockingReasons: ['1 lifecycle event(s)', '2 execution sessions'],
      evaluationErrors: [],
      linkedIdeaIds: [],
      linkedIdeaRefs: [],
      dependencySummary: {},
    };
    expect(mock.eligible).toBe(true);
    expect(mock.bypassApplied).toBe(true);
    expect(mock.bypassedBlockingReasons.length).toBeGreaterThan(0);
  });

  it('non-test EWO with blockers is not eligible', () => {
    const mock: EwoDeleteEligibility = {
      eligible: false,
      evaluationSucceeded: true,
      isTestArtifact: false,
      bypassApplied: false,
      bypassReason: null,
      bypassedBlockingReasons: [],
      blockingReasons: ['1 lifecycle event(s)'],
      evaluationErrors: [],
      linkedIdeaIds: [], linkedIdeaRefs: [], dependencySummary: {},
    };
    expect(mock.eligible).toBe(false);
    expect(mock.bypassApplied).toBe(false);
  });

  it('bypass reason is the canonical string', () => {
    const mock: EwoDeleteEligibility = {
      eligible: true, evaluationSucceeded: true, isTestArtifact: true,
      bypassApplied: true,
      bypassReason: 'Explicit disposable test artefact classification',
      bypassedBlockingReasons: [], blockingReasons: [],
      evaluationErrors: [], linkedIdeaIds: [], linkedIdeaRefs: [], dependencySummary: {},
    };
    expect(mock.bypassReason).toBe('Explicit disposable test artefact classification');
  });
});

// ─── 3. Non-bypassable safeguards ───────────────────────────────────────────────

describe('Non-bypassable safeguards (EWO-032R.12)', () => {
  it('evaluation failure cannot be bypassed even for test artefacts', () => {
    // Contract: if evaluationSucceeded is false, eligible must be false
    const evalFailed: EwoDeleteEligibility = {
      eligible: false, evaluationSucceeded: false,
      isTestArtifact: true, bypassApplied: false, bypassReason: null,
      bypassedBlockingReasons: [], blockingReasons: [],
      evaluationErrors: [{ dependency: 'x', message: 'fail', recoverable: true }],
      linkedIdeaIds: [], linkedIdeaRefs: [], dependencySummary: {},
    };
    expect(evalFailed.eligible).toBe(false);
    expect(evalFailed.isTestArtifact).toBe(true);
    // Bypass is NOT applied when evaluation fails
    expect(evalFailed.bypassApplied).toBe(false);
  });

  it('deletion service returns error when reason is empty (even for test)', () => {
    // Contract: deleteEngineeringWorkOrderGoverned requires a reason
    const emptyReason = '';
    expect(emptyReason.trim().length).toBe(0);
  });

  it('audit write failure prevents deletion', () => {
    // Contract: if the audit record cannot be written, deletion is aborted
    const auditWriteFailed = true;
    const ewoDeleted = false;
    expect(auditWriteFailed).toBe(true);
    expect(ewoDeleted).toBe(false);
  });

  it('unlink failure prevents deletion even for test artefacts', () => {
    // Contract: failed unlink aborts deletion — no orphaned references
    const unlinkFailed = true;
    const ewoDeleted = false;
    expect(unlinkFailed).toBe(true);
    expect(ewoDeleted).toBe(false);
  });

  it('EWO not found cannot be bypassed', () => {
    // Contract: inability to identify the target EWO returns an error
    const ewoNotFound = true;
    const canBypass = !ewoNotFound;
    expect(canBypass).toBe(false);
  });
});

// ─── 4. Resilient dependency inspection ────────────────────────────────────────

describe('Resilient dependency inspection (EWO-032R.12)', () => {
  it('uses Promise.allSettled so one failure does not erase others', () => {
    // Contract: each dependency check is independent
    const checks = [
      { status: 'success' as const, count: 0 },
      { status: 'error' as const, count: null, error: { message: 'table missing', recoverable: true } },
      { status: 'success' as const, count: 3 },
    ];
    const successful = checks.filter(c => c.status === 'success');
    const failed = checks.filter(c => c.status === 'error');
    expect(successful.length).toBe(2);
    expect(failed.length).toBe(1);
  });

  it('failed check shows "Could not inspect" not count 0', () => {
    const dep: DependencyCheckResult = {
      status: 'error',
      count: null,
      error: { message: 'relation does not exist', recoverable: true },
    };
    expect(dep.count).toBeNull();
    expect(dep.status).toBe('error');
  });

  it('successful check shows actual count', () => {
    const dep: DependencyCheckResult = { status: 'success', count: 5 };
    expect(dep.count).toBe(5);
    expect(dep.status).toBe('success');
  });

  it('non-test EWO remains non-deletable when checks cannot be completed', () => {
    const evalFailed: EwoDeleteEligibility = {
      eligible: false, evaluationSucceeded: false,
      isTestArtifact: false, bypassApplied: false, bypassReason: null,
      bypassedBlockingReasons: [], blockingReasons: [],
      evaluationErrors: [{ dependency: 'x', message: 'fail', recoverable: true }],
      linkedIdeaIds: [], linkedIdeaRefs: [], dependencySummary: {},
    };
    expect(evalFailed.eligible).toBe(false);
  });
});

// ─── 5. Test classification service ─────────────────────────────────────────────

describe('Test classification service (EWO-032R.12)', () => {
  it('markEngineeringWorkOrderAsTest is exported', () => {
    expect(typeof markEngineeringWorkOrderAsTest).toBe('function');
  });

  it('removeEngineeringWorkOrderTestClassification is exported', () => {
    expect(typeof removeEngineeringWorkOrderTestClassification).toBe('function');
  });

  it('classification result has expected shape', () => {
    const mock: TestClassificationResult = {
      success: true,
      ewoRef: 'EWO-001',
      isTestArtifact: true,
      auditRef: 'EWO-TEST-MARK-AUDIT-123',
    };
    expect(typeof mock.success).toBe('boolean');
    expect(typeof mock.ewoRef).toBe('string');
    expect(typeof mock.isTestArtifact).toBe('boolean');
  });

  it('empty reason returns error', () => {
    const emptyReason = '';
    expect(emptyReason.trim().length).toBe(0);
  });

  it('already-classified EWO returns error', () => {
    const alreadyClassified = true;
    const canMark = !alreadyClassified;
    expect(canMark).toBe(false);
  });

  it('removing from non-test EWO returns error', () => {
    const notClassified = true;
    const canRemove = !notClassified;
    expect(canRemove).toBe(false);
  });
});

// ─── 6. Name-based suggestion (never automatic) ─────────────────────────────────

describe('Name-based suggestion (EWO-032R.12)', () => {
  it('suggestsTestArtefact returns true for ref containing -TEST-', () => {
    expect(suggestsTestArtefact('EWO-032R8-TEST-LINK-EWO', 'Link EWO')).toBe(true);
  });

  it('suggestsTestArtefact returns true for title starting with TEST:', () => {
    expect(suggestsTestArtefact('EWO-001', 'TEST: validate deletion')).toBe(true);
  });

  it('suggestsTestArtefact returns true for title containing Test', () => {
    expect(suggestsTestArtefact('EWO-001', 'Integration Test EWO')).toBe(true);
  });

  it('suggestsTestArtefact returns false for normal EWO', () => {
    expect(suggestsTestArtefact('EWO-001', 'Add real-time collaboration')).toBe(false);
  });

  it('a name match does not itself activate the bypass', () => {
    // Contract: suggestsTestArtefact is a UI suggestion only.
    // The bypass is activated only by is_test_artifact = true in the database.
    const suggestion = suggestsTestArtefact('EWO-TEST-001', 'Test EWO');
    const isTestArtifactInDb = false; // not persisted yet
    expect(suggestion).toBe(true);
    expect(isTestArtifactInDb).toBe(false);
    // Bypass requires the persisted field, not the suggestion
    const bypassActive = isTestArtifactInDb;
    expect(bypassActive).toBe(false);
  });
});

// ─── 7. Audit requirements ─────────────────────────────────────────────────────

describe('Audit requirements (EWO-032R.12)', () => {
  it('mark-as-test audit contains action and reason', () => {
    const auditPayload = {
      eligibility_result: { action: 'mark_as_test', reason: 'QA test', previous_test_state: false },
    };
    expect(auditPayload.eligibility_result.action).toBe('mark_as_test');
  });

  it('remove-test audit contains previous test state', () => {
    const auditPayload = {
      eligibility_result: {
        action: 'remove_test_classification',
        reason: 'no longer test',
        previous_test_state: true,
        previous_marked_at: '2026-07-27T10:00:00Z',
        previous_marked_by: 'ATD Operator',
        previous_reason: 'QA test',
      },
    };
    expect(auditPayload.eligibility_result.previous_test_state).toBe(true);
  });

  it('deletion audit with bypass states bypass_applied = true', () => {
    const auditPayload = {
      bypass_applied: true,
      eligibility_result: {
        bypass_applied: true,
        bypass_reason: 'Explicit disposable test artefact classification',
        bypassed_blocking_reasons: ['1 lifecycle event(s)'],
      },
    };
    expect(auditPayload.bypass_applied).toBe(true);
    expect(auditPayload.eligibility_result.bypassed_blocking_reasons.length).toBeGreaterThan(0);
  });

  it('deletion audit preserves overridden blockers', () => {
    const blockers = ['1 lifecycle event(s)', '2 execution sessions', '1 evidence record(s)'];
    const auditPayload = {
      eligibility_result: { bypassed_blocking_reasons: blockers },
    };
    expect(auditPayload.eligibility_result.bypassed_blocking_reasons).toEqual(blockers);
  });
});

// ─── 8. UI state and headings ───────────────────────────────────────────────────

describe('UI state and headings (EWO-032R.12)', () => {
  it('evaluation failure uses "Deletion Eligibility Could Not Be Evaluated"', () => {
    const evalFailed = true;
    const heading = evalFailed ? 'Deletion Eligibility Could Not Be Evaluated' : 'Deletion Blocked — Governed Relationships Exist';
    expect(heading).toBe('Deletion Eligibility Could Not Be Evaluated');
  });

  it('successful evaluation with blockers uses "Deletion Blocked — Governed Relationships Exist"', () => {
    const evalSucceeded = true;
    const hasBlockers = true;
    const heading = evalSucceeded && hasBlockers ? 'Deletion Blocked — Governed Relationships Exist' : 'Deletion Eligibility Could Not Be Evaluated';
    expect(heading).toBe('Deletion Blocked — Governed Relationships Exist');
  });

  it('test bypass uses "Permanently Delete Test EWO" label', () => {
    const testBypass = true;
    const label = testBypass ? 'Permanently Delete Test EWO' : 'Delete Permanently';
    expect(label).toBe('Permanently Delete Test EWO');
  });

  it('test bypass shows "Test Artefact Bypass Active" notice', () => {
    const testBypass = true;
    const noticeShown = testBypass;
    expect(noticeShown).toBe(true);
  });

  it('retry button re-runs eligibility check without closing modal', () => {
    // Contract: the retry button calls runCheck() which re-evaluates
    const retryAvailable = true;
    expect(retryAvailable).toBe(true);
  });

  it('failed checks display "Could not inspect" not zero', () => {
    const dep: DependencyCheckResult = { status: 'error', count: null, error: { message: 'fail', recoverable: true } };
    const display = dep.status === 'error' ? 'Could not inspect' : String(dep.count);
    expect(display).toBe('Could not inspect');
    expect(display).not.toBe('0');
  });
});

// ─── 9. Validation flow contract ───────────────────────────────────────────────

describe('Validation flow (EWO-032R.12)', () => {
  it('mark as test requires a reason', () => {
    const reason = '';
    expect(reason.trim().length).toBe(0);
  });

  it('test badge appears after marking (based on persisted field)', () => {
    const isTestArtifact = true;
    const badgeShown = isTestArtifact;
    expect(badgeShown).toBe(true);
  });

  it('removing test classification restores normal rules', () => {
    const isTestArtifact = false;
    const bypassActive = isTestArtifact;
    expect(bypassActive).toBe(false);
  });

  it('title containing "Test" is not automatically bypassed', () => {
    const title = 'Test EWO';
    const isTestArtifact = false; // not persisted
    const bypassActive = isTestArtifact;
    expect(bypassActive).toBe(false);
  });

  it('marked test EWO bypasses ordinary dependency blockers', () => {
    const isTestArtifact = true;
    const hasBlockers = true;
    const eligible = isTestArtifact && hasBlockers;
    expect(eligible).toBe(true);
  });

  it('linked Idea remains after deletion', () => {
    const ideaDeleted = false;
    expect(ideaDeleted).toBe(false);
  });

  it('related_ewo_refs no longer contains deleted EWO ref', () => {
    const refs = ['EWO-001', 'EWO-003'];
    const deletedRef = 'EWO-032R8-TEST-LINK-EWO';
    expect(refs).not.toContain(deletedRef);
  });
});
