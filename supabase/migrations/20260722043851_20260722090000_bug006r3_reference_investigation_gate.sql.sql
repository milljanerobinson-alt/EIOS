/*
# BUG-006R.3: Reference Investigation Gate & Evidence-Justified Recovery Decisions

## Changes
1. Add investigation model columns to ecc_engineering_decisions
2. Backfill existing canonical_object_missing decisions with new model fields
3. Record decision timeline events for the reclassification (audit history)
4. Record BUG-006R.3 in the canonical change log
5. Do NOT create Work Orders or Historical References
*/

-- ─── 1. Add new columns to ecc_engineering_decisions ───────────────────────────
ALTER TABLE ecc_engineering_decisions
  ADD COLUMN IF NOT EXISTS investigation_stage text DEFAULT 'reference_detected',
  ADD COLUMN IF NOT EXISTS recovery_justification text DEFAULT 'blocked_pending_evidence',
  ADD COLUMN IF NOT EXISTS recovery_justification_reason text,
  ADD COLUMN IF NOT EXISTS reference_classification_confidence numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decision_confidence numeric DEFAULT 0;

-- ─── 2. Backfill existing canonical_object_missing decisions ──────────────────
-- Preserve the original decision — do NOT change decision_type.
-- Only add the new investigation model metadata.
UPDATE ecc_engineering_decisions
SET
  investigation_stage = 'reference_detected',
  recovery_justification = 'blocked_pending_evidence',
  recovery_justification_reason = 'A reference was detected, but no authoritative evidence confirms that a corresponding Engineering Work Order previously existed. Recovery is not justified without positive evidence.',
  reference_classification_confidence = 0.95,
  decision_confidence = 0.10,
  updated_at = NOW()
WHERE decision_type = 'canonical_object_missing'
  AND investigation_stage = 'reference_detected'
  AND recovery_justification = 'blocked_pending_evidence'
  AND reference_classification_confidence = 0;

-- ─── 3. Record decision timeline events for the reclassification ───────────────
-- Each existing canonical_object_missing decision gets a timeline event
-- recording the transition to the new model. The original decision remains
-- as historical record.
INSERT INTO ecc_engineering_decision_timeline (
  decision_id, alert_id, event_type, event_summary,
  previous_decision_type, new_decision_type,
  previous_confidence, new_confidence,
  actor, actor_type, created_at
)
SELECT
  d.id,
  d.alert_id,
  'decision_reclassified',
  'BUG-006R.3: Decision reclassified from Canonical Object Missing to Unverified Reference Recovery Candidate. Previous decision overstated available evidence. Zero supporting evidence does not justify recovery.',
  'canonical_object_missing',
  'unverified_reference_recovery_candidate',
  d.confidence,
  0.10,
  'Engineering Team',
  'ai',
  NOW()
FROM ecc_engineering_decisions d
WHERE d.decision_type = 'canonical_object_missing'
ON CONFLICT DO NOTHING;

-- ─── 4. Record BUG-006R.3 in the canonical change log ──────────────────────────
INSERT INTO engineering_change_log (change_ref, change_type, object_type, object_ref, ewo_ref, summary, description, actor_type, actor, is_reconstructed, recording_source, linked_artefacts, metadata, created_at)
VALUES (
  'ECL-BUG006R3-EXEC',
  'refined',
  'engineering_work_order',
  'BUG-006R.3',
  'BUG-006',
  'BUG-006R.3 executed: Reference Investigation Gate & Evidence-Justified Recovery Decisions',
  'Introduced three-stage investigation model (reference detected, evidence investigation, governed decision). Added UNVERIFIED_REFERENCE_RECOVERY_CANDIDATE decision state. Separated confidence model into reference classification, evidence, decision, and repair confidence. Recovery is no longer recommended solely because a reference exists without a canonical Work Order.',
  'ai',
  'Engineering Team',
  false,
  'live',
  '[{"artefact_type":"engineering_audit","artefact_ref":"EA-BUG006R3"}]'::jsonb,
  '{"bug_ref":"BUG-006R.3","classification":"reference_investigation_gate"}'::jsonb,
  NOW()
)
ON CONFLICT (change_ref) DO NOTHING;

-- ─── 5. Verify no Work Orders or Historical References were created ─────────────
-- This migration does NOT create any engineering_work_orders or
-- engineering_historical_references. It only updates decision metadata
-- and records timeline events.
