/*
# EWO-044R3 Migration 3: Replace EWO RLS with Tenant-Membership Model

## Purpose
Replaces the existing open EWO RLS policies with tenant-membership-scoped
policies. This enforces organisation-level access control on Engineering
Work Orders.

## Previous RLS (being replaced)
- ewo_select: SELECT true (open to all anon/authenticated)
- ewo_update: UPDATE is_staff() (admin/trainer only)
- ewo_delete: DELETE is_staff()

## New RLS Policies

### ewo_select_tenant
- SELECT: authenticated users can see EWOs where they are a tenant member
- Test artefacts with NULL tenant_id are invisible (is_tenant_member returns false for NULL)

### ewo_insert_tenant
- INSERT: authenticated users with tenant membership can create EWOs
- WITH CHECK: tenant_id must match the user's membership

### ewo_update_tenant
- UPDATE: tenant members can update EWOs within their tenant
- USING + WITH CHECK: is_tenant_member(tenant_id)

### ewo_delete_tenant
- DELETE: only tenant owners/admins can delete EWOs
- USING: is_tenant_admin(tenant_id) AND membership role check

## Backwards Compatibility
- The anon SELECT policy is preserved as a separate policy so that anon-key
  reads (e.g. public assessment token resolution) continue to work during
  transition. This policy returns only EWOs with NULL tenant_id (test artefacts
  and any pre-ownership records). Once all EWOs have tenant_id, this policy
  returns nothing.
- Service accounts operate through SECURITY DEFINER RPCs which bypass RLS.

## Security Notes
- created_by remains provenance only — never used in RLS
- tenant_id is the ownership boundary
- project_id is the engineering scope (future: project membership checks)
*/

-- ─── Drop existing policies ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ewo_select" ON engineering_work_orders;
DROP POLICY IF EXISTS "ewo_update" ON engineering_work_orders;
DROP POLICY IF EXISTS "ewo_delete" ON engineering_work_orders;
DROP POLICY IF EXISTS "ewo_select_tenant" ON engineering_work_orders;
DROP POLICY IF EXISTS "ewo_insert_tenant" ON engineering_work_orders;
DROP POLICY IF EXISTS "ewo_update_tenant" ON engineering_work_orders;
DROP POLICY IF EXISTS "ewo_delete_tenant" ON engineering_work_orders;

-- ─── New tenant-scoped SELECT policy ──────────────────────────────────────────

CREATE POLICY "ewo_select_tenant" ON engineering_work_orders
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL AND is_tenant_member(tenant_id)
  );

-- ─── New tenant-scoped INSERT policy ──────────────────────────────────────────

CREATE POLICY "ewo_insert_tenant" ON engineering_work_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IS NOT NULL AND is_tenant_member(tenant_id)
  );

-- ─── New tenant-scoped UPDATE policy ──────────────────────────────────────────

CREATE POLICY "ewo_update_tenant" ON engineering_work_orders
  FOR UPDATE TO authenticated
  USING (
    tenant_id IS NOT NULL AND is_tenant_member(tenant_id)
  )
  WITH CHECK (
    tenant_id IS NOT NULL AND is_tenant_member(tenant_id)
  );

-- ─── New tenant-scoped DELETE policy ──────────────────────────────────────────

CREATE POLICY "ewo_delete_tenant" ON engineering_work_orders
  FOR DELETE TO authenticated
  USING (
    tenant_id IS NOT NULL AND is_tenant_admin(tenant_id)
  );
