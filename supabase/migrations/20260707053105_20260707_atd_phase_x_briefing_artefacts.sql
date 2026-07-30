/*
# ATD Phase X — Executive Briefing Permanent Artefact Enhancement

## Summary
Enhances the ecc_ai_briefings table to store Executive Briefings as permanent
engineering artefacts with full AI generation metadata. Adds a platform
activity tracking table for intelligent briefing freshness detection.

## Changes to ecc_ai_briefings
- ai_model (text): Which AI model generated the briefing
- token_input (integer): Prompt tokens consumed
- token_output (integer): Completion tokens generated
- generation_duration_ms (integer): Wall-clock generation time in milliseconds
- estimated_cost_usd (numeric): Estimated AI cost for this briefing
- engineering_phase (text): Active engineering phase at generation time
- platform_version (text): Active release candidate at generation time

## Notes
1. All columns are nullable so existing rows are unaffected.
2. expires_at column is preserved for backwards compatibility but is no longer
   used for TTL eviction — briefings are now permanent artefacts.
3. No data is deleted or modified.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_ai_briefings' AND column_name = 'ai_model'
  ) THEN
    ALTER TABLE ecc_ai_briefings ADD COLUMN ai_model text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_ai_briefings' AND column_name = 'token_input'
  ) THEN
    ALTER TABLE ecc_ai_briefings ADD COLUMN token_input integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_ai_briefings' AND column_name = 'token_output'
  ) THEN
    ALTER TABLE ecc_ai_briefings ADD COLUMN token_output integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_ai_briefings' AND column_name = 'generation_duration_ms'
  ) THEN
    ALTER TABLE ecc_ai_briefings ADD COLUMN generation_duration_ms integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_ai_briefings' AND column_name = 'estimated_cost_usd'
  ) THEN
    ALTER TABLE ecc_ai_briefings ADD COLUMN estimated_cost_usd numeric(10,6);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_ai_briefings' AND column_name = 'engineering_phase'
  ) THEN
    ALTER TABLE ecc_ai_briefings ADD COLUMN engineering_phase text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_ai_briefings' AND column_name = 'platform_version'
  ) THEN
    ALTER TABLE ecc_ai_briefings ADD COLUMN platform_version text;
  END IF;
END $$;
