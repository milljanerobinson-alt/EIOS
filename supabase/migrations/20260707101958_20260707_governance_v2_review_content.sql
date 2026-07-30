/*
# Governance v2.1 — Single Authoritative Engineering Review Document

## Summary
Adds a single rich markdown Engineering Review document field to atd_benchmark_reviews.
This replaces the need to treat multiple separate text fields as the primary review content.
The existing discrete fields remain for backwards compatibility but the authoritative review
is now the `review_content` markdown document.

Also adds `review_title` so the review can be named distinctly from the session.

## Modified Tables

### atd_benchmark_reviews
- `review_content` (TEXT): The full authoritative Engineering Review as a rich markdown document.
  This is the primary review artefact. It is locked when is_locked = true.
- `review_title` (TEXT): Optional title for the review document (defaults to session name if not set).

## Security
- RLS remains enabled. Existing policies cover new columns automatically.

## Notes
1. Backwards compatible — all existing review records remain valid.
2. `review_content` is the single source of truth for the rendered governance record.
3. Discrete fields (executive_summary, engineering_strengths, etc.) remain available as
   structured extracts but the full markdown document is the canonical artefact.
*/

ALTER TABLE atd_benchmark_reviews
  ADD COLUMN IF NOT EXISTS review_content TEXT,
  ADD COLUMN IF NOT EXISTS review_title TEXT;
