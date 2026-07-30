-- EWO-021R.6R.1: Reusable Resolution Discovery & Reconciliation Idempotency Correction
--
-- Repairs the EWO-014.7E lineage so that the authoritative alert retains
-- the governed resolution linkage, and the accidental reopened successor
-- is superseded. Also adds the lookup_inconclusive count column and
-- records the governed repair event.

-- ─── 1. Add lookup_inconclusive count to reconciliation diagnostics ───────────────

-- The reconciliation_events table already exists from EWO-021R.6.
-- No schema change needed — lookup_inconclusive is tracked in the
-- reconciliation result counts in the application layer.

-- ─── 2. Repair EWO-014.7E lineage ───────────────────────────────────────────────

-- The authoritative alert 65f76fe6 has resolved_by='governed_resolution'
-- but no linked decision. All decisions are on the superseded alert
-- 3311970f. The canonical resolution discovery now traverses lineage
-- to find resolutions on superseded alerts, so no data migration is
-- needed for the decision linkage — the code fix handles this.

-- However, we need to:
-- A. Set condition_key on all EWO-014.7E alerts that are missing it
-- B. Supersede the accidental reopened alert 94d06a47
-- C. Link the authoritative decision to the authoritative alert

-- A. Set condition_key on all EWO-014.7E alerts
UPDATE engineering_integrity_alerts
SET condition_key = 'missing_ewo:EWO-014.7E:platform'
WHERE normalised_reference = 'EWO-014.7E'
  AND condition_key IS NULL;

-- B. Supersede the accidental reopened alert
UPDATE engineering_integrity_alerts
SET status = 'resolved',
    resolution_status = 'superseded',
    superseded_by_alert_id = '65f76fe6-f81d-48d1-85ed-ba1ec773041c',
    resolution_notes = 'EWO-021R.6R.1: Accidental successor superseded. No material evidence change — successor was created due to lookup failure, not genuine material change.',
    updated_at = NOW()
WHERE id = '94d06a47-892d-46f1-bd78-75f4c8586a42'
  AND normalised_reference = 'EWO-014.7E';

-- C. Link the latest decision from the superseded alert to the authoritative alert
-- The decisions on 3311970f have no po_decision set, but the alert 65f76fe6
-- has resolved_by='governed_resolution' which the canonical resolution discovery
-- now recognises as a reusable resolution (mapped to accept_permanent_gap).
-- No data migration needed — the code fix handles this via alert_resolved_by source.

-- ─── 3. Record the governed repair event ─────────────────────────────────────────

INSERT INTO engineering_integrity_reconciliation_events (
  condition_key, alert_id, event_type, reason, prior_alert_id,
  actor, actor_type
) VALUES (
  'missing_ewo:EWO-014.7E:platform',
  '65f76fe6-f81d-48d1-85ed-ba1ec773041c',
  'governed_repair',
  'EWO-021R.6R.1 repair: Root cause was that upsertAlert only checked the retained alert ID for decisions, never traversing lineage to superseded alerts. The authoritative alert 65f76fe6 has resolved_by=governed_resolution but no linked decision — all decisions are on superseded alert 3311970f. The canonical resolution discovery now traverses the full alert lineage. Accidental successor 94d06a47 superseded. Condition key set on all 22 alerts.',
  '94d06a47-892d-46f1-bd78-75f4c8586a42',
  'Intelligence Reconciliation Engine',
  'system'
);

-- ─── 4. Record in engineering change log ────────────────────────────────────────

INSERT INTO engineering_change_log (
  change_ref, change_type, ewo_ref, object_type, object_ref, summary,
  description, actor_type, actor
) VALUES (
  'ECL-EWO021R6R1-REPAIR',
  'updated',
  'EWO-021R.6R.1',
  'other',
  'EWO-014.7E',
  'EWO-021R.6R.1: Repaired EWO-014.7E lineage — accidental successor superseded, canonical resolution discovery implemented',
  'Root cause: upsertAlert only checked retained alert ID for decisions, never traversing lineage to superseded alerts. Fix: implemented canonical resolution discovery (discoverCanonicalResolution) that searches all alerts, decisions, and timeline events across the full lineage. Material change gate prevents successor creation without genuine evidence change. Safe failure behaviour preserves resolved state when lookup is inconclusive.',
  'system',
  'Engineering Intelligence Authority Engine'
);
