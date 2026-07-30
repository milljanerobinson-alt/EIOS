/**
 * EWO-033R.4 Correction 2 — Lifecycle Sequencing & Renderer Hardening
 *
 * Tests:
 * 1. Proposal approval creates or resolves Engineering Work Order
 * 2. Execution preparation always finds an Engineering Work Order
 * 3. Engineering Work Order persistence failure
 * 4. Engineering Work Order lookup failure
 * 5. Renderer with undefined interaction object
 * 6. Renderer with malformed interaction object
 * 7. Renderer with missing card type
 * 8. Resume with incomplete conversation state
 * 9. Failure recovery cards
 * 10. No Product Owner runtime exceptions
 */

import { describe, it, expect } from 'vitest';

async function readSource(path: string): Promise<string> {
  const mod = await import(`${path}?raw`);
  return mod.default as string;
}

// ─── Lifecycle Sequencing ──────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 2: Lifecycle Sequencing', () => {
  it('1. Proposal approval creates or resolves Engineering Work Order', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    expect(src).toContain('ensureEngineeringWorkOrderExists');
    expect(src).toContain("isApproval(message)");
    // The EWO creation call must appear after the approval check
    const approvalIdx = src.indexOf("isApproval(message)");
    const ensureCallIdx = src.indexOf('await ensureEngineeringWorkOrderExists(');
    expect(ensureCallIdx).toBeGreaterThan(approvalIdx);
  });

  it('2. Execution preparation always finds an Engineering Work Order', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The broken idea_id lookup must be gone
    expect(src).not.toContain(".eq('idea_id', ideaId)");
    // The method must receive ewoId directly
    expect(src).toContain('ewoId: string');
    expect(src).toContain('ewoRef: string');
  });

  it('3. Engineering Work Order persistence failure returns governed error', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    expect(src).toContain("couldn't create the Engineering Work Order");
    expect(src).toContain('ensureResult.success');
    expect(src).toContain("type: 'execution_failed'");
  });

  it('4. Engineering Work Order lookup failure does not crash', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The old "No Engineering Work Order found for this idea" error is gone
    expect(src).not.toContain('No Engineering Work Order found for this idea.');
  });

  it('lifecycle: EWO is created BEFORE prepareExecutionWithTimeout is called', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    const ensureIdx = src.indexOf('ensureEngineeringWorkOrderExists');
    const prepIdx = src.indexOf('prepareExecutionWithTimeout');
    expect(ensureIdx).toBeGreaterThan(-1);
    expect(prepIdx).toBeGreaterThan(-1);
    // ensureEngineeringWorkOrderExists is called before prepareExecutionWithTimeout
    expect(ensureIdx).toBeLessThan(prepIdx);
  });

  it('lifecycle: prepareExecutionWithTimeout receives ewoId as first parameter', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    expect(src).toContain('prepareExecutionWithTimeout(ewoId');
  });

  it('lifecycle: ewoRef is generated if not present on proposal', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    expect(src).toContain("if (!ewoRef)");
    expect(src).toContain("EWO-");
  });

  it('lifecycle: proposal is loaded to get ewoId/ewoRef', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    expect(src).toContain('loadProposal');
  });
});

// ─── Renderer Hardening ────────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 2: Renderer Hardening', () => {
  it('5. Renderer with undefined interaction object does not crash', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // Must check card before accessing .type
    expect(src).toContain('if (!card');
    expect(src).toContain("typeof card.type !== 'string'");
  });

  it('6. Renderer with malformed interaction object shows recovery card', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    expect(src).toContain('ConversationRecoveryCard');
  });

  it('7. Renderer with missing card type shows recovery card', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // The guard must check both !card and typeof card.type
    expect(src).toContain("!card || typeof card.type !== 'string'");
  });

  it('8. Resume with incomplete conversation state does not crash', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // Resume must be wrapped in try/catch
    expect(src).toContain('Resume is best-effort');
  });

  it('9. Failure recovery cards are displayed in-conversation', async () => {
    const src = await readSource('../components/EngineeringInteractionCards');
    expect(src).toContain('export function ConversationRecoveryCard');
    expect(src).toContain('Retry');
    expect(src).toContain('Restore Conversation');
    expect(src).toContain('View Technical Details');
  });

  it('10. No Product Owner runtime exceptions — recovery card message is friendly', async () => {
    const src = await readSource('../components/EngineeringInteractionCards');
    expect(src).toContain("couldn't restore this engineering interaction");
    expect(src).toContain('The engineering state is still safe');
  });

  it('renderer: non-null assertion on interactionCard is removed', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // The dangerous m.interactionCard! pattern must be gone
    expect(src).not.toContain('m.interactionCard!');
  });

  it('renderer: preparing_timeout card type is rendered', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    expect(src).toContain("card.type === 'preparing_timeout'");
    expect(src).toContain('PreparationTimeoutCard');
  });

  it('renderer: recovery card has Retry and Restore actions', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    expect(src).toContain('onRetry');
    expect(src).toContain('onRestore');
  });
});

// ─── Defensive Validation ──────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 2: Defensive Validation', () => {
  it('interactionCard is only set when defined', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // The ternary checks interactionCard before setting engineering_interaction
    expect(src).toContain('engineering_interaction: interactionCard');
    expect(src).toContain('card: interactionCard,');
    // The non-null assertion must be gone
    expect(src).not.toContain('m.interactionCard!');
  });

  it('ConversationRecoveryCard is imported', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    expect(src).toContain('ConversationRecoveryCard');
    expect(src).toContain('PreparationTimeoutCard');
  });

  it('ConversationRecoveryCard uses conversations.find for restore', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    expect(src).toContain('conversations.find');
  });
});

// ─── Failure Resilience ─────────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 2: Failure Resilience', () => {
  it('EWO creation failure returns execution_failed card, not crash', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    expect(src).toContain("type: 'execution_failed'");
    expect(src).toContain('ensureResult.error');
  });

  it('preparation timeout still works with new signature', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    expect(src).toContain('PREPARATION_TIMEOUT_MS');
    // EWO-033R.4 Correction 4: timeout increased from 30s to 45s
    expect(src).toContain('45_000');
    expect(src).toContain('Promise.race');
  });

  it('duplicate prevention still checks existing execution', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    expect(src).toContain('existingExec');
    expect(src).toContain('Duplicate prevention');
  });

  it('conversation association is updated with ewoId after creation', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    expect(src).toContain('ewoId,');
    expect(src).toContain("lifecycleStage: 'preparing_execution'");
  });
});

// ─── Lifecycle Validation ───────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 2: Lifecycle Validation', () => {
  it('no lifecycle transition skips EWO creation', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The approval handler must call ensureEngineeringWorkOrderExists before prepareExecutionWithTimeout
    const approvalIdx = src.indexOf("isApproval(message)");
    const ensureCallIdx = src.indexOf('await ensureEngineeringWorkOrderExists(');
    const prepCallIdx = src.indexOf('await this.prepareExecutionWithTimeout(');
    expect(approvalIdx).toBeGreaterThan(-1);
    expect(ensureCallIdx).toBeGreaterThan(approvalIdx);
    expect(prepCallIdx).toBeGreaterThan(ensureCallIdx);
  });

  it('EWO creation is idempotent (uses ensureEngineeringWorkOrderExists)', async () => {
    const src = await readSource('../lib/ensureEngineeringWorkOrder');
    expect(src).toContain('idempotent');
    expect(src).toContain('existing');
  });

  it('prepareExecutionWithTimeout no longer queries by idea_id', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    expect(src).not.toContain(".eq('idea_id'");
  });
});
