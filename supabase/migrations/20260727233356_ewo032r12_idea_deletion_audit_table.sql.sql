/*
 * EWO-032R.12: Engineering Idea deletion audit table.
 * Preserves a permanent audit record when an Engineering Idea is permanently deleted,
 * including the deletion reason and dependency analysis at time of deletion.
 */

CREATE TABLE IF NOT EXISTS public.idea_deletion_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_ref     text    NOT NULL,
  idea_title   text   NOT NULL,
  idea_id      uuid   NOT NULL,
  deleted_by   text   NOT NULL,
  reason       text   NOT NULL,
  dependencies jsonb  NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.idea_deletion_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_idea_deletion_audit"
  ON public.idea_deletion_audit FOR SELECT TO anon, authenticated
  USING (is_staff());

CREATE POLICY "anon_insert_idea_deletion_audit"
  ON public.idea_deletion_audit FOR INSERT TO anon, authenticated
  WITH CHECK (is_staff());

REVOKE UPDATE, DELETE ON public.idea_deletion_audit FROM anon, authenticated;
