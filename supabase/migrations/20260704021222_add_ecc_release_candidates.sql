
-- Release Candidates tracking table
CREATE TABLE ecc_release_candidates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  rc_number text NOT NULL UNIQUE,  -- e.g. RC-001
  batch_name text NOT NULL,         -- e.g. Batch A
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'verified', 'failed', 'deferred')),
  description text,
  notes text,
  verified_at timestamptz,
  verified_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ecc_release_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecc_rc_select" ON ecc_release_candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY "ecc_rc_insert" ON ecc_release_candidates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ecc_rc_update" ON ecc_release_candidates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecc_rc_delete" ON ecc_release_candidates FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_ecc_rc_number ON ecc_release_candidates (rc_number);

-- Seed initial release candidates
INSERT INTO ecc_release_candidates (rc_number, batch_name, status, description, verified_at, verified_by) VALUES
  ('RC-001', 'Batch A', 'verified',
   'aXcelerate token secret fallback fix + ECC Phase 1 foundation',
   now(), 'Engineering'),
  ('RC-002', 'Batch B', 'pending',
   'Pending — next batch to be assigned',
   NULL, NULL);
