/*
# EWO-021R.5: Governed Integrity Resolution Workspace & Decision-Driven Navigation
#
# 1. Backfill alerts in 'decision_produced' to 'po_review' for missing_ewo alerts
# 2. Record EWO-021R.5 in the canonical change log
# 3. No Work Orders or Historical References created
*/

-- ─── 1. Backfill missing_ewo alerts to po_review state ────────────────────────
UPDATE engineering_integrity_alerts
SET resolution_status = 'po_review',
    updated_at = NOW()
WHERE resolution_status = 'decision_produced'
  AND alert_type = 'missing_ewo';

-- ─── 2. Record EWO-021R.5 in the canonical change log ──────────────────────────
INSERT INTO engineering_change_log (change_ref, change_type, object_type, object_ref, ewo_ref, summary, description, actor_type, actor, is_reconstructed, recording_source, linked_artefacts, metadata, created_at)
VALUES (
  'ECL-EWO021R5-EXEC',
  'refined',
  'engineering_work_order',
  'EWO-021R.5',
  'EWO-021',
  'EWO-021R.5 executed: Governed Integrity Resolution Workspace & Decision-Driven Navigation',
  'Replaced object-centric navigation with governed decision-centric resolution. Created Integrity Resolution Workspace component. Added dynamic action generation from decision type, recovery justification, PO permissions, and lifecycle state. Extended resolution lifecycle with po_review, resolution_selected, resolution_executed states. Alerts can now be closed without creating engineering objects. Create Canonical Work Order is only available when recovery justification is JUSTIFIED. Added governed resolution timeline recording for every PO decision.',
  'ai',
  'Engineering Team',
  false,
  'live',
  '[{"artefact_type":"engineering_audit","artefact_ref":"EA-EWO021R5"}]'::jsonb,
  '{"ewo_ref":"EWO-021R.5","classification":"governed_resolution_workspace"}'::jsonb,
  NOW()
)
ON CONFLICT (change_ref) DO NOTHING;
