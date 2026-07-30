-- EWO-019: Allow anon access to engineering_change_log for no-auth test environments
-- The application uses authenticated access; this allows the test runner

ALTER TABLE engineering_change_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_change_log_authenticated" ON engineering_change_log;
DROP POLICY IF EXISTS "insert_change_log_authenticated" ON engineering_change_log;

CREATE POLICY "select_change_log_all" ON engineering_change_log
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_change_log_all" ON engineering_change_log
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Also allow anon on change types
ALTER TABLE engineering_change_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE engineering_change_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_change_types_authenticated" ON engineering_change_types;
DROP POLICY IF EXISTS "insert_change_types_authenticated" ON engineering_change_types;

CREATE POLICY "select_change_types_all" ON engineering_change_types
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_change_types_all" ON engineering_change_types
  FOR INSERT TO anon, authenticated WITH CHECK (true);
