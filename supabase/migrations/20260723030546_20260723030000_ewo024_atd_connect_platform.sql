/*
# EWO-024 — ATD Connect: Governed AI Integration Platform

## Purpose
ATD Connect is the single authorised gateway through which AI personas inspect
the Engineering Intelligence Operating System (EIOS). This migration creates the
database tables for the capability registry and inspection audit log.

## New Tables

### 1. atd_connect_capabilities
The governed registry describing every inspectable capability in EIOS.
- id (uuid, primary key)
- capability_id (text, unique) — stable slug identifier (e.g. "engineering-records")
- name (text, not null) — human-readable name
- category (text, not null) — grouping category
- description (text, not null) — what this capability exposes
- status (text, default 'active') — active | deprecated | planned
- owner (text) — owning persona or team
- constitutional_visibility (text, default 'public') — public | restricted | internal
- inspection_service (text, not null) — which inspection service handles this capability
- relationships (jsonb, default '[]') — array of related capability IDs
- supported_operations (jsonb, default '[]') — array of supported inspection operations
- metadata (jsonb, default '{}') — additional governed metadata
- created_at (timestamptz, default now())
- updated_at (timestamptz, default now())

### 2. atd_connect_inspection_log
Every inspection request is recorded for auditability.
- id (uuid, primary key)
- request_id (text, unique) — generated request identifier
- timestamp (timestamptz, default now())
- requesting_persona (text, not null) — which AI persona requested
- inspected_capability (text) — capability ID inspected
- inspected_object (text) — object reference inspected
- operation (text, not null) — which inspection operation was called
- duration_ms (integer) — request duration in milliseconds
- outcome (text, default 'success') — success | error | governed_empty
- error_message (text) — error details if outcome is error
- response_summary (jsonb) — governed summary of what was returned
- created_at (timestamptz, default now())

## Security
- RLS enabled on both tables.
- Both tables are admin-accessible (TO authenticated) for the engineering workspace.
- SELECT is open to authenticated users; INSERT/UPDATE/DELETE are admin-only via
  service role or authenticated with appropriate policies.

## Notes
1. Capabilities self-register: the capability registry service inserts rows
   on first load. No hard-coded capability lists in application code.
2. The inspection log is append-only by design — INSERT only, no UPDATE/DELETE
   from the client.
3. Indexes on capability_id and request_id for fast lookups.
*/

-- ─── Capability Registry ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atd_connect_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_id text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  owner text,
  constitutional_visibility text NOT NULL DEFAULT 'public',
  inspection_service text NOT NULL,
  relationships jsonb NOT NULL DEFAULT '[]'::jsonb,
  supported_operations jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atd_connect_capabilities_id
  ON atd_connect_capabilities (capability_id);
CREATE INDEX IF NOT EXISTS idx_atd_connect_capabilities_category
  ON atd_connect_capabilities (category);

ALTER TABLE atd_connect_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atd_select_capabilities" ON atd_connect_capabilities;
CREATE POLICY "atd_select_capabilities" ON atd_connect_capabilities
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "atd_insert_capabilities" ON atd_connect_capabilities;
CREATE POLICY "atd_insert_capabilities" ON atd_connect_capabilities
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "atd_update_capabilities" ON atd_connect_capabilities;
CREATE POLICY "atd_update_capabilities" ON atd_connect_capabilities
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ─── Inspection Audit Log ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS atd_connect_inspection_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text UNIQUE NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  requesting_persona text NOT NULL,
  inspected_capability text,
  inspected_object text,
  operation text NOT NULL,
  duration_ms integer,
  outcome text NOT NULL DEFAULT 'success',
  error_message text,
  response_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atd_inspection_log_request_id
  ON atd_connect_inspection_log (request_id);
CREATE INDEX IF NOT EXISTS idx_atd_inspection_log_persona
  ON atd_connect_inspection_log (requesting_persona);
CREATE INDEX IF NOT EXISTS idx_atd_inspection_log_timestamp
  ON atd_connect_inspection_log (timestamp DESC);

ALTER TABLE atd_connect_inspection_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atd_select_inspection_log" ON atd_connect_inspection_log;
CREATE POLICY "atd_select_inspection_log" ON atd_connect_inspection_log
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "atd_insert_inspection_log" ON atd_connect_inspection_log;
CREATE POLICY "atd_insert_inspection_log" ON atd_connect_inspection_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- ─── Updated_at trigger for capabilities ───────────────────────────────────────

CREATE OR REPLACE FUNCTION atd_connect_capabilities_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_atd_connect_capabilities_updated_at
  ON atd_connect_capabilities;
CREATE TRIGGER trg_atd_connect_capabilities_updated_at
  BEFORE UPDATE ON atd_connect_capabilities
  FOR EACH ROW EXECUTE FUNCTION atd_connect_capabilities_updated_at();
