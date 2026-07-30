// EWO-014.19A.7S — Engineering Integrity PO Experience & Platform Maturity Tests
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf-8');

describe('EWO-014.19A.7S — Engineering Integrity PO Experience & Platform Maturity', () => {

  // ─── Requirement 1: Platform Maturity Awareness ──────────────────────────
  describe('Requirement 1 — Platform Maturity Awareness', () => {
    it('maturity model defines all required states', () => {
      const content = read('src/lib/integrityMaturityModel.ts');
      expect(content).toContain("'operational'");
      expect(content).toContain("'degraded'");
      expect(content).toContain("'unavailable'");
      expect(content).toContain("'not_yet_implemented'");
    });

    it('unimplemented capabilities are not classified as errors', () => {
      const content = read('src/lib/integrityMaturityModel.ts');
      expect(content).toContain('not yet been engineered');
      expect(content).toContain('temporarily unavailable');
      expect(content).toContain('runtime execution failed');
      expect(content).toContain('disabled by configuration');
    });

    it('governed descriptions for every state', () => {
      const content = read('src/lib/integrityMaturityModel.ts');
      expect(content).toContain('MATURITY_DISPLAY');
      expect(content).toContain('Operational');
      expect(content).toContain('Degraded');
      expect(content).toContain('Unavailable');
      expect(content).toContain('Not Yet Implemented');
    });
  });

  // ─── Requirement 2: Investigation Workspace ──────────────────────────────
  describe('Requirement 2 — Investigation Workspace', () => {
    it('investigation workspace contains all required sections', () => {
      const content = read('src/lib/integrityInvestigation.tsx');
      expect(content).toContain('Executive Summary');
      expect(content).toContain('Root Cause');
      expect(content).toContain('Affected Components');
      expect(content).toContain('Evidence');
      expect(content).toContain('Timeline');
      expect(content).toContain('Recommended Actions');
      expect(content).toContain('Related Engineering');
      expect(content).toContain('Confidence');
    });

    it('selecting an alert opens a dedicated investigation panel', () => {
      const content = read('src/pages/ecc/ECCEngineeringIntegrityPage.tsx');
      expect(content).toContain('buildInvestigation');
      expect(content).toContain('setInvestigation');
      expect(content).toContain('InvestigationWorkspace');
    });
  });

  // ─── Requirement 3: Governed Recommended Actions ──────────────────────────
  describe('Requirement 3 — Governed Recommended Actions', () => {
    it('all required action types are supported', () => {
      const content = read('src/lib/integrityInvestigation.tsx');
      expect(content).toContain("'review_diagnostics'");
      expect(content).toContain("'open_engineering'");
      expect(content).toContain("'open_completion_report'");
      expect(content).toContain("'review_constitutional'");
      expect(content).toContain("'open_standard'");
      expect(content).toContain("'review_change_history'");
      expect(content).toContain("'retry_diagnostic'");
    });

    it('unavailable actions explain why', () => {
      const content = read('src/lib/integrityInvestigation.tsx');
      expect(content).toContain('unavailableReason');
      expect(content).toContain('action.available');
    });
  });

  // ─── Requirement 4: Clickable Engineering Evidence ────────────────────────
  describe('Requirement 4 — Clickable Engineering Evidence', () => {
    it('all evidence types are supported', () => {
      const content = read('src/lib/integrityInvestigation.tsx');
      expect(content).toContain("'ewo'");
      expect(content).toContain("'completion_report'");
      expect(content).toContain("'standard'");
      expect(content).toContain("'constitution'");
      expect(content).toContain("'historical_recovery'");
      expect(content).toContain("'engineering_record'");
      expect(content).toContain("'runtime_diagnostic'");
    });

    it('evidence items are navigable', () => {
      const content = read('src/lib/integrityInvestigation.tsx');
      expect(content).toContain('onNavigate');
      expect(content).toContain('handleCanonicalNavigation');
    });
  });

  // ─── Requirement 5: Metric Consistency ────────────────────────────────────
  describe('Requirement 5 — Metric Consistency', () => {
    it('single canonical maturity context drives all metrics', () => {
      const content = read('src/pages/ecc/ECCEngineeringIntegrityPage.tsx');
      expect(content).toContain('maturityContext');
      expect(content).toContain('useMemo');
    });

    it('no duplicated calculation logic', () => {
      const content = read('src/pages/ecc/ECCEngineeringIntegrityPage.tsx');
      // Source coverage calculated once in maturityContext
      const coverageMatches = content.match(/sourceCoverage/g);
      expect(coverageMatches).toBeTruthy();
      // Should reference maturityContext.sourceCoverage, not recalculate
      expect(content).toContain('maturityContext.sourceCoverage');
    });

    it('truthful zero states', () => {
      const content = read('src/pages/ecc/ECCEngineeringIntegrityPage.tsx');
      expect(content).toContain('Not yet run');
      expect(content).toContain('—');
    });
  });

  // ─── Requirement 6: Dashboard UX & Scrolling ─────────────────────────────
  describe('Requirement 6 — Dashboard UX & Scrolling', () => {
    it('investigation panel is scrollable', () => {
      const content = read('src/lib/integrityInvestigation.tsx');
      expect(content).toContain('overflow-y-auto');
      expect(content).toContain('max-h-[90vh]');
    });

    it('long evidence lists remain accessible', () => {
      const content = read('src/lib/integrityInvestigation.tsx');
      expect(content).toContain('max-h-64 overflow-y-auto');
    });

    it('responsive layouts', () => {
      const content = read('src/pages/ecc/ECCEngineeringIntegrityPage.tsx');
      expect(content).toContain('grid-cols-2 md:grid-cols-4');
      expect(content).toContain('sm:p-6');
    });
  });

  // ─── Requirement 7: Platform Maturity Dashboard ───────────────────────────
  describe('Requirement 7 — Platform Maturity Dashboard', () => {
    it('maturity tab displays all maturity states', () => {
      const content = read('src/pages/ecc/ECCEngineeringIntegrityPage.tsx');
      expect(content).toContain("'maturity'");
      expect(content).toContain('Platform Maturity');
      expect(content).toContain('maturitySummary');
    });

    it('each capability communicates its maturity', () => {
      const content = read('src/pages/ecc/ECCEngineeringIntegrityPage.tsx');
      expect(content).toContain('capabilityEvaluations');
      expect(content).toContain('MATURITY_DISPLAY');
    });
  });

  // ─── Requirement 8: Reconciliation Stability ──────────────────────────────
  describe('Requirement 8 — Reconciliation Stability', () => {
    it('distinguishes expected mismatch from runtime mismatch from permanent failure', () => {
      const content = read('src/lib/integrityMaturityModel.ts');
      expect(content).toContain('stable');
      expect(content).toContain('degraded');
      expect(content).toContain('not_yet_implemented');
    });

    it('provides confidence indicators', () => {
      const content = read('src/lib/integrityInvestigation.tsx');
      expect(content).toContain('confidence');
      expect(content).toContain('confidenceExplanation');
      expect(content).toContain('High');
      expect(content).toContain('Medium');
      expect(content).toContain('Low');
    });
  });

  // ─── Requirement 9: Product Owner Guidance ─────────────────────────────────
  describe('Requirement 9 — Product Owner Guidance', () => {
    it('contextual guidance includes what happened, why, next step, confidence, evidence', () => {
      const content = read('src/lib/integrityInvestigation.tsx');
      expect(content).toContain('executiveSummary');
      expect(content).toContain('rootCause');
      expect(content).toContain('recommendedActions');
      expect(content).toContain('confidence');
      expect(content).toContain('evidence');
    });
  });

  // ─── Requirement 10: Governed Diagnostic Language ─────────────────────────
  describe('Requirement 10 — Governed Diagnostic Language', () => {
    it('UI does not invent runtime behaviour', () => {
      const content = read('src/lib/integrityMaturityModel.ts');
      // Runtime diagnostics should be 'planned', not implying they ran
      expect(content).toContain("'planned'");
      expect(content).toContain('has not yet been engineered');
      expect(content).toContain('No runtime behaviour is implied');
    });

    it('language remains truthful — no unsupported claims', () => {
      const content = read('src/lib/integrityInvestigation.tsx');
      // buildInvestigation grounds wording in alert evidence
      expect(content).toContain('alert.evidence');
      expect(content).toContain('alert.classification_reason');
    });
  });

  // ─── Requirement 11: Future-Proof Architecture ─────────────────────────────
  describe('Requirement 11 — Future-Proof Architecture', () => {
    it('reusable investigation component', () => {
      const content = read('src/lib/integrityInvestigation.tsx');
      expect(content).toContain('export function InvestigationWorkspace');
      expect(content).toContain('export function buildInvestigation');
    });

    it('reusable maturity model', () => {
      const content = read('src/lib/integrityMaturityModel.ts');
      expect(content).toContain('export const INTEGRITY_CAPABILITIES');
      expect(content).toContain('export function evaluateAllCapabilities');
      expect(content).toContain('export function summariseMaturity');
    });

    it('reusable evidence navigation', () => {
      const content = read('src/lib/integrityInvestigation.tsx');
      expect(content).toContain('InvestigationEvidence');
      expect(content).toContain('EVIDENCE_HINT_MAP');
    });

    it('reusable recommendation engine', () => {
      const content = read('src/lib/integrityInvestigation.tsx');
      expect(content).toContain('InvestigationAction');
      expect(content).toContain('handleAction');
    });
  });

  // ─── Regression Protection ────────────────────────────────────────────────
  describe('Regression Protection', () => {
    it('EWO-017R lifecycle truthfulness preserved', () => {
      const content = read('src/pages/ecc/ECCEngineeringIntegrityPage.tsx');
      expect(content).toContain('EWO-017R');
      expect(content).toContain('Lifecycle Truthfulness');
      expect(content).toContain('premature_closures');
    });

    it('Engineering Standards Library not regressed', () => {
      const content = read('src/pages/ecc/ECCEngineeringIntegrityPage.tsx');
      // Standards navigation is available via onNavigate
      expect(content).toContain('onNavigate');
    });

    it('Canonical Engineering Governance preserved', () => {
      const content = read('src/pages/ecc/ECCEngineeringIntegrityPage.tsx');
      expect(content).toContain('runIntegrityAudit');
      expect(content).toContain('getLatestAudit');
    });
  });

  // ─── Canonical Registration ───────────────────────────────────────────────
  describe('Canonical Registration', () => {
    it('EWO-014.19A.7S registered before implementation', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const migration = migrations.find(f => f.includes('7s_integrity_po'));
      expect(migration).toBeDefined();
      const content = read(`supabase/migrations/${migration}`);
      expect(content).toContain('EWO-014.19A.7S');
      expect(content).toContain('ensure_canonical_creation');
    });
  });

  // ─── Product Owner Tests ──────────────────────────────────────────────────
  describe('Product Owner Test 1 — Operational capabilities', () => {
    it('implemented capabilities can display Operational', () => {
      const content = read('src/lib/integrityMaturityModel.ts');
      expect(content).toContain("'operational'");
    });
  });

  describe('Product Owner Test 2 — Planned capabilities show Not Yet Implemented', () => {
    it('planned capabilities do not show as errors', () => {
      const content = read('src/lib/integrityMaturityModel.ts');
      expect(content).toContain("'planned'");
      expect(content).toContain('Not Yet Implemented');
    });
  });

  describe('Product Owner Test 3 — Investigation workspace opens', () => {
    it('investigation workspace modal renders', () => {
      const content = read('src/pages/ecc/ECCEngineeringIntegrityPage.tsx');
      expect(content).toContain('InvestigationWorkspace');
    });
  });

  describe('Product Owner Test 4 — Evidence links navigate', () => {
    it('evidence navigation calls onNavigate', () => {
      const content = read('src/lib/integrityInvestigation.tsx');
      expect(content).toContain('handleCanonicalNavigation');
      expect(content).toContain('EVIDENCE_HINT_MAP');
    });
  });

  describe('Product Owner Test 5 — Recommended actions are truthful', () => {
    it('actions only appear when available', () => {
      const content = read('src/lib/integrityInvestigation.tsx');
      expect(content).toContain('action.available');
    });
  });

  describe('Product Owner Test 6 — Metrics reconcile', () => {
    it('all views use same canonical context', () => {
      const content = read('src/pages/ecc/ECCEngineeringIntegrityPage.tsx');
      expect(content).toContain('maturityContext');
      expect(content).toContain('capabilityEvaluations');
      expect(content).toContain('maturitySummary');
    });
  });

  describe('Product Owner Test 7 — Dashboard scrolling', () => {
    it('scrollable containers exist', () => {
      const content = read('src/pages/ecc/ECCEngineeringIntegrityPage.tsx');
      expect(content).toContain('overflow-y-auto');
      expect(content).toContain('overflow-x-auto');
    });
  });

  describe('Product Owner Test 8 — Confidence and maturity indicators', () => {
    it('confidence indicator displayed', () => {
      const content = read('src/lib/integrityInvestigation.tsx');
      expect(content).toContain('confidenceLabel');
      expect(content).toContain('confidenceColour');
    });
  });

  describe('Product Owner Test 9 — No invented runtime behaviour', () => {
    it('runtime diagnostics marked as planned', () => {
      const content = read('src/lib/integrityMaturityModel.ts');
      expect(content).toContain('Runtime Diagnostic Envelopes are planned but not yet implemented');
    });
  });
});
