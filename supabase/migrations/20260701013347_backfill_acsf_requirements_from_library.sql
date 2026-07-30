/*
# Backfill ACSF requirements from mapping library

## Summary
For any qualification that:
 1. Was already imported (exists in qualifications table)
 2. Has no ACSF requirements yet
 3. Now has a matching entry in qualification_mapping_library (including the newly added codes)

Insert the 6 standard ACSF requirements and update the mapping metadata.
This covers BSB41419 and any other qualifications in the same situation.

The PL/pgSQL block is idempotent — it only inserts where no requirements exist yet.
*/

DO $$
DECLARE
  q_row RECORD;
  lib_row RECORD;
  snap jsonb;
BEGIN
  FOR q_row IN
    SELECT q.id, q.code
    FROM qualifications q
    WHERE NOT EXISTS (
      SELECT 1 FROM qualification_lln_requirements r WHERE r.qualification_id = q.id
    )
    AND EXISTS (
      SELECT 1 FROM qualification_mapping_library l WHERE UPPER(l.code) = UPPER(q.code)
    )
  LOOP
    SELECT * INTO lib_row
    FROM qualification_mapping_library
    WHERE UPPER(code) = UPPER(q_row.code)
    LIMIT 1;

    IF lib_row IS NULL THEN
      CONTINUE;
    END IF;

    -- Build snapshot
    snap := jsonb_build_object(
      'learning',           lib_row.learning_level,
      'reading',            lib_row.reading_level,
      'writing',            lib_row.writing_level,
      'oral_communication', lib_row.oral_comm_level,
      'numeracy',           lib_row.numeracy_level,
      'digital_literacy',   lib_row.digital_level
    );

    -- Insert 6 requirements
    IF lib_row.learning_level IS NOT NULL THEN
      INSERT INTO qualification_lln_requirements (qualification_id, domain, acsf_skill, minimum_acsf_level)
      VALUES (q_row.id, 'literacy', 'Learning', lib_row.learning_level);
    END IF;

    IF lib_row.reading_level IS NOT NULL THEN
      INSERT INTO qualification_lln_requirements (qualification_id, domain, acsf_skill, minimum_acsf_level)
      VALUES (q_row.id, 'literacy', 'Reading', lib_row.reading_level);
    END IF;

    IF lib_row.writing_level IS NOT NULL THEN
      INSERT INTO qualification_lln_requirements (qualification_id, domain, acsf_skill, minimum_acsf_level)
      VALUES (q_row.id, 'literacy', 'Writing', lib_row.writing_level);
    END IF;

    IF lib_row.oral_comm_level IS NOT NULL THEN
      INSERT INTO qualification_lln_requirements (qualification_id, domain, acsf_skill, minimum_acsf_level)
      VALUES (q_row.id, 'language', 'Oral Communication', lib_row.oral_comm_level);
    END IF;

    IF lib_row.numeracy_level IS NOT NULL THEN
      INSERT INTO qualification_lln_requirements (qualification_id, domain, acsf_skill, minimum_acsf_level)
      VALUES (q_row.id, 'numeracy', 'Numeracy', lib_row.numeracy_level);
    END IF;

    IF lib_row.digital_level IS NOT NULL THEN
      INSERT INTO qualification_lln_requirements (qualification_id, domain, acsf_skill, minimum_acsf_level)
      VALUES (q_row.id, 'digital', 'Digital Literacy', lib_row.digital_level);
    END IF;

    -- Update qualification mapping metadata
    UPDATE qualifications
    SET
      mapping_status           = 'default_mapping_applied',
      mapping_source           = 'default',
      mapping_method           = 'qualification_library',
      confidence_score         = 'high',
      needs_review             = false,
      review_reason            = null,
      default_mapping_snapshot = snap,
      mapping_version          = COALESCE(mapping_version, 1) + 1
    WHERE id = q_row.id;

    RAISE NOTICE 'Backfilled mapping for qualification %', q_row.code;
  END LOOP;
END $$;
