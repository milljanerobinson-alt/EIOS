import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveSharedCredential,
  resolveRuntimeCredential,
  validateCredential,
  getCredentialStatus,
  getCurrentCredential,
  SHARED_OPENAI_CREDENTIAL_REFERENCE,
} from "../lib/codex/codexCredentialService";
import { supabase } from "../lib/supabase";

vi.mock("../lib/supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

function mockFromChain(selectData: unknown, selectError: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: selectData, error: selectError }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
  (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

describe("EWO-032R.9: Shared OpenAI Credential Reuse for Codex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Shared credential resolution — configured OpenAI provider
  it("resolveSharedCredential returns available when OpenAI is configured, enabled, and has a key", async () => {
    mockFromChain({
      provider: "openai",
      is_enabled: true,
      has_api_key: true,
      health_status: "healthy",
    });
    const result = await resolveSharedCredential("staging");
    expect(result.available).toBe(true);
    expect(result.credential_reference).toBe(SHARED_OPENAI_CREDENTIAL_REFERENCE);
    expect(result.source_provider).toBe("openai");
    expect(result.validation_status).toBe("available");
    expect(result.openai_enabled).toBe(true);
    expect(result.openai_has_key).toBe(true);
  });

  // 2. Missing OpenAI provider
  it("resolveSharedCredential returns unavailable when OpenAI provider is missing", async () => {
    mockFromChain(null);
    const result = await resolveSharedCredential("staging");
    expect(result.available).toBe(false);
    expect(result.validation_status).toBe("unavailable");
    expect(result.reason).toContain("not configured");
  });

  // 3. Disabled OpenAI provider
  it("resolveSharedCredential returns disabled when OpenAI provider is disabled", async () => {
    mockFromChain({
      provider: "openai",
      is_enabled: false,
      has_api_key: true,
      health_status: "unhealthy",
    });
    const result = await resolveSharedCredential("staging");
    expect(result.available).toBe(false);
    expect(result.validation_status).toBe("disabled");
    expect(result.reason).toContain("disabled");
  });

  // 4. OpenAI provider with no key
  it("resolveSharedCredential returns unavailable when OpenAI has no key", async () => {
    mockFromChain({
      provider: "openai",
      is_enabled: true,
      has_api_key: false,
      health_status: null,
    });
    const result = await resolveSharedCredential("staging");
    expect(result.available).toBe(false);
    expect(result.validation_status).toBe("unavailable");
    expect(result.reason).toContain("no API key");
  });

  // 5. Credential reference is opaque and never contains the raw key
  it("SHARED_OPENAI_CREDENTIAL_REFERENCE is an opaque identifier, not a key", () => {
    expect(SHARED_OPENAI_CREDENTIAL_REFERENCE).toBe("shared-provider://openai/default");
    expect(SHARED_OPENAI_CREDENTIAL_REFERENCE).not.toMatch(/^sk-/);
  });

  // 6. getCurrentCredential returns descriptor without raw key
  it("getCurrentCredential returns a descriptor with opaque reference when available", async () => {
    mockFromChain({
      provider: "openai",
      is_enabled: true,
      has_api_key: true,
      health_status: "healthy",
    });
    const result = await getCurrentCredential("staging");
    expect(result).not.toBeNull();
    expect(result?.credential_reference).toBe(SHARED_OPENAI_CREDENTIAL_REFERENCE);
    expect(result?.credential_status).toBe("valid");
    expect(result?.is_current).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/sk-[a-zA-Z0-9]/);
  });

  // 7. getCurrentCredential returns null when unavailable
  it("getCurrentCredential returns null when OpenAI is disabled", async () => {
    mockFromChain({
      provider: "openai",
      is_enabled: false,
      has_api_key: true,
      health_status: null,
    });
    const result = await getCurrentCredential("staging");
    expect(result).toBeNull();
  });

  // 8. validateCredential returns valid when available
  it("validateCredential returns valid when shared credential is available", async () => {
    mockFromChain({
      provider: "openai",
      is_enabled: true,
      has_api_key: true,
      health_status: "healthy",
    });
    const result = await validateCredential("staging");
    expect(result.valid).toBe(true);
    expect(result.status).toBe("valid");
    expect(result.credential_ref).toBe(SHARED_OPENAI_CREDENTIAL_REFERENCE);
  });

  // 9. validateCredential fails closed when disabled
  it("validateCredential fails closed when OpenAI is disabled", async () => {
    mockFromChain({
      provider: "openai",
      is_enabled: false,
      has_api_key: true,
      health_status: null,
    });
    const result = await validateCredential("staging");
    expect(result.valid).toBe(false);
    expect(result.status).toBe("disabled");
    expect(result.credential_ref).toBeNull();
  });

  // 10. getCredentialStatus returns correct status
  it("getCredentialStatus returns available when configured", async () => {
    mockFromChain({
      provider: "openai",
      is_enabled: true,
      has_api_key: true,
      health_status: "healthy",
    });
    const result = await getCredentialStatus("staging");
    expect(result.credential_reference_status).toBe("available");
    expect(result.configured).toBe(true);
  });

  // 11. Runtime credential resolution — available
  it("resolveRuntimeCredential returns resolvable when shared credential is available", async () => {
    mockFromChain({
      provider: "openai",
      is_enabled: true,
      has_api_key: true,
      health_status: "healthy",
    });
    const result = await resolveRuntimeCredential("staging");
    expect(result.resolvable).toBe(true);
    expect(result.credential_ref).toBe(SHARED_OPENAI_CREDENTIAL_REFERENCE);
    expect(result.credential_reference).toBe(SHARED_OPENAI_CREDENTIAL_REFERENCE);
  });

  // 12. Runtime credential resolution — fail closed
  it("resolveRuntimeCredential fails closed when OpenAI is missing", async () => {
    mockFromChain(null);
    const result = await resolveRuntimeCredential("staging");
    expect(result.resolvable).toBe(false);
    expect(result.credential_ref).toBeNull();
    expect(result.reason).toContain("not configured");
  });

  // 13. Raw secret non-duplication — descriptor never contains a key pattern
  it("SharedCredentialDescriptor never exposes a raw key pattern", async () => {
    mockFromChain({
      provider: "openai",
      is_enabled: true,
      has_api_key: true,
      health_status: "healthy",
    });
    const result = await resolveSharedCredential("staging");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
  });

  // 14. Deprecated functions throw
  it("storeCodexCredential throws deprecation error", async () => {
    const { storeCodexCredential } = await import("../lib/codex/codexCredentialService");
    await expect(storeCodexCredential("sk-test", "staging", "user")).rejects.toThrow("deprecated");
  });

  it("rotateCredential throws deprecation error", async () => {
    const { rotateCredential } = await import("../lib/codex/codexCredentialService");
    await expect(rotateCredential("sk-test", "staging", "user")).rejects.toThrow("deprecated");
  });

  it("revokeCredential throws deprecation error", async () => {
    const { revokeCredential } = await import("../lib/codex/codexCredentialService");
    await expect(revokeCredential("ref")).rejects.toThrow("deprecated");
  });

  // 15. Environment is propagated
  it("resolveSharedCredential propagates the requested environment", async () => {
    mockFromChain({
      provider: "openai",
      is_enabled: true,
      has_api_key: true,
      health_status: "healthy",
    });
    const result = await resolveSharedCredential("production");
    expect(result.environment).toBe("production");
  });

  // 16. Query error fails closed
  it("resolveSharedCredential fails closed on query error", async () => {
    mockFromChain(null, { message: "connection error" });
    const result = await resolveSharedCredential("staging");
    expect(result.available).toBe(false);
    expect(result.validation_status).toBe("unavailable");
    expect(result.reason).toContain("Failed to query");
  });
});
