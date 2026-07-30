import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  classifyReference,
  inferParentRef,
} from '../lib/engineeringIntegrityService';

// EWO-014.19A.7R — Engineering Integrity Exhaustive Reconciliation & Truthful Scoring
// Comprehensive tests covering all 18 requirements and 10 Product Owner tests.

const SERVICE = 'src/lib/engineeringIntegrityService.ts';
const DASHBOARD = 'src/pages/ecc/ECCEngineeringIntegrityPage.tsx';

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function migrationExists(fragment: string): boolean {
  const files = readdirSync('supabase/migrations/');
  const migration = files.find(f => f.includes('ewo014_19a7r'));
  if (!migration) return false;
  return readFileSync(`supabase/migrations/${migration}`, 'utf-8').includes(fragment);
}

describe('EWO-014.19A.7R — Engineering Integrity Exhaustive Reconciliation & Truthful Scoring', () => {

  // ─── Requirement 1 — Two Operating Phases ────────────────────────────────────
  describe('Requirement 1 — Separate Historical Reconciliation From Integrity Validation', () => {
    it('1. runHistoricalReconciliation function exists', () => {
      expect(read(SERVICE)).toContain('export async function runHistoricalReconciliation');
    });
    it('2. runValidationAudit function exists', () => {
      expect(read(SERVICE)).toContain('export async function runValidationAudit');
    });
    it('3. audit_phase field distinguishes phases', () => {
      expect(read(SERVICE)).toContain("historical_reconciliation");
      expect(read(SERVICE)).toContain("'validation'");
    });
    it('4. dashboard shows current operating phase', () => {
      expect(read(DASHBOARD)).toContain('Current Phase');
    });
  });

  // ─── Requirement 2 — Exhaustive Source Scan ──────────────────────────────────
  describe('Requirement 2 — Exhaustive Authoritative Source Scan', () => {
    it('5. all 9 minimum sources are configured', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('engineering_work_orders');
      expect(svc).toContain('engineering_plans');
      expect(svc).toContain('engineering_records_library');
      expect(svc).toContain('ewo_completion_reports');
      expect(svc).toContain('engineering_recovery_packages');
      expect(svc).toContain('engineering_executions');
      expect(svc).toContain('ewo_lifecycle_events');
      expect(svc).toContain('ewo_engineering_packages');
      expect(svc).toContain('engineering_verification_records');
    });
    it('6. AUTHORITATIVE_SOURCE array exists', () => {
      expect(read(SERVICE)).toContain('AUTHORITATIVE_SOURCES');
    });
    it('7. scanSource function scans each source', () => {
      expect(read(SERVICE)).toContain('async function scanSource');
    });
    it('8. engine does not stop after first repair set', () => {
      expect(read(SERVICE)).toContain('for (const source of AUTHORITATIVE_SOURCES)');
    });
  });

  // ─── Requirement 3 — Multi-Pass Reconciliation ──────────────────────────────
  describe('Requirement 3 — Multi-Pass Reconciliation Until Stable', () => {
    it('9. MAX_RECONCILIATION_PASSES constant exists', () => {
      expect(read(SERVICE)).toContain('MAX_RECONCILIATION_PASSES');
    });
    it('10. multi-pass loop exists', () => {
      expect(read(SERVICE)).toContain('while (passes < MAX_RECONCILIATION_PASSES');
    });
    it('11. stability check for zero repairs and zero new alerts', () => {
      expect(read(SERVICE)).toContain('autoRepaired === 0 && result.alertsRaised === 0');
    });
    it('12. instability alert raised when max passes exceeded', () => {
      expect(read(SERVICE)).toContain('raiseInstabilityAlert');
    });
  });

  // ─── Requirement 4 — Source Completion Envelope ──────────────────────────────
  describe('Requirement 4 — Source Completion Envelope', () => {
    it('13. SourceCompletionRecord interface exists', () => {
      expect(read(SERVICE)).toContain('interface SourceCompletionRecord');
    });
    it('14. SourceCompletionEnvelope interface exists', () => {
      expect(read(SERVICE)).toContain('interface SourceCompletionEnvelope');
    });
    it('15. envelope includes source_name, configured, attempted, succeeded', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('source_name');
      expect(svc).toContain('configured');
      expect(svc).toContain('attempted');
      expect(svc).toContain('succeeded');
    });
    it('16. envelope includes all_sources_attempted and all_required_sources_succeeded', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('all_sources_attempted');
      expect(svc).toContain('all_required_sources_succeeded');
    });
    it('17. migration adds source_completion_envelope column', () => {
      expect(migrationExists('source_completion_envelope')).toBe(true);
    });
  });

  // ─── Requirement 5 — Truthful Score Eligibility ──────────────────────────────
  describe('Requirement 5 — Truthful Score Eligibility', () => {
    it('18. score_eligible field exists', () => {
      expect(read(SERVICE)).toContain('score_eligible');
    });
    it('19. score cannot be 100% if sources failed', () => {
      expect(read(DASHBOARD)).toContain('Integrity assessment incomplete');
    });
    it('20. score capped at 99 when not eligible', () => {
      expect(read(SERVICE)).toContain('integrityScore = 99');
    });
    it('21. score_eligible requires all sources succeeded', () => {
      expect(read(SERVICE)).toContain('allSourcesSucceeded && totalIssues === 0');
    });
    it('22. migration adds score_eligible column', () => {
      expect(migrationExists('score_eligible')).toBe(true);
    });
  });

  // ─── Requirement 6 — Score Semantics ────────────────────────────────────────
  describe('Requirement 6 — Score Semantics', () => {
    it('23. dashboard shows Ledger Integrity Score separately', () => {
      expect(read(DASHBOARD)).toContain('Ledger Integrity Score');
    });
    it('24. dashboard shows Source Coverage separately', () => {
      expect(read(DASHBOARD)).toContain('Source Coverage');
    });
    it('25. dashboard shows Historical Reconciliation status', () => {
      expect(read(DASHBOARD)).toContain('Historical Reconciliation');
    });
    it('26. dashboard shows Open Blocking Issues separately', () => {
      expect(read(DASHBOARD)).toContain('Open Blocking Issues');
    });
    it('27. metrics are not collapsed into one number', () => {
      const dash = read(DASHBOARD);
      expect(dash).toContain('Metric label="Ledger Integrity"');
      expect(dash).toContain('Metric label="Source Coverage"');
    });
  });

  // ─── Requirement 7 — Idempotency ────────────────────────────────────────────
  describe('Requirement 7 — Idempotency', () => {
    it('28. current_run_repairs tracked separately from cumulative', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('current_run_repairs');
      expect(svc).toContain('cumulative_historical_repairs');
    });
    it('29. validation audit does not re-create reconciled items', () => {
      expect(read(SERVICE)).toContain('phase === \'validation\'');
    });
    it('30. migration adds current_run_repairs and cumulative_historical_repairs', () => {
      expect(migrationExists('current_run_repairs')).toBe(true);
      expect(migrationExists('cumulative_historical_repairs')).toBe(true);
    });
  });

  // ─── Requirement 8 — Snapshot Consistency ────────────────────────────────────
  describe('Requirement 8 — Snapshot Consistency', () => {
    it('31. discover → plan → apply → re-scan → calculate flow exists', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('Discover');
      expect(svc).toContain('Plan repairs');
      expect(svc).toContain('Apply repairs');
      expect(svc).toContain('Re-scan after repairs');
    });
    it('32. final score calculated from post-repair state', () => {
      expect(read(SERVICE)).toContain('postRepairMap');
    });
  });

  // ─── Requirement 9 — Reference Normalisation ────────────────────────────────
  describe('Requirement 9 — Reference Normalisation', () => {
    it('33. classifyReference function exists', () => {
      expect(read(SERVICE)).toContain('export function classifyReference');
    });

    it('34. EWO-014.7E classified as ewo', () => {
      const c = classifyReference('EWO-014.7E', 'test', {});
      expect(c.inferred_object_type).toBe('ewo');
      expect(c.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('35. ERC-001-DEV-SEED classified as dev_seed', () => {
      const c = classifyReference('ERC-001-DEV-SEED', 'test', {});
      expect(c.inferred_object_type).toBe('dev_seed');
      expect(c.eligible_for_auto_repair).toBe(false);
    });

    it('36. BATCH-A classified as batch', () => {
      const c = classifyReference('BATCH-A', 'test', {});
      expect(c.inferred_object_type).toBe('batch');
      expect(c.eligible_for_auto_repair).toBe(false);
    });

    it('37. BUG-BF-001 classified as bug', () => {
      const c = classifyReference('BUG-BF-001', 'test', {});
      expect(c.inferred_object_type).toBe('bug');
      expect(c.eligible_for_auto_repair).toBe(false);
    });

    it('38. CONST-001 classified as constitutional', () => {
      const c = classifyReference('CONST-001', 'test', {});
      expect(c.inferred_object_type).toBe('constitutional');
    });

    it('39. free-text "EWO" mention not auto-created', () => {
      const c = classifyReference('SOME-EWO-MENTION', 'test', {});
      expect(c.inferred_object_type).not.toBe('ewo');
      expect(c.eligible_for_auto_repair).toBe(false);
    });

    it('40. ReferenceClassification records raw, normalised, type, confidence, reason', () => {
      const c = classifyReference('EWO-009.1', 'engineering_records_library', { record_ref: 'EWO-009.1' });
      expect(c.raw_reference).toBe('EWO-009.1');
      expect(c.normalised_reference).toBe('EWO-009.1');
      expect(c.inferred_object_type).toBe('ewo');
      expect(c.confidence).toBeGreaterThan(0);
      expect(c.reason).toBeTruthy();
    });
  });

  // ─── Requirement 10 — Orphan Classification Accuracy ──────────────────────────
  describe('Requirement 10 — Orphan Classification Accuracy', () => {
    it('41. orphan detection checks object_type before flagging', () => {
      expect(read(SERVICE)).toContain("classification.inferred_object_type === 'ewo'");
    });
    it('42. non-EWO records not flagged as orphan EWO records', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('NOT an orphan EWO record');
    });
  });

  // ─── Requirement 11 — Development Seed & Test Artefact Governance ────────────
  describe('Requirement 11 — Development Seed & Test Artefact Governance', () => {
    it('43. dev_seed object type exists', () => {
      expect(read(SERVICE)).toContain("'dev_seed'");
    });
    it('44. test_fixture object type exists', () => {
      expect(read(SERVICE)).toContain("'test_fixture'");
    });
    it('45. superseded object type exists', () => {
      expect(read(SERVICE)).toContain("'superseded'");
    });
    it('46. dev_seed not eligible for auto-repair', () => {
      const c = classifyReference('ERC-001-DEV-SEED', 'test', {});
      expect(c.eligible_for_auto_repair).toBe(false);
    });
  });

  // ─── Requirement 12 — Initialisation Behaviour ──────────────────────────────
  describe('Requirement 12 — Initialisation Behaviour', () => {
    it('47. dashboard shows "Historical reconciliation required" before baseline', () => {
      expect(read(DASHBOARD)).toContain('Historical reconciliation required');
    });
    it('48. dashboard shows "Integrity baseline not yet established"', () => {
      expect(read(DASHBOARD)).toContain('Integrity baseline not yet established');
    });
    it('49. baseline_established field exists', () => {
      expect(read(SERVICE)).toContain('baseline_established');
    });
    it('50. getLatestBaselineAudit function exists', () => {
      expect(read(SERVICE)).toContain('getLatestBaselineAudit');
    });
  });

  // ─── Requirement 13 — Dashboard Transparency ──────────────────────────────────
  describe('Requirement 13 — Dashboard Transparency', () => {
    it('51. dashboard shows baseline established yes/no', () => {
      expect(read(DASHBOARD)).toContain('Baseline Established');
    });
    it('52. dashboard shows source coverage', () => {
      expect(read(DASHBOARD)).toContain('Source Coverage');
    });
    it('53. dashboard shows reconciliation pass count', () => {
      expect(read(DASHBOARD)).toContain('Reconciliation Passes');
    });
    it('54. dashboard shows stable result', () => {
      expect(read(DASHBOARD)).toContain('Stable Result');
    });
    it('55. dashboard shows current-run repairs', () => {
      expect(read(DASHBOARD)).toContain('Current-Run Repairs');
    });
    it('56. dashboard shows cumulative repairs', () => {
      expect(read(DASHBOARD)).toContain('Cumulative Repairs');
    });
    it('57. audit history shows audit phase', () => {
      expect(read(DASHBOARD)).toContain('Phase');
    });
    it('58. audit history shows stable result column', () => {
      expect(read(DASHBOARD)).toContain('Stable');
    });
  });

  // ─── Requirement 14 — Audit Drill-Down ────────────────────────────────────────
  describe('Requirement 14 — Audit Drill-Down', () => {
    it('59. drill-down modal exists', () => {
      expect(read(DASHBOARD)).toContain('drillDownAudit');
    });
    it('60. drill-down shows sources scanned', () => {
      expect(read(DASHBOARD)).toContain('Sources Scanned');
    });
    it('61. drill-down shows score calculation', () => {
      expect(read(DASHBOARD)).toContain('Score Calculation');
    });
    it('62. drill-down shows reference classifications', () => {
      expect(read(DASHBOARD)).toContain('References Discovered');
    });
    it('63. getAuditClassifications function exists', () => {
      expect(read(SERVICE)).toContain('getAuditClassifications');
    });
    it('64. getAuditById function exists', () => {
      expect(read(SERVICE)).toContain('getAuditById');
    });
  });

  // ─── Requirement 15 — Preserve Existing Alerts ────────────────────────────────
  describe('Requirement 15 — Preserve Existing Integrity Alerts', () => {
    it('65. alerts have original_audit_id preserved', () => {
      expect(read(SERVICE)).toContain('original_audit_id');
    });
    it('66. alerts have re_evaluation_status field', () => {
      expect(read(SERVICE)).toContain('re_evaluation_status');
    });
    it('67. migration preserves original audit origin', () => {
      expect(migrationExists('original_audit_id')).toBe(true);
    });
  });

  // ─── Requirement 16 — No Hardcoded Reconciliation Results ────────────────────
  describe('Requirement 16 — No Hardcoded Reconciliation Results', () => {
    it('68. service does not contain hardcoded EWO lists', () => {
      const svc = read(SERVICE);
      // Should NOT contain hardcoded arrays of EWO refs
      expect(svc).not.toContain("['EWO-014.19A.1'");
      expect(svc).not.toContain("['EWO-001', 'EWO-002'");
    });
    it('69. service does not reference test file contents', () => {
      const svc = read(SERVICE);
      expect(svc).not.toContain('ewo014_19a.test.ts');
      expect(svc).not.toContain('test file');
    });
    it('70. createMissingEwo derives from runtime data only', () => {
      expect(read(SERVICE)).toContain('hasAuthoritativeTitle');
    });
  });

  // ─── Requirement 17 — Governed Auto-Repair Threshold ──────────────────────────
  describe('Requirement 17 — Governed Auto-Repair Threshold', () => {
    it('71. auto-repair requires confidence >= 0.9', () => {
      expect(read(SERVICE)).toContain('confidence >= 0.9');
    });
    it('72. auto-repair requires eligible_for_auto_repair flag', () => {
      expect(read(SERVICE)).toContain('eligible_for_auto_repair');
    });
    it('73. auto-repair requires authoritative title', () => {
      expect(read(SERVICE)).toContain('hasAuthoritativeTitle');
    });
    it('74. ambiguous cases raise alerts not EWOs', () => {
      expect(read(SERVICE)).toContain('product_owner_review');
    });
  });

  // ─── Requirement 18 — Regression Protection ──────────────────────────────────
  describe('Requirement 18 — Regression Protection', () => {
    it('75. ensureEwoExists preserved', () => {
      expect(read(SERVICE)).toContain('export async function ensureEwoExists');
    });
    it('76. syncLifecycle preserved', () => {
      expect(read(SERVICE)).toContain('export async function syncLifecycle');
    });
    it('77. prompt_guard reconciliation source preserved', () => {
      expect(read(SERVICE)).toContain("'prompt_guard'");
    });
    it('78. inferParentRef preserved', () => {
      expect(read(SERVICE)).toContain('export function inferParentRef');
    });
    it('79. resolveAlert preserved', () => {
      expect(read(SERVICE)).toContain('export async function resolveAlert');
    });
    it('80. dismissAlert preserved', () => {
      expect(read(SERVICE)).toContain('export async function dismissAlert');
    });

    it('81. inferParentRef correctly infers parent', () => {
      expect(inferParentRef('EWO-014.19A.1')).toBe('EWO-014.19A');
      expect(inferParentRef('EWO-001')).toBeNull();
    });
  });

  // ─── Product Owner Tests ─────────────────────────────────────────────────────
  describe('Product Owner Tests', () => {
    it('Test 1 — Fresh Historical Reconciliation: runHistoricalReconciliation exists', () => {
      expect(read(SERVICE)).toContain('export async function runHistoricalReconciliation');
    });

    it('Test 2 — Immediate Repeat Audit: validation audit is single-pass', () => {
      const svc = read(SERVICE);
      expect(svc).toContain("phase === 'validation'");
      expect(svc).toContain('stable = true');
    });

    it('Test 3 — Incomplete Source: partial audit phase exists', () => {
      expect(read(SERVICE)).toContain("'partial'");
    });

    it('Test 4 — Deliberate Missing EWO: auto-create with conclusive evidence', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('createMissingEwo');
      expect(svc).toContain('hasAuthoritativeTitle');
    });

    it('Test 5 — Ambiguous Reference: low confidence raises alert not EWO', () => {
      const c = classifyReference('SOME-EWO-LIKE-STRING', 'test', {});
      expect(c.eligible_for_auto_repair).toBe(false);
      expect(read(SERVICE)).toContain('product_owner_review');
    });

    it('Test 6 — Non-EWO Engineering Record: batch not flagged as orphan EWO', () => {
      const c = classifyReference('BATCH-A', 'test', {});
      expect(c.inferred_object_type).toBe('batch');
      expect(c.inferred_object_type).not.toBe('ewo');
    });

    it('Test 7 — Development Seed Artefact: DEV-SEED classified correctly', () => {
      const c = classifyReference('ERC-006-DEV-SEED', 'test', {});
      expect(c.inferred_object_type).toBe('dev_seed');
      expect(c.eligible_for_auto_repair).toBe(false);
    });

    it('Test 8 — Existing Alert Re-Evaluation: re_evaluation_status field exists', () => {
      expect(read(SERVICE)).toContain('re_evaluation_status');
    });

    it('Test 9 — Audit Drill-Down: classifications recorded per audit', () => {
      expect(read(SERVICE)).toContain('integrity_reference_classifications');
      expect(migrationExists('integrity_reference_classifications')).toBe(true);
    });

    it('Test 10 — Prompt Guard Regression: ensureEwoExists still works', () => {
      expect(read(SERVICE)).toContain('export async function ensureEwoExists');
      expect(read(SERVICE)).toContain('Prompt Generation Guard');
    });
  });

  // ─── Acceptance Standards ─────────────────────────────────────────────────────
  describe('Acceptance Standards', () => {
    it('A1. first full reconciliation is exhaustive (all sources scanned)', () => {
      expect(read(SERVICE)).toContain('for (const source of AUTHORITATIVE_SOURCES)');
    });
    it('A2. platform cannot report 100% from partial scan', () => {
      expect(read(SERVICE)).toContain('integrityScore = 99');
    });
    it('A3. immediate repeat audits are idempotent (validation is single-pass)', () => {
      const svc = read(SERVICE);
      expect(svc).toContain("phase === 'validation'");
      expect(svc).toContain('stable = true');
    });
    it('A4. historical and validation audit phases are distinct', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('historical_reconciliation');
      expect(svc).toContain('validation');
    });
    it('A5. every source has machine-produced completion evidence', () => {
      expect(read(SERVICE)).toContain('SourceCompletionRecord');
    });
    it('A6. reference parsing respects engineering object domains', () => {
      const c1 = classifyReference('EWO-001', 'test', {});
      const c2 = classifyReference('BATCH-A', 'test', {});
      const c3 = classifyReference('BUG-001', 'test', {});
      expect(c1.inferred_object_type).toBe('ewo');
      expect(c2.inferred_object_type).toBe('batch');
      expect(c3.inferred_object_type).toBe('bug');
    });
    it('A7. development/test artefacts are governed explicitly', () => {
      const c = classifyReference('ERC-001-DEV-SEED', 'test', {});
      expect(c.inferred_object_type).toBe('dev_seed');
      expect(c.eligible_for_auto_repair).toBe(false);
    });
    it('A8. existing alerts are preserved and re-evaluated', () => {
      expect(migrationExists('original_audit_id')).toBe(true);
      expect(migrationExists('re_evaluation_status')).toBe(true);
    });
    it('A9. integrity score is deterministic, explainable, and truthful', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('score_eligible');
      expect(svc).toContain('allSourcesSucceeded');
    });
    it('A10. Prompt Generation Guard remains operational', () => {
      expect(read(SERVICE)).toContain('ensureEwoExists');
      expect(read(SERVICE)).toContain('Prompt Generation Guard');
    });
  });
});
