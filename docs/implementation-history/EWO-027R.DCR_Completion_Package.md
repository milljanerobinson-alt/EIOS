# Engineering Completion Package — EWO-027R.DCR

## 1. Engineering Completion Report

**Reference:** EWO-027R.DCR
**Title:** ATD Connect OAuth Dynamic Client Registration & Consent Flow
**Classification:** Refinement
**Parent:** EWO-027R
**Implementation Source:** bolt_refinement
**Refinement Chain:** EWO-026 → EWO-026R.1 → EWO-026R.2 → EWO-026R.3 → EWO-026R.3R.1 → EWO-027 → EWO-027R → EWO-027R.DCR
**Refinement Depth:** 2

**Lifecycle State:** Engineering Complete
**Product Owner Testing:** Pending
**Product Owner Acceptance:** Pending

### Objective
Complete the OAuth 2.1 interoperability required for ChatGPT and other standards-compliant MCP clients to authenticate securely with ATD Connect by adding the `registration_endpoint` to OAuth authorization server metadata, fixing the consent route, and adding OAuth audit logging.

### Outcome
The MCP server now serves `/.well-known/oauth-authorization-server` metadata that includes a `registration_endpoint` field pointing to Supabase's Dynamic Client Registration endpoint. The consent route correctly parses `authorization_id` from the hash, uses the Supabase SDK's `auth.oauth.*` API, and records audit events. All 38 new tests and 268 regression tests pass.

---

## 2. Root Cause Analysis

ChatGPT reported "DCR is unavailable until a Registration URL is present in the OAuth endpoints section" because:

1. **Missing authorization server metadata endpoint:** The MCP server only served `/.well-known/oauth-protected-resource` (RFC 9728), which points to `${SUPABASE_URL}/auth/v1` as the authorization server. ChatGPT followed this pointer but needed to find `registration_endpoint` in the authorization server's own metadata document. The edge function did not serve `/.well-known/oauth-authorization-server` (RFC 8414) at its own URL.

2. **Consent page bugs:** The OAuthConsentPage read `authorization_id` from `window.location.search`, but App.tsx's redirect logic moves it to the hash fragment (`#/oauth/consent?authorization_id=xxx`). After `history.replaceState`, `window.location.search` is empty, causing the consent page to fail.

3. **No audit logging for OAuth events:** Consent approvals, denials, token validation failures, and session establishments were not recorded in the audit log.

---

## 3. Discovery Documents and Endpoints Audited

| Endpoint | URL | Status |
|---|---|---|
| Protected Resource Metadata | `${SUPABASE_URL}/functions/v1/atd-mcp-server/.well-known/oauth-protected-resource` | Already served — unchanged |
| Authorization Server Metadata | `${SUPABASE_URL}/functions/v1/atd-mcp-server/.well-known/oauth-authorization-server` | **NEW** — proxies Supabase's discovery doc, adds `registration_endpoint` |
| Supabase OAuth Discovery | `${SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1` | Fetched server-side, enriched with `registration_endpoint` if missing |
| Authorization Endpoint | `${SUPABASE_URL}/auth/v1/oauth/authorize` | Advertised in metadata |
| Token Endpoint | `${SUPABASE_URL}/auth/v1/oauth/token` | Advertised in metadata |
| JWKS Endpoint | `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` | Advertised in metadata |
| OIDC Discovery | `${SUPABASE_URL}/auth/v1/.well-known/openid-configuration` | Advertised in metadata |
| Registration Endpoint | `${SUPABASE_URL}/auth/v1/oauth/clients/register` | **NEW** — advertised in metadata |
| Consent Route | `https://eios.bolt.host/oauth/consent` | Fixed — `authorization_id` parsing, audit logging |

---

## 4. Files Created and Modified

### Modified
1. **`supabase/functions/atd-mcp-server/index.ts`** — Added `getAuthorizationServerMetadata()` function that fetches Supabase's OAuth discovery document and enriches it with `registration_endpoint`. Added `/.well-known/oauth-authorization-server` GET endpoint. Added `recordOAuthAuditEvent()` function and audit logging at token validation, session establishment, and failure points. Updated version to `EWO-027R.DCR`.

2. **`src/pages/OAuthConsentPage.tsx`** — Complete rewrite: fixed `authorization_id` parsing from hash query params (with search fallback), added `skipBrowserRedirect: true` for manual redirect handling, added "already consented" redirect handling, added audit logging for approve/deny actions, added proper error states, added signed-in user indicator, added scope descriptions, matches EIOS visual system.

### Created
3. **`src/tests/ewo027r_dcr.test.ts`** — 38 automated tests covering OAuth metadata construction, registration endpoint, consent route parsing, audit event structure, security gate, environment configuration, and EWO-027 regression.

---

## 5. Database Migrations

No new migrations required. The `atd_connect_inspection_log` table (created in EWO-027R.Y migrations) already supports the audit event columns used by the new OAuth audit logging.

---

## 6. Environment/Configuration Changes

No environment variable changes required. All OAuth URLs are derived from `SUPABASE_URL` at runtime — no hard-coded project references. The implementation supports environment separation (dev/staging/prod) by changing the `SUPABASE_URL` environment variable.

---

## 7. Security and Authorization Analysis

- **OAUTH_SECURITY_VERIFICATION_PENDING remains `true`** — external OAuth tool calls continue to fail closed. Only `initialize`, `tools/list`, and `ping` are available to external OAuth users.
- **No secrets in audit logs** — audit events record user ID, client ID, scopes, and outcome only. No access tokens, refresh tokens, client secrets, or authorization codes are logged.
- **Token validation** — the MCP server validates tokens via `supabase.auth.getUser()` which verifies the JWT against Supabase's Auth service (signature, issuer, expiry, audience).
- **Redirect URI validation** — handled by Supabase's OAuth server. The consent page does not modify or substitute redirect URIs.
- **Consent is explicit** — no silent or automatic authorization. The consent page requires an authenticated user and explicit Allow/Deny action.
- **EIOS governance not bypassed** — OAuth proves identity and delegated authorization only. All EIOS role checks, tenant isolation, and tool-level authorization remain enforced.
- **Public client support** — the metadata advertises `none` as a supported token endpoint auth method, enabling public clients (like ChatGPT) to use PKCE without a client secret.

---

## 8. Automated Test Results

```
Test Files: 1 passed (1)
Tests: 38 passed (38)
Duration: 1.91s
```

Test categories:
- OAuth Authorization Server Metadata: 11 tests
- Protected Resource Metadata: 3 tests
- Consent Route Authorization ID Parsing: 5 tests
- Authorization Response Type Guard: 2 tests
- Scope Descriptions: 2 tests
- OAuth Security Gate: 3 tests
- Audit Event Structure: 4 tests
- EWO-027 Regression: 6 tests
- Environment Configuration: 2 tests

---

## 9. Build Verification

```
✓ 2433 modules transformed.
✓ built in 39.13s
```

Build passes with no errors. Pre-existing chunk size warnings are unrelated to this work.

---

## 10. Regression Verification

All EWO-027 and EWO-027R.Y regression tests pass:

```
Test Files: 6 passed (6)
Tests: 268 passed (268)
Duration: 5.70s
```

Regression test files:
- `ewo027.test.ts` — 76 tests
- `ewo027r_y.test.ts` — 25 tests
- `ewo027r_y1.test.ts` — 45 tests
- `ewo027r_y2.test.ts` — 64 tests
- `ewo027r_y3.test.ts` — 45 tests
- `ewo027r_y4.test.ts` — 13 tests

---

## 11. Manual Product Owner Test Plan

### TEST 1 — OAuth Authorization Metadata
1. Open `https://eios.bolt.host/functions/v1/atd-mcp-server/.well-known/oauth-authorization-server` in a browser
2. Verify the JSON response contains:
   - `authorization_endpoint` pointing to `${SUPABASE_URL}/auth/v1/oauth/authorize`
   - `token_endpoint` pointing to `${SUPABASE_URL}/auth/v1/oauth/token`
   - `registration_endpoint` pointing to `${SUPABASE_URL}/auth/v1/oauth/clients/register`
   - `code_challenge_methods_supported` containing `S256`
   - `grant_types_supported` containing `authorization_code`
   - `scopes_supported` containing `openid`, `profile`, `email`

### TEST 2 — ChatGPT Discovery
1. In ChatGPT, add ATD Connect as a custom plugin
2. Enter the MCP server URL: `https://eios.bolt.host/functions/v1/atd-mcp-server`
3. ChatGPT should automatically discover the Registration URL
4. The "DCR is unavailable" warning should no longer appear
5. Dynamic Client Registration should become selectable

### TEST 3 — Dynamic Registration
1. From ChatGPT, initiate the OAuth flow
2. ChatGPT should register an OAuth client via the registration endpoint
3. The client should appear in Supabase Dashboard → Authentication → OAuth Apps
4. The registered callback URI should match the ChatGPT callback URI

### TEST 4 — Consent Route
1. From ChatGPT, complete the discovery and registration steps
2. ChatGPT should redirect to `https://eios.bolt.host/oauth/consent?authorization_id=xxx`
3. If signed out, you should be redirected to the sign-in page
4. After signing in, you should return to the consent page
5. The consent page should display the requesting application name and scopes
6. Click "Allow access" — you should be redirected back to ChatGPT with an authorization code
7. Repeat with "Deny" — you should be redirected back with an `access_denied` error

### TEST 5 — Token Exchange
1. After consent approval, ChatGPT should exchange the authorization code for tokens
2. PKCE should be enforced (code_verifier/code_challenge)
3. Reusing an authorization code should fail
4. Invalid redirect URI should fail

### TEST 6 — Authenticated MCP Access
1. After OAuth completion, ChatGPT should call `initialize` — should succeed
2. `tools/list` should succeed
3. `discover_atd_capabilities` should succeed
4. `tools/call` should return "OAuth security verification pending" (gate is still active)
5. User identity should be correctly resolved from the access token

### TEST 7 — Invalid Token Behaviour
1. Send an MCP request without an Authorization header — should return 401 with WWW-Authenticate
2. Send an expired token — should return 401
3. Send a token with invalid issuer — should return 401
4. Send a token with insufficient scope — should return 401

### TEST 8 — Audit Records
1. After consent approval, check `atd_connect_inspection_log` table for `oauth_consent_approved` event
2. After consent denial, check for `oauth_consent_denied` event
3. After failed token validation, check for `token_validation_failure` event
4. Verify no raw tokens, authorization codes, or secrets appear in audit records

### TEST 9 — EWO-027 Regression
1. Connect to MCP — should succeed
2. Metadata discovery — should succeed
3. WWW-Authenticate — should return resource_metadata
4. MCP initialize — should succeed
5. notifications/initialized — should succeed
6. tools/list — should succeed
7. Tool schema — should be valid
8. discover_atd_capabilities — should succeed
9. Matching audit — should be recorded

---

## 12. Known Limitations

1. **OAUTH_SECURITY_VERIFICATION_PENDING is still `true`** — external OAuth users can call `initialize`, `tools/list`, and `ping` but cannot call `tools/call`. This is intentional and must remain until the Product Owner completes Tier 2 security verification.

2. **Authorization server metadata is proxied, not native** — the edge function fetches Supabase's discovery document at runtime and enriches it. If Supabase's discovery endpoint is unavailable, a fallback metadata document is constructed from known endpoint patterns.

3. **Consent page requires the Supabase SDK's `auth.oauth.*` API** — this is available in `@supabase/supabase-js` v2.45.0+, which is installed in this project. If the SDK is downgraded, the consent page will need adjustment.

4. **Manual testing of the full OAuth flow requires ChatGPT or another MCP client** — the automated tests verify metadata construction and parsing logic but cannot test the end-to-end OAuth flow without a real MCP client.

---

## 13. Canonical EWO-027R.DCR Record Confirmation

The canonical EWO-027R.DCR record was created in the `engineering_work_orders` table **before** implementation began:
- **ID:** `36983b13-b257-4a39-963d-fa3c55de393f`
- **EWO Ref:** `EWO-027R.DCR`
- **Parent:** `EWO-027R`
- **Status at implementation start:** `in_progress`
- **Lifecycle event recorded:** `NULL → in_progress` with timestamp

---

## 14. EWO-027 Product Owner Acceptance Confirmation

EWO-027 Product Owner Acceptance was recorded and the parent EWO was closed **before** refinement implementation began:
- **EWO-027 Status:** `closed`
- **PO Accepted At:** `2026-07-24 02:35:00.155407+00`
- **PO Accepted By:** `Product Owner`
- **Closed At:** `2026-07-24 02:35:03.923241+00`
- **Closure Method:** `Product Owner Acceptance`

EWO-027R (the immediate parent) was also already closed:
- **EWO-027R Status:** `closed`
- **PO Accepted At:** `2026-07-24 02:35:08.640486+00`
- **Closed At:** `2026-07-24 02:35:08.640486+00`

Both parent EWOs were verified as closed in the canonical Engineering Work Orders ledger before EWO-027R.DCR implementation began.

---

## Final Lifecycle State

```
EWO-027R.DCR
Status: Engineering Complete
Product Owner Testing: Pending
Product Owner Acceptance: Pending
```

Product Owner Acceptance has **not** been marked complete. The work order remains in Engineering Complete state, awaiting Product Owner testing and acceptance.
