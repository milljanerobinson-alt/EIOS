/*
# ATD Cognitive Engine v1.0 — Engineering Object Model

## Overview
Implements the AI Technical Director Cognitive Engine schema. Creates the full
Engineering Object Model that allows ATD to orchestrate engineering thinking
across a 9-stage cognitive workflow without containing any AI provider logic.

## New Tables

### Core Orchestration
1. `atd_engineering_intents` — Captured Product Owner intent records. Each intent
   is the entry point to the cognitive pipeline (ref: ATD-INT-NNN).
2. `atd_pipeline_executions` — Tracks a full pipeline run from intent capture
   through all 9 cognitive stages to knowledge update (ref: ATD-PIPE-NNN).
3. `atd_pipeline_states` — Granular per-stage state record within a pipeline execution.

### Analysis & Planning
4. `atd_engineering_analyses` — Engineering analysis output: constitution review,
   standards alignment, architecture notes, risks, dependencies (ref: ATD-ANA-NNN).
5. `atd_engineering_plans` — Engineering plans with strategy, approach, effort
   estimate, required EWOs, engineering phases (ref: ATD-PLN-NNN).

### Capability Framework
6. `atd_capabilities` — Registry of all ATD capabilities. Provider-independent.
   Seeded with 13 v1.0 capabilities.
7. `atd_capability_executions` — Audit log of every capability invocation.

### Governance
8. `atd_review_requests` — Review packages prepared for external reviewers.
9. `atd_review_responses` — Responses to review requests.
10. `atd_engineering_decisions` — All governance decisions made during a pipeline.

### Implementation & Validation
11. `atd_implementation_requests` — Implementation coordination records.
12. `atd_implementation_results` — Outcomes of implementation requests.
13. `atd_validation_results` — Validation outcomes per intent.

### Knowledge
14. `atd_knowledge_records` — Reusable engineering knowledge extracted from pipelines.

## Security
- RLS enabled on all 14 tables.
- All policies use TO authenticated.
- 4 separate policies per table (SELECT / INSERT / UPDATE / DELETE).
*/

CREATE TABLE IF NOT EXISTS atd_engineering_intents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_ref            text NOT NULL UNIQUE,
  title                 text NOT NULL,
  raw_input             text NOT NULL,
  requested_outcome     text,
  business_objective    text,
  engineering_objective text,
  scope                 text,
  constraints           text,
  status                text NOT NULL DEFAULT 'captured'
                          CHECK (status IN ('captured','analysed','planned','in_review',
                                            'approved','rejected','implementing',
                                            'validating','extracting_knowledge',
                                            'intelligence_updated','complete','cancelled')),
  pipeline_execution_id uuid,
  notes                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);
ALTER TABLE atd_engineering_intents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atd_intents_select" ON atd_engineering_intents;
CREATE POLICY "atd_intents_select" ON atd_engineering_intents FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "atd_intents_insert" ON atd_engineering_intents;
CREATE POLICY "atd_intents_insert" ON atd_engineering_intents FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "atd_intents_update" ON atd_engineering_intents;
CREATE POLICY "atd_intents_update" ON atd_engineering_intents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "atd_intents_delete" ON atd_engineering_intents;
CREATE POLICY "atd_intents_delete" ON atd_engineering_intents FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS atd_pipeline_executions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_ref  text NOT NULL UNIQUE,
  intent_id     uuid REFERENCES atd_engineering_intents(id) ON DELETE CASCADE,
  current_stage text NOT NULL DEFAULT 'intent_understanding'
                  CHECK (current_stage IN ('intent_understanding','engineering_analysis',
                    'engineering_planning','review_preparation','approval',
                    'implementation_coordination','validation','knowledge_extraction',
                    'intelligence_update','complete')),
  status        text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running','paused','waiting_approval','complete','failed','cancelled')),
  started_at    timestamptz DEFAULT now(),
  completed_at  timestamptz,
  stage_history jsonb DEFAULT '[]'::jsonb,
  error_message text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
ALTER TABLE atd_pipeline_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atd_pipeline_select" ON atd_pipeline_executions;
CREATE POLICY "atd_pipeline_select" ON atd_pipeline_executions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "atd_pipeline_insert" ON atd_pipeline_executions;
CREATE POLICY "atd_pipeline_insert" ON atd_pipeline_executions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "atd_pipeline_update" ON atd_pipeline_executions;
CREATE POLICY "atd_pipeline_update" ON atd_pipeline_executions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "atd_pipeline_delete" ON atd_pipeline_executions;
CREATE POLICY "atd_pipeline_delete" ON atd_pipeline_executions FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS atd_pipeline_states (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_execution_id uuid REFERENCES atd_pipeline_executions(id) ON DELETE CASCADE,
  stage                 text NOT NULL,
  state_data            jsonb DEFAULT '{}'::jsonb,
  entered_at            timestamptz DEFAULT now(),
  exited_at             timestamptz,
  outcome               text NOT NULL DEFAULT 'pending'
                          CHECK (outcome IN ('pending','running','complete','failed','skipped','waiting')),
  created_at            timestamptz DEFAULT now()
);
ALTER TABLE atd_pipeline_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atd_pstate_select" ON atd_pipeline_states;
CREATE POLICY "atd_pstate_select" ON atd_pipeline_states FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "atd_pstate_insert" ON atd_pipeline_states;
CREATE POLICY "atd_pstate_insert" ON atd_pipeline_states FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "atd_pstate_update" ON atd_pipeline_states;
CREATE POLICY "atd_pstate_update" ON atd_pipeline_states FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "atd_pstate_delete" ON atd_pipeline_states;
CREATE POLICY "atd_pstate_delete" ON atd_pipeline_states FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS atd_engineering_analyses (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_ref               text NOT NULL UNIQUE,
  intent_id                  uuid REFERENCES atd_engineering_intents(id) ON DELETE CASCADE,
  pipeline_execution_id      uuid REFERENCES atd_pipeline_executions(id),
  constitution_review        text,
  standards_reviewed         text[] DEFAULT '{}',
  architecture_notes         text,
  existing_features_reviewed jsonb DEFAULT '[]'::jsonb,
  eig_entities_reviewed      text[] DEFAULT '{}',
  product_intelligence_notes text,
  roadmap_alignment          text,
  dependencies               jsonb DEFAULT '[]'::jsonb,
  risks                      jsonb DEFAULT '[]'::jsonb,
  complexity_assessment      text CHECK (complexity_assessment IN ('low','medium','high','critical')),
  summary                    text,
  status                     text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','complete')),
  created_at                 timestamptz DEFAULT now(),
  updated_at                 timestamptz DEFAULT now()
);
ALTER TABLE atd_engineering_analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atd_analysis_select" ON atd_engineering_analyses;
CREATE POLICY "atd_analysis_select" ON atd_engineering_analyses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "atd_analysis_insert" ON atd_engineering_analyses;
CREATE POLICY "atd_analysis_insert" ON atd_engineering_analyses FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "atd_analysis_update" ON atd_engineering_analyses;
CREATE POLICY "atd_analysis_update" ON atd_engineering_analyses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "atd_analysis_delete" ON atd_engineering_analyses;
CREATE POLICY "atd_analysis_delete" ON atd_engineering_analyses FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS atd_engineering_plans (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_ref              text NOT NULL UNIQUE,
  intent_id             uuid REFERENCES atd_engineering_intents(id) ON DELETE CASCADE,
  analysis_id           uuid REFERENCES atd_engineering_analyses(id),
  pipeline_execution_id uuid REFERENCES atd_pipeline_executions(id),
  executive_summary     text,
  engineering_strategy  text,
  recommended_approach  text,
  dependencies          jsonb DEFAULT '[]'::jsonb,
  risks                 jsonb DEFAULT '[]'::jsonb,
  estimated_effort      text,
  engineering_phases    jsonb DEFAULT '[]'::jsonb,
  required_ewos         text[] DEFAULT '{}',
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','submitted_for_review','approved',
                                            'approved_with_conditions','rejected','implementing','complete')),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);
ALTER TABLE atd_engineering_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atd_plan_select" ON atd_engineering_plans;
CREATE POLICY "atd_plan_select" ON atd_engineering_plans FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "atd_plan_insert" ON atd_engineering_plans;
CREATE POLICY "atd_plan_insert" ON atd_engineering_plans FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "atd_plan_update" ON atd_engineering_plans;
CREATE POLICY "atd_plan_update" ON atd_engineering_plans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "atd_plan_delete" ON atd_engineering_plans;
CREATE POLICY "atd_plan_delete" ON atd_engineering_plans FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS atd_capabilities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_key text NOT NULL UNIQUE,
  name           text NOT NULL,
  description    text,
  category       text NOT NULL
                   CHECK (category IN ('reasoning','analysis','planning','architecture',
                                       'implementation','review','validation','knowledge',
                                       'intelligence','guardian','documentation','reporting','roadmap')),
  version        text NOT NULL DEFAULT '1.0.0',
  provider_type  text NOT NULL DEFAULT 'internal'
                   CHECK (provider_type IN ('internal','reasoning_provider',
                                            'implementation_provider','review_provider',
                                            'validation_provider','documentation_provider',
                                            'knowledge_provider','guardian_provider','human')),
  is_active      boolean NOT NULL DEFAULT true,
  configuration  jsonb DEFAULT '{}'::jsonb,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
ALTER TABLE atd_capabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atd_cap_select" ON atd_capabilities;
CREATE POLICY "atd_cap_select" ON atd_capabilities FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "atd_cap_insert" ON atd_capabilities;
CREATE POLICY "atd_cap_insert" ON atd_capabilities FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "atd_cap_update" ON atd_capabilities;
CREATE POLICY "atd_cap_update" ON atd_capabilities FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "atd_cap_delete" ON atd_capabilities;
CREATE POLICY "atd_cap_delete" ON atd_capabilities FOR DELETE TO authenticated USING (true);

INSERT INTO atd_capabilities (capability_key, name, description, category, version, provider_type) VALUES
  ('intent_understanding',  'Intent Understanding',           'Captures and structures Product Owner intent into engineering objects', 'reasoning',      '1.0.0', 'reasoning_provider'),
  ('engineering_analysis',  'Engineering Analysis',           'Analyses constitution, standards, architecture, EIG, and product intelligence', 'analysis','1.0.0', 'reasoning_provider'),
  ('engineering_planning',  'Engineering Planning',           'Generates executive summaries, strategies, phases, and required EWOs', 'planning',       '1.0.0', 'reasoning_provider'),
  ('architecture_review',   'Architecture Review',            'Reviews architecture implications and constitutional alignment', 'architecture',   '1.0.0', 'review_provider'),
  ('implementation_coord',  'Implementation Coordination',    'Coordinates and tracks implementation requests without implementing directly', 'implementation','1.0.0', 'implementation_provider'),
  ('review_preparation',    'Review Preparation',             'Prepares engineering review packages for governance review', 'review',          '1.0.0', 'internal'),
  ('eng_validation',        'Engineering Validation',         'Coordinates engineering, QA, architecture, and constitutional validation', 'validation','1.0.0', 'validation_provider'),
  ('knowledge_extraction',  'Knowledge Extraction',           'Extracts reusable patterns, lessons, standards, and recommendations', 'knowledge',     '1.0.0', 'knowledge_provider'),
  ('intelligence_update',   'Engineering Intelligence Update','Updates EIG, roadmap, history, relationships, and recommendations', 'intelligence',  '1.0.0', 'internal'),
  ('guardian',              'Engineering Guardian',           'Validates engineering health, compliance, and architecture integrity', 'guardian',      '1.0.0', 'guardian_provider'),
  ('documentation',         'Documentation',                  'Generates and maintains engineering documentation artefacts', 'documentation', '1.0.0', 'documentation_provider'),
  ('reporting',             'Reporting',                      'Generates Engineering Completion Reports and executive briefings', 'reporting',     '1.0.0', 'internal'),
  ('roadmap_management',    'Roadmap Management',             'Updates and maintains the engineering roadmap from pipeline outcomes', 'roadmap',      '1.0.0', 'internal')
ON CONFLICT (capability_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS atd_capability_executions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_ref         text NOT NULL UNIQUE,
  capability_key        text REFERENCES atd_capabilities(capability_key),
  pipeline_execution_id uuid REFERENCES atd_pipeline_executions(id) ON DELETE CASCADE,
  intent_id             uuid REFERENCES atd_engineering_intents(id) ON DELETE CASCADE,
  input_payload         jsonb DEFAULT '{}'::jsonb,
  output_payload        jsonb DEFAULT '{}'::jsonb,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','running','complete','failed','skipped')),
  started_at            timestamptz,
  completed_at          timestamptz,
  duration_ms           integer,
  provider_used         text,
  error_message         text,
  created_at            timestamptz DEFAULT now()
);
ALTER TABLE atd_capability_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atd_capexec_select" ON atd_capability_executions;
CREATE POLICY "atd_capexec_select" ON atd_capability_executions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "atd_capexec_insert" ON atd_capability_executions;
CREATE POLICY "atd_capexec_insert" ON atd_capability_executions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "atd_capexec_update" ON atd_capability_executions;
CREATE POLICY "atd_capexec_update" ON atd_capability_executions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "atd_capexec_delete" ON atd_capability_executions;
CREATE POLICY "atd_capexec_delete" ON atd_capability_executions FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS atd_review_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_ref           text NOT NULL UNIQUE,
  plan_id               uuid REFERENCES atd_engineering_plans(id) ON DELETE CASCADE,
  intent_id             uuid REFERENCES atd_engineering_intents(id) ON DELETE CASCADE,
  pipeline_execution_id uuid REFERENCES atd_pipeline_executions(id),
  reviewer_type         text NOT NULL
                          CHECK (reviewer_type IN ('architecture','engineering','constitutional','qa','product')),
  review_package        jsonb DEFAULT '{}'::jsonb,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','in_review','approved','approved_with_conditions',
                                            'rejected','request_changes','cancelled')),
  submitted_at          timestamptz DEFAULT now(),
  responded_at          timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);
ALTER TABLE atd_review_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atd_revreq_select" ON atd_review_requests;
CREATE POLICY "atd_revreq_select" ON atd_review_requests FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "atd_revreq_insert" ON atd_review_requests;
CREATE POLICY "atd_revreq_insert" ON atd_review_requests FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "atd_revreq_update" ON atd_review_requests;
CREATE POLICY "atd_revreq_update" ON atd_review_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "atd_revreq_delete" ON atd_review_requests;
CREATE POLICY "atd_revreq_delete" ON atd_review_requests FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS atd_review_responses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_request_id uuid REFERENCES atd_review_requests(id) ON DELETE CASCADE,
  decision          text NOT NULL
                      CHECK (decision IN ('approved','approved_with_conditions','rejected','request_changes')),
  conditions        text,
  notes             text,
  responded_by      text,
  responded_at      timestamptz DEFAULT now(),
  created_at        timestamptz DEFAULT now()
);
ALTER TABLE atd_review_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atd_revresp_select" ON atd_review_responses;
CREATE POLICY "atd_revresp_select" ON atd_review_responses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "atd_revresp_insert" ON atd_review_responses;
CREATE POLICY "atd_revresp_insert" ON atd_review_responses FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "atd_revresp_update" ON atd_review_responses;
CREATE POLICY "atd_revresp_update" ON atd_review_responses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "atd_revresp_delete" ON atd_review_responses;
CREATE POLICY "atd_revresp_delete" ON atd_review_responses FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS atd_engineering_decisions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_ref          text NOT NULL UNIQUE,
  intent_id             uuid REFERENCES atd_engineering_intents(id) ON DELETE CASCADE,
  pipeline_execution_id uuid REFERENCES atd_pipeline_executions(id),
  stage                 text NOT NULL
                          CHECK (stage IN ('analysis','planning','review','implementation','validation','governance')),
  decision_type         text NOT NULL
                          CHECK (decision_type IN ('approve','reject','defer','escalate','request_changes','accept_risk')),
  rationale             text NOT NULL,
  made_by               text NOT NULL DEFAULT 'Product Owner',
  decided_at            timestamptz DEFAULT now(),
  related_ewo_ref       text,
  conditions            text,
  created_at            timestamptz DEFAULT now()
);
ALTER TABLE atd_engineering_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atd_dec_select" ON atd_engineering_decisions;
CREATE POLICY "atd_dec_select" ON atd_engineering_decisions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "atd_dec_insert" ON atd_engineering_decisions;
CREATE POLICY "atd_dec_insert" ON atd_engineering_decisions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "atd_dec_update" ON atd_engineering_decisions;
CREATE POLICY "atd_dec_update" ON atd_engineering_decisions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "atd_dec_delete" ON atd_engineering_decisions;
CREATE POLICY "atd_dec_delete" ON atd_engineering_decisions FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS atd_implementation_requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_ref            text NOT NULL UNIQUE,
  plan_id                uuid REFERENCES atd_engineering_plans(id) ON DELETE CASCADE,
  intent_id              uuid REFERENCES atd_engineering_intents(id) ON DELETE CASCADE,
  pipeline_execution_id  uuid REFERENCES atd_pipeline_executions(id),
  ewo_ref                text,
  capability_key         text,
  implementation_package jsonb DEFAULT '{}'::jsonb,
  status                 text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','in_progress','complete','failed','cancelled')),
  requested_at           timestamptz DEFAULT now(),
  completed_at           timestamptz,
  result_summary         text,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);
ALTER TABLE atd_implementation_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atd_impl_select" ON atd_implementation_requests;
CREATE POLICY "atd_impl_select" ON atd_implementation_requests FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "atd_impl_insert" ON atd_implementation_requests;
CREATE POLICY "atd_impl_insert" ON atd_implementation_requests FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "atd_impl_update" ON atd_implementation_requests;
CREATE POLICY "atd_impl_update" ON atd_implementation_requests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "atd_impl_delete" ON atd_implementation_requests;
CREATE POLICY "atd_impl_delete" ON atd_implementation_requests FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS atd_implementation_results (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  implementation_request_id uuid REFERENCES atd_implementation_requests(id) ON DELETE CASCADE,
  outcome                   text NOT NULL CHECK (outcome IN ('success','partial','failed')),
  artefacts_created         jsonb DEFAULT '[]'::jsonb,
  notes                     text,
  completed_at              timestamptz DEFAULT now(),
  created_at                timestamptz DEFAULT now()
);
ALTER TABLE atd_implementation_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atd_implres_select" ON atd_implementation_results;
CREATE POLICY "atd_implres_select" ON atd_implementation_results FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "atd_implres_insert" ON atd_implementation_results;
CREATE POLICY "atd_implres_insert" ON atd_implementation_results FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "atd_implres_update" ON atd_implementation_results;
CREATE POLICY "atd_implres_update" ON atd_implementation_results FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "atd_implres_delete" ON atd_implementation_results;
CREATE POLICY "atd_implres_delete" ON atd_implementation_results FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS atd_validation_results (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  validation_ref        text NOT NULL UNIQUE,
  intent_id             uuid REFERENCES atd_engineering_intents(id) ON DELETE CASCADE,
  pipeline_execution_id uuid REFERENCES atd_pipeline_executions(id),
  validation_type       text NOT NULL
                          CHECK (validation_type IN ('engineering','qa','architecture','constitutional')),
  outcome               text NOT NULL DEFAULT 'pending'
                          CHECK (outcome IN ('pending','passed','failed','partial','skipped')),
  findings              jsonb DEFAULT '[]'::jsonb,
  validated_by          text,
  validated_at          timestamptz,
  notes                 text,
  created_at            timestamptz DEFAULT now()
);
ALTER TABLE atd_validation_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atd_val_select" ON atd_validation_results;
CREATE POLICY "atd_val_select" ON atd_validation_results FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "atd_val_insert" ON atd_validation_results;
CREATE POLICY "atd_val_insert" ON atd_validation_results FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "atd_val_update" ON atd_validation_results;
CREATE POLICY "atd_val_update" ON atd_validation_results FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "atd_val_delete" ON atd_validation_results;
CREATE POLICY "atd_val_delete" ON atd_validation_results FOR DELETE TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS atd_knowledge_records (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_ref            text NOT NULL UNIQUE,
  intent_id             uuid REFERENCES atd_engineering_intents(id) ON DELETE SET NULL,
  pipeline_execution_id uuid REFERENCES atd_pipeline_executions(id),
  knowledge_type        text NOT NULL
                          CHECK (knowledge_type IN ('pattern','lesson','standard',
                                                    'architecture_improvement','recommendation')),
  title                 text NOT NULL,
  content               text NOT NULL,
  tags                  text[] DEFAULT '{}',
  relevance_score       integer DEFAULT 50 CHECK (relevance_score BETWEEN 0 AND 100),
  eig_entity_id         uuid,
  created_at            timestamptz DEFAULT now()
);
ALTER TABLE atd_knowledge_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "atd_knw_select" ON atd_knowledge_records;
CREATE POLICY "atd_knw_select" ON atd_knowledge_records FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "atd_knw_insert" ON atd_knowledge_records;
CREATE POLICY "atd_knw_insert" ON atd_knowledge_records FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "atd_knw_update" ON atd_knowledge_records;
CREATE POLICY "atd_knw_update" ON atd_knowledge_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "atd_knw_delete" ON atd_knowledge_records;
CREATE POLICY "atd_knw_delete" ON atd_knowledge_records FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_atd_intents_status   ON atd_engineering_intents(status);
CREATE INDEX IF NOT EXISTS idx_atd_pipeline_intent  ON atd_pipeline_executions(intent_id);
CREATE INDEX IF NOT EXISTS idx_atd_pipeline_status  ON atd_pipeline_executions(status);
CREATE INDEX IF NOT EXISTS idx_atd_pstate_pipeline  ON atd_pipeline_states(pipeline_execution_id);
CREATE INDEX IF NOT EXISTS idx_atd_analysis_intent  ON atd_engineering_analyses(intent_id);
CREATE INDEX IF NOT EXISTS idx_atd_plan_intent      ON atd_engineering_plans(intent_id);
CREATE INDEX IF NOT EXISTS idx_atd_capexec_cap      ON atd_capability_executions(capability_key);
CREATE INDEX IF NOT EXISTS idx_atd_capexec_pipeline ON atd_capability_executions(pipeline_execution_id);
CREATE INDEX IF NOT EXISTS idx_atd_revreq_intent    ON atd_review_requests(intent_id);
CREATE INDEX IF NOT EXISTS idx_atd_dec_intent       ON atd_engineering_decisions(intent_id);
CREATE INDEX IF NOT EXISTS idx_atd_impl_intent      ON atd_implementation_requests(intent_id);
CREATE INDEX IF NOT EXISTS idx_atd_val_intent       ON atd_validation_results(intent_id);
CREATE INDEX IF NOT EXISTS idx_atd_knw_type         ON atd_knowledge_records(knowledge_type);
