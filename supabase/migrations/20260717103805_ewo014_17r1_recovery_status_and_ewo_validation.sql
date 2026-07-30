/*
# EWO-014.17R.1: Recovery Package Status + Canonical EWO Reference Validation

## Overview
1. Adds a dedicated recovery_status column to engineering_recovery_packages
   that communicates the overall Recovery Lifecycle independently from
   object classification.
2. Backfills recovery_status from existing po_status / is_deleted /
   is_permanently_dismissed / imported_at fields.

## Schema Changes (all additive)

### engineering_recovery_packages new column:
- recovery_status text NOT NULL DEFAULT 'discovered' CHECK (
    recovery_status IN (
      'discovered', 'pending_review', 'evidence_requested',
      'approved', 'rejected', 'imported',
      'deleted', 'permanently_dismissed', 'restored'
    )
  )

## Backfill
- imported_at not null → 'imported'
- is_permanently_dismissed → 'permanently_dismissed'
- is_deleted → 'deleted'
- po_status = 'approved' → 'approved'
- po_status = 'rejected' → 'rejected'
- po_status = 'request_evidence' → 'evidence_requested'
- po_status = 'edit' → 'pending_review'
- po_status = 'pending' → 'pending_review'
- default → 'discovered'

## Index
- Index on recovery_status
*/

-- ─── Add recovery_status column ──────────────────────────────────────────────

ALTER TABLE engineering_recovery_packages
  ADD COLUMN IF NOT EXISTS recovery_status text NOT NULL DEFAULT 'discovered' CHECK (
    recovery_status IN (
      'discovered', 'pending_review', 'evidence_requested',
      'approved', 'rejected', 'imported',
      'deleted', 'permanently_dismissed', 'restored'
    )
  );

-- ─── Index ────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_recovery_packages_recovery_status
  ON engineering_recovery_packages (recovery_status);

-- ─── Backfill recovery_status from existing state ────────────────────────────

UPDATE engineering_recovery_packages
  SET recovery_status = 'imported'
  WHERE imported_at IS NOT NULL AND imported_ewo_id IS NOT NULL;

UPDATE engineering_recovery_packages
  SET recovery_status = 'permanently_dismissed'
  WHERE is_permanently_dismissed = true;

UPDATE engineering_recovery_packages
  SET recovery_status = 'deleted'
  WHERE is_deleted = true AND is_permanently_dismissed = false;

UPDATE engineering_recovery_packages
  SET recovery_status = 'approved'
  WHERE po_status = 'approved' AND imported_at IS NULL;

UPDATE engineering_recovery_packages
  SET recovery_status = 'rejected'
  WHERE po_status = 'rejected';

UPDATE engineering_recovery_packages
  SET recovery_status = 'evidence_requested'
  WHERE po_status = 'request_evidence';

UPDATE engineering_recovery_packages
  SET recovery_status = 'pending_review'
  WHERE po_status IN ('pending', 'edit')
  AND is_deleted = false AND is_permanently_dismissed = false;
