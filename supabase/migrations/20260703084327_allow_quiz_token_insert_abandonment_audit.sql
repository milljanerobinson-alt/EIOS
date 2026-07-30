/*
# Allow quiz token clients to record quiz abandonment events in audit_trail

## Background
The audit_trail public INSERT policy was removed in a security hardening pass
(fix_rls_security_policies). This migration re-opens a narrow, scoped INSERT
path for anon quiz-token clients — restricted to the two abandonment event types
only, and only for the specific invitation whose token matches the request header.

## Changes

### audit_trail
- Adds INSERT policy `audit_trail_insert_quiz_abandonment` for `anon` role.
- Policy allows inserting ONLY rows where:
  - event_type is 'lln.abandoned' or 'digital.abandoned'
  - invitation_id is not null
  - The invitation matches the quiz token in the request header (via get_quiz_token())
    — checked against unique_token, lln_token, or digital_token.

## Security notes
- Scoped to exactly two event types; all other audit events remain staff/service-only.
- Token check mirrors the existing pattern used by axcelerate_writeback_queue and
  assessment_invitations to prevent a quiz client inserting rows for other invitations.
*/

DROP POLICY IF EXISTS "audit_trail_insert_quiz_abandonment" ON audit_trail;
CREATE POLICY "audit_trail_insert_quiz_abandonment" ON audit_trail
  FOR INSERT TO anon
  WITH CHECK (
    event_type IN ('lln.abandoned', 'digital.abandoned')
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
