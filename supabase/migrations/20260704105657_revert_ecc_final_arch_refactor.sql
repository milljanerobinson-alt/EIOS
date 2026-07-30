
-- Revert EOC Final Architecture Refactor

-- 1. Remove added columns from ecc_release_candidates and ecc_releases
ALTER TABLE ecc_release_candidates DROP COLUMN IF EXISTS phase_id;
ALTER TABLE ecc_releases DROP COLUMN IF EXISTS phase_id;
ALTER TABLE ecc_releases DROP COLUMN IF EXISTS milestone_id;
ALTER TABLE ecc_releases DROP COLUMN IF EXISTS roadmap_item_id;

-- 2. Drop the new tables (in dependency order)
DROP TABLE IF EXISTS ecc_phases;
DROP TABLE IF EXISTS ecc_milestones;
DROP TABLE IF EXISTS ecc_roadmap_items;
DROP TABLE IF EXISTS ecc_product;

-- 3. Delete ADR-001
DELETE FROM ecc_architecture_reviews WHERE adr_number = 'ADR-001';
