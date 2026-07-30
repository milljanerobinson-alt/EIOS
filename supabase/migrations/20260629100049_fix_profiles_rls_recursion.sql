-- Fix infinite recursion in profiles RLS policies.
-- The problem: policies on `profiles` that subquery `profiles` to check role
-- cause infinite recursion. Fix: use a SECURITY DEFINER function that reads
-- the role bypassing RLS.

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Fix profiles_select_staff (was querying profiles inside a profiles SELECT policy)
DROP POLICY IF EXISTS "profiles_select_staff" ON profiles;
CREATE POLICY "profiles_select_staff" ON profiles
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'trainer'));

-- Fix profiles_update_admin (same recursion pattern)
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- Fix settings policies (same pattern — avoids future recursion)
DROP POLICY IF EXISTS "settings_select_staff" ON settings;
CREATE POLICY "settings_select_staff" ON settings
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'trainer'));

DROP POLICY IF EXISTS "settings_modify_staff" ON settings;
CREATE POLICY "settings_modify_staff" ON settings
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'trainer'));

DROP POLICY IF EXISTS "settings_update_staff" ON settings;
CREATE POLICY "settings_update_staff" ON settings
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'trainer'))
  WITH CHECK (get_my_role() IN ('admin', 'trainer'));
