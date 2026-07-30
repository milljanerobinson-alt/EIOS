/*
# TP-018: ATD Module Registry

Creates the central module registry that classifies every ATD capability as:
  - core_platform: Reusable platform capabilities available to any product
  - domain_module: LLN+D or product-specific business logic
  - infrastructure: Supporting infrastructure (DB, auth, APIs, AI providers)

## New Tables

### ecc_module_registry
Records every declared ATD module with full classification metadata.

### ecc_plugin_registry
Skeleton framework for future plugin loading.

## Security
RLS enabled on both tables, anon+authenticated access (single-tenant app).

## Important Notes
1. Seeded with 25 ATD platform components across 3 architectural layers.
2. Idempotent — uses ON CONFLICT DO NOTHING for seed data.
3. module_type CHECK constraint enforces the 3-layer architecture.
*/

-- ─── Module Registry ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_module_registry (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  slug             text UNIQUE NOT NULL,
  module_type      text NOT NULL CHECK (module_type IN ('core_platform', 'domain_module', 'infrastructure')),
  layer            int  NOT NULL DEFAULT 1,
  owner            text NOT NULL DEFAULT 'ATD Platform Team',
  dependencies     text[] NOT NULL DEFAULT '{}',
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'planned')),
  version          text NOT NULL DEFAULT '1.0',
  domain           text NOT NULL DEFAULT 'atd',
  reusable         boolean NOT NULL DEFAULT true,
  description      text,
  phase_introduced text,
  architecture_notes text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE ecc_module_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_module_registry" ON ecc_module_registry;
CREATE POLICY "anon_select_module_registry" ON ecc_module_registry FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_module_registry" ON ecc_module_registry;
CREATE POLICY "anon_insert_module_registry" ON ecc_module_registry FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_module_registry" ON ecc_module_registry;
CREATE POLICY "anon_update_module_registry" ON ecc_module_registry FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_module_registry" ON ecc_module_registry;
CREATE POLICY "anon_delete_module_registry" ON ecc_module_registry FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_module_registry_type   ON ecc_module_registry (module_type);
CREATE INDEX IF NOT EXISTS idx_module_registry_status ON ecc_module_registry (status);
CREATE INDEX IF NOT EXISTS idx_module_registry_domain ON ecc_module_registry (domain);

-- ─── Plugin Registry (skeleton) ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ecc_plugin_registry (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text UNIQUE NOT NULL,
  plugin_type     text NOT NULL DEFAULT 'product_plugin' CHECK (plugin_type IN ('product_plugin', 'integration', 'extension')),
  status          text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'active', 'disabled')),
  entry_point     text,
  permissions     text[] NOT NULL DEFAULT '{}',
  loaded_modules  text[] NOT NULL DEFAULT '{}',
  metadata        jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE ecc_plugin_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_plugin_registry" ON ecc_plugin_registry;
CREATE POLICY "anon_select_plugin_registry" ON ecc_plugin_registry FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_plugin_registry" ON ecc_plugin_registry;
CREATE POLICY "anon_insert_plugin_registry" ON ecc_plugin_registry FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_plugin_registry" ON ecc_plugin_registry;
CREATE POLICY "anon_update_plugin_registry" ON ecc_plugin_registry FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_plugin_registry" ON ecc_plugin_registry;
CREATE POLICY "anon_delete_plugin_registry" ON ecc_plugin_registry FOR DELETE
  TO anon, authenticated USING (true);

-- ─── Seed: Core Platform modules ─────────────────────────────────────────────

INSERT INTO ecc_module_registry (name, slug, module_type, layer, owner, dependencies, status, version, domain, reusable, description, phase_introduced, architecture_notes) VALUES

('AI Technical Director', 'atd-core', 'core_platform', 1, 'ATD Platform Team', ARRAY['eig']::text[], 'active', '2.0', 'atd', true,
 'Central AI orchestration engine: generates Engineering Reviews, Engineering Intelligence, and coordinates all ATD platform capabilities.',
 'Phase 1', 'Primary entry point. All domain modules consume ATD Core via the Executive Dashboard.'),

('Executive Dashboard', 'exec-dashboard', 'core_platform', 1, 'ATD Platform Team', ARRAY['atd-core']::text[], 'active', '2.0', 'atd', true,
 'Unified mission control for all engineering and product intelligence. Renders Director Dashboard, KPIs, and orchestrates module navigation.',
 'Phase 1', 'Hosts ECCDirectorDashboard. All KPI widgets are platform-neutral.'),

('Engineering Review Engine', 'review-engine', 'core_platform', 1, 'ATD Platform Team', ARRAY['atd-core', 'elpm', 'eig']::text[], 'active', '2.0', 'atd', true,
 'Generates structured Engineering Reviews (ERC) across 8 review types. Core quality gate for all development phases.',
 'Phase 3', 'Three-layer system prompt: review context + ELPM context + conversation intelligence.'),

('ELPM Engineering Learning & Precedent Memory', 'elpm', 'core_platform', 1, 'ATD Platform Team', ARRAY['eig', 'memory-engine', 'conversation-intelligence']::text[], 'active', '1.1', 'atd', true,
 'Runs before every Engineering Review. Searches historical knowledge, calculates similarity, extracts lessons, and builds engineering memory.',
 'Phase 15', 'Version-invalidated 24h cache. 10 parallel analysis modules.'),

('Engineering Intelligence Graph', 'eig', 'core_platform', 1, 'ATD Platform Team', ARRAY['database']::text[], 'active', '2.0', 'atd', true,
 'Knowledge graph of all engineering artefacts, relationships, decisions, and dependencies. Powers AI context assembly.',
 'Phase 2', 'Nodes: features, releases, tests, audits, decisions, benchmarks, risks, roadmap items.'),

('Memory Engine', 'memory-engine', 'core_platform', 1, 'ATD Platform Team', ARRAY['eig']::text[], 'active', '1.0', 'atd', true,
 'Stores governance standards, architecture principles, PO decisions, and engineering preferences as weighted memory entries.',
 'Phase 14', 'Weight 1-5 authority scale. Superseded entries preserved for lineage.'),

('Conversation Intelligence Service', 'conversation-intelligence', 'core_platform', 1, 'ATD Platform Team', ARRAY['atd-core', 'elpm']::text[], 'active', '1.0', 'atd', true,
 'Indexes ATD conversations into structured engineering intelligence. 13-type classifier, decision/lesson/recommendation extraction.',
 'Phase 17.3', 'CIS_VERSION invalidation. Idempotent upsert by conversation_id.'),

('Benchmark Engine', 'benchmark-engine', 'core_platform', 1, 'ATD Platform Team', ARRAY['eig']::text[], 'active', '1.0', 'atd', true,
 'Structured performance and quality benchmarking. Records baseline metrics, defines pass/fail gates, tracks trends.',
 'Phase 9', 'Benchmark results feed into ELPM historical risk prediction.'),

('Governance & Standards Engine', 'governance', 'core_platform', 1, 'ATD Platform Team', ARRAY['review-engine', 'memory-engine']::text[], 'active', '1.0', 'atd', true,
 'Enforces engineering standards, governance policies, and compliance requirements across all review types.',
 'Phase 5', 'Standards stored in ecc_engineering_memory with memory_type=governance_standard.'),

('Engineering Workflow Engine', 'workflow-engine', 'core_platform', 1, 'ATD Platform Team', ARRAY['eig', 'review-engine']::text[], 'active', '1.0', 'atd', true,
 'Orchestrates multi-step engineering workflows: phase gates, approval chains, and automated engineering hygiene checks.',
 'Phase 11', NULL),

('Decision Intelligence', 'decision-engine', 'core_platform', 1, 'ATD Platform Team', ARRAY['eig', 'memory-engine']::text[], 'active', '1.0', 'atd', true,
 'Records and enforces architectural decisions, technology choices, and PO decisions across all reviews.',
 'Phase 6', 'ADR format enforced. Decisions classified by status: proposed/accepted/superseded/deprecated.'),

('Audit Engine', 'audit-engine', 'core_platform', 1, 'ATD Platform Team', ARRAY['review-engine', 'governance']::text[], 'active', '1.0', 'atd', true,
 'Structured engineering audit capability. Links audits to phases, releases, and reviews as formal quality gates.',
 'Phase 7', NULL),

('Testing Intelligence', 'testing-engine', 'core_platform', 1, 'ATD Platform Team', ARRAY['review-engine', 'eig']::text[], 'active', '1.0', 'atd', true,
 'Testing framework management, test plan lifecycle, regression testing tracking, and QA report generation.',
 'Phase 4', NULL),

('Roadmap & Release Intelligence', 'roadmap-release', 'core_platform', 1, 'ATD Platform Team', ARRAY['eig', 'review-engine']::text[], 'active', '1.0', 'atd', true,
 'Roadmap phase management, release candidate lifecycle, production readiness gates, and release planning.',
 'Phase 3', 'RC lifecycle: in_progress to pending to verified to released/archived.'),

('Briefings Engine', 'briefings', 'core_platform', 1, 'ATD Platform Team', ARRAY['atd-core', 'eig']::text[], 'active', '1.0', 'atd', true,
 'Automated scheduled briefings: daily standup, weekly engineering summary, architecture health reports.',
 'Phase 12', NULL),

('Error Intelligence', 'error-intelligence', 'core_platform', 1, 'ATD Platform Team', ARRAY['eig']::text[], 'active', '1.0', 'atd', true,
 'Production error analysis, error pattern detection, and root cause triage integrated with engineering reviews.',
 'Phase 16', NULL),

('Module Registry', 'module-registry', 'core_platform', 1, 'ATD Platform Team', ARRAY['atd-core']::text[], 'active', '1.0', 'atd', true,
 'Platform architecture registry: classifies all ATD capabilities and enforces separation of Core Platform / Domain Module / Infrastructure.',
 'TP-018', 'Self-registering entry.'),

('Plugin Manager', 'plugin-manager', 'core_platform', 1, 'ATD Platform Team', ARRAY['module-registry']::text[], 'planned', '0.1', 'atd', true,
 'Future plugin loading framework. Enables third-party products to extend ATD Core without modifying platform code.',
 'TP-018', 'Skeleton. Full implementation in future phase.'),

-- Domain Modules (Layer 2)
('LLN+D Assessment Platform', 'lln-d', 'domain_module', 2, 'LLN+D Team', ARRAY['atd-core', 'eig', 'testing-engine', 'roadmap-release']::text[], 'active', '1.0', 'lln_d', false,
 'LLN+D-specific business logic: assessment engine, digital literacy tests, scoring, learner management, and Axcelerate integration.',
 'Phase 1', 'Primary domain module. Business logic must NOT leak into Core Platform.'),

('Customer Workspace', 'customer-workspace', 'domain_module', 2, 'ATD Platform Team', ARRAY['atd-core', 'module-registry']::text[], 'planned', '0.1', 'multi_tenant', false,
 'Future capability: isolated workspace per customer running their own domain modules on ATD Core.',
 'TP-018', 'Planned. Depends on Plugin Manager and Module Registry.'),

-- Infrastructure (Layer 3)
('Database & Storage', 'database', 'infrastructure', 3, 'Platform Ops', ARRAY[]::text[], 'active', '1.0', 'platform', false,
 'Supabase PostgreSQL database, RLS policies, migrations, and file storage. Foundational persistence layer for all modules.',
 'Phase 1', 'All tables use RLS. Migration-only schema changes via apply_migration.'),

('Authentication & Sessions', 'auth', 'infrastructure', 3, 'Platform Ops', ARRAY['database']::text[], 'active', '1.0', 'platform', false,
 'Supabase Auth email/password authentication, session management, and RLS integration via auth.uid().',
 'Phase 1', NULL),

('API Layer', 'api-layer', 'infrastructure', 3, 'Platform Ops', ARRAY['database', 'auth']::text[], 'active', '1.0', 'platform', false,
 'Supabase Edge Functions providing server-side API endpoints. All external API calls proxied through edge functions.',
 'Phase 1', 'Deno runtime. CORS mandatory. npm:/jsr: import prefixes only.'),

('AI Providers', 'ai-providers', 'infrastructure', 3, 'Platform Ops', ARRAY['api-layer']::text[], 'active', '1.0', 'platform', false,
 'OpenAI, Anthropic, and other AI provider integrations. Managed via ai_provider_configs with default provider selection.',
 'Phase 2', 'Provider credentials stored as Supabase secrets. Never exposed client-side.'),

('External Integrations', 'integrations', 'infrastructure', 3, 'Platform Ops', ARRAY['api-layer']::text[], 'active', '1.0', 'platform', false,
 'Axcelerate, Stripe, and other third-party service integrations. All via edge function proxies.',
 'Phase 1', NULL)

ON CONFLICT (slug) DO NOTHING;

-- ─── Seed: Plugin registry skeleton ──────────────────────────────────────────

INSERT INTO ecc_plugin_registry (name, slug, plugin_type, status, entry_point, permissions, loaded_modules, metadata) VALUES
('LLN+D Domain Plugin', 'lln-d-plugin', 'product_plugin', 'registered',
 'supabase/functions/lln-d-plugin/index.ts',
 ARRAY['read:eig', 'write:test_plans', 'read:reviews', 'write:benchmarks']::text[],
 ARRAY['lln-d', 'testing-engine', 'benchmark-engine']::text[],
 '{"version": "1.0", "description": "LLN+D domain module plugin registration"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;
