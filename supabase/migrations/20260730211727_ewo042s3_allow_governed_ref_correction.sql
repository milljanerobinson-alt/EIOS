/*
# EWO-042S.3: Allow Governed Canonical Reference Correction

## Purpose
Updates the `prevent_ewo_ref_update()` trigger function to allow the governed
`correct_canonical_ewo_ref()` RPC (SECURITY DEFINER) to update `ewo_ref`.
Direct client updates remain blocked.

## Changes
- `prevent_ewo_ref_update()` now checks for a session setting
  `app.governed_ref_correction` set to `'true'`. When set (only by the
  SECURITY DEFINER RPC), the update is allowed. Otherwise the immutability
  constraint is enforced as before.

## Security
- The session setting can only be set by the SECURITY DEFINER function
  `correct_canonical_ewo_ref()`, which validates PO authority, uniqueness,
  and records a full audit trail before performing the update.
- Direct client UPDATE statements are still blocked.
*/

CREATE OR REPLACE FUNCTION public.prevent_ewo_ref_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.ewo_ref IS DISTINCT FROM OLD.ewo_ref THEN
    -- Allow governed correction RPC (SECURITY DEFINER) to bypass
    IF current_setting('app.governed_ref_correction', true) = 'true' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'ewo_ref is immutable. Cannot change from % to %', OLD.ewo_ref, NEW.ewo_ref;
  END IF;
  RETURN NEW;
END;
$function$;
