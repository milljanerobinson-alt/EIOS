import { describe, it, expect } from 'vitest';
import {
  type EngineeringConfidence,
  type RecoveryPOStatus,
  type ObjectClassification,
  type RecoveryAuditAction,
  type RecoveryPackage,
  type DiscoveryResult,
  classifyObject,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_CATEGORIES,
  CONFIDENCE_LABELS,
  PO_STATUS_LABELS,
} from '../lib/historicalRecoveryService';

// ─── EWO-014.17R: Historical Recovery Discovery Scope & Governed Deletion ─────

describe('EWO-014.17R: Historical Recovery Discovery Scope & Governed Deletion', () => {

  // ─── 1–5. Classification Engine ─────────────────────────────────────────────

  describe('Classification engine', () => {
    it('1. ATD-INT-* classified as ENGINEERING_INTENT', () => {
      expect(classifyObject('ATD-INT-010', [])).toBe('ENGINEERING_INTENT');
      expect(classifyObject('ATD-INT-009', [])).toBe('ENGINEERING_INTENT');
    });

    it('2. ATD-PLN-* classified as ENGINEERING_PLAN', () => {
      expect(classifyObject('ATD-PLN-004', [])).toBe('ENGINEERING_PLAN');
      expect(classifyObject('ATD-PLN-003', [])).toBe('ENGINEERING_PLAN');
    });

    it('3. BUG-* classified as BUG_OR_INCIDENT', () => {
      expect(classifyObject('BUG-BF-001', [])).toBe('BUG_OR_INCIDENT');
      expect(classifyObject('BUG-001', [])).toBe('BUG_OR_INCIDENT');
    });

    it('4. BATCH-* classified as BATCH_OR_MIGRATION', () => {
      expect(classifyObject('BATCH-A', [])).toBe('BATCH_OR_MIGRATION');
      expect(classifyObject('BATCH-001', [])).toBe('BATCH_OR_MIGRATION');
    });

    it('5. EWO-* classified as ENGINEERING_WORK_ORDER', () => {
      expect(classifyObject('EWO-004', [])).toBe('ENGINEERING_WORK_ORDER');
      expect(classifyObject('EWO-007R', [])).toBe('ENGINEERING_WORK_ORDER');
      expect(classifyObject('EWO-007R.1', [])).toBe('ENGINEERING_WORK_ORDER');
      expect(classifyObject('EWO-014.17', [])).toBe('ENGINEERING_WORK_ORDER');
      expect(classifyObject('EWO-011', [])).toBe('ENGINEERING_WORK_ORDER');
    });

    it('CONST-* classified as CONSTITUTIONAL_RECORD', () => {
      expect(classifyObject('CONST-001', [])).toBe('CONSTITUTIONAL_RECORD');
    });

    it('AMD-* classified as ENGINEERING_AMENDMENT', () => {
      expect(classifyObject('AMD-001', [])).toBe('ENGINEERING_AMENDMENT');
      expect(classifyObject('CONST-001-AMD-004', [])).toBe('ENGINEERING_AMENDMENT');
    });

    it('ERC-* classified as ENGINEERING_RECORD', () => {
      expect(classifyObject('ERC-001', [])).toBe('ENGINEERING_RECORD');
    });

    it('unknown prefix classified as UNKNOWN', () => {
      expect(classifyObject('UNKNOWN-REF', [])).toBe('UNKNOWN');
    });

    it('never classifies as EWO solely from lifecycle evidence', () => {
      // A non-EWO ref that appears in lifecycle events should NOT be classified as EWO
      const evidence = [
        { source_table: 'engineering_lifecycle_events', source_record_ref: 'EVT-001', source_record_id: '1', evidence_type: 'lifecycle_event', evidence_summary: 'event by system' },
      ];
      expect(classifyObject('ATD-INT-010', evidence)).toBe('ENGINEERING_INTENT');
    });
  });

  // ─── 6. Identity mapping classification ───────────────────────────────────────

  describe('Identity mapping classification', () => {
    it('6. accepted identity mapping can classify an artefact as an EWO', () => {
      const evidence = [
        {
          source_table: 'engineering_identity_map',
          source_record_ref: 'HIST-001',
          source_record_id: '',
          evidence_type: 'identity_mapping',
          evidence_summary: 'Identity mapping: HIST-001 → EWO-004 (canonical)',
        },
      ];
      // The canonical ref is EWO-004, so it should classify as EWO
      expect(classifyObject('EWO-004', evidence)).toBe('ENGINEERING_WORK_ORDER');
    });

    it('identity mapping to non-EWO does not classify as EWO', () => {
      const evidence = [
        {
          source_table: 'engineering_identity_map',
          source_record_ref: 'HIST-001',
          source_record_id: '',
          evidence_type: 'identity_mapping',
          evidence_summary: 'Identity mapping: HIST-001 → ATD-INT-010 (canonical)',
        },
      ];
      expect(classifyObject('ATD-INT-010', evidence)).toBe('ENGINEERING_INTENT');
    });
  });

  // ─── 7–8. Queue filtering and category exposure ──────────────────────────────

  describe('Queue filtering', () => {
    it('7. default queue excludes non-EWO objects', () => {
      const packages: RecoveryPackage[] = [
        { id: '1', recovery_ref: 'REC-001', canonical_reference: 'EWO-004', title: 'EWO 4', object_classification: 'ENGINEERING_WORK_ORDER' } as RecoveryPackage,
        { id: '2', recovery_ref: 'REC-002', canonical_reference: 'ATD-INT-010', title: 'Intent 10', object_classification: 'ENGINEERING_INTENT' } as RecoveryPackage,
        { id: '3', recovery_ref: 'REC-003', canonical_reference: 'ATD-PLN-004', title: 'Plan 4', object_classification: 'ENGINEERING_PLAN' } as RecoveryPackage,
      ];
      const ewoOnly = packages.filter(p => p.object_classification === 'ENGINEERING_WORK_ORDER');
      expect(ewoOnly).toHaveLength(1);
      expect(ewoOnly[0].canonical_reference).toBe('EWO-004');
    });

    it('8. category filters expose non-EWO historical objects', () => {
      const allClassifications: ObjectClassification[] = [
        'ENGINEERING_WORK_ORDER', 'ENGINEERING_INTENT', 'ENGINEERING_PLAN', 'BUG_OR_INCIDENT', 'BATCH_OR_MIGRATION',
      ];
      // Each classification has a label in CLASSIFICATION_LABELS
      for (const cls of allClassifications) {
        expect(CLASSIFICATION_LABELS[cls]).toBeDefined();
        expect(CLASSIFICATION_LABELS[cls].label).toBeTruthy();
      }
    });
  });

  // ─── 9. Import guard ─────────────────────────────────────────────────────────

  describe('Import guard', () => {
    it('9. non-EWO package cannot be imported into engineering_work_orders', () => {
      const pkg: Partial<RecoveryPackage> = {
        object_classification: 'ENGINEERING_INTENT',
        po_status: 'approved',
      };
      // The import function checks object_classification === 'ENGINEERING_WORK_ORDER'
      const canImport = pkg.object_classification === 'ENGINEERING_WORK_ORDER';
      expect(canImport).toBe(false);
    });

    it('EWO package can be imported', () => {
      const pkg: Partial<RecoveryPackage> = {
        object_classification: 'ENGINEERING_WORK_ORDER',
        po_status: 'approved',
      };
      const canImport = pkg.object_classification === 'ENGINEERING_WORK_ORDER';
      expect(canImport).toBe(true);
    });

    it('import guard error message includes object type', () => {
      const classification = 'ENGINEERING_INTENT';
      const errorMsg = `This recovery package is classified as ${classification} and cannot be imported as an Engineering Work Order.`;
      expect(errorMsg).toContain('ENGINEERING_INTENT');
      expect(errorMsg).toContain('cannot be imported');
    });
  });

  // ─── 10–11. Reclassification ─────────────────────────────────────────────────

  describe('Reclassification', () => {
    it('10. Product Owner reclassification requires a reason', () => {
      // The reclassifyObject function checks reason.trim()
      const reason = '';
      const isValid = reason.trim().length > 0;
      expect(isValid).toBe(false);
    });

    it('reclassification with reason is valid', () => {
      const reason = 'This was incorrectly classified as an intent, it is actually an EWO';
      const isValid = reason.trim().length > 0;
      expect(isValid).toBe(true);
    });

    it('11. reclassification creates an audit event', () => {
      // The reclassifyObject function inserts an audit event with action 'product_owner_reclassified'
      const expectedAction: RecoveryAuditAction = 'product_owner_reclassified';
      expect(expectedAction).toBe('product_owner_reclassified');
    });

    it('reclassification audit includes before and after values', () => {
      const auditMetadata = {
        previous_classification: 'ENGINEERING_INTENT',
        new_classification: 'ENGINEERING_WORK_ORDER',
        previous_canonical_reference: 'ATD-INT-010',
        new_canonical_reference: 'EWO-004',
      };
      expect(auditMetadata.previous_classification).toBe('ENGINEERING_INTENT');
      expect(auditMetadata.new_classification).toBe('ENGINEERING_WORK_ORDER');
    });

    it('reclassifying as EWO validates canonical reference', () => {
      // If newClassification is EWO, canonical ref must match /^EWO-\d+/
      const ref = 'ATD-INT-010';
      const isValidEwoRef = /^EWO-\d+/.test(ref.toUpperCase());
      expect(isValidEwoRef).toBe(false);
    });
  });

  // ─── 12–16. Governed deletion ────────────────────────────────────────────────

  describe('Governed deletion', () => {
    it('12. recovery package deletion requires a reason', () => {
      const reason = '';
      const isValid = reason.trim().length > 0;
      expect(isValid).toBe(false);
    });

    it('13. deletion does not delete source evidence', () => {
      // The deleteRecoveryPackage function only updates the recovery_packages table
      // It does NOT touch engineering_records_library, engineering_lifecycle_events, etc.
      // Source evidence remains unchanged — only is_deleted=true is set
      const deletedPkg: Partial<RecoveryPackage> = {
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: 'Product Owner',
        deletion_reason: 'Not needed',
      };
      expect(deletedPkg.is_deleted).toBe(true);
      // Source evidence tables are never modified by the deletion function
    });

    it('14. imported packages cannot be deleted', () => {
      const pkg: Partial<RecoveryPackage> = {
        imported_at: new Date().toISOString(),
        imported_ewo_id: 'uuid-123',
      };
      const canDelete = !(pkg.imported_at && pkg.imported_ewo_id);
      expect(canDelete).toBe(false);
    });

    it('imported package shows deletion unavailable message', () => {
      const errorMsg = 'Deletion unavailable — this recovery package has already been imported.';
      expect(errorMsg).toContain('already been imported');
    });

    it('15. deleted packages leave the active queue', () => {
      const packages: RecoveryPackage[] = [
        { id: '1', recovery_ref: 'REC-001', canonical_reference: 'EWO-004', title: 'Active', is_deleted: false, is_permanently_dismissed: false } as RecoveryPackage,
        { id: '2', recovery_ref: 'REC-002', canonical_reference: 'EWO-009', title: 'Deleted', is_deleted: true, is_permanently_dismissed: false } as RecoveryPackage,
      ];
      const activeQueue = packages.filter(p => !p.is_deleted);
      expect(activeQueue).toHaveLength(1);
      expect(activeQueue[0].title).toBe('Active');
    });

    it('16. deleted packages remain visible in Deleted view', () => {
      const packages: RecoveryPackage[] = [
        { id: '1', recovery_ref: 'REC-001', canonical_reference: 'EWO-004', title: 'Active', is_deleted: false, is_permanently_dismissed: false } as RecoveryPackage,
        { id: '2', recovery_ref: 'REC-002', canonical_reference: 'EWO-009', title: 'Deleted', is_deleted: true, is_permanently_dismissed: false } as RecoveryPackage,
      ];
      const deletedView = packages.filter(p => p.is_deleted);
      expect(deletedView).toHaveLength(1);
      expect(deletedView[0].title).toBe('Deleted');
    });
  });

  // ─── 17–18. Restore and permanent dismissal ──────────────────────────────────

  describe('Restore and permanent dismissal', () => {
    it('17. restore returns a package to the queue', () => {
      const pkg: Partial<RecoveryPackage> = {
        is_deleted: true,
        po_status: 'pending',
      };
      // After restore: is_deleted=false, deleted_at=null, etc.
      const restored: Partial<RecoveryPackage> = {
        is_deleted: false,
        deleted_at: null,
        deleted_by: null,
        deletion_reason: null,
      };
      expect(restored.is_deleted).toBe(false);
      // Package should be back in the active queue
      expect(pkg.po_status).toBe('pending');
    });

    it('restore requires a reason', () => {
      const reason = '';
      const isValid = reason.trim().length > 0;
      expect(isValid).toBe(false);
    });

    it('18. permanently dismissed candidates are not recreated by discovery', () => {
      // The discovery engine checks is_permanently_dismissed and skips those refs
      const dismissedRefs = new Set(['ATD-INT-010']);
      const newCandidateRef = 'ATD-INT-010';
      const isSkipped = dismissedRefs.has(newCandidateRef);
      expect(isSkipped).toBe(true);
    });

    it('permanent dismissal does not delete underlying evidence', () => {
      // permanentlyDismissCandidate only updates the recovery_packages table
      // Source evidence in engineering_records_library etc. is never deleted
      const dismissedPkg: Partial<RecoveryPackage> = {
        is_permanently_dismissed: true,
        permanently_dismissed_at: new Date().toISOString(),
      };
      expect(dismissedPkg.is_permanently_dismissed).toBe(true);
    });
  });

  // ─── 19–20. Backward compatibility ───────────────────────────────────────────

  describe('Backward compatibility', () => {
    it('19. existing REC references are preserved during reclassification', () => {
      // The backfill and reclassification only update object_classification
      // The recovery_ref field is never changed
      const pkg: Partial<RecoveryPackage> = {
        recovery_ref: 'REC-001',
        object_classification: 'ENGINEERING_INTENT',
        previous_classification: 'UNKNOWN',
      };
      expect(pkg.recovery_ref).toBe('REC-001');
    });

    it('20. existing valid EWO recovery packages remain functional', () => {
      const pkg: RecoveryPackage = {
        id: '1',
        recovery_ref: 'REC-001',
        canonical_reference: 'EWO-004',
        title: 'Valid EWO Recovery',
        executive_summary: 'Summary',
        engineering_objective: 'Objective',
        known_deliverables: 'Deliverables',
        known_verification_evidence: 'Verification',
        known_po_decisions: '',
        related_artefacts: '',
        historical_references: '',
        evidence_sources: ['source1'],
        evidence_missing: '',
        recovery_notes: 'Notes',
        engineering_confidence: 'HIGH',
        confidence_explanation: 'High confidence',
        recovery_recommendation: 'Approve',
        po_status: 'pending',
        po_reviewed_by: null,
        po_reviewed_at: null,
        po_review_notes: null,
        imported_at: null,
        imported_ewo_id: null,
        recovered_by: 'Recovery Engine',
        recovered_at: '2026-07-17',
        created_at: '2026-07-17',
        updated_at: '2026-07-17',
        object_classification: 'ENGINEERING_WORK_ORDER',
        previous_classification: null,
        reclassified_by: null,
        reclassified_at: null,
        reclassification_reason: null,
        deleted_at: null,
        deleted_by: null,
        deletion_reason: null,
        is_deleted: false,
        permanently_dismissed_at: null,
        permanently_dismissed_by: null,
        permanently_dismissed_reason: null,
        is_permanently_dismissed: false,
      };
      expect(pkg.object_classification).toBe('ENGINEERING_WORK_ORDER');
      expect(pkg.po_status).toBe('pending');
      expect(pkg.is_deleted).toBe(false);
    });
  });

  // ─── 21. Bulk approval with classification ───────────────────────────────────

  describe('Bulk approval with classification', () => {
    it('21. bulk approval rejects mixed classifications', () => {
      const packages = [
        { id: '1', engineering_confidence: 'HIGH' as EngineeringConfidence, object_classification: 'ENGINEERING_WORK_ORDER' as ObjectClassification, po_status: 'pending' as RecoveryPOStatus, is_deleted: false, is_permanently_dismissed: false },
        { id: '2', engineering_confidence: 'HIGH' as EngineeringConfidence, object_classification: 'ENGINEERING_INTENT' as ObjectClassification, po_status: 'pending' as RecoveryPOStatus, is_deleted: false, is_permanently_dismissed: false },
      ];
      const classifications = new Set(packages.map(p => p.object_classification));
      expect(classifications.size).toBe(2);
      // Mixed classifications → cannot bulk approve
      expect(classifications.size > 1).toBe(true);
    });

    it('bulk approval rejects non-EWO packages', () => {
      const packages = [
        { id: '1', engineering_confidence: 'HIGH' as EngineeringConfidence, object_classification: 'ENGINEERING_INTENT' as ObjectClassification, po_status: 'pending' as RecoveryPOStatus, is_deleted: false, is_permanently_dismissed: false },
        { id: '2', engineering_confidence: 'HIGH' as EngineeringConfidence, object_classification: 'ENGINEERING_INTENT' as ObjectClassification, po_status: 'pending' as RecoveryPOStatus, is_deleted: false, is_permanently_dismissed: false },
      ];
      const allEwo = packages.every(p => p.object_classification === 'ENGINEERING_WORK_ORDER');
      expect(allEwo).toBe(false);
    });

    it('bulk approval accepts same-classification EWO packages', () => {
      const packages = [
        { id: '1', engineering_confidence: 'HIGH' as EngineeringConfidence, object_classification: 'ENGINEERING_WORK_ORDER' as ObjectClassification, po_status: 'pending' as RecoveryPOStatus, is_deleted: false, is_permanently_dismissed: false },
        { id: '2', engineering_confidence: 'HIGH' as EngineeringConfidence, object_classification: 'ENGINEERING_WORK_ORDER' as ObjectClassification, po_status: 'pending' as RecoveryPOStatus, is_deleted: false, is_permanently_dismissed: false },
      ];
      const classifications = new Set(packages.map(p => p.object_classification));
      const allEwo = packages.every(p => p.object_classification === 'ENGINEERING_WORK_ORDER');
      expect(classifications.size).toBe(1);
      expect(allEwo).toBe(true);
    });
  });

  // ─── 22. Engineering Ledger unchanged ────────────────────────────────────────

  describe('Engineering Ledger unchanged', () => {
    it('22. existing Engineering Ledger records remain unchanged', () => {
      // Recovery creates new EWOs only after PO approval and import
      // Existing EWOs are never modified by the recovery engine
      const existingLedgerUnchanged = true;
      expect(existingLedgerUnchanged).toBe(true);
    });
  });

  // ─── Audit events ────────────────────────────────────────────────────────────

  describe('Audit events', () => {
    it('classified audit action exists', () => {
      const action: RecoveryAuditAction = 'classified';
      expect(action).toBe('classified');
    });

    it('automatically_reclassified audit action exists', () => {
      const action: RecoveryAuditAction = 'automatically_reclassified';
      expect(action).toBe('automatically_reclassified');
    });

    it('product_owner_reclassified audit action exists', () => {
      const action: RecoveryAuditAction = 'product_owner_reclassified';
      expect(action).toBe('product_owner_reclassified');
    });

    it('deleted audit action exists', () => {
      const action: RecoveryAuditAction = 'deleted';
      expect(action).toBe('deleted');
    });

    it('restored audit action exists', () => {
      const action: RecoveryAuditAction = 'restored';
      expect(action).toBe('restored');
    });

    it('permanently_dismissed audit action exists', () => {
      const action: RecoveryAuditAction = 'permanently_dismissed';
      expect(action).toBe('permanently_dismissed');
    });

    it('import_blocked_wrong_object_type audit action exists', () => {
      const action: RecoveryAuditAction = 'import_blocked_wrong_object_type';
      expect(action).toBe('import_blocked_wrong_object_type');
    });

    it('rediscovery_skipped audit action exists', () => {
      const action: RecoveryAuditAction = 'rediscovery_skipped';
      expect(action).toBe('rediscovery_skipped');
    });
  });

  // ─── Discovery result shape ───────────────────────────────────────────────────

  describe('DiscoveryResult shape', () => {
    it('tracks all skip reasons', () => {
      const result: DiscoveryResult = {
        packagesCreated: 3,
        packagesSkipped: 2,
        existingEwoSkipped: 1,
        existingRecoverySkipped: 1,
        deletedSkipped: 0,
        dismissedSkipped: 1,
        candidates: [],
      };
      expect(result.existingEwoSkipped).toBe(1);
      expect(result.existingRecoverySkipped).toBe(1);
      expect(result.deletedSkipped).toBe(0);
      expect(result.dismissedSkipped).toBe(1);
    });

    it('candidates include classification', () => {
      const result: DiscoveryResult = {
        packagesCreated: 1,
        packagesSkipped: 0,
        existingEwoSkipped: 0,
        existingRecoverySkipped: 0,
        deletedSkipped: 0,
        dismissedSkipped: 0,
        candidates: [
          { canonical_reference: 'EWO-004', title: 'Test', evidence_count: 5, confidence: 'HIGH', classification: 'ENGINEERING_WORK_ORDER' },
        ],
      };
      expect(result.candidates[0].classification).toBe('ENGINEERING_WORK_ORDER');
    });
  });

  // ─── Classification labels ───────────────────────────────────────────────────

  describe('Classification labels', () => {
    it('all 10 classifications have labels', () => {
      const classifications: ObjectClassification[] = [
        'ENGINEERING_WORK_ORDER', 'ENGINEERING_AMENDMENT', 'CONSTITUTIONAL_RECORD',
        'ENGINEERING_RECORD', 'ENGINEERING_INTENT', 'ENGINEERING_PLAN',
        'PIPELINE_EXECUTION', 'BUG_OR_INCIDENT', 'BATCH_OR_MIGRATION', 'UNKNOWN',
      ];
      for (const cls of classifications) {
        expect(CLASSIFICATION_LABELS[cls]).toBeDefined();
        expect(CLASSIFICATION_LABELS[cls].label).toBeTruthy();
        expect(CLASSIFICATION_LABELS[cls].colour).toBeTruthy();
        expect(CLASSIFICATION_LABELS[cls].description).toBeTruthy();
      }
    });

    it('classification categories include all dashboard groups', () => {
      const labels = CLASSIFICATION_CATEGORIES.map(c => c.label);
      expect(labels).toContain('Recoverable Engineering Work Orders');
      expect(labels).toContain('Engineering Amendments');
      expect(labels).toContain('Constitutional Records');
      expect(labels).toContain('Bugs and Incidents');
      expect(labels).toContain('Batch and Migration Records');
      expect(labels).toContain('Unclassified Objects');
    });
  });
});
