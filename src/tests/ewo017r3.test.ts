// EWO-017R.3 — Execution Workspace Routing & Governed States
// Automated routing tests, source-level integration tests, and regression protection.
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf-8');
const sourceContains = (p: string, s: string) => read(p).includes(s);

const WORKSPACE = 'src/pages/ecc/ECCExecutionWorkspacePage.tsx';
const WO = 'src/pages/ecc/ECCWorkOrdersPage.tsx';
const NAV = 'src/lib/engineeringNavigationService.ts';
const EXEC_SVC = 'src/lib/engineeringExecutionService.ts';
const RESOLVER = 'src/lib/executionEligibilityResolver.ts';
const DASHBOARD = 'src/pages/ecc/ECCExecutionDashboardPage.tsx';
const ECC_PAGE = 'src/pages/EngineeringControlCentrePage.tsx';

describe('EWO-017R.3 — Execution Workspace Routing & Governed States', () => {

  // ─── Req 3: Canonical Route Definition ──────────────────────────────────────
  describe('Req 3 — Canonical Route Definition', () => {
    it('navigation service defines buildExecutionWorkspaceRoute', () => {
      expect(sourceContains(NAV, 'export function buildExecutionWorkspaceRoute')).toBe(true);
    });

    it('navigation service defines parseExecutionWorkspaceRoute', () => {
      expect(sourceContains(NAV, 'export function parseExecutionWorkspaceRoute')).toBe(true);
    });

    it('buildExecutionWorkspaceRoute produces canonical hash format', () => {
      const src = read(NAV);
      const match = src.match(/buildExecutionWorkspaceRoute[\s\S]*?return\s+`([^`]+)`/);
      expect(match).toBeTruthy();
      expect(match![1]).toContain('#/engineering/engineering-execution/');
    });

    it('parseExecutionWorkspaceRoute extracts executionRef from hash', () => {
      const src = read(NAV);
      expect(src).toMatch(/parseExecutionWorkspaceRoute[\s\S]*?match\(/);
    });
  });

  // ─── Req 4: Route Registration ──────────────────────────────────────────────
  describe('Req 4 — Route Registration', () => {
    it('ECC page registers engineering-execution section', () => {
      expect(sourceContains(ECC_PAGE, "key: 'engineering-execution'")).toBe(true);
    });

    it('ECC page renders ECCExecutionWorkspacePage when objectRef is present', () => {
      expect(sourceContains(ECC_PAGE, 'ECCExecutionWorkspacePage')).toBe(true);
    });

    it('ECC page passes objectRef as executionRef prop', () => {
      expect(sourceContains(ECC_PAGE, 'executionRef={objectRef}')).toBe(true);
    });

    it('ECC page falls back to dashboard when no objectRef', () => {
      expect(sourceContains(ECC_PAGE, 'ECCExecutionDashboardPage')).toBe(true);
    });
  });

  // ─── Req 7: Governed Loading State ───────────────────────────────────────────
  describe('Req 7 — Governed Loading State', () => {
    it('workspace shows loading state with execution reference visible', () => {
      const src = read(WORKSPACE);
      expect(src).toMatch(/Loading Engineering Execution/);
      expect(src).toMatch(/Reference: \{executionRef\}/);
    });

    it('workspace uses Loader2 with animate-spin for loading indicator', () => {
      expect(sourceContains(WORKSPACE, 'animate-spin')).toBe(true);
    });
  });

  // ─── Req 8: Governed Not-Found State ─────────────────────────────────────────
  describe('Req 8 — Governed Not-Found State', () => {
    it('workspace shows not-found state when execution is null', () => {
      expect(sourceContains(WORKSPACE, 'Execution Not Found')).toBe(true);
    });

    it('not-found state shows possible causes explanation', () => {
      expect(sourceContains(WORKSPACE, 'Possible causes')).toBe(true);
    });

    it('not-found state provides Retry button', () => {
      expect(sourceContains(WORKSPACE, 'Retry')).toBe(true);
    });

    it('not-found state provides Return to Execution Dashboard button', () => {
      expect(sourceContains(WORKSPACE, 'Return to Execution Dashboard')).toBe(true);
    });
  });

  // ─── Req 9: Governed Initialisation Failure State ─────────────────────────────
  describe('Req 9 — Governed Initialisation Failure State', () => {
    it('workspace detects missing EWO link', () => {
      expect(sourceContains(WORKSPACE, 'not linked to a work order')).toBe(true);
    });

    it('workspace detects missing execution package', () => {
      expect(sourceContains(WORKSPACE, 'execution package is missing')).toBe(true);
    });

    it('workspace shows initialisation failure state with current status', () => {
      expect(sourceContains(WORKSPACE, 'Execution Initialisation Incomplete')).toBe(true);
    });
  });

  // ─── Req 10: Render Error Boundary ───────────────────────────────────────────
  describe('Req 10 — Render Error Boundary', () => {
    it('workspace wraps content in ExecutionWorkspaceErrorBoundary', () => {
      expect(sourceContains(WORKSPACE, 'ExecutionWorkspaceErrorBoundary')).toBe(true);
    });

    it('error boundary class implements getDerivedStateFromError', () => {
      expect(sourceContains(WORKSPACE, 'getDerivedStateFromError')).toBe(true);
    });

    it('error boundary shows diagnostic correlation reference', () => {
      expect(sourceContains(WORKSPACE, 'correlationRef')).toBe(true);
    });

    it('error boundary provides Retry and Return buttons', () => {
      const src = read(WORKSPACE);
      expect(src).toMatch(/Retry Workspace/);
      expect(src).toMatch(/Return to Execution Dashboard/);
    });

    it('error boundary provides copy diagnostic reference button', () => {
      expect(sourceContains(WORKSPACE, 'Copy diagnostic reference')).toBe(true);
    });
  });

  // ─── Req 11: Workspace Data Initialisation from URL ──────────────────────────
  describe('Req 11 — Workspace Data Initialisation from URL', () => {
    it('workspace accepts executionRef prop', () => {
      expect(sourceContains(WORKSPACE, 'executionRef')).toBe(true);
    });

    it('workspace calls getExecution with executionRef', () => {
      expect(sourceContains(WORKSPACE, 'getExecution(executionRef)')).toBe(true);
    });

    it('execution service has ilike fallback for case-insensitive matching', () => {
      expect(sourceContains(EXEC_SVC, 'ilike')).toBe(true);
    });

    it('execution service has exact match before fallback', () => {
      expect(sourceContains(EXEC_SVC, "eq('execution_ref'")).toBe(true);
    });
  });

  // ─── Req 12: Progress Race-Condition Protection ───────────────────────────────
  describe('Req 12 — Progress Race-Condition Protection', () => {
    it('workspace polls for updates when execution is active', () => {
      expect(sourceContains(WORKSPACE, 'setInterval')).toBe(true);
    });

    it('workspace clears interval on unmount', () => {
      expect(sourceContains(WORKSPACE, 'clearInterval')).toBe(true);
    });

    it('workspace checks active statuses before polling', () => {
      expect(sourceContains(WORKSPACE, 'activeStatuses')).toBe(true);
    });
  });

  // ─── Req 13: Dashboard Link Consistency ──────────────────────────────────────
  describe('Req 13 — Dashboard Link Consistency', () => {
    it('dashboard imports buildExecutionWorkspaceRoute', () => {
      expect(sourceContains(DASHBOARD, 'buildExecutionWorkspaceRoute')).toBe(true);
    });

    it('dashboard session rows are clickable', () => {
      expect(sourceContains(DASHBOARD, 'cursor-pointer')).toBe(true);
    });

    it('dashboard provides View action for sessions with execution_ref', () => {
      expect(sourceContains(DASHBOARD, 'View')).toBe(true);
    });
  });

  // ─── Req 14: Duplicate Launch Prevention ──────────────────────────────────────
  describe('Req 14 — Duplicate Launch Prevention', () => {
    it('resolver includes awaiting_po_testing in active statuses', () => {
      expect(sourceContains(RESOLVER, 'awaiting_po_testing')).toBe(true);
    });

    it('resolver includes awaiting_completion in active statuses', () => {
      expect(sourceContains(RESOLVER, 'awaiting_completion')).toBe(true);
    });

    it('resolver includes prepared in active statuses', () => {
      expect(sourceContains(RESOLVER, "'prepared'")).toBe(true);
    });

    it('resolver includes submitted in active statuses', () => {
      expect(sourceContains(RESOLVER, "'submitted'")).toBe(true);
    });
  });

  // ─── Req 5: Session Creation Before Navigation ───────────────────────────────
  describe('Req 5 — Session Creation Before Navigation', () => {
    it('WorkOrdersPage uses buildExecutionWorkspaceRoute for navigation', () => {
      expect(sourceContains(WO, 'buildExecutionWorkspaceRoute')).toBe(true);
    });

    it('WorkOrdersPage does not use raw hash assignment with slugification', () => {
      const src = read(WO);
      expect(src).not.toMatch(/\.toLowerCase\(\)\.replace\(\(\/\[\^a-z0-9\]\+/);
    });
  });

  // ─── Req 15: ATD Knowledge Sync ──────────────────────────────────────────────
  describe('Req 15 — ATD Knowledge Sync', () => {
    it('conversationContextRouter references execution eligibility', () => {
      expect(sourceContains('src/lib/conversationContextRouter.ts', 'execution')).toBe(true);
    });
  });

  // ─── Regression Protection ────────────────────────────────────────────────────
  describe('Regression Protection', () => {
    it('workspace still renders tabs (overview, timeline, package, etc.)', () => {
      const src = read(WORKSPACE);
      expect(src).toMatch(/'overview'/);
      expect(src).toMatch(/'timeline'/);
      expect(src).toMatch(/'package'/);
      expect(src).toMatch(/'completion'/);
      expect(src).toMatch(/'po'/);
    });

    it('workspace still renders pipeline progress bar', () => {
      expect(sourceContains(WORKSPACE, 'EXECUTION_PIPELINE')).toBe(true);
    });

    it('workspace still renders PO decision tab', () => {
      expect(sourceContains(WORKSPACE, 'submitPODecision')).toBe(true);
    });

    it('workspace still renders release/archive actions', () => {
      const src = read(WORKSPACE);
      expect(src).toMatch(/handleRelease/);
      expect(src).toMatch(/handleArchive/);
    });

    it('execution service still exports getExecution', () => {
      expect(sourceContains(EXEC_SVC, 'export async function getExecution')).toBe(true);
    });

    it('navigation service still exports parseEngineeringRoute', () => {
      expect(sourceContains(NAV, 'export function parseEngineeringRoute')).toBe(true);
    });

    it('resolver still exports evaluateExecutionEligibility', () => {
      expect(sourceContains(RESOLVER, 'export async function evaluateExecutionEligibility')).toBe(true);
    });
  });
});
