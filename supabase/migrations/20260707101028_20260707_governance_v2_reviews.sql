/*
# Governance v2.0 — Expand atd_benchmark_reviews

## Summary
Adds Engineering Intelligence Score (EIS) infrastructure to the benchmark review table.
Supports 9-dimension capability scoring, observation flags, capability delta analysis,
and enriched qualitative fields for the Governance Review v2.0 workflow.

## Modified Tables

### atd_benchmark_reviews
- `capability_scores` (JSONB): 9 numeric scores (0–10) keyed by capability dimension name
- `eis_score` (NUMERIC 5,2): Calculated Engineering Intelligence Score (0–100)
- `hallucinations` (TEXT): Reviewer notes on hallucinations or factual errors
- `overall_verdict` (TEXT): Free-text overall verdict from the engineering reviewer
- `lessons_learned` (TEXT): Lessons learned section for governance memory
- `observation_flags` (JSONB): Array of observation flag objects (type, note, severity)
- `compared_session_id` (UUID): FK to the session used as the capability delta baseline
- `capability_delta` (JSONB): Computed delta between current and baseline capability scores
- `evolution_summary` (TEXT): Editable narrative summary of benchmark evolution

## Security
- RLS remains enabled; existing policies cover new columns automatically (row-level, not column-level).

## Notes
1. All columns are nullable to preserve backwards compatibility with existing review records.
2. capability_scores format: { "commercial_understanding": 7, "product_understanding": 8, ... }
3. observation_flags format: [{ "type": "major_improvement", "note": "...", "severity": "info" }, ...]
4. capability_delta format: { "commercial_understanding": { "previous": 6, "current": 8, "delta": 2 }, ... }
*/

ALTER TABLE atd_benchmark_reviews
  ADD COLUMN IF NOT EXISTS capability_scores JSONB,
  ADD COLUMN IF NOT EXISTS eis_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS hallucinations TEXT,
  ADD COLUMN IF NOT EXISTS overall_verdict TEXT,
  ADD COLUMN IF NOT EXISTS lessons_learned TEXT,
  ADD COLUMN IF NOT EXISTS observation_flags JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS compared_session_id UUID REFERENCES atd_benchmark_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS capability_delta JSONB,
  ADD COLUMN IF NOT EXISTS evolution_summary TEXT;
