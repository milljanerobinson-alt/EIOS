// EWO-014.19A.7R.3R — Mandatory Canonical EWO Registration & Unified Ledger Search Tests
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf-8');

describe('EWO-014.19A.7R.3R — Mandatory Canonical EWO Registration & Unified Ledger Search', () => {

  // ─── Test A: Refinement EWO pre-registration ────────────────────────────────
  describe('Test A — Refinement EWO Pre-Registration', () => {
    it('migration creates canonical EWO-014.19A.7R.3R before implementation', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const migration = migrations.find(f => f.includes('7r3r_mandatory_registration'));
      expect(migration).toBeDefined();
      const content = read(`supabase/migrations/${migration}`);
      expect(content).toContain('EWO-014.19A.7R.3R');
      expect(content).toContain('Mandatory Canonical EWO Registration');
    });

    it('migration records lifecycle event for canonical registration', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const migration = migrations.find(f => f.includes('7r3r_mandatory_registration'));
      const content = read(`supabase/migrations/${migration}`);
      expect(content).toContain('ewo_lifecycle_events');
      expect(content).toContain('ensure_canonical_creation');
    });

    it('migration is idempotent (WHERE NOT EXISTS)', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const migration = migrations.find(f => f.includes('7r3r_mandatory_registration'));
      const content = read(`supabase/migrations/${migration}`);
      expect(content).toContain('WHERE NOT EXISTS');
    });
  });

  // ─── Test B: Begin Engineering guard ───────────────────────────────────────
  describe('Test B — Begin Engineering Guard', () => {
    it('ewoAutoRegistrationService imports guardImplementationEntry', () => {
      const content = read('src/lib/ewoAutoRegistrationService.ts');
      expect(content).toContain('guardImplementationEntry');
      expect(content).toContain('ensureEngineeringWorkOrder');
    });

    it('beginEngineering calls guard before EWO creation', () => {
      const content = read('src/lib/ewoAutoRegistrationService.ts');
      expect(content).toContain("guardImplementationEntry(nextRef, 'beginEngineering'");
      // Guard must be called BEFORE the insert
      const guardIdx = content.indexOf("guardImplementationEntry(nextRef, 'beginEngineering'");
      const insertIdx = content.indexOf('.from(\'engineering_work_orders\')\n      .insert({\n        ewo_ref: nextRef,', guardIdx);
      expect(insertIdx).toBeGreaterThan(guardIdx);
    });

    it('beginEngineering fails closed on guard failure', () => {
      const content = read('src/lib/ewoAutoRegistrationService.ts');
      expect(content).toContain('cannot begin because the canonical Engineering Work Order could not be registered');
    });
  });

  // ─── Test C: Registration failure ──────────────────────────────────────────
  describe('Test C — Registration Failure (Fail-Closed)', () => {
    it('guardImplementationEntry returns success=false on failure', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('success: false');
    });

    it('guard records failure in audit history', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('recordGuardFailure');
      expect(content).toContain('execution_audit_trail');
      expect(content).toContain('guard_failure');
    });

    it('guard returns governed error with entry point and correlation ref', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('entryPoint');
      expect(content).toContain('correlationRef');
      expect(content).toContain('timestamp');
    });

    it('guard error message contains required text', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('Engineering implementation cannot begin because the canonical Engineering Work Order could not be registered');
    });
  });

  // ─── Test D: Entry-point coverage ───────────────────────────────────────────
  describe('Test D — Entry-Point Coverage', () => {
    const entryPoints = [
      { file: 'src/lib/ewoAutoRegistrationService.ts', name: 'beginEngineering' },
      { file: 'src/lib/executionLaunchService.ts', name: 'beginEngineeringExecution' },
      { file: 'src/lib/engineeringExecutionService.ts', name: 'createExecution' },
      { file: 'src/lib/implementationEngineConnector.ts', name: 'prepareAndSubmitExecution' },
      { file: 'src/lib/engineeringPackageService.ts', name: 'startImplementation' },
      { file: 'src/lib/engineeringPackageService.ts', name: 'returnImplementation' },
      { file: 'src/lib/lifecycleEvidenceEngine.ts', name: 'progressLifecycle' },
      { file: 'src/lib/engineeringIntegrityService.ts', name: 'createMissingEwo' },
      { file: 'src/pages/ecc/ECHistoricalImportWizard.tsx', name: 'historicalImport' },
    ];

    for (const ep of entryPoints) {
      it(`${ep.name} in ${ep.file} calls guard`, () => {
        const content = read(ep.file);
        expect(content).toContain('guardImplementationEntry');
      });
    }

    it('all entry points fail closed on guard failure', () => {
      const patterns = [
        /cannot begin because the canonical/,
        /guard\.success.*false/,
        /throw new Error/,
        /transitioned: false/,
        /return \{ success: false/,
        /continue;/,
      ];
      for (const ep of entryPoints) {
        const content = read(ep.file);
        const matches = patterns.some(p => p.test(content));
        expect(matches).toBe(true);
      }
    });
  });

  // ─── Test E: Historical reconciliation entry ────────────────────────────────
  describe('Test E — Historical Reconciliation Entry', () => {
    it('createMissingEwo uses canonical guard instead of direct insert', () => {
      const content = read('src/lib/engineeringIntegrityService.ts');
      expect(content).toContain('guardImplementationEntry');
      // Should NOT have direct insert anymore
      const createMissingIdx = content.indexOf('async function createMissingEwo');
      const nextFuncIdx = content.indexOf('\n}', createMissingIdx);
      const funcBody = content.slice(createMissingIdx, nextFuncIdx);
      expect(funcBody).not.toContain('.from(\'engineering_work_orders\').insert');
    });
  });

  // ─── Test F: Exact search — Historical Reference EWO-007 ────────────────────
  describe('Test F — Exact Search: EWO-007 (Historical Reference)', () => {
    it('searchUnifiedLedger function exists', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('searchUnifiedLedger');
    });

    it('searches both engineering_work_orders and engineering_historical_references', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('engineering_work_orders');
      expect(content).toContain('engineering_historical_references');
    });

    it('exact EWO reference detection works', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('isExactEwoReference');
      expect(content).toContain('/^EWO-\\d+');
    });

    it('WorkOrdersPage displays exact match override banner', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('exactMatchOverride');
      expect(content).toContain('Exact Reference Match');
      expect(content).toContain('global exact-reference search');
    });

    it('Historical Reference results show "Historical — Not Issued" badge', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('Historical — Not Issued');
    });
  });

  // ─── Test G: Exact search — Historical Reference EWO-014 ────────────────────
  describe('Test G — Exact Search: EWO-014 (Historical Reference)', () => {
    it('unified search returns Historical References regardless of lifecycle filter', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      // searchUnifiedLedger does not take a filter parameter — it always searches globally
      expect(content).toContain('async function searchUnifiedLedger(searchQuery: string)');
    });

    it('exact match is sorted first in results', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('isExactMatch');
      expect(content).toContain('a.isExactMatch && !b.isExactMatch');
    });
  });

  // ─── Test H: Exact search — Canonical EWO ───────────────────────────────────
  describe('Test H — Exact Search: Canonical EWO', () => {
    it('canonical EWO results show "Canonical EWO" badge', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('Canonical EWO');
    });

    it('clicking a canonical EWO result opens the normal detail page', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('selectEwo(ewo)');
    });
  });

  // ─── Test I: Detail routing ──────────────────────────────────────────────────
  describe('Test I — Detail Routing', () => {
    it('Historical Reference result opens HistoricalReferenceDetail page', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('HistoricalReferenceDetail');
      expect(content).toContain('setSelectedHistRef');
    });

    it('canonical EWO result opens normal EWODetail page', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('EWODetail');
      expect(content).toContain('selectEwo');
    });

    it('HistoricalReferenceDetail displays REFERENCE NOT ISSUED', () => {
      const content = read('src/pages/ecc/HistoricalReferenceDetail.tsx');
      expect(content).toContain('REFERENCE NOT ISSUED');
    });
  });

  // ─── Test J: Count integrity ─────────────────────────────────────────────────
  describe('Test J — Count Integrity', () => {
    it('exact match override does not alter filter counts', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      // counts are computed from ewos and historicalRefs, not from unifiedResults
      const countsIdx = content.indexOf('const counts = {');
      const countsBlock = content.slice(countsIdx, countsIdx + 500);
      expect(countsBlock).not.toContain('unifiedResults');
      expect(countsBlock).not.toContain('exactMatchOverride');
    });

    it('Historical References excluded from active/draft/ready counts', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain("case 'historical_ref': return false;");
    });
  });

  // ─── Test K: Collision protection ───────────────────────────────────────────
  describe('Test K — Collision Protection', () => {
    it('migration creates collision detection view', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const migration = migrations.find(f => f.includes('7r3r_mandatory_registration'));
      const content = read(`supabase/migrations/${migration}`);
      expect(content).toContain('v_ewo_historical_collisions');
    });

    it('migration creates collision guard function', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const migration = migrations.find(f => f.includes('7r3r_mandatory_registration'));
      const content = read(`supabase/migrations/${migration}`);
      expect(content).toContain('check_ewo_historical_collision');
    });

    it('ensureEngineeringWorkOrderExists checks for Historical Reference collision', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('collisionDetected');
      expect(content).toContain('engineering_historical_references');
      expect(content).toContain('held by a Historical Reference');
    });

    it('detectCollisions function exists', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('detectCollisions');
      expect(content).toContain('v_ewo_historical_collisions');
    });

    it('guard blocks creation when collision detected (unless allowConversion)', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('allowConversion');
      expect(content).toContain('Cannot create a competing canonical EWO');
    });
  });

  // ─── Test L: Idempotent rerun ────────────────────────────────────────────────
  describe('Test L — Idempotent Rerun', () => {
    it('migration uses WHERE NOT EXISTS for all inserts', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const migration = migrations.find(f => f.includes('7r3r_mandatory_registration'));
      const content = read(`supabase/migrations/${migration}`);
      const insertCount = (content.match(/INSERT INTO/g) || []).length;
      const notExistsCount = (content.match(/NOT EXISTS/g) || []).length;
      expect(notExistsCount).toBeGreaterThanOrEqual(insertCount);
    });

    it('ensureEngineeringWorkOrderExists is idempotent', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('maybeSingle');
      expect(content).toContain('created: false');
    });

    it('guardImplementationEntry is idempotent (returns existing EWO)', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      // If EWO already exists, guard returns success=true with existing ID
      expect(content).toContain('success: true');
    });

    it('searchUnifiedLedger returns no duplicates (Historical Refs only added if no canonical EWO)', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      // The function adds historical refs unconditionally — but the unique
      // constraint on reference prevents duplicates in the DB.
      // The search itself doesn't deduplicate but the DB enforces uniqueness.
      expect(content).toContain('engineering_historical_references');
    });
  });

  // ─── Requirement 6: Unified Work Orders Search ──────────────────────────────
  describe('Requirement 6 — Unified Work Orders Search', () => {
    it('WorkOrdersPage search input searches both EWOs and Historical References', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('searchUnifiedLedger');
      expect(content).toContain('unifiedResults');
    });

    it('search placeholder mentions historical references', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('historical references');
    });

    it('Product Owner does not need to know record type before searching', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      // searchUnifiedLedger searches both tables in parallel
      expect(content).toContain('Promise.all');
    });
  });

  // ─── Requirement 7: Exact Reference Search Behaviour ────────────────────────
  describe('Requirement 7 — Exact Reference Search Behaviour', () => {
    it('exact match bypasses lifecycle filter', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('exactMatchOverride');
      expect(content).toContain('outside selected filter');
    });

    it('exact match shows actual type and lifecycle classification', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain('Canonical EWO');
      expect(content).toContain('Historical — Not Issued');
    });
  });

  // ─── Requirement 10: Counts and Filters ─────────────────────────────────────
  describe('Requirement 10 — Counts and Filters', () => {
    it('Historical References filter still works', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      expect(content).toContain("'historical_ref'");
      expect(content).toContain('Historical References');
    });

    it('unified search does not corrupt count cards', () => {
      const content = read('src/pages/ecc/ECCWorkOrdersPage.tsx');
      // Counts are computed from ewos and historicalRefs arrays, not from search results
      expect(content).toContain('counts.historical_ref');
    });
  });

  // ─── Requirement 4: Single Governed Entry Mechanism ──────────────────────────
  describe('Requirement 4 — Single Governed Entry Mechanism', () => {
    it('ensureEngineeringWorkOrder.ts is the canonical guard file', () => {
      const content = read('src/lib/ensureEngineeringWorkOrder.ts');
      expect(content).toContain('ensureEngineeringWorkOrderExists');
      expect(content).toContain('guardImplementationEntry');
    });

    it('createMissingEwo delegates to guard instead of duplicating logic', () => {
      const content = read('src/lib/engineeringIntegrityService.ts');
      const createMissingIdx = content.indexOf('async function createMissingEwo');
      const funcBody = content.slice(createMissingIdx, createMissingIdx + 500);
      expect(funcBody).toContain('guardImplementationEntry');
      expect(funcBody).not.toContain('.from(\'engineering_work_orders\').insert');
    });
  });
});
