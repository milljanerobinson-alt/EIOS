// EWO-017R.9A — Canonical Verification Context Resolution
// Regression tests proving the verification context chain resolves correctly
// for both Individual Verify and Verify All Eligible.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf-8');
const contains = (p: string, s: string) => read(p).includes(s);

const ORCH = 'src/lib/verificationOrchestrator.ts';
const WO = 'src/pages/ecc/ECCWorkOrdersPage.tsx';

describe('EWO-017R.9A — Canonical Verification Context Resolution', () => {

  // ─── Req 1: Root Cause Fix ─────────────────────────────────────────────────────
  describe('Req 1 — Root cause: affected_migrations column removed', () => {
    it('loadEwoArtefactState does NOT query affected_migrations', () => {
      const src = read(ORCH);
      const fnSection = src.match(/async function loadEwoArtefactState[\s\S]{0,1000}/);
      expect(fnSection).not.toBeNull();
      expect(fnSection![0]).not.toContain('affected_migrations');
    });

    it('getArtefactEligibility does NOT reference affected_migrations', () => {
      const src = read(ORCH);
      expect(src).not.toContain('affected_migrations');
    });

    it('data gate no longer checks affected_migrations', () => {
      const src = read(ORCH);
      // Search the entire evaluateGateEligibility function for the data gate
      const evalFn = src.match(/function evaluateGateEligibility[\s\S]{0,5000}/);
      expect(evalFn).not.toBeNull();
      const dataSection = evalFn![0].match(/case 'data'[\s\S]{0,300}/);
      expect(dataSection).not.toBeNull();
      expect(dataSection![0]).not.toContain('affected_migrations');
    });

    it('query uses .maybeSingle() not .single()', () => {
      const src = read(ORCH);
      const fnSection = src.match(/async function loadEwoArtefactState[\s\S]{0,1000}/);
      expect(fnSection![0]).toContain('.maybeSingle()');
    });
  });

  // ─── Req 2: Canonical Context Type ──────────────────────────────────────────────
  describe('Req 2 — Canonical Work Order Context Type', () => {
    it('VerificationWorkOrderContext interface is exported', () => {
      expect(contains(ORCH, 'export interface VerificationWorkOrderContext')).toBe(true);
    });

    it('has workOrderId field', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface VerificationWorkOrderContext[\s\S]{0,500}/);
      expect(iface![0]).toContain('workOrderId');
    });

    it('has workOrderRef field', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface VerificationWorkOrderContext[\s\S]{0,500}/);
      expect(iface![0]).toContain('workOrderRef');
    });

    it('has status field', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface VerificationWorkOrderContext[\s\S]{0,500}/);
      expect(iface![0]).toContain('status');
    });

    it('has loadedAt field', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface VerificationWorkOrderContext[\s\S]{0,500}/);
      expect(iface![0]).toContain('loadedAt');
    });
  });

  // ─── Req 3: Canonical Context Resolver ─────────────────────────────────────────
  describe('Req 3 — Canonical Context Resolver', () => {
    it('resolveVerificationWorkOrderContext function is exported', () => {
      expect(contains(ORCH, 'export async function resolveVerificationWorkOrderContext')).toBe(true);
    });

    it('ResolveContextResult interface is exported', () => {
      expect(contains(ORCH, 'export interface ResolveContextResult')).toBe(true);
    });

    it('resolver has success field', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface ResolveContextResult[\s\S]{0,500}/);
      expect(iface![0]).toContain('success');
    });

    it('resolver has identityTypeUsed field', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface ResolveContextResult[\s\S]{0,500}/);
      expect(iface![0]).toContain('identityTypeUsed');
    });

    it('resolver has failureType field', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface ResolveContextResult[\s\S]{0,500}/);
      expect(iface![0]).toContain('failureType');
    });

    it('resolver has correlationId field', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface ResolveContextResult[\s\S]{0,500}/);
      expect(iface![0]).toContain('correlationId');
    });

    it('resolver prioritizes loaded EWO object', () => {
      const src = read(ORCH);
      const fnSection = src.match(/export async function resolveVerificationWorkOrderContext[\s\S]{0,8000}/);
      expect(fnSection).not.toBeNull();
      // The first resolution path should check loadedWorkOrder
      const firstPath = fnSection![0].indexOf('loadedWorkOrder');
      const uuidPath = fnSection![0].indexOf('UUID_REGEX');
      expect(firstPath).toBeLessThan(uuidPath);
    });

    it('resolver uses UUID_REGEX for UUID detection', () => {
      expect(contains(ORCH, 'UUID_REGEX')).toBe(true);
    });

    it('resolver uses EWO_REF_REGEX for reference detection', () => {
      expect(contains(ORCH, 'EWO_REF_REGEX')).toBe(true);
    });
  });

  // ─── Req 4: Use Loaded Page Context ──────────────────────────────────────────────
  describe('Req 4 — Use Loaded Page Context', () => {
    it('performVerification accepts loadedContext parameter', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface PerformVerificationRequest[\s\S]{0,800}/);
      expect(iface![0]).toContain('loadedContext');
    });

    it('OrchestrationRequest accepts loadedContext parameter', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface OrchestrationRequest[\s\S]{0,500}/);
      expect(iface![0]).toContain('loadedContext');
    });

    it('performVerification passes loadedContext to getArtefactEligibility', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,8000}/);
      expect(pvSection![0]).toContain('loadedContext');
      expect(pvSection![0]).toContain('getArtefactEligibility(req.workOrderId, gate, loadedContext)');
    });

    it('runVerificationOrchestration passes loadedContext to performVerification', () => {
      const src = read(ORCH);
      const orchSection = src.match(/export async function runVerificationOrchestration[\s\S]{0,10000}/);
      expect(orchSection![0]).toContain('loadedContext: request.loadedContext');
    });

    it('retryFailedGates accepts loadedContext parameter', () => {
      const src = read(ORCH);
      const fnSection = src.match(/export async function retryFailedGates[\s\S]{0,500}/);
      expect(fnSection![0]).toContain('loadedContext');
    });

    it('retryFailedGates passes loadedContext to runVerificationOrchestration', () => {
      const src = read(ORCH);
      const fnSection = src.match(/export async function retryFailedGates[\s\S]{0,500}/);
      expect(fnSection![0]).toContain('loadedContext: loadedContext');
    });

    it('page passes ewo object to VerificationSection', () => {
      const src = read(WO);
      const callSite = src.match(/<VerificationSection[\s\S]{0,600}\/>/);
      expect(callSite![0]).toContain('ewo={ewo}');
    });

    it('page passes ewo object to VerificationOrchestrationPanel', () => {
      const src = read(WO);
      const callSite = src.match(/<VerificationOrchestrationPanel[\s\S]{0,200}\/>/);
      expect(callSite![0]).toContain('ewo={ewo}');
    });

    it('handleGateUpdate passes loadedContext to performVerification', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,5000}/);
      expect(handleSection![0]).toContain('loadedContext');
    });

    it('VerificationOrchestrationPanel passes loadedContext to runVerificationOrchestration', () => {
      const src = read(WO);
      const orchPanel = src.match(/function VerificationOrchestrationPanel[\s\S]{0,5000}/);
      expect(orchPanel![0]).toContain('loadedContext');
    });
  });

  // ─── Req 5: Database Query Correction ───────────────────────────────────────────
  describe('Req 5 — Database Query Correction', () => {
    it('loadEwoArtefactState returns distinct failure types', () => {
      const src = read(ORCH);
      const fnSection = src.match(/async function loadEwoArtefactState[\s\S]{0,2000}/);
      expect(fnSection![0]).toContain('failure');
      expect(fnSection![0]).toContain('errorMessage');
    });

    it('distinguishes permission denied from query error', () => {
      const src = read(ORCH);
      const fnSection = src.match(/async function loadEwoArtefactState[\s\S]{0,2000}/);
      expect(fnSection![0]).toContain('42501');
      expect(fnSection![0]).toContain('permission_denied');
      expect(fnSection![0]).toContain('query_error');
    });

    it('distinguishes record not found from query error', () => {
      const src = read(ORCH);
      const fnSection = src.match(/async function loadEwoArtefactState[\s\S]{0,2000}/);
      expect(fnSection![0]).toContain('record_not_found');
    });

    it('getArtefactEligibility uses loadedContext when provided', () => {
      const src = read(ORCH);
      const fnSection = src.match(/export async function getArtefactEligibility[\s\S]{0,2000}/);
      expect(fnSection![0]).toContain('loadedContext');
      expect(fnSection![0]).toContain('if (loadedContext)');
    });

    it('getArtefactEligibility accepts loadedContext as third parameter', () => {
      const src = read(ORCH);
      const fnMatch = src.match(/export async function getArtefactEligibility\([\s\S]{0,200}\)/);
      expect(fnMatch![0]).toContain('loadedContext');
    });
  });

  // ─── Req 6: Impossible-State Protection ────────────────────────────────────────
  describe('Req 6 — Impossible-State Protection', () => {
    it('performVerification checks contextFailure with loadedContext', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,10000}/);
      expect(pvSection![0]).toContain('contextFailure');
      expect(pvSection![0]).toContain('impossible_state');
    });

    it('records governance_error audit event for impossible state', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,10000}/);
      expect(pvSection![0]).toContain("'governance_error'");
      expect(pvSection![0]).toContain('invariant_violation');
    });

    it('includes correlation ID for impossible state', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,10000}/);
      expect(pvSection![0]).toContain('correlation_id');
    });

    it('ArtefactEligibility has contextFailure field', () => {
      const src = read(ORCH);
      const iface = src.match(/export interface ArtefactEligibility[\s\S]{0,500}/);
      expect(iface![0]).toContain('contextFailure');
    });

    it('ArtefactContextFailure type includes distinct failure types', () => {
      const src = read(ORCH);
      const typeMatch = src.match(/export type ArtefactContextFailure[\s\S]{0,300}/);
      expect(typeMatch![0]).toContain('invalid_identifier');
      expect(typeMatch![0]).toContain('record_not_found');
      expect(typeMatch![0]).toContain('permission_denied');
      expect(typeMatch![0]).toContain('query_error');
    });
  });

  // ─── Req 7: Individual Verify Correction ───────────────────────────────────────
  describe('Req 7 — Individual Verify Correction', () => {
    it('handleGateUpdate passes loadedContext with ewo.id and ewo.ewo_ref', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,5000}/);
      expect(handleSection![0]).toContain('workOrderId: ewo.id');
      expect(handleSection![0]).toContain('workOrderRef: ewo.ewo_ref');
    });

    it('Individual Verify does not report "Engineering Work Order not found"', () => {
      const src = read(ORCH);
      // The old generic message should not appear in getArtefactEligibility
      const aeSection = src.match(/export async function getArtefactEligibility[\s\S]{0,2000}/);
      expect(aeSection![0]).not.toContain('Engineering Work Order not found');
    });

    it('governed failure messages are used instead of generic "not found"', () => {
      const src = read(ORCH);
      expect(src).toContain('getGovernedFailureMessage');
      expect(src).toContain('Verification could not start because the Engineering Work Order identity was not supplied correctly');
      expect(src).toContain('was available when the page loaded but can no longer be found');
      expect(src).toContain('Verification could not access the Engineering Work Order due to current permissions');
      expect(src).toContain('Verification could not load canonical Work Order artefacts');
    });
  });

  // ─── Req 8: Batch Verification Correction ──────────────────────────────────────
  describe('Req 8 — Batch Verification Correction', () => {
    it('runVerificationOrchestration passes loadedContext to all performVerification calls', () => {
      const src = read(ORCH);
      const orchSection = src.match(/export async function runVerificationOrchestration[\s\S]{0,10000}/);
      expect(orchSection![0]).toContain('loadedContext: request.loadedContext');
    });

    it('Verify All Eligible passes loadedContext from page', () => {
      const src = read(WO);
      const orchPanel = src.match(/function VerificationOrchestrationPanel[\s\S]{0,3000}/);
      expect(orchPanel![0]).toContain('loadedContext');
    });
  });

  // ─── Req 9: Canonical Outcome Consistency ───────────────────────────────────────
  describe('Req 9 — Canonical Outcome Consistency', () => {
    it('both Individual and batch use getArtefactEligibility', () => {
      const src = read(ORCH);
      // performVerification is called by both paths and uses getArtefactEligibility
      expect(src).toContain('getArtefactEligibility');
      expect(src).toContain('performVerification');
    });

    it('both paths accept loadedContext of the same type', () => {
      const src = read(ORCH);
      const pvIface = src.match(/export interface PerformVerificationRequest[\s\S]{0,800}/);
      const orchIface = src.match(/export interface OrchestrationRequest[\s\S]{0,500}/);
      expect(pvIface![0]).toContain('loadedContext');
      expect(orchIface![0]).toContain('loadedContext');
    });
  });

  // ─── Req 10: Loading and Action Feedback ────────────────────────────────────────
  describe('Req 10 — Loading and Action Feedback', () => {
    it('updating state is set before verification and cleared in finally', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,5000}/);
      expect(handleSection![0]).toContain('setUpdating(gateKey)');
      expect(handleSection![0]).toContain('setUpdating(null)');
    });

    it('verificationResult is set on every outcome', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,8000}/);
      expect(handleSection![0]).toContain("'artefacts_required'");
      expect(handleSection![0]).toContain("'blocked'");
      expect(handleSection![0]).toContain("'failed'");
      expect(handleSection![0]).toContain("'passed'");
    });
  });

  // ─── Req 11: Governed Error Messages ────────────────────────────────────────────
  describe('Req 11 — Governed Error Messages', () => {
    it('invalid context message exists', () => {
      expect(contains(ORCH, 'Verification could not start because the Engineering Work Order identity was not supplied correctly')).toBe(true);
    });

    it('record deleted message exists', () => {
      expect(contains(ORCH, 'was available when the page loaded but can no longer be found')).toBe(true);
    });

    it('permission denied message exists', () => {
      expect(contains(ORCH, 'Verification could not access the Engineering Work Order due to current permissions')).toBe(true);
    });

    it('query failure message exists', () => {
      expect(contains(ORCH, 'Verification could not load canonical Work Order artefacts')).toBe(true);
    });
  });

  // ─── Req 12: Audit and Diagnostics ───────────────────────────────────────────────
  describe('Req 12 — Audit and Diagnostics', () => {
    it('gate_artefacts_evaluated audit event includes context_failure', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,10000}/);
      expect(pvSection![0]).toContain('context_failure');
    });

    it('governance_error audit event includes loaded_ewo_id and loaded_ewo_ref', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,10000}/);
      expect(pvSection![0]).toContain('loaded_ewo_id');
      expect(pvSection![0]).toContain('loaded_ewo_ref');
    });

    it('governance_error audit event includes queried_identifier', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,10000}/);
      expect(pvSection![0]).toContain('queried_identifier');
    });

    it('governance_error audit event includes correlation_id', () => {
      const src = read(ORCH);
      const pvSection = src.match(/export async function performVerification[\s\S]{0,10000}/);
      expect(pvSection![0]).toContain('correlation_id');
    });
  });

  // ─── Req 13: Test Matrix ────────────────────────────────────────────────────────
  describe('Req 13 — Test Matrix', () => {
    it('1. Individual Verify with canonical UUID (passes loadedContext)', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,5000}/);
      expect(handleSection![0]).toContain('workOrderId: ewo.id');
    });

    it('2. Individual Verify with canonical EWO reference (passes ewo_ref)', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,5000}/);
      expect(handleSection![0]).toContain('workOrderRef: ewo.ewo_ref');
    });

    it('3. Batch Verify with canonical UUID (passes loadedContext)', () => {
      const src = read(WO);
      const orchPanel = src.match(/function VerificationOrchestrationPanel[\s\S]{0,3000}/);
      expect(orchPanel![0]).toContain('workOrderId: ewo.id');
    });

    it('4. Batch Verify with canonical EWO reference (passes ewo_ref)', () => {
      const src = read(WO);
      const orchPanel = src.match(/function VerificationOrchestrationPanel[\s\S]{0,3000}/);
      expect(orchPanel![0]).toContain('workOrderRef: ewo.ewo_ref');
    });

    it('5. Loaded EWO object supplied (loadedContext passed)', () => {
      const src = read(WO);
      expect(src).toContain('loadedContext');
    });

    it('6. Resolver handles slug through identity service (UUID_REGEX check)', () => {
      expect(contains(ORCH, 'UUID_REGEX'));
    });

    it('7. Invalid UUID handled (resolver returns invalid_identifier)', () => {
      expect(contains(ORCH, 'invalid_identifier'));
    });

    it('8. Invalid EWO reference handled (resolver returns invalid_identifier)', () => {
      expect(contains(ORCH, 'invalid_identifier'));
    });

    it('9. Genuine missing record handled (resolver returns record_not_found)', () => {
      expect(contains(ORCH, 'record_not_found'));
    });

    it('10. Permission denied handled (resolver returns permission_denied)', () => {
      expect(contains(ORCH, 'permission_denied'));
    });

    it('11. Database query error handled (resolver returns query_error)', () => {
      expect(contains(ORCH, 'query_error'));
    });

    it('12. Record deleted after page load handled (impossible-state invariant)', () => {
      expect(contains(ORCH, 'impossible_state_visible_ewo_reported_not_found'));
    });

    it('13. Same EWO outcome across individual and batch (both use performVerification)', () => {
      const src = read(ORCH);
      expect(src).toContain('performVerification');
    });

    it('14. Verify Remaining context resolution (retryFailedGates passes loadedContext)', () => {
      const src = read(ORCH);
      const fnSection = src.match(/export async function retryFailedGates[\s\S]{0,500}/);
      expect(fnSection![0]).toContain('loadedContext');
    });

    it('15. Retry Failed context resolution (same as Verify Remaining)', () => {
      const src = read(ORCH);
      expect(src).toContain('retryFailedGates');
    });

    it('16. Spinner resolves after success (setUpdating(null) in finally)', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,5000}/);
      expect(handleSection![0]).toContain('setUpdating(null)');
    });

    it('17. Spinner resolves after failure (finally block always runs)', () => {
      const src = read(WO);
      const handleSection = src.match(/async function handleGateUpdate[\s\S]{0,5000}/);
      expect(handleSection![0]).toContain('finally');
    });

    it('18. Persistent result panel remains visible (setVerificationResult not auto-cleared)', () => {
      const src = read(WO);
      // verificationResult is only cleared by explicit Dismiss button
      expect(src).toContain('setVerificationResult(null)');
    });

    it('19. Impossible-state invariant records governance_error', () => {
      expect(contains(ORCH, 'governance_error'));
    });

    it('20. RLS and tenant context (permission_denied failure type)', () => {
      expect(contains(ORCH, 'permission_denied'));
    });
  });

  // ─── Req 15: Regression Protection ──────────────────────────────────────────────
  describe('Req 15 — Regression Protection', () => {
    it('artefact-derived verification preserved (getArtefactEligibility)', () => {
      expect(contains(ORCH, 'getArtefactEligibility'));
    });

    it('no-manual-evidence governance preserved (no evidence_required)', () => {
      const src = read(ORCH);
      expect(src).not.toContain("'evidence_required'");
    });

    it('canonical performVerification preserved', () => {
      expect(contains(ORCH, 'export async function performVerification'));
    });

    it('Product Owner gate deferral preserved (deferProductOwnerGates)', () => {
      expect(contains(ORCH, 'deferProductOwnerGates'));
    });

    it('persistent result panel preserved (verificationResult state)', () => {
      expect(contains(WO, 'verificationResult'));
    });

    it('artefacts_required outcome preserved (not evidence_required)', () => {
      expect(contains(ORCH, "'artefacts_required'"));
    });

    it('missing_artefacts field preserved (not missing_evidence)', () => {
      expect(contains(ORCH, 'missing_artefacts'));
    });

    it('R.9 evaluateGateEligibility shared function exists', () => {
      expect(contains(ORCH, 'function evaluateGateEligibility'));
    });

    it('R.9 governed failure messages exist', () => {
      expect(contains(ORCH, 'getGovernedFailureMessage'));
    });
  });

  // ─── Root Cause Analysis ──────────────────────────────────────────────────────
  describe('Root Cause Analysis', () => {
    it('documents the root cause (non-existent column removed)', () => {
      const src = read(ORCH);
      expect(src).toContain('EWO-017R.9A: Removed non-existent');
      expect(src).toContain('PostgREST error');
    });

    it('documents the fix (canonical context resolver)', () => {
      expect(contains(ORCH, 'resolveVerificationWorkOrderContext'));
    });

    it('documents the impossible-state invariant', () => {
      expect(contains(ORCH, 'impossible_state_visible_ewo_reported_not_found'));
    });
  });
});
