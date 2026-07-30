-- Fix checklist_items for all RCs with status = 'verified'.
-- These RCs were verified before the checklist system existed, so their items were
-- incorrectly seeded as checked=false. Retroactively mark all items as checked.
UPDATE ecc_release_candidates
SET
  checklist_items = (
    SELECT jsonb_agg(
      jsonb_set(item, '{checked}', 'true'::jsonb)
    )
    FROM jsonb_array_elements(checklist_items) AS item
  ),
  updated_at = now()
WHERE status = 'verified'
  AND checklist_items IS NOT NULL
  AND jsonb_array_length(checklist_items) > 0;
