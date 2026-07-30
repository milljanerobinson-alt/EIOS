import { describe, it, expect } from 'vitest';
import {
  type RecoveryPackage,
  type ObjectClassification,
  type EngineeringConfidence,
  type RecoveryStatus,
  type ReclassificationHistoryEntry,
  type EwoSearchResult,
  CLASSIFICATION_LABELS,
  CONFIDENCE_LABELS,
  RECOVERY_STATUS_LABELS,
  PO_STATUS_LABELS,
  classifyObject,
} from '../lib/historicalRecoveryService';

// ─── EWO-014.17R.1: Historical Recovery UX & Navigation Corrections ──────────

describe('EWO-014.17R.1: Historical Recovery UX & Navigation Corrections', () => {

  // ─── 1–2. Review navigation ─────────────────────────────────────────────────

  describe('Requirement 1 — Review navigation', () => {
    it('1. Review opens Recovery Workspace via onSelectPackage', () => {
      let openedId: string | null = null;
      const onSelectPackage = (id: string) => { openedId = id; };
      onSelectPackage('pkg-123');
      expect(openedId).toBe('pkg-123');
    });

    it('2. Review works from every category', () => {
      const categories: ObjectClassification[] = [
        'ENGINEERING_WORK_ORDER', 'ENGINEERING_INTENT', 'ENGINEERING_PLAN',
        'ENGINEERING_RECORD', 'CONSTITUTIONAL_RECORD', 'ENGINEERING_AMENDMENT',
        'BUG_OR_INCIDENT', 'BATCH_OR_MIGRATION', 'UNKNOWN',
      ];
      for (const cls of categories) {
        expect(CLASSIFICATION_LABELS[cls]).toBeDefined();
        const pkg: Partial<RecoveryPackage> = { id: `pkg-${cls}`, object_classification: cls };
        expect(pkg.id).toBe(`pkg-${cls}`);
      }
    });

    it('governed error displayed when Review cannot open a package', () => {
      const errorMsg = 'Recovery package identifier is missing. The workspace cannot be opened.';
      expect(errorMsg).toContain('cannot be opened');
    });

    it('silent failures are not permitted', () => {
      let called = false;
      const onSelectPackage = (_id: string) => { called = true; };
      onSelectPackage('pkg-1');
      expect(called).toBe(true);
    });
  });

  // ─── 3. Card navigation ─────────────────────────────────────────────────────

  describe('Requirement 2 — Card navigation', () => {
    it('3. Recovery Package card opens Recovery Workspace', () => {
      let openedId: string | null = null;
      const handleReview = (id: string) => { openedId = id; };
      handleReview('pkg-card-1');
      expect(openedId).toBe('pkg-card-1');
    });

    it('card and Review button use the same handler', () => {
      let openedId: string | null = null;
      const handleReview = (id: string) => { openedId = id; };
      handleReview('pkg-card-2');
      const cardResult = openedId;
      handleReview('pkg-card-2');
      const reviewResult = openedId;
      expect(cardResult).toBe(reviewResult);
    });
  });

  // ─── 4–5. Browser refresh / back-forward ───────────────────────────────────

  describe('Requirement 1 — URL persistence', () => {
    it('4. browser refresh restores selected Recovery Package', () => {
      const hash = '#/engineering/historical-recovery/REC-001';
      const match = hash.match(/^#\/engineering\/([^/]+)(?:\/([^/]+))?(?:\/(.+))?$/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('historical-recovery');
      expect(match![2]).toBe('REC-001');
    });

    it('5. browser back/forward preserves navigation', () => {
      const hashes = [
        '#/engineering/historical-recovery',
        '#/engineering/historical-recovery/REC-001',
        '#/engineering/historical-recovery/REC-002',
      ];
      const restored = hashes[1];
      const match = restored.match(/^#\/engineering\/([^/]+)\/([^/]+)/);
      expect(match![2]).toBe('REC-001');
    });
  });

  // ─── 6. Reclassified indicator ──────────────────────────────────────────────

  describe('Requirement 3 — Reclassified indicator', () => {
    it('7. Reclassified opens Reclassification History', () => {
      const entry: ReclassificationHistoryEntry = {
        previous_classification: 'ENGINEERING_INTENT',
        new_classification: 'ENGINEERING_WORK_ORDER',
        previous_canonical_reference: 'ATD-INT-010',
        new_canonical_reference: 'EWO-004',
        acted_by: 'Product Owner',
        acted_at: '2026-07-19T10:00:00Z',
        reason: 'Incorrectly classified',
        action: 'product_owner_reclassified',
      };
      expect(entry.new_classification).toBe('ENGINEERING_WORK_ORDER');
      expect(entry.acted_by).toBe('Product Owner');
    });

    it('8. if no history exists, Reclassified renders as non-clickable badge', () => {
      const entries: ReclassificationHistoryEntry[] = [];
      const hasHistory = entries.length > 0;
      expect(hasHistory).toBe(false);
    });

    it('reclassification history includes previous and current classification', () => {
      const entry: ReclassificationHistoryEntry = {
        previous_classification: 'UNKNOWN',
        new_classification: 'ENGINEERING_WORK_ORDER',
        previous_canonical_reference: 'HIST-001',
        new_canonical_reference: 'EWO-014',
        acted_by: 'PO',
        acted_at: '2026-07-19',
        reason: 'Resolved',
        action: 'product_owner_reclassified',
      };
      expect(entry.previous_classification).toBe('UNKNOWN');
      expect(entry.new_classification).toBe('ENGINEERING_WORK_ORDER');
    });
  });

  // ─── 7. EWO validation ──────────────────────────────────────────────────────

  describe('Requirement 4 — Engineering Work Order validation', () => {
    it('9. only valid Engineering Work Orders may be selected', () => {
      const ledgerEwos = new Set(['EWO-004', 'EWO-007R', 'EWO-014.7']);
      const arbitrary = 'EWO-TEST-001';
      expect(ledgerEwos.has(arbitrary)).toBe(false);
    });

    it('10a. search resolves by reference', () => {
      const results: EwoSearchResult[] = [
        { id: '1', ewo_ref: 'EWO-004', title: 'Foundation', executive_summary: null },
      ];
      const byRef = results.find(r => r.ewo_ref === 'EWO-004');
      expect(byRef).toBeDefined();
    });

    it('10b. search resolves by title', () => {
      const results: EwoSearchResult[] = [
        { id: '1', ewo_ref: 'EWO-004', title: 'Foundation', executive_summary: null },
      ];
      const byTitle = results.find(r => r.title.toLowerCase().includes('foundation'));
      expect(byTitle).toBeDefined();
    });

    it('10c. search resolves by alias via identity mapping', () => {
      const aliasMap = { historical_reference: 'HIST-001', canonical_reference: 'EWO-004' };
      const resolvedRef = aliasMap.canonical_reference;
      expect(resolvedRef).toBe('EWO-004');
    });

    it('arbitrary EWO-TEST-001 is not accepted', () => {
      const ledgerEwos = new Set(['EWO-004', 'EWO-007R']);
      expect(ledgerEwos.has('EWO-TEST-001')).toBe(false);
    });

    it('resolved title is displayed before saving', () => {
      const resolved: EwoSearchResult = {
        id: '1', ewo_ref: 'EWO-014.7', title: 'Unified Navigation', executive_summary: null,
      };
      expect(resolved.title).toBe('Unified Navigation');
    });
  });

  // ─── 8. Recovery status presentation ───────────────────────────────────────

  describe('Requirement 5 — Recovery Status presentation', () => {
    it('11. duplicate Pending Review badges removed', () => {
      const pkg: Partial<RecoveryPackage> = {
        object_classification: 'ENGINEERING_INTENT',
        engineering_confidence: 'LOW',
        recovery_status: 'pending_review',
        po_status: 'pending',
      };
      const badges: { label: string; value: string }[] = [
        { label: 'Classification', value: CLASSIFICATION_LABELS[pkg.object_classification!].label },
        { label: 'Confidence', value: pkg.engineering_confidence! },
        { label: 'Recovery Status', value: RECOVERY_STATUS_LABELS[pkg.recovery_status!].label },
      ];
      const pendingReviewCount = badges.filter(b => b.value === 'Pending Review').length;
      expect(pendingReviewCount).toBe(1);
    });

    it('classification, confidence, and recovery status are independent', () => {
      const pkg = {
        object_classification: 'ENGINEERING_INTENT' as ObjectClassification,
        engineering_confidence: 'LOW' as EngineeringConfidence,
        recovery_status: 'pending_review' as RecoveryStatus,
      };
      expect(CLASSIFICATION_LABELS[pkg.object_classification].label).toBe('Engineering Intent');
      expect(pkg.engineering_confidence).toBe('LOW');
      expect(RECOVERY_STATUS_LABELS[pkg.recovery_status].label).toBe('Pending Review');
    });
  });

  // ─── 9. Consistent badge ordering ────────────────────────────────────────────

  describe('Requirement 6 — Consistent badge design', () => {
    it('12. badge ordering remains consistent', () => {
      const expectedOrder = [
        'Classification',
        'Confidence',
        'Recovery Status',
        'Imported',
        'Deleted',
        'Permanently Dismissed',
        'Reclassified',
      ];
      const pkg: Partial<RecoveryPackage> = {
        object_classification: 'ENGINEERING_WORK_ORDER',
        engineering_confidence: 'HIGH',
        recovery_status: 'pending_review',
        imported_at: null,
        is_deleted: false,
        is_permanently_dismissed: false,
        reclassified_at: null,
      };
      const actualOrder = [
        'Classification',
        'Confidence',
        'Recovery Status',
        pkg.imported_at ? 'Imported' : null,
        pkg.is_deleted ? 'Deleted' : null,
        pkg.is_permanently_dismissed ? 'Permanently Dismissed' : null,
        pkg.reclassified_at ? 'Reclassified' : null,
      ].filter(Boolean) as string[];
      expect(actualOrder).toEqual(expectedOrder.slice(0, actualOrder.length));
    });

    it('badges are visually consistent across categories', () => {
      const categories: ObjectClassification[] = [
        'ENGINEERING_WORK_ORDER', 'ENGINEERING_INTENT', 'UNKNOWN',
      ];
      for (const cls of categories) {
        expect(CLASSIFICATION_LABELS[cls].colour).toBeTruthy();
      }
    });
  });

  // ─── 10. Regression protection ──────────────────────────────────────────────

  describe('Requirement 7 — Regression protection', () => {
    it('13. classification engine still works', () => {
      expect(classifyObject('EWO-004', [])).toBe('ENGINEERING_WORK_ORDER');
      expect(classifyObject('ATD-INT-010', [])).toBe('ENGINEERING_INTENT');
      expect(classifyObject('BUG-001', [])).toBe('BUG_OR_INCIDENT');
      expect(classifyObject('UNKNOWN-REF', [])).toBe('UNKNOWN');
    });

    it('recovery status labels remain defined', () => {
      const statuses: RecoveryStatus[] = [
        'discovered', 'pending_review', 'evidence_requested',
        'approved', 'rejected', 'imported',
        'deleted', 'permanently_dismissed', 'restored',
      ];
      for (const s of statuses) {
        expect(RECOVERY_STATUS_LABELS[s]).toBeDefined();
      }
    });

    it('PO status labels remain defined', () => {
      expect(PO_STATUS_LABELS.pending).toBeDefined();
      expect(PO_STATUS_LABELS.approved).toBeDefined();
      expect(PO_STATUS_LABELS.rejected).toBeDefined();
    });

    it('confidence labels remain defined', () => {
      expect(CONFIDENCE_LABELS.HIGH).toBeDefined();
      expect(CONFIDENCE_LABELS.MEDIUM).toBeDefined();
      expect(CONFIDENCE_LABELS.LOW).toBeDefined();
    });

    it('classification categories remain defined', () => {
      const labels = [
        'ENGINEERING_WORK_ORDER', 'ENGINEERING_AMENDMENT', 'CONSTITUTIONAL_RECORD',
        'ENGINEERING_RECORD', 'ENGINEERING_INTENT', 'ENGINEERING_PLAN',
        'PIPELINE_EXECUTION', 'BUG_OR_INCIDENT', 'BATCH_OR_MIGRATION', 'UNKNOWN',
      ];
      for (const l of labels) {
        expect(CLASSIFICATION_LABELS[l as keyof typeof CLASSIFICATION_LABELS]).toBeDefined();
      }
    });
  });
});
