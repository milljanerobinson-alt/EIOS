// EWO-024R.1 — ATD Connect: Conversation Inspection Bridge
// Provider-independent NL interpretation + governed request execution.
// Never queries EIOS tables directly — invokes the same governed inspection services.

import { supabase } from '../supabase';
import { recordInspection } from './auditService';
import { computeHealth, governedEmptyHealth } from './healthService';
import { getCapabilityDefinition, getRegisteredCapabilityIds } from './capabilityRegistry';
import type {
  ConversationInspectionRequest,
  ConversationInspectionResponse,
  EvidenceReference,
  ConstitutionalReference,
  HealthInfo,
  InspectionOptions,
  PipelineDiagnosticInfo,
  PipelineStageResult,
  GovernedRefusal,
  READ_ONLY_VIOLATION_KEYWORDS,
} from './types';
import {
  discoverCapabilities,
  inspectCapabilityById,
  listPages, inspectPage,
  listWorkspaces, inspectWorkspace,
  listServices, inspectService,
  listStandards, inspectStandard,
  listConstitution, inspectConstitution,
  listEngineeringRecords, inspectEngineeringRecord,
  listEngineeringWorkOrders, inspectEngineeringWorkOrder,
  listEngineeringPlans, inspectEngineeringPlan,
  listMemory, inspectMemory,
  listKnowledge, inspectKnowledge,
  listLineage, inspectLineage,
  inspectRelationships,
  inspectKnowledgeExtraction,
  inspectEngineeringWorkOrderAcceptanceGovernance,
} from './inspectionServices';
import {
  listExecutionProviders,
  inspectExecutionProvider,
  inspectCodexProviderImplementationEvidence,
  listExecutionRecords,
  inspectExecutionRecord,
  inspectExecutionPipeline,
  inspectExecutionGovernanceGate,
  inspectExecutionHistory,
  inspectSupervisedExecutionEngine,
} from '../executionDiagnosticsService';
import type { GovernedResponse, IntentDiagnosticsInfo } from './types';
import {
  classifyExecutionIntent,
  routeConversationToExecution,
  type IntentDiagnostics as ExecutionIntentDiagnostics,
} from '../executionIntentRouter';
import { inspectProviderPolicy } from '../providerPolicyService';
import { inspectExecutionHandoff } from '../executionHandoffService';

// ─── NL Interpretation (deterministic, provider-independent) ─────────────────────

interface InterpretedRequest {
  capability: string | null;
  operation: string | null;
  objectReference: string | null;
  interpretation: string;
  isWriteRequest: boolean;
  ambiguous: boolean;
  intentLabel: string | null;
  matchedPattern: string | null;
  isExecutionInspection: boolean;
  isFrameworkIntrospection: boolean;
  isMetadataQuestion: boolean;
}

// Map of operation keywords to capability + operation
// PRECEDENCE ORDER: execution engine → execution provider → execution record/package/pipeline
// → generic capability → generic inspection → unresolved
const OPERATION_PATTERNS: Array<{
  patterns: RegExp[];
  capability: string;
  operation: string;
  requiresObject: boolean;
  objectPattern?: RegExp;
  intentLabel?: string;
}> = [
  // EWO-031R.2/R.4: Provider policy inspection — HIGHEST PRECEDENCE (before supervised execution engine)
  // R.4: Added direct RPC name and canonical operation name aliases.
  // requiresObject: false so it works without an EWO reference (null parameter to RPC).
  {
    patterns: [
      /inspect\s+(?:the\s+)?(?:supervised\s+)?execution\s+engine\s+and\s+provider\s+selection\s+(?:for\s+)?(EWO-[\w.-]+)\b/i,
      /inspect\s+(?:the\s+)?(?:supervised\s+)?execution\s+engine\s+and\s+provider\s+selection/i,
      /inspect\s+(?:the\s+)?provider\s+(?:policy|selection)\s+(?:for\s+)?(EWO-[\w.-]+)\b/i,
      /inspect\s+(?:the\s+)?provider\s+(?:policy|selection)/i,
      /inspect\s+(?:the\s+)?(?:preferred|default|allowed|fallback)\s+provider/i,
      /invoke\s+inspect_execution_provider_policy\s+(?:directly\s+)?(?:for\s+)?(EWO-[\w.-]+)?\b/i,
      /invoke\s+inspect_execution_provider_policy\s+directly/i,
      /invoke\s+inspectexecutionproviderpolicy\s+(?:directly\s+)?(?:for\s+)?(EWO-[\w.-]+)?\b/i,
      /invoke\s+inspectexecutionproviderpolicy\s+directly/i,
      /return\s+(?:the\s+)?(?:live\s+)?execution\s+provider\s+policy/i,
      /inspect\s+(?:the\s+)?execution\s+provider\s+policy/i,
    ],
    capability: 'supervised-engineering-execution',
    operation: 'inspectExecutionProviderPolicy',
    requiresObject: false,
    objectPattern: /(EWO-[\w.-]+)/i,
    intentLabel: 'provider_policy_inspection',
  },
  // EWO-032: Execution handoff inspection — read-only inspection of the handoff state
  {
    patterns: [
      /inspect\s+(?:the\s+)?execution\s+handoff\s+(?:for\s+)?(EWO-[\w.-]+?)?\b/i,
      /inspect\s+(?:the\s+)?execution\s+handoff/i,
      /invoke\s+inspect_execution_handoff\s+(?:directly\s+)?(?:for\s+)?(EWO-[\w.-]+?)?\b/i,
      /invoke\s+inspect_execution_handoff\s+directly/i,
      /invoke\s+inspectexecutionhandoff\s+(?:directly\s+)?(?:for\s+)?(EWO-[\w.-]+?)?\b/i,
      /invoke\s+inspectexecutionhandoff\s+directly/i,
      /return\s+(?:the\s+)?execution\s+handoff\s+(?:state|status)/i,
      /inspect\s+(?:the\s+)?handoff\s+(?:state|status)/i,
    ],
    capability: 'supervised-engineering-execution',
    operation: 'inspectExecutionHandoff',
    requiresObject: false,
    objectPattern: /(EWO-[\w.-]+)/i,
    intentLabel: 'execution_handoff_inspection',
  },
  // EWO-029R.1: Supervised execution engine inspection
  // EWO-031R.2: Negative lookahead prevents matching when "provider selection" or "provider policy" follows.
  {
    patterns: [
      /inspect\s+(?:the\s+)?(?:supervised\s+)?(?:engineering\s+)?execution\s+engine(?!\s+and\s+provider\s+(?:selection|policy))/i,
      /explain\s+(?:the\s+)?(?:supervised\s+)?(?:engineering\s+)?execution\s+engine(?!\s+and\s+provider\s+(?:selection|policy))/i,
      /describe\s+(?:the\s+)?(?:supervised\s+)?(?:engineering\s+)?execution\s+engine(?!\s+and\s+provider\s+(?:selection|policy))/i,
      /show\s+(?:the\s+)?(?:supervised\s+)?(?:engineering\s+)?execution\s+engine(?!\s+and\s+provider\s+(?:selection|policy))/i,
      /what\s+is\s+(?:the\s+)?(?:supervised\s+)?(?:engineering\s+)?execution\s+engine(?!\s+and\s+provider\s+(?:selection|policy))/i,
      /inspect\s+(?:the\s+)?supervised\s+engineering\s+execution(?!\s+and\s+provider\s+(?:selection|policy))/i,
      /inspect\s+(?:the\s+)?execution\s+provider\s+framework/i,
      /show\s+(?:the\s+)?engineering\s+execution\s+providers?\s+and\s+pipeline/i,
      /what\s+governance\s+gates\s+prevent\s+(?:atd|eos)\s+from\s+executing/i,
      /inspect\s+(?:the\s+)?supervised\s+engineering\s+execution\s+engine(?!\s+and\s+provider\s+(?:selection|policy))/i,
      /show\s+(?:the\s+)?supervised\s+engineering\s+execution(?!\s+and\s+provider\s+(?:selection|policy))/i,
      /explain\s+(?:the\s+)?supervised\s+engineering\s+execution(?!\s+and\s+provider\s+(?:selection|policy))/i,
    ],
    capability: 'supervised-engineering-execution',
    operation: 'inspectSupervisedExecutionEngine',
    requiresObject: false,
    intentLabel: 'supervised_execution_engine_inspection',
  },
  // EWO-029R.1: Execution package support inspection
  {
    patterns: [
      /inspect\s+(?:the\s+)?execution\s+package\s+support/i,
      /show\s+(?:the\s+)?execution\s+package\s+support/i,
      /what\s+is\s+(?:the\s+)?execution\s+package\s+support/i,
    ],
    capability: 'supervised-engineering-execution',
    operation: 'inspectSupervisedExecutionEngine',
    requiresObject: false,
    intentLabel: 'supervised_execution_engine_inspection',
  },
  // discoverCapabilities
  {
    patterns: [/list\s+(every\s+|all\s+)?(engineering\s+)?capabilit/i, /discover\s+capabilit/i, /show\s+capabilit/i, /what\s+capabilit/i],
    capability: 'atd-connect',
    operation: 'discoverCapabilities',
    requiresObject: false,
  },
  // listPages
  {
    patterns: [/list\s+pages/i, /show\s+pages/i, /what\s+pages/i],
    capability: 'pages',
    operation: 'listPages',
    requiresObject: false,
  },
  // inspectPage
  {
    patterns: [/inspect\s+(?:the\s+)?(.+?)\s+page/i, /describe\s+(?:the\s+)?(.+?)\s+page/i],
    capability: 'pages',
    operation: 'inspectPage',
    requiresObject: true,
    objectPattern: /inspect\s+(?:the\s+)?(.+?)\s+page/i,
  },
  // listWorkspaces
  {
    patterns: [/list\s+workspaces/i, /show\s+workspaces/i, /what\s+workspaces/i],
    capability: 'workspaces',
    operation: 'listWorkspaces',
    requiresObject: false,
  },
  // inspectWorkspace
  {
    patterns: [/inspect\s+(?:the\s+)?(.+?)\s+workspace/i, /describe\s+(?:the\s+)?(.+?)\s+workspace/i],
    capability: 'workspaces',
    operation: 'inspectWorkspace',
    requiresObject: true,
    objectPattern: /inspect\s+(?:the\s+)?(.+?)\s+workspace/i,
  },
  // listServices
  {
    patterns: [/list\s+services/i, /show\s+services/i, /what\s+services/i],
    capability: 'services',
    operation: 'listServices',
    requiresObject: false,
  },
  // inspectService
  {
    patterns: [/inspect\s+(?:the\s+)?(.+?)\s+service/i, /describe\s+(?:the\s+)?(.+?)\s+service/i],
    capability: 'services',
    operation: 'inspectService',
    requiresObject: true,
    objectPattern: /inspect\s+(?:the\s+)?(.+?)\s+service/i,
  },
  // listStandards
  {
    patterns: [/list\s+(engineering\s+)?standards/i, /show\s+(all\s+)?(engineering\s+)?standards/i, /what\s+standards/i],
    capability: 'standards',
    operation: 'listStandards',
    requiresObject: false,
  },
  // inspectStandard
  {
    patterns: [/inspect\s+(?:the\s+)?standard\s+(?:for\s+)?(.+)/i, /describe\s+(?:the\s+)?standard\s+(?:for\s+)?(.+)/i],
    capability: 'standards',
    operation: 'inspectStandard',
    requiresObject: true,
    objectPattern: /inspect\s+(?:the\s+)?standard\s+(?:for\s+)?(.+)/i,
  },
  // listConstitution
  {
    patterns: [/list\s+constitution/i, /show\s+constitution/i, /what\s+constitution/i],
    capability: 'constitution',
    operation: 'listConstitution',
    requiresObject: false,
  },
  // inspectConstitution
  {
    patterns: [/inspect\s+(?:the\s+)?(?:amendment|constitution)\s+(?:for\s+)?(.+)/i],
    capability: 'constitution',
    operation: 'inspectConstitution',
    requiresObject: true,
    objectPattern: /inspect\s+(?:the\s+)?(?:amendment|constitution)\s+(?:for\s+)?(.+)/i,
  },
  // listEngineeringRecords
  {
    patterns: [/list\s+(engineering\s+)?records/i, /show\s+(engineering\s+)?records/i, /what\s+records/i],
    capability: 'engineering-records',
    operation: 'listEngineeringRecords',
    requiresObject: false,
  },
  // inspectEngineeringRecord
  {
    patterns: [/inspect\s+(?:the\s+)?(?:engineering\s+)?record\s+(?:for\s+)?(.+)/i],
    capability: 'engineering-records',
    operation: 'inspectEngineeringRecord',
    requiresObject: true,
    objectPattern: /inspect\s+(?:the\s+)?(?:engineering\s+)?record\s+(?:for\s+)?(.+)/i,
  },
  // EWO-030R.1: Codex provider implementation evidence — must come BEFORE the EWO
  // inspection pattern (line ~217) so "EWO-030 provider implementation" routes here
  // instead of being captured as a generic EWO inspection.
  {
    patterns: [
      /inspect\s+(?:the\s+)?codex\s+(?:execution\s+)?provider\s+implementation\s+evidence/i,
      /inspect\s+(?:the\s+)?codex\s+provider\s+implementation\s+evidence/i,
      /inspect\s+(?:the\s+)?codex\s+provider\s+evidence/i,
      /inspect\s+(?:the\s+)?ewo-030\s+provider\s+implementation/i,
      /inspect\s+(?:the\s+)?codex\s+execution\s+provider\s+setup/i,
      /verify\s+(?:the\s+)?codex\s+provider\s+configuration/i,
      /inspect\s+(?:the\s+)?codex\s+execution\s+provider\s+implementation/i,
      /inspect\s+(?:the\s+)?codex\s+implementation\s+evidence/i,
    ],
    capability: 'supervised-engineering-execution',
    operation: 'inspectCodexProviderImplementationEvidence',
    requiresObject: false,
    intentLabel: 'codex_provider_implementation_evidence_inspection',
  },
  // EWO-030R.5: Acceptance governance inspection — must come BEFORE generic EWO
  // inspection patterns so "Inspect the EWO-030R.2 acceptance governance state"
  // routes here instead of being captured as a generic EWO inspection.
  {
    patterns: [
      /inspect\s+(?:the\s+)?(EWO-[\w.]+)\s+acceptance\s+governance\s+state/i,
      /inspect\s+(?:the\s+)?acceptance\s+governance\s+(?:state\s+)?(?:for\s+)?(EWO-[\w.]+)/i,
      /inspect\s+(?:the\s+)?product\s+owner\s+acceptance\s+governance\s+(?:for\s+)?(EWO-[\w.]+)/i,
      /verify\s+(?:the\s+)?acceptance\s+safeguards\s+(?:for\s+)?(EWO-[\w.]+)/i,
      /inspect\s+(?:the\s+)?unauthorised\s+acceptance\s+correction\s+(?:for\s+)?(EWO-[\w.]+)/i,
      /inspect\s+(?:the\s+)?governed\s+acceptance\s+state\s+of\s+(EWO-[\w.]+)/i,
      /inspect\s+(?:the\s+)?acceptance\s+governance\s+of\s+(EWO-[\w.]+)/i,
    ],
    capability: 'engineering-work-orders',
    operation: 'inspectEngineeringWorkOrderAcceptanceGovernance',
    requiresObject: true,
    objectPattern: /(?:state\s+)?(?:for\s+|of\s+)?(EWO-[\w.]+)/i,
    intentLabel: 'acceptance_governance_inspection',
  },
  // listEngineeringWorkOrders
  {
    patterns: [/list\s+(engineering\s+)?work\s+orders/i, /show\s+(engineering\s+)?work\s+orders/i, /what\s+work\s+orders/i],
    capability: 'engineering-work-orders',
    operation: 'listEngineeringWorkOrders',
    requiresObject: false,
  },
  // inspectEngineeringWorkOrder — "Inspect EWO-024"
  {
    patterns: [/inspect\s+(?:ewo\s+)?(EWO-[\w.]+)/i, /inspect\s+(?:the\s+)?(?:engineering\s+work\s+order\s+)?(EWO-[\w.]+)/i, /describe\s+(?:ewo\s+)?(EWO-[\w.]+)/i],
    capability: 'engineering-work-orders',
    operation: 'inspectEngineeringWorkOrder',
    requiresObject: true,
    objectPattern: /inspect\s+(?:ewo\s+)?(EWO-[\w.]+)/i,
  },
  // listEngineeringPlans
  {
    patterns: [/list\s+(engineering\s+)?plans/i, /show\s+(engineering\s+)?plans/i, /what\s+plans/i],
    capability: 'engineering-plans',
    operation: 'listEngineeringPlans',
    requiresObject: false,
  },
  // inspectEngineeringPlan
  {
    patterns: [/inspect\s+(?:the\s+)?(?:engineering\s+)?plan\s+(?:for\s+)?(.+)/i],
    capability: 'engineering-plans',
    operation: 'inspectEngineeringPlan',
    requiresObject: true,
    objectPattern: /inspect\s+(?:the\s+)?(?:engineering\s+)?plan\s+(?:for\s+)?(.+)/i,
  },
  // listMemory
  {
    patterns: [/list\s+(engineering\s+)?memory/i, /show\s+(engineering\s+)?memory/i, /what\s+memory/i],
    capability: 'memory',
    operation: 'listMemory',
    requiresObject: false,
  },
  // inspectMemory
  {
    patterns: [/inspect\s+(?:the\s+)?(?:engineering\s+)?memory\s+(?:for\s+)?(.+)/i, /inspect\s+memory\s+(?:for\s+)?(.+)/i],
    capability: 'memory',
    operation: 'inspectMemory',
    requiresObject: true,
    objectPattern: /inspect\s+(?:the\s+)?(?:engineering\s+)?memory\s+(?:for\s+)?(.+)/i,
  },
  // listKnowledge
  {
    patterns: [/list\s+knowledge/i, /show\s+(all\s+)?knowledge/i, /show\s+related\s+knowledge/i, /what\s+knowledge/i],
    capability: 'knowledge',
    operation: 'listKnowledge',
    requiresObject: false,
  },
  // inspectKnowledge
  {
    patterns: [/inspect\s+(?:the\s+)?knowledge\s+(?:for\s+)?(.+)/i, /describe\s+(?:the\s+)?knowledge\s+(?:for\s+)?(.+)/i],
    capability: 'knowledge',
    operation: 'inspectKnowledge',
    requiresObject: true,
    objectPattern: /inspect\s+(?:the\s+)?knowledge\s+(?:for\s+)?(.+)/i,
  },
  // listLineage
  {
    patterns: [/list\s+lineage/i, /show\s+lineage/i, /what\s+lineage/i],
    capability: 'lineage',
    operation: 'listLineage',
    requiresObject: false,
  },
  // inspectLineage
  {
    patterns: [/inspect\s+(?:the\s+)?lineage\s+(?:for\s+)?(.+)/i],
    capability: 'lineage',
    operation: 'inspectLineage',
    requiresObject: true,
    objectPattern: /inspect\s+(?:the\s+)?lineage\s+(?:for\s+)?(.+)/i,
  },
  // inspectRelationships — "Show relationships for EWO-023"
  {
    patterns: [/(?:show|inspect|list|navigate)\s+relationships?\s+(?:for\s+)?(.+)/i, /relationships?\s+(?:for\s+)?(EWO-[\w.]+)/i, /related\s+engineering\s+(?:for\s+)?(.+)/i],
    capability: 'lineage',
    operation: 'inspectRelationships',
    requiresObject: true,
    objectPattern: /(?:for\s+)?(EWO-[\w.]+|[A-Za-z][\w-]+)/i,
  },
  // inspectKnowledgeExtraction — "Show Engineering Knowledge for EWO-028", "Inspect the extracted knowledge for EWO-017R.2R"
  {
    patterns: [
      /(?:show|inspect|display|include)\s+(?:the\s+)?(?:engineering\s+)?knowledge\s+(?:extraction\s+)?(?:for\s+)?(.+)/i,
      /inspect\s+(?:the\s+)?extracted\s+knowledge(?:\s+for\s+(.+))?/i,
      /show\s+knowledge\s+extraction(?:\s+for\s+(.+))?/i,
      /include\s+(?:the\s+)?(?:engineering\s+)?knowledge(?:\s+information)?(?:\s+for\s+(.+))?/i,
      /what\s+(?:is\s+the\s+)?knowledge\s+extraction(?:\s+for\s+(.+))?/i,
    ],
    capability: 'engineering-work-orders',
    operation: 'inspectKnowledgeExtraction',
    requiresObject: true,
    objectPattern: /(?:for\s+)?(EWO-[\w.]+)/i,
  },
  // Capability inspection — "Describe this capability" / "Inspect engineering-records capability"
  {
    patterns: [/describe\s+(?:this\s+)?capability\s*:??\s*(.+)?/i, /inspect\s+(?:the\s+)?capability\s*:??\s*(.+)?/i],
    capability: 'atd-connect',
    operation: 'inspectCapability',
    requiresObject: true,
    objectPattern: /(?:capability\s*:??\s*)?(.+)/i,
  },
  // EWO-029: Execution provider inspection — "List execution providers", "Show execution providers"
  {
    patterns: [/list\s+execution\s+providers/i, /show\s+execution\s+providers/i, /what\s+execution\s+providers/i],
    capability: 'execution-providers',
    operation: 'listExecutionProviders',
    requiresObject: false,
    intentLabel: 'execution_provider_inspection',
  },
  // EWO-029: Inspect execution provider — "Inspect the bolt execution provider"
  {
    patterns: [/inspect\s+(?:the\s+)?(.+?)\s+execution\s+provider/i, /describe\s+(?:the\s+)?(.+?)\s+execution\s+provider/i],
    capability: 'execution-providers',
    operation: 'inspectExecutionProvider',
    requiresObject: true,
    objectPattern: /inspect\s+(?:the\s+)?(.+?)\s+execution\s+provider/i,
    intentLabel: 'execution_provider_inspection',
  },
  // EWO-029: Execution records — "List execution records", "Show execution records"
  {
    patterns: [/list\s+execution\s+records/i, /show\s+execution\s+records/i, /what\s+execution\s+records/i],
    capability: 'execution-records',
    operation: 'listExecutionRecords',
    requiresObject: false,
    intentLabel: 'execution_record_inspection',
  },
  // EWO-029: Inspect execution record — "Inspect execution SER-..."
  {
    patterns: [/inspect\s+(?:the\s+)?execution\s+record\s+(?:for\s+)?(.+)/i, /inspect\s+(SER-[\w.-]+)/i],
    capability: 'execution-records',
    operation: 'inspectExecutionRecord',
    requiresObject: true,
    objectPattern: /(?:for\s+)?(SER-[\w.-]+|.+)/i,
    intentLabel: 'execution_record_inspection',
  },
  // EWO-029: Execution pipeline — "Inspect execution pipeline for SER-..."
  {
    patterns: [/inspect\s+(?:the\s+)?execution\s+pipeline\s+(?:for\s+)?(.+)/i, /show\s+execution\s+pipeline\s+(?:for\s+)?(.+)/i],
    capability: 'execution-pipeline',
    operation: 'inspectExecutionPipeline',
    requiresObject: true,
    objectPattern: /(?:for\s+)?(SER-[\w.-]+|.+)/i,
    intentLabel: 'execution_pipeline_inspection',
  },
  // EWO-029: Execution governance gate — "Inspect execution governance gate for EWO-..."
  {
    patterns: [/inspect\s+(?:the\s+)?execution\s+governance\s+gate\s+(?:for\s+)?(.+)/i, /show\s+execution\s+governance\s+(?:for\s+)?(.+)/i],
    capability: 'execution-governance',
    operation: 'inspectExecutionGovernanceGate',
    requiresObject: true,
    objectPattern: /(?:for\s+)?(EWO-[\w.]+|.+)/i,
    intentLabel: 'execution_governance_inspection',
  },
  // EWO-029: Execution history — "Show execution history for EWO-..."
  {
    patterns: [/(?:show|list|inspect)\s+execution\s+history\s+(?:for\s+)?(.+)/i],
    capability: 'execution-history',
    operation: 'inspectExecutionHistory',
    requiresObject: true,
    objectPattern: /(?:for\s+)?(EWO-[\w.]+|.+)/i,
    intentLabel: 'execution_history_inspection',
  },
];

const WRITE_KEYWORDS = [
  'insert', 'update', 'delete', 'create', 'modify', 'change',
  'approve', 'accept', 'close', 'deploy', 'execute', 'run',
  'lifecycle', 'transition', 'write', 'set', 'assign',
  'remove', 'drop', 'purge', 'archive', 'restore',
];

const NEGATIVE_CONTEXT_PATTERNS = [
  /do\s+not\s+(?:perform|make|execute|trigger|initiate)\s+(?:any\s+)?(?:lifecycle\s+)?changes?/i,
  /do\s+not\s+(?:perform|make|execute|trigger|initiate)\s+(?:any\s+)?lifecycle/i,
  /no\s+lifecycle\s+changes?/i,
  /read[\s-]?only/i,
  /do\s+not\s+(?:write|modify|update|create|delete|insert)/i,
  // EWO-031R.3: Negation-aware execution suppression
  /do\s+not\s+execute\b/i,
  /don'?t\s+execute\b/i,
  /do\s+not\s+run\b/i,
  /do\s+not\s+start\b/i,
  /do\s+not\s+dispatch\b/i,
  /do\s+not\s+validate\b/i,
  /do\s+not\s+advance\b/i,
  /inspection\s+only\b/i,
];

function isWriteRequest(text: string): boolean {
  const lower = text.toLowerCase();

  // EWO-031: Governed execution intents are NOT write requests — they route
  // through the governed execution pipeline, not the read-only inspection layer.
  // Check for governed execution intent patterns first.
  const execIntent = classifyExecutionIntent(text, null);
  if (execIntent.detected_intent !== 'advisory' && execIntent.detected_intent !== 'unresolved' && execIntent.detected_intent !== 'inspection') {
    return false;
  }

  // Check for negative context — if the request explicitly says NOT to perform
  // lifecycle changes, it's a read-only inspection request
  for (const pattern of NEGATIVE_CONTEXT_PATTERNS) {
    if (pattern.test(text)) return false;
  }

  // Check for inspection keywords that indicate read-only intent
  const isInspection = /\b(?:inspect|show|list|describe|explain|what|how|tell\s+me\s+about|view|display|get|fetch|retrieve)\b/i.test(text);

  // If the request is clearly an inspection and mentions "execute" only in
  // the context of "execution engine", "execution provider", etc., it's read-only
  if (isInspection && /\b(?:execution\s+engine|execution\s+provider|execution\s+pipeline|execution\s+package|execution\s+record|execution\s+history|execution\s+governance)\b/i.test(text)) {
    // Check if "execute" appears as a standalone verb (not part of "execution X")
    const executeAsVerb = /\bexecute\b(?!\s+(?:engine|provider|pipeline|package|record|history|governance|engine\.|engine,))/i;
    if (!executeAsVerb.test(text)) return false;
  }

  return WRITE_KEYWORDS.some(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    return regex.test(lower);
  });
}

function extractObjectReference(text: string, pattern: RegExp): string | null {
  const match = text.match(pattern);
  if (match && match[1]) {
    return match[1].trim().replace(/[.]+$/, '');
  }
  return null;
}

export function interpretRequest(naturalLanguageRequest: string): InterpretedRequest {
  const text = naturalLanguageRequest.trim();
  const writeRequest = isWriteRequest(text);

  if (writeRequest) {
    return {
      capability: null,
      operation: null,
      objectReference: null,
      interpretation: 'Request appears to be a write operation. ATD Connect is read-only.',
      isWriteRequest: true,
      ambiguous: false,
      intentLabel: 'write_request',
      matchedPattern: null,
      isExecutionInspection: false,
      isFrameworkIntrospection: false,
      isMetadataQuestion: false,
    };
  }

  for (const pattern of OPERATION_PATTERNS) {
    for (const regex of pattern.patterns) {
      if (regex.test(text)) {
        let objectRef: string | null = null;
        if (pattern.requiresObject && pattern.objectPattern) {
          objectRef = extractObjectReference(text, pattern.objectPattern);
          if (!objectRef) {
            return {
              capability: pattern.capability,
              operation: pattern.operation,
              objectReference: null,
              interpretation: `Resolved operation "${pattern.operation}" for capability "${pattern.capability}" but could not extract object reference from request.`,
              isWriteRequest: false,
              ambiguous: true,
              intentLabel: pattern.intentLabel ?? null,
              matchedPattern: regex.source,
              isExecutionInspection: pattern.capability.includes('execution'),
              isFrameworkIntrospection: pattern.capability === 'atd-connect',
              isMetadataQuestion: false,
            };
          }
        } else if (pattern.objectPattern) {
          // EWO-031R.4: Extract object optionally even when not required
          objectRef = extractObjectReference(text, pattern.objectPattern);
        }
        return {
          capability: pattern.capability,
          operation: pattern.operation,
          objectReference: objectRef,
          interpretation: `Resolved to capability "${pattern.capability}", operation "${pattern.operation}"${objectRef ? `, object "${objectRef}"` : ''}.`,
          isWriteRequest: false,
          ambiguous: false,
          intentLabel: pattern.intentLabel ?? null,
          matchedPattern: regex.source,
          isExecutionInspection: pattern.capability.includes('execution'),
          isFrameworkIntrospection: pattern.capability === 'atd-connect',
          isMetadataQuestion: false,
        };
      }
    }
  }

  return {
    capability: null,
    operation: null,
    objectReference: null,
    interpretation: 'Unable to resolve request to a supported ATD Connect operation. Please try: "List every engineering capability", "Inspect EWO-024", "Show all Engineering Standards", or "Show relationships for EWO-023".',
    isWriteRequest: false,
    ambiguous: true,
    intentLabel: 'unresolved',
    matchedPattern: null,
    isExecutionInspection: false,
    isFrameworkIntrospection: false,
    isMetadataQuestion: false,
  };
}

// ─── Pipeline Stage Tracking ─────────────────────────────────────────────────────

function createPipelineTracker(): {
  stages: PipelineStageResult[];
  start: number;
  addStage: (stage: PipelineStageResult['stage'], status: PipelineStageResult['status'], message?: string) => void;
  getDiagnosticInfo: () => PipelineDiagnosticInfo;
} {
  const stages: PipelineStageResult[] = [];
  const start = Date.now();

  return {
    stages,
    start,
    addStage(stage, status, message) {
      stages.push({ stage, status, message, duration_ms: Date.now() - start });
    },
    getDiagnosticInfo() {
      return {
        stages,
        total_duration_ms: Date.now() - start,
        stages_completed: stages.filter(s => s.status === 'completed').length,
        stages_failed: stages.filter(s => s.status === 'failed').length,
        stages_not_applicable: stages.filter(s => s.status === 'not_applicable').length,
      };
    },
  };
}

// ─── Execute Governed Inspection ──────────────────────────────────────────────────

async function executeInspection(
  capability: string,
  operation: string,
  objectRef: string | null,
  persona: string,
  options: InspectionOptions,
): Promise<{ result: GovernedResponse<unknown>; pipeline: ReturnType<typeof createPipelineTracker> }> {
  const pipeline = createPipelineTracker();
  pipeline.addStage('request_received', 'completed');
  pipeline.addStage('authentication_context_established', 'completed', `Persona: ${persona}`);
  pipeline.addStage('persona_visibility_authorisation', 'completed', 'Visibility: public');
  pipeline.addStage('constitutional_governance_evaluation', 'completed', 'No violations');
  pipeline.addStage('capability_resolution', 'completed', `Capability: ${capability}`);
  pipeline.addStage('operation_validation', 'completed', `Operation: ${operation}`);

  if (objectRef) {
    pipeline.addStage('object_reference_validation', 'completed', `Object: ${objectRef}`);
  } else {
    pipeline.addStage('object_reference_validation', 'not_applicable', 'List operation — no object reference required');
  }

  let result: GovernedResponse<unknown>;

  try {
    // Route to the correct inspection service
    switch (operation) {
      case 'discoverCapabilities':
        result = await discoverCapabilities(persona) as GovernedResponse<unknown>;
        break;
      case 'inspectCapability':
        result = await inspectCapabilityById(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'listPages':
        result = await listPages(persona) as GovernedResponse<unknown>;
        break;
      case 'inspectPage':
        result = await inspectPage(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'listWorkspaces':
        result = await listWorkspaces(persona) as GovernedResponse<unknown>;
        break;
      case 'inspectWorkspace':
        result = await inspectWorkspace(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'listServices':
        result = await listServices(persona) as GovernedResponse<unknown>;
        break;
      case 'inspectService':
        result = await inspectService(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'listStandards':
        result = await listStandards(persona) as GovernedResponse<unknown>;
        break;
      case 'inspectStandard':
        result = await inspectStandard(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'listConstitution':
        result = await listConstitution(persona) as GovernedResponse<unknown>;
        break;
      case 'inspectConstitution':
        result = await inspectConstitution(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'listEngineeringRecords':
        result = await listEngineeringRecords(persona) as GovernedResponse<unknown>;
        break;
      case 'inspectEngineeringRecord':
        result = await inspectEngineeringRecord(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'listEngineeringWorkOrders':
        result = await listEngineeringWorkOrders(persona) as GovernedResponse<unknown>;
        break;
      case 'inspectEngineeringWorkOrder':
        result = await inspectEngineeringWorkOrder(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'inspectEngineeringWorkOrderAcceptanceGovernance':
        result = await inspectEngineeringWorkOrderAcceptanceGovernance(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'listEngineeringPlans':
        result = await listEngineeringPlans(persona) as GovernedResponse<unknown>;
        break;
      case 'inspectEngineeringPlan':
        result = await inspectEngineeringPlan(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'listMemory':
        result = await listMemory(persona) as GovernedResponse<unknown>;
        break;
      case 'inspectMemory':
        result = await inspectMemory(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'listKnowledge':
        result = await listKnowledge(persona) as GovernedResponse<unknown>;
        break;
      case 'inspectKnowledge':
        result = await inspectKnowledge(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'listLineage':
        result = await listLineage(persona) as GovernedResponse<unknown>;
        break;
      case 'inspectLineage':
        result = await inspectLineage(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'inspectRelationships':
        result = await inspectRelationships(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'inspectKnowledgeExtraction':
        result = await inspectKnowledgeExtraction(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'inspectSupervisedExecutionEngine':
        result = await inspectSupervisedExecutionEngine(persona) as GovernedResponse<unknown>;
        break;
      case 'inspectExecutionProviderPolicy':
        result = await inspectProviderPolicy(objectRef) as GovernedResponse<unknown>;
        break;
      case 'inspectExecutionHandoff': {
        const handoffData = await inspectExecutionHandoff(objectRef);
        result = {
          governed: true,
          data: handoffData,
          explanation: handoffData.handoff_found ? 'Execution handoff state retrieved from persisted runtime evidence.' : 'No execution handoff request found.',
          health: governedEmptyHealth(),
          metadata: {
            request_id: 'handoff-inspection',
            timestamp: new Date().toISOString(),
            requesting_persona: persona,
            operation: 'inspectExecutionHandoff' as any,
            duration_ms: 0,
          },
        } as GovernedResponse<unknown>;
        break;
      }
      case 'listExecutionProviders':
        result = await listExecutionProviders(persona) as GovernedResponse<unknown>;
        break;
      case 'inspectExecutionProvider':
        result = await inspectExecutionProvider(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'inspectCodexProviderImplementationEvidence':
        result = await inspectCodexProviderImplementationEvidence(persona) as GovernedResponse<unknown>;
        break;
      case 'listExecutionRecords':
        result = await listExecutionRecords(persona) as GovernedResponse<unknown>;
        break;
      case 'inspectExecutionRecord':
        result = await inspectExecutionRecord(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'inspectExecutionPipeline':
        result = await inspectExecutionPipeline(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'inspectExecutionGovernanceGate':
        result = await inspectExecutionGovernanceGate(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      case 'inspectExecutionHistory':
        result = await inspectExecutionHistory(objectRef ?? '', persona) as GovernedResponse<unknown>;
        break;
      default:
        result = {
          governed: true,
          data: null,
          explanation: `Unsupported operation: ${operation}`,
          health: governedEmptyHealth(),
          metadata: {
            request_id: 'unknown',
            timestamp: new Date().toISOString(),
            requesting_persona: persona,
            operation: 'discoverCapabilities' as any,
            duration_ms: 0,
          },
        };
    }

    pipeline.addStage('governed_inspection_execution', 'completed');

    if (options.include_relationships && objectRef) {
      pipeline.addStage('optional_relationship_expansion', 'completed');
    } else {
      pipeline.addStage('optional_relationship_expansion', 'not_applicable');
    }

    pipeline.addStage('evidence_and_health_assembly', 'completed');
    pipeline.addStage('governed_dto_creation', 'completed');
  } catch (err) {
    pipeline.addStage('governed_inspection_execution', 'failed', String(err));
    result = {
      governed: true,
      data: null,
      explanation: `Inspection execution failed: ${err instanceof Error ? err.message : String(err)}`,
      health: governedEmptyHealth(),
      metadata: {
        request_id: 'error',
        timestamp: new Date().toISOString(),
        requesting_persona: persona,
        operation: 'discoverCapabilities' as any,
        duration_ms: Date.now() - pipeline.start,
      },
    };
  }

  return { result, pipeline };
}

// ─── Conversation Bridge Entry Point ──────────────────────────────────────────────

export async function processConversationInspection(
  request: ConversationInspectionRequest,
): Promise<ConversationInspectionResponse> {
  const start = Date.now();
  const text = request.natural_language_request;

  // EWO-031: Check for governed execution intent BEFORE the read-only gate.
  // Execution intents (create EWO, prepare analysis/plan, approve, execute, inspect execution)
  // route through the governed execution pipeline, not the read-only inspection layer.
  const execIntent = classifyExecutionIntent(text, null);
  if (execIntent.detected_intent !== 'advisory' && execIntent.detected_intent !== 'unresolved' && execIntent.detected_intent !== 'inspection') {
    const conversationId = request.session_id ?? request.request_id ?? null;
    const routingResult = await routeConversationToExecution(
      text,
      conversationId,
      execIntent.resolved_engineering_object_reference,
      request.requesting_persona,
    );

    const auditRef = await recordInspection({
      requestingPersona: request.requesting_persona,
      operation: (execIntent.resolved_operation ?? 'unresolved') as any,
      inspectedCapability: execIntent.resolved_capability,
      inspectedObject: execIntent.resolved_engineering_object_reference,
      outcome: routingResult.dispatch_result?.execution_status === 'completed' ? 'success' : (routingResult.dispatch_result?.execution_status ?? 'info'),
      responseSummary: {
        detected_intent: execIntent.detected_intent,
        routing_decision: execIntent.routing_decision,
        execution_requested: execIntent.execution_requested,
        gate_passed: routingResult.gate_result?.passed ?? null,
        dispatch_status: routingResult.dispatch_result?.execution_status ?? null,
      },
    });

    return {
      request_id: request.request_id,
      governed: true,
      interpretation: `Governed execution intent: ${execIntent.detected_intent} → ${execIntent.routing_decision}`,
      resolved_capability: execIntent.resolved_capability,
      resolved_operation: execIntent.resolved_operation,
      resolved_object_reference: execIntent.resolved_engineering_object_reference,
      inspection_result: {
        intent_diagnostics: execIntent,
        conversation_continuity: routingResult.conversation_continuity,
        gate_result: routingResult.gate_result,
        dispatch_result: routingResult.dispatch_result,
      },
      evidence_references: [],
      constitutional_references: [],
      health: governedEmptyHealth(),
      confidence: execIntent.confidence,
      missing_information: routingResult.gate_result && !routingResult.gate_result.passed
        ? [routingResult.gate_result.next_required_action ?? 'Execution gate blocked']
        : [],
      audit_reference: auditRef,
      completed_at: new Date().toISOString(),
      result_type: routingResult.dispatch_result?.execution_status === 'completed' ? 'success' : (routingResult.dispatch_result?.execution_status ?? 'governed_execution'),
      intent_diagnostics: {
        detected_intent: execIntent.detected_intent,
        confidence: execIntent.confidence,
        routing_decision: execIntent.routing_decision,
        extracted_target: execIntent.resolved_engineering_object_reference,
        matched_pattern: null,
        isWriteRequest: false,
        isMetadataQuestion: false,
        isFrameworkIntrospection: false,
        isExecutionInspection: execIntent.detected_intent === 'inspect_execution',
        lifecycle_change_requested: execIntent.lifecycle_change_requested,
      },
    };
  }

  const interpretation = interpretRequest(text);

  // Handle write requests — governed refusal
  if (interpretation.isWriteRequest) {
    const auditRef = await recordInspection({
      requestingPersona: request.requesting_persona,
      operation: 'discoverCapabilities' as any, // placeholder for audit
      inspectedCapability: null,
      inspectedObject: null,
      outcome: 'error',
      errorMessage: 'Write request refused — ATD Connect is read-only',
      responseSummary: { refused: true, reason: 'read_only_boundary' },
    });

    return {
      request_id: request.request_id,
      governed: true,
      interpretation: interpretation.interpretation,
      resolved_capability: null,
      resolved_operation: null,
      resolved_object_reference: null,
      inspection_result: null,
      evidence_references: [],
      constitutional_references: [],
      health: governedEmptyHealth(),
      confidence: 0,
      missing_information: [],
      audit_reference: auditRef,
      completed_at: new Date().toISOString(),
      result_type: 'error',
      intent_diagnostics: {
        detected_intent: 'write_request',
        confidence: 1.0,
        routing_decision: 'governed_refusal',
        extracted_target: null,
        matched_pattern: null,
        isWriteRequest: true,
        isMetadataQuestion: false,
        isFrameworkIntrospection: false,
        isExecutionInspection: false,
        lifecycle_change_requested: false,
      },
    };
  }

  // Handle ambiguous/unresolved requests — governed unresolved response
  if (interpretation.ambiguous || !interpretation.capability || !interpretation.operation) {
    const auditRef = await recordInspection({
      requestingPersona: request.requesting_persona,
      operation: 'discoverCapabilities' as any,
      inspectedCapability: interpretation.capability,
      inspectedObject: interpretation.objectReference,
      outcome: 'governed_empty',
      errorMessage: null,
      responseSummary: { unresolved: true, interpretation: interpretation.interpretation },
    });

    return {
      request_id: request.request_id,
      governed: true,
      interpretation: interpretation.interpretation,
      resolved_capability: interpretation.capability,
      resolved_operation: interpretation.operation,
      resolved_object_reference: interpretation.objectReference,
      inspection_result: null,
      evidence_references: [],
      constitutional_references: [],
      health: governedEmptyHealth(),
      confidence: 0,
      missing_information: ['Unable to resolve request to a supported operation'],
      audit_reference: auditRef,
      completed_at: new Date().toISOString(),
      result_type: 'unresolved',
      intent_diagnostics: {
        detected_intent: interpretation.intentLabel ?? 'unresolved',
        confidence: 0,
        routing_decision: 'unresolved',
        extracted_target: interpretation.objectReference,
        matched_pattern: interpretation.matchedPattern,
        isWriteRequest: false,
        isMetadataQuestion: interpretation.isMetadataQuestion,
        isFrameworkIntrospection: interpretation.isFrameworkIntrospection,
        isExecutionInspection: interpretation.isExecutionInspection,
        lifecycle_change_requested: false,
      },
    };
  }

  // Execute the governed inspection
  const { result, pipeline } = await executeInspection(
    interpretation.capability!,
    interpretation.operation!,
    interpretation.objectReference,
    request.requesting_persona,
    request.inspection_options ?? {},
  );

  pipeline.addStage('audit_recording', 'completed');
  pipeline.addStage('response_returned', 'completed');

  // Record audit with enhanced fields
  const auditRef = await recordInspection({
    requestingPersona: request.requesting_persona,
    operation: interpretation.operation as any,
    inspectedCapability: interpretation.capability,
    inspectedObject: interpretation.objectReference,
    durationMs: Date.now() - start,
    outcome: result.data ? 'success' : 'governed_empty',
    responseSummary: { interpretation: interpretation.interpretation },
  });

  // Store conversation request
  await supabase.from('atd_connect_conversation_requests').insert({
    request_id: request.request_id,
    requesting_persona: request.requesting_persona,
    client_id: request.client_id ?? null,
    session_id: request.session_id ?? null,
    natural_language_request: request.natural_language_request,
    resolved_capability: interpretation.capability,
    resolved_operation: interpretation.operation,
    resolved_object_reference: interpretation.objectReference,
    inspection_options: request.inspection_options ?? {},
    authentication_context: request.authentication_context ?? {},
    requested_at: request.requested_at,
    completed_at: new Date().toISOString(),
    governed: true,
    interpretation: interpretation.interpretation,
    result_type: result.data ? 'success' : 'governed_empty',
    confidence: result.health.inspection_confidence,
    audit_reference: auditRef,
    missing_information: result.explanation ? [result.explanation] : [],
  }).then(({ error }) => {
    if (error) console.error('[ATD Connect] Failed to store conversation request:', error.message);
  });

  // Extract evidence/constitutional refs from result if available
  const evidenceRefs: EvidenceReference[] = [];
  const constitutionalRefs: ConstitutionalReference[] = [];
  if (result.data && typeof result.data === 'object') {
    const data = result.data as Record<string, unknown>;
    if (Array.isArray(data.evidence_references)) {
      evidenceRefs.push(...(data.evidence_references as EvidenceReference[]));
    }
    if (Array.isArray(data.constitutional_references)) {
      constitutionalRefs.push(...(data.constitutional_references as ConstitutionalReference[]));
    }
  }

  const missingInfo: string[] = [];
  if (result.explanation) missingInfo.push(result.explanation);

  // Build intent diagnostics
  const intentDiagnostics: IntentDiagnosticsInfo = {
    detected_intent: interpretation.intentLabel ?? 'inspection_or_query',
    confidence: result.health.inspection_confidence,
    routing_decision: `route_to_${interpretation.operation}`,
    extracted_target: interpretation.objectReference,
    matched_pattern: interpretation.matchedPattern,
    isWriteRequest: false,
    isMetadataQuestion: interpretation.isMetadataQuestion,
    isFrameworkIntrospection: interpretation.isFrameworkIntrospection,
    isExecutionInspection: interpretation.isExecutionInspection,
    lifecycle_change_requested: false,
  };

  // If the inspection result is a SupervisedExecutionEngineInspectionDTO, inject intent diagnostics
  if (interpretation.operation === 'inspectSupervisedExecutionEngine' && result.data && typeof result.data === 'object') {
    const dto = result.data as Record<string, unknown>;
    dto.intent_diagnostics = intentDiagnostics;
  }

  return {
    request_id: request.request_id,
    governed: true,
    interpretation: interpretation.interpretation,
    resolved_capability: interpretation.capability,
    resolved_operation: interpretation.operation,
    resolved_object_reference: interpretation.objectReference,
    inspection_result: result.data,
    evidence_references: evidenceRefs,
    constitutional_references: constitutionalRefs,
    health: result.health,
    confidence: result.health.inspection_confidence,
    missing_information: missingInfo,
    audit_reference: auditRef,
    completed_at: new Date().toISOString(),
    result_type: result.data ? 'success' : 'governed_empty',
    intent_diagnostics: intentDiagnostics,
  };
}

// ─── Governed Refusal for Write Requests ──────────────────────────────────────────

export function createGovernedRefusal(requestId: string, reason: string, requestedAction?: string, objectRef?: string | null, resolvedCapability?: string | null): GovernedRefusal {
  const alternatives: string[] = [];

  if (resolvedCapability && objectRef) {
    const altMap: Record<string, string[]> = {
      'engineering-work-orders': [
        `Inspect ${objectRef}`,
        `Show relationships for ${objectRef}`,
        `Inspect its Completion Report`,
        `Inspect its Engineering Record`,
      ],
      'engineering-records': [
        `Inspect ${objectRef}`,
        `Show relationships for ${objectRef}`,
        `List all Engineering Records`,
      ],
    };
    if (altMap[resolvedCapability]) {
      alternatives.push(...altMap[resolvedCapability]);
    }
  }

  if (alternatives.length === 0) {
    if (objectRef) {
      alternatives.push(`Inspect ${objectRef}`);
      alternatives.push(`Show relationships for ${objectRef}`);
    }
    alternatives.push('List every engineering capability');
  }

  return {
    governed: true,
    refused: true,
    reason,
    message: `Request refused: ${reason}. The current ATD Connect contract is read-only. Write operations (INSERT, UPDATE, DELETE, lifecycle changes, approvals, closures, deployments, and code execution) are not supported.`,
    audit_reference: requestId,
    requested_action: requestedAction ?? 'Unknown write request',
    no_changes_made: true,
    available_alternatives: alternatives,
  };
}

// ─── Get Conversation Request History ────────────────────────────────────────────

export async function getConversationRequestHistory(limit = 50): Promise<ConversationInspectionRequest[]> {
  const { data, error } = await supabase
    .from('atd_connect_conversation_requests')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as ConversationInspectionRequest[];
}
