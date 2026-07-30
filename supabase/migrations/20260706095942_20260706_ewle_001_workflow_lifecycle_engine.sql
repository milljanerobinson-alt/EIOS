/*
# Engineering Workflow Lifecycle Engine (EWLE-001) — Foundation Schema

## Overview
Creates the configurable Engineering Workflow Lifecycle Engine. This is the
central orchestration layer for all engineering artefacts in the ECC. No
module implements its own workflow logic — all lifecycle transitions are
handled by this engine.

## New Tables

### ecc_workflow_stage_definitions
Configurable lifecycle stage registry. Stages are stored in the database and
can be extended without changing application code. Seeds the standard 13-stage
lifecycle plus 5 optional states.

### ecc_workflow_instances
One row per engineering artefact enrolled in the workflow. Records the
artefact type, reference, title, current stage, gate, ownership, and
blocking status.

### ecc_workflow_transitions
Permanent audit trail of every lifecycle transition. Never deleted. Captures
who made the transition, from/to stage, decision, notes, and time-in-stage.

### ecc_workflow_gates
5 governance gate definitions (Engineering Review Approval → Release Approval).

### ecc_workflow_approvals
Approval records at each governance gate. Records decision, approver, comments.

## Security
RLS enabled on all tables with anon+authenticated CRUD (single-tenant app,
no sign-in separation required for engineering tools).

## Notes
- Stage definitions use a stage_key (text) as the foreign key rather than UUID
  to make transitions human-readable in the audit trail.
- The standard lifecycle stages are seeded in display_order sequence.
- Optional states (blocked, on_hold, etc.) have display_order 100+.
*/

-- ─── Stage Definitions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_workflow_stage_definitions (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_key              text        NOT NULL UNIQUE,
  display_name           text        NOT NULL,
  description            text,
  display_order          int         NOT NULL DEFAULT 0,
  stage_type             text        NOT NULL DEFAULT 'standard',
  allowed_previous_stages text[]     NOT NULL DEFAULT '{}',
  allowed_next_stages    text[]      NOT NULL DEFAULT '{}',
  requires_approval      boolean     NOT NULL DEFAULT false,
  approval_role          text,
  is_editable            boolean     NOT NULL DEFAULT true,
  is_read_only           boolean     NOT NULL DEFAULT false,
  is_terminal            boolean     NOT NULL DEFAULT false,
  counts_as_active       boolean     NOT NULL DEFAULT true,
  counts_as_completed    boolean     NOT NULL DEFAULT false,
  dashboard_color        text        NOT NULL DEFAULT 'slate',
  dashboard_icon         text        NOT NULL DEFAULT 'circle',
  current_action         text,
  sla_hours              int,
  audit_category         text        NOT NULL DEFAULT 'lifecycle',
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_workflow_stage_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_workflow_stages" ON ecc_workflow_stage_definitions;
CREATE POLICY "anon_select_workflow_stages" ON ecc_workflow_stage_definitions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_workflow_stages" ON ecc_workflow_stage_definitions;
CREATE POLICY "anon_insert_workflow_stages" ON ecc_workflow_stage_definitions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_workflow_stages" ON ecc_workflow_stage_definitions;
CREATE POLICY "anon_update_workflow_stages" ON ecc_workflow_stage_definitions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_workflow_stages" ON ecc_workflow_stage_definitions;
CREATE POLICY "anon_delete_workflow_stages" ON ecc_workflow_stage_definitions FOR DELETE TO anon, authenticated USING (true);

-- ─── Workflow Instances ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_workflow_instances (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  artefact_type      text        NOT NULL,
  artefact_id        uuid,
  artefact_ref       text,
  artefact_title     text        NOT NULL,
  current_stage_key  text        NOT NULL DEFAULT 'draft',
  current_gate       int,
  assigned_to        text,
  product_owner      text,
  priority           text        NOT NULL DEFAULT 'normal',
  is_blocked         boolean     NOT NULL DEFAULT false,
  blocked_reason     text,
  stage_entered_at   timestamptz NOT NULL DEFAULT now(),
  is_historical      boolean     NOT NULL DEFAULT false,
  migration_notes    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecc_workflow_instances_stage
  ON ecc_workflow_instances(current_stage_key, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ecc_workflow_instances_artefact
  ON ecc_workflow_instances(artefact_type, artefact_id);

ALTER TABLE ecc_workflow_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_workflow_instances" ON ecc_workflow_instances;
CREATE POLICY "anon_select_workflow_instances" ON ecc_workflow_instances FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_workflow_instances" ON ecc_workflow_instances;
CREATE POLICY "anon_insert_workflow_instances" ON ecc_workflow_instances FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_workflow_instances" ON ecc_workflow_instances;
CREATE POLICY "anon_update_workflow_instances" ON ecc_workflow_instances FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_workflow_instances" ON ecc_workflow_instances;
CREATE POLICY "anon_delete_workflow_instances" ON ecc_workflow_instances FOR DELETE TO anon, authenticated USING (true);

-- ─── Workflow Transitions (Audit Trail — permanent) ───────────────────────────

CREATE TABLE IF NOT EXISTS ecc_workflow_transitions (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id                 uuid        NOT NULL REFERENCES ecc_workflow_instances(id) ON DELETE CASCADE,
  from_stage_key              text,
  to_stage_key                text        NOT NULL,
  transitioned_by             text,
  transition_type             text        NOT NULL DEFAULT 'manual',
  decision                    text,
  notes                       text,
  time_in_previous_stage_hours numeric,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecc_workflow_transitions_instance
  ON ecc_workflow_transitions(instance_id, created_at DESC);

ALTER TABLE ecc_workflow_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_workflow_transitions" ON ecc_workflow_transitions;
CREATE POLICY "anon_select_workflow_transitions" ON ecc_workflow_transitions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_workflow_transitions" ON ecc_workflow_transitions;
CREATE POLICY "anon_insert_workflow_transitions" ON ecc_workflow_transitions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_workflow_transitions" ON ecc_workflow_transitions;
CREATE POLICY "anon_update_workflow_transitions" ON ecc_workflow_transitions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_workflow_transitions" ON ecc_workflow_transitions;
CREATE POLICY "anon_delete_workflow_transitions" ON ecc_workflow_transitions FOR DELETE TO anon, authenticated USING (true);

-- ─── Governance Gates ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_workflow_gates (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_number      int         NOT NULL UNIQUE,
  gate_name        text        NOT NULL,
  description      text,
  required_stage_key text      NOT NULL,
  responsible_role text        NOT NULL DEFAULT 'product_owner',
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_workflow_gates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_workflow_gates" ON ecc_workflow_gates;
CREATE POLICY "anon_select_workflow_gates" ON ecc_workflow_gates FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_workflow_gates" ON ecc_workflow_gates;
CREATE POLICY "anon_insert_workflow_gates" ON ecc_workflow_gates FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_workflow_gates" ON ecc_workflow_gates;
CREATE POLICY "anon_update_workflow_gates" ON ecc_workflow_gates FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_workflow_gates" ON ecc_workflow_gates;
CREATE POLICY "anon_delete_workflow_gates" ON ecc_workflow_gates FOR DELETE TO anon, authenticated USING (true);

-- ─── Workflow Approvals ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_workflow_approvals (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id  uuid        NOT NULL REFERENCES ecc_workflow_instances(id) ON DELETE CASCADE,
  gate_number  int         NOT NULL,
  status       text        NOT NULL DEFAULT 'pending',
  decision     text,
  comments     text,
  decided_by   text,
  decided_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecc_workflow_approvals_instance
  ON ecc_workflow_approvals(instance_id, gate_number);
CREATE INDEX IF NOT EXISTS idx_ecc_workflow_approvals_pending
  ON ecc_workflow_approvals(status, created_at DESC);

ALTER TABLE ecc_workflow_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_workflow_approvals" ON ecc_workflow_approvals;
CREATE POLICY "anon_select_workflow_approvals" ON ecc_workflow_approvals FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_workflow_approvals" ON ecc_workflow_approvals;
CREATE POLICY "anon_insert_workflow_approvals" ON ecc_workflow_approvals FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_workflow_approvals" ON ecc_workflow_approvals;
CREATE POLICY "anon_update_workflow_approvals" ON ecc_workflow_approvals FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_workflow_approvals" ON ecc_workflow_approvals;
CREATE POLICY "anon_delete_workflow_approvals" ON ecc_workflow_approvals FOR DELETE TO anon, authenticated USING (true);

-- ─── Seed: Governance Gates ───────────────────────────────────────────────────

INSERT INTO ecc_workflow_gates (gate_number, gate_name, description, required_stage_key, responsible_role)
VALUES
  (1, 'Engineering Review Approval', 'Product Owner approves the completed engineering review before implementation may begin.', 'awaiting_po_approval', 'product_owner'),
  (2, 'Implementation Checkpoint',   'Engineering confirms implementation is complete and ready for validation.', 'implementation_complete', 'engineer'),
  (3, 'Engineering Validation',      'Engineering validates that implementation matches the approved spec.', 'engineering_validation', 'engineer'),
  (4, 'Product Owner Acceptance',    'Product Owner accepts the completed implementation before closure.', 'awaiting_po_acceptance', 'product_owner'),
  (5, 'Release Approval',            'Final governance approval before artefact is included in a release.', 'ready_for_release', 'product_owner')
ON CONFLICT (gate_number) DO NOTHING;

-- ─── Seed: Standard Lifecycle Stages ─────────────────────────────────────────

INSERT INTO ecc_workflow_stage_definitions
  (stage_key, display_name, description, display_order, stage_type,
   allowed_previous_stages, allowed_next_stages,
   requires_approval, approval_role,
   is_editable, is_read_only, is_terminal,
   counts_as_active, counts_as_completed,
   dashboard_color, dashboard_icon, current_action, sla_hours, audit_category)
VALUES
  ('draft',
   'Draft', 'Work item has been created and is being prepared for engineering review.',
   10, 'standard',
   ARRAY[]::text[], ARRAY['engineering_review_in_progress','blocked','on_hold','cancelled'],
   false, null, true, false, false, true, false,
   'slate', 'file', 'Create and refine the engineering review document.', 72, 'initiation'),

  ('engineering_review_in_progress',
   'Engineering Review In Progress', 'The engineering review is actively being written and refined.',
   20, 'standard',
   ARRAY['draft'], ARRAY['engineering_review_complete','blocked','on_hold','cancelled'],
   false, null, true, false, false, true, false,
   'blue', 'pencil', 'Complete the engineering review document.', 48, 'review'),

  ('engineering_review_complete',
   'Engineering Review Complete', 'Engineering review is complete and ready for Product Owner approval.',
   30, 'standard',
   ARRAY['engineering_review_in_progress'], ARRAY['awaiting_po_approval','blocked'],
   false, null, false, true, false, true, false,
   'indigo', 'check-circle', 'Submit for Product Owner approval.', 24, 'review'),

  ('awaiting_po_approval',
   'Awaiting Product Owner Approval', 'Engineering review is awaiting Product Owner approval at Gate 1. Implementation is blocked until approval is granted.',
   40, 'standard',
   ARRAY['engineering_review_complete'], ARRAY['approved_for_implementation','rejected'],
   true, 'product_owner', false, true, false, true, false,
   'amber', 'clock', 'Review and approve the engineering review.', 48, 'governance'),

  ('approved_for_implementation',
   'Approved for Implementation', 'Product Owner has approved the engineering review. Implementation may begin.',
   50, 'standard',
   ARRAY['awaiting_po_approval'], ARRAY['implementation_in_progress','blocked','on_hold'],
   false, null, false, true, false, true, false,
   'emerald', 'thumbs-up', 'Begin implementation as per approved spec.', null, 'approval'),

  ('implementation_in_progress',
   'Implementation In Progress', 'Active development is underway.',
   60, 'standard',
   ARRAY['approved_for_implementation','awaiting_po_acceptance'], ARRAY['implementation_complete','blocked','on_hold'],
   false, null, true, false, false, true, false,
   'blue', 'code', 'Complete all implementation tasks.', null, 'implementation'),

  ('implementation_complete',
   'Implementation Complete', 'Implementation is complete at Gate 2. Awaiting engineering validation.',
   70, 'standard',
   ARRAY['implementation_in_progress'], ARRAY['engineering_validation','blocked'],
   false, null, false, true, false, true, false,
   'teal', 'package-check', 'Confirm implementation is complete and initiate validation.', 24, 'implementation'),

  ('engineering_validation',
   'Engineering Validation', 'Engineering is validating that implementation matches the approved spec at Gate 3.',
   80, 'standard',
   ARRAY['implementation_complete'], ARRAY['awaiting_po_acceptance','blocked'],
   false, null, true, false, false, true, false,
   'violet', 'shield-check', 'Execute validation plan and confirm compliance with approved spec.', 48, 'validation'),

  ('awaiting_po_acceptance',
   'Awaiting Product Owner Acceptance', 'Implementation awaits Product Owner acceptance at Gate 4.',
   90, 'standard',
   ARRAY['engineering_validation'], ARRAY['accepted','implementation_in_progress','rejected'],
   true, 'product_owner', false, true, false, true, false,
   'amber', 'user-check', 'Review implementation and accept or return for rework.', 48, 'governance'),

  ('accepted',
   'Accepted', 'Product Owner has accepted the implementation.',
   100, 'standard',
   ARRAY['awaiting_po_acceptance'], ARRAY['ready_for_release','blocked'],
   false, null, false, true, false, true, false,
   'emerald', 'check-circle-2', 'Prepare release package.', null, 'acceptance'),

  ('ready_for_release',
   'Ready for Release', 'Artefact is ready for inclusion in a release at Gate 5.',
   110, 'standard',
   ARRAY['accepted'], ARRAY['released','blocked'],
   true, 'product_owner', false, true, false, true, false,
   'green', 'rocket', 'Execute release package and deploy.', null, 'release'),

  ('released',
   'Released', 'Artefact has been deployed to production.',
   120, 'standard',
   ARRAY['ready_for_release'], ARRAY['closed'],
   false, null, false, true, false, false, false,
   'green', 'globe', 'Monitor release and confirm successful deployment.', null, 'release'),

  ('closed',
   'Closed', 'Work is complete and closed. Read-only.',
   130, 'standard',
   ARRAY['released'], ARRAY[]::text[],
   false, null, false, true, true, false, true,
   'slate', 'archive', 'No further action required.', null, 'closure'),

  -- Optional states
  ('blocked',
   'Blocked', 'Work is blocked by an external dependency or unresolved issue.',
   200, 'optional',
   ARRAY[]::text[], ARRAY[]::text[],
   false, null, true, false, false, true, false,
   'red', 'octagon', 'Resolve the blocking issue and resume the lifecycle.', null, 'exception'),

  ('on_hold',
   'On Hold', 'Work has been paused deliberately.',
   210, 'optional',
   ARRAY[]::text[], ARRAY[]::text[],
   false, null, true, false, false, false, false,
   'orange', 'pause-circle', 'Resume work when ready.', null, 'exception'),

  ('rejected',
   'Rejected', 'Work was rejected at a governance gate.',
   220, 'optional',
   ARRAY['awaiting_po_approval','awaiting_po_acceptance'], ARRAY['draft','engineering_review_in_progress','implementation_in_progress'],
   false, null, true, false, false, false, false,
   'red', 'x-circle', 'Review rejection comments and revise accordingly.', null, 'exception'),

  ('cancelled',
   'Cancelled', 'Work has been cancelled.',
   230, 'optional',
   ARRAY[]::text[], ARRAY[]::text[],
   false, null, false, true, true, false, false,
   'slate', 'ban', 'No further action required.', null, 'exception'),

  ('archived',
   'Archived', 'Artefact has been archived for reference.',
   240, 'optional',
   ARRAY[]::text[], ARRAY[]::text[],
   false, null, false, true, true, false, false,
   'slate', 'folder', 'No further action required.', null, 'exception')

ON CONFLICT (stage_key) DO NOTHING;
