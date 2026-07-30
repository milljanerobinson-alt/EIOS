/*
# Phase 15 — Product Intelligence Service (PIS) Foundation

## Summary
Creates the Product Intelligence Service as a permanent platform capability within the
Engineering Intelligence Platform. The PIS assembles, enriches, and versions product
intelligence from authoritative ECC sources without duplicating product data.

## New Tables

1. `pis_modules` — major platform module groupings (Candidate Management, Assessment Engine, etc.)
   - module_key (unique), module_name, description, status, sort_order, is_core

2. `pis_vision_intelligence` — product vision, mission, purpose, principles, strategic objectives
   - domain (vision/mission/purpose/customer_promise/principle/objective/success_metric)
   - title, content, sort_order, is_active

3. `pis_customer_segments` — customer personas, problems, desired outcomes, adoption drivers
   - segment_key (unique), segment_name, persona_type, problems/desired_outcomes/adoption_drivers (jsonb arrays)
   - is_primary

4. `pis_commercial_intelligence` — pricing strategy, revenue drivers, competitive position
   - domain (pricing/revenue/growth/competitive/launch/risk), title, content, metadata jsonb

5. `pis_competitive_advantages` — differentiators, USPs, innovation areas
   - advantage_type (differentiator/usp/innovation/investment_area), title, strength (high/medium/low)

6. `pis_product_constraints` — product/commercial/engineering constraints, deferred/rejected ideas
   - constraint_type, title, description, impact

7. `pis_launch_blockers` — launch readiness blockers with severity and resolution status
   - blocker_type, title, severity (critical/high/medium/low), status (open/in_progress/resolved)
   - optional foreign key to ecc_product_features

8. `pis_capability_intel` — PIS enrichment layer over ecc_product_features
   - feature_id (FK to ecc_product_features), module_id (FK to pis_modules)
   - launch_criticality, competitive_significance, customer_facing

9. `pis_relationships` — product relationship graph edges
   - from_entity_type/id, to_entity_type/id, relationship_type, description

10. `pis_snapshots` — versioned Product Intelligence Snapshots with PSS-001 refs
    - snapshot_ref (auto-generated PSS-NNN), pis_version, platform_state_id, context_package_id
    - product_maturity, launch_readiness_score (0-100), capability counts, confidence scores

## Sequences
- `pis_snapshot_seq` — drives human-readable PSS-001 snapshot references

## EIP Self-Registration
- Inserts 8 PIS source entries into `eip_source_registry` for EIP confidence scoring

## Security
- RLS enabled on all new tables
- `TO anon, authenticated USING (true)` — internal admin governance tool, intentionally shared

## Initial Seed Data
- LLN+D platform vision, mission, customer promise, strategic objectives
- Customer segments (RTOs, TAFE, Workplace Trainers, Assessment Consultants)
- Product modules (15 modules)
- Commercial intelligence domains
- Competitive advantages and differentiators
- Product constraints and launch blockers
- Core product relationship edges
*/

-- ─── Sequences ────────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS pis_snapshot_seq START 1;

-- ─── pis_modules ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pis_modules (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key  text    UNIQUE NOT NULL,
  module_name text    NOT NULL,
  description text,
  status      text    NOT NULL DEFAULT 'active',
  sort_order  int     NOT NULL DEFAULT 0,
  is_core     boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE pis_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_pis_modules" ON pis_modules;
CREATE POLICY "anon_select_pis_modules" ON pis_modules FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_pis_modules" ON pis_modules;
CREATE POLICY "anon_insert_pis_modules" ON pis_modules FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_pis_modules" ON pis_modules;
CREATE POLICY "anon_update_pis_modules" ON pis_modules FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_pis_modules" ON pis_modules;
CREATE POLICY "anon_delete_pis_modules" ON pis_modules FOR DELETE TO anon, authenticated USING (true);

-- ─── pis_vision_intelligence ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pis_vision_intelligence (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  domain     text    NOT NULL,
  title      text    NOT NULL,
  content    text    NOT NULL,
  sort_order int     NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE pis_vision_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_pis_vision" ON pis_vision_intelligence;
CREATE POLICY "anon_select_pis_vision" ON pis_vision_intelligence FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_pis_vision" ON pis_vision_intelligence;
CREATE POLICY "anon_insert_pis_vision" ON pis_vision_intelligence FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_pis_vision" ON pis_vision_intelligence;
CREATE POLICY "anon_update_pis_vision" ON pis_vision_intelligence FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_pis_vision" ON pis_vision_intelligence;
CREATE POLICY "anon_delete_pis_vision" ON pis_vision_intelligence FOR DELETE TO anon, authenticated USING (true);

-- ─── pis_customer_segments ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pis_customer_segments (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_key      text    UNIQUE NOT NULL,
  segment_name     text    NOT NULL,
  description      text,
  persona_type     text,
  problems         jsonb   NOT NULL DEFAULT '[]'::jsonb,
  desired_outcomes jsonb   NOT NULL DEFAULT '[]'::jsonb,
  adoption_drivers jsonb   NOT NULL DEFAULT '[]'::jsonb,
  is_primary       boolean NOT NULL DEFAULT false,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE pis_customer_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_pis_customers" ON pis_customer_segments;
CREATE POLICY "anon_select_pis_customers" ON pis_customer_segments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_pis_customers" ON pis_customer_segments;
CREATE POLICY "anon_insert_pis_customers" ON pis_customer_segments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_pis_customers" ON pis_customer_segments;
CREATE POLICY "anon_update_pis_customers" ON pis_customer_segments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_pis_customers" ON pis_customer_segments;
CREATE POLICY "anon_delete_pis_customers" ON pis_customer_segments FOR DELETE TO anon, authenticated USING (true);

-- ─── pis_commercial_intelligence ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pis_commercial_intelligence (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  domain     text    NOT NULL,
  title      text    NOT NULL,
  content    text    NOT NULL,
  metadata   jsonb   NOT NULL DEFAULT '{}'::jsonb,
  is_active  boolean NOT NULL DEFAULT true,
  sort_order int     NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE pis_commercial_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_pis_commercial" ON pis_commercial_intelligence;
CREATE POLICY "anon_select_pis_commercial" ON pis_commercial_intelligence FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_pis_commercial" ON pis_commercial_intelligence;
CREATE POLICY "anon_insert_pis_commercial" ON pis_commercial_intelligence FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_pis_commercial" ON pis_commercial_intelligence;
CREATE POLICY "anon_update_pis_commercial" ON pis_commercial_intelligence FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_pis_commercial" ON pis_commercial_intelligence;
CREATE POLICY "anon_delete_pis_commercial" ON pis_commercial_intelligence FOR DELETE TO anon, authenticated USING (true);

-- ─── pis_competitive_advantages ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pis_competitive_advantages (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  advantage_type text    NOT NULL DEFAULT 'differentiator',
  title          text    NOT NULL,
  description    text,
  strength       text    NOT NULL DEFAULT 'medium',
  is_active      boolean NOT NULL DEFAULT true,
  sort_order     int     NOT NULL DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE pis_competitive_advantages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_pis_competitive" ON pis_competitive_advantages;
CREATE POLICY "anon_select_pis_competitive" ON pis_competitive_advantages FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_pis_competitive" ON pis_competitive_advantages;
CREATE POLICY "anon_insert_pis_competitive" ON pis_competitive_advantages FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_pis_competitive" ON pis_competitive_advantages;
CREATE POLICY "anon_update_pis_competitive" ON pis_competitive_advantages FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_pis_competitive" ON pis_competitive_advantages;
CREATE POLICY "anon_delete_pis_competitive" ON pis_competitive_advantages FOR DELETE TO anon, authenticated USING (true);

-- ─── pis_product_constraints ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pis_product_constraints (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  constraint_type text    NOT NULL DEFAULT 'product',
  title           text    NOT NULL,
  description     text,
  impact          text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE pis_product_constraints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_pis_constraints" ON pis_product_constraints;
CREATE POLICY "anon_select_pis_constraints" ON pis_product_constraints FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_pis_constraints" ON pis_product_constraints;
CREATE POLICY "anon_insert_pis_constraints" ON pis_product_constraints FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_pis_constraints" ON pis_product_constraints;
CREATE POLICY "anon_update_pis_constraints" ON pis_product_constraints FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_pis_constraints" ON pis_product_constraints;
CREATE POLICY "anon_delete_pis_constraints" ON pis_product_constraints FOR DELETE TO anon, authenticated USING (true);

-- ─── pis_launch_blockers ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pis_launch_blockers (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_type text    NOT NULL DEFAULT 'feature',
  title        text    NOT NULL,
  description  text,
  severity     text    NOT NULL DEFAULT 'high',
  status       text    NOT NULL DEFAULT 'open',
  feature_id   uuid    REFERENCES ecc_product_features(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pis_launch_blockers_status ON pis_launch_blockers(status);
CREATE INDEX IF NOT EXISTS idx_pis_launch_blockers_severity ON pis_launch_blockers(severity);

ALTER TABLE pis_launch_blockers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_pis_launch" ON pis_launch_blockers;
CREATE POLICY "anon_select_pis_launch" ON pis_launch_blockers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_pis_launch" ON pis_launch_blockers;
CREATE POLICY "anon_insert_pis_launch" ON pis_launch_blockers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_pis_launch" ON pis_launch_blockers;
CREATE POLICY "anon_update_pis_launch" ON pis_launch_blockers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_pis_launch" ON pis_launch_blockers;
CREATE POLICY "anon_delete_pis_launch" ON pis_launch_blockers FOR DELETE TO anon, authenticated USING (true);

-- ─── pis_capability_intel ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pis_capability_intel (
  id                      uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id              uuid    NOT NULL REFERENCES ecc_product_features(id) ON DELETE CASCADE,
  module_id               uuid    REFERENCES pis_modules(id) ON DELETE SET NULL,
  launch_criticality      text    NOT NULL DEFAULT 'nice_to_have',
  competitive_significance text   NOT NULL DEFAULT 'low',
  customer_facing         boolean NOT NULL DEFAULT true,
  notes                   text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  UNIQUE(feature_id)
);

CREATE INDEX IF NOT EXISTS idx_pis_capability_intel_module ON pis_capability_intel(module_id);

ALTER TABLE pis_capability_intel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_pis_cap_intel" ON pis_capability_intel;
CREATE POLICY "anon_select_pis_cap_intel" ON pis_capability_intel FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_pis_cap_intel" ON pis_capability_intel;
CREATE POLICY "anon_insert_pis_cap_intel" ON pis_capability_intel FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_pis_cap_intel" ON pis_capability_intel;
CREATE POLICY "anon_update_pis_cap_intel" ON pis_capability_intel FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_pis_cap_intel" ON pis_capability_intel;
CREATE POLICY "anon_delete_pis_cap_intel" ON pis_capability_intel FOR DELETE TO anon, authenticated USING (true);

-- ─── pis_relationships ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pis_relationships (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_type   text NOT NULL,
  from_entity_id     text NOT NULL,
  to_entity_type     text NOT NULL,
  to_entity_id       text NOT NULL,
  relationship_type  text NOT NULL,
  description        text,
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pis_rel_from ON pis_relationships(from_entity_type, from_entity_id);
CREATE INDEX IF NOT EXISTS idx_pis_rel_to ON pis_relationships(to_entity_type, to_entity_id);

ALTER TABLE pis_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_pis_rel" ON pis_relationships;
CREATE POLICY "anon_select_pis_rel" ON pis_relationships FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_pis_rel" ON pis_relationships;
CREATE POLICY "anon_insert_pis_rel" ON pis_relationships FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_pis_rel" ON pis_relationships;
CREATE POLICY "anon_update_pis_rel" ON pis_relationships FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_pis_rel" ON pis_relationships;
CREATE POLICY "anon_delete_pis_rel" ON pis_relationships FOR DELETE TO anon, authenticated USING (true);

-- ─── pis_snapshots ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pis_snapshots (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_ref                text UNIQUE NOT NULL DEFAULT 'PSS-' || lpad(nextval('pis_snapshot_seq')::text, 3, '0'),
  pis_version                 text NOT NULL DEFAULT '1.0',
  platform_state_id           uuid REFERENCES eip_platform_states(id) ON DELETE SET NULL,
  context_package_id          uuid REFERENCES eip_context_packages(id) ON DELETE SET NULL,
  product_maturity            text NOT NULL DEFAULT 'developing',
  launch_readiness_score      int  NOT NULL DEFAULT 0,
  current_strategic_objective text,
  current_commercial_objective text,
  implemented_capabilities    int  NOT NULL DEFAULT 0,
  planned_capabilities        int  NOT NULL DEFAULT 0,
  deferred_capabilities       int  NOT NULL DEFAULT 0,
  customer_segments_count     int  NOT NULL DEFAULT 0,
  competitive_advantages_count int NOT NULL DEFAULT 0,
  product_risks_count         int  NOT NULL DEFAULT 0,
  product_constraints_count   int  NOT NULL DEFAULT 0,
  knowledge_confidence        int  NOT NULL DEFAULT 0,
  context_completeness        int  NOT NULL DEFAULT 0,
  snapshot_data               jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources_used                jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_sources             jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_status           text NOT NULL DEFAULT 'valid',
  generated_by                text,
  created_at                  timestamptz DEFAULT now()
);

ALTER TABLE pis_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_pis_snapshots" ON pis_snapshots;
CREATE POLICY "anon_select_pis_snapshots" ON pis_snapshots FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_pis_snapshots" ON pis_snapshots;
CREATE POLICY "anon_insert_pis_snapshots" ON pis_snapshots FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_pis_snapshots" ON pis_snapshots;
CREATE POLICY "anon_update_pis_snapshots" ON pis_snapshots FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ─── EIP Self-Registration ────────────────────────────────────────────────────

INSERT INTO eip_source_registry (source_key, source_name, description, table_name, weight, is_critical, is_enabled, sort_order)
VALUES
  ('pis_vision',       'Product Vision Intelligence',   'Product vision, mission, purpose, strategic objectives and success metrics',   'pis_vision_intelligence',    8, true,  true, 20),
  ('pis_customers',    'Customer Intelligence',          'Customer segments, personas, problems, desired outcomes and adoption drivers',  'pis_customer_segments',      7, true,  true, 21),
  ('pis_commercial',   'Commercial Intelligence',        'Pricing strategy, revenue drivers, competitive position and commercial risks',  'pis_commercial_intelligence', 7, false, true, 22),
  ('pis_competitive',  'Competitive Intelligence',       'Platform differentiators, USPs, innovation areas and competitive advantages',   'pis_competitive_advantages',  6, false, true, 23),
  ('pis_constraints',  'Product Decision Intelligence',  'Product constraints, deferred ideas, rejected ideas and engineering assumptions', 'pis_product_constraints',    5, false, true, 24),
  ('pis_launch',       'Launch Intelligence',            'Launch blockers, readiness assessment and commercial launch requirements',       'pis_launch_blockers',         8, true,  true, 25),
  ('pis_modules',      'Product Module Intelligence',    'Major platform module groupings and capability organisation model',             'pis_modules',                 6, false, true, 26),
  ('pis_snapshots',    'Product Intelligence Snapshots', 'Versioned product intelligence snapshots with confidence and maturity scoring', 'pis_snapshots',               5, false, true, 27)
ON CONFLICT (source_key) DO UPDATE SET
  source_name  = EXCLUDED.source_name,
  description  = EXCLUDED.description,
  table_name   = EXCLUDED.table_name,
  weight       = EXCLUDED.weight,
  is_critical  = EXCLUDED.is_critical,
  sort_order   = EXCLUDED.sort_order;

-- ─── Seed: Product Modules ───────────────────────────────────────────────────

INSERT INTO pis_modules (module_key, module_name, description, status, sort_order, is_core) VALUES
  ('candidate_management',   'Candidate Management',       'Manage learner profiles, enrolments, cohorts and lifecycle state',                  'active',  1,  true),
  ('assessment_engine',      'Assessment Engine',          'LLN and digital literacy assessments (reading, numeracy, writing, oral, digital)',  'active',  2,  true),
  ('adaptive_assessment',    'Adaptive Assessment',        'AI-driven adaptive question sequencing and difficulty calibration',                  'planned', 3,  false),
  ('ai_support_plans',       'AI Support Plans',           'AI-generated personalised literacy and numeracy support plans',                      'active',  4,  true),
  ('qualification_mapping',  'Qualification & ACSF Mapping', 'UOC-to-ACSF indicator mapping and LLN requirement derivation',                  'active',  5,  true),
  ('axcelerate_integration', 'Axcelerate Integration',     'Bi-directional sync, writeback and contact management with Axcelerate',             'active',  6,  true),
  ('notifications_email',    'Notifications & Email',      'Transactional email, assessment invitations and system notifications',               'active',  7,  false),
  ('administration',         'Administration & Settings',  'User management, workspace configuration, feature flags and system settings',       'active',  8,  false),
  ('compliance_reporting',   'Compliance & Reporting',     'ACSF compliance dashboards, audit trails and assessment reporting',                  'active',  9,  false),
  ('billing_subscriptions',  'Billing & Subscriptions',    'Stripe-powered subscription management, pricing plans and billing portal',           'active', 10,  false),
  ('customer_portal',        'Customer Portal',            'RTO-facing portal for student access, assessment delivery and results',              'active', 11,  true),
  ('mission_control',        'Mission Control',            'AI Technical Director — engineering intelligence, briefings and oversight',          'active', 12,  false),
  ('engineering_command',    'Engineering Command Centre', 'Full engineering lifecycle governance platform',                                     'active', 13,  false),
  ('ai_providers',           'AI Provider Management',     'Multi-provider AI configuration, key management and model routing',                  'active', 14,  false),
  ('eip',                    'Engineering Intelligence Platform', 'Context assembly, validation, packaging and product intelligence services',   'active', 15,  false)
ON CONFLICT (module_key) DO NOTHING;

-- ─── Seed: Product Vision Intelligence ──────────────────────────────────────

INSERT INTO pis_vision_intelligence (domain, title, content, sort_order) VALUES
  ('vision',           'Product Vision',         'Australia''s most intelligent digital literacy and numeracy assessment platform — purpose-built for RTOs, TAFE institutions and workplace trainers.', 1),
  ('mission',          'Mission',                'Enable assessors and registered training organisations to deliver accurate, compliant, AI-powered LLN+D assessments at scale — faster, smarter and with greater confidence.', 2),
  ('purpose',          'Purpose',                'Transform the assessment experience from a manual, time-intensive compliance task into an intelligent, adaptive and outcomes-driven capability that improves learner outcomes.', 3),
  ('customer_promise', 'Customer Promise',       'Accurate, compliant LLN+D assessments with AI-generated personalised support plans — delivered in minutes, not hours.', 4),
  ('principle',        'Evidence-Based AI',      'AI recommendations must be grounded in verified engineering context, not assumptions. Every reasoning chain must be traceable to authoritative artefacts.', 5),
  ('principle',        'Compliance First',       'Every product decision must support Australian Skills Quality Authority (ASQA) compliance requirements for RTOs. Non-compliance is not a trade-off.', 6),
  ('principle',        'Assessment Integrity',   'Assessment data is the most sensitive data on the platform. Privacy, accuracy and integrity are non-negotiable at every layer of the stack.', 7),
  ('principle',        'Platform Extensibility', 'Design for extensibility. Every domain module must be independently extensible without requiring redesign of adjacent services.', 8),
  ('objective',        'Commercial Launch',      'Achieve commercial launch with a minimum viable RTO customer base, validated assessment engine, Axcelerate integration and billing infrastructure.', 9),
  ('objective',        'AI Differentiation',     'Establish AI-powered support plan generation and adaptive assessment as the primary platform differentiators in the Australian RTO market.', 10),
  ('objective',        'Qualification Coverage', 'Achieve full ACSF indicator coverage for the top 50 most common VET qualifications delivered by Australian RTOs.', 11),
  ('success_metric',   'Assessment Accuracy',    'Assessment results match expert assessor agreement rates at >= 95% for standard LLN domains.', 12),
  ('success_metric',   'Support Plan Adoption',  'AI-generated support plans adopted or used as baseline by >= 80% of assessors without manual rework.', 13),
  ('success_metric',   'Time-to-Assessment',     'Average time from candidate enrolment to completed assessment result < 15 minutes.', 14);

-- ─── Seed: Customer Segments ─────────────────────────────────────────────────

INSERT INTO pis_customer_segments (segment_key, segment_name, description, persona_type, problems, desired_outcomes, adoption_drivers, is_primary) VALUES
  ('rto',
   'Registered Training Organisations',
   'Australian RTOs delivering accredited VET qualifications requiring LLN assessment and support planning as part of ASQA compliance obligations.',
   'primary',
   '["Manual LLN assessment processes are slow and error-prone", "ACSF indicator mapping is technically complex and time-consuming", "Generating quality support plans requires expert knowledge not all staff possess", "Compliance audit preparation requires significant documentation effort", "Axcelerate data is fragmented — candidate records lack LLN context"]',
   '["Faster, compliant LLN assessments delivered at scale", "AI-generated support plans that meet ASQA standards without manual expert effort", "Automated ACSF mapping for all delivered qualifications", "Complete audit trail ready for ASQA review", "Seamless Axcelerate integration with automatic writeback"]',
   '["ASQA compliance pressure", "Staff capability gaps in LLN assessment", "Cost reduction in assessment delivery", "Quality improvement in support planning"]',
   true),
  ('tafe',
   'TAFE Institutions',
   'State-based TAFE institutions with large candidate volumes requiring scalable, high-volume LLN assessment at intake and throughout enrolment.',
   'primary',
   '["High candidate volumes make manual assessment impractical", "Inconsistent assessment quality across campuses and assessors", "Reporting requirements for government funding bodies are complex"]',
   '["High-volume assessment processing with consistent quality", "Standardised reporting across campuses", "Integration with existing student management systems"]',
   '["Volume efficiency", "Consistent quality at scale", "Funding compliance reporting"]',
   true),
  ('workplace_trainer',
   'Workplace Trainers',
   'Employer-based trainers and assessors delivering foundation skills training in workplace contexts, often without deep LLN expertise.',
   'secondary',
   '["Limited LLN expertise means assessors struggle to interpret assessment results", "Workplace context requires contextualised assessments not available in generic tools", "Time pressure means assessors need fast, decision-ready outputs"]',
   '["Clear, actionable assessment results with plain-language interpretation", "Contextualised assessment content relevant to the workplace", "Fast turnaround with automatically generated next steps"]',
   '["Ease of use without expertise", "Speed and efficiency", "Actionable outputs"]',
   false),
  ('assessment_consultant',
   'Assessment Consultants',
   'Independent consultants and assessment specialists providing LLN assessment services to multiple RTOs.',
   'secondary',
   '["Managing multiple clients requires consistent, professional outputs", "Manual support plan generation is a bottleneck at scale", "Billing and time tracking for assessment work is inefficient"]',
   '["Professional, branded outputs that can be delivered to multiple RTO clients", "AI support plan generation that multiplies their capacity", "Audit-ready documentation as a standard output"]',
   '["Capacity multiplication through AI", "Professional output quality", "Multi-client management"]',
   false);

-- ─── Seed: Commercial Intelligence ───────────────────────────────────────────

INSERT INTO pis_commercial_intelligence (domain, title, content, sort_order) VALUES
  ('pricing',     'Subscription Model',          'SaaS subscription targeting RTOs and TAFE institutions. Pricing tiers based on candidate volume and feature access, managed through Stripe.', 1),
  ('pricing',     'Pricing Tiers',               'Starter (small RTO, limited candidates), Professional (mid-size RTO, full feature access), Enterprise (large RTO or TAFE, custom volume, dedicated support).', 2),
  ('revenue',     'Primary Revenue Driver',      'Monthly recurring subscription revenue (MRR) from RTO and TAFE subscribers. Growth driven by new subscriber acquisition and tier upgrades.', 3),
  ('revenue',     'Secondary Revenue Driver',    'Professional services revenue from implementation, qualification mapping configuration and custom assessment content for enterprise clients.', 4),
  ('growth',      'Growth Strategy',             'Land-and-expand within the Australian RTO sector. Lead with ASQA compliance value proposition, expand usage through AI support plan differentiation and Axcelerate integration depth.', 5),
  ('competitive', 'Market Position',             'Specialist LLN+D assessment platform for the Australian VET sector. Not a generic assessment tool — purpose-built for compliance, ACSF and Axcelerate integration.', 6),
  ('competitive', 'Competitive Risk',            'Large LMS providers (Moodle, Canvas) may add LLN assessment modules. Differentiation must remain in ACSF specialisation, AI quality and deep Axcelerate integration.', 7),
  ('launch',      'Launch Strategy',             'Closed beta with 3–5 RTO partners for validation. Commercial launch following successful beta, Axcelerate integration sign-off and billing infrastructure validation.', 8),
  ('risk',        'Compliance Risk',             'ASQA standards for LLN assessment validity and reliability must be demonstrably met before commercial launch. Any compliance gap is a business-critical blocker.', 9),
  ('risk',        'AI Accuracy Risk',            'AI-generated support plans must meet professional standards. Inaccurate or incomplete plans could damage RTO relationships and create compliance exposure.', 10);

-- ─── Seed: Competitive Advantages ────────────────────────────────────────────

INSERT INTO pis_competitive_advantages (advantage_type, title, description, strength, sort_order) VALUES
  ('differentiator', 'ACSF Domain Specialisation',        'Purpose-built for the Australian Core Skills Framework. No generic assessment platform offers this level of ACSF indicator specificity.', 'high', 1),
  ('differentiator', 'AI Support Plan Generation',         'Automated, personalised support plans derived from assessment results, ACSF indicators and qualification context. Requires expert knowledge to replicate manually.', 'high', 2),
  ('differentiator', 'Adaptive Assessment Intelligence',   'AI-driven question sequencing calibrated to candidate performance — not static form delivery.', 'medium', 3),
  ('differentiator', 'Deep Axcelerate Integration',        'Bi-directional sync, automated writeback and contact note management within the Axcelerate ecosystem. No competitor offers this depth.', 'high', 4),
  ('usp',            'Assessment-to-Support-Plan Pipeline', 'End-to-end workflow from assessment delivery through to AI-generated support plan in a single platform — eliminating the manual handoff gap.', 'high', 5),
  ('usp',            'Engineering Intelligence Platform',  'Internal engineering governance platform provides superior platform quality, release discipline and AI reasoning grounding versus competitors.', 'medium', 6),
  ('innovation',     'Qualification Mapping Engine',       'Automated UOC-to-ACSF indicator derivation and LLN requirement mapping engine. Eliminates weeks of manual mapping work for new qualifications.', 'high', 7),
  ('innovation',     'Multi-Provider AI Architecture',     'Provider-agnostic AI layer supporting OpenAI, Anthropic, Gemini and custom models — enabling competitive positioning without vendor lock-in.', 'medium', 8),
  ('investment_area','Digital Literacy Assessment',         'AEDC digital literacy domain positions the platform for workforce digital upskilling — a growing government and enterprise priority.', 'medium', 9),
  ('investment_area','Predictive Assessment Analytics',     'Future capability: predictive modelling of learning gaps and recommended intervention pathways based on cohort assessment data.', 'low', 10);

-- ─── Seed: Product Constraints ───────────────────────────────────────────────

INSERT INTO pis_product_constraints (constraint_type, title, description, impact) VALUES
  ('commercial',      'Australian Market Only (Phase 1)',         'Platform designed specifically for Australian VET sector compliance requirements. International expansion deferred.', 'medium'),
  ('engineering',     'No Native Mobile App (Phase 1)',           'Assessment delivery is browser-based. Native iOS/Android apps deferred to post-commercial-launch roadmap.', 'medium'),
  ('product',         'Axcelerate Dependency',                    'Axcelerate integration is a primary value driver but creates platform dependency. Axcelerate API stability is outside our control.', 'high'),
  ('engineering',     'Single-Tenant Data Model',                 'Current architecture is single-tenant. Multi-tenant isolation required before TAFE-scale enterprise deployment.', 'high'),
  ('deferred_idea',   'Video Assessment Proctoring',              'AI-powered video proctoring for supervised assessments deferred due to complexity, cost and privacy considerations.', 'low'),
  ('deferred_idea',   'Learner Self-Service Portal',              'Direct learner access to assessment history and support plans deferred to post-launch. RTOs manage assessment delivery.', 'medium'),
  ('deferred_idea',   'White-Label Platform',                     'White-label capability for enterprise resellers deferred. Requires multi-tenant architecture as a prerequisite.', 'low'),
  ('rejected_idea',   'Generic Assessment Builder',               'Generic drag-and-drop assessment builder rejected. Specialisation in LLN+D is our competitive moat — generic tooling dilutes it.', 'low'),
  ('rejected_idea',   'Direct-to-Learner B2C Model',              'B2C model targeting learners directly rejected. B2B RTO model provides better unit economics and compliance defensibility.', 'medium'),
  ('assumption',      'ASQA Compliance as Table Stakes',          'Platform assumes ASQA compliance is a non-negotiable requirement for all target customers. Non-compliant workarounds will not be supported.', 'high'),
  ('assumption',      'Axcelerate API Stability',                 'Platform assumes Axcelerate API remains stable and accessible. Axcelerate changes could require significant rework.', 'high');

-- ─── Seed: Launch Blockers ────────────────────────────────────────────────────

INSERT INTO pis_launch_blockers (blocker_type, title, description, severity, status) VALUES
  ('engineering',   'Assessment Engine Validation',          'LLN assessment engine (reading, numeracy, writing) must pass full accuracy and reliability validation before commercial deployment.', 'critical', 'in_progress'),
  ('engineering',   'Axcelerate Writeback Reliability',      'Axcelerate writeback queue must demonstrate zero data loss and reliable error recovery across all candidate lifecycle events.', 'high', 'in_progress'),
  ('commercial',    'Billing Infrastructure Sign-Off',       'Stripe subscription management, invoicing and billing portal must be validated end-to-end with real payment processing.', 'high', 'open'),
  ('operational',   'Data Privacy Impact Assessment',        'DPIA required for AI-generated support plans stored against candidate records. Must confirm Privacy Act compliance.', 'high', 'open'),
  ('engineering',   'Multi-Tenant Architecture',             'Current single-tenant model must be resolved or scoped before TAFE-scale enterprise deployment commitments.', 'critical', 'open'),
  ('commercial',    'RTO Beta Partner Sign-Off',             'At least 3 RTO beta partners must validate the platform in production conditions before commercial launch announcement.', 'high', 'open'),
  ('engineering',   'ACSF Indicator Coverage',               'Qualification mapping engine must cover the top 50 VET qualifications with validated ACSF indicator sets.', 'high', 'in_progress'),
  ('operational',   'Support Documentation',                 'User guides, assessor onboarding documentation and RTO admin documentation must be completed before commercial launch.', 'medium', 'open');

-- ─── Seed: Core Product Relationships ────────────────────────────────────────

INSERT INTO pis_relationships (from_entity_type, from_entity_id, to_entity_type, to_entity_id, relationship_type, description) VALUES
  ('vision',       'mission',              'objective', 'commercial_launch',      'drives',      'The mission to enable RTOs at scale drives the commercial launch objective'),
  ('vision',       'mission',              'objective', 'ai_differentiation',     'drives',      'The mission to deliver smarter assessments drives the AI differentiation objective'),
  ('customer_problem', 'manual_assessment_slow', 'capability', 'assessment_engine', 'addressed_by', 'AI assessment engine directly addresses the manual process speed problem'),
  ('customer_problem', 'support_plan_expert', 'capability', 'ai_support_plans',   'addressed_by', 'AI support plan generation removes the expert knowledge dependency'),
  ('customer_problem', 'acsf_complexity',    'capability', 'qualification_mapping','addressed_by', 'Qualification mapping engine automates ACSF complexity'),
  ('capability',   'assessment_engine',    'module',    'assessment_engine',      'belongs_to',  'Assessment engine capability belongs to the Assessment Engine module'),
  ('capability',   'ai_support_plans',     'module',    'ai_support_plans',       'belongs_to',  'AI support plan capability belongs to the AI Support Plans module'),
  ('module',       'assessment_engine',    'module',    'ai_support_plans',       'enables',     'Assessment results enable AI support plan generation'),
  ('module',       'qualification_mapping','module',    'assessment_engine',      'enables',     'Qualification ACSF mapping contextualises assessment selection'),
  ('objective',    'commercial_launch',    'blocker',   'assessment_validation',  'blocked_by',  'Commercial launch is blocked by assessment engine validation'),
  ('objective',    'commercial_launch',    'blocker',   'billing_signoff',        'blocked_by',  'Commercial launch requires billing infrastructure sign-off');
