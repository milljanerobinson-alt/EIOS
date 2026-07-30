/*
# EWO-014.17R: Historical Recovery Discovery Scope & Governed Deletion Refinement

## Overview
Refines the Historical Recovery Engine to:
1. Add object classification to recovery packages (ENGINEERING_WORK_ORDER,
   ENGINEERING_AMENDMENT, etc.)
2. Add soft deletion (deleted_at, deleted_by, deletion_reason, is_deleted)
3. Add permanently dismissed tracking (permanently_dismissed_at,
   permanently_dismissed_by, permanently_dismissed_reason)
4. Expand audit action enum to include classified, automatically_reclassified,
   product_owner_reclassified, deleted, restored, permanently_dismissed,
   import_blocked_wrong_object_type, rediscovery_skipped
5. Add reclassification columns (previous_classification, reclassified_by,
   reclassified_at, reclassification_reason)

## Schema Changes (all additive, no data loss)

### engineering_recovery_packages new columns:
- object_classification text NOT NULL DEFAULT 'UNKNOWN'
- previous_classification text
- reclassified_by text
- reclassified_at timestamptz
- reclassification_reason text
- deleted_at timestamptz
- deleted_by text
- deletion_reason text
- is_deleted boolean NOT NULL DEFAULT false
- permanently_dismissed_at timestamptz
- permanently_dismissed_by text
- permanently_dismissed_reason text
- is_permanently_dismissed boolean NOT NULL DEFAULT false

### engineering_recovery_audit:
- Expand action CHECK constraint to include new actions

## Indexes
- Index on object_classification
- Index on is_deleted
- Index on is_permanently_dismissed

## RLS
- No changes needed (existing policies cover new columns)

## Backward Compatibility
- All new columns have defaults
- Existing packages get object_classification = 'UNKNOWN' (will be backfilled)
- Existing audit records unchanged
*/

-- ─── Add classification columns to recovery packages ─────────────────────────

ALTER TABLE engineering_recovery_packages
  ADD COLUMN IF NOT EXISTS object_classification text NOT NULL DEFAULT 'UNKNOWN' CHECK (
    object_classification IN (
      'ENGINEERING_WORK_ORDER',
      'ENGINEERING_AMENDMENT',
      'CONSTITUTIONAL_RECORD',
      'ENGINEERING_RECORD',
      'ENGINEERING_INTENT',
      'ENGINEERING_PLAN',
      'PIPELINE_EXECUTION',
      'BUG_OR_INCIDENT',
      'BATCH_OR_MIGRATION',
      'UNKNOWN'
    )
  );

ALTER TABLE engineering_recovery_packages
  ADD COLUMN IF NOT EXISTS previous_classification text;

ALTER TABLE engineering_recovery_packages
  ADD COLUMN IF NOT EXISTS reclassified_by text;

ALTER TABLE engineering_recovery_packages
  ADD COLUMN IF NOT EXISTS reclassified_at timestamptz;

ALTER TABLE engineering_recovery_packages
  ADD COLUMN IF NOT EXISTS reclassification_reason text;

-- ─── Add soft deletion columns ──────────────────────────────────────────────

ALTER TABLE engineering_recovery_packages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE engineering_recovery_packages
  ADD COLUMN IF NOT EXISTS deleted_by text;

ALTER TABLE engineering_recovery_packages
  ADD COLUMN IF NOT EXISTS deletion_reason text;

ALTER TABLE engineering_recovery_packages
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

-- ─── Add permanently dismissed columns ──────────────────────────────────────

ALTER TABLE engineering_recovery_packages
  ADD COLUMN IF NOT EXISTS permanently_dismissed_at timestamptz;

ALTER TABLE engineering_recovery_packages
  ADD COLUMN IF NOT EXISTS permanently_dismissed_by text;

ALTER TABLE engineering_recovery_packages
  ADD COLUMN IF NOT EXISTS permanently_dismissed_reason text;

ALTER TABLE engineering_recovery_packages
  ADD COLUMN IF NOT EXISTS is_permanently_dismissed boolean NOT NULL DEFAULT false;

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_recovery_packages_classification
  ON engineering_recovery_packages (object_classification);

CREATE INDEX IF NOT EXISTS idx_recovery_packages_is_deleted
  ON engineering_recovery_packages (is_deleted);

CREATE INDEX IF NOT EXISTS idx_recovery_packages_is_dismissed
  ON engineering_recovery_packages (is_permanently_dismissed);

-- ─── Expand audit action CHECK constraint ────────────────────────────────────

ALTER TABLE engineering_recovery_audit
  DROP CONSTRAINT IF EXISTS engineering_recovery_audit_action_check;

ALTER TABLE engineering_recovery_audit
  ADD CONSTRAINT engineering_recovery_audit_action_check CHECK (
    action IN (
      'discovered', 'reviewed', 'approved', 'rejected', 'edited',
      'requested_evidence', 'imported',
      'classified', 'automatically_reclassified',
      'product_owner_reclassified',
      'deleted', 'restored', 'permanently_dismissed',
      'import_blocked_wrong_object_type', 'rediscovery_skipped'
    )
  );
