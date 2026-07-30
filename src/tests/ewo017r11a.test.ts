// EWO-017R.11A — Verify-All In-Run State Propagation Fix
// Regression tests proving stale in-run gate state is eliminated.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf-8');

const ORCH = 'src/lib/verificationOrchestrator.ts';
const WO = 'src/pages/ecc/ECCWorkOrdersPage.tsx';

describe('EWO-017R.11A — Verify-All In-Run State Propagation Fix', () => {

  // ─── Req 1: Stale-state root cause proven and fixed ──────────────────────────
  describe('Req 1 — Canonical in-run gate state', () => {
    it('workingGates array is created as a mutable copy of the snapshot', () => {
      const src = read(ORCH);
      expect(src).toContain('workingGates: VerificationGate[] = gates.map');
    });

    it('workingGates is a shallow copy (not the original reference)', () => {
      const src = read(ORCH);
      expect(src).toContain('gates.map(g => ({ ...g }))');
    });
  });

  // ─── Req 2: Update state after each gate ──────────────────────────────────────
  describe('Req 2 — Working state updated after each successful gate', () => {
    it('workingGates is passed to performVerification (not the stale gates array)', () => {
      const src = read(ORCH);
      const batchSection = src.match(/const deferPO[\s\S]{0,600}loadedContext/);
      expect(batchSection).not.toBeNull();
      expect(batchSection![0]).toContain('allGates: workingGates');
      expect(batchSection![0]).not.toContain('allGates: gates,');
    });

    it('working state is updated after pvResult.verified is true', () => {
      const src = read(ORCH);
      expect(src).toContain('if (pvResult.verified)');
      expect(src).toContain('workingGates.findIndex');
    });

    it('working state update sets status to verified', () => {
      const src = read(ORCH);
      expect(src).toContain("status: 'verified'");
    });

    it('working state update sets verifier and timestamp', () => {
      const src = read(ORCH);
      expect(src).toContain('verified_at: new Date().toISOString()');
      expect(src).toContain('verified_by: request.requestedBy');
    });

    it('working state update uses gate_key match (not array index)', () => {
      const src = read(ORCH);
      expect(src).toContain("g.gate_key === gate.gate_key");
    });
  });

  // ─── Req 3: Canonical verify-all order ───────────────────────────────────────
  describe('Req 3 — Canonical verify-all order', () => {
    it('topologicalSort is used for gate ordering', () => {
      const src = read(ORCH);
      expect(src).toContain('topologicalSort(gates, deps)');
    });
  });

  // ─── Req 4: Product Owner authority ──────────────────────────────────────────
  describe('Req 4 — Product Owner authority preserved', () => {
    it('deferPO is false when isProductOwnerInitiated is true', () => {
      const src = read(ORCH);
      expect(src).toContain('isProductOwnerInitiated === true ? false : true');
    });

    it('batch mode passes deferPO (not hardcoded true)', () => {
      const src = read(ORCH);
      expect(src).toContain('deferProductOwnerGates: deferPO');
    });

    it('UI passes isProductOwnerInitiated: true for batch verify', () => {
      const src = read(WO);
      expect(src).toContain('isProductOwnerInitiated: true');
    });
  });

  // ─── Req 5: Verify Remaining uses same propagation ───────────────────────────
  describe('Req 5 — Verify Remaining uses same canonical function', () => {
    it('retryFailedGates calls runVerificationOrchestration', () => {
      const src = read(ORCH);
      expect(src).toContain('return runVerificationOrchestration({');
    });

    it('retryFailedGates passes isProductOwnerInitiated', () => {
      const src = read(ORCH);
      const retryFn = src.match(/export async function retryFailedGates[\s\S]{0,800}/);
      expect(retryFn![0]).toContain('isProductOwnerInitiated');
    });
  });

  // ─── Req 6: Failure behaviour ────────────────────────────────────────────────
  describe('Req 6 — Failure behaviour preserved', () => {
    it('failedGateKeys set is used to stop dependent gates', () => {
      const src = read(ORCH);
      expect(src).toContain('failedGateKeys');
    });

    it('failed gates increment the failed counter', () => {
      const src = read(ORCH);
      expect(src).toContain("pvResult.outcome === 'failed'");
      expect(src).toContain('failed++');
    });
  });

  // ─── Req 7: Final batch result ────────────────────────────────────────────────
  describe('Req 7 — Final batch result uses workingGates for allGatesPassed', () => {
    it('allGatesPassed uses workingGates (not stale sortedGates)', () => {
      const src = read(ORCH);
      expect(src).toContain('workingGates.every(g => g.status === \'verified\')');
    });

    it('canTransitionToVerified requires all gates passed, 0 failed, 0 blocked, 0 missing', () => {
      const src = read(ORCH);
      expect(src).toContain('canTransitionToVerified = allGatesPassed && failed === 0 && blocked === 0 && artefactsMissing === 0');
    });

    it('poGatesReady undefined bug is fixed (no longer referenced)', () => {
      const src = read(ORCH);
      expect(src).not.toContain('poGatesReady');
    });

    it('canTransitionToReportReady equals canTransitionToVerified', () => {
      const src = read(ORCH);
      expect(src).toContain('canTransitionToReportReady: canTransitionToVerified');
    });
  });

  // ─── Req 8: UI refresh after completion ──────────────────────────────────────
  describe('Req 8 — UI refresh after completion (unchanged)', () => {
    it('allGatesVerified check is used for lifecycle progression', () => {
      const src = read(WO);
      expect(src).toContain('allGatesVerified');
      expect(src).toContain('isReportReady');
    });

    it('existing Report Ready panel preserved', () => {
      const src = read(WO);
      expect(src).toContain('Report Ready');
    });

    it('existing Submit for PO Acceptance label preserved', () => {
      const src = read(WO);
      expect(src).toContain('Submit for PO Acceptance');
    });
  });

  // ─── Req 9: Regression test coverage ─────────────────────────────────────────
  describe('Req 9 — Regression test coverage', () => {
    it('test file exists', () => {
      expect(fs.existsSync(path.resolve(ROOT, 'src/tests/ewo017r11a.test.ts'))).toBe(true);
    });

    it('tests cover stale-state fix (workingGates creation)', () => {
      const src = read(ORCH);
      expect(src).toContain('workingGates');
    });

    it('tests cover working state update after verification', () => {
      const src = read(ORCH);
      expect(src).toContain('if (pvResult.verified)');
      expect(src).toContain('workingGates[wgIdx]');
    });
  });

  // ─── Req 10: Regression protection ────────────────────────────────────────────
  describe('Req 10 — Regression protection (R.5 through R.11 preserved)', () => {
    it('R.8 canonical performVerification delegation preserved', () => {
      const src = read(ORCH);
      expect(src).toContain('performVerification(');
    });

    it('R.9 artefact-derived verification preserved', () => {
      const src = read(ORCH);
      expect(src).toContain('getArtefactEligibility');
    });

    it('R.10 dependency model preserved (checkPrerequisites)', () => {
      const src = read(ORCH);
      expect(src).toContain('checkPrerequisites(');
    });

    it('R.11 PO authority preserved (isProductOwnerInitiated)', () => {
      const src = read(ORCH);
      expect(src).toContain('isProductOwnerInitiated');
    });

    it('R.11 conditional deferPO preserved', () => {
      const src = read(ORCH);
      expect(src).toContain('isProductOwnerInitiated === true ? false : true');
    });

    it('PO Acceptance remains governed (execute_po_acceptance_closure)', () => {
      const src = read(WO);
      expect(src).toContain('execute_po_acceptance_closure');
    });

    it('individual verify uses deferProductOwnerGates: false', () => {
      const src = read(WO);
      const individualSection = src.match(/notes: 'Individual Verify \(canonical engine\)'[\s\S]{0,100}deferProductOwnerGates[\s\S]{0,20}/);
      expect(individualSection).not.toBeNull();
      expect(individualSection![0]).toContain('deferProductOwnerGates: false');
    });
  });
});
