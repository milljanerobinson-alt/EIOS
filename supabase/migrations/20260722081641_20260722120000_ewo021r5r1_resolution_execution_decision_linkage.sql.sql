/*
# EWO-021R.5R.1: Resolution Action Execution & Decision Audit Linkage
#
# 1. Add audit_ref column to engineering_integrity_alerts for historical reference linkage
# 2. Record EWO-021R.5R.1 in the canonical change log
# 3. No Work Orders or Historical References created
*/

-- ─── 1. Add columns to support decision linkage on integrity alerts ───────────
-- The resolution_status column already supports the new lifecycle states (text type).
-- Add a decision_id column to link alerts to authoritative decisions.
ALTER TABLE engineering_integrity_alerts
  ADD COLUMN IF NOT EXISTS authoritative_decision_id uuid;

-- ─── 2. Record EWO-021R.5R.1 in the canonical change log ──────────────────────────
INSERT INTO engineering_change_log (change_ref, change_type, object_type, object_ref, ewo_ref, summary, description, actor_type, actor, is_reconstructed, recording_source, linked_artefacts, metadata, created_at)
VALUES (
  'ECL-EWO021R5R1-EXEC',
  'refined',
  'engineering_work_order',
  'EWO-021R.5R.1',
  'EWO-021',
  'EWO-021R.5R.1 executed: Resolution Action Execution & Decision Audit Linkage',
  'Completed three behavioural gaps from EWO-021R.5: (1) Search Additional Evidence now performs a real governed evidence search across all authoritative sources and returns a governed result with sources, failures, and evidence delta. (2) Record Historical Reference now opens a pre-populated confirmation form and creates the Historical Reference only after explicit PO confirmation, with failure keeping the alert open. (3) IntegrityResolutionWorkspace now resolves the authoritative Engineering Decision via getDecisionForAlert and blocks all resolution actions when decision linkage is missing. All timeline events are linked to the correct decision_id. Success is shown only after authoritative persistence.',
  'ai',
  'Engineering Team',
  false,
  'live',
  '[{"artefact_type":"engineering_audit","artefact_ref":"EA-EWO021R5R1"}]'::jsonb,
  '{"ewo_ref":"EWO-021R.5R.1","classification":"resolution_execution_decision_linkage"}'::jsonb,
  NOW()
)
ON CONFLICT (change_ref) DO NOTHING;
