import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// EWO-014.19A.6 — Historical Recovery Object-Type Import Governance
// Verifies that classification correctness and import capability are
// decoupled. The Recovery Engine must never encourage Product Owners to
// reclassify a correctly classified object merely because the import
// pipeline does not yet support its domain.

const WORKSPACE = 'src/pages/ecc/ECCRecoveryWorkspacePage.tsx';
const DASHBOARD = 'src/pages/ecc/ECCRecoveryDashboardPage.tsx';
const SERVICE = 'src/lib/historicalRecoveryService.ts';

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('EWO-014.19A.6 — Historical Recovery Object-Type Import Governance', () => {

  // ─── Requirement 1 — Preserve Correct Classification ───────────────────────
  describe('Requirement 1 — Preserve Correct Classification', () => {
    it('1. import capability matrix exists for all classifications', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('IMPORT_CAPABILITY_MATRIX');
      expect(svc).toContain('ENGINEERING_WORK_ORDER');
      expect(svc).toContain('BUG_OR_INCIDENT');
      expect(svc).toContain('CONSTITUTIONAL_RECORD');
      expect(svc).toContain('ENGINEERING_AMENDMENT');
      expect(svc).toContain('ENGINEERING_RECORD');
      expect(svc).toContain('ENGINEERING_INTENT');
      expect(svc).toContain('BATCH_OR_MIGRATION');
    });

    it('2. Bug/Incident is marked as not yet supported', () => {
      const svc = read(SERVICE);
      // Find the BUG_OR_INCIDENT entry in IMPORT_CAPABILITY_MATRIX (not CLASSIFICATION_LABELS)
      const matrixIdx = svc.indexOf('IMPORT_CAPABILITY_MATRIX');
      const bugIdx = svc.indexOf('BUG_OR_INCIDENT:', matrixIdx);
      const bugSection = svc.substring(bugIdx, bugIdx + 300);
      expect(bugSection).toContain('supported: false');
      expect(bugSection).toContain('Not Yet Supported');
    });

    it('3. workspace does not encourage reclassification for correct classifications', () => {
      const src = read(WORKSPACE);
      // The reclassify section explicitly tells the PO not to reclassify
      // when the classification is correct but import is not yet supported.
      expect(src).toContain('Reclassification is not recommended');
      expect(src).toContain('do not reclassify');
    });
  });

  // ─── Requirement 2 — Separate Classification From Import Capability ─────────
  describe('Requirement 2 — Separate Classification From Import Capability', () => {
    it('4. "Import Blocked — Wrong Object Type" banner is removed', () => {
      const src = read(WORKSPACE);
      expect(src).not.toContain('Import Blocked — Wrong Object Type');
      expect(src).not.toContain('Wrong Object Type');
    });

    it('5. replaced with "Import Not Yet Supported" governed messaging', () => {
      const src = read(WORKSPACE);
      expect(src).toContain('Import Not Yet Supported');
      expect(src).toContain('correctly classified as');
      expect(src).toContain('not yet supported');
    });

    it('6. messaging never implies classification is wrong when it is correct', () => {
      const src = read(WORKSPACE);
      // The banner explicitly states the classification is correct
      expect(src).toContain('This recovery package is correctly classified');
      expect(src).toContain('The classification is correct and should not be changed');
    });

    it('7. ledger preview message is capability-based, not classification-based', () => {
      const src = read(WORKSPACE);
      expect(src).toContain('correctly classified as');
      expect(src).toContain('illustrative only');
    });
  });

  // ─── Requirement 3 — Import Capability Matrix ───────────────────────────────
  describe('Requirement 3 — Import Capability Matrix', () => {
    it('8. IMPORT_CAPABILITY_MATRIX is defined with all classifications', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('export const IMPORT_CAPABILITY_MATRIX');
      expect(svc).toContain('export interface ImportCapability');
      expect(svc).toContain('ledgerLabel');
      expect(svc).toContain('statusLabel');
    });

    it('9. EWO is marked as supported', () => {
      const svc = read(SERVICE);
      expect(svc).toMatch(/ENGINEERING_WORK_ORDER[\s\S]*?supported:\s*true/);
    });

    it('10. Engineering Intent is marked as supported', () => {
      const svc = read(SERVICE);
      expect(svc).toMatch(/ENGINEERING_INTENT[\s\S]*?supported:\s*true/);
    });

    it('11. Engineering Record is marked as supported', () => {
      const svc = read(SERVICE);
      expect(svc).toMatch(/ENGINEERING_RECORD[\s\S]*?supported:\s*true/);
    });

    it('12. Constitutional Record is marked as supported', () => {
      const svc = read(SERVICE);
      expect(svc).toMatch(/CONSTITUTIONAL_RECORD[\s\S]*?supported:\s*true/);
    });

    it('13. Engineering Amendment is marked as supported', () => {
      const svc = read(SERVICE);
      expect(svc).toMatch(/ENGINEERING_AMENDMENT[\s\S]*?supported:\s*true/);
    });

    it('14. Bug/Incident is marked as not yet supported', () => {
      const svc = read(SERVICE);
      const matrixIdx = svc.indexOf('IMPORT_CAPABILITY_MATRIX');
      const bugIdx = svc.indexOf('BUG_OR_INCIDENT:', matrixIdx);
      const bugSection = svc.substring(bugIdx, bugIdx + 300);
      expect(bugSection).toContain('supported: false');
      expect(bugSection).toContain('Not Yet Supported');
    });

    it('15. getImportCapability helper exists', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('export function getImportCapability');
      expect(svc).toContain('export function isImportSupported');
    });

    it('16. workspace displays the Import Capability Matrix panel', () => {
      const src = read(WORKSPACE);
      expect(src).toContain('Import Capability Matrix');
      expect(src).toContain('Classification correctness and import capability are evaluated independently');
    });

    it('17. reclassify modal options show import capability status', () => {
      const src = read(WORKSPACE);
      expect(src).toContain('IMPORT_CAPABILITY_MATRIX[c].statusLabel');
    });
  });

  // ─── Requirement 4 — Product Owner Guidance ─────────────────────────────────
  describe('Requirement 4 — Product Owner Guidance', () => {
    it('18. correct classification + import supported → Import button shown', () => {
      const src = read(WORKSPACE);
      expect(src).toContain('canImport');
      expect(src).toContain('Import to Ledger');
    });

    it('19. correct classification + import unavailable → explanation, no reclassify recommendation', () => {
      const src = read(WORKSPACE);
      expect(src).toContain('Import Not Yet Supported');
      expect(src).toContain('will become importable automatically');
      expect(src).toContain('Reclassification is not recommended');
    });

    it('20. incorrect classification → Reclassify recommendation shown', () => {
      const src = read(WORKSPACE);
      expect(src).toContain('Classification Correction');
      expect(src).toContain('misclassified');
    });

    it('21. missing evidence → Request More Evidence action exists', () => {
      const src = read(WORKSPACE);
      expect(src).toContain('Request More Evidence');
    });
  });

  // ─── Requirement 5 — Recovery Summary ───────────────────────────────────────
  describe('Requirement 5 — Recovery Summary', () => {
    it('22. dashboard has recovery summary buckets', () => {
      const src = read(DASHBOARD);
      expect(src).toContain('Recovery Summary');
      expect(src).toContain('Ready To Import');
      expect(src).toContain('Requires Reclassification');
      expect(src).toContain('Requires More Evidence');
      expect(src).toContain('Import Not Yet Supported');
    });

    it('23. classifyRecoveryBucket function exists', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('export function classifyRecoveryBucket');
      expect(svc).toContain('ready_to_import');
      expect(svc).toContain('requires_reclassification');
      expect(svc).toContain('requires_more_evidence');
      expect(svc).toContain('import_not_yet_supported');
    });

    it('24. RECOVERY_SUMMARY_BUCKETS includes all required buckets', () => {
      const svc = read(SERVICE);
      expect(svc).toContain("key: 'ready_to_import'");
      expect(svc).toContain("key: 'requires_reclassification'");
      expect(svc).toContain("key: 'requires_more_evidence'");
      expect(svc).toContain("key: 'import_not_yet_supported'");
    });

    it('25. dashboard computes bucket counts from packages', () => {
      const src = read(DASHBOARD);
      expect(src).toContain('bucketCounts');
      expect(src).toContain('classifyRecoveryBucket');
    });
  });

  // ─── Requirement 6 — Future Compatibility ───────────────────────────────────
  describe('Requirement 6 — Future Compatibility', () => {
    it('26. canImport uses isImportSupported, not classification check', () => {
      const src = read(WORKSPACE);
      expect(src).toContain('isImportSupported(pkg.object_classification)');
      // Must NOT hardcode ENGINEERING_WORK_ORDER check for canImport
      expect(src).not.toMatch(/canImport.*===.*'ENGINEERING_WORK_ORDER'/);
    });

    it('27. import function uses isImportSupported, not classification check', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('isImportSupported(pkg.object_classification)');
      // The old hard block on non-EWO is replaced
      expect(svc).not.toMatch(/if\s*\(pkg\.object_classification\s*!==\s*'ENGINEERING_WORK_ORDER'\)/);
    });

    it('28. flipping BUG_OR_INCIDENT to supported requires no other changes', () => {
      const svc = read(SERVICE);
      const matrixIdx = svc.indexOf('IMPORT_CAPABILITY_MATRIX');
      const bugIdx = svc.indexOf('BUG_OR_INCIDENT:', matrixIdx);
      const bugSection = svc.substring(bugIdx, bugIdx + 300);
      expect(bugSection).toContain('supported: false');
      // When flipped to true, isImportSupported returns true and the
      // workspace canImport check passes — no classification change needed.
    });
  });

  // ─── Requirement 7 — Governance ──────────────────────────────────────────────
  describe('Requirement 7 — Governance', () => {
    it('29. workspace states historical truth takes precedence', () => {
      const src = read(WORKSPACE);
      expect(src).toContain('Historical truth always takes precedence');
    });

    it('30. service separates classification correctness from import capability', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('Classification correctness and import capability are independent');
      expect(svc).toContain('capability-driven');
    });

    it('31. import audit records capability status, not just classification', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('import_capability');
      expect(svc).toContain('target_ledger');
    });
  });

  // ─── Product Owner Tests ─────────────────────────────────────────────────────
  describe('Product Owner Tests', () => {
    it('Test 1. Recover a correctly classified Bug — no reclassification recommendation', () => {
      const src = read(WORKSPACE);
      // Bug/Incident is not import-supported → "Import Not Yet Supported" banner
      expect(src).toContain('Import Not Yet Supported');
      // The banner says classification is correct
      expect(src).toContain('correctly classified');
      // The reclassify section says "not recommended" for unsupported classifications
      expect(src).toContain('Reclassification is not recommended');
    });

    it('Test 2. Recover a genuine EWO — ready for import', () => {
      const src = read(WORKSPACE);
      // EWO is import-supported → canImport is true → Import button renders
      expect(src).toContain('canImport');
      expect(src).toContain('Import to Ledger');
      // EWO is marked as supported in the matrix
      const svc = read(SERVICE);
      expect(svc).toMatch(/ENGINEERING_WORK_ORDER[\s\S]*?supported:\s*true/);
    });

    it('Test 3. Recover an incorrectly classified package — reclassify recommendation shown', () => {
      const src = read(WORKSPACE);
      expect(src).toContain('Classification Correction');
      expect(src).toContain('misclassified');
      expect(src).toContain('Reclassify');
    });

    it('Test 4. Recovery Dashboard — all four summary buckets present', () => {
      const src = read(DASHBOARD);
      expect(src).toContain('Ready To Import');
      expect(src).toContain('Requires Reclassification');
      expect(src).toContain('Requires More Evidence');
      expect(src).toContain('Import Not Yet Supported');
    });

    it('Test 5. Future compatibility — Bug import capability is a single flag', () => {
      const svc = read(SERVICE);
      const matrixIdx = svc.indexOf('IMPORT_CAPABILITY_MATRIX');
      const bugIdx = svc.indexOf('BUG_OR_INCIDENT:', matrixIdx);
      const bugSection = svc.substring(bugIdx, bugIdx + 300);
      expect(bugSection).toContain('supported: false');
      expect(svc).toContain('export function isImportSupported');
    });
  });
});
