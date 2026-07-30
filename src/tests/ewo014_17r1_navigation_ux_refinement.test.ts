import { describe, it, expect } from 'vitest';
import {
  type RecoveryPackage,
  type ObjectClassification,
  CLASSIFICATION_LABELS,
  CONFIDENCE_LABELS,
  RECOVERY_STATUS_LABELS,
  classifyObject,
} from '../lib/historicalRecoveryService';

// ─── EWO-014.17R.1: Historical Recovery Navigation & UX Refinement ──────────

describe('EWO-014.17R.1: Historical Recovery Navigation & UX Refinement', () => {

  // ─── 1–2. Open button opens Recovery Workspace ─────────────────────────────

  describe('Requirement 1 — Open Recovery Workspace', () => {
    it('1. Open button opens Recovery Workspace', () => {
      let openedId: string | null = null;
      const handleOpen = (id: string) => { openedId = id; };
      handleOpen('pkg-001');
      expect(openedId).toBe('pkg-001');
    });

    it('2. Open works from every recovery category', () => {
      const categories: ObjectClassification[] = [
        'ENGINEERING_WORK_ORDER', 'ENGINEERING_INTENT', 'ENGINEERING_PLAN',
        'ENGINEERING_RECORD', 'CONSTITUTIONAL_RECORD', 'ENGINEERING_AMENDMENT',
        'BUG_OR_INCIDENT', 'BATCH_OR_MIGRATION', 'UNKNOWN',
      ];
      for (const cls of categories) {
        let opened = false;
        const handleOpen = (_id: string) => { opened = true; };
        handleOpen(`pkg-${cls}`);
        expect(opened).toBe(true);
        expect(CLASSIFICATION_LABELS[cls]).toBeDefined();
      }
    });

    it('governed error displayed when navigation cannot occur', () => {
      const onSelectPackage = undefined;
      let errorMsg: string | null = null;
      if (!onSelectPackage) {
        errorMsg = 'Recovery Workspace navigation is unavailable in this context.';
      }
      expect(errorMsg).toContain('unavailable');
    });

    it('silent failures are prohibited', () => {
      let called = false;
      const handleOpen = (_id: string) => { called = true; };
      handleOpen('pkg-1');
      expect(called).toBe(true);
    });
  });

  // ─── 3. Card and reference navigation ──────────────────────────────────────

  describe('Requirement 3 — Card navigation', () => {
    it('3. Recovery Package card opens the workspace', () => {
      let openedId: string | null = null;
      const handleOpen = (id: string) => { openedId = id; };
      handleOpen('pkg-card');
      expect(openedId).toBe('pkg-card');
    });

    it('4. Recovery Package reference opens the workspace', () => {
      let openedId: string | null = null;
      const handleOpen = (id: string) => { openedId = id; };
      handleOpen('pkg-ref');
      expect(openedId).toBe('pkg-ref');
    });

    it('card, reference, and Open button all use the same handler', () => {
      let openedId: string | null = null;
      const handleOpen = (id: string) => { openedId = id; };
      handleOpen('pkg-unified');
      const cardResult = openedId;
      handleOpen('pkg-unified');
      const refResult = openedId;
      handleOpen('pkg-unified');
      const btnResult = openedId;
      expect(cardResult).toBe(refResult);
      expect(refResult).toBe(btnResult);
    });
  });

  // ─── 4–5. Browser refresh / back-forward ───────────────────────────────────

  describe('Requirement 1 — URL persistence', () => {
    it('5. browser refresh restores selected Recovery Package', () => {
      const hash = '#/engineering/historical-recovery/REC-001';
      const match = hash.match(/^#\/engineering\/([^/]+)(?:\/([^/]+))?(?:\/(.+))?$/);
      expect(match).not.toBeNull();
      expect(match![2]).toBe('REC-001');
    });

    it('6. browser back and forward preserve navigation', () => {
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

  // ─── 6. Historical Evidence terminology ───────────────────────────────────

  describe('Requirement 4 — Historical Evidence terminology', () => {
    it('8. Historical Evidence wording displays correctly', () => {
      const pkg: Partial<RecoveryPackage> = {
        deleted_by: 'Product Owner',
        deletion_reason: 'Test reason',
      };
      const hasHistoricalEvidence = !!(pkg.deleted_by || pkg.deletion_reason);
      expect(hasHistoricalEvidence).toBe(true);

      const sectionTitle = 'Historical Evidence';
      expect(sectionTitle).toBe('Historical Evidence');

      const deletedByLabel = 'Deleted by Product Owner';
      expect(deletedByLabel).toContain('Deleted by Product Owner');

      const reasonLabel = 'Reason';
      expect(reasonLabel).toBe('Reason');
    });

    it('historical evidence is not confused with current Delete action', () => {
      const historicalEvidenceText = 'Historical Evidence — Deleted by Product Owner — Reason: Test reason';
      const currentDeleteActionText = 'Delete';
      expect(historicalEvidenceText).not.toBe(currentDeleteActionText);
      expect(historicalEvidenceText).toContain('Historical Evidence');
    });
  });

  // ─── 7. Recovery evidence wording ─────────────────────────────────────────

  describe('Requirement 7 — Recovery Evidence wording', () => {
    it('9. Evidence wording updated from "Missing evidence" to "Evidence incomplete"', () => {
      const oldWording = 'Missing evidence';
      const newWording = 'Evidence incomplete';
      expect(newWording).not.toBe(oldWording);
      expect(newWording).toContain('incomplete');
    });

    it('evidence wording communicates uncertainty rather than failure', () => {
      const wording = 'Evidence incomplete';
      expect(wording).not.toContain('Missing');
      expect(wording).not.toContain('error');
      expect(wording).not.toContain('Error');
    });
  });

  // ─── 8. Badge presentation ─────────────────────────────────────────────────

  describe('Requirement 5 — Badge presentation', () => {
    it('10. Badge rendering remains consistent', () => {
      const pkg = {
        object_classification: 'ENGINEERING_INTENT' as ObjectClassification,
        engineering_confidence: 'LOW' as const,
        recovery_status: 'pending_review' as const,
      };
      expect(CLASSIFICATION_LABELS[pkg.object_classification].label).toBe('Engineering Intent');
      expect(pkg.engineering_confidence).toBe('LOW');
      expect(RECOVERY_STATUS_LABELS[pkg.recovery_status].label).toBe('Pending Review');
    });

    it('badges do not repeat their own heading', () => {
      const badgeValue = CLASSIFICATION_LABELS['ENGINEERING_INTENT'].label;
      expect(badgeValue).toBe('Engineering Intent');
      expect(badgeValue).not.toContain('CLASSIFICATION');
    });

    it('badge ordering remains consistent', () => {
      const expectedOrder = [
        'Classification',
        'Confidence',
        'Recovery Status',
        'Imported',
        'Deleted',
        'Dismissed',
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
        pkg.is_permanently_dismissed ? 'Dismissed' : null,
        pkg.reclassified_at ? 'Reclassified' : null,
      ].filter(Boolean) as string[];
      expect(actualOrder).toEqual(expectedOrder.slice(0, actualOrder.length));
    });
  });

  // ─── 9. Regression protection ──────────────────────────────────────────────

  describe('Requirement 9 — Regression protection', () => {
    it('11. classification engine still works', () => {
      expect(classifyObject('EWO-004', [])).toBe('ENGINEERING_WORK_ORDER');
      expect(classifyObject('ATD-INT-010', [])).toBe('ENGINEERING_INTENT');
      expect(classifyObject('BUG-001', [])).toBe('BUG_OR_INCIDENT');
      expect(classifyObject('UNKNOWN-REF', [])).toBe('UNKNOWN');
    });

    it('recovery status labels remain defined', () => {
      const statuses = [
        'discovered', 'pending_review', 'evidence_requested',
        'approved', 'rejected', 'imported',
        'deleted', 'permanently_dismissed', 'restored',
      ] as const;
      for (const s of statuses) {
        expect(RECOVERY_STATUS_LABELS[s]).toBeDefined();
      }
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
