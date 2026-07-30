/*
# EWO-020 — ES-003: Governed Response Registry Schema

1. Purpose
   - Creates the governed_response_registry table to persist governed response
     definitions with stable reference codes, categories, severity, and
     suggested actions.
   - Creates the governed_response_log table to record when governed responses
     are displayed to users, for audit and future AI support analytics.
   - Seeds the registry with the initial ES-003 response definitions.

2. New Tables
   - governed_response_registry:
     - id (uuid, PK)
     - reference_code (text, unique) — e.g. EIOS-GUIDE-001
     - classification (text) — success | information | guidance | failure
     - category (text) — engineering_integrity, engineering_work_order, etc.
     - severity (text) — low | medium | high | critical
     - title (text)
     - summary (text)
     - explanation (text)
     - cause (text, nullable)
     - recommended_next_action (text)
     - secondary_actions (jsonb, nullable)
     - technical_context (text, nullable)
     - is_active (boolean, default true)
     - created_at, updated_at (timestamps)
   - governed_response_log:
     - id (uuid, PK)
     - reference_code (text)
     - classification (text)
     - category (text)
     - context (jsonb, nullable) — runtime context of the response
     - user_id (uuid, nullable)
     - created_at (timestamp)

3. Security
   - RLS enabled on both tables.
   - governed_response_registry: read-only for all (anon, authenticated),
     write for authenticated only.
   - governed_response_log: insert for authenticated, read own logs only.

4. Idempotency
   - Uses CREATE TABLE IF NOT EXISTS.
   - Uses ON CONFLICT for seed data.
*/

-- ─── 1. governed_response_registry ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS governed_response_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code text UNIQUE NOT NULL,
  classification text NOT NULL CHECK (classification IN ('success', 'information', 'guidance', 'failure')),
  category text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title text NOT NULL,
  summary text NOT NULL,
  explanation text NOT NULL,
  cause text,
  recommended_next_action text NOT NULL,
  secondary_actions jsonb,
  technical_context text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE governed_response_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_response_registry" ON governed_response_registry;
CREATE POLICY "read_response_registry" ON governed_response_registry
  FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "write_response_registry" ON governed_response_registry;
CREATE POLICY "write_response_registry" ON governed_response_registry
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── 2. governed_response_log ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS governed_response_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code text NOT NULL,
  classification text NOT NULL,
  category text NOT NULL,
  context jsonb,
  user_id uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE governed_response_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_response_log" ON governed_response_log;
CREATE POLICY "insert_response_log" ON governed_response_log
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "read_own_response_log" ON governed_response_log;
CREATE POLICY "read_own_response_log" ON governed_response_log
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ─── 3. Seed Initial Registry Entries ──────────────────────────────────────────

INSERT INTO governed_response_registry (reference_code, classification, category, severity, title, summary, explanation, cause, recommended_next_action, secondary_actions, technical_context)
VALUES
  ('EIOS-INTEGRITY-001', 'success', 'engineering_integrity', 'low', 'Integrity Alert Resolved', 'The Engineering Integrity alert has been successfully resolved.', 'The governed resolution completed successfully. The alert lifecycle has advanced to Resolved and the resolution has been persisted to the database.', NULL, 'View the Engineering Change Log to see the recorded resolution event.', '[{"label":"View Change Log","href":"/engineering/change-log"},{"label":"Return to Integrity Dashboard","href":"/engineering/integrity"}]', NULL),
  ('EIOS-INTEGRITY-002', 'guidance', 'engineering_integrity', 'medium', 'Integrity Alert Requires Investigation', 'This alert requires investigation before it can be resolved.', 'Engineering Intelligence has analysed the available evidence and produced a recommendation. Review the recommendation and available actions in the Investigation Workspace.', 'The alert was detected during an integrity scan and has not yet been resolved.', 'Open the Investigation Workspace to review the evidence and recommendation.', '[{"label":"Open Investigation","description":"Review evidence and recommendation"}]', NULL),
  ('EIOS-INTEGRITY-003', 'failure', 'engineering_integrity', 'high', 'Integrity Alert Already Resolved', 'This Engineering Integrity alert has already been resolved.', 'The governed resolution cannot be executed because this alert has already reached a terminal state (Resolved or Archived). The same governed repair can never be executed twice.', 'The alert resolution_status is already "resolved" or "archived" in the database.', 'View the resolution details in the Investigation Workspace.', '[{"label":"View Resolution Details","description":"See timestamp, actor, and audit reference"},{"label":"View Change Log","href":"/engineering/change-log"}]', NULL),
  ('EIOS-INTEGRITY-004', 'information', 'engineering_integrity', 'low', 'No Integrity Alerts Found', 'No Engineering Integrity alerts were found.', 'The integrity scan completed successfully and found no alerts requiring attention.', NULL, 'Return to the Engineering Control Centre.', NULL, NULL),
  ('EIOS-EWO-001', 'success', 'engineering_work_order', 'low', 'Engineering Work Order Saved', 'Your changes have been saved successfully.', 'The Engineering Work Order has been updated and the change has been recorded in the Engineering Change Log.', NULL, 'Continue working or return to the Work Orders list.', NULL, NULL),
  ('EIOS-EWO-002', 'guidance', 'engineering_work_order', 'medium', 'Work Order Is Closed', 'This Engineering Work Order has been closed and cannot be modified.', 'Your changes could not be saved because this Engineering Work Order has been closed after Product Owner Acceptance. Closed work orders are read-only.', 'The work order status is "closed".', 'Create a refinement Engineering Work Order to address new requirements.', '[{"label":"Create Refinement","description":"Create a new EWO that refines this one"},{"label":"View Change Log","href":"/engineering/change-log"},{"label":"Reopen Work Order","description":"Request reopening (requires PO approval)"}]', NULL),
  ('EIOS-EWO-003', 'failure', 'engineering_work_order', 'high', 'Work Order Not Found', 'The requested Engineering Work Order could not be found.', 'The work order reference does not exist in the database. It may have been deleted or the reference may be incorrect.', 'No engineering_work_orders record matches the provided reference.', 'Check the reference and try again, or browse the Work Orders list.', '[{"label":"Browse Work Orders","href":"/engineering/work-orders"}]', NULL),
  ('EIOS-CHANGELOG-001', 'success', 'change_log', 'low', 'Change Log Entry Recorded', 'The engineering event has been recorded in the Change Log.', 'The event was automatically recorded with full audit trail, actor tracking, and linked artefacts.', NULL, 'View the Change Log to see the recorded event.', '[{"label":"View Change Log","href":"/engineering/change-log"}]', NULL),
  ('EIOS-CHANGELOG-002', 'information', 'change_log', 'low', 'No Change Log Entries', 'No change log entries match the current filters.', 'There are no entries matching the selected filters. Try adjusting or clearing the filters.', NULL, 'Clear filters to see all entries.', NULL, NULL),
  ('EIOS-RECOVERY-001', 'success', 'historical_recovery', 'low', 'Recovery Package Approved', 'The historical recovery package has been approved.', 'The recovery package was successfully approved and the canonical engineering record has been created or linked.', NULL, 'View the recovered record in the Engineering Records Library.', '[{"label":"View Records Library","href":"/engineering/records"}]', NULL),
  ('EIOS-RECOVERY-002', 'guidance', 'historical_recovery', 'medium', 'Insufficient Evidence for Recovery', 'There is not enough evidence to safely reconstruct this engineering record.', 'Engineering Intelligence found references to this engineering object but could not safely reconstruct it from the available evidence. No record was fabricated.', 'Critical fields are missing from the available evidence sources.', 'Use "No Safe Historical Recovery" to record this as a governed historical exception.', '[{"label":"Mark as No Safe Recovery","description":"Record as governed exception"},{"label":"Defer Review","description":"Wait for additional evidence"}]', NULL),
  ('EIOS-PO-001', 'success', 'product_owner_approval', 'low', 'Product Owner Acceptance Recorded', 'Product Owner Acceptance has been recorded for this Engineering Work Order.', 'The acceptance has been recorded in the Engineering Change Log and the work order has been transitioned to Closed.', NULL, 'View the Engineering Change Log to see the acceptance event.', '[{"label":"View Change Log","href":"/engineering/change-log"}]', NULL),
  ('EIOS-PO-002', 'guidance', 'product_owner_approval', 'medium', 'PO Review Required', 'This item requires Product Owner review before it can proceed.', 'Engineering Intelligence has produced a recommendation that requires Product Owner review and decision before the workflow can continue.', NULL, 'Open the PO Review panel to make a decision.', '[{"label":"Open PO Review","description":"Review evidence and make a decision"}]', NULL),
  ('EIOS-PLATFORM-001', 'failure', 'platform', 'critical', 'Connection Error', 'The platform could not connect to the database.', 'A network or database error occurred. Your changes may not have been saved. Please retry the operation.', 'Database connection failed or timed out.', 'Retry the operation. If the problem persists, contact support with the reference code.', '[{"label":"Retry","description":"Attempt the operation again"}]', NULL),
  ('EIOS-PLATFORM-002', 'guidance', 'platform', 'medium', 'Authentication Required', 'You need to sign in to access this feature.', 'This feature requires an authenticated session. Please sign in to continue.', 'No active authentication session found.', 'Sign in to your account and try again.', '[{"label":"Sign In","href":"/login"}]', NULL),
  ('EIOS-AI-001', 'information', 'ai_workflow', 'low', 'AI Analysis Complete', 'Engineering Intelligence has completed its analysis.', 'The AI analysis has been completed and the results are available for review. All findings are grounded in runtime evidence.', NULL, 'Review the AI analysis results.', NULL, NULL),
  ('EIOS-AI-002', 'failure', 'ai_workflow', 'high', 'AI Analysis Failed', 'The AI analysis could not be completed.', 'The AI provider returned an error or the request timed out. No fabricated results were generated.', 'AI provider error, timeout, or rate limit.', 'Retry the analysis. If the problem persists, check the AI provider configuration.', '[{"label":"Retry Analysis","description":"Attempt the analysis again"},{"label":"Check AI Configuration","href":"/engineering/ai-providers"}]', NULL),
  ('EIOS-GENERAL-001', 'success', 'general', 'low', 'Operation Completed', 'The operation completed successfully.', 'The requested operation has been completed.', NULL, 'Continue with your next action.', NULL, NULL),
  ('EIOS-GENERAL-002', 'failure', 'general', 'medium', 'Operation Failed', 'The operation could not be completed.', 'An unexpected error occurred during the operation. The error has been logged.', 'An unhandled exception occurred.', 'Retry the operation. If the problem persists, contact support with the reference code.', '[{"label":"Retry","description":"Attempt the operation again"}]', NULL),
  ('EIOS-GENERAL-003', 'information', 'general', 'low', 'No Data Available', 'There is no data to display.', 'No records were found for this view. This may be because no data has been created yet, or because filters are excluding all records.', NULL, 'Create a new record or adjust your filters.', NULL, NULL)
ON CONFLICT (reference_code) DO UPDATE SET
  classification = EXCLUDED.classification,
  category = EXCLUDED.category,
  severity = EXCLUDED.severity,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  explanation = EXCLUDED.explanation,
  cause = EXCLUDED.cause,
  recommended_next_action = EXCLUDED.recommended_next_action,
  secondary_actions = EXCLUDED.secondary_actions,
  technical_context = EXCLUDED.technical_context,
  updated_at = now();

-- ─── 4. Create EWO-020 Work Order ─────────────────────────────────────────────

INSERT INTO engineering_work_orders (
  ewo_ref, title, executive_summary, status, priority, risk_level, owner, requested_by,
  engineering_notes
)
SELECT
  'EWO-020',
  'ES-003 — Governed User Guidance & Action Transparency',
  'Implement Engineering Standard ES-003 across EIOS. Every user action must result in one of four governed outcomes: Success, Information, Guidance, or Failure. Silent failures, unexplained behaviour and dead-end user experiences must no longer exist.',
  'in_progress',
  'medium',
  'medium',
  'engineering',
  'product_owner',
  'ES-003 platform-wide governed response framework with central registry, reusable UI components, and AI-grounded explanations.'
WHERE NOT EXISTS (
  SELECT 1 FROM engineering_work_orders WHERE ewo_ref = 'EWO-020'
);

-- ─── 5. Record EWO-020 Creation in Change Log ─────────────────────────────────

INSERT INTO engineering_change_log (
  change_type, object_type, object_id, object_ref, ewo_ref,
  summary, description, actor_type, actor,
  is_reconstructed, recording_source, linked_artefacts, metadata
)
SELECT
  'created',
  'engineering_work_order',
  ewo.id,
  'EWO-020',
  'EWO-020',
  'Engineering Work Order EWO-020 created',
  'ES-003 — Governed User Guidance & Action Transparency',
  'system',
  'system',
  false,
  'live',
  jsonb_build_array(
    jsonb_build_object('artefact_type', 'engineering_work_order', 'artefact_ref', 'EWO-020', 'artefact_id', ewo.id::text, 'label', 'ES-003 — Governed User Guidance & Action Transparency')
  ),
  '{"ewo_title": "ES-003 — Governed User Guidance & Action Transparency"}'::jsonb
FROM engineering_work_orders ewo
WHERE ewo.ewo_ref = 'EWO-020'
AND NOT EXISTS (
  SELECT 1 FROM engineering_change_log
  WHERE ewo_ref = 'EWO-020'
  AND change_type = 'created'
  AND recording_source = 'live'
);
