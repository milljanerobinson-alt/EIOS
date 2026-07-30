/*
# EWO-011.3 — Historical Engineering Records Backfill

## Summary
Creates authoritative Engineering Records for all accepted Engineering Work Orders
not yet present in the Engineering Records Library. Also updates existing authoritative
records with governance completion flags.

## Backfill Idempotency
All inserts use WHERE NOT EXISTS on record_ref. Safe to re-run.

## Records Created
EWO-008, EWO-008-AMD-001, EWO-009, EWO-009.1, EWO-010, EWO-011,
EWO-011.1, EWO-011.2, EWO-011.2A

## Lineage
Parent/child/sibling/depends_on/introduced_by/resolved_by relationships established
using id lookups after record insertion.
*/

-- ─── Step 1: Update governance flags on existing authoritative records ─────────

UPDATE engineering_records_library
SET
  governance_status   = 'complete',
  knowledge_extracted = true,
  lineage_established = false,
  exports_generated   = false
WHERE
  authority_state = 'authoritative'
  AND governance_status = 'pending';

-- ─── Step 2: Backfill missing authoritative EWO records ──────────────────────

INSERT INTO engineering_records_library (
  record_ref, title, record_type, programme, ewo_ref, authority_state, status,
  completion_date, generated_by, is_backfill, governance_status,
  engineering_memory_extracted, knowledge_extracted, lineage_established, exports_generated,
  risk_rating, complexity, estimated_effort, product_owner, primary_engineer,
  completion_report_ref, content, semantic_metadata
)
VALUES
  (
    'EWO-008',
    'Constitutional Architecture Foundation',
    'engineering_work_order', 'EIOS', 'EWO-008', 'authoritative', 'archived',
    '2026-07-12', 'EIOS-AGENT-001', true, 'complete', true, true, false, false,
    'high', 'high', '2 days', 'Product Owner', 'EIOS-AGENT-001',
    'ERC-008-COMPLETION',
    '{"summary":"Established the constitutional architecture foundation for the EIOS platform. Created the Engineering Work Order system, Engineering Records Library, Engineering Memory, and the Constitutional Execution Framework. Introduced EES v1.0 as the governing standard.","ewo":"EWO-008","tables_created":["engineering_work_orders","engineering_records_library","engineering_memory","execution_session","engineering_agent","execution_context","execution_strategy","execution_evidence"]}',
    '{"ewo_ref":"EWO-008","programme":"EIOS","bridge":"EWO-011.3-backfill","disciplines":["Database Architecture","Constitutional Engineering","Platform Foundation"],"technologies":["PostgreSQL","Supabase","React","TypeScript"],"applications_affected":["EIOS Engineering Control Centre"]}'
  ),
  (
    'EWO-008-AMD-001',
    'Constitutional Architecture — Engineering Execution Standard v1.0 (EES)',
    'engineering_amendment', 'EIOS', 'EWO-008', 'authoritative', 'archived',
    '2026-07-12', 'EIOS-AGENT-001', true, 'complete', true, true, false, false,
    'medium', 'high', '1 day', 'Product Owner', 'EIOS-AGENT-001',
    'ERC-008-AMD-001-COMPLETION',
    '{"summary":"Ratified the Engineering Execution Standard (EES) v1.0 as the authoritative governance standard for all engineering execution in EIOS. Established constitutional authority hierarchy, execution pipeline mandates, and the Engineering Guardian role.","ewo":"EWO-008-AMD-001","standards_ratified":["EES-v1.0"],"parent_ewo":"EWO-008"}',
    '{"ewo_ref":"EWO-008-AMD-001","parent_ref":"EWO-008","bridge":"EWO-011.3-backfill","disciplines":["Constitutional Engineering","Governance Standards"]}'
  ),
  (
    'EWO-009',
    'Engineering Record Model v1 — Records Library & Memory Integration',
    'engineering_work_order', 'EIOS', 'EWO-009', 'authoritative', 'archived',
    '2026-07-12', 'EIOS-AGENT-001', true, 'complete', true, true, false, false,
    'medium', 'moderate', '4 hours', 'Product Owner', 'EIOS-AGENT-001',
    'ERC-009-COMPLETION',
    '{"summary":"Delivered the Engineering Record Model v1. Established the engineering_records_library schema with authoritative and non-authoritative authority states, the engineering_memory table for persistent engineering knowledge, and lineage tracking. Implemented the authority state lifecycle: draft → ratified → authoritative.","ewo":"EWO-009","tables_enhanced":["engineering_records_library","engineering_memory","ecc_engineering_lineage"],"authority_states":["draft","ratified","authoritative","non_authoritative","superseded","archived"]}',
    '{"ewo_ref":"EWO-009","bridge":"EWO-011.3-backfill","disciplines":["Database Schema Design","Records Management","Knowledge Engineering"],"technologies":["PostgreSQL","Supabase RLS","JSONB"],"applications_affected":["EIOS Engineering Control Centre","Engineering Records Library"]}'
  ),
  (
    'EWO-009.1',
    'Engineering Record Model — Schema Enrichment & Canonical Memory Seed',
    'engineering_amendment', 'EIOS', 'EWO-009', 'authoritative', 'archived',
    '2026-07-12', 'EIOS-AGENT-001', true, 'complete', true, true, false, false,
    'low', 'low', '2 hours', 'Product Owner', 'EIOS-AGENT-001',
    'ERC-009-1-COMPLETION',
    '{"summary":"Schema enrichment amendment to EWO-009. Added governance audit fields, PO acceptance columns, implementation summary, validation summary, and ATD handoff tracking. Seeded canonical engineering memory entries establishing foundational knowledge patterns.","ewo":"EWO-009.1","parent_ewo":"EWO-009","columns_added":["po_accepted_at","po_accepted_by","po_acceptance_statement","engineering_objective","implementation_summary","validation_summary","atd_handoff","atd_handoff_received_at"]}',
    '{"ewo_ref":"EWO-009.1","parent_ref":"EWO-009","bridge":"EWO-011.3-backfill","disciplines":["Schema Design","Knowledge Engineering"]}'
  ),
  (
    'EWO-010',
    'Constitutional Execution Platform Foundation',
    'engineering_work_order', 'EIOS', 'EWO-010', 'authoritative', 'archived',
    '2026-07-12', 'EIOS-AGENT-001', true, 'complete', true, true, false, false,
    'high', 'high', '1 day', 'Product Owner', 'EIOS-AGENT-001',
    'ERC-010-COMPLETION',
    '{"summary":"Delivered the Constitutional Execution Platform Foundation. Created the execution pipeline schema: execution_session, execution_strategy, execution_evidence, execution_memory_integration, execution_context, and engineering_agent tables. Established the 10-stage constitutional execution pipeline as the mandatory path for all engineering object creation.","ewo":"EWO-010","tables_created":["execution_session","execution_strategy","execution_evidence","execution_memory_integration","execution_context","engineering_agent","engineering_intent","engineering_objective"],"pipeline_stages":10}',
    '{"ewo_ref":"EWO-010","bridge":"EWO-011.3-backfill","disciplines":["Platform Architecture","Constitutional Engineering","Database Design"],"technologies":["PostgreSQL","Supabase","React","TypeScript","Tailwind CSS"],"applications_affected":["EIOS Engineering Control Centre","Constitutional Execution Platform"]}'
  ),
  (
    'EWO-011',
    'Engineering Idea & Objective Domain — Constitutional Execution Wizard',
    'engineering_work_order', 'EIOS', 'EWO-011', 'authoritative', 'archived',
    '2026-07-12', 'EIOS-AGENT-001', true, 'complete', true, true, false, false,
    'medium', 'high', '1 day', 'Product Owner', 'EIOS-AGENT-001',
    'ERC-011-COMPLETION',
    '{"summary":"Delivered the Engineering Idea and Objective domain within the EIOS platform. Created the engineering_idea and engineering_objective tables with constitutional execution pipeline integration. Implemented the Constitutional Execution Wizard (7-step + execution phases) as the sole authorised path for creating Engineering Ideas.","ewo":"EWO-011","tables_created":["engineering_idea","engineering_objective"],"wizard_steps":7,"pipeline_stages":9}',
    '{"ewo_ref":"EWO-011","bridge":"EWO-011.3-backfill","disciplines":["Domain Modelling","UI Engineering","Constitutional Execution"],"technologies":["React","TypeScript","Supabase","Tailwind CSS"],"applications_affected":["EIOS Engineering Control Centre","Engineering Idea Workspace"]}'
  ),
  (
    'EWO-011.1',
    'Engineering Idea Similarity Review & Execution Validation',
    'engineering_amendment', 'EIOS', 'EWO-011', 'authoritative', 'archived',
    '2026-07-12', 'EIOS-AGENT-001', true, 'complete', true, true, false, false,
    'medium', 'moderate', '4 hours', 'Product Owner', 'EIOS-AGENT-001',
    'ERC-011-1-COMPLETION',
    '{"summary":"Added mandatory Similarity Review as step 7 of the Constitutional Execution Wizard. The Similarity Engine searches 7 engineering object types using token overlap scoring. Users choose from 4 constitutional decisions: Continue Anyway, Link Existing, Merge, Cancel. Results and decisions are recorded as execution evidence and in engineering memory.","ewo":"EWO-011.1","parent_ewo":"EWO-011","similarity_object_types":7,"similarity_decisions":4,"wizard_steps":7,"columns_added":["similarity_matches_count","similarity_decision","similarity_top_match_ref","similarity_top_match_score"]}',
    '{"ewo_ref":"EWO-011.1","parent_ref":"EWO-011","bridge":"EWO-011.3-backfill","disciplines":["Similarity Analysis","UI Engineering","Constitutional Execution"],"technologies":["React","TypeScript","Supabase"]}'
  ),
  (
    'EWO-011.2',
    'Constitutional Execution Bridge — ATD to Engineering Idea',
    'engineering_amendment', 'EIOS', 'EWO-011', 'authoritative', 'archived',
    '2026-07-12', 'EIOS-AGENT-001', true, 'complete', true, true, false, false,
    'high', 'high', '1 day', 'Product Owner', 'EIOS-AGENT-001',
    'ERC-011-2-COMPLETION',
    '{"summary":"Connected the ATD Workspace to the Constitutional Execution Wizard. When an Engineering Plan is accepted in the ATD, the Execution Decision Gate presents Execute / Revise / Cancel. Executing launches the wizard pre-filled from ATD intent and plan data. Engineering Record (ERC) is created as mandatory pipeline stage 8. DEFAULT_PIPELINE extended from 9 to 10 stages.","ewo":"EWO-011.2","parent_ewo":"EWO-011","pipeline_stages":10,"new_stage":"Engineering Record (stage 8)","bridge_features":["Execution Decision Gate","ATD prefill","Engineering Record creation","Linked Idea banner","Conversation continuity"]}',
    '{"ewo_ref":"EWO-011.2","parent_ref":"EWO-011","bridge":"EWO-011.3-backfill","disciplines":["Integration Engineering","UI Engineering","Constitutional Execution"],"technologies":["React","TypeScript","Supabase"],"applications_affected":["ATD Workspace","Constitutional Execution Wizard","Engineering Idea Workspace"]}'
  ),
  (
    'EWO-011.2A',
    'Constitutional Execution Bridge Integrity Closeout',
    'engineering_amendment', 'EIOS', 'EWO-011', 'authoritative', 'archived',
    '2026-07-12', 'EIOS-AGENT-001', true, 'complete', true, true, false, false,
    'medium', 'moderate', '4 hours', 'Product Owner', 'EIOS-AGENT-001',
    'ERC-011-2A-COMPLETION',
    '{"summary":"Integrity closeout for EWO-011.2. Removed REC-SKIPPED best-effort pattern — Engineering Record is now mandatory and the pipeline fails if it cannot be created. Fixed error handling: step stays executing. Added Retry Pipeline UI. Added idempotency via UNIQUE constraint on engineering_idea.session_id. IntentDetailPanel now queries DB for linked idea. Open Idea navigates to #/engineering/engineering-ideas.","ewo":"EWO-011.2A","parent_ewo":"EWO-011.2","integrity_fixes":["Mandatory Engineering Record","Error handling regression fix","Retry Pipeline UI","Idempotency UNIQUE constraint","DB-backed conversation linkage","Direct Idea navigation"],"db_changes":["engineering_idea_session_id_unique UNIQUE constraint","idx_engineering_idea_intent_id index","idx_engineering_records_library_semantic_metadata GIN index"]}',
    '{"ewo_ref":"EWO-011.2A","parent_ref":"EWO-011.2","bridge":"EWO-011.3-backfill","disciplines":["Integrity Engineering","Database Design","UI Engineering"],"technologies":["React","TypeScript","Supabase","PostgreSQL"]}'
  )
ON CONFLICT (record_ref) DO NOTHING;

-- ─── Step 3: Update lineage_established for newly created records ─────────────

UPDATE engineering_records_library
SET lineage_established = true
WHERE record_ref IN (
  'EWO-008','EWO-008-AMD-001','EWO-009','EWO-009.1',
  'EWO-010','EWO-011','EWO-011.1','EWO-011.2','EWO-011.2A'
);

-- ─── Step 4: Establish lineage using id lookups ───────────────────────────────

DO $$
DECLARE
  r_008       UUID; r_008a      UUID; r_009       UUID; r_009_1     UUID;
  r_010       UUID; r_011       UUID; r_011_1     UUID; r_011_2     UUID;
  r_011_2a    UUID;
BEGIN
  SELECT id INTO r_008    FROM engineering_records_library WHERE record_ref = 'EWO-008';
  SELECT id INTO r_008a   FROM engineering_records_library WHERE record_ref = 'EWO-008-AMD-001';
  SELECT id INTO r_009    FROM engineering_records_library WHERE record_ref = 'EWO-009';
  SELECT id INTO r_009_1  FROM engineering_records_library WHERE record_ref = 'EWO-009.1';
  SELECT id INTO r_010    FROM engineering_records_library WHERE record_ref = 'EWO-010';
  SELECT id INTO r_011    FROM engineering_records_library WHERE record_ref = 'EWO-011';
  SELECT id INTO r_011_1  FROM engineering_records_library WHERE record_ref = 'EWO-011.1';
  SELECT id INTO r_011_2  FROM engineering_records_library WHERE record_ref = 'EWO-011.2';
  SELECT id INTO r_011_2a FROM engineering_records_library WHERE record_ref = 'EWO-011.2A';

  -- EWO-008 → children
  IF r_008 IS NOT NULL AND r_008a IS NOT NULL THEN
    INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes)
    SELECT r_008, 'EWO-008', 'EWO-008-AMD-001', 'parent', 'EWO-008 is parent of EWO-008-AMD-001 (EES v1.0)'
    WHERE NOT EXISTS (SELECT 1 FROM engineering_record_lineage WHERE from_record_ref='EWO-008' AND to_ref='EWO-008-AMD-001');
  END IF;

  IF r_008 IS NOT NULL AND r_009 IS NOT NULL THEN
    INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes)
    SELECT r_008, 'EWO-008', 'EWO-009', 'introduced_by', 'EWO-008 constitution introduced the need for EWO-009 records model'
    WHERE NOT EXISTS (SELECT 1 FROM engineering_record_lineage WHERE from_record_ref='EWO-008' AND to_ref='EWO-009');
  END IF;

  -- EWO-009 → EWO-009.1
  IF r_009 IS NOT NULL AND r_009_1 IS NOT NULL THEN
    INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes)
    SELECT r_009, 'EWO-009', 'EWO-009.1', 'parent', 'EWO-009 is parent of EWO-009.1 (schema enrichment)'
    WHERE NOT EXISTS (SELECT 1 FROM engineering_record_lineage WHERE from_record_ref='EWO-009' AND to_ref='EWO-009.1');
  END IF;

  -- EWO-010 depends on EWO-009
  IF r_010 IS NOT NULL AND r_009 IS NOT NULL THEN
    INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes)
    SELECT r_010, 'EWO-010', 'EWO-009', 'depends_on', 'EWO-010 execution platform depends on EWO-009 records model'
    WHERE NOT EXISTS (SELECT 1 FROM engineering_record_lineage WHERE from_record_ref='EWO-010' AND to_ref='EWO-009');
  END IF;

  -- EWO-011 family
  IF r_011 IS NOT NULL AND r_010 IS NOT NULL THEN
    INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes)
    SELECT r_011, 'EWO-011', 'EWO-010', 'depends_on', 'EWO-011 idea domain depends on EWO-010 execution platform'
    WHERE NOT EXISTS (SELECT 1 FROM engineering_record_lineage WHERE from_record_ref='EWO-011' AND to_ref='EWO-010');
  END IF;

  IF r_011 IS NOT NULL AND r_011_1 IS NOT NULL THEN
    INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes)
    SELECT r_011, 'EWO-011', 'EWO-011.1', 'parent', 'EWO-011 is parent of EWO-011.1 (Similarity Review)'
    WHERE NOT EXISTS (SELECT 1 FROM engineering_record_lineage WHERE from_record_ref='EWO-011' AND to_ref='EWO-011.1');
  END IF;

  IF r_011 IS NOT NULL AND r_011_2 IS NOT NULL THEN
    INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes)
    SELECT r_011, 'EWO-011', 'EWO-011.2', 'parent', 'EWO-011 is parent of EWO-011.2 (Constitutional Bridge)'
    WHERE NOT EXISTS (SELECT 1 FROM engineering_record_lineage WHERE from_record_ref='EWO-011' AND to_ref='EWO-011.2');
  END IF;

  IF r_011 IS NOT NULL AND r_011_2a IS NOT NULL THEN
    INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes)
    SELECT r_011, 'EWO-011', 'EWO-011.2A', 'parent', 'EWO-011 is parent of EWO-011.2A (Integrity Closeout)'
    WHERE NOT EXISTS (SELECT 1 FROM engineering_record_lineage WHERE from_record_ref='EWO-011' AND to_ref='EWO-011.2A');
  END IF;

  IF r_011_1 IS NOT NULL AND r_011 IS NOT NULL THEN
    INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes)
    SELECT r_011_1, 'EWO-011.1', 'EWO-011', 'child', 'EWO-011.1 is child of EWO-011'
    WHERE NOT EXISTS (SELECT 1 FROM engineering_record_lineage WHERE from_record_ref='EWO-011.1' AND to_ref='EWO-011');
  END IF;

  IF r_011_1 IS NOT NULL AND r_011_2 IS NOT NULL THEN
    INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes)
    SELECT r_011_1, 'EWO-011.1', 'EWO-011.2', 'sibling', 'EWO-011.1 and EWO-011.2 are siblings under EWO-011'
    WHERE NOT EXISTS (SELECT 1 FROM engineering_record_lineage WHERE from_record_ref='EWO-011.1' AND to_ref='EWO-011.2');
  END IF;

  IF r_011_2 IS NOT NULL AND r_011 IS NOT NULL THEN
    INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes)
    SELECT r_011_2, 'EWO-011.2', 'EWO-011', 'child', 'EWO-011.2 is child of EWO-011'
    WHERE NOT EXISTS (SELECT 1 FROM engineering_record_lineage WHERE from_record_ref='EWO-011.2' AND to_ref='EWO-011');
  END IF;

  IF r_011_2 IS NOT NULL AND r_011_2a IS NOT NULL THEN
    INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes)
    SELECT r_011_2, 'EWO-011.2', 'EWO-011.2A', 'parent', 'EWO-011.2 is parent of EWO-011.2A'
    WHERE NOT EXISTS (SELECT 1 FROM engineering_record_lineage WHERE from_record_ref='EWO-011.2' AND to_ref='EWO-011.2A');
  END IF;

  IF r_011_2a IS NOT NULL AND r_011_2 IS NOT NULL THEN
    INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes)
    SELECT r_011_2a, 'EWO-011.2A', 'EWO-011.2', 'child', 'EWO-011.2A is child of EWO-011.2'
    WHERE NOT EXISTS (SELECT 1 FROM engineering_record_lineage WHERE from_record_ref='EWO-011.2A' AND to_ref='EWO-011.2');
  END IF;

  IF r_011_2a IS NOT NULL THEN
    INSERT INTO engineering_record_lineage (from_record_id, from_record_ref, to_ref, relationship_type, notes)
    SELECT r_011_2a, 'EWO-011.2A', 'EWO-011.3', 'resolved_by', 'EWO-011.2A integrity gap resolved by EWO-011.3 governance engine'
    WHERE NOT EXISTS (SELECT 1 FROM engineering_record_lineage WHERE from_record_ref='EWO-011.2A' AND to_ref='EWO-011.3');
  END IF;
END $$;

-- ─── Step 5: Update lineage flag for all records that now have lineage entries ─

UPDATE engineering_records_library r
SET lineage_established = true
WHERE EXISTS (
  SELECT 1 FROM engineering_record_lineage l WHERE l.from_record_ref = r.record_ref
);
