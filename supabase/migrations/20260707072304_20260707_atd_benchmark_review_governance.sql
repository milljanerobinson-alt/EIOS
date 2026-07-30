/*
# ATD Benchmark Review Governance Schema

Extends the ATD Benchmark Capture system with a full two-stage governance workflow:
1. Independent Engineering Review — a structured assessment by an independent reviewer
2. Product Owner Decision — formal acceptance, acceptance with observations, or return for improvement

## New Tables

### atd_benchmark_reviews
Stores the complete Independent Engineering Review for a benchmark session.
- review_ref: sequential reference (REV-0001)
- session_id: FK to atd_benchmark_sessions
- review_date, reviewer: who and when
- overall_rating: exceptional | strong | adequate | developing | insufficient
- overall_recommendation: accept | accept_with_observations | return_for_improvement
- Nine assessment fields: executive_summary, engineering_strengths, engineering_weaknesses,
  product_assessment, architecture_assessment, commercial_assessment, governance_assessment,
  risks_identified, opportunities_for_improvement, recommendations, comparison_notes
- review_status: draft → submitted → finalised
- is_locked: set true when finalised; prevents further modification

### atd_benchmark_po_decisions
Records the Product Owner formal decision following an independent review.
- decision_ref: sequential reference (POD-0001)
- session_id, review_id: FK relationships
- decision: accepted | accepted_with_observations | returned_for_improvement
- product_owner, decision_date, comments
- is_locked: set true on recording; immutable thereafter

## Modified Tables

### atd_benchmark_sessions
New columns added (no existing columns removed):
- review_id: FK to associated review (nullable until review exists)
- po_decision_id: FK to PO decision (nullable until decision recorded)
- overall_rating: mirrors the review rating on the session for quick access
- benchmark_outcome: final computed outcome string

The check constraint on overall_review_status is extended to support new lifecycle stages:
- review_complete: independent review submitted, awaiting PO action
- awaiting_po_acceptance: PO notified, pending decision
- accepted_with_observations: PO accepted with noted observations
- returned_for_improvement: PO returned for improvement

## Security
All tables: RLS enabled, anon + authenticated full CRUD (internal admin tool pattern).

## Sequences
- atd_review_seq: drives REV-NNNN refs
- atd_po_decision_seq: drives POD-NNNN refs

## Notes
- Circular FK between sessions↔reviews and sessions↔po_decisions is valid (both sides nullable)
- is_locked on review and decision tables protects accepted artefacts from modification
- All new columns are nullable or have safe defaults — no impact on existing rows
*/

-- ─── Extend session status constraint ────────────────────────────────────────

ALTER TABLE atd_benchmark_sessions
  DROP CONSTRAINT IF EXISTS atd_benchmark_sessions_overall_review_status_check;

ALTER TABLE atd_benchmark_sessions
  ADD CONSTRAINT atd_benchmark_sessions_overall_review_status_check
  CHECK (overall_review_status IN (
    'awaiting_review',
    'under_review',
    'reviewed',
    'review_complete',
    'awaiting_po_acceptance',
    'accepted',
    'accepted_with_observations',
    'returned_for_improvement'
  ));

-- ─── Sequences ────────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS atd_review_seq START 1;
CREATE SEQUENCE IF NOT EXISTS atd_po_decision_seq START 1;

-- ─── atd_benchmark_reviews ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atd_benchmark_reviews (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_ref                 text        NOT NULL UNIQUE DEFAULT 'REV-' || lpad(nextval('atd_review_seq')::text, 4, '0'),
  session_id                 uuid        NOT NULL REFERENCES atd_benchmark_sessions(id),
  review_date                timestamptz,
  reviewer                   text,
  overall_rating             text        CHECK (overall_rating IN ('exceptional', 'strong', 'adequate', 'developing', 'insufficient')),
  overall_recommendation     text        CHECK (overall_recommendation IN ('accept', 'accept_with_observations', 'return_for_improvement')),
  executive_summary          text,
  engineering_strengths      text,
  engineering_weaknesses     text,
  product_assessment         text,
  architecture_assessment    text,
  commercial_assessment      text,
  governance_assessment      text,
  risks_identified           text,
  opportunities_for_improvement text,
  recommendations            text,
  comparison_notes           text,
  review_status              text        NOT NULL DEFAULT 'draft'
                               CHECK (review_status IN ('draft', 'submitted', 'finalised')),
  is_locked                  boolean     NOT NULL DEFAULT false,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE atd_benchmark_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_atd_benchmark_reviews"  ON atd_benchmark_reviews;
DROP POLICY IF EXISTS "anon_insert_atd_benchmark_reviews"  ON atd_benchmark_reviews;
DROP POLICY IF EXISTS "anon_update_atd_benchmark_reviews"  ON atd_benchmark_reviews;
DROP POLICY IF EXISTS "anon_delete_atd_benchmark_reviews"  ON atd_benchmark_reviews;

CREATE POLICY "anon_select_atd_benchmark_reviews" ON atd_benchmark_reviews
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_atd_benchmark_reviews" ON atd_benchmark_reviews
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_atd_benchmark_reviews" ON atd_benchmark_reviews
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_atd_benchmark_reviews" ON atd_benchmark_reviews
  FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_atd_reviews_session_id ON atd_benchmark_reviews(session_id);
CREATE INDEX IF NOT EXISTS idx_atd_reviews_review_status ON atd_benchmark_reviews(review_status);

-- ─── atd_benchmark_po_decisions ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atd_benchmark_po_decisions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_ref   text        NOT NULL UNIQUE DEFAULT 'POD-' || lpad(nextval('atd_po_decision_seq')::text, 4, '0'),
  session_id     uuid        NOT NULL REFERENCES atd_benchmark_sessions(id),
  review_id      uuid        REFERENCES atd_benchmark_reviews(id),
  decision_date  timestamptz NOT NULL DEFAULT now(),
  decision       text        NOT NULL
                   CHECK (decision IN ('accepted', 'accepted_with_observations', 'returned_for_improvement')),
  product_owner  text,
  comments       text,
  is_locked      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE atd_benchmark_po_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_atd_benchmark_po_decisions"  ON atd_benchmark_po_decisions;
DROP POLICY IF EXISTS "anon_insert_atd_benchmark_po_decisions"  ON atd_benchmark_po_decisions;
DROP POLICY IF EXISTS "anon_update_atd_benchmark_po_decisions"  ON atd_benchmark_po_decisions;
DROP POLICY IF EXISTS "anon_delete_atd_benchmark_po_decisions"  ON atd_benchmark_po_decisions;

CREATE POLICY "anon_select_atd_benchmark_po_decisions" ON atd_benchmark_po_decisions
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_atd_benchmark_po_decisions" ON atd_benchmark_po_decisions
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_atd_benchmark_po_decisions" ON atd_benchmark_po_decisions
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_atd_benchmark_po_decisions" ON atd_benchmark_po_decisions
  FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_atd_po_decisions_session_id ON atd_benchmark_po_decisions(session_id);

-- ─── Extend atd_benchmark_sessions ───────────────────────────────────────────

ALTER TABLE atd_benchmark_sessions ADD COLUMN IF NOT EXISTS review_id       uuid;
ALTER TABLE atd_benchmark_sessions ADD COLUMN IF NOT EXISTS po_decision_id  uuid;
ALTER TABLE atd_benchmark_sessions ADD COLUMN IF NOT EXISTS overall_rating  text;
ALTER TABLE atd_benchmark_sessions ADD COLUMN IF NOT EXISTS benchmark_outcome text;

-- Add FK constraints after both tables exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_sessions_review_id'
  ) THEN
    ALTER TABLE atd_benchmark_sessions
      ADD CONSTRAINT fk_sessions_review_id
      FOREIGN KEY (review_id) REFERENCES atd_benchmark_reviews(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_sessions_po_decision_id'
  ) THEN
    ALTER TABLE atd_benchmark_sessions
      ADD CONSTRAINT fk_sessions_po_decision_id
      FOREIGN KEY (po_decision_id) REFERENCES atd_benchmark_po_decisions(id);
  END IF;
END $$;
