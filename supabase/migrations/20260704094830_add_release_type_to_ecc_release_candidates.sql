-- Add release_type column to ecc_release_candidates.
-- Supported values: prototype, standard, hotfix, emergency, historical_migration.
-- Informational only — does not affect workflow.

ALTER TABLE ecc_release_candidates
ADD COLUMN IF NOT EXISTS release_type text DEFAULT 'standard';

-- Phase 1 and Phase 2 were early EOC prototype phases
UPDATE ecc_release_candidates SET release_type = 'prototype' WHERE rc_number IN ('RC-001', 'RC-002');

-- Phase 3 is a standard production release
UPDATE ecc_release_candidates SET release_type = 'standard' WHERE rc_number = 'RC-003';
