# ATD Connect — ChatGPT Custom App Package

## App Metadata

- **App Name:** ATD Connect
- **Description:** "Read-only governed inspection of the EIOS engineering platform through ATD Connect."
- **Category:** Developer Tools / Engineering
- **Permissions:** Read-only (no write, no mutation, no destructive actions)

## Remote MCP Server

- **Transport:** Streamable HTTP (JSON-RPC 2.0 over HTTP POST)
- **Protocol Version:** 2025-11-25 (current stable MCP spec)
- **Server URL:** `https://<your-supabase-project>.supabase.co/functions/v1/atd-mcp-server`
- **Authentication:** OAuth 2.1 via Supabase Auth (Bearer token)

## OAuth 2.1 Resource Server Architecture

### Roles

- **Authorization Server:** Supabase Auth OAuth 2.1 Server
- **Resource Server:** ATD Connect MCP Server (the edge function)
- **Client:** ChatGPT (or other MCP client)

The MCP server is the RESOURCE SERVER. It does NOT implement its own OAuth Authorization Server. All OAuth flow logic (authorization, token issuance, consent) is handled by Supabase Auth.

### Protected Resource Metadata

The MCP server exposes a protected-resource metadata endpoint (RFC 9728):

```
GET https://<your-supabase-project>.supabase.co/functions/v1/atd-mcp-server/.well-known/oauth-protected-resource
```

Response:
```json
{
  "resource": "<mcp-server-url>",
  "authorization_servers": ["<supabase-url>/auth/v1"],
  "scopes_supported": ["openid", "profile", "email"],
  "resource_documentation": "<mcp-server-url>",
  "bearer_token_methods_supported": ["header"]
}
```

No authentication is required for this endpoint.

### WWW-Authenticate Challenge

When the MCP server rejects an unauthenticated request, it returns HTTP 401 with:

```
WWW-Authenticate: Bearer resource_metadata="<mcp-server-url>/.well-known/oauth-protected-resource"
```

This allows MCP clients (including ChatGPT) to automatically discover the OAuth configuration.

### Scopes

- **Identity scopes:** `openid`, `profile`, `email` (standard OAuth/OIDC)
- These scopes control identity information returned by the OAuth provider
- They do NOT grant resource authorization
- Actual inspection authorization is determined by EIOS access policy (user, role, project, and governance controls)
- Protected-resource metadata lists identity scopes for OAuth flow compatibility only

### Consent

- **Consent UI:** EIOS frontend at `#/oauth/consent`
- Receives `authorization_id` query parameter
- Authenticated user views client name and requested scopes
- Approve/Deny buttons call Supabase Auth OAuth functions
- Redirect to `redirect_url` after decision

## ChatGPT Workspace Capability

The platform reports verified capability rather than inferring capability from subscription level.

### Governed Capability State

| State | Definition |
|-------|------------|
| VERIFIED | The Product Owner has objectively confirmed that the current ChatGPT workspace supports the required custom app / Developer Mode workflow. |
| NOT VERIFIED | The capability has been checked and is unavailable. |
| UNKNOWN | The capability has not yet been verified (default). |

If the capability is NOT VERIFIED, the readiness indicator shows **ChatGPT Workspace Capability Required**. The MCP server is NOT reported as defective — the blocker is the ChatGPT workspace.

Subscription names may be shown as informational metadata only. Engineering never encodes plan-specific logic (e.g., `if plan == Plus`).

## Authentication Configuration

### Method
- **Type:** Bearer Token (OAuth 2.1)
- **Token Format:** Supabase JWT access token (RS256-signed when OAuth is configured)
- **Header:** `Authorization: Bearer <token>`

### Authorization Server
- **Authorisation Server:** Supabase Auth OAuth 2.1 Server
- **Discovery:** `https://<your-supabase-project>.supabase.co/.well-known/oauth-authorization-server/auth/v1`
- **Token Endpoint:** `https://<your-supabase-project>.supabase.co/auth/v1/token`
- **Authorization Endpoint:** `https://<your-supabase-project>.supabase.co/auth/v1/authorize`
- **JWKS:** `https://<your-supabase-project>.supabase.co/auth/v1/.well-known/jwks.json`
- **Scopes:** `openid profile email`
- **Consent Route:** `https://<your-app>/#/oauth/consent`

### Authentication Modes

| Mode | Description |
|------|-------------|
| OAuth External Connection | Used by ChatGPT or other external MCP clients. Full resource-server security model. Requires resource/audience binding. Fail-closed. |
| Internal Governed Diagnostic | Platform-native authentication for internal use. Explicitly marked internal. Not exposed as public authentication route. |
| Development Self-Test | Isolated diagnostic credential for non-production context. Anon key is NOT proof of authenticated user access. |

### Token Validation Strategy

The MCP server uses an evidence-based token validation strategy:

1. **Stage 1:** Test whether `getUser()` validates all required security properties (signature, issuer, expiration, nbf, subject, client identity, resource/audience binding, wrong-resource rejection, malformed token rejection).
2. **Stage 2:** If Stage 1 passes, retain `getUser()`. No JWKS validation needed.
3. **Stage 3:** If Stage 1 fails any property, implement explicit JWKS or claims validation for the missing properties. Failures return 401. Never fall back to a weaker path.

**Fail-closed:** A token that fails an authoritative validation path is always rejected. It is never retried through a weaker authentication mechanism.

## Required Configuration Values

| Value | Description | Required |
|-------|-------------|----------|
| Server URL | The Supabase edge function URL | Yes |
| OAuth 2.1 Server | Enabled in Supabase Auth | Yes (for live OAuth) |
| RS256 Signing | JWT signing migrated from HS256 to RS256 | Yes (for live OAuth) |
| Consent Route | Authorization path set to /oauth/consent | Yes (for live OAuth) |

## Tool Metadata

### 1. discover_atd_capabilities
- **Description:** Lists all registered ATD Connect governed inspection capabilities.
- **Parameters:** `persona` (optional, string, default "atd")
- **Returns:** Capability list with IDs, names, descriptions, lifecycle status
- **Read-only:** Yes

### 2. inspect_engineering_object
- **Description:** Inspects a specific engineering object using a governed capability.
- **Parameters:** `capability` (required), `operation` (required), `object_reference` (required), `persona` (optional)
- **Returns:** Governed DTO with metadata, health, lifecycle information
- **Read-only:** Yes

### 3. list_engineering_objects
- **Description:** Lists authorised engineering objects for a supported capability.
- **Parameters:** `capability` (required), `persona` (optional)
- **Returns:** Governed list DTO
- **Read-only:** Yes

### 4. inspect_relationships
- **Description:** Returns governed relationship information for an engineering object.
- **Parameters:** `object_reference` (required), `persona` (optional)
- **Returns:** Relationship graph with nodes and edges
- **Read-only:** Yes

### 5. inspect_platform_health
- **Description:** Returns supported governed health dimensions.
- **Parameters:** None
- **Returns:** Health dimensions (operational, inspection availability, evidence, relationship)
- **Read-only:** Yes

### 6. get_inspection_audit
- **Description:** Retrieves authorised ATD Connect inspection audit entries.
- **Parameters:** `limit` (optional, number, default 20, max 100), `request_source` (optional, enum)
- **Returns:** Audit records with request IDs, operations, outcomes, timestamps
- **Read-only:** Yes

### 7. submit_conversation_inspection
- **Description:** Submits a natural-language request through the Conversation Inspection Bridge.
- **Parameters:** `natural_language_request` (required), `conversation_id` (required — UUID v4, auto-generated by ChatGPT on first call, reused for subsequent calls in the same conversation), `requesting_persona` (optional), `client_id` (optional), `session_id` (optional)
- **Returns:** Governed response with interpretation, resolved capability/operation, inspection result
- **Read-only:** Yes (write requests are refused)
- **Conversation Identity:** ChatGPT's model generates a random UUID v4 as `conversation_id` on the first tool call in a conversation and reuses the same UUID for every subsequent call. Separate conversations use separate UUIDs. This enables contextual continuity so references like "the current EWO" resolve correctly. The user never types or copies the UUID.

## Privacy and Data-Handling Summary

- ATD Connect is a **read-only** inspection platform. No user data is modified.
- All responses are governed DTOs — no raw database rows are exposed.
- Audit logs record every request with timestamp, persona, and outcome.
- No access tokens, refresh tokens, or secrets are stored in audit logs.
- Tool descriptions and returned EIOS content are treated as untrusted data.
- Content returned by inspected objects cannot alter MCP permissions, tool definitions, or governance rules.

## Read-Only Permissions Statement

ATD Connect exposes **only read-only inspection tools**. No mutation, creation, deletion, approval, closure, deployment, or execution tools are available. All tools are annotated with `readOnlyHint: true` and `destructiveHint: false`. Write-style natural-language requests are detected and refused with governed refusal responses.

## Test Prompts

### Prompt 1: Capability Discovery
```
Using ATD Connect, list every registered engineering capability.
```
**Expected Tool Mapping:** `discover_atd_capabilities`
**Expected Result:** Governed list of 13 capabilities with IDs, names, and lifecycle status.

### Prompt 2: Object Inspection
```
Using ATD Connect, inspect EWO-024.
```
**Expected Tool Mapping:** `submit_conversation_inspection` → resolves to `inspect_engineering_object`
**Expected Result:** Governed DTO with EWO-024 details, lifecycle status, and related objects.

### Prompt 3: Write Request (Should Fail)
```
Using ATD Connect, close EWO-024.
```
**Expected Tool Mapping:** `submit_conversation_inspection` → refused
**Expected Result:** Governed refusal with alternatives (Inspect EWO-024, Show relationships for EWO-024, etc.)

### Prompt 4: Relationship Inspection
```
Using ATD Connect, show relationships for EWO-024.
```
**Expected Tool Mapping:** `inspect_relationships`
**Expected Result:** Governed relationship graph with nodes and edges.

### Prompt 5: Platform Health
```
Using ATD Connect, show platform health.
```
**Expected Tool Mapping:** `inspect_platform_health`
**Expected Result:** Health dimensions with operational status and inspection counts.

## Product Owner Setup Instructions

### Step 1: Deploy the MCP Server
The MCP server edge function `atd-mcp-server` is already deployed to Supabase.

### Step 2: Enable OAuth 2.1 Server (Product Owner)
1. Open Supabase Dashboard → Authentication → Providers → OAuth 2.1 Server.
2. Enable the OAuth 2.1 Server.
3. Migrate JWT signing from HS256 to RS256 (Dashboard → Settings → API → JWT Signing Keys).
4. Configure authorization path to `/oauth/consent` (Dashboard → Authentication → URL Configuration).

### Step 3: Verify ChatGPT Workspace Capability (Product Owner)
1. Verify that your current ChatGPT workspace supports custom app / Developer Mode workflow.
2. In the ATD Connect Readiness tab, mark ChatGPT Workspace Capability as VERIFIED or NOT VERIFIED.
3. If NOT VERIFIED, review workspace permissions, administrator configuration, or subscription plan.
4. The MCP server is not defective if the workspace does not support custom apps.

### Step 4: Register ChatGPT Client (Product Owner)
1. Register ChatGPT as an OAuth client with Supabase Auth.
2. The registration method (manual or dynamic) will be determined during the live connection test.
3. Add the ChatGPT redirect URI to the client configuration.

### Step 5: Create a ChatGPT Custom App
1. Open ChatGPT Settings → Connected Apps → Create New App.
2. Enter the Remote MCP Server URL (see above).
3. Enter the app name: "ATD Connect".
4. ChatGPT will discover the OAuth configuration via the protected-resource metadata endpoint.

### Step 6: Test
1. In a ChatGPT conversation, invoke: "Using ATD Connect, list every registered engineering capability."
2. Verify the response contains governed capability data.
3. Check ATD Connect → Inspection History for the matching audit record.

## Troubleshooting

### "Authentication required" (401)
- The MCP server returns WWW-Authenticate with resource_metadata URL.
- ChatGPT should automatically discover OAuth configuration from this URL.
- Ensure OAuth 2.1 Server is enabled in Supabase Auth.

### "ChatGPT Workspace Capability Required"
- Your ChatGPT workspace does not support custom app / Developer Mode workflow.
- This is NOT an MCP server issue. Review your workspace permissions or plan.
- Mark the workspace capability as NOT VERIFIED in the readiness tab.

### "Configuration Required" (OAuth Infrastructure)
- OAuth 2.1 Server is not enabled in Supabase Auth.
- Enable it in the Supabase dashboard and migrate JWT signing to RS256.

### "Partially Configured" (OAuth Infrastructure)
- Some OAuth components are configured but not all.
- Common cause: discovery works but JWKS is empty (HS256 still active).
- Complete the RS256 migration.

### "Authentication failed" (401 after OAuth)
- The token is invalid, expired, or issued for a different resource.
- Token validation fails closed — rejected tokens are never retried through a weaker path.

### "Rate limit exceeded" (429)
- You have exceeded 60 requests per minute. Wait and try again.

### "Unknown tool" error
- Check that the tool name is spelled correctly. Available tools are listed in the tools/list response.

### Tool returns "governed_empty"
- The requested object was not found. Try a different reference or check for typos.
- Use canonical reference resolution: "EWO-024" should resolve to the exact stored reference.

### Write request refused
- ATD Connect is read-only. Write operations (close, delete, approve, update) are not supported.
- The refusal response includes available read-only alternatives.

### Connection issues
- Verify the MCP server URL is correct.
- Check that the Supabase project is accessible.
- Verify ChatGPT workspace capability is VERIFIED.
