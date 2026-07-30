/**
 * EWO-032R.2 — Regression test for routing ReferenceError.
 *
 * Verifies that routeConversation() does not throw a ReferenceError when
 * invoked with:
 *   1. an ordinary engineering work-order prompt;
 *   2. an execution-handoff inspection prompt;
 *   3. an approval response such as "approved".
 *
 * The root cause was that isExecutionHandoffInspection, APPROVAL_PATTERNS,
 * and CANCELLATION_PATTERNS were defined AFTER routeConversation in the
 * bundled edge function, causing a ReferenceError at runtime even though
 * TypeScript compiled successfully.
 */

import { describe, it, expect } from "vitest";

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://clrsckerimjturebulbk.supabase.co";
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

const TEST_EMAIL = "engineering.test@eios.local";
const TEST_PASSWORD = "EiosBrowserTest2026!";

async function getAuthToken(): Promise<string> {
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: SUPA_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function createConversation(jwt: string): Promise<string> {
  const res = await fetch(`${SUPA_URL}/rest/v1/cc_ai_conversations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: SUPA_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ title: "EWO-032R.2 Regression", context_type: "general" }),
  });
  if (!res.ok) {
    throw new Error(`Conversation creation failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as Array<{ id: string }>;
  return data[0].id;
}

async function sendToEdgeFunction(
  jwt: string,
  conversationId: string,
  content: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${SUPA_URL}/functions/v1/command-centre-ai`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      apikey: SUPA_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ role: "user", content }],
      conversation_id: conversationId,
      mode: "director",
      ai_role: "director",
    }),
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

function assertNoReferenceError(result: { status: number; body: Record<string, unknown> }) {
  const failureStage = result.body.failure_stage;
  const runtimeError = result.body.exact_runtime_error;

  // If there is a failure stage, it must NOT be the uncaught exception handler
  if (failureStage !== undefined && failureStage !== null) {
    expect(failureStage).not.toBe("uncaught_exception_handler");
  }

  // If there is a runtime error, it must NOT contain ReferenceError
  if (typeof runtimeError === "string") {
    expect(runtimeError).not.toContain("isExecutionHandoffInspection is not defined");
    expect(runtimeError).not.toContain("CANCELLATION_PATTERNS is not defined");
    expect(runtimeError).not.toContain("APPROVAL_PATTERNS is not defined");
    expect(runtimeError).not.toContain("ReferenceError");
  }
}

describe("EWO-032R.2: Routing ReferenceError regression", () => {
  it("does not throw ReferenceError for an ordinary engineering prompt", async () => {
    const jwt = await getAuthToken();
    const convId = await createConversation(jwt);
    const result = await sendToEdgeFunction(
      jwt,
      convId,
      "Create a governed engineering work order to add a validation gate to the assessment pipeline. The plan should await Product Owner approval before any implementation begins.",
    );

    assertNoReferenceError(result);
  }, 60000);

  it("does not throw ReferenceError for an execution-handoff inspection prompt", async () => {
    const jwt = await getAuthToken();
    const convId = await createConversation(jwt);
    const result = await sendToEdgeFunction(
      jwt,
      convId,
      "Inspect the execution handoff state for EWO-032R.2.",
    );

    assertNoReferenceError(result);
  }, 60000);

  it("does not throw ReferenceError for an approval response", async () => {
    const jwt = await getAuthToken();
    const convId = await createConversation(jwt);

    // First send a planning prompt to establish context
    await sendToEdgeFunction(
      jwt,
      convId,
      "Create a governed engineering work order to add a validation gate to the assessment pipeline. The plan should await Product Owner approval before any implementation begins.",
    );

    // Then send approval
    const result = await sendToEdgeFunction(jwt, convId, "approved");

    assertNoReferenceError(result);
  }, 60000);
});
