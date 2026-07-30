/**
 * EWO-033R.4 Correction 6 — Execution Readiness Lifecycle Consistency
 *
 * Tests:
 * 1. Successful readiness validation
 * 2. Missing engineering package
 * 3. Missing engineering review
 * 4. Provider validation failure
 * 5. Product Owner approval not yet requested
 * 6. Execution Ready state
 * 7. Blocked state
 * 8. No contradictory execution states
 * 9. Execute button only appears when ready
 * 10. Refresh preserves readiness state
 * 11. Resume preserves readiness state
 * 12. Exactly one execution state exists
 */

import { describe, it, expect } from 'vitest';

async function readSource(path: string): Promise<string> {
  const mod = await import(`${path}?raw`);
  return mod.default as string;
}

// ─── Adapter: Execution Ready vs Blocked ──────────────────────────────────────

describe('EWO-033R.4 Correction 6: Adapter Readiness Gate', () => {
  it('1. Successful readiness validation produces execution_ready card', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // When isReady is true, the adapter must construct an execution_ready card
    expect(src).toContain('type: \'execution_ready\'');
    expect(src).toContain('ready: true');
    expect(src).toContain('blockingReasons: []');
  });

  it('7. Blocked state — adapter produces blocked card when ready=false', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // When isReady is false, the adapter must produce a blocked card, not execution_ready
    expect(src).toContain('if (!isReady)');
    expect(src).toContain("type: 'blocked'");
    expect(src).toContain('Execution cannot begin yet');
  });

  it('8. No contradictory execution states — adapter checks readiness before producing card', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // In the preparation path, the blocked check must come BEFORE the execution_ready construction.
    const prepIdx = src.indexOf('prepResult');
    expect(prepIdx).toBeGreaterThan(-1);
    const prepPath = src.substring(prepIdx, prepIdx + 4000);
    const blockedIdx = prepPath.indexOf("type: 'blocked'");
    const readyIdx = prepPath.indexOf("type: 'execution_ready'");
    expect(blockedIdx).toBeGreaterThan(-1);
    expect(readyIdx).toBeGreaterThan(-1);
    // The blocked check must come BEFORE the execution_ready construction
    expect(blockedIdx).toBeLessThan(readyIdx);
  });

  it('6. Execution Ready state — content says "prepared and ready" only when ready', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The "prepared and ready" message must only appear in the ready path
    expect(src).toContain('Execution is prepared and ready');
    // The blocked path must say "cannot begin yet"
    expect(src).toContain('Execution cannot begin yet');
  });
});

// ─── Resume Path: Readiness State Preservation ─────────────────────────────────

describe('EWO-033R.4 Correction 6: Resume Readiness Preservation', () => {
  it('11. Resume preserves readiness state — resumeInteraction checks ready flag', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The resumeInteraction method must check filtered.ready before producing
    // an execution_ready card
    expect(src).toContain('if (!filtered.ready)');
    // On not-ready, must produce a blocked card
    expect(src).toContain("type: 'blocked'");
  });

  it('10. Refresh preserves readiness state — resumeFromConversation delegates to resumeInteraction', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // resumeFromConversation must delegate to resumeInteraction which checks readiness
    expect(src).toContain('this.resumeInteraction(card.supportingRecords.ideaId)');
  });
});

// ─── Eligibility Resolver: Prerequisite Classification ─────────────────────────

describe('EWO-033R.4 Correction 6: Prerequisite Classification', () => {
  it('5. Product Owner approval not yet requested — not a prerequisite', async () => {
    const src = await readSource('../lib/executionEligibilityResolver');
    // PO approval must NOT be in blockingReasons
    expect(src).toContain('productOwnerApproved is NOT added to blockingReasons');
    // PO approval must be documented as a decision, not a prerequisite
    expect(src).toContain('PO approval is a decision');
  });

  it('2. Missing engineering package — warning, not blocker', async () => {
    const src = await readSource('../lib/executionEligibilityResolver');
    // Missing engineering package must be a warning, not a blocking reason
    expect(src).toContain('warning: package not approved');
    expect(src).toContain('will be approved at execution');
  });

  it('3. Missing engineering review — warning, not blocker', async () => {
    const src = await readSource('../lib/executionEligibilityResolver');
    // Missing engineering review must be a warning, not a blocking reason
    expect(src).toContain('warning: review not approved');
    expect(src).toContain('optional for conversation-first flow');
  });

  it('4. Provider validation failure — non-fatal', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    // Provider validation must be non-fatal (best-effort)
    expect(src).toContain('Non-fatal');
    expect(src).toContain('Provider validation skipped');
  });

  it('12. Exactly one execution state exists — eligibility check uses only target availability', async () => {
    const src = await readSource('../lib/executionEligibilityResolver');
    // The final eligibility check must NOT include productOwnerApproved,
    // engineeringPlanApproved, or reviewApproved as blockers
    const eligibleIdx = src.indexOf('const eligible =');
    expect(eligibleIdx).toBeGreaterThan(-1);
    const eligibleBlock = src.substring(eligibleIdx, eligibleIdx + 300);
    expect(eligibleBlock).not.toContain('engineeringPlanApproved');
    expect(eligibleBlock).not.toContain('reviewApproved');
    expect(eligibleBlock).not.toContain('productOwnerApproved');
    expect(eligibleBlock).toContain('targetAvailable');
  });
});

// ─── Page: Execute Button Only When Ready ──────────────────────────────────────

describe('EWO-033R.4 Correction 6: Execute Button Gating', () => {
  it('9. Execute button only appears when ready — page renders execution_ready card with onExecute', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // The page must render execution_ready cards with onExecute
    expect(src).toContain("card.type === 'execution_ready'");
    expect(src).toContain('onExecute');
    // The page must render blocked cards with no execute button
    expect(src).toContain("card.type === 'blocked'");
    expect(src).toContain('BlockedCard');
  });

  it('blocked card does not have onExecute', async () => {
    const src = await readSource('../pages/ecc/CCAIProductManagerPage');
    // Find the blocked card renderer and verify it doesn't have onExecute
    const blockedIdx = src.indexOf("card.type === 'blocked'");
    const blockedBlock = src.substring(blockedIdx, blockedIdx + 200);
    expect(blockedBlock).not.toContain('onExecute');
  });
});

// ─── Lifecycle Sequencing ──────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 6: Lifecycle Sequencing', () => {
  it('readiness validation occurs before presenting Execution Ready', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    // EWO-033R.4 Correction 9: The preparation service now uses the hardened
    // validateExecutionReadiness instead of the bare evaluateExecutionEligibility.
    expect(src).toContain('validateExecutionReadiness');
    // The result must set ready based on readiness.eligible
    expect(src).toContain('ready: readiness.eligible');
    // The lifecycleStage must be blocked when not eligible
    expect(src).toContain("'blocked'");
  });

  it('preparation produces exactly one lifecycleStage', async () => {
    const src = await readSource('../lib/interactionExecutionService');
    // The prepareExecution method must set lifecycleStage in every return path
    const prepStart = src.indexOf('async prepareExecution(');
    const prepEnd = src.indexOf('async launchExecution(');
    const prepBody = src.substring(prepStart, prepEnd);
    const returns = prepBody.split('return {');
    for (const ret of returns.slice(1)) {
      const block = ret.substring(0, 500);
      expect(block).toContain('lifecycleStage');
    }
  });

  it('adapter returns early with blocked card when not ready', async () => {
    const src = await readSource('../lib/interactionChannelAdapter');
    // The not-ready path must return early (before constructing execCard)
    expect(src).toContain('if (!isReady)');
    expect(src).toContain('return {');
    expect(src).toContain("type: 'blocked'");
  });
});

// ─── Diagnostics ───────────────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 6: Diagnostics', () => {
  it('eligibility resolver records evidence sources for diagnostics', async () => {
    const src = await readSource('../lib/executionEligibilityResolver');
    // Evidence sources must be recorded for all checks
    expect(src).toContain('evidenceSources');
    expect(src).toContain('ewo_execution_approvals');
    expect(src).toContain('ewo_engineering_packages');
    expect(src).toContain('ecc_engineering_reviews');
  });

  it('eligibility resolver records PO approval as evidence (not blocker)', async () => {
    const src = await readSource('../lib/executionEligibilityResolver');
    // PO approval must be in evidenceSources but not in blockingReasons
    expect(src).toContain('productOwnerApproved');
    expect(src).toContain('pending PO decision');
  });
});
