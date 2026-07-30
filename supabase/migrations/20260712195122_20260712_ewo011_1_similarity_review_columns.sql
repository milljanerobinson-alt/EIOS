/*
# EWO-011.1: Engineering Idea Similarity Review — Schema Extension

## Purpose
Adds four columns to `engineering_idea` to record the outcome of the mandatory
Similarity Review step that now precedes every constitutional execution.

## Changes

### Table: engineering_idea (modified)
- `similarity_matches_count` (integer, default 0): number of similar objects found
  during the pre-execution similarity search across Ideas, Features, Work Orders,
  Records, Standards, Memory, and Constitutional Decisions.
- `similarity_decision` (text, nullable, enum-constrained): the user's decision after
  reviewing the similarity results. Values: continue_anyway | link_existing | merge | cancel.
- `similarity_top_match_ref` (text, nullable): the reference of the highest-scoring
  similar object found (e.g. IDEA-XXXXXXXX, EWO-011, REC-001).
- `similarity_top_match_score` (numeric(3,2), nullable): the similarity score of the
  top match, expressed as 0.00–1.00 (e.g. 0.87 = 87% similar).

## Security
No RLS changes required — existing policies on engineering_idea already cover these columns.

## Notes
- All columns are nullable / have defaults so existing rows are unaffected.
- similarity_decision is constrained to the four valid actions; null means the similarity
  step was not yet reached (e.g. rows created before EWO-011.1).
- The similarity_decision CHECK is applied as a constraint, not an enum type, for
  flexibility to add values later without a migration.
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_idea' AND column_name = 'similarity_matches_count'
  ) THEN
    ALTER TABLE engineering_idea ADD COLUMN similarity_matches_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_idea' AND column_name = 'similarity_decision'
  ) THEN
    ALTER TABLE engineering_idea ADD COLUMN similarity_decision text
      CHECK (similarity_decision IN ('continue_anyway','link_existing','merge','cancel'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_idea' AND column_name = 'similarity_top_match_ref'
  ) THEN
    ALTER TABLE engineering_idea ADD COLUMN similarity_top_match_ref text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_idea' AND column_name = 'similarity_top_match_score'
  ) THEN
    ALTER TABLE engineering_idea ADD COLUMN similarity_top_match_score numeric(3,2);
  END IF;
END $$;
