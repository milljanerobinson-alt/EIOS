
-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: Email, Billing, Compliance & Audit
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ecc_product_features (
  feature_id, name, category, sub_category, description, purpose,
  status, priority, release_version, implementation_date,
  implementation_source, source_file, developer, testing_status, production_ready,
  database_changes, api_changes, ui_changes, compliance_impact, audit_impact, security_impact,
  documentation_status, notes, tags
) VALUES

('FEAT-080', 'Email Queue System', 'Email & Notifications', 'Core',
 'Durable, idempotent email queue backed by the email_queue table. Supports: invitation delivery, 3-tier reminders, completion notifications. Auto-suppresses reminders on completion. Deduplication via idempotency keys. Processed hourly via pg_cron.',
 'Ensure reliable, deduplicated transactional email delivery with retry logic and audit trail.',
 'implemented', 'critical', 'v0.1', '2026-07-01 10:27:51+00',
 'Migration + Edge Function + Scheduled Job',
 'supabase/functions/process-email-queue/index.ts', 'AI', 'requires_review', true,
 'email_queue, notifications tables',
 'Resend API for email delivery',
 'EmailActivityPage — queue and delivery log viewer',
 NULL, 'Email delivery events logged to audit_trail', NULL,
 'partial', 'Swept hourly at :05 via pg_cron', ARRAY['email', 'queue', 'notifications', 'resend']),

('FEAT-081', 'Email Credential Storage', 'Email & Notifications', 'Configuration',
 'Secure storage of Resend API key via save-email-secret edge function.',
 'Securely store email provider credentials server-side.',
 'implemented', 'medium', 'v0.1', '2026-06-27 00:00:00+00',
 'Edge Function', 'supabase/functions/save-email-secret/index.ts', 'AI', 'requires_review', true,
 'settings (resend_api_key)', NULL, 'SettingsPage email configuration',
 NULL, NULL, 'Admin-only edge function',
 'partial', NULL, ARRAY['email', 'credentials', 'settings']),

('FEAT-082', 'LLM API Credential Storage', 'Email & Notifications', 'Configuration',
 'Secure storage of LLM API key, model name, and base URL via save-llm-secret edge function. Supports any OpenAI-compatible provider.',
 'Securely configure the AI provider for support plan generation and UoC analysis.',
 'implemented', 'medium', 'v0.1', '2026-06-27 00:00:00+00',
 'Edge Function', 'supabase/functions/save-llm-secret/index.ts', 'AI', 'requires_review', true,
 'settings (llm_api_key, llm_model, llm_base_url)', NULL, 'SettingsPage LLM configuration',
 NULL, NULL, 'Admin-only edge function',
 'partial', NULL, ARRAY['ai', 'llm', 'credentials', 'settings']),

-- BILLING
('FEAT-090', 'Stripe Subscription Billing', 'Billing', 'Payments',
 'Full Stripe subscription integration: 3 pricing tiers (LLN Only $79, Digital Only $79, LLN+Digital $129), Stripe Checkout, Billing Portal, webhook handling. Subscription status, payment method, and usage tracking.',
 'Monetise the LLN+D platform with recurring subscription revenue.',
 'implemented', 'high', 'v0.2', '2026-06-29 09:19:44+00',
 'Migration + Edge Function', 'supabase/functions/stripe-checkout/index.ts', 'AI', 'requires_review', true,
 'subscription_plans (3 tiers seeded), subscriptions, billing_usage, billable_learners, billing_events',
 'Stripe API: checkout sessions, billing portal, webhook events',
 'BillingPage — current plan, invoices, usage',
 NULL, 'Stripe webhook events logged to billing_events', 'Stripe webhook signature validation',
 'partial', NULL, ARRAY['billing', 'stripe', 'subscription', 'payments']),

('FEAT-091', 'Billing Usage Tracking', 'Billing', 'Usage',
 'Tracks completed learners per billing period (one billable_learners row per learner per period). Sends usage threshold notifications at 75%, 90%, and 100% of included assessments.',
 'Ensure accurate billing and proactive notification when approaching usage limits.',
 'implemented', 'high', 'v0.2', '2026-06-29 09:19:44+00',
 'Migration', 'supabase/migrations/20260629091944_create_billing_tables.sql', 'AI', 'requires_review', true,
 'billing_usage, billable_learners tables', NULL, 'BillingPage usage meter',
 NULL, NULL, NULL, 'partial', NULL, ARRAY['billing', 'usage', 'metering']),

-- COMPLIANCE & AUDIT
('FEAT-100', 'ASQA Compliance Report Generator', 'Compliance', 'Reporting',
 'Comprehensive compliance report builder. Generates printable reports covering: candidate details, qualification info, all assessment scores, all responses with correctness, ACSF outcomes, audit trail, support plans, and interventions. Print/PDF export.',
 'Provide RTOs with ASQA-ready evidence documentation for any assessment. Single-page printable format.',
 'implemented', 'critical', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/pages/CompliancePage.tsx', 'AI', 'requires_review', true,
 'assessment_invitations, invitation_assessments, assessment_responses, assessment_questions, assessments, qualifications, audit_trail, support_plans, intervention_cases',
 NULL, 'CompliancePage — report builder and print view',
 'ASQA: Primary compliance reporting tool', NULL, NULL,
 'partial', NULL, ARRAY['compliance', 'reporting', 'asqa', 'print']),

('FEAT-101', 'Complete Audit Trail', 'Compliance', 'Audit',
 'Comprehensive system-wide audit trail. Every action by every actor (admin, trainer, candidate, system) is recorded with: event_type, actor, timestamp, IP address, user agent, previous/new values, severity, and category. Immutable append-only log.',
 'Provide an unalterable evidence trail for ASQA audit requirements and legal compliance.',
 'implemented', 'critical', 'v0.1', '2026-06-27 00:00:00+00',
 'Migration + Library', 'src/lib/audit.ts', 'AI', 'requires_review', true,
 'audit_trail table (extended in 20260701101115 with category, severity, previous_values)',
 NULL, 'AuditLogPage — searchable viewer with filters',
 'ASQA: Audit trail is a primary compliance requirement', 'IS the audit trail', NULL,
 'partial', NULL, ARRAY['audit', 'compliance', 'asqa', 'logging']),

('FEAT-102', 'Queue Backoff & Stuck Recovery', 'Compliance', 'Reliability',
 'Exponential backoff and stuck-job recovery for email and aXcelerate write-back queues. Failed items are retried with increasing delays; items stuck in "processing" for >10 minutes are automatically reset.',
 'Ensure message queues are self-healing and do not silently lose items.',
 'implemented', 'high', 'v0.2', '2026-07-03 23:42:50+00',
 'Migration', 'supabase/migrations/20260703234250_queue_backoff_and_stuck_recovery_bl02_bl03.sql', 'AI', 'requires_review', true,
 'email_queue (backoff logic), axcelerate_writeback_queue (stuck recovery)', NULL, NULL,
 NULL, NULL, NULL, 'missing', NULL, ARRAY['queue', 'reliability', 'backoff', 'recovery']),

('FEAT-103', 'Performance Indexes', 'Infrastructure', 'Database',
 'Comprehensive database indexing on all high-query tables: email_queue (status, invitation_id, idempotency_key), audit_trail (invitation_id, timestamp), assessment_invitations (token fields, status), axcelerate_writeback_queue, etc.',
 'Ensure sub-second query performance at scale.',
 'implemented', 'high', 'v0.2', '2026-07-03 23:42:30+00',
 'Migration', 'supabase/migrations/20260703234230_add_missing_indexes_bl10.sql', 'AI', 'requires_review', true,
 '50+ indexes created across all major tables', NULL, NULL,
 NULL, NULL, NULL, 'missing', NULL, ARRAY['performance', 'indexes', 'database'])

ON CONFLICT (feature_id) DO NOTHING;
