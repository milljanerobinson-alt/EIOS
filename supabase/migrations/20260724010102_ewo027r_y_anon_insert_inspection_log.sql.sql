-- EWO-027R.Y — Allow anon INSERT on atd_connect_inspection_log
-- The MCP dev self-test mode (anon key) needs to insert audit records
-- for discover_atd_capabilities invocations. This is a controlled insert
-- from the edge function server-side, not a public write endpoint.

CREATE POLICY "atd_insert_inspection_log_anon"
  ON atd_connect_inspection_log FOR INSERT
  TO anon WITH CHECK (true);
