/*
# EWO-032R.11 — Create EWO Deletion Audit Table

## Purpose
Stores immutable audit records for governed Engineering Work Order deletions.
Each record captures the deleted EWO's identity, previous status, dependency
counts, linked Ideas that were detached, requesting user, reason, and correlation
ID. The record does NOT depend on the EWO continuing to exist — it is written
BEFORE deletion and never modified or deleted.

1. New Tables
- `ewo_deletion_audit`
  - `id` (uuid, primary key)
  - `audit_ref` (text, unique — human-readable audit reference)
  - `correlation_id` (text — request correlation ID)
  - `deleted_ewo_ref` (text — the EWO reference that was deleted)
  - `deleted_ewo_id` (uuid — the EWO database ID that was deleted)
  - `deleted_ewo_title` (text — title at time of deletion)
  - `previous_status` (text — lifecycle status before deletion)
  - `deletion_reason` (text — user-supplied reason, required)
  - `requested_by` (text — requesting user identifier)
  - `deleted_at` (timestamptz — when the deletion was performed)
  - `eligibility_result` (jsonb — full eligibility check output)
  - `dependency_counts` (jsonb — counts of all checked dependencies)
  - `detached_idea_refs` (jsonb — array of Idea refs that were unlinked)

2. Security
- Enable RLS on `ewo_deletion_audit`.
- This is an admin-only engineering table. Policies scoped to `authenticated`
  with full CRUD, since the engineering workspace requires admin role to access.
- INSERT: any authenticated user (the service writes the audit record).
- SELECT: any authenticated user (admins can review deletion history).
- No UPDATE or DELETE policies — audit records are immutable.

3. Important Notes
- The table is append-only by design: no UPDATE or DELETE policies are created.
- The service writes the audit record BEFORE deleting the EWO, so the record
  survives even if the deletion itself fails partway through.
- If this table does not exist at runtime, the service falls back to writing
  to `engineering_audit_trail` instead.
*/

CREATE TABLE IF NOT EXISTS ewo_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_ref text UNIQUE NOT NULL,
  correlation_id text NOT NULL,
  deleted_ewo_ref text NOT NULL,
  deleted_ewo_id uuid NOT NULL,
  deleted_ewo_title text NOT NULL,
  previous_status text NOT NULL,
  deletion_reason text NOT NULL,
  requested_by text NOT NULL DEFAULT 'system',
  deleted_at timestamptz NOT NULL DEFAULT now(),
  eligibility_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  dependency_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  detached_idea_refs jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE ewo_deletion_audit ENABLE ROW LEVEL SECURITY;

-- INSERT: authenticated users (the governed service writes the record)
DROP POLICY IF EXISTS "authenticated_insert_ewo_deletion_audit" ON ewo_deletion_audit;
CREATE POLICY "authenticated_insert_ewo_deletion_audit"
ON ewo_deletion_audit FOR INSERT
TO authenticated WITH CHECK (true);

-- SELECT: authenticated users (admins review deletion history)
DROP POLICY IF EXISTS "authenticated_select_ewo_deletion_audit" ON ewo_deletion_audit;
CREATE POLICY "authenticated_select_ewo_deletion_audit"
ON ewo_deletion_audit FOR SELECT
TO authenticated USING (true);

-- No UPDATE or DELETE policies — audit records are immutable.
