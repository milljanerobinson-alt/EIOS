/**
 * EWO-044 — Codex-Native ATD Conversation Engine
 *
 * Canonical EIOS Tool Registry.
 * Defines all tools that EIOS exposes to the configured provider.
 *
 * Tools are categorized:
 * - read_only: no governance gate, immediate return
 * - governed: require PO authority + lifecycle checks
 * - diagnostic: read-only health/diagnostic info
 * - validation: anti-hallucination reference checks
 * - context: conversation-EWO binding
 */

import type { ToolDefinition } from './providerAdapter';

// ─── Tool Categories ─────────────────────────────────────────────────────────

export type ToolCategory = 'read_only' | 'governed' | 'diagnostic' | 'validation' | 'context';

export interface ToolRegistryEntry {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: Record<string, unknown>;
  /** Governance gate required for governed tools */
  governanceGate?: 'po_authority' | 'lifecycle_state' | 'execution_gate' | 'po_approval';
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Whether this tool supports caching */
  cacheable: boolean;
}

// ─── Tool Definitions ───────────────────────────────────────────────────────

const COMMON_PARAMS = {
  conversation_id: {
    type: 'string',
    description: 'The current conversation ID',
  },
};

// ── Read-Only Tools ──────────────────────────────────────────────────────────

const READ_ONLY_TOOLS: ToolRegistryEntry[] = [
  {
    name: 'eios_get_active_project',
    description: 'Retrieve the active engineering project for this conversation, including product hierarchy and current phase.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: { conversation_id: COMMON_PARAMS.conversation_id },
      required: ['conversation_id'],
    },
    timeoutMs: 5000,
    cacheable: true,
  },
  {
    name: 'eios_get_active_ewo',
    description: 'Retrieve the active Engineering Work Order for this conversation, including lifecycle state and package status.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: { conversation_id: COMMON_PARAMS.conversation_id },
      required: ['conversation_id'],
    },
    timeoutMs: 5000,
    cacheable: true,
  },
  {
    name: 'eios_get_ewo_details',
    description: 'Retrieve full details for a specific Engineering Work Order by reference.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        ewo_ref: { type: 'string', description: 'The EWO reference (e.g. EWO-044)' },
      },
      required: ['ewo_ref'],
    },
    timeoutMs: 5000,
    cacheable: true,
  },
  {
    name: 'eios_get_repository',
    description: 'Retrieve repository metadata (owner, name, branches) for the active project or specified EWO.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: COMMON_PARAMS.conversation_id,
        ewo_ref: { type: 'string', description: 'Optional EWO reference to resolve repository' },
      },
      required: ['conversation_id'],
    },
    timeoutMs: 5000,
    cacheable: true,
  },
  {
    name: 'eios_retrieve_constitution',
    description: 'Retrieve active constitutional clauses for the engineering platform.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max clauses to return (default 10)', default: 10 },
      },
    },
    timeoutMs: 5000,
    cacheable: true,
  },
  {
    name: 'eios_search_engineering_memory',
    description: 'Search engineering memory entries scoped to the current project.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: COMMON_PARAMS.conversation_id,
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 10)', default: 10 },
      },
      required: ['conversation_id'],
    },
    timeoutMs: 5000,
    cacheable: true,
  },
  {
    name: 'eios_search_engineering_history',
    description: 'Search historical Engineering Work Orders, execution records, and evidence.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 10)', default: 10 },
        offset: { type: 'number', description: 'Pagination offset', default: 0 },
      },
    },
    timeoutMs: 5000,
    cacheable: true,
  },
  {
    name: 'eios_retrieve_architecture_decisions',
    description: 'Retrieve Architecture Decision Records (ADRs) with accepted/active status.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max ADRs to return (default 5)', default: 5 },
      },
    },
    timeoutMs: 5000,
    cacheable: true,
  },
  {
    name: 'eios_get_provider_policy',
    description: 'Retrieve the active execution provider policy, including preferred/default/allowed providers.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        ewo_ref: { type: 'string', description: 'Optional EWO reference for EWO-specific policy' },
      },
    },
    timeoutMs: 5000,
    cacheable: true,
  },
  {
    name: 'eios_get_execution_state',
    description: 'Retrieve the execution state for a specific EWO, including latest execution record and approval status.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        ewo_ref: { type: 'string', description: 'The EWO reference' },
      },
      required: ['ewo_ref'],
    },
    timeoutMs: 5000,
    cacheable: true,
  },
  {
    name: 'eios_get_audit_history',
    description: 'Retrieve audit entries for a conversation or EWO.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: { type: 'string', description: 'Conversation ID to audit' },
        ewo_ref: { type: 'string', description: 'EWO reference to audit' },
        limit: { type: 'number', description: 'Max results (default 20)', default: 20 },
      },
    },
    timeoutMs: 5000,
    cacheable: false,
  },
  {
    name: 'eios_search_knowledge_packages',
    description: 'Search Engineering Knowledge Packages in the records library.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 10)', default: 10 },
      },
    },
    timeoutMs: 5000,
    cacheable: true,
  },
  {
    name: 'eios_inspect_execution_package',
    description: 'Inspect a generated execution package (read-only). Returns planned changes, validation steps, risks, and rollback plan.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        ewo_ref: { type: 'string', description: 'The EWO reference' },
      },
      required: ['ewo_ref'],
    },
    timeoutMs: 5000,
    cacheable: false,
  },
  {
    name: 'eios_get_engineering_ideas',
    description: 'Retrieve engineering ideas for the current project.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: COMMON_PARAMS.conversation_id,
        limit: { type: 'number', description: 'Max results (default 10)', default: 10 },
      },
      required: ['conversation_id'],
    },
    timeoutMs: 5000,
    cacheable: true,
  },
  {
    name: 'eios_list_active_ewos',
    description: 'List all active Engineering Work Orders within the resolved tenant and project scope. Excludes completed, archived, and deleted EWOs. Returns EWO reference, title, lifecycle status, current stage, project, owner, and updated timestamp.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: COMMON_PARAMS.conversation_id,
        limit: { type: 'number', description: 'Max results (default 20)', default: 20 },
      },
      required: ['conversation_id'],
    },
    timeoutMs: 5000,
    cacheable: true,
  },
  // ── EWO-045: Repository Intelligence Tools ────────────────────────────────
  {
    name: 'eios_repo_discover',
    description: 'Discover the canonical repository associated with the resolved engineering project. Returns owner, name, default branch, provider, visibility, and repository identifier.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: { conversation_id: COMMON_PARAMS.conversation_id },
      required: ['conversation_id'],
    },
    timeoutMs: 10000,
    cacheable: true,
  },
  {
    name: 'eios_repo_tree',
    description: 'Browse the repository file hierarchy. Supports root listing, directory listing, and recursive tree. Use path to navigate into a directory, recursive=true for full tree.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: COMMON_PARAMS.conversation_id,
        path: { type: 'string', description: 'Directory path to list (empty for root)' },
        recursive: { type: 'boolean', description: 'If true, return full recursive tree (default false)' },
        branch: { type: 'string', description: 'Branch to browse (defaults to repository default branch)' },
      },
      required: ['conversation_id'],
    },
    timeoutMs: 15000,
    cacheable: true,
  },
  {
    name: 'eios_repo_search',
    description: 'Search repository source files by filename, symbol, class, function, string, import, or annotation. Uses GitHub code search with fuzzy matching.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: COMMON_PARAMS.conversation_id,
        query: { type: 'string', description: 'Search query (filename, symbol, function name, string literal, etc.)' },
        limit: { type: 'number', description: 'Max results (default 30)', default: 30 },
      },
      required: ['conversation_id', 'query'],
    },
    timeoutMs: 15000,
    cacheable: true,
  },
  {
    name: 'eios_repo_read_file',
    description: 'Read a file from the repository. Supports entire file or line ranges. Returns content with language detection and syntax metadata. Large files are paginated.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: COMMON_PARAMS.conversation_id,
        path: { type: 'string', description: 'File path to read' },
        start_line: { type: 'number', description: 'Starting line (1-indexed, default 1)' },
        end_line: { type: 'number', description: 'Ending line (inclusive, default = entire file)' },
        branch: { type: 'string', description: 'Branch to read from (defaults to default branch)' },
      },
      required: ['conversation_id', 'path'],
    },
    timeoutMs: 15000,
    cacheable: false,
  },
  {
    name: 'eios_repo_inspect_symbol',
    description: 'Locate classes, interfaces, methods, functions, enums, constants, and exported members in the repository. Returns definition location and references where available.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: COMMON_PARAMS.conversation_id,
        symbol: { type: 'string', description: 'Symbol name to locate (class, function, interface, etc.)' },
        file_path: { type: 'string', description: 'Optional file path to scope the search' },
      },
      required: ['conversation_id', 'symbol'],
    },
    timeoutMs: 15000,
    cacheable: true,
  },
  {
    name: 'eios_repo_history',
    description: 'Read repository commit history. Returns commits with authors, timestamps, and commit messages. Read-only.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: COMMON_PARAMS.conversation_id,
        branch: { type: 'string', description: 'Branch to list commits for (defaults to default branch)' },
        limit: { type: 'number', description: 'Max commits (default 30)', default: 30 },
      },
      required: ['conversation_id'],
    },
    timeoutMs: 15000,
    cacheable: false,
  },
  {
    name: 'eios_repo_diff',
    description: 'Inspect repository diffs. Supports current changes (branch vs base), historical diffs (commit SHA), and EWO-related changes. Read-only.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: COMMON_PARAMS.conversation_id,
        base: { type: 'string', description: 'Base ref (branch or SHA) for comparison' },
        head: { type: 'string', description: 'Head ref (branch or SHA) for comparison' },
        commit_sha: { type: 'string', description: 'Specific commit SHA to inspect (returns files changed in that commit)' },
      },
      required: ['conversation_id'],
    },
    timeoutMs: 15000,
    cacheable: false,
  },
  {
    name: 'eios_repo_architecture_records',
    description: 'Retrieve Engineering Records, Architecture Decision Records (ADRs), Completion Reports, and Constitutional Records using governed repository discovery.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: COMMON_PARAMS.conversation_id,
        record_type: { type: 'string', description: 'Type of record: "adr", "completion_report", "constitutional", "engineering_record", or "all" (default "all")' },
        limit: { type: 'number', description: 'Max results (default 10)', default: 10 },
      },
      required: ['conversation_id'],
    },
    timeoutMs: 10000,
    cacheable: true,
  },
  {
    name: 'eios_repo_cross_reference',
    description: 'Cross-reference repository answers by combining source code, Engineering Work Orders, Engineering Records, and repository history. Use when a question spans multiple domains.',
    category: 'read_only',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: COMMON_PARAMS.conversation_id,
        query: { type: 'string', description: 'Cross-reference query (e.g. "Where is resolve_context called and which EWOs modified it?")' },
        search_source: { type: 'boolean', description: 'Search source code (default true)' },
        search_ewos: { type: 'boolean', description: 'Search EWOs (default true)' },
        search_records: { type: 'boolean', description: 'Search engineering records (default true)' },
        search_history: { type: 'boolean', description: 'Search repository history (default false)' },
        limit: { type: 'number', description: 'Max results per domain (default 5)', default: 5 },
      },
      required: ['conversation_id', 'query'],
    },
    timeoutMs: 20000,
    cacheable: false,
  },
];

// ── Governed Tools ───────────────────────────────────────────────────────────

const GOVERNED_TOOLS: ToolRegistryEntry[] = [
  {
    name: 'eios_create_engineering_idea',
    description: 'Create a new Engineering Idea. Requires Product Owner authority.',
    category: 'governed',
    governanceGate: 'po_authority',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: COMMON_PARAMS.conversation_id,
        title: { type: 'string', description: 'Idea title' },
        description: { type: 'string', description: 'Idea description' },
        scope: { type: 'string', description: 'Optional scope notes' },
      },
      required: ['conversation_id', 'title', 'description'],
    },
    timeoutMs: 10000,
    cacheable: false,
  },
  {
    name: 'eios_create_ewo',
    description: 'Create a new Engineering Work Order. Requires Product Owner authority and a valid title.',
    category: 'governed',
    governanceGate: 'po_authority',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: COMMON_PARAMS.conversation_id,
        title: { type: 'string', description: 'EWO title' },
        scope: { type: 'string', description: 'EWO scope description' },
        linked_idea_id: { type: 'string', description: 'Optional linked engineering idea ID' },
      },
      required: ['conversation_id', 'title'],
    },
    timeoutMs: 10000,
    cacheable: false,
  },
  {
    name: 'eios_prepare_execution',
    description: 'Prepare an execution package for an EWO. Requires EWO to be in an eligible lifecycle state.',
    category: 'governed',
    governanceGate: 'lifecycle_state',
    parameters: {
      type: 'object',
      properties: {
        ewo_ref: { type: 'string', description: 'The EWO reference' },
        conversation_id: COMMON_PARAMS.conversation_id,
      },
      required: ['ewo_ref'],
    },
    timeoutMs: 10000,
    cacheable: false,
  },
  {
    name: 'eios_approve_execution',
    description: 'Record Product Owner execution approval for an EWO. Requires PO authority and EWO in eligible state.',
    category: 'governed',
    governanceGate: 'po_approval',
    parameters: {
      type: 'object',
      properties: {
        ewo_ref: { type: 'string', description: 'The EWO reference' },
        conversation_id: COMMON_PARAMS.conversation_id,
      },
      required: ['ewo_ref'],
    },
    timeoutMs: 10000,
    cacheable: false,
  },
  {
    name: 'eios_execute_ewo',
    description: 'Execute an EWO via the supervised execution pipeline. Requires PO approval and all execution gate checks to pass.',
    category: 'governed',
    governanceGate: 'execution_gate',
    parameters: {
      type: 'object',
      properties: {
        ewo_ref: { type: 'string', description: 'The EWO reference' },
        conversation_id: COMMON_PARAMS.conversation_id,
        requested_provider: { type: 'string', description: 'Optional preferred provider (e.g. "codex")' },
      },
      required: ['ewo_ref'],
    },
    timeoutMs: 30000,
    cacheable: false,
  },
  {
    name: 'eios_cancel_execution',
    description: 'Cancel an active execution for an EWO. Requires PO authority.',
    category: 'governed',
    governanceGate: 'po_authority',
    parameters: {
      type: 'object',
      properties: {
        ewo_ref: { type: 'string', description: 'The EWO reference' },
        conversation_id: COMMON_PARAMS.conversation_id,
      },
      required: ['ewo_ref'],
    },
    timeoutMs: 10000,
    cacheable: false,
  },
  {
    name: 'eios_delete_ewo',
    description: 'Delete an EWO via governed deletion. Requires PO authority and admin role.',
    category: 'governed',
    governanceGate: 'po_authority',
    parameters: {
      type: 'object',
      properties: {
        ewo_ref: { type: 'string', description: 'The EWO reference' },
        conversation_id: COMMON_PARAMS.conversation_id,
      },
      required: ['ewo_ref'],
    },
    timeoutMs: 10000,
    cacheable: false,
  },
  {
    name: 'eios_record_acceptance',
    description: 'Record Product Owner acceptance of a completed EWO. Requires PO authority and EWO in engineering_complete state.',
    category: 'governed',
    governanceGate: 'po_approval',
    parameters: {
      type: 'object',
      properties: {
        ewo_ref: { type: 'string', description: 'The EWO reference' },
        conversation_id: COMMON_PARAMS.conversation_id,
      },
      required: ['ewo_ref'],
    },
    timeoutMs: 10000,
    cacheable: false,
  },
  {
    name: 'eios_reject_execution',
    description: 'Reject an execution proposal for an EWO. Requires PO authority.',
    category: 'governed',
    governanceGate: 'po_authority',
    parameters: {
      type: 'object',
      properties: {
        ewo_ref: { type: 'string', description: 'The EWO reference' },
        conversation_id: COMMON_PARAMS.conversation_id,
        reason: { type: 'string', description: 'Optional rejection reason' },
      },
      required: ['ewo_ref'],
    },
    timeoutMs: 10000,
    cacheable: false,
  },
];

// ── Diagnostic Tools ─────────────────────────────────────────────────────────

const DIAGNOSTIC_TOOLS: ToolRegistryEntry[] = [
  {
    name: 'eios_get_provider_health',
    description: 'Check the health of the configured execution provider.',
    category: 'diagnostic',
    parameters: { type: 'object', properties: {} },
    timeoutMs: 5000,
    cacheable: false,
  },
  {
    name: 'eios_get_execution_diagnostics',
    description: 'Retrieve execution diagnostics for an EWO, including pipeline stages and failure details.',
    category: 'diagnostic',
    parameters: {
      type: 'object',
      properties: {
        ewo_ref: { type: 'string', description: 'The EWO reference' },
      },
      required: ['ewo_ref'],
    },
    timeoutMs: 5000,
    cacheable: false,
  },
];

// ── Validation Tools ─────────────────────────────────────────────────────────

const VALIDATION_TOOLS: ToolRegistryEntry[] = [
  {
    name: 'eios_validate_ewo_reference',
    description: 'Validate that an EWO reference exists in the database before citing it. Prevents hallucinated references.',
    category: 'validation',
    parameters: {
      type: 'object',
      properties: {
        ewo_ref: { type: 'string', description: 'The EWO reference to validate' },
      },
      required: ['ewo_ref'],
    },
    timeoutMs: 5000,
    cacheable: true,
  },
  {
    name: 'eios_validate_repository',
    description: 'Validate that a repository reference exists and is accessible.',
    category: 'validation',
    parameters: {
      type: 'object',
      properties: {
        repository: { type: 'string', description: 'Repository identifier (owner/name)' },
      },
      required: ['repository'],
    },
    timeoutMs: 5000,
    cacheable: true,
  },
];

// ── Context Tools ────────────────────────────────────────────────────────────

const CONTEXT_TOOLS: ToolRegistryEntry[] = [
  {
    name: 'eios_bind_conversation_to_ewo',
    description: 'Bind the current conversation to a specific EWO so that follow-up messages can resolve context correctly.',
    category: 'context',
    parameters: {
      type: 'object',
      properties: {
        conversation_id: COMMON_PARAMS.conversation_id,
        ewo_ref: { type: 'string', description: 'The EWO reference to bind' },
      },
      required: ['conversation_id', 'ewo_ref'],
    },
    timeoutMs: 5000,
    cacheable: false,
  },
];

// ─── Registry ────────────────────────────────────────────────────────────────

const ALL_TOOLS: ToolRegistryEntry[] = [
  ...READ_ONLY_TOOLS,
  ...GOVERNED_TOOLS,
  ...DIAGNOSTIC_TOOLS,
  ...VALIDATION_TOOLS,
  ...CONTEXT_TOOLS,
];

const TOOL_MAP = new Map<string, ToolRegistryEntry>(
  ALL_TOOLS.map((t) => [t.name, t]),
);

export function getToolDefinition(name: string): ToolRegistryEntry | null {
  return TOOL_MAP.get(name) ?? null;
}

export function getAllToolDefinitions(): ToolRegistryEntry[] {
  return ALL_TOOLS;
}

export function getToolsByCategory(category: ToolCategory): ToolRegistryEntry[] {
  return ALL_TOOLS.filter((t) => t.category === category);
}

export function getToolDefinitionsForProvider(): ToolDefinition[] {
  return ALL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

export function isGovernedTool(name: string): boolean {
  const entry = TOOL_MAP.get(name);
  return entry?.category === 'governed';
}

export function isReadOnlyTool(name: string): boolean {
  const entry = TOOL_MAP.get(name);
  return entry?.category === 'read_only' || entry?.category === 'diagnostic' || entry?.category === 'validation';
}

export { ALL_TOOLS as EIOS_TOOL_REGISTRY };
