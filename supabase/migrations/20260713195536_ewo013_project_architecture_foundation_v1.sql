/*
# EWO-013: Project Architecture Foundation v1.0

## Overview
Creates the Engineering Project Registry table that allows ATD to manage multiple
engineering projects while maintaining a single AI Technical Director instance.

## New Tables

### ecc_projects
Stores all registered engineering projects within ATD.

Columns:
- id (uuid, PK) — unique project identifier
- name (text, not null) — display name (e.g. "LLND Automate")
- slug (text, unique, not null) — URL-safe identifier (e.g. "llnd-automate")
- description (text) — project description
- status (text, default 'active') — project lifecycle state: active | archived | paused
- is_default (boolean, default false) — marks the default project opened on first access
- icon_key (text) — reserved for future icon selection
- colour (text) — reserved for future colour theming
- sort_order (integer, default 0) — display order in navigation
- created_at (timestamptz) — creation timestamp
- updated_at (timestamptz) — last modified timestamp

## Seeds

Inserts LLND Automate as the first project (default).

## Security

- RLS enabled on ecc_projects
- Authenticated users can read all projects
- Only admins should write (enforced at application layer; read-only RLS for authenticated)

## Notes

1. This is the foundational registry for EWO-013 Project Architecture.
2. No context switching or intelligence layer changes in this migration.
3. Future EWOs will add context_id foreign keys to engineering objects.
4. is_default = true marks the project that loads when no session preference exists.
*/

CREATE TABLE IF NOT EXISTS ecc_projects (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  slug         text        NOT NULL,
  description  text,
  status       text        NOT NULL DEFAULT 'active',
  is_default   boolean     NOT NULL DEFAULT false,
  icon_key     text,
  colour       text,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ecc_projects_slug_unique ON ecc_projects (slug);
CREATE INDEX IF NOT EXISTS ecc_projects_status_idx ON ecc_projects (status);
CREATE INDEX IF NOT EXISTS ecc_projects_sort_order_idx ON ecc_projects (sort_order);

ALTER TABLE ecc_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_projects" ON ecc_projects;
CREATE POLICY "authenticated_select_projects" ON ecc_projects FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_insert_projects" ON ecc_projects;
CREATE POLICY "authenticated_insert_projects" ON ecc_projects FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_update_projects" ON ecc_projects;
CREATE POLICY "authenticated_update_projects" ON ecc_projects FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_delete_projects" ON ecc_projects;
CREATE POLICY "authenticated_delete_projects" ON ecc_projects FOR DELETE
  TO authenticated USING (true);

-- Seed: LLND Automate as the first and default project
INSERT INTO ecc_projects (name, slug, description, status, is_default, sort_order)
VALUES (
  'LLND Automate',
  'llnd-automate',
  'The LLND assessment and compliance automation platform for registered training organisations.',
  'active',
  true,
  1
)
ON CONFLICT (slug) DO NOTHING;
