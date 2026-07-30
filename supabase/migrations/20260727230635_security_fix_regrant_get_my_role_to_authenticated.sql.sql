/*
# Fix: Re-grant EXECUTE on get_my_role() to authenticated

## Purpose
The security hardening migration revoked EXECUTE on get_my_role() from both
`authenticated` and `anon`. This broke all RLS policies that call get_my_role()
internally — when an authenticated user queries a table whose SELECT policy uses
get_my_role(), PostgreSQL checks EXECUTE privileges and denies the call, causing
the policy to fail silently. This made profiles (and 50+ other tables) appear
empty to authenticated users, which cascaded into the EIOS root redirecting to
/llnd#/assessment/dashboard because profile resolution returned null.

## Fix
- Re-grant EXECUTE to `authenticated` — this is required for RLS policy
  expressions that call get_my_role() to function for signed-in users.
- Keep EXECUTE revoked from `anon` — anonymous users never need role checks.
- Keep `service_role` and `postgres` grants for server-side use.
- The function remains SECURITY DEFINER (intentional, prevents RLS recursion).
*/

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
