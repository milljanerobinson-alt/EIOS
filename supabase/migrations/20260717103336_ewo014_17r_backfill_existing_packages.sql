/*
# EWO-014.17R: Backfill — Reclassify Existing Recovery Packages

## Overview
Re-evaluates all existing recovery packages created by EWO-014.17 using the
new classification engine. Non-EWO objects are moved out of the default EWO
recovery queue by setting their object_classification correctly.

## Rules
- ATD-INT-* → ENGINEERING_INTENT
- ATD-PLN-* → ENGINEERING_PLAN
- BUG-* → BUG_OR_INCIDENT
- BATCH-* → BATCH_OR_MIGRATION
- CONST-* → CONSTITUTIONAL_RECORD
- AMD-* → ENGINEERING_AMENDMENT
- EWO-* → ENGINEERING_WORK_ORDER
- Everything else → UNKNOWN (or ENGINEERING_RECORD if from records library)

## Safety
- Preserves existing REC-* package references
- Preserves existing recovery audit history
- Does not delete or alter source evidence
- Creates audit events for automatic reclassification
- Idempotent (only reclassifies packages still at UNKNOWN)
*/

DO $$
DECLARE
  r RECORD;
  new_class TEXT;
BEGIN
  FOR r IN SELECT id, canonical_reference, object_classification, recovery_ref
           FROM engineering_recovery_packages
           WHERE object_classification = 'UNKNOWN'
  LOOP
    new_class := 'UNKNOWN';

    -- Classify based on canonical reference prefix
    IF r.canonical_reference ~* '^EWO-\d+' THEN
      new_class := 'ENGINEERING_WORK_ORDER';
    ELSIF r.canonical_reference ~* '^AMD-' OR r.canonical_reference ~* '^CONST-\d+-AMD-' THEN
      new_class := 'ENGINEERING_AMENDMENT';
    ELSIF r.canonical_reference ~* '^CONST-' THEN
      new_class := 'CONSTITUTIONAL_RECORD';
    ELSIF r.canonical_reference ~* '^ATD-INT-' OR r.canonical_reference ~* '^INT-' THEN
      new_class := 'ENGINEERING_INTENT';
    ELSIF r.canonical_reference ~* '^ATD-PLN-' OR r.canonical_reference ~* '^PLN-' THEN
      new_class := 'ENGINEERING_PLAN';
    ELSIF r.canonical_reference ~* '^BUG-' OR r.canonical_reference ~* '^INC-' THEN
      new_class := 'BUG_OR_INCIDENT';
    ELSIF r.canonical_reference ~* '^BATCH-' THEN
      new_class := 'BATCH_OR_MIGRATION';
    ELSIF r.canonical_reference ~* '^PIPELINE-' OR r.canonical_reference ~* '^EXEC-' THEN
      new_class := 'PIPELINE_EXECUTION';
    ELSIF r.canonical_reference ~* '^ERC-' OR r.canonical_reference ~* '^REC-' THEN
      new_class := 'ENGINEERING_RECORD';
    END IF;

    IF new_class != 'UNKNOWN' THEN
      -- Update the package classification
      UPDATE engineering_recovery_packages
      SET object_classification = new_class,
          previous_classification = r.object_classification,
          reclassified_by = 'Recovery Engine (auto-backfill)',
          reclassified_at = now(),
          reclassification_reason = 'Automatic reclassification during EWO-014.17R backfill'
      WHERE id = r.id;

      -- Create audit event
      INSERT INTO engineering_recovery_audit (
        recovery_package_id, action, acted_by, reason, metadata
      ) VALUES (
        r.id,
        'automatically_reclassified',
        'Recovery Engine (auto-backfill)',
        'Automatic reclassification during EWO-014.17R backfill',
        jsonb_build_object(
          'previous_classification', r.object_classification,
          'new_classification', new_class,
          'canonical_reference', r.canonical_reference,
          'recovery_ref', r.recovery_ref
        )
      );
    END IF;
  END LOOP;
END $$;
