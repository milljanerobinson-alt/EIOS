/*
 * EWO-035 — GitHub Bootstrap RPC Functions
 * 
 * Provides server-side GitHub API access for repository initialization.
 * Uses the github_token stored in vault secrets.
 */

-- Get the GitHub token from vault
CREATE OR REPLACE FUNCTION get_github_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token text;
BEGIN
  SELECT decrypted_secret INTO token
  FROM vault.decrypted_secrets
  WHERE name = 'github_token'
  LIMIT 1;
  RETURN token;
END;
$$;

-- Initialize an empty GitHub repo by creating the first file via the Contents API
-- Uses http extension to call GitHub REST API directly
CREATE OR REPLACE FUNCTION github_init_repo(
  p_owner text,
  p_repo text,
  p_path text DEFAULT '.gitkeep',
  p_content text DEFAULT 'EIOS canonical repository',
  p_message text DEFAULT 'chore: initialize repository'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token text;
  response jsonb;
  status_code int;
  content_b64 text;
  url text;
BEGIN
  SELECT get_github_token() INTO token;
  IF token IS NULL OR token = '' THEN
    RETURN jsonb_build_object('error', 'GitHub token not found in vault');
  END IF;

  -- Encode content to base64
  content_b64 := encode(p_content::bytea, 'base64');
  url := 'https://api.github.com/repos/' || p_owner || '/' || p_repo || '/contents/' || p_path;

  SELECT 
    status_code,
    content::jsonb
  INTO status_code, response
  FROM http_put(
    url,
    jsonb_build_object(
      'message', p_message,
      'content', content_b64
    )::text,
    'application/json',
    ARRAY[
      'Authorization: Bearer ' || token,
      'Accept: application/vnd.github+json',
      'X-GitHub-Api-Version: 2022-11-28',
      'User-Agent: EIOS-Bootstrap'
    ]
  );

  IF status_code >= 200 AND status_code < 300 THEN
    RETURN jsonb_build_object('success', true, 'status', status_code, 'data', response);
  ELSE
    RETURN jsonb_build_object('success', false, 'status', status_code, 'error', response->>'message', 'data', response);
  END IF;
END;
$$;

-- Create a git tree with multiple files (for batch commits)
CREATE OR REPLACE FUNCTION github_create_tree(
  p_owner text,
  p_repo text,
  p_base_tree text DEFAULT NULL,
  p_tree_items jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token text;
  response jsonb;
  status_code int;
  url text;
  payload jsonb;
BEGIN
  SELECT get_github_token() INTO token;
  IF token IS NULL OR token = '' THEN
    RETURN jsonb_build_object('error', 'GitHub token not found in vault');
  END IF;

  url := 'https://api.github.com/repos/' || p_owner || '/' || p_repo || '/git/trees';
  payload := jsonb_build_object('tree', p_tree_items);
  IF p_base_tree IS NOT NULL THEN
    payload := jsonb_set(payload, '{base_tree}', to_jsonb(p_base_tree));
  END IF;

  SELECT 
    status_code,
    content::jsonb
  INTO status_code, response
  FROM http_post(
    url,
    payload::text,
    'application/json',
    ARRAY[
      'Authorization: Bearer ' || token,
      'Accept: application/vnd.github+json',
      'X-GitHub-Api-Version: 2022-11-28',
      'User-Agent: EIOS-Bootstrap'
    ]
  );

  IF status_code >= 200 AND status_code < 300 THEN
    RETURN jsonb_build_object('success', true, 'status', status_code, 'sha', response->>'sha', 'data', response);
  ELSE
    RETURN jsonb_build_object('success', false, 'status', status_code, 'error', response->>'message', 'data', response);
  END IF;
END;
$$;

-- Create a git commit
CREATE OR REPLACE FUNCTION github_create_commit(
  p_owner text,
  p_repo text,
  p_tree_sha text,
  p_message text,
  p_parents text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token text;
  response jsonb;
  status_code int;
  url text;
  payload jsonb;
BEGIN
  SELECT get_github_token() INTO token;
  IF token IS NULL OR token = '' THEN
    RETURN jsonb_build_object('error', 'GitHub token not found in vault');
  END IF;

  url := 'https://api.github.com/repos/' || p_owner || '/' || p_repo || '/git/commits';
  payload := jsonb_build_object('message', p_message, 'tree', p_tree_sha);
  IF p_parents IS NOT NULL THEN
    payload := jsonb_set(payload, '{parents}', to_jsonb(p_parents));
  END IF;

  SELECT 
    status_code,
    content::jsonb
  INTO status_code, response
  FROM http_post(
    url,
    payload::text,
    'application/json',
    ARRAY[
      'Authorization: Bearer ' || token,
      'Accept: application/vnd.github+json',
      'X-GitHub-Api-Version: 2022-11-28',
      'User-Agent: EIOS-Bootstrap'
    ]
  );

  IF status_code >= 200 AND status_code < 300 THEN
    RETURN jsonb_build_object('success', true, 'status', status_code, 'sha', response->>'sha', 'data', response);
  ELSE
    RETURN jsonb_build_object('success', false, 'status', status_code, 'error', response->>'message', 'data', response);
  END IF;
END;
$$;

-- Update or create a branch ref
CREATE OR REPLACE FUNCTION github_update_ref(
  p_owner text,
  p_repo text,
  p_branch text,
  p_sha text,
  p_create boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token text;
  response jsonb;
  status_code int;
  url text;
  payload jsonb;
BEGIN
  SELECT get_github_token() INTO token;
  IF token IS NULL OR token = '' THEN
    RETURN jsonb_build_object('error', 'GitHub token not found in vault');
  END IF;

  IF p_create THEN
    url := 'https://api.github.com/repos/' || p_owner || '/' || p_repo || '/git/refs';
    payload := jsonb_build_object('ref', 'refs/heads/' || p_branch, 'sha', p_sha);
    SELECT status_code, content::jsonb INTO status_code, response
    FROM http_post(url, payload::text, 'application/json', ARRAY[
      'Authorization: Bearer ' || token, 'Accept: application/vnd.github+json',
      'X-GitHub-Api-Version: 2022-11-28', 'User-Agent: EIOS-Bootstrap'
    ]);
  ELSE
    url := 'https://api.github.com/repos/' || p_owner || '/' || p_repo || '/git/refs/heads/' || p_branch;
    payload := jsonb_build_object('sha', p_sha);
    -- Use http extension PATCH — need to use a different approach
    -- pg_net doesn't have http_patch, use a raw request
    SELECT status_code, content::jsonb INTO status_code, response
    FROM http_post(url || '?_method=PATCH', payload::text, 'application/json', ARRAY[
      'Authorization: Bearer ' || token, 'Accept: application/vnd.github+json',
      'X-GitHub-Api-Version: 2022-11-28', 'User-Agent: EIOS-Bootstrap',
      'X-HTTP-Method-Override: PATCH'
    ]);
  END IF;

  IF status_code >= 200 AND status_code < 300 THEN
    RETURN jsonb_build_object('success', true, 'status', status_code, 'data', response);
  ELSE
    RETURN jsonb_build_object('success', false, 'status', status_code, 'error', response->>'message', 'data', response);
  END IF;
END;
$$;

-- Get branch info
CREATE OR REPLACE FUNCTION github_get_branch(
  p_owner text,
  p_repo text,
  p_branch text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token text;
  response jsonb;
  status_code int;
  url text;
BEGIN
  SELECT get_github_token() INTO token;
  IF token IS NULL OR token = '' THEN
    RETURN jsonb_build_object('error', 'GitHub token not found in vault');
  END IF;

  url := 'https://api.github.com/repos/' || p_owner || '/' || p_repo || '/branches/' || p_branch;

  SELECT status_code, content::jsonb INTO status_code, response
  FROM http_get(url, ARRAY[
    'Authorization: Bearer ' || token, 'Accept: application/vnd.github+json',
    'X-GitHub-Api-Version: 2022-11-28', 'User-Agent: EIOS-Bootstrap'
  ]);

  IF status_code >= 200 AND status_code < 300 THEN
    RETURN jsonb_build_object('success', true, 'sha', response->'commit'->>'sha', 'data', response);
  ELSE
    RETURN jsonb_build_object('success', false, 'status', status_code, 'data', response);
  END IF;
END;
$$;

-- Verify remote repo state
CREATE OR REPLACE FUNCTION github_verify_repo(
  p_owner text,
  p_repo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token text;
  response jsonb;
  status_code int;
  url text;
BEGIN
  SELECT get_github_token() INTO token;
  IF token IS NULL OR token = '' THEN
    RETURN jsonb_build_object('error', 'GitHub token not found in vault');
  END IF;

  url := 'https://api.github.com/repos/' || p_owner || '/' || p_repo;

  SELECT status_code, content::jsonb INTO status_code, response
  FROM http_get(url, ARRAY[
    'Authorization: Bearer ' || token, 'Accept: application/vnd.github+json',
    'X-GitHub-Api-Version: 2022-11-28', 'User-Agent: EIOS-Bootstrap'
  ]);

  IF status_code >= 200 AND status_code < 300 THEN
    RETURN jsonb_build_object(
      'accessible', true,
      'default_branch', response->>'default_branch',
      'private', response->>'private',
      'size', response->>'size',
      'html_url', response->>'html_url'
    );
  ELSE
    RETURN jsonb_build_object('accessible', false, 'status', status_code, 'error', response->>'message');
  END IF;
END;
$$;

-- Check workflows
CREATE OR REPLACE FUNCTION github_check_workflows(
  p_owner text,
  p_repo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token text;
  response jsonb;
  status_code int;
  url text;
BEGIN
  SELECT get_github_token() INTO token;
  IF token IS NULL OR token = '' THEN
    RETURN jsonb_build_object('error', 'GitHub token not found in vault');
  END IF;

  url := 'https://api.github.com/repos/' || p_owner || '/' || p_repo || '/actions/workflows';

  SELECT status_code, content::jsonb INTO status_code, response
  FROM http_get(url, ARRAY[
    'Authorization: Bearer ' || token, 'Accept: application/vnd.github+json',
    'X-GitHub-Api-Version: 2022-11-28', 'User-Agent: EIOS-Bootstrap'
  ]);

  IF status_code >= 200 AND status_code < 300 THEN
    RETURN jsonb_build_object('accessible', true, 'workflows', response->'workflows');
  ELSE
    RETURN jsonb_build_object('accessible', false, 'status', status_code);
  END IF;
END;
$$;
