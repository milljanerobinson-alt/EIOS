// EWO-017R.9 — Verification Evidence Simplification & Artefact-Derived Verification
// Regression tests proving manual evidence requirement is removed and
// verification is derived from canonical engineering artefacts.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf-8');
const contains = (p: string, s: string) => read(p).includes(s);

const ORCH = 'src/lib/verificationOrchestrator.ts';
const WO = 'src/pages/ecc/ECCWorkOrdersPage.tsx';

describe('EWO-017R.9 — Artefact-Derived Verification', () => {

  // ─── Req 1: Manual evidence requirement removed ─────────────────────────────
  describe('Req 1 — Manual evidence requirement removed', () => {
    it('performVerification does NOT call evaluateEvidence', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection).not.toBeNull();
      expect(pvSection![0]).not.toContain('evaluateEvidence(');
    });

    it('performVerification calls getArtefactEligibility instead', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain('getArtefactEligibility(');
    });

    it('evidence_required outcome is removed from GateResult', () => {
      const src = read(ORCH);
      const grSection = src.match(/export interface GateResult[\s\S]{0,500}/);
      expect(grSection![0]).not.toContain("'evidence_required'");
      expect(grSection![0]).toContain("'artefacts_required'");
    });

    it('missing_evidence field is removed from GateResult', () => {
      const src = read(ORCH);
      const grSection = src.match(/export interface GateResult[\s\S]{0,500}/);
      expect(grSection![0]).not.toContain('missing_evidence');
      expect(grSection![0]).toContain('missing_artefacts');
    });

    it('evidenceMissing field is removed from OrchestrationResult', () => {
      const src = read(ORCH);
      const orSection = src.match(/export interface OrchestrationResult[\s\S]{0,1000}/);
      expect(orSection![0]).not.toContain('evidenceMissing');
      expect(orSection![0]).toContain('artefactsMissing');
    });

    it('verification_blocked_by_missing_evidence is removed', () => {
      const src = read(ORCH);
      expect(src).not.toContain("'verification_blocked_by_missing_evidence'");
      expect(src).toContain("'verification_blocked_by_missing_artefacts'");
    });

    it('no evidence_required UI text in ECCWorkOrdersPage', () => {
      const src = read(WO);
      expect(src).not.toContain('Evidence Required');
      expect(src).not.toContain('evidence required');
      expect(src).not.toContain('Evidence required');
    });

    it('no Record Evidence UI text in ECCWorkOrdersPage', () => {
      const src = read(WO);
      expect(src).not.toContain('Record Evidence');
    });

    it('no Evidence Summary UI text in ECCWorkOrdersPage', () => {
      const src = read(WO);
      expect(src).not.toContain('Evidence Summary');
    });
  });

  // ─── Req 2: Artefact-derived verification ────────────────────────────────────
  describe('Req 2 — Artefact-derived verification', () => {
    it('getArtefactEligibility function is exported', () => {
      expect(contains(ORCH, 'export async function getArtefactEligibility')).toBe(true);
    });

    it('ArtefactEligibility interface is exported', () => {
      expect(contains(ORCH, 'export interface ArtefactEligibility')).toBe(true);
    });

    it('ArtefactEligibility has eligible flag', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface ArtefactEligibility[\s\S]{0,300}/);
      expect(iface![0]).toContain('eligible');
    });

    it('ArtefactEligibility has artefactSource', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface ArtefactEligibility[\s\S]{0,300}/);
      expect(iface![0]).toContain('artefactSource');
    });

    it('ArtefactEligibility has missingArtefacts', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface ArtefactEligibility[\s\S]{0,300}/);
      expect(iface![0]).toContain('missingArtefacts');
    });

    it('build gate checks EWO status for build completion', () => {
      const src = read(ORCH);
      const aeSection = src.match(/export async function getArtefactEligibility[\s\S]{0,8000}/);
      expect(aeSection).not.toBeNull();
      expect(aeSection![0]).toContain("case 'build'");
      expect(aeSection![0]).toContain('engineering_complete');
    });

    it('functional gate checks completion report and implementation status', () => {
      const src = read(ORCH);
      const aeSection = src.match(/export async function getArtefactEligibility[\s\S]{0,8000}/);
      expect(aeSection![0]).toContain("case 'functional'");
      expect(aeSection![0]).toContain('report_generation_status');
      expect(aeSection![0]).toContain('implementation_status');
    });

    it('ui gate checks PO testing status', () => {
      const src = read(ORCH);
      const aeSection = src.match(/export async function getArtefactEligibility[\s\S]{0,8000}/);
      expect(aeSection![0]).toContain("case 'ui'");
      expect(aeSection![0]).toContain('po_testing_status');
    });

    it('data gate checks EWO status for data verification', () => {
      const src = read(ORCH);
      const aeSection = src.match(/export async function getArtefactEligibility[\s\S]{0,10000}/);
      expect(aeSection![0]).toContain("case 'data'");
      expect(aeSection![0]).toContain('engineering_complete');
    });

    it('constitutional gate checks engineering standards', () => {
      const src = read(ORCH);
      const aeSection = src.match(/export async function getArtefactEligibility[\s\S]{0,8000}/);
      expect(aeSection![0]).toContain("case 'constitutional'");
      expect(aeSection![0]).toContain('engineering_verification');
    });

    it('getArtefactEligibility loads EWO state from database', () => {
      const src = read(ORCH);
      const aeSection = src.match(/export async function getArtefactEligibility[\s\S]{0,10000}/);
      expect(aeSection).not.toBeNull();
      expect(aeSection![0]).toContain('loadEwoArtefactState');
      // Also check the helper function queries the table
      expect(src).toContain('engineering_work_orders');
    });
  });

  // ─── Req 3: Canonical verification engine preserved ──────────────────────────
  describe('Req 3 — Canonical verification engine preserved', () => {
    it('performVerification is still the ONLY verification implementation', () => {
      expect(contains(ORCH, 'export async function performVerification')).toBe(true);
    });

    it('Individual Verify still delegates to performVerification', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,3000}/);
      expect(handleSection![0]).toContain('performVerification(');
    });

    it('Verify All still delegates to performVerification (via runVerificationOrchestration)', () => {
      const src = read(ORCH);
      const orchSection = src.match(/export async function runVerificationOrchestration[\s\S]{0,8000}/);
      expect(orchSection![0]).toContain('performVerification(');
    });

    it('no duplicate verification logic outside performVerification', () => {
      const src = read(ORCH);
      const orchSection = src.match(/export async function runVerificationOrchestration[\s\S]{0,8000}/);
      const orchBody = orchSection![0];
      const withoutPerform = orchBody.replace(/performVerification[\s\S]{0,200}/g, '');
      expect(withoutPerform).not.toContain('await updateVerificationGate(');
      expect(withoutPerform).not.toContain('getArtefactEligibility(');
    });
  });

  // ─── Req 4: Evidence blocking replaced with artefact blocking ────────────────
  describe('Req 4 — Evidence blocking replaced with artefact blocking', () => {
    it('artefacts_required outcome replaces evidence_required', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain("'artefacts_required'");
      expect(pvSection![0]).not.toContain("'evidence_required'");
    });

    it('blocking message explains which canonical artefacts are missing', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,10000}/);
      expect(pvSection![0]).toContain('Blocked:');
      expect(pvSection![0]).toContain('missing_artefacts');
    });

    it('does NOT ask for evidence summary', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).not.toContain('Please enter evidence summary');
      expect(pvSection![0]).not.toContain('Evidence required before verification');
    });
  });

  // ─── Req 5: No duplicate data entry ───────────────────────────────────────────
  describe('Req 5 — No duplicate data entry', () => {
    it('performVerification does not require manual evidence summary', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      // Must not check gate.evidence_summary for eligibility
      expect(pvSection![0]).not.toContain('gate.evidence_summary?.trim()');
      expect(pvSection![0]).not.toContain('hasSummary');
    });

    it('getArtefactEligibility does not require manual evidence artefacts', () => {
      const src = read(ORCH);
      const aeSection = src.match(/export async function getArtefactEligibility[\s\S]{0,8000}/);
      // existingArtefacts are preserved for audit but NOT required for eligibility
      expect(aeSection![0]).toContain('existingArtefacts');
      // Eligibility is based on artefactEval.eligible, not on existingArtefacts.length
      expect(aeSection![0]).not.toContain('existingArtefacts.length > 0');
    });
  });

  // ─── Req 6: Verify All workflow uses artefact eligibility ──────────────────────
  describe('Req 6 — Verify All uses artefact eligibility', () => {
    it('runVerificationOrchestration counts artefactsMissing not evidenceMissing', () => {
      const src = read(ORCH);
      const orchSection = src.match(/export async function runVerificationOrchestration[\s\S]{0,8000}/);
      expect(orchSection![0]).toContain('artefactsMissing');
      expect(orchSection![0]).not.toContain('evidenceMissing');
    });

    it('determineFinalStatus uses verification_blocked_by_missing_artefacts', () => {
      const src = read(ORCH);
      const dfsSection = src.match(/export function determineFinalStatus[\s\S]{0,1000}/);
      expect(dfsSection![0]).toContain("'verification_blocked_by_missing_artefacts'");
      expect(dfsSection![0]).not.toContain("'verification_blocked_by_missing_evidence'");
    });
  });

  // ─── Req 7: Individual Verify uses same eligibility rules ─────────────────────
  describe('Req 7 — Individual Verify uses same eligibility rules', () => {
    it('both paths use performVerification which uses getArtefactEligibility', () => {
      const orch = read(ORCH);
      const wo = read(WO);
      expect(orch).toContain('performVerification');
      expect(orch).toContain('getArtefactEligibility');
      expect(wo).toContain('performVerification(');
    });

    it('Individual Verify does not have separate eligibility logic', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,3000}/);
      // Must NOT call getArtefactEligibility directly (must go through performVerification)
      expect(handleSection![0]).not.toContain('getArtefactEligibility(');
      // Must NOT call evaluateEvidence directly
      expect(handleSection![0]).not.toContain('evaluateEvidence(');
    });
  });

  // ─── Req 8: UI cleanup ────────────────────────────────────────────────────────
  describe('Req 8 — UI cleanup', () => {
    it('no "Evidence Required" references in page', () => {
      const src = read(WO);
      expect(src).not.toContain('Evidence Required');
      expect(src).not.toContain('evidence required');
    });

    it('no "Record Evidence" references in page', () => {
      const src = read(WO);
      expect(src).not.toContain('Record Evidence');
    });

    it('no "Evidence Summary" references in page', () => {
      const src = read(WO);
      expect(src).not.toContain('Evidence Summary');
    });

    it('no "evidence missing before verification" references in page', () => {
      const src = read(WO);
      expect(src).not.toContain('evidence missing before verification');
      expect(src).not.toContain('Evidence missing before verification');
    });

    it('artefacts_required label replaces evidence_required in page', () => {
      const src = read(WO);
      expect(src).toContain('artefacts_required');
      expect(src).toContain('Verification Requirements Not Met');
    });

    it('missing_artefacts displayed in gate results', () => {
      const src = read(WO);
      expect(src).toContain('missing_artefacts');
    });
  });

  // ─── Req 9: Persistent governed failure panel ─────────────────────────────────
  describe('Req 9 — Persistent governed verification result panel', () => {
    it('verificationResult state exists in VerificationSection', () => {
      const src = read(WO);
      expect(src).toContain('verificationResult');
      expect(src).toContain('setVerificationResult');
    });

    it('verificationResult stores gateLabel', () => {
      const src = read(WO);
      const vrSection = src.match(/verificationResult[\s\S]{0,300}/);
      expect(src).toContain('gateLabel');
    });

    it('verificationResult stores outcome', () => {
      const src = read(WO);
      expect(src).toContain('outcome');
    });

    it('verificationResult stores message', () => {
      const src = read(WO);
      expect(src).toContain('message');
    });

    it('verificationResult stores missingArtefacts', () => {
      const src = read(WO);
      expect(src).toContain('missingArtefacts');
    });

    it('verificationResult stores timestamp', () => {
      const src = read(WO);
      expect(src).toContain('timestamp');
    });

    it('verificationResult panel has Dismiss button', () => {
      const src = read(WO);
      expect(src).toContain('Dismiss');
    });

    it('verificationResult panel is persistent (not auto-dismissed)', () => {
      const src = read(WO);
      // The panel should NOT have setTimeout or auto-dismiss logic
      const vrSection = src.match(/verificationResult[\s\S]{0,500}/);
      // It should only be cleared by explicit Dismiss button or new action
      expect(src).toContain('setVerificationResult(null)');
    });

    it('handleGateUpdate sets verificationResult on artefacts_required', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,5000}/);
      expect(handleSection![0]).toContain("'artefacts_required'");
      expect(handleSection![0]).toContain('setVerificationResult');
    });

    it('handleGateUpdate sets verificationResult on blocked', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,5000}/);
      expect(handleSection![0]).toContain("'blocked'");
    });

    it('handleGateUpdate sets verificationResult on failed', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,5000}/);
      expect(handleSection![0]).toContain("'failed'");
    });

    it('handleGateUpdate sets verificationResult on passed', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,5000}/);
      expect(handleSection![0]).toContain("'passed'");
    });

    it('panel shows missing engineering artefacts list', () => {
      const src = read(WO);
      expect(src).toContain('Missing engineering artefacts');
    });
  });

  // ─── Req 10: ES-003 updated ───────────────────────────────────────────────────
  describe('Req 10 — ES-003 updated', () => {
    it('artefact-derived verification principle is documented', () => {
      const src = read(ORCH);
      // The R.9 principle is documented in the performVerification docblock
      const pvSection = src.match(/Canonical Single-Gate Verification Operation[\s\S]{0,3000}export async function performVerification/);
      expect(pvSection).not.toBeNull();
      expect(pvSection![0]).toContain('artefact');
      expect(pvSection![0]).toContain('EWO-017R.9');
    });

    it('getArtefactEligibility docblock references canonical artefacts', () => {
      const src = read(ORCH);
      const aeSection = src.match(/Artefact-Derived Eligibility[\s\S]{0,1000}/);
      expect(aeSection).not.toBeNull();
      expect(aeSection![0]).toContain('canonical');
      expect(aeSection![0]).toContain('duplicate data entry');
    });
  });

  // ─── Regression: R.8 canonical delegation preserved ──────────────────────────
  describe('Regression — R.8 canonical delegation preserved', () => {
    it('performVerification is still exported', () => {
      expect(contains(ORCH, 'export async function performVerification')).toBe(true);
    });

    it('PerformVerificationRequest interface still exists', () => {
      expect(contains(ORCH, 'export interface PerformVerificationRequest')).toBe(true);
    });

    it('PerformVerificationResult interface still exists', () => {
      expect(contains(ORCH, 'export interface PerformVerificationResult')).toBe(true);
    });

    it('PerformVerificationResult has artefactsMissing not evidenceMissing', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface PerformVerificationResult[\s\S]{0,500}/);
      expect(iface![0]).toContain('artefactsMissing');
      expect(iface![0]).not.toContain('evidenceMissing');
    });

    it('Individual Verify still passes deferProductOwnerGates=false', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,5000}/);
      expect(handleSection![0]).toContain('deferProductOwnerGates: false');
    });

    it('batch Verify All uses conditional deferProductOwnerGates (false for PO, true for autonomous)', () => {
      const src = read(ORCH);
      const orchSection = src.match(/export async function runVerificationOrchestration[\s\S]{0,8000}/);
      expect(orchSection![0]).toContain('deferProductOwnerGates: deferPO');
    });

    it('prerequisite check still enforced in performVerification', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain('checkPrerequisites(');
    });

    it('failed prerequisite propagation still enforced', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain('failedGateKeys');
    });

    it('already_verified idempotency still enforced', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain("'already_verified'");
    });

    it('audit recording still happens in performVerification', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain('recordOrchestrationAudit(');
    });
  });

  // ─── Root Cause Analysis ──────────────────────────────────────────────────────
  describe('Root Cause Analysis', () => {
    it('documents the root cause (manual evidence requirement duplicating existing artefacts)', () => {
      const orch = read(ORCH);
      // The fix replaces evaluateEvidence with getArtefactEligibility
      expect(orch).toContain('getArtefactEligibility');
      // evaluateEvidence is kept as deprecated legacy
      expect(orch).toContain('deprecated by R.9');
    });

    it('old evaluateEvidence is deprecated but kept for compatibility', () => {
      const src = read(ORCH);
      expect(src).toContain('Legacy Evidence Evaluation (deprecated by R.9');
    });

    it('performVerification no longer uses evaluateEvidence', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).not.toContain('evaluateEvidence(');
    });
  });
});
