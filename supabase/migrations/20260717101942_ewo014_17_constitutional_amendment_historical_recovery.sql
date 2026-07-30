/*
# EWO-014.17: Constitutional Amendment — Historical Recovery Principle

## Overview
Adds the Historical Recovery Principle to the constitution as a new
amendment document (CONST-001-AMD-004). This amendment establishes that
engineering history shall be reconstructed only from available evidence.
Where evidence is incomplete, EIOS shall explicitly preserve uncertainty
rather than fabricate historical facts.

## Changes
1. Inserts a new row into `constitutional_documents` with:
   - document_ref: CONST-001-AMD-004
   - title: Historical Recovery Principle
   - status: ratified
   - A new section "historical_recovery_principle" with key principles

## Security
- No schema changes
- No RLS changes
- Idempotent (checks if document_ref already exists before inserting)

## Notes
- This amendment is additive — it does not modify any existing constitutional
  document
- It establishes the constitutional basis for the Historical Recovery Engine
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM constitutional_documents WHERE document_ref = 'CONST-001-AMD-004'
  ) THEN
    INSERT INTO constitutional_documents (
      document_ref,
      title,
      document_type,
      version,
      status,
      programme,
      effective_from,
      authored_by,
      sections,
      metadata
    ) VALUES (
      'CONST-001-AMD-004',
      'CONST-001 Amendment 004 — Historical Recovery Principle',
      'amendment',
      '1.0',
      'ratified',
      'EWO-014.17',
      now(),
      'Engineering Governance',
      jsonb_build_object(
        'amendment_purpose', jsonb_build_object(
          'order', 1,
          'title', 'Amendment Purpose',
          'content', 'CONST-001-AMD-004 establishes the Historical Recovery Principle as a constitutional requirement. Engineering history shall be reconstructed only from available evidence. Where evidence is incomplete, EIOS shall explicitly preserve uncertainty rather than fabricate historical facts.',
          'new_decisions', jsonb_build_array('CD-013'),
          'does_not_modify', jsonb_build_array(
            'CONST-001-AMD-001: CD-001-R1 platform persistence portability',
            'CONST-001-AMD-002: CD-008 EIOS platform model',
            'CONST-001-AMD-003: CD-012 Engineering Identity Principle',
            'CD-002: RLS on all tables without exception',
            'CD-003: SECURITY DEFINER RPCs for governance actions',
            'CD-004: engineering_records_library is append-only'
          ),
          'supersedes_from_const001', jsonb_build_array()
        ),
        'historical_recovery_principle', jsonb_build_object(
          'order', 2,
          'title', 'Historical Recovery Principle',
          'content', 'Engineering history shall be reconstructed only from available evidence. Where evidence is incomplete, EIOS shall explicitly preserve uncertainty rather than fabricate historical facts. Every recovered engineering work order must include a confidence assessment, evidence sources, and a list of missing evidence. No recovery is accepted without Product Owner approval.',
          'key_principles', jsonb_build_array(
            'Recover evidence. Never fabricate evidence.',
            'Explain confidence. Preserve provenance.',
            'Require Product Owner approval before import.',
            'Unknown information must remain unknown.',
            'Recovered engineering history must remain fully auditable.',
            'The recovery engine discovers and reconstructs — it never invents.',
            'Every recovery produces an audit event with evidence used, confidence, and PO decision.'
          ),
          'new_decisions', jsonb_build_array(
            jsonb_build_object(
              'id', 'CD-013',
              'decision', 'Historical Engineering Recovery is a governed constitutional process',
              'rationale', 'Historical engineering work that predates the Engineering Ledger may be recoverable from available evidence. A governed recovery engine ensures that reconstruction is evidence-based, confidence is explicitly assessed, and Product Owner approval is required before any recovered work enters the Engineering Ledger.'
            )
          )
        ),
        'recovery_pipeline', jsonb_build_object(
          'order', 3,
          'title', 'Recovery Pipeline',
          'content', 'The recovery pipeline consists of: Discovery (scan all engineering sources), Identity Grouping (group by Engineering Identity), Evidence Collection (gather all artefacts), Recovery Package Generation (draft EWO), Confidence Assessment (HIGH/MEDIUM/LOW/UNKNOWN), Product Owner Review, Product Owner Approval, Historical Import, and Engineering Ledger entry. No step may be skipped.',
          'stages', jsonb_build_array(
            'Discovery', 'Identity Grouping', 'Evidence Collection',
            'Recovery Package Generation', 'Confidence Assessment',
            'Product Owner Review', 'Product Owner Approval',
            'Historical Import', 'Engineering Ledger'
          )
        ),
        'confidence_model', jsonb_build_object(
          'order', 4,
          'title', 'Engineering Confidence Model',
          'content', 'Confidence is evidence-based. HIGH: majority of engineering artefacts present. MEDIUM: partial engineering evidence available. LOW: minimal engineering evidence. UNKNOWN: insufficient evidence. Every confidence value must include an explanation.',
          'levels', jsonb_build_array(
            jsonb_build_object('level', 'HIGH', 'description', 'Majority of engineering artefacts present.'),
            jsonb_build_object('level', 'MEDIUM', 'description', 'Partial engineering evidence available.'),
            jsonb_build_object('level', 'LOW', 'description', 'Minimal engineering evidence.'),
            jsonb_build_object('level', 'UNKNOWN', 'description', 'Insufficient evidence.')
          )
        ),
        'discovery_rules', jsonb_build_object(
          'order', 5,
          'title', 'Discovery Rules',
          'content', 'The engine must: detect duplicate evidence, ignore superseded artefacts, highlight conflicting evidence, explain confidence reductions, and never silently merge records. Every source contributes evidence only — no source is considered authoritative by itself.',
          'rules', jsonb_build_array(
            'Detect duplicate evidence',
            'Ignore superseded artefacts',
            'Highlight conflicting evidence',
            'Explain confidence reductions',
            'Never silently merge records'
          )
        ),
        'bulk_recovery', jsonb_build_object(
          'order', 6,
          'title', 'Bulk Recovery',
          'content', 'Product Owner may approve multiple recovered Engineering Work Orders simultaneously. Only packages with identical confidence levels may be bulk approved. Each approval is individually audited.'
        ),
        'amendment_procedure', jsonb_build_object(
          'order', 7,
          'title', 'Amendment Procedure',
          'content', 'This amendment may be superseded by a new CONST document ratified via the engineering governance process. The Historical Recovery Principle itself may not be removed — only refined.'
        )
      ),
      jsonb_build_object(
        'amendment_procedure', 'Requires a new CONST document superseding this one, ratified via the engineering governance process.',
        'parent_document', 'CONST-001-AMD-003',
        'ewo_reference', 'EWO-014.17'
      )
    );
  END IF;
END $$;
