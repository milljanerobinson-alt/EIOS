
-- =====================================================
-- ECC Phase 1.5 — Expand sections to fully functional
-- =====================================================

-- 1. Expand ecc_backlog_items ----------------------------

ALTER TABLE ecc_backlog_items ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE ecc_backlog_items DROP CONSTRAINT IF EXISTS ecc_backlog_items_status_check;
ALTER TABLE ecc_backlog_items ADD CONSTRAINT ecc_backlog_items_status_check CHECK (status IN (
  'ideas', 'needs_investigation', 'ready', 'in_progress', 'needs_review',
  'testing', 'verified', 'released', 'archived',
  'open', 'blocked', 'awaiting_review', 'completed', 'deferred', 'cancelled'
));
ALTER TABLE ecc_backlog_items ALTER COLUMN status SET DEFAULT 'ideas';

ALTER TABLE ecc_backlog_items ADD COLUMN IF NOT EXISTS complexity text;
ALTER TABLE ecc_backlog_items ADD COLUMN IF NOT EXISTS target_version text;
ALTER TABLE ecc_backlog_items ADD COLUMN IF NOT EXISTS target_batch text;
ALTER TABLE ecc_backlog_items ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;
ALTER TABLE ecc_backlog_items ADD COLUMN IF NOT EXISTS linked_qa_ids uuid[] DEFAULT '{}';
ALTER TABLE ecc_backlog_items ADD COLUMN IF NOT EXISTS linked_release_ids uuid[] DEFAULT '{}';
ALTER TABLE ecc_backlog_items ADD COLUMN IF NOT EXISTS linked_decision_ids uuid[] DEFAULT '{}';

-- Normalise legacy statuses
UPDATE ecc_backlog_items SET status = 'ideas'         WHERE status = 'open';
UPDATE ecc_backlog_items SET status = 'needs_review'  WHERE status = 'awaiting_review';
UPDATE ecc_backlog_items SET status = 'verified'      WHERE status = 'completed';
UPDATE ecc_backlog_items SET status = 'archived'      WHERE status IN ('deferred', 'cancelled');

-- Migrate builder_features → ecc_backlog_items
-- builder_features.tags is JSONB; cast to text[]
INSERT INTO ecc_backlog_items (
  title, description, priority, status,
  tags, notes, implementation_notes, position, created_at, updated_at
)
SELECT
  title,
  description,
  COALESCE(priority, 'medium'),
  CASE status
    WHEN 'backlog'      THEN 'ideas'
    WHEN 'in_progress'  THEN 'in_progress'
    WHEN 'roadmap'      THEN 'ready'
    WHEN 'needs_review' THEN 'needs_review'
    WHEN 'shipped'      THEN 'verified'
    ELSE                     'ideas'
  END,
  ARRAY(SELECT jsonb_array_elements_text(COALESCE(tags, '[]'::jsonb))),
  notes,
  implementation_notes,
  COALESCE(position, 0),
  created_at,
  updated_at
FROM builder_features
WHERE NOT EXISTS (
  SELECT 1 FROM ecc_backlog_items b
  WHERE b.title = builder_features.title
    AND b.created_at = builder_features.created_at
);

-- 2. Expand ecc_decisions --------------------------------

ALTER TABLE ecc_decisions ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE ecc_decisions ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'proposed';
ALTER TABLE ecc_decisions ADD COLUMN IF NOT EXISTS alternatives_considered text;
ALTER TABLE ecc_decisions ADD COLUMN IF NOT EXISTS pros text;
ALTER TABLE ecc_decisions ADD COLUMN IF NOT EXISTS cons text;
ALTER TABLE ecc_decisions ADD COLUMN IF NOT EXISTS consequences text;
ALTER TABLE ecc_decisions ADD COLUMN IF NOT EXISTS linked_backlog_ids uuid[] DEFAULT '{}';
ALTER TABLE ecc_decisions ADD COLUMN IF NOT EXISTS linked_qa_ids uuid[] DEFAULT '{}';
ALTER TABLE ecc_decisions ADD COLUMN IF NOT EXISTS linked_release_ids uuid[] DEFAULT '{}';

-- 3. Expand ecc_release_candidates ----------------------

ALTER TABLE ecc_release_candidates ADD COLUMN IF NOT EXISTS version text;
ALTER TABLE ecc_release_candidates ADD COLUMN IF NOT EXISTS included_backlog_item_ids uuid[] DEFAULT '{}';
ALTER TABLE ecc_release_candidates ADD COLUMN IF NOT EXISTS included_batches text[] DEFAULT '{}';
ALTER TABLE ecc_release_candidates ADD COLUMN IF NOT EXISTS manual_testing_status text DEFAULT 'pending';
ALTER TABLE ecc_release_candidates ADD COLUMN IF NOT EXISTS regression_testing_status text DEFAULT 'pending';
ALTER TABLE ecc_release_candidates ADD COLUMN IF NOT EXISTS deployment_status text DEFAULT 'pending';
ALTER TABLE ecc_release_candidates ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE ecc_release_candidates ADD COLUMN IF NOT EXISTS rollback_point text;
ALTER TABLE ecc_release_candidates ADD COLUMN IF NOT EXISTS release_notes text;
ALTER TABLE ecc_release_candidates ADD COLUMN IF NOT EXISTS known_issues text;

UPDATE ecc_release_candidates SET
  version = '1.0.0-alpha',
  included_batches = ARRAY['Batch A'],
  manual_testing_status = 'passed',
  regression_testing_status = 'passed',
  deployment_status = 'deployed'
WHERE rc_number = 'RC-001';

-- 4. Expand ecc_testing_reports -------------------------

ALTER TABLE ecc_testing_reports ADD COLUMN IF NOT EXISTS batch text;
ALTER TABLE ecc_testing_reports ADD COLUMN IF NOT EXISTS files_modified text[] DEFAULT '{}';
ALTER TABLE ecc_testing_reports ADD COLUMN IF NOT EXISTS db_migrations text[] DEFAULT '{}';
ALTER TABLE ecc_testing_reports ADD COLUMN IF NOT EXISTS edge_functions text[] DEFAULT '{}';
ALTER TABLE ecc_testing_reports ADD COLUMN IF NOT EXISTS manual_testing_notes text;
ALTER TABLE ecc_testing_reports ADD COLUMN IF NOT EXISTS regression_testing_notes text;
ALTER TABLE ecc_testing_reports ADD COLUMN IF NOT EXISTS performance_testing_notes text;
ALTER TABLE ecc_testing_reports ADD COLUMN IF NOT EXISTS security_testing_notes text;
ALTER TABLE ecc_testing_reports ADD COLUMN IF NOT EXISTS deployment_status text;

-- 5. Create ecc_project_compass -------------------------

CREATE TABLE IF NOT EXISTS ecc_project_compass (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  section_key text UNIQUE NOT NULL,
  section_title text NOT NULL,
  content text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ecc_project_compass ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecc_compass_select" ON ecc_project_compass FOR SELECT TO authenticated USING (true);
CREATE POLICY "ecc_compass_insert" ON ecc_project_compass FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ecc_compass_update" ON ecc_project_compass FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecc_compass_delete" ON ecc_project_compass FOR DELETE TO authenticated USING (true);

INSERT INTO ecc_project_compass (section_key, section_title, content, sort_order) VALUES
  ('mission',                  'Mission',                      '', 1),
  ('vision',                   'Vision',                       '', 2),
  ('problem_being_solved',     'Problem Being Solved',         '', 3),
  ('target_customer',          'Target Customer',              '', 4),
  ('core_differentiators',     'Core Differentiators',         '', 5),
  ('mvp_scope',                'MVP Scope',                    '', 6),
  ('current_launch_blockers',  'Current Launch Blockers',      '', 7),
  ('current_batch',            'Current Batch',                'Batch B', 8),
  ('current_release_candidate','Current Release Candidate',    'RC-002 — Batch B (Pending)', 9),
  ('current_priorities',       'Current Priorities',           '', 10),
  ('next_three_priorities',    'Next Three Priorities',        '', 11),
  ('long_term_roadmap_summary','Long-term Roadmap Summary',    '', 12),
  ('pricing_strategy_summary', 'Pricing Strategy Summary',     '', 13),
  ('success_metrics',          'Success Metrics',              '', 14),
  ('launch_checklist_summary', 'Launch Checklist Summary',     '', 15)
ON CONFLICT (section_key) DO NOTHING;
