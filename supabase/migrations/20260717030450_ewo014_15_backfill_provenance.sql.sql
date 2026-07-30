/*
# EWO-014.15: Backfill Provenance for Existing Historical Migration EWOs

## Purpose
Generate engineering provenance records for the 5 existing EWOs that were
already imported as Historical Migration records. This backfills:
- is_historical_import flag on the EWO
- import_source, imported_at, imported_by
- ewo_engineering_provenance row with confidence score and evidence availability

## Idempotent
Safe to re-run — uses INSERT ... ON CONFLICT DO NOTHING.
*/

DO $$
DECLARE
  v_ewo RECORD;
  v_confidence jsonb;
  v_count int := 0;
BEGIN
  FOR v_ewo IN
    SELECT * FROM engineering_work_orders
    WHERE closure_method = 'Historical Migration'
       OR closure_method = 'System Migration'
       OR closure_method = 'Engineering Governance Migration'
  LOOP
    -- Set historical import flags
    UPDATE engineering_work_orders
    SET is_historical_import = true,
        import_source = COALESCE(import_source, 'Historical Engineering Archive'),
        imported_at = COALESCE(imported_at, v_ewo.created_at),
        imported_by = COALESCE(imported_by, 'Engineering Governance'),
        historical_notes = COALESCE(historical_notes, 'Imported from historical engineering archive. Original implementation evidence was not preserved in the governed ledger.')
    WHERE id = v_ewo.id;

    -- Calculate confidence
    v_confidence := calculate_ewo_confidence(v_ewo.id);

    -- Insert provenance record (idempotent via unique constraint on ewo_id)
    INSERT INTO ewo_engineering_provenance (
      ewo_id, source, imported_at, imported_by,
      confidence_level, confidence_score,
      evidence_available, evidence_summary, historical_notes
    ) VALUES (
      v_ewo.id,
      COALESCE(v_ewo.import_source, 'Historical Engineering Archive'),
      COALESCE(v_ewo.imported_at, v_ewo.created_at),
      COALESCE(v_ewo.imported_by, 'Engineering Governance'),
      (v_confidence->>'level')::text,
      (v_confidence->>'score')::int,
      (v_confidence->>'evidence')::jsonb,
      'Historical record imported with available evidence. Missing evidence items are marked as unavailable.',
      'Imported from historical engineering archive. Original implementation evidence was not preserved in the governed ledger.'
    )
    ON CONFLICT (ewo_id) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Backfilled % historical EWOs with provenance', v_count;
END;
$$;