/*
# EWO-032R.12 — Governed Engineering Idea Deletion RPC

## Purpose
Replaces the non-atomic client-side two-step deletion (audit INSERT + idea DELETE)
with a single SECURITY DEFINER PostgreSQL function that executes eligibility
validation, audit insertion, and idea deletion within one database transaction.

## Changes

### 1. New RPC function: delete_engineering_idea_governed
- Schema: public
- Security: SECURITY DEFINER (runs with function-owner privileges, bypasses RLS)
- Returns: jsonb structured result

The function:
1. Requires an authenticated authorised staff user (resolved via auth.uid()).
2. Loads and locks the Engineering Idea row (FOR UPDATE) to prevent concurrent changes.
3. Recalculates deletion eligibility inside the transaction — does NOT trust
   browser-supplied eligibility data.
4. Rejects deletion if any governed dependency exists:
   - related_ewo_refs (non-empty array)
   - execution_evidence linked to session_id
   - engineering_records_library referencing idea_id via semantic_metadata
   - engineering_audit_trail referencing idea_ref via entity_ref
5. Requires a deletion reason of at least 10 meaningful characters (after trim).
6. Inserts the immutable idea_deletion_audit record (deleted_by resolved server-side
   from auth.uid() → profiles.email, never from client input).
7. Permanently deletes the Engineering Idea row.
8. Returns structured result: success, idea_ref, audit_id, deleted_by,
   deleted_at, dependency_summary.
9. Any failure raises an exception which rolls back the entire transaction
   (both the audit insert and the deletion).

### 2. RLS tightening on idea_deletion_audit
- Revoke ALL direct access from anon role (no SELECT, INSERT, UPDATE, DELETE).
- Revoke direct INSERT from authenticated role — the only way to create an
  audit record is through the governed RPC function.
- Authenticated staff can SELECT (for audit trail viewing).
- UPDATE and DELETE remain prohibited for all roles (immutable audit).

### 3. Grant EXECUTE on the RPC
- Granted to authenticated role only (anon cannot invoke).

## Security
- The function uses auth.uid() to resolve the caller — never accepts a
  client-provided deleted_by parameter.
- Row locking (SELECT ... FOR UPDATE) prevents a new dependency from being
  attached between eligibility checking and deletion.
- SECURITY DEFINER ensures the function can write to the audit table and
  delete from the idea table even though the caller's RLS role cannot.
- search_path is locked to 'public', 'extensions' to prevent search_path hijacking.
*/

-- ─── 1. Governed deletion RPC ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_engineering_idea_governed(
  p_idea_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_idea         engineering_idea%ROWTYPE;
  v_deleted_by   text;
  v_audit_id     uuid;
  v_audit_ref    text;
  v_dep_summary  jsonb;
  v_ewo_count    int;
  v_evidence_count int;
  v_records_count int;
  v_audit_count  int;
  v_reason_trim  text;
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

  -- ── 4. Recalculate eligibility inside the transaction ──
  -- 4a. related_ewo_refs
  v_ewo_count := coalesce(array_length(v_idea.related_ewo_refs, 1), 0);

  -- 4b. execution_evidence linked to session_id
  IF v_idea.session_id IS NOT NULL THEN
    SELECT count(*) INTO v_evidence_count
    FROM execution_evidence
    WHERE session_id = v_idea.session_id;
  ELSE
    v_evidence_count := 0;
  END IF;

  -- 4c. engineering_records_library referencing this idea
  SELECT count(*) INTO v_records_count
  FROM engineering_records_library
  WHERE semantic_metadata->>'idea_id' = v_idea.id::text;

  -- 4d. engineering_audit_trail referencing this idea
  SELECT count(*) INTO v_audit_count
  FROM engineering_audit_trail
  WHERE entity_ref = v_idea.idea_ref;

  v_dep_summary := jsonb_build_object(
    'related_ewo_refs', v_ewo_count,
    'execution_evidence', v_evidence_count,
    'engineering_records', v_records_count,
    'engineering_audit_trail', v_audit_count
  );

  -- ── 5. Reject if any governed dependency exists ──
  IF v_ewo_count > 0 THEN
    RAISE EXCEPTION 'BLOCKED_DEPENDENCY' USING
      ERRCODE = '23000',
      MESSAGE = 'Linked to % Engineering Work Order(s): %',
      DETAIL = v_idea.related_ewo_refs::text;
  END IF;

  IF v_evidence_count > 0 THEN
    RAISE EXCEPTION 'BLOCKED_DEPENDENCY' USING
      ERRCODE = '23000',
      MESSAGE = '% execution evidence record(s) linked to session %',
      DETAIL = v_idea.session_id::text;
  END IF;

  IF v_records_count > 0 THEN
    RAISE EXCEPTION 'BLOCKED_DEPENDENCY' USING
      ERRCODE = '23000',
      MESSAGE = '% records-library entry(ies) reference this Idea';
  END IF;

  IF v_audit_count > 0 THEN
    RAISE EXCEPTION 'BLOCKED_DEPENDENCY' USING
      ERRCODE = '23000',
      MESSAGE = '% audit trail entry(ies) reference this Idea';
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
  )
  RETURNING id INTO v_audit_id;

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

-- ─── 2. RLS tightening on idea_deletion_audit ──────────────────────────────────

-- Revoke ALL from anon
REVOKE ALL ON idea_deletion_audit FROM anon;

-- Revoke direct INSERT/UPDATE/DELETE from authenticated (only SELECT allowed)
-- The governed RPC (SECURITY DEFINER) is the sole path to create audit records.
REVOKE INSERT, UPDATE, DELETE ON idea_deletion_audit FROM authenticated;

-- Ensure authenticated can still SELECT for audit trail viewing
-- (existing policy anon_select_idea_deletion_audit already covers this via is_staff())

-- Drop the anon INSERT policy — direct client inserts are no longer allowed
DROP POLICY IF EXISTS "anon_insert_idea_deletion_audit" ON idea_deletion_audit;

-- ─── 3. Grant EXECUTE on the RPC ───────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.delete_engineering_idea_governed(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_engineering_idea_governed(uuid, text) TO authenticated;
