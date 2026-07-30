/*
# Product Owner Review Workflow for Engineering Integrity

## Purpose
This migration creates the permanent Product Owner Review workflow for
Engineering Integrity batch items that require PO review
(NEEDS_PRODUCT_OWNER_REVIEW outcomes). It also adds supersession support
for legacy incomplete batches.

## New Tables

### engineering_integrity_po_reviews
Append-only audit table recording every Product Owner decision on a
batch item that required review. Each row captures the full decision
context: original outcome, final decision, evidence snapshot, revalidation
result, and reviewer identity. Final decisions are immutable.

Fields:
- id (uuid PK)
- batch_run_id (uuid FK to engineering_integrity_batch_runs)
- batch_item_id (uuid FK to engineering_integrity_batch_items, nullable for legacy items)
- alert_id (uuid FK to engineering_integrity_alerts)
- ewo_ref (text — the detected reference)
- original_outcome (text — the batch item's original outcome)
- review_status (text — pending | deferred | resolved)
- final_decision (text — APPROVE_HISTORICAL_RECOVERY | LINK_EXISTING_WORK_ORDER | INVALID_REFERENCE | FALSE_POSITIVE | DEFER_REVIEW | NO_SAFE_RECOVERY | null)
- decision_note (text — mandatory governed note)
- selected_existing_work_order_id (uuid — for LINK_EXISTING_WORK_ORDER)
- resulting_work_order_id (uuid — for APPROVE_HISTORICAL_RECOVERY)
- evidence_snapshot (jsonb — frozen evidence at decision time)
- fields_approved (jsonb — the exact fields the PO approved for creation)
- integrity_status_before (text — alert status before revalidation)
- integrity_status_after (text — alert status after revalidation)
- revalidation_result (text — resolved | remains_open | transformed | failed_validation)
- transaction_details (jsonb — technical transaction metadata)
- deferred_until (date — optional follow-up date for DEFER_REVIEW)
- reviewed_by (text — PO identity)
- reviewed_at (timestamptz — decision timestamp)
- created_at (timestamptz)
- updated_at (timestamptz)

### engineering_integrity_batch_runs (modified)
Added columns:
- superseded_by (uuid — references the replacement batch run ID)
- supersession_reason (text — why the original batch was superseded)
- legacy_status (text — 'SUPERSEDED_INCOMPLETE_AUDIT' or null)

## Security
- RLS enabled on engineering_integrity_po_reviews
- Authenticated users can CRUD their own reviews (TO authenticated)
- 4 separate policies (select/insert/update/delete)

## Indexes
- idx_po_reviews_review_status on review_status
- idx_po_reviews_batch_item on batch_item_id
- idx_po_reviews_batch_run on batch_run_id
- idx_po_reviews_alert_id on alert_id
- idx_po_reviews_ewo_ref on ewo_ref
- idx_po_reviews_reviewed_by on reviewed_by

## Important Notes
1. Final decisions are append-only — no destructive deletion of final decisions.
2. The DEFER_REVIEW decision keeps review_status as 'deferred' (not 'resolved').
3. All other decisions set review_status to 'resolved'.
4. The batch_item_id is nullable to support legacy items that were never persisted.
5. The superseded_by column on batch_runs links replacement batches to originals.
*/

-- ─── 1. Add supersession columns to batch_runs ──────────────────────────────
ALTER TABLE engineering_integrity_batch_runs
  ADD COLUMN IF NOT EXISTS superseded_by uuid,
  ADD COLUMN IF NOT EXISTS supersession_reason text,
  ADD COLUMN IF NOT EXISTS legacy_status text;

-- ─── 2. Create PO reviews table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS engineering_integrity_po_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_run_id uuid REFERENCES engineering_integrity_batch_runs(id) ON DELETE CASCADE,
  batch_item_id uuid REFERENCES engineering_integrity_batch_items(id) ON DELETE CASCADE,
  alert_id uuid REFERENCES engineering_integrity_alerts(id) ON DELETE CASCADE,
  ewo_ref text NOT NULL,
  original_outcome text NOT NULL DEFAULT 'NEEDS_PRODUCT_OWNER_REVIEW',
  review_status text NOT NULL DEFAULT 'pending',
  final_decision text,
  decision_note text,
  selected_existing_work_order_id uuid,
  resulting_work_order_id uuid,
  evidence_snapshot jsonb DEFAULT '{}'::jsonb,
  fields_approved jsonb DEFAULT '{}'::jsonb,
  integrity_status_before text,
  integrity_status_after text,
  revalidation_result text,
  transaction_details jsonb DEFAULT '{}'::jsonb,
  deferred_until date,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE engineering_integrity_po_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_po_reviews" ON engineering_integrity_po_reviews;
CREATE POLICY "select_own_po_reviews" ON engineering_integrity_po_reviews
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_po_reviews" ON engineering_integrity_po_reviews;
CREATE POLICY "insert_own_po_reviews" ON engineering_integrity_po_reviews
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_po_reviews" ON engineering_integrity_po_reviews;
CREATE POLICY "update_own_po_reviews" ON engineering_integrity_po_reviews
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_own_po_reviews" ON engineering_integrity_po_reviews;
CREATE POLICY "delete_own_po_reviews" ON engineering_integrity_po_reviews
  FOR DELETE TO authenticated USING (true);

-- ─── 3. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_po_reviews_review_status ON engineering_integrity_po_reviews(review_status);
CREATE INDEX IF NOT EXISTS idx_po_reviews_batch_item ON engineering_integrity_po_reviews(batch_item_id);
CREATE INDEX IF NOT EXISTS idx_po_reviews_batch_run ON engineering_integrity_po_reviews(batch_run_id);
CREATE INDEX IF NOT EXISTS idx_po_reviews_alert_id ON engineering_integrity_po_reviews(alert_id);
CREATE INDEX IF NOT EXISTS idx_po_reviews_ewo_ref ON engineering_integrity_po_reviews(ewo_ref);
CREATE INDEX IF NOT EXISTS idx_po_reviews_reviewed_by ON engineering_integrity_po_reviews(reviewed_by);

-- ─── 4. Mark the original incomplete batch as superseded ─────────────────────
UPDATE engineering_integrity_batch_runs
SET legacy_status = 'SUPERSEDED_INCOMPLETE_AUDIT',
    supersession_reason = 'The original batch implementation persisted only RECOVERED outcomes. This batch produced zero recovered items, so its 24 Product Owner review outcomes and one invalid-reference outcome were not persisted at item level.'
WHERE batch_ref = 'BATCH-INT-1784603327123';
