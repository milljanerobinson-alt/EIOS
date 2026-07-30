
-- Migrate current_batch row key to current_phase in ecc_project_compass
UPDATE ecc_project_compass
SET section_key = 'current_phase'
WHERE section_key = 'current_batch';
