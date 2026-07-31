/*
# EWO-044R3 Migration 2: Add Ownership Columns and Backfill

## Purpose
Adds organisation (tenant) and engineering project ownership to:
- ecc_projects (add tenant_id)
- ecc_product (add tenant_id)
- engineering_work_orders (add tenant_id + project_id)

Backfills:
- ecc_projects: set tenant_id to the canonical EIOS organisation
- ecc_product: set tenant_id to the canonical EIOS organisation
- engineering_work_orders: 10 genuine EWOs get tenant_id + project_id
  (3 test artefacts remain NULL — hidden by RLS, not deleted)

## Column Changes

### ecc_projects
- tenant_id (uuid, nullable, FK → eios_tenants.id)

### ecc_product
- tenant_id (uuid, nullable, FK → eios_tenants.id)

### engineering_work_orders
- tenant_id (uuid, nullable, FK → eios_tenants.id)
- project_id (uuid, nullable, FK → ecc_projects.id)

## Backfill Details

Genuine EWOs (10 records):
  EWO-029, EWO-030, EWO-030R.1, EWO-031, EWO-032,
  EWO-027R.1, EWO-027R.1R, EWO-027R.1R.1, BUG-006

Test artefacts (3 records — NOT backfilled, remain NULL):
  EWO-032R8-TEST-PIPELINE-REACH
  EWO-032R8-TEST-LINK-EWO
  EWO-032R8-TEST-LIFECYCLE-1785375165151

## Indexes
- idx_ewo_tenant_project_status on engineering_work_orders (tenant_id, project_id, status)
- idx_ewo_active_lookup on engineering_work_orders (project_id, status) WHERE status NOT IN closed/archived/cancelled/rejected

## Security
No RLS changes in this migration (RLS changes are in Migration 3).
Columns are nullable for backwards compatibility during transition.
*/

-- ─── 1. Add tenant_id to ecc_projects ─────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_projects' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE ecc_projects ADD COLUMN tenant_id uuid REFERENCES eios_tenants(id);
  END IF;
END $$;

-- ─── 2. Add tenant_id to ecc_product ───────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecc_product' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE ecc_product ADD COLUMN tenant_id uuid REFERENCES eios_tenants(id);
  END IF;
END $$;

-- ─── 3. Add tenant_id and project_id to engineering_work_orders ───────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE engineering_work_orders ADD COLUMN tenant_id uuid REFERENCES eios_tenants(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE engineering_work_orders ADD COLUMN project_id uuid REFERENCES ecc_projects(id);
  END IF;
END $$;

-- ─── 4. Backfill ecc_projects ─────────────────────────────────────────────────

UPDATE ecc_projects
SET tenant_id = (SELECT id FROM eios_tenants WHERE slug = 'eios')
WHERE tenant_id IS NULL;

-- Reactivate the existing LLND Automate project (currently archived)
UPDATE ecc_projects
SET status = 'active', is_default = true, updated_at = now()
WHERE slug = 'llnd-automate'
AND status = 'archived';

-- ─── 5. Backfill ecc_product ───────────────────────────────────────────────────

UPDATE ecc_product
SET tenant_id = (SELECT id FROM eios_tenants WHERE slug = 'eios')
WHERE tenant_id IS NULL;

-- ─── 6. Backfill genuine EWOs ──────────────────────────────────────────────────

UPDATE engineering_work_orders
SET
  tenant_id = (SELECT id FROM eios_tenants WHERE slug = 'eios'),
  project_id = (
    SELECT id FROM ecc_projects
    WHERE slug = 'llnd-automate'
    LIMIT 1
  )
WHERE ewo_ref IN (
  'EWO-029',
  'EWO-030',
  'EWO-030R.1',
  'EWO-031',
  'EWO-032',
  'EWO-027R.1',
  'EWO-027R.1R',
  'EWO-027R.1R.1',
  'BUG-006'
)
AND tenant_id IS NULL;

-- Test artefacts are NOT backfilled — they remain NULL and will be hidden by RLS

-- ─── 7. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ewo_tenant_project_status
  ON engineering_work_orders (tenant_id, project_id, status);

CREATE INDEX IF NOT EXISTS idx_ewo_active_lookup
  ON engineering_work_orders (project_id, status)
  WHERE status NOT IN ('closed', 'archived', 'cancelled', 'rejected');
