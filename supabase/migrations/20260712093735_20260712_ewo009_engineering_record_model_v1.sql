/*
# EWO-009: Engineering Record Model v1.0

## Summary
Evolves engineering_records_library from a document archive into the permanent
Engineering Memory of EIOS. Adds structured sections, semantic metadata,
relationship fields, ATD Completion Handoff support, and version tracking.

## Changes

### 1. engineering_records_library — structured sections (JSONB)
- engineering_objective: { original_objective, business_outcome, scope }
- implementation_summary: { executive_summary, files_created[], files_modified[], files_removed[], database_changes[], dependencies[], configuration_changes[] }
- validation_summary: { build_result, test_result, guardian_result, constitutional_validation, known_limitations[] }
- po_acceptance_detail: { accepted_by, acceptance_date, acceptance_statement, acceptance_conditions }
- engineering_knowledge: { lessons_learned[], architectural_decisions[], engineering_patterns[], reusable_components[], risks_identified[], future_recommendations[] }
- relationships: { related_features[], related_releases[], related_standards[], related_constitutional_decisions[], related_engineering_records[], related_ewos[] }
- attachments: { completion_report_pdf, validation_evidence[], build_logs[], supporting_docs[] }
- semantic_metadata: { keywords[], engineering_domains[], subsystems[], components[], products[], applications[], platform_services[], engineering_disciplines[] }

### 2. engineering_records_library — version and handoff fields
- record_version: integer version counter (default 1)
- atd_handoff: JSONB — the structured handoff package produced by the execution engine
- atd_handoff_received_at: when ATD consumed the handoff
- change_log_entry_id: FK reference to change log entry
- engineering_memory_extracted: whether knowledge has been extracted to engineering_memory table

### 3. engineering_memory — new table
- Stores extracted knowledge entries from Engineering Records
- Each entry has category, title, content, source section, tags, traceability back to source record

### 4. engineering_record_lineage — new table
- Explicit lineage relationships between Engineering Records and related objects
- Types: supersedes, superseded_by, related_record, related_ewo, related_feature, related_release, related_standard, related_constitutional_amendment, related_decision

## Security
- engineering_records_library: INSERT only (append-only established in EWO-008)
- engineering_memory: SELECT + INSERT only (knowledge is append-only; corrections create new entries)
- engineering_record_lineage: SELECT + INSERT only

## Important Notes
1. All new columns are nullable — backwards compatible with EWO-008 records
2. Structured JSONB sections supplement (not replace) the existing content column
3. record_version defaults to 1 for all existing rows
4. engineering_memory_extracted defaults to false for all existing rows
5. Semantic metadata prepares for future Engineering Intelligence — no search implementation yet
*/

-- ─── 1. Structured section columns on engineering_records_library ─────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='engineering_objective') THEN
    ALTER TABLE engineering_records_library ADD COLUMN engineering_objective jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='implementation_summary') THEN
    ALTER TABLE engineering_records_library ADD COLUMN implementation_summary jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='validation_summary') THEN
    ALTER TABLE engineering_records_library ADD COLUMN validation_summary jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='po_acceptance_detail') THEN
    ALTER TABLE engineering_records_library ADD COLUMN po_acceptance_detail jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='engineering_knowledge') THEN
    ALTER TABLE engineering_records_library ADD COLUMN engineering_knowledge jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='relationships') THEN
    ALTER TABLE engineering_records_library ADD COLUMN relationships jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='attachments') THEN
    ALTER TABLE engineering_records_library ADD COLUMN attachments jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='semantic_metadata') THEN
    ALTER TABLE engineering_records_library ADD COLUMN semantic_metadata jsonb;
  END IF;
END $$;

-- ─── 2. Version and handoff fields ───────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='record_version') THEN
    ALTER TABLE engineering_records_library ADD COLUMN record_version integer NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='atd_handoff') THEN
    ALTER TABLE engineering_records_library ADD COLUMN atd_handoff jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='atd_handoff_received_at') THEN
    ALTER TABLE engineering_records_library ADD COLUMN atd_handoff_received_at timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='engineering_memory_extracted') THEN
    ALTER TABLE engineering_records_library ADD COLUMN engineering_memory_extracted boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='change_log_entry_id') THEN
    ALTER TABLE engineering_records_library ADD COLUMN change_log_entry_id uuid;
  END IF;
END $$;

-- ─── 3. engineering_memory table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_memory (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id           uuid NOT NULL REFERENCES engineering_records_library(id),
  record_ref          text NOT NULL,
  knowledge_category  text NOT NULL,
  -- Categories: architecture | pattern | lesson_learned | anti_pattern |
  --             reusable_component | known_risk | implementation_strategy |
  --             validation_outcome | engineering_decision
  title               text NOT NULL,
  content             text NOT NULL,
  source_section      text,
  tags                text[] NOT NULL DEFAULT '{}',
  authority_state     text NOT NULL DEFAULT 'provisional',
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE engineering_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_engineering_memory" ON engineering_memory;
CREATE POLICY "select_engineering_memory" ON engineering_memory FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_engineering_memory" ON engineering_memory;
CREATE POLICY "insert_engineering_memory" ON engineering_memory FOR INSERT
  TO authenticated WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_eng_memory_record_id ON engineering_memory(record_id);
CREATE INDEX IF NOT EXISTS idx_eng_memory_category ON engineering_memory(knowledge_category);
CREATE INDEX IF NOT EXISTS idx_eng_memory_tags ON engineering_memory USING GIN(tags);

-- ─── 4. engineering_record_lineage table ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_record_lineage (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_record_id        uuid NOT NULL REFERENCES engineering_records_library(id),
  from_record_ref       text NOT NULL,
  to_ref                text NOT NULL,
  -- The target ref (record_ref, ewo_ref, feature_ref, etc.) — loose coupling,
  -- no FK so lineage survives if the target doesn't exist yet in this table
  relationship_type     text NOT NULL,
  -- Types: supersedes | superseded_by | related_record | related_ewo |
  --        related_feature | related_release | related_standard |
  --        related_constitutional_amendment | related_decision
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE engineering_record_lineage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_lineage" ON engineering_record_lineage;
CREATE POLICY "select_lineage" ON engineering_record_lineage FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_lineage" ON engineering_record_lineage;
CREATE POLICY "insert_lineage" ON engineering_record_lineage FOR INSERT
  TO authenticated WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lineage_from_record ON engineering_record_lineage(from_record_id);
CREATE INDEX IF NOT EXISTS idx_lineage_from_ref ON engineering_record_lineage(from_record_ref);
CREATE INDEX IF NOT EXISTS idx_lineage_to_ref ON engineering_record_lineage(to_ref);
CREATE INDEX IF NOT EXISTS idx_lineage_type ON engineering_record_lineage(relationship_type);

-- ─── 5. Seed structured sections into EWO-008 authoritative records ───────────

UPDATE engineering_records_library
SET
  engineering_objective = jsonb_build_object(
    'original_objective', 'Establish constitutional governance, append-only records enforcement, and PO authority lifecycle for the EIOS engineering platform.',
    'business_outcome', 'Constitutional foundation for all future engineering records and work orders.',
    'scope', 'engineering_records_library, engineering_work_orders, constitutional_documents, automation rules, UI'
  ),
  implementation_summary = jsonb_build_object(
    'executive_summary', content->>'executive_summary',
    'files_created', jsonb_build_array('src/tests/ewo008-closeout.test.ts'),
    'files_modified', jsonb_build_array('src/pages/ecc/ECCRecordsLibraryPage.tsx'),
    'database_changes', jsonb_build_array(
      'authority_state column on engineering_records_library',
      'append-only RLS enforcement (UPDATE/DELETE policies dropped)',
      'RULE-002 requires_po_authority=true',
      'CONST-001-AMD-001 and CONST-001-AMD-002 inserted'
    )
  ),
  validation_summary = jsonb_build_object(
    'build_result', 'PASSED',
    'test_result', '118/118 tests passing',
    'constitutional_validation', 'CONST-001-AMD-002 ratified'
  ),
  semantic_metadata = jsonb_build_object(
    'keywords', jsonb_build_array('constitutional', 'governance', 'append-only', 'authority', 'po-acceptance'),
    'engineering_domains', jsonb_build_array('platform-governance', 'engineering-records'),
    'subsystems', jsonb_build_array('engineering_records_library', 'constitutional_engine'),
    'products', jsonb_build_array('EIOS'),
    'applications', jsonb_build_array('ATD', 'LLND Automate')
  ),
  record_version = 1
WHERE ewo_ref = 'EWO-008'
  AND authority_state = 'authoritative';
