// EWO-027R — Canonical MCP Resource URI
// Single source of truth for the MCP resource URL used across the platform.
// Used in: readiness self-test, documentation, app package, consent UI.

function getSupabaseUrl(): string {
  return import.meta.env.VITE_SUPABASE_URL ?? '';
}

export function getMcpResourceUrl(): string {
  return `${getSupabaseUrl()}/functions/v1/atd-mcp-server`;
}

export function getProtectedResourceMetadataUrl(): string {
  return `${getMcpResourceUrl()}/.well-known/oauth-protected-resource`;
}

export function getAuthorizationServerUrl(): string {
  return `${getSupabaseUrl()}/auth/v1`;
}

export function getConsentRouteUrl(): string {
  // The consent route is a hash-based SPA route: /#/oauth/consent
  // Supabase Auth should be configured with the path: /oauth/consent
  // The SPA router interprets #/oauth/consent and renders OAuthConsentPage
  const baseUrl = getSupabaseUrl().replace('.supabase.co', '.supabase.co');
  return `${baseUrl}/#/oauth/consent`;
}
