/*
# EWO-034R.2: GitHub-Native Repository Configuration

## Purpose
Stores governed repository configuration for the EIOS project so that
autonomous execution operates against the authoritative GitHub repository
through the GitHub REST API — never through a local filesystem clone.

## New Tables

### github_repository_config
Stores the canonical repository configuration for each EIOS project.
- project_id: the EIOS project identifier
- repository_owner: GitHub organization or user (e.g. "my-org")
- repository_name: GitHub repository name (e.g. "my-app")
- credential_ref: reference to the GitHub credential stored in edge function secrets
- credential_type: "github_app" or "fine_grained_token"
- default_base_branch: the branch to create EWO branches from (e.g. "main")
- staging_branch: the staging environment branch (e.g. "staging")
- production_branch: the production environment branch (e.g. "main")
- allowed_source_directories: text[] of directories Codex is permitted to read/modify
- protected_paths: text[] of paths that must never be modified
- workflow_file: the GitHub Actions workflow file path (e.g. ".github/workflows/ewo-verify.yml")
- lifecycle_status: "active" | "paused" | "retired"
- github_api_base: the GitHub API base URL (defaults to "https://api.github.com")
- installation_id: GitHub App installation ID (if using GitHub App auth)

### github_execution_evidence
Stores evidence for each GitHub-native execution including branch, commit,
workflow, and diff information.
- execution_id: the execution session ID
- ewo_ref: the EWO reference
- repository_owner: GitHub org/user
- repository_name: GitHub repo name
- base_branch: the base branch
- base_commit_sha: the commit SHA at branch creation
- ewo_branch: the isolated EWO branch name
- branch_url: full GitHub URL to the branch
- commit_shas: text[] of all commit SHAs created
- canonical_diff: the diff between base and EWO branch
- diff_url: GitHub compare URL
- workflow_run_id: GitHub Actions workflow run ID
- workflow_run_url: URL to the workflow run
- workflow_conclusion: "success" | "failure" | "cancelled" | null (if still running)
- workflow_started_at: timestamp
- workflow_completed_at: timestamp
- acceptance_criteria_result: JSONB of acceptance criteria evaluation
- pull_request_url: URL to PR if created
- po_decision: "accepted" | "rejected" | null
- po_decision_at: timestamp
- created_at: timestamp

## Security
- Both tables have RLS enabled
- Policies allow authenticated users to read and insert
- Updates restricted to authenticated users
*/

CREATE TABLE IF NOT EXISTS github_repository_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  repository_owner text NOT NULL,
  repository_name text NOT NULL,
  credential_ref text NOT NULL DEFAULT 'github_token',
  credential_type text NOT NULL DEFAULT 'fine_grained_token',
  default_base_branch text NOT NULL DEFAULT 'main',
  staging_branch text DEFAULT 'staging',
  production_branch text NOT NULL DEFAULT 'main',
  allowed_source_directories text[] NOT NULL DEFAULT ARRAY['src/', 'supabase/functions/', 'public/'],
  protected_paths text[] NOT NULL DEFAULT ARRAY['.env', '.env.*', '.gitignore', 'package-lock.json', 'supabase/migrations/'],
  workflow_file text NOT NULL DEFAULT '.github/workflows/ewo-verify.yml',
  lifecycle_status text NOT NULL DEFAULT 'active',
  github_api_base text NOT NULL DEFAULT 'https://api.github.com',
  installation_id bigint,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(project_id)
);

ALTER TABLE github_repository_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_github_repo_config" ON github_repository_config;
CREATE POLICY "select_github_repo_config"
  ON github_repository_config FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_github_repo_config" ON github_repository_config;
CREATE POLICY "insert_github_repo_config"
  ON github_repository_config FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_github_repo_config" ON github_repository_config;
CREATE POLICY "update_github_repo_config"
  ON github_repository_config FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS github_execution_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id text NOT NULL,
  ewo_ref text NOT NULL,
  repository_owner text NOT NULL,
  repository_name text NOT NULL,
  base_branch text NOT NULL,
  base_commit_sha text,
  ewo_branch text NOT NULL,
  branch_url text,
  commit_shas text[] DEFAULT '{}',
  canonical_diff text,
  diff_url text,
  workflow_run_id bigint,
  workflow_run_url text,
  workflow_conclusion text,
  workflow_started_at timestamptz,
  workflow_completed_at timestamptz,
  acceptance_criteria_result jsonb,
  pull_request_url text,
  po_decision text,
  po_decision_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(ewo_ref)
);

ALTER TABLE github_execution_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_github_exec_evidence" ON github_execution_evidence;
CREATE POLICY "select_github_exec_evidence"
  ON github_execution_evidence FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_github_exec_evidence" ON github_execution_evidence;
CREATE POLICY "insert_github_exec_evidence"
  ON github_execution_evidence FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_github_exec_evidence" ON github_execution_evidence;
CREATE POLICY "update_github_exec_evidence"
  ON github_execution_evidence FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_github_exec_evidence_ewo_ref ON github_execution_evidence(ewo_ref);
CREATE INDEX IF NOT EXISTS idx_github_repo_config_project ON github_repository_config(project_id);
