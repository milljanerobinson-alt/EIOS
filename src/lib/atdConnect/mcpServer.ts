// EWO-024R.2 — MCP Server Tool Definitions and Routing
// Provider-independent MCP tool schemas over ATD Connect capabilities.
// All tools are read-only. No mutation tools are exposed.

export type MCPToolName =
  | 'discover_atd_capabilities'
  | 'inspect_engineering_object'
  | 'list_engineering_objects'
  | 'inspect_relationships'
  | 'inspect_platform_health'
  | 'get_inspection_audit'
  | 'submit_conversation_inspection';

export interface MCPToolDefinition {
  name: MCPToolName;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      default?: unknown;
    }>;
    required: string[];
  };
  annotations: {
    readOnlyHint: true;
    destructiveHint: false;
    idempotentHint: true;
    openWorldHint: false;
  };
}

export const MCP_TOOL_DEFINITIONS: MCPToolDefinition[] = [
  {
    name: 'discover_atd_capabilities',
    description: 'Lists all registered ATD Connect governed inspection capabilities. Returns capability IDs, names, descriptions, and lifecycle status. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        persona: {
          type: 'string',
          description: 'Requesting persona for visibility governance. Defaults to "atd".',
          default: 'atd',
        },
      },
      required: [],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'inspect_engineering_object',
    description: 'Inspects a specific engineering object using a governed ATD Connect capability and operation. Returns a governed DTO with metadata, health, and lifecycle information. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        capability: {
          type: 'string',
          description: 'The ATD Connect capability ID (e.g. "engineering-work-orders", "engineering-records").',
        },
        operation: {
          type: 'string',
          description: 'The inspection operation to execute (e.g. "inspectEngineeringWorkOrder", "inspectPage").',
        },
        object_reference: {
          type: 'string',
          description: 'The object reference to inspect (e.g. "EWO-024", "engineering-records").',
        },
        persona: {
          type: 'string',
          description: 'Requesting persona for visibility governance.',
          default: 'atd',
        },
      },
      required: ['capability', 'operation', 'object_reference'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'list_engineering_objects',
    description: 'Lists authorised engineering objects for a supported ATD Connect capability. Returns a governed list DTO. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        capability: {
          type: 'string',
          description: 'The ATD Connect capability ID (e.g. "pages", "workspaces", "engineering-work-orders").',
        },
        persona: {
          type: 'string',
          description: 'Requesting persona for visibility governance.',
          default: 'atd',
        },
      },
      required: ['capability'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'inspect_relationships',
    description: 'Returns governed relationship information for an engineering object, including relationship graph nodes and edges. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        object_reference: {
          type: 'string',
          description: 'The engineering object reference to inspect relationships for (e.g. "EWO-024").',
        },
        persona: {
          type: 'string',
          description: 'Requesting persona for visibility governance.',
          default: 'atd',
        },
      },
      required: ['object_reference'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'inspect_platform_health',
    description: 'Returns supported governed health dimensions for the ATD Connect platform, including operational health, inspection availability, evidence health, and relationship health. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'get_inspection_audit',
    description: 'Retrieves authorised ATD Connect inspection audit entries. Returns audit records with request IDs, operations, outcomes, and timestamps. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of audit entries to return (default 20, max 100).',
          default: 20,
        },
        request_source: {
          type: 'string',
          description: 'Filter by request source.',
          enum: ['workspace', 'conversational', 'external', 'mcp_self_test', 'mcp_client', 'external_confirmed'],
        },
      },
      required: [],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'submit_conversation_inspection',
    description: 'Submits a natural-language request through the deterministic Conversation Inspection Bridge. The bridge interprets the request and routes it to the appropriate governed inspection operation. Read-only — write requests are refused. CRITICAL: You MUST generate a conversation_id on the first call in each ChatGPT conversation and reuse the SAME conversation_id for every subsequent call within that conversation. Use a different conversation_id in separate conversations. Format: a random UUID v4.',
    inputSchema: {
      type: 'object',
      properties: {
        natural_language_request: {
          type: 'string',
          description: 'The natural-language inspection request (e.g. "List every engineering capability", "Inspect EWO-024").',
        },
        conversation_id: {
          type: 'string',
          description: 'REQUIRED. A UUID v4 that uniquely identifies this ChatGPT conversation. Generate a new random UUID on the FIRST tool call in a conversation, then reuse the EXACT same UUID for every subsequent tool call in the same conversation. Use a different UUID in separate conversations. Never use a user ID, client ID, or tenant ID as the conversation_id.',
        },
        requesting_persona: {
          type: 'string',
          description: 'Requesting persona for visibility governance.',
          default: 'external',
        },
        client_id: {
          type: 'string',
          description: 'Client identifier for audit tracking.',
          default: 'mcp-client',
        },
        session_id: {
          type: 'string',
          description: 'Alternative conversation-specific session identifier. If conversation_id is provided, it takes precedence.',
        },
      },
      required: ['natural_language_request', 'conversation_id'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

export function getMCPToolByName(name: string): MCPToolDefinition | undefined {
  return MCP_TOOL_DEFINITIONS.find(t => t.name === name);
}

export function isReadOnlyTool(tool: MCPToolDefinition): boolean {
  return tool.annotations.readOnlyHint === true && tool.annotations.destructiveHint === false;
}

export function getAllToolNames(): string[] {
  return MCP_TOOL_DEFINITIONS.map(t => t.name);
}

// MCP protocol helpers
export function createToolsListResponse() {
  return {
    tools: MCP_TOOL_DEFINITIONS.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: t.annotations,
    })),
  };
}

export function validateToolCall(toolName: string, args: Record<string, unknown>): { valid: boolean; error?: string } {
  const tool = getMCPToolByName(toolName);
  if (!tool) {
    return { valid: false, error: `Unknown tool: ${toolName}. Available tools: ${getAllToolNames().join(', ')}` };
  }

  if (!isReadOnlyTool(tool)) {
    return { valid: false, error: `Tool ${toolName} is not a read-only tool.` };
  }

  // Validate required fields
  for (const requiredField of tool.inputSchema.required) {
    if (args[requiredField] === undefined || args[requiredField] === null) {
      return { valid: false, error: `Missing required parameter: ${requiredField}` };
    }
  }

  // Validate enum fields
  for (const [fieldName, fieldDef] of Object.entries(tool.inputSchema.properties)) {
    if (args[fieldName] !== undefined && fieldDef.enum) {
      const value = String(args[fieldName]);
      if (!fieldDef.enum.includes(value)) {
        return { valid: false, error: `Invalid value for ${fieldName}: ${value}. Must be one of: ${fieldDef.enum.join(', ')}` };
      }
    }
  }

  return { valid: true };
}
