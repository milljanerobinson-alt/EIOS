/*
# Engineering Standards Module — Schema

Creates the three tables that power the Engineering Standards system inside the EOC.

## New Tables

### ecc_standards_versions
Tracks named versions of the Engineering Standards document (v1.0, v1.1, v2.0…).
- version_number: unique label (e.g. '1.0')
- status: 'current' or 'archived'
- author, release_notes, released_at

### ecc_engineering_standards
Individual standards entries in the library.
- category: Architecture | Database | Backend | Frontend | Security | Performance |
             Testing | Documentation | AI Collaboration | Code Quality |
             Release Management | Operations
- title, body: the standard rule and its explanation
- status: 'active' or 'deprecated'
- sort_order, tags, version_introduced

### ecc_standards_changelog
Audit trail of changes to the standards over time.
- version_number, author, change_reason, change_summary, affected_standards[]

## Security
- RLS enabled on all three tables.
- Policies scoped to `authenticated` (EOC is admin-only).
- Full CRUD for authenticated users.
*/

CREATE TABLE IF NOT EXISTS ecc_standards_versions (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  version_number text        NOT NULL,
  status         text        NOT NULL DEFAULT 'current',
  author         text        NOT NULL DEFAULT 'Engineering',
  release_notes  text,
  released_at    timestamptz DEFAULT now(),
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ecc_standards_versions_number
  ON ecc_standards_versions(version_number);

CREATE TABLE IF NOT EXISTS ecc_engineering_standards (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  version_introduced  text        NOT NULL DEFAULT '1.0',
  category            text        NOT NULL,
  title               text        NOT NULL,
  body                text        NOT NULL,
  status              text        NOT NULL DEFAULT 'active',
  sort_order          int         NOT NULL DEFAULT 0,
  tags                text[]      DEFAULT '{}',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecc_engineering_standards_category
  ON ecc_engineering_standards(category);
CREATE INDEX IF NOT EXISTS idx_ecc_engineering_standards_status
  ON ecc_engineering_standards(status);

CREATE TABLE IF NOT EXISTS ecc_standards_changelog (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  version_number      text        NOT NULL,
  author              text        NOT NULL DEFAULT 'Engineering',
  change_reason       text,
  change_summary      text        NOT NULL,
  affected_standards  text[]      DEFAULT '{}',
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecc_standards_changelog_version
  ON ecc_standards_changelog(version_number);

-- RLS
ALTER TABLE ecc_standards_versions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecc_engineering_standards  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecc_standards_changelog    ENABLE ROW LEVEL SECURITY;

-- ecc_standards_versions policies
DROP POLICY IF EXISTS "select_standards_versions" ON ecc_standards_versions;
CREATE POLICY "select_standards_versions" ON ecc_standards_versions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_standards_versions" ON ecc_standards_versions;
CREATE POLICY "insert_standards_versions" ON ecc_standards_versions
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_standards_versions" ON ecc_standards_versions;
CREATE POLICY "update_standards_versions" ON ecc_standards_versions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_standards_versions" ON ecc_standards_versions;
CREATE POLICY "delete_standards_versions" ON ecc_standards_versions
  FOR DELETE TO authenticated USING (true);

-- ecc_engineering_standards policies
DROP POLICY IF EXISTS "select_engineering_standards" ON ecc_engineering_standards;
CREATE POLICY "select_engineering_standards" ON ecc_engineering_standards
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_engineering_standards" ON ecc_engineering_standards;
CREATE POLICY "insert_engineering_standards" ON ecc_engineering_standards
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_engineering_standards" ON ecc_engineering_standards;
CREATE POLICY "update_engineering_standards" ON ecc_engineering_standards
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_engineering_standards" ON ecc_engineering_standards;
CREATE POLICY "delete_engineering_standards" ON ecc_engineering_standards
  FOR DELETE TO authenticated USING (true);

-- ecc_standards_changelog policies
DROP POLICY IF EXISTS "select_standards_changelog" ON ecc_standards_changelog;
CREATE POLICY "select_standards_changelog" ON ecc_standards_changelog
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_standards_changelog" ON ecc_standards_changelog;
CREATE POLICY "insert_standards_changelog" ON ecc_standards_changelog
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_standards_changelog" ON ecc_standards_changelog;
CREATE POLICY "update_standards_changelog" ON ecc_standards_changelog
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_standards_changelog" ON ecc_standards_changelog;
CREATE POLICY "delete_standards_changelog" ON ecc_standards_changelog
  FOR DELETE TO authenticated USING (true);
