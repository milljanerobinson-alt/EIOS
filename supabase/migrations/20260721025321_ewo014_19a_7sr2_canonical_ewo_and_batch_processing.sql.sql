/*
# EWO-014.19A.7SR.2 — One-Off Governed Engineering Integrity Cleanup

## Purpose
Creates the canonical EWO record for this implementation and the batch processing
tables for the one-off integrity alert cleanup. This is NOT a permanent recovery
engine — it is a Product Owner controlled historical cleanup tool.

## New Tables

### engineering_integrity_batch_runs
Records each batch processing run. One row per batch execution.
- id (uuid PK)
- batch_ref (text, unique) — e.g. "BATCH-INT-001"
- alert_type (text) — the classification being processed (e.g. "missing_ewo")
- requested_batch_size (int) — 25, 50, or 100
- attempted_count (int) — actual number of alerts selected
- initiated_by (text) — user who initiated the batch
- initiated_at (timestamptz)
- completed_at (timestamptz, nullable)
- status (text) — pending, in_progress, completed, failed
- summary (jsonb) — aggregate counts by outcome

### engineering_integrity_batch_items
Records the outcome of each alert processed within a batch.
- id (uuid PK)
- batch_run_id (uuid FK → engineering_integrity_batch_runs)
- alert_id (uuid FK → engineering_integrity_alerts)
- ewo_ref (text, nullable) — the reference being processed
- outcome (text) — RECOVERED, ALREADY_RESOLVED, NEEDS_PRODUCT_OWNER_REVIEW, INVALID_REFERENCE, FALSE_POSITIVE, FAILED, SKIPPED
- reason (text)
- evidence_searched (jsonb) — sources checked
- evidence_used (jsonb) — sources that contributed
- fields_reconstructed (jsonb) — fields rebuilt from evidence
- missing_fields (jsonb) — fields that could not be reconstructed
- confidence (real)
- canonical_work_order_id (uuid, nullable) — created EWO ID if recovered
- transaction_details (jsonb, nullable)
- processed_at (timestamptz)

## Security
- RLS enabled on both tables
- Policies for authenticated users (admin/engineering access)

## Important Notes
1. This is a one-off cleanup tool, NOT a permanent recovery engine
2. No background processor or scheduled reconciliation is created
3. All processing is Product Owner initiated
4. Duplicate detection is mandatory before any Work Order creation
5. Reprocessing the same alert is safe (idempotent)
*/
