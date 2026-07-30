/*
# EWO-028 Phase Closeout — Add correction reconciliation type

1. Purpose
   - Add 'correction' as a valid reconciliation_type in lifecycle_reconciliation_log
   - This enables auditable corrections to reconciliation history without
     overwriting original records

2. Tables affected
   - lifecycle_reconciliation_log (alter check constraint)

3. Security — No RLS changes.
*/

ALTER TABLE lifecycle_reconciliation_log DROP CONSTRAINT IF EXISTS lifecycle_reconciliation_log_reconciliation_type_check;
ALTER TABLE lifecycle_reconciliation_log ADD CONSTRAINT lifecycle_reconciliation_log_reconciliation_type_check
  CHECK (reconciliation_type = ANY (ARRAY['post_acceptance_closure'::text, 'historical_reconciliation'::text, 'correction'::text]));
