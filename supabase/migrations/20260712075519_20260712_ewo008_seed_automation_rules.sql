/*
# EWO-008 Seed: Default Engineering Automation Rules

Seeds 5 default automation rules for the engineering automation engine.
trigger_condition uses '{}' (empty object) instead of NULL since column is NOT NULL.
*/

INSERT INTO engineering_automation_rules
  (rule_ref, name, description, trigger_event, trigger_condition,
   action_type, action_config, is_enabled, execution_order)
VALUES

(
  'RULE-001',
  'Create Library Record on EWO Close',
  'Automatically creates an engineering_records_library entry when an EWO transitions to closed status.',
  'ewo_closed',
  '{}'::jsonb,
  'create_library_record',
  jsonb_build_object('record_type', 'completion_report', 'status', 'archived', 'auto_generate_ref', true, 'ref_prefix', 'ERC', 'include_ewo_content', true),
  true, 10
),

(
  'RULE-002',
  'Mark Library Record PO Accepted',
  'Updates the engineering_records_library entry status to po_accepted when the EWO receives Product Owner acceptance.',
  'ewo_po_accepted',
  '{}'::jsonb,
  'create_library_record',
  jsonb_build_object('record_type', 'completion_report', 'status', 'po_accepted', 'update_existing', true, 'include_po_notes', true),
  true, 10
),

(
  'RULE-003',
  'Create Changelog Entry on EWO Close',
  'Creates a changelog entry summarising the closed EWO for release notes and stakeholder communication.',
  'ewo_closed',
  '{}'::jsonb,
  'create_changelog_entry',
  jsonb_build_object('entry_type', 'engineering_work_order', 'include_summary', true, 'include_outcomes', true),
  false, 20
),

(
  'RULE-004',
  'Track Plan Approval Analytics',
  'Records plan approval metrics for engineering velocity tracking.',
  'plan_approved',
  '{}'::jsonb,
  'update_analytics',
  jsonb_build_object('metric', 'plans_approved', 'increment', 1, 'include_timestamps', true),
  false, 10
),

(
  'RULE-005',
  'Track Plan Rejection Analytics',
  'Records plan rejection metrics and rejection reasons for process improvement.',
  'plan_rejected',
  '{}'::jsonb,
  'update_analytics',
  jsonb_build_object('metric', 'plans_rejected', 'increment', 1, 'include_rejection_reason', true, 'include_timestamps', true),
  false, 10
)

ON CONFLICT (rule_ref) DO NOTHING;
