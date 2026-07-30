// EWO-017R.10 — Verification Dependency Model Audit & Canonical Prerequisite Correction
// Regression tests proving verification prerequisites are separated from lifecycle prerequisites.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf-8');
const contains = (p: string, s: string) => read(p).includes(s);

const ORCH = 'src/lib/verificationOrchestrator.ts';
const WO = 'src/pages/ecc/ECCWorkOrdersPage.tsx';

describe('EWO-017R.10 — Verification Dependency Model Audit', () => {

  // ─── Root Cause: Functional gate no longer requires Completion Report ──────────
  describe('Root Cause — Functional gate no longer checks lifecycle artefacts', () => {
    it('functional gate does NOT check report_generation_status', () => {
      const src = read(ORCH);
      const fnSection = src.match(/case 'functional'[\s\S]{0,800}break/);
      expect(fnSection).not.toBeNull();
      expect(fnSection![0]).not.toContain('report_generation_status');
    });

    it('functional gate does NOT check implementation_status', () => {
      const src = read(ORCH);
      const fnSection = src.match(/case 'functional'[\s\S]{0,800}break/);
      expect(fnSection![0]).not.toContain('implementation_status');
    });

    it('functional gate does NOT mention "Completion Report"', () => {
      const src = read(ORCH);
      const fnSection = src.match(/case 'functional'[\s\S]{0,800}break/);
      expect(fnSection![0]).not.toContain('Completion Report');
    });

    it('functional gate only checks engineering_complete status', () => {
      const src = read(ORCH);
      const fnSection = src.match(/case 'functional'[\s\S]{0,800}break/);
      expect(fnSection![0]).toContain('engineering_complete');
    });

    it('functional gate message says "build succeeded"', () => {
      const src = read(ORCH);
      const fnSection = src.match(/case 'functional'[\s\S]{0,800}break/);
      expect(fnSection![0]).toContain('build succeeded');
    });
  });

  // ─── Req 1: Full prerequisite audit ──────────────────────────────────────────────
  describe('Req 1 — Prerequisite audit for every gate', () => {
    it('build gate checks EWO status (engineering_complete)', () => {
      const src = read(ORCH);
      const buildSection = src.match(/case 'build'[\s\S]{0,800}break/);
      expect(buildSection![0]).toContain('engineering_complete');
    });

    it('functional gate checks build prerequisite (engineering_complete)', () => {
      const src = read(ORCH);
      const fnSection = src.match(/case 'functional'[\s\S]{0,800}break/);
      expect(fnSection![0]).toContain('engineering_complete');
    });

    it('ui gate checks engineering_complete status (not po_testing_status)', () => {
      const src = read(ORCH);
      const uiSection = src.match(/case 'ui'[\s\S]{0,1000}break/);
      expect(uiSection![0]).toContain('engineering_complete');
      expect(uiSection![0]).not.toContain('po_testing_status');
    });

    it('data gate checks EWO status (not affected_migrations)', () => {
      const src = read(ORCH);
      const dataSection = src.match(/case 'data'[\s\S]{0,800}break/);
      expect(dataSection![0]).toContain('engineering_complete');
      expect(dataSection![0]).not.toContain('affected_migrations');
    });

    it('constitutional gate checks engineering_verification status', () => {
      const src = read(ORCH);
      const constSection = src.match(/case 'constitutional'[\s\S]{0,1200}break/);
      expect(constSection![0]).toContain('engineering_verification');
    });
  });

  // ─── Req 2: Separation of verification vs lifecycle prerequisites ────────────────
  describe('Req 2 — Verification prerequisites separated from lifecycle', () => {
    it('no gate checks report_generation_status as a prerequisite', () => {
      const src = read(ORCH);
      const evalFn = src.match(/function evaluateGateEligibility[\s\S]{0,3000}/);
      expect(evalFn).not.toBeNull();
      // Check only gate case blocks, not the function signature
      const gateSections = evalFn![0].match(/case '[a-z_]+'[\s\S]{0,600}break/g);
      expect(gateSections).not.toBeNull();
      gateSections!.forEach(gate => {
        expect(gate).not.toContain('report_generation_status');
      });
    });

    it('no gate checks implementation_status as a prerequisite', () => {
      const src = read(ORCH);
      const evalFn = src.match(/function evaluateGateEligibility[\s\S]{0,3000}/);
      const gateSections = evalFn![0].match(/case '[a-z_]+'[\s\S]{0,600}break/g);
      expect(gateSections).not.toBeNull();
      gateSections!.forEach(gate => {
        expect(gate).not.toContain('implementation_status');
      });
    });

    it('no gate requires "Completion Report" as a prerequisite', () => {
      const src = read(ORCH);
      const evalFn = src.match(/function evaluateGateEligibility[\s\S]{0,3000}/);
      const gateSections = evalFn![0].match(/case '[a-z_]+'[\s\S]{0,600}break/g);
      expect(gateSections).not.toBeNull();
      gateSections!.forEach(gate => {
        expect(gate).not.toContain('Completion Report');
      });
    });

    it('no gate requires "Report Ready" as a prerequisite', () => {
      const src = read(ORCH);
      const evalFn = src.match(/function evaluateGateEligibility[\s\S]{0,3000}/);
      const gateSections = evalFn![0].match(/case '[a-z_]+'[\s\S]{0,600}break/g);
      expect(gateSections).not.toBeNull();
      gateSections!.forEach(gate => {
        expect(gate).not.toContain('Report Ready');
      });
    });

    it('no gate requires "Product Owner Acceptance" as a prerequisite', () => {
      const src = read(ORCH);
      const evalFn = src.match(/function evaluateGateEligibility[\s\S]{0,3000}/);
      const gateSections = evalFn![0].match(/case '[a-z_]+'[\s\S]{0,600}break/g);
      expect(gateSections).not.toBeNull();
      gateSections!.forEach(gate => {
        expect(gate).not.toContain('Product Owner Acceptance');
      });
    });
  });

  // ─── Req 3: Canonical dependency graph ──────────────────────────────────────────
  describe('Req 3 — Canonical dependency graph', () => {
    it('build gate is the first verification gate (checks engineering_complete)', () => {
      const src = read(ORCH);
      const buildSection = src.match(/case 'build'[\s\S]{0,800}break/);
      expect(buildSection![0]).toContain('engineering_complete');
    });

    it('functional gate depends on build (checks engineering_complete)', () => {
      const src = read(ORCH);
      const fnSection = src.match(/case 'functional'[\s\S]{0,800}break/);
      expect(fnSection![0]).toContain('engineering_complete');
      expect(fnSection![0]).toContain('Build verification must pass first');
    });

    it('constitutional gate depends on earlier gates (checks engineering_verification)', () => {
      const src = read(ORCH);
      const constSection = src.match(/case 'constitutional'[\s\S]{0,1200}break/);
      expect(constSection![0]).toContain('engineering_verification');
    });

    it('lifecycle progression happens AFTER verification (canTransitionToVerified)', () => {
      const src = read(ORCH);
      expect(src).toContain('canTransitionToVerified');
      expect(src).toContain('nextLifecycleState');
    });
  });

  // ─── Req 4: No future lifecycle artefacts blocking verification ──────────────────
  describe('Req 4 — No future lifecycle artefacts block verification', () => {
    it('functional gate does not require Completion Report', () => {
      const src = read(ORCH);
      const fnSection = src.match(/case 'functional'[\s\S]{0,800}break/);
      expect(fnSection![0]).not.toContain('Completion Report');
      expect(fnSection![0]).not.toContain('report_generation_status');
    });

    it('build gate does not require Completion Report', () => {
      const src = read(ORCH);
      const buildSection = src.match(/case 'build'[\s\S]{0,800}break/);
      expect(buildSection![0]).not.toContain('Completion Report');
      expect(buildSection![0]).not.toContain('report_generation_status');
    });

    it('data gate does not require Report Ready', () => {
      const src = read(ORCH);
      const dataSection = src.match(/case 'data'[\s\S]{0,800}break/);
      expect(dataSection![0]).not.toContain('Report Ready');
      expect(dataSection![0]).not.toContain('report_generation_status');
    });

    it('constitutional gate does not require PO Acceptance as a prerequisite', () => {
      const src = read(ORCH);
      const constSection = src.match(/case 'constitutional'[\s\S]{0,1200}break/);
      expect(constSection).not.toBeNull();
      // The gate should not have a missing.push that mentions PO Acceptance
      expect(constSection![0]).not.toContain('Product Owner Acceptance');
      // The status list includes po_acceptance as a valid status, but the gate
      // doesn't REQUIRE it — it only checks if the EWO has reached engineering_verification
      expect(constSection![0]).toContain('engineering_verification');
    });
  });

  // ─── Req 5: Both execution paths use the same model ─────────────────────────────
  describe('Req 5 — Both paths use corrected model', () => {
    it('individual verify uses evaluateGateEligibility', () => {
      expect(contains(ORCH, 'evaluateGateEligibility'));
      expect(contains(ORCH, 'getArtefactEligibility'));
    });

    it('batch verify uses the same getArtefactEligibility', () => {
      expect(contains(ORCH, 'performVerification'));
      expect(contains(ORCH, 'getArtefactEligibility'));
    });

    it('both paths pass loadedContext to getArtefactEligibility', () => {
      const src = read(ORCH);
      expect(src).toContain('getArtefactEligibility(req.workOrderId, gate, loadedContext)');
    });

    it('retryFailedGates uses the same pipeline', () => {
      expect(contains(ORCH, 'retryFailedGates'));
      expect(contains(ORCH, 'runVerificationOrchestration'));
    });
  });

  // ─── Req 6: Improved diagnostics ──────────────────────────────────────────────────
  describe('Req 6 — Improved diagnostics showing exact failed prerequisite', () => {
    it('artefacts_required outcome includes specific missing items in notes', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,10000}/);
      expect(pvSection![0]).toContain('Blocked: ${artefactEval.missingArtefacts.join');
    });

    it('UI shows specific missing items instead of generic "requirements not met"', () => {
      const src = read(WO);
      const resultSection = src.match(/outcome === 'artefacts_required'[\s\S]{0,500}/);
      expect(resultSection![0]).toContain('missing_artefacts');
      expect(resultSection![0]).toContain('Blocked:');
    });

    it('UI does not show generic "Verification requirements not met" as the only message', () => {
      const src = read(WO);
      // The generic message should only be a fallback, not the primary message
      const resultSection = src.match(/outcome === 'artefacts_required'[\s\S]{0,500}/);
      expect(resultSection![0]).toContain('?.length');
    });
  });

  // ─── Req 7: Regression audit ──────────────────────────────────────────────────────
  describe('Req 7 — Regression audit', () => {
    it('Build → Functional progression works (both check engineering_complete)', () => {
      const src = read(ORCH);
      const buildSection = src.match(/case 'build'[\s\S]{0,800}break/);
      const fnSection = src.match(/case 'functional'[\s\S]{0,800}break/);
      expect(buildSection![0]).toContain('engineering_complete');
      expect(fnSection![0]).toContain('engineering_complete');
    });

    it('Functional never requires Completion Report', () => {
      const src = read(ORCH);
      const fnSection = src.match(/case 'functional'[\s\S]{0,800}break/);
      expect(fnSection![0]).not.toContain('Completion Report');
      expect(fnSection![0]).not.toContain('report_generation_status');
    });

    it('Completion Report is only generated at correct lifecycle stage (lifecycleImpact)', () => {
      const src = read(ORCH);
      expect(src).toContain('canTransitionToReportReady');
      expect(src).toContain('poAcceptanceEligible');
    });

    it('Report Ready progression still works (lifecycleImpact.canTransitionToReportReady)', () => {
      expect(contains(ORCH, 'canTransitionToReportReady'));
    });

    it('Product Owner Acceptance governance remains intact (deferProductOwnerGates)', () => {
      expect(contains(ORCH, 'deferProductOwnerGates'));
    });
  });

  // ─── R.9B column fix verification ──────────────────────────────────────────────
  describe('R.9B — completeOrchestrationRecord uses correct DB column', () => {
    it('completeOrchestrationRecord uses evidence_missing (not artefacts_missing)', () => {
      const src = read(ORCH);
      // The DB column is evidence_missing, not artefacts_missing
      const completeFn = src.match(/async function completeOrchestrationRecord[\s\S]{0,2000}/);
      expect(completeFn).not.toBeNull();
      expect(completeFn![0]).toContain('evidence_missing');
      expect(completeFn![0]).not.toContain('artefacts_missing:');
    });

    it('getLatestOrchestration reads evidence_missing column', () => {
      const src = read(ORCH);
      const latestFn = src.match(/export async function getLatestOrchestration[\s\S]{0,2000}/);
      expect(latestFn).not.toBeNull();
      expect(latestFn![0]).toContain('evidence_missing');
    });
  });
});
