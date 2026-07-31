/**
 * EWO-043 — Unified Planning and Canonical EWO Identity
 *
 * Regression tests proving:
 * ✓ Reserving an EWO ref during governed planning works
 * ✓ Canonical registration preserves the reserved ref (no second ref)
 * ✓ The UUID remains unchanged
 * ✓ Duplicate references are rejected
 * ✓ Fabricated references are rejected
 * ✓ Automated testing cannot reserve references
 * ✓ Automated testing cannot create canonical EWOs
 * ✓ Concurrent reservation cannot produce duplicate references
 */

import { describe, it, expect } from 'vitest';
import { supabase } from '../lib/supabase';

describe('EWO-043 — Unified Planning and Canonical EWO Identity', () => {
  // ─── Reservation ──────────────────────────────────────────────────────────

  it('should reserve an EWO reference during governed planning', async () => {
    const { data, error } = await supabase.rpc('reserve_ewo_ref_governed', {
      p_reserved_by: 'test@eios.local',
      p_reservation_context: 'governed_planning',
      p_correlation_id: 'EWO043-TEST-RESERVE-1',
    });

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data.success).toBe(true);
    expect(data.ewo_ref).toBeTruthy();
    expect(data.ewo_ref).toMatch(/^EWO-\d+$/);
    expect(data.status).toBe('reserved');
  });

  // ─── Canonical registration with reserved ref ─────────────────────────────

  it('should create a canonical EWO using a reserved reference (no second ref)', async () => {
    // 1. Reserve
    const { data: reservation, error: reserveErr } = await supabase.rpc('reserve_ewo_ref_governed', {
      p_reserved_by: 'test@eios.local',
      p_reservation_context: 'governed_planning',
      p_correlation_id: 'EWO043-TEST-RESERVE-2',
    });
    expect(reserveErr).toBeNull();
    expect(reservation.success).toBe(true);
    const reservedRef = reservation.ewo_ref;

    // 2. Create canonical EWO with the reserved ref
    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_canonical_ewo_governed', {
      p_execution_context: 'canonical_production',
      p_title: 'EWO-043 Test: Reserved Ref Identity',
      p_executive_summary: 'Test that the reserved ref is preserved through canonical registration.',
      p_created_by_email: 'test@eios.local',
      p_correlation_id: 'EWO043-TEST-REGISTER-2',
      p_reserved_ewo_ref: reservedRef,
    });

    expect(rpcError).toBeNull();
    expect(rpcResult).toBeTruthy();
    expect(rpcResult.success).toBe(true);
    expect(rpcResult.blocked).toBe(false);
    expect(rpcResult.ewo_ref).toBe(reservedRef);
    expect(rpcResult.reserved_ref_used).toBe(true);

    // 3. Verify the canonical record uses the reserved ref
    const { data: ewo } = await supabase
      .from('engineering_work_orders')
      .select('id, ewo_ref')
      .eq('ewo_ref', reservedRef)
      .maybeSingle();

    expect(ewo).toBeTruthy();
    expect(ewo.ewo_ref).toBe(reservedRef);

    // 4. Verify the reservation is consumed
    const { data: res } = await supabase
      .from('ewo_ref_reservations')
      .select('status, ewo_id')
      .eq('ewo_ref', reservedRef)
      .maybeSingle();

    expect(res).toBeTruthy();
    expect(res.status).toBe('consumed');
    expect(res.ewo_id).toBe(ewo.id);

    // Cleanup
    await supabase.from('ewo_lifecycle_events').delete().eq('ewo_id', ewo.id);
    await supabase.from('engineering_work_orders').delete().eq('id', ewo.id);
  });

  // ─── UUID unchanged ──────────────────────────────────────────────────────

  it('should keep the UUID unchanged after canonical registration', async () => {
    const { data: reservation } = await supabase.rpc('reserve_ewo_ref_governed', {
      p_reserved_by: 'test@eios.local',
      p_reservation_context: 'governed_planning',
      p_correlation_id: 'EWO043-TEST-RESERVE-3',
    });
    const reservedRef = reservation.ewo_ref;

    const { data: rpcResult } = await supabase.rpc('create_canonical_ewo_governed', {
      p_execution_context: 'canonical_production',
      p_title: 'EWO-043 Test: UUID Stability',
      p_executive_summary: 'Test that the UUID is set at creation and never changes.',
      p_created_by_email: 'test@eios.local',
      p_correlation_id: 'EWO043-TEST-REGISTER-3',
      p_reserved_ewo_ref: reservedRef,
    });

    const ewoId = rpcResult.ewo_id;

    const { data: ewo1 } = await supabase
      .from('engineering_work_orders')
      .select('id, ewo_ref')
      .eq('id', ewoId)
      .maybeSingle();

    expect(ewo1.id).toBe(ewoId);
    expect(ewo1.ewo_ref).toBe(reservedRef);

    // Cleanup
    await supabase.from('ewo_lifecycle_events').delete().eq('ewo_id', ewoId);
    await supabase.from('engineering_work_orders').delete().eq('id', ewoId);
  });

  // ─── Duplicate rejection ──────────────────────────────────────────────────

  it('should reject a duplicate reserved reference', async () => {
    const { data: reservation } = await supabase.rpc('reserve_ewo_ref_governed', {
      p_reserved_by: 'test@eios.local',
      p_reservation_context: 'governed_planning',
      p_correlation_id: 'EWO043-TEST-RESERVE-4',
    });
    const reservedRef = reservation.ewo_ref;

    // Create first EWO
    await supabase.rpc('create_canonical_ewo_governed', {
      p_execution_context: 'canonical_production',
      p_title: 'EWO-043 Test: First EWO',
      p_executive_summary: 'First EWO for duplicate test.',
      p_created_by_email: 'test@eios.local',
      p_correlation_id: 'EWO043-TEST-REGISTER-4A',
      p_reserved_ewo_ref: reservedRef,
    });

    // Try to create second EWO with same ref
    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_canonical_ewo_governed', {
      p_execution_context: 'canonical_production',
      p_title: 'EWO-043 Test: Second EWO (should fail)',
      p_executive_summary: 'This should be rejected.',
      p_created_by_email: 'test@eios.local',
      p_correlation_id: 'EWO043-TEST-REGISTER-4B',
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

  // ─── Fabricated reference rejection ───────────────────────────────────────

  it('should reject a fabricated (non-reserved) reference', async () => {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_canonical_ewo_governed', {
      p_execution_context: 'canonical_production',
      p_title: 'EWO-043 Test: Fabricated Ref',
      p_executive_summary: 'This should be rejected — ref was never reserved.',
      p_created_by_email: 'test@eios.local',
      p_correlation_id: 'EWO043-TEST-REGISTER-5',
      p_reserved_ewo_ref: 'EWO-99999',
    });

    expect(rpcError).toBeNull();
    expect(rpcResult.success).toBe(false);
    expect(rpcResult.blocked).toBe(true);
  });

  // ─── Automated testing blocked from reserving ─────────────────────────────

  it('should block automated_test context from reserving references', async () => {
    const { data, error } = await supabase.rpc('reserve_ewo_ref_governed', {
      p_reserved_by: 'test@eios.local',
      p_reservation_context: 'automated_test',
      p_correlation_id: 'EWO043-TEST-BLOCK-1',
    });

    expect(error).toBeTruthy();
    expect(error.message).toContain('cannot reserve');
  });

  // ─── Automated testing blocked from creating canonical EWOs ────────────────

  it('should block automated_test context from creating canonical EWOs', async () => {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_canonical_ewo_governed', {
      p_execution_context: 'automated_test',
      p_title: 'EWO-043 Test: Should Be Blocked',
      p_executive_summary: 'Automated test should not create canonical EWOs.',
      p_created_by_email: 'test@eios.local',
      p_correlation_id: 'EWO043-TEST-BLOCK-2',
    });

    expect(rpcError).toBeNull();
    expect(rpcResult.success).toBe(false);
    expect(rpcResult.blocked).toBe(true);
  });

  // ─── Concurrent reservation cannot produce duplicates ──────────────────────

  it('should not produce duplicate references on concurrent reservation', async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      supabase.rpc('reserve_ewo_ref_governed', {
        p_reserved_by: 'test@eios.local',
        p_reservation_context: 'governed_planning',
        p_correlation_id: `EWO043-TEST-CONCURRENT-${i}`,
      })
    );

    const results = await Promise.all(promises);
    const refs = results.map(r => r.data?.ewo_ref).filter(Boolean);

    // All refs should be unique
    const uniqueRefs = new Set(refs);
    expect(uniqueRefs.size).toBe(refs.length);
    expect(refs.length).toBe(5);

    // Cleanup unused reservations
    for (const ref of refs) {
      await supabase
        .from('ewo_ref_reservations')
        .update({ status: 'cancelled' })
        .eq('ewo_ref', ref)
        .eq('status', 'reserved');
    }
  });
});
