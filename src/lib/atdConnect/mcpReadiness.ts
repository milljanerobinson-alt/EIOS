// EWO-027 — Two-Dimension Readiness Model
// Dimension A: OAuth Infrastructure Readiness
// Dimension B: ChatGPT Workspace Capability
// Replaces the old single-dimension A-I stage model.

// ─── Dimension A: OAuth Infrastructure Readiness ─────────────────────────────

export type OAuthInfrastructureReadinessState =
  | 'READY'
  | 'CONFIGURATION_REQUIRED'
  | 'PARTIALLY_CONFIGURED'
  | 'CONFIGURATION_ERROR'
  | 'UNVERIFIED';

export interface OAuthInfrastructureReadinessInfo {
  state: OAuthInfrastructureReadinessState;
  label: string;
  description: string;
  productOwnerAction: string;
  evidence: string[];
}

export const OAUTH_INFRASTRUCTURE_STATES: Record<OAuthInfrastructureReadinessState, OAuthInfrastructureReadinessInfo> = {
  READY: {
    state: 'READY',
    label: 'Ready',
    description: 'All OAuth infrastructure components are configured and verified. The server can accept its first client connection.',
    productOwnerAction: 'None — infrastructure is ready for ChatGPT connection.',
    evidence: [
      'Authorization-server discovery reachable and valid',
      'Authorization and token endpoints advertised',
      'Protected-resource metadata valid',
      'Asymmetric signing key available (JWKS has RSA keys)',
      'Consent route configured and reachable',
      'MCP endpoint reachable',
      'Required resource-server responses present',
    ],
  },
  CONFIGURATION_REQUIRED: {
    state: 'CONFIGURATION_REQUIRED',
    label: 'Configuration Required',
    description: 'OAuth 2.1 Server is not enabled. The Product Owner must enable it in the Supabase dashboard.',
    productOwnerAction: 'Enable Supabase Auth OAuth 2.1 Server and migrate JWT signing to RS256.',
    evidence: [
      'Discovery endpoint not reachable or returned error',
    ],
  },
  PARTIALLY_CONFIGURED: {
    state: 'PARTIALLY_CONFIGURED',
    label: 'Partially Configured',
    description: 'Some OAuth components are configured but not all. For example, discovery works but JWKS is empty (HS256 still active).',
    productOwnerAction: 'Complete remaining OAuth configuration steps (e.g., migrate JWT signing to RS256).',
    evidence: [
      'Discovery endpoint reachable',
      'One or more components not yet configured',
    ],
  },
  CONFIGURATION_ERROR: {
    state: 'CONFIGURATION_ERROR',
    label: 'Configuration Error',
    description: 'OAuth metadata is present but malformed or inconsistent. Token validation fails.',
    productOwnerAction: 'Review OAuth configuration in Supabase dashboard. Check discovery metadata and JWKS.',
    evidence: [
      'Discovery endpoint returned invalid JSON',
      'or JWKS validation failed',
    ],
  },
  UNVERIFIED: {
    state: 'UNVERIFIED',
    label: 'Unverified',
    description: 'OAuth endpoints cannot be reached. Network error, timeout, or DNS failure.',
    productOwnerAction: 'Check network connectivity and Supabase project status.',
    evidence: [
      'Unable to reach OAuth endpoints',
    ],
  },
};

// ─── Dimension B: ChatGPT Workspace Capability ───────────────────────────────

export type ChatGPTWorkspaceCapabilityState = 'VERIFIED' | 'NOT_VERIFIED' | 'UNKNOWN';

export interface ChatGPTWorkspaceCapabilityInfo {
  state: ChatGPTWorkspaceCapabilityState;
  label: string;
  description: string;
  productOwnerAction: string;
}

export const CHATGPT_WORKSPACE_CAPABILITY_STATES: Record<ChatGPTWorkspaceCapabilityState, ChatGPTWorkspaceCapabilityInfo> = {
  VERIFIED: {
    state: 'VERIFIED',
    label: 'Verified',
    description: 'The Product Owner has objectively confirmed that the current ChatGPT workspace supports the required custom app / Developer Mode workflow.',
    productOwnerAction: 'None — workspace capability is verified. Proceed with ChatGPT connection test.',
  },
  NOT_VERIFIED: {
    state: 'NOT_VERIFIED',
    label: 'ChatGPT Workspace Capability Required',
    description: 'The capability has been checked and is unavailable. The workspace does not expose the required custom app or Developer Mode workflow.',
    productOwnerAction: 'Review workspace permissions, administrator configuration, or subscription plan. The MCP server is not defective — the blocker is the ChatGPT workspace.',
  },
  UNKNOWN: {
    state: 'UNKNOWN',
    label: 'Unknown',
    description: 'The workspace capability has not yet been verified. This is the default initial state.',
    productOwnerAction: 'Verify that the current ChatGPT workspace supports custom app / Developer Mode workflow. Mark as VERIFIED or NOT VERIFIED based on objective confirmation.',
  },
};

// ─── ChatGPT Connection Status ────────────────────────────────────────────────

export type ChatGPTConnectionStatusState =
  | 'NOT_TESTED'
  | 'CHATGPT_WORKSPACE_CAPABILITY_REQUIRED'
  | 'CLIENT_NOT_REGISTERED'
  | 'AUTHORIZATION_PENDING'
  | 'CONNECTED'
  | 'CONNECTION_ERROR'
  | 'UNVERIFIED';

export interface ChatGPTConnectionStatusInfo {
  state: ChatGPTConnectionStatusState;
  label: string;
  description: string;
  productOwnerAction: string;
}

export const CHATGPT_CONNECTION_STATES: Record<ChatGPTConnectionStatusState, ChatGPTConnectionStatusInfo> = {
  NOT_TESTED: {
    state: 'NOT_TESTED',
    label: 'Not Tested',
    description: 'Infrastructure is ready but no ChatGPT connection attempt has been made yet.',
    productOwnerAction: 'Register a ChatGPT client and initiate an OAuth authorization.',
  },
  CHATGPT_WORKSPACE_CAPABILITY_REQUIRED: {
    state: 'CHATGPT_WORKSPACE_CAPABILITY_REQUIRED',
    label: 'ChatGPT Workspace Capability Required',
    description: 'The Product Owner\'s current ChatGPT workspace does not support the required custom app or Developer Mode workflow.',
    productOwnerAction: 'Review workspace permissions, administrator configuration, or subscription plan. The MCP server is not defective.',
  },
  CLIENT_NOT_REGISTERED: {
    state: 'CLIENT_NOT_REGISTERED',
    label: 'Client Not Registered',
    description: 'The Product Owner has an eligible workspace but has not yet registered the ChatGPT client with the authorization server.',
    productOwnerAction: 'Register the ChatGPT client (method determined during live connection test — manual or dynamic).',
  },
  AUTHORIZATION_PENDING: {
    state: 'AUTHORIZATION_PENDING',
    label: 'Authorization Pending',
    description: 'A client is registered and an OAuth authorization has been initiated but not yet completed.',
    productOwnerAction: 'Complete the consent screen authorization.',
  },
  CONNECTED: {
    state: 'CONNECTED',
    label: 'Connected',
    description: 'An actual ChatGPT authorization has successfully completed. A valid OAuth-issued token was exchanged and a governed MCP tool call succeeded.',
    productOwnerAction: 'None — connection is established.',
  },
  CONNECTION_ERROR: {
    state: 'CONNECTION_ERROR',
    label: 'Connection Error',
    description: 'A connection attempt failed due to a technical error (token validation, endpoint misconfiguration, etc.).',
    productOwnerAction: 'Review error details and correct configuration. Re-attempt connection.',
  },
  UNVERIFIED: {
    state: 'UNVERIFIED',
    label: 'Unverified',
    description: 'Connection status cannot be determined (network error, timeout).',
    productOwnerAction: 'Check network connectivity and retry.',
  },
};

// ─── Authentication Mode Classification ───────────────────────────────────────

export type AuthenticationMode = 'OAUTH_EXTERNAL' | 'INTERNAL_DIAGNOSTIC' | 'DEVELOPMENT_SELF_TEST';

export interface AuthenticationModeInfo {
  mode: AuthenticationMode;
  label: string;
  description: string;
  rules: string[];
}

export const AUTHENTICATION_MODES: Record<AuthenticationMode, AuthenticationModeInfo> = {
  OAUTH_EXTERNAL: {
    mode: 'OAUTH_EXTERNAL',
    label: 'OAuth External Connection',
    description: 'Used by ChatGPT or other external MCP clients. Requires the complete OAuth resource-server security model.',
    rules: [
      'Requires resource/audience binding',
      'Must fail closed — rejected tokens are never retried',
      'Client identity verified from token',
    ],
  },
  INTERNAL_DIAGNOSTIC: {
    mode: 'INTERNAL_DIAGNOSTIC',
    label: 'Internal Governed Diagnostic',
    description: 'May use existing platform-native authentication. Must be explicitly marked internal or development-only.',
    rules: [
      'Must NOT be exposed as an alternative public authentication route',
      'Must NOT allow a client to bypass OAuth requirements',
      'Explicitly separated from external OAuth',
    ],
  },
  DEVELOPMENT_SELF_TEST: {
    mode: 'DEVELOPMENT_SELF_TEST',
    label: 'Development Self-Test',
    description: 'May use an isolated diagnostic credential only in an approved non-production context.',
    rules: [
      'Must NOT use the public anon key as proof of authenticated user access',
      'Must NEVER be presented as a successful production OAuth test',
      'Marked as "Development Diagnostic" in the UI',
    ],
  },
};

// ─── Helper Functions ─────────────────────────────────────────────────────────

export function getOAuthInfrastructureStateInfo(state: OAuthInfrastructureReadinessState): OAuthInfrastructureReadinessInfo {
  return OAUTH_INFRASTRUCTURE_STATES[state];
}

export function getChatGPTWorkspaceCapabilityInfo(state: ChatGPTWorkspaceCapabilityState): ChatGPTWorkspaceCapabilityInfo {
  return CHATGPT_WORKSPACE_CAPABILITY_STATES[state];
}

export function getChatGPTConnectionStatusInfo(state: ChatGPTConnectionStatusState): ChatGPTConnectionStatusInfo {
  return CHATGPT_CONNECTION_STATES[state];
}

export function getAuthenticationModeInfo(mode: AuthenticationMode): AuthenticationModeInfo {
  return AUTHENTICATION_MODES[mode];
}

// ─── Legacy A-I Stages (preserved for backward compatibility) ──────────────────

export type ReadinessStage = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';

export interface ReadinessStageInfo {
  stage: ReadinessStage;
  label: string;
  description: string;
  complete: boolean;
  evidence: string | null;
  manual: boolean;
}

export const READINESS_STAGES: ReadinessStageInfo[] = [
  { stage: 'A', label: 'Remote MCP Server Implemented', description: 'The MCP server edge function is deployed and responds to JSON-RPC requests.', complete: true, evidence: 'Edge function "atd-mcp-server" deployed via Supabase. Implements MCP JSON-RPC protocol over HTTP POST.', manual: false },
  { stage: 'B', label: 'MCP Tool Scan Verified', description: 'An MCP test client successfully retrieves the tool list (tools/list).', complete: true, evidence: 'Self-test harness verifies tools/list returns 7 read-only tools with valid schemas.', manual: false },
  { stage: 'C', label: 'Authentication Flow Verified', description: 'Authentication is verified independently — unauthenticated access is rejected, authenticated access succeeds.', complete: true, evidence: 'Edge function requires Authorization header with valid Supabase JWT. Unauthenticated requests return 401 with WWW-Authenticate. Authenticated requests proceed.', manual: false },
  { stage: 'D', label: 'ChatGPT App Configuration Package Complete', description: 'The complete package required to register ATD Connect as a custom ChatGPT app is available.', complete: true, evidence: 'ChatGPT app package document available at docs/chatgpt-app-package.md with server URL, tool metadata, OAuth flow config, and setup instructions.', manual: false },
  { stage: 'E', label: 'ChatGPT Workspace Capability Verified', description: 'The Product Owner has verified the ChatGPT workspace supports custom app / Developer Mode workflow.', complete: false, evidence: null, manual: true },
  { stage: 'F', label: 'ChatGPT App Connected and Authenticated', description: 'The ChatGPT app has been connected to the remote MCP server and authenticated via OAuth.', complete: false, evidence: null, manual: true },
  { stage: 'G', label: 'Tool Invocation from ChatGPT Verified', description: 'A tool has been invoked from an actual ChatGPT conversation.', complete: false, evidence: null, manual: true },
  { stage: 'H', label: 'Governed EIOS DTO Returned to ChatGPT', description: 'A governed EIOS DTO has been successfully returned to ChatGPT through the MCP server.', complete: false, evidence: null, manual: true },
  { stage: 'I', label: 'Matching EIOS Audit Record Verified', description: 'The EIOS audit record matching the ChatGPT request has been verified.', complete: false, evidence: null, manual: true },
];

export function getReadinessStage(stage: ReadinessStage): ReadinessStageInfo | undefined {
  return READINESS_STAGES.find(s => s.stage === stage);
}

export function getReadinessSummary(): { completed: number; total: number; allComplete: boolean } {
  const completed = READINESS_STAGES.filter(s => s.complete).length;
  return { completed, total: READINESS_STAGES.length, allComplete: completed === READINESS_STAGES.length };
}
