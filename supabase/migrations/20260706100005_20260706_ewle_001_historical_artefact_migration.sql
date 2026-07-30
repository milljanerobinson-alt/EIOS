/*
# EWLE-001 Historical Migration — Existing Engineering Artefacts

## Overview
Enrolls existing engineering artefacts (AUD-001, AUD-002) into the Engineering
Workflow Lifecycle Engine as historical migration records. These are created at
the 'closed' lifecycle stage since both audits are in 'approved' status,
representing completed work.

All existing artefacts are enrolled with is_historical = true and a migration
note explaining that the lifecycle was reconstructed from available metadata.
No original data is modified.

## Artefacts Enrolled
- AUD-001: Initial Platform Baseline Audit (historical, approved) → closed
- AUD-002: Engineering Operating System Baseline Audit (manual, approved) → closed
*/

-- Enroll AUD-001
WITH aud001 AS (
  SELECT id FROM ecc_audits WHERE audit_number = 'AUD-001' LIMIT 1
)
INSERT INTO ecc_workflow_instances
  (artefact_type, artefact_id, artefact_ref, artefact_title,
   current_stage_key, is_historical, migration_notes,
   stage_entered_at, created_at, updated_at)
SELECT
  'audit',
  id,
  'AUD-001',
  'Initial Platform Baseline Audit',
  'closed',
  true,
  'Historical migration. Original lifecycle stages could not be fully reconstructed. Enrolled at Closed as the audit is in Approved status.',
  '2026-07-05 00:00:00+00',
  '2026-07-05 00:00:00+00',
  now()
FROM aud001
WHERE NOT EXISTS (
  SELECT 1 FROM ecc_workflow_instances
  WHERE artefact_ref = 'AUD-001' AND artefact_type = 'audit'
);

-- Enroll AUD-002
WITH aud002 AS (
  SELECT id FROM ecc_audits WHERE audit_number = 'AUD-002' LIMIT 1
)
INSERT INTO ecc_workflow_instances
  (artefact_type, artefact_id, artefact_ref, artefact_title,
   current_stage_key, is_historical, migration_notes,
   stage_entered_at, created_at, updated_at)
SELECT
  'audit',
  id,
  'AUD-002',
  'Engineering Operating System Baseline Audit',
  'closed',
  true,
  'Historical migration. Original lifecycle stages could not be fully reconstructed. Enrolled at Closed as the audit is in Approved status.',
  '2026-07-05 03:10:49+00',
  '2026-07-05 03:10:49+00',
  now()
FROM aud002
WHERE NOT EXISTS (
  SELECT 1 FROM ecc_workflow_instances
  WHERE artefact_ref = 'AUD-002' AND artefact_type = 'audit'
);

-- Record a single historical transition for each instance
INSERT INTO ecc_workflow_transitions
  (instance_id, from_stage_key, to_stage_key, transitioned_by, transition_type, notes, created_at)
SELECT
  id,
  null,
  'closed',
  'system',
  'historical_migration',
  'Enrolled via EWLE-001 historical migration. Lifecycle reconstructed from existing audit record.',
  created_at
FROM ecc_workflow_instances
WHERE artefact_type = 'audit'
  AND artefact_ref IN ('AUD-001','AUD-002')
  AND is_historical = true
  AND NOT EXISTS (
    SELECT 1 FROM ecc_workflow_transitions t WHERE t.instance_id = ecc_workflow_instances.id
  );
