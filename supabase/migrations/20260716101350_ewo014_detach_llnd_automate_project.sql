-- EWO-014: Detach LLND Automate from the Project Framework
-- Archive the LLND Automate project (do NOT delete — preserves engineering history)
-- Return EIOS to Platform-only mode

-- 1. Archive the LLND Automate project
UPDATE ecc_projects
SET status = 'archived',
    is_default = false,
    updated_at = now()
WHERE slug = 'llnd-automate' AND status = 'active';

-- 2. Add future roadmap item: "Create LLND Automate Project"
--    (product_id references ecc_product which is the LLN+D product identity)
INSERT INTO ecc_roadmap_items (name, description, target_quarter, priority, status, sort_order, product_id)
VALUES (
  'Create LLND Automate Project',
  'Once the EIOS Platform and Project framework are complete, create the first production Project: LLND Automate.',
  NULL,
  'low',
  'planned',
  1000,
  (SELECT id FROM ecc_product LIMIT 1)
)
ON CONFLICT DO NOTHING;
