-- ENG-001: Product Identity Migration — LLND Automate
-- Updates active canonical product identity in the Engineering Intelligence Graph.
-- Historical records (audits, releases, decisions) are intentionally preserved.

-- Update the active EIG mission entity from "LLN+D Platform Mission" to "LLND Automate Platform Mission"
UPDATE eig_entities
SET
  name        = 'LLND Automate Platform Mission',
  description = 'Deliver an enterprise-grade digital assessment and vocational training compliance platform for registered training organisations.',
  updated_at  = now()
WHERE entity_ref = 'MISSION-001'
  AND entity_type = 'mission'
  AND name = 'LLN+D Platform Mission';
