-- Fix assessment_responses RLS: use get_quiz_token() which correctly parses
-- JSON headers (PostgREST exposes all headers as a single JSON object, not
-- individual GUC settings). The old policies used
-- current_setting('request.headers.x-quiz-token', true)::uuid which always
-- returned null, silently blocking all anon inserts and selects.

DROP POLICY IF EXISTS "responses_select_by_token" ON assessment_responses;
DROP POLICY IF EXISTS "responses_insert_by_token" ON assessment_responses;
DROP POLICY IF EXISTS "responses_update_by_token" ON assessment_responses;

CREATE POLICY "responses_select_by_token" ON assessment_responses
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessment_invitations inv
      WHERE inv.id = assessment_responses.invitation_id
      AND (
        inv.unique_token::text = get_quiz_token()
        OR (inv.lln_token IS NOT NULL AND inv.lln_token::text = get_quiz_token())
        OR (inv.digital_token IS NOT NULL AND inv.digital_token::text = get_quiz_token())
      )
    )
  );

CREATE POLICY "responses_insert_by_token" ON assessment_responses
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assessment_invitations inv
      WHERE inv.id = assessment_responses.invitation_id
      AND (
        inv.unique_token::text = get_quiz_token()
        OR (inv.lln_token IS NOT NULL AND inv.lln_token::text = get_quiz_token())
        OR (inv.digital_token IS NOT NULL AND inv.digital_token::text = get_quiz_token())
      )
    )
  );

CREATE POLICY "responses_update_by_token" ON assessment_responses
  FOR UPDATE TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessment_invitations inv
      WHERE inv.id = assessment_responses.invitation_id
      AND (
        inv.unique_token::text = get_quiz_token()
        OR (inv.lln_token IS NOT NULL AND inv.lln_token::text = get_quiz_token())
        OR (inv.digital_token IS NOT NULL AND inv.digital_token::text = get_quiz_token())
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.assessment_invitations inv
      WHERE inv.id = assessment_responses.invitation_id
      AND (
        inv.unique_token::text = get_quiz_token()
        OR (inv.lln_token IS NOT NULL AND inv.lln_token::text = get_quiz_token())
        OR (inv.digital_token IS NOT NULL AND inv.digital_token::text = get_quiz_token())
      )
    )
  );
