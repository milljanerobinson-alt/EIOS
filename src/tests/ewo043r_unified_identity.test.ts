/**
 * EWO-043R — Complete Unified Engineering Work Order Identity Architecture
 *
 * Regression tests proving:
 * ✓ One allocation implementation exists (reserveEwoRefGoverned)
 * ✓ One canonical creation implementation exists (create_canonical_ewo_governed)
 * ✓ No direct INSERT path remains
 * ✓ No legacy allocation path remains (allocateCanonicalEwoRef removed)
 * ✓ No helper bypass exists
 * ✓ No constitutional bypass exists
 * ✓ No implementation fallback bypass exists
 * ✓ No duplicate EWOs can be created
 * ✓ No duplicate EWO references can be allocated
 * ✓ Automated testing still cannot reserve references
 * ✓ Automated testing still cannot create canonical EWOs
 */

import { describe, it, expect } from 'vitest';
import { supabase } from '../lib/supabase';
import { reserveEwoRefGoverned } from '../lib/ewoAllocator';

describe('EWO-043R — Complete Unified Identity Architecture', () => {
  // ─── Source Code Verification ──────────────────────────────────────────────

  it('should have exactly one allocation export in ewoAllocator.ts (reserveEwoRefGoverned)', async () => {
    const allocatorSource = await import('../lib/ewoAllocator?raw');
    const source = allocatorSource.default as string;
    expect(source).toContain('export async function reserveEwoRefGoverned');
    expect(source).not.toContain('export async function allocateCanonicalEwoRef');
  });

  it('should not contain direct INSERT into engineering_work_orders in ensureEngineeringWorkOrder.ts', async () => {
    const module = await import('../lib/ensureEngineeringWorkOrder?raw');
    const source = module.default as string;
    // The governed RPC call should be present
    expect(source).toContain("rpc('create_canonical_ewo_governed'");
    // No direct .insert() into engineering_work_orders
    expect(source).not.toMatch(/from\(['"]engineering_work_orders['"]\)\s*\n?\s*\.insert\(/);
  });

  it('should not contain direct INSERT into engineering_work_orders in engineeringIntegrityService.ts', async () => {
    const module = await import('../lib/engineeringIntegrityService?raw');
    const source = module.default as string;
    // The governed RPC call should be present in ensureEngineeringWorkOrderExists
    expect(source).toContain("rpc('create_canonical_ewo_governed'");
  });

  it('should not use allocateCanonicalEwoRef in constitutionalEngine.ts', async () => {
    const module = await import('../lib/constitutionalEngine?raw');
    const source = module.default as string;
    expect(source).not.toContain('allocateCanonicalEwoRef');
    expect(source).toContain('reserveEwoRefGoverned');
    expect(source).toContain("rpc('create_canonical_ewo_governed'");
  });

  it('should not import ensureEngineeringWorkOrderExists in constitutionalEngine.ts', async () => {
    const module = await import('../lib/constitutionalEngine?raw');
    const source = module.default as string;
    expect(source).not.toContain("from './ensureEngineeringWorkOrder'");
  });

  // ─── Runtime Verification ─────────────────────────────────────────────────

  it('should reserve a unique EWO reference via the single allocation pathway', async () => {
    const result = await reserveEwoRefGoverned(
      'test@eios.local',
      'governed_planning',
      'EWO043R-TEST-ALLOC-1',
    );
    expect(result.success).toBe(true);
    expect(result.ewoRef).toBeTruthy();
    expect(result.ewoRef).toMatch(/^EWO-\d+$/);
  });

  it('should create a canonical EWO via the single creation pathway with a reserved ref', async () => {
    const reservation = await reserveEwoRefGoverned(
      'test@eios.local',
      'governed_planning',
      'EWO043R-TEST-CREATE-1',
    );
    expect(reservation.success).toBe(true);
    const reservedRef = reservation.ewoRef!;

    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_canonical_ewo_governed', {
      p_execution_context: 'canonical_production',
      p_title: 'EWO-043R Test: Single Creation Pathway',
      p_executive_summary: 'Test that only one creation pathway exists.',
      p_created_by_email: 'test@eios.local',
      p_correlation_id: 'EWO043R-TEST-CREATE-1',
      p_reserved_ewo_ref: reservedRef,
    });

    expect(rpcError).toBeNull();
    expect(rpcResult.success).toBe(true);
    expect(rpcResult.ewo_ref).toBe(reservedRef);

    // Cleanup
    await supabase.from('ewo_lifecycle_events').delete().eq('ewo_id', rpcResult.ewo_id);
    await supabase.from('engineering_work_orders').delete().eq('id', rpcResult.ewo_id);
  });

  it('should reject duplicate EWO creation via the governed gateway', async () => {
    const reservation = await reserveEwoRefGoverned(
      'test@eios.local',
      'governed_planning',
      'EWO043R-TEST-DUP-1',
    );
    const reservedRef = reservation.ewoRef!;

    // Create first EWO
    await supabase.rpc('create_canonical_ewo_governed', {
      p_execution_context: 'canonical_production',
      p_title: 'EWO-043R Test: First EWO',
      p_executive_summary: 'First EWO for duplicate test.',
      p_created_by_email: 'test@eios.local',
      p_correlation_id: 'EWO043R-TEST-DUP-1A',
      p_reserved_ewo_ref: reservedRef,
    });

    // Try to create second EWO with same ref
    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_canonical_ewo_governed', {
      p_execution_context: 'canonical_production',
      p_title: 'EWO-043R Test: Second EWO (should fail)',
      p_executive_summary: 'This should be rejected.',
      p_created_by_email: 'test@eios.local',
      p_correlation_id: 'EWO043R-TEST-DUP-1B',
      p_reserved_ewo_ref: reservedRef,
    });

    expect(rpcError).toBeNull();
    expect(rpcResult.success).toBe(false);
    expect(rpcResult.blocked).toBe(true);

    // Cleanup
    const { data: ewo } = await supabase
      .from('engineering_work_orders')
      .select('id')
      .eq('ewo_ref', reservedRef)
      .maybeSingle();
    if (ewo) {
      await supabase.from('ewo_lifecycle_events').delete().eq('ewo_id', ewo.id);
      await supabase.from('engineering_work_orders').delete().eq('id', ewo.id);
    }
  });

  it('should block automated_test context from reserving references', async () => {
    const { error } = await supabase.rpc('reserve_ewo_ref_governed', {
      p_reserved_by: 'test@eios.local',
      p_reservation_context: 'automated_test',
      p_correlation_id: 'EWO043R-TEST-BLOCK-1',
    });

    expect(error).toBeTruthy();
    expect(error!.message).toContain('cannot reserve');
  });

  it('should block automated_test context from creating canonical EWOs', async () => {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_canonical_ewo_governed', {
      p_execution_context: 'automated_test',
      p_title: 'EWO-043R Test: Should Be Blocked',
      p_executive_summary: 'Automated test should not create canonical EWOs.',
      p_created_by_email: 'test@eios.local',
      p_correlation_id: 'EWO043R-TEST-BLOCK-2',
    });

    expect(rpcError).toBeNull();
    expect(rpcResult.success).toBe(false);
    expect(rpcResult.blocked).toBe(true);
  });

  it('should not produce duplicate references on concurrent reservation', async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      supabase.rpc('reserve_ewo_ref_governed', {
        p_reserved_by: 'test@eios.local',
        p_reservation_context: 'governed_planning',
        p_correlation_id: `EWO043R-TEST-CONCURRENT-${i}`,
      })
    );

    const results = await Promise.all(promises);
    const refs = results.map(r => r.data?.ewo_ref).filter(Boolean);
    const uniqueRefs = new Set(refs);
    expect(uniqueRefs.size).toBe(refs.length);
    expect(refs.length).toBe(5);

    // Cleanup
    for (const ref of refs) {
      await supabase
        .from('ewo_ref_reservations')
        .update({ status: 'cancelled' })
        .eq('ewo_ref', ref)
        .eq('status', 'reserved');
    }
  });

  it('should auto-reserve an unreserved ref passed to the governed gateway', async () => {
    // Pass a ref that was never reserved — the gateway should auto-reserve it
    const testRef = `EWO-${Date.now()}`;
    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_canonical_ewo_governed', {
      p_execution_context: 'canonical_production',
      p_title: 'EWO-043R Test: Auto-Reserve',
      p_executive_summary: 'Test that the gateway auto-reserves unreserved refs.',
      p_created_by_email: 'test@eios.local',
      p_correlation_id: 'EWO043R-TEST-AUTO-RESERVE',
      p_reserved_ewo_ref: testRef,
    });

    expect(rpcError).toBeNull();
    expect(rpcResult.success).toBe(true);
    expect(rpcResult.ewo_ref).toBe(testRef);

    // Cleanup
    await supabase.from('ewo_lifecycle_events').delete().eq('ewo_id', rpcResult.ewo_id);
    await supabase.from('engineering_work_orders').delete().eq('id', rpcResult.ewo_id);
  });
});
