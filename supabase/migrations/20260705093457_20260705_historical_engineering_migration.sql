
-- =============================================================================
-- HISTORICAL ENGINEERING MIGRATION
-- Engineering Change Log — Complete Platform History
-- Source: Supabase migration files (20260627–20260705), implementation history
--         docs, ECC data (86 features, 2 audits, 3 releases)
-- Classification: HISTORICAL_MIGRATION — HIGH confidence
-- =============================================================================

INSERT INTO ecc_engineering_change_log (summary,description,change_type,risk_level,approval_status,created_by,documentation_updated,guardian_passed,files_changed,database_changes,api_changes,implementation_notes,created_at,updated_at) VALUES
-- CL-0001: Platform Foundation
('Platform Foundation — Core authentication, profiles, and settings schema',
 'Historical Migration: Established the foundational Supabase schema. Created profiles (role-based), settings (key/value store), RLS policies, and admin role auto-assignment trigger. First engineering commit of the platform.',
 'infrastructure','high','approved','historical-migration',true,false,
 '["supabase/migrations/20260627014708_create_profiles_and_settings.sql"]'::jsonb,
 'Created: profiles, settings. RLS enabled. Trigger: auto-assign admin role.',null,
 'Historical Migration — confidence: HIGH. Source: migration 20260627014708. First platform commit.',
 '2026-06-27 01:47:08+00','2026-06-27 01:47:08+00'),

-- CL-0002: Assessment and Qualification schema
('Assessment Engine and Qualification schema — Core assessment tables',
 'Historical Migration: Created core assessment and qualification schema. Tables: assessments, assessment_questions, assessment_responses, qualifications, assessment_invitations. Established token-based candidate access and qualification linking.',
 'feature','high','approved','historical-migration',true,false,
 '["supabase/migrations/20260627014724_create_assessments_and_qualifications.sql"]'::jsonb,
 'Created: assessments, assessment_questions, assessment_responses, qualifications, assessment_invitations.',
 'Token-based assessment access established.',
 'Historical Migration — confidence: HIGH. Source: migration 20260627014724.',
 '2026-06-27 01:47:24+00','2026-06-27 01:47:24+00'),

-- CL-0003: Invitations and responses
('Invitation and Response System — Candidate lifecycle workflow',
 'Historical Migration: Created invitations and responses schema. Established candidate lifecycle: invitation → token → assessment → results. Added response storage and outcome tracking.',
 'feature','medium','approved','historical-migration',true,false,
 '["supabase/migrations/20260627014737_create_invitations_and_responses.sql"]'::jsonb,
 'Created invitations schema, responses schema, lifecycle states.',null,
 'Historical Migration — confidence: HIGH. Source: migration 20260627014737.',
 '2026-06-27 01:47:37+00','2026-06-27 01:47:37+00'),

-- CL-0004: Support, Interventions, Notifications, Audit
('Support Plans, Interventions, Notifications, and Audit Trail — Operational schema',
 'Historical Migration: Created support plans, interventions, notification preferences, and audit trail tables. Underpins compliance and candidate support workflows.',
 'infrastructure','high','approved','historical-migration',true,false,
 '["supabase/migrations/20260627014815_create_support_interventions_notifications_audit.sql"]'::jsonb,
 'Created: support_plans, interventions, notification_preferences, audit_trail.',null,
 'Historical Migration — confidence: HIGH. Source: migration 20260627014815.',
 '2026-06-27 01:48:15+00','2026-06-27 01:48:15+00'),

-- CL-0005: RLS + security hardening
('Security Hardening — Admin role trigger fix and RLS policy corrections',
 'Historical Migration: Updated profile trigger to correctly assign admin role. Fixed RLS policies across core tables to close security gaps identified during initial testing.',
 'security','high','approved','historical-migration',false,false,
 '["supabase/migrations/20260627020339_update_profile_trigger_admin_role.sql","supabase/migrations/20260628082236_fix_rls_security_policies.sql"]'::jsonb,
 'Updated profile trigger. Fixed RLS on profiles, assessments, invitations.',null,
 'Historical Migration — confidence: HIGH. Source: migrations 20260627020339 + 20260628082236.',
 '2026-06-28 08:22:36+00','2026-06-28 08:22:36+00'),

-- CL-0006: Billing
('Billing System — Stripe subscription and customer tables',
 'Historical Migration: Implemented billing schema for Stripe-based subscriptions. Created customers, subscriptions, and billing history tables with webhook processing support.',
 'feature','high','approved','historical-migration',true,false,
 '["supabase/migrations/20260629091944_create_billing_tables.sql"]'::jsonb,
 'Created: billing_customers, billing_subscriptions, billing_history.',
 'Stripe checkout, portal, and webhook edge functions established.',
 'Historical Migration — confidence: HIGH. Source: migration 20260629091944.',
 '2026-06-29 09:19:44+00','2026-06-29 09:19:44+00'),

-- CL-0007: Critical RLS + token security
('Critical Security Fix — Profiles RLS recursion resolved and separate assessment tokens',
 'Historical Migration: Fixed a critical RLS recursion bug on profiles causing infinite loops during auth. Introduced separate LLN and Digital tokens replacing the shared single token approach.',
 'security','critical','approved','historical-migration',false,false,
 '["supabase/migrations/20260629100049_fix_profiles_rls_recursion.sql","supabase/migrations/20260629104536_add_separate_assessment_tokens.sql"]'::jsonb,
 'Fixed profiles RLS recursion. Added lln_token and digital_token to assessment_invitations.',null,
 'Historical Migration — confidence: HIGH. Source: migrations 20260629100049 + 20260629104536. Critical security fix.',
 '2026-06-29 10:45:36+00','2026-06-29 10:45:36+00'),

-- CL-0008: Token RLS header extraction
('Security Fix — Token RLS header extraction for tokenised quiz portal',
 'Historical Migration: Fixed RLS policy to extract assessment tokens from request headers, enabling the student quiz portal to authenticate without a Supabase user session.',
 'security','high','approved','historical-migration',false,false,
 '["supabase/migrations/20260630001125_fix_token_rls_header_extraction.sql"]'::jsonb,
 'Updated RLS on assessment_responses and assessment_invitations to extract token from request headers.',null,
 'Historical Migration — confidence: HIGH. Source: migration 20260630001125.',
 '2026-06-30 00:11:25+00','2026-06-30 00:11:25+00'),

-- CL-0009: Admin OTP
('Admin OTP Two-Factor Authentication — Schema and edge functions',
 'Historical Migration: Implemented admin OTP 2FA. Created admin_otp_codes table. Added send-admin-otp / verify-admin-otp edge functions. Added per-user OTP disable flag.',
 'security','high','approved','historical-migration',true,false,
 '["supabase/migrations/20260630030750_create_admin_otp_codes.sql","supabase/migrations/20260701092324_add_otp_disabled_flag.sql"]'::jsonb,
 'Created: admin_otp_codes. Added otp_disabled column to profiles.',
 'Edge functions: send-admin-otp, verify-admin-otp deployed.',
 'Historical Migration — confidence: HIGH. Source: migrations 20260630030750 + 20260701092324.',
 '2026-06-30 03:07:50+00','2026-06-30 03:07:50+00'),

-- CL-0010: Qualification Mapping Engine
('Qualification Mapping Engine — ACSF library, UoC analysis, TGA integration',
 'Historical Migration: Built the ACSF qualification mapping library. Created qualification_mappings, uoc_acsf_requirements, and UoC library with 52+ new units of competency. Mapping engine auto-computes ACSF requirements from TGA unit data via LLM.',
 'feature','high','approved','historical-migration',true,false,
 '["supabase/migrations/20260630094605_add_qualification_mapping_system.sql","supabase/migrations/20260630101033_add_uoc_acsf_mapping_engine.sql","supabase/migrations/20260630103119_enhance_uoc_acsf_library_schema_v2.sql","supabase/migrations/20260630103310_seed_uoc_acsf_library_52_new_units.sql"]'::jsonb,
 'Created: qualification_mappings, uoc_acsf_requirements, uoc_library. Seeded 52 UoC entries.',
 'Edge functions: compute-acsf-mapping, fetch-tga-unit deployed. TGA API integrated.',
 'Historical Migration — confidence: HIGH. Source: migrations 20260630094605–20260630103310.',
 '2026-06-30 10:33:10+00','2026-06-30 10:33:10+00'),

-- CL-0011: Qualification library expansion
('Qualification Mapping Library Expansion — 45 additional qualifications backfilled',
 'Historical Migration: Expanded qualification mapping library with 45 additional qualifications. Backfilled ACSF requirements for all existing qualifications.',
 'feature','low','approved','historical-migration',true,false,
 '["supabase/migrations/20260701013323_expand_qualification_mapping_library.sql","supabase/migrations/20260701013347_backfill_acsf_requirements_from_library.sql"]'::jsonb,
 'Seeded 45 additional qualifications. Backfill migration run against existing records.',null,
 'Historical Migration — confidence: HIGH. Source: migrations 20260701013323 + 20260701013347.',
 '2026-07-01 01:33:47+00','2026-07-01 01:33:47+00'),

-- CL-0012: Assessment declaration
('Assessment Declaration Screen — Candidate declaration flow before quiz',
 'Historical Migration: Added assessment declaration screen with database-backed declaration records. Candidates must accept terms before accessing assessment. Declaration event triggers aXcelerate writeback.',
 'feature','medium','approved','historical-migration',true,false,
 '["supabase/migrations/20260701023825_add_assessment_declaration_tables.sql"]'::jsonb,
 'Created: assessment_declarations table. Added declaration_accepted to responses.',null,
 'Historical Migration — confidence: HIGH. Source: migration 20260701023825.',
 '2026-07-01 02:38:25+00','2026-07-01 02:38:25+00'),

-- CL-0013: ECC Phase 1 launch
('Engineering Control Centre — Phase 1 Foundation launched',
 'Historical Migration: Created the Engineering Control Centre (ECC) — the core engineering operating system. Phase 1 tables: ecc_production_readiness, ecc_backlog_items, ecc_milestones, ecc_releases, ecc_risks, ecc_decisions, ecc_documentation, ecc_project_vision.',
 'feature','medium','approved','historical-migration',true,false,
 '["supabase/migrations/20260701044421_create_builder_hub_features.sql","supabase/migrations/20260701045318_add_builder_hub_columns_and_seed_features.sql","supabase/migrations/20260701090800_add_builder_settings_vision_card.sql"]'::jsonb,
 'Created: ecc_production_readiness, ecc_backlog_items, ecc_milestones, ecc_releases, ecc_risks, ecc_decisions, ecc_documentation, ecc_project_vision.',null,
 'Historical Migration — confidence: HIGH. Source: migrations 20260701044421–20260701090800. ECC foundation established.',
 '2026-07-01 09:08:00+00','2026-07-01 09:08:00+00'),

-- CL-0014: DB-driven assessments
('Database-Driven Assessment Engine — Dynamic question delivery replacing static files',
 'Historical Migration: Migrated from static TypeScript question arrays to fully database-driven assessment engine. Questions, options, and scoring logic all moved to Supabase. Enables runtime content updates without deployments.',
 'refactor','high','approved','historical-migration',true,false,
 '["supabase/migrations/20260701094835_seed_db_driven_assessments.sql"]'::jsonb,
 'Seeded: assessment_questions, assessment_options for LLN (75 questions) and Digital (21 questions).',null,
 'Historical Migration — confidence: HIGH. Source: migration 20260701094835. Major architecture improvement.',
 '2026-07-01 09:48:35+00','2026-07-01 09:48:35+00'),

-- CL-0015: Audit trail extension
('Audit Trail Extension — Granular action logging schema',
 'Historical Migration: Extended the audit trail schema to capture granular platform actions. Added category, action_type, entity_type, entity_id, and metadata jsonb fields for compliance reporting.',
 'infrastructure','low','approved','historical-migration',true,false,
 '["supabase/migrations/20260701101115_extend_audit_trail_schema.sql"]'::jsonb,
 'Extended audit_trail with: category, action_type, entity_type, entity_id, metadata jsonb.',null,
 'Historical Migration — confidence: HIGH. Source: migration 20260701101115.',
 '2026-07-01 10:11:15+00','2026-07-01 10:11:15+00'),

-- CL-0016: Email queue
('Email Queue System — Reliable async delivery via Resend',
 'Historical Migration: Implemented durable email queue with at-least-once delivery. Created email_queue table with retry logic, status tracking, and failure handling.',
 'infrastructure','medium','approved','historical-migration',true,false,
 '["supabase/migrations/20260701102751_create_email_queue_system.sql"]'::jsonb,
 'Created: email_queue (status, retry_count, next_retry_at).',
 'Edge function: process-email-queue. Resend API integration.',
 'Historical Migration — confidence: HIGH. Source: migration 20260701102751.',
 '2026-07-01 10:27:51+00','2026-07-01 10:27:51+00'),

-- CL-0017: aXcelerate writeback queue
('aXcelerate Writeback Queue — Async CRM integration with retry logic',
 'Historical Migration: Created aXcelerate writeback queue for async CRM updates. Assessment results, declaration events, and completions queued and processed by process-axcelerate-queue.',
 'infrastructure','high','approved','historical-migration',true,false,
 '["supabase/migrations/20260701103921_create_axcelerate_writeback_queue.sql"]'::jsonb,
 'Created: axcelerate_writeback_queue (event_type, payload jsonb, retry_count, status).',
 'Edge functions: process-axcelerate-queue, axcelerate-sync, upload-axcelerate-portfolio.',
 'Historical Migration — confidence: HIGH. Source: migration 20260701103921.',
 '2026-07-01 10:39:21+00','2026-07-01 10:39:21+00'),

-- CL-0018: pg_cron + scheduled sweeps
('Scheduled Queue Sweeps — pg_cron automation for email and aXcelerate queues',
 'Historical Migration: Enabled pg_cron extension and scheduled automatic queue processing. Email queue: every 2 minutes. aXcelerate queue: every minute. Added cron secret for secure invocation.',
 'infrastructure','medium','approved','historical-migration',false,false,
 '["supabase/migrations/20260701200735_enable_pg_cron_and_schedule_queue_sweeps.sql","supabase/migrations/20260701201005_fix_pg_cron_queue_sweeps_with_cron_secret.sql"]'::jsonb,
 'Enabled pg_cron. Scheduled process-email-queue (*/2) and process-axcelerate-queue (every min).',
 'pg_cron jobs created for both queue sweeps.',
 'Historical Migration — confidence: HIGH. Source: migrations 20260701200735 + 20260701201005.',
 '2026-07-01 20:10:05+00','2026-07-01 20:10:05+00'),

-- CL-0019: aXcelerate inbound sync
('aXcelerate Inbound Sync — Candidate data ingestion from CRM with bulk sync',
 'Historical Migration: Built inbound sync system to pull candidate and enrolment data from aXcelerate. Created inbound_sync_log and portfolio tables. Bulk sync edge function scheduled per-minute.',
 'feature','high','approved','historical-migration',true,false,
 '["supabase/migrations/20260702002159_add_inbound_sync_and_portfolio_tables.sql","supabase/migrations/20260702022937_add_inbound_sync_log_delete_policy.sql","supabase/migrations/20260702041342_schedule_axcelerate_bulk_sync.sql","supabase/migrations/20260702041552_change_bulk_sync_to_per_minute.sql"]'::jsonb,
 'Created: axcelerate_inbound_sync_log, candidate_portfolios. Added delete RLS policy.',
 'Edge functions: axcelerate-bulk-sync, axcelerate-inbound-sync. pg_cron scheduled.',
 'Historical Migration — confidence: HIGH. Source: migrations 20260702002159–20260702041552.',
 '2026-07-02 04:15:52+00','2026-07-02 04:15:52+00'),

-- CL-0020: Student lifecycle state machine
('Student Lifecycle State Machine — Formal lifecycle with transition audit',
 'Historical Migration: Implemented formal state machine for student assessment lifecycle: pending → invited → started → completed → results_sent → archived. Added lifecycle transition audit logging and DB-level validation triggers.',
 'feature','high','approved','historical-migration',true,false,
 '["supabase/migrations/20260702212756_20260702060000_student_lifecycle_state_machine.sql"]'::jsonb,
 'Added lifecycle_state column and lifecycle_transitions table with state transition validation.',null,
 'Historical Migration — confidence: HIGH. Source: migration 20260702212756.',
 '2026-07-02 21:27:56+00','2026-07-02 21:27:56+00'),

-- CL-0021: Quiz writeback + audit RLS fixes
('Quiz Started Writeback Events and Audit RLS Fixes',
 'Historical Migration: Added quiz_started writeback events to aXcelerate queue. Fixed audit trail and lifecycle RLS policies to use get_my_role() for performance. Fixed assessment responses RLS token parsing. Extended quiz audit policy to include declaration events.',
 'bugfix','medium','approved','historical-migration',false,false,
 '["supabase/migrations/20260703023439_add_quiz_started_writeback_events.sql","supabase/migrations/20260703030934_fix_axcelerate_queue_cron_frequency.sql","supabase/migrations/20260703072636_fix_audit_trail_and_lifecycle_rls_use_get_my_role.sql","supabase/migrations/20260703084327_allow_quiz_token_insert_abandonment_audit.sql","supabase/migrations/20260703084949_extend_quiz_audit_policy_include_declaration_events.sql","supabase/migrations/20260704005324_fix_assessment_responses_rls_token_parsing.sql"]'::jsonb,
 'Added quiz_started event. Fixed RLS on audit_trail, lifecycle_transitions, assessment_responses.',null,
 'Historical Migration — confidence: HIGH. Source: migrations 20260703023439–20260704005324.',
 '2026-07-03 08:49:49+00','2026-07-03 08:49:49+00'),

-- CL-0022: ACSF evidence module
('ACSF Mapping Evidence Module — Evidence submission and 75-indicator library',
 'Historical Migration: Created the ACSF mapping evidence module. Candidates and assessors submit evidence against ACSF indicators. acsf_evidence_submissions and acsf_indicator_library (75 indicators) created.',
 'feature','medium','approved','historical-migration',true,false,
 '["supabase/migrations/20260703082242_create_acsf_mapping_evidence_module.sql"]'::jsonb,
 'Created: acsf_evidence_submissions, acsf_indicator_library (75 indicators seeded).',null,
 'Historical Migration — confidence: HIGH. Source: migration 20260703082242.',
 '2026-07-03 08:22:42+00','2026-07-03 08:22:42+00'),

-- CL-0023: EAEE analysis
('EAEE Indicator Library and Analysis Engine — ACSF-linked assessment evidence',
 'Historical Migration: Created EAEE indicator library and analysis tables. Generates evidence summaries linked to ACSF levels from assessment responses.',
 'feature','medium','approved','historical-migration',true,false,
 '["supabase/migrations/20260703092616_create_eaee_indicator_library_and_analysis_tables.sql"]'::jsonb,
 'Created: eaee_indicators, eaee_analysis_results.',null,
 'Historical Migration — confidence: HIGH. Source: migration 20260703092616.',
 '2026-07-03 09:26:16+00','2026-07-03 09:26:16+00'),

-- CL-0024: Performance indexes + queue recovery
('Performance — 10 Missing Indexes (BL10) and Queue Backoff/Recovery (BL02, BL03)',
 'Historical Migration: Added 10 missing database indexes (BL10). Implemented exponential backoff and stuck-record recovery for queue processors (BL02, BL03). Significantly reduces DB load and prevents stuck queue items.',
 'performance','medium','approved','historical-migration',false,false,
 '["supabase/migrations/20260703234230_add_missing_indexes_bl10.sql","supabase/migrations/20260703234250_queue_backoff_and_stuck_recovery_bl02_bl03.sql"]'::jsonb,
 'Added 10 indexes on assessment_invitations, axcelerate_writeback_queue, email_queue. Added backoff logic.',null,
 'Historical Migration — confidence: HIGH. Source: migrations 20260703234230 + 20260703234250. BL10+BL02+BL03.',
 '2026-07-03 23:42:50+00','2026-07-03 23:42:50+00'),

-- CL-0025: ECC Phase 2 expansion
('ECC Phase 2 — Release Candidates, ADR, Journal, Documentation, Workflow',
 'Historical Migration: Major ECC expansion. Added: ecc_release_candidates, expanded sections with phases, decision log, relational columns, ADR/journal/documentation support, and workflow automation. ECC transformed into a full engineering operating system.',
 'feature','medium','approved','historical-migration',true,false,
 '["supabase/migrations/20260704021222_add_ecc_release_candidates.sql","supabase/migrations/20260704022552_ecc_phase1_5_expand_sections.sql","supabase/migrations/20260704023525_add_ecc_decisions_linked_arrays.sql","supabase/migrations/20260704025135_ecc_phase2_relational_columns.sql","supabase/migrations/20260704030816_ecc_phase3_adr_journal_docs_columns.sql","supabase/migrations/20260704043742_ecc_phase25_workflow_automation.sql"]'::jsonb,
 'Created: ecc_release_candidates. Extended: ecc_decisions, ecc_documentation, ecc_backlog_items. Added ADR and workflow tables.',null,
 'Historical Migration — confidence: HIGH. Source: migrations 20260704021222–20260704043742.',
 '2026-07-04 04:37:42+00','2026-07-04 04:37:42+00'),

-- CL-0026: Engineering Standards
('ECC Engineering Standards Module — 71 platform standards across 14 categories',
 'Historical Migration: Created Engineering Standards module with 71 standards across 14 categories: Architecture, Testing, Security, Performance, Database, API, Documentation, Release Management, AI Integration, ECC Platform, Accessibility, Deployment, Compliance, Monitoring.',
 'infrastructure','low','approved','historical-migration',true,false,
 '["supabase/migrations/20260704082107_20260704060000_create_engineering_standards_module.sql","supabase/migrations/20260704082234_20260704061000_seed_engineering_standards_v1.sql"]'::jsonb,
 'Created: ecc_engineering_standards. Seeded 71 standards across 14 categories.',null,
 'Historical Migration — confidence: HIGH. Source: migrations 20260704082107 + 20260704082234.',
 '2026-07-04 08:22:34+00','2026-07-04 08:22:34+00'),

-- CL-0027: RC lifecycle + phase terminology
('RC Lifecycle Standardisation — Checklist, phase terminology, and release types',
 'Historical Migration: Standardised RC lifecycle with formal checklist. Migrated batch → phase terminology. Fixed RC-001 checklist state. Linked Phase 1 backlog to RC-001. Added release_type and archived_at columns.',
 'workflow','low','approved','historical-migration',true,false,
 '["supabase/migrations/20260704090225_fix_verified_rc_checklist_state.sql","supabase/migrations/20260704091703_migrate_rc_batch_names_to_phase_terminology.sql","supabase/migrations/20260704092853_link_phase1_foundation_backlog_items_to_rc001.sql","supabase/migrations/20260704094830_add_release_type_to_ecc_release_candidates.sql","supabase/migrations/20260704102006_rename_batch_columns_to_phase_terminology.sql","supabase/migrations/20260704102431_migrate_project_compass_current_batch_to_current_phase.sql"]'::jsonb,
 'Updated: ecc_release_candidates (phase terminology, release_type, archived_at). Linked backlog to RC-001.',null,
 'Historical Migration — confidence: HIGH. Source: migrations 20260704090225–20260704102431.',
 '2026-07-04 10:24:31+00','2026-07-04 10:24:31+00'),

-- CL-0028: Documentation standardisation
('ECC Documentation Standardisation — Consistent title format across all docs',
 'Historical Migration: Standardised all ECC documentation titles to consistent format. Two-phase standardisation across different documentation categories.',
 'documentation','low','approved','historical-migration',true,false,
 '["supabase/migrations/20260704103046_standardise_documentation_titles_consistent_format.sql","supabase/migrations/20260704110552_standardise_doc_title_phase3.sql"]'::jsonb,
 'Updated: ecc_documentation titles across all categories.',null,
 'Historical Migration — confidence: HIGH. Source: migrations 20260704103046 + 20260704110552.',
 '2026-07-04 11:05:52+00','2026-07-04 11:05:52+00'),

-- CL-0029: Product architecture hierarchy + ADR-001
('ECC Product Architecture Hierarchy — Product / Feature registry and ADR-001',
 'Historical Migration: Established formal product architecture hierarchy. Created product/feature/component layers. ADR-001 (Core Architecture Decision Record) created as canonical architecture reference.',
 'infrastructure','medium','approved','historical-migration',true,false,
 '["supabase/migrations/20260704104205_ecc_final_arch_product_hierarchy_tables.sql","supabase/migrations/20260704104252_ecc_final_arch_seed_product_hierarchy.sql","supabase/migrations/20260704104311_ecc_create_adr_001_core_architecture.sql","supabase/migrations/20260704110334_restore_ecc_product_hierarchy_tables.sql","supabase/migrations/20260704110400_restore_ecc_product_hierarchy_seed.sql","supabase/migrations/20260704110422_restore_adr_001_and_fix_rc003_doc_title.sql"]'::jsonb,
 'Created: product hierarchy tables. Seeded product structure. Created ADR-001.',null,
 'Historical Migration — confidence: HIGH. Source: migrations 20260704104205–20260704110422.',
 '2026-07-04 11:04:22+00','2026-07-04 11:04:22+00'),

-- CL-0030: Feature registry 86 features
('ECC Product Feature Registry — 86 features catalogued across 9 categories',
 'Historical Migration: Created definitive product feature registry (FEAT-001–FEAT-086) across 9 categories. All features include lifecycle stage, testing status, documentation status, and maturity flags. Initial product audit report seeded.',
 'documentation','low','approved','historical-migration',true,false,
 '["supabase/migrations/20260704153056_create_ecc_product_feature_registry.sql","supabase/migrations/20260704153136_seed_features_01_authentication.sql","supabase/migrations/20260704153223_seed_features_02_assessment_engine.sql","supabase/migrations/20260704153307_seed_features_03_qualification_acsf.sql","supabase/migrations/20260704153352_seed_features_04_candidates_support.sql","supabase/migrations/20260704153428_seed_features_05_axcelerate.sql","supabase/migrations/20260704153512_seed_features_06_email_billing_compliance.sql","supabase/migrations/20260704153552_seed_features_07_admin_marketing.sql","supabase/migrations/20260704153658_seed_features_08_ecc_infrastructure.sql","supabase/migrations/20260704153727_seed_product_audit_report_initial.sql"]'::jsonb,
 'Created: ecc_product_features (86 records). Initial product audit report seeded.',null,
 'Historical Migration — confidence: HIGH. Source: migrations 20260704153056–20260704153727. 86 features catalogued.',
 '2026-07-04 15:37:27+00','2026-07-04 15:37:27+00'),

-- CL-0031: Feature maturity extension
('Feature Registry Maturity Extension — Lifecycle flags, relationships, timeline',
 'Historical Migration: Extended feature registry with operational data: operational_risk, regression_required, compliance_critical, audit_critical, audit_flags. Created feature_relationships and feature_timeline tables. Backfilled all 86 features.',
 'feature','low','approved','historical-migration',true,false,
 '["supabase/migrations/20260704155028_extend_product_features_maturity_v2.sql","supabase/migrations/20260704155049_create_feature_relationships_timeline_tests_versions.sql","supabase/migrations/20260704155121_backfill_features_lifecycle_business_flags.sql","supabase/migrations/20260704155234_backfill_features_implementation_evidence.sql","supabase/migrations/20260704155317_seed_feature_relationships_and_timeline.sql"]'::jsonb,
 'Extended ecc_product_features. Created: feature_relationships, feature_timeline. Backfilled 86 features.',null,
 'Historical Migration — confidence: HIGH. Source: migrations 20260704155028–20260704155317.',
 '2026-07-04 15:53:17+00','2026-07-04 15:53:17+00'),

-- CL-0032: AI Technical Director + Goals/Epics
('AI Technical Director and Goals/Epics — Command Centre AI integration',
 'Historical Migration: Integrated AI Technical Director into ECC. Created AI journal, usage logging, and Goals & Epics hierarchy. Technical Director provides advisory analysis on platform health.',
 'feature','medium','approved','historical-migration',true,false,
 '["supabase/migrations/20260704200544_20260704200000_create_command_centre_ai_tables.sql","supabase/migrations/20260704203658_20260704210000_command_centre_goals_epics_hierarchy.sql"]'::jsonb,
 'Created: ai_journal_sessions, ai_usage_log, ecc_goals, ecc_epics.',
 'Edge functions: command-centre-ai, technical-director deployed.',
 'Historical Migration — confidence: HIGH. Source: migrations 20260704200544 + 20260704203658.',
 '2026-07-04 20:36:58+00','2026-07-04 20:36:58+00'),

-- CL-0033: AI Provider Centralisation
('AI Provider Centralised Configuration — Multi-provider registry with health checks',
 'Historical Migration: Centralised AI provider config into a dedicated registry supporting Anthropic Claude, OpenAI, Gemini, Grok. Added provider health checks, model registry, and test result tables. Unified all edge functions to use shared AI service module.',
 'infrastructure','high','approved','historical-migration',true,false,
 '["supabase/migrations/20260705000718_20260705_ai_provider_centralised_config.sql","supabase/migrations/20260705035818_add_api_key_to_ai_provider_configs.sql","supabase/migrations/20260705041054_create_ai_provider_models_and_test_results.sql","supabase/migrations/20260705041914_create_ai_platform_tables.sql"]'::jsonb,
 'Created: ai_provider_configs, ai_provider_models, ai_provider_test_results, ai_platform_sessions.',
 'Edge functions: test-ai-provider-connection, save-provider-key, ai-health-check deployed.',
 'Historical Migration — confidence: HIGH. Source: migrations 20260705000718–20260705041914.',
 '2026-07-05 04:19:14+00','2026-07-05 04:19:14+00'),

-- CL-0034: Dev Programme + ECC phases
('ECC Dev Programme — 14-phase engineering roadmap with stage tracking',
 'Historical Migration: Created Dev Programme module with 14-phase roadmap. Phases 1–8 complete, Phase 9 in-progress. Engineering stages, milestones, and feature linkages established.',
 'infrastructure','low','approved','historical-migration',true,false,
 '["supabase/migrations/20260705001600_20260705_create_ecc_dev_phases.sql","supabase/migrations/20260705033205_rc_003_engineering_excellence_schema.sql","supabase/migrations/20260705033733_rc_003_eos_engineering_stages.sql"]'::jsonb,
 'Created: ecc_dev_phases (14 phases), ecc_engineering_stages, RC-003 engineering excellence schema.',null,
 'Historical Migration — confidence: HIGH. Source: migrations 20260705001600 + 20260705033205 + 20260705033733.',
 '2026-07-05 03:37:33+00','2026-07-05 03:37:33+00'),

-- CL-0035: Feature docs + product review workflow
('Feature Documentation System and Product Review Workflow',
 'Historical Migration: Added feature documentation system with doc_type and doc_category. Implemented product review workflow with queue, approval states, and PO acceptance tracking.',
 'workflow','low','approved','historical-migration',true,false,
 '["supabase/migrations/20260705002742_20260705_ecc_feature_documentation.sql","supabase/migrations/20260705004816_20260705_ecc_product_review_workflow.sql"]'::jsonb,
 'Created: ecc_feature_documentation, ecc_feature_review_history. Added product_review_status to features.',null,
 'Historical Migration — confidence: HIGH. Source: migrations 20260705002742 + 20260705004816.',
 '2026-07-05 00:48:16+00','2026-07-05 00:48:16+00'),

-- CL-0036: Testing framework
('Testing Framework — Defect tracking, environments, and checklist templates',
 'Historical Migration: Extended testing framework with defect tracking, environment management, and checklist templates. Comprehensive QA register linked to release candidates.',
 'infrastructure','low','approved','historical-migration',true,false,
 '["supabase/migrations/20260705043908_20260705_rc003_testing_defects_and_environment.sql","supabase/migrations/20260705044018_20260705_rc003_checklist_template_and_register.sql","supabase/migrations/20260705083130_20260705_testing_framework_extension.sql"]'::jsonb,
 'Created: ecc_defects, ecc_environments, ecc_checklist_templates, ecc_testing_register.',null,
 'Historical Migration — confidence: HIGH. Source: migrations 20260705043908–20260705083130.',
 '2026-07-05 08:31:30+00','2026-07-05 08:31:30+00'),

-- CL-0037: Platform Audit System + AUD-001 + AUD-002
('Platform Audit System — AUD-001 and AUD-002 baseline audits established',
 'Historical Migration: Created platform audit system with AI-powered generation. AUD-001 (Initial Platform Baseline) and AUD-002 (Engineering OS Baseline) seeded as approved audits. Covers: 17 category scores, F-001 to F-012 findings, REC-001 to REC-008 recommendations.',
 'infrastructure','medium','approved','historical-migration',true,false,
 '["supabase/migrations/20260705010335_20260705_ecc_platform_audit_system.sql","supabase/migrations/20260705020301_20260705_ecc_audit_add_count_columns.sql","supabase/migrations/20260705023732_engineering_audit_system_phase_x.sql","supabase/migrations/20260705025213_aud_001_initial_platform_baseline.sql","supabase/migrations/20260705025335_aud_001_engineering_timeline_and_risks.sql","supabase/migrations/20260705031047_aud_002_engineering_os_baseline_audit.sql"]'::jsonb,
 'Created: ecc_audits, ecc_audit_scores, ecc_audit_findings, ecc_audit_recommendations, ecc_engineering_register, ecc_health_history. Seeded AUD-001 and AUD-002.',
 'Edge function: generate-platform-audit deployed.',
 'Historical Migration — confidence: HIGH. Source: migrations 20260705010335–20260705031047.',
 '2026-07-05 03:10:47+00','2026-07-05 03:10:47+00'),

-- CL-0038: Engineering Guardian v1
('Engineering Guardian v1 — AI-powered engineering governance system launched',
 'Historical Migration: Launched Engineering Guardian — permanent governance system reviewing 6 categories: Architecture, Engineering, Layout, Performance, Security, Compliance. Generates health scores, findings, and grouped recommendations. Release gate configuration with 6 rules seeded.',
 'feature','medium','approved','historical-migration',true,false,
 '["supabase/migrations/20260705081448_20260705_create_architecture_guardian_reviews.sql","supabase/migrations/20260705085156_20260705_guardian_layout_violations.sql","supabase/migrations/20260705090511_20260705_engineering_guardian_expand.sql"]'::jsonb,
 'Created: architecture_guardian_reviews, engineering_guardian_release_gates (6 rules). Added: layout_violations, findings, 5 engineering score columns, trigger_source.',
 'Edge function: architecture-guardian deployed.',
 'Historical Migration — confidence: HIGH. Source: migrations 20260705081448–20260705090511.',
 '2026-07-05 09:05:11+00','2026-07-05 09:05:11+00'),

-- CL-0039: Batch A - credentials fix
('Batch A — aXcelerate credential resolution fix (BL-SECRET-01)',
 'Historical Migration: Fixed production bug (BL-SECRET-01) where aXcelerate tokens stored in settings table were not read by queue edge functions. Functions used only Deno.env.get(), causing silent production failures. Added settings DB fallback to 3 edge functions.',
 'bugfix','high','approved','historical-migration',true,false,
 '["supabase/functions/process-axcelerate-queue/index.ts","supabase/functions/axcelerate-sync/index.ts","supabase/functions/upload-axcelerate-portfolio/index.ts"]'::jsonb,
 'No schema changes.',
 'Edge functions: process-axcelerate-queue, axcelerate-sync, upload-axcelerate-portfolio redeployed with DB fallback.',
 'Historical Migration — confidence: HIGH. Source: docs/implementation-history/batch-a-complete.md. Completed 2026-07-04.',
 '2026-07-04 00:00:00+00','2026-07-04 00:00:00+00'),

-- CL-0040: Engineering Change Log
('Engineering Change Log — SSOT permanent history table created',
 'Historical Migration: Created Engineering Change Log as the permanent Single Source of Truth for all engineering history. Includes change_id (CL-XXXX), type, feature/release/phase linkage, guardian review linkage, and engineering health delta.',
 'infrastructure','low','approved','historical-migration',true,true,
 '["supabase/migrations/20260705091809_20260705_engineering_change_log.sql","src/pages/ecc/ECCChangeLogPage.tsx","src/pages/EngineeringControlCentrePage.tsx"]'::jsonb,
 'Created: ecc_engineering_change_log with CL-XXXX sequence. RLS enabled.',null,
 'Historical Migration — confidence: HIGH. Source: migration 20260705091809 + current session.',
 '2026-07-05 09:18:09+00','2026-07-05 09:18:09+00'),

-- CL-0041: Mission Control engineering health widget
('Mission Control Engineering Health Widget — Live guardian health on dashboard',
 'Added Engineering Health widget (Section 12) to Mission Control. Displays health score, score breakdown bars, open issue counts, and link to Engineering Guardian.',
 'feature','low','approved','historical-migration',false,true,
 '["src/pages/ecc/ECCMissionControlPage.tsx"]'::jsonb,
 'No schema changes. GuardianHealth interface + guardianHealth fetch added. Section 12 widget rendered.',null,
 'Historical Migration — confidence: HIGH. Source: current session implementation.',
 '2026-07-05 09:35:00+00','2026-07-05 09:35:00+00'),

-- CL-0042: Product Audit Guardian summary bar
('Product Audit Guardian Summary Bar — Engineering health inline on Feature Health',
 'Added GuardianSummaryWidget to Product Audit / Feature Health page. Compact bar shows health score, status badge, key scores, and open issue counts.',
 'feature','low','approved','historical-migration',false,true,
 '["src/pages/ecc/ECCProductAuditPage.tsx"]'::jsonb,
 'No schema changes. GuardianSummaryWidget component added, rendered below MetricsDashboard.',null,
 'Historical Migration — confidence: HIGH. Source: current session implementation.',
 '2026-07-05 09:40:00+00','2026-07-05 09:40:00+00'),

-- CL-0043: Engineering Guardian v2 - SSOT + Reuse Before Build
('Engineering Guardian v2 — SSOT Enforcement and Reuse Before Build governance',
 'Updated Engineering Guardian system prompt with SSOT Enforcement (every artefact must have one canonical location) and Reuse Before Build (exhaustive checklist before approving any new artefact). Both produce high/critical architecture findings. Edge function redeployed.',
 'feature','low','approved','historical-migration',true,true,
 '["supabase/functions/architecture-guardian/index.ts"]'::jsonb,
 'No schema changes. System prompt expanded.',
 'Edge function: architecture-guardian redeployed with SSOT + Reuse Before Build rules.',
 'Historical Migration — confidence: HIGH. Source: current session implementation.',
 '2026-07-05 09:45:00+00','2026-07-05 09:45:00+00'),

-- CL-0044: Historical migration itself
('Historical Engineering Migration — Complete platform history imported into Change Log',
 'Performed complete historical engineering migration. Imported 43 verified engineering change records spanning 2026-06-27 to 2026-07-05. Derived from: 80+ database migration files, Batch A implementation report, and current session changes. All records marked HISTORICAL_MIGRATION with HIGH confidence. Engineering Change Log is now the SSOT for complete platform engineering history.',
 'documentation','low','approved','historical-migration',true,true,
 '["supabase/migrations/20260705_historical_engineering_migration.sql"]'::jsonb,
 '44 change log records inserted. All historical migrations now represented in the Engineering Change Log.',null,
 'Historical Migration — confidence: HIGH. Self-referential migration record.',
 '2026-07-05 10:00:00+00','2026-07-05 10:00:00+00');
