/*
# EWO-029 Fix — Allow anon INSERT on supervised_execution_packages

1. Purpose
   The ATD MCP server (anon key) needs to create execution packages
   via the inspection services. Add anon to INSERT policy.

2. Tables affected
   - supervised_execution_packages (INSERT policy)

3. Security
   - INSERT only for anon (no UPDATE/DELETE)
*/

DROP POLICY IF EXISTS "insert_packages_authenticated" ON supervised_execution_packages;
CREATE POLICY "insert_packages_authenticated" ON supervised_execution_packages
  FOR INSERT TO anon, authenticated WITH CHECK (true);
