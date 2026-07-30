/*
# BUG-006R.1: Evidence-Based Integrity Classification & Change Log Render Correction

## Changes
1. Add governed_category column to engineering_integrity_alerts
2. Reclassify existing alerts using evidence-first rules

## Governed Categories
A. confirmed_engineering_defect — objective evidence proves register is wrong
B. product_owner_governance_decision — evidence insufficient, needs PO decision
C. detection_rule_improvement — alert exists due to incorrect detection assumption
D. already_resolved — alert has been corrected
*/

-- ─── 1. Add governed_category column ──────────────────────────────────────────
ALTER TABLE engineering_integrity_alerts
  ADD COLUMN IF NOT EXISTS governed_category text;

-- ─── 2. Reclassify existing open alerts ───────────────────────────────────────
-- Alerts that have an actual_parent recorded are NOT numbering-derived mismatches
-- if the actual parent is a valid canonical EWO. These are detection rule improvements.

-- PARENT_REFERENCE_MISMATCH alerts where actual_parent is set → detection_rule_improvement
-- (the child's actual parent is valid; the numbering-derived expected parent is advisory)
UPDATE engineering_integrity_alerts
SET governed_category = 'detection_rule_improvement',
    parent_child_classification = 'NUMBERING_DERIVED_PARENT_NOT_FOUND',
    updated_at = NOW()
WHERE alert_type = 'parent_child_issue'
  AND status = 'open'
  AND parent_child_classification = 'PARENT_REFERENCE_MISMATCH'
  AND evidence->>'actual_parent' IS NOT NULL;

-- PARENT_GENUINELY_MISSING alerts where actual_parent is set → confirmed_engineering_defect
-- (the child's recorded parent doesn't exist in any authoritative source)
UPDATE engineering_integrity_alerts
SET governed_category = 'confirmed_engineering_defect',
    updated_at = NOW()
WHERE alert_type = 'parent_child_issue'
  AND status = 'open'
  AND parent_child_classification = 'PARENT_GENUINELY_MISSING'
  AND evidence->>'actual_parent' IS NOT NULL;

-- PARENT_GENUINELY_MISSING alerts where actual_parent is NULL → product_owner_governance_decision
-- (numbering-derived parent doesn't exist, but no actual parent recorded either)
UPDATE engineering_integrity_alerts
SET governed_category = 'product_owner_governance_decision',
    parent_child_classification = 'NUMBERING_DERIVED_PARENT_NOT_FOUND',
    updated_at = NOW()
WHERE alert_type = 'parent_child_issue'
  AND status = 'open'
  AND parent_child_classification = 'PARENT_GENUINELY_MISSING'
  AND (evidence->>'actual_parent' IS NULL OR evidence->>'actual_parent' = '');

-- PARENT_EVIDENCE_ONLY → product_owner_governance_decision
UPDATE engineering_integrity_alerts
SET governed_category = 'product_owner_governance_decision',
    updated_at = NOW()
WHERE alert_type = 'parent_child_issue'
  AND status = 'open'
  AND parent_child_classification = 'PARENT_EVIDENCE_ONLY';

-- PARENT_AUTHORITY_CONFLICT → product_owner_governance_decision
UPDATE engineering_integrity_alerts
SET governed_category = 'product_owner_governance_decision',
    updated_at = NOW()
WHERE alert_type = 'parent_child_issue'
  AND status = 'open'
  AND parent_child_classification = 'PARENT_AUTHORITY_CONFLICT';

-- RELATIONSHIP_FIELD_INCOMPLETE → confirmed_engineering_defect
UPDATE engineering_integrity_alerts
SET governed_category = 'confirmed_engineering_defect',
    updated_at = NOW()
WHERE alert_type = 'parent_child_issue'
  AND status = 'open'
  AND parent_child_classification = 'RELATIONSHIP_FIELD_INCOMPLETE';

-- CANONICAL_PARENT_SATISFIED / HISTORICAL_PARENT_SATISFIED → already_resolved
UPDATE engineering_integrity_alerts
SET governed_category = 'already_resolved',
    status = 'resolved',
    resolved_at = NOW(),
    updated_at = NOW()
WHERE alert_type = 'parent_child_issue'
  AND status = 'open'
  AND parent_child_classification IN ('CANONICAL_PARENT_SATISFIED', 'HISTORICAL_PARENT_SATISFIED');

-- missing_ewo from engineering_records_library → product_owner_governance_decision
UPDATE engineering_integrity_alerts
SET governed_category = 'product_owner_governance_decision',
    updated_at = NOW()
WHERE alert_type = 'missing_ewo'
  AND status = 'open'
  AND evidence->>'source_table' = 'engineering_records_library';

-- missing_ewo from other sources → confirmed_engineering_defect
UPDATE engineering_integrity_alerts
SET governed_category = 'confirmed_engineering_defect',
    updated_at = NOW()
WHERE alert_type = 'missing_ewo'
  AND status = 'open'
  AND (evidence->>'source_table' IS NULL OR evidence->>'source_table' != 'engineering_records_library');

-- conflicting_reference → product_owner_governance_decision
UPDATE engineering_integrity_alerts
SET governed_category = 'product_owner_governance_decision',
    updated_at = NOW()
WHERE alert_type = 'conflicting_reference'
  AND status = 'open';

-- orphan_record → product_owner_governance_decision
UPDATE engineering_integrity_alerts
SET governed_category = 'product_owner_governance_decision',
    updated_at = NOW()
WHERE alert_type = 'orphan_record'
  AND status = 'open';

-- reconciliation_instability → product_owner_governance_decision
UPDATE engineering_integrity_alerts
SET governed_category = 'product_owner_governance_decision',
    updated_at = NOW()
WHERE alert_type = 'reconciliation_instability'
  AND status = 'open';

-- Resolved/archived alerts → already_resolved
UPDATE engineering_integrity_alerts
SET governed_category = 'already_resolved',
    updated_at = NOW()
WHERE status IN ('resolved', 'archived')
  AND governed_category IS NULL;

-- ─── 3. Verify reclassification ───────────────────────────────────────────────
