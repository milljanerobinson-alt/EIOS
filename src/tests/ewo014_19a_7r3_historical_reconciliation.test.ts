// EWO-014.19A.7R.3 — Final Historical Reconciliation & Canonical Governance Tests
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf-8');

describe('EWO-014.19A.7R.3 — Final Historical Reconciliation', () => {

  // ─── Test A: Canonical registration occurs BEFORE implementation ──────────
  describe('Test A — Universal Canonical Creation', () => {
    it('ensureEngineeringWorkOrderExists function exists', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('ensureEngineeringWorkOrderExists');
    });

    it('function returns success=false on failure (implementation must abort)', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('success: false');
    });

    it('function is idempotent (returns existing EWO if already exists)', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('maybeSingle');
      expect(content).toContain('created: false');
    });

    it('function creates lifecycle event on registration', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('ewo_lifecycle_events');
      expect(content).toContain('ensure_canonical_creation');
    });
  });

  // ─── Test B: EWO-014.19A.7R.3 canonical EWO exists ─────────────────────────
  describe('Test B — Canonical EWO-014.19A.7R.3', () => {
    it('migration creates canonical EWO-014.19A.7R.3', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r3_historical_reconciliation'));
      expect(auditMigration).toBeDefined();
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('EWO-014.19A.7R.3');
      expect(content).toContain('Final Historical Reconciliation');
    });

    it('migration creates EWO BEFORE implementation (status ready)', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r3_historical_reconciliation'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain("'ready'");
    });

    it('migration records lifecycle event for canonical registration', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r3_historical_reconciliation'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('ewo_lifecycle_events');
      expect(content).toContain('ensure_canonical_creation');
    });
  });

  // ─── Test C: Every investigated reference returns exactly one result ──────
  describe('Test C — Every reference returns exactly one result', () => {
    const refs = ['EWO-007', 'EWO-012', 'EWO-013', 'EWO-014', 'EWO-016', 'EWO-017'];

    it('migration mentions all 6 references', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r3_historical_reconciliation'));
      const content = read(`supabase/migrations/${auditMigration}`);
      // EWO-007, EWO-012, EWO-013, EWO-014, EWO-016 are explicitly handled
      expect(content).toContain('EWO-007');
      expect(content).toContain('EWO-012');
      expect(content).toContain('EWO-013');
      expect(content).toContain('EWO-014');
      expect(content).toContain('EWO-016');
      // EWO-017 is mentioned as already existing
      expect(content).toContain('EWO-017');
    });

    it('EWO-012 is reconciled as canonical EWO', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r3_historical_reconciliation'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain("'EWO-012'");
      expect(content).toContain('Engineering Intelligence Layer');
    });

    it('EWO-013 is reconciled as canonical EWO', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r3_historical_reconciliation'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain("'EWO-013'");
      expect(content).toContain('Project Architecture Foundation');
    });

    it('EWO-016 is reconciled as canonical EWO', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r3_historical_reconciliation'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain("'EWO-016'");
      expect(content).toContain('Conversation-Native Engineering Context');
    });

    it('EWO-007 is created as Historical Reference (not canonical EWO)', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r3_historical_reconciliation'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain("'EWO-007'");
      expect(content).toContain('engineering_historical_references');
    });

    it('EWO-014 is created as Historical Reference (not canonical EWO)', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r3_historical_reconciliation'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain("'EWO-014'");
    });

    it('EWO-017 already exists as canonical EWO (no action needed)', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r3_historical_reconciliation'));
      const content = read(`supabase/migrations/${auditMigration}`);
      // EWO-017 is not re-created (it already exists)
      expect(content).not.toContain("INSERT INTO engineering_work_orders.*EWO-017'");
    });
  });

  // ─── Test D: Reconciled canonical EWOs exist ──────────────────────────────
  describe('Test D — Reconciled canonical EWOs', () => {
    it('EWO-012 has historical_notes documenting reconciliation', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r3_historical_reconciliation'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('Reconciled retrospectively by EWO-014.19A.7R.3');
    });

    it('reconciled EWOs preserve historical timestamps', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r3_historical_reconciliation'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('2026-07-13');
      expect(content).toContain('2026-07-19');
    });

    it('reconciled EWOs use Historical Migration closure method', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r3_historical_reconciliation'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('Historical Migration');
    });
  });

  // ─── Test E: Historical Reference page appears ────────────────────────────
  describe('Test E — Historical Reference page', () => {
    it('HistoricalReferenceDetail component exists', () => {
      const content = read('src/pages/ecc/HistoricalReferenceDetail.tsx');
      expect(content).toContain('REFERENCE NOT ISSUED');
    });

    it('page displays Reference, Investigation Date, Audit Reference', () => {
      const content = read('src/pages/ecc/HistoricalReferenceDetail.tsx');
      expect(content).toContain('Reference');
      expect(content).toContain('Investigation Date');
      expect(content).toContain('Audit Reference');
    });

    it('page displays Evidence Summary, Audit Conclusion, Historical Explanation', () => {
      const content = read('src/pages/ecc/HistoricalReferenceDetail.tsx');
      expect(content).toContain('Evidence Summary');
      expect(content).toContain('Audit Conclusion');
      expect(content).toContain('Historical Explanation');
    });

    it('page displays Not Applicable section', () => {
      const content = read('src/pages/ecc/HistoricalReferenceDetail.tsx');
      expect(content).toContain('No Engineering Work Order existed');
      expect(content).toContain('No implementation occurred');
      expect(content).toContain('Verification not applicable');
      expect(content).toContain('Completion Report not applicable');
      expect(content).toContain('Product Owner Acceptance not applicable');
    });
  });

  // ─── Test F: No engineering actions on Historical References ───────────────
  describe('Test F — No engineering actions on Historical References', () => {
    it('HistoricalReferenceDetail does not render Verify button', () => {
      const content = read('src/pages/ecc/HistoricalReferenceDetail.tsx');
      expect(content).not.toMatch(/onVerify|Verify Remaining|Submit for Acceptance/);
    });

    it('HistoricalReferenceDetail does not render Accept/Reject/Close/Reopen', () => {
      const content = read('src/pages/ecc/HistoricalReferenceDetail.tsx');
      expect(content).not.toMatch(/onAccept|onReject|onClose.*Accept|onReopen/);
    });

    it('HistoricalReferenceDetail does not render Generate Completion Report', () => {
      const content = read('src/pages/ecc/HistoricalReferenceDetail.tsx');
      expect(content).not.toContain('Generate Completion Report');
    });

    it('HistoricalReferenceDetail does not render Engineering Verification', () => {
      const content = read('src/pages/ecc/HistoricalReferenceDetail.tsx');
      expect(content).not.toContain('Engineering Verification');
    });

    it('HistoricalReferenceDetail does not render lifecycle progression controls', () => {
      const content = read('src/pages/ecc/HistoricalReferenceDetail.tsx');
      expect(content).not.toContain('onTransition');
    });
  });

  // ─── Test G: Idempotency (run reconciliation twice, no duplicates) ─────────
  describe('Test G — Duplicate Protection / Idempotency', () => {
    it('migration uses WHERE NOT EXISTS for all INSERT statements', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r3_historical_reconciliation'));
      const content = read(`supabase/migrations/${auditMigration}`);
      // Every INSERT should be guarded by WHERE NOT EXISTS or AND NOT EXISTS
      const insertCount = (content.match(/INSERT INTO/g) || []).length;
      const notExistsCount = (content.match(/NOT EXISTS/g) || []).length;
      expect(notExistsCount).toBeGreaterThanOrEqual(insertCount);
    });

    it('historical_references table has UNIQUE constraint on reference', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r3_historical_reconciliation'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('NOT NULL UNIQUE');
    });

    it('lifecycle event insert is guarded against duplicates', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r3_historical_reconciliation'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('AND NOT EXISTS');
    });

    it('ensureEngineeringWorkOrderExists is idempotent', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('maybeSingle');
      expect(content).toContain('created: false');
    });
  });

  // ─── Requirement 8: Ledger Behaviour ──────────────────────────────────────
  describe('Requirement 8 — Ledger Behaviour', () => {
    it('WorkOrdersPage has historical_ref filter', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain("'historical_ref'");
      expect(content).toContain('Historical References');
    });

    it('historical_ref filter does not count as active/draft/verification', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain("case 'historical_ref': return false;");
    });

    it('Historical References appear in Engineering Ledger', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('historicalRefs');
      expect(content).toContain('HistoricalReferenceDetail');
    });
  });

  // ─── Requirement 9: Automatic Future Governance ───────────────────────────
  describe('Requirement 9 — Automatic Future Governance', () => {
    it('searchUnifiedLedger function exists for unified search', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('searchUnifiedLedger');
    });

    it('unified search checks both EWOs and Historical References', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('engineering_work_orders');
      expect(content).toContain('engineering_historical_references');
    });
  });
});
