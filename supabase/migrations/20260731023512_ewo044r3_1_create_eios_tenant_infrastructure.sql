/*
# EWO-044R3 Migration 1: Create EIOS Tenant Infrastructure

## Purpose
Establishes the canonical organisation/account boundary for the EIOS platform.
Per constitutional amendment CD-008, EIOS is the platform layer. This migration
creates the platform-level tenant (organisation) infrastructure.

Database tables use the canonical "tenant" naming. The platform UI, documentation,
and APIs expose these as "Organisation" to users.

## New Tables

### eios_tenants
- id (uuid, PK) — canonical organisation identifier
- name (text, NOT NULL) — organisation display name
- slug (text, NOT NULL, UNIQUE) — URL-safe identifier
- status (text, NOT NULL, default 'active') — active/suspended/archived
- created_at, updated_at (timestamptz)

### eios_tenant_memberships
- id (uuid, PK)
- tenant_id (uuid, FK → eios_tenants.id, ON DELETE CASCADE)
- user_id (uuid, FK → auth.users.id, ON DELETE CASCADE)
- role (text, NOT NULL, default 'member') — owner/admin/engineer/member
- status (text, NOT NULL, default 'active') — active/suspended
- created_at (timestamptz)
- UNIQUE (tenant_id, user_id)

### eios_service_accounts
- id (uuid, PK)
- tenant_id (uuid, FK → eios_tenants.id, ON DELETE CASCADE)
- name (text, NOT NULL) — service display name
- slug (text, NOT NULL)
- service_type (text, NOT NULL) — execution_provider/ai_provider/migration_service/scheduled_job/platform_service
- status (text, NOT NULL, default 'active')
- created_at, updated_at (timestamptz)
- UNIQUE (tenant_id, slug)

### eios_service_account_memberships
- id (uuid, PK)
- tenant_id (uuid, FK → eios_tenants.id, ON DELETE CASCADE)
- service_account_id (uuid, FK → eios_service_accounts.id, ON DELETE CASCADE)
- role (text, NOT NULL, default 'service')
- status (text, NOT NULL, default 'active')
- created_at (timestamptz)
- UNIQUE (tenant_id, service_account_id)

## Helper Functions

### is_tenant_member(p_tenant_id uuid) → boolean
Returns true if the authenticated user is an active member of the given tenant.
Service accounts operate through SECURITY DEFINER RPCs (bypass RLS), so this
function only checks human memberships via auth.uid().

### is_tenant_admin(p_tenant_id uuid) → boolean
Returns true if the authenticated user is an active owner/admin of the given tenant.

## Security
- RLS enabled on all 4 new tables.
- eios_tenants: readable by tenant members; writable by tenant admins.
- eios_tenant_memberships: readable by tenant members; insert/update by tenant admins.
- eios_service_accounts: readable by tenant members; writable by tenant admins.
- eios_service_account_memberships: readable by tenant members; writable by tenant admins.

## Seed Data
- One canonical organisation row: name='EIOS', slug='eios'
- Tenant memberships for all existing admin/trainer/product_owner/po/approver users
- Service accounts for known platform services: Codex, OpenAI, Bolt, Scheduled Briefing Runner, Engineering Automation Engine
*/

-- ─── 1. Create eios_tenants ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eios_tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  status      text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE eios_tenants ENABLE ROW LEVEL SECURITY;

-- ─── 2. Create eios_tenant_memberships ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eios_tenant_memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES eios_tenants(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member',
  status      text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

ALTER TABLE eios_tenant_memberships ENABLE ROW LEVEL SECURITY;

-- ─── 3. Create eios_service_accounts ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eios_service_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES eios_tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  slug          text NOT NULL,
  service_type  text NOT NULL,
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

ALTER TABLE eios_service_accounts ENABLE ROW LEVEL SECURITY;

-- ─── 4. Create eios_service_account_memberships ───────────────────────────────

CREATE TABLE IF NOT EXISTS eios_service_account_memberships (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES eios_tenants(id) ON DELETE CASCADE,
  service_account_id  uuid NOT NULL REFERENCES eios_service_accounts(id) ON DELETE CASCADE,
  role                text NOT NULL DEFAULT 'service',
  status              text NOT NULL DEFAULT 'active',
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, service_account_id)
);

ALTER TABLE eios_service_account_memberships ENABLE ROW LEVEL SECURITY;

-- ─── 5. Helper Functions ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_tenant_member(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM eios_tenant_memberships
    WHERE tenant_id = p_tenant_id
    AND user_id = auth.uid()
    AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION is_tenant_admin(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM eios_tenant_memberships
    WHERE tenant_id = p_tenant_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
    AND status = 'active'
  );
$$;

-- ─── 6. RLS Policies ──────────────────────────────────────────────────────────

-- eios_tenants: members can read, admins can write
DROP POLICY IF EXISTS "tenant_select_member" ON eios_tenants;
CREATE POLICY "tenant_select_member" ON eios_tenants
  FOR SELECT TO authenticated
  USING (is_tenant_member(id));

DROP POLICY IF EXISTS "tenant_insert_admin" ON eios_tenants;
CREATE POLICY "tenant_insert_admin" ON eios_tenants
  FOR INSERT TO authenticated
  WITH CHECK (is_tenant_admin(id));

DROP POLICY IF EXISTS "tenant_update_admin" ON eios_tenants;
CREATE POLICY "tenant_update_admin" ON eios_tenants
  FOR UPDATE TO authenticated
  USING (is_tenant_admin(id))
  WITH CHECK (is_tenant_admin(id));

-- eios_tenant_memberships: members can read, admins can write
DROP POLICY IF EXISTS "membership_select_member" ON eios_tenant_memberships;
CREATE POLICY "membership_select_member" ON eios_tenant_memberships
  FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "membership_insert_admin" ON eios_tenant_memberships;
CREATE POLICY "membership_insert_admin" ON eios_tenant_memberships
  FOR INSERT TO authenticated
  WITH CHECK (is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS "membership_update_admin" ON eios_tenant_memberships;
CREATE POLICY "membership_update_admin" ON eios_tenant_memberships
  FOR UPDATE TO authenticated
  USING (is_tenant_admin(tenant_id))
  WITH CHECK (is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS "membership_delete_admin" ON eios_tenant_memberships;
CREATE POLICY "membership_delete_admin" ON eios_tenant_memberships
  FOR DELETE TO authenticated
  USING (is_tenant_admin(tenant_id));

-- eios_service_accounts: members can read, admins can write
DROP POLICY IF EXISTS "svcacct_select_member" ON eios_service_accounts;
CREATE POLICY "svcacct_select_member" ON eios_service_accounts
  FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "svcacct_insert_admin" ON eios_service_accounts;
CREATE POLICY "svcacct_insert_admin" ON eios_service_accounts
  FOR INSERT TO authenticated
  WITH CHECK (is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS "svcacct_update_admin" ON eios_service_accounts;
CREATE POLICY "svcacct_update_admin" ON eios_service_accounts
  FOR UPDATE TO authenticated
  USING (is_tenant_admin(tenant_id))
  WITH CHECK (is_tenant_admin(tenant_id));

-- eios_service_account_memberships: members can read, admins can write
DROP POLICY IF EXISTS "svcacct_membership_select_member" ON eios_service_account_memberships;
CREATE POLICY "svcacct_membership_select_member" ON eios_service_account_memberships
  FOR SELECT TO authenticated
  USING (is_tenant_member(tenant_id));

DROP POLICY IF EXISTS "svcacct_membership_insert_admin" ON eios_service_account_memberships;
CREATE POLICY "svcacct_membership_insert_admin" ON eios_service_account_memberships
  FOR INSERT TO authenticated
  WITH CHECK (is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS "svcacct_membership_update_admin" ON eios_service_account_memberships;
CREATE POLICY "svcacct_membership_update_admin" ON eios_service_account_memberships
  FOR UPDATE TO authenticated
  USING (is_tenant_admin(tenant_id))
  WITH CHECK (is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS "svcacct_membership_delete_admin" ON eios_service_account_memberships;
CREATE POLICY "svcacct_membership_delete_admin" ON eios_service_account_memberships
  FOR DELETE TO authenticated
  USING (is_tenant_admin(tenant_id));

-- ─── 7. Seed Data ─────────────────────────────────────────────────────────────

-- Seed the canonical organisation
INSERT INTO eios_tenants (name, slug, status)
VALUES ('EIOS', 'eios', 'active')
ON CONFLICT (slug) DO NOTHING;

-- Seed memberships for existing authorised users (admin, trainer, product_owner, po, approver)
INSERT INTO eios_tenant_memberships (tenant_id, user_id, role, status)
SELECT
  (SELECT id FROM eios_tenants WHERE slug = 'eios'),
  p.id,
  CASE
    WHEN p.role = 'admin' THEN 'owner'
    WHEN p.role IN ('trainer', 'product_owner', 'po', 'approver') THEN 'admin'
    ELSE 'member'
  END,
  'active'
FROM profiles p
WHERE p.role IN ('admin', 'trainer', 'product_owner', 'po', 'approver')
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- Seed service accounts for known platform services
INSERT INTO eios_service_accounts (tenant_id, name, slug, service_type, status)
SELECT
  (SELECT id FROM eios_tenants WHERE slug = 'eios'),
  name, slug, service_type, 'active'
FROM (VALUES
  ('Codex', 'codex', 'execution_provider'),
  ('OpenAI', 'openai', 'ai_provider'),
  ('Bolt', 'bolt', 'execution_provider'),
  ('Scheduled Briefing Runner', 'scheduled-briefing-runner', 'scheduled_job'),
  ('Engineering Automation Engine', 'engineering-automation-engine', 'platform_service')
) AS v(name, slug, service_type)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- Seed service account memberships
INSERT INTO eios_service_account_memberships (tenant_id, service_account_id, role, status)
SELECT
  (SELECT id FROM eios_tenants WHERE slug = 'eios'),
  sa.id, 'service', 'active'
FROM eios_service_accounts sa
WHERE sa.tenant_id = (SELECT id FROM eios_tenants WHERE slug = 'eios')
ON CONFLICT (tenant_id, service_account_id) DO NOTHING;
