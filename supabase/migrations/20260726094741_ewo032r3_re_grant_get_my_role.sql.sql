-- Re-grant EXECUTE on get_my_role() to authenticated.
-- This was revoked in phase 2, but RLS policy evaluation requires EXECUTE permission
-- on functions called from policies. get_my_role() is called from profiles_select_staff
-- and many other RLS policies. It must stay SECURITY DEFINER (switching to INVOKER would
-- cause infinite RLS recursion on profiles) and must have EXECUTE granted to authenticated.
-- The function only returns the caller's own role — no privilege escalation risk.
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
