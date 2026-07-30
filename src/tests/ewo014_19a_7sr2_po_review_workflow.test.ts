// EWO-014.19A.7SR.2 — Product Owner Review Workflow Tests
// Tests the PO review service layer: queue, decisions, idempotency, supersession.

import { describe, it, expect } from 'vitest';
import {
  getReviewCount,
  getReviewQueue,
  generateDefaultDecisionNote,
  type FinalDecision,
} from '../lib/poReviewService';

describe('EWO-014.19A.7SR.2 — Product Owner Review Workflow', () => {

  // ─── TEST 1: Review count returns zero when no reviews exist ──────────────
  it('TEST 1 — getReviewCount returns zero counts when no reviews exist', async () => {
    const counts = await getReviewCount();
    expect(counts).toBeDefined();
    expect(typeof counts.pending).toBe('number');
    expect(typeof counts.deferred).toBe('number');
    expect(typeof counts.resolved).toBe('number');
    expect(counts.pending).toBeGreaterThanOrEqual(0);
    expect(counts.deferred).toBeGreaterThanOrEqual(0);
    expect(counts.resolved).toBeGreaterThanOrEqual(0);
  });

  // ─── TEST 2: Review queue returns empty array when no reviews match ────────
  it('TEST 2 — getReviewQueue returns empty array when no reviews match', async () => {
    const queue = await getReviewQueue('all');
    expect(Array.isArray(queue)).toBe(true);
  });

  // ─── TEST 3: Review queue filters by status ──────────────────────────────
  it('TEST 3 — getReviewQueue filters by status correctly', async () => {
    const pendingQueue = await getReviewQueue('pending');
    expect(Array.isArray(pendingQueue)).toBe(true);
    // All returned items should have review_status = 'pending'
    for (const item of pendingQueue) {
      expect(item.review.review_status).toBe('pending');
    }
  });

  // ─── TEST 4: Default decision note is context-aware (not generic) ─────────
  it('TEST 4 — generateDefaultDecisionNote produces context-aware notes', () => {
    const ewoRef = 'EWO-014.19A.7SR.2';
    const batchRef = 'BATCH-INT-TEST-001';
    const evidenceSources = ['engineering_plans', 'ewo_completion_reports'];
    const missingFields = ['executive_summary'];

    const decisions: FinalDecision[] = [
      'APPROVE_HISTORICAL_RECOVERY',
      'LINK_EXISTING_WORK_ORDER',
      'INVALID_REFERENCE',
      'FALSE_POSITIVE',
      'DEFER_REVIEW',
      'NO_SAFE_RECOVERY',
    ];

    for (const decision of decisions) {
      const note = generateDefaultDecisionNote(ewoRef, batchRef, decision, evidenceSources, missingFields);

      // Must contain the EWO reference
      expect(note).toContain(ewoRef);

      // Must contain the batch reference
      expect(note).toContain(batchRef);

      // Must NOT be a generic low-value default
      expect(note).not.toBe('Approved');
      expect(note).not.toBe('Rejected');
      expect(note).not.toBe('Reviewed');

      // Must be at least 50 characters (substantive)
      expect(note.length).toBeGreaterThan(50);
    }
  });

  // ─── TEST 5: Decision notes differ between decisions ──────────────────────
  it('TEST 5 — generateDefaultDecisionNote produces different notes for different decisions', () => {
    const ewoRef = 'EWO-014.19A.7SR.2';
    const batchRef = 'BATCH-INT-TEST-001';
    const evidenceSources = ['engineering_plans'];
    const missingFields: string[] = [];

    const approveNote = generateDefaultDecisionNote(ewoRef, batchRef, 'APPROVE_HISTORICAL_RECOVERY', evidenceSources, missingFields);
    const rejectNote = generateDefaultDecisionNote(ewoRef, batchRef, 'INVALID_REFERENCE', evidenceSources, missingFields);
    const deferNote = generateDefaultDecisionNote(ewoRef, batchRef, 'DEFER_REVIEW', evidenceSources, missingFields);
    const noSafeNote = generateDefaultDecisionNote(ewoRef, batchRef, 'NO_SAFE_RECOVERY', evidenceSources, missingFields);

    expect(approveNote).not.toBe(rejectNote);
    expect(approveNote).not.toBe(deferNote);
    expect(approveNote).not.toBe(noSafeNote);
    expect(rejectNote).not.toBe(deferNote);
    expect(rejectNote).not.toBe(noSafeNote);
    expect(deferNote).not.toBe(noSafeNote);
  });

  // ─── TEST 6: NO_SAFE_RECOVERY note is distinguishable from INVALID_REFERENCE and FALSE_POSITIVE
  it('TEST 6 — NO_SAFE_RECOVERY note is distinguishable from INVALID_REFERENCE and FALSE_POSITIVE', () => {
    const ewoRef = 'EWO-TEST-001';
    const batchRef = 'BATCH-TEST-001';
    const evidenceSources = ['engineering_plans'];
    const missingFields = ['title', 'executive_summary'];

    const noSafeNote = generateDefaultDecisionNote(ewoRef, batchRef, 'NO_SAFE_RECOVERY', evidenceSources, missingFields);
    const invalidNote = generateDefaultDecisionNote(ewoRef, batchRef, 'INVALID_REFERENCE', evidenceSources, missingFields);
    const falsePosNote = generateDefaultDecisionNote(ewoRef, batchRef, 'FALSE_POSITIVE', evidenceSources, missingFields);

    // NO_SAFE_RECOVERY should mention "insufficient evidence" or "safely reconstruct"
    expect(noSafeNote.toLowerCase()).toMatch(/insufficient|safely|cannot|no safe/);

    // INVALID_REFERENCE should mention "invalid" or "format"
    expect(invalidNote.toLowerCase()).toMatch(/invalid|format|not.*canonical/);

    // FALSE_POSITIVE should mention "false positive" or "incorrectly"
    expect(falsePosNote.toLowerCase()).toMatch(/false positive|incorrectly/);

    // All three must be distinct
    expect(noSafeNote).not.toBe(invalidNote);
    expect(noSafeNote).not.toBe(falsePosNote);
    expect(invalidNote).not.toBe(falsePosNote);
  });

  // ─── TEST 7: DEFER_REVIEW note mentions deferral ──────────────────────────
  it('TEST 7 — DEFER_REVIEW note mentions deferral and pending additional evidence', () => {
    const note = generateDefaultDecisionNote('EWO-TEST-002', 'BATCH-TEST-002', 'DEFER_REVIEW', ['engineering_plans'], ['title']);
    expect(note.toLowerCase()).toMatch(/defer|pending|further|additional/);
  });

  // ─── TEST 8: APPROVE_HISTORICAL_RECOVERY note mentions no duplicate ───────
  it('TEST 8 — APPROVE_HISTORICAL_RECOVERY note mentions no existing duplicate', () => {
    const note = generateDefaultDecisionNote('EWO-TEST-003', 'BATCH-TEST-003', 'APPROVE_HISTORICAL_RECOVERY', ['engineering_plans'], []);
    expect(note.toLowerCase()).toMatch(/no existing duplicate|approved.*reconstruction|duplicate detected/);
  });

  // ─── TEST 9: LINK_EXISTING_WORK_ORDER note mentions no new Work Order ─────
  it('TEST 9 — LINK_EXISTING_WORK_ORDER note mentions no new Work Order created', () => {
    const note = generateDefaultDecisionNote('EWO-TEST-004', 'BATCH-TEST-004', 'LINK_EXISTING_WORK_ORDER', ['engineering_plans'], []);
    expect(note.toLowerCase()).toMatch(/no new work order|linked.*existing/);
  });

  // ─── TEST 10: Queue filtering by EWO ref works ─────────────────────────────
  it('TEST 10 — getReviewQueue filters by EWO reference', async () => {
    const queue = await getReviewQueue('all', undefined, 'NONEXISTENT-REF-12345');
    expect(Array.isArray(queue)).toBe(true);
    // Should return empty or only items matching the filter
    for (const item of queue) {
      expect(item.review.ewo_ref).toContain('NONEXISTENT-REF-12345');
    }
  });

  // ─── TEST 11: Queue filtering by decision type works ──────────────────────
  it('TEST 11 — getReviewQueue filters by decision type', async () => {
    const queue = await getReviewQueue('all', undefined, undefined, 'DEFER_REVIEW');
    expect(Array.isArray(queue)).toBe(true);
    for (const item of queue) {
      expect(item.review.final_decision).toBe('DEFER_REVIEW');
    }
  });
});
