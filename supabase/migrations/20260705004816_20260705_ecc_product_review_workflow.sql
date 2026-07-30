/*
# ECC Feature Product Review Workflow

## Summary
Extends the engineering workspace with a formal Product Owner acceptance workflow,
AI readiness tracking, and a full review audit trail.

## Changes

### Modified Table: ecc_product_features
New columns:
- `product_review_status` (text, default 'not_started') — lifecycle of the review: not_started, requested, in_review, approved, rejected, changes_requested, sent_back_to_dev, sent_back_to_testing
- `ai_readiness` (text, default 'ready') — AI pipeline state: ready, awaiting_approval, analysing, preparing, developing, testing, ready_for_review, blocked, ready_for_release
- `reviewer` (text) — display name of the assigned reviewer
- `review_requested_at` (timestamptz) — when review was first requested
- `review_started_at` (timestamptz) — when reviewer opened the review
- `accepted_by` (text) — display name of the PO who accepted
- `accepted_at` (timestamptz) — timestamp of acceptance
- `acceptance_version` (text) — version string at time of acceptance
- `review_notes` (text) — general reviewer notes
- `approval_comments` (text) — formal approval statement
- `rejection_reason` (text) — reason if rejected
- `requested_changes` (text) — description of changes requested
- `review_checklist` (jsonb, default '[]') — array of {id, label, checked} checklist items

### New Table: ecc_feature_review_history
Full immutable audit trail of every review action taken on a feature.
Columns:
- `id` (uuid, pk)
- `feature_id` (uuid, fk → ecc_product_features)
- `action` (text) — approved, rejected, changes_requested, sent_back_to_dev, sent_back_to_testing, review_requested, review_started, marked_ready_for_release
- `actor` (text) — display name of person who took the action
- `notes` (text) — optional notes attached to the action
- `from_status` (text) — product_review_status before the action
- `to_status` (text) — product_review_status after the action
- `from_lifecycle` (text) — lifecycle_stage before the action
- `to_lifecycle` (text) — lifecycle_stage after the action
- `checklist_snapshot` (jsonb) — snapshot of checklist state at time of action
- `metadata` (jsonb) — flexible extra fields (testing_status_at_action, docs_status_at_action, etc.)
- `created_at` (timestamptz, default now())

## Security
RLS enabled on both tables. Using anon + authenticated policies (single-tenant app, no per-user isolation).
*/

-- ============================================================
-- Extend ecc_product_features
-- ============================================================

ALTER TABLE ecc_product_features
  ADD COLUMN IF NOT EXISTS product_review_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS ai_readiness text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS reviewer text,
  ADD COLUMN IF NOT EXISTS review_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by text,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS acceptance_version text,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS approval_comments text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS requested_changes text,
  ADD COLUMN IF NOT EXISTS review_checklist jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ============================================================
-- New table: ecc_feature_review_history
-- ============================================================

CREATE TABLE IF NOT EXISTS ecc_feature_review_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id uuid NOT NULL REFERENCES ecc_product_features(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor text NOT NULL DEFAULT 'System',
  notes text,
  from_status text,
  to_status text,
  from_lifecycle text,
  to_lifecycle text,
  checklist_snapshot jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_review_history_feature_id
  ON ecc_feature_review_history (feature_id);

CREATE INDEX IF NOT EXISTS idx_feature_review_history_created_at
  ON ecc_feature_review_history (created_at DESC);

ALTER TABLE ecc_feature_review_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_review_history" ON ecc_feature_review_history;
CREATE POLICY "anon_select_review_history" ON ecc_feature_review_history FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_review_history" ON ecc_feature_review_history;
CREATE POLICY "anon_insert_review_history" ON ecc_feature_review_history FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_review_history" ON ecc_feature_review_history;
CREATE POLICY "anon_update_review_history" ON ecc_feature_review_history FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_review_history" ON ecc_feature_review_history;
CREATE POLICY "anon_delete_review_history" ON ecc_feature_review_history FOR DELETE
  TO anon, authenticated USING (true);
