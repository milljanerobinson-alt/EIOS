
-- ──────────────────────────────────────────────────────────────────────────────
-- EOC Final Architecture Refactor: Seed Product Hierarchy Data
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Seed LLN+D product
INSERT INTO ecc_product (id, name, tagline, description, status)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'LLN+D',
  'Language, Literacy & Numeracy + Digital — The Assessment Platform for RTOs',
  'A specialised assessment platform built for Registered Training Organisations (RTOs) to deliver compliant LLN and Digital literacy assessments. LLN+D automates candidate journeys, generates evidence-mapped results, and integrates with Axcelerate for seamless student management.',
  'active'
);

-- 2. Seed Product Roadmap Items
INSERT INTO ecc_roadmap_items (id, product_id, name, description, target_quarter, priority, status, sort_order)
VALUES
  ('a0000001-0000-0000-0000-000000000001', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'MVP', 'Core assessment platform: LLN + Digital assessments, candidate portal, results engine, Axcelerate integration.', 'Q2 2026', 'critical', 'in_progress', 1),
  ('a0000001-0000-0000-0000-000000000002', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'Commercial Launch', 'Billing, support plans, onboarding flows, marketing site, public launch.', 'Q3 2026', 'high', 'planned', 2),
  ('a0000001-0000-0000-0000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'Enterprise', 'Multi-RTO support, custom branding, API access, advanced reporting.', 'Q4 2026', 'medium', 'planned', 3),
  ('a0000001-0000-0000-0000-000000000004', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'AI Automation', 'AI-generated support plans, automated ACSF mapping, intelligent recommendations.', 'Q1 2027', 'medium', 'planned', 4),
  ('a0000001-0000-0000-0000-000000000005', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
   'Analytics', 'Advanced analytics dashboard, cohort analysis, compliance reporting.', 'Q1 2027', 'low', 'planned', 5);

-- 3. Seed Milestones
INSERT INTO ecc_milestones (id, product_id, roadmap_item_id, name, description, owner, status, sort_order)
VALUES
  ('b0000001-0000-0000-0000-000000000001', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'a0000001-0000-0000-0000-000000000001',
   'Foundation', 'Core platform infrastructure: database schema, authentication, assessment engine, Axcelerate sync, admin portal.', 'Engineering', 'completed', 1),
  ('b0000001-0000-0000-0000-000000000002', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'a0000001-0000-0000-0000-000000000001',
   'MVP Completion', 'Complete the MVP: workflow automation, EOC engineering tools, billing integration, email system.', 'Engineering', 'in_progress', 2),
  ('b0000001-0000-0000-0000-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'a0000001-0000-0000-0000-000000000002',
   'Commercial Launch', 'Public launch readiness: marketing site, pricing, support plans, onboarding.', 'Engineering', 'planned', 3),
  ('b0000001-0000-0000-0000-000000000004', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'a0000001-0000-0000-0000-000000000004',
   'AI Support Plans', 'AI-generated support plans and automated recommendations.', 'Engineering', 'planned', 4);

-- 4. Seed Phases (proper entities linked to milestones)
INSERT INTO ecc_phases (id, milestone_id, name, description, target_version, owner, status, sort_order)
VALUES
  ('c0000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001',
   'Phase 1 — Foundation',
   'Database schema, authentication, LLN assessment engine, Digital assessment engine, Axcelerate integration, admin portal, candidate portal.',
   'v0.1', 'Engineering', 'completed', 1),
  ('c0000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000002',
   'Phase 2 — Workflow Automation',
   'Email queue system, Axcelerate writeback, student lifecycle state machine, engineering operations centre (EOC), billing foundation.',
   'v0.2', 'Engineering', 'in_progress', 2),
  ('c0000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000002',
   'Phase 3 — Engineering Intelligence',
   'EOC final architecture, product hierarchy, engineering operating system, reporting, documentation standards.',
   'v0.3', 'Engineering', 'in_progress', 3);

-- 5. Link existing Release Candidates to their Phase entities
UPDATE ecc_release_candidates SET phase_id = 'c0000001-0000-0000-0000-000000000001' WHERE rc_number = 'RC-001';
UPDATE ecc_release_candidates SET phase_id = 'c0000001-0000-0000-0000-000000000002' WHERE rc_number = 'RC-002';
UPDATE ecc_release_candidates SET phase_id = 'c0000001-0000-0000-0000-000000000003' WHERE rc_number = 'RC-003';
