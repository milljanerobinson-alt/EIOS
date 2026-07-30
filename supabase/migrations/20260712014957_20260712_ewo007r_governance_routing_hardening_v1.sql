/*
# EWO-007R: AI Capability Governance & Routing Hardening v1.0

Extends the ATD Cognitive Engine schema to support governed lifecycle states,
immutable plan versioning, durable PO governance decisions, and full provider
route traceability.

## Changes

### 1. atd_engineering_intents: adds `analysing` and `awaiting_approval` to status CHECK
### 2. atd_engineering_plans: adds `awaiting_approval` and `superseded` to status CHECK; adds versioning and traceability columns
### 3. atd_capability_executions: adds routing metadata and traceability columns
### 4. atd_plan_governance_decisions: new table for durable PO decisions
### 5. Indexes on new columns

## Security
- RLS enabled on atd_plan_governance_decisions with anon + authenticated CRUD policies
- Unique partial index prevents duplicate final decisions per plan

## Notes
- All ADD COLUMN statements are wrapped in DO blocks for idempotency
- CHECK constraint changes require DROP + recreate
- rejection_reason is required when decision = 'rejected' (enforced by CHECK)
*/

-- ─── 1. atd_engineering_intents: extend status CHECK ─────────────────────────

ALTER TABLE atd_engineering_intents
  DROP CONSTRAINT IF EXISTS atd_engineering_intents_status_check;

ALTER TABLE atd_engineering_intents
  ADD CONSTRAINT atd_engineering_intents_status_check
  CHECK (status IN (
    'captured', 'analysing', 'analysed', 'planned',
    'awaiting_approval', 'in_review', 'approved', 'rejected',
    'implementing', 'validating', 'extracting_knowledge',
    'intelligence_updated', 'complete', 'cancelled'
  ));

-- ─── 2. atd_engineering_plans: extend status CHECK ───────────────────────────

ALTER TABLE atd_engineering_plans
  DROP CONSTRAINT IF EXISTS atd_engineering_plans_status_check;

ALTER TABLE atd_engineering_plans
  ADD CONSTRAINT atd_engineering_plans_status_check
  CHECK (status IN (
    'draft', 'awaiting_approval', 'submitted_for_review',
    'approved', 'approved_with_conditions', 'rejected',
    'superseded', 'implementing', 'complete'
  ));

-- ─── 3. atd_engineering_plans: versioning + traceability columns ─────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_engineering_plans' AND column_name='version_number') THEN
    ALTER TABLE atd_engineering_plans ADD COLUMN version_number integer NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_engineering_plans' AND column_name='supersedes_plan_id') THEN
    ALTER TABLE atd_engineering_plans ADD COLUMN supersedes_plan_id uuid REFERENCES atd_engineering_plans(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_engineering_plans' AND column_name='superseded_by_plan_id') THEN
    ALTER TABLE atd_engineering_plans ADD COLUMN superseded_by_plan_id uuid REFERENCES atd_engineering_plans(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_engineering_plans' AND column_name='plan_content_hash') THEN
    ALTER TABLE atd_engineering_plans ADD COLUMN plan_content_hash text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_engineering_plans' AND column_name='capability_execution_id') THEN
    ALTER TABLE atd_engineering_plans ADD COLUMN capability_execution_id uuid REFERENCES atd_capability_executions(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_engineering_plans' AND column_name='generating_provider') THEN
    ALTER TABLE atd_engineering_plans ADD COLUMN generating_provider text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_engineering_plans' AND column_name='generating_model') THEN
    ALTER TABLE atd_engineering_plans ADD COLUMN generating_model text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_engineering_plans' AND column_name='plan_payload') THEN
    ALTER TABLE atd_engineering_plans ADD COLUMN plan_payload jsonb;
  END IF;
END $$;

-- ─── 4. atd_capability_executions: routing + traceability columns ─────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='requested_provider_config_id') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN requested_provider_config_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='actual_provider_config_id') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN actual_provider_config_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='provider_type') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN provider_type text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='selected_model') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN selected_model text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='routing_strategy') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN routing_strategy text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='used_default_provider') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN used_default_provider boolean;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='fallback_occurred') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN fallback_occurred boolean DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='fallback_reason') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN fallback_reason text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='routing_metadata') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN routing_metadata jsonb;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='routing_timestamp') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN routing_timestamp timestamptz;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='provider_latency_ms') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN provider_latency_ms integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='validation_status') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN validation_status text DEFAULT 'pending';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='failure_category') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN failure_category text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='result_plan_id') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN result_plan_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='plan_version') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN plan_version integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='retry_of_execution_id') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN retry_of_execution_id uuid;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='prompt_tokens') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN prompt_tokens integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='completion_tokens') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN completion_tokens integer;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atd_capability_executions' AND column_name='estimated_cost_usd') THEN
    ALTER TABLE atd_capability_executions ADD COLUMN estimated_cost_usd numeric(10,6);
  END IF;
END $$;

-- ─── 5. Create atd_plan_governance_decisions ──────────────────────────────────

CREATE TABLE IF NOT EXISTS atd_plan_governance_decisions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_ref          text NOT NULL UNIQUE,
  plan_id               uuid NOT NULL REFERENCES atd_engineering_plans(id) ON DELETE RESTRICT,
  intent_id             uuid NOT NULL REFERENCES atd_engineering_intents(id) ON DELETE RESTRICT,
  decision              text NOT NULL CHECK (decision IN ('approved','approved_with_conditions','rejected')),
  decided_by            text NOT NULL DEFAULT 'product_owner',
  decided_at            timestamptz NOT NULL DEFAULT now(),
  rejection_reason      text,
  conditions            text,
  notes                 text,
  previous_plan_status  text,
  new_intent_status     text,
  routing_metadata      jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_rejection_reason CHECK (
    decision != 'rejected' OR (rejection_reason IS NOT NULL AND length(trim(rejection_reason)) > 0)
  )
);

ALTER TABLE atd_plan_governance_decisions ENABLE ROW LEVEL SECURITY;

-- One final decision per plan
CREATE UNIQUE INDEX IF NOT EXISTS uq_governance_plan_final_decision
  ON atd_plan_governance_decisions(plan_id)
  WHERE decision IN ('approved','approved_with_conditions','rejected');

DROP POLICY IF EXISTS "anon_select_governance" ON atd_plan_governance_decisions;
CREATE POLICY "anon_select_governance" ON atd_plan_governance_decisions
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_governance" ON atd_plan_governance_decisions;
CREATE POLICY "anon_insert_governance" ON atd_plan_governance_decisions
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_governance" ON atd_plan_governance_decisions;
CREATE POLICY "anon_update_governance" ON atd_plan_governance_decisions
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_governance" ON atd_plan_governance_decisions;
CREATE POLICY "anon_delete_governance" ON atd_plan_governance_decisions
  FOR DELETE TO anon, authenticated USING (true);

-- ─── 6. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_plans_intent_version
  ON atd_engineering_plans(intent_id, version_number);

CREATE INDEX IF NOT EXISTS idx_plans_content_hash
  ON atd_engineering_plans(plan_content_hash)
  WHERE plan_content_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plans_capability_execution
  ON atd_engineering_plans(capability_execution_id)
  WHERE capability_execution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_executions_routing_strategy
  ON atd_capability_executions(routing_strategy)
  WHERE routing_strategy IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_executions_actual_provider
  ON atd_capability_executions(actual_provider_config_id)
  WHERE actual_provider_config_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_executions_result_plan
  ON atd_capability_executions(result_plan_id)
  WHERE result_plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_governance_plan_id
  ON atd_plan_governance_decisions(plan_id);

CREATE INDEX IF NOT EXISTS idx_governance_intent_id
  ON atd_plan_governance_decisions(intent_id);

CREATE INDEX IF NOT EXISTS idx_governance_decided_at
  ON atd_plan_governance_decisions(decided_at DESC);
