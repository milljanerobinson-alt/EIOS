// EWO-014.19A.7R.2 — Historical Reference Verification Tests
// Tests for EWO-005 and EWO-006 historical audit
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf-8');

describe('EWO-014.19A.7R.2 — Historical Reference Verification (EWO-005 & EWO-006)', () => {

  // Requirement 1 — Historical Search
  describe('Requirement 1 — Historical Search', () => {
    it('audit migration searches engineering_work_orders', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r2_historical_audit'));
      expect(auditMigration).toBeDefined();
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('engineering_work_orders');
    });

    it('audit migration searches engineering_records_library', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r2_historical_audit'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('engineering_records_library');
    });

    it('audit migration documents all sources searched', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r2_historical_audit'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('sources_searched');
      expect(content).toContain('ewo_completion_reports');
      expect(content).toContain('ewo_lifecycle_events');
      expect(content).toContain('engineering_executions');
      expect(content).toContain('engineering_recovery_packages');
    });
  });

  // Requirement 2 — Evidence Analysis
  describe('Requirement 2 — Evidence Analysis', () => {
    it('audit record contains findings for EWO-005', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r2_historical_audit'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('EWO-005');
      expect(content).toContain("'created', false");
      expect(content).toContain("'implementation_started', false");
      expect(content).toContain("'completion_report_generated', false");
    });

    it('audit record contains findings for EWO-006', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r2_historical_audit'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('EWO-006');
    });

    it('audit record addresses whether reference was reserved but never used', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r2_historical_audit'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('reserved_but_never_used');
      expect(content).toContain('true');
    });

    it('audit record addresses whether reference was accidentally skipped', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r2_historical_audit'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('accidentally_skipped');
    });
  });

  // Requirement 3 & 4 — Reconciliation / Unused References
  describe('Requirement 3 & 4 — No Reconciliation, Unused References Recorded', () => {
    it('no placeholder Engineering Work Orders created', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r2_historical_audit'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('No placeholder Engineering Work Orders created');
    });

    it('audit record states reference is unused', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r2_historical_audit'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('Reference unused');
      expect(content).toContain('No governed engineering evidence exists');
    });

    it('audit record preserves historical numbering integrity', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r2_historical_audit'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('historical numbering integrity');
    });
  });

  // Requirement 5 — Duplicate Protection
  describe('Requirement 5 — Duplicate Protection', () => {
    it('audit does not create duplicate canonical references', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r2_historical_audit'));
      const content = read(`supabase/migrations/${auditMigration}`);
      // The migration only creates audit notes, not EWO records
      expect(content).toContain('engineering_ledger_audit_notes');
      expect(content).not.toContain('INSERT INTO engineering_work_orders');
    });
  });

  // Requirement 6 — Read-Only Preference
  describe('Requirement 6 — Read-Only Preference', () => {
    it('preferred outcome: no Engineering Work Orders created', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r2_historical_audit'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('No placeholder Engineering Work Orders created');
    });

    it('only historical audit record created', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r2_historical_audit'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('engineering_ledger_audit_notes');
      expect(content).toContain('historical_verification');
    });

    it('unrelated Engineering Work Orders not modified', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r2_historical_audit'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).not.toContain('UPDATE engineering_work_orders');
      expect(content).not.toContain('DELETE FROM engineering_work_orders');
    });
  });

  // Requirement 7 — Audit Record Discoverability
  describe('Requirement 7 — Audit Record Discoverability', () => {
    it('audit record table has RLS enabled', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r2_historical_audit'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('ENABLE ROW LEVEL SECURITY');
    });

    it('audit record has unique audit_ref for discoverability', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r2_historical_audit'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('audit_ref');
      expect(content).toContain('UNIQUE');
    });

    it('audit record contains conclusion text', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditMigration = migrations.find(f => f.includes('7r2_historical_audit'));
      const content = read(`supabase/migrations/${auditMigration}`);
      expect(content).toContain('conclusion');
      expect(content).toContain('intentionally skipped');
    });
  });

  // Test fixture evidence verification
  describe('Test Fixture Evidence', () => {
    it('EWO-005 in test fixtures is mock data only (not database evidence)', () => {
      const ledgerTest = read('src/tests/ewo014_14_ledger_completeness.test.ts');
      // These are hardcoded test arrays, not database queries
      expect(ledgerTest).toContain("ewo_ref: 'EWO-005'");
      expect(ledgerTest).toContain('testEwos');
    });

    it('EWO-006 in test fixtures is mock data only (not database evidence)', () => {
      const ledgerTest = read('src/tests/ewo014_14_ledger_completeness.test.ts');
      expect(ledgerTest).toContain("ewo_ref: 'EWO-006'");
    });

    it('EWO-005 in ewo011_1 test is a mock similarity link string', () => {
      const similarityTest = read('src/tests/ewo011_1.test.ts');
      expect(similarityTest).toContain("similarityLinkedRefs: ['IDEA-XYZ', 'EWO-005']");
    });
  });
});
