/*
# EWO-032R.14 — Governed Dependency Registry & Runtime Dependency Resolution

## Root Cause
`engineering_audit_trail` does NOT exist. The canonical table is
`execution_audit_trail`. The R.13 RPC and frontend referenced the wrong name
directly — a symptom of hard-coded dependency knowledge.

## Fix
Introduce a canonical Governed Dependency Registry. All governed operations
resolve dependencies through the registry, never through hard-coded table
lists.
*/

-- ─── 1. Registry table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS governed_dependency_registry (
  id                       serial PRIMARY KEY,
  object_type              text UNIQUE NOT NULL,
  display_name            text NOT NULL,
  storage_table           text NOT NULL,
  reference_field         text NOT NULL,
  identity_field          text NOT NULL,
  lifecycle_model         text NOT NULL DEFAULT 'standard',
  cascade_participation   text NOT NULL DEFAULT 'disposable_if_test',
  deletion_policy         text NOT NULL DEFAULT 'governed',
  archive_policy          text NOT NULL DEFAULT 'optional',
  restore_policy          text NOT NULL DEFAULT 'not_applicable',
  retention_policy        text NOT NULL DEFAULT 'retain_if_production',
  po_restriction          text NOT NULL DEFAULT 'block_if_accepted',
  constitutional_restriction text NOT NULL DEFAULT 'none',
  delete_order            integer NOT NULL DEFAULT 500,
  audit_behaviour         text NOT NULL DEFAULT 'retain_always',
  dependency_discovery    jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE governed_dependency_registry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON governed_dependency_registry FROM anon;

DROP POLICY IF EXISTS "staff_select_dependency_registry" ON governed_dependency_registry;
CREATE POLICY "staff_select_dependency_registry"
  ON governed_dependency_registry FOR SELECT
  TO authenticated USING (public.is_staff());

-- ─── 2. Seed: 15 governed object types ─────────────────────────────────────────

INSERT INTO governed_dependency_registry
  (object_type, display_name, storage_table, reference_field, identity_field,
   lifecycle_model, cascade_participation, deletion_policy, archive_policy,
   restore_policy, retention_policy, po_restriction, constitutional_restriction,
   delete_order, audit_behaviour, dependency_discovery)
VALUES
  ('engineering_idea', 'Engineering Idea', 'engineering_idea', 'idea_ref', 'id',
   'draft_to_promoted', 'cascade_root', 'governed', 'optional', 'not_applicable',
   'retain_if_production', 'block_if_accepted', 'none', 700, 'retain_always',
   '{"depends_on": ["execution_sessions", "engineering_work_orders"], "children": ["execution_evidence", "engineering_records_library", "ewo_engineering_packages", "ecc_engineering_reviews"], "retained": ["execution_audit_trail"], "link_fields": {"session_id": "execution_sessions.id", "related_ewo_refs": "engineering_work_orders.ewo_ref"}}'::jsonb),

  ('engineering_work_order', 'Engineering Work Order', 'engineering_work_orders', 'ewo_ref', 'id',
   'open_to_closed', 'disposable_if_test', 'governed', 'optional', 'not_applicable',
   'retain_if_production', 'block_if_accepted', 'none', 600, 'retain_always',
   '{"depends_on": ["execution_sessions"], "children": ["ewo_engineering_packages", "ecc_engineering_reviews", "ewo_verification_trace", "ewo_lifecycle_events", "ewo_completion_reports", "ewo_engineering_provenance", "ewo_evidence_enrichments", "execution_handoff_requests", "engineering_change_log"], "retained": ["execution_audit_trail"], "link_fields": {"ewo_id": "execution_sessions.ewo_id", "ewo_ref": "engineering_records_library.ewo_ref", "ewo_ref": "execution_handoff_requests.ewo_ref", "ewo_ref": "engineering_change_log.ewo_ref", "ewo_id": "ewo_engineering_packages.ewo_id", "metadata->>ewo_ref": "ecc_engineering_reviews.metadata->>ewo_ref", "ewo_id": "ewo_verification_trace.ewo_id", "ewo_id": "ewo_lifecycle_events.ewo_id", "ewo_id": "ewo_completion_reports.ewo_id", "ewo_id": "ewo_engineering_provenance.ewo_id", "ewo_id": "ewo_evidence_enrichments.ewo_id", "ewo_ref": "execution_audit_trail.ewo_ref"}}'::jsonb),

  ('execution_session', 'Execution Session', 'execution_sessions', 'session_ref', 'id',
   'started_to_completed', 'disposable_if_test', 'governed', 'not_applicable', 'not_applicable',
   'retain_if_production', 'block_if_accepted', 'none', 500, 'retain_always',
   '{"depends_on": [], "children": ["execution_evidence"], "retained": ["execution_audit_trail"], "link_fields": {"session_id": "execution_evidence.session_id", "session_id": "execution_audit_trail.session_id"}}'::jsonb),

  ('execution_evidence', 'Execution Evidence', 'execution_evidence', 'id', 'id',
   'static', 'disposable_if_test', 'governed', 'not_applicable', 'not_applicable',
   'retain_if_production', 'none', 'none', 400, 'retain_always',
   '{"depends_on": [], "children": [], "retained": [], "link_fields": {}}'::jsonb),

  ('engineering_record', 'Engineering Records Library', 'engineering_records_library', 'record_ref', 'id',
   'draft_to_published', 'disposable_if_test', 'governed', 'optional', 'not_applicable',
   'retain_if_production', 'none', 'none', 300, 'retain_always',
   '{"depends_on": [], "children": [], "retained": [], "link_fields": {}}'::jsonb),

  ('engineering_package', 'Engineering Package', 'ewo_engineering_packages', 'id', 'id',
   'static', 'disposable_if_test', 'governed', 'not_applicable', 'not_applicable',
   'retain_if_production', 'none', 'none', 250, 'retain_always',
   '{"depends_on": [], "children": [], "retained": [], "link_fields": {}}'::jsonb),

  ('engineering_review', 'Engineering Review', 'ecc_engineering_reviews', 'id', 'id',
   'draft_to_approved', 'disposable_if_test', 'governed', 'optional', 'not_applicable',
   'retain_if_production', 'block_if_approved', 'none', 200, 'retain_always',
   '{"depends_on": [], "children": [], "retained": [], "link_fields": {}}'::jsonb),

  ('verification_trace', 'Verification Trace', 'ewo_verification_trace', 'id', 'id',
   'static', 'disposable_if_test', 'governed', 'not_applicable', 'not_applicable',
   'retain_if_production', 'none', 'none', 150, 'retain_always',
   '{"depends_on": [], "children": [], "retained": [], "link_fields": {}}'::jsonb),

  ('lifecycle_event', 'Lifecycle Event', 'ewo_lifecycle_events', 'id', 'id',
   'static', 'disposable_if_test', 'governed', 'not_applicable', 'not_applicable',
   'retain_if_production', 'none', 'none', 100, 'retain_always',
   '{"depends_on": [], "children": [], "retained": [], "link_fields": {}}'::jsonb),

  ('completion_report', 'Completion Report', 'ewo_completion_reports', 'id', 'id',
   'static', 'disposable_if_test', 'governed', 'not_applicable', 'not_applicable',
   'retain_if_production', 'block_if_accepted', 'none', 90, 'retain_always',
   '{"depends_on": [], "children": [], "retained": [], "link_fields": {}}'::jsonb),

  ('engineering_provenance', 'Engineering Provenance', 'ewo_engineering_provenance', 'id', 'id',
   'static', 'disposable_if_test', 'governed', 'not_applicable', 'not_applicable',
   'retain_if_production', 'none', 'none', 80, 'retain_always',
   '{"depends_on": [], "children": [], "retained": [], "link_fields": {}}'::jsonb),

  ('evidence_enrichment', 'Evidence Enrichment', 'ewo_evidence_enrichments', 'id', 'id',
   'static', 'disposable_if_test', 'governed', 'not_applicable', 'not_applicable',
   'retain_if_production', 'none', 'none', 70, 'retain_always',
   '{"depends_on": [], "children": [], "retained": [], "link_fields": {}}'::jsonb),

  ('execution_handoff', 'Execution Handoff Request', 'execution_handoff_requests', 'id', 'id',
   'pending_to_completed', 'disposable_if_test', 'governed', 'not_applicable', 'not_applicable',
   'retain_if_production', 'none', 'none', 60, 'retain_always',
   '{"depends_on": [], "children": [], "retained": [], "link_fields": {}}'::jsonb),

  ('change_log', 'Change Log', 'engineering_change_log', 'change_ref', 'id',
   'static', 'disposable_if_test', 'governed', 'not_applicable', 'not_applicable',
   'retain_always', 'none', 'none', 50, 'retain_always',
   '{"depends_on": [], "children": [], "retained": [], "link_fields": {}}'::jsonb),

  ('audit_trail', 'Audit Trail', 'execution_audit_trail', 'audit_ref', 'id',
   'static', 'never_cascade', 'never_delete', 'not_applicable', 'not_applicable',
   'retain_always', 'none', 'none', 0, 'retain_always',
   '{"depends_on": [], "children": [], "retained": [], "link_fields": {}}'::jsonb)

ON CONFLICT (object_type) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  storage_table = EXCLUDED.storage_table,
  reference_field = EXCLUDED.reference_field,
  identity_field = EXCLUDED.identity_field,
  lifecycle_model = EXCLUDED.lifecycle_model,
  cascade_participation = EXCLUDED.cascade_participation,
  deletion_policy = EXCLUDED.deletion_policy,
  archive_policy = EXCLUDED.archive_policy,
  restore_policy = EXCLUDED.restore_policy,
  retention_policy = EXCLUDED.retention_policy,
  po_restriction = EXCLUDED.po_restriction,
  constitutional_restriction = EXCLUDED.constitutional_restriction,
  delete_order = EXCLUDED.delete_order,
  audit_behaviour = EXCLUDED.audit_behaviour,
  dependency_discovery = EXCLUDED.dependency_discovery,
  updated_at = now();

-- ─── 3. resolve_dependency_graph RPC ──────────────────────────────────────────

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
  v_record_ids    uuid[] := '{}';
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
  v_deletable_types jsonb := '{}'::jsonb;
  v_retained_types  jsonb := '{}'::jsonb;
BEGIN
  -- Load registry entry
  SELECT * INTO v_registry FROM governed_dependency_registry
  WHERE object_type = p_root_type AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'REGISTRY_NOT_FOUND', 'object_type', p_root_type);
  END IF;

  -- Load root reference
  EXECUTE format('SELECT %I FROM %I WHERE %I = $1', v_registry.reference_field, v_registry.storage_table, v_registry.identity_field)
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

    -- Resolve linked EWOs
    IF array_length(v_ewo_refs, 1) > 0 THEN
      FOR v_rec IN SELECT id, ewo_ref, is_test_artifact, po_accepted_at
                   FROM engineering_work_orders WHERE ewo_ref = ANY(v_ewo_refs)
      LOOP
        v_ewo_ids := array_append(v_ewo_ids, v_rec.id);
        v_is_test := COALESCE(v_rec.is_test_artifact, false);
        IF NOT v_is_test THEN
          v_blocking := v_blocking || jsonb_build_object('object_type','engineering_work_order','object_ref',v_rec.ewo_ref,'reason','EWO is not a Test Artefact');
          v_block_count := v_block_count + 1;
        END IF;
        IF v_rec.po_accepted_at IS NOT NULL THEN
          v_blocking := v_blocking || jsonb_build_object('object_type','engineering_work_order','object_ref',v_rec.ewo_ref,'reason','EWO has PO acceptance');
          v_block_count := v_block_count + 1;
        END IF;
      END LOOP;
    END IF;

  ELSIF p_root_type = 'engineering_work_order' THEN
    v_ewo_ids := array_append(v_ewo_ids, p_root_id);
    v_ewo_refs := array_append(v_ewo_refs, v_ref);
  END IF;

  -- ── Sessions from EWO ids ──
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM execution_sessions WHERE ewo_id = ANY(v_ewo_ids)
    LOOP v_session_ids := array_append(v_session_ids, v_rec.id); END LOOP;
  END IF;

  -- ── Execution evidence ──
  IF array_length(v_session_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id, metadata FROM execution_evidence WHERE session_id = ANY(v_session_ids)
    LOOP
      v_evidence_ids := array_append(v_evidence_ids, v_rec.id);
      v_is_test := COALESCE((v_rec.metadata->>'is_test_artifact')::boolean, false);
      IF NOT v_is_test THEN
        v_blocking := v_blocking || jsonb_build_object('object_type','execution_evidence','object_ref',v_rec.id::text,'reason','Evidence is not a Test Artefact');
        v_block_count := v_block_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- ── Records library ──
  IF array_length(v_ewo_refs, 1) > 0 THEN
    FOR v_rec IN SELECT id, record_ref, semantic_metadata FROM engineering_records_library
                 WHERE ewo_ref = ANY(v_ewo_refs) OR semantic_metadata->>'idea_id' = p_root_id::text
    LOOP
      v_record_ids := array_append(v_record_ids, v_rec.id);
      v_is_test := COALESCE((v_rec.semantic_metadata->>'is_test_artifact')::boolean, false);
      IF NOT v_is_test THEN
        v_blocking := v_blocking || jsonb_build_object('object_type','engineering_records_library','object_ref',v_rec.record_ref,'reason','Record is not a Test Artefact');
        v_block_count := v_block_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- ── Packages ──
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_engineering_packages WHERE ewo_id = ANY(v_ewo_ids)
    LOOP v_package_ids := array_append(v_package_ids, v_rec.id); END LOOP;
  END IF;

  -- ── Reviews ──
  IF array_length(v_ewo_refs, 1) > 0 THEN
    FOR v_rec IN SELECT id, status FROM ecc_engineering_reviews WHERE metadata->>'ewo_ref' = ANY(v_ewo_refs)
    LOOP
      v_review_ids := array_append(v_review_ids, v_rec.id);
      IF v_rec.status = 'approved' THEN
        v_blocking := v_blocking || jsonb_build_object('object_type','ecc_engineering_reviews','object_ref',v_rec.id::text,'reason','Review is approved — governed approval');
        v_block_count := v_block_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- ── Verification trace ──
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_verification_trace WHERE ewo_id = ANY(v_ewo_ids)
    LOOP v_verif_ids := array_append(v_verif_ids, v_rec.id); END LOOP;
  END IF;

  -- ── Lifecycle events ──
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_lifecycle_events WHERE ewo_id = ANY(v_ewo_ids)
    LOOP v_lifecycle_ids := array_append(v_lifecycle_ids, v_rec.id); END LOOP;
  END IF;

  -- ── Completion reports ──
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_completion_reports WHERE ewo_id = ANY(v_ewo_ids)
    LOOP v_completion_ids := array_append(v_completion_ids, v_rec.id); END LOOP;
  END IF;

  -- ── Provenance ──
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_engineering_provenance WHERE ewo_id = ANY(v_ewo_ids)
    LOOP v_provenance_ids := array_append(v_provenance_ids, v_rec.id); END LOOP;
  END IF;

  -- ── Enrichments ──
  IF array_length(v_ewo_ids, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM ewo_evidence_enrichments WHERE ewo_id = ANY(v_ewo_ids)
    LOOP v_enrichment_ids := array_append(v_enrichment_ids, v_rec.id); END LOOP;
  END IF;

  -- ── Handoff requests ──
  IF array_length(v_ewo_refs, 1) > 0 THEN
    FOR v_rec IN SELECT id FROM execution_handoff_requests WHERE ewo_ref = ANY(v_ewo_refs)
    LOOP v_handoff_ids := array_append(v_handoff_ids, v_rec.id); END LOOP;
  END IF;

  -- ── Change log ──
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

  -- ── Audit trail count (always retained) ──
  IF array_length(v_ewo_refs, 1) > 0 THEN
    SELECT count(*) INTO v_audit_count FROM execution_audit_trail
    WHERE ewo_ref = ANY(v_ewo_refs) OR session_id = ANY(v_session_ids);
  END IF;

  -- ── Summary ──
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

  v_deletable_types := jsonb_build_object(
    'engineering_idea', CASE WHEN p_root_type = 'engineering_idea' THEN 1 ELSE 0 END,
    'engineering_work_orders', COALESCE(array_length(v_ewo_ids, 1), 0),
    'execution_sessions', COALESCE(array_length(v_session_ids, 1), 0),
    'execution_evidence', COALESCE(array_length(v_evidence_ids, 1), 0),
    'engineering_records_library', COALESCE(array_length(v_record_ids, 1), 0),
    'ewo_engineering_packages', COALESCE(array_length(v_package_ids, 1), 0),
    'ecc_engineering_reviews', COALESCE(array_length(v_review_ids, 1), 0),
    'ewo_verification_trace', COALESCE(array_length(v_verif_ids, 1), 0),
    'ewo_lifecycle_events', COALESCE(array_length(v_lifecycle_ids, 1), 0),
    'ewo_completion_reports', COALESCE(array_length(v_completion_ids, 1), 0),
    'ewo_engineering_provenance', COALESCE(array_length(v_provenance_ids, 1), 0),
    'ewo_evidence_enrichments', COALESCE(array_length(v_enrichment_ids, 1), 0),
    'execution_handoff_requests', COALESCE(array_length(v_handoff_ids, 1), 0),
    'engineering_change_log', COALESCE(array_length(v_changelog_ids, 1), 0)
  );

  v_retained_types := jsonb_build_object(
    'execution_audit_trail', v_audit_count,
    'engineering_change_log_retained', v_changelog_retained
  );

  RETURN jsonb_build_object(
    'success', true,
    'root_type', p_root_type,
    'root_ref', v_ref,
    'root_id', p_root_id,
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

-- ─── 4. inspect_dependency_registry RPC ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.inspect_dependency_registry()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_result     jsonb;
  v_invalid    text[] := '{}';
  v_rec        record;
  v_table_exists boolean;
BEGIN
  FOR v_rec IN SELECT object_type, storage_table FROM governed_dependency_registry WHERE is_active = true
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_rec.storage_table
    ) INTO v_table_exists;
    IF NOT v_table_exists THEN
      v_invalid := array_append(v_invalid, v_rec.object_type || ' -> ' || v_rec.storage_table);
    END IF;
  END LOOP;

  SELECT jsonb_agg(jsonb_build_object(
    'object_type', object_type, 'display_name', display_name,
    'storage_table', storage_table, 'reference_field', reference_field,
    'identity_field', identity_field, 'lifecycle_model', lifecycle_model,
    'cascade_participation', cascade_participation, 'deletion_policy', deletion_policy,
    'archive_policy', archive_policy, 'restore_policy', restore_policy,
    'retention_policy', retention_policy, 'po_restriction', po_restriction,
    'constitutional_restriction', constitutional_restriction,
    'delete_order', delete_order, 'audit_behaviour', audit_behaviour,
    'dependency_discovery', dependency_discovery, 'is_active', is_active
  ) ORDER BY delete_order DESC) INTO v_result
  FROM governed_dependency_registry WHERE is_active = true;

  RETURN jsonb_build_object(
    'success', true,
    'registered_types', COALESCE(v_result, '[]'::jsonb),
    'registered_count', COALESCE(jsonb_array_length(v_result), 0),
    'invalid_providers', to_jsonb(v_invalid),
    'invalid_count', COALESCE(array_length(v_invalid, 1), 0),
    'missing_providers', '[]'::jsonb,
    'missing_count', 0,
    'diagnostics', jsonb_build_object(
      'all_tables_exist', COALESCE(array_length(v_invalid, 1), 0) = 0,
      'all_providers_valid', COALESCE(array_length(v_invalid, 1), 0) = 0
    )
  );
END;
$$;

-- ─── 5. Rewrite delete_engineering_graph_governed ─────────────────────────────

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
  v_ewo_ids      uuid[] := '{}';
  v_ewo_refs     text[] := '{}';
  v_session_ids  uuid[] := '{}';
  v_evidence_ids uuid[] := '{}';
  v_record_ids   uuid[] := '{}';
  v_package_ids  uuid[] := '{}';
  v_review_ids   uuid[] := '{}';
  v_verif_ids    integer[] := '{}';
  v_lifecycle_ids uuid[] := '{}';
  v_completion_ids uuid[] := '{}';
  v_provenance_ids uuid[] := '{}';
  v_enrichment_ids uuid[] := '{}';
  v_handoff_ids  uuid[] := '{}';
  v_changelog_ids uuid[] := '{}';
  v_blocking_count int;
  v_total_delete   int;
  v_deleted_types  jsonb;
  v_retained_types  jsonb;
  v_root_ref        text;
  v_deleted_refs    text[] := '{}';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'UNAUTHORISED' USING ERRCODE = '42501';
  END IF;

  v_reason_trim := btrim(p_reason);
  IF length(v_reason_trim) < 10 THEN
    RAISE EXCEPTION 'REASON_TOO_SHORT' USING ERRCODE = '22023';
  END IF;

  SELECT email INTO v_deleted_by FROM profiles WHERE id = v_uid;
  IF v_deleted_by IS NULL THEN v_deleted_by := v_uid::text; END IF;

  -- ── Resolve dependency graph via registry ──
  SELECT * INTO v_graph FROM public.resolve_dependency_graph(p_root_type, p_root_id);
  IF NOT (v_graph->>'success')::boolean THEN
    RETURN v_graph;
  END IF;

  -- ── Extract graph data ──
  v_root_ref        := v_graph->>'root_ref';
  v_ewo_ids        := COALESCE((v_graph->'ewo_ids')::uuid[], '{}');
  v_ewo_refs       := COALESCE((v_graph->'ewo_refs')::text[], '{}');
  v_session_ids    := COALESCE((v_graph->'session_ids')::uuid[], '{}');
  v_evidence_ids   := COALESCE((v_graph->'evidence_ids')::uuid[], '{}');
  v_record_ids     := COALESCE((v_graph->'record_ids')::uuid[], '{}');
  v_package_ids    := COALESCE((v_graph->'package_ids')::uuid[], '{}');
  v_review_ids     := COALESCE((v_graph->'review_ids')::uuid[], '{}');
  v_verif_ids      := COALESCE((v_graph->'verification_ids')::integer[], '{}');
  v_lifecycle_ids  := COALESCE((v_graph->'lifecycle_ids')::uuid[], '{}');
  v_completion_ids := COALESCE((v_graph->'completion_ids')::uuid[], '{}');
  v_provenance_ids := COALESCE((v_graph->'provenance_ids')::uuid[], '{}');
  v_enrichment_ids := COALESCE((v_graph->'enrichment_ids')::uuid[], '{}');
  v_handoff_ids    := COALESCE((v_graph->'handoff_ids')::uuid[], '{}');
  v_changelog_ids  := COALESCE((v_graph->'changelog_ids')::uuid[], '{}');
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

  -- ── Lock root ──
  IF p_root_type = 'engineering_idea' THEN
    PERFORM 1 FROM engineering_idea WHERE id = p_root_id FOR UPDATE;
  ELSIF p_root_type = 'engineering_work_order' THEN
    PERFORM 1 FROM engineering_work_orders WHERE id = p_root_id FOR UPDATE;
  END IF;

  -- ── Build deleted refs ──
  IF p_root_type = 'engineering_idea' THEN
    v_deleted_refs := array_append(v_deleted_refs, v_root_ref);
  END IF;
  IF array_length(v_ewo_refs, 1) > 0 THEN
    v_deleted_refs := v_deleted_refs || v_ewo_refs;
  END IF;

  -- ── Insert audit ──
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

  -- ── Delete in registry order (children first) ──
  IF array_length(v_handoff_ids, 1) > 0 THEN DELETE FROM execution_handoff_requests WHERE id = ANY(v_handoff_ids); END IF;
  IF array_length(v_enrichment_ids, 1) > 0 THEN DELETE FROM ewo_evidence_enrichments WHERE id = ANY(v_enrichment_ids); END IF;
  IF array_length(v_provenance_ids, 1) > 0 THEN DELETE FROM ewo_engineering_provenance WHERE id = ANY(v_provenance_ids); END IF;
  IF array_length(v_completion_ids, 1) > 0 THEN DELETE FROM ewo_completion_reports WHERE id = ANY(v_completion_ids); END IF;
  IF array_length(v_lifecycle_ids, 1) > 0 THEN DELETE FROM ewo_lifecycle_events WHERE id = ANY(v_lifecycle_ids); END IF;
  IF array_length(v_verif_ids, 1) > 0 THEN DELETE FROM ewo_verification_trace WHERE id = ANY(v_verif_ids); END IF;
  IF array_length(v_review_ids, 1) > 0 THEN DELETE FROM ecc_engineering_reviews WHERE id = ANY(v_review_ids); END IF;
  IF array_length(v_package_ids, 1) > 0 THEN DELETE FROM ewo_engineering_packages WHERE id = ANY(v_package_ids); END IF;
  IF array_length(v_record_ids, 1) > 0 THEN DELETE FROM engineering_records_library WHERE id = ANY(v_record_ids); END IF;
  IF array_length(v_evidence_ids, 1) > 0 THEN DELETE FROM execution_evidence WHERE id = ANY(v_evidence_ids); END IF;
  IF array_length(v_session_ids, 1) > 0 THEN DELETE FROM execution_sessions WHERE id = ANY(v_session_ids); END IF;
  IF array_length(v_changelog_ids, 1) > 0 THEN DELETE FROM engineering_change_log WHERE id = ANY(v_changelog_ids); END IF;
  IF array_length(v_ewo_ids, 1) > 0 THEN DELETE FROM engineering_work_orders WHERE id = ANY(v_ewo_ids); END IF;
  IF p_root_type = 'engineering_idea' THEN DELETE FROM engineering_idea WHERE id = p_root_id; END IF;

  RETURN jsonb_build_object(
    'success', true, 'root_object_ref', v_root_ref,
    'audit_id', v_audit_id, 'audit_ref', v_audit_ref,
    'deleted_by', v_deleted_by, 'deleted_at', now(),
    'deleted_count', v_total_delete,
    'deleted_types', v_deleted_types, 'retained_types', v_retained_types,
    'dependency_graph', v_graph
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'error_code', SQLSTATE);
END;
$$;

-- ─── 6. Grants ─────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.resolve_dependency_graph(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_dependency_graph(text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.inspect_dependency_registry() FROM anon;
GRANT EXECUTE ON FUNCTION public.inspect_dependency_registry() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_engineering_graph_governed(text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_engineering_graph_governed(text, uuid, text) TO authenticated;
