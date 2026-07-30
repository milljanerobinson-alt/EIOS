/*
# Corrective: Restore get_my_role() as SECURITY DEFINER to Prevent RLS Recursion

## Purpose
Corrects the previous migration that switched `get_my_role()` to SECURITY INVOKER.
That change would cause infinite RLS recursion: the `profiles_select_staff` policy
calls `get_my_role()`, which as SECURITY INVOKER queries `profiles`, triggering RLS
again, which calls `get_my_role()` again.

## Correct Approach
- Keep `get_my_role()` as SECURITY DEFINER — this is intentional to break the
  recursion cycle. The function runs as the table owner, bypassing RLS on profiles
  for its simple `SELECT role WHERE id = auth.uid()` query.
- Revoke EXECUTE from `authenticated` and `anon` — this prevents direct calls via
  `/rest/v1/rpc/get_my_role` (the security vulnerability).
- RLS policy expressions can still call the function internally because PostgreSQL
  does not check EXECUTE privileges for function calls within policy expressions.
- Grant EXECUTE only to `service_role` for server-side use.

## Security Outcome
- Authenticated users CANNOT call `get_my_role()` directly via REST API.
- RLS policies that use `get_my_role()` continue to work for authenticated users.
- No recursion because SECURITY DEFINER bypasses RLS on the internal profiles query.
*/

CREATE OR REPLACE FUNCTION public.get_my_role()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $function$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$function$;

-- Revoke EXECUTE from authenticated and anon (prevents direct REST calls)
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM anon;

-- Grant EXECUTE only to service_role (server-side use)
GRANT EXECUTE ON FUNCTION public.get_my_role() TO service_role;
