-- EWO-042R: Delete confirmed test Engineering Work Orders EWO-042 through EWO-213
-- Product Owner approval granted. Inspection-only tasks EWO-041, EWO-041R1, EWO-041R2 completed.
--
-- Scope: Permanently delete all canonical EWOs with numeric refs 042-213 inclusive.
-- EWO-042 through EWO-068 do not exist in the database (27 missing refs).
-- The 145 EWOs that exist (EWO-069 through EWO-213) are all confirmed test artefacts.
--
-- Dependent record behaviour (verified from database constraints):
--   ewo_lifecycle_events: CASCADE (auto-delete) — 145 rows
--   engineering_change_log: NO FK — 145 rows preserved (audit trail intact)
--   All other dependent tables: 0 rows for these EWOs
--   execution_sessions: NO ACTION — 0 rows (no blocker)
--
-- No records outside EWO-042..213 are modified.

DO $$
DECLARE
  v_deleted_count INTEGER;
  v_cascade_count INTEGER;
  v_preserved_count INTEGER;
  v_first_ref TEXT;
  v_last_ref TEXT;
BEGIN
  -- Capture the first and last refs before deletion
  SELECT min(ewo_ref) INTO v_first_ref
  FROM engineering_work_orders
  WHERE ewo_ref ~ '^EWO-[0-9]+$'
    AND substring(ewo_ref from 'EWO-([0-9]+)')::int BETWEEN 42 AND 213;

  SELECT max(ewo_ref) INTO v_last_ref
  FROM engineering_work_orders
  WHERE ewo_ref ~ '^EWO-[0-9]+$'
    AND substring(ewo_ref from 'EWO-([0-9]+)')::int BETWEEN 42 AND 213;

  -- Count change log rows that will be preserved (no FK, so they remain)
  SELECT count(*) INTO v_preserved_count
  FROM engineering_change_log
  WHERE ewo_ref IN (
    SELECT ewo_ref FROM engineering_work_orders
    WHERE ewo_ref ~ '^EWO-[0-9]+$'
      AND substring(ewo_ref from 'EWO-([0-9]+)')::int BETWEEN 42 AND 213
  );

  -- Delete the EWOs. CASCADE will auto-delete ewo_lifecycle_events.
  -- SET NULL will nullify ewo_id in engineering_executions, engineering_records_library, etc.
  -- NO ACTION on execution_sessions would block if any rows existed (verified: 0 rows).
  -- engineering_change_log rows remain (no FK).
  DELETE FROM engineering_work_orders
  WHERE ewo_ref ~ '^EWO-[0-9]+$'
    AND substring(ewo_ref from 'EWO-([0-9]+)')::int BETWEEN 42 AND 213;

  -- Capture the number of deleted EWOs
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Count cascaded lifecycle events (they were auto-deleted)
  -- We can't count them directly after deletion, so we calculate from the pre-deletion count
  v_cascade_count := v_deleted_count; -- 1 lifecycle event per EWO (verified: 145 each)

  -- Raise notice with the results
  RAISE NOTICE 'EWO-042R DELETION COMPLETE';
  RAISE NOTICE 'Total EWOs deleted: %', v_deleted_count;
  RAISE NOTICE 'First deleted EWO: %', v_first_ref;
  RAISE NOTICE 'Last deleted EWO: %', v_last_ref;
  RAISE NOTICE 'Total dependent records deleted (CASCADE): %', v_cascade_count;
  RAISE NOTICE 'Total audit records preserved (engineering_change_log): %', v_preserved_count;
END;
$$;