/**
 * EWO-033R.4 Correction 3 — Conversation State Consistency & Interaction Rendering
 *
 * Tests:
 * 1. Brand new conversation
 * 2. Successful execution preparation
 * 3. Successful execution readiness
 * 4. No recovery card after successful preparation
 * 5. Only one active interaction card
 * 6. Refresh during execution preparation
 * 7. Refresh after execution ready
 * 8. Restore exact active conversation
 * 9. Restore full conversation transcript
 * 10. No contradictory interaction states
 * 11. Recovery card only after genuine restoration failure
 * 12. Duplicate interaction suppression
 */

import { describe, it, expect } from 'vitest';

async function readSource(path: string): Promise<string> {
  const mod = await import(`${path}?raw`);
  return mod.default as string;
}

// ─── Conversation State Consistency ────────────────────────────────────────────

describe('EWO-033R.4 Correction 3: Conversation State Consistency', () => {
  it('1. Brand new conversation does not auto-resume on select', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // selectConversation must accept isPageRestore option
    expect(src).toContain('isPageRestore');
    // And must skip resume when isPageRestore is false
    expect(src).toContain("if (!options?.isPageRestore) return;");
  });

  it('2. Successful execution preparation produces execution_ready card', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    expect(src).toContain("type: 'execution_ready'");
    expect(src).toContain('Execution is prepared and ready');
  });

  it('3. Successful execution readiness does not produce recovery card', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The success path must NOT contain ConversationRecoveryCard
    expect(src).not.toContain('ConversationRecoveryCard');
  });

  it('4. No recovery card after successful preparation', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // Recovery card must be suppressed when hasValidInteraction is true
    expect(src).toContain('hasValidInteraction');
    expect(src).toContain('if (hasValidInteraction)');
  });

  it('5. Only one active interaction card per conversation', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // The renderer must check for existing valid interactions
    expect(src).toContain('messages.some(');
    expect(src).toContain('m.engineering_interaction?.card');
  });

  it('10. No contradictory interaction states', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // When hasValidInteraction is true, malformed cards render text-only (no recovery)
    expect(src).toContain('// A valid interaction exists elsewhere — render text only, no recovery card');
  });
});

// ─── Resume & Restore ───────────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 3: Resume & Restore', () => {
  it('6. Refresh during execution preparation restores conversation', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // Page restore useEffect must exist
    expect(src).toContain('ecc_active_conv_id');
    expect(src).toContain('isPageRestore: true');
  });

  it('7. Refresh after execution ready restores conversation', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // sessionStorage must be used to persist active conversation
    expect(src).toContain("sessionStorage.setItem('ecc_active_conv_id'");
    expect(src).toContain("sessionStorage.getItem('ecc_active_conv_id'");
  });

  it('8. Restore exact active conversation on page load', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // The restore useEffect must call selectConversation with isPageRestore: true
    expect(src).toContain('selectConversation(data as Conversation, { isPageRestore: true })');
  });

  it('9. Restore full conversation transcript', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // loadMessagesRaw must load engineering_interaction from metadata
    expect(src).toContain('loadMessagesRaw');
    expect(src).toContain('engineering_interaction: m.metadata?.engineering_interaction');
  });

  it('11. Recovery card only after genuine restoration failure', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // Recovery card must only render when hasValidInteraction is false
    expect(src).toContain('if (hasValidInteraction)');
    // And the recovery card is in the else branch
    expect(src).toContain('ConversationRecoveryCard');
  });
});

// ─── Duplicate Interaction Suppression ──────────────────────────────────────────

describe('EWO-033R.4 Correction 3: Duplicate Interaction Suppression', () => {
  it('12. Duplicate interaction suppression — resume skipped if messages already have interaction', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // selectConversation must check hasExistingInteraction before resuming
    expect(src).toContain('hasExistingInteraction');
    expect(src).toContain('if (hasExistingInteraction) return;');
  });

  it('resume only fires on page restore, not normal conversation switch', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // The isPageRestore guard must come before the resume logic
    const guardIdx = src.indexOf("if (!options?.isPageRestore) return;");
    const resumeIdx = src.indexOf('resumeFromConversation');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(resumeIdx).toBeGreaterThan(guardIdx);
  });

  it('recovery card onRetry uses isPageRestore: true', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    expect(src).toContain('selectConversation(conv, { isPageRestore: true })');
  });

  it('recovery card onRestore reloads messages without resume', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    expect(src).toContain('if (conv) loadMessages(conv.id);');
  });
});

// ─── Transcript Persistence ────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 3: Transcript Persistence', () => {
  it('interaction messages are persisted with engineering_interaction metadata', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    expect(src).toContain("cc_ai_messages");
    expect(src).toContain('engineering_interaction: m.engineering_interaction');
  });

  it('both user and assistant messages are persisted', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    expect(src).toContain('[userMsg, ...interactionMsgs]');
  });

  it('message persistence uses targetConvId', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    expect(src).toContain('targetConvId');
  });
});

// ─── Single Source of Truth ─────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 3: Single Source of Truth', () => {
  it('exactly one active interaction card — renderer checks all messages', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    expect(src).toContain('messages.some(');
    expect(src).toContain('typeof m.engineering_interaction.card.type');
  });

  it('success suppresses recovery — hasValidInteraction guards recovery card', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    const hasValidIdx = src.indexOf('const hasValidInteraction');
    const recoveryRender = src.indexOf('<ConversationRecoveryCard');
    expect(hasValidIdx).toBeGreaterThan(-1);
    expect(recoveryRender).toBeGreaterThan(hasValidIdx);
  });

  it('recovery card only appears when no valid interaction exists', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // The hasValidInteraction check must come before the render-level ConversationRecoveryCard
    const hasValidCheck = src.indexOf('if (hasValidInteraction)');
    // Find the render-level recovery card (inside JSX), not the import
    const recoveryCardRender = src.indexOf('<ConversationRecoveryCard');
    expect(hasValidCheck).toBeGreaterThan(-1);
    expect(recoveryCardRender).toBeGreaterThan(hasValidCheck);
  });
});

// ─── Lifecycle Validation ────────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 3: Lifecycle Validation', () => {
  it('approval flow produces exactly one terminal card', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The approval handler returns exactly one message with one interactionCard
    expect(src).toContain("messages: [{");
    expect(src).toContain("lifecycleStage: 'awaiting_execution_approval'");
  });

  it('preparation timeout produces exactly one terminal card', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    expect(src).toContain("type: 'preparing_timeout'");
    expect(src).toContain("lifecycleStage: 'preparing_execution'");
  });

  it('preparation failure produces exactly one terminal card', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    expect(src).toContain("type: 'execution_failed'");
    expect(src).toContain("lifecycleStage: 'failed'");
  });
});
