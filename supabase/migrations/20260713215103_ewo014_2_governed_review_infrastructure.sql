/*
# EWO-014.2 — Governed Review Infrastructure and Engineering Classification Reviews v1.0

## Summary
Establishes a reusable governed review foundation and implements Engineering Classification
Reviews (ECRs) as the first operational review type within EIOS Platform Governance.

## Architecture Principle
Reviews are a reusable governed Platform capability. All review types share a common lifecycle
(Draft → Open → In Review → Approved / Rejected / Deferred → Closed). ECR-specific data is
held in a one-to-one extension table rather than polluting the generic review record.

## New Tables

### 1. ecc_review_types
Registry of governed review types. Seeded with 7 canonical types; only
engineering_classification is active.
- `key` (text, unique) — machine key
- `display_name`, `description`, `domain` — display metadata
- `status` — active / planned / inactive
- `governing_standard` — e.g. "EOCPS-001 §3"
- `default_lifecycle` (jsonb array) — ordered lifecycle stages
- `allowed_decision_types` (text[]) — permitted decision values

### 2. ecc_ecr_ref_seq
Postgres sequence for generating stable ECR-YYYY-NNN references. Not a table; used via
generate_ecr_ref() function.

### 3. ecc_governed_reviews
Reusable governed review records. Supports all review types.
- Lifecycle: draft → open → in_review → approved / rejected / deferred → closed
- JSON current_state / proposed_state for flexible schema per review type
- Timestamps: opened_at, decided_at, closed_at for audit

### 4. ecc_review_evidence (append-only)
Evidence records linked to a review. No UPDATE or DELETE policies.
- `evidence_type` — usage / duplication / stability / coupling / business_case / governance / manual / migration
- `evidence_payload` (jsonb) — typed evidence data
- `added_by` — actor reference

### 5. ecc_review_participants
Participant positions on a review.
- `position` — support / oppose / neutral / abstain / pending
- `authority_type` — advisory / deciding / observing
- Supports multiple reviewers per review

### 6. ecc_review_audit_events (append-only)
Append-only audit ledger for every review lifecycle event.
No UPDATE or DELETE policies. Immutable record.

### 7. ecc_ecr_extensions
ECR-specific extension table. One-to-one with ecc_governed_reviews via review_id.
Holds ownership classification fields, scores, flags, and the pending lineage event link.
ECR recommendations do NOT create ownership records — that occurs in EWO-014.3+.

## Security
- RLS enabled on all tables.
- Single-tenant (no sign-in): all policies use TO anon, authenticated.
- Evidence and audit tables have SELECT + INSERT only — no UPDATE or DELETE.
- Participants table allows UPDATE (position changes) but not DELETE.

## Important Notes
1. ECR approval does NOT alter ecc_ownership_metadata or ecc_ownership_lineage — that is EWO-014.3+.
2. generate_ecr_ref() increments a global sequence; format is ECR-YYYY-NNN where NNN is global.
3. ecc_ecr_extensions.review_id has a UNIQUE constraint — one ECR extension per review.
4. constitutional_boundary_case, migration_review, promotion_review, retirement_review are advisory flags only.
*/

-- ============================================================
-- SEQUENCE + FUNCTION: ECR reference generation
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS ecc_ecr_ref_seq START 1;

CREATE OR REPLACE FUNCTION generate_ecr_ref()
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN 'ECR-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('ecc_ecr_ref_seq')::text, 3, '0');
END;
$$;


-- ============================================================
-- TABLE 1: ecc_review_types (reference, seeded)
-- ============================================================
CREATE TABLE IF NOT EXISTS ecc_review_types (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key                   text        UNIQUE NOT NULL,
  display_name          text        NOT NULL,
  description           text        NOT NULL DEFAULT '',
  domain                text        NOT NULL DEFAULT '',
  status                text        NOT NULL DEFAULT 'planned'
                                    CHECK (status IN ('active', 'planned', 'inactive')),
  governing_standard    text        NOT NULL DEFAULT '',
  default_lifecycle     jsonb       NOT NULL DEFAULT '[]',
  allowed_decision_types text[]     NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_review_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ecc_review_types" ON ecc_review_types;
CREATE POLICY "anon_select_ecc_review_types" ON ecc_review_types
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ecc_review_types" ON ecc_review_types;
CREATE POLICY "anon_insert_ecc_review_types" ON ecc_review_types
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ecc_review_types" ON ecc_review_types;
CREATE POLICY "anon_update_ecc_review_types" ON ecc_review_types
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ecc_review_types" ON ecc_review_types;
CREATE POLICY "anon_delete_ecc_review_types" ON ecc_review_types
  FOR DELETE TO anon, authenticated USING (true);

-- Seed review types
INSERT INTO ecc_review_types (key, display_name, description, domain, status, governing_standard, default_lifecycle, allowed_decision_types) VALUES
  ('engineering_classification', 'Engineering Classification Review', 'Governed review of engineering object ownership classification and capability promotion eligibility.', 'Governance', 'active', 'EOCPS-001 §3', '["draft","open","in_review","approved","closed"]', ARRAY['assign_platform','assign_project','retain_current_owner','promote_to_spc','absorb_into_platform','classify_external','retire','defer','reject_recommendation']),
  ('architecture', 'Architecture Review', 'Governed review of architectural decisions and structural boundaries.', 'Architecture', 'planned', 'EOCPS-001 §5', '["draft","open","in_review","approved","closed"]', ARRAY['approve','reject','defer']),
  ('constitutional', 'Constitutional Review', 'Governed review of constitutional amendments and platform governance model changes.', 'Governance', 'planned', 'EOCPS-001 §8', '["draft","open","in_review","approved","closed"]', ARRAY['approve','reject','defer']),
  ('release', 'Release Review', 'Governed review of release candidates before production deployment.', 'Engineering', 'planned', 'EOCPS-001', '["draft","open","in_review","approved","closed"]', ARRAY['approve','reject','defer']),
  ('security', 'Security Review', 'Governed review of security posture and vulnerability assessments.', 'Security', 'planned', 'EOCPS-001', '["draft","open","in_review","approved","closed"]', ARRAY['approve','reject','defer']),
  ('environment', 'Environment Review', 'Governed review of environment configuration and infrastructure changes.', 'Infrastructure', 'planned', 'EOCPS-001', '["draft","open","in_review","approved","closed"]', ARRAY['approve','reject','defer']),
  ('ai_governance', 'AI Governance Review', 'Governed review of AI capability deployments and model governance decisions.', 'AI', 'planned', 'EOCPS-001', '["draft","open","in_review","approved","closed"]', ARRAY['approve','reject','defer'])
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- TABLE 2: ecc_governed_reviews (generic review records)
-- ============================================================
CREATE TABLE IF NOT EXISTS ecc_governed_reviews (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_reference      text        UNIQUE NOT NULL DEFAULT generate_ecr_ref(),
  review_type_key       text        REFERENCES ecc_review_types(key) ON UPDATE CASCADE,
  title                 text        NOT NULL,
  summary               text        NOT NULL DEFAULT '',
  subject_object_type   text        NOT NULL,
  subject_object_id     uuid,
  subject_reference     text        NOT NULL DEFAULT '',
  context_type          text        NOT NULL DEFAULT '',
  project_id            uuid        REFERENCES ecc_projects(id) ON DELETE SET NULL,
  trigger_type          text        NOT NULL DEFAULT 'manual'
                                    CHECK (trigger_type IN ('manual', 'automated', 'policy', 'atd_recommendation')),
  status                text        NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft', 'open', 'in_review', 'approved', 'rejected', 'deferred', 'closed')),
  priority              text        NOT NULL DEFAULT 'normal'
                                    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  confidence_score      int         CHECK (confidence_score >= 0 AND confidence_score <= 100),
  recommendation        text        NOT NULL DEFAULT '',
  current_state         jsonb       NOT NULL DEFAULT '{}',
  proposed_state        jsonb       NOT NULL DEFAULT '{}',
  decision              text,
  decision_rationale    text,
  deciding_authority    text,
  deferred_until        date,
  assigned_reviewer_id  text,
  created_by            text        NOT NULL DEFAULT 'system',
  opened_at             timestamptz,
  decided_at            timestamptz,
  closed_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecc_governed_reviews_type
  ON ecc_governed_reviews (review_type_key);
CREATE INDEX IF NOT EXISTS idx_ecc_governed_reviews_status
  ON ecc_governed_reviews (status);
CREATE INDEX IF NOT EXISTS idx_ecc_governed_reviews_subject
  ON ecc_governed_reviews (subject_object_id, subject_object_type);
CREATE INDEX IF NOT EXISTS idx_ecc_governed_reviews_created
  ON ecc_governed_reviews (created_at DESC);

ALTER TABLE ecc_governed_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ecc_governed_reviews" ON ecc_governed_reviews;
CREATE POLICY "anon_select_ecc_governed_reviews" ON ecc_governed_reviews
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ecc_governed_reviews" ON ecc_governed_reviews;
CREATE POLICY "anon_insert_ecc_governed_reviews" ON ecc_governed_reviews
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ecc_governed_reviews" ON ecc_governed_reviews;
CREATE POLICY "anon_update_ecc_governed_reviews" ON ecc_governed_reviews
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ecc_governed_reviews" ON ecc_governed_reviews;
CREATE POLICY "anon_delete_ecc_governed_reviews" ON ecc_governed_reviews
  FOR DELETE TO anon, authenticated USING (status = 'draft');


-- ============================================================
-- TABLE 3: ecc_review_evidence (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS ecc_review_evidence (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id         uuid        NOT NULL REFERENCES ecc_governed_reviews(id) ON DELETE CASCADE,
  evidence_type     text        NOT NULL
                                CHECK (evidence_type IN (
                                  'usage', 'duplication', 'stability', 'coupling',
                                  'business_case', 'governance', 'manual', 'migration', 'other'
                                )),
  title             text        NOT NULL,
  description       text        NOT NULL DEFAULT '',
  source_type       text        NOT NULL DEFAULT 'manual'
                                CHECK (source_type IN ('manual', 'automated', 'imported', 'atd', 'system')),
  source_reference  text        NOT NULL DEFAULT '',
  evidence_payload  jsonb       NOT NULL DEFAULT '{}',
  added_by          text        NOT NULL DEFAULT 'system',
  supersedes_id     uuid        REFERENCES ecc_review_evidence(id),
  created_at        timestamptz NOT NULL DEFAULT now()
  -- No updated_at: append-only
);

CREATE INDEX IF NOT EXISTS idx_ecc_review_evidence_review
  ON ecc_review_evidence (review_id);

ALTER TABLE ecc_review_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ecc_review_evidence" ON ecc_review_evidence;
CREATE POLICY "anon_select_ecc_review_evidence" ON ecc_review_evidence
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ecc_review_evidence" ON ecc_review_evidence;
CREATE POLICY "anon_insert_ecc_review_evidence" ON ecc_review_evidence
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Intentionally NO UPDATE or DELETE policies: append-only by policy enforcement.


-- ============================================================
-- TABLE 4: ecc_review_participants
-- ============================================================
CREATE TABLE IF NOT EXISTS ecc_review_participants (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id         uuid        NOT NULL REFERENCES ecc_governed_reviews(id) ON DELETE CASCADE,
  participant_ref   text        NOT NULL,
  participant_role  text        NOT NULL DEFAULT 'reviewer'
                                CHECK (participant_role IN ('reviewer', 'approver', 'observer', 'atd', 'product_owner')),
  authority_type    text        NOT NULL DEFAULT 'advisory'
                                CHECK (authority_type IN ('deciding', 'advisory', 'observing')),
  position          text        NOT NULL DEFAULT 'pending'
                                CHECK (position IN ('support', 'oppose', 'neutral', 'abstain', 'pending')),
  comments          text        NOT NULL DEFAULT '',
  recorded_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecc_review_participants_review
  ON ecc_review_participants (review_id);

ALTER TABLE ecc_review_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ecc_review_participants" ON ecc_review_participants;
CREATE POLICY "anon_select_ecc_review_participants" ON ecc_review_participants
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ecc_review_participants" ON ecc_review_participants;
CREATE POLICY "anon_insert_ecc_review_participants" ON ecc_review_participants
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ecc_review_participants" ON ecc_review_participants;
CREATE POLICY "anon_update_ecc_review_participants" ON ecc_review_participants
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);


-- ============================================================
-- TABLE 5: ecc_review_audit_events (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS ecc_review_audit_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id       uuid        NOT NULL REFERENCES ecc_governed_reviews(id) ON DELETE CASCADE,
  event_type      text        NOT NULL
                              CHECK (event_type IN (
                                'created', 'updated', 'opened', 'evidence_added', 'participant_added',
                                'review_started', 'recommendation_changed', 'approved', 'rejected',
                                'deferred', 'closed', 'reopened'
                              )),
  actor           text        NOT NULL DEFAULT 'system',
  event_payload   jsonb       NOT NULL DEFAULT '{}',
  reason          text        NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
  -- No updated_at: append-only
);

CREATE INDEX IF NOT EXISTS idx_ecc_review_audit_review
  ON ecc_review_audit_events (review_id);
CREATE INDEX IF NOT EXISTS idx_ecc_review_audit_created
  ON ecc_review_audit_events (created_at DESC);

ALTER TABLE ecc_review_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ecc_review_audit_events" ON ecc_review_audit_events;
CREATE POLICY "anon_select_ecc_review_audit_events" ON ecc_review_audit_events
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ecc_review_audit_events" ON ecc_review_audit_events;
CREATE POLICY "anon_insert_ecc_review_audit_events" ON ecc_review_audit_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Intentionally NO UPDATE or DELETE policies: append-only by policy enforcement.


-- ============================================================
-- TABLE 6: ecc_ecr_extensions (ECR-specific, one-to-one)
-- ============================================================
CREATE TABLE IF NOT EXISTS ecc_ecr_extensions (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id                     uuid        UNIQUE NOT NULL REFERENCES ecc_governed_reviews(id) ON DELETE CASCADE,
  ownership_metadata_id         uuid        REFERENCES ecc_ownership_metadata(id) ON DELETE SET NULL,
  object_classification_key     text        REFERENCES ecc_capability_classifications(key) ON UPDATE CASCADE,
  current_ownership_type_key    text        REFERENCES ecc_ownership_types(key) ON UPDATE CASCADE,
  proposed_ownership_type_key   text        REFERENCES ecc_ownership_types(key) ON UPDATE CASCADE,
  current_owner_ref             text,
  proposed_owner_ref            text,
  reusability_score             int         CHECK (reusability_score >= 0 AND reusability_score <= 100),
  promotion_eligible            boolean     NOT NULL DEFAULT false,
  classification_confidence     int         CHECK (classification_confidence >= 0 AND classification_confidence <= 100),
  migration_review              boolean     NOT NULL DEFAULT false,
  promotion_review              boolean     NOT NULL DEFAULT false,
  retirement_review             boolean     NOT NULL DEFAULT false,
  constitutional_boundary_case  boolean     NOT NULL DEFAULT false,
  effective_date                date,
  lineage_event_id              uuid        REFERENCES ecc_ownership_lineage(id) ON DELETE SET NULL,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecc_ecr_extensions_review
  ON ecc_ecr_extensions (review_id);
CREATE INDEX IF NOT EXISTS idx_ecc_ecr_extensions_proposed_ownership
  ON ecc_ecr_extensions (proposed_ownership_type_key);
CREATE INDEX IF NOT EXISTS idx_ecc_ecr_extensions_promotion
  ON ecc_ecr_extensions (promotion_eligible) WHERE promotion_eligible = true;

ALTER TABLE ecc_ecr_extensions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ecc_ecr_extensions" ON ecc_ecr_extensions;
CREATE POLICY "anon_select_ecc_ecr_extensions" ON ecc_ecr_extensions
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ecc_ecr_extensions" ON ecc_ecr_extensions;
CREATE POLICY "anon_insert_ecc_ecr_extensions" ON ecc_ecr_extensions
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ecc_ecr_extensions" ON ecc_ecr_extensions;
CREATE POLICY "anon_update_ecc_ecr_extensions" ON ecc_ecr_extensions
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ecc_ecr_extensions" ON ecc_ecr_extensions;
CREATE POLICY "anon_delete_ecc_ecr_extensions" ON ecc_ecr_extensions
  FOR DELETE TO anon, authenticated USING (true);
