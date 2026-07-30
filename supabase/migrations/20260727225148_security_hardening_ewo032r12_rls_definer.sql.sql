/*
# Security Hardening — Fix RLS and SECURITY DEFINER Function

## Purpose
Fixes two security vulnerabilities that can be corrected via SQL migration:

1. RLS Policy Always True on `ewo_deletion_audit` (INSERT and SELECT)
   - The INSERT policy `authenticated_insert_ewo_deletion_audit` had `WITH CHECK (true)`,
     allowing any authenticated user to insert arbitrary audit records.
   - The SELECT policy `authenticated_select_ewo_deletion_audit` had `USING (true)`,
     allowing any authenticated user to read all deletion audit records.
   - Both are replaced with ownership-scoped policies using a new `requested_by_uid`
     column that stores the authenticated user's UUID via `auth.uid()`.

2. SECURITY DEFINER Function `get_my_role()` Executable by `authenticated`
   - The function runs with the privileges of the table owner (SECURITY DEFINER),
     which is unnecessary for a simple `SELECT role FROM profiles WHERE id = auth.uid()`.
   - Switched to SECURITY INVOKER so it runs with the caller's privileges.
   - EXECUTE is revoked from `authenticated` and `anon` to prevent access via REST.
   - Re-granted only to `service_role` (server-side use).

## Note on Leaked Password Protection
The HaveIBeenPwned password check (`password_hibp_enabled`) is a Supabase Auth
configuration setting that cannot be toggled via SQL in this environment. It must
be enabled in the Supabase Dashboard under Authentication > Settings, or via the
Supabase Management API. This migration addresses the two database-level issues;
the password protection setting is documented for manual enablement.

## Changes

### Table: `public.ewo_deletion_audit`
- New column: `requested_by_uid` (uuid, nullable) — stores the authenticated user's UUID
  for ownership-based RLS. Nullable so existing rows are not lost.
- New column: `bypass_applied` (boolean, NOT NULL, DEFAULT false) — added in EWO-032R.12
  but missing from the original table creation. Required for audit completeness.
- INSERT policy: replaced `WITH CHECK (true)` with `WITH CHECK (auth.uid() = requested_by_uid)`
- SELECT policy: replaced `USING (true)` with `USING (auth.uid() = requested_by_uid)`

### Function: `public.get_my_role()`
- Changed from SECURITY DEFINER to SECURITY INVOKER
- Revoked EXECUTE from `authenticated` and `anon`
- Re-granted EXECUTE to `service_role` only

## Security Notes
- The `requested_by_uid` column is nullable to avoid data loss on existing rows.
  New inserts from the EWO-032R.12 service will populate it.
- Existing audit rows with NULL `requested_by_uid` will be invisible to authenticated
  users via RLS. Server-side code using the service role key bypasses RLS and can
  still read all rows.
- `get_my_role()` as SECURITY INVOKER still works because the `profiles` table has
  a SELECT policy allowing users to read their own profile row.
*/

-- ─── 1. Fix ewo_deletion_audit RLS ───────────────────────────────────────────

-- Add ownership column for RLS (nullable to preserve existing rows)
ALTER TABLE public.ewo_deletion_audit
  ADD COLUMN IF NOT EXISTS requested_by_uid uuid,
  ADD COLUMN IF NOT EXISTS bypass_applied boolean NOT NULL DEFAULT false;

-- Drop the unrestricted INSERT policy and replace with ownership-scoped policy
DROP POLICY IF EXISTS "authenticated_insert_ewo_deletion_audit" ON public.ewo_deletion_audit;
CREATE POLICY "authenticated_insert_ewo_deletion_audit" ON public.ewo_deletion_audit
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requested_by_uid);

-- Drop the unrestricted SELECT policy and replace with ownership-scoped policy
DROP POLICY IF EXISTS "authenticated_select_ewo_deletion_audit" ON public.ewo_deletion_audit;
CREATE POLICY "authenticated_select_ewo_deletion_audit" ON public.ewo_deletion_audit
  FOR SELECT TO authenticated
  USING (auth.uid() = requested_by_uid);

-- ─── 2. Fix get_my_role() SECURITY DEFINER ───────────────────────────────────

-- Switch to SECURITY INVOKER and revoke public/authenticated execute
CREATE OR REPLACE FUNCTION public.get_my_role()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
  SET search_path TO 'public', 'extensions'
AS $function$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$function$;

-- Revoke EXECUTE from authenticated and anon
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM anon;

-- Grant EXECUTE only to service_role (server-side use)
GRANT EXECUTE ON FUNCTION public.get_my_role() TO service_role;
