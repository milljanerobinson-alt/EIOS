
-- ============================================================
-- RC-003 — Engineering Excellence: Core Schema
-- ============================================================

-- ── 1. Testing Sprint Tables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_test_plans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_number         text UNIQUE,
  title               text NOT NULL,
  description         text,
  status              text NOT NULL DEFAULT 'draft',
  test_type           text NOT NULL DEFAULT 'feature',
  priority            text NOT NULL DEFAULT 'medium',
  owner               text,
  target_release      text,
  due_date            date,
  linked_feature_ids  text[],
  linked_rec_ids      text[],
  total_suites        int  NOT NULL DEFAULT 0,
  total_cases         int  NOT NULL DEFAULT 0,
  cases_passed        int  NOT NULL DEFAULT 0,
  cases_failed        int  NOT NULL DEFAULT 0,
  cases_skipped       int  NOT NULL DEFAULT 0,
  coverage_percent    int,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecc_test_suites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id         uuid NOT NULL REFERENCES ecc_test_plans(id) ON DELETE CASCADE,
  suite_number    text,
  title           text NOT NULL,
  description     text,
  category        text,
  status          text NOT NULL DEFAULT 'pending',
  total_cases     int  NOT NULL DEFAULT 0,
  cases_passed    int  NOT NULL DEFAULT 0,
  cases_failed    int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecc_test_cases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id        uuid NOT NULL REFERENCES ecc_test_suites(id) ON DELETE CASCADE,
  plan_id         uuid NOT NULL REFERENCES ecc_test_plans(id) ON DELETE CASCADE,
  case_number     text,
  title           text NOT NULL,
  description     text,
  steps           text,
  expected_result text,
  actual_result   text,
  status          text NOT NULL DEFAULT 'pending',
  test_type       text NOT NULL DEFAULT 'manual',
  severity        text NOT NULL DEFAULT 'medium',
  feature_id      text,
  run_date        date,
  run_by          text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecc_test_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          uuid NOT NULL REFERENCES ecc_test_plans(id) ON DELETE CASCADE,
  run_number       text,
  status           text NOT NULL DEFAULT 'in_progress',
  triggered_by     text,
  run_date         date NOT NULL DEFAULT CURRENT_DATE,
  duration_minutes int,
  total_cases      int  NOT NULL DEFAULT 0,
  cases_passed     int  NOT NULL DEFAULT 0,
  cases_failed     int  NOT NULL DEFAULT 0,
  cases_skipped    int  NOT NULL DEFAULT 0,
  coverage_delta   int,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_test_plans  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecc_test_suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecc_test_cases  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecc_test_runs   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_test_plans"  ON ecc_test_plans  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_test_plans"  ON ecc_test_plans  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_test_plans"  ON ecc_test_plans  FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "delete_test_plans"  ON ecc_test_plans  FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "select_test_suites" ON ecc_test_suites FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_test_suites" ON ecc_test_suites FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_test_suites" ON ecc_test_suites FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "delete_test_suites" ON ecc_test_suites FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "select_test_cases"  ON ecc_test_cases  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_test_cases"  ON ecc_test_cases  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_test_cases"  ON ecc_test_cases  FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "delete_test_cases"  ON ecc_test_cases  FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "select_test_runs"   ON ecc_test_runs   FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_test_runs"   ON ecc_test_runs   FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_test_runs"   ON ecc_test_runs   FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "delete_test_runs"   ON ecc_test_runs   FOR DELETE TO anon, authenticated USING (true);

-- ── 2. Audit Enhancements ─────────────────────────────────────────────────────

ALTER TABLE ecc_audits ADD COLUMN IF NOT EXISTS engineering_decision      jsonb;
ALTER TABLE ecc_audits ADD COLUMN IF NOT EXISTS director_summary          text;
ALTER TABLE ecc_audits ADD COLUMN IF NOT EXISTS director_priorities       jsonb;
ALTER TABLE ecc_audits ADD COLUMN IF NOT EXISTS phase3_readiness_verdict  text;
ALTER TABLE ecc_audits ADD COLUMN IF NOT EXISTS phase3_conditions         jsonb;
ALTER TABLE ecc_audits ADD COLUMN IF NOT EXISTS engineering_effort_days   int;
ALTER TABLE ecc_audits ADD COLUMN IF NOT EXISTS risk_level                text;

-- ── 3. Recommendation Pipeline Enhancements ───────────────────────────────────

ALTER TABLE ecc_audit_recommendations ADD COLUMN IF NOT EXISTS confidence_score      int;
ALTER TABLE ecc_audit_recommendations ADD COLUMN IF NOT EXISTS evidence_score        int;
ALTER TABLE ecc_audit_recommendations ADD COLUMN IF NOT EXISTS supporting_evidence   jsonb;
ALTER TABLE ecc_audit_recommendations ADD COLUMN IF NOT EXISTS linked_feature_ids    text[];
ALTER TABLE ecc_audit_recommendations ADD COLUMN IF NOT EXISTS linked_risk_ids       text[];
ALTER TABLE ecc_audit_recommendations ADD COLUMN IF NOT EXISTS linked_stage          text;
ALTER TABLE ecc_audit_recommendations ADD COLUMN IF NOT EXISTS linked_release        text;
ALTER TABLE ecc_audit_recommendations ADD COLUMN IF NOT EXISTS estimated_effort_days int;
ALTER TABLE ecc_audit_recommendations ADD COLUMN IF NOT EXISTS blocks_what           text;
ALTER TABLE ecc_audit_recommendations ADD COLUMN IF NOT EXISTS category              text;
ALTER TABLE ecc_audit_recommendations ADD COLUMN IF NOT EXISTS work_item_created     boolean NOT NULL DEFAULT false;
ALTER TABLE ecc_audit_recommendations ADD COLUMN IF NOT EXISTS work_item_id          uuid;

-- ── 4. Compliance Versioning ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_compliance_versions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rc_id          uuid REFERENCES ecc_release_candidates(id) ON DELETE SET NULL,
  version_number text NOT NULL,
  title          text NOT NULL,
  status         text NOT NULL DEFAULT 'draft',
  scope_notes    text,
  approved_by    text,
  approved_at    timestamptz,
  sign_off_date  date,
  sign_off_by    text,
  evidence       jsonb,
  items          jsonb NOT NULL DEFAULT '[]',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_compliance_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_cv" ON ecc_compliance_versions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_cv" ON ecc_compliance_versions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_cv" ON ecc_compliance_versions FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "delete_cv" ON ecc_compliance_versions FOR DELETE TO anon, authenticated USING (true);

-- ── 5. Knowledge Objects Foundation (Stage 3 prep) ───────────────────────────

CREATE TABLE IF NOT EXISTS ecc_knowledge_objects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_number   text UNIQUE,
  object_type     text NOT NULL DEFAULT 'concept',
  title           text NOT NULL,
  summary         text,
  content         text,
  visibility      text NOT NULL DEFAULT 'internal',
  status          text NOT NULL DEFAULT 'draft',
  category        text,
  tags            text[],
  version         text NOT NULL DEFAULT '1.0',
  linked_features text[],
  linked_recs     text[],
  linked_objects  text[],
  source_audit    text,
  owner           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecc_knowledge_relationships (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_object_id uuid NOT NULL REFERENCES ecc_knowledge_objects(id) ON DELETE CASCADE,
  to_object_id   uuid NOT NULL REFERENCES ecc_knowledge_objects(id) ON DELETE CASCADE,
  relationship   text NOT NULL DEFAULT 'related',
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(from_object_id, to_object_id, relationship)
);

ALTER TABLE ecc_knowledge_objects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecc_knowledge_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_ko" ON ecc_knowledge_objects FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_ko" ON ecc_knowledge_objects FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_ko" ON ecc_knowledge_objects FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "delete_ko" ON ecc_knowledge_objects FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "select_kr" ON ecc_knowledge_relationships FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_kr" ON ecc_knowledge_relationships FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_kr" ON ecc_knowledge_relationships FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "delete_kr" ON ecc_knowledge_relationships FOR DELETE TO anon, authenticated USING (true);

-- ── 6. Test plan register sequence ───────────────────────────────────────────

INSERT INTO ecc_register_sequences (register_type, last_number)
VALUES ('tp', 0)
ON CONFLICT (register_type) DO NOTHING;

-- ── 7. Update AUD-002 with Engineering Decision and Director Summary ──────────

UPDATE ecc_audits
SET
  engineering_decision = '{
    "development_status": "Active — Phase 3 resumption authorised",
    "commercial_status": "Partially Ready — testing and compliance gaps remain",
    "current_stage": "Stage 1 — Engineering Foundations",
    "current_release": "RC-003",
    "recommended_next_release": "RC-004 (Post-Testing Sprint)",
    "recommended_next_stage": "Stage 2 — Engineering Excellence",
    "decision_date": "2026-07-05",
    "approved_by": "Engineering Operating System",
    "engineering_confidence": 77,
    "risk_level": "medium",
    "verdict": "READY WITH CONDITIONS",
    "rationale": "Platform is feature-complete and architecture is sound. Three conditions must be resolved in parallel: AI provider configuration, Testing Sprint initiation, and RC-002 compliance formalisation. None of these conditions block development resumption — they gate specific Phase 3 milestones (GA, commercial contracts, AI demos)."
  }'::jsonb,
  director_summary = 'As Engineering Director, I would make three investments before any other engineering work this quarter.

First, I would configure an AI provider immediately — today, not next sprint. Every hour we operate without AI provider configuration is an hour the Engineering Operating System is running at half capacity. AI Audit Generation, intelligent backlog prioritisation, and AI-assisted engineering analysis are all blocked. This is a one-hour configuration task with outsized leverage. ROI: immediate, zero engineering effort.

Second, I would initiate a Testing Sprint as the primary engineering focus for the next six weeks. 86 production features with zero automated test coverage is the most significant unmitigated risk on the platform. We cannot responsibly grow the platform, onboard customers, or make performance improvements without a testing baseline. This is not optional — it is the engineering foundation that every future sprint depends on. ROI: risk reduction from critical to low, enables confident delivery, unlocks Phase 3 GA milestone gate.

Third, I would treat RC-002 compliance formalisation as a commercial blocker, not a documentation task. This single checklist is standing between the platform and commercial contract execution. The effort is small — scope the checklist, identify what applies, obtain sign-off. The risk of not doing it is large — a compliance audit against an unchecked checklist is a commercial liability. ROI: unblocks commercial revenue, eliminates regulatory exposure.

Everything else — documentation depth, performance benchmarks, staging environment, CI/CD — are important but secondary to these three. They will naturally improve as testing and documentation mature.',
  director_priorities = '[
    {
      "priority": 1,
      "investment": "Configure AI Provider",
      "why": "Unlocks AI audit generation, backlog analysis, and engineering intelligence across the EOS immediately",
      "roi": "High — zero engineering effort, immediate leverage multiplier",
      "effort": "1 hour",
      "risk_reduction": "Removes blocker from 3 AUD-002 findings",
      "platform_improvement": "AI infrastructure score 70 → 90+"
    },
    {
      "priority": 2,
      "investment": "Testing Sprint (REC-001)",
      "why": "86 untested features is an existential engineering risk. No confident delivery, scaling, or compliance is possible without a testing baseline",
      "roi": "Critical — gates Phase 3 GA, enables confident delivery, reduces regression risk to near-zero",
      "effort": "6 weeks, ~240 engineering hours",
      "risk_reduction": "Testing score 20 → 70+, eliminates critical risk from Risk Register",
      "platform_improvement": "Testing 20→70, overall health 77→83+"
    },
    {
      "priority": 3,
      "investment": "RC-002 Compliance Sign-off (REC-010)",
      "why": "Unchecked compliance checklist is a commercial blocker. No commercial contracts can be executed without compliance sign-off",
      "roi": "High — unblocks commercial revenue stream, eliminates regulatory exposure",
      "effort": "1 day, stakeholder review",
      "risk_reduction": "Compliance score 72 → 85+",
      "platform_improvement": "Compliance 72→85, unlocks commercial readiness"
    }
  ]'::jsonb,
  phase3_readiness_verdict = 'ready_with_conditions',
  phase3_conditions = '[
    {"condition": 1, "title": "Configure AI Provider", "rec": "REC-009", "due": "2026-07-15", "blocks": "AI features, AI audits", "mandatory_for": "AI feature demos and trials"},
    {"condition": 2, "title": "Initiate Testing Sprint", "rec": "REC-001", "due": "2026-08-01", "blocks": "Phase 3 GA milestone gate", "mandatory_for": "Phase 3 general availability"},
    {"condition": 3, "title": "Formalise RC-002 Compliance", "rec": "REC-010", "due": "2026-08-15", "blocks": "Commercial contracts", "mandatory_for": "Commercial customer agreements"}
  ]'::jsonb,
  risk_level = 'medium',
  engineering_effort_days = 45
WHERE audit_number = 'AUD-002';

-- Backfill recommendation confidence/evidence scores for existing recs
UPDATE ecc_audit_recommendations
SET
  confidence_score = CASE
    WHEN priority = 'critical' THEN 95
    WHEN priority = 'high'     THEN 88
    WHEN priority = 'medium'   THEN 75
    ELSE 65
  END,
  evidence_score = CASE
    WHEN priority = 'critical' THEN 92
    WHEN priority = 'high'     THEN 85
    WHEN priority = 'medium'   THEN 72
    ELSE 60
  END
WHERE confidence_score IS NULL;
