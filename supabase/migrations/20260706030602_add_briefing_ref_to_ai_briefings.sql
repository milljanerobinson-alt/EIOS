/*
# Add Briefing Reference ID to ecc_ai_briefings

## Summary
Adds a permanent, human-readable reference ID to every engineering briefing.

## Changes
- Adds `briefing_ref` column (text, unique) to `ecc_ai_briefings` with format BRF-000001
- Creates a sequence `ecc_ai_briefing_seq` to generate sequential IDs
- Adds trigger to auto-populate `briefing_ref` on INSERT
- Backfills any existing rows

## Notes
- IDs are permanent and searchable (BRF-000001, BRF-000002, etc.)
- Sequence is never reset, ensuring IDs are unique across time
*/

CREATE SEQUENCE IF NOT EXISTS ecc_ai_briefing_seq START 1;

ALTER TABLE ecc_ai_briefings
  ADD COLUMN IF NOT EXISTS briefing_ref text UNIQUE;

CREATE OR REPLACE FUNCTION set_briefing_ref()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.briefing_ref IS NULL THEN
    NEW.briefing_ref := 'BRF-' || LPAD(nextval('ecc_ai_briefing_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_briefing_ref ON ecc_ai_briefings;
CREATE TRIGGER trigger_set_briefing_ref
  BEFORE INSERT ON ecc_ai_briefings
  FOR EACH ROW EXECUTE FUNCTION set_briefing_ref();

-- Backfill existing rows that have no briefing_ref
UPDATE ecc_ai_briefings
SET briefing_ref = 'BRF-' || LPAD(nextval('ecc_ai_briefing_seq')::text, 6, '0')
WHERE briefing_ref IS NULL;
