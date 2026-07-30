
-- ================================================================
-- ECC Phase 2.5 — Workflow Automation
-- ================================================================

-- 1. Add is_active flag + checklist to ecc_release_candidates
ALTER TABLE ecc_release_candidates
  ADD COLUMN IF NOT EXISTS is_active       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS checklist_items jsonb   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS phase_name      text,
  ADD COLUMN IF NOT EXISTS milestone       text,
  ADD COLUMN IF NOT EXISTS due_date        date,
  ADD COLUMN IF NOT EXISTS linked_journal_ids  uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_testing_ids  uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_adr_ids      uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_doc_ids      uuid[] NOT NULL DEFAULT '{}';

-- Only one RC can be active at a time (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ecc_rc_one_active
  ON ecc_release_candidates (is_active)
  WHERE is_active = true;

-- 2. Engineering audit log — records workflow events automatically
CREATE TABLE IF NOT EXISTS ecc_engineering_audit (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type      text NOT NULL,
  event_label     text NOT NULL,
  entity_type     text,
  entity_id       uuid,
  entity_title    text,
  rc_id           uuid REFERENCES ecc_release_candidates(id) ON DELETE SET NULL,
  rc_number       text,
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE ecc_engineering_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ecc_audit_select" ON ecc_engineering_audit FOR SELECT TO authenticated USING (true);
CREATE POLICY "ecc_audit_insert" ON ecc_engineering_audit FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ecc_audit_update" ON ecc_engineering_audit FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecc_audit_delete" ON ecc_engineering_audit FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ecc_audit_created ON ecc_engineering_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ecc_audit_rc      ON ecc_engineering_audit (rc_id);
CREATE INDEX IF NOT EXISTS idx_ecc_audit_type    ON ecc_engineering_audit (event_type);

-- 3. Seed default checklist on existing RCs that have none
UPDATE ecc_release_candidates
SET checklist_items = '[
  {"id":"bl","label":"Backlog Complete","required":true,"checked":false},
  {"id":"build","label":"Build Successful","required":true,"checked":false},
  {"id":"ts","label":"TypeScript Clean","required":false,"checked":false},
  {"id":"manual","label":"Manual Testing Completed","required":true,"checked":false},
  {"id":"regression","label":"Regression Testing Completed","required":false,"checked":false},
  {"id":"edge","label":"Edge Cases Tested","required":false,"checked":false},
  {"id":"sql","label":"SQL Validation Completed","required":false,"checked":false},
  {"id":"docs","label":"Documentation Updated","required":true,"checked":false},
  {"id":"adr","label":"ADR Linked (if required)","required":false,"checked":false},
  {"id":"journal","label":"AI Journal Updated","required":true,"checked":false},
  {"id":"report","label":"Completion Report Generated","required":true,"checked":false},
  {"id":"prod","label":"Ready for Production","required":true,"checked":false}
]'::jsonb
WHERE checklist_items = '[]'::jsonb;
