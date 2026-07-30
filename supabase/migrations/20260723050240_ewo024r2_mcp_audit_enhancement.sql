/*
# EWO-024R.2 — MCP Audit Enhancement

1. Purpose
   Adds MCP-specific audit columns to the ATD Connect inspection log to support
   MCP request tracking, tool name recording, and MCP protocol request ID correlation.

2. Modified Tables
   - `atd_connect_inspection_log`
     - `tool_name` (text, nullable) — MCP tool name invoked
     - `mcp_request_id` (text, nullable) — MCP protocol request ID for correlation
   - `atd_connect_inspection_log` check constraint updated to include new outcomes:
     - `governed_refusal` — write request refused
     - `unresolved` — NL request could not be resolved

3. Security
   - RLS already enabled on `atd_connect_inspection_log`
   - No policy changes needed — existing policies cover new columns
*/

ALTER TABLE atd_connect_inspection_log
  ADD COLUMN IF NOT EXISTS tool_name text,
  ADD COLUMN IF NOT EXISTS mcp_request_id text;

-- Update the outcome check constraint to include new outcome types
ALTER TABLE atd_connect_inspection_log DROP CONSTRAINT IF EXISTS atd_connect_inspection_log_outcome_check;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'atd_connect_inspection_log_outcome_check'
  ) THEN
    ALTER TABLE atd_connect_inspection_log
      ADD CONSTRAINT atd_connect_inspection_log_outcome_check
      CHECK (outcome = ANY (ARRAY['success', 'error', 'governed_empty', 'governed_refusal', 'unresolved']));
  END IF;
END $$;

-- Add request_source check constraint to ensure valid sources
ALTER TABLE atd_connect_inspection_log DROP CONSTRAINT IF EXISTS atd_connect_inspection_log_request_source_check;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'atd_connect_inspection_log_request_source_check'
  ) THEN
    ALTER TABLE atd_connect_inspection_log
      ADD CONSTRAINT atd_connect_inspection_log_request_source_check
      CHECK (request_source IS NULL OR request_source = ANY (ARRAY['workspace', 'conversational', 'external', 'mcp_self_test', 'mcp_client', 'chatgpt_confirmed']));
  END IF;
END $$;

-- Index for MCP request correlation
CREATE INDEX IF NOT EXISTS idx_atd_connect_inspection_log_mcp_request_id
  ON atd_connect_inspection_log(mcp_request_id)
  WHERE mcp_request_id IS NOT NULL;

-- Index for tool name queries
CREATE INDEX IF NOT EXISTS idx_atd_connect_inspection_log_tool_name
  ON atd_connect_inspection_log(tool_name)
  WHERE tool_name IS NOT NULL;
