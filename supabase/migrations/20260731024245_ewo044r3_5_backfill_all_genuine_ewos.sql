/*
# EWO-044R3 Migration 5: Backfill All Genuine EWOs

## Purpose
The initial backfill only covered the 10 active genuine EWOs. There are 97 closed
and 1 archived genuine EWOs that also need ownership assignment for canonical
consistency. Test artefacts remain excluded.

## Backfill
- All EWOs where ewo_ref does NOT contain 'TEST' get tenant_id + project_id
- Test artefacts (ewo_ref containing 'TEST') remain NULL

## Security
No RLS or schema changes. Data-only update.
*/

UPDATE engineering_work_orders
SET
  tenant_id = (SELECT id FROM eios_tenants WHERE slug = 'eios'),
  project_id = (
    SELECT id FROM ecc_projects
    WHERE slug = 'llnd-automate'
    LIMIT 1
  )
WHERE tenant_id IS NULL
AND ewo_ref NOT LIKE '%TEST%';
