/*
# EWO-014.19A.7R.3R.1 — Engineering Ledger Completion & Historical Navigation Refinements

## 1. Purpose
Completes the Engineering Ledger by:
  - Creating Historical References for EWO-005 and EWO-006
  - Adding Engineering Classification column (separate from lifecycle)
  - Adding Product Owner column
  - Backfilling classification and product owner for existing EWOs

## 2. Canonical Registration
Creates EWO-014.19A.7R.3R.1 BEFORE implementation begins.

## 3. Schema Changes
- ALTER TABLE engineering_work_orders: add engineering_classification, product_owner
- ALTER TABLE engineering_historical_references: add product_owner
- INSERT Historical References for EWO-005, EWO-006
- Backfill engineering_classification for existing EWOs
- Backfill product_owner = 'Millie Robinson' for all records
*/

-- ─── 1. Canonical EWO-014.19A.7R.3R.1 ─────────────────────────────────────────
INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level,
  implementation_provider, implementation_status, engineering_package_status,
  created_at, updated_at
)
SELECT 'EWO-014.19A.7R.3R.1',
  'EWO-014.19A.7R.3R.1 — Engineering Ledger Completion & Historical Navigation Refinements',
  'Completes the Engineering Ledger by creating Historical References for EWO-005 and EWO-006, separating lifecycle from engineering classification, adding Product Owner visibility, and ensuring Historical References appear as placeholders in Closed Engineering.',
  'ready', 'high', 'medium',
  'bolt', 'Assigned', 'Generated',
  now(), now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.19A.7R.3R.1');

-- Lifecycle event
INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata)
SELECT id, null, 'ready', 'system',
  'Canonical EWO registered before implementation per EWO-014.19A.7R.3R.1.',
  jsonb_build_object('source', 'ensure_canonical_creation', 'ewo_ref', 'EWO-014.19A.7R.3R.1')
FROM engineering_work_orders
WHERE ewo_ref = 'EWO-014.19A.7R.3R.1'
AND NOT EXISTS (
  SELECT 1 FROM ewo_lifecycle_events ev
  WHERE ev.ewo_id = engineering_work_orders.id
  AND ev.metadata->>'source' = 'ensure_canonical_creation'
);

-- ─── 2. Add Engineering Classification column ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders'
    AND column_name = 'engineering_classification'
  ) THEN
    ALTER TABLE engineering_work_orders
      ADD COLUMN engineering_classification text DEFAULT 'Engineering';
  END IF;
END $$;

-- ─── 3. Add Product Owner column ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders'
    AND column_name = 'product_owner'
  ) THEN
    ALTER TABLE engineering_work_orders
      ADD COLUMN product_owner text DEFAULT 'Millie Robinson';
  END IF;
END $$;

-- ─── 4. Backfill Engineering Classification ───────────────────────────────────
UPDATE engineering_work_orders SET engineering_classification = 'Refinement'
  WHERE ewo_ref LIKE '%R' AND engineering_classification = 'Engineering';

UPDATE engineering_work_orders SET engineering_classification = 'Historical Migration'
  WHERE ewo_ref LIKE '%.13%' AND ewo_ref NOT LIKE '%R' AND engineering_classification = 'Engineering';

UPDATE engineering_work_orders SET engineering_classification = 'Historical Recovery'
  WHERE ewo_ref LIKE '%.17%' AND ewo_ref NOT LIKE '%R' AND engineering_classification = 'Engineering';

UPDATE engineering_work_orders SET engineering_classification = 'Constitutional'
  WHERE ewo_ref LIKE 'EWO-008%' AND engineering_classification = 'Engineering';

UPDATE engineering_work_orders SET engineering_classification = 'Bug'
  WHERE ewo_ref LIKE 'EWO-010%' AND engineering_classification = 'Engineering';

-- ─── 5. Backfill Product Owner ────────────────────────────────────────────────
UPDATE engineering_work_orders
  SET product_owner = 'Millie Robinson'
  WHERE product_owner IS NULL OR product_owner = '';

-- ─── 6. Create Historical References for EWO-005 and EWO-006 ───────────────────
INSERT INTO engineering_historical_references (
  reference, title, investigation_date, audit_ref, evidence_summary,
  conclusion, historical_explanation, status
)
SELECT 'EWO-005',
  'EWO-005 — Historical Reference',
  '2026-07-17',
  'EWO-014.17',
  'Historical audit confirmed no governed engineering evidence exists for EWO-005. The reference was never formally issued through the canonical Engineering Work Order registration process.',
  'Reference Not Issued',
  'EWO-005 was identified during the historical recovery audit (EWO-014.17) as a reference number with no corresponding governed engineering record. No implementation evidence, completion report, or lifecycle events exist. The reference was never issued.',
  'historical'
WHERE NOT EXISTS (
  SELECT 1 FROM engineering_historical_references WHERE reference = 'EWO-005'
);

INSERT INTO engineering_historical_references (
  reference, title, investigation_date, audit_ref, evidence_summary,
  conclusion, historical_explanation, status
)
SELECT 'EWO-006',
  'EWO-006 — Historical Reference',
  '2026-07-17',
  'EWO-014.17',
  'Historical audit confirmed no governed engineering evidence exists for EWO-006. The reference was never formally issued through the canonical Engineering Work Order registration process.',
  'Reference Not Issued',
  'EWO-006 was identified during the historical recovery audit (EWO-014.17) as a reference number with no corresponding governed engineering record. No implementation evidence, completion report, or lifecycle events exist. The reference was never issued.',
  'historical'
WHERE NOT EXISTS (
  SELECT 1 FROM engineering_historical_references WHERE reference = 'EWO-006'
);

-- ─── 7. Add Product Owner to Historical References ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_historical_references'
    AND column_name = 'product_owner'
  ) THEN
    ALTER TABLE engineering_historical_references
      ADD COLUMN product_owner text DEFAULT 'Millie Robinson';
  END IF;
END $$;

UPDATE engineering_historical_references
  SET product_owner = 'Millie Robinson'
  WHERE product_owner IS NULL OR product_owner = '';
