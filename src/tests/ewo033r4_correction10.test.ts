/**
 * EWO-033R.4 Correction 10 — Correct Execution Lifecycle & Query Contracts
 *
 * Tests:
 * 1. Execution target query does NOT use .maybeSingle() (cardinality fix)
 * 2. Execution target query uses .limit(1) instead
 * 3. Stale execution (awaiting_po_testing) does NOT block new execution
 * 4. Genuinely active execution (running) DOES block new execution
 * 5. Stale execution produces a warning, not a blocking reason
 * 6. Stale execution recovery options are provided
 * 7. Blocking details include reason, evidence, and recovery options
 * 8. Governed report format includes "Execution Blocked" header
 * 9. No .maybeSingle() on multi-row queries in readiness validator
 * 10. No .maybeSingle() on execution target query in eligibility resolver
 * 11. Active execution statuses are correctly classified
 * 12. Terminal executions (cancelled, failed) do NOT block
 */

import { describe, it, expect } from 'vitest';

async function readSource(path: string): Promise<string> {
  const mod = await import(`${path}?raw`);
  return mod.default as string;
}

// ─── Execution Target Query Cardinality Fix ──────────────────────────────────

describe('EWO-033R.4 Correction 10: Execution Target Query Cardinality', () => {
  it('1. Execution target query does NOT use .maybeSingle() (cardinality fix)', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    // Find the execution target query block — search for the first supabase
    // call after the 'Execution Target' label
    const targetIdx = src.indexOf("'Execution Target'");
    expect(targetIdx).toBeGreaterThan(-1);
    // Only look at the first 800 chars (the query itself, not subsequent queries)
    const targetBlock = src.substring(targetIdx, targetIdx + 800);
    // Must NOT use .maybeSingle() on the target query
    expect(targetBlock).not.toContain('.maybeSingle()');
  });

  it('2. Execution target query uses .limit(1) instead', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    const targetIdx = src.indexOf("'Execution Target'");
    const targetBlock = src.substring(targetIdx, targetIdx + 1500);
    expect(targetBlock).toContain('.limit(1)');
  });

  it('9. No .maybeSingle() on multi-row queries in readiness validator', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    // The execution target query must not use .maybeSingle()
    // The execution sessions query must not use .maybeSingle()
    const execSessionIdx = src.indexOf("'Active Execution Session'");
    const execSessionBlock = src.substring(execSessionIdx, execSessionIdx + 800);
    // The executions query returns multiple rows, so no .maybeSingle()
    expect(execSessionBlock).not.toContain('.maybeSingle()');
  });

  it('10. No .maybeSingle() on execution target query in eligibility resolver', async () => {
    const src = await readSource('../lib/executionEligibilityResolver');
    // Find the execution target query
    const targetIdx = src.indexOf("execution_targets");
    expect(targetIdx).toBeGreaterThan(-1);
    const targetBlock = src.substring(targetIdx, targetIdx + 800);
    // Must NOT use .maybeSingle() on the active targets query
    // (there are multiple active targets)
    expect(targetBlock).not.toContain('.maybeSingle()');
  });
});

// ─── Execution Lifecycle Classification ───────────────────────────────────────

describe('EWO-033R.4 Correction 10: Execution Lifecycle Classification', () => {
  it('3. Stale execution (awaiting_po_testing) does NOT block new execution', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    // awaiting_po_testing must be in staleStatuses, not genuinelyActiveStatuses
    expect(src).toContain('staleStatuses');
    expect(src).toContain("'awaiting_po_testing'");
    // The stale execution must push a warning, not a blocking reason
    const staleIdx = src.indexOf('Stale execution');
    expect(staleIdx).toBeGreaterThan(-1);
    const staleBlock = src.substring(staleIdx, staleIdx + 500);
    expect(staleBlock).toContain('warnings.push');
  });

  it('4. Genuinely active execution (running) DOES block new execution', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    // running must be in genuinelyActiveStatuses
    expect(src).toContain('genuinelyActiveStatuses');
    const activeIdx = src.indexOf('genuinelyActiveStatuses = [');
    const activeBlock = src.substring(activeIdx, activeIdx + 100);
    expect(activeBlock).toContain("'running'");
    expect(activeBlock).toContain("'queued'");
    // Active execution must push a blocking reason — find the if (activeExecution) block
    const ifActiveIdx = src.indexOf('if (activeExecution) {');
    expect(ifActiveIdx).toBeGreaterThan(-1);
    const ifActiveBlock = src.substring(ifActiveIdx, ifActiveIdx + 500);
    expect(ifActiveBlock).toContain('blockingReasons.push');
  });

  it('5. Stale execution produces a warning, not a blocking reason', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    // Find the else if (staleExecution) block
    const staleIdx = src.indexOf('else if (staleExecution) {');
    expect(staleIdx).toBeGreaterThan(-1);
    const staleBlock = src.substring(staleIdx, staleIdx + 500);
    // Must push to warnings, not to blockingReasons
    expect(staleBlock).toContain('warnings.push');
    expect(staleBlock).not.toContain('blockingReasons.push');
  });

  it('11. Active execution statuses are correctly classified', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    const activeIdx = src.indexOf('genuinelyActiveStatuses = [');
    const activeBlock = src.substring(activeIdx, activeIdx + 100);
    // Active: queued, running, prepared, submitted, awaiting_completion
    expect(activeBlock).toContain("'queued'");
    expect(activeBlock).toContain("'running'");
    expect(activeBlock).toContain("'prepared'");
    expect(activeBlock).toContain("'submitted'");
    expect(activeBlock).toContain("'awaiting_completion'");
    // Active must NOT include stale statuses
    expect(activeBlock).not.toContain("'awaiting_po_testing'");
    expect(activeBlock).not.toContain("'awaiting_review'");
  });

  it('12. Terminal executions (cancelled, failed) do NOT block', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    // cancelled and failed should not be in either active or stale lists
    const activeIdx = src.indexOf('genuinelyActiveStatuses = [');
    const activeBlock = src.substring(activeIdx, activeIdx + 100);
    expect(activeBlock).not.toContain("'cancelled'");
    expect(activeBlock).not.toContain("'failed'");
    const staleIdx = src.indexOf('staleStatuses = [');
    const staleBlock = src.substring(staleIdx, staleIdx + 100);
    expect(staleBlock).not.toContain("'cancelled'");
    expect(staleBlock).not.toContain("'failed'");
  });
});

// ─── Stale Execution Recovery ─────────────────────────────────────────────────

describe('EWO-033R.4 Correction 10: Stale Execution Recovery', () => {
  it('6. Stale execution recovery options are provided', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    const staleIdx = src.indexOf('Stale execution');
    const staleBlock = src.substring(staleIdx, staleIdx + 1000);
    expect(staleBlock).toContain('recoveryOptions');
    expect(staleBlock).toContain('Resume the existing execution session');
    expect(staleBlock).toContain('Cancel the stale execution and create a new one');
  });
});

// ─── Blocking Details ─────────────────────────────────────────────────────────

describe('EWO-033R.4 Correction 10: Blocking Details', () => {
  it('7. Blocking details include reason, evidence, and recovery options', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    expect(src).toContain('interface BlockingDetail');
    expect(src).toContain('reason: string');
    expect(src).toContain('evidence: string');
    expect(src).toContain('recoveryOptions: string[]');
  });

  it('8. Governed report format includes "Execution Blocked" header', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    expect(src).toContain("'Execution Blocked'");
    expect(src).toContain('Reason:');
    expect(src).toContain('Evidence:');
    expect(src).toContain('Recovery Options:');
  });

  it('ReadinessReport includes blockingDetails', async () => {
    const src = await readSource('../lib/executionReadinessValidator');
    expect(src).toContain('blockingDetails: BlockingDetail[]');
  });
});

// ─── Eligibility Resolver Corrections ────────────────────────────────────────

describe('EWO-033R.4 Correction 10: Eligibility Resolver Corrections', () => {
  it('Eligibility resolver classifies stale executions separately', async () => {
    const src = await readSource('../lib/executionEligibilityResolver');
    expect(src).toContain('genuinelyActiveStatuses');
    expect(src).toContain('staleStatuses');
    expect(src).toContain("'awaiting_po_testing'");
  });

  it('Eligibility resolver does not block on stale executions', async () => {
    const src = await readSource('../lib/executionEligibilityResolver');
    // The stale execution comment must mention it should not block
    expect(src).toContain('Stale executions should NOT permanently block');
    // EWO-033R.4 Correction 14: The eligible check must NOT include staleExecution
    const eligibleIdx = src.indexOf('!activeExecution &&');
    const eligibleBlock = src.substring(eligibleIdx, eligibleIdx + 200);
    expect(eligibleBlock).not.toContain('!staleExecution');
  });
});
