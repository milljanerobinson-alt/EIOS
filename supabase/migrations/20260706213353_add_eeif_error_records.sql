/*
# Engineering Error Intelligence Framework (EEIF) — Core Schema

## Summary
Creates the ecc_error_records table which is the central data store for the EEIF.
Every error captured across the platform (frontend runtime errors, unhandled promise
rejections, edge function failures, database errors, network errors) is persisted here
as a first-class engineering artefact.

## New Tables

### ecc_error_records
Primary error artefact table. Each row represents a unique error signature.

Columns:
- id: UUID primary key
- error_ref: Human-readable reference (ERR-001, ERR-002, ...)
- title: Short descriptive title derived from error message
- error_type: Classification — runtime | network | ui | edge_function | database | auth | validation | unknown
- severity: critical | high | medium | low
- status: open | investigating | resolved | ignored
- message: Raw error message
- stack_trace: Full stack trace text
- component_path: React component / file path where error originated
- page_url: Browser URL at time of error
- user_agent: Browser user-agent string
- browser_info: JSONB — browser, OS, viewport details
- request_context: JSONB — for edge function / network errors (url, method, headers subset)
- response_context: JSONB — response status, body snippet
- extra_context: JSONB — any additional structured context passed by the caller
- ai_root_cause: AI Technical Director root cause analysis (markdown)
- ai_explanation: Human-friendly plain-English explanation
- ai_recommended_fix: Step-by-step fix recommendation
- ai_impact_assessment: What is affected / what breaks
- ai_prevention: How to prevent recurrence
- ai_confidence: high | medium | low
- ai_analysed_at: Timestamp of last AI analysis
- is_duplicate: Whether this was detected as a duplicate
- duplicate_of_id: FK to the canonical error record (if duplicate)
- occurrence_count: How many times this exact error has been seen
- first_seen_at: First time this error occurred
- last_seen_at: Most recent occurrence
- resolved_at: When the error was resolved
- resolution_notes: Notes on how it was resolved
- tags: Array of searchable tags
- created_at / updated_at: Standard audit columns

## Security
- RLS enabled
- Policies for anon + authenticated (platform-internal tool, no per-user isolation needed)

## Notes
1. error_ref is auto-generated via a sequence trigger for human-readable references
2. occurrence_count is managed by the logError() frontend utility (upsert on conflict)
3. The analyze-error edge function populates all ai_* columns
*/

CREATE SEQUENCE IF NOT EXISTS ecc_error_ref_seq START 1;

CREATE TABLE IF NOT EXISTS ecc_error_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_ref           text UNIQUE NOT NULL DEFAULT ('ERR-' || lpad(nextval('ecc_error_ref_seq')::text, 4, '0')),
  title               text NOT NULL,
  error_type          text NOT NULL DEFAULT 'unknown',
  severity            text NOT NULL DEFAULT 'medium',
  status              text NOT NULL DEFAULT 'open',
  message             text NOT NULL DEFAULT '',
  stack_trace         text,
  component_path      text,
  page_url            text,
  user_agent          text,
  browser_info        jsonb,
  request_context     jsonb,
  response_context    jsonb,
  extra_context       jsonb,
  ai_root_cause       text,
  ai_explanation      text,
  ai_recommended_fix  text,
  ai_impact_assessment text,
  ai_prevention       text,
  ai_confidence       text,
  ai_analysed_at      timestamptz,
  is_duplicate        boolean NOT NULL DEFAULT false,
  duplicate_of_id     uuid REFERENCES ecc_error_records(id) ON DELETE SET NULL,
  occurrence_count    integer NOT NULL DEFAULT 1,
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz,
  resolution_notes    text,
  tags                text[] NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecc_error_records_status   ON ecc_error_records(status);
CREATE INDEX IF NOT EXISTS idx_ecc_error_records_severity ON ecc_error_records(severity);
CREATE INDEX IF NOT EXISTS idx_ecc_error_records_type     ON ecc_error_records(error_type);
CREATE INDEX IF NOT EXISTS idx_ecc_error_records_last_seen ON ecc_error_records(last_seen_at DESC);

ALTER TABLE ecc_error_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eeif_select" ON ecc_error_records;
CREATE POLICY "eeif_select" ON ecc_error_records FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "eeif_insert" ON ecc_error_records;
CREATE POLICY "eeif_insert" ON ecc_error_records FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "eeif_update" ON ecc_error_records;
CREATE POLICY "eeif_update" ON ecc_error_records FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "eeif_delete" ON ecc_error_records;
CREATE POLICY "eeif_delete" ON ecc_error_records FOR DELETE
  TO anon, authenticated USING (true);
