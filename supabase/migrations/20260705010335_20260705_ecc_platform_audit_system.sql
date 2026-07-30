/*
# ECC Platform Audit System

## Summary
Creates the permanent Enterprise Platform Audit System tables for engineering governance,
quality assurance, historical audit reconstruction, and trend analysis.

## New Tables

### ecc_audits
The central audit record. Every audit — historical, manual, or scheduled — becomes a
permanent, immutable engineering record. Contains the executive summary, scores,
lifecycle status, PO review fields, and generated Markdown report.

Key columns:
- `audit_number` — sequential ID (AUD-001, AUD-002, etc.)
- `audit_type` — 'historical_generated' | 'manual' | 'scheduled' | 'release_audit'
- `status` — audit lifecycle (draft → awaiting_review → reviewed → actions_in_progress → actions_complete → closed)
- `confidence_level` — how much evidence existed for this audit (high/medium/low)
- `overall_health_score` — 0–100 weighted composite score
- `markdown_report` — permanently stored copyable Markdown report

### ecc_audit_scores
Per-category scores for each audit. One row per category per audit.
Categories: architecture, engineering, features, documentation, testing,
compliance, security, performance, scalability, navigation, ux,
ai_engineering, commercial_readiness, release_readiness, maintainability,
technical_debt, po_governance

### ecc_audit_findings
Individual findings within an audit. Each finding has severity, category,
recommendation framework classification (must_have/should_have/could_have/vision),
and current status.

## Security
RLS enabled on all tables. Anon + authenticated (single-tenant).
*/

-- ─── ecc_audits ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_audits (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_number            text        NOT NULL UNIQUE,
  audit_type              text        NOT NULL DEFAULT 'manual',
  name                    text        NOT NULL,
  audit_date              date        NOT NULL DEFAULT CURRENT_DATE,
  platform_version        text,
  development_phase       text,
  milestone               text,
  linked_release          text,
  status                  text        NOT NULL DEFAULT 'draft',
  confidence_level        text        NOT NULL DEFAULT 'medium',
  overall_health_score    int         CHECK (overall_health_score BETWEEN 0 AND 100),
  platform_maturity       text,
  overall_confidence      int         CHECK (overall_confidence BETWEEN 0 AND 100),
  executive_summary       text,
  key_strengths           text[]      NOT NULL DEFAULT ARRAY[]::text[],
  key_weaknesses          text[]      NOT NULL DEFAULT ARRAY[]::text[],
  highest_risks           text[]      NOT NULL DEFAULT ARRAY[]::text[],
  highest_opportunities   text[]      NOT NULL DEFAULT ARRAY[]::text[],
  top_priorities          text[]      NOT NULL DEFAULT ARRAY[]::text[],
  recommended_next_focus  text,
  reviewer                text,
  review_date             date,
  review_notes            text,
  acceptance_decision     text,
  closure_date            date,
  closure_notes           text,
  markdown_report         text,
  evidence_sources        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  linked_feature_ids      text[]      NOT NULL DEFAULT ARRAY[]::text[],
  linked_doc_ids          text[]      NOT NULL DEFAULT ARRAY[]::text[],
  audit_duration_minutes  int,
  commercial_readiness    text,
  commercial_confidence   int         CHECK (commercial_confidence BETWEEN 0 AND 100),
  commercial_recommendation text,
  compliance_score        int         CHECK (compliance_score BETWEEN 0 AND 100),
  compliance_readiness    text,
  release_readiness_internal text,
  release_readiness_beta  text,
  release_readiness_pilot text,
  release_readiness_production text,
  release_readiness_commercial text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecc_audits_audit_date     ON ecc_audits (audit_date DESC);
CREATE INDEX IF NOT EXISTS idx_ecc_audits_audit_type     ON ecc_audits (audit_type);
CREATE INDEX IF NOT EXISTS idx_ecc_audits_status         ON ecc_audits (status);

ALTER TABLE ecc_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_audits"  ON ecc_audits;
DROP POLICY IF EXISTS "anon_insert_audits"  ON ecc_audits;
DROP POLICY IF EXISTS "anon_update_audits"  ON ecc_audits;
DROP POLICY IF EXISTS "anon_delete_audits"  ON ecc_audits;

CREATE POLICY "anon_select_audits"  ON ecc_audits FOR SELECT  TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_audits"  ON ecc_audits FOR INSERT  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_audits"  ON ecc_audits FOR UPDATE  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_audits"  ON ecc_audits FOR DELETE  TO anon, authenticated USING (true);

-- ─── ecc_audit_scores ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_audit_scores (
  id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id    uuid  NOT NULL REFERENCES ecc_audits(id) ON DELETE CASCADE,
  category    text  NOT NULL,
  score       int   CHECK (score BETWEEN 0 AND 100),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecc_audit_scores_audit_id ON ecc_audit_scores (audit_id);

ALTER TABLE ecc_audit_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_scores"  ON ecc_audit_scores;
DROP POLICY IF EXISTS "anon_insert_scores"  ON ecc_audit_scores;
DROP POLICY IF EXISTS "anon_update_scores"  ON ecc_audit_scores;
DROP POLICY IF EXISTS "anon_delete_scores"  ON ecc_audit_scores;

CREATE POLICY "anon_select_scores"  ON ecc_audit_scores FOR SELECT  TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_scores"  ON ecc_audit_scores FOR INSERT  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_scores"  ON ecc_audit_scores FOR UPDATE  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_scores"  ON ecc_audit_scores FOR DELETE  TO anon, authenticated USING (true);

-- ─── ecc_audit_findings ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_audit_findings (
  id              uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id        uuid  NOT NULL REFERENCES ecc_audits(id) ON DELETE CASCADE,
  finding_number  text  NOT NULL,
  severity        text  NOT NULL DEFAULT 'medium',
  category        text  NOT NULL,
  title           text  NOT NULL,
  description     text,
  business_impact text,
  technical_impact text,
  risk            text,
  recommendation  text,
  estimated_effort text,
  priority        text  NOT NULL DEFAULT 'should_have',
  affected_module text,
  affected_feature text,
  current_status  text  NOT NULL DEFAULT 'open',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecc_audit_findings_audit_id  ON ecc_audit_findings (audit_id);
CREATE INDEX IF NOT EXISTS idx_ecc_audit_findings_severity  ON ecc_audit_findings (severity);
CREATE INDEX IF NOT EXISTS idx_ecc_audit_findings_status    ON ecc_audit_findings (current_status);

ALTER TABLE ecc_audit_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_findings"  ON ecc_audit_findings;
DROP POLICY IF EXISTS "anon_insert_findings"  ON ecc_audit_findings;
DROP POLICY IF EXISTS "anon_update_findings"  ON ecc_audit_findings;
DROP POLICY IF EXISTS "anon_delete_findings"  ON ecc_audit_findings;

CREATE POLICY "anon_select_findings"  ON ecc_audit_findings FOR SELECT  TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_findings"  ON ecc_audit_findings FOR INSERT  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_findings"  ON ecc_audit_findings FOR UPDATE  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_findings"  ON ecc_audit_findings FOR DELETE  TO anon, authenticated USING (true);
