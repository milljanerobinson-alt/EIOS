/*
# Engineering Audit System — Phase X

## Summary
Extends the engineering audit infrastructure with:
1. Recommendation tracking (REC-001 permanent IDs)
2. Health history snapshots for trend analysis
3. Engineering Register framework (permanent immutable IDs across all object types)
4. Audit category and audit date fields on ecc_audits

## New Tables
- `ecc_audit_recommendations` — First-class recommendation objects (REC-xxx) linked to audits
  - rec_number: permanent immutable ID (REC-001, REC-002, etc.)
  - status: open → in_progress → completed | deferred | cancelled
  - priority: critical, high, medium, low
  - owner, due_date, completion_notes
- `ecc_health_history` — Snapshot store for audit health scores to enable trend analysis
  - Linked to an audit, stores overall_score + category_scores jsonb
- `ecc_register_sequences` — Counter table driving permanent ID generation per object type
- `ecc_engineering_register` — Master index of all permanent engineering objects (AUD-xxx, REC-xxx, etc.)

## Modified Tables
- `ecc_audits`
  - Added: audit_category (text, default 'platform_health') — supports future multi-category audits
  - Added: audit_date (date, nullable) — explicit date for historical/backdated audits

## Security
- All new tables have RLS enabled
- Single-tenant app (no sign-in screen) — all policies use TO anon, authenticated
- get_next_register_number() RPC uses SECURITY DEFINER so sequences are only modified via the function

## Important Notes
1. ecc_rec_number_seq is a PostgreSQL sequence for auto-incrementing REC numbers
2. ecc_register_sequences / ecc_engineering_register support the broader Engineering Register (AUD, REC, RISK, FEAT, EPIC, REL, MILE, ADR)
3. Existing ecc_audits data is unaffected — only additive column changes
4. get_next_register_number(text) RPC is callable from the frontend via supabase.rpc()
*/

-- ── Extend ecc_audits ───────────────────────────────────────────────────────

ALTER TABLE ecc_audits
  ADD COLUMN IF NOT EXISTS audit_category text NOT NULL DEFAULT 'platform_health',
  ADD COLUMN IF NOT EXISTS audit_date date;

-- ── Recommendation number sequence ─────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS ecc_rec_number_seq START WITH 1;

-- ── ecc_audit_recommendations ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_audit_recommendations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rec_number  text NOT NULL DEFAULT ('REC-' || LPAD(nextval('ecc_rec_number_seq')::text, 3, '0')),
  audit_id    uuid NOT NULL REFERENCES ecc_audits(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'open',
  priority    text NOT NULL DEFAULT 'medium',
  owner       text,
  due_date    date,
  completion_notes text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recs_audit_id ON ecc_audit_recommendations(audit_id);
CREATE INDEX IF NOT EXISTS idx_recs_status   ON ecc_audit_recommendations(status);

ALTER TABLE ecc_audit_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_recs" ON ecc_audit_recommendations;
CREATE POLICY "anon_select_recs" ON ecc_audit_recommendations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_recs" ON ecc_audit_recommendations;
CREATE POLICY "anon_insert_recs" ON ecc_audit_recommendations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_recs" ON ecc_audit_recommendations;
CREATE POLICY "anon_update_recs" ON ecc_audit_recommendations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_recs" ON ecc_audit_recommendations;
CREATE POLICY "anon_delete_recs" ON ecc_audit_recommendations FOR DELETE
  TO anon, authenticated USING (true);

-- ── ecc_health_history ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_health_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id        uuid NOT NULL REFERENCES ecc_audits(id) ON DELETE CASCADE,
  overall_score   integer NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  category_scores jsonb NOT NULL DEFAULT '{}',
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  notes           text
);

CREATE INDEX IF NOT EXISTS idx_health_history_audit_id    ON ecc_health_history(audit_id);
CREATE INDEX IF NOT EXISTS idx_health_history_recorded_at ON ecc_health_history(recorded_at);

ALTER TABLE ecc_health_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_health_history" ON ecc_health_history;
CREATE POLICY "anon_select_health_history" ON ecc_health_history FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_health_history" ON ecc_health_history;
CREATE POLICY "anon_insert_health_history" ON ecc_health_history FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_health_history" ON ecc_health_history;
CREATE POLICY "anon_update_health_history" ON ecc_health_history FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_health_history" ON ecc_health_history;
CREATE POLICY "anon_delete_health_history" ON ecc_health_history FOR DELETE
  TO anon, authenticated USING (true);

-- ── ecc_register_sequences ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_register_sequences (
  register_type  text PRIMARY KEY,
  last_number    integer NOT NULL DEFAULT 0
);

INSERT INTO ecc_register_sequences (register_type, last_number) VALUES
  ('aud',  0), ('rec',  0), ('risk', 0),
  ('feat', 0), ('epic', 0), ('rel',  0),
  ('mile', 0), ('adr',  0)
ON CONFLICT (register_type) DO NOTHING;

ALTER TABLE ecc_register_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sequences" ON ecc_register_sequences;
CREATE POLICY "anon_select_sequences" ON ecc_register_sequences FOR SELECT
  TO anon, authenticated USING (true);

-- ── ecc_engineering_register ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_engineering_register (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  register_number text UNIQUE NOT NULL,
  register_type   text NOT NULL,
  entity_id       uuid,
  entity_table    text,
  title           text,
  status          text,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_register_type   ON ecc_engineering_register(register_type);
CREATE INDEX IF NOT EXISTS idx_register_entity ON ecc_engineering_register(entity_id);

ALTER TABLE ecc_engineering_register ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_register" ON ecc_engineering_register;
CREATE POLICY "anon_select_register" ON ecc_engineering_register FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_register" ON ecc_engineering_register;
CREATE POLICY "anon_insert_register" ON ecc_engineering_register FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_register" ON ecc_engineering_register;
CREATE POLICY "anon_update_register" ON ecc_engineering_register FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_register" ON ecc_engineering_register;
CREATE POLICY "anon_delete_register" ON ecc_engineering_register FOR DELETE
  TO anon, authenticated USING (true);

-- ── get_next_register_number RPC ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_next_register_number(p_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_number integer;
BEGIN
  UPDATE ecc_register_sequences
  SET last_number = last_number + 1
  WHERE register_type = p_type
  RETURNING last_number INTO v_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown register type: %', p_type;
  END IF;

  RETURN UPPER(p_type) || '-' || LPAD(v_number::text, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_register_number(text) TO anon, authenticated;
