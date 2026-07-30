/*
# Atomic EWO Reference Allocator

## Purpose
Replaces the broken alphabetical-sort + parseInt numbering in
ewoAutoRegistrationService.ts and constitutionalEngine.ts with a single
authoritative, concurrency-safe, database-backed allocator.

## Background
The previous algorithm queried `ORDER BY ewo_ref DESC LIMIT 1` and called
`parseInt(lastRef.replace('EWO-', ''))`. Non-numeric refs like EWO-TEST-001
sorted above canonical numeric refs, causing parseInt to return NaN, which
fell back to 0 and produced EWO-001.

## Changes

1. New sequence: `ewo_canonical_ref_seq`
   - Starts at the highest existing canonical numeric EWO + 1.
   - The current highest canonical numeric EWO is 900 (EWO-900, a test record).
   - Sequence starts at 901 so the next allocated ref is EWO-901.
   - This intentionally skips EWO-033..EWO-089 which were never created and
     avoids collision with EWO-900.

2. New function: `allocate_canonical_ewo_ref()`
   - SECURITY DEFINER, volatile, parallel-safe.
   - Atomically calls `nextval()` on the sequence.
   - Formats the result as `EWO-NNN` with zero-padding to at least 3 digits.
   - Returns the formatted ref.
   - Concurrency-safe: Postgres sequences guarantee unique values even under
     concurrent calls.
   - Never returns EWO-001 as a fallback — if the sequence fails, the function
     raises an error.

3. New column: `engineering_work_orders.ewo_ref_immutable` (boolean, default true)
   - Documents that ewo_ref is immutable once allocated.
   - A trigger prevents UPDATE of ewo_ref on existing rows.

4. New trigger: `prevent_ewo_ref_update`
   - Raises an exception if anyone tries to UPDATE the ewo_ref column.

5. RLS: The function is SECURITY DEFINER so it can call nextval() regardless
   of the caller's role. The sequence itself is accessible to anon/authenticated
   via GRANT.

## Safety
- Existing ewo_ref values are NOT changed.
- The sequence is seeded from the highest existing canonical numeric ref.
- No data is deleted or modified.
- The migration is idempotent (uses IF NOT EXISTS / IF EXISTS).
*/

-- ── 1. Create the sequence ────────────────────────────────────────────────────

-- Determine the highest canonical numeric EWO ref currently in the table.
-- EWO-900 exists as a test record, so the sequence must start above it.
DO $$
DECLARE
  max_num int;
BEGIN
  SELECT COALESCE(MAX(substring(ewo_ref from 'EWO-(\d+)')::int), 0)
  INTO max_num
  FROM engineering_work_orders
  WHERE ewo_ref ~ '^EWO-\d+$';

  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'ewo_canonical_ref_seq') THEN
    EXECUTE format('CREATE SEQUENCE ewo_canonical_ref_seq START WITH %s INCREMENT BY 1 MINVALUE 1 NO CYCLE', max_num + 1);
  END IF;
END $$;

-- Grant access to the sequence
GRANT USAGE, SELECT ON SEQUENCE ewo_canonical_ref_seq TO anon, authenticated;

-- ── 2. Create the allocator function ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION allocate_canonical_ewo_ref()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
PARALLEL SAFE
AS $$
DECLARE
  next_num bigint;
  ref text;
BEGIN
  -- Atomically get the next sequence value
  SELECT nextval('ewo_canonical_ref_seq') INTO next_num;

  -- Format as EWO-NNN with minimum 3-digit zero-padding
  -- Numbers >= 1000 will have their natural width
  ref := 'EWO-' || lpad(next_num::text, 3, '0');

  RETURN ref;
END;
$$;

-- Grant execute to anon and authenticated so the frontend can call it
GRANT EXECUTE ON FUNCTION allocate_canonical_ewo_ref() TO anon, authenticated;

-- ── 3. Add immutability column ─────────────────────────────────────────────────

ALTER TABLE engineering_work_orders
  ADD COLUMN IF NOT EXISTS ewo_ref_immutable boolean NOT NULL DEFAULT true;

-- ── 4. Prevent ewo_ref updates via trigger ─────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_ewo_ref_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ewo_ref IS DISTINCT FROM OLD.ewo_ref THEN
    RAISE EXCEPTION 'ewo_ref is immutable. Cannot change from % to %', OLD.ewo_ref, NEW.ewo_ref;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_ewo_ref_update ON engineering_work_orders;
CREATE TRIGGER trg_prevent_ewo_ref_update
  BEFORE UPDATE OF ewo_ref ON engineering_work_orders
  FOR EACH ROW
  EXECUTE FUNCTION prevent_ewo_ref_update();

-- ── 5. Audit comment ───────────────────────────────────────────────────────────

COMMENT ON SEQUENCE ewo_canonical_ref_seq IS 'Atomic sequence for canonical EWO reference allocation. Seeded from highest existing canonical numeric EWO. Never resets.';
COMMENT ON FUNCTION allocate_canonical_ewo_ref() IS 'Atomically allocates the next canonical EWO reference (EWO-NNN). Concurrency-safe via Postgres sequence. Never falls back to EWO-001.';
