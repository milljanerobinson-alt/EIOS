
-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: Candidate Management & Invitations
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ecc_product_features (
  feature_id, name, category, sub_category, description, purpose,
  status, priority, release_version, implementation_date,
  implementation_source, source_file, developer, testing_status, production_ready,
  database_changes, api_changes, ui_changes, compliance_impact, audit_impact, security_impact,
  documentation_status, notes, tags
) VALUES

('FEAT-040', 'Assessment Invitation System', 'Candidate Management', 'Invitations',
 'Create and send assessment invitations to candidates. Each invitation has a unique token linking the candidate to their LLN and/or Digital assessment. Supports separate tokens per assessment type for independent access.',
 'Securely deliver assessments to candidates with tamper-proof unique tokens.',
 'implemented', 'critical', 'v0.1', '2026-06-27 00:00:00+00',
 'Component + Migration', 'src/pages/CandidatesPage.tsx', 'AI', 'requires_review', true,
 'assessment_invitations (unique_token, lln_token, digital_token), invitation_assessments',
 NULL, 'CandidatesPage — create/edit/view/delete invitations',
 'ASQA: Assessment delivery evidence', 'Invitation creation and status changes logged',
 'Token-scoped RLS on all student data',
 'partial', NULL, ARRAY['candidate', 'invitation', 'token']),

('FEAT-041', 'Candidate Activity Timeline', 'Candidate Management', 'Audit',
 'Per-invitation timeline of student lifecycle events: invitation sent, LLN opened, assessment started, completed, support plan generated, etc. Displayed in CandidatesPage modal.',
 'Give trainers visibility into the exact sequence of a candidate''s assessment journey.',
 'implemented', 'high', 'v0.1', '2026-07-02 21:27:56+00',
 'Component', 'src/pages/CandidatesPage.tsx', 'AI', 'requires_review', true,
 'student_lifecycle_events, audit_trail',
 NULL, 'Activity timeline modal in CandidatesPage',
 'ASQA: Student journey evidence', 'All events stored with timestamps', NULL,
 'partial', NULL, ARRAY['candidate', 'timeline', 'audit']),

('FEAT-042', 'Email Reminder System (Scheduled)', 'Candidate Management', 'Notifications',
 'Three configurable reminder emails per invitation (reminder_1, reminder_2, reminder_3), queued to email_queue for delivery via pg_cron sweep. Duplicate suppression via idempotency keys. Reminders auto-cancelled on completion.',
 'Reduce dropout and overdue assessments by automatically following up with candidates.',
 'implemented', 'high', 'v0.1', '2026-07-01 10:27:51+00',
 'Migration + Edge Function', 'supabase/functions/process-email-queue/index.ts', 'AI', 'requires_review', true,
 'email_queue (idempotency_key, status, scheduled_at)', NULL,
 'Manual "Send Reminder" in CandidatesPage; automated via queue',
 NULL, 'Email events logged to audit_trail', NULL,
 'partial', NULL, ARRAY['email', 'reminder', 'notification', 'queue']),

('FEAT-043', 'Student Lifecycle State Machine', 'Candidate Management', 'Core',
 'Database-level student lifecycle with ordered states: lln_required → invitation_sent → lln_opened → digital_invitation_sent → digital_opened → awaiting_submission → lln_complete → digital_complete → support_generated → closed. States advance automatically as events occur.',
 'Track the exact stage of every candidate in a consistent, queryable way.',
 'implemented', 'high', 'v0.1', '2026-07-02 21:27:56+00',
 'Migration', 'supabase/migrations/20260702212756_20260702060000_student_lifecycle_state_machine.sql', 'AI', 'requires_review', true,
 'students, enrolments, student_lifecycle_events tables',
 NULL, 'Status badges in CandidatesPage',
 NULL, 'All state transitions logged to student_lifecycle_events', NULL,
 'partial', NULL, ARRAY['lifecycle', 'state-machine', 'student']),

('FEAT-044', 'Course Recommendation Engine', 'Candidate Management', 'Results',
 'After assessment completion, compares ACSF outcomes against qualification minimum requirements and outputs: Suitable, Suitable with Support, or Not Yet Suitable. Trainer override with reason field available.',
 'Provide RTOs with an evidence-based course readiness recommendation for each candidate.',
 'implemented', 'critical', 'v0.1', '2026-06-27 00:00:00+00',
 'Edge Function + Component', 'supabase/functions/on-assessment-complete/index.ts', 'AI', 'requires_review', true,
 'assessment_invitations.course_recommendation, recommendation_reasons',
 'Called by on-assessment-complete edge function',
 'ResultsPage — recommendation badge and override UI',
 'ASQA: Recommendation is central compliance evidence', 'Recommendation and overrides logged', NULL,
 'partial', NULL, ARRAY['recommendation', 'results', 'acsf', 'compliance']),

('FEAT-045', 'Trainer Override (Recommendation)', 'Candidate Management', 'Results',
 'Allows trainers to override the system-generated course recommendation with a manual decision. Requires a written reason. Override history preserved (who, when, reason).',
 'Give trainers the authority to apply professional judgement while maintaining an audit trail.',
 'implemented', 'high', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/pages/ResultsPage.tsx', 'AI', 'requires_review', true,
 'assessment_invitations.trainer_override, trainer_override_reason, trainer_override_by, trainer_override_at',
 NULL, 'ResultsPage override modal',
 'ASQA: Override must be documented', 'Override logged to audit_trail', NULL,
 'partial', NULL, ARRAY['override', 'trainer', 'results'])

ON CONFLICT (feature_id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: Support Plans & Interventions
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ecc_product_features (
  feature_id, name, category, sub_category, description, purpose,
  status, priority, release_version, implementation_date,
  implementation_source, source_file, developer, testing_status, production_ready,
  database_changes, api_changes, ui_changes, compliance_impact, audit_impact, security_impact,
  documentation_status, notes, tags
) VALUES

('FEAT-050', 'AI Support Plan Generation', 'Support Plans', 'AI',
 'Automatically generates a structured, personalised support plan for each candidate after assessment. Uses ACSF gap analysis as input. Plan includes domain findings, reading/numeracy support, resources, referral recommendations, reasonable adjustments, and trainer action items.',
 'Reduce trainer workload by generating a draft support plan automatically — the trainer reviews and approves.',
 'implemented', 'critical', 'v0.1', '2026-06-27 00:00:00+00',
 'Edge Function', 'supabase/functions/generate-support-plan/index.ts', 'AI', 'requires_review', true,
 'support_plans table',
 'generate-support-plan edge function (called by on-assessment-complete)',
 'SupportPlansPage — view/edit/approve UI',
 'ASQA: Support plans are compliance evidence', 'Support plan creation logged', NULL,
 'partial', NULL, ARRAY['support-plan', 'ai', 'compliance']),

('FEAT-051', 'Support Plan Editor', 'Support Plans', 'UI',
 'Trainer UI to review and edit generated support plans. Edit domain findings, support strategies, resources, referral recommendations, reasonable adjustments, and action items. Add trainer comments. Approve or reject.',
 'Allow trainers to review, customise, and formally approve AI-generated support plans.',
 'implemented', 'high', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/pages/SupportPlansPage.tsx', 'AI', 'requires_review', true,
 NULL, NULL, 'SupportPlansPage with array-field editors and approval workflow',
 'ASQA: Trainer-approved support plan required', 'Status changes logged', NULL,
 'partial', NULL, ARRAY['support-plan', 'trainer', 'editor']),

('FEAT-060', 'Intervention Case Management', 'Interventions', 'Core',
 'Full intervention case lifecycle: create case (triggered by "Not Yet Suitable"), add notes, attach evidence, record support strategies, schedule reassessments, close with summary. Multi-tab case detail UI.',
 'Provide a structured process for managing at-risk learners who require additional support before enrolment.',
 'implemented', 'high', 'v0.1', '2026-06-27 00:00:00+00',
 'Component + Migration', 'src/pages/InterventionsPage.tsx', 'AI', 'requires_review', true,
 'intervention_cases, intervention_notes, intervention_evidence, intervention_support_strategies, intervention_reassessments',
 NULL, 'InterventionsPage — full case management UI',
 'ASQA: Intervention must be documented', 'All case events logged', NULL,
 'partial', NULL, ARRAY['intervention', 'case', 'compliance'])

ON CONFLICT (feature_id) DO NOTHING;
