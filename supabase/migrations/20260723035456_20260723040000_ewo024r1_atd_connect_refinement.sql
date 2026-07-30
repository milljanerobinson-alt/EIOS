/*
# EWO-024R.1 — ATD Connect Refinement: Enhanced Audit, Capability Registry, and Health Schema

## Purpose
Extends the ATD Connect platform with conversational request audit fields,
capability registry version/lifecycle metadata, and structured health dimensions.

## Changes to atd_connect_inspection_log
Adds columns for conversational request tracking:
- original_request (text) — original natural-language request
- resolved_capability (text) — resolved capability ID
- resolved_operation (text) — resolved operation
- resolved_object_reference (text) — resolved object reference
- client_id (text) — client identifier
- session_id (text) — session identifier
- authentication_outcome (text) — auth result
- governance_outcome (text) — governance evaluation result
- pipeline_stages (jsonb) — which pipeline stages completed
- result_type (text) — success | governed_empty | unresolved | error
- confidence (real) — confidence score 0-1
- evidence_count (integer) — number of evidence references returned
- relationship_count (integer) — number of relationships returned
- request_source (text) — 'workspace' | 'conversational' | 'external'

## Changes to atd_connect_capabilities
Adds columns for version and lifecycle metadata:
- capability_version (text) — version of the capability
- introduced_by_ewo (text) — EWO that introduced this capability
- lifecycle_status (text) — active | deprecated | superseded
- deprecated (boolean) — whether deprecated
- superseded_by (text) — capability ID that supersedes this one
- replacement_capability (text) — replacement capability ID
- inspection_contract_version (text) — version of the inspection contract

## New Table: atd_connect_conversation_requests
Stores conversational inspection requests for audit and correlation.
- id (uuid, primary key)
- request_id (text, unique)
- requesting_persona (text)
- client_id (text)
- session_id (text)
- natural_language_request (text)
- resolved_capability (text)
- resolved_operation (text)
- resolved_object_reference (text)
- inspection_options (jsonb)
- authentication_context (jsonb)
- requested_at (timestamptz)
- completed_at (timestamptz)
- governed (boolean)
- interpretation (text)
- result_type (text)
- confidence (real)
- audit_reference (text)
- missing_information (jsonb)
- created_at (timestamptz)

## Security
- RLS maintained on all tables.
- New table has same policies as inspection log (SELECT/INSERT for authenticated).
- No secrets or sensitive auth data stored in audit logs.

## Notes
1. All new columns are nullable to maintain backward compatibility with
   existing rows from EWO-024.
2. request_source defaults to 'workspace' for existing UI-initiated inspections.
3. No data migration needed — new columns are nullable.
*/

-- ─── Enhance atd_connect_inspection_log ─────────────────────────────────────────

ALTER TABLE atd_connect_inspection_log
  ADD COLUMN IF NOT EXISTS original_request text,
  ADD COLUMN IF NOT EXISTS resolved_capability text,
  ADD COLUMN IF NOT EXISTS resolved_operation text,
  ADD COLUMN IF NOT EXISTS resolved_object_reference text,
  ADD COLUMN IF NOT EXISTS client_id text,
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS authentication_outcome text,
  ADD COLUMN IF NOT EXISTS governance_outcome text,
  ADD COLUMN IF NOT EXISTS pipeline_stages jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS result_type text DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS confidence real,
  ADD COLUMN IF NOT EXISTS evidence_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS relationship_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_source text DEFAULT 'workspace';

-- ─── Enhance atd_connect_capabilities ────────────────────────────────────────────

ALTER TABLE atd_connect_capabilities
  ADD COLUMN IF NOT EXISTS capability_version text,
  ADD COLUMN IF NOT EXISTS introduced_by_ewo text,
  ADD COLUMN IF NOT EXISTS lifecycle_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deprecated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS superseded_by text,
  ADD COLUMN IF NOT EXISTS replacement_capability text,
  ADD COLUMN IF NOT EXISTS inspection_contract_version text DEFAULT '1.0';

-- ─── New table: atd_connect_conversation_requests ───────────────────────────────

CREATE TABLE IF NOT EXISTS atd_connect_conversation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text UNIQUE NOT NULL,
  requesting_persona text NOT NULL,
  client_id text,
  session_id text,
  natural_language_request text NOT NULL,
  resolved_capability text,
  resolved_operation text,
  resolved_object_reference text,
  inspection_options jsonb NOT NULL DEFAULT '{}'::jsonb,
  authentication_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  governed boolean NOT NULL DEFAULT true,
  interpretation text,
  result_type text NOT NULL DEFAULT 'success',
  confidence real,
  audit_reference text,
  missing_information jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atd_conv_requests_request_id
  ON atd_connect_conversation_requests (request_id);
CREATE INDEX IF NOT EXISTS idx_atd_conv_requests_persona
  ON atd_connect_conversation_requests (requesting_persona);

ALTER TABLE atd_connect_conversation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atd_select_conv_requests" ON atd_connect_conversation_requests;
CREATE POLICY "atd_select_conv_requests" ON atd_connect_conversation_requests
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "atd_insert_conv_requests" ON atd_connect_conversation_requests;
CREATE POLICY "atd_insert_conv_requests" ON atd_connect_conversation_requests
  FOR INSERT TO authenticated WITH CHECK (true);
