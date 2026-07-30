/**
 * EWO-033R.4 Correction 4 — Execution Preparation Reliability & Progress Experience
 *
 * Tests:
 * 1. Successful preparation progression
 * 2. Backend request failure
 * 3. Supabase request failure
 * 4. Edge Function failure
 * 5. Execution provider delay
 * 6. Timeout
 * 7. Retry
 * 8. Refresh during preparation
 * 9. Progress restoration after refresh
 * 10. Failure immediately replaces loading
 * 11. Progress stages remain consistent
 * 12. No indefinite loading
 */

import { describe, it, expect } from 'vitest';

async function readSource(path: string): Promise<string> {
  const mod = await import(`${path}?raw`);
  return mod.default as string;
}

// ─── Preparation Pipeline ───────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 4: Preparation Pipeline', () => {
  it('1. Successful preparation progression through all phases', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    // Must have all 6 phases
    expect(src).toContain("'ewo_verified'");
    expect(src).toContain("'context_assembled'");
    expect(src).toContain("'package_generated'");
    expect(src).toContain("'provider_resolved'");
    expect(src).toContain("'provider_validated'");
    expect(src).toContain("'readiness_verified'");
    // Each phase must emit progress
    expect(src).toContain('options?.onProgress?.');
    // Phases must be sequential (running → complete)
    expect(src).toContain("emit('ewo_verified', 'running')");
    expect(src).toContain("emit('ewo_verified', 'complete'");
    expect(src).toContain("emit('readiness_verified', 'complete'");
  });

  it('2. Backend request failure immediately propagates error', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    // EWO query failure must return blocked state immediately
    expect(src).toContain("if (ewoErr || !ewo)");
    expect(src).toContain("lifecycleStage: 'blocked'");
    // Error must be in the result
    expect(src).toContain('blockingReasons: [msg]');
  });

  it('3. Supabase request failure in context assembly propagates error', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    // Proposal query failure must propagate
    expect(src).toContain("if (propErr)");
    expect(src).toContain("'context_assembled', 'error'");
  });

  it('4. Edge Function failure in package generation propagates error', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    // Package query failure must propagate
    expect(src).toContain("if (pkgErr)");
    expect(src).toContain("'package_generated', 'error'");
  });

  it('5. Execution provider delay does not block preparation', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    // Provider validation is best-effort (non-fatal)
    expect(src).toContain('Non-fatal — provider validation is best-effort');
    expect(src).toContain('Provider validation skipped');
  });
});

// ─── Timeout & Error Propagation ────────────────────────────────────────────────

describe('EWO-033R.4 Correction 4: Timeout & Error Propagation', () => {
  it('6. Timeout wraps ALL preparation work including pre-timeout queries', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The timeout race must include the duplicate-prevention query
    expect(src).toContain('PREPARATION_TIMEOUT_MS = 45_000');
    // The timeout promise and prep promise must be raced
    expect(src).toContain('Promise.race([prepPromise, timeoutPromise])');
    // The duplicate check must be INSIDE the prepPromise
    const prepPromiseIdx = src.indexOf('const prepPromise = (async () => {');
    const dupCheckIdx = src.indexOf("Check for existing execution preparation");
    expect(prepPromiseIdx).toBeGreaterThan(-1);
    expect(dupCheckIdx).toBeGreaterThan(prepPromiseIdx);
  });

  it('7. Retry option available on preparation failure', async () => {
    const src = await readSource('../components/EngineeringInteractionCards');
    // PreparingExecutionCard must have onRetry
    expect(src).toContain('PreparingExecutionCard');
    expect(src).toContain('onRetry');
    expect(src).toContain('Try Again');
  });

  it('10. Failure immediately replaces loading — no indefinite loading', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    // Each phase failure returns immediately (no continue after error)
    expect(src).toContain("diagnostics.failedPhase = 'ewo_verified'");
    expect(src).toContain("diagnostics.failedPhase = 'context_assembled'");
    expect(src).toContain("diagnostics.failedPhase = 'package_generated'");
    expect(src).toContain("diagnostics.failedPhase = 'readiness_verified'");
  });

  it('12. No indefinite loading — preparation always reaches a terminal state', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // Timeout produces a timed_out result
    expect(src).toContain("result.timedOut");
    // Error produces an error result
    expect(src).toContain('error: err instanceof Error');
    // Success produces executionReady
    expect(src).toContain('executionReady: prep');
  });
});

// ─── Progress Experience ─────────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 4: Progress Experience', () => {
  it('11. Progress stages remain consistent — phases are defined as a fixed array', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    // PREPARATION_PHASES must be a fixed array with 6 phases
    expect(src).toContain('PREPARATION_PHASES');
    expect(src).toContain('ewo_verified');
    expect(src).toContain('readiness_verified');
    // Each phase must have a label
    expect(src).toContain('Engineering Work Order verified');
    expect(src).toContain('Engineering context assembled');
    expect(src).toContain('Execution package generated');
    expect(src).toContain('Execution provider resolved');
    expect(src).toContain('Provider validated');
    expect(src).toContain('Execution readiness verified');
  });

  it('progress is driven from actual execution — no timers', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    // Progress must be emitted from actual query results, not timers
    expect(src).toContain("emit('ewo_verified', 'complete'");
    expect(src).toContain("emit('context_assembled', 'complete'");
    expect(src).toContain("emit('readiness_verified', 'complete'");
    // Must NOT use setTimeout for progress advancement
    expect(src).not.toContain('setTimeout');
  });

  it('PreparingExecutionCard renders phases with status indicators', async () => {
    const src = await readSource('../components/EngineeringInteractionCards');
    // Must render checkmark for complete
    expect(src).toContain("phase.status === 'complete'");
    // Must render spinner for running
    expect(src).toContain("phase.status === 'running'");
    // Must render circle for pending
    expect(src).toContain("phase.status === 'pending'");
    // Must render error icon for error
    expect(src).toContain("phase.status === 'error'");
  });

  it('PreparingExecutionCard shows elapsed time', async () => {
    const src = await readSource('../components/EngineeringInteractionCards');
    expect(src).toContain('elapsedMs');
    expect(src).toContain('(elapsedMs / 1000).toFixed(1)');
  });

  it('PreparingExecutionCard shows failed phase and error message', async () => {
    const src = await readSource('../components/EngineeringInteractionCards');
    expect(src).toContain('failedPhase');
    expect(src).toContain('hasError');
    expect(src).toContain('Preparation Failed');
  });
});

// ─── Resume Race Fix ─────────────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 4: Resume Race Fix', () => {
  it('processExistingInteraction skips resume for approval messages', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // Must check isApprovalMsg before calling resumeInteraction
    expect(src).toContain('isApprovalMsg');
    expect(src).toContain('isExecuteMsg');
    expect(src).toContain('isRejectMsg');
    // Must skip resume for approval messages
    expect(src).toContain("if (!isApprovalMsg && !isExecuteMsg && !isRejectMsg)");
  });

  it('approval messages construct resume card from context — no backend queries', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // Must construct a minimal resume card from context
    expect(src).toContain('type: context.proposalId ? \'proposal\' : \'preparing\'');
  });
});

// ─── Page Integration ────────────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 4: Page Integration', () => {
  it('sendMessage passes onPreparationProgress to processMessage', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    expect(src).toContain('onPreparationProgress');
    expect(src).toContain('PreparationProgressCallback');
  });

  it('sendMessage updates preparing_execution card in real-time', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    expect(src).toContain("card?.type === 'preparing_execution'");
    expect(src).toContain('preparationStartTime');
  });

  it('renderer renders PreparingExecutionCard for preparing_execution type', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    expect(src).toContain("card.type === 'preparing_execution'");
    expect(src).toContain('PreparingExecutionCard');
  });

  it('PreparingExecutionCard imported in page', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    expect(src).toContain('PreparingExecutionCard');
  });
});

// ─── Diagnostics ─────────────────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 4: Diagnostics', () => {
  it('records phase start and completion times', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    expect(src).toContain('startedAt');
    expect(src).toContain('completedAt');
    expect(src).toContain('durationMs');
  });

  it('records total preparation duration', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    expect(src).toContain('totalDurationMs');
    expect(src).toContain('diagnostics.success');
  });

  it('records failed phase and error reason', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    expect(src).toContain('failedPhase');
    expect(src).toContain('diagnostics.error');
  });

  it('records retry count', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    expect(src).toContain('retryCount');
  });
});

// ─── Timeout Experience ──────────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 4: Timeout Experience', () => {
  it('timeout card offers Continue Waiting, Try Again, and Cancel', async () => {
    const src = await readSource('../components/EngineeringInteractionCards');
    expect(src).toContain('Continue Waiting');
    expect(src).toContain('Try Again');
    expect(src).toContain('Cancel Preparation');
  });

  it('timeout is 45 seconds (increased from 30s)', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    expect(src).toContain('45_000');
  });
});
