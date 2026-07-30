/*
# EWO-029 Fix — Allow anon SELECT on supervised execution tables

1. Purpose
   The ATD Connect inspection services read execution packages,
   records, and pipeline events via the anon key (MCP server).
   Add anon to the SELECT policies for these read-only inspection tables.

2. Tables affected
   - supervised_execution_packages (SELECT policy)
   - supervised_execution_records (SELECT policy)
   - execution_pipeline_events (SELECT policy)

3. Security
   - SELECT only for anon (no INSERT/UPDATE/DELETE)
*/

DROP POLICY IF EXISTS "select_packages_authenticated" ON supervised_execution_packages;
CREATE POLICY "select_packages_authenticated" ON supervised_execution_packages
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_packages_authenticated" ON supervised_execution_packages;
CREATE POLICY "insert_packages_authenticated" ON supervised_execution_packages
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_packages_authenticated" ON supervised_execution_packages;
CREATE POLICY "update_packages_authenticated" ON supervised_execution_packages
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "select_exec_records_authenticated" ON supervised_execution_records;
CREATE POLICY "select_exec_records_authenticated" ON supervised_execution_records
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_exec_records_authenticated" ON supervised_execution_records;
CREATE POLICY "insert_exec_records_authenticated" ON supervised_execution_records
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_exec_records_authenticated" ON supervised_execution_records;
CREATE POLICY "update_exec_records_authenticated" ON supervised_execution_records
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "select_pipeline_events_authenticated" ON execution_pipeline_events;
CREATE POLICY "select_pipeline_events_authenticated" ON execution_pipeline_events
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_pipeline_events_authenticated" ON execution_pipeline_events;
CREATE POLICY "insert_pipeline_events_authenticated" ON execution_pipeline_events
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_pipeline_events_authenticated" ON execution_pipeline_events;
CREATE POLICY "update_pipeline_events_authenticated" ON execution_pipeline_events
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
