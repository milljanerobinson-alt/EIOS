/**
 * EWO-032R.9: Codex Provider Health Check — Shared Credential
 *
 * Delegates to the governed `codex-health-check` edge function, which resolves
 * the shared OpenAI credential from settings.openai_api_key (service role only)
 * and performs a real OpenAI /models check. The frontend never sees the raw key.
 */

import type { CodexHealthCheckResult } from './codexTypes';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export async function performHealthCheck(
  environment: string,
  skipApiCheck = false,
): Promise<CodexHealthCheckResult> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/codex-health-check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ environment, skipApiCheck }),
  });

  const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));

  if (!response.ok) {
    throw new Error(data.error || `Health check failed: HTTP ${response.status}`);
  }

  return data as CodexHealthCheckResult;
}
