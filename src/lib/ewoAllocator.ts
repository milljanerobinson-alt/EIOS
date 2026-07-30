// EWO-033 — Canonical EWO Reference Allocator
//
// Single authoritative, concurrency-safe, database-backed allocator for
// canonical Engineering Work Order references.
//
// All EWO creation paths MUST use allocateCanonicalEwoRef() — never
// compute a reference from alphabetical sorting or parseInt.

import { supabase } from './supabase';

export interface AllocationResult {
  success: boolean;
  ewoRef: string | null;
  error: string | null;
}

/**
 * Atomically allocates the next canonical EWO reference.
 *
 * Uses the Postgres sequence `ewo_canonical_ref_seq` via the
 * `allocate_canonical_ewo_ref()` RPC function. The sequence is
 * concurrency-safe — concurrent callers will receive distinct
 * references. The function never falls back to EWO-001; on failure
 * it returns success=false with an error message.
 */
export async function allocateCanonicalEwoRef(): Promise<AllocationResult> {
  try {
    const { data, error } = await supabase.rpc('allocate_canonical_ewo_ref');

    if (error) {
      return {
        success: false,
        ewoRef: null,
        error: `EWO allocation failed: ${error.message}`,
      };
    }

    if (!data || typeof data !== 'string') {
      return {
        success: false,
        ewoRef: null,
        error: 'EWO allocation returned no reference',
      };
    }

    return { success: true, ewoRef: data, error: null };
  } catch (e) {
    return {
      success: false,
      ewoRef: null,
      error: e instanceof Error ? e.message : 'Unknown allocation error',
    };
  }
}
