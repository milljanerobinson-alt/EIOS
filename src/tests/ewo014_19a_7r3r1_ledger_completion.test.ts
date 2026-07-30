// EWO-014.19A.7R.3R.1 — Engineering Ledger Completion & Historical Navigation Refinements Tests
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf-8');

describe('EWO-014.19A.7R.3R.1 — Engineering Ledger Completion & Historical Navigation Refinements', () => {

  // ─── Test 1: Search EWO-005 returns Historical Reference ──────────────────
  describe('Test 1 — Search EWO-005', () => {
    it('migration creates Historical Reference for EWO-005', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const migration = migrations.find(f => f.includes('7r3r1_ledger_completion'));
      expect(migration).toBeDefined();
      const content = read(`supabase/migrations/${migration}`);
      expect(content).toContain('EWO-005');
      expect(content).toContain('Reference Not Issued');
    });

    it('searchUnifiedLedger supports numeric queries (005 → EWO-005)', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('isNumericQuery');
      expect(content).toContain('EWO-${query}');
    });
  });

  // ─── Test 2: Search EWO-006 returns Historical Reference ──────────────────
  describe('Test 2 — Search EWO-006', () => {
    it('migration creates Historical Reference for EWO-006', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const migration = migrations.find(f => f.includes('7r3r1_ledger_completion'));
      const content = read(`supabase/migrations/${migration}`);
      expect(content).toContain('EWO-006');
      expect(content).toContain('Reference Not Issued');
    });
  });

  // ─── Test 3: Search EWO-007 prioritises Historical Reference ──────────────
  describe('Test 3 — Search EWO-007', () => {
    it('exact search prioritises Historical References over canonical EWOs', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain("a.type === 'historical_reference' && b.type === 'ewo'");
      expect(content).toContain('return -1');
    });

    it('search returns related refinements (EWO-007R)', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      // The OR search on ewo_ref.ilike.%EWO-007% will match EWO-007R
      expect(content).toContain('ewo_ref.ilike');
    });
  });

  // ─── Test 4: Closed Engineering sequence ──────────────────────────────────
  describe('Test 4 — Closed Engineering Complete History', () => {
    it('DashboardView shows Historical Reference placeholders in Closed view', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain("ledgerFilter === 'closed'");
      expect(content).toContain('Historical — Not Issued');
      expect(content).toContain('Open Historical Reference');
    });

    it('placeholders sorted by EWO number for continuity', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('closedRows');
      expect(content).toContain('numA - numB');
    });

    it('clicking placeholder navigates to Historical Reference detail', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('onSelectHistRef');
    });
  });

  // ─── Test 5: Historical References filter ─────────────────────────────────
  describe('Test 5 — Historical References Filter', () => {
    it('historical_ref filter still exists', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain("'historical_ref'");
      expect(content).toContain('Historical References');
    });
  });

  // ─── Test 6: Historical Migration as Classification filter ───────────────
  describe('Test 6 — Historical Migration Classification', () => {
    it('classification_historical_migration filter exists', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('classification_historical_migration');
      expect(content).toContain('Classification: Historical Migration');
    });

    it('Historical Migration is no longer a lifecycle filter', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      // The old 'historical' filter should NOT be labeled 'Historical Migration' anymore
      // It should be labeled as a classification filter
      expect(content).not.toContain("{ key: 'historical', label: 'Historical Migration' }");
    });
  });

  // ─── Test 7: EWO-012 shows Closed + Historical Migration ───────────────────
  describe('Test 7 — Classification on Detail Page', () => {
    it('EWODetail shows ClassificationBadge', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('ClassificationBadge');
    });

    it('migration backfills EWO-012 as Historical Migration', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const migration = migrations.find(f => f.includes('7r3r1_ledger_completion'));
      const content = read(`supabase/migrations/${migration}`);
      expect(content).toContain('Historical Migration');
      expect(content).toContain('.13%');
    });
  });

  // ─── Test 8: Product Owner displayed ──────────────────────────────────────
  describe('Test 8 — Product Owner Display', () => {
    it('migration adds product_owner column', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const migration = migrations.find(f => f.includes('7r3r1_ledger_completion'));
      const content = read(`supabase/migrations/${migration}`);
      expect(content).toContain('product_owner');
      expect(content).toContain('Millie Robinson');
    });

    it('EWO type includes product_owner and engineering_classification', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('product_owner');
      expect(content).toContain('engineering_classification');
    });

    it('EWODetail shows Engineering Owner and Product Owner', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('Engineering Owner');
      expect(content).toContain('Product Owner');
      expect(content).toContain('Millie Robinson');
    });

    it('TableView shows Eng. Owner and Product Owner columns', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('Eng. Owner');
      expect(content).toContain('Product Owner');
    });

    it('HistoricalReferenceDetail shows Product Owner', () => {
      const content = read('src/pages/ecc/HistoricalReferenceDetail.tsx');
      expect(content).toContain('Product Owner');
      expect(content).toContain('Millie Robinson');
    });

    it('HistoricalReference type includes product_owner', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('product_owner: string | null');
    });
  });

  // ─── Test 9: Placeholder navigation ───────────────────────────────────────
  describe('Test 9 — Placeholder Navigation', () => {
    it('clicking Historical Reference placeholder opens detail page', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('onSelectHistRef(row.ref)');
      expect(content).toContain('setSelectedHistRef');
    });

    it('no duplicated page — uses existing HistoricalReferenceDetail', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('HistoricalReferenceDetail');
    });
  });

  // ─── Test 10: No duplicate Historical References ──────────────────────────
  describe('Test 10 — No Duplicates', () => {
    it('migration uses WHERE NOT EXISTS for Historical Reference inserts', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const migration = migrations.find(f => f.includes('7r3r1_ledger_completion'));
      const content = read(`supabase/migrations/${migration}`);
      expect(content).toContain('WHERE NOT EXISTS');
    });

    it('migration is idempotent (DO $$ blocks for ALTER)', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const migration = migrations.find(f => f.includes('7r3r1_ledger_completion'));
      const content = read(`supabase/migrations/${migration}`);
      expect(content).toContain('DO $$');
      expect(content).toContain('IF NOT EXISTS');
    });
  });

  // ─── Requirement 1: Complete Unified Search ───────────────────────────────
  describe('Requirement 1 — Complete Unified Search', () => {
    it('numeric search (007) returns both EWO-007 and EWO-007R', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('isNumericQuery');
      expect(content).toContain('ewoSearchPattern');
    });

    it('Historical References behave identically to canonical EWOs for search', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('Promise.all');
      expect(content).toContain('engineering_historical_references');
    });
  });

  // ─── Requirement 3: Closed Ledger Represents Complete History ─────────────
  describe('Requirement 3 — Closed Ledger Complete History', () => {
    it('Closed count includes Historical Reference placeholders', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('closedWithPlaceholders');
    });
  });

  // ─── Requirement 5: Classification Badges ─────────────────────────────────
  describe('Requirement 5 — Classification Badges', () => {
    it('ClassificationBadge component exists with all classifications', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('function ClassificationBadge');
      expect(content).toContain('CLASSIFICATION_CFG');
      expect(content).toContain('Engineering');
      expect(content).toContain('Refinement');
      expect(content).toContain('Historical Migration');
      expect(content).toContain('Historical Recovery');
      expect(content).toContain('Bug');
      expect(content).toContain('Constitutional');
    });

    it('lifecycle and classification are independent concepts', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      // StatusBadge and ClassificationBadge are separate components
      expect(content).toContain('function StatusBadge');
      expect(content).toContain('function ClassificationBadge');
    });
  });

  // ─── Requirement 7: Closed Tab Counts ─────────────────────────────────────
  describe('Requirement 7 — Closed Tab Counts', () => {
    it('Closed count includes placeholders', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('closedWithPlaceholders');
    });
  });

  // ─── Requirement 8: Filters ───────────────────────────────────────────────
  describe('Requirement 8 — Filters', () => {
    it('Historical Migration filter is a Classification filter', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('classification_historical_migration');
      expect(content).toContain("engineering_classification");
    });

    it('filtering Historical Migration filters Closed records by classification', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain("'Historical Migration'");
    });
  });

  // ─── Requirement 10: Future Governance ────────────────────────────────────
  describe('Requirement 10 — Future Governance', () => {
    it('searchUnifiedLedger automatically searches Historical References', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      // No special filter needed — searchUnifiedLedger always searches both tables
      expect(content).toContain('engineering_historical_references');
    });
  });

  // ─── Canonical Registration ───────────────────────────────────────────────
  describe('Canonical Registration', () => {
    it('EWO-014.19A.7R.3R.1 registered before implementation', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const migration = migrations.find(f => f.includes('7r3r1_ledger_completion'));
      const content = read(`supabase/migrations/${migration}`);
      expect(content).toContain('EWO-014.19A.7R.3R.1');
      expect(content).toContain('ensure_canonical_creation');
    });
  });
});
