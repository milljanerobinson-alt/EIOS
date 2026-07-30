// EWO-032R.3 — Standalone message sanitization logic
// Shared between the edge function AI service and browser tests.
// No Deno-specific imports so it can be loaded by Vite/vitest.

export interface SanitizableMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Remove messages with null/undefined content and coerce remaining content to
 * strings. Prevents provider 400 errors caused by persisted conversation
 * history containing null-content assistant messages. Does not mutate the
 * original array.
 */
export function sanitizeMessages<T extends SanitizableMessage>(messages: T[]): T[] {
  return messages
    .filter((m) => m.content != null)
    .map((m) => ({ ...m, content: String(m.content) }));
}
