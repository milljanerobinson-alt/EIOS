/*
# EWO-017R — Lifecycle Truthfulness: Correct Bootstrap Status + Transparency Columns

## Context
EWO-017R Requirement 1 ("Product Owner Acceptance Controls Closure") and
Requirement 2 ("Historical Bootstrap Lifecycle") require that an EWO may only
be `closed` when Product Owner acceptance is granted. The retrospective
governance bootstrap (migration ewo014_19a7_governance_bootstrap_missing_ewos)
set three EWOs to `status='closed'` while their completion reports correctly
stated PO testing and acceptance were pending. This is the lifecycle lie that
EWO-017R corrects.

## Lifecycle Status Mapping (using existing CHECK-constrained values)
The `engineering_work_orders.status` column has a CHECK constraint allowing:
  draft, architecture_review, engineering_approved, po_approved, ready,
  in_progress, engineering_validation, engineering_complete,
  engineering_verification, verified, report_generated, po_acceptance,
  closed, archived, ready_for_review

EWO-017R lifecycle states map to these as:
  - Engineering Complete, PO Testing Pending  →  engineering_complete
  - Awaiting Product Owner Acceptance         →  po_acceptance
  - Closed (PO Accepted)                       →  closed

## Changes
1. Adds 6 new columns to `engineering_work_orders`:
   - `bootstrap_origin` (text) — 'Implementation Bootstrap' for retrospectively
     registered EWOs, NULL for normally-created EWOs. (Requirement 5)
   - `bootstrap_date` (timestamptz) — when the bootstrap registration occurred.
   - `bootstrap_reason` (text) — why the bootstrap was needed.
   - `po_testing_status` (text DEFAULT 'pending') — 'pending' | 'completed' | 'not_required'.
   - `po_testing_completed_at` (timestamptz) — when PO testing was completed.
   - `closure_eligible` (boolean DEFAULT false) — computed flag: true only when
     implementation complete + completion report + PO testing completed +
     PO acceptance granted. Single source of truth for closure validity.
2. Corrects the 3 bootstrapped EWOs from `status='closed'` to
   `status='engineering_complete'` (truthful: implementation complete,
   PO testing pending).
3. Records a lifecycle event for each corrected EWO.

## Security
No new tables. No RLS policy changes. Column additions are safe.

## Idempotency
Column additions use IF NOT EXISTS. EWO updates use WHERE status='closed'
guard. Lifecycle event inserts use WHERE NOT EXISTS guards.

## Regression Protection (Requirement 8)
This migration does NOT change: Engineering Governance Bootstrap process,
Prompt Generation Guard, canonical EWO creation, Engineering Package
attachment, Completion Report placeholder creation, or parent-child
relationships. It only corrects lifecycle truthfulness.
*/

-- ============================================================================
-- STEP 1: Add bootstrap transparency and PO evidence columns
-- ============================================================================

ALTER TABLE engineering_work_orders
  ADD COLUMN IF NOT EXISTS bootstrap_origin text,
  ADD COLUMN IF NOT EXISTS bootstrap_date timestamptz,
  ADD COLUMN IF NOT EXISTS bootstrap_reason text,
  ADD COLUMN IF NOT EXISTS po_testing_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS po_testing_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closure_eligible boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ewo_po_testing_status
  ON engineering_work_orders (po_testing_status);
CREATE INDEX IF NOT EXISTS idx_ewo_closure_eligible
  ON engineering_work_orders (closure_eligible);
CREATE INDEX IF NOT EXISTS idx_ewo_bootstrap_origin
  ON engineering_work_orders (bootstrap_origin);

-- ============================================================================
-- STEP 2: Correct the 3 bootstrapped EWOs to truthful lifecycle state
-- ============================================================================
-- Truthful state: implementation complete, PO testing pending
-- → status = 'engineering_complete' (within CHECK constraint)

UPDATE engineering_work_orders
SET
  status = 'engineering_complete',
  po_testing_status = 'pending',
  closure_eligible = false,
  bootstrap_origin = 'Implementation Bootstrap',
  bootstrap_date = '2026-07-19T23:03:53Z',
  bootstrap_reason = 'Governance audit revealed this EWO was implemented without canonical ledger registration. Bootstrapped retrospectively per Permanent Engineering Standard Step 2 (Create If Missing).',
  updated_at = now()
WHERE ewo_ref = 'EWO-014.19A.7' AND status = 'closed';

UPDATE engineering_work_orders
SET
  status = 'engineering_complete',
  po_testing_status = 'pending',
  closure_eligible = false,
  bootstrap_origin = 'Implementation Bootstrap',
  bootstrap_date = '2026-07-19T23:03:53Z',
  bootstrap_reason = 'Governance audit revealed this EWO was implemented without canonical ledger registration. Bootstrapped retrospectively per Permanent Engineering Standard Step 2 (Create If Missing).',
  updated_at = now()
WHERE ewo_ref = 'EWO-017' AND status = 'closed';

UPDATE engineering_work_orders
SET
  status = 'engineering_complete',
  po_testing_status = 'pending',
  closure_eligible = false,
  bootstrap_origin = 'Implementation Bootstrap',
  bootstrap_date = '2026-07-19T23:03:53Z',
  bootstrap_reason = 'Governance audit revealed this EWO was implemented without canonical ledger registration. Bootstrapped retrospectively per Permanent Engineering Standard Step 2 (Create If Missing). Corrects the false 100% integrity score from EWO-014.19A.7.',
  updated_at = now()
WHERE ewo_ref = 'EWO-014.19A.7R' AND status = 'closed';

-- ============================================================================
-- STEP 3: Record lifecycle events for the truthfulness corrections
-- ============================================================================

INSERT INTO ewo_lifecycle_events (
  ewo_id, from_status, to_status, actor, notes, metadata, created_at
)
SELECT
  e.id, 'closed', 'engineering_complete', 'governance_bootstrap',
  'Lifecycle truthfulness correction (EWO-017R). Status was incorrectly set to closed during retrospective bootstrap while PO testing and acceptance were pending. Corrected to engineering_complete to reflect true governance state: implementation complete, PO testing pending.',
  '{"origin":"implementation_bootstrap","reason":"lifecycle_truthfulness_correction","standard":"EWO-017R","corrects":"premature_closure"}'::jsonb,
  now()
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-014.19A.7'
  AND NOT EXISTS (
    SELECT 1 FROM ewo_lifecycle_events l
    WHERE l.ewo_id = e.id
      AND l.metadata->>'reason' = 'lifecycle_truthfulness_correction'
  );

INSERT INTO ewo_lifecycle_events (
  ewo_id, from_status, to_status, actor, notes, metadata, created_at
)
SELECT
  e.id, 'closed', 'engineering_complete', 'governance_bootstrap',
  'Lifecycle truthfulness correction (EWO-017R). Status was incorrectly set to closed during retrospective bootstrap while PO testing and acceptance were pending. Corrected to engineering_complete to reflect true governance state: implementation complete, PO testing pending.',
  '{"origin":"implementation_bootstrap","reason":"lifecycle_truthfulness_correction","standard":"EWO-017R","corrects":"premature_closure"}'::jsonb,
  now()
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-017'
  AND NOT EXISTS (
    SELECT 1 FROM ewo_lifecycle_events l
    WHERE l.ewo_id = e.id
      AND l.metadata->>'reason' = 'lifecycle_truthfulness_correction'
  );

INSERT INTO ewo_lifecycle_events (
  ewo_id, from_status, to_status, actor, notes, metadata, created_at
)
SELECT
  e.id, 'closed', 'engineering_complete', 'governance_bootstrap',
  'Lifecycle truthfulness correction (EWO-017R). Status was incorrectly set to closed during retrospective bootstrap while PO testing and acceptance were pending. Corrected to engineering_complete to reflect true governance state: implementation complete, PO testing pending.',
  '{"origin":"implementation_bootstrap","reason":"lifecycle_truthfulness_correction","standard":"EWO-017R","corrects":"premature_closure"}'::jsonb,
  now()
FROM engineering_work_orders e
WHERE e.ewo_ref = 'EWO-014.19A.7R'
  AND NOT EXISTS (
    SELECT 1 FROM ewo_lifecycle_events l
    WHERE l.ewo_id = e.id
      AND l.metadata->>'reason' = 'lifecycle_truthfulness_correction'
  );
