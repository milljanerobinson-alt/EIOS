/*
# Phase 15.5 — AI Technical Director Benchmark Capture (ATD-BC)

## Summary
Creates the permanent Benchmark Capture capability for measuring the evolution of the
AI Technical Director over time. All benchmark runs are immutable governance artefacts
with full platform version traceability.

## New Tables

1. `atd_benchmark_definitions` — Permanent Benchmark Library
   - benchmark_id (ATD-BMK-001), benchmark_name, category, purpose
   - benchmark_prompt (reusable), evaluation_criteria (jsonb)
   - is_active, version, sort_order

2. `atd_benchmark_sessions` — Benchmark Sessions grouping multiple runs
   - session_ref (EIB-001), session_name, notes
   - platform_state_id FK, pis_snapshot_id FK, context_package_id FK
   - benchmark_version, atd_version, ecc_version
   - overall_review_status (awaiting_review/under_review/reviewed/accepted)
   - is_baseline, comparison_session_id (self-ref), improvement_notes, reviewer_notes
   - benchmarks_count

3. `atd_benchmark_runs` — Individual Immutable Benchmark Runs
   - run_ref (ATMR-0001), session_id FK, benchmark_definition_id FK
   - execution_timestamp, benchmark_version
   - platform_state_id FK, pis_snapshot_id FK, context_package_id FK
   - benchmark_prompt (snapshot at execution), ai_response (immutable)
   - response_length, model_used, provider_used, execution_notes
   - review_status, reviewer_notes
   - is_locked (always true — immutable)

## Sequences
- `atd_session_seq` — EIB-001 session references
- `atd_run_seq` — ATMR-0001 run references

## Seed Data
- ATD-BMK-001: Strategic Engineering Investment Review
- ATD-BMK-002: Platform Architecture Review
- ATD-BMK-003: Engineering Roadmap Prioritisation

## Security
- RLS enabled on all tables
- `TO anon, authenticated USING (true)` — internal governance tool
- No UPDATE policy on ai_response or benchmark_prompt fields (enforced by application layer)
*/

-- ─── Sequences ────────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS atd_session_seq START 1;
CREATE SEQUENCE IF NOT EXISTS atd_run_seq START 1;

-- ─── atd_benchmark_definitions ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atd_benchmark_definitions (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_id        text    UNIQUE NOT NULL,
  benchmark_name      text    NOT NULL,
  category            text    NOT NULL DEFAULT 'general',
  purpose             text    NOT NULL,
  benchmark_prompt    text    NOT NULL,
  evaluation_criteria jsonb   NOT NULL DEFAULT '[]'::jsonb,
  is_active           boolean NOT NULL DEFAULT true,
  version             text    NOT NULL DEFAULT '1.0',
  sort_order          int     NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE atd_benchmark_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_atd_defn" ON atd_benchmark_definitions;
CREATE POLICY "anon_select_atd_defn" ON atd_benchmark_definitions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_atd_defn" ON atd_benchmark_definitions;
CREATE POLICY "anon_insert_atd_defn" ON atd_benchmark_definitions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_atd_defn" ON atd_benchmark_definitions;
CREATE POLICY "anon_update_atd_defn" ON atd_benchmark_definitions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_atd_defn" ON atd_benchmark_definitions;
CREATE POLICY "anon_delete_atd_defn" ON atd_benchmark_definitions FOR DELETE TO anon, authenticated USING (true);

-- ─── atd_benchmark_sessions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atd_benchmark_sessions (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  session_ref           text    UNIQUE NOT NULL DEFAULT 'EIB-' || lpad(nextval('atd_session_seq')::text, 3, '0'),
  session_name          text    NOT NULL,
  notes                 text,
  platform_state_id     uuid    REFERENCES eip_platform_states(id) ON DELETE SET NULL,
  pis_snapshot_id       uuid    REFERENCES pis_snapshots(id) ON DELETE SET NULL,
  context_package_id    uuid    REFERENCES eip_context_packages(id) ON DELETE SET NULL,
  benchmark_version     text    NOT NULL DEFAULT '1.0',
  atd_version           text,
  ecc_version           text,
  overall_review_status text    NOT NULL DEFAULT 'awaiting_review',
  is_baseline           boolean NOT NULL DEFAULT false,
  comparison_session_id uuid    REFERENCES atd_benchmark_sessions(id) ON DELETE SET NULL,
  improvement_notes     text,
  reviewer_notes        text,
  benchmarks_count      int     NOT NULL DEFAULT 0,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atd_sessions_status ON atd_benchmark_sessions(overall_review_status);
CREATE INDEX IF NOT EXISTS idx_atd_sessions_baseline ON atd_benchmark_sessions(is_baseline);

ALTER TABLE atd_benchmark_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_atd_sessions" ON atd_benchmark_sessions;
CREATE POLICY "anon_select_atd_sessions" ON atd_benchmark_sessions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_atd_sessions" ON atd_benchmark_sessions;
CREATE POLICY "anon_insert_atd_sessions" ON atd_benchmark_sessions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_atd_sessions" ON atd_benchmark_sessions;
CREATE POLICY "anon_update_atd_sessions" ON atd_benchmark_sessions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_atd_sessions" ON atd_benchmark_sessions;
CREATE POLICY "anon_delete_atd_sessions" ON atd_benchmark_sessions FOR DELETE TO anon, authenticated USING (true);

-- ─── atd_benchmark_runs ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atd_benchmark_runs (
  id                     uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  run_ref                text    UNIQUE NOT NULL DEFAULT 'ATMR-' || lpad(nextval('atd_run_seq')::text, 4, '0'),
  session_id             uuid    NOT NULL REFERENCES atd_benchmark_sessions(id) ON DELETE CASCADE,
  benchmark_definition_id uuid   NOT NULL REFERENCES atd_benchmark_definitions(id) ON DELETE RESTRICT,
  benchmark_version      text    NOT NULL DEFAULT '1.0',
  execution_timestamp    timestamptz NOT NULL DEFAULT now(),
  platform_state_id      uuid    REFERENCES eip_platform_states(id) ON DELETE SET NULL,
  pis_snapshot_id        uuid    REFERENCES pis_snapshots(id) ON DELETE SET NULL,
  context_package_id     uuid    REFERENCES eip_context_packages(id) ON DELETE SET NULL,
  benchmark_prompt       text    NOT NULL,
  ai_response            text    NOT NULL,
  response_length        int     GENERATED ALWAYS AS (length(ai_response)) STORED,
  model_used             text,
  provider_used          text,
  execution_notes        text,
  review_status          text    NOT NULL DEFAULT 'awaiting_review',
  reviewer_notes         text,
  is_locked              boolean NOT NULL DEFAULT true,
  created_at             timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atd_runs_session ON atd_benchmark_runs(session_id);
CREATE INDEX IF NOT EXISTS idx_atd_runs_definition ON atd_benchmark_runs(benchmark_definition_id);
CREATE INDEX IF NOT EXISTS idx_atd_runs_review_status ON atd_benchmark_runs(review_status);

ALTER TABLE atd_benchmark_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_atd_runs" ON atd_benchmark_runs;
CREATE POLICY "anon_select_atd_runs" ON atd_benchmark_runs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_atd_runs" ON atd_benchmark_runs;
CREATE POLICY "anon_insert_atd_runs" ON atd_benchmark_runs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_atd_runs_review" ON atd_benchmark_runs;
CREATE POLICY "anon_update_atd_runs_review" ON atd_benchmark_runs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ─── Seed: Benchmark Definitions ─────────────────────────────────────────────

INSERT INTO atd_benchmark_definitions (benchmark_id, benchmark_name, category, purpose, benchmark_prompt, evaluation_criteria, version, sort_order)
VALUES

('ATD-BMK-001',
 'Strategic Engineering Investment Review',
 'strategic_reasoning',
 'Assess strategic reasoning, commercial awareness and investment prioritisation.',
 'You are the AI Technical Director for the LLN+D Engineering Command Centre.

Conduct a comprehensive Strategic Engineering Investment Review for the current platform release cycle.

Your review must address:

1. Strategic Alignment — How well does the current engineering investment align with the commercial objectives of the LLN+D platform? Reference specific features, releases and goals.

2. Feature Investment Prioritisation — Based on current platform state, which engineering investments should be prioritised in the next 30–60 days and why? Justify each priority with reference to commercial value and launch readiness.

3. Commercial Readiness Assessment — What is your assessment of the platform''s readiness for commercial launch? What are the highest-priority commercial blockers and what would it take to resolve them?

4. Technical Debt Risk — Identify any technical debt that poses a risk to commercial launch or platform stability. Quantify the risk where possible.

5. Resource Investment Recommendation — Where should the engineering team focus its investment to maximise commercial launch probability? Provide a prioritised recommendation with rationale.

Draw on your full understanding of the platform''s features, release candidates, architectural decisions, engineering reviews, and platform audits. Your response must be traceable to specific platform artefacts.',
 '[
   {"criterion": "Strategic Alignment", "description": "Response references specific commercial objectives and maps engineering investment to business outcomes"},
   {"criterion": "Evidence Usage", "description": "Response cites specific features, releases, audits or engineering artefacts"},
   {"criterion": "Prioritisation Quality", "description": "Priorities are clearly ranked with commercial justification"},
   {"criterion": "Commercial Awareness", "description": "Response demonstrates understanding of the RTO market and LLN+D commercial context"},
   {"criterion": "Actionability", "description": "Recommendations are specific, actionable and time-bound"}
 ]'::jsonb,
 '1.0', 1),

('ATD-BMK-002',
 'Platform Architecture Review',
 'architecture',
 'Assess architectural understanding, scalability reasoning, technical debt awareness and engineering judgement.',
 'You are the AI Technical Director for the LLN+D Engineering Command Centre.

Conduct a comprehensive Platform Architecture Review of the current system.

Your review must address:

1. Architectural Strengths — What are the most significant architectural strengths of the current LLN+D platform? Reference specific design patterns, decisions, and their benefits.

2. Architectural Risks — What architectural decisions present the greatest risk to the platform''s long-term scalability, maintainability, or reliability? For each risk, assess severity and likelihood.

3. Technical Debt Assessment — Identify the most significant areas of technical debt and their potential impact on the engineering roadmap and commercial launch timeline.

4. Scalability Analysis — How well does the current architecture support anticipated growth in candidate volumes, RTO customers, and assessment complexity? What are the current scaling constraints?

5. Engineering Standards Compliance — How well does the current implementation align with the established engineering standards? Identify any compliance gaps and their significance.

6. Architectural Recommendations — What are your top three architectural recommendations for the next engineering phase? For each recommendation, explain the rationale, expected benefit, and implementation approach.

Reference specific components, architectural decisions, and design patterns in your response.',
 '[
   {"criterion": "Architectural Depth", "description": "Response demonstrates genuine understanding of the platform architecture, not generic observations"},
   {"criterion": "Risk Assessment Quality", "description": "Risks are specific, prioritised and connected to real platform constraints"},
   {"criterion": "Technical Debt Identification", "description": "Technical debt is identified with specific components, not vague generalities"},
   {"criterion": "Scalability Reasoning", "description": "Scalability analysis addresses real architectural boundaries, not hypothetical limits"},
   {"criterion": "Recommendation Quality", "description": "Recommendations are specific, feasible and prioritised by impact"}
 ]'::jsonb,
 '1.0', 2),

('ATD-BMK-003',
 'Engineering Roadmap Prioritisation',
 'roadmap_planning',
 'Assess roadmap understanding, dependency reasoning and long-term engineering planning.',
 'You are the AI Technical Director for the LLN+D Engineering Command Centre.

Conduct an Engineering Roadmap Prioritisation review for the next engineering cycle.

Your review must address:

1. Current Roadmap Assessment — What is your assessment of the current engineering roadmap against commercial launch requirements? Which commitments are at risk and why?

2. Critical Path Analysis — What is the critical path to commercial launch? Identify which features or capabilities are on the critical path and which are not.

3. Dependency Analysis — What are the most significant engineering dependencies that could delay delivery? Which dependencies require immediate attention?

4. Deferral Recommendations — Which planned features could be safely deferred without impacting commercial launch or core customer value? Provide a prioritised deferral list with rationale.

5. Acceleration Opportunities — Where could engineering effort be concentrated to accelerate delivery of the highest-value capabilities? Identify specific acceleration opportunities.

6. Risk-Adjusted Sequencing — Provide a risk-adjusted recommended sequencing for the next 3 engineering phases. For each phase, identify the primary objective, key deliverables, and primary risks.

Your roadmap recommendations must reference existing epics, phases, and features within the Engineering Command Centre.',
 '[
   {"criterion": "Roadmap Comprehension", "description": "Response demonstrates genuine understanding of the roadmap state, not a generic template"},
   {"criterion": "Critical Path Accuracy", "description": "Critical path analysis correctly identifies dependencies and bottlenecks"},
   {"criterion": "Deferral Quality", "description": "Deferral recommendations preserve commercial value while reducing scope risk"},
   {"criterion": "Sequencing Logic", "description": "Phase sequencing is logical, dependency-aware and commercially grounded"},
   {"criterion": "Planning Maturity", "description": "Response shows long-term planning maturity — not just short-term tactical thinking"}
 ]'::jsonb,
 '1.0', 3)

ON CONFLICT (benchmark_id) DO UPDATE SET
  benchmark_name      = EXCLUDED.benchmark_name,
  purpose             = EXCLUDED.purpose,
  benchmark_prompt    = EXCLUDED.benchmark_prompt,
  evaluation_criteria = EXCLUDED.evaluation_criteria,
  updated_at          = now();
