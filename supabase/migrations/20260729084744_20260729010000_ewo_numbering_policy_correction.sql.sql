/*
# EWO Numbering Policy Correction

## Policy Decision: Policy B — Operational Canonical EWOs Only

EWO-900 is a historical import (is_historical_import=true, import_source=
"Historical Engineering Archive", closure_method="Historical Migration").
It is NOT an operational EWO and must not participate in the operational
numbering sequence.

The highest operational canonical numeric EWO is EWO-032.
The next operational EWO must be EWO-033.

The previous migration seeded the sequence at 901 based on EWO-900.
This migration resets the sequence to start at 33 (next after EWO-032).

Historical imports like EWO-900 use their own numbering range (900+)
and do not affect the operational sequence.
*/

-- Reset the sequence to the correct operational starting point
-- The highest operational canonical numeric EWO is EWO-032, so next is 033
DO $$
DECLARE
  current_seq_val bigint;
BEGIN
  -- Get current sequence value
  SELECT last_value INTO current_seq_val FROM ewo_canonical_ref_seq;
  
  -- Only reset if the sequence hasn't been used beyond the test allocation
  -- (EWO-901 was allocated during testing — we need to set it back)
  IF current_seq_val >= 901 THEN
    -- Set sequence to 32 so next nextval() returns 33
    PERFORM setval('ewo_canonical_ref_seq', 32, true);
  END IF;
END $$;

-- Add a comment documenting the policy
COMMENT ON SEQUENCE ewo_canonical_ref_seq IS 'Atomic sequence for canonical EWO reference allocation. Policy B: Only operational canonical EWOs participate. Historical imports (EWO-900+), test records (EWO-TEST*), and refinement variants (EWO-014.19A.7R.1 etc.) are excluded from the numbering sequence. Seeded from highest operational canonical numeric EWO (EWO-032). Next allocation: EWO-033. Never resets.';
