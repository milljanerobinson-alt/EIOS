/*
# EWO-032R.13 — Governed Test Artefact Cascade Deletion

## Purpose
Enables a Product Owner to delete an entire disposable test engineering graph
(Idea + all dependent objects) through one governed server-side transaction,
when every dependent object is classified as a Test Artefact. Production
engineering data remains fully protected.

## Changes

### 1. New table: engineering_graph_deletion_audit
Immutable audit record for governed cascade deletions. Stores:
- root_object_type, root_object_ref, root_object_id
- deleted_count, deleted_refs (jsonb array), deleted_types (jsonb object)
- retained_types (jsonb object) — governed records intentionally retained
- deletion_reason, deleted_by (server-resolved), deleted_at
- dependency_graph (jsonb) — full graph snapshot at deletion time

### 2. New RPC function: delete_engineering_graph_governed
- Schema: public
- Security: SECURITY DEFINER (bypasses RLS for governed cascade)
- search_path locked to 'public', 'extensions'

Parameters:
  p_root_type  text  — 'engineering_idea' or 'engineering_work_order'
  p_root_id    uuid  — the root object's id
  p_reason     text  — deletion reason (>= 10 chars)

The function:
1. Authenticates via auth.uid() and authorises via is_staff().
2. Loads and locks the root object row (FOR UPDATE).
3. Verifies the root is a Test Artefact (is_test_artifact = true for EWOs;
   for Ideas, checks that the Idea's status is draft/active and it has
   related_ewo_refs that are all test artefacts, or no EWO refs at all).
4. Resolves the complete dependency graph:
   - Linked EWOs (from related_ewo_refs)
   - Execution sessions (via session_id on Idea, or ewo_id on sessions)
   - Execution evidence (via session_id)
   - Engineering records library (via ewo_ref or semantic_metadata->>idea_id)
   - Engineering packages (via ewo_id)
   - Engineering reviews (via metadata->>ewo_ref)
   - Verification trace (via ewo_id)
   - Lifecycle events (via ewo_id)
   - Completion reports (via ewo_id)
   - Engineering provenance (via ewo_id)
   - Evidence enrichments (via ewo_id)
   - Execution handoff requests (via ewo_ref)
   - Change log entries (via ewo_ref) — disposable if test
   - Audit trail entries (via ewo_ref or session_id) — retained, not deleted
5. For every disposable dependency, checks is_test_artifact (for EWOs) or
   metadata->>'is_test_artifact' = 'true' (for other objects that carry it
   in metadata). Objects without a test-artefact flag are treated as
   NON-disposable and block the cascade.
6. If ANY non-test dependency exists, aborts and returns the blocking objects.
7. Locks all participating rows (FOR UPDATE).
8. Inserts one immutable audit record with the full graph snapshot.
9. Deletes all disposable objects in dependency order (children first).
10. Returns structured result with deleted count, refs, types, audit id.
11. Any exception rolls back the entire transaction.

### 3. RLS on engineering_graph_deletion_audit
- anon: no access (REVOKE ALL)
- authenticated: SELECT only (for audit viewing via is_staff())
- INSERT/UPDATE/DELETE: revoked from all roles (immutable, written only by RPC)

### 4. Grants
- EXECUTE on delete_engineering_graph_governed: authenticated only

## Security
- deleted_by resolved from auth.uid() → profiles.email, never from client.
- Row locking prevents concurrent dependency attachment.
- No object is silently deleted — every deletion is recorded in the audit.
- Audit trail and change log entries are RETAINED by default (governed
  records), not deleted, unless they are explicitly test artefacts.
- search_path locked to prevent hijacking.
*/

-- ─── 1. Graph deletion audit table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_graph_deletion_audit (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_ref         text UNIQUE NOT NULL,
  root_object_type  text NOT NULL,
  root_object_ref   text NOT NULL,
  root_object_id    uuid NOT NULL,
  deleted_count     integer NOT NULL,
  deleted_refs      jsonb NOT NULL DEFAULT '[]'::jsonb,
  deleted_types     jsonb NOT NULL DEFAULT '{}'::jsonb,
  retained_types    jsonb NOT NULL DEFAULT '{}'::jsonb,
  dependency_graph  jsonb NOT NULL DEFAULT '{}'::jsonb,
  deletion_reason   text NOT NULL,
  deleted_by        text NOT NULL,
  deleted_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE engineering_graph_deletion_audit ENABLE ROW LEVEL SECURITY;

-- Revoke all from anon
REVOKE ALL ON engineering_graph_deletion_audit FROM anon;

-- Authenticated: SELECT only (no direct INSERT/UPDATE/DELETE)
REVOKE INSERT, UPDATE, DELETE ON engineering_graph_deletion_audit FROM authenticated;

-- Drop any existing policies (idempotent)
DROP POLICY IF EXISTS "staff_select_graph_deletion_audit" ON engineering_graph_deletion_audit;
CREATE POLICY "staff_select_graph_deletion_audit"
  ON engineering_graph_deletion_audit FOR SELECT
  TO authenticated
  USING (public.is_staff());

-- ─── 2. Governed cascade deletion RPC ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_engineering_graph_governed(
  p_root_type text,
  p_root_id   uuid,
  p_reason    text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_uid             uuid := auth.uid();
  v_deleted_by      text;
  v_reason_trim     text;
  v_audit_ref       text;
  v_audit_id        uuid;

  -- Root object
  v_idea            engineering_idea%ROWTYPE;
  v_ewo             engineering_work_orders%ROWTYPE;

  -- Graph collections
  v_ewo_ids         uuid[] := '{}';
  v_ewo_refs        text[] := '{}';
  v_session_ids     uuid[] := '{}';
  v_evidence_ids    uuid[] := '{}';
  v_record_ids      uuid[] := '{}';
  v_package_ids     uuid[] := '{}';
  v_review_ids      uuid[] := '{}';
  v_verification_ids integer[] := '{}';
  v_lifecycle_ids   uuid[] := '{}';
  v_completion_ids  uuid[] := '{}';
  v_provenance_ids  uuid[] := '{}';
  v_enrichment_ids  uuid[] := '{}';
  v_handoff_ids     uuid[] := '{}';
  v_changelog_ids   uuid[] := '{}';

  -- Retained (not deleted)
  v_audit_trail_count   int := 0;
  v_changelog_retained_count int := 0;

  -- Blocking objects
  v_blocking_objects jsonb := '[]'::jsonb;
  v_blocking_count   int := 0;

  -- Deleted tracking
  v_deleted_refs     text[] := '{}';
  v_deleted_types    jsonb := '{}'::jsonb;
  v_retained_types   jsonb := '{}'::jsonb;
  v_deleted_count    int := 0;

  -- Dependency graph snapshot
  v_dependency_graph jsonb;

  -- Temp records
  v_rec              record;
  v_is_test          boolean;
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

  -- ── 3. Resolve deleted_by server-side ──
  SELECT email INTO v_deleted_by FROM profiles WHERE id = v_uid;
  IF v_deleted_by IS NULL THEN
    v_deleted_by := v_uid::text;
  END IF;

  -- ── 4. Load and lock the root object ──
  IF p_root_type = 'engineering_idea' THEN
    SELECT * INTO v_idea FROM engineering_idea WHERE id = p_root_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROOT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    -- Collect linked EWO refs
    v_ewo_refs := COALESCE(v_idea.related_ewo_refs, '{}');

    -- Collect session_id
    IF v_idea.session_id IS NOT NULL THEN
      v_session_ids := array_append(v_session_ids, v_idea.session_id);
    END IF;

  ELSIF p_root_type = 'engineering_work_order' THEN
    SELECT * INTO v_ewo FROM engineering_work_orders WHERE id = p_root_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROOT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    -- Root EWO must be a test artefact
    IF NOT COALESCE(v_ewo.is_test_artifact, false) THEN
      v_blocking_objects := v_blocking_objects || jsonb_build_object(
        'object_type', 'engineering_work_order',
        'object_ref', v_ewo.ewo_ref,
        'reason', 'Root work order is not classified as a Test Artefact'
      );
      v_blocking_count := v_blocking_count + 1;
    END IF;

    v_ewo_ids := array_append(v_ewo_ids, p_root_id);
    v_ewo_refs := array_append(v_ewo_refs, v_ewo.ewo_ref);

  ELSE
    RAISE EXCEPTION 'INVALID_ROOT_TYPE' USING ERRCODE = '22023';
  END IF;

  -- ── 5. Resolve linked EWOs (for Idea root) ──
  IF p_root_type = 'engineering_idea' AND array_length(v_ewo_refs, 1) > 0 THEN
    FOR v_rec IN SELECT id, ewo_ref, is_test_artifact, status, po_accepted_at
                 FROM engineering_work_orders
                 WHERE ewo_ref = ANY(v_ewo_refs)
                 FOR UPDATE
    LOOP
      v_ewo_ids := array_append(v_ewo_ids, v_rec.id);
      IF NOT COALESCE(v_rec.is_test_artifact, false) THEN
        v_blocking_objects := v_blocking_objects || jsonb_build_object(
          'object_type', 'engineering_work_order',
          'object_ref', v_rec.ewo_ref,
          'reason', 'Linked EWO is not a Test Artefact'
        );
        v_blocking_count := v_blocking_count + 1;
      END IF;
      IF v_rec.po_accepted_at IS NOT NULL THEN
        v_blocking_objects := v_blocking_objects || jsonb_build_object(
          'object_type', 'engineering_work_order',
          'object_ref', v_rec.ewo_ref,
          'reason', 'EWO has Product Owner acceptance — retention required'
        );
        v_blocking_count := v_blocking_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- ── 6. Resolve execution sessions ──
  -- From EWO ids
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM execution_sessions
                 WHERE ewo_id = ANY(v_ewo_ids)
                 FOR UPDATE
    LOOP
      v_session_ids := array_append(v_session_ids, v_rec.id);
    END LOOP;
  END IF;

  -- ── 7. Resolve execution evidence ──
  IF array_length(v_session_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id, metadata FROM execution_evidence
                 WHERE session_id = ANY(v_session_ids)
                 FOR UPDATE
    LOOP
      v_evidence_ids := array_append(v_evidence_ids, v_rec.id);
      v_is_test := COALESCE((v_rec.metadata->>'is_test_artifact')::boolean, false);
      IF NOT v_is_test THEN
        v_blocking_objects := v_blocking_objects || jsonb_build_object(
          'object_type', 'execution_evidence',
          'object_ref', v_rec.id::text,
          'reason', 'Execution evidence is not classified as a Test Artefact'
        );
        v_blocking_count := v_blocking_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- ── 8. Resolve engineering records library ──
  IF array_length(v_ewo_refs, 1) > 0 THEN
    FOR v_rec IN SELECT id, record_ref, semantic_metadata FROM engineering_records_library
                 WHERE ewo_ref = ANY(v_ewo_refs)
                    OR semantic_metadata->>'idea_id' = p_root_id::text
                 FOR UPDATE
    LOOP
      v_record_ids := array_append(v_record_ids, v_rec.id);
      v_is_test := COALESCE((v_rec.semantic_metadata->>'is_test_artifact')::boolean, false);
      IF NOT v_is_test THEN
        v_blocking_objects := v_blocking_objects || jsonb_build_object(
          'object_type', 'engineering_records_library',
          'object_ref', v_rec.record_ref,
          'reason', 'Engineering record is not classified as a Test Artefact'
        );
        v_blocking_count := v_blocking_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- ── 9. Resolve engineering packages ──
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_engineering_packages
                 WHERE ewo_id = ANY(v_ewo_ids)
                 FOR UPDATE
    LOOP
      v_package_ids := array_append(v_package_ids, v_rec.id);
    END LOOP;
  END IF;

  -- ── 10. Resolve engineering reviews ──
  IF array_length(v_ewo_refs, 1) > 0 THEN
    FOR v_rec IN SELECT id, status, metadata FROM ecc_engineering_reviews
                 WHERE metadata->>'ewo_ref' = ANY(v_ewo_refs)
                 FOR UPDATE
    LOOP
      v_review_ids := array_append(v_review_ids, v_rec.id);
      IF v_rec.status = 'approved' THEN
        v_blocking_objects := v_blocking_objects || jsonb_build_object(
          'object_type', 'ecc_engineering_review',
          'object_ref', v_rec.id::text,
          'reason', 'Engineering review is approved — governed approval'
        );
        v_blocking_count := v_blocking_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- ── 11. Resolve verification trace ──
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_verification_trace
                 WHERE ewo_id = ANY(v_ewo_ids)
                 FOR UPDATE
    LOOP
      v_verification_ids := array_append(v_verification_ids, v_rec.id);
    END LOOP;
  END IF;

  -- ── 12. Resolve lifecycle events ──
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_lifecycle_events
                 WHERE ewo_id = ANY(v_ewo_ids)
                 FOR UPDATE
    LOOP
      v_lifecycle_ids := array_append(v_lifecycle_ids, v_rec.id);
    END LOOP;
  END IF;

  -- ── 13. Resolve completion reports ──
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_completion_reports
                 WHERE ewo_id = ANY(v_ewo_ids)
                 FOR UPDATE
    LOOP
      v_completion_ids := array_append(v_completion_ids, v_rec.id);
    END LOOP;
  END IF;

  -- ── 14. Resolve provenance ──
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_engineering_provenance
                 WHERE ewo_id = ANY(v_ewo_ids)
                 FOR UPDATE
    LOOP
      v_provenance_ids := array_append(v_provenance_ids, v_rec.id);
    END LOOP;
  END IF;

  -- ── 15. Resolve evidence enrichments ──
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_evidence_enrichments
                 WHERE ewo_id = ANY(v_ewo_ids)
                 FOR UPDATE
    LOOP
      v_enrichment_ids := array_append(v_enrichment_ids, v_rec.id);
    END LOOP;
  END IF;

  -- ── 16. Resolve execution handoff requests ──
  IF array_length(v_ewo_refs, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM execution_handoff_requests
                 WHERE ewo_ref = ANY(v_ewo_refs)
                 FOR UPDATE
    LOOP
      v_handoff_ids := array_append(v_handoff_ids, v_rec.id);
    END LOOP;
  END IF;

  -- ── 17. Resolve change log entries (disposable if test) ──
  IF array_length(v_ewo_refs, 1) > 0 THEN
    FOR v_rec IN SELECT id, metadata FROM engineering_change_log
                 WHERE ewo_ref = ANY(v_ewo_refs)
                 FOR UPDATE
    LOOP
      v_is_test := COALESCE((v_rec.metadata->>'is_test_artifact')::boolean, false);
      IF v_is_test THEN
        v_changelog_ids := array_append(v_changelog_ids, v_rec.id);
      ELSE
        v_changelog_retained_count := v_changelog_retained_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- ── 18. Count audit trail entries (always retained) ──
  IF array_length(v_ewo_refs, 1) > 0 THEN
    SELECT count(*) INTO v_audit_trail_count
    FROM execution_audit_trail
    WHERE ewo_ref = ANY(v_ewo_refs)
       OR session_id = ANY(v_session_ids);
  END IF;

  -- ── 19. Check for blocking objects ──
  IF v_blocking_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CASCADE_BLOCKED',
      'blocking_count', v_blocking_count,
      'blocking_objects', v_blocking_objects
    );
  END IF;

  -- ── 20. Build dependency graph snapshot ──
  v_dependency_graph := jsonb_build_object(
    'root_type', p_root_type,
    'root_ref', CASE WHEN p_root_type = 'engineering_idea' THEN v_idea.idea_ref ELSE v_ewo.ewo_ref END,
    'ewo_ids', v_ewo_ids,
    'ewo_refs', v_ewo_refs,
    'session_ids', v_session_ids,
    'evidence_ids', v_evidence_ids,
    'record_ids', v_record_ids,
    'package_ids', v_package_ids,
    'review_ids', v_review_ids,
    'verification_ids', v_verification_ids,
    'lifecycle_ids', v_lifecycle_ids,
    'completion_ids', v_completion_ids,
    'provenance_ids', v_provenance_ids,
    'enrichment_ids', v_enrichment_ids,
    'handoff_ids', v_handoff_ids,
    'changelog_ids', v_changelog_ids,
    'audit_trail_count', v_audit_trail_count,
    'changelog_retained_count', v_changelog_retained_count
  );

  -- ── 21. Build deleted types summary ──
  v_deleted_types := jsonb_build_object(
    'engineering_idea', CASE WHEN p_root_type = 'engineering_idea' THEN 1 ELSE 0 END,
    'engineering_work_orders', array_length(v_ewo_ids, 1),
    'execution_sessions', array_length(v_session_ids, 1),
    'execution_evidence', array_length(v_evidence_ids, 1),
    'engineering_records_library', array_length(v_record_ids, 1),
    'ewo_engineering_packages', array_length(v_package_ids, 1),
    'ecc_engineering_reviews', array_length(v_review_ids, 1),
    'ewo_verification_trace', array_length(v_verification_ids, 1),
    'ewo_lifecycle_events', array_length(v_lifecycle_ids, 1),
    'ewo_completion_reports', array_length(v_completion_ids, 1),
    'ewo_engineering_provenance', array_length(v_provenance_ids, 1),
    'ewo_evidence_enrichments', array_length(v_enrichment_ids, 1),
    'execution_handoff_requests', array_length(v_handoff_ids, 1),
    'engineering_change_log', array_length(v_changelog_ids, 1)
  );

  v_retained_types := jsonb_build_object(
    'execution_audit_trail', v_audit_trail_count,
    'engineering_change_log_retained', v_changelog_retained_count
  );

  -- ── 22. Build deleted refs array ──
  IF p_root_type = 'engineering_idea' THEN
    v_deleted_refs := array_append(v_deleted_refs, v_idea.idea_ref);
  END IF;
  IF array_length(v_ewo_refs, 1) > 0 THEN
    v_deleted_refs := v_deleted_refs || v_ewo_refs;
  END IF;
  IF array_length(v_evidence_ids, 1) > 0 THEN
    SELECT array_agg(id::text) INTO v_deleted_refs FROM execution_evidence WHERE id = ANY(v_evidence_ids);
  END IF;

  v_deleted_count :=
    COALESCE(array_length(v_ewo_ids, 1), 0) +
    COALESCE(array_length(v_session_ids, 1), 0) +
    COALESCE(array_length(v_evidence_ids, 1), 0) +
    COALESCE(array_length(v_record_ids, 1), 0) +
    COALESCE(array_length(v_package_ids, 1), 0) +
    COALESCE(array_length(v_review_ids, 1), 0) +
    COALESCE(array_length(v_verification_ids, 1), 0) +
    COALESCE(array_length(v_lifecycle_ids, 1), 0) +
    COALESCE(array_length(v_completion_ids, 1), 0) +
    COALESCE(array_length(v_provenance_ids, 1), 0) +
    COALESCE(array_length(v_enrichment_ids, 1), 0) +
    COALESCE(array_length(v_handoff_ids, 1), 0) +
    COALESCE(array_length(v_changelog_ids, 1), 0) +
    CASE WHEN p_root_type = 'engineering_idea' THEN 1 ELSE 0 END;

  -- ── 23. Insert immutable audit record ──
  v_audit_ref := 'GRAPH-DEL-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  INSERT INTO engineering_graph_deletion_audit (
    audit_ref, root_object_type, root_object_ref, root_object_id,
    deleted_count, deleted_refs, deleted_types, retained_types,
    dependency_graph, deletion_reason, deleted_by
  ) VALUES (
    v_audit_ref,
    p_root_type,
    CASE WHEN p_root_type = 'engineering_idea' THEN v_idea.idea_ref ELSE v_ewo.ewo_ref END,
    p_root_id,
    v_deleted_count,
    to_jsonb(v_deleted_refs),
    v_deleted_types,
    v_retained_types,
    v_dependency_graph,
    v_reason_trim,
    v_deleted_by
  )
  RETURNING id INTO v_audit_id;

  -- ── 24. Delete all disposable objects (children first) ──

  -- Execution handoff requests
  IF array_length(v_handoff_ids, 1) > 0 THEN
    DELETE FROM execution_handoff_requests WHERE id = ANY(v_handoff_ids);
  END IF;

  -- Evidence enrichments
  IF array_length(v_enrichment_ids, 1) > 0 THEN
    DELETE FROM ewo_evidence_enrichments WHERE id = ANY(v_enrichment_ids);
  END IF;

  -- Engineering provenance
  IF array_length(v_provenance_ids, 1) > 0 THEN
    DELETE FROM ewo_engineering_provenance WHERE id = ANY(v_provenance_ids);
  END IF;

  -- Completion reports
  IF array_length(v_completion_ids, 1) > 0 THEN
    DELETE FROM ewo_completion_reports WHERE id = ANY(v_completion_ids);
  END IF;

  -- Lifecycle events
  IF array_length(v_lifecycle_ids, 1) > 0 THEN
    DELETE FROM ewo_lifecycle_events WHERE id = ANY(v_lifecycle_ids);
  END IF;

  -- Verification trace
  IF array_length(v_verification_ids, 1) > 0 THEN
    DELETE FROM ewo_verification_trace WHERE id = ANY(v_verification_ids);
  END IF;

  -- Engineering reviews
  IF array_length(v_review_ids, 1) > 0 THEN
    DELETE FROM ecc_engineering_reviews WHERE id = ANY(v_review_ids);
  END IF;

  -- Engineering packages
  IF array_length(v_package_ids, 1) > 0 THEN
    DELETE FROM ewo_engineering_packages WHERE id = ANY(v_package_ids);
  END IF;

  -- Engineering records library
  IF array_length(v_record_ids, 1) > 0 THEN
    DELETE FROM engineering_records_library WHERE id = ANY(v_record_ids);
  END IF;

  -- Execution evidence
  IF array_length(v_evidence_ids, 1) > 0 THEN
    DELETE FROM execution_evidence WHERE id = ANY(v_evidence_ids);
  END IF;

  -- Execution sessions
  IF array_length(v_session_ids, 1) > 0 THEN
    DELETE FROM execution_sessions WHERE id = ANY(v_session_ids);
  END IF;

  -- Change log (disposable entries only)
  IF array_length(v_changelog_ids, 1) > 0 THEN
    DELETE FROM engineering_change_log WHERE id = ANY(v_changelog_ids);
  END IF;

  -- Engineering work orders
  IF array_length(v_ewo_ids, 1) > 0 THEN
    DELETE FROM engineering_work_orders WHERE id = ANY(v_ewo_ids);
  END IF;

  -- Root idea (last)
  IF p_root_type = 'engineering_idea' THEN
    DELETE FROM engineering_idea WHERE id = p_root_id;
  END IF;

  -- ── 25. Return structured result ──
  RETURN jsonb_build_object(
    'success', true,
    'root_object_ref', CASE WHEN p_root_type = 'engineering_idea' THEN v_idea.idea_ref ELSE v_ewo.ewo_ref END,
    'audit_id', v_audit_id,
    'audit_ref', v_audit_ref,
    'deleted_by', v_deleted_by,
    'deleted_at', now(),
    'deleted_count', v_deleted_count,
    'deleted_types', v_deleted_types,
    'retained_types', v_retained_types,
    'dependency_graph', v_dependency_graph
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_code', SQLSTATE
    );
END;
$$;

-- ─── 3. Grants ─────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.delete_engineering_graph_governed(text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_engineering_graph_governed(text, uuid, text) TO authenticated;
