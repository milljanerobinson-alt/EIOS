-- ─── Audit Domain Register ────────────────────────────────────────────────────
-- Permanent controlled vocabulary for Engineering Audit classification.
-- All audits must belong to exactly one domain from this register.

CREATE TABLE IF NOT EXISTS ecc_audit_domains (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  color_class TEXT NOT NULL DEFAULT 'text-slate-600',
  bg_class    TEXT NOT NULL DEFAULT 'bg-slate-100',
  sort_order  INTEGER NOT NULL DEFAULT 99,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ecc_audit_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_audit_domains" ON ecc_audit_domains
  FOR SELECT TO anon, authenticated USING (TRUE);

-- Seed canonical domain list
INSERT INTO ecc_audit_domains (key, label, color_class, bg_class, sort_order, description)
VALUES
  ('engineering',          'Engineering',          'text-slate-700',   'bg-slate-100',   1,  'Overall engineering programme health and maturity review'),
  ('ai_platform',          'AI Platform',          'text-blue-700',    'bg-blue-50',     2,  'AI provider configuration, telemetry, and platform intelligence'),
  ('architecture',         'Architecture',         'text-blue-600',    'bg-blue-50',     3,  'System architecture, design decisions, and structural health'),
  ('security',             'Security',             'text-red-600',     'bg-red-50',      4,  'Security posture, vulnerabilities, and compliance security'),
  ('performance',          'Performance',          'text-orange-600',  'bg-orange-50',   5,  'Platform performance, load characteristics, and optimisation'),
  ('compliance',           'Compliance',           'text-emerald-700', 'bg-emerald-50',  6,  'Regulatory compliance, ACSF alignment, and governance'),
  ('release_readiness',    'Release Readiness',    'text-teal-700',    'bg-teal-50',     7,  'Release candidate status and production readiness assessment'),
  ('commercial_readiness', 'Commercial Readiness', 'text-amber-700',   'bg-amber-50',    8,  'Commercial launch readiness, cost analysis, and market fitness'),
  ('accessibility',        'Accessibility',        'text-cyan-700',    'bg-cyan-50',     9,  'WCAG compliance and accessibility engineering review'),
  ('infrastructure',       'Infrastructure',       'text-violet-700',  'bg-violet-50',  10,  'Infrastructure architecture, DevOps, and operational reliability'),
  ('other',                'Other',                'text-slate-500',   'bg-slate-100',  11,  'General-purpose or unclassified engineering reviews')
ON CONFLICT (key) DO NOTHING;

-- ─── Backfill existing audits ──────────────────────────────────────────────────
-- Audits seeded before domain standardisation may carry creation-method values
-- (manual, historical, ai_generated, historical_generated) in audit_type.
-- Migrate all invalid values to 'engineering' as the default domain.

UPDATE ecc_audits
SET audit_type = 'engineering'
WHERE audit_type IN (
  'manual', 'historical', 'imported', 'ai_generated',
  'historical_generated', 'scheduled', 'release_audit', 'manual_generated'
);

-- Map legacy cost_efficiency → commercial_readiness
UPDATE ecc_audits
SET audit_type = 'commercial_readiness'
WHERE audit_type = 'cost_efficiency';

-- ─── Update ecc_health_history ─────────────────────────────────────────────────
-- Add domain_key to health snapshots so trend queries are efficient
-- without requiring a join back to ecc_audits every time.

ALTER TABLE ecc_health_history
  ADD COLUMN IF NOT EXISTS domain_key TEXT;

-- Backfill domain_key from ecc_audits
UPDATE ecc_health_history h
SET domain_key = a.audit_type
FROM ecc_audits a
WHERE h.audit_id = a.id
  AND h.domain_key IS NULL;

-- Index for domain-scoped trend queries
CREATE INDEX IF NOT EXISTS idx_ecc_health_history_domain_key
  ON ecc_health_history (domain_key, recorded_at);

-- ─── Index for domain filtering on audits ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ecc_audits_domain_is_draft
  ON ecc_audits (audit_type, is_draft, created_at DESC);
