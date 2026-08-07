import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('execution approval persistence contract', () => {
  it('uses the governed approval RPC rather than a direct table insert', () => {
    const toolServer = source('../lib/eios/toolServer.ts');
    expect(toolServer).toContain("supabase.rpc('approve_ewo_for_execution'");
    expect(toolServer).not.toMatch(/from\('ewo_execution_approvals'\)\.insert/);
  });

  it('uses the canonical approval columns in all corrected readers', () => {
    const readers = [
      source('../lib/eios/toolServer.ts'),
      source('../lib/eios/unifiedContextService.ts'),
      source('../lib/executionIntentRouter.ts'),
      source('../lib/supervisedExecutionEngine.ts'),
    ].join('\n');

    expect(readers).not.toContain("select('decision, approved_by, approved_at')");
    expect(readers).not.toContain(".eq('ewo_ref', ewoRef)\n    .order('approved_at'");
    expect(readers).toContain("select('decision, product_owner, created_at')");
  });

  it('persists and reads back approval before creating the handoff request', () => {
    const handoff = source('../lib/executionHandoffService.ts');
    const persist = handoff.indexOf("supabase.rpc('approve_ewo_for_execution'");
    const readback = handoff.indexOf(".from('ewo_execution_approvals')", persist);
    const handoffInsert = handoff.indexOf(".from('execution_handoff_requests')\n    .insert", persist);

    expect(persist).toBeGreaterThan(-1);
    expect(readback).toBeGreaterThan(persist);
    expect(handoffInsert).toBeGreaterThan(readback);
    expect(handoff).toContain('Failed to verify execution approval');
  });
});
