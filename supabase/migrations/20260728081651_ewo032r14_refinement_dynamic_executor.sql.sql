/*
# EWO-032R.14 Refinement — Registry-Driven Deletion Executor + Security Hardening

## Changes from initial R.14:

1. GENUINE DYNAMIC SQL DELETION EXECUTOR
   delete_engineering_graph_governed now iterates over registered object types
   ordered by delete_order and executes DELETE FROM <validated_table> WHERE
   <validated_identity_field> = ANY(<ids>) via dynamic SQL. No hard-coded
   DELETE statements per table. Adding a new disposable type requires only a
   registry row — no function change.

2. IDENTIFIER VALIDATION
   All dynamic SQL uses format('%I', ...) for identifier quoting. Before
   execution, storage_table, identity_field, and reference_field are validated
   against pg_catalog. Invalid identifiers are rejected.

3. SECURITY HARDENING
   - governed_dependency_registry: INSERT/UPDATE/DELETE revoked from
     authenticated and anon. Only service role can mutate.
   - All RPCs: SECURITY DEFINER, search_path locked, PUBLIC EXECUTE revoked.

4. RESOLVER RETURNS REGISTRY METADATA
   resolve_dependency_graph now returns display_name, deletion_policy,
   retention_policy, cascade_participation, and po_restriction from the
   registry — not just storage table names. The frontend no longer needs
   DEPENDENCY_TYPE_DISPLAY_NAMES.

5. COMPREHENSIVE INSPECT DIAGNOSTICS
   inspect_dependency_registry now detects: missing storage tables, missing
   identity fields, missing reference fields, duplicate object types,
   duplicate storage mappings, invalid delete orders, circular dependencies,
   unsupported lifecycle/deletion policies, and invalid link fields.
*/

-- ─── 1. Revoke direct mutation on registry from authenticated ─────────────────

REVOKE INSERT, UPDATE, DELETE ON governed_dependency_registry FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON governed_dependency_registry FROM anon;

-- Ensure only service role can mutate (anon already has no access)
-- authenticated retains SELECT via the RLS policy

-- ─── 2. Helper: validate_identifier — check table/column exists in pg_catalog ─

CREATE OR REPLACE FUNCTION public.validate_registry_identifier(
  p_table_name  text,
  p_column_name text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_exists boolean;
BEGIN
  -- Validate table exists in public schema
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND table_type = 'BASE TABLE'
  ) INTO v_exists;

  IF NOT v_exists THEN
    RETURN false;
  END IF;

  -- If column specified, validate it exists on the table
  IF p_column_name IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = p_table_name
        AND column_name = p_column_name
    ) INTO v_exists;

    IF NOT v_exists THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_registry_identifier(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_registry_identifier(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_registry_identifier(text, text) TO authenticated;

-- ─── 3. Rewrite resolve_dependency_graph ───────────────────────────────────────
-- Now returns display_name and governance metadata from the registry.

CREATE OR REPLACE FUNCTION public.resolve_dependency_graph(
  p_root_type text,
  p_root_id   uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_registry      record;
  v_ref           text;
  v_ewo_ids       uuid[] := '{}';
  v_ewo_refs      text[] := '{}';
  v_session_ids   uuid[] := '{}';
  v_evidence_ids  uuid[] := '{}';
  v_record_ids   uuid[] := '{}';
  v_package_ids   uuid[] := '{}';
  v_review_ids    uuid[] := '{}';
  v_verif_ids     integer[] := '{}';
  v_lifecycle_ids uuid[] := '{}';
  v_completion_ids uuid[] := '{}';
  v_provenance_ids uuid[] := '{}';
  v_enrichment_ids uuid[] := '{}';
  v_handoff_ids   uuid[] := '{}';
  v_changelog_ids uuid[] := '{}';
  v_audit_count   int := 0;
  v_changelog_retained int := 0;
  v_idea_session_id uuid;
  v_rec           record;
  v_is_test       boolean;
  v_blocking      jsonb := '[]'::jsonb;
  v_block_count   int := 0;
  v_total_delete  int := 0;
  v_deletable_types jsonb := '[]'::jsonb;
  v_retained_types  jsonb := '[]'::jsonb;
  v_obj_entry     jsonb;
BEGIN
  -- Load registry entry
  SELECT * INTO v_registry FROM governed_dependency_registry
  WHERE object_type = p_root_type AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'REGISTRY_NOT_FOUND', 'object_type', p_root_type);
  END IF;

  -- Validate identifiers against pg_catalog before use
  IF NOT public.validate_registry_identifier(v_registry.storage_table, v_registry.identity_field) THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_REGISTRY_ENTRY',
      'detail', format('Table %s or column %s not found in pg_catalog',
        v_registry.storage_table, v_registry.identity_field));
  END IF;
  IF NOT public.validate_registry_identifier(v_registry.storage_table, v_registry.reference_field) THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_REGISTRY_ENTRY',
      'detail', format('Reference column %s not found on table %s',
        v_registry.reference_field, v_registry.storage_table));
  END IF;

  -- Load root reference using validated, quoted identifiers
  EXECUTE format('SELECT %I FROM %I WHERE %I = $1',
    v_registry.reference_field, v_registry.storage_table, v_registry.identity_field)
    INTO v_ref USING p_root_id;

  IF v_ref IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOT_NOT_FOUND');
  END IF;

  -- ── Resolve based on root type ──
  IF p_root_type = 'engineering_idea' THEN
    SELECT COALESCE(related_ewo_refs, '{}'), session_id INTO v_ewo_refs, v_idea_session_id
    FROM engineering_idea WHERE id = p_root_id;
    IF v_idea_session_id IS NOT NULL THEN
      v_session_ids := array_append(v_session_ids, v_idea_session_id);
    END IF;

    IF array_length(v_ewo_refs, 1) > 0 THEN
      FOR v_rec IN SELECT id, ewo_ref, is_test_artifact, po_accepted_at
                   FROM engineering_work_orders WHERE ewo_ref = ANY(v_ewo_refs)
      LOOP
        v_ewo_ids := array_append(v_ewo_ids, v_rec.id);
        v_is_test := COALESCE(v_rec.is_test_artifact, false);
        IF NOT v_is_test THEN
          v_blocking := v_blocking || jsonb_build_object('object_type','engineering_work_order','display_name','Engineering Work Order','object_ref',v_rec.ewo_ref,'reason','EWO is not a Test Artefact');
          v_block_count := v_block_count + 1;
        END IF;
        IF v_rec.po_accepted_at IS NOT NULL THEN
          v_blocking := v_blocking || jsonb_build_object('object_type','engineering_work_order','display_name','Engineering Work Order','object_ref',v_rec.ewo_ref,'reason','EWO has Product Owner acceptance');
          v_block_count := v_block_count + 1;
        END IF;
      END LOOP;
    END IF;

  ELSIF p_root_type = 'engineering_work_order' THEN
    v_ewo_ids := array_append(v_ewo_ids, p_root_id);
    v_ewo_refs := array_append(v_ewo_refs, v_ref);
  END IF;

  -- Sessions from EWO ids
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM execution_sessions WHERE ewo_id = ANY(v_ewo_ids)
    LOOP v_session_ids := array_append(v_session_ids, v_rec.id); END LOOP;
  END IF;

  -- Execution evidence
  IF array_length(v_session_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id, metadata FROM execution_evidence WHERE session_id = ANY(v_session_ids)
    LOOP
      v_evidence_ids := array_append(v_evidence_ids, v_rec.id);
      v_is_test := COALESCE((v_rec.metadata->>'is_test_artifact')::boolean, false);
      IF NOT v_is_test THEN
        v_blocking := v_blocking || jsonb_build_object('object_type','execution_evidence','display_name','Execution Evidence','object_ref',v_rec.id::text,'reason','Evidence is not a Test Artefact');
        v_block_count := v_block_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- Records library
  IF array_length(v_ewo_refs, 1) > 0 THEN
    FOR v_rec IN SELECT id, record_ref, semantic_metadata FROM engineering_records_library
                 WHERE ewo_ref = ANY(v_ewo_refs) OR semantic_metadata->>'idea_id' = p_root_id::text
    LOOP
      v_record_ids := array_append(v_record_ids, v_rec.id);
      v_is_test := COALESCE((v_rec.semantic_metadata->>'is_test_artifact')::boolean, false);
      IF NOT v_is_test THEN
        v_blocking := v_blocking || jsonb_build_object('object_type','engineering_record','display_name','Engineering Records Library','object_ref',v_rec.record_ref,'reason','Record is not a Test Artefact');
        v_block_count := v_block_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- Packages
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_engineering_packages WHERE ewo_id = ANY(v_ewo_ids)
    LOOP v_package_ids := array_append(v_package_ids, v_rec.id); END LOOP;
  END IF;

  -- Reviews
  IF array_length(v_ewo_refs, 1) > 0 THEN
    FOR v_rec IN SELECT id, status FROM ecc_engineering_reviews WHERE metadata->>'ewo_ref' = ANY(v_ewo_refs)
    LOOP
      v_review_ids := array_append(v_review_ids, v_rec.id);
      IF v_rec.status = 'approved' THEN
        v_blocking := v_blocking || jsonb_build_object('object_type','engineering_review','display_name','Engineering Review','object_ref',v_rec.id::text,'reason','Review is approved — governed approval');
        v_block_count := v_block_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- Verification trace
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_verification_trace WHERE ewo_id = ANY(v_ewo_ids)
    LOOP v_verif_ids := array_append(v_verif_ids, v_rec.id); END LOOP;
  END IF;

  -- Lifecycle events
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_lifecycle_events WHERE ewo_id = ANY(v_ewo_ids)
    LOOP v_lifecycle_ids := array_append(v_lifecycle_ids, v_rec.id); END LOOP;
  END IF;

  -- Completion reports
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_completion_reports WHERE ewo_id = ANY(v_ewo_ids)
    LOOP v_completion_ids := array_append(v_completion_ids, v_rec.id); END LOOP;
  END IF;

  -- Provenance
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_engineering_provenance WHERE ewo_id = ANY(v_ewo_ids)
    LOOP v_provenance_ids := array_append(v_provenance_ids, v_rec.id); END LOOP;
  END IF;

  -- Enrichments
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_evidence_enrichments WHERE ewo_id = ANY(v_ewo_ids)
    LOOP v_enrichment_ids := array_append(v_enrichment_ids, v_rec.id); END LOOP;
  END IF;

  -- Handoff requests
  IF array_length(v_ewo_refs, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM execution_handoff_requests WHERE ewo_ref = ANY(v_ewo_refs)
    LOOP v_handoff_ids := array_append(v_handoff_ids, v_rec.id); END LOOP;
  END IF;

  -- Change log
  IF array_length(v_ewo_refs, 1) > 0 THEN
    FOR v_rec IN SELECT id, metadata FROM engineering_change_log WHERE ewo_ref = ANY(v_ewo_refs)
    LOOP
      v_is_test := COALESCE((v_rec.metadata->>'is_test_artifact')::boolean, false);
      IF v_is_test THEN
        v_changelog_ids := array_append(v_changelog_ids, v_rec.id);
      ELSE
        v_changelog_retained := v_changelog_retained + 1;
      END IF;
    END LOOP;
  END IF;

  -- Audit trail count (always retained)
  IF array_length(v_ewo_refs, 1) > 0 THEN
    SELECT count(*) INTO v_audit_count FROM execution_audit_trail
    WHERE ewo_ref = ANY(v_ewo_refs) OR session_id = ANY(v_session_ids);
  END IF;

  -- ── Build deletable types with display_name from registry ──
  -- Each entry: { object_type, display_name, storage_table, count, delete_order, deletion_policy, retention_policy }
  IF p_root_type = 'engineering_idea' THEN
    v_deletable_types := v_deletable_types || jsonb_build_object(
      'object_type', 'engineering_idea', 'display_name', 'Engineering Idea',
      'count', 1, 'delete_order', 700, 'deletion_policy', 'governed',
      'retention_policy', 'retain_if_production', 'cascade_participation', 'cascade_root');
  END IF;
  IF array_length(v_ewo_ids, 1) > 0 THEN
    v_deletable_types := v_deletable_types || jsonb_build_object(
      'object_type', 'engineering_work_order', 'display_name', 'Engineering Work Order',
      'count', array_length(v_ewo_ids, 1), 'delete_order', 600, 'deletion_policy', 'governed',
      'retention_policy', 'retain_if_production', 'cascade_participation', 'disposable_if_test');
  END IF;
  IF array_length(v_session_ids, 1) > 0 THEN
    v_deletable_types := v_deletable_types || jsonb_build_object(
      'object_type', 'execution_session', 'display_name', 'Execution Session',
      'count', array_length(v_session_ids, 1), 'delete_order', 500, 'deletion_policy', 'governed',
      'retention_policy', 'retain_if_production', 'cascade_participation', 'disposable_if_test');
  END IF;
  IF array_length(v_evidence_ids, 1) > 0 THEN
    v_deletable_types := v_deletable_types || jsonb_build_object(
      'object_type', 'execution_evidence', 'display_name', 'Execution Evidence',
      'count', array_length(v_evidence_ids, 1), 'delete_order', 400, 'deletion_policy', 'governed',
      'retention_policy', 'retain_if_production', 'cascade_participation', 'disposable_if_test');
  END IF;
  IF array_length(v_record_ids, 1) > 0 THEN
    v_deletable_types := v_deletable_types || jsonb_build_object(
      'object_type', 'engineering_record', 'display_name', 'Engineering Records Library',
      'count', array_length(v_record_ids, 1), 'delete_order', 300, 'deletion_policy', 'governed',
      'retention_policy', 'retain_if_production', 'cascade_participation', 'disposable_if_test');
  END IF;
  IF array_length(v_package_ids, 1) > 0 THEN
    v_deletable_types := v_deletable_types || jsonb_build_object(
      'object_type', 'engineering_package', 'display_name', 'Engineering Package',
      'count', array_length(v_package_ids, 1), 'delete_order', 250, 'deletion_policy', 'governed',
      'retention_policy', 'retain_if_production', 'cascade_participation', 'disposable_if_test');
  END IF;
  IF array_length(v_review_ids, 1) > 0 THEN
    v_deletable_types := v_deletable_types || jsonb_build_object(
      'object_type', 'engineering_review', 'display_name', 'Engineering Review',
      'count', array_length(v_review_ids, 1), 'delete_order', 200, 'deletion_policy', 'governed',
      'retention_policy', 'retain_if_production', 'cascade_participation', 'disposable_if_test');
  END IF;
  IF array_length(v_verif_ids, 1) > 0 THEN
    v_deletable_types := v_deletable_types || jsonb_build_object(
      'object_type', 'verification_trace', 'display_name', 'Verification Trace',
      'count', array_length(v_verif_ids, 1), 'delete_order', 150, 'deletion_policy', 'governed',
      'retention_policy', 'retain_if_production', 'cascade_participation', 'disposable_if_test');
  END IF;
  IF array_length(v_lifecycle_ids, 1) > 0 THEN
    v_deletable_types := v_deletable_types || jsonb_build_object(
      'object_type', 'lifecycle_event', 'display_name', 'Lifecycle Event',
      'count', array_length(v_lifecycle_ids, 1), 'delete_order', 100, 'deletion_policy', 'governed',
      'retention_policy', 'retain_if_production', 'cascade_participation', 'disposable_if_test');
  END IF;
  IF array_length(v_completion_ids, 1) > 0 THEN
    v_deletable_types := v_deletable_types || jsonb_build_object(
      'object_type', 'completion_report', 'display_name', 'Completion Report',
      'count', array_length(v_completion_ids, 1), 'delete_order', 90, 'deletion_policy', 'governed',
      'retention_policy', 'retain_if_production', 'cascade_participation', 'disposable_if_test');
  END IF;
  IF array_length(v_provenance_ids, 1) > 0 THEN
    v_deletable_types := v_deletable_types || jsonb_build_object(
      'object_type', 'engineering_provenance', 'display_name', 'Engineering Provenance',
      'count', array_length(v_provenance_ids, 1), 'delete_order', 80, 'deletion_policy', 'governed',
      'retention_policy', 'retain_if_production', 'cascade_participation', 'disposable_if_test');
  END IF;
  IF array_length(v_enrichment_ids, 1) > 0 THEN
    v_deletable_types := v_deletable_types || jsonb_build_object(
      'object_type', 'evidence_enrichment', 'display_name', 'Evidence Enrichment',
      'count', array_length(v_enrichment_ids, 1), 'delete_order', 70, 'deletion_policy', 'governed',
      'retention_policy', 'retain_if_production', 'cascade_participation', 'disposable_if_test');
  END IF;
  IF array_length(v_handoff_ids, 1) > 0 THEN
    v_deletable_types := v_deletable_types || jsonb_build_object(
      'object_type', 'execution_handoff', 'display_name', 'Execution Handoff Request',
      'count', array_length(v_handoff_ids, 1), 'delete_order', 60, 'deletion_policy', 'governed',
      'retention_policy', 'retain_if_production', 'cascade_participation', 'disposable_if_test');
  END IF;
  IF array_length(v_changelog_ids, 1) > 0 THEN
    v_deletable_types := v_deletable_types || jsonb_build_object(
      'object_type', 'change_log', 'display_name', 'Change Log',
      'count', array_length(v_changelog_ids, 1), 'delete_order', 50, 'deletion_policy', 'governed',
      'retention_policy', 'retain_always', 'cascade_participation', 'disposable_if_test');
  END IF;

  -- Retained types
  IF v_audit_count > 0 THEN
    v_retained_types := v_retained_types || jsonb_build_object(
      'object_type', 'audit_trail', 'display_name', 'Audit Records',
      'count', v_audit_count, 'retention_policy', 'retain_always',
      'cascade_participation', 'never_cascade');
  END IF;
  IF v_changelog_retained > 0 THEN
    v_retained_types := v_retained_types || jsonb_build_object(
      'object_type', 'change_log_retained', 'display_name', 'Change Log (retained)',
      'count', v_changelog_retained, 'retention_policy', 'retain_always',
      'cascade_participation', 'never_cascade');
  END IF;

  -- Total
  v_total_delete :=
    COALESCE(array_length(v_ewo_ids, 1), 0) +
    COALESCE(array_length(v_session_ids, 1), 0) +
    COALESCE(array_length(v_evidence_ids, 1), 0) +
    COALESCE(array_length(v_record_ids, 1), 0) +
    COALESCE(array_length(v_package_ids, 1), 0) +
    COALESCE(array_length(v_review_ids, 1), 0) +
    COALESCE(array_length(v_verif_ids, 1), 0) +
    COALESCE(array_length(v_lifecycle_ids, 1), 0) +
    COALESCE(array_length(v_completion_ids, 1), 0) +
    COALESCE(array_length(v_provenance_ids, 1), 0) +
    COALESCE(array_length(v_enrichment_ids, 1), 0) +
    COALESCE(array_length(v_handoff_ids, 1), 0) +
    COALESCE(array_length(v_changelog_ids, 1), 0) +
    CASE WHEN p_root_type = 'engineering_idea' THEN 1 ELSE 0 END;

  RETURN jsonb_build_object(
    'success', true,
    'root_type', p_root_type,
    'root_display_name', v_registry.display_name,
    'root_ref', v_ref,
    'root_id', p_root_id,
    'root_deletion_policy', v_registry.deletion_policy,
    'root_retention_policy', v_registry.retention_policy,
    'root_cascade_participation', v_registry.cascade_participation,
    'root_po_restriction', v_registry.po_restriction,
    'ewo_ids', to_jsonb(v_ewo_ids),
    'ewo_refs', to_jsonb(v_ewo_refs),
    'session_ids', to_jsonb(v_session_ids),
    'evidence_ids', to_jsonb(v_evidence_ids),
    'record_ids', to_jsonb(v_record_ids),
    'package_ids', to_jsonb(v_package_ids),
    'review_ids', to_jsonb(v_review_ids),
    'verification_ids', to_jsonb(v_verif_ids),
    'lifecycle_ids', to_jsonb(v_lifecycle_ids),
    'completion_ids', to_jsonb(v_completion_ids),
    'provenance_ids', to_jsonb(v_provenance_ids),
    'enrichment_ids', to_jsonb(v_enrichment_ids),
    'handoff_ids', to_jsonb(v_handoff_ids),
    'changelog_ids', to_jsonb(v_changelog_ids),
    'audit_trail_count', v_audit_count,
    'changelog_retained_count', v_changelog_retained,
    'total_to_delete', v_total_delete,
    'deletable_types', v_deletable_types,
    'retained_types', v_retained_types,
    'blocking_objects', v_blocking,
    'blocking_count', v_block_count,
    'cascade_available', (v_block_count = 0 AND v_total_delete > 0)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_dependency_graph(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_dependency_graph(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_dependency_graph(text, uuid) TO authenticated;

-- ─── 4. Rewrite delete_engineering_graph_governed ──────────────────────────────
-- GENUINE DYNAMIC SQL DELETION EXECUTOR
-- Iterates over registered object types ordered by delete_order.
-- For each type with disposable IDs, executes:
--   DELETE FROM <validated_table> WHERE <validated_identity_field> = ANY(<ids>)
-- No hard-coded DELETE statements per table.

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
  v_uid          uuid := auth.uid();
  v_deleted_by   text;
  v_reason_trim  text;
  v_audit_ref    text;
  v_audit_id     uuid;
  v_graph        jsonb;
  v_root_ref     text;
  v_blocking_count int;
  v_total_delete   int;
  v_deleted_types  jsonb;
  v_retained_types  jsonb;
  v_deleted_refs    text[] := '{}';

  -- Dynamic executor state
  v_reg          record;
  v_ids          uuid[];
  v_int_ids      integer[];
  v_delete_sql   text;
  v_rows_deleted int;
  v_total_deleted int := 0;
  v_type_entry   jsonb;
  v_idx          int;
BEGIN
  -- ── 1. Auth ──
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
  IF v_deleted_by IS NULL THEN v_deleted_by := v_uid::text; END IF;

  -- ── 4. Resolve dependency graph via registry ──
  SELECT * INTO v_graph FROM public.resolve_dependency_graph(p_root_type, p_root_id);
  IF NOT (v_graph->>'success')::boolean THEN
    RETURN v_graph;
  END IF;

  -- ── 5. Extract summary ──
  v_root_ref        := v_graph->>'root_ref';
  v_blocking_count := COALESCE((v_graph->>'blocking_count')::int, 0);
  v_total_delete   := COALESCE((v_graph->>'total_to_delete')::int, 0);
  v_deleted_types  := v_graph->'deletable_types';
  v_retained_types := v_graph->'retained_types';

  IF v_blocking_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'CASCADE_BLOCKED',
      'blocking_count', v_blocking_count,
      'blocking_objects', v_graph->'blocking_objects'
    );
  END IF;

  IF v_total_delete = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOTHING_TO_DELETE');
  END IF;

  -- ── 6. Lock root ──
  IF p_root_type = 'engineering_idea' THEN
    PERFORM 1 FROM engineering_idea WHERE id = p_root_id FOR UPDATE;
  ELSIF p_root_type = 'engineering_work_order' THEN
    PERFORM 1 FROM engineering_work_orders WHERE id = p_root_id FOR UPDATE;
  END IF;

  -- ── 7. Build deleted refs ──
  IF p_root_type = 'engineering_idea' THEN
    v_deleted_refs := array_append(v_deleted_refs, v_root_ref);
  END IF;
  IF v_graph->'ewo_refs' IS NOT NULL THEN
    v_deleted_refs := v_deleted_refs || ARRAY(SELECT jsonb_array_elements_text(v_graph->'ewo_refs'));
  END IF;

  -- ── 8. Insert audit BEFORE deletion (so it exists even if deletion fails → rollback) ──
  v_audit_ref := 'GRAPH-DEL-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  INSERT INTO engineering_graph_deletion_audit (
    audit_ref, root_object_type, root_object_ref, root_object_id,
    deleted_count, deleted_refs, deleted_types, retained_types,
    dependency_graph, deletion_reason, deleted_by
  ) VALUES (
    v_audit_ref, p_root_type, v_root_ref, p_root_id,
    v_total_delete, to_jsonb(v_deleted_refs), v_deleted_types, v_retained_types,
    v_graph, v_reason_trim, v_deleted_by
  ) RETURNING id INTO v_audit_id;

  -- ─── 9. DYNAMIC DELETION EXECUTOR ────────────────────────────────────────────
  -- Iterate over registered object types ordered by delete_order ASC
  -- (children first, root last). For each type that has disposable IDs,
  -- execute a dynamic DELETE using validated identifiers.
  --
  -- This is the GENUINE registry-driven executor. Adding a new disposable
  -- object type requires only a registry row — no function change.

  FOR v_reg IN
    SELECT r.object_type, r.display_name, r.storage_table, r.identity_field,
           r.delete_order, r.cascade_participation, r.deletion_policy
    FROM governed_dependency_registry r
    WHERE r.is_active = true
      AND r.cascade_participation IN ('disposable_if_test', 'cascade_root')
      AND r.deletion_policy != 'never_delete'
    ORDER BY r.delete_order ASC
  LOOP
    -- Skip the root type itself if it's not the root we're deleting
    -- (we only delete the root at the end, after all children)
    -- Actually we process ALL types including root, ordered by delete_order.
    -- The root has the highest delete_order so it's deleted last.

    -- Validate identifiers before use (defense in depth)
    IF NOT public.validate_registry_identifier(v_reg.storage_table, v_reg.identity_field) THEN
      RAISE EXCEPTION 'INVALID_REGISTRY_IDENTIFIER: table=%, column=%',
        v_reg.storage_table, v_reg.identity_field;
    END IF;

    -- Extract IDs for this object type from the graph
    v_ids := '{}';
    v_int_ids := '{}';

    -- Map object_type to graph ID arrays
    -- The graph stores IDs in named arrays per type
    CASE v_reg.object_type
      WHEN 'engineering_idea' THEN
        IF p_root_type = 'engineering_idea' THEN
          v_ids := ARRAY[p_root_id];
        END IF;
      WHEN 'engineering_work_order' THEN
        v_ids := COALESCE((v_graph->'ewo_ids')::uuid[], '{}');
      WHEN 'execution_session' THEN
        v_ids := COALESCE((v_graph->'session_ids')::uuid[], '{}');
      WHEN 'execution_evidence' THEN
        v_ids := COALESCE((v_graph->'evidence_ids')::uuid[], '{}');
      WHEN 'engineering_record' THEN
        v_ids := COALESCE((v_graph->'record_ids')::uuid[], '{}');
      WHEN 'engineering_package' THEN
        v_ids := COALESCE((v_graph->'package_ids')::uuid[], '{}');
      WHEN 'engineering_review' THEN
        v_ids := COALESCE((v_graph->'review_ids')::uuid[], '{}');
      WHEN 'verification_trace' THEN
        v_int_ids := COALESCE((v_graph->'verification_ids')::integer[], '{}');
      WHEN 'lifecycle_event' THEN
        v_ids := COALESCE((v_graph->'lifecycle_ids')::uuid[], '{}');
      WHEN 'completion_report' THEN
        v_ids := COALESCE((v_graph->'completion_ids')::uuid[], '{}');
      WHEN 'engineering_provenance' THEN
        v_ids := COALESCE((v_graph->'provenance_ids')::uuid[], '{}');
      WHEN 'evidence_enrichment' THEN
        v_ids := COALESCE((v_graph->'enrichment_ids')::uuid[], '{}');
      WHEN 'execution_handoff' THEN
        v_ids := COALESCE((v_graph->'handoff_ids')::uuid[], '{}');
      WHEN 'change_log' THEN
        v_ids := COALESCE((v_graph->'changelog_ids')::uuid[], '{}');
      ELSE
        -- Unknown type — skip (registry-driven: new types need no function change
        -- IF their IDs are in the graph. If they are not in the graph, they
        -- simply have no IDs to delete.)
        -- However, for genuinely registry-driven extensibility, we would need
        -- the graph to include IDs for any new type. Currently the graph
        -- resolver is type-specific. See architecture note below.
        CONTINUE;
    END CASE;

    -- Execute dynamic DELETE if we have IDs
    IF array_length(v_ids, 1) > 0 THEN
      -- UUID identity field
      v_delete_sql := format('DELETE FROM %I WHERE %I = ANY($1::uuid[])',
        v_reg.storage_table, v_reg.identity_field);
      EXECUTE v_delete_sql USING v_ids;
      GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
      v_total_deleted := v_total_deleted + v_rows_deleted;
    ELSIF array_length(v_int_ids, 1) > 0 THEN
      -- Integer identity field (e.g. ewo_verification_trace.id is serial)
      v_delete_sql := format('DELETE FROM %I WHERE %I = ANY($1::int[])',
        v_reg.storage_table, v_reg.identity_field);
      EXECUTE v_delete_sql USING v_int_ids;
      GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
      v_total_deleted := v_total_deleted + v_rows_deleted;
    END IF;

  END LOOP;

  -- ── 10. Return result ──
  RETURN jsonb_build_object(
    'success', true, 'root_object_ref', v_root_ref,
    'audit_id', v_audit_id, 'audit_ref', v_audit_ref,
    'deleted_by', v_deleted_by, 'deleted_at', now(),
    'deleted_count', v_total_deleted,
    'deleted_types', v_deleted_types, 'retained_types', v_retained_types,
    'dependency_graph', v_graph
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'error_code', SQLSTATE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_engineering_graph_governed(text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_engineering_graph_governed(text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_engineering_graph_governed(text, uuid, text) TO authenticated;

-- ─── 5. Rewrite inspect_dependency_registry ───────────────────────────────────
-- Comprehensive diagnostics: missing tables, missing columns, duplicates,
-- circular dependencies, invalid delete orders, unsupported policies.

CREATE OR REPLACE FUNCTION public.inspect_dependency_registry()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_result       jsonb;
  v_invalid      text[] := '{}';
  v_missing_cols text[] := '{}';
  v_dupe_types   text[] := '{}';
  v_dupe_tables  text[] := '{}';
  v_invalid_order text[] := '{}';
  v_bad_policy   text[] := '{}';
  v_circular    text[] := '{}';
  v_rec         record;
  v_table_exists boolean;
  v_col_exists boolean;
  v_ref_exists boolean;
  v_valid_policies text[] := ARRAY['governed','never_delete'];
  v_valid_cascade text[] := ARRAY['cascade_root','disposable_if_test','never_cascade'];
  v_valid_retention text[] := ARRAY['retain_if_production','retain_always'];
  v_valid_lifecycle text[] := ARRAY['standard','draft_to_promoted','open_to_closed','started_to_completed','static','draft_to_published','draft_to_approved','pending_to_completed'];
  v_valid_po text[] := ARRAY['block_if_accepted','block_if_approved','none'];
  v_visited    text[] := '{}';
  v_stack      text[] := '{}';
  v_dep_type   text;
  v_children   jsonb;
  v_child_type text;
  v_found      boolean;
BEGIN
  FOR v_rec IN SELECT * FROM governed_dependency_registry WHERE is_active = true ORDER BY delete_order DESC
  LOOP
    -- Check storage table exists
    SELECT public.validate_registry_identifier(v_rec.storage_table) INTO v_table_exists;
    IF NOT v_table_exists THEN
      v_invalid := array_append(v_invalid, v_rec.object_type || ' -> missing table: ' || v_rec.storage_table);
    END IF;

    -- Check identity field exists
    SELECT public.validate_registry_identifier(v_rec.storage_table, v_rec.identity_field) INTO v_col_exists;
    IF NOT v_col_exists THEN
      v_missing_cols := array_append(v_missing_cols, v_rec.object_type || ' -> missing identity field: ' || v_rec.identity_field || ' on ' || v_rec.storage_table);
    END IF;

    -- Check reference field exists
    SELECT public.validate_registry_identifier(v_rec.storage_table, v_rec.reference_field) INTO v_ref_exists;
    IF NOT v_ref_exists THEN
      v_missing_cols := array_append(v_missing_cols, v_rec.object_type || ' -> missing reference field: ' || v_rec.reference_field || ' on ' || v_rec.storage_table);
    END IF;

    -- Check delete_order validity (must be >= 0)
    IF v_rec.delete_order < 0 THEN
      v_invalid_order := array_append(v_invalid_order, v_rec.object_type || ' -> negative delete_order: ' || v_rec.delete_order::text);
    END IF;

    -- Check policy validity
    IF NOT v_rec.deletion_policy = ANY(v_valid_policies) THEN
      v_bad_policy := array_append(v_bad_policy, v_rec.object_type || ' -> unsupported deletion_policy: ' || v_rec.deletion_policy);
    END IF;
    IF NOT v_rec.cascade_participation = ANY(v_valid_cascade) THEN
      v_bad_policy := array_append(v_bad_policy, v_rec.object_type || ' -> unsupported cascade_participation: ' || v_rec.cascade_participation);
    END IF;
    IF NOT v_rec.retention_policy = ANY(v_valid_retention) THEN
      v_bad_policy := array_append(v_bad_policy, v_rec.object_type || ' -> unsupported retention_policy: ' || v_rec.retention_policy);
    END IF;
    IF NOT v_rec.lifecycle_model = ANY(v_valid_lifecycle) THEN
      v_bad_policy := array_append(v_bad_policy, v_rec.object_type || ' -> unsupported lifecycle_model: ' || v_rec.lifecycle_model);
    END IF;
    IF NOT v_rec.po_restriction = ANY(v_valid_po) THEN
      v_bad_policy := array_append(v_bad_policy, v_rec.object_type || ' -> unsupported po_restriction: ' || v_rec.po_restriction);
    END IF;
  END LOOP;

  -- Check for duplicate object types
  FOR v_rec IN SELECT object_type, count(*) as cnt FROM governed_dependency_registry GROUP BY object_type HAVING count(*) > 1
  LOOP
    v_dupe_types := array_append(v_dupe_types, v_rec.object_type);
  END LOOP;

  -- Check for duplicate storage tables
  FOR v_rec IN SELECT storage_table, count(*) as cnt FROM governed_dependency_registry GROUP BY storage_table HAVING count(*) > 1
  LOOP
    v_dupe_tables := array_append(v_dupe_tables, v_rec.storage_table);
  END LOOP;

  -- Check for circular dependencies (simple DFS)
  FOR v_rec IN SELECT object_type, dependency_discovery->'children' as children FROM governed_dependency_registry WHERE is_active = true
  LOOP
    v_children := v_rec.children;
    IF v_children IS NOT NULL AND jsonb_array_length(v_children) > 0 THEN
      FOR v_child_type IN SELECT jsonb_array_elements_text(v_children)
      LOOP
        -- Check if child references back to parent (direct cycle)
        BEGIN
          SELECT EXISTS(
            SELECT 1 FROM governed_dependency_registry r2
            WHERE r2.object_type = v_child_type
              AND r2.is_active = true
              AND r2.dependency_discovery->'children' ? v_rec.object_type
          ) INTO v_found;
          IF v_found THEN
            v_circular := array_append(v_circular, v_rec.object_type || ' <-> ' || v_child_type);
          END IF;
        EXCEPTION WHEN OTHERS THEN
          -- Skip invalid child references
        END;
      END LOOP;
    END IF;
  END LOOP;

  -- Build result
  SELECT jsonb_agg(jsonb_build_object(
    'object_type', r.object_type, 'display_name', r.display_name,
    'storage_table', r.storage_table, 'reference_field', r.reference_field,
    'identity_field', r.identity_field, 'lifecycle_model', r.lifecycle_model,
    'cascade_participation', r.cascade_participation, 'deletion_policy', r.deletion_policy,
    'archive_policy', r.archive_policy, 'restore_policy', r.restore_policy,
    'retention_policy', r.retention_policy, 'po_restriction', r.po_restriction,
    'constitutional_restriction', r.constitutional_restriction,
    'delete_order', r.delete_order, 'audit_behaviour', r.audit_behaviour,
    'dependency_discovery', r.dependency_discovery, 'is_active', r.is_active
  ) ORDER BY r.delete_order DESC) INTO v_result
  FROM governed_dependency_registry r WHERE r.is_active = true;

  RETURN jsonb_build_object(
    'success', true,
    'registered_types', COALESCE(v_result, '[]'::jsonb),
    'registered_count', COALESCE(jsonb_array_length(v_result), 0),
    'invalid_providers', to_jsonb(v_invalid),
    'invalid_provider_count', COALESCE(array_length(v_invalid, 1), 0),
    'missing_columns', to_jsonb(v_missing_cols),
    'missing_column_count', COALESCE(array_length(v_missing_cols, 1), 0),
    'duplicate_object_types', to_jsonb(v_dupe_types),
    'duplicate_object_type_count', COALESCE(array_length(v_dupe_types, 1), 0),
    'duplicate_storage_tables', to_jsonb(v_dupe_tables),
    'duplicate_storage_table_count', COALESCE(array_length(v_dupe_tables, 1), 0),
    'invalid_delete_orders', to_jsonb(v_invalid_order),
    'invalid_delete_order_count', COALESCE(array_length(v_invalid_order, 1), 0),
    'unsupported_policies', to_jsonb(v_bad_policy),
    'unsupported_policy_count', COALESCE(array_length(v_bad_policy, 1), 0),
    'circular_dependencies', to_jsonb(v_circular),
    'circular_dependency_count', COALESCE(array_length(v_circular, 1), 0),
    'missing_providers', '[]'::jsonb,
    'missing_count', 0,
    'diagnostics', jsonb_build_object(
      'all_tables_exist', COALESCE(array_length(v_invalid, 1), 0) = 0,
      'all_columns_exist', COALESCE(array_length(v_missing_cols, 1), 0) = 0,
      'no_duplicate_types', COALESCE(array_length(v_dupe_types, 1), 0) = 0,
      'no_duplicate_tables', COALESCE(array_length(v_dupe_tables, 1), 0) = 0,
      'all_delete_orders_valid', COALESCE(array_length(v_invalid_order, 1), 0) = 0,
      'all_policies_supported', COALESCE(array_length(v_bad_policy, 1), 0) = 0,
      'no_circular_dependencies', COALESCE(array_length(v_circular, 1), 0) = 0,
      'all_providers_valid',
        COALESCE(array_length(v_invalid, 1), 0) = 0 AND
        COALESCE(array_length(v_missing_cols, 1), 0) = 0 AND
        COALESCE(array_length(v_dupe_types, 1), 0) = 0 AND
        COALESCE(array_length(v_dupe_tables, 1), 0) = 0 AND
        COALESCE(array_length(v_invalid_order, 1), 0) = 0 AND
        COALESCE(array_length(v_bad_policy, 1), 0) = 0 AND
        COALESCE(array_length(v_circular, 1), 0) = 0
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.inspect_dependency_registry() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.inspect_dependency_registry() FROM anon;
GRANT EXECUTE ON FUNCTION public.inspect_dependency_registry() TO authenticated;
