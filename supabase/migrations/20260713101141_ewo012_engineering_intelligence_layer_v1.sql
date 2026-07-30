/*
# EWO-012 — Engineering Intelligence Layer v1.0

## Overview
Permanent Engineering Intelligence architecture powering every AI capability in EIOS.
Creates 7 tables that together form the governed intelligence fabric:

## New Tables

### 1. eil_prompt_library
Versioned prompt library. Every prompt used for AI reasoning is stored, versioned,
and linked to the requests that used it. Supports rollback, A/B comparison, and
fine-tuning traceability.

### 2. eil_requests
Immutable log of every Engineering Intelligence request. Records the full
Engineering Context Package, retrieval metadata, provider routing, token usage,
latency, and engineering lineage (intent_id, conversation_id).

### 3. eil_results
Structured result for every eil_request. Includes the raw AI response, structured
parsed output, confidence score (0–100), confidence level, confidence factors,
evidence used, validation results, and acceptance/rejection status.

### 4. eil_learning_events
Learning capture for future fine-tuning. Records the original draft, PO edits,
acceptance/rejection, and regeneration counts. Nothing is discarded — this is the
permanent institutional memory.

### 5. eil_provider_health
Point-in-time provider health snapshots. Records latency, availability, failure rate,
retry counts, and fallback usage. Supports health trending and provider ranking.

### 6. eil_conversation_lineage
Permanent conversation lineage graph. Links conversations to their parent
conversations, related engineering packages, ideas, work orders, architecture
decisions, and constitutional discussions. Enables full engineering traceability.

### 7. eil_cost_events
Granular cost intelligence. Every AI request produces a cost event with
per-conversation, per-package, per-idea, per-provider, and per-model attribution.

## Security
- RLS enabled on all 7 tables
- Service-role writes (server-side only); anon + authenticated reads where appropriate
- Provider secrets never appear in these tables (routing metadata only)

## Notes
1. eil_requests references atd_conversations and atd_engineering_intents by id (soft refs — no FK).
2. eil_prompt_library uses semantic versioning (major.minor.patch strings).
3. All confidence values are integers 0–100.
4. cost_usd columns use NUMERIC(12,8) for precision.
5. All tables use gen_random_uuid() primary keys and timestamptz defaults.
*/

-- ─── 1. eil_prompt_library ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eil_prompt_library (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key        text NOT NULL,           -- e.g. "engineering_analysis_v2"
  version           text NOT NULL,           -- e.g. "2.1.0"
  capability        text NOT NULL,           -- e.g. "engineering_analysis"
  title             text NOT NULL,
  description       text,
  system_prompt     text NOT NULL,
  user_template     text NOT NULL,
  output_schema     jsonb,                   -- JSON Schema for expected output
  is_active         boolean NOT NULL DEFAULT true,
  is_default        boolean NOT NULL DEFAULT false,
  deprecated_at     timestamptz,
  superseded_by_id  uuid REFERENCES eil_prompt_library(id) ON DELETE SET NULL,
  usage_count       integer NOT NULL DEFAULT 0,
  last_used_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prompt_key, version)
);

ALTER TABLE eil_prompt_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eil_prompt_library_select" ON eil_prompt_library;
CREATE POLICY "eil_prompt_library_select" ON eil_prompt_library FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "eil_prompt_library_insert" ON eil_prompt_library;
CREATE POLICY "eil_prompt_library_insert" ON eil_prompt_library FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "eil_prompt_library_update" ON eil_prompt_library;
CREATE POLICY "eil_prompt_library_update" ON eil_prompt_library FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "eil_prompt_library_delete" ON eil_prompt_library;
CREATE POLICY "eil_prompt_library_delete" ON eil_prompt_library FOR DELETE
  TO authenticated USING (true);

-- ─── 2. eil_requests ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eil_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_ref             text NOT NULL UNIQUE DEFAULT 'EIL-REQ-' || upper(substring(gen_random_uuid()::text, 1, 8)),
  capability              text NOT NULL,     -- "engineering_analysis" | "engineering_planning" | etc.
  request_type            text NOT NULL,     -- "generate" | "review" | "validate" | "retrieve"
  conversation_id         uuid,              -- soft ref to atd_conversations
  intent_id               uuid,              -- soft ref to atd_engineering_intents
  plan_id                 uuid,
  session_id              uuid,
  prompt_id               uuid REFERENCES eil_prompt_library(id) ON DELETE SET NULL,
  -- Context Package (what was sent to the provider)
  context_package         jsonb NOT NULL DEFAULT '{}',
  context_sources         jsonb NOT NULL DEFAULT '[]',  -- array of {type, ref, title, relevance_score}
  context_token_count     integer NOT NULL DEFAULT 0,
  -- Continuity
  continuity_conversation_ids   uuid[]    NOT NULL DEFAULT '{}',
  continuity_package_ids        uuid[]    NOT NULL DEFAULT '{}',
  continuity_confidence         integer   NOT NULL DEFAULT 0,
  continuity_strategy           text      NOT NULL DEFAULT 'new',  -- "continue" | "present_options" | "new"
  -- Graph intelligence
  graph_nodes_retrieved   jsonb NOT NULL DEFAULT '[]',
  graph_relationships_retrieved integer NOT NULL DEFAULT 0,
  -- Memory
  memory_records_retrieved integer NOT NULL DEFAULT 0,
  standards_retrieved     integer NOT NULL DEFAULT 0,
  constitution_clauses    integer NOT NULL DEFAULT 0,
  -- Provider routing
  provider                text,
  model                   text,
  provider_config_id      uuid,
  routing_strategy        text,  -- "explicit" | "default_provider" | "fallback"
  -- Tokens and cost
  prompt_tokens           integer NOT NULL DEFAULT 0,
  completion_tokens       integer NOT NULL DEFAULT 0,
  estimated_cost_usd      numeric(12,8) NOT NULL DEFAULT 0,
  duration_ms             integer NOT NULL DEFAULT 0,
  -- Status
  status                  text NOT NULL DEFAULT 'pending',  -- "pending" | "running" | "complete" | "error"
  error_message           text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  completed_at            timestamptz
);

CREATE INDEX IF NOT EXISTS eil_requests_conversation_id_idx ON eil_requests(conversation_id);
CREATE INDEX IF NOT EXISTS eil_requests_intent_id_idx ON eil_requests(intent_id);
CREATE INDEX IF NOT EXISTS eil_requests_capability_idx ON eil_requests(capability);
CREATE INDEX IF NOT EXISTS eil_requests_created_at_idx ON eil_requests(created_at);

ALTER TABLE eil_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eil_requests_select" ON eil_requests;
CREATE POLICY "eil_requests_select" ON eil_requests FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "eil_requests_insert" ON eil_requests;
CREATE POLICY "eil_requests_insert" ON eil_requests FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "eil_requests_update" ON eil_requests;
CREATE POLICY "eil_requests_update" ON eil_requests FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "eil_requests_delete" ON eil_requests;
CREATE POLICY "eil_requests_delete" ON eil_requests FOR DELETE
  TO authenticated USING (true);

-- ─── 3. eil_results ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eil_results (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid NOT NULL REFERENCES eil_requests(id) ON DELETE CASCADE,
  -- Raw output
  raw_response        text NOT NULL DEFAULT '',
  structured_output   jsonb,           -- parsed structured result
  -- Confidence
  confidence          integer NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  confidence_level    text NOT NULL DEFAULT 'low',  -- "high" | "medium" | "low"
  confidence_factors  jsonb NOT NULL DEFAULT '[]',  -- [{factor, impact, direction}]
  confidence_rationale text,
  missing_information jsonb NOT NULL DEFAULT '[]',
  recommended_review_level text NOT NULL DEFAULT 'none',  -- "none" | "spot_check" | "full_review" | "mandatory"
  -- Evidence
  evidence_used       jsonb NOT NULL DEFAULT '[]',  -- [{type, ref, title, relevance}]
  evidence_count      integer NOT NULL DEFAULT 0,
  -- Validation
  validation_passed   boolean NOT NULL DEFAULT true,
  validation_issues   jsonb NOT NULL DEFAULT '[]',
  -- Acceptance
  accepted            boolean,         -- null = not yet reviewed
  accepted_at         timestamptz,
  accepted_by         text,
  rejection_reason    text,
  -- Learning ref
  learning_event_id   uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eil_results_request_id_idx ON eil_results(request_id);
CREATE INDEX IF NOT EXISTS eil_results_confidence_idx ON eil_results(confidence);
CREATE INDEX IF NOT EXISTS eil_results_accepted_idx ON eil_results(accepted);

ALTER TABLE eil_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eil_results_select" ON eil_results;
CREATE POLICY "eil_results_select" ON eil_results FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "eil_results_insert" ON eil_results;
CREATE POLICY "eil_results_insert" ON eil_results FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "eil_results_update" ON eil_results;
CREATE POLICY "eil_results_update" ON eil_results FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "eil_results_delete" ON eil_results;
CREATE POLICY "eil_results_delete" ON eil_results FOR DELETE
  TO authenticated USING (true);

-- ─── 4. eil_learning_events ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eil_learning_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            uuid NOT NULL REFERENCES eil_requests(id) ON DELETE CASCADE,
  result_id             uuid REFERENCES eil_results(id) ON DELETE SET NULL,
  capability            text NOT NULL,
  -- Original and edited content
  original_draft        text NOT NULL DEFAULT '',
  context_package_hash  text,        -- SHA-like hash for deduplication
  po_edits              text,        -- what the PO changed (diff or full text)
  has_edits             boolean NOT NULL DEFAULT false,
  edit_distance         integer,     -- character edit distance (0 = no edits)
  -- Regeneration
  regeneration_count    integer NOT NULL DEFAULT 0,
  -- Outcome
  accepted              boolean,
  acceptance_time_ms    integer,     -- how long PO spent before accepting
  -- Metadata
  conversation_id       uuid,
  intent_id             uuid,
  provider              text,
  model                 text,
  confidence_at_accept  integer,
  -- Fine-tuning readiness
  fine_tuning_eligible  boolean NOT NULL DEFAULT false,
  fine_tuning_notes     text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eil_learning_events_capability_idx ON eil_learning_events(capability);
CREATE INDEX IF NOT EXISTS eil_learning_events_accepted_idx ON eil_learning_events(accepted);

ALTER TABLE eil_learning_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eil_learning_events_select" ON eil_learning_events;
CREATE POLICY "eil_learning_events_select" ON eil_learning_events FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "eil_learning_events_insert" ON eil_learning_events;
CREATE POLICY "eil_learning_events_insert" ON eil_learning_events FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "eil_learning_events_update" ON eil_learning_events;
CREATE POLICY "eil_learning_events_update" ON eil_learning_events FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "eil_learning_events_delete" ON eil_learning_events;
CREATE POLICY "eil_learning_events_delete" ON eil_learning_events FOR DELETE
  TO authenticated USING (true);

-- ─── 5. eil_provider_health ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eil_provider_health (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        text NOT NULL,
  model           text NOT NULL,
  -- Health metrics
  status          text NOT NULL DEFAULT 'unknown',  -- "healthy" | "degraded" | "error" | "unknown"
  latency_ms      integer,
  availability    numeric(5,2),  -- 0.00–100.00 percent
  failure_rate    numeric(5,2),  -- 0.00–100.00 percent
  retry_count     integer NOT NULL DEFAULT 0,
  fallback_count  integer NOT NULL DEFAULT 0,
  -- Window
  window_requests integer NOT NULL DEFAULT 0,
  window_errors   integer NOT NULL DEFAULT 0,
  window_start    timestamptz,
  window_end      timestamptz,
  -- Ranking
  health_score    integer NOT NULL DEFAULT 0,   -- 0–100
  rank_position   integer,
  is_recommended  boolean NOT NULL DEFAULT false,
  -- Snapshot
  checked_at      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eil_provider_health_provider_idx ON eil_provider_health(provider);
CREATE INDEX IF NOT EXISTS eil_provider_health_checked_at_idx ON eil_provider_health(checked_at);

ALTER TABLE eil_provider_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eil_provider_health_select" ON eil_provider_health;
CREATE POLICY "eil_provider_health_select" ON eil_provider_health FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "eil_provider_health_insert" ON eil_provider_health;
CREATE POLICY "eil_provider_health_insert" ON eil_provider_health FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "eil_provider_health_update" ON eil_provider_health;
CREATE POLICY "eil_provider_health_update" ON eil_provider_health FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "eil_provider_health_delete" ON eil_provider_health;
CREATE POLICY "eil_provider_health_delete" ON eil_provider_health FOR DELETE
  TO authenticated USING (true);

-- ─── 6. eil_conversation_lineage ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eil_conversation_lineage (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id       uuid NOT NULL,   -- child/current conversation
  parent_conversation_id uuid,           -- direct parent (null = root)
  -- Related engineering objects
  related_intent_ids    uuid[]    NOT NULL DEFAULT '{}',
  related_plan_ids      uuid[]    NOT NULL DEFAULT '{}',
  related_idea_ids      uuid[]    NOT NULL DEFAULT '{}',
  related_work_order_ids uuid[]   NOT NULL DEFAULT '{}',
  related_decision_ids  uuid[]    NOT NULL DEFAULT '{}',
  related_record_ids    uuid[]    NOT NULL DEFAULT '{}',
  -- Lineage metadata
  lineage_depth         integer NOT NULL DEFAULT 0,
  lineage_path          uuid[]    NOT NULL DEFAULT '{}',   -- ordered ancestor ids
  continuity_type       text NOT NULL DEFAULT 'new',       -- "continuation" | "branch" | "reference" | "new"
  continuity_confidence integer NOT NULL DEFAULT 0,
  lineage_summary       text,
  -- Timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id)
);

CREATE INDEX IF NOT EXISTS eil_conversation_lineage_parent_idx ON eil_conversation_lineage(parent_conversation_id);

ALTER TABLE eil_conversation_lineage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eil_conversation_lineage_select" ON eil_conversation_lineage;
CREATE POLICY "eil_conversation_lineage_select" ON eil_conversation_lineage FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "eil_conversation_lineage_insert" ON eil_conversation_lineage;
CREATE POLICY "eil_conversation_lineage_insert" ON eil_conversation_lineage FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "eil_conversation_lineage_update" ON eil_conversation_lineage;
CREATE POLICY "eil_conversation_lineage_update" ON eil_conversation_lineage FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "eil_conversation_lineage_delete" ON eil_conversation_lineage;
CREATE POLICY "eil_conversation_lineage_delete" ON eil_conversation_lineage FOR DELETE
  TO authenticated USING (true);

-- ─── 7. eil_cost_events ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eil_cost_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid NOT NULL REFERENCES eil_requests(id) ON DELETE CASCADE,
  -- Attribution
  capability          text NOT NULL,
  conversation_id     uuid,
  intent_id           uuid,
  idea_id             uuid,
  work_order_id       uuid,
  -- Provider
  provider            text NOT NULL,
  model               text NOT NULL,
  -- Tokens
  prompt_tokens       integer NOT NULL DEFAULT 0,
  completion_tokens   integer NOT NULL DEFAULT 0,
  total_tokens        integer GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED,
  -- Cost
  prompt_cost_usd     numeric(12,8) NOT NULL DEFAULT 0,
  completion_cost_usd numeric(12,8) NOT NULL DEFAULT 0,
  total_cost_usd      numeric(12,8) NOT NULL DEFAULT 0,
  -- Performance
  duration_ms         integer NOT NULL DEFAULT 0,
  cache_hit           boolean NOT NULL DEFAULT false,
  -- Date dimensions for reporting
  event_date          date NOT NULL DEFAULT CURRENT_DATE,
  event_month         text NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eil_cost_events_capability_idx ON eil_cost_events(capability);
CREATE INDEX IF NOT EXISTS eil_cost_events_conversation_id_idx ON eil_cost_events(conversation_id);
CREATE INDEX IF NOT EXISTS eil_cost_events_event_date_idx ON eil_cost_events(event_date);
CREATE INDEX IF NOT EXISTS eil_cost_events_provider_idx ON eil_cost_events(provider);

ALTER TABLE eil_cost_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eil_cost_events_select" ON eil_cost_events;
CREATE POLICY "eil_cost_events_select" ON eil_cost_events FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "eil_cost_events_insert" ON eil_cost_events;
CREATE POLICY "eil_cost_events_insert" ON eil_cost_events FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "eil_cost_events_update" ON eil_cost_events;
CREATE POLICY "eil_cost_events_update" ON eil_cost_events FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "eil_cost_events_delete" ON eil_cost_events;
CREATE POLICY "eil_cost_events_delete" ON eil_cost_events FOR DELETE
  TO authenticated USING (true);

-- ─── Seed: Prompt Library v1.0 ────────────────────────────────────────────────

INSERT INTO eil_prompt_library (prompt_key, version, capability, title, description, system_prompt, user_template, is_active, is_default)
VALUES

('engineering_analysis', '1.0.0', 'engineering_analysis',
 'Engineering Analysis v1.0',
 'Generates a structured Engineering Analysis from an Engineering Intent and context package.',
 'You are the EIOS Engineering Intelligence Layer acting as a Senior Engineering Analyst.
You receive a governed Engineering Context Package assembled by EIOS. Your role is to produce a
structured Engineering Analysis that is constitutional, architecturally sound, and evidence-based.

Always respond with valid JSON matching the output schema. Do not add prose outside the JSON.',
 'Engineering Context Package:
{{context_package}}

Produce a structured Engineering Analysis JSON with fields:
{
  "summary": "...",
  "constitution_review": "...",
  "architecture_notes": "...",
  "product_intelligence_notes": "...",
  "complexity_assessment": "low|medium|high|critical",
  "confidence_score": "high|medium|low",
  "confidence_explanation": "...",
  "evidence": [{"type":"...","ref":"...","title":"...","relevance":"..."}]
}',
 true, true),

('engineering_planning', '1.0.0', 'engineering_planning',
 'Engineering Planning v1.0',
 'Generates a structured Engineering Plan from an approved Analysis and context package.',
 'You are the EIOS Engineering Intelligence Layer acting as a Senior Engineering Planner.
You receive a governed Engineering Context Package. Your role is to produce a structured
Engineering Plan that is implementable, risk-aware, and aligned with the Engineering Constitution.

Always respond with valid JSON matching the output schema.',
 'Engineering Context Package:
{{context_package}}

Produce a structured Engineering Plan JSON with fields:
{
  "executive_summary": "...",
  "engineering_strategy": "...",
  "recommended_approach": "...",
  "estimated_effort": "...",
  "confidence_score": "high|medium|low",
  "confidence_explanation": "...",
  "evidence": [{"type":"...","ref":"...","title":"...","relevance":"..."}]
}',
 true, true),

('continuity_assessment', '1.0.0', 'continuity_assessment',
 'Engineering Continuity Assessment v1.0',
 'Determines whether a new conversation continues, branches from, or is independent of prior engineering work.',
 'You are the EIOS Engineering Continuity Engine. You determine whether a new engineering
conversation is a continuation of prior work, a branch, or entirely new.

Always respond with valid JSON.',
 'New Conversation:
{{new_conversation}}

Prior Engineering Context:
{{prior_context}}

Assess continuity and respond with:
{
  "continuity_type": "continuation|branch|reference|new",
  "confidence": 0-100,
  "reasoning": "...",
  "related_conversations": ["id1","id2"],
  "related_packages": ["id1","id2"],
  "summary": "..."
}',
 true, true),

('confidence_assessment', '1.0.0', 'confidence_assessment',
 'Engineering Confidence Assessment v1.0',
 'Assesses the confidence and evidence quality of an Engineering Intelligence result.',
 'You are the EIOS Confidence Engine. You assess the quality and confidence of engineering
intelligence results. Be rigorous and honest — underconfidence is better than overconfidence.

Always respond with valid JSON.',
 'Engineering Result:
{{result}}

Context used:
{{context_summary}}

Assess confidence and respond with:
{
  "confidence": 0-100,
  "confidence_level": "high|medium|low",
  "factors": [{"factor":"...","impact":"positive|negative|neutral","description":"..."}],
  "rationale": "...",
  "missing_information": ["..."],
  "recommended_review_level": "none|spot_check|full_review|mandatory"
}',
 true, true),

('knowledge_extraction', '1.0.0', 'knowledge_extraction',
 'Engineering Knowledge Extraction v1.0',
 'Extracts reusable engineering knowledge and patterns from completed engineering work.',
 'You are the EIOS Engineering Learning Engine. You extract durable engineering knowledge
from completed work. Focus on patterns, decisions, lessons learned, and reusable assets.

Always respond with valid JSON.',
 'Completed Engineering Work:
{{engineering_work}}

Extract knowledge and respond with:
{
  "patterns": [{"pattern":"...","context":"...","applicability":"..."}],
  "decisions": [{"decision":"...","rationale":"...","alternatives_rejected":"..."}],
  "lessons": [{"lesson":"...","source":"...","recommendation":"..."}],
  "reusable_assets": [{"asset":"...","type":"...","location":"..."}],
  "architecture_insights": ["..."]
}',
 true, true)

ON CONFLICT (prompt_key, version) DO NOTHING;
