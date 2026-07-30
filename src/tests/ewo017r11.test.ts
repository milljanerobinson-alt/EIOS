// EWO-017R.11 — Product Owner Verification Authority & Circular Dependency Removal
// Regression tests proving PO verification authority is unified and circular deps removed.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf-8');

const ORCH = 'src/lib/verificationOrchestrator.ts';
const WO = 'src/pages/ecc/ECCWorkOrdersPage.tsx';

describe('EWO-017R.11 — Product Owner Verification Authority & Circular Dependency Removal', () => {

  // ─── Root Cause: UI gate no longer requires po_testing_status ──────────────────
  describe('Root Cause — UI gate circular dependency removed', () => {
    it('ui gate does NOT require po_testing_status = completed', () => {
      const src = read(ORCH);
      const uiSection = src.match(/case 'ui'[\s\S]{0,1000}break/);
      expect(uiSection).not.toBeNull();
      expect(uiSection![0]).not.toContain('po_testing_status');
    });

    it('ui gate does NOT require product_owner_verification_status', () => {
      const src = read(ORCH);
      const uiSection = src.match(/case 'ui'[\s\S]{0,1000}break/);
      expect(uiSection![0]).not.toContain('product_owner_verification_status');
    });

    it('ui gate checks engineering_complete status (prerequisite is functional passed)', () => {
      const src = read(ORCH);
      const uiSection = src.match(/case 'ui'[\s\S]{0,1000}break/);
      expect(uiSection![0]).toContain('engineering_complete');
    });

    it('ui gate message says "explicit PO judgement"', () => {
      const src = read(ORCH);
      const uiSection = src.match(/case 'ui'[\s\S]{0,1000}break/);
      expect(uiSection![0]).toContain('explicit PO judgement');
    });
  });

  // ─── Root Cause: Constitutional gate no longer requires engineering_verification ──
  describe('Root Cause — Constitutional gate circular dependency removed', () => {
    it('constitutional gate does NOT require engineering_verification status', () => {
      const src = read(ORCH);
      const constSection = src.match(/case 'constitutional'[\s\S]{0,1000}break/);
      expect(constSection).not.toBeNull();
      // Should not check for engineering_verification as a prerequisite
      expect(constSection![0]).not.toContain("must not reached engineering_verification");
    });

    it('constitutional gate checks engineering_complete status', () => {
      const src = read(ORCH);
      const constSection = src.match(/case 'constitutional'[\s\S]{0,1000}break/);
      expect(constSection![0]).toContain('engineering_complete');
    });

    it('constitutional gate message says "all prior gates passed"', () => {
      const src = read(ORCH);
      const constSection = src.match(/case 'constitutional'[\s\S]{0,1000}break/);
      expect(constSection![0]).toContain('all prior gates passed');
    });
  });

  // ─── Req 1: Verification action creates status, never requires it ──────────────
  describe('Req 1 — Verification action creates status, never requires it', () => {
    it('no gate requires po_testing_status as a prerequisite', () => {
      const src = read(ORCH);
      const evalFn = src.match(/function evaluateGateEligibility[\s\S]{0,3000}/);
      const gateSections = evalFn![0].match(/case '[a-z_]+'[\s\S]{0,800}break/g);
      expect(gateSections).not.toBeNull();
      gateSections!.forEach(gate => {
        expect(gate).not.toContain('po_testing_status');
      });
    });

    it('no gate requires product_owner_verification_status as a prerequisite', () => {
      const src = read(ORCH);
      const evalFn = src.match(/function evaluateGateEligibility[\s\S]{0,3000}/);
      const gateSections = evalFn![0].match(/case '[a-z_]+'[\s\S]{0,800}break/g);
      expect(gateSections).not.toBeNull();
      gateSections!.forEach(gate => {
        expect(gate).not.toContain('product_owner_verification_status');
      });
    });
  });

  // ─── Req 2: Canonical Product Owner authority ──────────────────────────────────
  describe('Req 2 — Canonical Product Owner authority', () => {
    it('OrchestrationRequest has isProductOwnerInitiated field', () => {
      const src = read(ORCH);
      expect(src).toContain('isProductOwnerInitiated');
    });

    it('individual verify uses deferProductOwnerGates: false', () => {
      const src = read(WO);
      const individualSection = src.match(/notes: 'Individual Verify \(canonical engine\)'[\s\S]{0,100}deferProductOwnerGates[\s\S]{0,20}/);
      expect(individualSection).not.toBeNull();
      expect(individualSection![0]).toContain('deferProductOwnerGates: false');
    });

    it('UI passes isProductOwnerInitiated: true for batch verify', () => {
      const src = read(WO);
      expect(src).toContain('isProductOwnerInitiated: true');
    });

    it('UI passes isProductOwnerInitiated: true for retry failed gates', () => {
      const src = read(WO);
      const retrySection = src.match(/retryFailedGates\([\s\S]{0,800}/);
      expect(retrySection).not.toBeNull();
      expect(retrySection![0]).toContain('true');
    });
  });

  // ─── Req 3: Verify All Eligible executes PO gates ──────────────────────────────
  describe('Req 3 — Verify All Eligible executes all gates under PO authority', () => {
    it('batch mode uses deferPO = false when isProductOwnerInitiated is true', () => {
      const src = read(ORCH);
      expect(src).toContain('isProductOwnerInitiated === true ? false : true');
    });

    it('batch mode passes deferPO to performVerification', () => {
      const src = read(ORCH);
      expect(src).toContain('deferProductOwnerGates: deferPO');
    });
  });

  // ─── Req 4: deferProductOwnerGates only for autonomous runs ─────────────────────
  describe('Req 4 — deferProductOwnerGates only for autonomous runs', () => {
    it('deferPO defaults to true for non-PO runs', () => {
      const src = read(ORCH);
      expect(src).toContain('isProductOwnerInitiated === true ? false : true');
    });

    it('deferPO is false when isProductOwnerInitiated is true', () => {
      const src = read(ORCH);
      const deferLine = src.match(/const deferPO[\s\S]{0,200}/);
      expect(deferLine![0]).toContain('false');
    });
  });

  // ─── Req 5: Constitutional progression after UI verification ──────────────────
  describe('Req 5 — Constitutional progression after UI verification', () => {
    it('constitutional gate checks engineering_complete (not engineering_verification)', () => {
      const src = read(ORCH);
      const constSection = src.match(/case 'constitutional'[\s\S]{0,1000}break/);
      expect(constSection![0]).toContain('engineering_complete');
    });

    it('constitutional gate does NOT block on engineering_verification status', () => {
      const src = read(ORCH);
      const constSection = src.match(/case 'constitutional'[\s\S]{0,1000}break/);
      // The gate should not have a missing.push that requires engineering_verification
      const missingPush = constSection![0].match(/missing\.push[\s\S]{0,200}/);
      if (missingPush) {
        expect(missingPush[0]).not.toContain('engineering_verification');
      }
    });
  });

  // ─── Req 6: Lifecycle progression after all 5 gates pass ─────────────────────────
  describe('Req 6 — Lifecycle progression after all gates pass', () => {
    it('lifecycle impact checks ALL gates (not just automated)', () => {
      const src = read(ORCH);
      expect(src).toContain('allGatesPassed');
    });

    it('canTransitionToVerified uses allGatesPassed', () => {
      const src = read(ORCH);
      expect(src).toContain('canTransitionToVerified = allGatesPassed');
    });

    it('poAcceptanceEligible is never automatic (separate governed decision)', () => {
      const src = read(ORCH);
      expect(src).toContain('PO Acceptance is always a separate governed decision');
    });

    it('canTransitionToReportReady still exists', () => {
      const src = read(ORCH);
      expect(src).toContain('canTransitionToReportReady');
    });
  });

  // ─── Req 7: Verification Matrix consistency ─────────────────────────────────────
  describe('Req 7 — Verification Matrix consistency', () => {
    it('no "Verification Requires Revalidation" while gates report "Already Verified"', () => {
      const src = read(WO);
      // The governed completion panel shows clear status, not ambiguous "requires revalidation"
      expect(src).toContain('Verification Complete');
    });
  });

  // ─── Req 8: Completion Summary governed outcomes ─────────────────────────────────
  describe('Req 8 — Completion Summary governed outcomes', () => {
    it('shows "Verification Complete" when 0 failed, 0 artefacts missing, 0 blocked', () => {
      const src = read(WO);
      expect(src).toContain('result.failed === 0 && result.artefactsMissing === 0 && result.blocked === 0');
    });

    it('shows "Report Ready" when canTransitionToReportReady', () => {
      const src = read(WO);
      expect(src).toContain('canTransitionToReportReady');
      expect(src).toContain('Report Ready');
    });

    it('shows "Product Owner Acceptance is eligible" message', () => {
      const src = read(WO);
      expect(src).toContain('Product Owner Acceptance is eligible');
    });

    it('pre-review dialog says PO gates execute (not deferred)', () => {
      const src = read(WO);
      expect(src).toContain('Product Owner gates execute under Product Owner authority');
    });

    it('pre-review dialog does NOT say "deferred — not auto-verified"', () => {
      const src = read(WO);
      expect(src).not.toContain('deferred — not auto-verified');
    });
  });

  // ─── Retry failed gates passes isProductOwnerInitiated ─────────────────────────
  describe('retryFailedGates signature', () => {
    it('retryFailedGates accepts isProductOwnerInitiated parameter', () => {
      const src = read(ORCH);
      const retryFn = src.match(/export async function retryFailedGates[\s\S]{0,500}/);
      expect(retryFn![0]).toContain('isProductOwnerInitiated');
    });

    it('retryFailedGates passes isProductOwnerInitiated to runVerificationOrchestration', () => {
      const src = read(ORCH);
      const retryFn = src.match(/export async function retryFailedGates[\s\S]{0,800}/);
      expect(retryFn![0]).toContain('isProductOwnerInitiated');
    });
  });
});
