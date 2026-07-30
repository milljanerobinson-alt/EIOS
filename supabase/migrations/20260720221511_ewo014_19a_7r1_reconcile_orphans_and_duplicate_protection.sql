/*
# EWO-014.19A.7R.1 — Reconcile Orphaned Engineering Records & Duplicate Protection

## Purpose
1. Add reconciliation_source column to engineering_records_library.
2. Link 29 orphaned engineering_records_library rows (ewo_id=NULL but ewo_ref
   matching an existing canonical EWO) to their canonical engineering_work_orders
   record via ewo_id.
3. Add a UNIQUE constraint on engineering_work_orders.ewo_ref to prevent duplicate
   canonical references across ALL lifecycle states (Req 3 — Duplicate Protection).
4. Mark 4 truly unidentifiable records (no ewo_ref) as "Historically Reconciled".

## Security
No new tables. No RLS changes. ALTER + UPDATE only.
*/

-- 1. Add reconciliation_source column to engineering_records_library
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_records_library' AND column_name = 'reconciliation_source'
  ) THEN
    ALTER TABLE engineering_records_library ADD COLUMN reconciliation_source text;
  END IF;
END $$;

-- 2. Reconcile orphaned engineering records: link ewo_id to canonical EWO
UPDATE engineering_records_library r
SET ewo_id = c.id,
    reconciliation_source = COALESCE(r.reconciliation_source, 'historically_reconciled_7r1')
FROM engineering_work_orders c
WHERE r.ewo_id IS NULL
  AND r.ewo_ref IS NOT NULL
  AND c.ewo_ref = r.ewo_ref;

-- 3. Mark truly unidentifiable records (no ewo_ref) as historically reconciled
UPDATE engineering_records_library
SET reconciliation_source = 'historically_reconciled_no_ref'
WHERE ewo_id IS NULL
  AND ewo_ref IS NULL
  AND reconciliation_source IS NULL;

-- 4. Add UNIQUE constraint on ewo_ref to prevent duplicates across ALL lifecycle states
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'engineering_work_orders_ewo_ref_unique'
  ) THEN
    ALTER TABLE engineering_work_orders ADD CONSTRAINT engineering_work_orders_ewo_ref_unique UNIQUE (ewo_ref);
  END IF;
END $$;
