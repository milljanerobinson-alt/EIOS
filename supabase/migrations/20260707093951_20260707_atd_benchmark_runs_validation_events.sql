/*
# Add validation_events to atd_benchmark_runs

1. Modified Tables
   - `atd_benchmark_runs`: adds `validation_events` JSONB column (nullable, defaults to empty array)

2. Purpose
   Records informational governance events captured during the benchmark wizard capture flow.
   Events are advisory only and never alter the captured response or governance decisions.

   Each element is a ValidationEvent object:
     { type: string, timestamp: string (ISO), detail?: string }

   Known event types: prompt_detected, mismatch_detected, override_selected, clean_capture

3. Important Notes
   - Column is nullable; existing rows are unaffected (NULL treated as no events)
   - Immutability of ai_response is preserved — this column is audit metadata only
*/

ALTER TABLE atd_benchmark_runs
  ADD COLUMN IF NOT EXISTS validation_events JSONB DEFAULT '[]'::jsonb;
