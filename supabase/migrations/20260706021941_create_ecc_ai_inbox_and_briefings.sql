/*
# Create ECC AI Inbox and Engineering Briefings tables

## Purpose
Enables the AI Technical Director to operate proactively — storing cached engineering
briefings and a persistent inbox of proactive engineering recommendations.

## New Tables

### ecc_ai_briefings
Caches AI-generated engineering briefings (2-hour TTL). Each briefing includes
a full engineering health analysis, contextual greeting, primary recommendation,
and next action.

Columns:
- id (uuid, PK)
- briefing_data (jsonb) — full structured briefing from AI
- health_data (jsonb) — computed health metrics (deterministic, not AI-generated)
- engineering_summary (jsonb) — current phase, release, progress stats
- generated_by (text) — user id who triggered generation
- expires_at (timestamptz) — 2 hours from creation; used for cache invalidation
- created_at (timestamptz)

### ecc_ai_inbox
Persistent inbox of proactive AI engineering recommendations. Append-only —
items are never deleted, only status-updated. This becomes the engineering
memory of the AI programme.

Columns:
- id (uuid, PK)
- type (text) — recommendation | warning | opportunity | blocker
- priority (text) — critical | high | medium | low
- title (text) — short actionable title
- description (text) — explanation
- impact (text) — what happens if ignored
- confidence (numeric 0-100) — AI confidence score
- estimated_effort (text) — "2 hours", "30 minutes", etc.
- reasoning (text) — AI reasoning for this item
- status (text) — pending | approved | dismissed | snoozed
- artefact_plan (jsonb) — ECC artefacts that will be created on approval
- conversation_id (uuid, FK cc_ai_conversations) — if item spawned a conversation
- briefing_id (uuid, FK ecc_ai_briefings) — source briefing
- actioned_at (timestamptz) — when status was last changed
- snoozed_until (timestamptz) — snooze expiry
- created_at (timestamptz)

## Security
- RLS enabled on both tables
- anon + authenticated full access (single-tenant, no sign-in requirement on ECC)
- ecc_ai_inbox: no DELETE policy (append-only audit log)
*/

-- ── ecc_ai_briefings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ecc_ai_briefings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_data       jsonb NOT NULL DEFAULT '{}',
  health_data         jsonb NOT NULL DEFAULT '{}',
  engineering_summary jsonb NOT NULL DEFAULT '{}',
  generated_by        text,
  expires_at          timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE ecc_ai_briefings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_briefings" ON ecc_ai_briefings;
CREATE POLICY "anon_select_briefings" ON ecc_ai_briefings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_briefings" ON ecc_ai_briefings;
CREATE POLICY "anon_insert_briefings" ON ecc_ai_briefings FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- ── ecc_ai_inbox ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ecc_ai_inbox (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type             text NOT NULL DEFAULT 'recommendation',
  priority         text NOT NULL DEFAULT 'medium',
  title            text NOT NULL,
  description      text,
  impact           text,
  confidence       numeric(5,2),
  estimated_effort text,
  reasoning        text,
  status           text NOT NULL DEFAULT 'pending',
  artefact_plan    jsonb,
  conversation_id  uuid REFERENCES cc_ai_conversations(id) ON DELETE SET NULL,
  briefing_id      uuid REFERENCES ecc_ai_briefings(id) ON DELETE SET NULL,
  actioned_at      timestamptz,
  snoozed_until    timestamptz,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE ecc_ai_inbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_inbox" ON ecc_ai_inbox;
CREATE POLICY "anon_select_inbox" ON ecc_ai_inbox FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_inbox" ON ecc_ai_inbox;
CREATE POLICY "anon_insert_inbox" ON ecc_ai_inbox FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_inbox" ON ecc_ai_inbox;
CREATE POLICY "anon_update_inbox" ON ecc_ai_inbox FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
