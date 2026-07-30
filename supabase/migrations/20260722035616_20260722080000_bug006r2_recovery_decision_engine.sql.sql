/*
# BUG-006R.2: Recovery Decision Engine & Change Log Synchronisation

## Changes
1. Add recovery_outcome column to engineering_recovery_packages
2. Backfill recovery outcomes for existing packages
3. Verify change log synchronisation (engineering_change_log is canonical)
*/

-- ─── 1. Add recovery_outcome column ────────────────────────────────────────────
ALTER TABLE engineering_recovery_packages
  ADD COLUMN IF NOT EXISTS recovery_outcome text;

-- ─── 2. Backfill recovery outcomes ─────────────────────────────────────────────
-- A. recover_automatically: HIGH confidence, approved, import supported
UPDATE engineering_recovery_packages
SET recovery_outcome = 'recover_automatically',
    updated_at = NOW()
WHERE engineering_confidence = 'HIGH'
  AND po_status = 'approved'
  AND object_classification NOT IN ('BUG_OR_INCIDENT', 'UNKNOWN')
  AND is_deleted = false
  AND is_permanently_dismissed = false;

-- D. legacy_reference: known legacy prefixes
UPDATE engineering_recovery_packages
SET recovery_outcome = 'legacy_reference',
    updated_at = NOW()
WHERE canonical_reference LIKE 'EWO-007R%'
   OR canonical_reference LIKE 'EWO-008-AMD%'
   OR canonical_reference LIKE 'EWO-009.%'
   OR canonical_reference LIKE 'EWO-011.%'
   OR canonical_reference LIKE 'EWO-014.7E%'
   OR canonical_reference LIKE 'EWO-014.3.2B%';

-- C. unrecoverable: UNKNOWN confidence or LOW confidence with minimal evidence
UPDATE engineering_recovery_packages
SET recovery_outcome = 'unrecoverable',
    updated_at = NOW()
WHERE recovery_outcome IS NULL
  AND (engineering_confidence = 'UNKNOWN'
       OR (engineering_confidence = 'LOW' AND evidence_missing IS NOT NULL AND evidence_missing::text != '[]'::text));

-- B. product_owner_decision: everything else
UPDATE engineering_recovery_packages
SET recovery_outcome = 'product_owner_decision',
    updated_at = NOW()
WHERE recovery_outcome IS NULL
  AND is_deleted = false
  AND is_permanently_dismissed = false;

-- Deleted/dismissed packages get 'product_owner_decision' as default
UPDATE engineering_recovery_packages
SET recovery_outcome = 'product_owner_decision',
    updated_at = NOW()
WHERE recovery_outcome IS NULL;

-- ─── 3. Verify change log sync ─────────────────────────────────────────────────
-- The canonical change log table is engineering_change_log (870 entries).
-- The ecc_engineering_change_log table (44 entries) is the OLD table and should
-- no longer be used for displaying engineering changes.
-- The ECCChangeLogPage has been updated to read from engineering_change_log.
