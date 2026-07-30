// EWO-016 — Conversation-Native Execution Bridge
// Connects ATD conversation to the EWO-015 execution pipeline.
// The Product Owner can prepare and submit executions from conversation.

import { supabase } from './supabase';
import {
  type EngineeringKnowledgePackage,
  type ResolvedReference,
  type ConversationIntent,
  type ConversationFocus,
  detectReferences,
  resolveReference,
  detectConversationIntent,
  updateConversationFocus,
  createConversationFocus,
  assembleKnowledgePackage,
  renderKnowledgePackageAsContext,
  buildNotFoundResponse,
  type NotFoundResponse,
} from './engineeringReferenceResolver';
import {
  evaluateExecutionEligibility,
  renderEligibilityCard,
  type EligibilityCheck,
} from './executionEligibilityGate';
import {
  prepareAndSubmitExecution,
  getConnector,
  type EngineeringExecution,
  type ExecutionPackage,
  type CompletionReport,
  type ReviewResults,
} from './implementationEngineConnector';

// ─── Conversation Execution Result ──────────────────────────────────────────

export type ConversationResponseType =
  | 'object_summary'      // "What is EWO-015?"
  | 'object_card'         // "Show me EWO-015"
  | 'comparison'          // "Compare EWO-010 and EWO-015"
  | 'eligibility_card'    // "Prepare execution for EWO-015" (pre-check)
  | 'execution_prepared'  // Execution package created
  | 'execution_submitted' // Execution submitted
  | 'execution_status'    // "Continue EXEC-001"
  | 'not_found'           // Reference not found
  | 'ambiguous'           // Multiple candidates
  | 'blocked'             // Eligibility blocked
  | 'governed_error'      // Failure state
  | 'generic';            // No engineering reference detected

export interface ConversationExecutionResult {
  type: ConversationResponseType;
  resolvedReferences: ResolvedReference[];
  knowledgePackages: EngineeringKnowledgePackage[];
  eligibility?: EligibilityCheck;
  execution?: EngineeringExecution;
  notFound?: NotFoundResponse;
  ambiguityCandidates?: Array<{ ref: string; title: string; status: string }>;
  contextPrompt?: string;        // governed context to pass to AI
  message: string;               // human-readable response
  actions?: ConversationAction[];
  focus: ConversationFocus;
  error?: string;
}

export interface ConversationAction {
  label: string;
  type: 'execute' | 'review_package' | 'change_provider' | 'cancel' |
        'open' | 'show_plan' | 'show_completion' | 'show_verification' |
        'show_related' | 'show_evidence' | 'show_history' | 'search' |
        'check_archived' | 'check_recovery' | 'retry';
  targetRef?: string;
}

// ─── Main Conversation Processing Function ───────────────────────────────────

export async function processConversationMessage(
  text: string,
  conversationId: string,
  existingFocus?: ConversationFocus | null
): Promise<ConversationExecutionResult> {
  const focus = existingFocus || createConversationFocus(conversationId);

  // Update focus with any new references in the message
  const updatedFocus = await updateConversationFocus(focus, text);
  const intent = detectConversationIntent(text, updatedFocus.primaryReference);

  // No engineering references and no execution intent → generic
  if (intent.targetReferences.length === 0 && !intent.isExecutionIntent) {
    return {
      type: 'generic',
      resolvedReferences: [],
      knowledgePackages: [],
      message: 'No engineering reference detected in your message. You can ask about EWO, EXEC, REC, ER, IDEA, or other engineering objects.',
      focus: updatedFocus,
    };
  }

  // Ambiguity check
  if (intent.ambiguityHint) {
    const candidates = await findAmbiguityCandidates(text);
    return {
      type: 'ambiguous',
      resolvedReferences: [],
      knowledgePackages: [],
      ambiguityCandidates: candidates,
      message: intent.ambiguityHint,
      focus: updatedFocus,
      actions: candidates.map(c => ({ label: `Select ${c.ref}`, type: 'open', targetRef: c.ref })),
    };
  }

  // Resolve all target references
  const resolvedRefs: ResolvedReference[] = [];
  for (const det of intent.targetReferences) {
    const resolved = await resolveReference(det);
    resolvedRefs.push(resolved);
  }

  // Check for not-found
  const notFoundRef = resolvedRefs.find(r => !r.found);
  if (notFoundRef) {
    return {
      type: 'not_found',
      resolvedReferences: resolvedRefs,
      knowledgePackages: [],
      notFound: buildNotFoundResponse(notFoundRef.detected.canonical),
      message: buildNotFoundResponse(notFoundRef.detected.canonical).message,
      focus: updatedFocus,
      actions: [
        { label: 'Search similar references', type: 'search' },
        { label: 'Open Engineering Work Orders', type: 'open' },
        { label: 'Check archived objects', type: 'check_archived' },
        { label: 'Check historical recovery', type: 'check_recovery' },
        { label: 'Cancel', type: 'cancel' },
      ],
    };
  }

  // Assemble knowledge packages for all resolved references
  const packages: EngineeringKnowledgePackage[] = [];
  for (const ref of resolvedRefs) {
    const pkg = await assembleKnowledgePackage(ref);
    if (pkg) packages.push(pkg);
  }

  // Handle comparison
  if (intent.isComparison && packages.length >= 2) {
    const contextPrompt = packages.map(renderKnowledgePackageAsContext).join('\n\n---\n\n');
    return {
      type: 'comparison',
      resolvedReferences: resolvedRefs,
      knowledgePackages: packages,
      contextPrompt,
      message: `Comparing ${packages[0].reference} and ${packages[1].reference}. Both objects have been resolved from canonical EIOS records.`,
      focus: updatedFocus,
    };
  }

  // Handle execution intent
  if (intent.isExecutionIntent && resolvedRefs.length > 0) {
    return handleExecutionIntent(intent, resolvedRefs, packages, updatedFocus);
  }

  // Handle summarise / show / open
  if (intent.action === 'summarise' || intent.action === 'show' || intent.action === 'open') {
    const pkg = packages[0];
    if (!pkg) {
      return {
        type: 'governed_error',
        resolvedReferences: resolvedRefs,
        knowledgePackages: [],
        message: 'Engineering Knowledge Package could not be assembled.',
        focus: updatedFocus,
        error: 'Package assembly failed',
      };
    }
    const contextPrompt = renderKnowledgePackageAsContext(pkg);
    const message = buildObjectSummaryMessage(pkg);
    return {
      type: intent.action === 'summarise' ? 'object_summary' : 'object_card',
      resolvedReferences: resolvedRefs,
      knowledgePackages: packages,
      contextPrompt,
      message,
      focus: updatedFocus,
      actions: buildObjectActions(pkg),
    };
  }

  // Handle show_plan, show_completion, show_verification, show_related
  if (['show_plan', 'show_completion', 'show_verification', 'show_related', 'show_evidence', 'show_history'].includes(intent.action)) {
    const pkg = packages[0];
    if (!pkg) {
      return { type: 'governed_error', resolvedReferences: resolvedRefs, knowledgePackages: [], message: 'No package available.', focus: updatedFocus };
    }
    const contextPrompt = renderKnowledgePackageAsContext(pkg);
    return {
      type: 'object_card',
      resolvedReferences: resolvedRefs,
      knowledgePackages: packages,
      contextPrompt,
      message: buildSpecificDetailMessage(pkg, intent.action),
      focus: updatedFocus,
      actions: buildObjectActions(pkg),
    };
  }

  // Default: return the knowledge package as context
  if (packages.length > 0) {
    const contextPrompt = packages.map(renderKnowledgePackageAsContext).join('\n\n');
    return {
      type: 'object_summary',
      resolvedReferences: resolvedRefs,
      knowledgePackages: packages,
      contextPrompt,
      message: buildObjectSummaryMessage(packages[0]),
      focus: updatedFocus,
      actions: buildObjectActions(packages[0]),
    };
  }

  return {
    type: 'generic',
    resolvedReferences: resolvedRefs,
    knowledgePackages: [],
    message: 'No engineering context could be resolved.',
    focus: updatedFocus,
  };
}

// ─── Execution Intent Handler ──────────────────────────────────────────────────

async function handleExecutionIntent(
  intent: ConversationIntent,
  resolvedRefs: ResolvedReference[],
  packages: EngineeringKnowledgePackage[],
  focus: ConversationFocus
): Promise<ConversationExecutionResult> {
  const ewoRef = resolvedRefs[0];
  const pkg = packages[0];

  if (!ewoRef.found || !pkg || pkg.objectType !== 'EWO') {
    return {
      type: 'governed_error',
      resolvedReferences: resolvedRefs,
      knowledgePackages: packages,
      message: 'Execution intent requires a valid EWO reference.',
      focus,
      error: 'No EWO resolved',
    };
  }

  // Cancel / retry / continue target EXEC references
  if (intent.action === 'cancel' || intent.action === 'retry' || intent.action === 'continue') {
    const execRef = resolvedRefs.find(r => r.detected.type === 'EXEC');
    if (execRef && execRef.found) {
      return handleExecutionLifecycleAction(intent.action, execRef, resolvedRefs, packages, focus);
    }
  }

  // Evaluate eligibility
  const eligibility = await evaluateExecutionEligibility(pkg.canonicalId, pkg.reference);

  if (!eligibility.eligible) {
    return {
      type: 'blocked',
      resolvedReferences: resolvedRefs,
      knowledgePackages: packages,
      eligibility,
      message: renderEligibilityCard(eligibility),
      focus,
      actions: eligibility.blockers.map(b => ({ label: b.governedAction, type: 'cancel' as const })),
    };
  }

  // Prepare execution (if action is prepare/begin/start)
  if (['prepare', 'begin', 'start'].includes(intent.action)) {
    return {
      type: 'eligibility_card',
      resolvedReferences: resolvedRefs,
      knowledgePackages: packages,
      eligibility,
      message: renderEligibilityCard(eligibility),
      focus,
      actions: [
        { label: 'Execute', type: 'execute', targetRef: pkg.reference },
        { label: 'Review Package', type: 'review_package', targetRef: pkg.reference },
        { label: 'Change Provider', type: 'change_provider', targetRef: pkg.reference },
        { label: 'Cancel', type: 'cancel' },
      ],
    };
  }

  // Execute / submit
  if (['execute', 'submit'].includes(intent.action)) {
    return prepareExecutionFromConversation(pkg, eligibility, resolvedRefs, packages, focus);
  }

  // Default fallback for execution intent
  return {
    type: 'eligibility_card',
    resolvedReferences: resolvedRefs,
    knowledgePackages: packages,
    eligibility,
    message: renderEligibilityCard(eligibility),
    focus,
  };
}

async function prepareExecutionFromConversation(
  pkg: EngineeringKnowledgePackage,
  eligibility: EligibilityCheck,
  resolvedRefs: ResolvedReference[],
  packages: EngineeringKnowledgePackage[],
  focus: ConversationFocus
): Promise<ConversationExecutionResult> {
  try {
    // Use the canonical EWO-015 pipeline
    const execution = await prepareAndSubmitExecution(pkg.canonicalId, eligibility.implementationProvider);

    return {
      type: execution.implementation_status === 'submitted' ? 'execution_submitted' : 'execution_prepared',
      resolvedReferences: resolvedRefs,
      knowledgePackages: packages,
      eligibility,
      execution,
      message: buildExecutionCard(execution, pkg),
      focus,
      actions: [
        { label: 'Open Execution', type: 'open', targetRef: execution.execution_ref },
        { label: 'Show Status', type: 'show_verification', targetRef: execution.execution_ref },
        { label: 'Cancel', type: 'cancel' },
      ],
    };
  } catch (err) {
    return {
      type: 'governed_error',
      resolvedReferences: resolvedRefs,
      knowledgePackages: packages,
      eligibility,
      message: `Execution preparation failed: ${(err as Error).message}`,
      focus,
      error: (err as Error).message,
    };
  }
}

async function handleExecutionLifecycleAction(
  action: string,
  execRef: ResolvedReference,
  resolvedRefs: ResolvedReference[],
  packages: EngineeringKnowledgePackage[],
  focus: ConversationFocus
): Promise<ConversationExecutionResult> {
  const execId = execRef.canonicalId!;
  const connector = getConnector('bolt');

  try {
    if (action === 'cancel') {
      await connector.cancelExecution(execId);
      return {
        type: 'execution_status',
        resolvedReferences: resolvedRefs,
        knowledgePackages: packages,
        message: `Execution ${execRef.detected.canonical} has been cancelled.`,
        focus,
      };
    }
    if (action === 'retry') {
      await connector.retryExecution(execId);
      return {
        type: 'execution_status',
        resolvedReferences: resolvedRefs,
        knowledgePackages: packages,
        message: `Execution ${execRef.detected.canonical} has been retried.`,
        focus,
      };
    }
    if (action === 'continue') {
      // Return current status
      const { data: exec } = await supabase
        .from('engineering_executions')
        .select('execution_ref, implementation_status, implementation_provider, package_version')
        .eq('id', execId)
        .maybeSingle();
      return {
        type: 'execution_status',
        resolvedReferences: resolvedRefs,
        knowledgePackages: packages,
        message: `Execution ${exec?.execution_ref || execRef.detected.canonical} is currently: ${exec?.implementation_status || 'unknown'}.`,
        focus,
      };
    }
  } catch (err) {
    return {
      type: 'governed_error',
      resolvedReferences: resolvedRefs,
      knowledgePackages: packages,
      message: `Execution action failed: ${(err as Error).message}`,
      focus,
      error: (err as Error).message,
    };
  }

  return {
    type: 'generic',
    resolvedReferences: resolvedRefs,
    knowledgePackages: packages,
    message: 'Unsupported execution action.',
    focus,
  };
}

// ─── Ambiguity Resolution ──────────────────────────────────────────────────────

async function findAmbiguityCandidates(text: string): Promise<Array<{ ref: string; title: string; status: string }>> {
  const { data } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, status, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5);

  if (!data) return [];
  return data.map(e => ({ ref: e.ewo_ref, title: e.title, status: e.status }));
}

// ─── Response Builders ─────────────────────────────────────────────────────────

function buildObjectSummaryMessage(pkg: EngineeringKnowledgePackage): string {
  const lines: string[] = [];
  lines.push(`═══ ${pkg.reference} ═══`);
  lines.push(`Title: ${pkg.summary.title}`);
  lines.push(`Purpose: ${pkg.summary.purpose}`);
  lines.push(`Current Status: ${pkg.summary.currentStatus}`);
  lines.push(`Lifecycle State: ${pkg.summary.lifecycleState}`);
  if (pkg.summary.verificationState) lines.push(`Verification State: ${pkg.summary.verificationState}`);
  if (pkg.summary.poState) lines.push(`Product Owner State: ${pkg.summary.poState}`);
  if (pkg.summary.nextAction) lines.push(`Next Action: ${pkg.summary.nextAction}`);
  return lines.join('\n');
}

function buildSpecificDetailMessage(pkg: EngineeringKnowledgePackage, action: string): string {
  switch (action) {
    case 'show_plan':
      if (pkg.plan) return `Engineering Plan: ${pkg.plan.ref}\n\n${pkg.plan.executiveSummary}`;
      return `No engineering plan linked to ${pkg.reference}.`;
    case 'show_completion':
      if (pkg.completionReport) return `Completion Report: ${pkg.completionReport.reportRef}\n\n${pkg.completionReport.summary}`;
      return `No completion report for ${pkg.reference}.`;
    case 'show_verification':
      if (pkg.verification) {
        const lines = [`Verification: ${pkg.verification.overallStatus}`];
        for (const g of pkg.verification.gates) lines.push(`  ${g.gate}: ${g.status}`);
        return lines.join('\n');
      }
      return `No verification data for ${pkg.reference}.`;
    case 'show_related':
      if (pkg.relatedEngineering && pkg.relatedEngineering.length > 0) {
        return pkg.relatedEngineering.map(r => `${r.ref}: ${r.title} (${r.relationship})`).join('\n');
      }
      return `No related engineering for ${pkg.reference}.`;
    case 'show_evidence':
      return `Evidence for ${pkg.reference} — see verification gates and completion report.`;
    case 'show_history':
      if (pkg.executionHistory && pkg.executionHistory.length > 0) {
        return pkg.executionHistory.map(e => `${e.ref}: ${e.status} via ${e.provider} at ${e.createdAt}`).join('\n');
      }
      return `No execution history for ${pkg.reference}.`;
    default:
      return buildObjectSummaryMessage(pkg);
  }
}

function buildObjectActions(pkg: EngineeringKnowledgePackage): ConversationAction[] {
  const actions: ConversationAction[] = [
    { label: 'Open', type: 'open', targetRef: pkg.reference },
    { label: 'Summarise', type: 'show_plan', targetRef: pkg.reference },
  ];
  if (pkg.objectType === 'EWO') {
    actions.push({ label: 'Prepare Execution', type: 'execute', targetRef: pkg.reference });
    if (pkg.plan) actions.push({ label: 'Show Plan', type: 'show_plan', targetRef: pkg.reference });
    if (pkg.completionReport) actions.push({ label: 'Show Completion Report', type: 'show_completion', targetRef: pkg.reference });
    if (pkg.verification) actions.push({ label: 'Show Verification', type: 'show_verification', targetRef: pkg.reference });
    if (pkg.relatedEngineering && pkg.relatedEngineering.length > 0) {
      actions.push({ label: 'Show Related Engineering', type: 'show_related', targetRef: pkg.reference });
    }
  }
  if (pkg.objectType === 'REC') {
    actions.push({ label: 'Show Evidence', type: 'show_evidence', targetRef: pkg.reference });
    actions.push({ label: 'Show Reclassification History', type: 'show_history', targetRef: pkg.reference });
  }
  return actions;
}

function buildExecutionCard(execution: EngineeringExecution, pkg: EngineeringKnowledgePackage): string {
  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════');
  lines.push('Execution Prepared');
  lines.push('═══════════════════════════════════════════════');
  lines.push(`Engineering Work Order: ${pkg.reference}`);
  lines.push(`Execution Reference: ${execution.execution_ref}`);
  lines.push(`Execution Status: ${execution.implementation_status}`);
  lines.push(`Implementation Provider: ${execution.implementation_provider || 'bolt'}`);
  lines.push(`Review Provider: ${execution.review_provider || 'openai'}`);
  if (execution.package_version) lines.push(`Package Version: ${execution.package_version}`);
  lines.push('');
  lines.push('Note: Automated provider submission is not currently available.');
  lines.push('The execution package has been prepared and recorded in EIOS.');
  lines.push('═══════════════════════════════════════════════');
  return lines.join('\n');
}

// ─── Context Transparency ──────────────────────────────────────────────────────

export interface ContextTransparencyView {
  resolvedObject: string;
  recordsLoaded: string[];
  standardsLoaded: string[];
  constitutionalSectionsLoaded: string[];
  relatedEngineeringLoaded: string[];
  executionRecordsLoaded: string[];
  contextTimestamp: string;
}

export function buildContextTransparency(pkg: EngineeringKnowledgePackage): ContextTransparencyView {
  return {
    resolvedObject: pkg.reference,
    recordsLoaded: pkg.layers.map(l => `${l.name} (${l.recordCount} records from ${l.source})`),
    standardsLoaded: pkg.standards?.map(s => `${s.ref}: ${s.title}`) || [],
    constitutionalSectionsLoaded: pkg.constitutionalRequirements?.map(c => `${c.ref}: ${c.title}`) || [],
    relatedEngineeringLoaded: pkg.relatedEngineering?.map(r => `${r.ref}: ${r.title}`) || [],
    executionRecordsLoaded: pkg.executionHistory?.map(e => `${e.ref}: ${e.status}`) || [],
    contextTimestamp: pkg.assembledAt,
  };
}

// ─── Conversation Action Record ────────────────────────────────────────────────

export interface ConversationActionRecord {
  conversationId: string;
  userInstruction: string;
  resolvedObject?: string;
  resolutionConfidence: number;
  knowledgePackageVersion?: string;
  eligibilityOutcome?: string;
  executionCreated?: boolean;
  executionSubmitted?: boolean;
  providerSelected?: string;
  failureOrCancellation?: string;
  createdAt: string;
}

export async function recordConversationAction(
  record: ConversationActionRecord
): Promise<void> {
  try {
    await supabase.from('ecc_conversation_engineering_actions').insert({
      conversation_id: record.conversationId,
      user_instruction: record.userInstruction,
      resolved_object: record.resolvedObject,
      resolution_confidence: record.resolutionConfidence,
      knowledge_package_version: record.knowledgePackageVersion,
      eligibility_outcome: record.eligibilityOutcome,
      execution_created: record.executionCreated,
      execution_submitted: record.executionSubmitted,
      provider_selected: record.providerSelected,
      failure_or_cancellation: record.failureOrCancellation,
      created_at: record.createdAt,
    });
  } catch {
    // Best-effort audit — do not block conversation on audit failure
  }
}
