-- Fix token-based RLS policies to use JSON extraction from request.headers
-- PostgREST exposes all headers as a single JSON object via current_setting('request.headers', true)
-- Individual headers are NOT accessible via dot notation

CREATE OR REPLACE FUNCTION public.get_quiz_token()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    current_setting('request.headers', true)::jsonb->>'x-quiz-token',
    ''
  );
$$;

-- Fix assessment_invitations SELECT policy
DROP POLICY IF EXISTS "invitations_select_by_token_scoped" ON assessment_invitations;
CREATE POLICY "invitations_select_by_token_scoped" ON assessment_invitations
  FOR SELECT TO anon, authenticated
  USING (
    unique_token::text = get_quiz_token()
    OR (lln_token IS NOT NULL AND lln_token::text = get_quiz_token())
    OR (digital_token IS NOT NULL AND digital_token::text = get_quiz_token())
  );

-- Fix assessment_invitations UPDATE policy
DROP POLICY IF EXISTS "invitations_update_by_token_scoped" ON assessment_invitations;
CREATE POLICY "invitations_update_by_token_scoped" ON assessment_invitations
  FOR UPDATE TO anon, authenticated
  USING (
    unique_token::text = get_quiz_token()
    OR (lln_token IS NOT NULL AND lln_token::text = get_quiz_token())
    OR (digital_token IS NOT NULL AND digital_token::text = get_quiz_token())
  )
  WITH CHECK (
    unique_token::text = get_quiz_token()
    OR (lln_token IS NOT NULL AND lln_token::text = get_quiz_token())
    OR (digital_token IS NOT NULL AND digital_token::text = get_quiz_token())
  );

-- Fix student_responses policies
DROP POLICY IF EXISTS "student_responses_select_by_token" ON student_responses;
CREATE POLICY "student_responses_select_by_token" ON student_responses
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assessment_invitations inv
      WHERE inv.id = student_responses.invitation_id
      AND (
        inv.unique_token::text = get_quiz_token()
        OR (inv.lln_token IS NOT NULL AND inv.lln_token::text = get_quiz_token())
        OR (inv.digital_token IS NOT NULL AND inv.digital_token::text = get_quiz_token())
      )
    )
  );

DROP POLICY IF EXISTS "student_responses_insert_by_token" ON student_responses;
CREATE POLICY "student_responses_insert_by_token" ON student_responses
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assessment_invitations inv
      WHERE inv.id = student_responses.invitation_id
      AND (
        inv.unique_token::text = get_quiz_token()
        OR (inv.lln_token IS NOT NULL AND inv.lln_token::text = get_quiz_token())
        OR (inv.digital_token IS NOT NULL AND inv.digital_token::text = get_quiz_token())
      )
    )
  );
