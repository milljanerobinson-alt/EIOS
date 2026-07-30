/*
# EWO-011: Engineering Idea Domain + Engineering Objective

## Purpose
Introduces two new constitutional engineering objects:
1. engineering_objective — links engineering_intent to measurable success outcomes
2. engineering_idea — first-class engineering idea records created via constitutional execution

## Architecture
Ideas are NOT created directly. They are created through the Constitutional Execution
Pipeline: Intent → Objective → Strategy → Context → Session → Idea → Evidence → Memory.

This migration creates the domain tables that back the Execution Wizard.

## New Tables

### 1. engineering_objective
Links an Engineering Intent to a measurable success outcome.
- id, objective_ref (unique), intent_id (FK→engineering_intent), title, description
- success_metrics (jsonb), target_date, status, priority, created_at

### 2. engineering_idea
First-class constitutional engineering object. Always created via execution session.
- id, idea_ref (unique), title, description, category, priority, status
- products (text[]), applications (text[]), tags (text[])
- session_id (FK→execution_session) — the execution that created this idea
- intent_id (FK→engineering_intent) — the intent that drove this idea
- objective_id (FK→engineering_objective) — the objective this idea serves
- related_ewo_refs (text[]), related_feature_ids (uuid[]), related_record_ids (uuid[])
- memory_search_performed (bool) — whether pre-execution memory search was done
- duplicates_checked (bool) — whether similar ideas were checked before creation
- guardian_validated (bool) — whether Engineering Guardian validated the idea
- guardian_session_id — which execution session performed guardian validation
- created_by, created_at, updated_at

## Security
- RLS enabled on both tables
- TO anon, authenticated policies (single-tenant ECC platform)
- 4 separate CRUD policies per table

## Notes
1. engineering_idea.status enum: draft | active | queued_for_promotion | promoted |
   archived | superseded
2. engineering_objective.status: draft | active | met | missed | cancelled
3. session_id is intentionally NOT CASCADE DELETE — ideas outlive their creation session
*/

-- ─── 1. engineering_objective ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_objective (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_ref   text UNIQUE NOT NULL,
  intent_id       uuid REFERENCES engineering_intent(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text,
  success_metrics jsonb NOT NULL DEFAULT '[]',
  target_date     date,
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('draft','active','met','missed','cancelled')),
  priority        text NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('critical','high','medium','low')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE engineering_objective ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_engineering_objective" ON engineering_objective;
CREATE POLICY "anon_select_engineering_objective" ON engineering_objective FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_engineering_objective" ON engineering_objective;
CREATE POLICY "anon_insert_engineering_objective" ON engineering_objective FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_engineering_objective" ON engineering_objective;
CREATE POLICY "anon_update_engineering_objective" ON engineering_objective FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_engineering_objective" ON engineering_objective;
CREATE POLICY "anon_delete_engineering_objective" ON engineering_objective FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 2. engineering_idea ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_idea (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_ref               text UNIQUE NOT NULL,
  title                  text NOT NULL,
  description            text,
  category               text NOT NULL DEFAULT 'general'
                           CHECK (category IN (
                             'general', 'feature', 'improvement', 'technical_debt',
                             'architecture', 'security', 'performance', 'ux',
                             'integration', 'infrastructure', 'research'
                           )),
  priority               text NOT NULL DEFAULT 'medium'
                           CHECK (priority IN ('critical','high','medium','low')),
  status                 text NOT NULL DEFAULT 'active'
                           CHECK (status IN (
                             'draft', 'active', 'queued_for_promotion',
                             'promoted', 'archived', 'superseded'
                           )),
  products               text[]    NOT NULL DEFAULT '{}',
  applications           text[]    NOT NULL DEFAULT '{}',
  tags                   text[]    NOT NULL DEFAULT '{}',
  session_id             uuid REFERENCES execution_session(id) ON DELETE SET NULL,
  intent_id              uuid REFERENCES engineering_intent(id) ON DELETE SET NULL,
  objective_id           uuid REFERENCES engineering_objective(id) ON DELETE SET NULL,
  related_ewo_refs       text[]    NOT NULL DEFAULT '{}',
  related_feature_ids    uuid[]    NOT NULL DEFAULT '{}',
  related_record_ids     uuid[]    NOT NULL DEFAULT '{}',
  memory_search_performed  boolean NOT NULL DEFAULT false,
  duplicates_checked       boolean NOT NULL DEFAULT false,
  guardian_validated       boolean NOT NULL DEFAULT false,
  guardian_session_id    uuid REFERENCES execution_session(id) ON DELETE SET NULL,
  created_by             text NOT NULL DEFAULT 'EIOS AI Engineering Agent',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engineering_idea_status   ON engineering_idea(status);
CREATE INDEX IF NOT EXISTS idx_engineering_idea_priority ON engineering_idea(priority);
CREATE INDEX IF NOT EXISTS idx_engineering_idea_created  ON engineering_idea(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engineering_idea_session  ON engineering_idea(session_id);

ALTER TABLE engineering_idea ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_engineering_idea" ON engineering_idea;
CREATE POLICY "anon_select_engineering_idea" ON engineering_idea FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_engineering_idea" ON engineering_idea;
CREATE POLICY "anon_insert_engineering_idea" ON engineering_idea FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_engineering_idea" ON engineering_idea;
CREATE POLICY "anon_update_engineering_idea" ON engineering_idea FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_engineering_idea" ON engineering_idea;
CREATE POLICY "anon_delete_engineering_idea" ON engineering_idea FOR DELETE
  TO anon, authenticated USING (true);
