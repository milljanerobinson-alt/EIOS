/*
# EWO-014.19A.7R.2 — Historical Reference Verification Audit Record
#
# Records the findings of the read-only historical investigation into
# EWO-005 and EWO-006. No engineering evidence was found for either
# reference in any governed source. Both are recorded as intentionally
# unused to maintain historical numbering integrity.
#
# No placeholder Engineering Work Orders are created.
# No unrelated Engineering Work Orders are modified.
*/

CREATE TABLE IF NOT EXISTS engineering_ledger_audit_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_ref       text NOT NULL UNIQUE,
  audit_type      text NOT NULL CHECK (audit_type IN ('historical_verification', 'reference_unused', 'reconciliation')),
  references_investigated text[] NOT NULL DEFAULT '{}',
  sources_searched text[] NOT NULL DEFAULT '{}',
  findings        jsonb NOT NULL DEFAULT '[]',
  conclusion      text NOT NULL,
  created_by      text NOT NULL DEFAULT 'system',
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE engineering_ledger_audit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_ledger_audit_authenticated" ON engineering_ledger_audit_notes FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_ledger_audit_authenticated" ON engineering_ledger_audit_notes FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_ledger_audit_authenticated" ON engineering_ledger_audit_notes FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_ledger_audit_authenticated" ON engineering_ledger_audit_notes FOR DELETE
  TO authenticated USING (true);

INSERT INTO engineering_ledger_audit_notes (
  audit_ref,
  audit_type,
  references_investigated,
  sources_searched,
  findings,
  conclusion,
  created_by
) VALUES (
  'AUDIT-EWO-014-19A-7R2-001',
  'historical_verification',
  ARRAY['EWO-005', 'EWO-006'],
  ARRAY[
    'engineering_work_orders',
    'engineering_records_library',
    'ewo_completion_reports',
    'ewo_engineering_packages',
    'ewo_lifecycle_events',
    'ewo_verification_gates',
    'ewo_verification_orchestrations',
    'ewo_verification_trace',
    'ewo_constitutional_verification',
    'ewo_engineering_provenance',
    'ewo_evidence_enrichments',
    'ewo_execution_approvals',
    'ewo_historical_imports',
    'engineering_recovery_packages',
    'engineering_executions',
    'ecc_engineering_reviews',
    'ecc_engineering_change_log',
    'engineering_object_registry',
    'engineering_object_relationships',
    'engineering_identity_map',
    'engineering_integrity_audits',
    'engineering_integrity_alerts',
    'engineering_lifecycle_events',
    'engineering_governance_log',
    'engineering_record_lineage',
    'engineering_memory',
    'source_code_migrations',
    'documentation',
    'test_fixtures'
  ],
  jsonb_build_array(
    jsonb_build_object(
      'reference', 'EWO-005',
      'created', false,
      'implementation_started', false,
      'completion_report_generated', false,
      'prompt_issued', false,
      'reserved_but_never_used', true,
      'accidentally_skipped', false,
      'evidence', 'No rows found in any governed engineering source. Test fixture data in ewo014_14_ledger_completeness.test.ts uses EWO-005 as mock data for ledger filter testing — not evidence of creation.',
      'conclusion', 'Reference unused. No governed engineering evidence exists. Reference intentionally preserved to maintain historical numbering integrity.'
    ),
    jsonb_build_object(
      'reference', 'EWO-006',
      'created', false,
      'implementation_started', false,
      'completion_report_generated', false,
      'prompt_issued', false,
      'reserved_but_never_used', true,
      'accidentally_skipped', false,
      'evidence', 'No rows found in any governed engineering source. Test fixture data in ewo014_14_ledger_completeness.test.ts uses EWO-006 as mock data for ledger filter testing — not evidence of creation.',
      'conclusion', 'Reference unused. No governed engineering evidence exists. Reference intentionally preserved to maintain historical numbering integrity.'
    )
  ),
  'Both EWO-005 and EWO-006 were investigated across 29 governed engineering sources. No engineering evidence exists for either reference. Neither was ever created, implemented, or issued a prompt. The numbering sequence EWO-004 → EWO-007R intentionally skipped EWO-005 and EWO-006. No placeholder Engineering Work Orders created. References permanently recorded as intentionally unused to maintain historical numbering integrity.',
  'product_owner'
);
