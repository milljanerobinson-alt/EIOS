/**
 * EWO-032R.3 — Null-content message sanitization tests
 *
 * Verifies that:
 *  1. Messages with null content are removed before provider calls
 *  2. Messages with undefined content are removed
 *  3. Valid string messages preserve order
 *  4. Content is always coerced to string (no null/undefined literals sent)
 *  5. Numeric content is converted safely
 *  6. The original array is not mutated
 *  7. No literal "null" or "undefined" string is sent to a provider
 */

import { describe, it, expect } from "vitest";
import { sanitizeMessages } from "../../supabase/functions/_shared/sanitizeMessages";

type AIMessage = { role: "system" | "user" | "assistant"; content: string };

describe("EWO-032R.3 — sanitizeMessages", () => {
  it("removes messages with null content", () => {
    const messages = [
      { role: "user", content: "hello" },
      { role: "assistant", content: null as unknown as string },
      { role: "user", content: "world" },
    ];
    const result = sanitizeMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("hello");
    expect(result[1].content).toBe("world");
  });

  it("removes messages with undefined content", () => {
    const messages = [
      { role: "user", content: "hello" },
      { role: "assistant", content: undefined as unknown as string },
      { role: "user", content: "world" },
    ];
    const result = sanitizeMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("hello");
    expect(result[1].content).toBe("world");
  });

  it("preserves order of valid string messages", () => {
    const messages = [
      { role: "user", content: "first" },
      { role: "assistant", content: "second" },
      { role: "user", content: "third" },
    ];
    const result = sanitizeMessages(messages);
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.content)).toEqual(["first", "second", "third"]);
  });

  it("coerces numeric content to string", () => {
    const messages = [
      { role: "user", content: 42 as unknown as string },
    ];
    const result = sanitizeMessages(messages);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("42");
    expect(typeof result[0].content).toBe("string");
  });

  it("does not mutate the original array", () => {
    const original = [
      { role: "user", content: "hello" },
      { role: "assistant", content: null as unknown as string },
    ];
    const originalCopy = [...original];
    sanitizeMessages(original);
    expect(original).toEqual(originalCopy);
  });

  it("never produces literal 'null' or 'undefined' strings", () => {
    const messages = [
      { role: "user", content: null as unknown as string },
      { role: "assistant", content: undefined as unknown as string },
      { role: "user", content: "valid" },
    ];
    const result = sanitizeMessages(messages);
    for (const m of result) {
      expect(m.content).not.toBe("null");
      expect(m.content).not.toBe("undefined");
      expect(m.content).not.toBe("");
    }
  });

  it("preserves valid roles", () => {
    const messages = [
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
      { role: "assistant", content: "ast" },
    ];
    const result = sanitizeMessages(messages);
    expect(result.map((m) => m.role)).toEqual(["system", "user", "assistant"]);
  });

  it("handles empty array", () => {
    expect(sanitizeMessages([])).toEqual([]);
  });

  it("handles all-null array", () => {
    const messages = [
      { role: "user", content: null as unknown as string },
      { role: "assistant", content: null as unknown as string },
    ];
    expect(sanitizeMessages(messages)).toEqual([]);
  });
});
