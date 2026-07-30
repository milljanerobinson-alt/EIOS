/*
# EWO-028 — Engineering Knowledge Extraction & Automatic Lifecycle Governance v1.0

## Purpose
Create a governed Engineering Knowledge Extraction capability that automatically captures
reusable engineering knowledge from every accepted Engineering Work Order. Also provides
automatic post-acceptance pipeline infrastructure and governed lifecycle reconciliation.

## New Tables
1. `engineering_knowledge_extractions` — tracks each extraction run per EWO (idempotent, UNIQUE on ewo_id)
2. `engineering_knowledge_provenance` — links every extracted knowledge record to its originating EWO
3. `lifecycle_reconciliation_log` — records every lifecycle reconciliation action

## Modified Tables
- `engineering_work_orders` — adds `knowledge_extraction_status` column

## Security
- RLS enabled on all new tables with authenticated CRUD + anon INSERT for edge functions.

## Important Notes
1. Extraction is deterministic and rule-based — no AI/LLM calls.
2. Knowledge records stored in existing `engineering_memory` table.
3. Provenance stored in `engineering_knowledge_provenance`.
4. Idempotency via UNIQUE constraint on ewo_id in extractions table.
5. EWO-028 registered as canonical EWO.
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Add knowledge_extraction_status to engineering_work_orders
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engineering_work_orders'
    AND column_name = 'knowledge_extraction_status'
  ) THEN
    ALTER TABLE engineering_work_orders
    ADD COLUMN knowledge_extraction_status text NOT NULL DEFAULT 'not_extracted'
    CHECK (knowledge_extraction_status IN (
      'not_extracted', 'pending', 'extracting', 'extracted', 'failed', 'skipped'
    ));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 2. Create engineering_knowledge_extractions table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS engineering_knowledge_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id uuid NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  ewo_ref text NOT NULL,
  extraction_status text NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  extraction_method text NOT NULL DEFAULT 'deterministic',
  knowledge_records_created integer NOT NULL DEFAULT 0,
  knowledge_records_merged integer NOT NULL DEFAULT 0,
  knowledge_records_skipped integer NOT NULL DEFAULT 0,
  completion_report_id uuid REFERENCES ewo_completion_reports(id) ON DELETE SET NULL,
  extraction_diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb,
  extracted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ewo_id)
);

CREATE INDEX IF NOT EXISTS idx_ekx_ewo_ref ON engineering_knowledge_extractions(ewo_ref);
CREATE INDEX IF NOT EXISTS idx_ekx_status ON engineering_knowledge_extractions(extraction_status);

ALTER TABLE engineering_knowledge_extractions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ekx_select_authenticated" ON engineering_knowledge_extractions;
CREATE POLICY "ekx_select_authenticated" ON engineering_knowledge_extractions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ekx_insert_authenticated" ON engineering_knowledge_extractions;
CREATE POLICY "ekx_insert_authenticated" ON engineering_knowledge_extractions
  FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS "ekx_update_authenticated" ON engineering_knowledge_extractions;
CREATE POLICY "ekx_update_authenticated" ON engineering_knowledge_extractions
  FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ekx_delete_authenticated" ON engineering_knowledge_extractions;
CREATE POLICY "ekx_delete_authenticated" ON engineering_knowledge_extractions
  FOR DELETE TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 3. Create engineering_knowledge_provenance table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS engineering_knowledge_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_record_id uuid NOT NULL REFERENCES engineering_memory(id) ON DELETE CASCADE,
  ewo_id uuid NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  ewo_ref text NOT NULL,
  implementation_version text,
  completion_report_id uuid REFERENCES ewo_completion_reports(id) ON DELETE SET NULL,
  acceptance_audit_reference text,
  extraction_id uuid REFERENCES engineering_knowledge_extractions(id) ON DELETE CASCADE,
  extraction_timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ekp_ewo_ref ON engineering_knowledge_provenance(ewo_ref);
CREATE INDEX IF NOT EXISTS idx_ekp_knowledge_record_id ON engineering_knowledge_provenance(knowledge_record_id);
CREATE INDEX IF NOT EXISTS idx_ekp_extraction_id ON engineering_knowledge_provenance(extraction_id);

ALTER TABLE engineering_knowledge_provenance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ekp_select_authenticated" ON engineering_knowledge_provenance;
CREATE POLICY "ekp_select_authenticated" ON engineering_knowledge_provenance
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ekp_insert_authenticated" ON engineering_knowledge_provenance;
CREATE POLICY "ekp_insert_authenticated" ON engineering_knowledge_provenance
  FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS "ekp_update_authenticated" ON engineering_knowledge_provenance;
CREATE POLICY "ekp_update_authenticated" ON engineering_knowledge_provenance
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ekp_delete_authenticated" ON engineering_knowledge_provenance;
CREATE POLICY "ekp_delete_authenticated" ON engineering_knowledge_provenance
  FOR DELETE TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 4. Create lifecycle_reconciliation_log table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lifecycle_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id uuid NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  ewo_ref text NOT NULL,
  reconciliation_type text NOT NULL
    CHECK (reconciliation_type IN ('post_acceptance_closure', 'historical_reconciliation')),
  pre_status text NOT NULL,
  post_status text NOT NULL,
  reconciliation_reason text NOT NULL,
  verification_integrity boolean NOT NULL DEFAULT false,
  report_linkage_verified boolean NOT NULL DEFAULT false,
  acceptance_verified boolean NOT NULL DEFAULT false,
  knowledge_extraction_status text,
  reconciled_at timestamptz NOT NULL DEFAULT now(),
  reconciled_by text NOT NULL DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_lrl_ewo_ref ON lifecycle_reconciliation_log(ewo_ref);
CREATE INDEX IF NOT EXISTS idx_lrl_type ON lifecycle_reconciliation_log(reconciliation_type);

ALTER TABLE lifecycle_reconciliation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lrl_select_authenticated" ON lifecycle_reconciliation_log;
CREATE POLICY "lrl_select_authenticated" ON lifecycle_reconciliation_log
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "lrl_insert_authenticated" ON lifecycle_reconciliation_log;
CREATE POLICY "lrl_insert_authenticated" ON lifecycle_reconciliation_log
  FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS "lrl_update_authenticated" ON lifecycle_reconciliation_log;
CREATE POLICY "lrl_update_authenticated" ON lifecycle_reconciliation_log
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "lrl_delete_authenticated" ON lifecycle_reconciliation_log;
CREATE POLICY "lrl_delete_authenticated" ON lifecycle_reconciliation_log
  FOR DELETE TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 5. Register EWO-028 as a canonical Engineering Work Order
-- ═══════════════════════════════════════════════════════════════

DO $$ DECLARE v_ewo_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-028') THEN
    INSERT INTO engineering_work_orders (
      ewo_ref, title, executive_summary, business_objective, engineering_objective,
      priority, risk_level, status, owner, requested_by,
      scope, validation_requirements,
      implementation_provider, implementation_status, engineering_package_status,
      approved_at, started_at
    ) VALUES (
      'EWO-028',
      'EWO-028 — Engineering Knowledge Extraction & Automatic Lifecycle Governance v1.0',
      'Implement a governed Engineering Knowledge Extraction capability that automatically captures reusable engineering knowledge from every accepted Engineering Work Order, eliminating manual knowledge management while ensuring Engineering Work Orders remain fully governed throughout their lifecycle. Also reconcile the current EWO ledger by automatically closing all active EWOs that have already been completed and accepted.',
      'Eliminate manual knowledge management by automatically extracting reusable engineering knowledge from accepted EWOs, while ensuring all completed and accepted EWOs are properly closed.',
      'Build deterministic knowledge extraction, automatic post-acceptance pipeline, governed lifecycle reconciliation, extended inspection capabilities, and full provenance tracking.',
      'high',
      'medium',
      'in_progress',
      'Bolt',
      'Product Owner',
      'Knowledge extraction, post-acceptance pipeline, lifecycle reconciliation, inspection extensions, governance compliance',
      'Automated tests verifying: knowledge extraction after acceptance, completion report linkage, provenance, deduplication, historical reconciliation, testing EWOs remain active, inspection capabilities, runtime diagnostics',
      'Bolt',
      'In Progress',
      'Generated',
      now(),
      now()
    )
    RETURNING id INTO v_ewo_id;

    INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata)
    VALUES (v_ewo_id, null, 'ready', 'system', 'EWO-028 registered as canonical work order',
      '{"source": "governed_registration"}'::jsonb);

    INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata)
    VALUES (v_ewo_id, 'ready', 'in_progress', 'system', 'Implementation started',
      '{"source": "governed_transition"}'::jsonb);
  END IF;
END $$;

-- Record change log entry for EWO-028 creation
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM engineering_change_log WHERE change_ref = 'CL-EWO028-001'
  ) THEN
    INSERT INTO engineering_change_log (
      change_ref, change_type, ewo_ref, object_type, object_ref,
      summary, description, actor_type, actor, recording_source, immutable
    ) VALUES (
      'CL-EWO028-001',
      'created',
      'EWO-028',
      'engineering_work_order',
      'EWO-028',
      'EWO-028 registered: Engineering Knowledge Extraction & Automatic Lifecycle Governance v1.0',
      'Canonical registration of EWO-028 for governed engineering knowledge extraction, automatic post-acceptance pipeline, and lifecycle reconciliation.',
      'system',
      'Bolt',
      'governed_registration',
      true
    );
  END IF;
END $$;