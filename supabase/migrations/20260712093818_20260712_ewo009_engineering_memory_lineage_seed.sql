/*
# EWO-009: Engineering Memory Seed & Lineage Seed

## Summary
Seeds the engineering_memory table with knowledge extracted from EWO-008 records,
and seeds engineering_record_lineage with the known relationships.

## Changes
- engineering_memory: 6 knowledge entries from EWO-008 constitutional closeout
- engineering_record_lineage: lineage entries for EWO-008 records (supersession,
  constitutional amendment relationships)

## Notes
- Lineage uses `to_ref` as a loose text reference — no FK required
- Knowledge extraction from EWO-009 onward will be produced by ATD Completion Handoff
*/

DO $$
DECLARE
  v_ewo008_id       uuid;
  v_const_rec_id    uuid;
  v_batch_a_id      uuid;
  v_erc001_id       uuid;
BEGIN

  -- Get EWO-008 record IDs
  SELECT id INTO v_ewo008_id
    FROM engineering_records_library WHERE record_ref = 'EWO-008'
    AND authority_state = 'authoritative' LIMIT 1;

  SELECT id INTO v_const_rec_id
    FROM engineering_records_library WHERE record_ref = 'CONST-REC-AMD-002'
    AND authority_state = 'authoritative' LIMIT 1;

  SELECT id INTO v_batch_a_id
    FROM engineering_records_library WHERE record_ref = 'BATCH-A'
    AND authority_state = 'authoritative' LIMIT 1;

  SELECT id INTO v_erc001_id
    FROM engineering_records_library WHERE record_ref = 'ERC-001'
    AND authority_state = 'authoritative' LIMIT 1;

  -- ─── Engineering Memory — EWO-008 knowledge entries ──────────────────────

  IF v_ewo008_id IS NOT NULL THEN

    INSERT INTO engineering_memory (record_id, record_ref, knowledge_category, title, content, source_section, tags, authority_state)
    VALUES

    (v_ewo008_id, 'EWO-008', 'engineering_decision',
      'Append-Only Enforcement via RLS Policy Removal',
      'Append-only semantics are enforced by dropping UPDATE and DELETE RLS policies entirely, not by adding CHECK constraints. This is the constitutional enforcement mechanism for engineering_records_library and engineering_automation_events. Service-role edge functions bypass RLS for administrative corrections.',
      'schema_rls_authority',
      ARRAY['rls', 'append-only', 'constitutional', 'enforcement'],
      'authoritative'),

    (v_ewo008_id, 'EWO-008', 'pattern',
      'Idempotency Key Pattern for Automation Events',
      'Use a deterministic idempotency key template ({ewo_ref}:{trigger_event}:v{version}) combined with a UNIQUE partial index WHERE idempotency_key IS NOT NULL to prevent duplicate automation event processing. Partial index avoids uniqueness conflicts for null-keyed legacy events.',
      'schema_rls_authority',
      ARRAY['idempotency', 'automation', 'events', 'unique-index'],
      'authoritative'),

    (v_ewo008_id, 'EWO-008', 'architecture',
      'PO Authority Gate as Constitutional Contract',
      'Product Owner Acceptance (ewo_po_accepted lifecycle state) is the constitutional authority gate for creating authoritative Engineering Records. RULE-002 is the sole automation rule that produces authoritative records, and it requires requires_po_authority=true. RULE-001 (ewo_closed) is permanently disabled. This separation prevents premature record creation from automated workflows.',
      'po_authority_lifecycle',
      ARRAY['po-authority', 'automation-rules', 'constitutional', 'lifecycle'],
      'authoritative'),

    (v_ewo008_id, 'EWO-008', 'pattern',
      'Constitutional Amendment Pattern (Append-Only Corrections)',
      'Constitutional documents are never mutated. When a constitutional decision must be corrected, a new amendment document (CONST-001-AMD-XXX) is created with a supersedes_document_id FK to the original. The original remains permanent in the record. This creates an auditable constitutional lineage chain.',
      'constitutional_amendment',
      ARRAY['constitutional', 'amendment', 'append-only', 'supersession'],
      'authoritative'),

    (v_ewo008_id, 'EWO-008', 'lesson_learned',
      'Dev Seed Namespace Separation',
      'Development seed records must be given a distinct namespace ({ref}-DEV-SEED) to prevent them from occupying canonical record_ref values. When the real authoritative record is created, it can take the canonical ref without a uniqueness conflict. All dev seeds should be authority_state=non_authoritative from the moment they are created.',
      'historical_record_correction',
      ARRAY['dev-seeds', 'namespace', 'canonical-refs', 'data-hygiene'],
      'authoritative'),

    (v_ewo008_id, 'EWO-008', 'architecture',
      'EIOS Platform Architecture — CD-008',
      'EIOS is the platform layer. ATD and LLND Automate are applications executing on EIOS, not peer platforms. This distinction governs infrastructure sharing (auth, records library, constitutional engine) while preserving independent product identities. Settings ownership follows a 5-level hierarchy: Platform → Application → Organisation → Workspace → User.',
      'const_amd002',
      ARRAY['eios', 'platform', 'atd', 'llnd-automate', 'settings-hierarchy', 'cd-008'],
      'authoritative');

  END IF;

  -- ─── Engineering Record Lineage — EWO-008 records ────────────────────────

  IF v_ewo008_id IS NOT NULL THEN
    INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes)
    VALUES
      (v_ewo008_id, 'EWO-008', 'EWO-008', 'related_ewo', 'Engineering Record produced by EWO-008 Constitutional Closeout'),
      (v_ewo008_id, 'EWO-008', 'CONST-001-AMD-002', 'related_constitutional_amendment', 'AMD-002 was produced and ratified as part of EWO-008 closeout'),
      (v_ewo008_id, 'EWO-008', 'CONST-001-AMD-001', 'related_constitutional_amendment', 'AMD-001 was produced and ratified as part of EWO-008 closeout'),
      (v_ewo008_id, 'EWO-008', 'CD-008', 'related_decision', 'CD-008: EIOS is the platform layer'),
      (v_ewo008_id, 'EWO-008', 'CD-009', 'related_decision', 'CD-009: 5-level settings ownership hierarchy'),
      (v_ewo008_id, 'EWO-008', 'CD-011', 'related_decision', 'CD-011: 9-state EWO lifecycle with PO authority gate');
  END IF;

  IF v_const_rec_id IS NOT NULL THEN
    INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes)
    VALUES
      (v_const_rec_id, 'CONST-REC-AMD-002', 'CONST-001', 'supersedes', 'CONST-001-AMD-002 supersedes relevant sections of CONST-001'),
      (v_const_rec_id, 'CONST-REC-AMD-002', 'CONST-REC-AMD-001', 'related_record', 'AMD-002 extends the constitutional lineage established by AMD-001');
  END IF;

  IF v_batch_a_id IS NOT NULL THEN
    INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes)
    VALUES
      (v_batch_a_id, 'BATCH-A', 'EWO-007R', 'related_ewo', 'BATCH-A API secret fix was part of the EWO-007R governance scope');
  END IF;

END $$;
