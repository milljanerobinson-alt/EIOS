-- EWO-027R.Y — Allow anon SELECT on atd_connect_capabilities
-- discover_atd_capabilities returns read-only public capability metadata.
-- The MCP dev self-test mode uses the anon key and needs to read this table.
-- This is reference data (capability registry), not governed engineering data.

CREATE POLICY "atd_select_capabilities_anon"
  ON atd_connect_capabilities FOR SELECT
  TO anon USING (true);
