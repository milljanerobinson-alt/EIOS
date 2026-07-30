
-- ============================================================
-- RC-003 Engineering Roadmap: EOS Engineering Stages
-- Stage 1 Engineering Foundations → Stage 8 Platform Expansion
-- ============================================================

CREATE TABLE IF NOT EXISTS ecc_eos_stages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_number int  NOT NULL UNIQUE,
  title        text NOT NULL,
  description  text,
  status       text NOT NULL DEFAULT 'planned',
  release_ids  text[],
  focus_areas  text[],
  sort_order   int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecc_eos_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_eos_stages" ON ecc_eos_stages FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "insert_eos_stages" ON ecc_eos_stages FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "update_eos_stages" ON ecc_eos_stages FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "delete_eos_stages" ON ecc_eos_stages FOR DELETE TO anon, authenticated USING (true);

INSERT INTO ecc_eos_stages (stage_number, title, description, status, release_ids, focus_areas, sort_order) VALUES
(1, 'Engineering Foundations',
 'Establish the Engineering Operating System with all governance, audit, register, and risk infrastructure.',
 'active',
 ARRAY['RC-001', 'RC-002', 'RC-003'],
 ARRAY['Engineering Register', 'Audit System', 'Risk Register', 'Timeline', 'Standards', 'Recommendation Pipeline'],
 1),

(2, 'Engineering Excellence',
 'Elevate engineering maturity through formal testing, automation, CI/CD, performance benchmarking, documentation depth, operational runbooks, and deployment gates.',
 'planned',
 ARRAY[]::text[],
 ARRAY['Testing Framework', 'Automation & CI/CD', 'Performance Benchmarks', 'Documentation Depth', 'Monitoring', 'Operational Runbooks', 'Deployment Gates'],
 2),

(3, 'Living Knowledge Centre',
 'Transform platform documentation into a living, searchable, versioned knowledge base. Knowledge objects, relationships, categories, visibility controls, and public/internal/shared access.',
 'planned',
 ARRAY[]::text[],
 ARRAY['Knowledge Objects', 'Knowledge Relationships', 'Documentation Categories', 'Version History', 'Visibility Controls', 'Search & Discovery'],
 3),

(4, 'AI Engineering Team',
 'Elevate the AI Technical Director into a full AI Engineering Team with specialised agents for architecture, testing, documentation, and release management.',
 'planned',
 ARRAY[]::text[],
 ARRAY['AI Architecture Agent', 'AI Testing Agent', 'AI Documentation Agent', 'AI Release Agent', 'Multi-Agent Coordination'],
 4),

(5, 'Executive Intelligence',
 'Deliver executive-level platform intelligence: board-ready dashboards, commercial health reports, platform ROI analysis, and investor-grade engineering metrics.',
 'planned',
 ARRAY[]::text[],
 ARRAY['Executive Dashboard', 'Board Reports', 'Commercial Health', 'Platform ROI', 'Engineering KPIs'],
 5),

(6, 'Customer Experience Platform',
 'Transform the student and assessor experience with enhanced UX, personalisation, accessibility compliance, and mobile-first design.',
 'planned',
 ARRAY[]::text[],
 ARRAY['Student Portal Enhancement', 'Assessor Experience', 'Personalisation', 'Accessibility (WCAG)', 'Mobile-First'],
 6),

(7, 'Business Intelligence',
 'Advanced analytics, cohort analysis, compliance reporting, predictive modelling, and business insights for RTO leadership.',
 'planned',
 ARRAY[]::text[],
 ARRAY['Advanced Analytics', 'Cohort Analysis', 'Compliance Reporting', 'Predictive Modelling', 'Business Insights'],
 7),

(8, 'Platform Expansion',
 'Multi-RTO support, custom branding, API marketplace, partner integrations, and enterprise-grade scalability.',
 'planned',
 ARRAY[]::text[],
 ARRAY['Multi-RTO Support', 'Custom Branding', 'API Marketplace', 'Partner Integrations', 'Enterprise Scalability'],
 8);
