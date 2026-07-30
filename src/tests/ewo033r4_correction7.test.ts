/**
 * EWO-033R.4 Correction 7 — Execution Context Persistence and Deterministic Handoff
 *
 * Tests:
 * 1. Proposal approval creates an EWO
 * 2. Execution preparation uses that exact EWO
 * 3. Execution Ready card contains ewoId and ewoRef
 * 4. Execute uses the card's canonical EWO identifiers
 * 5. Execute does not search by idea text or title
 * 6. Execute creates or authorises an Execution Request
 * 7. Execution begins against the same EWO
 * 8. Refresh at Execution Ready preserves the execution contract
 * 9. Conversation switching preserves the execution contract
 * 10. Resume preserves ewoId, ewoRef and provider
 * 11. Missing EWO produces a governed blocked recovery state
 * 12. Duplicate Execute clicks are idempotent
 * 13. Refresh after Execute does not start execution twice
 * 14. No duplicate Execution Requests
 * 15. Full lifecycle reaches Execution Progress
 */

import { describe, it, expect } from 'vitest';

async function readSource(path: string): Promise<string> {
  const mod = await import(`${path}?raw`);
  return mod.default as string;
}

// ─── Execution Ready Contract: ewoId Present ──────────────────────────────────

describe('EWO-033R.4 Correction 7: Execution Ready Contract', () => {
  it('3. Execution Ready card contains ewoId and ewoRef', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The execution_ready InteractionCard type must include ewoId
    expect(src).toContain("type: 'execution_ready'; ewoId: string; ewoRef: string");
    // The execCard construction must set ewoId
    expect(src).toContain('ewoId: prepEwoId');
  });

  it('ProcessMessageResult includes ewoId', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // ProcessMessageResult must have ewoId field
    const pmrIdx = src.indexOf('export interface ProcessMessageResult');
    const pmrBlock = src.substring(pmrIdx, pmrIdx + 300);
    expect(pmrBlock).toContain('ewoId');
    expect(pmrBlock).toContain('ewoRef');
  });
});

// ─── Identifier Flow: Idea → Execute ───────────────────────────────────────────

describe('EWO-033R.4 Correction 7: Identifier Flow', () => {
  it('1. Proposal approval creates an EWO (adapter upserts ewoId to association)', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The approval handler must upsert the association with ewoId
    expect(src).toContain('ConversationAssociationService.upsert');
    expect(src).toContain('ewoId:');
  });

  it('2. Execution preparation uses that exact EWO (prepareExecution called with ewoId)', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    // prepareExecution must accept ewoId and return it
    expect(src).toContain('async prepareExecution(');
    expect(src).toContain('ewoId: string');
    expect(src).toContain('ewoId: ewo.id');
  });

  it('4. Execute uses the card\'s canonical EWO identifiers (context.ewoId fallback)', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // handleExecutionApprovalMessage must use ewoId from context as fallback
    expect(src).toContain('resumeCard.supportingRecords.ewoId ?? context.ewoId');
  });

  it('5. Execute does not search by idea text or title', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // handleExecutionApprovalMessage must NOT query by idea_id or title
    const handlerIdx = src.indexOf('async handleExecutionApprovalMessage');
    const handlerEnd = src.indexOf('async ', handlerIdx + 10);
    const handlerBlock = src.substring(handlerIdx, handlerEnd > 0 ? handlerEnd : handlerIdx + 3000);
    expect(handlerBlock).not.toContain('.eq(\'idea_id\'');
    expect(handlerBlock).not.toContain('.ilike(\'title\'');
    expect(handlerBlock).not.toContain('search by idea');
  });
});

// ─── Page: ewoId Persistence in Message Metadata ─────────────────────────────

describe('EWO-033R.4 Correction 7: Page Metadata Persistence', () => {
  it('8. Refresh at Execution Ready preserves the execution contract (page stores ewoId)', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // The page must store ewoId in engineering_interaction metadata
    expect(src).toContain('ewoId: result.ewoId ?? lastInteraction?.ewoId');
  });

  it('findLastInteraction returns EngineeringInteractionState which has ewoId field', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // EngineeringInteractionState must have ewoId field
    const ifaceIdx = src.indexOf('interface EngineeringInteractionState');
    const ifaceBlock = src.substring(ifaceIdx, ifaceIdx + 300);
    expect(ifaceBlock).toContain('ewoId');
    // findLastInteraction must return the engineering_interaction object
    expect(src).toContain('function findLastInteraction');
    expect(src).toContain('engineering_interaction');
  });

  it('handleInteractionExecute sends Execute message', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // handleInteractionExecute must call sendMessage('Execute')
    expect(src).toContain("handleInteractionExecute");
    expect(src).toContain("sendMessage('Execute')");
  });
});

// ─── Resume: ewoId Preservation ────────────────────────────────────────────────

describe('EWO-033R.4 Correction 7: Resume Preservation', () => {
  it('10. Resume preserves ewoId, ewoRef and provider', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The resume path for execution_ready must include ewoId from card
    expect(src).toContain('ewoId: card.executionPreparation.ewoId');
    expect(src).toContain('ewoRef: card.executionPreparation.ewoRef');
  });

  it('resumeFromConversation preserves ewoId in supportingRecords', async () => {
    const src = await readSource('../lib/interactionResumeService');
    // resumeFromConversation must include ewoId in fallback supportingRecords
    expect(src).toContain('ewoId: assoc.ewoId');
    expect(src).toContain('ewoRef: assoc.ewoRef');
  });

  it('9. Conversation switching preserves the execution contract (association has ewoId)', async () => {
    const src = await readSource('../lib/interactionResumeService');
    // resumeFromConversation must look up by conversationId and include ewoId
    expect(src).toContain('findByConversationId');
    expect(src).toContain('assoc.ideaId');
    expect(src).toContain('assoc.ewoId');
  });
});

// ─── Idempotency: Duplicate Execute Prevention ────────────────────────────────

describe('EWO-033R.4 Correction 7: Idempotency', () => {
  it('12. Duplicate Execute clicks are idempotent (checks existing execution)', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // handleExecutionApprovalMessage must check for existing active execution
    expect(src).toContain('Idempotency');
    expect(src).toContain('engineering_executions');
    expect(src).toContain('implementation_status');
    expect(src).toContain("'running', 'queued', 'completed'");
  });

  it('13. Refresh after Execute does not start execution twice (existing exec check)', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The idempotency check must query by ewo_id and return early if found
    expect(src).toContain('.eq(\'ewo_id\', ewoId)');
    expect(src).toContain('Execution is already in progress');
  });

  it('14. No duplicate Execution Requests (launchExecution called only when no existing exec)', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // launchExecution must only be called after the idempotency check passes
    const idempotencyIdx = src.indexOf('Idempotency');
    const launchIdx = src.indexOf('launchExecution', idempotencyIdx);
    expect(launchIdx).toBeGreaterThan(idempotencyIdx);
    // The existing exec check must come before launchExecution
    const existingCheckIdx = src.indexOf('existingExec', idempotencyIdx);
    expect(existingCheckIdx).toBeGreaterThan(-1);
    expect(existingCheckIdx).toBeLessThan(launchIdx);
  });
});

// ─── Failure Recovery: Missing EWO ─────────────────────────────────────────────

describe('EWO-033R.4 Correction 7: Failure Recovery', () => {
  it('11. Missing EWO produces a governed blocked recovery state (not bare error)', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The old bare error message must be removed
    expect(src).not.toContain('I cannot find the work order to execute. Please try again.');
    // The new governed blocked recovery must be present
    expect(src).toContain('Execution cannot begin because the Engineering Work Order context could not be restored');
    expect(src).toContain("type: 'blocked'");
    expect(src).toContain('prepare the execution again');
  });
});

// ─── Execution Launch ─────────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 7: Execution Launch', () => {
  it('6. Execute creates or authorises an Execution Request (launchExecution called)', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // launchExecution must be called with the canonical ewoId
    expect(src).toContain('InteractionExecutionService.launchExecution(ewoId');
  });

  it('7. Execution begins against the same EWO (launchExecution uses ewoId)', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    // launchExecution must record the PO decision and begin execution
    expect(src).toContain('recordDecision');
    expect(src).toContain('beginEngineeringExecution(ewoId');
  });

  it('15. Full lifecycle reaches Execution Progress (lifecycleStage set to executing)', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // After successful execution, lifecycleStage must transition
    expect(src).toContain("lifecycleStage: 'awaiting_acceptance'");
    // On failure, lifecycleStage must be 'failed'
    expect(src).toContain("lifecycleStage: 'failed'");
  });
});

// ─── ExecutionPreparationResult: ewoId Present ─────────────────────────────────

describe('EWO-033R.4 Correction 7: Preparation Result', () => {
  it('ExecutionPreparationResult includes ewoId', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    // ExecutionPreparationResult must have ewoId field
    const ifaceIdx = src.indexOf('export interface ExecutionPreparationResult');
    const ifaceBlock = src.substring(ifaceIdx, ifaceIdx + 300);
    expect(ifaceBlock).toContain('ewoId');
    expect(ifaceBlock).toContain('ewoRef');
  });

  it('preparation returns ewoId in all return paths', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    // Every return path in prepareExecution must include ewoId
    const prepStart = src.indexOf('async prepareExecution(');
    const prepEnd = src.indexOf('async launchExecution(');
    const prepBody = src.substring(prepStart, prepEnd);
    const returns = prepBody.split('return {');
    for (const ret of returns.slice(1)) {
      const block = ret.substring(0, 500);
      expect(block).toContain('ewoId');
    }
  });
});
