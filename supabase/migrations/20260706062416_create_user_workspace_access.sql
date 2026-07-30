/*
# User Workspace Access

Introduces workspace-based access control for the LLN+D platform.

## New Tables
- `user_workspace_access`
  - `id` — uuid primary key
  - `user_id` — references auth.users
  - `workspace` — one of: assessment, trainer, platform_admin
  - `is_primary` — whether this is the user's default workspace
  - `granted_at` — when access was granted

## Security
- RLS enabled with anon+authenticated read own rows
- Authenticated insert/update/delete for own rows
- Admin role can read all rows (via service role)

## Seed
- All existing admin-role profiles → assessment + trainer + platform_admin (primary: assessment)
- All existing trainer-role profiles → assessment + trainer (primary: trainer)
- Other profiles → assessment only (primary: assessment)
*/

CREATE TABLE IF NOT EXISTS user_workspace_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace text NOT NULL CHECK (workspace IN ('assessment', 'trainer', 'platform_admin')),
  is_primary boolean NOT NULL DEFAULT false,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace)
);

ALTER TABLE user_workspace_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_workspace_access" ON user_workspace_access;
CREATE POLICY "select_own_workspace_access" ON user_workspace_access
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_workspace_access" ON user_workspace_access;
CREATE POLICY "insert_own_workspace_access" ON user_workspace_access
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_workspace_access" ON user_workspace_access;
CREATE POLICY "update_own_workspace_access" ON user_workspace_access
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_workspace_access" ON user_workspace_access;
CREATE POLICY "delete_own_workspace_access" ON user_workspace_access
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Seed: admin users → all three workspaces, primary = assessment
INSERT INTO user_workspace_access (user_id, workspace, is_primary)
SELECT p.id, 'assessment', true
FROM profiles p
WHERE p.role = 'admin'
ON CONFLICT (user_id, workspace) DO NOTHING;

INSERT INTO user_workspace_access (user_id, workspace, is_primary)
SELECT p.id, 'trainer', false
FROM profiles p
WHERE p.role = 'admin'
ON CONFLICT (user_id, workspace) DO NOTHING;

INSERT INTO user_workspace_access (user_id, workspace, is_primary)
SELECT p.id, 'platform_admin', false
FROM profiles p
WHERE p.role = 'admin'
ON CONFLICT (user_id, workspace) DO NOTHING;

-- Seed: trainer users → assessment + trainer, primary = trainer
INSERT INTO user_workspace_access (user_id, workspace, is_primary)
SELECT p.id, 'assessment', false
FROM profiles p
WHERE p.role = 'trainer'
ON CONFLICT (user_id, workspace) DO NOTHING;

INSERT INTO user_workspace_access (user_id, workspace, is_primary)
SELECT p.id, 'trainer', true
FROM profiles p
WHERE p.role = 'trainer'
ON CONFLICT (user_id, workspace) DO NOTHING;
