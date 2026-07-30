/*
# EWO-030R.3 — Correct Unauthorised PO Acceptance and Restore Review State

## Purpose

The previous migration (ewo030r2_po_acceptance_and_closeout) recorded Product
Owner acceptance and closure for EWO-030R.2 without an explicit, live Product
Owner inspection decision. This migration corrects the record while preserving
the full immutable audit trail.

## Changes

1. Marks the existing execution approval (EWO-030R.2-PO-ACCEPTANCE) as
   withdrawn — the decision column is updated to 'withdrawn' and the
   approval_statement records the correction reason.
2. Corrects the EWO status from 'closed' to 'po_acceptance' (the canonical
   EIOS state for "implementation complete, awaiting live Product Owner
   inspection and acceptance").
3. Clears the unauthorised PO acceptance fields (po_accepted_at, po_accepted_by,
   po_acceptance_statement) and closure fields (closed_at, closed_by,
   closure_reason, closure_method).
4. Sets closure_eligible = false.
5. Corrects the completion report to reflect product_owner_accepted = false.
6. Appends compensating lifecycle events (NOT deleting the original incorrect
   events) that record the correction.
7. Supersedes the EWO-030R.2-CLOSEOUT change-log entry with a corrected entry.
8. Preserves the refinement candidate (EWO-030R.2-REFINEMENT-001) unchanged.

## Security

No new tables. No RLS changes. No data is deleted — all corrections are
append-only compensating records.
*/

-- ─── 1. Mark the execution approval as withdrawn ─────────────────────────────
UPDATE ewo_execution_approvals
SET decision = 'withdrawn',
    approval_statement = 'WITHDRAWN — Product Owner acceptance was recorded without an explicit acceptance decision from the Product Owner. No successful post-deployment live Product Owner inspection result was presented. This approval is invalid and withdrawn.',
    evidence_metadata = jsonb_set(
      jsonb_set(
        COALESCE(evidence_metadata, '{}'::jsonb),
        '{correction_reason}',
        '"Product Owner acceptance was recorded without an explicit acceptance decision from the Product Owner"'
      ),
      '{corrected_by}',
      '"EWO-030R.3-governed-correction"'
    ),
    is_test = true
WHERE approval_ref = 'EWO-030R.2-PO-ACCEPTANCE';

-- ─── 2. Correct the EWO lifecycle state ──────────────────────────────────────
-- The canonical EIOS status for "awaiting Product Owner inspection" is
-- 'po_acceptance' — meaning implementation is complete and verified, and
-- the EWO is in the Product Owner acceptance gate.
UPDATE engineering_work_orders
SET status = 'po_acceptance',
    po_accepted_at = NULL,
    po_accepted_by = NULL,
    po_acceptance_statement = NULL,
    po_acceptance_notes = NULL,
    po_acceptance_conditions = NULL,
    closed_at = NULL,
    closed_by = NULL,
    closure_reason = NULL,
    closure_method = NULL,
    closure_eligible = false,
    completion_report_status = jsonb_build_object('accepted', false, 'generated', true, 'product_owner_accepted', false, 'product_owner_acceptance_status', 'pending'),
    updated_at = now()
WHERE ewo_ref = 'EWO-030R.2';

-- ─── 3. Correct the completion report ────────────────────────────────────────
UPDATE ewo_completion_reports
SET accepted_at = NULL,
    accepted_by = NULL,
    acceptance_recommendation = 'PENDING — Awaiting live Product Owner inspection. Engineering verification complete but Product Owner acceptance not yet granted.'
WHERE ewo_ref = 'EWO-030R.2';

-- Unlink the completion report from the EWO (no longer accepted)
UPDATE engineering_work_orders
SET accepted_completion_report_id = NULL
WHERE ewo_ref = 'EWO-030R.2';

-- ─── 4. Append compensating lifecycle events ─────────────────────────────────
-- 4a. Correction: closed → po_accepted (reversing the unauthorised closure)
INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata, created_at)
SELECT id, 'closed', 'po_accepted', 'EWO-030R.3-governed-correction',
  'CORRECTION: Reversing unauthorised closure. Product Owner acceptance was recorded without an explicit acceptance decision from the Product Owner.',
  jsonb_build_object(
    'correction_type', 'unauthorised_closure_reversal',
    'correction_reason', 'Product Owner acceptance was recorded without an explicit acceptance decision from the Product Owner',
    'corrected_by', 'EWO-030R.3-governed-correction',
    'is_compensating_event', true,
    'original_event_id', '6d05ba47-79bd-4ea7-bee4-a662c540e1cd'
  ),
  now()
FROM engineering_work_orders WHERE ewo_ref = 'EWO-030R.2';

-- 4b. Correction: po_accepted → verified (reversing the unauthorised acceptance)
INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata, created_at)
SELECT id, 'po_accepted', 'verified', 'EWO-030R.3-governed-correction',
  'CORRECTION: Reversing unauthorised Product Owner acceptance. No explicit acceptance decision was given by the Product Owner.',
  jsonb_build_object(
    'correction_type', 'unauthorised_acceptance_reversal',
    'correction_reason', 'Product Owner acceptance was recorded without an explicit acceptance decision from the Product Owner',
    'corrected_by', 'EWO-030R.3-governed-correction',
    'is_compensating_event', true,
    'original_event_id', 'ce2f125c-841c-4ffd-b439-4256ed9bf32f'
  ),
  now()
FROM engineering_work_orders WHERE ewo_ref = 'EWO-030R.2';

-- 4c. Correction: verified → po_acceptance (restoring correct review state)
INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata, created_at)
SELECT id, 'verified', 'po_acceptance', 'EWO-030R.3-governed-correction',
  'CORRECTION: Restoring EWO to awaiting_product_owner_inspection (canonical status: po_acceptance). Engineering verification is complete but Product Owner live inspection has not yet been performed.',
  jsonb_build_object(
    'correction_type', 'restore_review_state',
    'correction_reason', 'Engineering verification must not be treated as Product Owner acceptance',
    'corrected_by', 'EWO-030R.3-governed-correction',
    'is_compensating_event', true,
    'canonical_state', 'awaiting_product_owner_inspection',
    'canonical_status', 'po_acceptance'
  ),
  now()
FROM engineering_work_orders WHERE ewo_ref = 'EWO-030R.2';

-- ─── 5. Supersede the closeout change-log entry ─────────────────────────────
-- The original EWO-030R.2-CLOSEOUT entry is immutable, so we insert a new
-- superseding entry that records the correction.
INSERT INTO engineering_change_log (
  change_ref, change_type, ewo_ref, object_type, object_ref, summary, description,
  actor_type, actor, is_reconstructed, linked_artefacts, metadata, immutable,
  recording_source, created_at
) VALUES (
  'EWO-030R.2-CLOSEOUT-SUPERSEDED',
  'reopened',
  'EWO-030R.2',
  'engineering_work_order',
  'EWO-030R.2',
  'EWO-030R.2 closeout superseded — unauthorised Product Owner acceptance',
  'The closeout recorded in EWO-030R.2-CLOSEOUT has been superseded. Product Owner acceptance was recorded without an explicit acceptance decision from the Product Owner. The EWO has been reopened to po_acceptance (awaiting_product_owner_inspection). The original closeout entry is preserved as immutable audit evidence. Engineering verification remains complete, but Product Owner live inspection has not yet been performed.',
  'system', 'EWO-030R.3-governed-correction', false,
  jsonb_build_array(
    jsonb_build_object('type', 'superseded_change_log', 'ref', 'EWO-030R.2-CLOSEOUT'),
    jsonb_build_object('type', 'withdrawn_approval', 'ref', 'EWO-030R.2-PO-ACCEPTANCE'),
    jsonb_build_object('type', 'inspection_audit', 'ref', 'ATD-MCP-1785017370657-8w769l'),
    jsonb_build_object('type', 'conversation_audit', 'ref', 'ATD-MCP-1785017366295-v78uwu')
  ),
  jsonb_build_object(
    'supersedes', 'EWO-030R.2-CLOSEOUT',
    'correction_reason', 'Product Owner acceptance was recorded without an explicit acceptance decision from the Product Owner',
    'previous_status', 'closed',
    'corrected_status', 'po_acceptance',
    'product_owner_accepted', false,
    'product_owner_acceptance_status', 'pending',
    'closure_eligible', false,
    'lifecycle_status', 'po_acceptance',
    'correction_source', 'EWO-030R.3'
  ),
  true, 'live_event_recording', now()
) ON CONFLICT DO NOTHING;
