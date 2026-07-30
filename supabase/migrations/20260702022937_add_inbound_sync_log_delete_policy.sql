CREATE POLICY "inbound_sync_log_delete_staff" ON axcelerate_inbound_sync_log
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','trainer')));