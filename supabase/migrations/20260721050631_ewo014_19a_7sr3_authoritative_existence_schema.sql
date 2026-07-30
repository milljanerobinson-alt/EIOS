/*
# Authoritative Engineering Existence Schema

## Purpose
Adds columns to engineering_integrity_alerts to support:
1. Precise parent-child classification (7 categories instead of generic 'parent_child_issue')
2. Authoritative existence metadata on alerts
3. Reclassification audit trail

## Modified Tables

### engineering_integrity_alerts (modified)
Added columns:
- parent_child_classification (text) — one of: CANONICAL_PARENT_SATISFIED, 
  HISTORICAL_PARENT_SATISFIED, RELATIONSHIP_FIELD_INCOMPLETE, 
  PARENT_REFERENCE_MISMATCH, PARENT_EVIDENCE_ONLY, 
  PARENT_GENUINELY_MISSING, PARENT_AUTHORITY_CONFLICT
- authoritative_status (text) — one of: CANONICALLY_SATISFIED, 
  HISTORICALLY_SATISFIED, EVIDENCE_ONLY, GENUINELY_MISSING, CONFLICTING_AUTHORITY
- authoritative_source_type (text) — source object type that satisfied existence
- authoritative_source_id (uuid) — ID of the source object
- lineage_satisfied (boolean) — whether lineage is satisfied by authoritative existence
- execution_permitted (boolean) — whether the reference is executable
- reclassification_reason (text) — reason for reclassification
- previous_classification (text) — the classification before reclassification

## Indexes
- idx_alerts_parent_child_classification on parent_child_classification
- idx_alerts_authoritative_status on authoritative_status

## Security
No security changes — existing RLS policies remain in effect.
*/

ALTER TABLE engineering_integrity_alerts
  ADD COLUMN IF NOT EXISTS parent_child_classification text,
  ADD COLUMN IF NOT EXISTS authoritative_status text,
  ADD COLUMN IF NOT EXISTS authoritative_source_type text,
  ADD COLUMN IF NOT EXISTS authoritative_source_id uuid,
  ADD COLUMN IF NOT EXISTS lineage_satisfied boolean,
  ADD COLUMN IF NOT EXISTS execution_permitted boolean,
  ADD COLUMN IF NOT EXISTS reclassification_reason text,
  ADD COLUMN IF NOT EXISTS previous_classification text;

CREATE INDEX IF NOT EXISTS idx_alerts_parent_child_classification 
  ON engineering_integrity_alerts(parent_child_classification);
CREATE INDEX IF NOT EXISTS idx_alerts_authoritative_status 
  ON engineering_integrity_alerts(authoritative_status);
