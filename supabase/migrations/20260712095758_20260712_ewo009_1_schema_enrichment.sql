/*
# EWO-009.1: Engineering Record Enrichment & Memory Domain

## Summary
Adds structured enrichment metadata to engineering_records_library and a
knowledge_domain field to engineering_memory. Prepares Engineering Intelligence
consumption attributes.

## Changes

### 1. engineering_records_library — enrichment fields
- complexity: low | medium | high | critical
- estimated_effort: free text (e.g. "2 days", "1 sprint")
- risk_rating: low | medium | high | critical
- confidence: low | medium | high
- platform_services_affected: text[]
- applications_affected: text[]
- subsystems_affected: text[]
- technologies: text[]
- engineering_disciplines: text[]
- primary_engineer: text
- product_owner: text

### 2. engineering_memory — knowledge domain
- knowledge_domain: architecture | security | performance | testing |
  compliance | operations | ux | ai | data | platform | infrastructure

## Security
All new columns nullable — fully backwards compatible with EWO-008/EWO-009.

## Notes
1. Enrichment fields are consumed by future Engineering Intelligence
2. knowledge_domain enables domain-filtered queries across the memory layer
3. All columns use IF NOT EXISTS guards — safe to re-run
*/

-- ─── 1. engineering_records_library — enrichment metadata ─────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='complexity') THEN
    ALTER TABLE engineering_records_library ADD COLUMN complexity text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='estimated_effort') THEN
    ALTER TABLE engineering_records_library ADD COLUMN estimated_effort text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='risk_rating') THEN
    ALTER TABLE engineering_records_library ADD COLUMN risk_rating text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='confidence') THEN
    ALTER TABLE engineering_records_library ADD COLUMN confidence text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='platform_services_affected') THEN
    ALTER TABLE engineering_records_library ADD COLUMN platform_services_affected text[];
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='applications_affected') THEN
    ALTER TABLE engineering_records_library ADD COLUMN applications_affected text[];
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='subsystems_affected') THEN
    ALTER TABLE engineering_records_library ADD COLUMN subsystems_affected text[];
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='technologies') THEN
    ALTER TABLE engineering_records_library ADD COLUMN technologies text[];
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='engineering_disciplines') THEN
    ALTER TABLE engineering_records_library ADD COLUMN engineering_disciplines text[];
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='primary_engineer') THEN
    ALTER TABLE engineering_records_library ADD COLUMN primary_engineer text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_records_library' AND column_name='product_owner') THEN
    ALTER TABLE engineering_records_library ADD COLUMN product_owner text;
  END IF;
END $$;

-- ─── 2. engineering_memory — knowledge domain ─────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='engineering_memory' AND column_name='knowledge_domain') THEN
    ALTER TABLE engineering_memory ADD COLUMN knowledge_domain text;
  END IF;
END $$;

-- Index for domain filtering
CREATE INDEX IF NOT EXISTS idx_eng_memory_domain ON engineering_memory(knowledge_domain);

-- ─── 3. Backfill enrichment on known authoritative records ─────────────────────

UPDATE engineering_records_library SET
  complexity = 'high', risk_rating = 'high', confidence = 'high',
  applications_affected = ARRAY['ATD', 'LLND Automate'],
  subsystems_affected = ARRAY['engineering_records_library', 'constitutional_documents', 'engineering_automation_rules'],
  technologies = ARRAY['PostgreSQL', 'React', 'TypeScript', 'Supabase'],
  engineering_disciplines = ARRAY['platform-governance', 'constitutional-engineering'],
  primary_engineer = 'Engineering System',
  product_owner = 'Product Owner'
WHERE record_ref = 'EWO-007R';

UPDATE engineering_records_library SET
  complexity = 'high', risk_rating = 'high', confidence = 'high',
  applications_affected = ARRAY['ATD', 'LLND Automate'],
  subsystems_affected = ARRAY['RLS-policies', 'organisation_id', 'tenant-isolation'],
  technologies = ARRAY['PostgreSQL', 'RLS', 'Supabase'],
  engineering_disciplines = ARRAY['security', 'platform-governance'],
  primary_engineer = 'Engineering System',
  product_owner = 'Product Owner'
WHERE record_ref IN ('EWO-007R.1', 'ERC-005');

UPDATE engineering_records_library SET
  complexity = 'critical', risk_rating = 'high', confidence = 'high',
  applications_affected = ARRAY['ATD', 'LLND Automate', 'EIOS'],
  subsystems_affected = ARRAY['constitutional_documents', 'engineering_records_library', 'engineering_automation_rules'],
  technologies = ARRAY['PostgreSQL', 'React', 'TypeScript', 'Supabase'],
  engineering_disciplines = ARRAY['constitutional-engineering', 'platform-governance', 'engineering-records'],
  primary_engineer = 'Engineering System',
  product_owner = 'Product Owner'
WHERE record_ref IN ('CONST-REC-001', 'CONST-001-AMD-002');

UPDATE engineering_records_library SET
  complexity = 'medium', risk_rating = 'medium', confidence = 'high',
  applications_affected = ARRAY['ATD'],
  subsystems_affected = ARRAY['axcelerate-queue-functions', 'edge-functions'],
  technologies = ARRAY['Deno', 'Supabase Edge Functions', 'TypeScript'],
  engineering_disciplines = ARRAY['platform-engineering', 'integration'],
  primary_engineer = 'Engineering System',
  product_owner = 'Product Owner'
WHERE record_ref = 'BATCH-A';

UPDATE engineering_records_library SET
  complexity = 'low', risk_rating = 'low', confidence = 'high',
  applications_affected = ARRAY['ATD'],
  subsystems_affected = ARRAY['executive-briefing-ui'],
  technologies = ARRAY['React', 'TypeScript'],
  engineering_disciplines = ARRAY['frontend', 'ux'],
  primary_engineer = 'Engineering System',
  product_owner = 'Product Owner'
WHERE record_ref = 'BUG-BF-001';

UPDATE engineering_records_library SET
  complexity = 'medium', risk_rating = 'low', confidence = 'high',
  applications_affected = ARRAY['ATD'],
  subsystems_affected = ARRAY['audit-framework', 'ecc-audit-page'],
  technologies = ARRAY['React', 'TypeScript', 'Supabase'],
  engineering_disciplines = ARRAY['quality-assurance', 'engineering-review'],
  primary_engineer = 'Engineering System',
  product_owner = 'Product Owner'
WHERE record_ref IN ('ERC-001', 'ERC-002');
