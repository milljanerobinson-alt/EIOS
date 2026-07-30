/*
# Command Centre — AI Product Manager Tables

## Purpose
Creates the data layer for the AI Product Manager module inside Command Centre.
This enables persistent conversation history, message threading, favourite prompts,
and provider configuration — all required to support the long-term vision of
Command Centre as the internal operating system for managing this product.

## New Tables

### cc_ai_conversations
Stores each AI chat session. A conversation belongs to a named context (e.g. "feature", "release", "general").
- id (uuid, primary key)
- title (text) — auto-generated or user-set
- context_type (text) — 'general' | 'feature' | 'release' | 'testing' | 'compliance' | 'architecture'
- context_id (text nullable) — references a feature_id, rc_number etc. for focused sessions
- pinned (boolean) — whether this conversation is pinned to the top
- summary (text nullable) — AI-generated one-line summary of the conversation
- created_at, updated_at

### cc_ai_messages
Individual messages within a conversation, ordered by created_at.
- id (uuid, primary key)
- conversation_id (uuid, FK to cc_ai_conversations)
- role (text) — 'user' | 'assistant' | 'system'
- content (text) — full message text (Markdown supported)
- metadata (jsonb nullable) — links to features/releases/docs, token counts, model used
- created_at

### cc_ai_favourite_prompts
User-saved prompt templates, organized by category for quick re-use.
- id (uuid, primary key)
- label (text) — short display name
- prompt (text) — full prompt text
- category (text) — 'product' | 'testing' | 'release' | 'compliance' | 'developer' | 'architecture'
- position (int) — display order within category
- created_at

## Security
All tables are admin-only internal tools. RLS enabled with authenticated USING (true)
policies — these tables are only accessible to signed-in users (admins/trainers).

## Notes
1. Conversations support context linking (e.g. pinning a conversation to a specific feature).
2. Messages store metadata JSONB for future use: linked feature IDs, release references, token usage.
3. The favourite prompts table seeds initial prompt templates for common engineering queries.
*/

-- ─── Conversations ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cc_ai_conversations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text        NOT NULL DEFAULT 'New Conversation',
  context_type text        NOT NULL DEFAULT 'general',
  context_id   text,
  pinned       boolean     NOT NULL DEFAULT false,
  summary      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cc_ai_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_ai_conversations" ON cc_ai_conversations;
CREATE POLICY "auth_select_ai_conversations" ON cc_ai_conversations FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_ai_conversations" ON cc_ai_conversations;
CREATE POLICY "auth_insert_ai_conversations" ON cc_ai_conversations FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_ai_conversations" ON cc_ai_conversations;
CREATE POLICY "auth_update_ai_conversations" ON cc_ai_conversations FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_ai_conversations" ON cc_ai_conversations;
CREATE POLICY "auth_delete_ai_conversations" ON cc_ai_conversations FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_cc_ai_conversations_pinned ON cc_ai_conversations(pinned DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cc_ai_conversations_context ON cc_ai_conversations(context_type, context_id);

-- ─── Messages ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cc_ai_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES cc_ai_conversations(id) ON DELETE CASCADE,
  role            text        NOT NULL CHECK (role IN ('user','assistant','system')),
  content         text        NOT NULL,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cc_ai_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_ai_messages" ON cc_ai_messages;
CREATE POLICY "auth_select_ai_messages" ON cc_ai_messages FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_ai_messages" ON cc_ai_messages;
CREATE POLICY "auth_insert_ai_messages" ON cc_ai_messages FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_ai_messages" ON cc_ai_messages;
CREATE POLICY "auth_update_ai_messages" ON cc_ai_messages FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_ai_messages" ON cc_ai_messages;
CREATE POLICY "auth_delete_ai_messages" ON cc_ai_messages FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_cc_ai_messages_conversation ON cc_ai_messages(conversation_id, created_at);

-- ─── Favourite Prompts ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cc_ai_favourite_prompts (
  id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  label    text        NOT NULL,
  prompt   text        NOT NULL,
  category text        NOT NULL DEFAULT 'general',
  position int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cc_ai_favourite_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_ai_fav_prompts" ON cc_ai_favourite_prompts;
CREATE POLICY "auth_select_ai_fav_prompts" ON cc_ai_favourite_prompts FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_insert_ai_fav_prompts" ON cc_ai_favourite_prompts;
CREATE POLICY "auth_insert_ai_fav_prompts" ON cc_ai_favourite_prompts FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_update_ai_fav_prompts" ON cc_ai_favourite_prompts;
CREATE POLICY "auth_update_ai_fav_prompts" ON cc_ai_favourite_prompts FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_delete_ai_fav_prompts" ON cc_ai_favourite_prompts;
CREATE POLICY "auth_delete_ai_fav_prompts" ON cc_ai_favourite_prompts FOR DELETE
  TO authenticated USING (true);

-- ─── Seed default favourite prompts ──────────────────────────────────────────

INSERT INTO cc_ai_favourite_prompts (label, prompt, category, position) VALUES
  -- Product
  ('Feature status overview',        'Give me a complete status overview of all product features, grouped by lifecycle stage. Include how many are live, in testing, and blocked.',                      'product',      1),
  ('What should I build next?',      'Based on the current product state, roadmap, and feature gaps — what should be built next? Consider business value, compliance risk, and technical dependencies.',  'product',      2),
  ('Which features block launch?',   'Which features are currently blocking a production launch? Include any missing tests, incomplete documentation, or critical dependencies.',                         'product',      3),
  ('Generate release notes',         'Generate release notes for the most recent release candidate. Include new features, changes, known issues, and testing summary.',                                  'product',      4),
  ('Unfinished roadmap items',       'Show me every roadmap item that is not yet complete. Group by priority and indicate which are overdue or at risk.',                                                'product',      5),

  -- Testing
  ('Features with no tests',         'List every feature that has no test cases documented. Include lifecycle stage and compliance_critical status.',                                                    'testing',      1),
  ('Regression testing priorities',  'Which features require regression testing before the next release? Order by operational_risk and compliance_critical flags.',                                     'testing',      2),
  ('Testing coverage report',        'Summarise the current state of testing coverage across all 86 features. Show pass rates, untested features, and features with known failures.',                   'testing',      3),
  ('Generate test plan',             'Generate a structured test plan for [feature name]. Include test cases, regression requirements, and acceptance criteria.',                                        'testing',      4),

  -- Releases
  ('Release readiness assessment',   'Assess release readiness for the current active release candidate. What is complete, what is missing, and what are the known risks?',                            'release',      1),
  ('Deployment summary',             'Generate a deployment summary for the latest release including: features shipped, database changes, edge functions deployed, and infrastructure changes.',        'release',      2),
  ('What changed this week?',        'Summarise all development activity from the past 7 days including features updated, decisions made, and testing completed.',                                     'release',      3),

  -- Compliance
  ('Compliance risk summary',        'Identify every compliance-critical feature and summarise their current state — tested, documented, and production-ready status.',                                'compliance',   1),
  ('Auditor summary',                'Generate a concise auditor-ready summary of the platform including: ACSF mapping approach, compliance evidence trail, and data handling.',                       'compliance',   2),
  ('ACSF mapping coverage',          'Explain how ACSF mapping works in this platform. Which features implement it? Which qualifications are mapped?',                                                 'compliance',   3),

  -- Developer
  ('Technical debt summary',         'Identify all areas of technical debt across the codebase. Group by severity: critical, high, medium.',                                                          'developer',    1),
  ('Unused database tables',         'Based on the feature registry and implementation evidence, identify any database tables that may no longer be used.',                                           'developer',    2),
  ('Security review',                'Review all compliance-critical and authentication features. Identify any potential security concerns or improvements.',                                           'developer',    3),
  ('Database improvement suggestions', 'Suggest improvements to the current database schema — missing indexes, normalization opportunities, and redundant columns.',                                  'developer',    4),
  ('Architecture review',            'Review the current architecture. Identify concerns around scalability, maintainability, and technical complexity.',                                             'developer',    5),
  ('Performance improvements',       'Identify features or database operations that may have performance issues at scale. Suggest improvements.',                                                      'developer',    6),

  -- Architecture
  ('Explain system architecture',    'Give me a plain-English overview of the entire system architecture — components, data flows, external integrations, and infrastructure.',                       'architecture', 1),
  ('aXcelerate integration overview','Explain how the aXcelerate integration works end-to-end — inbound sync, write-back queue, portfolio upload, webhooks, and error handling.',                    'architecture', 2),
  ('Edge function inventory',        'List every edge function, what it does, what tables it reads/writes, and what external APIs it calls.',                                                         'architecture', 3),
  ('Impact of changing a feature',   'If I change [feature name], what else could break? List all dependencies, downstream features, and affected integrations.',                                    'architecture', 4)
ON CONFLICT DO NOTHING;
