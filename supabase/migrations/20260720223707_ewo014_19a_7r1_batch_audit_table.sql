/*
# EWO-014.19A.7R.1 — Batch Audit Record Table

Stores permanent governed batch execution records for maintenance scripts
that process Engineering Work Orders through canonical governance services.
*/

CREATE TABLE IF NOT EXISTS ewo_batch_audit_records (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id        text NOT NULL UNIQUE,
  script_name         text NOT NULL,
  script_version      text NOT NULL,
  initiated_by        text NOT NULL,
  initiated_at        timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz,
  dry_run             boolean NOT NULL DEFAULT true,
  total_canonical     integer NOT NULL DEFAULT 0,
  excluded_refs       text[] NOT NULL DEFAULT '{}',
  candidate_count     integer NOT NULL DEFAULT 0,
  verified_count     integer NOT NULL DEFAULT 0,
  accepted_count     integer NOT NULL DEFAULT 0,
  closed_count       integer NOT NULL DEFAULT 0,
  already_complete   integer NOT NULL DEFAULT 0,
  skipped_count      integer NOT NULL DEFAULT 0,
  failed_count       integer NOT NULL DEFAULT 0,
  per_ewo_results    jsonb NOT NULL DEFAULT '[]',
  acceptance_note    text,
  code_version       text,
  status             text NOT NULL DEFAULT 'in_progress'
                     CHECK (status IN ('in_progress','completed','failed','aborted')),
  summary            text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ewo_batch_audit_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_batch_audit_authenticated" ON ewo_batch_audit_records FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_batch_audit_authenticated" ON ewo_batch_audit_records FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_batch_audit_authenticated" ON ewo_batch_audit_records FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_batch_audit_authenticated" ON ewo_batch_audit_records FOR DELETE
  TO authenticated USING (true);
