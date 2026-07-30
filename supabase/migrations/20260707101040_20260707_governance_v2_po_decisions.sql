/*
# Governance v2.0 — Expand atd_benchmark_po_decisions

## Summary
Extends the Product Owner decision record with structured governance fields
to support the full PO decision workflow in Governance Review v2.0.

## Modified Tables

### atd_benchmark_po_decisions
- `reason` (TEXT): Structured reason for the PO decision
- `decision_summary` (TEXT): Executive summary of the decision
- `future_recommendations` (TEXT): Forward-looking recommendations from PO
- `po_notes` (TEXT): Private product owner notes (supplementary to comments)
- `locked_at` (TIMESTAMPTZ): Timestamp when the PO decision was formally locked/signed

## Security
- RLS remains enabled; existing policies cover new columns automatically.

## Notes
1. All columns nullable for backwards compatibility.
2. `locked_at` is distinct from `created_at` — it records the moment the PO
   formally ratified the decision, which may differ from when the record was saved.
3. The existing `product_owner` column serves as the signature identifier.
*/

ALTER TABLE atd_benchmark_po_decisions
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS decision_summary TEXT,
  ADD COLUMN IF NOT EXISTS future_recommendations TEXT,
  ADD COLUMN IF NOT EXISTS po_notes TEXT,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
