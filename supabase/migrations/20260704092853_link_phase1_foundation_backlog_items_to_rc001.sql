-- Link the 6 verified Foundation backlog items to RC-001.
-- These items are genuine Phase 1 work but were never linked because
-- the evidence-linking system did not exist when RC-001 was verified.
-- Bidirectional: update both RC-001's included_backlog_item_ids
-- and each backlog item's linked_release_ids.

UPDATE ecc_release_candidates
SET
  included_backlog_item_ids = ARRAY[
    '1489639e-0991-4876-9747-ae902a2eb263'::uuid,
    'a10246a9-34da-4524-a33f-fd220abd8166'::uuid,
    'e790deba-8c3b-408a-98b3-1ffa567d9c98'::uuid,
    'c82c88b4-0c34-4078-89f2-a7c6053e1834'::uuid,
    'aab677a3-4fb8-4375-a347-b9b7fcfbc3da'::uuid,
    '7bedb486-0244-4f9f-a86d-b8b70cbdf34a'::uuid
  ],
  updated_at = now()
WHERE rc_number = 'RC-001';

-- Reverse link: each Foundation backlog item now references RC-001
UPDATE ecc_backlog_items
SET
  linked_release_ids = array_append(
    COALESCE(linked_release_ids, '{}'),
    (SELECT id FROM ecc_release_candidates WHERE rc_number = 'RC-001')
  ),
  updated_at = now()
WHERE id IN (
  '1489639e-0991-4876-9747-ae902a2eb263',
  'a10246a9-34da-4524-a33f-fd220abd8166',
  'e790deba-8c3b-408a-98b3-1ffa567d9c98',
  'c82c88b4-0c34-4078-89f2-a7c6053e1834',
  'aab677a3-4fb8-4375-a347-b9b7fcfbc3da',
  '7bedb486-0244-4f9f-a86d-b8b70cbdf34a'
);
