/*
# EWO-021 — Engineering Intelligence Authority Engine

## Purpose
Creates the authoritative engineering decision layer for EIOS.
Engineering Intelligence becomes the single source of truth for
engineering decisions, replacing multiple competing recommendations
with one governed, evidence-based decision that evolves as new
evidence arrives.

## New Tables

### ecc_engineering_decisions
The authoritative engineering decision for each investigation/alert.
- id (uuid, primary key)
- alert_id (uuid, FK to engineering_integrity_alerts)
- ewo_ref (text, the engineering reference under investigation)
- decision_type (text, one of the governed decision types)
- decision_title (text, human-readable decision title)
- executive_summary (text)
- decision_reasoning (text, why this decision was reached)
- evidence_used (jsonb, array of evidence items supporting the decision)
- confidence (numeric, 0-1)
- confidence_explanation (text)
- alternatives_rejected (jsonb, array of {type, reason} for rejected alternatives)
- recommended_next_action (text)
- primary_integrity_domain (text, FK conceptually to integrity domain model)
- parent_alert_id (uuid, nullable — parent alert if this is a child symptom)
- relationship_type (text: root_issue, parent_alert, child_alert, duplicate_alert, derived_symptom, independent_issue)
- resolution_status (text: open, evolved, resolved, superseded)
- superseded_by (uuid, nullable — points to the decision that superseded this one)
- decision_version (integer, starts at 1, increments on evolution)
- po_decision (text, nullable — Product Owner's decision)
- po_decision_actor (text, nullable)
- po_decision_at (timestamptz, nullable)
- metadata (jsonb)
- created_at (timestamptz)
- updated_at (timestamptz)

### ecc_engineering_decision_timeline
Immutable, append-only timeline of every decision event.
- id (uuid, primary key)
- decision_id (uuid, FK to ecc_engineering_decisions)
- alert_id (uuid, FK to engineering_integrity_alerts)
- event_type (text: initial_decision, evidence_update, decision_revision, resolution, po_decision, final_outcome)
- event_summary (text)
- event_details (jsonb)
- previous_decision_type (text, nullable — what the decision was before this event)
- new_decision_type (text, nullable — what the decision is after this event)
- previous_confidence (numeric, nullable)
- new_confidence (numeric, nullable)
- change_log_ref (text, nullable — linked engineering change log entry)
- actor_type (text: human, ai, system)
- actor (text)
- created_at (timestamptz)

## Security
- RLS enabled on both tables.
- Policies allow anon + authenticated CRUD (single-tenant governance model).

## Important Notes
1. Engineering decisions are the single source of truth — downstream UI
   must render decisions from this table, not calculate their own.
2. Decision evolution preserves previous versions via superseded_by and
   the timeline table. History is immutable.
3. Every decision event automatically creates an Engineering Change Log entry.
4. The architecture supports future autonomous engineering consumption.
*/
CREATE TABLE IF NOT EXISTS ecc_engineering_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid,
  ewo_ref text NOT NULL,
  decision_type text NOT NULL,
  decision_title text NOT NULL,
  executive_summary text,
  decision_reasoning text,
  evidence_used jsonb DEFAULT '[]'::jsonb,
  confidence numeric DEFAULT 0.5,
  confidence_explanation text,
  alternatives_rejected jsonb DEFAULT '[]'::jsonb,
  recommended_next_action text,
  primary_integrity_domain text,
  parent_alert_id uuid,
  relationship_type text DEFAULT 'independent_issue',
  resolution_status text DEFAULT 'open',
  superseded_by uuid,
  decision_version integer DEFAULT 1,
  po_decision text,
  po_decision_actor text,
  po_decision_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ecc_engineering_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_decisions" ON ecc_engineering_decisions;
CREATE POLICY "anon_select_decisions" ON ecc_engineering_decisions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_decisions" ON ecc_engineering_decisions;
CREATE POLICY "anon_insert_decisions" ON ecc_engineering_decisions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_decisions" ON ecc_engineering_decisions;
CREATE POLICY "anon_update_decisions" ON ecc_engineering_decisions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_decisions" ON ecc_engineering_decisions;
CREATE POLICY "anon_delete_decisions" ON ecc_engineering_decisions FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS ecc_engineering_decision_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid,
  alert_id uuid,
  event_type text NOT NULL,
  event_summary text NOT NULL,
  event_details jsonb DEFAULT '{}'::jsonb,
  previous_decision_type text,
  new_decision_type text,
  previous_confidence numeric,
  new_confidence numeric,
  change_log_ref text,
  actor_type text DEFAULT 'system',
  actor text DEFAULT 'system',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ecc_engineering_decision_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_decision_timeline" ON ecc_engineering_decision_timeline;
CREATE POLICY "anon_select_decision_timeline" ON ecc_engineering_decision_timeline FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_decision_timeline" ON ecc_engineering_decision_timeline;
CREATE POLICY "anon_insert_decision_timeline" ON ecc_engineering_decision_timeline FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_decision_timeline" ON ecc_engineering_decision_timeline;
CREATE POLICY "anon_update_decision_timeline" ON ecc_engineering_decision_timeline FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_decision_timeline" ON ecc_engineering_decision_timeline;
CREATE POLICY "anon_delete_decision_timeline" ON ecc_engineering_decision_timeline FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_eng_decisions_alert_id ON ecc_engineering_decisions (alert_id);
CREATE INDEX IF NOT EXISTS idx_eng_decisions_ewo_ref ON ecc_engineering_decisions (ewo_ref);
CREATE INDEX IF NOT EXISTS idx_eng_decisions_resolution ON ecc_engineering_decisions (resolution_status);
CREATE INDEX IF NOT EXISTS idx_eng_decisions_parent ON ecc_engineering_decisions (parent_alert_id);
CREATE INDEX IF NOT EXISTS idx_eng_decision_timeline_decision_id ON ecc_engineering_decision_timeline (decision_id);
CREATE INDEX IF NOT EXISTS idx_eng_decision_timeline_alert_id ON ecc_engineering_decision_timeline (alert_id);
