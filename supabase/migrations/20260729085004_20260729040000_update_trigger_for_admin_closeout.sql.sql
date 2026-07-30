/*
# EWO-033 — Update Trigger to Accept Administrative Closeout Tokens

The protect_po_acceptance_fields() trigger only accepts tokens created by
'grant_governed_product_owner_acceptance'. This migration updates the trigger
to also accept tokens from 'governed_administrative_closeout'.
*/

CREATE OR REPLACE FUNCTION protect_po_acceptance_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_token_exists boolean;
  v_is_historical boolean;
BEGIN
  -- Check if this is an explicit historical import
  v_is_historical := current_setting('app.historical_import_acceptance', true) = 'true';

  IF v_is_historical THEN
    IF NEW.is_historical_import IS NOT DISTINCT FROM COALESCE(OLD.is_historical_import, false) THEN
      RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: Historical import must set is_historical_import = true on the EWO row.';
    END IF;
    RETURN NEW;
  END IF;

  -- Check for a valid governance token from either governed function
  SELECT EXISTS(
    SELECT 1 FROM po_acceptance_governance_tokens
    WHERE ewo_ref = NEW.ewo_ref
    AND consumed_at IS NULL
    AND created_by_function IN ('grant_governed_product_owner_acceptance', 'governed_administrative_closeout')
  ) INTO v_token_exists;

  IF v_token_exists THEN
    -- Consume the token
    UPDATE po_acceptance_governance_tokens
    SET consumed_at = now()
    WHERE ewo_ref = NEW.ewo_ref
    AND consumed_at IS NULL
    AND created_by_function IN ('grant_governed_product_owner_acceptance', 'governed_administrative_closeout');
    RETURN NEW;
  END IF;

  -- No valid token — block direct updates to protected acceptance fields
  IF NEW.po_accepted_at IS DISTINCT FROM OLD.po_accepted_at THEN
    RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: po_accepted_at cannot be set through direct update. Use grant_governed_product_owner_acceptance() RPC.';
  END IF;

  IF NEW.po_accepted_by IS DISTINCT FROM OLD.po_accepted_by THEN
    RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: po_accepted_by cannot be set through direct update. Use grant_governed_product_owner_acceptance() RPC.';
  END IF;

  IF NEW.po_acceptance_statement IS DISTINCT FROM OLD.po_acceptance_statement THEN
    RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: po_acceptance_statement cannot be set through direct update. Use grant_governed_product_owner_acceptance() RPC.';
  END IF;

  IF NEW.accepted_completion_report_id IS DISTINCT FROM OLD.accepted_completion_report_id THEN
    RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: accepted_completion_report_id cannot be set through direct update. Use grant_governed_product_owner_acceptance() RPC.';
  END IF;

  -- Block direct status changes to closed (unless via governed token)
  IF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: status cannot be set to closed through direct update. Use grant_governed_product_owner_acceptance() RPC.';
  END IF;

  IF NEW.closed_at IS DISTINCT FROM OLD.closed_at THEN
    RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: closed_at cannot be set through direct update. Use grant_governed_product_owner_acceptance() RPC.';
  END IF;

  IF NEW.closed_by IS DISTINCT FROM OLD.closed_by THEN
    RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: closed_by cannot be set through direct update. Use grant_governed_product_owner_acceptance() RPC.';
  END IF;

  -- Only block closure_method = 'Product Owner Acceptance' (administrative override is allowed via token)
  IF NEW.closure_method IS DISTINCT FROM OLD.closure_method AND NEW.closure_method = 'Product Owner Acceptance' THEN
    RAISE EXCEPTION 'GOVERNED ACCEPTANCE VIOLATION: closure_method cannot be set to Product Owner Acceptance through direct update. Use grant_governed_product_owner_acceptance() RPC.';
  END IF;

  RETURN NEW;
END;
$$;
