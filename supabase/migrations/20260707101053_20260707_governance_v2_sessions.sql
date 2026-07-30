/*
# Governance v2.0 — Expand atd_benchmark_sessions

## Summary
Adds milestone tagging and top-level EIS score caching to benchmark sessions,
enabling timeline visualisation and dashboard trend analysis.

## Modified Tables

### atd_benchmark_sessions
- `benchmark_milestone` (TEXT): Optional milestone tag for this session
  Values: 'baseline' | 'major_release' | 'architecture_milestone' |
          'governance_milestone' | 'ai_upgrade' | 'product_milestone'
- `eis_score` (NUMERIC 5,2): Cached EIS score from the accepted review for fast queries

## Security
- RLS remains enabled; existing policies cover new columns automatically.

## Notes
1. `eis_score` is a denormalized cache — it is written when a review is accepted
   to avoid a join when rendering session cards and dashboard summaries.
2. `benchmark_milestone` is nullable; most sessions will not have a milestone tag.
3. No check constraint on benchmark_milestone to allow future values without schema changes.
*/

ALTER TABLE atd_benchmark_sessions
  ADD COLUMN IF NOT EXISTS benchmark_milestone TEXT,
  ADD COLUMN IF NOT EXISTS eis_score NUMERIC(5,2);
