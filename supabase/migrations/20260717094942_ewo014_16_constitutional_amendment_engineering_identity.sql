/*
# EWO-014.16: Constitutional Amendment — Engineering Identity Principle

## Overview
Adds the Engineering Identity Principle to the constitution as a new
amendment document (CONST-001-AMD-003). This amendment establishes that
historical engineering evidence must never be rewritten, and where multiple
historical identifiers exist, EIOS shall preserve every identity while
establishing a single canonical engineering reference through governed
reconciliation.

## Changes
1. Inserts a new row into `constitutional_documents` with:
   - document_ref: CONST-001-AMD-003
   - title: Engineering Identity Principle
   - status: ratified
   - A new section "engineering_identity_principle" with key principles

## Security
- No schema changes
- No RLS changes
- Idempotent (checks if document_ref already exists before inserting)

## Notes
- This amendment is additive — it does not modify any existing constitutional
  document
- It establishes the constitutional basis for the engineering_identity_map table
*/

DO $$
BEGIN
  -- Only insert if this amendment doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM constitutional_documents WHERE document_ref = 'CONST-001-AMD-003'
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
      'CONST-001-AMD-003',
      'CONST-001 Amendment 003 — Engineering Identity Principle',
      'amendment',
      '1.0',
      'ratified',
      'EWO-014.16',
      now(),
      'Engineering Governance',
      jsonb_build_object(
        'amendment_purpose', jsonb_build_object(
          'order', 1,
          'title', 'Amendment Purpose',
          'content', 'CONST-001-AMD-003 establishes the Engineering Identity Principle as a constitutional requirement. Historical engineering evidence must never be rewritten. Where multiple historical identifiers exist, EIOS shall preserve every identity while establishing a single canonical engineering reference through governed reconciliation.',
          'new_decisions', jsonb_build_array('CD-012'),
          'does_not_modify', jsonb_build_array(
            'CONST-001-AMD-001: CD-001-R1 platform persistence portability',
            'CONST-001-AMD-001: CD-006-R1 NULL organisation_id transitional constraint',
            'CONST-001-AMD-001: CD-007-R1 PDFs are derived representations',
            'CONST-001-AMD-002: CD-008 EIOS platform model',
            'CD-002: RLS on all tables without exception',
            'CD-003: SECURITY DEFINER RPCs for governance actions',
            'CD-004: engineering_records_library is append-only'
          ),
          'supersedes_from_const001', jsonb_build_array()
        ),
        'engineering_identity_principle', jsonb_build_object(
          'order', 2,
          'title', 'Engineering Identity Principle',
          'content', 'Historical engineering evidence must never be rewritten. Where multiple historical identifiers exist for the same engineering effort, EIOS shall preserve every historical identity while establishing a single canonical engineering reference through governed reconciliation. Identity mappings are additive only — no historical artefact, reference, or alias is ever modified or deleted. Every accepted reconciliation creates an auditable identity event recording who approved it, what evidence was used, and what the previous and new mappings are.',
          'key_principles', jsonb_build_array(
            'History must never be rewritten — only explained.',
            'Every engineering artefact retains its original identity.',
            'Canonical identities are additive, never destructive.',
            'Every historical relationship must remain fully auditable.',
            'The reconciliation engine recommends relationships — it never automatically merges records.',
            'Identity mappings require Product Owner approval before becoming canonical.',
            'No existing URLs, Engineering References, Completion Reports, or historical artefacts are modified by identity reconciliation.'
          ),
          'new_decisions', jsonb_build_array(
            jsonb_build_object(
              'id', 'CD-012',
              'decision', 'Engineering Identity Reconciliation is a governed constitutional process',
              'rationale', 'Historical engineering imports revealed identity inconsistencies caused by the evolution of EIOS before the Engineering Ledger became the constitutional source of truth. A permanent Engineering Identity layer ensures historical artefacts can be truthfully related without destroying provenance.'
            )
          )
        ),
        'identity_model', jsonb_build_object(
          'order', 3,
          'title', 'Engineering Identity Model',
          'content', 'Every engineering artefact receives one immutable identity record. An identity may have: a canonical engineering reference, historical references, historical aliases, source record IDs, import batch, provenance, confidence, and reconciliation status. The engineering_identity_map table stores these mappings with relationship types (CANONICAL, ALIAS, SUPERSEDED, MIGRATED_FROM, IMPORTED_FROM, DUPLICATE_REFERENCE, LEGACY_IDENTIFIER) and confidence levels (LOW, MEDIUM, HIGH).',
          'identity_fields', jsonb_build_array(
            'canonical_reference — the single canonical engineering reference',
            'historical_reference — the historical identifier being mapped',
            'relationship_type — the nature of the relationship',
            'confidence — LOW, MEDIUM, or HIGH',
            'reconciliation_status — pending, accepted, rejected, or overridden',
            'provenance — free-text explanation of the mapping',
            'source_record_id — original record ID in source system'
          )
        ),
        'amendment_procedure', jsonb_build_object(
          'order', 4,
          'title', 'Amendment Procedure',
          'content', 'This amendment may be superseded by a new CONST document ratified via the engineering governance process. The Engineering Identity Principle itself may not be removed — only refined.'
        )
      ),
      jsonb_build_object(
        'amendment_procedure', 'Requires a new CONST document superseding this one, ratified via the engineering governance process.',
        'parent_document', 'CONST-001-AMD-002',
        'ewo_reference', 'EWO-014.16'
      )
    );
  END IF;
END $$;
