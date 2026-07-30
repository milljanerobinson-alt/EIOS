/*
# Engineering Intelligence Graph — Initial Seed Data

## Summary
Seeds the EIG with a representative initial graph modelling the LLN+D platform's current
engineering state. This gives the AI Technical Director immediate access to a connected
knowledge base rather than starting from an empty graph.

## Seeded Entities

### Mission (1)
- LLN+D Platform Mission: enterprise digital assessment and compliance platform

### Releases (5)
- RC-001 Foundation Phase through RC-004 Engineering Excellence (current)
- EIG Infrastructure (RC-005, planned)

### Engineering Work Orders (10)
- EWO-001 Auth & Profiles through EWO-019 Engineering Intelligence Graph

### Platform Modules (10)
- Authentication & Identity, Assessment Engine, Qualification & ACSF Mapping,
  Axcelerate Integration, Email & Notification System, Billing & Payments,
  Engineering Command Centre, AI Technical Director, Student Portal,
  Platform Administration

### Database Tables (8)
- Key tables representing core platform data structures

### UI Pages (6)
- Key ECC pages

### Risks (4)
- Key platform risks

### Technical Debt (3)
- Known debt items

### Roadmap Items (3)
- Near-term future capabilities

## Seeded Relationships (~50)
Connects all entities into a meaningful graph representing:
- EWOs implementing platform modules
- Modules depending on other modules
- Releases introducing EWOs
- EWOs producing database tables
- Technical debt and risk linkages

## Notes
- All entities seeded as 'active' unless otherwise noted
- entity_ref values follow platform conventions (EWO-NNN, RC-NNN, etc.)
- Seed is idempotent: uses INSERT ... ON CONFLICT DO NOTHING via unique entity_refs
  (entities without entity_ref use name-based conflict detection in a DO block)
*/

DO $$
DECLARE
  -- Missions
  e_mission UUID;

  -- Releases
  e_rc001 UUID; e_rc002 UUID; e_rc003 UUID; e_rc004 UUID; e_rc005 UUID;

  -- EWOs
  e_ewo001 UUID; e_ewo008 UUID; e_ewo009 UUID; e_ewo010 UUID;
  e_ewo014 UUID; e_ewo015 UUID; e_ewo016 UUID; e_ewo017 UUID;
  e_ewo018 UUID; e_ewo019 UUID;

  -- Platform Modules
  e_mod_auth UUID; e_mod_assessment UUID; e_mod_acsf UUID;
  e_mod_axc UUID; e_mod_email UUID; e_mod_billing UUID;
  e_mod_ecc UUID; e_mod_atd UUID; e_mod_student UUID; e_mod_admin UUID;

  -- Database Tables
  e_tbl_profiles UUID; e_tbl_assessments UUID; e_tbl_responses UUID;
  e_tbl_qualifications UUID; e_tbl_atd_sessions UUID; e_tbl_ecc_reviews UUID;
  e_tbl_eig_entities UUID; e_tbl_axc_queue UUID;

  -- UI Pages
  e_page_ecc UUID; e_page_atd UUID; e_page_bench UUID;
  e_page_reviews UUID; e_page_audits UUID; e_page_eig UUID;

  -- Risks
  e_risk_axc UUID; e_risk_ai UUID; e_risk_nav UUID; e_risk_scale UUID;

  -- Technical Debt
  e_debt_large_files UUID; e_debt_eis_score UUID; e_debt_session_prop UUID;

  -- Roadmap
  e_road_qa_centre UUID; e_road_icon_sidebar UUID; e_road_multi_panel UUID;

BEGIN

  -- ─── Mission ────────────────────────────────────────────────────────────────

  INSERT INTO eig_entities (entity_type, entity_ref, name, description, status)
  VALUES ('mission', 'MISSION-001', 'LLN+D Platform Mission',
    'Deliver an enterprise-grade digital assessment and vocational training compliance platform for registered training organisations.',
    'active')
  ON CONFLICT DO NOTHING RETURNING id INTO e_mission;

  IF e_mission IS NULL THEN
    SELECT id INTO e_mission FROM eig_entities WHERE entity_ref = 'MISSION-001';
  END IF;

  -- ─── Releases ───────────────────────────────────────────────────────────────

  INSERT INTO eig_entities (entity_type, entity_ref, name, description, status) VALUES
    ('release', 'RC-001', 'RC-001 Foundation Phase',     'Core authentication, profiles, and assessment schema.', 'active'),
    ('release', 'RC-002', 'RC-002 Assessment Engine',    'Digital and LLN assessment flows, token auth, quiz engine.', 'active'),
    ('release', 'RC-003', 'RC-003 Engineering Excellence','ECC, AI Technical Director, benchmarking, and governance tooling.', 'active'),
    ('release', 'RC-004', 'RC-004 Intelligence Platform','EIP, PIS, ATD benchmarking v2, navigation UX, EIG foundation.', 'active'),
    ('release', 'RC-005', 'RC-005 Autonomous Engineering','Engineering Intelligence Graph, impact analysis, AI reasoning layer.', 'planned')
  ON CONFLICT DO NOTHING;

  SELECT id INTO e_rc001 FROM eig_entities WHERE entity_ref = 'RC-001';
  SELECT id INTO e_rc002 FROM eig_entities WHERE entity_ref = 'RC-002';
  SELECT id INTO e_rc003 FROM eig_entities WHERE entity_ref = 'RC-003';
  SELECT id INTO e_rc004 FROM eig_entities WHERE entity_ref = 'RC-004';
  SELECT id INTO e_rc005 FROM eig_entities WHERE entity_ref = 'RC-005';

  -- ─── EWOs ───────────────────────────────────────────────────────────────────

  INSERT INTO eig_entities (entity_type, entity_ref, name, description, status) VALUES
    ('ewo', 'EWO-001', 'EWO-001 Auth & Profile Foundation',     'Email/password auth, profile schema, RLS policies.', 'active'),
    ('ewo', 'EWO-008', 'EWO-008 Axcelerate Integration',        'Axcelerate API sync, writeback queue, bulk sync.', 'active'),
    ('ewo', 'EWO-009', 'EWO-009 Email Queue System',            'Transactional email queue with process-email-queue function.', 'active'),
    ('ewo', 'EWO-010', 'EWO-010 Engineering Command Centre v1', 'ECC scaffold, navigation, release candidate management.', 'active'),
    ('ewo', 'EWO-014', 'EWO-014 AI Technical Director v1',      'Command Centre AI, conversations, context packaging, health analysis.', 'active'),
    ('ewo', 'EWO-015', 'EWO-015 ATD Benchmarking Engine',       'Benchmark capture, sessions, runs, governance review panels.', 'active'),
    ('ewo', 'EWO-016', 'EWO-016 Engineering Intelligence',      'EIP, PIS, productivity/cost dashboard, ATD benchmark scoring.', 'active'),
    ('ewo', 'EWO-017', 'EWO-017 Resizable ATD Panel',           'ResizableSidebar component, localStorage persistence, keyboard a11y.', 'active'),
    ('ewo', 'EWO-018', 'EWO-018 Navigation UX Improvements',    'Collapsible nav groups, favourites, recents, config-driven structure.', 'active'),
    ('ewo', 'EWO-019', 'EWO-019 Engineering Intelligence Graph','EIG schema, graph explorer, impact analysis engine, ATD reasoning.', 'active')
  ON CONFLICT DO NOTHING;

  SELECT id INTO e_ewo001 FROM eig_entities WHERE entity_ref = 'EWO-001';
  SELECT id INTO e_ewo008 FROM eig_entities WHERE entity_ref = 'EWO-008';
  SELECT id INTO e_ewo009 FROM eig_entities WHERE entity_ref = 'EWO-009';
  SELECT id INTO e_ewo010 FROM eig_entities WHERE entity_ref = 'EWO-010';
  SELECT id INTO e_ewo014 FROM eig_entities WHERE entity_ref = 'EWO-014';
  SELECT id INTO e_ewo015 FROM eig_entities WHERE entity_ref = 'EWO-015';
  SELECT id INTO e_ewo016 FROM eig_entities WHERE entity_ref = 'EWO-016';
  SELECT id INTO e_ewo017 FROM eig_entities WHERE entity_ref = 'EWO-017';
  SELECT id INTO e_ewo018 FROM eig_entities WHERE entity_ref = 'EWO-018';
  SELECT id INTO e_ewo019 FROM eig_entities WHERE entity_ref = 'EWO-019';

  -- ─── Platform Modules ───────────────────────────────────────────────────────

  INSERT INTO eig_entities (entity_type, entity_ref, name, description, status) VALUES
    ('platform_module', 'MOD-AUTH',   'Authentication & Identity',     'Supabase email/password auth, OTP, admin roles, RLS policies.', 'active'),
    ('platform_module', 'MOD-ASSESS', 'Assessment Engine',             'Digital and LLN quiz engine, token-auth flow, submission processing.', 'active'),
    ('platform_module', 'MOD-ACSF',   'Qualification & ACSF Mapping',  'Unit of competency library, ACSF requirements, evidence mapping.', 'active'),
    ('platform_module', 'MOD-AXC',    'Axcelerate Integration',        'Bidirectional sync, writeback queue, inbound contact webhook.', 'active'),
    ('platform_module', 'MOD-EMAIL',  'Email & Notification System',   'Email queue, Sendgrid/SMTP edge function, transactional delivery.', 'active'),
    ('platform_module', 'MOD-BILL',   'Billing & Payments',            'Stripe checkout, subscription management, webhook processing.', 'active'),
    ('platform_module', 'MOD-ECC',    'Engineering Command Centre',    'Multi-module engineering workspace, config-driven navigation, EOS.', 'active'),
    ('platform_module', 'MOD-ATD',    'AI Technical Director',         'Conversational AI workspace, prompt library, health analysis, briefings.', 'active'),
    ('platform_module', 'MOD-STUD',   'Student Portal',                'Assessment entry, quiz delivery, results, declaration screens.', 'active'),
    ('platform_module', 'MOD-ADMIN',  'Platform Administration',       'Settings, integrations, feature flags, system logs, audit settings.', 'active')
  ON CONFLICT DO NOTHING;

  SELECT id INTO e_mod_auth    FROM eig_entities WHERE entity_ref = 'MOD-AUTH';
  SELECT id INTO e_mod_assessment FROM eig_entities WHERE entity_ref = 'MOD-ASSESS';
  SELECT id INTO e_mod_acsf    FROM eig_entities WHERE entity_ref = 'MOD-ACSF';
  SELECT id INTO e_mod_axc     FROM eig_entities WHERE entity_ref = 'MOD-AXC';
  SELECT id INTO e_mod_email   FROM eig_entities WHERE entity_ref = 'MOD-EMAIL';
  SELECT id INTO e_mod_billing FROM eig_entities WHERE entity_ref = 'MOD-BILL';
  SELECT id INTO e_mod_ecc     FROM eig_entities WHERE entity_ref = 'MOD-ECC';
  SELECT id INTO e_mod_atd     FROM eig_entities WHERE entity_ref = 'MOD-ATD';
  SELECT id INTO e_mod_student FROM eig_entities WHERE entity_ref = 'MOD-STUD';
  SELECT id INTO e_mod_admin   FROM eig_entities WHERE entity_ref = 'MOD-ADMIN';

  -- ─── Database Tables ────────────────────────────────────────────────────────

  INSERT INTO eig_entities (entity_type, entity_ref, name, description, status) VALUES
    ('database_table', 'TBL-PROFILES',        'profiles',                  'User profiles, roles, and settings.', 'active'),
    ('database_table', 'TBL-ASSESSMENTS',     'assessments',               'Assessment records, types, and configuration.', 'active'),
    ('database_table', 'TBL-RESPONSES',       'assessment_responses',      'Candidate quiz responses and scores.', 'active'),
    ('database_table', 'TBL-QUALS',           'qualifications',             'Qualification and unit-of-competency records.', 'active'),
    ('database_table', 'TBL-ATD-SESSIONS',    'atd_benchmark_sessions',    'ATD benchmark session governance records.', 'active'),
    ('database_table', 'TBL-ECC-REVIEWS',     'ecc_engineering_reviews',   'Formal engineering review records.', 'active'),
    ('database_table', 'TBL-EIG',             'eig_entities',              'Engineering Intelligence Graph entity nodes.', 'active'),
    ('database_table', 'TBL-AXC-QUEUE',       'axcelerate_writeback_queue','Axcelerate API writeback job queue.', 'active')
  ON CONFLICT DO NOTHING;

  SELECT id INTO e_tbl_profiles     FROM eig_entities WHERE entity_ref = 'TBL-PROFILES';
  SELECT id INTO e_tbl_assessments  FROM eig_entities WHERE entity_ref = 'TBL-ASSESSMENTS';
  SELECT id INTO e_tbl_responses    FROM eig_entities WHERE entity_ref = 'TBL-RESPONSES';
  SELECT id INTO e_tbl_qualifications FROM eig_entities WHERE entity_ref = 'TBL-QUALS';
  SELECT id INTO e_tbl_atd_sessions FROM eig_entities WHERE entity_ref = 'TBL-ATD-SESSIONS';
  SELECT id INTO e_tbl_ecc_reviews  FROM eig_entities WHERE entity_ref = 'TBL-ECC-REVIEWS';
  SELECT id INTO e_tbl_eig_entities FROM eig_entities WHERE entity_ref = 'TBL-EIG';
  SELECT id INTO e_tbl_axc_queue    FROM eig_entities WHERE entity_ref = 'TBL-AXC-QUEUE';

  -- ─── UI Pages ───────────────────────────────────────────────────────────────

  INSERT INTO eig_entities (entity_type, entity_ref, name, description, status) VALUES
    ('ui_page', 'PAGE-ECC',     'EngineeringControlCentrePage',  'Top-level ECC router with config-driven collapsible navigation.', 'active'),
    ('ui_page', 'PAGE-ATD',     'CCAIProductManagerPage',        'AI Technical Director conversation workspace with resizable sidebar.', 'active'),
    ('ui_page', 'PAGE-BENCH',   'ECCBenchmarkingPage',           'ATD benchmark sessions, runs, review panels, EIS evolution timeline.', 'active'),
    ('ui_page', 'PAGE-REVIEWS', 'ECCEngineeringReviewsPage',     'Formal engineering review registry and governance workflow.', 'active'),
    ('ui_page', 'PAGE-AUDITS',  'ECCAuditPage',                  'Platform engineering audit system with domain scoring.', 'active'),
    ('ui_page', 'PAGE-EIG',     'ECCEngineeringGraphPage',       'Engineering Intelligence Graph explorer, dependency analysis, impact reports.', 'active')
  ON CONFLICT DO NOTHING;

  SELECT id INTO e_page_ecc     FROM eig_entities WHERE entity_ref = 'PAGE-ECC';
  SELECT id INTO e_page_atd     FROM eig_entities WHERE entity_ref = 'PAGE-ATD';
  SELECT id INTO e_page_bench   FROM eig_entities WHERE entity_ref = 'PAGE-BENCH';
  SELECT id INTO e_page_reviews FROM eig_entities WHERE entity_ref = 'PAGE-REVIEWS';
  SELECT id INTO e_page_audits  FROM eig_entities WHERE entity_ref = 'PAGE-AUDITS';
  SELECT id INTO e_page_eig     FROM eig_entities WHERE entity_ref = 'PAGE-EIG';

  -- ─── Risks ──────────────────────────────────────────────────────────────────

  INSERT INTO eig_entities (entity_type, entity_ref, name, description, status) VALUES
    ('risk', 'RISK-001', 'Axcelerate API Coupling',       'Tight coupling to Axcelerate REST API; changes in their API version could break sync.', 'active'),
    ('risk', 'RISK-002', 'Single AI Provider Dependency', 'ATD relies on a single configured AI provider; no automatic fallback if provider is unavailable.', 'active'),
    ('risk', 'RISK-003', 'ECC Navigation Scalability',    'Navigation list may become unwieldy as more modules are added; partially mitigated by EWO-018.', 'active'),
    ('risk', 'RISK-004', 'Graph Cold Start',              'EIG reasoning quality degrades if graph is sparse; requires discipline to keep entities current.', 'active')
  ON CONFLICT DO NOTHING;

  SELECT id INTO e_risk_axc   FROM eig_entities WHERE entity_ref = 'RISK-001';
  SELECT id INTO e_risk_ai    FROM eig_entities WHERE entity_ref = 'RISK-002';
  SELECT id INTO e_risk_nav   FROM eig_entities WHERE entity_ref = 'RISK-003';
  SELECT id INTO e_risk_scale FROM eig_entities WHERE entity_ref = 'RISK-004';

  -- ─── Technical Debt ─────────────────────────────────────────────────────────

  INSERT INTO eig_entities (entity_type, entity_ref, name, description, status) VALUES
    ('technical_debt', 'DEBT-001', 'Large Component Files',        'Several page components exceed 2500 LOC; harder to navigate and review.', 'active'),
    ('technical_debt', 'DEBT-002', 'EIS Score Not Propagated',     'EIS score is stored on review records but not propagated to session.eis_score column; causes EIS Evolution Timeline to be blank until QA-016 fix.', 'active'),
    ('technical_debt', 'DEBT-003', 'Run History Filter Mismatch',  'Run History tab filtered on run.review_status rather than effective governance status; fixed in QA-016 but pattern may recur elsewhere.', 'active')
  ON CONFLICT DO NOTHING;

  SELECT id INTO e_debt_large_files  FROM eig_entities WHERE entity_ref = 'DEBT-001';
  SELECT id INTO e_debt_eis_score    FROM eig_entities WHERE entity_ref = 'DEBT-002';
  SELECT id INTO e_debt_session_prop FROM eig_entities WHERE entity_ref = 'DEBT-003';

  -- ─── Roadmap ────────────────────────────────────────────────────────────────

  INSERT INTO eig_entities (entity_type, entity_ref, name, description, status) VALUES
    ('roadmap_item', 'ROAD-001', 'Engineering QA Centre',      'Permanent QA module within ECC: QA plans, defect register, regression testing, PO approval workflow.', 'planned'),
    ('roadmap_item', 'ROAD-002', 'Collapsible Icon Sidebar',   'ATD conversation sidebar collapses to 64px icon-only rail with expand animation.', 'planned'),
    ('roadmap_item', 'ROAD-003', 'Multi-Panel Workspace',      'Multiple independently resizable panels in ECC similar to VS Code split editors.', 'planned')
  ON CONFLICT DO NOTHING;

  SELECT id INTO e_road_qa_centre    FROM eig_entities WHERE entity_ref = 'ROAD-001';
  SELECT id INTO e_road_icon_sidebar FROM eig_entities WHERE entity_ref = 'ROAD-002';
  SELECT id INTO e_road_multi_panel  FROM eig_entities WHERE entity_ref = 'ROAD-003';

  -- ─── Relationships ──────────────────────────────────────────────────────────
  -- Insert all relationships. ON CONFLICT DO NOTHING handles idempotency.

  INSERT INTO eig_relationships (from_entity_id, to_entity_id, relationship_type, description)
  VALUES

    -- Mission → all releases (supports)
    (e_mission, e_rc001, 'supports', 'Foundation phase supports platform mission'),
    (e_mission, e_rc002, 'supports', 'Assessment engine phase'),
    (e_mission, e_rc003, 'supports', 'Engineering excellence phase'),
    (e_mission, e_rc004, 'supports', 'Intelligence platform phase'),
    (e_mission, e_rc005, 'supports', 'Autonomous engineering phase'),

    -- EWOs introduced in releases
    (e_ewo001, e_rc001, 'introduced_in_release', 'Auth foundation shipped in RC-001'),
    (e_ewo008, e_rc002, 'introduced_in_release', 'Axcelerate integration shipped in RC-002'),
    (e_ewo009, e_rc002, 'introduced_in_release', 'Email queue shipped in RC-002'),
    (e_ewo010, e_rc003, 'introduced_in_release', 'ECC scaffold shipped in RC-003'),
    (e_ewo014, e_rc003, 'introduced_in_release', 'AI Technical Director shipped in RC-003'),
    (e_ewo015, e_rc003, 'introduced_in_release', 'Benchmarking engine shipped in RC-003'),
    (e_ewo016, e_rc004, 'introduced_in_release', 'Engineering intelligence shipped in RC-004'),
    (e_ewo017, e_rc004, 'introduced_in_release', 'Resizable panel shipped in RC-004'),
    (e_ewo018, e_rc004, 'introduced_in_release', 'Navigation UX shipped in RC-004'),
    (e_ewo019, e_rc005, 'introduced_in_release', 'EIG ships in RC-005'),

    -- EWOs implement modules
    (e_ewo001, e_mod_auth,       'implements', 'EWO-001 delivered auth module'),
    (e_ewo008, e_mod_axc,        'implements', 'EWO-008 delivered Axcelerate integration'),
    (e_ewo009, e_mod_email,      'implements', 'EWO-009 delivered email system'),
    (e_ewo010, e_mod_ecc,        'implements', 'EWO-010 delivered ECC scaffold'),
    (e_ewo014, e_mod_atd,        'implements', 'EWO-014 delivered AI Technical Director'),
    (e_ewo019, e_mod_ecc,        'extends',    'EWO-019 extends ECC with EIG'),

    -- EWOs produce database tables
    (e_ewo001, e_tbl_profiles,      'produces', 'EWO-001 created profiles table'),
    (e_ewo001, e_tbl_assessments,   'produces', 'EWO-001 created assessments table'),
    (e_ewo008, e_tbl_axc_queue,     'produces', 'EWO-008 created writeback queue'),
    (e_ewo015, e_tbl_atd_sessions,  'produces', 'EWO-015 created benchmark session tables'),
    (e_ewo019, e_tbl_eig_entities,  'produces', 'EWO-019 created EIG entity table'),

    -- Module dependencies
    (e_mod_assessment, e_mod_auth,   'depends_on', 'Assessment engine requires auth'),
    (e_mod_acsf,       e_mod_assessment, 'depends_on', 'ACSF mapping depends on assessment records'),
    (e_mod_axc,        e_mod_auth,   'depends_on', 'Axcelerate sync requires authenticated service role'),
    (e_mod_atd,        e_mod_ecc,    'depends_on', 'ATD runs inside ECC workspace'),
    (e_mod_billing,    e_mod_auth,   'depends_on', 'Billing requires authenticated user'),
    (e_mod_student,    e_mod_assessment, 'depends_on', 'Student portal consumes assessment engine'),
    (e_mod_student,    e_mod_auth,   'depends_on', 'Student portal requires auth'),
    (e_mod_email,      e_mod_assessment, 'supports', 'Email delivers assessment invitations'),

    -- UI Pages depend on modules
    (e_page_ecc,     e_mod_ecc,    'depends_on', 'ECC page IS the ECC module'),
    (e_page_atd,     e_mod_atd,    'depends_on', 'ATD page renders the ATD module'),
    (e_page_bench,   e_mod_atd,    'depends_on', 'Benchmarking page is part of ATD module'),
    (e_page_reviews, e_mod_ecc,    'depends_on', 'Engineering reviews live in ECC'),
    (e_page_eig,     e_mod_ecc,    'depends_on', 'EIG explorer lives in ECC'),
    (e_page_eig,     e_tbl_eig_entities, 'uses',  'EIG page reads/writes eig_entities'),

    -- EWO-017/018 are extensions of ECC
    (e_ewo017, e_mod_atd, 'extends', 'EWO-017 improves ATD conversation panel'),
    (e_ewo018, e_mod_ecc, 'extends', 'EWO-018 improves ECC navigation'),

    -- Risk relationships
    (e_risk_axc,   e_mod_axc,    'impacts', 'Axcelerate coupling risk impacts integration module'),
    (e_risk_ai,    e_mod_atd,    'impacts', 'Single provider risk impacts ATD availability'),
    (e_risk_nav,   e_mod_ecc,    'impacts', 'Navigation scalability risk impacts ECC usability'),
    (e_risk_scale, e_tbl_eig_entities, 'impacts', 'EIG cold start risk impacts reasoning quality'),
    (e_ewo018,     e_risk_nav,   'supports', 'EWO-018 mitigates nav scalability risk'),

    -- Technical debt relationships
    (e_debt_large_files, e_page_atd,   'related_to', 'ATD page is one of the large component files'),
    (e_debt_eis_score,   e_tbl_atd_sessions, 'related_to', 'EIS propagation debt in atd_benchmark_sessions'),
    (e_debt_session_prop, e_page_bench, 'related_to', 'Run History filter was in benchmarking page'),

    -- Roadmap items depend on existing modules
    (e_road_qa_centre,    e_mod_ecc,    'depends_on', 'QA Centre will live inside ECC'),
    (e_road_icon_sidebar, e_mod_atd,    'depends_on', 'Icon sidebar enhancement to ATD panel'),
    (e_road_multi_panel,  e_mod_ecc,    'depends_on', 'Multi-panel workspace enhances ECC layout'),
    (e_ewo019, e_road_qa_centre, 'supports', 'EIG will provide QA Centre with traceability data')

  ON CONFLICT DO NOTHING;

END $$;
