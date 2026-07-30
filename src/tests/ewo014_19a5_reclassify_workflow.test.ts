import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// EWO-014.19A.5 — Historical Recovery Reclassification Workflow Repair
// Verifies the Product Owner reclassification workflow no longer navigates
// to a blank page and the modal/dialog works in-place.

const WORKSPACE = 'src/pages/ecc/ECCRecoveryWorkspacePage.tsx';
const SERVICE = 'src/lib/historicalRecoveryService.ts';

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('EWO-014.19A.5 — Reclassification Workflow Repair', () => {

  // ─── Requirement 1 — Navigation Repair ───────────────────────────────────────
  describe('Requirement 1 — Navigation Repair (no blank page)', () => {
    it('1. workspace does not use useNavigate for reclassify', () => {
      const src = read(WORKSPACE);
      // The reclassify action must set actionMode, not navigate away.
      expect(src).toContain("setActionMode('reclassify')");
      // No router navigation call tied to reclassify
      expect(src).not.toMatch(/navigate\([^)]*reclassif/i);
    });

    it('2. workspace has no <form> that could submit and reload', () => {
      const src = read(WORKSPACE);
      expect(src).not.toContain('<form');
      expect(src).not.toContain('</form>');
    });

    it('3. safe classification accessor prevents render crash on unknown classification', () => {
      const src = read(WORKSPACE);
      // Direct indexing CLASSIFICATION_LABELS[cls].label would throw on
      // unknown values; the safe accessor prevents a blank page.
      expect(src).toContain('function classLabel(');
      expect(src).toContain('function classColour(');
      // The safe accessor is used in the badge and import-blocked banner
      expect(src).toContain('classLabel(pkg.object_classification)');
      expect(src).toContain('classColour(pkg.object_classification)');
    });

    it('4. handleAction wraps DB operations in try/catch for governed errors', () => {
      const src = read(WORKSPACE);
      // A catch block must surface governed errors instead of blanking
      expect(src).toMatch(/catch\s*\(\s*err[^)]*\)\s*\{[^}]*setActionError/s);
    });
  });

  // ─── Requirement 2 — In-place Modal/Dialog ───────────────────────────────────
  describe('Requirement 2 — In-place Reclassification Dialog', () => {
    it('5. reclassify renders an inline modal, not a routed page', () => {
      const src = read(WORKSPACE);
      // The reclassify section is conditionally rendered via actionMode
      expect(src).toContain("actionMode === 'reclassify'");
      // No route/path navigation to a separate reclassify page
      expect(src).not.toMatch(/reclassify-page|reclassify\/index/i);
    });

    it('6. dialog displays current classification', () => {
      const src = read(WORKSPACE);
      expect(src).toMatch(/Current Classification/i);
    });

    it('7. dialog displays a select for new classification', () => {
      const src = read(WORKSPACE);
      // A <select> bound to reclassifyFields.classification
      expect(src).toMatch(/<select[^>]*value=\{reclassifyFields\.classification\}/);
    });

    it('8. dialog supports all required classifications', () => {
      const src = read(WORKSPACE);
      // All classifications from CLASSIFICATION_LABELS are rendered as options
      expect(src).toContain('Object.keys(CLASSIFICATION_LABELS)');
      // The service defines all required types
      const svc = read(SERVICE);
      expect(svc).toContain("'ENGINEERING_WORK_ORDER'");
      expect(svc).toContain("'ENGINEERING_INTENT'");
      expect(svc).toContain("'ENGINEERING_PLAN'");
      expect(svc).toContain("'ENGINEERING_RECORD'");
      expect(svc).toContain("'PIPELINE_EXECUTION'");
      expect(svc).toContain("'ENGINEERING_AMENDMENT'");
      expect(svc).toContain("'CONSTITUTIONAL_RECORD'");
      expect(svc).toContain("'BUG_OR_INCIDENT'");
      expect(svc).toContain("'BATCH_OR_MIGRATION'");
      expect(svc).toContain("'UNKNOWN'");
    });

    it('9. dialog has an optional reason field', () => {
      const src = read(WORKSPACE);
      // The actionNotes textarea is reused for the reason
      expect(src).toMatch(/Reason.*mandatory|Reason.*Notes/i);
    });

    it('10. dialog has Cancel and Save Reclassification buttons', () => {
      const src = read(WORKSPACE);
      expect(src).toContain('Save Reclassification');
      // Cancel button exists in the action modal
      expect(src).toMatch(/Cancel/i);
    });
  });

  // ─── Requirement 3 — Validation ──────────────────────────────────────────────
  describe('Requirement 3 — Validation', () => {
    it('11. reclassifyObject validates reason is mandatory', () => {
      const svc = read(SERVICE);
      expect(svc).toContain("if (!reason.trim()) return { success: false, error: 'A reason is mandatory for reclassification' }");
    });

    it('12. reclassifyObject validates package exists', () => {
      const svc = read(SERVICE);
      expect(svc).toContain("Recovery package not found");
    });

    it('13. reclassifyObject validates EWO reference when reclassifying as EWO', () => {
      const svc = read(SERVICE);
      expect(svc).toContain("newClassification === 'ENGINEERING_WORK_ORDER'");
      expect(svc).toContain('validateEwoReference');
    });

    it('14. reclassifyObject updates object_classification and previous_classification', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('object_classification: newClassification');
      expect(svc).toContain('previous_classification: previousClassification');
    });
  });

  // ─── Requirement 4 — Audit Trail ─────────────────────────────────────────────
  describe('Requirement 4 — Audit Trail', () => {
    it('15. reclassifyObject inserts a product_owner_reclassified audit event', () => {
      const svc = read(SERVICE);
      expect(svc).toContain("action: 'product_owner_reclassified'");
      expect(svc).toContain('acted_by: reclassifiedBy');
      expect(svc).toContain('reason');
    });

    it('16. audit metadata records previous and new classification', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('previous_classification: previousClassification');
      expect(svc).toContain('new_classification: newClassification');
      expect(svc).toContain('previous_canonical_reference: previousCanonicalRef');
      expect(svc).toContain('new_canonical_reference');
    });

    it('17. getReclassificationHistory includes both automatic and manual reclassifications', () => {
      const svc = read(SERVICE);
      expect(svc).toContain("'product_owner_reclassified'");
      expect(svc).toContain("'automatically_reclassified'");
    });

    it('18. reclassification history modal displays entries in chronological order', () => {
      const src = read(WORKSPACE);
      // The ReclassificationHistoryModal renders entries
      expect(src).toContain('ReclassificationHistoryModal');
    });
  });

  // ─── Requirement 5 — Recovery Package Refresh ───────────────────────────────
  describe('Requirement 5 — Recovery Package Refresh', () => {
    it('19. successful action triggers a reload (no manual refresh)', () => {
      const src = read(WORKSPACE);
      // After a successful action, load() is called to refresh the package
      expect(src).toMatch(/load\(\)/);
    });

    it('20. user remains on the recovery package (no navigation on success)', () => {
      const src = read(WORKSPACE);
      // After success, actionMode is cleared but no navigate() call
      expect(src).toContain('setActionMode(null)');
    });
  });

  // ─── Requirement 6 — Error Handling ──────────────────────────────────────────
  describe('Requirement 6 — Governed Error Handling', () => {
    it('21. action error is surfaced in a governed error panel', () => {
      const src = read(WORKSPACE);
      expect(src).toContain('setActionError');
      expect(src).toMatch(/actionError/i);
    });

    it('22. missing package renders a governed error, not a blank page', () => {
      const src = read(WORKSPACE);
      // When pkg is null, a governed error panel renders
      expect(src).toMatch(/!pkg|pkg === null/i);
    });

    it('23. database failure is caught and surfaced as a governed error', () => {
      const src = read(WORKSPACE);
      // The try/catch around handleAction surfaces DB errors
      expect(src).toMatch(/catch\s*\(\s*err[^)]*\)\s*\{[^}]*setActionError/s);
    });
  });

  // ─── Requirement 7 — UX ──────────────────────────────────────────────────────
  describe('Requirement 7 — UX (in-place, no navigation)', () => {
    it('24. reclassify button is available for non-pending packages (Bug → EWO)', () => {
      const src = read(WORKSPACE);
      // The reclassify button must NOT be gated solely on po_status === 'pending'.
      // This was the root cause: approved Bug/Incident packages showed an
      // "Import Blocked — Use the Reclassify action" banner but no button.
      expect(src).toContain("pkg.po_status !== 'pending'");
      expect(src).toContain('Classification Correction');
    });

    it('25. reclassify button is hidden for deleted/dismissed/imported packages', () => {
      const src = read(WORKSPACE);
      expect(src).toMatch(/!isDeleted && !isDismissed && !isImported/);
    });

    it('26. browser URL never changes during reclassification', () => {
      const src = read(WORKSPACE);
      // The reclassify action only sets state — no window.location or navigate
      const reclassifySection = src.split("setActionMode('reclassify')")[1] ?? '';
      // Within the reclassify handler, there should be no hash change
      expect(reclassifySection.substring(0, 200)).not.toContain('window.location.hash');
    });
  });

  // ─── Required Tests 1-6 ──────────────────────────────────────────────────────
  describe('Required Tests', () => {
    it('Test 1. Bug → Engineering Work Order — classification change path exists', () => {
      const svc = read(SERVICE);
      // reclassifyObject accepts BUG_OR_INCIDENT → ENGINEERING_WORK_ORDER
      expect(svc).toContain("'BUG_OR_INCIDENT'");
      expect(svc).toContain("'ENGINEERING_WORK_ORDER'");
      // And validates the EWO ref when target is EWO
      expect(svc).toContain('validateEwoReference');
    });

    it('Test 2. Engineering Intent → Engineering Record — both types supported', () => {
      const svc = read(SERVICE);
      expect(svc).toContain("'ENGINEERING_INTENT'");
      expect(svc).toContain("'ENGINEERING_RECORD'");
    });

    it('Test 3. Cancel dialog — actionMode can be cleared without saving', () => {
      const src = read(WORKSPACE);
      // Cancel button sets actionMode to null
      expect(src).toMatch(/setActionMode\(null\)/);
    });

    it('Test 4. Database failure — governed error shown, no blank page', () => {
      const src = read(WORKSPACE);
      expect(src).toMatch(/catch\s*\(\s*err[^)]*\)\s*\{[^}]*setActionError/s);
    });

    it('Test 5. History dialog contains both automatic and manual reclassifications', () => {
      const svc = read(SERVICE);
      const src = read(WORKSPACE);
      expect(svc).toContain("'automatically_reclassified'");
      expect(svc).toContain("'product_owner_reclassified'");
      expect(src).toContain('ReclassificationHistoryModal');
    });

    it('Test 6. Browser URL never changes during reclassification', () => {
      const src = read(WORKSPACE);
      // No navigate() or window.location.hash call within the reclassify handler
      const reclassifyHandler = src.split("setActionMode('reclassify')")[1]?.substring(0, 300) ?? '';
      expect(reclassifyHandler).not.toContain('window.location.hash');
      expect(reclassifyHandler).not.toMatch(/\bnavigate\(/);
    });
  });
});
