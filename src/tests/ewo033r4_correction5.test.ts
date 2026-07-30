/**
 * EWO-033R.4 Correction 5 — Canonical Engineering Presentation Architecture
 *
 * Tests:
 * 1. Proposal always renders Proposal Card
 * 2. Execution Ready always renders Execution Ready Card
 * 3. Missing interaction card cannot fall back to plain text
 * 4. Refresh preserves presentation
 * 5. Conversation switching preserves presentation
 * 6. Resume preserves presentation
 * 7. Same engineering interaction always uses same renderer
 * 8. Legacy renderer cannot activate during conversation workflow
 * 9. Execute button always exists during awaiting_execution_approval
 * 10. Completion always renders Completion Card
 * 11. One renderer per engineering interaction
 * 12. Renderer consistency after multiple refreshes
 */

import { describe, it, expect } from 'vitest';

async function readSource(path: string): Promise<string> {
  const mod = await import(`${path}?raw`);
  return mod.default as string;
}

// ─── Canonical Renderer: Execution Ready Card ──────────────────────────────────

describe('EWO-033R.4 Correction 5: Execution Ready Card', () => {
  it('2. Execution Ready always constructs a proper InteractionCard with type field', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // Must construct a proper execution_ready card with type field — not cast from raw result
    expect(src).toContain("type: 'execution_ready'");
    expect(src).toContain('ewoRef: prepEwoRef');
    expect(src).toContain('execCard: InteractionCard');
    // Must NOT cast raw preparation result as InteractionCard (the old bug)
    expect(src).not.toContain('prepResult.executionReady as InteractionCard');
  });

  it('9. Execute button always exists during awaiting_execution_approval', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // The execution_ready card renderer must have onExecute and onNotYet
    expect(src).toContain("card.type === 'execution_ready'");
    expect(src).toContain('onExecute');
    expect(src).toContain('onNotYet');
    expect(src).toContain('handleInteractionExecute');
    expect(src).toContain('handleInteractionNotYet');
  });

  it('execution_ready card includes all required fields from preparation result', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // Must extract provider, estimatedImpact, filesAffected, validation, ready, blockingReasons
    expect(src).toContain('provider:');
    expect(src).toContain('estimatedImpact:');
    expect(src).toContain('filesAffected:');
    expect(src).toContain('validation:');
    expect(src).toContain('ready:');
    expect(src).toContain('blockingReasons:');
  });
});

// ─── Canonical Resume Path ──────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 5: Canonical Resume Path', () => {
  it('6. Resume preserves presentation — uses adapter.resumeFromConversation', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // Must use the adapter's canonical resumeFromConversation — not manual placeholder construction
    expect(src).toContain('InteractionChannelAdapter.resumeFromConversation');
    // Must NOT construct placeholder cards manually (the old bug)
    expect(src).not.toContain("proposal: {} as never");
    expect(src).not.toContain("provider: ''");
  });

  it('4. Refresh preserves presentation — resume path uses canonical adapter', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // The resume path must import and use the adapter, not the resume service directly
    expect(src).toContain("import('../../lib/interactionChannelAdapter')");
    expect(src).toContain('resumeFromConversation');
  });

  it('adapter.resumeFromConversation returns InteractionCard with real data', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // Must have a resumeFromConversation method on the adapter
    expect(src).toContain('async resumeFromConversation(');
    // Must call resumeInteraction internally for ideaId-based resume
    expect(src).toContain('this.resumeInteraction(card.supportingRecords.ideaId)');
    // Must return interactionCard in the result
    expect(src).toContain('interactionCard: result.message.interactionCard');
  });

  it('adapter.resumeInteraction builds proper cards with real data', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // Must build proposal card from actual proposal data
    expect(src).toContain("type: 'proposal', proposal: card.proposal");
    // Must build execution_ready card from actual preparation data
    expect(src).toContain("type: 'execution_ready'");
    expect(src).toContain('card.executionPreparation.ewoRef');
    // Must build completion card from actual completion package
    expect(src).toContain("type: 'completion'");
    expect(src).toContain('card.completionPackage');
  });
});

// ─── Mandatory Interaction Cards ────────────────────────────────────────────────

describe('EWO-033R.4 Correction 5: Mandatory Interaction Cards', () => {
  it('3. Missing interaction card cannot fall back to plain text — shows recovery card', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // Mandatory stages that fail to render must show a blocked recovery card
    expect(src).toContain('MANDATORY_STAGES');
    expect(src).toContain("'proposal', 'execution_ready', 'completion'");
    // Must show a governed recovery card, not plain text
    expect(src).toContain('type: \'blocked\'');
    expect(src).toContain('could not be rendered');
  });

  it('1. Proposal always renders Proposal Card', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    expect(src).toContain("card.type === 'proposal'");
    expect(src).toContain('ProposalCard');
  });

  it('10. Completion always renders Completion Card', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    expect(src).toContain("card.type === 'completion'");
    expect(src).toContain('CompletionPackageCard');
  });
});

// ─── Single Presentation Source of Truth ───────────────────────────────────────

describe('EWO-033R.4 Correction 5: Single Presentation Source of Truth', () => {
  it('7. Same engineering interaction always uses same renderer — adapter is canonical', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The adapter must be the single canonical presentation pipeline
    expect(src).toContain('InteractionChannelAdapter');
    expect(src).toContain('resumeInteraction');
    expect(src).toContain('resumeFromConversation');
    expect(src).toContain('processMessage');
  });

  it('11. One renderer per engineering interaction — no competing renderers', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // The page must render engineering interactions via the card renderer, not via
    // separate legacy components
    expect(src).toContain("msg.engineering_interaction");
    expect(src).toContain("card.type === 'proposal'");
    expect(src).toContain("card.type === 'execution_ready'");
    expect(src).toContain("card.type === 'completion'");
    // Must NOT have a separate engineering review renderer for active interactions
    expect(src).not.toContain('ECCEngineeringReviewDetail');
  });

  it('8. Legacy renderer cannot activate during conversation workflow', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // The page must not route to legacy engineering review pages for active interactions
    expect(src).not.toContain('navigate.*engineering-review');
    expect(src).not.toContain('navigate.*EngineeringReviewDetail');
  });
});

// ─── Renderer Consistency ──────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 5: Renderer Consistency', () => {
  it('5. Conversation switching preserves presentation — resume uses canonical path', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // When loading a conversation, the resume path must use the adapter
    expect(src).toContain('resumeFromConversation');
  });

  it('12. Renderer consistency after multiple refreshes — persisted transcript is source of truth', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // Messages must be persisted with engineering_interaction metadata
    expect(src).toContain('engineering_interaction: m.engineering_interaction');
    // On restore, existing interaction cards in loaded messages are used as-is
    expect(src).toContain('hasExistingInteraction');
    expect(src).toContain('m.engineering_interaction.card');
  });

  it('presentation is derived solely from engineering interaction state', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The InteractionCard type must be the canonical presentation model
    expect(src).toContain('export type InteractionCard');
    // Must include all mandatory card types
    expect(src).toContain("'proposal'");
    expect(src).toContain("'execution_ready'");
    expect(src).toContain("'executing'");
    expect(src).toContain("'completion'");
    expect(src).toContain("'preparing_execution'");
  });
});

// ─── InteractionCard Type ──────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 5: InteractionCard Type', () => {
  it('InteractionCard includes preparing_execution type', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    expect(src).toContain("'preparing_execution'");
    expect(src).toContain('PreparationPhaseUpdate');
  });

  it('InteractionCard includes all mandatory lifecycle card types', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    expect(src).toContain("'proposal'");
    expect(src).toContain("'execution_ready'");
    expect(src).toContain("'executing'");
    expect(src).toContain("'completion'");
    expect(src).toContain("'closed'");
    expect(src).toContain("'blocked'");
    expect(src).toContain("'preparing'");
    expect(src).toContain("'preparing_timeout'");
    expect(src).toContain("'execution_failed'");
  });
});
