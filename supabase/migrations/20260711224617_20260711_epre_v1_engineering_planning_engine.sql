/*
# Engineering Planning & Recommendation Engine (EPRE) v1.0

## Summary
Establishes the persistence layer for the Engineering Planning &
Recommendation Engine. The EPRE analyses the live engineering programme
and generates structured recommendations for the highest-value next
Engineering Work Order.

## New Tables

### epre_recommendations
Each row is one planning analysis run. Stores the full recommendation
payload including the scoring matrix, dependency analysis, health
metrics snapshot, and the recommended next EWO.

### epre_programme_snapshots
Lightweight periodic health snapshots of the engineering programme
(counts, velocity, completion rate). Enables trending over time.

## Security
RLS enabled — authenticated CRUD only (internal ECC tool).
*/

-- ─── epre_recommendations ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS epre_recommendations (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_ref                 TEXT        NOT NULL,   -- e.g. EPRE-RUN-001

  -- Top recommendation
  recommended_ewo_ref     TEXT,                   -- e.g. EWO-004
  recommended_ewo_id      UUID        REFERENCES engineering_work_orders(id) ON DELETE SET NULL,
  recommended_title       TEXT,
  exec_summary            TEXT,
  business_value          TEXT,
  engineering_value       TEXT,
  strategic_alignment     TEXT,
  estimated_effort        TEXT,
  estimated_risk          TEXT,
  reasoning               TEXT,
  recommended_next_action TEXT,

  -- Full scored programme snapshot
  scored_programme        JSONB       NOT NULL DEFAULT '[]',  -- array of ScoredEWO objects
  blocked_ewos            JSONB       NOT NULL DEFAULT '[]',  -- EWO refs that are blocked
  dependency_graph        JSONB       NOT NULL DEFAULT '{}',  -- ref → [blocking refs]
  high_priority_queue     JSONB       NOT NULL DEFAULT '[]',  -- top-N next EWOs

  -- Health metrics at time of run
  total_ewos              INT         NOT NULL DEFAULT 0,
  active_ewos             INT         NOT NULL DEFAULT 0,
  blocked_count           INT         NOT NULL DEFAULT 0,
  completed_count         INT         NOT NULL DEFAULT 0,
  in_progress_count       INT         NOT NULL DEFAULT 0,
  health_score            NUMERIC(5,2),           -- 0–100

  -- Velocity (last 30 days)
  ewos_closed_30d         INT         NOT NULL DEFAULT 0,
  ewos_started_30d        INT         NOT NULL DEFAULT 0,

  -- Meta
  generated_by            TEXT        NOT NULL DEFAULT 'ATD',
  engine_version          TEXT        NOT NULL DEFAULT 'EPRE-v1.0',
  analysis_notes          TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epre_recs_run_ref    ON epre_recommendations(run_ref);
CREATE INDEX IF NOT EXISTS idx_epre_recs_ewo_ref    ON epre_recommendations(recommended_ewo_ref);
CREATE INDEX IF NOT EXISTS idx_epre_recs_created    ON epre_recommendations(created_at DESC);

ALTER TABLE epre_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "epre_recs_select" ON epre_recommendations;
DROP POLICY IF EXISTS "epre_recs_insert" ON epre_recommendations;
DROP POLICY IF EXISTS "epre_recs_update" ON epre_recommendations;
DROP POLICY IF EXISTS "epre_recs_delete" ON epre_recommendations;

CREATE POLICY "epre_recs_select" ON epre_recommendations FOR SELECT TO authenticated USING (true);
CREATE POLICY "epre_recs_insert" ON epre_recommendations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "epre_recs_update" ON epre_recommendations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "epre_recs_delete" ON epre_recommendations FOR DELETE TO authenticated USING (true);

-- ─── epre_programme_snapshots ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS epre_programme_snapshots (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  total_ewos      INT         NOT NULL DEFAULT 0,
  active_ewos     INT         NOT NULL DEFAULT 0,
  blocked_count   INT         NOT NULL DEFAULT 0,
  completed_count INT         NOT NULL DEFAULT 0,
  in_progress_count INT       NOT NULL DEFAULT 0,
  health_score    NUMERIC(5,2),
  velocity_30d    INT         NOT NULL DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_epre_snap_date ON epre_programme_snapshots(snapshot_date DESC);

ALTER TABLE epre_programme_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "epre_snap_select" ON epre_programme_snapshots;
DROP POLICY IF EXISTS "epre_snap_insert" ON epre_programme_snapshots;
DROP POLICY IF EXISTS "epre_snap_update" ON epre_programme_snapshots;
DROP POLICY IF EXISTS "epre_snap_delete" ON epre_programme_snapshots;

CREATE POLICY "epre_snap_select" ON epre_programme_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "epre_snap_insert" ON epre_programme_snapshots FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "epre_snap_update" ON epre_programme_snapshots FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "epre_snap_delete" ON epre_programme_snapshots FOR DELETE TO authenticated USING (true);
