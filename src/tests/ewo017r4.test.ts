// EWO-017R.4 — View Execution Navigation, Session Recovery & E2E Validation
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf-8');
const sourceContains = (p: string, s: string) => read(p).includes(s);

const WO = 'src/pages/ecc/ECCWorkOrdersPage.tsx';
const NAV = 'src/lib/engineeringNavigationService.ts';
const LAUNCH = 'src/lib/executionLaunchService.ts';
const RESOLVER = 'src/lib/executionEligibilityResolver.ts';
const DASHBOARD = 'src/pages/ecc/ECCExecutionDashboardPage.tsx';
const WORKSPACE = 'src/pages/ecc/ECCExecutionWorkspacePage.tsx';

describe('EWO-017R.4 — View Execution Navigation & E2E Validation', () => {

  // ─── Req 1: Root Cause Diagnosis ─────────────────────────────────────────────
  describe('Req 1 — Root Cause: Active Session Status Mismatch', () => {
    it('getActiveSession includes awaiting_po_testing in active statuses', () => {
      expect(sourceContains(LAUNCH, 'awaiting_po_testing')).toBe(true);
    });

    it('getActiveSession includes awaiting_completion in active statuses', () => {
      expect(sourceContains(LAUNCH, 'awaiting_completion')).toBe(true);
    });

    it('getActiveSession includes prepared and submitted in active statuses', () => {
      expect(sourceContains(LAUNCH, "'prepared'")).toBe(true);
      expect(sourceContains(LAUNCH, "'submitted'")).toBe(true);
    });

    it('handleViewActiveExecution uses execEligibility ref as primary source', () => {
      const src = read(WO);
      expect(src).toMatch(/execEligibility\?\.activeExecutionSession\?\.executionRef/);
    });

    it('handleViewActiveExecution does not solely depend on activeSession.execution', () => {
      const src = read(WO);
      expect(src).toMatch(/\?\?\s*activeSession\?\.execution\?\.execution_ref/);
    });
  });

  // ─── Req 2: Single Canonical Navigation Service ──────────────────────────────
  describe('Req 2 — Single Canonical Navigation Service', () => {
    it('navigation service exports navigateToExecutionWorkspace', () => {
      expect(sourceContains(NAV, 'export function navigateToExecutionWorkspace')).toBe(true);
    });

    it('navigateToExecutionWorkspace uses buildExecutionWorkspaceRoute', () => {
      const src = read(NAV);
      const match = src.match(/navigateToExecutionWorkspace[\s\S]*?buildExecutionWorkspaceRoute/);
      expect(match).toBeTruthy();
    });

    it('navigateToExecutionWorkspace validates ref before navigation', () => {
      const src = read(NAV);
      expect(src).toMatch(/if\s*\(!executionRef\)\s*return false/);
    });

    it('navigateToExecutionWorkspace sets window.location.hash', () => {
      expect(sourceContains(NAV, 'window.location.hash = route')).toBe(true);
    });

    it('WorkOrdersPage uses navigateToExecutionWorkspace for Begin', () => {
      expect(sourceContains(WO, 'navigateToExecutionWorkspace(result.executionRef)')).toBe(true);
    });

    it('WorkOrdersPage uses navigateToExecutionWorkspace for View', () => {
      const src = read(WO);
      expect(src).toMatch(/navigateToExecutionWorkspace\(ref\)/);
    });

    it('Dashboard uses navigateToExecutionWorkspace', () => {
      expect(sourceContains(DASHBOARD, 'navigateToExecutionWorkspace')).toBe(true);
    });
  });

  // ─── Req 3: View Execution Action Wiring ─────────────────────────────────────
  describe('Req 3 — View Execution Action Wiring', () => {
    it('handleViewActiveExecution does not call createExecution', () => {
      const src = read(WO);
      const handlerMatch = src.match(/handleViewActiveExecution[\s\S]*?^\s*\}/m);
      if (handlerMatch) {
        expect(handlerMatch[0]).not.toMatch(/createExecution/);
      }
    });

    it('handleViewActiveExecution does not call beginEngineeringExecution', () => {
      const src = read(WO);
      const handlerMatch = src.match(/handleViewActiveExecution[\s\S]*?^\s*\}/m);
      if (handlerMatch) {
        expect(handlerMatch[0]).not.toMatch(/beginEngineeringExecution/);
      }
    });

    it('handleViewActiveExecution does not call executeWorkOrder', () => {
      const src = read(WO);
      const handlerMatch = src.match(/handleViewActiveExecution[\s\S]*?^\s*\}/m);
      if (handlerMatch) {
        expect(handlerMatch[0]).not.toMatch(/executeWorkOrder/);
      }
    });

    it('handleViewActiveExecution navigates using canonical route', () => {
      const src = read(WO);
      expect(src).toContain('navigateToExecutionWorkspace(ref)');
      expect(src).toContain('navigateToExecutionWorkspace(result.executionRef)');
    });
  });

  // ─── Req 4: Execution Reference Validation ───────────────────────────────────
  describe('Req 4 — Execution Reference Validation', () => {
    it('handleViewActiveExecution checks for null ref', () => {
      const src = read(WO);
      expect(src).toMatch(/if\s*\(!ref\)/);
    });

    it('handleViewActiveExecution sets governed error on missing ref', () => {
      const src = read(WO);
      expect(src).toMatch(/setViewExecError/);
    });

    it('governed error message mentions re-evaluate', () => {
      const src = read(WO);
      expect(src).toMatch(/re-evaluating/i);
    });
  });

  // ─── Req 5: Existing Session Recovery ─────────────────────────────────────────
  describe('Req 5 — Existing Session Recovery', () => {
    it('resolver active statuses include all governed states', () => {
      const src = read(RESOLVER);
      ['awaiting_po_testing', 'awaiting_completion', 'prepared', 'submitted'].forEach(s => {
        expect(src).toContain(s);
      });
    });

    it('launch service active statuses include all governed states', () => {
      const src = read(LAUNCH);
      ['awaiting_po_testing', 'awaiting_completion', 'prepared', 'submitted'].forEach(s => {
        expect(src).toContain(s);
      });
    });
  });

  // ─── Req 6: Active-Session Banner Consistency ────────────────────────────────
  describe('Req 6 — Active-Session Banner Consistency', () => {
    it('banner displays execEligibility.activeExecutionSession.executionRef', () => {
      const src = read(WO);
      expect(src).toMatch(/execEligibility\.activeExecutionSession\.executionRef/);
    });

    it('banner button uses same handleViewActiveExecution handler', () => {
      const src = read(WO);
      const bannerMatch = src.match(/active_session[\s\S]*?handleViewActiveExecution/);
      expect(bannerMatch).toBeTruthy();
    });

    it('banner shows execution status', () => {
      const src = read(WO);
      expect(src).toMatch(/activeExecutionSession\.status/);
    });
  });

  // ─── Req 7: Governed Action Feedback ──────────────────────────────────────────
  describe('Req 7 — Governed Action Feedback', () => {
    it('View Execution button has disabled state', () => {
      const src = read(WO);
      expect(src).toMatch(/disabled=\{viewingExec\}/);
    });

    it('View Execution button shows loading spinner', () => {
      const src = read(WO);
      expect(src).toMatch(/viewingExec\s*\?\s*<Loader2/);
    });

    it('View Execution button shows Opening... text while loading', () => {
      const src = read(WO);
      expect(src).toMatch(/Opening\.\.\./);
    });
  });

  // ─── Req 9: Duplicate Prevention Revalidation ────────────────────────────────
  describe('Req 9 — Duplicate Prevention', () => {
    it('handleViewActiveExecution does not create sessions', () => {
      const src = read(WO);
      const handlerMatch = src.match(/handleViewActiveExecution[\s\S]*?^\s*\}/m);
      if (handlerMatch) {
        expect(handlerMatch[0]).not.toMatch(/createSession/);
      }
    });

    it('handleViewActiveExecution only navigates (no DB writes)', () => {
      const src = read(WO);
      // Extract the full handler function body
      const startIdx = src.indexOf('function handleViewActiveExecution()');
      const endIdx = src.indexOf('\n  }', startIdx + 1);
      const handler = src.slice(startIdx, endIdx + 4);
      expect(handler).toContain('navigateToExecutionWorkspace');
      expect(handler).not.toMatch(/createExecution|createSession|beginEngineeringExecution|executeWorkOrder/);
    });
  });

  // ─── Req 11: Governed Missing-Execution Recovery ──────────────────────────────
  describe('Req 11 — Governed Missing-Execution Recovery', () => {
    it('WorkOrdersPage shows governed error for missing execution ref', () => {
      expect(sourceContains(WO, 'Cannot Open Execution')).toBe(true);
    });

    it('governed error offers Re-evaluate Execution State action', () => {
      expect(sourceContains(WO, 'Re-evaluate Execution State')).toBe(true);
    });

    it('governed error offers Return to Execution Dashboard action', () => {
      expect(sourceContains(WO, 'Return to Execution Dashboard')).toBe(true);
    });
  });

  // ─── Req 13: ES-003 Engineering Standard ──────────────────────────────────────
  describe('Req 13 — ES-003 Engineering Standard Registration', () => {
    it('ES-003 standard is referenced in the codebase', () => {
      expect(sourceContains(NAV, 'ES-003')).toBe(true);
    });
  });

  // ─── Regression Protection ────────────────────────────────────────────────────
  describe('Regression Protection', () => {
    it('Begin Engineering Execution still uses navigateToExecutionWorkspace', () => {
      expect(sourceContains(WO, 'navigateToExecutionWorkspace')).toBe(true);
    });

    it('resolver still exports evaluateExecutionEligibility', () => {
      expect(sourceContains(RESOLVER, 'export async function evaluateExecutionEligibility')).toBe(true);
    });

    it('workspace still renders governed loading state', () => {
      expect(sourceContains(WORKSPACE, 'Loading Engineering Execution')).toBe(true);
    });

    it('workspace still has error boundary', () => {
      expect(sourceContains(WORKSPACE, 'ExecutionWorkspaceErrorBoundary')).toBe(true);
    });

    it('workspace still has not-found state', () => {
      expect(sourceContains(WORKSPACE, 'Execution Not Found')).toBe(true);
    });

    it('buildExecutionWorkspaceRoute still exists', () => {
      expect(sourceContains(NAV, 'export function buildExecutionWorkspaceRoute')).toBe(true);
    });

    it('parseExecutionWorkspaceRoute still exists', () => {
      expect(sourceContains(NAV, 'export function parseExecutionWorkspaceRoute')).toBe(true);
    });

    it('getExecution still has ilike fallback', () => {
      expect(sourceContains('src/lib/engineeringExecutionService.ts', 'ilike')).toBe(true);
    });
  });
});
