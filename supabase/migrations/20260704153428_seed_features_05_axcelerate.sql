
-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: aXcelerate Integration
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ecc_product_features (
  feature_id, name, category, sub_category, description, purpose,
  status, priority, release_version, implementation_date,
  implementation_source, source_file, developer, testing_status, production_ready,
  database_changes, api_changes, ui_changes, compliance_impact, audit_impact, security_impact,
  documentation_status, notes, tags
) VALUES

('FEAT-070', 'aXcelerate Inbound Sync Engine', 'aXcelerate Integration', 'Inbound',
 'Core sync engine that fetches contact and enrolment data from aXcelerate, creates or updates student/enrolment records in LLN+D, determines assessment requirements based on qualification, and creates assessment invitations automatically.',
 'Eliminate manual invitation creation — students enrolled in aXcelerate are automatically invited.',
 'implemented', 'critical', 'v0.1', '2026-07-02 00:21:59+00',
 'Edge Function', 'supabase/functions/axcelerate-inbound-sync/index.ts', 'AI', 'requires_review', true,
 'students, enrolments, assessment_invitations, axcelerate_inbound_sync_log, student_lifecycle_events',
 'Axcelerate API: contact fetch, enrolments, qualifications',
 'AxcelerateInboundPage — sync log viewer',
 NULL, 'Sync operations logged', 'Service role + credential-gated',
 'partial', NULL, ARRAY['axcelerate', 'sync', 'inbound', 'automation']),

('FEAT-071', 'aXcelerate Bulk Sync Scheduler', 'aXcelerate Integration', 'Inbound',
 'Cron-triggered function that paginates through all aXcelerate contacts using a phase-based discovery strategy (custom field filter → date filter → full list). Queues each contact for inbound sync.',
 'Keep LLN+D automatically in sync with all new aXcelerate enrolments without manual intervention.',
 'implemented', 'high', 'v0.1', '2026-07-02 04:15:52+00',
 'Edge Function + Scheduled Job', 'supabase/functions/axcelerate-bulk-sync/index.ts', 'AI', 'requires_review', true,
 'axcelerate_inbound_sync_log', 'Axcelerate API: paginated contact list',
 NULL, NULL, 'Bulk sync events logged', 'Service role + cron secret',
 'partial', 'Scheduled via pg_cron; also callable manually', ARRAY['axcelerate', 'bulk-sync', 'cron', 'automation']),

('FEAT-072', 'aXcelerate Contact Webhook', 'aXcelerate Integration', 'Inbound',
 'Webhook endpoint for real-time aXcelerate contact change notifications. Triggers inbound sync immediately when a contact is created or updated in aXcelerate.',
 'Provide real-time student onboarding — students are invited seconds after enrolment.',
 'implemented', 'high', 'v0.1', '2026-06-27 00:00:00+00',
 'Edge Function', 'supabase/functions/axcelerate-contact-webhook/index.ts', 'AI', 'requires_review', true,
 'audit_trail', 'Axcelerate webhook payload',
 NULL, NULL, 'Webhook events logged', 'Webhook secret validation',
 'partial', NULL, ARRAY['axcelerate', 'webhook', 'realtime']),

('FEAT-073', 'aXcelerate Write-Back Queue', 'aXcelerate Integration', 'Outbound',
 'Durable, idempotent queue for all outbound writes to aXcelerate. Events: invitation_sent, assessment_completed, support_plan_generated, intervention_required, lln/digital_assessment_opened. Processed by cron sweep with exponential backoff.',
 'Ensure every assessment outcome is reliably written back to aXcelerate, with automatic retry on failure.',
 'implemented', 'critical', 'v0.1', '2026-07-01 10:39:21+00',
 'Migration + Edge Function', 'supabase/functions/process-axcelerate-queue/index.ts', 'AI', 'requires_review', true,
 'axcelerate_writeback_queue (status, idempotency_key, attempts, backoff), axcelerate_sync_log',
 'Axcelerate API: contact create, course enrolment, note write, outcome record',
 'AxcelerateLogPage — queue viewer',
 NULL, 'All write-back events and outcomes logged', 'Service role key',
 'partial', NULL, ARRAY['axcelerate', 'writeback', 'queue', 'outbound']),

('FEAT-074', 'aXcelerate Portfolio Upload', 'aXcelerate Integration', 'Outbound',
 'Generates formatted text report (LLN or Digital result summary) and uploads to the aXcelerate Portfolio system for each candidate. Deduplication via portfolio upload log.',
 'Store assessment evidence documents directly in aXcelerate alongside enrolment records.',
 'implemented', 'high', 'v0.1', '2026-07-02 00:21:59+00',
 'Edge Function', 'supabase/functions/upload-axcelerate-portfolio/index.ts', 'AI', 'requires_review', true,
 'axcelerate_portfolio_uploads (idempotency, status)',
 'Axcelerate API: portfolio types, portfolio upload',
 NULL, NULL, 'Upload events logged', NULL,
 'partial', NULL, ARRAY['axcelerate', 'portfolio', 'upload']),

('FEAT-075', 'aXcelerate Qualifications Import', 'aXcelerate Integration', 'Qualifications',
 'Preview and import qualifications from aXcelerate into LLN+D. Auto-applies ACSF mapping library defaults where available. Two-step: preview (select from list) → import (create in DB).',
 'Seed the qualification registry with real RTO qualifications from aXcelerate without manual entry.',
 'implemented', 'high', 'v0.1', '2026-06-27 00:00:00+00',
 'Edge Function', 'supabase/functions/import-axcelerate-qualifications/index.ts', 'AI', 'requires_review', true,
 'qualifications, qualification_lln_requirements (created on import)',
 'Axcelerate API: courses, RTO qualifications',
 'QualificationsPage "Import from aXcelerate" flow',
 NULL, 'Import events logged', NULL,
 'partial', NULL, ARRAY['axcelerate', 'qualifications', 'import']),

('FEAT-076', 'aXcelerate Connection Test', 'aXcelerate Integration', 'Configuration',
 'Test endpoint that validates aXcelerate API credentials by calling the /courses endpoint and returning success/failure with error details.',
 'Allow RTO administrators to verify their aXcelerate credentials are correctly configured.',
 'implemented', 'medium', 'v0.1', '2026-06-27 00:00:00+00',
 'Edge Function', 'supabase/functions/test-axcelerate-connection/index.ts', 'AI', 'requires_review', true,
 NULL, 'Axcelerate API: /courses', 'SettingsPage connection test button',
 NULL, NULL, 'Admin only — credentials validated server-side',
 'partial', NULL, ARRAY['axcelerate', 'settings', 'test']),

('FEAT-077', 'aXcelerate Credential Storage', 'aXcelerate Integration', 'Configuration',
 'Secure storage of aXcelerate API token, WS token, and base URL in the settings table. Managed via the save-axcelerate-secrets edge function.',
 'Provide secure, server-side storage of aXcelerate credentials without exposing them to the frontend.',
 'implemented', 'critical', 'v0.1', '2026-06-27 00:00:00+00',
 'Edge Function', 'supabase/functions/save-axcelerate-secrets/index.ts', 'AI', 'requires_review', true,
 'settings (axcelerate_token, axcelerate_ws_token, axcelerate_base_url)',
 NULL, 'SettingsPage credentials form',
 NULL, NULL, 'Admin-only edge function; credentials never returned to frontend',
 'partial', NULL, ARRAY['axcelerate', 'credentials', 'security', 'settings'])

ON CONFLICT (feature_id) DO NOTHING;
