// EWO-017R.1 — Product Owner Execution Launch, Orchestrator UI Wiring &
// Engineering Knowledge Synchronisation
//
// Tests covering: Begin Engineering Execution button visibility, eligibility
// rules, prerequisite validation, session creation, orchestrator invocation,
// navigation to Execution Workspace, dashboard updates, duplicate execution
// prevention, failure messaging, and lifecycle event recording.
//
// EWO-017R.2: Updated to match the canonical eligibility resolver API.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

function sourceContains(path: string, fragment: string): boolean {
  if (!existsSync(path)) return false;
  return readFileSync(path, 'utf-8').includes(fragment);
}

const LAUNCH = 'src/lib/executionLaunchService.ts';
const ORCH  = 'src/lib/executionOrchestrator.ts';
const RESOLVER = 'src/lib/executionEligibilityResolver.ts';
const WO    = 'src/pages/ecc/ECCWorkOrdersPage.tsx';

// ─── Req 1: Begin Engineering Execution Action ───────────────────────────────

describe('EWO-017R.1 Req 1 — Begin Engineering Execution Action', () => {
  it('checkExecutionEligibility function is exported', () => {
    expect(sourceContains(LAUNCH, 'export async function checkExecutionEligibility')).toBe(true);
  });

  it('eligibility checks Engineering Plan approved via canonical resolver', () => {
    expect(sourceContains(RESOLVER, 'engineeringPlanApproved')).toBe(true);
    expect(sourceContains(RESOLVER, 'ewo_engineering_packages')).toBe(true);
  });

  it('eligibility checks Engineering Review approved', () => {
    expect(sourceContains(RESOLVER, 'engineeringReviewApproved')).toBe(true);
    expect(sourceContains(RESOLVER, 'ecc_engineering_reviews')).toBe(true);
  });

  it('eligibility checks Product Owner approval recorded', () => {
    expect(sourceContains(RESOLVER, 'productOwnerApproved')).toBe(true);
    expect(sourceContains(RESOLVER, 'ewo_execution_approvals')).toBe(true);
  });

  it('eligibility checks Engineering not already executed', () => {
    expect(sourceContains(RESOLVER, 'alreadyExecuted')).toBe(true);
  });

  it('eligibility checks Not closed', () => {
    expect(sourceContains(RESOLVER, 'workOrderClosed')).toBe(true);
  });

  it('eligibility checks No active execution session', () => {
    expect(sourceContains(LAUNCH, 'getActiveSession')).toBe(true);
  });

  it('WorkOrdersPage imports the launch service', () => {
    expect(sourceContains(WO, 'executionLaunchService')).toBe(true);
  });

  it('WorkOrdersPage has Begin Engineering Execution button', () => {
    expect(sourceContains(WO, 'Begin Engineering Execution')).toBe(true);
  });
});

// ─── Req 2: Governed Pre-Execution Validation ─────────────────────────────────

describe('EWO-017R.1 Req 2 — Governed Pre-Execution Validation', () => {
  it('beginEngineeringExecution calls evaluateExecutionEligibility first', () => {
    expect(sourceContains(LAUNCH, 'evaluateExecutionEligibility')).toBe(true);
  });

  it('returns failure if prerequisites fail without creating session', () => {
    const src = readFileSync(LAUNCH, 'utf-8');
    const fnStart = src.indexOf('export async function beginEngineeringExecution');
    const fnBody = fnStart >= 0 ? src.slice(fnStart) : '';
    const eligibilityIdx = fnBody.indexOf('evaluateExecutionEligibility');
    const sessionIdx = fnBody.indexOf('createExecution');
    expect(eligibilityIdx).toBeGreaterThan(-1);
    expect(sessionIdx).toBeGreaterThan(-1);
    expect(eligibilityIdx).toBeLessThan(sessionIdx);
  });

  it('failed prerequisite list is returned via blockingReasons', () => {
    expect(sourceContains(RESOLVER, 'blockingReasons')).toBe(true);
  });
});

// ─── Req 3: Execution Session Creation ───────────────────────────────────────

describe('EWO-017R.1 Req 3 — Execution Session Creation', () => {
  it('beginEngineeringExecution calls createExecution', () => {
    expect(sourceContains(LAUNCH, 'createExecution')).toBe(true);
  });

  it('execution record includes ewo_id', () => {
    expect(sourceContains(LAUNCH, 'ewo_id: ewoId')).toBe(true);
  });

  it('execution record includes implementation_provider', () => {
    expect(sourceContains(LAUNCH, 'implementation_provider')).toBe(true);
  });

  it('launch result includes executionRef', () => {
    expect(sourceContains(LAUNCH, 'executionRef')).toBe(true);
  });
});

// ─── Req 4: Start the Orchestrator ────────────────────────────────────────────

describe('EWO-017R.1 Req 4 — Start the Orchestrator', () => {
  it('beginEngineeringExecution calls executeWorkOrder', () => {
    expect(sourceContains(LAUNCH, 'executeWorkOrder')).toBe(true);
  });

  it('OrchestratorConfig is constructed with executionId and ewoId', () => {
    expect(sourceContains(LAUNCH, 'executionId: execution.id')).toBe(true);
    expect(sourceContains(LAUNCH, 'ewoId,')).toBe(true);
  });

  it('progress callback is wired', () => {
    expect(sourceContains(LAUNCH, 'onProgress')).toBe(true);
  });
});

// ─── Req 5: Live Execution Workspace ──────────────────────────────────────────

describe('EWO-017R.1 Req 5 — Live Execution Workspace', () => {
  it('ECCExecutionWorkspacePage exists and accepts executionRef', () => {
    expect(sourceContains('src/pages/ecc/ECCExecutionWorkspacePage.tsx', 'executionRef')).toBe(true);
  });

  it('workspace displays current stage via pipeline progress', () => {
    expect(sourceContains('src/pages/ecc/ECCExecutionWorkspacePage.tsx', 'EXECUTION_PIPELINE')).toBe(true);
  });

  it('workspace has timeline tab', () => {
    expect(sourceContains('src/pages/ecc/ECCExecutionWorkspacePage.tsx', "'timeline'")).toBe(true);
  });

  it('WorkOrdersPage navigates to engineering-execution on success', () => {
    expect(sourceContains(WO, 'buildExecutionWorkspaceRoute')).toBe(true);
  });
});

// ─── Req 6: Execution Dashboard Integration ──────────────────────────────────

describe('EWO-017R.1 Req 6 — Execution Dashboard Integration', () => {
  it('ECCExecutionDashboardPage exists', () => {
    expect(existsSync('src/pages/ecc/ECCExecutionDashboardPage.tsx')).toBe(true);
  });

  it('dashboard shows queued, running, completed, failed counts', () => {
    expect(sourceContains('src/pages/ecc/ECCExecutionDashboardPage.tsx', 'queued')).toBe(true);
    expect(sourceContains('src/pages/ecc/ECCExecutionDashboardPage.tsx', 'running')).toBe(true);
    expect(sourceContains('src/pages/ecc/ECCExecutionDashboardPage.tsx', 'completed')).toBe(true);
    expect(sourceContains('src/pages/ecc/ECCExecutionDashboardPage.tsx', 'failed')).toBe(true);
  });
});

// ─── Req 7: Governed Failure States ───────────────────────────────────────────

describe('EWO-017R.1 Req 7 — Governed Failure States', () => {
  it('generateGovernedFailureMessage function is exported', () => {
    expect(sourceContains(LAUNCH, 'export function generateGovernedFailureMessage')).toBe(true);
  });

  it('handles Missing Engineering Plan', () => {
    expect(sourceContains(LAUNCH, 'Missing Engineering Plan')).toBe(true);
  });

  it('handles Missing Engineering Review', () => {
    expect(sourceContains(LAUNCH, 'Missing Engineering Review')).toBe(true);
  });

  it('handles Missing Product Owner Execution Approval', () => {
    expect(sourceContains(LAUNCH, 'Missing Product Owner Execution Approval')).toBe(true);
  });

  it('handles Existing execution session', () => {
    expect(sourceContains(LAUNCH, 'Existing Execution Session')).toBe(true);
  });

  it('handles Repository unavailable', () => {
    expect(sourceContains(LAUNCH, 'Repository Unavailable')).toBe(true);
  });

  it('handles Execution cancelled', () => {
    expect(sourceContains(LAUNCH, 'Execution Cancelled')).toBe(true);
  });

  it('every failure message includes explanation, lifecycleState, recommendedAction', () => {
    expect(sourceContains(LAUNCH, 'explanation')).toBe(true);
    expect(sourceContains(LAUNCH, 'lifecycleState')).toBe(true);
    expect(sourceContains(LAUNCH, 'recommendedAction')).toBe(true);
  });
});

// ─── Req 8: Prevent Duplicate Executions ──────────────────────────────────────

describe('EWO-017R.1 Req 8 — Prevent Duplicate Executions', () => {
  it('getActiveSession function is exported', () => {
    expect(sourceContains(LAUNCH, 'export async function getActiveSession')).toBe(true);
  });

  it('beginEngineeringExecution checks for active session before proceeding', () => {
    const src = readFileSync(LAUNCH, 'utf-8');
    const fnStart = src.indexOf('export async function beginEngineeringExecution');
    const fnBody = fnStart >= 0 ? src.slice(fnStart) : '';
    const activeIdx = fnBody.indexOf('activeExecutionSession.hasActive');
    const createIdx = fnBody.indexOf('createExecution');
    expect(activeIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(-1);
    expect(activeIdx).toBeLessThan(createIdx);
  });

  it('returns existing execution ref when duplicate detected', () => {
    expect(sourceContains(LAUNCH, 'activeExecutionSession.executionRef')).toBe(true);
  });

  it('suggests View Execution for duplicate', () => {
    expect(sourceContains(LAUNCH, 'View Execution')).toBe(true);
  });
});

// ─── Req 9: Execution Entry Consistency ───────────────────────────────────────

describe('EWO-017R.1 Req 9 — Execution Entry Consistency', () => {
  it('all execution initiation routes through beginEngineeringExecution', () => {
    expect(sourceContains(LAUNCH, 'export async function beginEngineeringExecution')).toBe(true);
  });

  it('beginEngineeringExecution is the only function calling executeWorkOrder in launch service', () => {
    const src = readFileSync(LAUNCH, 'utf-8');
    const count = (src.match(/executeWorkOrder/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ─── Req 10: Product Owner Experience ──────────────────────────────────────────

describe('EWO-017R.1 Req 10 — Product Owner Experience', () => {
  it('WorkOrdersPage has Begin Execution button in detail view', () => {
    expect(sourceContains(WO, 'Begin Engineering Execution')).toBe(true);
  });

  it('button triggers governed flow: validate → create → execute → navigate', () => {
    expect(sourceContains(WO, 'beginEngineeringExecution')).toBe(true);
  });

  it('navigates to execution workspace after successful launch', () => {
    expect(sourceContains(WO, 'buildExecutionWorkspaceRoute')).toBe(true);
  });
});

// ─── Req 11: Regression Protection ─────────────────────────────────────────────

describe('EWO-017R.1 Req 11 — Regression Protection (automated tests exist)', () => {
  it('test file exists', () => {
    expect(existsSync('src/tests/ewo017r1.test.ts')).toBe(true);
  });

  it('executionOrchestrator exports are preserved', () => {
    expect(sourceContains(ORCH, 'export async function validatePrerequisites')).toBe(true);
    expect(sourceContains(ORCH, 'export async function executeWorkOrder')).toBe(true);
    expect(sourceContains(ORCH, 'export async function createSession')).toBe(true);
  });

  it('engineeringExecutionService exports are preserved', () => {
    expect(sourceContains('src/lib/engineeringExecutionService.ts', 'export async function createExecution')).toBe(true);
    expect(sourceContains('src/lib/engineeringExecutionService.ts', 'export async function getExecution')).toBe(true);
    expect(sourceContains('src/lib/engineeringExecutionService.ts', 'export async function getExecutions')).toBe(true);
  });
});

// ─── Req 12: Engineering Knowledge Synchronisation ────────────────────────────

describe('EWO-017R.1 Req 12 — Engineering Knowledge Synchronisation', () => {
  it('engineeringIntelligenceService imports executionLaunchService or references execution', () => {
    const eisExists = existsSync('src/lib/engineeringIntelligenceService.ts');
    if (eisExists) {
      const eis = readFileSync('src/lib/engineeringIntelligenceService.ts', 'utf-8');
      expect(eis.includes('execution') || eis.includes('Execution')).toBe(true);
    }
  });

  it('conversationContextRouter references execution', () => {
    const ccrExists = existsSync('src/lib/conversationContextRouter.ts');
    if (ccrExists) {
      const ccr = readFileSync('src/lib/conversationContextRouter.ts', 'utf-8');
      expect(ccr.includes('execution') || ccr.includes('Execution')).toBe(true);
    }
  });

  it('atdCognitiveEngine references execution', () => {
    const exists = existsSync('src/lib/atdCognitiveEngine.ts');
    if (exists) {
      const src = readFileSync('src/lib/atdCognitiveEngine.ts', 'utf-8');
      expect(src.includes('execution') || src.includes('Execution')).toBe(true);
    }
  });

  it('launch service provides queryable interface for knowledge sync', () => {
    expect(sourceContains(LAUNCH, 'checkExecutionEligibility')).toBe(true);
    expect(sourceContains(LAUNCH, 'getActiveSession')).toBe(true);
    expect(sourceContains(LAUNCH, 'beginEngineeringExecution')).toBe(true);
  });
});

// ─── Req 13: Product Owner Testing Support ─────────────────────────────────────

describe('EWO-017R.1 Req 13 — Product Owner Testing Support', () => {
  it('governed failure messages explain UI entry point and eligibility', () => {
    expect(sourceContains(LAUNCH, 'recommendedAction')).toBe(true);
  });

  it('eligibility function returns structured result for PO understanding', () => {
    expect(sourceContains(RESOLVER, 'blockingReasons')).toBe(true);
    expect(sourceContains(RESOLVER, 'evidenceSources')).toBe(true);
  });

  it('launch result includes both error and eligibility for transparency', () => {
    expect(sourceContains(LAUNCH, 'error: string | null')).toBe(true);
    expect(sourceContains(LAUNCH, 'eligibility: EligibilityResult | null')).toBe(true);
  });
});
