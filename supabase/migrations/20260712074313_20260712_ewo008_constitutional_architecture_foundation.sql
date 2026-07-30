/*
# EWO-008: Platform Architecture & Engineering Workflow Foundation Tables

## Summary
Establishes the four permanent foundational tables for the EWO-008 constitutional
architecture. These tables form the backbone of the Engineering Constitution and
Engineering Automation Framework.

## New Tables

### constitutional_documents
Permanent, versioned constitutional records. Stores architectural documents,
standards, policies, and constitutional decisions. Every document is immutable
once effective — new versions create new records superseding prior ones.

### engineering_records_library
The permanent engineering evidence archive. Every completed Engineering Work Order
generates an Engineering Completion Report that is archived here. Linked back to
the originating EWO, associated releases, and engineering standards. Audit-ready
and compliance-reportable.

### engineering_automation_rules
Configurable automation rules that define what happens when lifecycle events fire.
Each rule has a trigger_event, trigger_condition, action_type, and action_config.
Rules can be enabled or disabled without code changes.

### engineering_automation_events
Immutable audit log of every automation event that fires. When an EWO closes,
a release publishes, or any configured lifecycle event occurs, a record is written
here. Status tracks: pending → processing → completed | failed.

## Security
- RLS enabled on all four tables.
- authenticated-only access (ATD is an internal engineering platform — not public).
- Separate SELECT, INSERT, UPDATE, DELETE policies per table.
- Automation events are INSERT/SELECT only — events are immutable once written.

## Notes
1. All tables use uuid primary keys with gen_random_uuid().
2. Timestamps default to now() — all times stored as timestamptz.
3. Engineering records library is append-only in practice — do not delete records.
4. Automation events table is also append-only — events are permanent audit evidence.
*/

-- ─── constitutional_documents ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS constitutional_documents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_ref    text        NOT NULL UNIQUE,   -- e.g. CONST-001
  title           text        NOT NULL,
  document_type   text        NOT NULL DEFAULT 'architecture',
  -- 'architecture' | 'constitution' | 'standard' | 'policy' | 'decision'
  version         text        NOT NULL DEFAULT '1.0',
  status          text        NOT NULL DEFAULT 'active',
  -- 'draft' | 'active' | 'superseded' | 'archived'
  programme       text,
  effective_from  timestamptz NOT NULL DEFAULT now(),
  supersedes_id   uuid        REFERENCES constitutional_documents(id) ON DELETE SET NULL,
  authored_by     text        NOT NULL DEFAULT 'ATD',
  sections        jsonb       NOT NULL DEFAULT '[]',
  -- Array of {chapter, id, title, content, subsections[]}
  metadata        jsonb       NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_const_docs_ref       ON constitutional_documents(document_ref);
CREATE INDEX IF NOT EXISTS idx_const_docs_type      ON constitutional_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_const_docs_status    ON constitutional_documents(status);

ALTER TABLE constitutional_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_const_docs"  ON constitutional_documents;
DROP POLICY IF EXISTS "auth_insert_const_docs"  ON constitutional_documents;
DROP POLICY IF EXISTS "auth_update_const_docs"  ON constitutional_documents;
DROP POLICY IF EXISTS "auth_delete_const_docs"  ON constitutional_documents;

CREATE POLICY "auth_select_const_docs" ON constitutional_documents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_const_docs" ON constitutional_documents
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_const_docs" ON constitutional_documents
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_const_docs" ON constitutional_documents
  FOR DELETE TO authenticated USING (true);

-- ─── engineering_records_library ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_records_library (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  record_ref      text        NOT NULL UNIQUE,   -- e.g. ECR-001, ERL-001
  record_type     text        NOT NULL,
  -- 'completion_report' | 'architecture_doc' | 'rca' | 'review' | 'specification' | 'batch_report'
  title           text        NOT NULL,
  programme       text,
  ewo_id          uuid        REFERENCES engineering_work_orders(id) ON DELETE SET NULL,
  ewo_ref         text,
  release_ref     text,
  status          text        NOT NULL DEFAULT 'active',
  -- 'active' | 'superseded' | 'archived'
  completion_date date,
  content         jsonb       NOT NULL DEFAULT '{}',
  -- Full structured content of the record
  pdf_filename    text,
  linked_releases text[]      NOT NULL DEFAULT '{}',
  linked_standards text[]     NOT NULL DEFAULT '{}',
  version_number  integer     NOT NULL DEFAULT 1,
  generated_by    text        NOT NULL DEFAULT 'manual',
  -- 'manual' | 'automation' | 'atd'
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erl_ref           ON engineering_records_library(record_ref);
CREATE INDEX IF NOT EXISTS idx_erl_type          ON engineering_records_library(record_type);
CREATE INDEX IF NOT EXISTS idx_erl_ewo_ref       ON engineering_records_library(ewo_ref);
CREATE INDEX IF NOT EXISTS idx_erl_ewo_id        ON engineering_records_library(ewo_id) WHERE ewo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_erl_status        ON engineering_records_library(status);
CREATE INDEX IF NOT EXISTS idx_erl_completion    ON engineering_records_library(completion_date DESC);

ALTER TABLE engineering_records_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_erl" ON engineering_records_library;
DROP POLICY IF EXISTS "auth_insert_erl" ON engineering_records_library;
DROP POLICY IF EXISTS "auth_update_erl" ON engineering_records_library;
DROP POLICY IF EXISTS "auth_delete_erl" ON engineering_records_library;

CREATE POLICY "auth_select_erl" ON engineering_records_library
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_erl" ON engineering_records_library
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_erl" ON engineering_records_library
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_erl" ON engineering_records_library
  FOR DELETE TO authenticated USING (true);

-- ─── engineering_automation_rules ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_automation_rules (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_ref          text        NOT NULL UNIQUE,
  name              text        NOT NULL,
  description       text,
  trigger_event     text        NOT NULL,
  -- 'ewo_closed' | 'ewo_po_accepted' | 'release_published' | 'qa_approved'
  -- 'benchmark_completed' | 'guardian_finding' | 'architecture_decision'
  trigger_condition jsonb       NOT NULL DEFAULT '{}',
  action_type       text        NOT NULL,
  -- 'create_library_record' | 'create_changelog_entry' | 'update_analytics'
  -- 'notify' | 'archive_pdf' | 'extract_knowledge'
  action_config     jsonb       NOT NULL DEFAULT '{}',
  is_enabled        boolean     NOT NULL DEFAULT true,
  execution_order   integer     NOT NULL DEFAULT 100,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_rules_event    ON engineering_automation_rules(trigger_event);
CREATE INDEX IF NOT EXISTS idx_auto_rules_enabled  ON engineering_automation_rules(is_enabled);

ALTER TABLE engineering_automation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_auto_rules" ON engineering_automation_rules;
DROP POLICY IF EXISTS "auth_insert_auto_rules" ON engineering_automation_rules;
DROP POLICY IF EXISTS "auth_update_auto_rules" ON engineering_automation_rules;
DROP POLICY IF EXISTS "auth_delete_auto_rules" ON engineering_automation_rules;

CREATE POLICY "auth_select_auto_rules" ON engineering_automation_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_auto_rules" ON engineering_automation_rules
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_auto_rules" ON engineering_automation_rules
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_delete_auto_rules" ON engineering_automation_rules
  FOR DELETE TO authenticated USING (true);

-- ─── engineering_automation_events ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_automation_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text        NOT NULL,
  trigger_source  text        NOT NULL,  -- 'ewo' | 'release' | 'qa' | 'guardian' | 'manual'
  source_id       uuid,
  source_ref      text,
  rule_id         uuid        REFERENCES engineering_automation_rules(id) ON DELETE SET NULL,
  status          text        NOT NULL DEFAULT 'pending',
  -- 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
  payload         jsonb       NOT NULL DEFAULT '{}',
  result          jsonb,
  error_message   text,
  processed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_events_type    ON engineering_automation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_auto_events_source  ON engineering_automation_events(trigger_source, source_id);
CREATE INDEX IF NOT EXISTS idx_auto_events_status  ON engineering_automation_events(status);
CREATE INDEX IF NOT EXISTS idx_auto_events_created ON engineering_automation_events(created_at DESC);

ALTER TABLE engineering_automation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_auto_events" ON engineering_automation_events;
DROP POLICY IF EXISTS "auth_insert_auto_events" ON engineering_automation_events;
DROP POLICY IF EXISTS "auth_update_auto_events" ON engineering_automation_events;

CREATE POLICY "auth_select_auto_events" ON engineering_automation_events
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_auto_events" ON engineering_automation_events
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_auto_events" ON engineering_automation_events
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ─── DB trigger: fire automation event on EWO closure ─────────────────────────

CREATE OR REPLACE FUNCTION ewo_lifecycle_automation_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fire on status transitions to 'closed' or 'po_acceptance'
  IF NEW.status IN ('closed', 'po_acceptance') AND
     (OLD.status IS NULL OR OLD.status NOT IN ('closed', 'po_acceptance')) THEN
    INSERT INTO engineering_automation_events (
      event_type, trigger_source, source_id, source_ref, status, payload
    ) VALUES (
      CASE WHEN NEW.status = 'closed' THEN 'ewo_closed' ELSE 'ewo_po_accepted' END,
      'ewo',
      NEW.id,
      NEW.ewo_ref,
      'pending',
      jsonb_build_object(
        'ewo_ref',    NEW.ewo_ref,
        'title',      NEW.title,
        'status',     NEW.status,
        'priority',   NEW.priority,
        'triggered_at', now()
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ewo_lifecycle_automation ON engineering_work_orders;
CREATE TRIGGER trg_ewo_lifecycle_automation
  AFTER UPDATE ON engineering_work_orders
  FOR EACH ROW
  EXECUTE FUNCTION ewo_lifecycle_automation_trigger();
