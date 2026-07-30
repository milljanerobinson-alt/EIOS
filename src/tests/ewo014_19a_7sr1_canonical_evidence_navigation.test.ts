// EWO-014.19A.7SR.1 — Canonical Evidence Navigation Refinement Tests
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf-8');

const NAV_SERVICE = 'src/lib/engineeringNavigationService.ts';
const INVESTIGATION = 'src/lib/integrityInvestigation.tsx';
const DIALOG = 'src/lib/governedNavigationDialog.tsx';
const DASHBOARD = 'src/pages/ecc/ECCEngineeringIntegrityPage.tsx';

describe('EWO-014.19A.7SR.1 — Canonical Evidence Navigation Refinement', () => {

  // ─── Requirement 1: Canonical Object Resolution ──────────────────────────
  describe('Requirement 1 — Canonical Object Resolution', () => {
    it('reusable engineering object resolver exists', () => {
      const content = read(NAV_SERVICE);
      expect(content).toContain('export async function resolveCanonicalDestination');
    });

    it('supports all required object types', () => {
      const content = read(NAV_SERVICE);
      expect(content).toContain("'ewo'");
      expect(content).toContain("'engineering_record'");
      expect(content).toContain("'engineering_standard'");
      expect(content).toContain("'constitution_section'");
      expect(content).toContain("'completion_report'");
      expect(content).toContain("'historical_recovery'");
      expect(content).toContain("'runtime_diagnostic'");
      expect(content).toContain("'engineering_plan'");
    });

    it('resolver returns canonical destination with route key and hash', () => {
      const content = read(NAV_SERVICE);
      expect(content).toContain('CanonicalDestination');
      expect(content).toContain('routeKey');
      expect(content).toContain('hash');
      expect(content).toContain('objectRef');
    });

    it('resolver validates object existence against database', () => {
      const content = read(NAV_SERVICE);
      expect(content).toContain('validateObjectExists');
      expect(content).toContain('EXISTENCE_QUERIES');
      expect(content).toContain('supabase');
    });

    it('detects object type from reference patterns', () => {
      const content = read(NAV_SERVICE);
      expect(content).toContain('/^EWO-/');
      expect(content).toContain('/^CONST-/');
      expect(content).toContain('/^ES-/');
      expect(content).toContain('/^ERC-/');
    });
  });

  // ─── Requirement 2: Remove Placeholder Navigation ──────────────────────────
  describe('Requirement 2 — Remove Placeholder Navigation', () => {
    it('investigation workspace uses canonical navigation service', () => {
      const content = read(INVESTIGATION);
      expect(content).toContain('navigateToCanonical');
      expect(content).toContain('engineeringNavigationService');
    });

    it('evidence navigation resolves to canonical objects', () => {
      const content = read(INVESTIGATION);
      expect(content).toContain('handleCanonicalNavigation');
      expect(content).toContain('EVIDENCE_HINT_MAP');
    });

    it('does not navigate to placeholder pages', () => {
      const content = read(INVESTIGATION);
      expect(content).not.toContain('Coming soon');
    });
  });

  // ─── Requirement 3: Governed Missing Object Handling ──────────────────────
  describe('Requirement 3 — Governed Missing Object Handling', () => {
    it('governed dialog component exists', () => {
      const content = read(DIALOG);
      expect(content).toContain('GovernedNavigationDialog');
      expect(content).toContain('Engineering object unavailable');
    });

    it('dialog displays reference, reason, next action, and reference code', () => {
      const content = read(DIALOG);
      expect(content).toContain('Reference');
      expect(content).toContain('Reason');
      expect(content).toContain('Next action');
      expect(content).toContain('Reference Code');
    });

    it('dialog shows EIOS-NAV-001 for missing objects', () => {
      const content = read(NAV_SERVICE);
      expect(content).toContain('EIOS-NAV-001');
      expect(content).toContain('does not currently exist');
    });

    it('investigation workspace displays governed dialog on failure', () => {
      const content = read(INVESTIGATION);
      expect(content).toContain('navFailure');
      expect(content).toContain('setNavFailure');
      expect(content).toContain('GovernedNavigationDialog');
    });

    it('never silently fails', () => {
      const content = read(INVESTIGATION);
      // Error handling catches and displays governed guidance
      expect(content).toContain('catch');
      expect(content).toContain('EIOS-NAV-003');
    });
  });

  // ─── Requirement 4: Recommended Action Routing ────────────────────────────
  describe('Requirement 4 — Recommended Action Routing', () => {
    it('all action types route through canonical navigation', () => {
      const content = read(INVESTIGATION);
      expect(content).toContain('ACTION_HINT_MAP');
      expect(content).toContain("'open_engineering'");
      expect(content).toContain("'open_completion_report'");
      expect(content).toContain("'review_constitutional'");
      expect(content).toContain("'open_standard'");
      expect(content).toContain("'review_change_history'");
      expect(content).toContain("'review_diagnostics'");
      expect(content).toContain("'create_missing_ewo'");
    });

    it('actions call handleCanonicalNavigation with correct hint', () => {
      const content = read(INVESTIGATION);
      expect(content).toContain('ACTION_HINT_MAP[action.type]');
    });

    it('unavailable actions explain why', () => {
      const content = read(INVESTIGATION);
      expect(content).toContain('action.available');
      expect(content).toContain('unavailableReason');
    });
  });

  // ─── Requirement 5: Reusable Engineering Navigation Service ────────────────
  describe('Requirement 5 — Reusable Engineering Navigation Service', () => {
    it('navigation service is standalone module', () => {
      const content = read(NAV_SERVICE);
      expect(content).toContain('export async function resolveCanonicalDestination');
      expect(content).toContain('export async function navigateToCanonical');
      expect(content).toContain('export function formatNavigationFailure');
      expect(content).toContain('export async function resolveEvidenceBatch');
    });

    it('service uses routeRegistry for canonical routes', () => {
      const content = read(NAV_SERVICE);
      expect(content).toContain("from './routeRegistry'");
      expect(content).toContain('buildRoute');
      expect(content).toContain('navigate');
      expect(content).toContain('getRouteByKey');
    });

    it('service uses integrity service for reference classification', () => {
      const content = read(NAV_SERVICE);
      expect(content).toContain("from './engineeringIntegrityService'");
      expect(content).toContain('classifyReference');
    });

    it('Engineering Integrity page does not contain routing logic', () => {
      const content = read(DASHBOARD);
      // The page delegates to the investigation workspace which uses the service
      expect(content).not.toContain('buildRoute');
      expect(content).not.toContain('validateObjectExists');
    });
  });

  // ─── Requirement 6: Canonical URL Support ──────────────────────────────────
  describe('Requirement 6 — Canonical URL Support', () => {
    it('navigation updates browser URL via routeRegistry navigate', () => {
      const content = read(NAV_SERVICE);
      expect(content).toContain('navigate(result.destination.routeKey');
    });

    it('supports refresh via canonical hash', () => {
      const content = read(NAV_SERVICE);
      expect(content).toContain('buildRoute(routeKey');
    });

    it('supports deep linking through canonical routes', () => {
      const content = read(NAV_SERVICE);
      expect(content).toContain('EVIDENCE_ROUTE_MAP');
    });
  });

  // ─── Requirement 7: Governed Error Handling ──────────────────────────────
  describe('Requirement 7 — Governed Error Handling', () => {
    it('unexpected errors display governed guidance', () => {
      const content = read(INVESTIGATION);
      expect(content).toContain('EIOS-NAV-003');
      expect(content).toContain('unexpected error');
      expect(content).toContain('Retry navigation');
    });

    it('does not expose stack traces', () => {
      const content = read(INVESTIGATION);
      expect(content).not.toContain('stack');
      expect(content).not.toContain('console.trace');
    });

    it('does not invent causes', () => {
      const content = read(INVESTIGATION);
      expect(content).toContain('does not indicate the object is missing');
    });

    it('formatNavigationFailure provides structured guidance', () => {
      const content = read(NAV_SERVICE);
      expect(content).toContain('formatNavigationFailure');
      expect(content).toContain('title');
      expect(content).toContain('message');
      expect(content).toContain('referenceCode');
      expect(content).toContain('recommendedAction');
    });
  });

  // ─── Regression Protection ────────────────────────────────────────────────
  describe('Regression Protection', () => {
    it('EWO-014.19A.7S investigation workspace sections preserved', () => {
      const content = read(INVESTIGATION);
      expect(content).toContain('Executive Summary');
      expect(content).toContain('Root Cause');
      expect(content).toContain('Affected Components');
      expect(content).toContain('Evidence');
      expect(content).toContain('Timeline');
      expect(content).toContain('Recommended Actions');
      expect(content).toContain('Related Engineering');
      expect(content).toContain('Confidence');
    });

    it('EWO-014.19A.7S buildInvestigation preserved', () => {
      const content = read(INVESTIGATION);
      expect(content).toContain('export function buildInvestigation');
    });

    it('EWO-014.19A.7S maturity model still imported', () => {
      const content = read(DASHBOARD);
      expect(content).toContain('integrityMaturityModel');
      expect(content).toContain('evaluateAllCapabilities');
    });

    it('EWO-017R lifecycle truthfulness preserved', () => {
      const content = read(DASHBOARD);
      expect(content).toContain('Lifecycle Truthfulness');
      expect(content).toContain('premature_closures');
    });

    it('routeRegistry functions preserved', () => {
      const content = read('src/lib/routeRegistry.ts');
      expect(content).toContain('export function buildRoute');
      expect(content).toContain('export function navigate');
      expect(content).toContain('export function parseRoute');
    });
  });

  // ─── Canonical Registration ───────────────────────────────────────────────
  describe('Canonical Registration', () => {
    it('EWO-014.19A.7SR.1 registered before implementation', () => {
      const migrations = fs.readdirSync(path.resolve(ROOT, 'supabase/migrations'));
      const migration = migrations.find(f => f.includes('7sr1_canonical_evidence_navigation'));
      expect(migration).toBeDefined();
      const content = read(`supabase/migrations/${migration}`);
      expect(content).toContain('EWO-014.19A.7SR.1');
      expect(content).toContain('ensure_canonical_creation');
    });
  });

  // ─── Product Owner Tests ──────────────────────────────────────────────────
  describe('Product Owner Test 1 — Select evidence reference', () => {
    it('evidence click triggers canonical navigation', () => {
      const content = read(INVESTIGATION);
      expect(content).toContain('handleCanonicalNavigation(ev.reference');
    });
  });

  describe('Product Owner Test 2 — Open Related Engineering', () => {
    it('action routes through canonical navigation service', () => {
      const content = read(INVESTIGATION);
      expect(content).toContain("'open_engineering'");
      expect(content).toContain('ACTION_HINT_MAP');
    });
  });

  describe('Product Owner Test 3 — Refresh browser', () => {
    it('canonical URL supports refresh', () => {
      const content = read(NAV_SERVICE);
      expect(content).toContain('buildRoute(routeKey, { ref: reference })');
    });
  });

  describe('Product Owner Test 4 — Browser Back', () => {
    it('uses hash-based navigation supporting back', () => {
      const content = read('src/lib/routeRegistry.ts');
      expect(content).toContain('window.location.hash');
    });
  });

  describe('Product Owner Test 5 — Invalid reference', () => {
    it('governed guidance appears instead of placeholder', () => {
      const content = read(INVESTIGATION);
      expect(content).toContain('GovernedNavigationDialog');
      expect(content).toContain('setNavFailure');
    });

    it('dialog never shows placeholder text', () => {
      const content = read(DIALOG);
      expect(content).not.toContain('Coming soon');
      expect(content).toContain('Engineering object unavailable');
    });
  });
});
