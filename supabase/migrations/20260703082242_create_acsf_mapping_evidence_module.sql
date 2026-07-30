
/*
# ACSF Mapping Evidence Module

## Overview
Adds a complete audit and compliance layer to the qualification mapping system.
Enables RTOs to record how every ACSF mapping was determined, store supporting
evidence, and maintain a full version + review history for compliance audits.

## New Tables

### qualification_mapping_evidence
The central record for each qualification's mapping evidence. Versioned — each
approved change creates a new row rather than overwriting. Stores:
- Qualification reference + snapshot of ACSF levels at this version
- Mapping status: draft / active / archived
- Methodology category + free-text methodology notes
- Rich-text mapping notes (assumptions, industry context, limitations)
- Review interval in months (12 / 24 / 36) + computed next_review_date
- Created / reviewed / approved by user references
- previous_version_id for chain-of-custody version linking
- change_reason required when creating a new version

### mapping_unit_evidence
Per-unit-of-competency evidence for a mapping evidence record. Stores:
- UoC code + title + core/elective flag
- Individual ACSF levels per skill for this unit
- Free-text evidence_notes and reasoning (the "why")

### mapping_evidence_attachments
Source documents and links attached to a mapping evidence record. Supports:
training_package_docs, companion_volume, unit_of_competency, qualification_rules,
moderation_notes, pdf, docx, spreadsheet, external_url

### mapping_evidence_reviews
Every formal review of a mapping evidence record. Records reviewer, date,
reason, summary of changes, and outcome (approved / requires_changes / archived).

### mapping_evidence_audit
Fine-grained action log for all significant changes to mapping evidence.
Records actor name, action type, previous/new values as JSONB, IP address.

## Security
All tables: RLS enabled, admin/trainer only via get_my_role().
INSERT policies use `WITH CHECK (true)` because staff-role check is on USING.
All policies drop-first for idempotency.
*/

-- ── qualification_mapping_evidence ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qualification_mapping_evidence (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qualification_id      uuid NOT NULL REFERENCES qualifications(id) ON DELETE CASCADE,
  version_number        integer NOT NULL DEFAULT 1,
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'active', 'archived')),
  methodology           text NOT NULL DEFAULT 'highest_across_mandatory_units'
                          CHECK (methodology IN (
                            'highest_across_mandatory_units',
                            'highest_across_all_units',
                            'professional_judgement',
                            'manual_moderation',
                            'industry_validation',
                            'imported_mapping',
                            'other'
                          )),
  methodology_notes     text,
  mapping_notes         text,
  -- Snapshot of ACSF levels at the time this version was created
  acsf_learning         integer CHECK (acsf_learning BETWEEN 1 AND 5),
  acsf_reading          integer CHECK (acsf_reading BETWEEN 1 AND 5),
  acsf_writing          integer CHECK (acsf_writing BETWEEN 1 AND 5),
  acsf_oral_comm        integer CHECK (acsf_oral_comm BETWEEN 1 AND 5),
  acsf_numeracy         integer CHECK (acsf_numeracy BETWEEN 1 AND 5),
  -- Review schedule
  review_interval_months integer NOT NULL DEFAULT 24
                          CHECK (review_interval_months IN (12, 24, 36)),
  last_reviewed_at      timestamptz,
  next_review_date      date,
  -- People
  created_by_name       text,
  reviewed_by_name      text,
  approved_by_name      text,
  -- Versioning
  previous_version_id   uuid REFERENCES qualification_mapping_evidence(id),
  change_reason         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE qualification_mapping_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evidence_select_staff" ON qualification_mapping_evidence;
CREATE POLICY "evidence_select_staff" ON qualification_mapping_evidence
  FOR SELECT TO authenticated
  USING (get_my_role() = ANY(ARRAY['admin', 'trainer']));

DROP POLICY IF EXISTS "evidence_insert_staff" ON qualification_mapping_evidence;
CREATE POLICY "evidence_insert_staff" ON qualification_mapping_evidence
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY(ARRAY['admin', 'trainer']));

DROP POLICY IF EXISTS "evidence_update_staff" ON qualification_mapping_evidence;
CREATE POLICY "evidence_update_staff" ON qualification_mapping_evidence
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY(ARRAY['admin', 'trainer']))
  WITH CHECK (get_my_role() = ANY(ARRAY['admin', 'trainer']));

DROP POLICY IF EXISTS "evidence_delete_admin" ON qualification_mapping_evidence;
CREATE POLICY "evidence_delete_admin" ON qualification_mapping_evidence
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

CREATE INDEX IF NOT EXISTS idx_qme_qualification_id
  ON qualification_mapping_evidence(qualification_id);
CREATE INDEX IF NOT EXISTS idx_qme_status
  ON qualification_mapping_evidence(status);
CREATE INDEX IF NOT EXISTS idx_qme_next_review
  ON qualification_mapping_evidence(next_review_date);

-- ── mapping_unit_evidence ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mapping_unit_evidence (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id    uuid NOT NULL REFERENCES qualification_mapping_evidence(id) ON DELETE CASCADE,
  uoc_code       text NOT NULL,
  uoc_title      text NOT NULL,
  unit_type      text NOT NULL DEFAULT 'core'
                   CHECK (unit_type IN ('core', 'elective')),
  learning_level   integer CHECK (learning_level BETWEEN 1 AND 5),
  reading_level    integer CHECK (reading_level BETWEEN 1 AND 5),
  writing_level    integer CHECK (writing_level BETWEEN 1 AND 5),
  oral_comm_level  integer CHECK (oral_comm_level BETWEEN 1 AND 5),
  numeracy_level   integer CHECK (numeracy_level BETWEEN 1 AND 5),
  evidence_notes text,
  reasoning      text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mapping_unit_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "unit_evidence_select_staff" ON mapping_unit_evidence;
CREATE POLICY "unit_evidence_select_staff" ON mapping_unit_evidence
  FOR SELECT TO authenticated
  USING (get_my_role() = ANY(ARRAY['admin', 'trainer']));

DROP POLICY IF EXISTS "unit_evidence_insert_staff" ON mapping_unit_evidence;
CREATE POLICY "unit_evidence_insert_staff" ON mapping_unit_evidence
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY(ARRAY['admin', 'trainer']));

DROP POLICY IF EXISTS "unit_evidence_update_staff" ON mapping_unit_evidence;
CREATE POLICY "unit_evidence_update_staff" ON mapping_unit_evidence
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY(ARRAY['admin', 'trainer']))
  WITH CHECK (get_my_role() = ANY(ARRAY['admin', 'trainer']));

DROP POLICY IF EXISTS "unit_evidence_delete_staff" ON mapping_unit_evidence;
CREATE POLICY "unit_evidence_delete_staff" ON mapping_unit_evidence
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY(ARRAY['admin', 'trainer']));

CREATE INDEX IF NOT EXISTS idx_mue_evidence_id ON mapping_unit_evidence(evidence_id);

-- ── mapping_evidence_attachments ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mapping_evidence_attachments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id    uuid NOT NULL REFERENCES qualification_mapping_evidence(id) ON DELETE CASCADE,
  title          text NOT NULL,
  evidence_type  text NOT NULL
                   CHECK (evidence_type IN (
                     'training_package_docs', 'companion_volume', 'unit_of_competency',
                     'qualification_rules', 'moderation_notes', 'pdf', 'docx',
                     'spreadsheet', 'external_url', 'other'
                   )),
  description    text,
  file_url       text,
  external_url   text,
  uploaded_by_name text,
  uploaded_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mapping_evidence_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attachments_select_staff" ON mapping_evidence_attachments;
CREATE POLICY "attachments_select_staff" ON mapping_evidence_attachments
  FOR SELECT TO authenticated
  USING (get_my_role() = ANY(ARRAY['admin', 'trainer']));

DROP POLICY IF EXISTS "attachments_insert_staff" ON mapping_evidence_attachments;
CREATE POLICY "attachments_insert_staff" ON mapping_evidence_attachments
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY(ARRAY['admin', 'trainer']));

DROP POLICY IF EXISTS "attachments_update_staff" ON mapping_evidence_attachments;
CREATE POLICY "attachments_update_staff" ON mapping_evidence_attachments
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY(ARRAY['admin', 'trainer']))
  WITH CHECK (get_my_role() = ANY(ARRAY['admin', 'trainer']));

DROP POLICY IF EXISTS "attachments_delete_staff" ON mapping_evidence_attachments;
CREATE POLICY "attachments_delete_staff" ON mapping_evidence_attachments
  FOR DELETE TO authenticated
  USING (get_my_role() = ANY(ARRAY['admin', 'trainer']));

CREATE INDEX IF NOT EXISTS idx_mea_evidence_id ON mapping_evidence_attachments(evidence_id);

-- ── mapping_evidence_reviews ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mapping_evidence_reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id    uuid NOT NULL REFERENCES qualification_mapping_evidence(id) ON DELETE CASCADE,
  review_date    date NOT NULL DEFAULT CURRENT_DATE,
  reviewer_name  text NOT NULL,
  reason         text,
  summary        text,
  outcome        text NOT NULL
                   CHECK (outcome IN ('approved', 'requires_changes', 'archived')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mapping_evidence_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews_select_staff" ON mapping_evidence_reviews;
CREATE POLICY "reviews_select_staff" ON mapping_evidence_reviews
  FOR SELECT TO authenticated
  USING (get_my_role() = ANY(ARRAY['admin', 'trainer']));

DROP POLICY IF EXISTS "reviews_insert_staff" ON mapping_evidence_reviews;
CREATE POLICY "reviews_insert_staff" ON mapping_evidence_reviews
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY(ARRAY['admin', 'trainer']));

DROP POLICY IF EXISTS "reviews_update_staff" ON mapping_evidence_reviews;
CREATE POLICY "reviews_update_staff" ON mapping_evidence_reviews
  FOR UPDATE TO authenticated
  USING (get_my_role() = ANY(ARRAY['admin', 'trainer']))
  WITH CHECK (get_my_role() = ANY(ARRAY['admin', 'trainer']));

DROP POLICY IF EXISTS "reviews_delete_admin" ON mapping_evidence_reviews;
CREATE POLICY "reviews_delete_admin" ON mapping_evidence_reviews
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

CREATE INDEX IF NOT EXISTS idx_mer_evidence_id ON mapping_evidence_reviews(evidence_id);

-- ── mapping_evidence_audit ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mapping_evidence_audit (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id      uuid REFERENCES qualification_mapping_evidence(id) ON DELETE CASCADE,
  qualification_id uuid REFERENCES qualifications(id),
  actor            text,
  action           text NOT NULL,
  previous_value   jsonb,
  new_value        jsonb,
  ip_address       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mapping_evidence_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mea_audit_select_staff" ON mapping_evidence_audit;
CREATE POLICY "mea_audit_select_staff" ON mapping_evidence_audit
  FOR SELECT TO authenticated
  USING (get_my_role() = ANY(ARRAY['admin', 'trainer']));

DROP POLICY IF EXISTS "mea_audit_insert_staff" ON mapping_evidence_audit;
CREATE POLICY "mea_audit_insert_staff" ON mapping_evidence_audit
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = ANY(ARRAY['admin', 'trainer']));

CREATE INDEX IF NOT EXISTS idx_meaud_evidence_id ON mapping_evidence_audit(evidence_id);
CREATE INDEX IF NOT EXISTS idx_meaud_qual_id ON mapping_evidence_audit(qualification_id);
CREATE INDEX IF NOT EXISTS idx_meaud_created ON mapping_evidence_audit(created_at);
