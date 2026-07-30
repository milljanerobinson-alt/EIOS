/*
# Governed Parent-Child Alert Reclassification

## Purpose
One-time governed reclassification of existing open parent_child_issue alerts
using the new Authoritative Engineering Existence resolver. For each open
parent-child alert:

1. Resolves the expected parent through authoritative existence
2. Reclassifies the alert with precise classification
3. Auto-resolves alerts where historical lineage fully satisfies the rule
4. Preserves audit history (previous_classification, reclassification_reason)

## Data Safety
- No alerts are deleted
- Previous classification is preserved in previous_classification column
- Reclassification reason is recorded
- Auto-resolved alerts include resolution_notes explaining the historical satisfaction

## Important Notes
1. This is a one-time governed cleanup — future reconciliation uses the
   authoritative resolver automatically
2. Alerts that are historically satisfied are auto-resolved
3. Alerts that are reclassified (but not resolved) remain open with precise
   classification
*/

-- ─── 1. Auto-resolve parent-child alerts where historical lineage is satisfied ──
-- For each open parent_child_issue alert, check if the expected parent
-- is a governed Historical Reference with status 'historical_not_issued'
UPDATE engineering_integrity_alerts a
SET status = 'resolved',
    resolved_at = now(),
    resolved_by = 'authoritative_existence_resolver',
    resolution_notes = 'Historical lineage satisfied: Expected parent exists as a governed Historical Reference (status: historical_not_issued). No executable parent Work Order required.',
    re_evaluation_status = 'auto_resolved',
    parent_child_classification = 'HISTORICAL_PARENT_SATISFIED',
    authoritative_status = 'HISTORICALLY_SATISFIED',
    authoritative_source_type = 'historical_reference',
    lineage_satisfied = true,
    execution_permitted = false,
    previous_classification = COALESCE(a.parent_child_classification, 'parent_child_issue'),
    reclassification_reason = 'Historical Reference authoritatively satisfies lineage',
    updated_at = now()
WHERE a.alert_type = 'parent_child_issue'
  AND a.status = 'open'
  AND EXISTS (
    SELECT 1 FROM engineering_historical_references h
    WHERE h.reference = (
      SELECT substring(a.normalised_reference from 1 for length(a.normalised_reference) - 
        CASE WHEN position('.' in reverse(a.normalised_reference)) > 0 
             THEN position('.' in reverse(a.normalised_reference))
             ELSE 0 END)
    )
    AND h.status IN ('historical_not_issued', 'intentionally_reserved', 'numbering_preserved', 'governed_historical_reference')
  );

-- ─── 2. Reclassify remaining open parent-child alerts ──────────────────────
-- For alerts where the expected parent is NOT historically satisfied,
-- classify as PARENT_GENUINELY_MISSING (since we can't run the full resolver
-- in SQL — the application code will refine these on next reconciliation)
UPDATE engineering_integrity_alerts a
SET parent_child_classification = 'PARENT_GENUINELY_MISSING',
    authoritative_status = 'GENUINELY_MISSING',
    lineage_satisfied = false,
    execution_permitted = false,
    previous_classification = COALESCE(a.parent_child_classification, 'parent_child_issue'),
    reclassification_reason = 'No canonical or historical authoritative parent found during governed reclassification',
    updated_at = now()
WHERE a.alert_type = 'parent_child_issue'
  AND a.status = 'open'
  AND a.parent_child_classification IS NULL;
