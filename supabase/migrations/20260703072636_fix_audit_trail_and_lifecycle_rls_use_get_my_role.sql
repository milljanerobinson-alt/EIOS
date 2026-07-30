
-- Fix audit_trail SELECT policy to use get_my_role() (security definer, no recursion)
DROP POLICY IF EXISTS "audit_trail_select_staff" ON audit_trail;
CREATE POLICY "audit_trail_select_staff" ON audit_trail
  FOR SELECT TO authenticated
  USING (get_my_role() = ANY(ARRAY['admin', 'trainer']));

-- Fix student_lifecycle_events SELECT policy the same way
DROP POLICY IF EXISTS "lifecycle_select_staff" ON student_lifecycle_events;
CREATE POLICY "lifecycle_select_staff" ON student_lifecycle_events
  FOR SELECT TO authenticated
  USING (get_my_role() = ANY(ARRAY['admin', 'trainer']));
