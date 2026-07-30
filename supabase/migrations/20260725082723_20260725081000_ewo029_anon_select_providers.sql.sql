/*
# EWO-029 Fix — Allow anon SELECT on execution_provider_registry

1. Purpose
   The execution provider registry is read-only reference data.
   The ATD Connect inspection services need to read it without
   an authenticated session (the MCP server uses the anon key).
   Add anon to the SELECT policy.

2. Tables affected
   - execution_provider_registry (RLS policy update)

3. Security
   - SELECT only (no INSERT/UPDATE/DELETE for anon)
   - Provider config may contain non-sensitive metadata only
*/

DROP POLICY IF EXISTS "select_providers_authenticated" ON execution_provider_registry;
CREATE POLICY "select_providers_authenticated" ON execution_provider_registry
  FOR SELECT TO anon, authenticated USING (true);
