/*
# EWO-042: Fix execution_targets column references in inspect_execution_package
*/

CREATE OR REPLACE FUNCTION public.inspect_execution_package(
  p_ewo_ref text DEFAULT NULL,
  p_execution_ref text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ewo record;
  v_pkg record;
  v_exec record;
  v_target record;
  v_approval record;
  v_plan record;
  v_analysis record;
  v_audit_ref text;
  v_result jsonb;
BEGIN
  v_audit_ref := 'EWO042-INSPECT-' || extract(epoch from now())::bigint::text || '-' || md5(random()::text);

  -- ─── Resolve EWO ──────────────────────────────────────────────────────────
  IF p_execution_ref IS NOT NULL THEN
    SELECT e.* INTO v_exec
    FROM supervised_execution_records e
    WHERE e.execution_ref = p_execution_ref
    LIMIT 1;

    IF v_exec IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Execution request not found', 'execution_ref', p_execution_ref);
    END IF;

    SELECT w.* INTO v_ewo
    FROM engineering_work_orders w
    WHERE w.id = v_exec.ewo_id;
  ELSE
    SELECT w.* INTO v_ewo
    FROM engineering_work_orders w
    WHERE w.ewo_ref = p_ewo_ref;

    IF v_ewo IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'EWO not found', 'ewo_ref', p_ewo_ref);
    END IF;

    -- Find the latest execution record for this EWO
    SELECT e.* INTO v_exec
    FROM supervised_execution_records e
    WHERE e.ewo_ref = p_ewo_ref
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- ─── Resolve Execution Package ────────────────────────────────────────────
  IF v_exec IS NOT NULL AND v_exec.package_ref IS NOT NULL THEN
    SELECT p.* INTO v_pkg
    FROM supervised_execution_packages p
    WHERE p.package_ref = v_exec.package_ref;
  ELSE
    SELECT p.* INTO v_pkg
    FROM supervised_execution_packages p
    WHERE p.ewo_ref = v_ewo.ewo_ref
    ORDER BY generated_at DESC
    LIMIT 1;
  END IF;

  -- ─── Resolve Repository Target ─────────────────────────────────────────────
  SELECT t.* INTO v_target
  FROM execution_targets t
  WHERE t.is_active = true
  LIMIT 1;

  -- ─── Resolve Execution Approval ────────────────────────────────────────────
  SELECT a.* INTO v_approval
  FROM ewo_execution_approvals a
  WHERE a.ewo_ref = v_ewo.ewo_ref
  ORDER BY approved_at DESC
  LIMIT 1;

  -- ─── Resolve Engineering Plan ───────────────────────────────────────────────
  SELECT pl.* INTO v_plan
  FROM engineering_plans pl
  WHERE pl.ewo_ref = v_ewo.ewo_ref
    AND pl.plan_type = 'plan'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT pl.* INTO v_analysis
  FROM engineering_plans pl
  WHERE pl.ewo_ref = v_ewo.ewo_ref
    AND pl.plan_type = 'analysis'
  ORDER BY created_at DESC
  LIMIT 1;

  -- ─── Build Inspection Result ───────────────────────────────────────────────
  v_result := jsonb_build_object(
    'success', true,
    'audit_reference', v_audit_ref,
    'read_only', true,
    'lifecycle_change_performed', false,

    -- EXECUTION
    'execution', jsonb_build_object(
      'ewo_ref', v_ewo.ewo_ref,
      'ewo_title', v_ewo.title,
      'execution_request_id', v_exec.execution_ref,
      'lifecycle_state', v_ewo.status,
      'execution_readiness', CASE
        WHEN v_pkg IS NOT NULL AND v_pkg.package_status = 'generated' THEN 'package_ready'
        WHEN v_exec IS NOT NULL THEN v_exec.execution_status
        ELSE 'no_execution_request'
      END,
      'approval_status', CASE
        WHEN v_approval IS NULL THEN 'pending'
        WHEN v_approval.decision = 'approved' THEN 'approved'
        ELSE 'pending'
      END,
      'implementation_status', v_ewo.implementation_status,
      'engineering_package_status', v_ewo.engineering_package_status
    ),

    -- REPOSITORY
    'repository', jsonb_build_object(
      'repository', v_target.repository,
      'base_branch', v_target.default_branch,
      'working_branch', CASE
        WHEN v_exec IS NOT NULL AND v_exec.provider_request ? 'working_branch'
        THEN v_exec.provider_request->>'working_branch'
        ELSE v_target.staging_branch
      END,
      'provider', CASE
        WHEN v_exec IS NOT NULL THEN v_exec.provider
        WHEN v_pkg IS NOT NULL THEN v_pkg.execution_provider
        ELSE NULL
      END
    ),

    -- EXECUTION PLAN
    'execution_plan', jsonb_build_object(
      'objective', v_ewo.executive_summary,
      'components_affected', v_ewo.scope,
      'files_to_be_modified', CASE
        WHEN v_pkg IS NOT NULL AND v_pkg.engineering_plan ? 'files_to_modify'
        THEN v_pkg.engineering_plan->'files_to_modify'
        ELSE NULL
      END,
      'planned_code_changes', CASE
        WHEN v_pkg IS NOT NULL THEN v_pkg.implementation_instructions
        ELSE NULL
      END,
      'validation_plan', CASE
        WHEN v_pkg IS NOT NULL AND v_pkg.engineering_plan ? 'validation_plan'
        THEN v_pkg.engineering_plan->'validation_plan'
        ELSE NULL
      END,
      'rollback_plan', CASE
        WHEN v_pkg IS NOT NULL AND v_pkg.engineering_plan ? 'rollback_plan'
        THEN v_pkg.engineering_plan->'rollback_plan'
        ELSE NULL
      END,
      'estimated_impact', CASE
        WHEN v_pkg IS NOT NULL AND v_pkg.engineering_plan ? 'estimated_impact'
        THEN v_pkg.engineering_plan->'estimated_impact'
        ELSE NULL
      END,
      'identified_risks', CASE
        WHEN v_pkg IS NOT NULL THEN v_pkg.constraints
        ELSE NULL
      END,
      'build_requirements', CASE
        WHEN v_pkg IS NOT NULL THEN v_pkg.build_requirements
        ELSE NULL
      END,
      'test_requirements', CASE
        WHEN v_pkg IS NOT NULL THEN v_pkg.test_requirements
        ELSE NULL
      END,
      'completion_criteria', CASE
        WHEN v_pkg IS NOT NULL THEN v_pkg.completion_criteria
        ELSE NULL
      END,
      'acceptance_criteria', CASE
        WHEN v_pkg IS NOT NULL THEN v_pkg.acceptance_criteria
        ELSE NULL
      END,
      'governance_rules', CASE
        WHEN v_pkg IS NOT NULL THEN v_pkg.governance_rules
        ELSE NULL
      END
    ),

    -- GOVERNANCE
    'governance', jsonb_build_object(
      'required_approvals', jsonb_build_array('product_owner_execution_approval'),
      'governance_validations_performed', jsonb_build_array(
        'ewo_exists', 'ewo_lifecycle_state', 'engineering_analysis',
        'engineering_plan', 'po_execution_approval', 'repository_target',
        'provider_available', 'provider_governed', 'budget_control'
      ),
      'audit_reference', v_audit_ref,
      'approval_record', CASE
        WHEN v_approval IS NOT NULL THEN jsonb_build_object(
          'decision', v_approval.decision,
          'approved_by', v_approval.approved_by,
          'approved_at', v_approval.approved_at
        )
        ELSE NULL
      END
    ),

    -- PROVIDER SELECTION
    'provider_selection', jsonb_build_object(
      'provider', CASE
        WHEN v_exec IS NOT NULL THEN v_exec.provider
        WHEN v_pkg IS NOT NULL THEN v_pkg.execution_provider
        ELSE NULL
      END,
      'provider_version', CASE
        WHEN v_exec IS NOT NULL THEN v_exec.provider_version
        ELSE NULL
      END,
      'provider_config', CASE
        WHEN v_pkg IS NOT NULL THEN v_pkg.provider_config
        ELSE NULL
      END,
      'selection_reason', 'Provider selected via governed provider policy'
    ),

    -- PACKAGE METADATA
    'package', CASE
      WHEN v_pkg IS NOT NULL THEN jsonb_build_object(
        'package_ref', v_pkg.package_ref,
        'package_status', v_pkg.package_status,
        'generated_at', v_pkg.generated_at,
        'approved_at', v_pkg.approved_at,
        'execution_version', v_pkg.execution_version
      )
      ELSE NULL
    END
  );

  -- ─── Record Inspection Audit (read-only, no lifecycle change) ──────────────
  INSERT INTO atd_connect_inspection_log (
    request_id, timestamp, operation, inspected_capability,
    outcome, request_source, original_request
  ) VALUES (
    v_audit_ref, now(), 'inspectExecutionPackage',
    'supervised-engineering-execution', 'success',
    'governed_inspection',
    COALESCE(p_ewo_ref, p_execution_ref)
  );

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION inspect_execution_package(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION inspect_execution_package(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION inspect_execution_package(text, text) TO authenticated;
