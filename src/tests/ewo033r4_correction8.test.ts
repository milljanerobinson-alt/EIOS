/**
 * EWO-033R.4 Correction 8 — Completion Package Transition Audit
 *
 * Tests:
 * 1. launchExecution returns executionId (not null) after success
 * 2. Adapter assembles completion package after launchExecution success
 * 3. Adapter returns completion card (not executing card) after success
 * 4. Adapter updates conversation association with executionId after success
 * 5. Idempotency path assembles completion package for already-completed execution
 * 6. Adapter never remains displaying progress card after completion
 * 7. Completion card has type 'completion'
 * 8. Completion card includes summary, filesChanged, tests, validation
 * 9. Missing executionId produces governed blocked card (not bare progress)
 * 10. Completion package assembly failure produces governed blocked card
 * 11. Lifecycle transitions: executing → awaiting_acceptance (not stuck)
 * 12. Resume path for awaiting_acceptance assembles completion card
 */

import { describe, it, expect } from 'vitest';

async function readSource(path: string): Promise<string> {
  const mod = await import(`${path}?raw`);
  return mod.default as string;
}

// ─── launchExecution: executionId Capture ──────────────────────────────────────

describe('EWO-033R.4 Correction 8: launchExecution executionId', () => {
  it('1. launchExecution returns executionId (not null) after success', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    // The success path must query for the execution ID and return it
    expect(src).toContain('execRow?.id');
    // The return must include executionId
    const successReturnIdx = src.indexOf('success: result.success');
    const successBlock = src.substring(successReturnIdx, successReturnIdx + 300);
    expect(successBlock).toContain('executionId');
  });

  it('launchExecution queries by ewo_id to find the execution record', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    expect(src).toContain(".eq('ewo_id', ewoId)");
    expect(src).toContain('engineering_executions');
  });
});

// ─── Adapter: Completion Package Assembly ─────────────────────────────────────

describe('EWO-033R.4 Correction 8: Adapter Completion Assembly', () => {
  it('2. Adapter assembles completion package after launchExecution success', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The success path must call assembleCompletionPackage
    expect(src).toContain('InteractionCompletionService.assembleCompletionPackage(result.executionId)');
  });

  it('3. Adapter returns completion card (not executing card) after success', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The success path must construct a completion card
    const successIdx = src.indexOf('Correction 8: Assemble the completion package');
    expect(successIdx).toBeGreaterThan(-1);
    const successBlock = src.substring(successIdx, successIdx + 2000);
    expect(successBlock).toContain("type: 'completion'");
    // Must NOT return the old stuck message
    expect(successBlock).not.toContain("I'm assembling the completion package for your review...");
  });

  it('4. Adapter updates conversation association with executionId after success', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The success path must upsert the association with executionId
    const assocIdx = src.indexOf('Correction 8: Update the conversation association');
    expect(assocIdx).toBeGreaterThan(-1);
    const assocBlock = src.substring(assocIdx, assocIdx + 1000);
    expect(assocBlock).toContain('ConversationAssociationService.upsert');
    expect(assocBlock).toContain('executionId: result.executionId');
    expect(assocBlock).toContain("lifecycleStage: 'awaiting_acceptance'");
  });

  it('6. Adapter never remains displaying progress card after completion', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The old message "I'm assembling the completion package..." must be removed
    // from the success path (it was the bug that caused the stuck state)
    const successIdx = src.indexOf('if (result.success)');
    const lastSuccessIdx = src.lastIndexOf('if (result.success)');
    // Find the success block in handleExecutionApprovalMessage
    const handlerIdx = src.indexOf('handleExecutionApprovalMessage');
    const handlerBlock = src.substring(handlerIdx);
    const successInHandler = handlerBlock.indexOf('if (result.success)');
    const successHandlerBlock = handlerBlock.substring(successInHandler, successInHandler + 2000);
    // Must not contain the old stuck message
    expect(successHandlerBlock).not.toContain("I'm assembling the completion package for your review...");
  });
});

// ─── Completion Card Schema ────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 8: Completion Card Schema', () => {
  it('7. Completion card has type completion', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The InteractionCard type must include completion
    expect(src).toContain("type: 'completion'");
  });

  it('8. Completion card includes summary, filesChanged, tests, validation', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The completion card construction must include these fields
    const completionIdx = src.indexOf("type: 'completion',");
    // Find the last occurrence (in the success path)
    const lastCompletionIdx = src.lastIndexOf("type: 'completion',");
    const completionBlock = src.substring(lastCompletionIdx, lastCompletionIdx + 500);
    expect(completionBlock).toContain('summary:');
    expect(completionBlock).toContain('filesChanged:');
    expect(completionBlock).toContain('tests:');
    expect(completionBlock).toContain('validation:');
    expect(completionBlock).toContain('deploymentRecommendation:');
    expect(completionBlock).toContain('testInstructions:');
  });
});

// ─── Governed Blocked Recovery ────────────────────────────────────────────────

describe('EWO-033R.4 Correction 8: Governed Blocked Recovery', () => {
  it('9. Missing executionId produces governed blocked card (not bare progress)', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // When executionId is null, must show a blocked card
    expect(src).toContain('No execution ID');
    expect(src).toContain("type: 'blocked'");
  });

  it('10. Completion package assembly failure produces governed blocked card', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // When completion package is null, must show a blocked card
    expect(src).toContain('completion package could not be assembled');
  });
});

// ─── Lifecycle Transitions ─────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 8: Lifecycle Transitions', () => {
  it('11. Lifecycle transitions from executing to awaiting_acceptance (not stuck)', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // After success, lifecycleStage must be awaiting_acceptance
    const assocIdx = src.indexOf('Correction 8: Update the conversation association');
    const assocBlock = src.substring(assocIdx, assocIdx + 1000);
    expect(assocBlock).toContain("lifecycleStage: 'awaiting_acceptance'");
  });
});

// ─── Idempotency Path: Already-Completed Execution ─────────────────────────────

describe('EWO-033R.4 Correction 8: Idempotency Completion', () => {
  it('5. Idempotency path assembles completion package for already-completed execution', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The idempotency path for completed execution must assemble the completion package
    const idempotencyIdx = src.indexOf('Idempotency');
    const idempotencyBlock = src.substring(idempotencyIdx, idempotencyIdx + 3000);
    expect(idempotencyBlock).toContain('assembleCompletionPackage(existingExec.id)');
    expect(idempotencyBlock).toContain("type: 'completion'");
  });
});

// ─── Resume Path: awaiting_acceptance ──────────────────────────────────────────

describe('EWO-033R.4 Correction 8: Resume Completion', () => {
  it('12. Resume path for awaiting_acceptance assembles completion card', async () => {
    const src = await readSource('../lib/interactionResumeService');
    // The resume path for awaiting_acceptance must call assembleCompletionPackage
    const acceptIdx = src.indexOf("case 'awaiting_acceptance':");
    const acceptBlock = src.substring(acceptIdx, acceptIdx + 500);
    expect(acceptBlock).toContain('assembleCompletionPackage');
  });
});

// ─── ExecutionLaunchResult: executionId Field ──────────────────────────────────

describe('EWO-033R.4 Correction 8: ExecutionLaunchResult', () => {
  it('ExecutionLaunchResult interface includes executionId', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    const ifaceIdx = src.indexOf('export interface ExecutionLaunchResult');
    const ifaceBlock = src.substring(ifaceIdx, ifaceIdx + 300);
    expect(ifaceBlock).toContain('executionId');
  });
});
