/*
# EWO-021R.6: Governed Integrity Decision Reuse & Intelligent Alert Suppression
#
# 1. Create reconciliation events table for audit timeline (REQ-13)
# 2. Add suppression tracking columns to engineering_integrity_alerts (REQ-4, REQ-8)
# 3. Add unique active-condition index for idempotency (REQ-14)
# 4. Clean up existing duplicate alerts for EWO-014.7E (REQ-15)
# 5. Record EWO-021R.6 in canonical change log
*/

-- ─── 1. Create reconciliation events table (REQ-13) ───────────────────────────
CREATE TABLE IF NOT EXISTS engineering_integrity_reconciliation_events (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_key             text NOT NULL,
  alert_id                  uuid REFERENCES engineering_integrity_alerts(id) ON DELETE SET NULL,
  event_type                text NOT NULL,
  reason                    text,
  decision_id               uuid,
  prior_alert_id            uuid,
  po_resolution             text,
  material_change_type      text,
  evidence_fingerprint_before text,
  evidence_fingerprint_after  text,
  actor                     text DEFAULT 'Intelligence Reconciliation Engine',
  actor_type                text DEFAULT 'system',
  reconciliation_run_id     text,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eire_condition_key ON engineering_integrity_reconciliation_events(condition_key);
CREATE INDEX IF NOT EXISTS idx_eire_alert_id ON engineering_integrity_reconciliation_events(alert_id);
CREATE INDEX IF NOT EXISTS idx_eire_event_type ON engineering_integrity_reconciliation_events(event_type);

ALTER TABLE engineering_integrity_reconciliation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_reconciliation_events" ON engineering_integrity_reconciliation_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_reconciliation_events" ON engineering_integrity_reconciliation_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_reconciliation_events" ON engineering_integrity_reconciliation_events FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_reconciliation_events" ON engineering_integrity_reconciliation_events FOR DELETE TO authenticated USING (true);

-- ─── 2. Add suppression tracking columns (REQ-4, REQ-8) ────────────────────────
-- condition_key for deterministic identity (REQ-1)
ALTER TABLE engineering_integrity_alerts
  ADD COLUMN IF NOT EXISTS condition_key text;

-- last_reconciled_at for tracking when reconciliation last checked this condition
ALTER TABLE engineering_integrity_alerts
  ADD COLUMN IF NOT EXISTS last_reconciled_at timestamptz;

-- ─── 3. Idempotency: partial unique index on active conditions (REQ-14) ────────
-- Only one active (status='open', not resolved) alert per (alert_type, normalised_reference)
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_condition_unique
  ON engineering_integrity_alerts (alert_type, normalised_reference)
  WHERE status = 'open'
    AND resolution_status NOT IN ('resolved', 'archived', 'superseded', 'permanently_suppressed');

-- ─── 4. Clean up existing duplicate alerts for EWO-014.7E (REQ-15) ──────────────
-- Find all alerts for EWO-014.7E missing_ewo condition
-- The authoritative alert is the resolved one (if any), otherwise the oldest.
DO $$
DECLARE
  v_authoritative_id uuid;
  v_duplicate_ids uuid[];
BEGIN
  -- Find the resolved alert for EWO-014.7E
  SELECT id INTO v_authoritative_id
  FROM engineering_integrity_alerts
  WHERE alert_type = 'missing_ewo'
    AND normalised_reference = 'EWO-014.7E'
    AND (resolution_status = 'resolved' OR status = 'resolved')
  ORDER BY resolved_at DESC NULLS LAST
  LIMIT 1;

  -- If no resolved alert, find the oldest open alert
  IF v_authoritative_id IS NULL THEN
    SELECT id INTO v_authoritative_id
    FROM engineering_integrity_alerts
    WHERE alert_type = 'missing_ewo'
      AND normalised_reference = 'EWO-014.7E'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- If we found an authoritative alert, mark all others as superseded
  IF v_authoritative_id IS NOT NULL THEN
    -- Collect duplicate IDs
    SELECT array_agg(id) INTO v_duplicate_ids
    FROM engineering_integrity_alerts
    WHERE alert_type = 'missing_ewo'
      AND normalised_reference = 'EWO-014.7E'
      AND id != v_authoritative_id;

    -- Mark duplicates as superseded
    IF v_duplicate_ids IS NOT NULL AND array_length(v_duplicate_ids, 1) > 0 THEN
      UPDATE engineering_integrity_alerts
      SET status = 'resolved',
          resolution_status = 'superseded',
          superseded_by_alert_id = v_authoritative_id,
          resolution_notes = COALESCE(resolution_notes, '') || ' [EWO-021R.6: Marked as duplicate of authoritative alert ' || v_authoritative_id::text || ']',
          updated_at = now()
      WHERE id = ANY(v_duplicate_ids);

      -- Record cleanup event
      INSERT INTO engineering_integrity_reconciliation_events (condition_key, alert_id, event_type, reason)
      VALUES (
        'missing_ewo:EWO-014.7E:platform',
        v_authoritative_id,
        'duplicate_cleanup',
        'EWO-021R.6 cleanup: ' || array_length(v_duplicate_ids, 1) || ' duplicate alert(s) superseded.'
      );
    END IF;

    -- Set condition_key on the authoritative alert
    UPDATE engineering_integrity_alerts
    SET condition_key = 'missing_ewo:EWO-014.7E:platform',
        last_reconciled_at = now()
    WHERE id = v_authoritative_id;
  END IF;
END $$;

-- ─── 5. Record EWO-021R.6 in canonical change log ──────────────────────────────
INSERT INTO engineering_change_log (change_ref, change_type, object_type, object_ref, ewo_ref, summary, description, actor_type, actor, is_reconstructed, recording_source, linked_artefacts, metadata, created_at)
VALUES (
  'ECL-EWO021R6-EXEC',
  'created',
  'engineering_work_order',
  'EWO-021R.6',
  'EWO-021',
  'EWO-021R.6 executed: Governed Integrity Decision Reuse & Intelligent Alert Suppression',
  'Made Historical Reconciliation decision-aware. Reconciliation now checks for prior governed resolutions before creating new alerts. Unchanged resolved conditions are suppressed with audit events. Material changes trigger governed successor investigations. Historical References satisfy missing_ewo conditions. Active alert queries exclude superseded and permanently_suppressed. Database idempotency via partial unique index. Cleaned up duplicate EWO-014.7E alerts.',
  'ai',
  'Engineering Team',
  false,
  'live',
  '[{"artefact_type":"engineering_audit","artefact_ref":"EA-EWO021R6"}]'::jsonb,
  '{"ewo_ref":"EWO-021R.6","classification":"governed_decision_reuse_alert_suppression"}'::jsonb,
  NOW()
)
ON CONFLICT (change_ref) DO NOTHING;
