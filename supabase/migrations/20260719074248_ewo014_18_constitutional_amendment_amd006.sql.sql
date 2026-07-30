/*
# EWO-014.18 — Constitutional Amendment CONST-001-AMD-006

## Purpose
Seeds the constitutional amendment ratifying the Engineering Verification
Standard (ES-VER-001). The original migration used CONST-001-AMD-003 which
was already taken by EWO-014.16 (Engineering Identity). This migration
inserts the amendment as CONST-001-AMD-006.

## Security
- No new tables. Insert only into existing `constitutional_documents`.
- RLS already enabled on `constitutional_documents`.
*/

INSERT INTO constitutional_documents
  (document_ref, title, document_type, version, status, programme, authored_by, sections, metadata)
SELECT
  'CONST-001-AMD-006',
  'Engineering Verification Amendment',
  'constitutional_amendment',
  '1.0',
  'ratified',
  'EIOS Platform',
  'ATD',
  jsonb_build_array(
    jsonb_build_object(
      'chapter', 1,
      'id', 'amd006-1',
      'title', 'Engineering Verification Framework',
      'content',
      'All Engineering Work Orders shall maintain an Engineering Verification Matrix that classifies testing activities into canonical types and records the status of each. Engineering Completion Reports must distinguish between Implemented, Verified, and Accepted, and must never imply Product Owner verification unless it has actually occurred.',
      'subsections', '[]'::jsonb
    ),
    jsonb_build_object(
      'chapter', 2,
      'id', 'amd006-2',
      'title', 'Primary Product Owner Workflows',
      'content',
      'Every Engineering Work Order shall nominate one or more Primary Product Owner Workflows. A workflow is an ordered sequence of steps executed by the Product Owner in the running application. Workflows shall be tracked as Defined, Executed, Passed, or Failed. A failed workflow must display a warning and prevent the Completion Report from claiming full verification.',
      'subsections', '[]'::jsonb
    ),
    jsonb_build_object(
      'chapter', 3,
      'id', 'amd006-3',
      'title', 'Engineering Confidence',
      'content',
      'Engineering Confidence shall be derived from the Engineering Verification Matrix and the status of Primary Product Owner Workflows. Confidence shall consider unit coverage, integration coverage, workflow coverage, Product Owner testing, Product Owner acceptance, build, and regression. Confidence shall not reach "verified" while any required verification row is not "passed" or "not_applicable".',
      'subsections', '[]'::jsonb
    )
  ),
  jsonb_build_object(
    'source_ewo', 'EWO-014.18',
    'ratified_by', 'ATD',
    'summary', 'Establishes the Engineering Verification Framework, canonical test types, verification matrix, Primary Product Owner Workflows, and governed Engineering Confidence.'
  )
WHERE NOT EXISTS (
  SELECT 1 FROM constitutional_documents WHERE document_ref = 'CONST-001-AMD-006'
);
