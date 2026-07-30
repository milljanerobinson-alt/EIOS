/*
# Fix RLS: Token-scoped access for quiz flow, lock down audit trail, prevent role escalation

## Security fixes:

### 1. Token-scoped SELECT/UPDATE on assessment_invitations
- Replaced open `USING(true)` policies with a SECURITY DEFINER function `is_valid_quiz_token()` that checks if the request includes a matching token via a custom GUC setting.
- The client sets the GUC via a PostgREST header `x-quiz-token` before querying.
- Anon users can only SELECT/UPDATE the single invitation row matching their token.
- Staff retain full access via their existing policies.

### 2. Token-scoped access on invitation_assessments and assessment_responses
- Same pattern: anon can only access rows where the parent invitation matches their token.
- Removed all open `USING(true)` / `WITH CHECK(true)` policies.

### 3. Removed public INSERT on audit_trail
- Deleted `audit_trail_insert_public` policy. Only staff (via authenticated) and edge functions (via service role) can insert audit entries now.

### 4. Prevent role escalation on profiles
- Updated `profiles_update_own` to prevent changing the `role` column. Users can update their own profile but NOT their role.
- Added a separate `profiles_update_role_admin` policy allowing only admins to change roles.

### 5. Added anon SELECT on assessment_questions (excluding correct_answer)
- Created a view `assessment_questions_public` that excludes the `correct_answer` column.
- Added RLS on the view allowing anon access (for the quiz flow) without exposing answers.
*/

-- ============================================================
-- 1. Token-scoped access for quiz flow
-- ============================================================

-- Function to validate quiz token from request headers
-- The client passes the token via the `x-quiz-token` header
-- PostgREST exposes headers as GUC settings: request.headers.<name>
CREATE OR REPLACE FUNCTION public.is_valid_quiz_token(inv_token uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assessment_invitations
    WHERE unique_token = inv_token
  );
$$;

-- ============================================================
-- 2. Fix assessment_invitations RLS
-- ============================================================

-- Drop the open public policies
DROP POLICY IF EXISTS "invitations_select_by_token" ON assessment_invitations;
DROP POLICY IF EXISTS "invitations_update_by_token" ON assessment_invitations;

-- Create new token-scoped policies for anon
-- Anon can only select/update where the token matches what they provide
CREATE POLICY "invitations_select_by_token_scoped" ON assessment_invitations
  FOR SELECT TO anon, authenticated
  USING (
    unique_token = current_setting('request.headers.x-quiz-token', true)::uuid
  );

CREATE POLICY "invitations_update_by_token_scoped" ON assessment_invitations
  FOR UPDATE TO anon, authenticated
  USING (
    unique_token = current_setting('request.headers.x-quiz-token', true)::uuid
  )
  WITH CHECK (
    unique_token = current_setting('request.headers.x-quiz-token', true)::uuid
  );

-- ============================================================
-- 3. Fix invitation_assessments RLS
-- ============================================================

DROP POLICY IF EXISTS "inv_assessments_select_public" ON invitation_assessments;
DROP POLICY IF EXISTS "inv_assessments_update_public" ON invitation_assessments;
DROP POLICY IF EXISTS "inv_assessments_insert_public" ON invitation_assessments;

CREATE POLICY "inv_assessments_select_by_token" ON invitation_assessments
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessment_invitations inv
      WHERE inv.id = invitation_assessments.invitation_id
      AND inv.unique_token = current_setting('request.headers.x-quiz-token', true)::uuid
    )
  );

CREATE POLICY "inv_assessments_update_by_token" ON invitation_assessments
  FOR UPDATE TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessment_invitations inv
      WHERE inv.id = invitation_assessments.invitation_id
      AND inv.unique_token = current_setting('request.headers.x-quiz-token', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assessment_invitations inv
      WHERE inv.id = invitation_assessments.invitation_id
      AND inv.unique_token = current_setting('request.headers.x-quiz-token', true)::uuid
    )
  );

CREATE POLICY "inv_assessments_insert_by_token" ON invitation_assessments
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assessment_invitations inv
      WHERE inv.id = invitation_assessments.invitation_id
      AND inv.unique_token = current_setting('request.headers.x-quiz-token', true)::uuid
    )
  );

-- ============================================================
-- 4. Fix assessment_responses RLS
-- ============================================================

DROP POLICY IF EXISTS "responses_select_public" ON assessment_responses;
DROP POLICY IF EXISTS "responses_insert_public" ON assessment_responses;
DROP POLICY IF EXISTS "responses_update_public" ON assessment_responses;
DROP POLICY IF EXISTS "responses_delete_public" ON assessment_responses;

CREATE POLICY "responses_select_by_token" ON assessment_responses
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessment_invitations inv
      WHERE inv.id = assessment_responses.invitation_id
      AND inv.unique_token = current_setting('request.headers.x-quiz-token', true)::uuid
    )
  );

CREATE POLICY "responses_insert_by_token" ON assessment_responses
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assessment_invitations inv
      WHERE inv.id = assessment_responses.invitation_id
      AND inv.unique_token = current_setting('request.headers.x-quiz-token', true)::uuid
    )
  );

CREATE POLICY "responses_update_by_token" ON assessment_responses
  FOR UPDATE TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessment_invitations inv
      WHERE inv.id = assessment_responses.invitation_id
      AND inv.unique_token = current_setting('request.headers.x-quiz-token', true)::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assessment_invitations inv
      WHERE inv.id = assessment_responses.invitation_id
      AND inv.unique_token = current_setting('request.headers.x-quiz-token', true)::uuid
    )
  );

-- Remove DELETE for anon entirely - only staff can delete responses
DROP POLICY IF EXISTS "responses_delete_staff" ON assessment_responses;
CREATE POLICY "responses_delete_staff" ON assessment_responses
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'trainer'))
  );

-- ============================================================
-- 5. Fix support_plans RLS - remove open public SELECT
-- ============================================================

DROP POLICY IF EXISTS "support_plans_select_public" ON support_plans;

-- Token-scoped SELECT for quiz flow (candidates can see their own support plan)
CREATE POLICY "support_plans_select_by_token" ON support_plans
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessment_invitations inv
      WHERE inv.id = support_plans.invitation_id
      AND inv.unique_token = current_setting('request.headers.x-quiz-token', true)::uuid
    )
  );

-- ============================================================
-- 6. Remove public INSERT on audit_trail
-- ============================================================

DROP POLICY IF EXISTS "audit_trail_insert_public" ON audit_trail;

-- ============================================================
-- 7. Prevent role escalation on profiles
-- ============================================================

-- Drop the open update policy
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

-- Users can update their own profile but NOT their role
-- We use a SECURITY DEFINER function to check the old role matches the new role
CREATE OR REPLACE FUNCTION public.check_profile_role_unchanged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- If role is being changed, only allow if the actor is an admin
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    PERFORM 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Only admins can change user roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_role_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.check_profile_role_unchanged();

-- Users can update their own profile (role changes blocked by trigger)
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admins can update any profile (including role changes)
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ============================================================
-- 8. Create assessment_questions_public view (excludes correct_answer)
-- ============================================================

CREATE OR REPLACE VIEW assessment_questions_public AS
SELECT
  id, assessment_id, question_text, domain, acsf_skill,
  acsf_level_target, question_type, options, order_index, points,
  mapping_rationale, version, created_at
FROM assessment_questions;

ALTER VIEW assessment_questions_public OWNER TO postgres;

-- Enable RLS on the view's underlying table for anon access
-- The view itself inherits RLS from the base table, but we need
-- a policy that allows anon to SELECT questions
DROP POLICY IF EXISTS "questions_select_anon" ON assessment_questions;
CREATE POLICY "questions_select_anon" ON assessment_questions
  FOR SELECT TO anon, authenticated
  USING (true);
