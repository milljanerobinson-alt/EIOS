
-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: impl_db_tables, impl_edge_functions, impl_pages, impl_components
-- for every feature — structured technical evidence
-- ─────────────────────────────────────────────────────────────────────────────

-- Authentication
UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['profiles'],
  impl_pages     = ARRAY['src/pages/LoginPage.tsx'],
  impl_migrations = ARRAY['20260627014708']
WHERE feature_id = 'FEAT-001';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['profiles'],
  impl_pages     = ARRAY['src/pages/LoginPage.tsx']
WHERE feature_id = 'FEAT-002';

UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['admin_otp_codes'],
  impl_edge_functions = ARRAY['send-admin-otp','verify-admin-otp'],
  impl_pages          = ARRAY['src/pages/LoginPage.tsx'],
  impl_migrations     = ARRAY['20260630030750'],
  impl_env_variables  = ARRAY['RESEND_API_KEY']
WHERE feature_id = 'FEAT-003';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['profiles'],
  impl_pages     = ARRAY['src/pages/LoginPage.tsx']
WHERE feature_id = 'FEAT-004';

UPDATE ecc_product_features SET
  impl_db_tables       = ARRAY['profiles'],
  impl_hooks_utilities = ARRAY['src/lib/auth.tsx','get_my_role() SQL function'],
  impl_migrations      = ARRAY['20260627014708','20260628082236','20260629100049']
WHERE feature_id = 'FEAT-005';

UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['profiles'],
  impl_migrations = ARRAY['20260701092324']
WHERE feature_id = 'FEAT-006';

UPDATE ecc_product_features SET
  impl_hooks_utilities = ARRAY['src/lib/auth.tsx'],
  impl_components      = ARRAY['AuthProvider','useAuth() hook']
WHERE feature_id = 'FEAT-007';

-- Assessment Engine
UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['assessments','assessment_questions'],
  impl_migrations = ARRAY['20260627014724','20260701094835'],
  impl_pages      = ARRAY['src/pages/AssessmentsPage.tsx']
WHERE feature_id = 'FEAT-010';

UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['assessment_questions'],
  impl_migrations = ARRAY['20260701094835']
WHERE feature_id IN ('FEAT-011','FEAT-012');

UPDATE ecc_product_features SET
  impl_db_tables       = ARRAY['assessment_invitations','invitation_assessments','assessment_responses','student_responses','assessment_declarations','audit_trail'],
  impl_pages           = ARRAY['src/pages/LLNAssessmentPage.tsx'],
  impl_hooks_utilities = ARRAY['src/lib/audit.ts'],
  impl_env_variables   = ARRAY['SUPABASE_URL','SUPABASE_ANON_KEY']
WHERE feature_id = 'FEAT-013';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['assessment_invitations','invitation_assessments','assessment_responses','student_responses','audit_trail'],
  impl_pages     = ARRAY['src/pages/DigitalAssessmentPage.tsx'],
  impl_hooks_utilities = ARRAY['src/lib/audit.ts']
WHERE feature_id = 'FEAT-014';

UPDATE ecc_product_features SET
  impl_db_tables       = ARRAY['declaration_templates','assessment_declarations'],
  impl_components      = ARRAY['src/components/AssessmentDeclarationScreen.tsx'],
  impl_migrations      = ARRAY['20260701023825']
WHERE feature_id = 'FEAT-015';

UPDATE ecc_product_features SET
  impl_db_tables       = ARRAY['audit_trail'],
  impl_hooks_utilities = ARRAY['src/lib/audit.ts']
WHERE feature_id = 'FEAT-016';

UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['assessment_invitations','support_plans','axcelerate_writeback_queue','email_queue','notifications','audit_trail','students','student_lifecycle_events'],
  impl_edge_functions = ARRAY['on-assessment-complete','generate-support-plan','upload-axcelerate-portfolio'],
  impl_env_variables  = ARRAY['RESEND_API_KEY','SUPABASE_SERVICE_ROLE_KEY']
WHERE feature_id = 'FEAT-017';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['assessment_invitations','invitation_assessments','assessments'],
  impl_pages     = ARRAY['src/pages/StudentLandingPage.tsx']
WHERE feature_id = 'FEAT-018';

UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['assessment_version_history'],
  impl_migrations = ARRAY['20260627014724']
WHERE feature_id = 'FEAT-019';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['assessment_validation'],
  impl_pages     = ARRAY['src/pages/ValidationPage.tsx']
WHERE feature_id = 'FEAT-020';

-- Qualification & ACSF
UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['qualifications','qualification_lln_requirements'],
  impl_edge_functions = ARRAY['import-axcelerate-qualifications','compute-acsf-mapping'],
  impl_pages          = ARRAY['src/pages/QualificationsPage.tsx'],
  impl_migrations     = ARRAY['20260627014724','20260630094605']
WHERE feature_id = 'FEAT-030';

UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['qualification_mapping_library'],
  impl_migrations = ARRAY['20260630094605','20260701013323']
WHERE feature_id = 'FEAT-031';

UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['uoc_acsf_library','qualification_mapping_logs','qualifications'],
  impl_edge_functions = ARRAY['compute-acsf-mapping'],
  impl_migrations     = ARRAY['20260630101033','20260630103119','20260630103310']
WHERE feature_id = 'FEAT-032';

UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['uoc_acsf_library'],
  impl_migrations = ARRAY['20260630101033','20260630103119','20260630103310']
WHERE feature_id = 'FEAT-033';

UPDATE ecc_product_features SET
  impl_edge_functions = ARRAY['fetch-tga-unit'],
  impl_env_variables  = ARRAY['LLM_API_KEY','LLM_MODEL','LLM_BASE_URL']
WHERE feature_id = 'FEAT-034';

UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['acsf_indicator_library'],
  impl_migrations = ARRAY['20260703092616']
WHERE feature_id = 'FEAT-035';

UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['eaee_analyses','eaee_feature_evidence','eaee_audit_log','acsf_indicator_library'],
  impl_pages      = ARRAY['src/pages/EAEEPage.tsx'],
  impl_migrations = ARRAY['20260703092616']
WHERE feature_id = 'FEAT-036';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['qualification_mapping_logs','uoc_acsf_library','qualifications'],
  impl_pages     = ARRAY['src/pages/ACSFEvidencePage.tsx','src/pages/MappingEvidencePage.tsx']
WHERE feature_id = 'FEAT-037';

UPDATE ecc_product_features SET
  impl_migrations = ARRAY['20260703082242']
WHERE feature_id = 'FEAT-038';

-- Candidate Management
UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['assessment_invitations','invitation_assessments'],
  impl_pages          = ARRAY['src/pages/CandidatesPage.tsx'],
  impl_migrations     = ARRAY['20260627014737','20260629104536'],
  impl_hooks_utilities = ARRAY['src/lib/audit.ts']
WHERE feature_id = 'FEAT-040';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['student_lifecycle_events','audit_trail'],
  impl_pages     = ARRAY['src/pages/CandidatesPage.tsx']
WHERE feature_id = 'FEAT-041';

UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['email_queue','notifications'],
  impl_edge_functions = ARRAY['process-email-queue'],
  impl_cron_jobs      = ARRAY['email-queue-sweep (hourly :05)'],
  impl_pages          = ARRAY['src/pages/CandidatesPage.tsx'],
  impl_migrations     = ARRAY['20260701102751']
WHERE feature_id = 'FEAT-042';

UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['students','enrolments','student_lifecycle_events'],
  impl_migrations = ARRAY['20260702212756']
WHERE feature_id = 'FEAT-043';

UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['assessment_invitations','qualification_lln_requirements'],
  impl_edge_functions = ARRAY['on-assessment-complete'],
  impl_pages          = ARRAY['src/pages/ResultsPage.tsx']
WHERE feature_id = 'FEAT-044';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['assessment_invitations'],
  impl_pages     = ARRAY['src/pages/ResultsPage.tsx']
WHERE feature_id = 'FEAT-045';

-- Support & Interventions
UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['support_plans','assessment_invitations','invitation_assessments','qualification_lln_requirements'],
  impl_edge_functions = ARRAY['generate-support-plan'],
  impl_pages          = ARRAY['src/pages/SupportPlansPage.tsx'],
  impl_ai_services    = ARRAY['LLM API (OpenAI-compatible)']
WHERE feature_id = 'FEAT-050';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['support_plans'],
  impl_pages     = ARRAY['src/pages/SupportPlansPage.tsx']
WHERE feature_id = 'FEAT-051';

UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['intervention_cases','intervention_notes','intervention_evidence','intervention_support_strategies','intervention_reassessments','audit_trail'],
  impl_pages      = ARRAY['src/pages/InterventionsPage.tsx'],
  impl_migrations = ARRAY['20260627014815']
WHERE feature_id = 'FEAT-060';

-- aXcelerate Integration
UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['students','enrolments','assessment_invitations','axcelerate_inbound_sync_log','student_lifecycle_events','email_queue','axcelerate_writeback_queue'],
  impl_edge_functions = ARRAY['axcelerate-inbound-sync'],
  impl_migrations     = ARRAY['20260702002159'],
  impl_env_variables  = ARRAY['AXCELERATE_TOKEN','AXCELERATE_WS_TOKEN','AXCELERATE_BASE_URL']
WHERE feature_id = 'FEAT-070';

UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['axcelerate_inbound_sync_log'],
  impl_edge_functions = ARRAY['axcelerate-bulk-sync'],
  impl_cron_jobs      = ARRAY['axcelerate-bulk-sync (every minute)'],
  impl_migrations     = ARRAY['20260702041342','20260702041552'],
  impl_env_variables  = ARRAY['AXCELERATE_TOKEN','AXCELERATE_WS_TOKEN','AXCELERATE_BASE_URL','CRON_SECRET']
WHERE feature_id = 'FEAT-071';

UPDATE ecc_product_features SET
  impl_edge_functions = ARRAY['axcelerate-contact-webhook'],
  impl_env_variables  = ARRAY['AXCELERATE_WEBHOOK_SECRET']
WHERE feature_id = 'FEAT-072';

UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['axcelerate_writeback_queue','axcelerate_sync_log'],
  impl_edge_functions = ARRAY['process-axcelerate-queue'],
  impl_cron_jobs      = ARRAY['axcelerate-queue-sweep (hourly :10)'],
  impl_migrations     = ARRAY['20260701103921','20260703234250'],
  impl_env_variables  = ARRAY['AXCELERATE_TOKEN','AXCELERATE_WS_TOKEN','AXCELERATE_BASE_URL','CRON_SECRET']
WHERE feature_id = 'FEAT-073';

UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['axcelerate_portfolio_uploads','axcelerate_sync_log'],
  impl_edge_functions = ARRAY['upload-axcelerate-portfolio'],
  impl_env_variables  = ARRAY['AXCELERATE_TOKEN','AXCELERATE_WS_TOKEN']
WHERE feature_id = 'FEAT-074';

UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['qualifications','qualification_lln_requirements','qualification_mapping_library'],
  impl_edge_functions = ARRAY['import-axcelerate-qualifications'],
  impl_pages          = ARRAY['src/pages/QualificationsPage.tsx'],
  impl_env_variables  = ARRAY['AXCELERATE_TOKEN','AXCELERATE_WS_TOKEN','AXCELERATE_BASE_URL']
WHERE feature_id = 'FEAT-075';

UPDATE ecc_product_features SET
  impl_edge_functions = ARRAY['test-axcelerate-connection'],
  impl_pages          = ARRAY['src/pages/SettingsPage.tsx'],
  impl_env_variables  = ARRAY['AXCELERATE_TOKEN','AXCELERATE_WS_TOKEN','AXCELERATE_BASE_URL']
WHERE feature_id = 'FEAT-076';

UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['settings'],
  impl_edge_functions = ARRAY['save-axcelerate-secrets'],
  impl_pages          = ARRAY['src/pages/SettingsPage.tsx'],
  impl_env_variables  = ARRAY['SUPABASE_SERVICE_ROLE_KEY']
WHERE feature_id = 'FEAT-077';

-- Email & Billing & Compliance
UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['email_queue','notifications'],
  impl_edge_functions = ARRAY['process-email-queue','send-email'],
  impl_cron_jobs      = ARRAY['email-queue-sweep (hourly :05)'],
  impl_migrations     = ARRAY['20260701102751'],
  impl_env_variables  = ARRAY['RESEND_API_KEY','CRON_SECRET'],
  impl_pages          = ARRAY['src/pages/EmailActivityPage.tsx']
WHERE feature_id = 'FEAT-080';

UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['settings'],
  impl_edge_functions = ARRAY['save-email-secret'],
  impl_pages          = ARRAY['src/pages/SettingsPage.tsx'],
  impl_env_variables  = ARRAY['RESEND_API_KEY']
WHERE feature_id = 'FEAT-081';

UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['settings'],
  impl_edge_functions = ARRAY['save-llm-secret'],
  impl_pages          = ARRAY['src/pages/SettingsPage.tsx'],
  impl_env_variables  = ARRAY['LLM_API_KEY','LLM_MODEL','LLM_BASE_URL'],
  impl_ai_services    = ARRAY['OpenAI-compatible LLM API']
WHERE feature_id = 'FEAT-082';

UPDATE ecc_product_features SET
  impl_db_tables      = ARRAY['subscription_plans','subscriptions','billing_usage','billable_learners','billing_events'],
  impl_edge_functions = ARRAY['stripe-checkout','stripe-portal','stripe-webhook','save-stripe-key'],
  impl_pages          = ARRAY['src/pages/BillingPage.tsx'],
  impl_migrations     = ARRAY['20260629091944'],
  impl_env_variables  = ARRAY['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET']
WHERE feature_id = 'FEAT-090';

UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['billing_usage','billable_learners'],
  impl_migrations = ARRAY['20260629091944'],
  impl_pages      = ARRAY['src/pages/BillingPage.tsx']
WHERE feature_id = 'FEAT-091';

UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['assessment_invitations','invitation_assessments','assessment_responses','assessment_questions','assessments','qualifications','audit_trail','support_plans','intervention_cases'],
  impl_pages      = ARRAY['src/pages/CompliancePage.tsx']
WHERE feature_id = 'FEAT-100';

UPDATE ecc_product_features SET
  impl_db_tables       = ARRAY['audit_trail'],
  impl_migrations      = ARRAY['20260627014815','20260701101115'],
  impl_hooks_utilities = ARRAY['src/lib/audit.ts'],
  impl_pages           = ARRAY['src/pages/AuditLogPage.tsx']
WHERE feature_id = 'FEAT-101';

UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['email_queue','axcelerate_writeback_queue'],
  impl_migrations = ARRAY['20260703234250']
WHERE feature_id = 'FEAT-102';

UPDATE ecc_product_features SET
  impl_migrations = ARRAY['20260703234230']
WHERE feature_id = 'FEAT-103';

-- Admin Portal
UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['assessment_invitations','support_plans','intervention_cases'],
  impl_pages     = ARRAY['src/pages/DashboardPage.tsx']
WHERE feature_id = 'FEAT-110';

UPDATE ecc_product_features SET
  impl_components = ARRAY['src/components/AdminLayout.tsx']
WHERE feature_id = 'FEAT-111';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['settings'],
  impl_pages     = ARRAY['src/pages/SettingsPage.tsx']
WHERE feature_id = 'FEAT-112';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['assessment_invitations','invitation_assessments','assessment_responses','assessment_questions'],
  impl_pages     = ARRAY['src/pages/ResultsPage.tsx']
WHERE feature_id = 'FEAT-113';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['audit_trail'],
  impl_pages     = ARRAY['src/pages/AuditLogPage.tsx']
WHERE feature_id = 'FEAT-114';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['email_queue'],
  impl_pages     = ARRAY['src/pages/EmailActivityPage.tsx']
WHERE feature_id = 'FEAT-115';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['axcelerate_writeback_queue'],
  impl_pages     = ARRAY['src/pages/AxcelerateLogPage.tsx']
WHERE feature_id = 'FEAT-116';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['axcelerate_inbound_sync_log'],
  impl_pages     = ARRAY['src/pages/AxcelerateInboundPage.tsx']
WHERE feature_id = 'FEAT-117';

-- EOC
UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['ecc_backlog_items','ecc_release_candidates','ecc_ai_journal','ecc_documentation','ecc_decisions','ecc_testing_reports','ecc_architecture_reviews','ecc_engineering_audit','ecc_project_compass','ecc_phases','ecc_milestones','ecc_roadmap_items','ecc_product','ecc_engineering_standards'],
  impl_pages      = ARRAY['src/pages/EngineeringControlCentrePage.tsx'],
  impl_components = ARRAY['src/pages/ecc/ECCDashboard.tsx'],
  impl_migrations = ARRAY['20260704020037','20260704021222','20260704022552','20260704023525','20260704025135','20260704030816','20260704043742']
WHERE feature_id = 'FEAT-130';

UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['ecc_release_candidates','ecc_ai_journal','ecc_engineering_audit'],
  impl_pages      = ARRAY['src/pages/ecc/ECCStartPhaseWizard.tsx']
WHERE feature_id = 'FEAT-131';

UPDATE ecc_product_features SET
  impl_db_tables       = ARRAY['ecc_release_candidates','ecc_engineering_audit'],
  impl_pages           = ARRAY['src/pages/ecc/ECCReleaseCentrePage.tsx'],
  impl_hooks_utilities = ARRAY['src/lib/activeRC.tsx','src/lib/rcValidation.ts']
WHERE feature_id = 'FEAT-132';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['ecc_backlog_items'],
  impl_pages     = ARRAY['src/pages/ecc/ECCBacklogPage.tsx']
WHERE feature_id = 'FEAT-133';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['ecc_testing_reports','ecc_regression_suites','ecc_test_library'],
  impl_pages     = ARRAY['src/pages/ecc/ECCQAPage.tsx']
WHERE feature_id = 'FEAT-134';

UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['ecc_architecture_reviews'],
  impl_pages      = ARRAY['src/pages/ecc/ECCArchitecturePage.tsx'],
  impl_migrations = ARRAY['20260704104311']
WHERE feature_id = 'FEAT-135';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['ecc_documentation'],
  impl_pages     = ARRAY['src/pages/ecc/ECCDocumentationPage.tsx']
WHERE feature_id = 'FEAT-136';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['ecc_ai_journal'],
  impl_pages     = ARRAY['src/pages/ecc/ECCAIJournalPage.tsx']
WHERE feature_id = 'FEAT-137';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['ecc_decisions'],
  impl_pages     = ARRAY['src/pages/ecc/ECCDecisionLogPage.tsx']
WHERE feature_id = 'FEAT-138';

UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['ecc_engineering_standards'],
  impl_pages      = ARRAY['src/pages/ecc/ECCStandardsPage.tsx'],
  impl_migrations = ARRAY['20260704082107','20260704082234']
WHERE feature_id = 'FEAT-139';

UPDATE ecc_product_features SET
  impl_db_tables = ARRAY['ecc_engineering_audit'],
  impl_pages     = ARRAY['src/pages/ecc/ECCTimelinePage.tsx']
WHERE feature_id = 'FEAT-140';

UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['ecc_project_compass','builder_settings'],
  impl_pages      = ARRAY['src/pages/ecc/ECCProjectCompassPage.tsx'],
  impl_migrations = ARRAY['20260701090800']
WHERE feature_id = 'FEAT-141';

UPDATE ecc_product_features SET
  impl_db_tables  = ARRAY['ecc_product','ecc_roadmap_items','ecc_milestones','ecc_phases'],
  impl_pages      = ARRAY['src/pages/ecc/ECCProductPage.tsx','src/pages/ecc/ECCRoadmapPage.tsx','src/pages/ecc/ECCMilestonesPage.tsx','src/pages/ecc/ECCPhasesPage.tsx'],
  impl_migrations = ARRAY['20260704104205','20260704104252']
WHERE feature_id = 'FEAT-142';

UPDATE ecc_product_features SET
  impl_hooks_utilities = ARRAY['src/lib/rcValidation.ts','src/lib/activeRC.tsx'],
  impl_db_tables       = ARRAY['ecc_release_candidates','ecc_ai_journal','ecc_testing_reports','ecc_documentation','ecc_architecture_reviews']
WHERE feature_id = 'FEAT-143';

-- Infrastructure
UPDATE ecc_product_features SET
  impl_edge_functions = ARRAY['process-email-queue','process-axcelerate-queue'],
  impl_cron_jobs      = ARRAY['email-queue-sweep (hourly :05)','axcelerate-queue-sweep (hourly :10)'],
  impl_migrations     = ARRAY['20260701200735','20260701201005'],
  impl_env_variables  = ARRAY['CRON_SECRET','SUPABASE_URL']
WHERE feature_id = 'FEAT-150';

UPDATE ecc_product_features SET
  impl_hooks_utilities = ARRAY['get_my_role() SECURITY DEFINER','prevent_role_escalation() trigger'],
  impl_migrations      = ARRAY['20260628082236','20260629100049','20260630001125','20260704005324']
WHERE feature_id = 'FEAT-151';

UPDATE ecc_product_features SET
  impl_env_variables = ARRAY['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY']
WHERE feature_id = 'FEAT-152';

UPDATE ecc_product_features SET
  impl_env_variables = ARRAY['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DB_URL']
WHERE feature_id = 'FEAT-153';
