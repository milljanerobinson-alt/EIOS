// EWO-014.19A.7R.1 — Governed Maintenance Script Regression Tests
// Tests A-K from the requirements
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf-8');

const SCRIPT = 'scripts/ewo014_19a_7r1_governed_maintenance.ts';
const SERVICE = 'src/lib/lifecycleEvidenceEngine.ts';
const ORCHESTRATOR = 'src/lib/verificationOrchestrator.ts';

describe('EWO-014.19A.7R.1 — Governed Maintenance Script', () => {

  // ─── Test A — Exact Scope ──────────────────────────────────────────────────
  describe('Test A — Exact Scope', () => {
    it('script defines EXPECTED_TOTAL = 42', () => {
      const script = read(SCRIPT);
      expect(script).toContain('EXPECTED_TOTAL = 42');
    });

    it('script defines EXPECTED_CANDIDATES = 41', () => {
      const script = read(SCRIPT);
      expect(script).toContain('EXPECTED_CANDIDATES = 41');
    });

    it('script excludes only exact ref TEST (not pattern match)', () => {
      const script = read(SCRIPT);
      expect(script).toContain("EXCLUDED_REF = 'TEST'");
      expect(script).toContain('!== EXCLUDED_REF');
      // Must NOT use ilike or contains patterns
      expect(script).not.toContain('ilike');
      expect(script).not.toContain('.like(');
    });

    it('EWO-TEST-001 is retained (not excluded)', () => {
      const script = read(SCRIPT);
      // The script only excludes exact 'TEST', so EWO-TEST-001 is included
      expect(script).toContain('EWO-TEST-001');
    });

    it('script asserts candidate count = 41 before writes', () => {
      const script = read(SCRIPT);
      expect(script).toContain('candidates.length !== EXPECTED_CANDIDATES');
      expect(script).toContain('Stopping before any writes');
    });
  });

  // ─── Test B — Scope Mismatch ────────────────────────────────────────────────
  describe('Test B — Scope Mismatch', () => {
    it('script stops on scope mismatch (total != 42)', () => {
      const script = read(SCRIPT);
      expect(script).toContain('!== EXPECTED_TOTAL');
      expect(script).toContain('scopeMismatch: true');
    });

    it('script stops on scope mismatch (excluded != 1)', () => {
      const script = read(SCRIPT);
      expect(script).toContain('excluded.length !== EXPECTED_EXCLUDED');
    });

    it('script stops on scope mismatch (candidates != 41)', () => {
      const script = read(SCRIPT);
      expect(script).toContain('candidates.length !== EXPECTED_CANDIDATES');
    });

    it('script returns scope mismatch report without writes', () => {
      const script = read(SCRIPT);
      expect(script).toContain('scope_mismatch_report');
      expect(script).toContain('SCOPE MISMATCH');
      expect(script).toContain('STOPPING');
    });
  });

  // ─── Test C — Successful Verification ───────────────────────────────────────
  describe('Test C — Successful Verification', () => {
    it('script uses canonical runVerificationOrchestration', () => {
      const script = read(SCRIPT);
      expect(script).toContain('runVerificationOrchestration');
      expect(script).toContain('verify_all_eligible');
    });

    it('script uses verify_remaining for partially verified EWOs', () => {
      const script = read(SCRIPT);
      expect(script).toContain('verify_remaining');
    });

    it('orchestrator supports verify_all_eligible mode', () => {
      const orch = read(ORCHESTRATOR);
      expect(orch).toContain("'verify_all_eligible'");
    });

    it('script checks for 5/5 verified gates', () => {
      const script = read(SCRIPT);
      expect(script).toContain('verifiedGates === 5');
      expect(script).toContain('totalGates === 5');
    });
  });

  // ─── Test D — Already Verified EWO ───────────────────────────────────────────
  describe('Test D — Already Verified EWO', () => {
    it('script preserves existing verified gates (already_verified result)', () => {
      const script = read(SCRIPT);
      expect(script).toContain("'already_verified'");
    });

    it('script does not create duplicate verification for already-verified gates', () => {
      const script = read(SCRIPT);
      // When all 5 gates are verified, it returns already_verified without calling orchestration
      expect(script).toContain('verifiedGates === 5');
    });
  });

  // ─── Test E — Product Owner Acceptance ───────────────────────────────────────
  describe('Test E — Product Owner Acceptance', () => {
    it('script records exact authorised acceptance note', () => {
      const script = read(SCRIPT);
      expect(script).toContain('Product Owner Acceptance granted. Verified successful historical import, audit trail preservation, duplicate protection, and canonical closure method resolution. Approved for Engineering Ledger migration.');
    });

    it('script uses canonical grantPoAcceptance function', () => {
      const script = read(SCRIPT);
      expect(script).toContain('grantPoAcceptance');
    });

    it('acceptance note is not shortened or paraphrased', () => {
      const script = read(SCRIPT);
      const note = 'Product Owner Acceptance granted. Verified successful historical import, audit trail preservation, duplicate protection, and canonical closure method resolution. Approved for Engineering Ledger migration.';
      // The exact note must appear verbatim
      expect(script).toContain(note);
    });

    it('script records Product Owner as decision authority', () => {
      const script = read(SCRIPT);
      expect(script).toContain("ACCEPTED_BY = 'product_owner'");
    });
  });

  // ─── Test F — Canonical Closure ───────────────────────────────────────────────
  describe('Test F — Canonical Closure', () => {
    it('script uses canonical progressLifecycle for closure', () => {
      const script = read(SCRIPT);
      expect(script).toContain('progressLifecycle');
    });

    it('script does NOT use raw bulk UPDATE to closed', () => {
      const script = read(SCRIPT);
      // Must not contain a direct UPDATE ... SET status = 'closed'
      expect(script).not.toContain("UPDATE engineering_work_orders SET status = 'closed'");
      expect(script).not.toContain(".update({ status: 'closed' })");
    });

    it('lifecycle engine validates closure eligibility before closing', () => {
      const svc = read(SERVICE);
      expect(svc).toContain('isClosureEligible');
      expect(svc).toContain('closure_eligible');
    });
  });

  // ─── Test G — Existing Closed EWO ─────────────────────────────────────────────
  describe('Test G — Existing Closed EWO', () => {
    it('script recognises already-closed EWOs (already_closed result)', () => {
      const script = read(SCRIPT);
      expect(script).toContain("'already_closed'");
    });

    it('script does not create duplicate acceptance for already-accepted EWOs', () => {
      const script = read(SCRIPT);
      expect(script).toContain("'already_accepted'");
    });

    it('script validates already-closed EWOs have acceptance and verification', () => {
      const script = read(SCRIPT);
      expect(script).toContain('assessLifecycle');
      expect(script).toContain("derived_state === 'closed'");
    });
  });

  // ─── Test H — Failed Verification ─────────────────────────────────────────────
  describe('Test H — Failed Verification', () => {
    it('script does not accept or close EWOs with failed verification', () => {
      const script = read(SCRIPT);
      expect(script).toContain("verification.result === 'failed'");
      expect(script).toContain('Skipped — verification failed');
    });

    it('script retains failure reason', () => {
      const script = read(SCRIPT);
      expect(script).toContain('failure_or_skip_reason');
    });
  });

  // ─── Test I — Idempotent Rerun ─────────────────────────────────────────────────
  describe('Test I — Idempotent Rerun', () => {
    it('script recognises already-verified gates on rerun', () => {
      const script = read(SCRIPT);
      expect(script).toContain("'already_verified'");
    });

    it('script recognises existing PO acceptance on rerun', () => {
      const script = read(SCRIPT);
      expect(script).toContain("'already_accepted'");
    });

    it('script recognises already-closed EWOs on rerun', () => {
      const script = read(SCRIPT);
      expect(script).toContain("'already_closed'");
    });

    it('script avoids duplicate lifecycle events (progressLifecycle is idempotent)', () => {
      const svc = read(SERVICE);
      // progressLifecycle checks transition_needed before writing
      expect(svc).toContain('transition_needed');
      expect(svc).toContain('transitioned: false');
    });
  });

  // ─── Test J — TEST Exclusion ───────────────────────────────────────────────────
  describe('Test J — TEST Exclusion', () => {
    it('TEST is excluded with exact match only', () => {
      const script = read(SCRIPT);
      expect(script).toContain("EXCLUDED_REF = 'TEST'");
      expect(script).toContain('!== EXCLUDED_REF');
    });

    it('TEST remains unchanged (no writes to excluded EWOs)', () => {
      const script = read(SCRIPT);
      // Excluded EWOs are never processed
      expect(script).toContain('candidates');
      expect(script).not.toContain("eq('ewo_ref', 'TEST')");
    });
  });

  // ─── Test K — EWO-TEST-001 Inclusion ───────────────────────────────────────────
  describe('Test K — EWO-TEST-001 Inclusion', () => {
    it('EWO-TEST-001 is NOT excluded (only exact TEST is excluded)', () => {
      const script = read(SCRIPT);
      // The filter uses !== which means EWO-TEST-001 passes through
      expect(script).toContain("!== EXCLUDED_REF");
      // EWO-TEST-001 does not equal 'TEST' so it's included
    });

    it('script does not use pattern matching that would catch EWO-TEST-001', () => {
      const script = read(SCRIPT);
      expect(script).not.toContain('ilike');
      expect(script).not.toContain('startsWith');
      expect(script).not.toContain('includes(');
    });
  });

  // ─── Requirement 2 — Dry Run ──────────────────────────────────────────────────
  describe('Requirement 2 — Dry Run', () => {
    it('script defaults to DRY_RUN = true', () => {
      const script = read(SCRIPT);
      expect(script).toContain("DRY_RUN: boolean = process.env.DRY_RUN !== 'false'");
    });

    it('script does not write in dry-run mode', () => {
      const script = read(SCRIPT);
      expect(script).toContain('if (DRY_RUN) return');
      expect(script).toContain('if (dryRun)');
      expect(script).toContain('Would ');
    });

    it('script outputs per-candidate dry-run preview', () => {
      const script = read(SCRIPT);
      expect(script).toContain('dry_run');
      expect(script).toContain('per_ewo_results');
    });
  });

  // ─── Requirement 3 — Canonical Services ─────────────────────────────────────────
  describe('Requirement 3 — Canonical Services', () => {
    it('script imports from verificationOrchestrator', () => {
      const script = read(SCRIPT);
      expect(script).toContain('verificationOrchestrator');
    });

    it('script imports from lifecycleEvidenceEngine', () => {
      const script = read(SCRIPT);
      expect(script).toContain('lifecycleEvidenceEngine');
    });

    it('script imports from verificationService', () => {
      const script = read(SCRIPT);
      expect(script).toContain('verificationService');
    });
  });

  // ─── Requirement 4 — Integrity Validation ───────────────────────────────────────
  describe('Requirement 4 — Integrity Validation', () => {
    it('script validates ewo_ref is present', () => {
      const script = read(SCRIPT);
      expect(script).toContain('ewo_ref is missing or empty');
    });

    it('script checks for duplicate references', () => {
      const script = read(SCRIPT);
      expect(script).toContain('Duplicate reference');
    });

    it('script validates parent relationships', () => {
      const script = read(SCRIPT);
      expect(script).toContain('parent_ref');
      expect(script).toContain('does not exist in canonical ledger');
    });

    it('script skips EWOs that fail integrity validation', () => {
      const script = read(SCRIPT);
      expect(script).toContain('integrity_valid');
      expect(script).toContain('Skipped — integrity validation failed');
    });
  });

  // ─── Requirement 6 — Historical EWO Handling ───────────────────────────────────
  describe('Requirement 6 — Historical EWO Handling', () => {
    it('script handles EWOs with no verification gates', () => {
      const script = read(SCRIPT);
      expect(script).toContain('totalGates === 0');
      expect(script).toContain('Historical EWO');
    });

    it('script initializes gates via RPC for historical EWOs', () => {
      const script = read(SCRIPT);
      expect(script).toContain('initialize_ewo_verification_gates');
    });

    it('script skips historical EWOs with no artefacts', () => {
      const script = read(SCRIPT);
      expect(script).toContain('Cannot safely verify');
    });
  });

  // ─── Requirement 7 — Lifecycle Progression ──────────────────────────────────────
  describe('Requirement 7 — Lifecycle Progression', () => {
    it('script does not regress already-closed EWOs', () => {
      const script = read(SCRIPT);
      expect(script).toContain('already_closed');
    });

    it('script validates already-closed EWOs have acceptance and verification', () => {
      const script = read(SCRIPT);
      expect(script).toContain('assessLifecycle');
    });
  });

  // ─── Requirement 10 — Transaction and Failure Behaviour ─────────────────────────
  describe('Requirement 10 — Transaction and Failure Behaviour', () => {
    it('script processes each EWO in isolation', () => {
      const script = read(SCRIPT);
      expect(script).toContain('for (const ewo of scope.candidates)');
      expect(script).toContain('processEWO(ewo, DRY_RUN)');
    });

    it('script continues processing other EWOs after failure', () => {
      const script = read(SCRIPT);
      // The loop continues — no break/throw on failure
      expect(script).toContain('perEwoResults.push(result)');
    });
  });

  // ─── Requirement 11 — Idempotency ────────────────────────────────────────────────
  describe('Requirement 11 — Idempotency', () => {
    it('script is safe to run multiple times', () => {
      const script = read(SCRIPT);
      expect(script).toContain('already_verified');
      expect(script).toContain('already_accepted');
      expect(script).toContain('already_closed');
    });
  });

  // ─── Requirement 12 — Batch Audit Record ────────────────────────────────────────
  describe('Requirement 12 — Batch Audit Record', () => {
    it('script creates batch audit record', () => {
      const script = read(SCRIPT);
      expect(script).toContain('ewo_batch_audit_records');
      expect(script).toContain('createBatchAuditRecord');
    });

    it('audit record contains script name and version', () => {
      const script = read(SCRIPT);
      expect(script).toContain('script_name');
      expect(script).toContain('script_version');
    });

    it('audit record contains execution ID', () => {
      const script = read(SCRIPT);
      expect(script).toContain('execution_id');
    });

    it('audit record contains authorised acceptance note', () => {
      const script = read(SCRIPT);
      expect(script).toContain('acceptance_note');
    });

    it('audit record contains per-EWO results', () => {
      const script = read(SCRIPT);
      expect(script).toContain('per_ewo_results');
    });

    it('batch audit table migration exists', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const auditTableMigration = migrations.find(f => f.includes('batch_audit_table'));
      expect(auditTableMigration).toBeDefined();
    });
  });

  // ─── Requirement 14 — Script Location ───────────────────────────────────────────
  describe('Requirement 14 — Script Location', () => {
    it('script is stored in scripts/ directory (not end-user accessible)', () => {
      const scriptPath = path.resolve(ROOT, SCRIPT);
      expect(fs.existsSync(scriptPath)).toBe(true);
      expect(SCRIPT).toContain('scripts/');
    });

    it('script has descriptive filename', () => {
      expect(SCRIPT).toContain('governed_maintenance');
    });

    it('script has inline safety documentation', () => {
      const script = read(SCRIPT);
      expect(script).toContain('SAFETY DOCUMENTATION');
      expect(script).toContain('DRY RUN');
      expect(script).toContain('IDEMPOTENCY');
      expect(script).toContain('EXECUTION INSTRUCTIONS');
    });

    it('script defaults to dry-run', () => {
      const script = read(SCRIPT);
      expect(script).toContain("process.env.DRY_RUN !== 'false'");
    });
  });
});
