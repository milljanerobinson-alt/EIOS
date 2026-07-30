/*
# Extend quiz abandonment audit policy to include declaration accepted events

## Change
Replaces the existing "audit_trail_insert_quiz_abandonment" policy with an
updated version that also permits `lln.declaration_accepted` and
`digital.declaration_accepted` event types.

This allows the AssessmentDeclarationScreen (which uses a quiz-token anon client)
to record when a candidate agrees to the assessment declaration in the audit trail,
making it visible in the Activity Timeline.

All four event types remain scoped to the specific invitation matching the
request's quiz token — same security model as before.
*/

DROP POLICY IF EXISTS "audit_trail_insert_quiz_abandonment" ON audit_trail;
CREATE POLICY "audit_trail_insert_quiz_abandonment" ON audit_trail
  FOR INSERT TO anon
  WITH CHECK (
    event_type IN (
      'lln.abandoned',
      'digital.abandoned',
      'lln.declaration_accepted',
      'digital.declaration_accepted'
    )
    AND invitation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM assessment_invitations inv
      WHERE inv.id = invitation_id
        AND (
          inv.unique_token::text  = get_quiz_token()
          OR (inv.lln_token     IS NOT NULL AND inv.lln_token::text     = get_quiz_token())
          OR (inv.digital_token IS NOT NULL AND inv.digital_token::text = get_quiz_token())
        )
    )
  );
