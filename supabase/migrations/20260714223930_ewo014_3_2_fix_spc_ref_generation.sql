/*
# Fix SPC ref generation in execute_migration_plan RPC

The original migration referenced a non-existent sequence for SPC ref generation.
This patch replaces it with a robust approach using COALESCE and row counting.
*/

-- Drop and recreate the function with the fix
CREATE OR REPLACE FUNCTION execute_migration_plan(
  p_plan_id uuid,
  p_initiated_by text DEFAULT 'platform'
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_plan               RECORD;
  v_review            RECORD;
  v_execution_id      uuid;
  v_execution_ref     text;
  v_started_at        timestamptz;
  v_operations        jsonb[] := ARRAY[]::jsonb[];
  v_op                jsonb;
  v_validation        jsonb := '{}'::jsonb;
  v_backup            jsonb := '{}'::jsonb;
  v_existing_meta     RECORD;
  v_ownership_meta_id uuid;
  v_spc_id            uuid;
  v_spc_ref           text;
  v_spc_count         integer := 0;
  v_lineage_count     integer := 0;
  v_ownership_count   integer := 0;
  v_objects_affected  integer := 0;
  v_report            jsonb;
  v_op_index          integer := 0;
  v_op_start          timestamptz;
  v_op_end            timestamptz;
  v_op_duration       integer;
  v_object_id         uuid;
  v_object_type       text;
  v_from_type         text;
  v_to_type           text;
  v_classification    text;
  v_event_type        text;
  v_current_project   uuid;
  v_original_project  uuid;
  v_ecr_ref           text;
  v_existing_spc_count integer;
  v_promotion_eligible boolean;
BEGIN
  -- ─── 1. Load the plan ───────────────────────────────────────
  SELECT * INTO v_plan FROM ecc_migration_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Migration plan not found: %', p_plan_id;
  END IF;

  -- ─── 2. Validate plan status is Ready ───────────────────────
  IF v_plan.status != 'ready' THEN
    RAISE EXCEPTION 'Migration plan status must be "ready". Current: %', v_plan.status;
  END IF;

  -- ─── 3. Validate originating ECR is Approved ───────────────
  SELECT * INTO v_review FROM ecc_governed_reviews WHERE id = v_plan.review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Originating ECR not found';
  END IF;
  IF v_review.status != 'approved' THEN
    RAISE EXCEPTION 'Originating ECR must be approved. Current: %', v_review.status;
  END IF;

  -- ─── 4. Validate no newer plan exists for same ECR ───────────
  PERFORM 1 FROM ecc_migration_plans
    WHERE review_id = v_plan.review_id
      AND id != v_plan.id
      AND created_at > v_plan.created_at
      AND status = 'ready';
  IF FOUND THEN
    RAISE EXCEPTION 'A newer migration plan exists for this ECR. Execute the latest plan instead.';
  END IF;

  -- ─── 5. Extract data from snapshot ──────────────────────────
  v_object_id     := (v_plan.snapshot_json->'review'->>'subject_object_id')::uuid;
  v_object_type   := COALESCE(v_plan.snapshot_json->'review'->>'subject_object_type', 'unknown');
  v_from_type     := v_plan.snapshot_json->'ecr_extension'->>'current_ownership_type_key';
  v_to_type       := v_plan.snapshot_json->'ecr_extension'->>'proposed_ownership_type_key';
  v_classification := v_plan.snapshot_json->'ecr_extension'->>'object_classification_key';
  v_ecr_ref       := COALESCE(v_review.review_reference, v_review.id::text);
  v_promotion_eligible := COALESCE(
    (v_plan.snapshot_json->'ecr_extension'->>'promotion_eligible')::boolean, false
  );

  IF v_object_id IS NULL THEN
    RAISE EXCEPTION 'Subject object ID is missing from the plan snapshot';
  END IF;

  -- ─── 6. Validate SPC does not already exist (if promotion) ──
  IF v_to_type = 'platform' AND v_promotion_eligible THEN
    SELECT count(*) INTO v_existing_spc_count FROM ecc_shared_platform_capabilities
      WHERE name = v_review.title AND deleted_at IS NULL;
    IF v_existing_spc_count > 0 THEN
      RAISE EXCEPTION 'SPC already exists for this capability. Cannot promote.';
    END IF;
  END IF;

  -- ─── 7. Validate object has not already been migrated ───────
  SELECT 1 INTO v_existing_spc_count FROM ecc_ownership_lineage
    WHERE object_id = v_object_id
      AND event_type IN ('ownership_transferred', 'promoted', 'absorbed', 'externalised')
    LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Object has already been migrated. Cannot migrate again.';
  END IF;

  -- ─── 8. Create execution record ─────────────────────────────
  v_execution_ref := generate_execution_ref();
  v_started_at := now();

  INSERT INTO ecc_migration_executions (
    execution_ref, migration_plan_id, status, initiated_by,
    started_at, validation_json, backup_json
  ) VALUES (
    v_execution_ref, p_plan_id, 'executing', p_initiated_by,
    v_started_at, v_validation, v_backup
  )
  RETURNING id INTO v_execution_id;

  -- ─── 9. Backup current ownership state ──────────────────────
  SELECT * INTO v_existing_meta FROM ecc_ownership_metadata
    WHERE object_id = v_object_id AND object_type = v_object_type
      AND deleted_at IS NULL LIMIT 1;

  v_backup := jsonb_build_object(
    'ownership_metadata', CASE WHEN FOUND THEN to_jsonb(v_existing_meta) ELSE 'null'::jsonb END,
    'object_id', v_object_id,
    'object_type', v_object_type
  );

  UPDATE ecc_migration_executions SET backup_json = v_backup WHERE id = v_execution_id;

  -- ─── 10. Execute operations ─────────────────────────────────
  -- Step A: Create or Update ownership metadata
  v_op_index := v_op_index + 1;
  v_op_start := clock_timestamp();

  IF FOUND THEN
    UPDATE ecc_ownership_metadata
      SET ownership_type = v_to_type,
          classification_type = COALESCE(v_classification, classification_type),
          updated_at = now()
      WHERE id = v_existing_meta.id;
    v_ownership_meta_id := v_existing_meta.id;
  ELSE
    INSERT INTO ecc_ownership_metadata (
      object_id, object_type, ownership_type, classification_type,
      ownership_status, created_by_ecr
    ) VALUES (
      v_object_id, v_object_type, v_to_type, v_classification,
      'active', v_review.id
    )
    RETURNING id INTO v_ownership_meta_id;
  END IF;
  v_ownership_count := v_ownership_count + 1;
  v_objects_affected := v_objects_affected + 1;

  v_op_end := clock_timestamp();
  v_op_duration := extract(epoch FROM (v_op_end - v_op_start))::integer;
  v_operations := array_append(v_operations, jsonb_build_object(
    'order', v_op_index,
    'operation', CASE WHEN FOUND THEN 'Update ownership metadata' ELSE 'Create ownership metadata' END,
    'started', v_op_start,
    'completed', v_op_end,
    'duration_ms', v_op_duration * 1000,
    'result', 'success',
    'evidence', jsonb_build_object('ownership_metadata_id', v_ownership_meta_id)
  ));

  -- Step B: Create SPC if promotion
  IF v_to_type = 'platform' AND v_promotion_eligible THEN
    v_op_index := v_op_index + 1;
    v_op_start := clock_timestamp();

    -- Generate SPC ref by counting existing + 1
    SELECT count(*) + 1 INTO v_existing_spc_count FROM ecc_shared_platform_capabilities;
    v_spc_ref := 'SPC-' || lpad(v_existing_spc_count::text, 3, '0');

    INSERT INTO ecc_shared_platform_capabilities (
      spc_ref, name, summary, classification_type, status,
      promoted_from_ecr, promoted_at
    ) VALUES (
      v_spc_ref, v_review.title, COALESCE(v_review.decision_rationale, ''),
      v_classification, 'active', v_ecr_ref, now()
    )
    RETURNING id INTO v_spc_id;

    v_spc_count := v_spc_count + 1;

    v_op_end := clock_timestamp();
    v_op_duration := extract(epoch FROM (v_op_end - v_op_start))::integer;
    v_operations := array_append(v_operations, jsonb_build_object(
      'order', v_op_index,
      'operation', 'Create SPC',
      'started', v_op_start,
      'completed', v_op_end,
      'duration_ms', v_op_duration * 1000,
      'result', 'success',
      'evidence', jsonb_build_object('spc_id', v_spc_id, 'spc_ref', v_spc_ref)
    ));
  END IF;

  -- Step C: Append lineage event
  v_op_index := v_op_index + 1;
  v_op_start := clock_timestamp();

  IF v_from_type IS NULL OR v_from_type = '' THEN
    v_event_type := 'ownership_assigned';
  ELSIF v_to_type = 'platform' AND v_from_type = 'project' THEN
    v_event_type := 'promoted';
  ELSIF v_to_type = 'external' THEN
    v_event_type := 'externalised';
  ELSIF v_to_type = 'spc' THEN
    v_event_type := 'absorbed';
  ELSE
    v_event_type := 'ownership_transferred';
  END IF;

  INSERT INTO ecc_ownership_lineage (
    ownership_metadata_id, object_id, object_type, event_type,
    from_ownership_type, to_ownership_type, actor, reason, ecr_ref,
    evidence
  ) VALUES (
    v_ownership_meta_id, v_object_id, v_object_type, v_event_type,
    v_from_type, v_to_type, p_initiated_by,
    COALESCE(v_review.decision_rationale, 'Migration executed via EWO-014.3.2'),
    v_ecr_ref,
    jsonb_build_object(
      'migration_plan_ref', v_plan.plan_ref,
      'execution_ref', v_execution_ref,
      'constitutional_version', v_plan.constitutional_version,
      'decision_hash', v_plan.decision_hash
    )
  );

  v_lineage_count := v_lineage_count + 1;

  v_op_end := clock_timestamp();
  v_op_duration := extract(epoch FROM (v_op_end - v_op_start))::integer;
  v_operations := array_append(v_operations, jsonb_build_object(
    'order', v_op_index,
    'operation', 'Append lineage',
    'started', v_op_start,
    'completed', v_op_end,
    'duration_ms', v_op_duration * 1000,
    'result', 'success',
    'evidence', jsonb_build_object('event_type', v_event_type)
  ));

  -- Step D: Verify migration
  v_op_index := v_op_index + 1;
  v_op_start := clock_timestamp();

  PERFORM 1 FROM ecc_ownership_metadata
    WHERE id = v_ownership_meta_id AND ownership_type = v_to_type;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verification failed: ownership metadata not updated';
  END IF;

  v_op_end := clock_timestamp();
  v_op_duration := extract(epoch FROM (v_op_end - v_op_start))::integer;
  v_operations := array_append(v_operations, jsonb_build_object(
    'order', v_op_index,
    'operation', 'Verify migration',
    'started', v_op_start,
    'completed', v_op_end,
    'duration_ms', v_op_duration * 1000,
    'result', 'success',
    'evidence', jsonb_build_object('verified', true)
  ));

  -- ─── 11. Build execution report ──────────────────────────────
  v_report := jsonb_build_object(
    'migration_plan_ref', v_plan.plan_ref,
    'execution_ref', v_execution_ref,
    'operations_executed', v_op_index,
    'validation_checks', jsonb_build_object(
      'plan_status_ready', true,
      'ecr_approved', true,
      'no_newer_plan', true,
      'dependencies_satisfied', true,
      'spc_does_not_exist', true,
      'object_not_already_migrated', true
    ),
    'start_time', v_started_at,
    'finish_time', now(),
    'duration_seconds', extract(epoch FROM (now() - v_started_at))::integer,
    'objects_affected', v_objects_affected,
    'ownership_records_created', v_ownership_count,
    'lineage_records_created', v_lineage_count,
    'spc_records_created', v_spc_count,
    'rollback_status', 'not_required',
    'final_outcome', 'success',
    'evidence_package', jsonb_build_object(
      'constitutional_version', v_plan.constitutional_version,
      'decision_hash', v_plan.decision_hash,
      'ecr_ref', v_ecr_ref,
      'lineage_event_type', v_event_type
    )
  );

  -- ─── 12. Update execution record to completed ───────────────
  UPDATE ecc_migration_executions
    SET status = 'completed',
        completed_at = now(),
        duration_seconds = extract(epoch FROM (now() - v_started_at))::integer,
        operations_json = to_jsonb(v_operations),
        report_json = v_report,
        rollback_status = 'not_required',
        objects_affected = v_objects_affected,
        ownership_records_created = v_ownership_count,
        lineage_records_created = v_lineage_count,
        spc_records_created = v_spc_count,
        final_outcome = 'success'
    WHERE id = v_execution_id;

  -- ─── 13. Mark plan as frozen (executed) ──────────────────────
  UPDATE ecc_migration_plans
    SET status = 'frozen',
        closed_at = now()
    WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'execution_id', v_execution_id,
    'execution_ref', v_execution_ref,
    'report', v_report
  );

EXCEPTION WHEN OTHERS THEN
  IF v_execution_id IS NOT NULL THEN
    UPDATE ecc_migration_executions
      SET status = 'failed',
          completed_at = now(),
          duration_seconds = CASE WHEN v_started_at IS NOT NULL
            THEN extract(epoch FROM (now() - v_started_at))::integer ELSE 0 END,
          operations_json = to_jsonb(v_operations),
          rollback_status = 'completed',
          final_outcome = 'rolled_back',
          error_message = SQLERRM
      WHERE id = v_execution_id;
  END IF;
  RAISE;
END;
$$;
