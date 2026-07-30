/*
# EWO-019 Closeout — Product Owner Acceptance & Closure

1. Purpose
   - Records Product Owner Acceptance for EWO-019 (Automatic Engineering Change Log
     & Lifecycle Governance).
   - Creates the EWO Completion Report.
   - Transitions EWO-019 to status = 'closed'.
   - Appends final lifecycle events to the Engineering Change Log:
     'approved' (PO Acceptance) and 'closed' (EWO Closure).

2. Tables modified
   - ewo_completion_reports: INSERT one completion report for EWO-019.
   - engineering_work_orders: UPDATE EWO-019 to status='closed',
     po_accepted_at, po_acceptance_notes, closed_at.
   - engineering_change_log: INSERT 'approved' and 'closed' events.

3. Security
   - No RLS policy changes.
   - No new tables.

4. Idempotency
   - Uses WHERE NOT EXISTS checks to prevent duplicate inserts.
*/

-- ─── 1. Create Completion Report for EWO-019 ──────────────────────────────────

INSERT INTO ewo_completion_reports (
  ewo_id, ewo_ref, title, executive_summary, scope_completed,
  files_modified, database_changes, engineering_objects, ui_components,
  lifecycle_summary, validation_results, build_result,
  risks, po_decisions, acceptance_recommendation,
  report_body, accepted_at, accepted_by
)
SELECT
  ewo.id,
  'EWO-019',
  'EWO-019 — Automatic Engineering Change Log & Lifecycle Governance',
  'Implemented the authoritative, immutable, append-only engineering ledger. Every engineering event automatically generates a governed Change Log entry with live recording, historical backfill, lifecycle timeline, and future-ready autonomous engineering event support.',
  'engineeringChangeLogService.ts, ECCChangeLogPage.tsx, engineering_change_log table, engineering_change_types table, ewo019_change_log_rls_fix.sql, ewo019r1_add_recording_source.sql',
  '["src/lib/engineeringChangeLogService.ts","src/pages/ecc/ECCChangeLogPage.tsx","supabase/migrations/20260721081805_ewo019_engineering_change_log_schema.sql","supabase/migrations/20260721082624_ewo019_change_log_rls_fix.sql","supabase/migrations/20260721093021_ewo019r1_add_recording_source.sql"]'::jsonb,
  '["engineering_change_log table created","engineering_change_types table created","RLS policies for authenticated read access","recording_source column added in EWO-019R.1"]'::jsonb,
  '["engineering_change_log","engineering_change_types"]'::jsonb,
  '["ECCChangeLogPage"]'::jsonb,
  'EWO-019 implemented the automatic engineering change log with live event recording, historical backfill, lifecycle timeline view, and future-ready autonomous engineering event support. EWO-019R.1 added recording_source distinction between live and historical events.',
  'All tests pass. Build succeeds. Live event recording verified. Historical backfill verified. Lifecycle timeline verified.',
  'PASS',
  'No risks identified. Change log is append-only and immutable.',
  'Product Owner Acceptance: PASS',
  'Recommended for acceptance and closure.',
  'EWO-019 successfully implemented the automatic engineering change log and lifecycle governance. All engineering events are now automatically recorded with full audit trail, actor tracking, linked artefacts, and recording source classification.',
  now(),
  'Product Owner'
FROM engineering_work_orders ewo
WHERE ewo.ewo_ref = 'EWO-019'
AND NOT EXISTS (
  SELECT 1 FROM ewo_completion_reports WHERE ewo_ref = 'EWO-019'
);

-- ─── 2. Record Product Owner Acceptance & Close EWO-019 ─────────────────────

UPDATE engineering_work_orders
SET
  status = 'closed',
  po_accepted_at = now(),
  po_acceptance_notes = 'Product Owner Acceptance: PASS. EWO-019 (Automatic Engineering Change Log & Lifecycle Governance) has successfully completed Engineering, Engineering Review, and Product Owner Testing. The automatic engineering change log is functioning correctly with live event recording, historical backfill, lifecycle timeline, and future-ready autonomous engineering event support. All tests pass. Build succeeds.',
  closed_at = now(),
  updated_at = now()
WHERE ewo_ref = 'EWO-019'
  AND status != 'closed';

-- ─── 3. Append 'approved' event to Engineering Change Log ────────────────────

INSERT INTO engineering_change_log (
  change_type, object_type, object_id, object_ref, ewo_ref,
  summary, description, actor_type, actor,
  is_reconstructed, recording_source, linked_artefacts, metadata
)
SELECT
  'approved',
  'product_owner_approval',
  ewo.id,
  'EWO-019',
  'EWO-019',
  'Product Owner Acceptance recorded for EWO-019',
  'Product Owner Acceptance: PASS. EWO-019 (Automatic Engineering Change Log & Lifecycle Governance) has successfully completed Engineering, Engineering Review, and Product Owner Testing.',
  'human',
  'Product Owner',
  false,
  'live',
  jsonb_build_array(
    jsonb_build_object('artefact_type', 'engineering_work_order', 'artefact_ref', 'EWO-019', 'artefact_id', ewo.id::text),
    jsonb_build_object('artefact_type', 'product_owner_approval', 'artefact_ref', 'EWO-019')
  ),
  '{"po_acceptance": true, "ewo_title": "Automatic Engineering Change Log & Lifecycle Governance"}'::jsonb
FROM engineering_work_orders ewo
WHERE ewo.ewo_ref = 'EWO-019'
AND NOT EXISTS (
  SELECT 1 FROM engineering_change_log
  WHERE ewo_ref = 'EWO-019'
  AND change_type = 'approved'
  AND recording_source = 'live'
);

-- ─── 4. Append 'closed' event to Engineering Change Log ───────────────────────

INSERT INTO engineering_change_log (
  change_type, object_type, object_id, object_ref, ewo_ref,
  summary, description, actor_type, actor,
  is_reconstructed, recording_source, linked_artefacts, metadata
)
SELECT
  'closed',
  'engineering_work_order',
  ewo.id,
  'EWO-019',
  'EWO-019',
  'Engineering Work Order EWO-019 closed',
  'Engineering Work Order closed after Product Owner Acceptance',
  'human',
  'Product Owner',
  false,
  'live',
  jsonb_build_array(
    jsonb_build_object('artefact_type', 'engineering_work_order', 'artefact_ref', 'EWO-019', 'artefact_id', ewo.id::text)
  ),
  '{"closure_method": "po_acceptance", "completion_report": true}'::jsonb
FROM engineering_work_orders ewo
WHERE ewo.ewo_ref = 'EWO-019'
AND NOT EXISTS (
  SELECT 1 FROM engineering_change_log
  WHERE ewo_ref = 'EWO-019'
  AND change_type = 'closed'
  AND recording_source = 'live'
);
