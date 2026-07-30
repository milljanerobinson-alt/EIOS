/*
# EWO-014.3.1 — Governed Migration Planner v1.0

## Summary

Implements the Governed Migration Planner defined by EOCPS-001.
This EWO is PLANNING ONLY — it does NOT execute any ownership migrations,
create SPCs, modify lineage, or change any ownership metadata.

The planner analyses an APPROVED Engineering Classification Review (ECR)
and generates a complete, immutable Migration Plan that describes exactly
what will happen if the migration is executed in a future EWO.

## New Tables

### ecc_migration_plans

Holds immutable migration plan snapshots generated from approved ECRs.

Columns:
- `id` — uuid primary key
- `plan_ref` — MP-YYYY-NNN format, unique
- `review_id` — FK to ecc_governed_reviews (the approved ECR)
- `status` — draft | ready | frozen | superseded
- `created_at` — timestamp
- `created_by` — text
- `constitutional_version` — text
- `decision_hash` — text (SHA-256 of the review decision for immutability verification)
- `risk_score` — low | medium | high
- `estimated_operations` — integer count of planned operations
- `estimated_duration_seconds` — integer estimate
- `rollback_available` — boolean
- `execution_ready_score` — integer 0–100
- `snapshot_json` — jsonb (full immutable snapshot)
- `diff_json` — jsonb (structured migration diff)
- `validation_json` — jsonb (validation results)
- `created_from_review_version` — text
- `closed_at` — timestamp (set when parent ECR is closed, freezing the plan)

## Security
- RLS enabled on ecc_migration_plans.
- Single-tenant pattern: anon + authenticated CRUD with USING(true).
- This is a platform governance table — all platform users have access.

## Important Notes
1. Plans are immutable snapshots — once created they are never updated
   (except for status transitions: draft→ready, ready→frozen, ready→superseded).
2. Plans may be regenerated while the parent ECR remains open (creates a new plan).
3. Once the parent ECR is Closed, the latest plan becomes frozen.
4. Only APPROVED ECRs may have plans generated. The service layer enforces this.
5. No execution logic exists in this EWO — planning only.
*/

-- ─── Sequence for plan_ref generation ─────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS ecc_migration_plans_seq;

CREATE OR REPLACE FUNCTION generate_migration_plan_ref()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'MP-' || extract(year from now())::text || '-' || lpad(nextval('ecc_migration_plans_seq')::text, 3, '0');
$$;

-- ─── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_migration_plans (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_ref                    text NOT NULL DEFAULT generate_migration_plan_ref() UNIQUE,
  review_id                   uuid NOT NULL REFERENCES ecc_governed_reviews(id) ON DELETE CASCADE,
  status                      text NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'ready', 'frozen', 'superseded')),

  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  text NOT NULL DEFAULT 'platform',

  constitutional_version      text NOT NULL DEFAULT 'EOCPS-001 v1.0',
  decision_hash               text,
  risk_score                  text NOT NULL DEFAULT 'low'
                              CHECK (risk_score IN ('low', 'medium', 'high')),
  estimated_operations        integer NOT NULL DEFAULT 0,
  estimated_duration_seconds integer NOT NULL DEFAULT 0,
  rollback_available          boolean NOT NULL DEFAULT true,
  execution_ready_score       integer NOT NULL DEFAULT 0
                              CHECK (execution_ready_score >= 0 AND execution_ready_score <= 100),

  snapshot_json               jsonb NOT NULL DEFAULT '{}'::jsonb,
  diff_json                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_json             jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_from_review_version text,
  closed_at                   timestamptz
);

-- ─── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_migration_plans_review_id
  ON ecc_migration_plans (review_id);

CREATE INDEX IF NOT EXISTS idx_migration_plans_status
  ON ecc_migration_plans (status);

CREATE INDEX IF NOT EXISTS idx_migration_plans_risk
  ON ecc_migration_plans (risk_score);

CREATE INDEX IF NOT EXISTS idx_migration_plans_created_at
  ON ecc_migration_plans (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_migration_plans_ready_score
  ON ecc_migration_plans (execution_ready_score DESC);

-- ─── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE ecc_migration_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_migration_plans" ON ecc_migration_plans;
CREATE POLICY "anon_select_migration_plans" ON ecc_migration_plans FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_migration_plans" ON ecc_migration_plans;
CREATE POLICY "anon_insert_migration_plans" ON ecc_migration_plans FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_migration_plans" ON ecc_migration_plans;
CREATE POLICY "anon_update_migration_plans" ON ecc_migration_plans FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_migration_plans" ON ecc_migration_plans;
CREATE POLICY "anon_delete_migration_plans" ON ecc_migration_plans FOR DELETE
  TO anon, authenticated USING (true);
