/*
# EWO-019 — Automatic Engineering Change Log & Lifecycle Governance
#
# Creates the authoritative, immutable, append-only Engineering Change Log.
# Every engineering event automatically generates a governed entry.
# This becomes the permanent engineering ledger and the foundation for
# future autonomous engineering.
*/

-- ─── Canonical Change Types ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_change_types (
  id serial PRIMARY KEY,
  change_type text UNIQUE NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO engineering_change_types (change_type, description, category) VALUES
  ('created',       'Engineering object created',                'lifecycle'),
  ('updated',       'Engineering object updated',                'lifecycle'),
  ('reviewed',      'Engineering object reviewed',                'review'),
  ('approved',      'Engineering object approved',               'governance'),
  ('rejected',      'Engineering object rejected',               'governance'),
  ('tested',        'Engineering object tested',                 'quality'),
  ('closed',        'Engineering object closed',                 'lifecycle'),
  ('reopened',      'Engineering object reopened',                'lifecycle'),
  ('refined',       'Engineering object refined',                'lifecycle'),
  ('imported',      'Engineering object imported',               'historical'),
  ('recovered',     'Engineering object recovered',              'historical'),
  ('archived',      'Engineering object archived',               'lifecycle'),
  ('deleted',       'Engineering object deleted',                'lifecycle'),
  ('deployed',      'Engineering object deployed',               'release'),
  ('rolled_back',   'Engineering object rolled back',            'release')
ON CONFLICT (change_type) DO NOTHING;

-- ─── Engineering Change Log (append-only ledger) ────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_ref text UNIQUE NOT NULL DEFAULT ('ECL-' || lpad((nextval('ecc_change_log_seq'::regclass))::text, 6, '0')),
  change_type text NOT NULL REFERENCES engineering_change_types(change_type),
  ewo_ref text,

  -- Object identification
  object_type text NOT NULL,
  object_id text,
  object_ref text,

  -- Event details
  summary text NOT NULL,
  description text,
  actor_type text NOT NULL DEFAULT 'system',
  actor text NOT NULL DEFAULT 'system',

  -- Historical reconstruction
  is_reconstructed boolean NOT NULL DEFAULT false,
  reconstructed_from text,

  -- Linked artefacts (flexible JSON for current and future artefact types)
  linked_artefacts jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Additional metadata
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Immutability: track if entry was ever modified (should always be false)
  immutable boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecl_change_type ON engineering_change_log(change_type);
CREATE INDEX IF NOT EXISTS idx_ecl_ewo_ref ON engineering_change_log(ewo_ref);
CREATE INDEX IF NOT EXISTS idx_ecl_object_type ON engineering_change_log(object_type);
CREATE INDEX IF NOT EXISTS idx_ecl_actor_type ON engineering_change_log(actor_type);
CREATE INDEX IF NOT EXISTS idx_ecl_created_at ON engineering_change_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ecl_is_reconstructed ON engineering_change_log(is_reconstructed) WHERE is_reconstructed = true;

-- ─── Immutability Trigger: Prevent UPDATE and DELETE ────────────────────────

CREATE OR REPLACE FUNCTION prevent_change_log_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Engineering Change Log is immutable. Entries cannot be modified or deleted. Corrections must be appended as new entries.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_ecl_update ON engineering_change_log;
CREATE TRIGGER prevent_ecl_update
  BEFORE UPDATE ON engineering_change_log
  FOR EACH ROW EXECUTE FUNCTION prevent_change_log_mutation();

DROP TRIGGER IF EXISTS prevent_ecl_delete ON engineering_change_log;
CREATE TRIGGER prevent_ecl_delete
  BEFORE DELETE ON engineering_change_log
  FOR EACH ROW EXECUTE FUNCTION prevent_change_log_mutation();

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE engineering_change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_change_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_change_log_authenticated" ON engineering_change_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_change_log_authenticated" ON engineering_change_log
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "select_change_types_authenticated" ON engineering_change_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_change_types_authenticated" ON engineering_change_types
  FOR INSERT TO authenticated WITH CHECK (true);
