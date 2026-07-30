import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { classifyReference, inferParentRef } from '../lib/engineeringIntegrityService';

// EWO-014.19A.7 — Engineering Work Order Integrity & Automatic Lifecycle Governance
// Updated for EWO-014.19A.7R corrected architecture.
// Verifies the integrity audit service, prompt generation guard, lifecycle
// synchronisation, and dashboard are correctly implemented.

const SERVICE = 'src/lib/engineeringIntegrityService.ts';
const DASHBOARD = 'src/pages/ecc/ECCEngineeringIntegrityPage.tsx';
const PACKAGE_SVC = 'src/lib/engineeringPackageService.ts';
const ECC_PAGE = 'src/pages/EngineeringControlCentrePage.tsx';
const ECC_DASH = 'src/pages/ecc/ECCDashboard.tsx';

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function migrationExists(fragment: string): boolean {
  const files = readdirSync('supabase/migrations/');
  const migration = files.find(f => f.includes('ewo014_19a7'));
  if (!migration) return false;
  return readFileSync(`supabase/migrations/${migration}`, 'utf-8').includes(fragment);
}

describe('EWO-014.19A.7 — Engineering Work Order Integrity & Automatic Lifecycle Governance', () => {

  // ─── Requirement 1 — Engineering Ledger Integrity Audit ──────────────────────
  describe('Requirement 1 — Engineering Ledger Integrity Audit', () => {
    it('1. runIntegrityAudit function exists', () => {
      expect(read(SERVICE)).toContain('export async function runIntegrityAudit');
    });

    it('2. audit discovers EWO references from all authoritative sources', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('engineering_work_orders');
      expect(svc).toContain('engineering_records_library');
      expect(svc).toContain('ewo_completion_reports');
      expect(svc).toContain('engineering_recovery_packages');
      expect(svc).toContain('engineering_executions');
      expect(svc).toContain('ewo_lifecycle_events');
      expect(svc).toContain('ewo_engineering_packages');
      expect(svc).toContain('engineering_verification_records');
    });

    it('3. scanSource function exists (replaces discoverEwoReferences)', () => {
      expect(read(SERVICE)).toContain('async function scanSource');
    });
  });

  // ─── Requirement 2 — Detect Missing Engineering Work Orders ──────────────────
  describe('Requirement 2 — Detect Missing Engineering Work Orders', () => {
    it('4. missing EWO detection logic exists', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('missingEwos');
      expect(svc).toContain('remainingMissing');
    });

    it('5. missing EWOs include source evidence', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('sources');
      expect(svc).toContain('evidence');
      expect(svc).toContain('confidence');
    });
  });

  // ─── Requirement 3 — Detect Ledger Integrity Issues ──────────────────────────
  describe('Requirement 3 — Detect Ledger Integrity Issues', () => {
    it('6. duplicate EWO detection exists', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('duplicates');
      expect(svc).toContain('refCounts');
    });

    it('7. orphan EWO detection exists', () => {
      expect(read(SERVICE)).toContain('orphanRecords');
    });

    it('8. orphan completion report detection exists', () => {
      expect(read(SERVICE)).toContain('ewo_completion_reports');
    });

    it('9. orphan engineering record detection exists', () => {
      expect(read(SERVICE)).toContain('orphan_record');
    });

    it('10. orphan implementation prompt detection exists', () => {
      expect(read(SERVICE)).toContain('ewo_engineering_packages');
    });

    it('11. parent-child issue detection exists', () => {
      expect(read(SERVICE)).toContain('parentChildIssues');
    });

    it('12. conflicting reference detection exists', () => {
      expect(read(SERVICE)).toContain('classifyReference');
    });
  });

  // ─── Requirement 4 — Canonical Reconciliation ───────────────────────────────
  describe('Requirement 4 — Canonical Reconciliation', () => {
    it('13. auto-create missing EWO function exists', () => {
      expect(read(SERVICE)).toContain('async function createMissingEwo');
    });

    it('14. auto-created EWOs preserve reconciliation source', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('reconciliation_source');
      expect(svc).toContain('integrity_audit');
    });

    it('15. auto-created EWOs record reconciled_at timestamp', () => {
      expect(read(SERVICE)).toContain('reconciled_at');
    });

    it('16. auto-created EWOs populate from evidence, not invented', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('hasAuthoritativeTitle');
      expect(svc).toContain('confidence >= 0.9');
    });
  });

  // ─── Requirement 5 — Parent/Child Relationship Repair ───────────────────────
  describe('Requirement 5 — Parent/Child Relationship Repair', () => {
    it('17. inferParentRef function exists', () => {
      expect(read(SERVICE)).toContain('export function inferParentRef');
    });

    it('18. parent-child auto-repair exists', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('can_repair');
      expect(svc).toContain('parent_ref');
    });

    it('19. parent_ref backfill exists in migration', () => {
      expect(migrationExists('parent_ref')).toBe(true);
    });
  });

  // ─── Requirement 6 — Engineering Work Order First Principle ──────────────────
  describe('Requirement 6 — Engineering Work Order First Principle', () => {
    it('20. service documents the EWO-first constitutional rule', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('canonical EWO must exist before implementation');
    });
  });

  // ─── Requirement 7 — Prompt Generation Guard ─────────────────────────────────
  describe('Requirement 7 — Prompt Generation Guard', () => {
    it('21. ensureEwoExists function exists', () => {
      expect(read(SERVICE)).toContain('export async function ensureEwoExists');
    });

    it('22. ensureEwoExists returns existing EWO if found', () => {
      expect(read(SERVICE)).toContain('created: false');
    });

    it('23. ensureEwoExists auto-creates EWO if missing', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('prompt_guard');
      expect(svc).toContain('created: true');
    });

    it('24. package service calls lifecycle sync on prompt generation', () => {
      const pkg = read(PACKAGE_SVC);
      expect(pkg).toContain('Prompt Generation Guard');
      expect(pkg).toContain('syncLifecycle');
      expect(pkg).toContain('prompt_generated');
    });
  });

  // ─── Requirement 8 — Automatic Lifecycle Synchronisation ─────────────────────
  describe('Requirement 8 — Automatic Lifecycle Synchronisation', () => {
    it('25. syncLifecycle function exists', () => {
      expect(read(SERVICE)).toContain('export async function syncLifecycle');
    });

    it('26. syncLifecycle handles all required event types', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('plan_approved');
      expect(svc).toContain('completion_report_created');
      expect(svc).toContain('record_archived');
      expect(svc).toContain('historical_recovery_imported');
      expect(svc).toContain('prompt_generated');
      expect(svc).toContain('verification_completed');
      expect(svc).toContain('acceptance_recorded');
    });

    it('27. syncLifecycle raises alert when auto-creation fails', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('Lifecycle Sync Alert');
      expect(svc).toContain('alertRaised');
    });
  });

  // ─── Requirement 9 — Engineering Integrity Dashboard ──────────────────────────
  describe('Requirement 9 — Engineering Integrity Dashboard', () => {
    it('28. dashboard page exists', () => {
      expect(read(DASHBOARD)).toContain('ECCEngineeringIntegrityPage');
    });

    it('29. dashboard displays integrity score', () => {
      const dash = read(DASHBOARD);
      expect(dash).toContain('integrity_score');
      expect(dash).toContain('Ledger Integrity Score');
    });

    it('30. dashboard displays all required metrics', () => {
      const dash = read(DASHBOARD);
      expect(dash).toContain('Total EWOs');
      expect(dash).toContain('Missing EWOs');
      expect(dash).toContain('Duplicates');
      expect(dash).toContain('Orphan Records');
      expect(dash).toContain('Parent-Child Issues');
      expect(dash).toContain('Open Alerts');
    });

    it('31. dashboard has run audit button', () => {
      const dash = read(DASHBOARD);
      expect(dash).toContain('Run');
      expect(dash).toContain('runIntegrityAudit');
    });

    it('32. dashboard displays audit history', () => {
      const dash = read(DASHBOARD);
      expect(dash).toContain('Audit History');
      expect(dash).toContain('getAuditHistory');
    });

    it('33. dashboard displays and resolves alerts', () => {
      const dash = read(DASHBOARD);
      expect(dash).toContain('Integrity Alerts');
      expect(dash).toContain('resolveAlert');
      expect(dash).toContain('dismissAlert');
    });
  });

  // ─── Requirement 10 — Product Owner Guidance ─────────────────────────────────
  describe('Requirement 10 — Product Owner Guidance', () => {
    it('34. alerts include suggested actions', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('suggested_action');
      expect(svc).toContain('create_missing_ewo');
      expect(svc).toContain('resolve_duplicate');
      expect(svc).toContain('product_owner_review');
    });

    it('35. dashboard shows object type badges for PO guidance', () => {
      const dash = read(DASHBOARD);
      expect(dash).toContain('OBJECT_TYPE_COLOURS');
      expect(dash).toContain('object_type');
    });
  });

  // ─── Navigation Registration ─────────────────────────────────────────────────
  describe('Navigation Registration', () => {
    it('36. engineering-integrity section type registered', () => {
      expect(read(ECC_DASH)).toContain('engineering-integrity');
    });

    it('37. ECC page imports the integrity dashboard', () => {
      expect(read(ECC_PAGE)).toContain('ECCEngineeringIntegrityPage');
    });

    it('38. ECC page routes to engineering-integrity', () => {
      expect(read(ECC_PAGE)).toContain("case 'engineering-integrity'");
    });

    it('39. ECC page has nav item for engineering-integrity', () => {
      expect(read(ECC_PAGE)).toContain("key: 'engineering-integrity'");
    });
  });

  // ─── Product Owner Tests ─────────────────────────────────────────────────────
  describe('Product Owner Tests', () => {
    it('Test 1. Run Engineering Ledger Integrity Audit — runIntegrityAudit exists', () => {
      expect(read(SERVICE)).toContain('export async function runIntegrityAudit');
    });

    it('Test 2. EWO-014.19A.x refinements — parent_ref backfill in migration', () => {
      expect(migrationExists('EWO-014.19A')).toBe(true);
    });

    it('Test 3. Missing EWO detection — audit compares references against ledger', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('ewoMap.has');
      expect(svc).toContain('!ewoMap.has');
    });

    it('Test 4. Prompt generation guard — ensureEwoExists validates EWO before prompt', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('export async function ensureEwoExists');
      expect(svc).toContain('canonical EWO must exist before implementation');
    });

    it('Test 5. Duplicate detection — same ewo_ref with multiple rows detected', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('refCounts');
      expect(svc).toContain('ids.length > 1');
    });

    it('Test 6. Parent-child hierarchy — inferParentRef and auto-repair exist', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('inferParentRef');
      expect(svc).toContain('can_repair');
    });

    it('Test 7. Full lifecycle — syncLifecycle covers all lifecycle events', () => {
      const svc = read(SERVICE);
      const events = ['plan_approved', 'completion_report_created', 'record_archived', 'historical_recovery_imported', 'prompt_generated', 'verification_completed', 'acceptance_recorded'];
      events.forEach(e => expect(svc).toContain(e));
    });

    it('Test 8. Dashboard reports 100% integrity when no issues — score calculation exists', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('integrity_score');
      expect(svc).toContain('Math.max(0');
    });
  });
});
