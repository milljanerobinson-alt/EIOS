-- Migrate RC-001 and RC-002 from legacy "Batch A/B" naming to Phase terminology.
-- RC-001 description confirms it is the foundation phase of the ECC build.
-- RC-002 is the next sequential phase with no subtitle assigned yet.
-- Both batch_name and phase_name are updated so the phaseName() UI helper
-- resolves consistently regardless of which field is checked first.

UPDATE ecc_release_candidates
SET
  batch_name = 'Phase 1 — Foundation',
  phase_name = 'Phase 1 — Foundation',
  updated_at = now()
WHERE rc_number = 'RC-001';

UPDATE ecc_release_candidates
SET
  batch_name = 'Phase 2',
  phase_name = 'Phase 2',
  updated_at = now()
WHERE rc_number = 'RC-002';
