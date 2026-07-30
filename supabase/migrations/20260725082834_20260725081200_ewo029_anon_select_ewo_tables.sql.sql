/*
# EWO-029 Fix — Allow anon SELECT on engineering_work_orders and ewo_execution_approvals

1. Purpose
   The ATD MCP server and inspection services use the anon key to
   read engineering work orders and execution approvals for
   governance gate evaluation and inspection. Add anon to SELECT.

2. Tables affected
   - engineering_work_orders (SELECT policy)
   - ewo_execution_approvals (SELECT policy)

3. Security
   - SELECT only for anon (no INSERT/UPDATE/DELETE)
*/

-- engineering_work_orders: add anon to existing SELECT policy
DROP POLICY IF EXISTS "ewo_select" ON engineering_work_orders;
CREATE POLICY "ewo_select" ON engineering_work_orders
  FOR SELECT TO anon, authenticated USING (true);

-- ewo_execution_approvals: add anon to existing SELECT policy
DROP POLICY IF EXISTS "select_execution_approvals" ON ewo_execution_approvals;
CREATE POLICY "select_execution_approvals" ON ewo_execution_approvals
  FOR SELECT TO anon, authenticated USING (true);
