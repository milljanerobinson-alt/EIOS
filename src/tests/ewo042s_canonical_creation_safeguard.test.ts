/**
 * EWO-042S.1 — Hardened Regression Tests: Canonical EWO Creation Safeguard
 *
 * Tests:
 * 1. Anon client cannot INSERT
 * 2. Authenticated test user cannot INSERT
 * 3. Automated test context is rejected
 * 4. Staging validation context is rejected
 * 5. Local development context is rejected
 * 6. Missing execution context is rejected (no default fallback)
 * 7. Null execution context is rejected
 * 8. Unknown execution context is rejected
 * 9. Test identity is blocked (secondary safeguard)
 * 10. Genuine PO engineering creates a canonical EWO
 * 11. Historical imports still function
 * 12. Governed migrations still function
 * 13. Blocked attempts are logged
 * 14. Canonical EWO PK set is identical before and after all tests
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const anon = createClient(SUPABASE_URL, ANON_KEY);
const testUser = createClient(SUPABASE_URL, ANON_KEY, {
  global: { headers: { Authorization: "Bearer test-token" } },
});

// ─── Helper: get all EWO primary keys as a sorted array ────────────────────────

async function getEwoPkSet(): Promise<string[]> {
  const { data, error } = await admin
    .from("engineering_work_orders")
    .select("id");
  expect(error).toBeNull();
  return data!.map((r) => r.id).sort();
}

// ─── Helper: call governed RPC and return result ──────────────────────────────

async function callGovernedRpc(params: Record<string, unknown>) {
  const { data, error } = await admin.rpc("create_canonical_ewo_governed", params);
  expect(error).toBeNull();
  return data;
}

// ─── Helper: clean up a created EWO ────────────────────────────────────────────

async function cleanupEwo(ewoId: string | null) {
  if (ewoId) {
    await admin.from("engineering_work_orders").delete().eq("id", ewoId);
  }
}

describe("EWO-042S.1 — Hardened Canonical Creation Safeguard", () => {
  let pkSetBefore: string[];
  let pkSetAfter: string[];

  beforeAll(async () => {
    pkSetBefore = await getEwoPkSet();
  });

  afterAll(async () => {
    pkSetAfter = await getEwoPkSet();

    // ─── ARCHITECTURAL ASSERTION: PK sets must be identical ───
    expect(pkSetAfter).toEqual(pkSetBefore);
  });

  // ─── 1. Anon client cannot INSERT ────────────────────────────────────────────

  it("anon client cannot INSERT into engineering_work_orders", async () => {
    const { error } = await anon.from("engineering_work_orders").insert({
      ewo_ref: "EWO-TEST-BLOCKED-ANON",
      title: "Should be blocked",
      executive_summary: "This should never be created",
      status: "ready",
    });

    expect(error).toBeDefined();
    expect(error!.message).toMatch(/policy|permission|denied|viol/i);

    const { data } = await admin
      .from("engineering_work_orders")
      .select("id")
      .eq("ewo_ref", "EWO-TEST-BLOCKED-ANON")
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─── 2. Authenticated test user cannot INSERT ────────────────────────────────

  it("authenticated test user cannot INSERT into engineering_work_orders", async () => {
    const { error } = await testUser.from("engineering_work_orders").insert({
      ewo_ref: "EWO-TEST-BLOCKED-AUTH",
      title: "Should be blocked",
      executive_summary: "This should never be created",
      status: "ready",
    });

    expect(error).toBeDefined();
    expect(error!.message).toMatch(/policy|permission|denied|viol/i);

    const { data } = await admin
      .from("engineering_work_orders")
      .select("id")
      .eq("ewo_ref", "EWO-TEST-BLOCKED-AUTH")
      .maybeSingle();
    expect(data).toBeNull();
  });

  // ─── 3. Automated test context is rejected ──────────────────────────────────

  it("automated_test execution context is rejected", async () => {
    const result = await callGovernedRpc({
      p_execution_context: "automated_test",
      p_title: "Should be blocked",
      p_executive_summary: "Automated test context must be rejected",
      p_created_by_email: "user@example.com",
      p_created_by_role: "admin",
    });
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.ewo_ref).toBeNull();
    expect(result.rejection_reason).toMatch(/automated test/i);
  });

  // ─── 4. Staging validation context is rejected ──────────────────────────────

  it("staging_validation execution context is rejected", async () => {
    const result = await callGovernedRpc({
      p_execution_context: "staging_validation",
      p_title: "Should be blocked",
      p_executive_summary: "Staging validation context must be rejected",
      p_created_by_email: "user@example.com",
      p_created_by_role: "admin",
    });
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.ewo_ref).toBeNull();
    expect(result.rejection_reason).toMatch(/not permitted/i);
  });

  // ─── 5. Local development context is rejected ──────────────────────────────

  it("local_development execution context is rejected", async () => {
    const result = await callGovernedRpc({
      p_execution_context: "local_development",
      p_title: "Should be blocked",
      p_executive_summary: "Local development context must be rejected",
      p_created_by_email: "user@example.com",
      p_created_by_role: "admin",
    });
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.ewo_ref).toBeNull();
    expect(result.rejection_reason).toMatch(/not permitted/i);
  });

  // ─── 6. Missing execution context is rejected (no default) ─────────────────

  it("missing execution context is rejected with no default fallback", async () => {
    const result = await callGovernedRpc({
      p_execution_context: null,
      p_title: "Should be blocked",
      p_executive_summary: "Missing context must be rejected",
      p_created_by_email: "user@example.com",
      p_created_by_role: "admin",
    });
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.ewo_ref).toBeNull();
    expect(result.rejection_reason).toMatch(/required|null|empty/i);
  });

  // ─── 7. Empty string execution context is rejected ─────────────────────────

  it("empty string execution context is rejected", async () => {
    const result = await callGovernedRpc({
      p_execution_context: "",
      p_title: "Should be blocked",
      p_executive_summary: "Empty context must be rejected",
      p_created_by_email: "user@example.com",
      p_created_by_role: "admin",
    });
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.ewo_ref).toBeNull();
    expect(result.rejection_reason).toMatch(/required|null|empty/i);
  });

  // ─── 8. Unknown execution context is rejected ──────────────────────────────

  it("unknown execution context is rejected", async () => {
    const result = await callGovernedRpc({
      p_execution_context: "fake_production_context",
      p_title: "Should be blocked",
      p_executive_summary: "Unknown context must be rejected",
      p_created_by_email: "user@example.com",
      p_created_by_role: "admin",
    });
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.ewo_ref).toBeNull();
    expect(result.rejection_reason).toMatch(/invalid execution context/i);
  });

  // ─── 9. Test identity is blocked (secondary safeguard) ──────────────────────

  it("test identity is blocked as secondary safeguard", async () => {
    const result = await callGovernedRpc({
      p_execution_context: "canonical_production",
      p_title: "Should be blocked",
      p_executive_summary: "Test identity must be blocked even with valid context",
      p_created_by_email: "engineering.test@eios.local",
      p_created_by_role: "admin",
    });
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.ewo_ref).toBeNull();
    expect(result.rejection_reason).toMatch(/test identity/i);
  });

  // ─── 10. Genuine PO engineering creates a canonical EWO ─────────────────────

  it("genuine Product Owner engineering creates a canonical EWO", async () => {
    const result = await callGovernedRpc({
      p_execution_context: "product_owner_manual",
      p_title: "EWO-042S.1 Regression — Genuine PO Creation",
      p_executive_summary: "Genuine PO engineering work order to verify governed gateway allows legitimate creation.",
      p_created_by_email: "milljanerobinson@gmail.com",
      p_created_by_role: "product_owner",
      p_correlation_id: "EWO042S1-REG-PO",
    });
    expect(result.success).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.created).toBe(true);
    expect(result.ewo_ref).toMatch(/^EWO-\d+$/);
    await cleanupEwo(result.ewo_id);
  });

  // ─── 11. Historical imports still function ──────────────────────────────────

  it("historical_import execution context is allowed", async () => {
    const result = await callGovernedRpc({
      p_execution_context: "historical_import",
      p_title: "EWO-042S.1 Regression — Historical Import",
      p_executive_summary: "Historical import to verify governed gateway allows historical imports.",
      p_created_by_email: "system@eios.local",
      p_created_by_role: "system",
      p_correlation_id: "EWO042S1-REG-HIST",
    });
    expect(result.success).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.created).toBe(true);
    await cleanupEwo(result.ewo_id);
  });

  // ─── 12. Governed migrations still function ─────────────────────────────────

  it("governed_migration execution context is allowed", async () => {
    const result = await callGovernedRpc({
      p_execution_context: "governed_migration",
      p_title: "EWO-042S.1 Regression — Governed Migration",
      p_executive_summary: "Governed migration to verify governed gateway allows governed migrations.",
      p_created_by_email: "system@eios.local",
      p_created_by_role: "system",
      p_correlation_id: "EWO042S1-REG-MIG",
    });
    expect(result.success).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.created).toBe(true);
    await cleanupEwo(result.ewo_id);
  });

  // ─── 13. Blocked attempts are logged ─────────────────────────────────────────

  it("blocked creation attempts are logged to ewo_creation_attempt_log", async () => {
    await callGovernedRpc({
      p_execution_context: "automated_test",
      p_title: "Blocked attempt that should be logged",
      p_executive_summary: "This should be logged in the attempt log",
      p_created_by_email: "engineering.test@eios.local",
      p_created_by_role: "admin",
      p_correlation_id: "EWO042S1-LOG-TEST",
    });

    const { data, error } = await admin
      .from("ewo_creation_attempt_log")
      .select("*")
      .eq("correlation_id", "EWO042S1-LOG-TEST")
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data!.was_blocked).toBe(true);
    expect(data!.was_created).toBe(false);
    expect(data!.execution_context).toBe("automated_test");
  });

  // ─── 14. PK set comparison (architectural assertion) ─────────────────────────

  it("canonical EWO primary-key set is unchanged after all tests", async () => {
    // This is a placeholder — the actual assertion runs in afterAll.
    // But we verify the helper works here.
    const currentPks = await getEwoPkSet();
    expect(currentPks).toEqual(pkSetBefore);
  });
});
