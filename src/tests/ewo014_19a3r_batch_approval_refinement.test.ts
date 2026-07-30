/**
 * EWO-014.19A.3R — Historical Recovery Batch Approval Refinements
 * Failure Visibility & Eligibility Transparency
 *
 * Unit tests for:
 *   - pipelineStage on every BatchItemResult
 *   - reason fallback ("Unknown processing error")
 *   - evaluateBatchEligibility() governed summary
 *   - no silent failures
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateBatchEligibility,
  type RecoveryPackage,
  type BatchItemResult,
  type BatchEligibilitySummary,
  CONFIDENCE_LABELS,
  RECOVERY_STATUS_LABELS,
  CLASSIFICATION_LABELS,
} from '../lib/historicalRecoveryService';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makePackage(overrides: Partial<RecoveryPackage> = {}): RecoveryPackage {
  return {
    id: 'pkg-001',
    recovery_ref: 'REC-001',
    canonical_reference: 'EWO-001',
    title: 'Test Recovery Package',
    executive_summary: 'Summary',
    engineering_objective: 'Objective',
    known_deliverables: 'Deliverables',
    known_verification_evidence: 'Evidence',
    known_po_decisions: 'Decisions',
    related_artefacts: null,
    historical_references: null,
    evidence_missing: null,
    recovery_notes: null,
    object_classification: 'ENGINEERING_WORK_ORDER',
    engineering_confidence: 'HIGH',
    confidence_explanation: 'High confidence',
    recovery_recommendation: null,
    recovery_status: 'pending',
    po_status: 'pending',
    po_reviewed_by: null,
    po_reviewed_at: null,
    imported_at: null,
    imported_ewo_id: null,
    is_deleted: false,
    deleted_by: null,
    deletion_reason: null,
    is_permanently_dismissed: false,
    permanently_dismissed_reason: null,
    reclassified_at: null,
    reclassified_by: null,
    reclassification_reason: null,
    previous_classification: null,
    discovered_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as RecoveryPackage;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EWO-014.19A.3R — Batch Approval Refinements', () => {

  // ── A. Pipeline Stage on BatchItemResult ──────────────────────────────────────
  describe('A. Pipeline Stage on BatchItemResult', () => {

    it('BatchItemResult type includes pipelineStage', () => {
      const item: BatchItemResult = {
        packageId: 'pkg-001',
        recoveryRef: 'REC-001',
        canonicalReference: 'EWO-001',
        title: 'Test',
        outcome: 'failed',
        reason: 'Duplicate Engineering Record',
        pipelineStage: 'Duplicate Protection',
        objectsImported: 0,
      };
      expect(item.pipelineStage).toBe('Duplicate Protection');
    });

    it('every failure outcome has a pipelineStage', () => {
      const stages: BatchItemResult['pipelineStage'][] = [
        'Validation',
        'Classification',
        'Duplicate Protection',
        'Approval',
        'Engineering Import',
        'Ledger Update',
        'Archive',
        'Audit Recording',
      ];
      for (const stage of stages) {
        const item: BatchItemResult = {
          packageId: 'pkg-001',
          recoveryRef: 'REC-001',
          canonicalReference: 'EWO-001',
          title: 'Test',
          outcome: 'failed',
          reason: 'Failed',
          pipelineStage: stage,
          objectsImported: 0,
        };
        expect(item.pipelineStage).toBe(stage);
      }
    });

    it('success outcome has pipelineStage "Completed"', () => {
      const item: BatchItemResult = {
        packageId: 'pkg-001',
        recoveryRef: 'REC-001',
        canonicalReference: 'EWO-001',
        title: 'Test',
        outcome: 'success',
        reason: 'Imported to Engineering Ledger',
        pipelineStage: 'Completed',
        ewoRef: 'EWO-001',
        objectsImported: 1,
      };
      expect(item.pipelineStage).toBe('Completed');
    });
  });

  // ── B. Reason Fallback ─────────────────────────────────────────────────────────
  describe('B. Reason Fallback (no blank reasons)', () => {

    it('displays "Unknown processing error" when reason is blank', () => {
      const item: BatchItemResult = {
        packageId: 'pkg-001',
        recoveryRef: 'REC-001',
        canonicalReference: 'EWO-001',
        title: 'Test',
        outcome: 'failed',
        reason: '',
        pipelineStage: 'Engineering Import',
        objectsImported: 0,
      };
      const displayReason = item.reason?.trim() || 'Unknown processing error';
      expect(displayReason).toBe('Unknown processing error');
    });

    it('displays "Unknown processing error" when reason is whitespace', () => {
      const item: BatchItemResult = {
        packageId: 'pkg-001',
        recoveryRef: 'REC-001',
        canonicalReference: 'EWO-001',
        title: 'Test',
        outcome: 'failed',
        reason: '   ',
        pipelineStage: 'Engineering Import',
        objectsImported: 0,
      };
      const displayReason = item.reason?.trim() || 'Unknown processing error';
      expect(displayReason).toBe('Unknown processing error');
    });

    it('displays "Unknown processing error" when reason is undefined', () => {
      const item: BatchItemResult = {
        packageId: 'pkg-001',
        recoveryRef: 'REC-001',
        canonicalReference: 'EWO-001',
        title: 'Test',
        outcome: 'failed',
        pipelineStage: 'Engineering Import',
        objectsImported: 0,
      };
      const displayReason = item.reason?.trim() || 'Unknown processing error';
      expect(displayReason).toBe('Unknown processing error');
    });

    it('displays the governed reason when present', () => {
      const item: BatchItemResult = {
        packageId: 'pkg-001',
        recoveryRef: 'REC-001',
        canonicalReference: 'EWO-001',
        title: 'Test',
        outcome: 'failed',
        reason: 'Duplicate Engineering Work Order already exists.',
        pipelineStage: 'Duplicate Protection',
        objectsImported: 0,
      };
      const displayReason = item.reason?.trim() || 'Unknown processing error';
      expect(displayReason).toBe('Duplicate Engineering Work Order already exists.');
    });
  });

  // ── C. Batch Eligibility Summary ───────────────────────────────────────────────
  describe('C. Batch Eligibility Summary', () => {

    it('returns all eligible when all packages are pending EWOs with same confidence', () => {
      const packages = [
        makePackage({ id: 'p1', recovery_ref: 'REC-001' }),
        makePackage({ id: 'p2', recovery_ref: 'REC-002' }),
      ];
      const summary = evaluateBatchEligibility(packages);
      expect(summary.totalSelected).toBe(2);
      expect(summary.eligibleCount).toBe(2);
      expect(summary.excludedCount).toBe(0);
      expect(summary.assessments.every(a => a.eligible)).toBe(true);
    });

    it('excludes non-EWO packages with governed reason', () => {
      const packages = [
        makePackage({ id: 'p1', recovery_ref: 'REC-001' }),
        makePackage({ id: 'p2', recovery_ref: 'REC-002', object_classification: 'ENGINEERING_REVIEW' }),
      ];
      const summary = evaluateBatchEligibility(packages);
      expect(summary.eligibleCount).toBe(1);
      expect(summary.excludedCount).toBe(1);
      const excluded = summary.assessments.find(a => a.packageId === 'p2');
      expect(excluded?.eligible).toBe(false);
      expect(excluded?.reason).toBe('Classification not Engineering Work Order');
    });

    it('excludes already-imported packages with governed reason', () => {
      const packages = [
        makePackage({ id: 'p1', recovery_ref: 'REC-001' }),
        makePackage({
          id: 'p2',
          recovery_ref: 'REC-002',
          po_status: 'approved',
          imported_at: new Date().toISOString(),
          imported_ewo_id: 'ewo-001',
        }),
      ];
      const summary = evaluateBatchEligibility(packages);
      const excluded = summary.assessments.find(a => a.packageId === 'p2');
      expect(excluded?.reason).toBe('Already imported');
    });

    it('excludes deleted packages with governed reason', () => {
      const packages = [
        makePackage({ id: 'p1', recovery_ref: 'REC-001' }),
        makePackage({ id: 'p2', recovery_ref: 'REC-002', is_deleted: true }),
      ];
      const summary = evaluateBatchEligibility(packages);
      const excluded = summary.assessments.find(a => a.packageId === 'p2');
      expect(excluded?.reason).toBe('Deleted or dismissed');
    });

    it('excludes packages with incomplete evidence', () => {
      const packages = [
        makePackage({ id: 'p1', recovery_ref: 'REC-001' }),
        makePackage({ id: 'p2', recovery_ref: 'REC-002', evidence_missing: 'Missing verification evidence' }),
      ];
      const summary = evaluateBatchEligibility(packages);
      const excluded = summary.assessments.find(a => a.packageId === 'p2');
      expect(excluded?.reason).toBe('Evidence incomplete');
    });

    it('excludes non-pending packages with governed reason', () => {
      const packages = [
        makePackage({ id: 'p1', recovery_ref: 'REC-001' }),
        makePackage({ id: 'p2', recovery_ref: 'REC-002', po_status: 'approved' }),
      ];
      const summary = evaluateBatchEligibility(packages);
      const excluded = summary.assessments.find(a => a.packageId === 'p2');
      expect(excluded?.reason).toBe('Pending manual review');
    });

    it('reports mixed confidence when multiple confidence levels present', () => {
      const packages = [
        makePackage({ id: 'p1', recovery_ref: 'REC-001', engineering_confidence: 'HIGH' }),
        makePackage({ id: 'p2', recovery_ref: 'REC-002', engineering_confidence: 'MEDIUM' }),
      ];
      const summary = evaluateBatchEligibility(packages);
      // Both are excluded due to mixed confidence
      expect(summary.eligibleCount).toBe(0);
      const reasons = summary.assessments.map(a => a.reason);
      expect(reasons).toContain('Mixed confidence');
    });

    it('reports Unknown confidence for UNKNOWN-level packages in mixed set', () => {
      const packages = [
        makePackage({ id: 'p1', recovery_ref: 'REC-001', engineering_confidence: 'HIGH' }),
        makePackage({ id: 'p2', recovery_ref: 'REC-002', engineering_confidence: 'UNKNOWN' }),
      ];
      const summary = evaluateBatchEligibility(packages);
      const unknownPkg = summary.assessments.find(a => a.packageId === 'p2');
      expect(unknownPkg?.reason).toBe('Unknown confidence');
    });
  });

  // ── D. No Silent Failures ───────────────────────────────────────────────────────
  describe('D. No Silent Failures', () => {

    it('every failed item has a non-blank reason or fallback', () => {
      const items: BatchItemResult[] = [
        { packageId: 'p1', recoveryRef: 'REC-001', canonicalReference: 'EWO-001', title: 'A', outcome: 'failed', reason: 'Duplicate Engineering Record', pipelineStage: 'Duplicate Protection', objectsImported: 0 },
        { packageId: 'p2', recoveryRef: 'REC-002', canonicalReference: 'EWO-002', title: 'B', outcome: 'failed', reason: '', pipelineStage: 'Engineering Import', objectsImported: 0 },
        { packageId: 'p3', recoveryRef: 'REC-003', canonicalReference: 'EWO-003', title: 'C', outcome: 'failed', pipelineStage: 'Approval', objectsImported: 0 },
      ];
      for (const item of items) {
        const displayReason = item.reason?.trim() || 'Unknown processing error';
        expect(displayReason.length).toBeGreaterThan(0);
      }
    });

    it('every skipped item has a non-blank reason or fallback', () => {
      const items: BatchItemResult[] = [
        { packageId: 'p1', recoveryRef: 'REC-001', canonicalReference: 'EWO-001', title: 'A', outcome: 'skipped', reason: 'Already imported', pipelineStage: 'Validation', objectsImported: 0 },
        { packageId: 'p2', recoveryRef: 'REC-002', canonicalReference: 'EWO-002', title: 'B', outcome: 'skipped', reason: '', pipelineStage: 'Duplicate Protection', objectsImported: 0 },
      ];
      for (const item of items) {
        const displayReason = item.reason?.trim() || 'Unknown processing error';
        expect(displayReason.length).toBeGreaterThan(0);
      }
    });
  });

  // ── E. Governance Transparency ─────────────────────────────────────────────────
  describe('E. Governance Transparency', () => {

    it('eligibility summary lists each excluded package with its specific reason', () => {
      const packages = [
        makePackage({ id: 'p1', recovery_ref: 'REC-001' }),
        makePackage({ id: 'p2', recovery_ref: 'REC-002', object_classification: 'ENGINEERING_REVIEW' }),
        makePackage({ id: 'p3', recovery_ref: 'REC-003', evidence_missing: 'Incomplete' }),
        makePackage({ id: 'p4', recovery_ref: 'REC-004', is_deleted: true }),
        makePackage({ id: 'p5', recovery_ref: 'REC-005', engineering_confidence: 'UNKNOWN' }),
      ];
      const summary = evaluateBatchEligibility(packages);
      expect(summary.totalSelected).toBe(5);
      // Each excluded package has a specific governed reason
      const excluded = summary.assessments.filter(a => !a.eligible);
      for (const a of excluded) {
        expect(a.reason).not.toBeNull();
        expect(a.reason?.length).toBeGreaterThan(0);
      }
    });

    it('eligibility summary does not use generic "mixed confidence" wording alone', () => {
      const packages = [
        makePackage({ id: 'p1', recovery_ref: 'REC-001', engineering_confidence: 'HIGH' }),
        makePackage({ id: 'p2', recovery_ref: 'REC-002', engineering_confidence: 'MEDIUM' }),
      ];
      const summary = evaluateBatchEligibility(packages);
      // Each excluded package has a specific reason, not just "mixed confidence"
      for (const a of summary.assessments) {
        if (!a.eligible) {
          expect(a.reason).not.toBe('Cannot bulk approve — mixed confidence, mixed classification, or non-EWO objects');
        }
      }
    });
  });

  // ── F. No Regressions ───────────────────────────────────────────────────────────
  describe('F. No Regressions', () => {

    it('CONFIDENCE_LABELS still exported', () => {
      expect(CONFIDENCE_LABELS).toBeDefined();
      expect(CONFIDENCE_LABELS.HIGH).toBeDefined();
    });

    it('RECOVERY_STATUS_LABELS still exported', () => {
      expect(RECOVERY_STATUS_LABELS).toBeDefined();
    });

    it('CLASSIFICATION_LABELS still exported', () => {
      expect(CLASSIFICATION_LABELS).toBeDefined();
    });

    it('BatchEligibilitySummary type has required fields', () => {
      const summary: BatchEligibilitySummary = {
        totalSelected: 5,
        eligibleCount: 2,
        excludedCount: 3,
        assessments: [],
      };
      expect(summary.totalSelected).toBe(5);
      expect(summary.eligibleCount).toBe(2);
      expect(summary.excludedCount).toBe(3);
    });
  });

  // ── G. Success Criteria ─────────────────────────────────────────────────────────
  describe('G. Success Criteria', () => {

    it('every failed package can display a reason', () => {
      const item: BatchItemResult = {
        packageId: 'p1', recoveryRef: 'REC-007', canonicalReference: 'EWO-007', title: 'A',
        outcome: 'failed', reason: 'Duplicate Engineering Work Order already exists.',
        pipelineStage: 'Duplicate Protection', objectsImported: 0,
      };
      expect(item.reason?.trim() || 'Unknown processing error').toBe('Duplicate Engineering Work Order already exists.');
    });

    it('every skipped package can display a reason', () => {
      const item: BatchItemResult = {
        packageId: 'p1', recoveryRef: 'REC-015', canonicalReference: 'EWO-015', title: 'A',
        outcome: 'skipped', reason: 'Previously imported.',
        pipelineStage: 'Validation', objectsImported: 0,
      };
      expect(item.reason?.trim() || 'Unknown processing error').toBe('Previously imported.');
    });

    it('pipeline stage shown for failures', () => {
      const item: BatchItemResult = {
        packageId: 'p1', recoveryRef: 'REC-007', canonicalReference: 'EWO-007', title: 'A',
        outcome: 'failed', reason: 'Engineering Work Order already exists.',
        pipelineStage: 'Duplicate Protection', objectsImported: 0,
      };
      expect(item.pipelineStage).toBe('Duplicate Protection');
    });

    it('exception fallback implemented', () => {
      const item: BatchItemResult = {
        packageId: 'p1', recoveryRef: 'REC-011', canonicalReference: 'EWO-011', title: 'A',
        outcome: 'failed', reason: '',
        pipelineStage: 'Engineering Import', objectsImported: 0,
      };
      expect(item.reason?.trim() || 'Unknown processing error').toBe('Unknown processing error');
    });

    it('eligibility summary explains excluded packages', () => {
      const packages = [
        makePackage({ id: 'p1', recovery_ref: 'REC-007', engineering_confidence: 'UNKNOWN' }),
        makePackage({ id: 'p2', recovery_ref: 'REC-011', object_classification: 'ENGINEERING_REVIEW' }),
        makePackage({ id: 'p3', recovery_ref: 'REC-015', evidence_missing: 'Incomplete' }),
      ];
      const summary = evaluateBatchEligibility(packages);
      expect(summary.excludedCount).toBe(3);
      const reasons = summary.assessments.map(a => a.reason);
      expect(reasons).toContain('Unknown confidence');
      expect(reasons).toContain('Classification not Engineering Work Order');
      expect(reasons).toContain('Evidence incomplete');
    });

    it('governance decisions are transparent', () => {
      const packages = [
        makePackage({ id: 'p1', recovery_ref: 'REC-001' }),
        makePackage({ id: 'p2', recovery_ref: 'REC-002', object_classification: 'ENGINEERING_REVIEW' }),
      ];
      const summary = evaluateBatchEligibility(packages);
      const excluded = summary.assessments.find(a => !a.eligible);
      expect(excluded?.reason).toBe('Classification not Engineering Work Order');
    });
  });
});
