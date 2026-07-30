/*
# EWO-032R.14 Bugfix — Fix engineering_audit_trail in delete_engineering_idea_governed

## Root Cause
The `delete_engineering_idea_governed` RPC (created in R.12) contains:
    SELECT count(*) INTO v_audit_count
    FROM engineering_audit_trail
    WHERE entity_ref = v_idea.idea_ref;

The table `engineering_audit_trail` does NOT exist. The canonical table is
`execution_audit_trail`, which has no `entity_ref` column.

This RPC is the SIMPLE deletion path — called when an idea has no dependencies.
When a user clicks "Delete Permanently" on an idea with no deps, the frontend
calls this RPC, which hits the non-existent table and throws:
    relation "engineering_audit_trail" does not exist

## Fix
Rewrite `delete_engineering_idea_governed` to use the registry-driven
`resolve_dependency_graph` RPC for dependency checking instead of hard-coded
table queries. This aligns the simple deletion path with the R.14 registry
architecture.
*/

CREATE OR REPLACE FUNCTION public.delete_engineering_idea_governed(
  p_idea_id uuid,
  p_reason  text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_idea        engineering_idea%ROWTYPE;
  v_deleted_by  text;
  v_audit_id    uuid;
  v_audit_ref   text;
  v_dep_summary jsonb;
  v_reason_trim text;
  v_graph       jsonb;
  v_blocking_count int;
  v_total_delete   int;
BEGIN
  -- ── 1. Authentication & authorisation ──
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'UNAUTHORISED' USING ERRCODE = '42501';
  END IF;

  -- ── 2. Validate reason ──
  v_reason_trim := btrim(p_reason);
  IF length(v_reason_trim) < 10 THEN
    RAISE EXCEPTION 'REASON_TOO_SHORT' USING ERRCODE = '22023';
  END IF;

  -- ── 3. Load and lock the Idea row ──
  SELECT * INTO v_idea
  FROM engineering_idea
  WHERE id = p_idea_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IDEA_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- ── 4. Recalculate eligibility via registry-driven resolver ──
  -- Uses resolve_dependency_graph (registry-driven, no hard-coded table names)
  SELECT * INTO v_graph FROM public.resolve_dependency_graph('engineering_idea', p_idea_id);

  IF NOT (v_graph->>'success')::boolean THEN
    RETURN v_graph;
  END IF;

  v_blocking_count := COALESCE((v_graph->>'blocking_count')::int, 0);
  v_total_delete   := COALESCE((v_graph->>'total_to_delete')::int, 0);

  v_dep_summary := jsonb_build_object(
    'dependency_graph', v_graph,
    'blocking_count', v_blocking_count,
    'total_to_delete', v_total_delete
  );

  -- ── 5. Reject if any governed dependency exists ──
  -- For simple deletion, the idea must have NO dependencies at all
  -- (total_to_delete must be 1 — only the idea itself)
  IF v_total_delete > 1 OR v_blocking_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'BLOCKED_DEPENDENCY',
      'error_code', '23000',
      'idea_ref', v_idea.idea_ref,
      'dependency_summary', v_dep_summary,
      'blocking_objects', v_graph->'blocking_objects'
    );
  END IF;

  -- ── 6. Resolve deleted_by server-side ──
  SELECT email INTO v_deleted_by
  FROM profiles
  WHERE id = v_uid;
  IF v_deleted_by IS NULL THEN
    v_deleted_by := v_uid::text;
  END IF;

  -- ── 7. Insert immutable audit record ──
  v_audit_ref := 'IDEA-DEL-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  INSERT INTO idea_deletion_audit (
    idea_ref, idea_title, idea_id, deleted_by, reason, dependencies
  ) VALUES (
    v_idea.idea_ref,
    v_idea.title,
    v_idea.id,
    v_deleted_by,
    v_reason_trim,
    v_dep_summary
  ) RETURNING id INTO v_audit_id;

  -- ── 8. Permanently delete the Idea ──
  DELETE FROM engineering_idea WHERE id = p_idea_id;

  -- ── 9. Return structured result ──
  RETURN jsonb_build_object(
    'success', true,
    'idea_ref', v_idea.idea_ref,
    'audit_id', v_audit_id,
    'audit_ref', v_audit_ref,
    'deleted_by', v_deleted_by,
    'deleted_at', now(),
    'dependency_summary', v_dep_summary
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_code', SQLSTATE,
      'idea_ref', v_idea.idea_ref,
      'dependency_summary', v_dep_summary
    );
END;
$$;

-- Re-grant
REVOKE EXECUTE ON FUNCTION public.delete_engineering_idea_governed(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_engineering_idea_governed(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_engineering_idea_governed(uuid, text) TO authenticated;
