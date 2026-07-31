/**
 * EWO-044 — Codex-Native ATD Conversation Engine
 *
 * Deterministic Governance Interception.
 *
 * This is the ONLY intent routing that remains in EIOS.
 * Six anchored regex patterns intercept governance commands before provider invocation.
 * Everything else goes directly to the configured provider.
 *
 * The provider handles all engineering reasoning, intent understanding,
 * and conversational interpretation. EIOS only intercepts direct lifecycle commands.
 */

export type GovernanceCommand =
  | 'approve_execution'
  | 'reject_execution'
  | 'execute_ewo'
  | 'cancel_execution'
  | 'delete_ewo'
  | 'record_acceptance';

export interface GovernanceInterceptionResult {
  intercepted: boolean;
  command: GovernanceCommand | null;
  ewoRef: string | null;
  rawText: string;
}

// ─── Anchored Regex Patterns ─────────────────────────────────────────────────
//
// These are intentionally exact-match anchored patterns.
// They do NOT do fuzzy keyword matching or semantic interpretation.
// Only exact command patterns are intercepted.

const GOVERNANCE_PATTERNS: Array<{
  command: GovernanceCommand;
  pattern: RegExp;
  extractRef: boolean;
}> = [
  // Approve execution: "approve EWO-044" or "approve execution EWO-044"
  {
    command: 'approve_execution',
    pattern: /^approve\s+(?:execution\s+)?(EWO-[\w.-]+)\s*$/i,
    extractRef: true,
  },
  // Reject execution: "reject EWO-044"
  {
    command: 'reject_execution',
    pattern: /^reject\s+(?:execution\s+)?(EWO-[\w.-]+)\s*$/i,
    extractRef: true,
  },
  // Execute EWO: "execute EWO-044"
  {
    command: 'execute_ewo',
    pattern: /^execute\s+(EWO-[\w.-]+)\s*$/i,
    extractRef: true,
  },
  // Cancel execution: "cancel EWO-044" or "cancel EXEC-044"
  {
    command: 'cancel_execution',
    pattern: /^cancel\s+(?:EWO-|EXEC-)([\w.-]+)\s*$/i,
    extractRef: true,
  },
  // Delete EWO: "delete EWO-044"
  {
    command: 'delete_ewo',
    pattern: /^delete\s+(EWO-[\w.-]+)\s*$/i,
    extractRef: true,
  },
  // Record acceptance: "accept EWO-044"
  {
    command: 'record_acceptance',
    pattern: /^accept\s+(EWO-[\w.-]+)\s*$/i,
    extractRef: true,
  },
];

// ─── Interception ─────────────────────────────────────────────────────────────

export function interceptGovernanceCommand(text: string): GovernanceInterceptionResult {
  const trimmed = text.trim();

  for (const entry of GOVERNANCE_PATTERNS) {
    const match = trimmed.match(entry.pattern);
    if (match) {
      let ewoRef: string | null = null;
      if (entry.extractRef && match[1]) {
        const ref = match[1].toUpperCase();
        ewoRef = ref.startsWith('EWO-') ? ref : `EWO-${ref}`;
      }
      return {
        intercepted: true,
        command: entry.command,
        ewoRef,
        rawText: trimmed,
      };
    }
  }

  return {
    intercepted: false,
    command: null,
    ewoRef: null,
    rawText: trimmed,
  };
}

// ─── Map to Tool Name ────────────────────────────────────────────────────────

export function governanceCommandToTool(command: GovernanceCommand): string {
  const map: Record<GovernanceCommand, string> = {
    approve_execution: 'eios_approve_execution',
    reject_execution: 'eios_reject_execution',
    execute_ewo: 'eios_execute_ewo',
    cancel_execution: 'eios_cancel_execution',
    delete_ewo: 'eios_delete_ewo',
    record_acceptance: 'eios_record_acceptance',
  };
  return map[command];
}
