/*
# EWO-014.19A.7R.3 — Final Historical Reconciliation & Canonical Governance

## 1. Purpose
Completes the Engineering Work Order historical reconciliation programme:
  - Creates the `engineering_historical_references` table for references that
    were never issued as Engineering Work Orders.
  - Reconciles three missing canonical EWOs (EWO-012, EWO-013, EWO-016) that have
    governed engineering evidence (migrations, standards, constitutional
    amendments) but no canonical record in `engineering_work_orders`.
  - Creates Historical Reference records for EWO-007 and EWO-014 (base
    references that were never issued — only refinements exist).
  - Creates the canonical EWO-014.19A.7R.3 record before implementation begins.
  - EWO-017 already exists as a canonical EWO — no reconciliation action needed.

## 2. New Tables
- `engineering_historical_references`
  - `id` (uuid PK)
  - `reference` (text, unique) — e.g. "EWO-007"
  - `title` (text) — display title
  - `investigation_date` (timestamptz) — when the investigation was performed
  - `audit_ref` (text) — link to the audit record
  - `evidence_summary` (text) — summary of evidence found/not found
  - `conclusion` (text) — investigation conclusion
  - `historical_explanation` (text) — permanent explanation for the reference
  - `status` (text, default 'historical_not_issued') — fixed status
  - `created_at` / `updated_at` (timestamptz)

## 3. Reconciled Canonical EWOs
- EWO-012 — Engineering Intelligence Layer v1.0
  Evidence: migration `ewo012_engineering_intelligence_layer_v1.sql` created
  7 governed intelligence tables. Implementation complete, no canonical record.
- EWO-013 — Project Architecture Foundation v1.0
  Evidence: migration `ewo013_project_architecture_foundation_v1.sql` created
  the Engineering Project Registry. Implementation complete, no canonical record.
- EWO-016 — Conversation-Native Engineering Context Resolution
  Evidence: migration `ewo016_conversation_native_engineering_context.sql.sql`
  created conversation context tables, engineering standard, and constitutional
  amendment AMD-006. Implementation complete, no canonical record.

## 4. Historical References Created
- EWO-007 — base reference never issued. Only EWO-007R (refinement) exists.
  No completion reports, packages, or lifecycle events for base EWO-007.
- EWO-014 — base reference never issued. Only EWO-014.x refinements exist
  (EWO-014.7, EWO-014.13, EWO-014.19A, etc.). No canonical base EWO-014.

## 5. Canonical EWO Created
- EWO-014.19A.7R.3 — this work order, created before implementation begins.

## 6. Security
- RLS enabled on `engineering_historical_references`.
- CRUD policies for authenticated users (all engineering users can read;
  insert/update/delete restricted to authenticated for governance actions).
*/

-- ─── 1. Historical References Table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engineering_historical_references (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             text NOT NULL UNIQUE,
  title                 text NOT NULL,
  investigation_date    timestamptz NOT NULL DEFAULT now(),
  audit_ref             text NOT NULL,
  evidence_summary      text NOT NULL,
  conclusion            text NOT NULL,
  historical_explanation text NOT NULL,
  status                text NOT NULL DEFAULT 'historical_not_issued',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE engineering_historical_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_historical_references" ON engineering_historical_references;
CREATE POLICY "select_historical_references"
ON engineering_historical_references FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_historical_references" ON engineering_historical_references;
CREATE POLICY "insert_historical_references"
ON engineering_historical_references FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_historical_references" ON engineering_historical_references;
CREATE POLICY "update_historical_references"
ON engineering_historical_references FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_historical_references" ON engineering_historical_references;
CREATE POLICY "delete_historical_references"
ON engineering_historical_references FOR DELETE
TO authenticated USING (true);

-- ─── 2. Reconcile Missing Canonical EWOs ─────────────────────────────────────
-- EWO-012, EWO-013, EWO-016 all have governed evidence (migrations, standards,
-- constitutional amendments) but no canonical record. Create canonical records
-- populated only with historically supported information.

INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level,
  implementation_provider, implementation_status, engineering_package_status,
  is_historical_import, import_source, imported_at, historical_notes,
  closed_at, closure_method, created_at, updated_at
)
SELECT 'EWO-012', 'EWO-012 — Engineering Intelligence Layer v1.0',
  'Permanent Engineering Intelligence architecture powering every AI capability in EIOS. Creates 7 governed intelligence tables that together form the intelligence fabric: engineering intelligence sessions, context packages, continuity tracking, retrieval, evidence, validation, and lineage.',
  'closed', 'medium', 'medium',
  'bolt', 'Completed', 'Generated',
  true, 'historical_reconciliation', now(),
  'Reconciled retrospectively by EWO-014.19A.7R.3. Governed evidence: migration ewo012_engineering_intelligence_layer_v1.sql created 7 intelligence tables. Implementation was complete before canonical registration.',
  now(), 'Historical Migration',
  '2026-07-13 10:11:41+00', '2026-07-13 10:11:41+00'
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-012');

INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level,
  implementation_provider, implementation_status, engineering_package_status,
  is_historical_import, import_source, imported_at, historical_notes,
  closed_at, closure_method, created_at, updated_at
)
SELECT 'EWO-013', 'EWO-013 — Project Architecture Foundation v1.0',
  'Creates the Engineering Project Registry table that allows ATD to manage multiple engineering projects while maintaining a single AI Technical Director instance. Foundational registry for project architecture.',
  'closed', 'medium', 'medium',
  'bolt', 'Completed', 'Generated',
  true, 'historical_reconciliation', now(),
  'Reconciled retrospectively by EWO-014.19A.7R.3. Governed evidence: migration ewo013_project_architecture_foundation_v1.sql created the Engineering Project Registry. Implementation was complete before canonical registration.',
  now(), 'Historical Migration',
  '2026-07-13 19:55:36+00', '2026-07-13 19:55:36+00'
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-013');

INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level,
  implementation_provider, implementation_status, engineering_package_status,
  is_historical_import, import_source, imported_at, historical_notes,
  closed_at, closure_method, created_at, updated_at
)
SELECT 'EWO-016', 'EWO-016 — Conversation-Native Engineering Context Resolution',
  'Establishes canonical data structures for conversation-native engineering context resolution. Records all conversation-native execution actions for audit and traceability. Creates engineering standard and constitutional amendment AMD-006 (Canonical Engineering Grounding).',
  'closed', 'medium', 'medium',
  'bolt', 'Completed', 'Generated',
  true, 'historical_reconciliation', now(),
  'Reconciled retrospectively by EWO-014.19A.7R.3. Governed evidence: migration ewo016_conversation_native_engineering_context.sql.sql created conversation context tables, engineering standard, and constitutional amendment AMD-006. Implementation was complete before canonical registration.',
  now(), 'Historical Migration',
  '2026-07-19 09:55:41+00', '2026-07-19 09:55:41+00'
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-016');

-- ─── 3. Historical References for Never-Issued References ─────────────────────

INSERT INTO engineering_historical_references (
  reference, title, investigation_date, audit_ref, evidence_summary, conclusion, historical_explanation
)
SELECT 'EWO-007', 'EWO-007 — Historical Reference (Not Issued)',
  now(), 'AUDIT-EWO-014-19A-7R3-001',
  'Investigation searched 29 governed engineering sources. Only EWO-007R (refinement) exists in engineering_work_orders. No completion reports, engineering packages, or lifecycle events exist for the base EWO-007 reference. The base reference was never issued — only the refinement EWO-007R was created.',
  'Reference unused. No governed engineering evidence exists for base EWO-007. Only the refinement EWO-007R was issued. Reference intentionally preserved to maintain historical numbering integrity.',
  'This Engineering Work Order reference was never issued. No governed prompt, implementation, Completion Report, verification evidence or lifecycle history exists. This record exists solely to preserve Engineering Ledger numbering integrity.'
WHERE NOT EXISTS (SELECT 1 FROM engineering_historical_references WHERE reference = 'EWO-007');

INSERT INTO engineering_historical_references (
  reference, title, investigation_date, audit_ref, evidence_summary, conclusion, historical_explanation
)
SELECT 'EWO-014', 'EWO-014 — Historical Reference (Not Issued)',
  now(), 'AUDIT-EWO-014-19A-7R3-001',
  'Investigation searched 29 governed engineering sources. Multiple EWO-014.x refinements exist (EWO-014.7, EWO-014.13, EWO-014.19A, etc.) but no canonical base EWO-014 was ever created. The base reference was never issued — only sub-numbered refinements were created.',
  'Reference unused. No governed engineering evidence exists for base EWO-014. Only sub-numbered refinements (EWO-014.x) were issued. Reference intentionally preserved to maintain historical numbering integrity.',
  'This Engineering Work Order reference was never issued. No governed prompt, implementation, Completion Report, verification evidence or lifecycle history exists. This record exists solely to preserve Engineering Ledger numbering integrity.'
WHERE NOT EXISTS (SELECT 1 FROM engineering_historical_references WHERE reference = 'EWO-014');

-- ─── 4. Canonical EWO-014.19A.7R.3 ───────────────────────────────────────────
-- Created BEFORE implementation begins, per Requirement 1.

INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level,
  implementation_provider, implementation_status, engineering_package_status,
  created_at, updated_at
)
SELECT 'EWO-014.19A.7R.3', 'EWO-014.19A.7R.3 — Final Historical Reconciliation & Canonical Governance',
  'Permanently enforces automatic canonical Engineering Work Order creation. Reconciles missing historical EWOs (EWO-012, EWO-013, EWO-016). Creates Historical References for never-issued references (EWO-007, EWO-014). Leaves the Engineering Ledger historically complete.',
  'ready', 'high', 'medium',
  'bolt', 'Assigned', 'Generated',
  now(), now()
WHERE NOT EXISTS (SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-014.19A.7R.3');

-- Lifecycle event for canonical registration
INSERT INTO ewo_lifecycle_events (ewo_id, from_status, to_status, actor, notes, metadata)
SELECT id, null, 'ready', 'system',
  'Canonical EWO registered before implementation per EWO-014.19A.7R.3 Requirement 1 (Universal Canonical Creation).',
  jsonb_build_object('source', 'ensure_canonical_creation', 'ewo_ref', 'EWO-014.19A.7R.3')
FROM engineering_work_orders
WHERE ewo_ref = 'EWO-014.19A.7R.3'
AND NOT EXISTS (
  SELECT 1 FROM ewo_lifecycle_events ev
  WHERE ev.ewo_id = engineering_work_orders.id
  AND ev.metadata->>'source' = 'ensure_canonical_creation'
);
