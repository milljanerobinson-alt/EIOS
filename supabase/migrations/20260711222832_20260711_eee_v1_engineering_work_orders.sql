/*
# Engineering Execution Engine (EEE) v1.0 — Engineering Work Orders

## Summary
Establishes the Engineering Work Order (EWO) system — the core orchestration
object of the Engineering Execution Engine. Every EWO progresses through a
defined lifecycle, each transition is recorded, and completion generates a
structured report. EWOs are registered as EIG entities for graph traceability.

## New Tables

### engineering_work_orders
Primary EWO record with all lifecycle attributes.

### ewo_lifecycle_events
Immutable audit log of every status transition for an EWO.

### ewo_completion_reports
Structured completion reports generated when an EWO reaches the
completion stage. Permanent engineering evidence.

## Lifecycle States
draft → architecture_review → engineering_approved → po_approved →
ready → in_progress → engineering_validation → report_generated →
po_acceptance → closed | archived

## Security
RLS enabled — all authenticated users have full CRUD (internal ECC tool).
No anon access.
*/

-- ─── engineering_work_orders ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_work_orders (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_ref               TEXT        NOT NULL UNIQUE,  -- e.g. EWO-001
  title                 TEXT        NOT NULL,
  executive_summary     TEXT,
  business_objective    TEXT,
  engineering_objective TEXT,

  -- Classification
  priority              TEXT        NOT NULL DEFAULT 'medium', -- critical | high | medium | low
  risk_level            TEXT        NOT NULL DEFAULT 'medium', -- critical | high | medium | low
  estimated_effort      TEXT,

  -- Ownership
  owner                 TEXT,
  requested_by          TEXT,

  -- Status & lifecycle
  status                TEXT        NOT NULL DEFAULT 'draft',
  -- draft | architecture_review | engineering_approved | po_approved |
  -- ready | in_progress | engineering_validation | report_generated |
  -- po_acceptance | closed | archived

  -- Scope
  scope                 TEXT,
  out_of_scope          TEXT,
  validation_requirements TEXT,

  -- Dates
  approved_at           TIMESTAMPTZ,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  target_date           TIMESTAMPTZ,

  -- Relationships (stored as arrays of refs / UUIDs)
  dependencies          TEXT[]      NOT NULL DEFAULT '{}',
  related_features      TEXT[]      NOT NULL DEFAULT '{}',
  related_standards     TEXT[]      NOT NULL DEFAULT '{}',
  related_decisions     TEXT[]      NOT NULL DEFAULT '{}',
  related_releases      TEXT[]      NOT NULL DEFAULT '{}',

  -- Engineering artefacts
  engineering_notes     TEXT,
  architecture_review_notes TEXT,
  validation_notes      TEXT,
  po_acceptance_notes   TEXT,

  -- Business value & context
  business_value        TEXT,

  -- EIG linkage
  eig_entity_id         UUID        REFERENCES eig_entities(id) ON DELETE SET NULL,

  -- Metadata
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ewo_status    ON engineering_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_ewo_priority  ON engineering_work_orders(priority);
CREATE INDEX IF NOT EXISTS idx_ewo_ref       ON engineering_work_orders(ewo_ref);
CREATE INDEX IF NOT EXISTS idx_ewo_owner     ON engineering_work_orders(owner);

ALTER TABLE engineering_work_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ewo_select" ON engineering_work_orders;
DROP POLICY IF EXISTS "ewo_insert" ON engineering_work_orders;
DROP POLICY IF EXISTS "ewo_update" ON engineering_work_orders;
DROP POLICY IF EXISTS "ewo_delete" ON engineering_work_orders;

CREATE POLICY "ewo_select" ON engineering_work_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "ewo_insert" ON engineering_work_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ewo_update" ON engineering_work_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ewo_delete" ON engineering_work_orders FOR DELETE TO authenticated USING (true);

-- ─── ewo_lifecycle_events ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ewo_lifecycle_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id      UUID        NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT        NOT NULL,
  actor       TEXT,
  notes       TEXT,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ewo_events_ewo_id ON ewo_lifecycle_events(ewo_id);
CREATE INDEX IF NOT EXISTS idx_ewo_events_to     ON ewo_lifecycle_events(to_status);

ALTER TABLE ewo_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ewo_events_select" ON ewo_lifecycle_events;
DROP POLICY IF EXISTS "ewo_events_insert" ON ewo_lifecycle_events;
DROP POLICY IF EXISTS "ewo_events_update" ON ewo_lifecycle_events;
DROP POLICY IF EXISTS "ewo_events_delete" ON ewo_lifecycle_events;

CREATE POLICY "ewo_events_select" ON ewo_lifecycle_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "ewo_events_insert" ON ewo_lifecycle_events FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ewo_events_update" ON ewo_lifecycle_events FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ewo_events_delete" ON ewo_lifecycle_events FOR DELETE TO authenticated USING (true);

-- ─── ewo_completion_reports ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ewo_completion_reports (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ewo_id                UUID        NOT NULL REFERENCES engineering_work_orders(id) ON DELETE CASCADE,
  ewo_ref               TEXT        NOT NULL,
  title                 TEXT        NOT NULL,
  executive_summary     TEXT,
  scope_completed       TEXT,
  files_modified        JSONB       NOT NULL DEFAULT '[]',
  database_changes      JSONB       NOT NULL DEFAULT '[]',
  engineering_objects   JSONB       NOT NULL DEFAULT '[]',
  ui_components         JSONB       NOT NULL DEFAULT '[]',
  lifecycle_summary     TEXT,
  validation_results    TEXT,
  build_result          TEXT,
  risks                 TEXT,
  po_decisions          TEXT,
  acceptance_recommendation TEXT,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at           TIMESTAMPTZ,
  accepted_by           TEXT,
  report_body           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ewo_reports_ewo_id ON ewo_completion_reports(ewo_id);
CREATE INDEX IF NOT EXISTS idx_ewo_reports_ref    ON ewo_completion_reports(ewo_ref);

ALTER TABLE ewo_completion_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ewo_reports_select" ON ewo_completion_reports;
DROP POLICY IF EXISTS "ewo_reports_insert" ON ewo_completion_reports;
DROP POLICY IF EXISTS "ewo_reports_update" ON ewo_completion_reports;
DROP POLICY IF EXISTS "ewo_reports_delete" ON ewo_completion_reports;

CREATE POLICY "ewo_reports_select" ON ewo_completion_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "ewo_reports_insert" ON ewo_completion_reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ewo_reports_update" ON ewo_completion_reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ewo_reports_delete" ON ewo_completion_reports FOR DELETE TO authenticated USING (true);

-- ─── Seed EWO-001 through EWO-003 (historical record) ────────────────────────

INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, business_objective, engineering_objective,
  priority, risk_level, estimated_effort, owner, requested_by, status,
  scope, business_value, engineering_notes,
  approved_at, started_at, completed_at, closed_at
) VALUES
(
  'EWO-001',
  'ATD Product Identity — LLND Automate (Constitutional Layer)',
  'Establish LLND Automate as the canonical product identity within ATD. Update all internal engineering tooling, ATD system prompts, and ECC references to recognise the managed product.',
  'Establish the constitutional foundation for LLND Automate as the canonical product name within the ATD engineering layer.',
  'Migrate all ATD/ECC internal references from placeholder names to LLND Automate. Update edge functions, migration comments, and engineering tooling.',
  'high', 'low', '2–4 hours',
  'ATD', 'Product Owner',
  'closed',
  'ATD internal tooling, ECC UI strings, edge function branding, DB migration comments.',
  'Establishes authentic product identity across all engineering layers. Enables accurate product tracking and engineering intelligence.',
  'Completed as part of ENG-001. All ATD-internal references updated. Customer-facing migration deferred to EWO-002.',
  now(), now(), now(), now()
),
(
  'EWO-002',
  'Customer-Facing Rebrand — LLND Automate',
  'Rename the customer-facing LLND application to LLND Automate across all UI, emails, and reports. Legal entity LLN+D Pty Ltd preserved.',
  'Deliver a consistent, professional brand identity to customers and RTOs using the platform.',
  'Replace all customer-visible LLN+D references with LLND Automate across 21 source files, 9 edge functions, and the browser title.',
  'high', 'low', '3–6 hours',
  'ATD', 'Product Owner',
  'closed',
  '21 source files, 9 customer edge functions. Excludes LLN+D Pty Ltd legal entity and billing plan descriptors.',
  'Professional brand identity drives trust and conversion. Required before public launch.',
  'Completed as ENG-002. Build clean. 0 remaining LLN+D references in scope. Back to website bug fixed. Copyright footer updated per PO Change Request.',
  now(), now(), now(), now()
),
(
  'EWO-003',
  'Engineering Execution Engine v1.0',
  'Implement the Engineering Execution Engine — the orchestration layer that enables ATD to create, track, and lifecycle-manage Engineering Work Orders.',
  'Enable ATD to operate as a structured engineering orchestrator with full Work Order traceability, lifecycle governance, and completion reporting.',
  'Deliver EWO schema (3 tables), full lifecycle state machine, Kanban/Table/Detail UI within ATD ECC, EIG registration, and completion report generation.',
  'critical', 'medium', '4–8 hours',
  'ATD', 'Product Owner',
  'in_progress',
  'DB schema (engineering_work_orders, ewo_lifecycle_events, ewo_completion_reports), EIG integration, ECCWorkOrdersPage UI with Dashboard/Kanban/Table/Detail/Timeline views, routing integration.',
  'Transforms ATD from a passive advisor to an active engineering orchestrator. Foundation for all future autonomous engineering capabilities.',
  'Active implementation. DB migration applied. UI under construction.',
  now(), now(), null, null
);
