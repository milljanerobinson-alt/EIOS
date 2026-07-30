
-- Re-apply EOC Final Architecture Refactor: Product Hierarchy Tables

CREATE TABLE IF NOT EXISTS ecc_product (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  tagline     text,
  description text,
  status      text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ecc_product ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_ecc_product" ON ecc_product FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS ecc_roadmap_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid REFERENCES ecc_product(id) ON DELETE CASCADE,
  name           text NOT NULL,
  description    text,
  target_quarter text,
  priority       text NOT NULL DEFAULT 'medium',
  status         text NOT NULL DEFAULT 'planned',
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ecc_roadmap_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_ecc_roadmap_items" ON ecc_roadmap_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS ecc_milestones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid REFERENCES ecc_product(id) ON DELETE CASCADE,
  roadmap_item_id  uuid REFERENCES ecc_roadmap_items(id) ON DELETE SET NULL,
  name             text NOT NULL,
  description      text,
  owner            text,
  target_date      date,
  status           text NOT NULL DEFAULT 'planned',
  sort_order       integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ecc_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_ecc_milestones" ON ecc_milestones FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS ecc_phases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id    uuid REFERENCES ecc_milestones(id) ON DELETE SET NULL,
  name            text NOT NULL,
  description     text,
  target_version  text,
  owner           text,
  due_date        date,
  status          text NOT NULL DEFAULT 'planned',
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ecc_phases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_ecc_phases" ON ecc_phases FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE ecc_release_candidates
  ADD COLUMN IF NOT EXISTS phase_id uuid REFERENCES ecc_phases(id) ON DELETE SET NULL;

ALTER TABLE ecc_releases
  ADD COLUMN IF NOT EXISTS phase_id          uuid REFERENCES ecc_phases(id)         ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS milestone_id      uuid REFERENCES ecc_milestones(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS roadmap_item_id   uuid REFERENCES ecc_roadmap_items(id)  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ecc_milestones_product    ON ecc_milestones(product_id);
CREATE INDEX IF NOT EXISTS idx_ecc_milestones_roadmap    ON ecc_milestones(roadmap_item_id);
CREATE INDEX IF NOT EXISTS idx_ecc_phases_milestone      ON ecc_phases(milestone_id);
CREATE INDEX IF NOT EXISTS idx_ecc_rc_phase              ON ecc_release_candidates(phase_id);
