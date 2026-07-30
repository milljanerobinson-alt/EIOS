/*
# EWO-014.19A.7R.1 — Governed Maintenance: Product Owner Acceptance & Canonical Closure
#
# Records the exact authorised Product Owner Acceptance note on all 41 candidate
# EWOs, sets closure_eligible = true, and transitions them to canonical 'closed'
# status. Creates lifecycle history events for audit trail.
#
# This mirrors the exact logic of:
#   - lifecycleEvidenceEngine.grantPoAcceptance() (records acceptance)
#   - lifecycleEvidenceEngine.progressLifecycle() (transitions to closed)
#
# The acceptance note is the EXACT authorised note — not shortened, paraphrased,
# or replaced.
#
# Idempotency: Only updates EWOs that don't already have the acceptance note.
# Only creates lifecycle events for EWOs that don't already have a closure event.
*/

-- Step 1: Record Product Owner Acceptance (exact authorised note)
UPDATE engineering_work_orders
SET
  po_accepted_at = COALESCE(po_accepted_at, now()),
  po_accepted_by = COALESCE(po_accepted_by, 'product_owner'),
  po_acceptance_statement = 'Product Owner Acceptance granted. Verified successful historical import, audit trail preservation, duplicate protection, and canonical closure method resolution. Approved for Engineering Ledger migration.',
  closure_eligible = true,
  verification_status = 'verified',
  updated_at = now()
WHERE ewo_ref != 'TEST'
  AND (po_acceptance_statement IS NULL
       OR po_acceptance_statement != 'Product Owner Acceptance granted. Verified successful historical import, audit trail preservation, duplicate protection, and canonical closure method resolution. Approved for Engineering Ledger migration.');

-- Step 2: Transition to closed status (canonical closure)
UPDATE engineering_work_orders
SET
  status = 'closed',
  closure_eligible = true,
  closed_at = COALESCE(closed_at, now()),
  closure_method = COALESCE(closure_method, 'Historical Migration'),
  updated_at = now()
WHERE ewo_ref != 'TEST'
  AND status != 'closed';

-- Step 3: Create lifecycle history events for EWOs that don't have a closure event
INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata, created_at)
SELECT
  e.id,
  e.status,
  'closed',
  'product_owner',
  'Governed maintenance script — canonical closure after PO acceptance. Derived state: closed. Closure eligible: true.',
  jsonb_build_object(
    'standard', 'EWO-014.19A.7R.1',
    'derived_state', 'closed',
    'closure_eligible', true,
    'acceptance_note', 'Product Owner Acceptance granted. Verified successful historical import, audit trail preservation, duplicate protection, and canonical closure method resolution. Approved for Engineering Ledger migration.',
    'script_name', 'ewo-014-19a-7r1-governed-maintenance',
    'script_version', '1.0.0'
  ),
  now()
FROM engineering_work_orders e
WHERE e.ewo_ref != 'TEST'
  AND NOT EXISTS (
    SELECT 1 FROM ewo_lifecycle_events ev
    WHERE ev.ewo_id = e.id
      AND ev.to_status = 'closed'
      AND ev.metadata->>'standard' = 'EWO-014.19A.7R.1'
  );
