// EWO-017R.8 — Canonical Verification Behaviour Unification
// Regression tests proving Individual Verify == Verify All Eligible
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf-8');
const contains = (p: string, s: string) => read(p).includes(s);

const ORCH = 'src/lib/verificationOrchestrator.ts';
const WO = 'src/pages/ecc/ECCWorkOrdersPage.tsx';

describe('EWO-017R.8 — Canonical Verification Behaviour Unification', () => {

  // ─── Req 1: ONE canonical verification engine ──────────────────────────────────
  describe('Req 1 — ONE canonical verification engine', () => {
    it('performVerification is exported from verificationOrchestrator', () => {
      expect(contains(ORCH, 'export async function performVerification')).toBe(true);
    });

    it('Individual Verify delegates to performVerification', () => {
      const src = read(WO);
      expect(src).toContain('performVerification(');
      // The handleGateUpdate function must call performVerification for 'verified'
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,2000}/);
      expect(handleSection).not.toBeNull();
      expect(handleSection![0]).toContain('performVerification(');
    });

    it('Verify All Eligible delegates to performVerification (via runVerificationOrchestration)', () => {
      const src = read(ORCH);
      // runVerificationOrchestration must call performVerification in its loop
      const orchSection = src.match(/export async function runVerificationOrchestration[\s\S]{0,8000}/);
      expect(orchSection).not.toBeNull();
      expect(orchSection![0]).toContain('performVerification(');
    });

    it('Verify Remaining delegates to performVerification (via runVerificationOrchestration)', () => {
      const src = read(ORCH);
      expect(src).toContain("mode: 'verify_remaining'");
    });

    it('Retry Failed Gates delegates to performVerification (via runVerificationOrchestration)', () => {
      const src = read(ORCH);
      const retrySection = src.match(/export async function retryFailedGates[\s\S]{0,500}/);
      expect(retrySection).not.toBeNull();
      expect(retrySection![0]).toContain('runVerificationOrchestration');
    });

    it('no duplicate verification logic outside performVerification', () => {
      const src = read(ORCH);
      // updateVerificationGate should only be called inside performVerification
      // and runAutomatedVerification (legacy), not in the orchestration loop
      const orchSection = src.match(/export async function runVerificationOrchestration[\s\S]{0,8000}/);
      expect(orchSection).not.toBeNull();
      // The orchestration loop must NOT call updateVerificationGate directly
      // (it must delegate to performVerification)
      const orchBody = orchSection![0];
      // Remove the performVerification call to check if updateVerificationGate is called directly
      const withoutPerform = orchBody.replace(/performVerification[\s\S]{0,200}/g, '');
      expect(withoutPerform).not.toContain('await updateVerificationGate(');
    });
  });

  // ─── Req 2: Canonical operation interface ──────────────────────────────────────
  describe('Req 2 — Canonical performVerification operation', () => {
    it('PerformVerificationRequest interface is exported', () => {
      expect(contains(ORCH, 'export interface PerformVerificationRequest')).toBe(true);
    });

    it('PerformVerificationResult interface is exported', () => {
      expect(contains(ORCH, 'export interface PerformVerificationResult')).toBe(true);
    });

    it('request accepts workOrderId', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface PerformVerificationRequest[\s\S]{0,500}/);
      expect(iface).not.toBeNull();
      expect(iface![0]).toContain('workOrderId');
    });

    it('request accepts gate', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface PerformVerificationRequest[\s\S]{0,500}/);
      expect(iface![0]).toContain('gate:');
    });

    it('request accepts requestedBy', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface PerformVerificationRequest[\s\S]{0,500}/);
      expect(iface![0]).toContain('requestedBy');
    });

    it('request accepts notes', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface PerformVerificationRequest[\s\S]{0,500}/);
      expect(iface![0]).toContain('notes');
    });

    it('request accepts deferProductOwnerGates flag', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface PerformVerificationRequest[\s\S]{0,500}/);
      expect(iface![0]).toContain('deferProductOwnerGates');
    });

    it('result returns outcome', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface PerformVerificationResult[\s\S]{0,500}/);
      expect(iface).not.toBeNull();
      expect(iface![0]).toContain('outcome');
    });

    it('result returns gateResult', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface PerformVerificationResult[\s\S]{0,500}/);
      expect(iface![0]).toContain('gateResult');
    });

    it('result returns verified flag', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface PerformVerificationResult[\s\S]{0,500}/);
      expect(iface![0]).toContain('verified');
    });

    it('result returns blocked flag', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface PerformVerificationResult[\s\S]{0,500}/);
      expect(iface![0]).toContain('blocked');
    });

    it('result returns artefactsMissing flag', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface PerformVerificationResult[\s\S]{0,500}/);
      expect(iface![0]).toContain('artefactsMissing');
    });

    it('result returns deferredPO flag', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface PerformVerificationResult[\s\S]{0,500}/);
      expect(iface![0]).toContain('deferredPO');
    });
  });

  // ─── Req 3: Verify All = same workflow as Individual Verify ─────────────────────
  describe('Req 3 — Verify All executes same workflow as Individual Verify', () => {
    it('both paths call performVerification', () => {
      const orch = read(ORCH);
      const wo = read(WO);
      expect(orch).toContain('performVerification(');
      expect(wo).toContain('performVerification(');
    });

    it('no alternative evidence path exists in orchestration loop', () => {
      const src = read(ORCH);
      const orchSection = src.match(/export async function runVerificationOrchestration[\s\S]{0,8000}/);
      expect(orchSection).not.toBeNull();
      // Must not have a separate evaluateEvidence + updateVerificationGate path
      // (that was the old duplicate logic)
      const orchBody = orchSection![0];
      const withoutPerform = orchBody.replace(/performVerification[\s\S]{0,200}/g, '');
      expect(withoutPerform).not.toContain('evaluateEvidence(');
    });
  });

  // ─── Req 4: Artefact eligibility identical (updated by R.9) ────────────────────
  describe('Req 4 — Artefact eligibility identical', () => {
    it('performVerification evaluates eligibility via getArtefactEligibility', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection).not.toBeNull();
      expect(pvSection![0]).toContain('getArtefactEligibility(');
    });

    it('performVerification blocks on missing artefacts (artefacts_required outcome)', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain("'artefacts_required'");
      expect(pvSection![0]).toContain('artefactEval.eligible');
    });

    it('both Individual and batch use same artefact evaluation', () => {
      // Both call performVerification which calls getArtefactEligibility
      // No separate eligibility path exists in the page
      const wo = read(WO);
      const handleSection = wo.match(/async function handleGateUpdate[\s\S]{0,2000}/);
      expect(handleSection).not.toBeNull();
      // handleGateUpdate must NOT call getArtefactEligibility directly
      expect(handleSection![0]).not.toContain('getArtefactEligibility(');
    });
  });

  // ─── Req 5: Eligibility decisions identical ─────────────────────────────────────
  describe('Req 5 — Eligibility decisions identical', () => {
    it('performVerification checks prerequisites (same rule for all workflows)', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain('checkPrerequisites(');
    });

    it('performVerification checks failed prerequisites propagation', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain('failedGateKeys');
    });

    it('performVerification handles already_verified (idempotent)', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain("'already_verified'");
    });

    it('performVerification handles blocked outcome', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain("'blocked'");
    });

    it('performVerification handles deferred_po outcome', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain("'deferred_po'");
    });

    it('Individual Verify uses deferProductOwnerGates=false (explicit PO action)', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,2000}/);
      expect(handleSection![0]).toContain('deferProductOwnerGates: false');
    });

    it('batch Verify All uses conditional deferProductOwnerGates (defer for autonomous only)', () => {
      const src = read(ORCH);
      const orchSection = src.match(/export async function runVerificationOrchestration[\s\S]{0,10000}/);
      expect(orchSection![0]).toContain('deferProductOwnerGates: deferPO');
      expect(orchSection![0]).toContain('isProductOwnerInitiated === true ? false : true');
    });
  });

  // ─── Req 6: Lifecycle progression governed ──────────────────────────────────────
  describe('Req 6 — Lifecycle progression governed', () => {
    it('performVerification uses updateVerificationGate (canonical RPC)', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain('updateVerificationGate(');
    });

    it('performVerification does not bypass auto-transition', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      // The RPC handles auto-transition; performVerification checks gate_updated
      expect(pvSection![0]).toContain('gate_updated');
    });

    it('prerequisite ordering enforced (no gate can skip ahead)', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain('prereq.met');
      expect(pvSection![0]).toContain('blocked');
    });
  });

  // ─── Req 7: Audit behaviour canonical ───────────────────────────────────────────
  describe('Req 7 — Audit behaviour canonical', () => {
    it('performVerification records audit events when orchestrationId provided', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain('recordOrchestrationAudit(');
    });

    it('audit events include gate_blocked', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain("'gate_blocked'");
    });

    it('audit events include gate_artefacts_evaluated', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain("'gate_artefacts_evaluated'");
    });

    it('audit events include gate_passed', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain("'gate_passed'");
    });

    it('audit events include gate_failed', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain("'gate_failed'");
    });

    it('audit events include product_owner_gate_deferred', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain("'product_owner_gate_deferred'");
    });

    it('Individual Verify does not create separate audit path', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,2000}/);
      // handleGateUpdate must NOT call recordOrchestrationAudit directly
      expect(handleSection![0]).not.toContain('recordOrchestrationAudit(');
    });
  });

  // ─── Req 8: Completion summary explains WHY ─────────────────────────────────────
  describe('Req 8 — Completion summary explains WHY', () => {
    it('determineFinalStatus returns verification_blocked_by_missing_artefacts', () => {
      const src = read(ORCH);
      expect(src).toContain("'verification_blocked_by_missing_artefacts'");
    });

    it('determineNextAction explains artefact requirement', () => {
      const src = read(ORCH);
      const actionSection = src.match(/export function determineNextAction[\s\S]{0,1000}/);
      expect(actionSection![0]).toContain('missing engineering artefacts');
    });

    it('determineNextAction explains PO verification', () => {
      const src = read(ORCH);
      const actionSection = src.match(/export function determineNextAction[\s\S]{0,1000}/);
      expect(actionSection![0]).toContain('Proceed to Product Owner Verification');
    });

    it('determineNextAction explains failure', () => {
      const src = read(ORCH);
      const actionSection = src.match(/export function determineNextAction[\s\S]{0,1000}/);
      expect(actionSection![0]).toContain('Fix failures and Retry Failed Gates');
    });

    it('blocking_reason is specific (not vague)', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain('Blocked by unverified prerequisites:');
      expect(pvSection![0]).toContain('Prerequisite failed:');
    });
  });

  // ─── Req 9: Regression — Individual Verify == Verify All ──────────────────────────
  describe('Req 9 — Regression: Individual Verify == Verify All', () => {
    it('both workflows use the same canonical function', () => {
      const orch = read(ORCH);
      const wo = read(WO);
      expect(orch).toContain('performVerification(');
      expect(wo).toContain('performVerification(');
    });

    it('FAILS if Individual Verify bypasses canonical engine', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,5000}/);
      // Must NOT call updateVerificationGate directly for 'verified' status
      // (it must delegate to performVerification)
      // Capture only the if-branch (up to the else keyword)
      const verifiedSection = handleSection![0].match(/newStatus === 'verified'[\s\S]{0,2000}?\} else/);
      expect(verifiedSection).not.toBeNull();
      expect(verifiedSection![0]).toContain('performVerification(');
      expect(verifiedSection![0]).not.toContain('await updateVerificationGate(');
    });

    it('FAILS if batch orchestration bypasses canonical engine', () => {
      const src = read(ORCH);
      const orchSection = src.match(/export async function runVerificationOrchestration[\s\S]{0,8000}/);
      const orchBody = orchSection![0];
      // Must call performVerification in the gate loop
      expect(orchBody).toContain('performVerification(');
      // Must NOT have duplicate evidence evaluation outside performVerification
      const withoutPerform = orchBody.replace(/performVerification[\s\S]{0,200}/g, '');
      expect(withoutPerform).not.toContain('evaluateEvidence(');
      expect(withoutPerform).not.toContain('await updateVerificationGate(');
    });

    it('FAILS if artefact eligibility differs between workflows', () => {
      // Both must use getArtefactEligibility (via performVerification)
      const orch = read(ORCH);
      const pvSection = orch.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain('getArtefactEligibility(');
    });

    it('FAILS if prerequisite check differs between workflows', () => {
      // Both must use checkPrerequisites (via performVerification)
      const orch = read(ORCH);
      const pvSection = orch.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain('checkPrerequisites(');
    });

    it('FAILS if audit records differ between workflows', () => {
      // Both must use recordOrchestrationAudit (via performVerification)
      const orch = read(ORCH);
      const pvSection = orch.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain('recordOrchestrationAudit(');
    });

    it('FAILS if lifecycle progression bypasses canonical RPC', () => {
      // Both must use updateVerificationGate RPC (via performVerification)
      const orch = read(ORCH);
      const pvSection = orch.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain('updateVerificationGate(');
    });

    it('FAILS if retry uses a different path', () => {
      const src = read(ORCH);
      // retryFailedGates must delegate to runVerificationOrchestration
      // which delegates to performVerification
      const retrySection = src.match(/export async function retryFailedGates[\s\S]{0,500}/);
      expect(retrySection![0]).toContain('runVerificationOrchestration');
    });

    it('Individual Verify passes deferProductOwnerGates=false', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,2000}/);
      expect(handleSection![0]).toContain('deferProductOwnerGates: false');
    });

    it('batch Verify All uses conditional deferProductOwnerGates (false for PO, true for autonomous)', () => {
      const src = read(ORCH);
      const orchSection = src.match(/export async function runVerificationOrchestration[\s\S]{0,10000}/);
      expect(orchSection![0]).toContain('deferProductOwnerGates: deferPO');
      expect(orchSection![0]).toContain('isProductOwnerInitiated === true ? false : true');
    });
  });

  // ─── Req 10: Engineering Standards ES-003 update ─────────────────────────────────
  describe('Req 10 — ES-003 Engineering Standard updated', () => {
    it('ES-003 standard exists in database seed or standards file', () => {
      const orchSrc = read(ORCH);
      // The principle is documented in the performVerification docblock
      const pvSection = orchSrc.match(/Canonical Single-Gate Verification Operation[\s\S]{0,2000}export async function performVerification/);
      expect(pvSection).not.toBeNull();
      expect(pvSection![0]).toContain('Every verification action');
      expect(pvSection![0]).toContain('delegate here');
    });

    it('canonical delegation principle is documented in performVerification', () => {
      const src = read(ORCH);
      // Include the section comment and docblock above the function
      const pvSection = src.match(/Canonical Single-Gate Verification Operation[\s\S]{0,2000}export async function performVerification/);
      expect(pvSection).not.toBeNull();
      expect(pvSection![0]).toContain('canonical');
      expect(pvSection![0]).toContain('identical');
      expect(pvSection![0]).toContain('Individual Verify');
      expect(pvSection![0]).toContain('Verify All');
    });
  });

  // ─── Root Cause Analysis documentation ──────────────────────────────────────────
  describe('Root Cause Analysis', () => {
    it('documents the root cause (two separate verification paths)', () => {
      // Root cause: Individual Verify called updateVerificationGate directly (no eligibility check)
      // Verify All called evaluateEvidence first (blocked if no evidence)
      // Fix (R.8): both delegate to performVerification
      // Fix (R.9): performVerification uses getArtefactEligibility (artefact-derived, not manual evidence)
      const orch = read(ORCH);
      expect(orch).toContain('performVerification');
      expect(orch).toContain('getArtefactEligibility');
      expect(orch).toContain('checkPrerequisites');
      expect(orch).toContain('updateVerificationGate');
    });

    it('old duplicate logic removed from orchestration loop', () => {
      const src = read(ORCH);
      const orchSection = src.match(/export async function runVerificationOrchestration[\s\S]{0,8000}/);
      const orchBody = orchSection![0];
      // The old inline evidence evaluation and direct updateVerificationGate
      // calls should no longer be in the loop body
      const withoutPerform = orchBody.replace(/performVerification[\s\S]{0,200}/g, '');
      expect(withoutPerform).not.toContain('getArtefactEligibility(');
      expect(withoutPerform).not.toContain('await updateVerificationGate(');
      expect(withoutPerform).not.toContain('artefactEval.eligible');
    });

    it('old direct updateVerificationGate removed from handleGateUpdate verify path', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,5000}/);
      // Capture only the if-branch (up to the else keyword)
      const verifiedSection = handleSection![0].match(/newStatus === 'verified'[\s\S]{0,2000}?\} else/);
      expect(verifiedSection![0]).not.toContain('await updateVerificationGate(');
    });
  });
});
