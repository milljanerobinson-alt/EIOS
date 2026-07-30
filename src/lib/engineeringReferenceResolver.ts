// EWO-016 — Engineering Knowledge Resolution & Conversation-Native Execution
// Canonical Engineering Reference Resolver + Object Lookup + Knowledge Package
//
// Resolves canonical Engineering references from conversational input BEFORE
// sending requests to the AI provider. The AI must never be asked to recall
// engineering context from model memory.

import { supabase } from './supabase';
import { normalizeFilesChanged } from './interactionCompletionService';

// ─── Reference Types ────────────────────────────────────────────────────────

export type EngineeringReferenceType =
  | 'EWO'        // Engineering Work Order — EWO-### or EWO-###.##[A-Z].#
  | 'EXEC'       // Engineering Execution — EXEC-###
  | 'ER'         // Engineering Record — ER-###
  | 'REC'        // Recovery Package — REC-###
  | 'IDEA'       // Engineering Idea — IDEA-###
  | 'INTENT'     // ATD Intent — INTENT-###
  | 'PLAN'       // Engineering Plan — PLAN-###
  | 'ES'         // Engineering Standard — ES-### or ES-NAME-###
  | 'AMD'        // Constitutional Amendment — AMD-###
  | 'VS'         // Verification Session — VS-########-###
  | 'AUD'        // Audit — AUD-###
  | 'RC'         // Release Candidate — RC-###
  | 'ECR'        // Engineering Classification Review — ECR-###
  | 'TP'         // Test Plan — TP-###
  | 'EIG';       // Engineering Intelligence Graph entity — EIG-###

export interface DetectedReference {
  raw: string;           // exact text matched
  type: EngineeringReferenceType;
  canonical: string;     // canonical display format (uppercase)
  ref: string;           // the reference value (e.g. "015", "014.19A.1")
  start: number;
  end: number;
}

export interface ResolvedReference {
  detected: DetectedReference;
  found: boolean;
  objectType?: string;
  canonicalId?: string;
  title?: string;
  description?: string;
  status?: string;
  lifecycleState?: string;
  metadata?: Record<string, unknown>;
  notFoundReason?: string;
}

// ─── Reference Detection ────────────────────────────────────────────────────
// Detection is regex-based, but resolution is always against canonical EIOS data.

const REFERENCE_PATTERNS: Array<{ type: EngineeringReferenceType; regex: RegExp }> = [
  // EWO — EWO-015, EWO-014.19A.1, EWO-014.19A.3
  { type: 'EWO', regex: /\bEWO-(\d+(?:\.\d+[A-Z]?\.?\d*)?)\b/gi },
  // EXEC — EXEC-001
  { type: 'EXEC', regex: /\bEXEC-(\d+)\b/gi },
  // ER — ER-001
  { type: 'ER', regex: /\bER-(\d+)\b/gi },
  // REC — REC-007
  { type: 'REC', regex: /\bREC-(\d+)\b/gi },
  // IDEA — IDEA-001
  { type: 'IDEA', regex: /\bIDEA-(\d+)\b/gi },
  // INTENT — INTENT-001
  { type: 'INTENT', regex: /\bINTENT-(\d+)\b/gi },
  // PLAN — PLAN-001
  { type: 'PLAN', regex: /\bPLAN-(\d+)\b/gi },
  // ES — ES-BROWSER-TEST-001 or ES-001
  { type: 'ES', regex: /\bES-([A-Z0-9][A-Z0-9-]*\d+)\b/gi },
  // AMD — AMD-001
  { type: 'AMD', regex: /\bAMD-(\d+)\b/gi },
  // VS — VS-20260719-001
  { type: 'VS', regex: /\bVS-(\d{8}-\d+)\b/gi },
  // AUD — AUD-001
  { type: 'AUD', regex: /\bAUD-(\d+)\b/gi },
  // RC — RC-001
  { type: 'RC', regex: /\bRC-(\d+)\b/gi },
  // ECR — ECR-001
  { type: 'ECR', regex: /\bECR-(\d+)\b/gi },
  // TP — TP-001
  { type: 'TP', regex: /\bTP-(\d+)\b/gi },
  // EIG — EIG-001
  { type: 'EIG', regex: /\bEIG-(\d+)\b/gi },
];

export function detectReferences(text: string): DetectedReference[] {
  const results: DetectedReference[] = [];
  const seen = new Set<string>();

  for (const { type, regex } of REFERENCE_PATTERNS) {
    const pattern = new RegExp(regex.source, regex.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[0];
      const refValue = match[1];
      // Canonical: uppercase the prefix, preserve the ref value
      const prefix = type === 'ES' ? 'ES' : type;
      const canonical = `${prefix}-${refValue}`;
      const key = `${type}:${canonical}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        raw,
        type,
        canonical,
        ref: refValue,
        start: match.index,
        end: match.index + raw.length,
      });
    }
  }

  // Sort by position
  results.sort((a, b) => a.start - b.start);
  return results;
}

// ─── Canonical Object Lookup ─────────────────────────────────────────────────
// Each resolver fetches from the canonical EIOS data source.

const TYPE_TO_TABLE: Record<EngineeringReferenceType, { table: string; refColumn: string; select: string }> = {
  EWO:    { table: 'engineering_work_orders',         refColumn: 'ewo_ref',          select: 'id, ewo_ref, title, executive_summary, business_objective, engineering_objective, status, implementation_status, verification_status, po_acceptance_notes, engineering_package_status, implementation_provider, created_at, updated_at' },
  EXEC:   { table: 'engineering_executions',           refColumn: 'execution_ref',   select: 'id, execution_ref, ewo_id, implementation_status, implementation_provider, po_status, created_at, updated_at, started_at, finished_at' },
  ER:     { table: 'engineering_records_library',      refColumn: 'id',               select: 'id, title, description, status, created_at, updated_at' },
  REC:    { table: 'engineering_recovery_packages',    refColumn: 'recovery_ref',     select: 'id, recovery_ref, canonical_reference, title, recovery_status, po_status, object_classification, engineering_confidence, created_at, updated_at, imported_at, imported_ewo_id' },
  IDEA:   { table: 'engineering_idea',                  refColumn: 'idea_ref',         select: 'id, idea_ref, title, description, status, created_at, updated_at' },
  INTENT: { table: 'atd_engineering_intents',           refColumn: 'intent_ref',       select: 'id, intent_ref, title, status, created_at, updated_at' },
  PLAN:   { table: 'atd_engineering_plans',              refColumn: 'plan_ref',         select: 'id, plan_ref, intent_id, executive_summary, engineering_phases, recommended_ewos, status, version, created_at, updated_at' },
  ES:     { table: 'ecc_engineering_standards',         refColumn: 'title',            select: 'id, version_introduced, category, title, body, status, created_at, updated_at' },
  AMD:    { table: 'constitutional_documents',          refColumn: 'document_ref',    select: 'id, document_ref, title, document_type, version, status, sections, created_at, updated_at' },
  VS:     { table: 'ewo_verification_sessions',         refColumn: 'session_ref',     select: 'id, session_ref, ewo_id, overall_status, started_at, completed_at' },
  AUD:    { table: 'ecc_audits',                        refColumn: 'id',               select: 'id, title, description, status, notes, created_at, updated_at' },
  RC:     { table: 'ecc_release_candidates',            refColumn: 'id',               select: 'id, title, description, status, release_type, version, created_at, updated_at' },
  ECR:    { table: 'ecc_governed_reviews',              refColumn: 'id',               select: 'id, review_type_key, status, notes, created_at, updated_at' },
  TP:     { table: 'ecc_test_plans',                    refColumn: 'id',               select: 'id, title, description, status, version, created_at, updated_at' },
  EIG:    { table: 'eig_entities',                       refColumn: 'entity_ref',       select: 'id, entity_ref, entity_type, name, description, status, version, created_at, updated_at' },
};

export async function resolveReference(detected: DetectedReference): Promise<ResolvedReference> {
  const config = TYPE_TO_TABLE[detected.type];
  if (!config) {
    return { detected, found: false, notFoundReason: `Unknown reference type: ${detected.type}` };
  }

  try {
    const { data, error } = await supabase
      .from(config.table)
      .select(config.select)
      .ilike(config.refColumn, detected.canonical)
      .maybeSingle();

    if (error) {
      return { detected, found: false, notFoundReason: `Database error: ${error.message}` };
    }

    if (!data) {
      return { detected, found: false, notFoundReason: `${detected.canonical} could not be found in the Engineering Ledger.` };
    }

    return {
      detected,
      found: true,
      objectType: detected.type,
      canonicalId: data.id,
      title: data.title || data.name || data.executive_summary || detected.canonical,
      description: data.description || data.raw_input || undefined,
      status: data.status || data.implementation_status || data.recovery_status || data.overall_status,
      lifecycleState: data.lifecycle_state || data.status || data.implementation_status,
      metadata: data,
    };
  } catch (err) {
    return { detected, found: false, notFoundReason: `Lookup failed: ${(err as Error).message}` };
  }
}

export async function resolveReferences(text: string): Promise<ResolvedReference[]> {
  const detected = detectReferences(text);
  if (detected.length === 0) return [];
  return Promise.all(detected.map(resolveReference));
}

// ─── Execution Intent Detection ─────────────────────────────────────────────

export type ExecutionAction =
  | 'execute' | 'prepare' | 'begin' | 'start' | 'submit'
  | 'continue' | 'retry' | 'cancel' | 'show' | 'open'
  | 'summarise' | 'summarize' | 'compare' | 'review'
  | 'show_plan' | 'show_completion' | 'show_verification' | 'show_related'
  | 'show_evidence' | 'show_history' | 'none';

export interface ConversationIntent {
  action: ExecutionAction;
  targetReferences: DetectedReference[];
  isExecutionIntent: boolean;
  isComparison: boolean;
  rawText: string;
  ambiguityHint?: string;
}

const ACTION_PATTERNS: Array<{ action: ExecutionAction; patterns: RegExp[] }> = [
  { action: 'prepare',     patterns: [/\bprepare\s+(?:execution\s+)?for\b/i, /\bprepare\s+(?:it|this|that)\b/i, /\bprepare\s+(EWO-\S+)/i] },
  { action: 'execute',     patterns: [/\bexecute\s+(?:it|this|that)?\b/i, /\bexecute\s+(EWO-\S+)/i, /\bsend\s+(?:it|this|EWO-\S+)?\s+for\s+implementation\b/i, /\brun\s+(?:the\s+)?(?:latest\s+)?(?:approved\s+)?EWO\b/i] },
  { action: 'begin',       patterns: [/\bbegin\s+(?:execution\s+)?for\b/i, /\bbegin\s+(?:it|this|that)\b/i, /\bbegin\s+(EWO-\S+)/i] },
  { action: 'start',       patterns: [/\bstart\s+(?:engineering\s+)?for\b/i, /\bstart\s+(?:it|this|that)\b/i, /\bstart\s+(EWO-\S+)/i] },
  { action: 'submit',      patterns: [/\bsubmit\s+(?:it|this|that)?\b/i, /\bsubmit\s+(EWO-\S+)/i] },
  { action: 'continue',    patterns: [/\bcontinue\s+(?:EXEC-\S+|it|this|that)?\b/i] },
  { action: 'retry',       patterns: [/\bretry\s+(?:the\s+)?(?:failed\s+)?(?:execution|EXEC-\S+|it|this|that)?\b/i] },
  { action: 'cancel',      patterns: [/\bcancel\s+(?:EXEC-\S+|it|this|that)?\b/i] },
  { action: 'compare',     patterns: [/\bcompare\s+/i] },
  { action: 'show_plan',   patterns: [/\bshow\s+(?:me\s+)?(?:its\s+|the\s+)?plan\b/i, /\bshow\s+plan\b/i] },
  { action: 'show_completion', patterns: [/\bshow\s+(?:me\s+)?(?:the\s+)?completion\s+report\b/i, /\bshow\s+completion\b/i] },
  { action: 'show_verification', patterns: [/\bshow\s+(?:me\s+)?(?:its\s+|the\s+)?verification\b/i, /\bshow\s+verification\b/i] },
  { action: 'show_related', patterns: [/\bshow\s+(?:me\s+)?(?:its\s+|the\s+)?related\b/i, /\bshow\s+related\s+engineering\b/i] },
  { action: 'show_evidence', patterns: [/\bshow\s+(?:me\s+)?(?:its\s+|the\s+)?evidence\b/i] },
  { action: 'show_history', patterns: [/\bshow\s+(?:me\s+)?(?:the\s+)?reclassification\s+history\b/i] },
  { action: 'show',        patterns: [/\bshow\s+(?:me\s+)?\b/i, /\bopen\s+(?:it|this|that)?\b/i] },
  { action: 'open',        patterns: [/\bopen\s+(EWO-\S+|EXEC-\S+|REC-\S+|it|this|that)?\b/i] },
  { action: 'summarise',   patterns: [/\bsummar(?:ise|ize)\s+(?:it|this|that|EWO-\S+)?\b/i, /\bwhat\s+is\s+(EWO-\S+)/i, /\btell\s+me\s+about\s+(EWO-\S+)/i] },
  { action: 'review',      patterns: [/\breview\s+(?:it|this|that|EWO-\S+|EXEC-\S+)?\b/i] },
];

export function detectConversationIntent(text: string, focusedReference?: DetectedReference | null): ConversationIntent {
  const detected = detectReferences(text);
  const isComparison = /\bcompare\s+/i.test(text) && detected.length >= 2;

  // EWO-031R.3: Negation-aware execution suppression.
  // If the request contains negated execution phrases, execution intent is suppressed.
  const hasNegatedExecution = /\b(do\s+not\s+execute|don'?t\s+execute|do\s+not\s+run|do\s+not\s+start|do\s+not\s+dispatch|do\s+not\s+validate|do\s+not\s+advance|inspection\s+only|read-?only)\b/i.test(text);

  let action: ExecutionAction = 'none';
  for (const { action: a, patterns } of ACTION_PATTERNS) {
    if (patterns.some(p => p.test(text))) {
      action = a;
      break;
    }
  }

  // "What is EWO-015?" → summarise
  if (action === 'none' && /\bwhat\s+is\s+/i.test(text) && detected.length > 0) {
    action = 'summarise';
  }

  // EWO-031R.3: Suppress execution intent when negation is detected
  const isExecutionIntent = !hasNegatedExecution && ['execute', 'prepare', 'begin', 'start', 'submit', 'continue', 'retry', 'cancel'].includes(action);

  // Resolve pronoun "it" / "this" / "that" / "its" / implied context to focused reference
  let targetReferences = detected;
  if (targetReferences.length === 0 && focusedReference && /\b(it|this|that|its|were|was)\b/i.test(text)) {
    targetReferences = [focusedReference];
  }

  // Ambiguity: "execute the latest EWO" with no specific ref
  let ambiguityHint: string | undefined;
  if (isExecutionIntent && targetReferences.length === 0 && !focusedReference) {
    if (/\blatest\b/i.test(text)) {
      ambiguityHint = 'Multiple EWOs may qualify as "latest". Please specify a reference.';
    } else {
      ambiguityHint = 'No engineering reference detected. Please specify an EWO or EXEC reference.';
    }
  }

  return {
    action,
    targetReferences,
    isExecutionIntent,
    isComparison,
    rawText: text,
    ambiguityHint,
  };
}

// ─── Conversation Focus State ────────────────────────────────────────────────
// Governed conversation focus — stored as conversation state, not model memory.

export interface ConversationFocus {
  primaryReference: DetectedReference | null;
  secondaryReference?: DetectedReference | null;
  resolvedPrimary?: ResolvedReference | null;
  resolvedSecondary?: ResolvedReference | null;
  setAt: string;
  conversationId: string;
}

export function createConversationFocus(conversationId: string): ConversationFocus {
  return {
    primaryReference: null,
    secondaryReference: null,
    resolvedPrimary: null,
    resolvedSecondary: null,
    setAt: new Date().toISOString(),
    conversationId,
  };
}

export async function updateConversationFocus(
  focus: ConversationFocus,
  text: string
): Promise<ConversationFocus> {
  const detected = detectReferences(text);
  const isComparison = /\bcompare\s+/i.test(text) && detected.length >= 2;

  if (isComparison && detected.length >= 2) {
    const [primary, secondary] = detected;
    const [resolvedPrimary, resolvedSecondary] = await Promise.all([
      resolveReference(primary),
      resolveReference(secondary),
    ]);
    return {
      primaryReference: primary,
      secondaryReference: secondary,
      resolvedPrimary,
      resolvedSecondary,
      setAt: new Date().toISOString(),
      conversationId: focus.conversationId,
    };
  }

  if (detected.length > 0) {
    const primary = detected[0];
    const resolvedPrimary = await resolveReference(primary);
    return {
      primaryReference: primary,
      secondaryReference: null,
      resolvedPrimary,
      resolvedSecondary: null,
      setAt: new Date().toISOString(),
      conversationId: focus.conversationId,
    };
  }

  // No new reference detected — retain existing focus unless user explicitly changes
  return focus;
}

// ─── Governed Not-Found Response ──────────────────────────────────────────────

export interface NotFoundResponse {
  reference: string;
  message: string;
  suggestions: string[];
}

export function buildNotFoundResponse(reference: string): NotFoundResponse {
  return {
    reference,
    message: `${reference} could not be found in the Engineering Ledger.`,
    suggestions: [
      'Search similar references',
      'Open Engineering Work Orders',
      'Check archived objects',
      'Check historical recovery',
      'Cancel',
    ],
  };
}

// ─── Engineering Knowledge Package ──────────────────────────────────────────
// Assembled from canonical EIOS records at request time. Never from model memory.

export interface EngineeringKnowledgePackage {
  reference: string;
  objectType: EngineeringReferenceType;
  canonicalId: string;
  assembledAt: string;
  version: string;
  layers: KnowledgeLayer[];
  summary: {
    title: string;
    purpose: string;
    currentStatus: string;
    lifecycleState: string;
    verificationState?: string;
    poState?: string;
    nextAction?: string;
  };
  ewo?: {
    ref: string;
    title: string;
    description: string;
    status: string;
    lifecycleState: string;
    poStatus: string;
    verificationStatus: string;
    planRef?: string;
    assignedEngineer?: string;
    implementationProvider?: string;
  };
  plan?: {
    ref: string;
    executiveSummary: string;
    engineeringPhases?: unknown;
    recommendedEwos?: string[];
    version: string;
  };
  completionReport?: {
    reportRef: string;
    summary: string;
    filesChanged?: string[];
    buildEvidence?: string;
    testEvidence?: string;
    generatedAt: string;
  };
  verification?: {
    overallStatus: string;
    gates: Array<{ gate: string; status: string; evidenceSummary?: string }>;
  };
  standards?: Array<{ ref: string; title: string; version: string }>;
  constitutionalRequirements?: Array<{ ref: string; title: string }>;
  relatedEngineering?: Array<{ ref: string; title: string; relationship: string }>;
  executionHistory?: Array<{ ref: string; status: string; provider: string; createdAt: string }>;
  risks?: string[];
  recommendations?: string[];
  historicalRecovery?: {
    recoveryRef: string;
    confidence: string;
    importedAt?: string;
    importedEwoRef?: string;
  };
}

export interface KnowledgeLayer {
  name: string;
  priority: number;
  recordCount: number;
  source: string;
  retrievedAt: string;
}

// ─── Knowledge Package Assembly ───────────────────────────────────────────────

export async function assembleKnowledgePackage(
  resolved: ResolvedReference
): Promise<EngineeringKnowledgePackage | null> {
  if (!resolved.found || !resolved.canonicalId) {
    return null;
  }

  const assembledAt = new Date().toISOString();
  const layers: KnowledgeLayer[] = [];
  const type = resolved.detected.type;

  // EWO Knowledge Package — the most comprehensive
  if (type === 'EWO') {
    return assembleEWOKnowledgePackage(resolved, assembledAt, layers);
  }

  // EXEC Knowledge Package
  if (type === 'EXEC') {
    return assembleEXECKnowledgePackage(resolved, assembledAt, layers);
  }

  // REC Knowledge Package
  if (type === 'REC') {
    return assembleRECKnowledgePackage(resolved, assembledAt, layers);
  }

  // Generic fallback for other reference types
  layers.push({
    name: 'Canonical Object',
    priority: 1,
    recordCount: 1,
    source: TYPE_TO_TABLE[type].table,
    retrievedAt: assembledAt,
  });

  return {
    reference: resolved.detected.canonical,
    objectType: type,
    canonicalId: resolved.canonicalId,
    assembledAt,
    version: '1.0.0',
    layers,
    summary: {
      title: resolved.title || resolved.detected.canonical,
      purpose: resolved.description || 'No description available.',
      currentStatus: resolved.status || 'unknown',
      lifecycleState: resolved.lifecycleState || 'unknown',
    },
  };
}

async function assembleEWOKnowledgePackage(
  resolved: ResolvedReference,
  assembledAt: string,
  layers: KnowledgeLayer[]
): Promise<EngineeringKnowledgePackage> {
  const ewoId = resolved.canonicalId!;
  const ewoData = resolved.metadata as Record<string, unknown>;

  // Layer 1: EWO itself (already loaded)
  layers.push({ name: 'Engineering Work Order', priority: 1, recordCount: 1, source: 'engineering_work_orders', retrievedAt: assembledAt });

  // Layer 2: Engineering Plan
  let plan: EngineeringKnowledgePackage['plan'];
  if (ewoData.engineering_plan_id) {
    const { data: planData } = await supabase
      .from('atd_engineering_plans')
      .select('id, plan_ref, intent_id, executive_summary, engineering_phases, recommended_ewos, status, version')
      .eq('id', ewoData.engineering_plan_id)
      .maybeSingle();
    if (planData) {
      plan = {
        ref: planData.plan_ref,
        executiveSummary: planData.executive_summary || '',
        engineeringPhases: planData.engineering_phases,
        recommendedEwos: planData.recommended_ewos || [],
        version: String(planData.version || '1'),
      };
      layers.push({ name: 'Engineering Plan', priority: 3, recordCount: 1, source: 'atd_engineering_plans', retrievedAt: assembledAt });
    }
  }

  // Layer 3: Completion Report
  let completionReport: EngineeringKnowledgePackage['completionReport'];
  const { data: reportData } = await supabase
    .from('ewo_completion_reports')
    .select('id, ewo_ref, title, executive_summary, files_modified, build_result, validation_results, generated_at')
    .eq('ewo_id', ewoId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reportData) {
    completionReport = {
      reportRef: reportData.ewo_ref || resolved.detected.canonical,
      summary: reportData.executive_summary || reportData.title || '',
      filesChanged: normalizeFilesChanged(reportData.files_modified),
      buildEvidence: reportData.build_result,
      testEvidence: reportData.validation_results,
      generatedAt: reportData.generated_at,
    };
    layers.push({ name: 'Completion Report', priority: 8, recordCount: 1, source: 'ewo_completion_reports', retrievedAt: assembledAt });
  }

  // Layer 4: Verification
  let verification: EngineeringKnowledgePackage['verification'];
  const { data: gates } = await supabase
    .from('ewo_verification_gates')
    .select('gate_key, gate_status, evidence_summary')
    .eq('ewo_id', ewoId);
  if (gates && gates.length > 0) {
    verification = {
      overallStatus: (resolved.metadata as Record<string, unknown>).verification_status as string || 'not_started',
      gates: gates.map(g => ({ gate: g.gate_key, status: g.gate_status, evidenceSummary: g.evidence_summary || undefined })),
    };
    layers.push({ name: 'Verification', priority: 7, recordCount: gates.length, source: 'ewo_verification_gates', retrievedAt: assembledAt });
  }

  // Layer 5: Applicable Engineering Standards
  let standards: EngineeringKnowledgePackage['standards'];
  const { data: standardsData } = await supabase
    .from('ecc_engineering_standards')
    .select('id, standard_ref, title, version')
    .eq('status', 'active');
  if (standardsData && standardsData.length > 0) {
    standards = standardsData.map(s => ({ ref: s.standard_ref, title: s.title, version: String(s.version || '1') }));
    layers.push({ name: 'Engineering Standards', priority: 5, recordCount: standardsData.length, source: 'ecc_engineering_standards', retrievedAt: assembledAt });
  }

  // Layer 6: Constitutional Requirements
  let constitutionalRequirements: EngineeringKnowledgePackage['constitutionalRequirements'];
  const { data: amdData } = await supabase
    .from('engineering_constitutional_amendments')
    .select('id, amendment_ref, title')
    .eq('status', 'active')
    .limit(20);
  if (amdData && amdData.length > 0) {
    constitutionalRequirements = amdData.map(a => ({ ref: a.amendment_ref, title: a.title }));
    layers.push({ name: 'Constitutional Requirements', priority: 6, recordCount: amdData.length, source: 'engineering_constitutional_amendments', retrievedAt: assembledAt });
  }

  // Layer 7: Related Engineering
  let relatedEngineering: EngineeringKnowledgePackage['relatedEngineering'];
  const ewoRef = (ewoData.ewo_ref as string) || resolved.detected.canonical;
  const { data: relData } = await supabase
    .from('engineering_object_relationships')
    .select('from_object_ref, to_object_ref, relationship_type')
    .or(`from_object_ref.eq.${ewoRef},to_object_ref.eq.${ewoRef}`)
    .limit(20);
  if (relData && relData.length > 0) {
    relatedEngineering = relData.map(r => ({
      ref: r.from_object_ref === ewoRef ? r.to_object_ref : r.from_object_ref,
      title: r.from_object_ref === ewoRef ? r.to_object_ref : r.from_object_ref,
      relationship: r.relationship_type,
    }));
    layers.push({ name: 'Related Engineering', priority: 4, recordCount: relData.length, source: 'engineering_object_relationships', retrievedAt: assembledAt });
  }

  // Layer 8: Execution History
  let executionHistory: EngineeringKnowledgePackage['executionHistory'];
  const { data: execData } = await supabase
    .from('engineering_executions')
    .select('id, execution_ref, implementation_status, implementation_provider, created_at')
    .eq('ewo_id', ewoId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (execData && execData.length > 0) {
    executionHistory = execData.map(e => ({ ref: e.execution_ref, status: e.implementation_status, provider: e.implementation_provider || 'bolt', createdAt: e.created_at }));
    layers.push({ name: 'Execution History', priority: 9, recordCount: execData.length, source: 'engineering_executions', retrievedAt: assembledAt });
  }

  // Layer 9: Historical Recovery
  let historicalRecovery: EngineeringKnowledgePackage['historicalRecovery'];
  const { data: recData } = await supabase
    .from('engineering_recovery_packages')
    .select('id, recovery_ref, engineering_confidence, imported_at, imported_ewo_id')
    .eq('imported_ewo_id', ewoId)
    .maybeSingle();
  if (recData) {
    historicalRecovery = {
      recoveryRef: recData.recovery_ref,
      confidence: recData.engineering_confidence,
      importedAt: recData.imported_at || undefined,
      importedEwoRef: resolved.detected.canonical,
    };
    layers.push({ name: 'Historical Recovery', priority: 10, recordCount: 1, source: 'engineering_recovery_packages', retrievedAt: assembledAt });
  }

  // Layer 10: Change Log
  const { count: changeLogCount } = await supabase
    .from('ecc_engineering_change_log')
    .select('id', { count: 'exact', head: true });
  if (changeLogCount && changeLogCount > 0) {
    layers.push({ name: 'Change Log', priority: 11, recordCount: changeLogCount, source: 'ecc_engineering_change_log', retrievedAt: assembledAt });
  }

  // Sort layers by priority
  layers.sort((a, b) => a.priority - b.priority);

  const ewo = {
    ref: (ewoData.ewo_ref as string) || resolved.detected.canonical,
    title: (ewoData.title as string) || resolved.title || '',
    description: (ewoData.executive_summary as string) || (ewoData.engineering_objective as string) || '',
    status: (ewoData.status as string) || 'unknown',
    lifecycleState: (ewoData.implementation_status as string) || (ewoData.status as string) || 'unknown',
    poStatus: (ewoData.po_acceptance_notes as string) ? 'accepted' : 'pending',
    verificationStatus: (ewoData.verification_status as string) || 'not_started',
    planRef: (ewoData.engineering_package_status as string) || undefined,
    assignedEngineer: (ewoData.owner as string) || undefined,
    implementationProvider: (ewoData.implementation_provider as string) || undefined,
  };

  const nextAction = computeNextAction(ewo, verification, completionReport);

  return {
    reference: resolved.detected.canonical,
    objectType: 'EWO',
    canonicalId: ewoId,
    assembledAt,
    version: '1.0.0',
    layers,
    summary: {
      title: ewo.title,
      purpose: ewo.description,
      currentStatus: ewo.status,
      lifecycleState: ewo.lifecycleState,
      verificationState: ewo.verificationStatus,
      poState: ewo.poStatus,
      nextAction,
    },
    ewo,
    plan,
    completionReport,
    verification,
    standards,
    constitutionalRequirements,
    relatedEngineering,
    executionHistory,
    historicalRecovery,
  };
}

async function assembleEXECKnowledgePackage(
  resolved: ResolvedReference,
  assembledAt: string,
  layers: KnowledgeLayer[]
): Promise<EngineeringKnowledgePackage> {
  const execId = resolved.canonicalId!;
  const execData = resolved.metadata as Record<string, unknown>;

  layers.push({ name: 'Engineering Execution', priority: 1, recordCount: 1, source: 'engineering_executions', retrievedAt: assembledAt });

  // Load the parent EWO
  let ewo: EngineeringKnowledgePackage['ewo'];
  if (execData.ewo_id) {
    const { data: ewoData } = await supabase
      .from('engineering_work_orders')
      .select('id, ewo_ref, title, executive_summary, engineering_objective, status, implementation_status, verification_status, po_acceptance_notes, engineering_package_status, owner, implementation_provider')
      .eq('id', execData.ewo_id)
      .maybeSingle();
    if (ewoData) {
      ewo = {
        ref: ewoData.ewo_ref,
        title: ewoData.title,
        description: (ewoData.executive_summary as string) || (ewoData.engineering_objective as string) || '',
        status: ewoData.status,
        lifecycleState: (ewoData.implementation_status as string) || (ewoData.status as string) || 'unknown',
        poStatus: (ewoData.po_acceptance_notes as string) ? 'accepted' : 'pending',
        verificationStatus: ewoData.verification_status || 'not_started',
        planRef: (ewoData.engineering_package_status as string) || undefined,
        assignedEngineer: (ewoData.owner as string) || undefined,
        implementationProvider: (ewoData.implementation_provider as string) || undefined,
      };
      layers.push({ name: 'Parent EWO', priority: 2, recordCount: 1, source: 'engineering_work_orders', retrievedAt: assembledAt });
    }
  }

  // Load execution events
  const { data: events } = await supabase
    .from('engineering_execution_events')
    .select('from_status, to_status, event_type, actor, notes, created_at')
    .eq('execution_id', execId)
    .order('created_at', { ascending: true });
  if (events && events.length > 0) {
    layers.push({ name: 'Execution Events', priority: 3, recordCount: events.length, source: 'engineering_execution_events', retrievedAt: assembledAt });
  }

  return {
    reference: resolved.detected.canonical,
    objectType: 'EXEC',
    canonicalId: execId,
    assembledAt,
    version: '1.0.0',
    layers,
    summary: {
      title: ewo?.title || resolved.detected.canonical,
      purpose: ewo?.description || 'Engineering Execution',
      currentStatus: (execData.implementation_status as string) || 'unknown',
      lifecycleState: (execData.implementation_status as string) || 'unknown',
    },
    ewo,
    executionHistory: events?.map((e: Record<string, unknown>) => ({
      ref: String(e.event_type || ''),
      status: String(e.to_status || ''),
      provider: String(e.actor || ''),
      createdAt: String(e.created_at || ''),
    })),
  };
}

async function assembleRECKnowledgePackage(
  resolved: ResolvedReference,
  assembledAt: string,
  layers: KnowledgeLayer[]
): Promise<EngineeringKnowledgePackage> {
  const recId = resolved.canonicalId!;
  const recData = resolved.metadata as Record<string, unknown>;

  layers.push({ name: 'Recovery Package', priority: 1, recordCount: 1, source: 'engineering_recovery_packages', retrievedAt: assembledAt });

  // Load audit history
  const { data: auditData } = await supabase
    .from('engineering_recovery_audit')
    .select('action, acted_by, reason, created_at')
    .eq('recovery_package_id', recId)
    .order('created_at', { ascending: true });
  if (auditData && auditData.length > 0) {
    layers.push({ name: 'Recovery Audit Trail', priority: 2, recordCount: auditData.length, source: 'engineering_recovery_audit', retrievedAt: assembledAt });
  }

  return {
    reference: resolved.detected.canonical,
    objectType: 'REC',
    canonicalId: recId,
    assembledAt,
    version: '1.0.0',
    layers,
    summary: {
      title: (recData.title as string) || resolved.detected.canonical,
      purpose: 'Historical Recovery Package',
      currentStatus: (recData.recovery_status as string) || 'unknown',
      lifecycleState: (recData.recovery_status as string) || 'unknown',
    },
    historicalRecovery: {
      recoveryRef: (recData.recovery_ref as string) || resolved.detected.canonical,
      confidence: (recData.engineering_confidence as string) || 'UNKNOWN',
      importedAt: (recData.imported_at as string) || undefined,
      importedEwoRef: (recData.imported_ewo_id as string) || undefined,
    },
  };
}

function computeNextAction(
  ewo: NonNullable<EngineeringKnowledgePackage['ewo']>,
  verification?: EngineeringKnowledgePackage['verification'],
  completionReport?: EngineeringKnowledgePackage['completionReport']
): string {
  if (ewo.lifecycleState === 'released') return 'No further action — EWO is released.';
  if (ewo.poStatus === 'pending' && ewo.verificationStatus === 'verified') return 'Awaiting Product Owner Acceptance.';
  if (completionReport && verification?.overallStatus !== 'verified') return 'Awaiting Automated Verification.';
  if (completionReport) return 'Awaiting Engineering Review.';
  if (ewo.status === 'approved' || ewo.status === 'in_progress') return 'Ready for execution.';
  if (ewo.status === 'draft') return 'Awaiting governance approval.';
  return 'Review EWO status.';
}

// ─── Knowledge Package → Context Prompt ──────────────────────────────────────
// Renders the package into a governed context block for the AI provider.

export function renderKnowledgePackageAsContext(pkg: EngineeringKnowledgePackage): string {
  const lines: string[] = [];
  lines.push(`# Engineering Knowledge Package: ${pkg.reference}`);
  lines.push(`Assembled: ${pkg.assembledAt}`);
  lines.push(`Version: ${pkg.version}`);
  lines.push('');

  if (pkg.ewo) {
    lines.push('## Engineering Work Order');
    lines.push(`- Reference: ${pkg.ewo.ref}`);
    lines.push(`- Title: ${pkg.ewo.title}`);
    lines.push(`- Description: ${pkg.ewo.description}`);
    lines.push(`- Status: ${pkg.ewo.status}`);
    lines.push(`- Lifecycle State: ${pkg.ewo.lifecycleState}`);
    lines.push(`- PO Status: ${pkg.ewo.poStatus}`);
    lines.push(`- Verification Status: ${pkg.ewo.verificationStatus}`);
    if (pkg.ewo.planRef) lines.push(`- Plan: ${pkg.ewo.planRef}`);
    if (pkg.ewo.assignedEngineer) lines.push(`- Assigned Engineer: ${pkg.ewo.assignedEngineer}`);
    if (pkg.ewo.implementationProvider) lines.push(`- Implementation Provider: ${pkg.ewo.implementationProvider}`);
    lines.push('');
  }

  if (pkg.plan) {
    lines.push('## Engineering Plan');
    lines.push(`- Reference: ${pkg.plan.ref}`);
    lines.push(`- Executive Summary: ${pkg.plan.executiveSummary}`);
    if (pkg.plan.recommendedEwos && pkg.plan.recommendedEwos.length > 0) {
      lines.push(`- Recommended EWOs: ${pkg.plan.recommendedEwos.join(', ')}`);
    }
    lines.push('');
  }

  if (pkg.completionReport) {
    lines.push('## Completion Report');
    lines.push(`- Reference: ${pkg.completionReport.reportRef}`);
    lines.push(`- Summary: ${pkg.completionReport.summary}`);
    if (pkg.completionReport.filesChanged && pkg.completionReport.filesChanged.length > 0) {
      lines.push(`- Files Changed: ${pkg.completionReport.filesChanged.join(', ')}`);
    }
    lines.push('');
  }

  if (pkg.verification) {
    lines.push('## Verification');
    lines.push(`- Overall Status: ${pkg.verification.overallStatus}`);
    for (const gate of pkg.verification.gates) {
      lines.push(`  - ${gate.gate}: ${gate.status}${gate.evidenceSummary ? ` — ${gate.evidenceSummary}` : ''}`);
    }
    lines.push('');
  }

  if (pkg.standards && pkg.standards.length > 0) {
    lines.push('## Applicable Engineering Standards');
    for (const s of pkg.standards) {
      lines.push(`- ${s.ref}: ${s.title} (v${s.version})`);
    }
    lines.push('');
  }

  if (pkg.constitutionalRequirements && pkg.constitutionalRequirements.length > 0) {
    lines.push('## Constitutional Requirements');
    for (const c of pkg.constitutionalRequirements) {
      lines.push(`- ${c.ref}: ${c.title}`);
    }
    lines.push('');
  }

  if (pkg.relatedEngineering && pkg.relatedEngineering.length > 0) {
    lines.push('## Related Engineering');
    for (const r of pkg.relatedEngineering) {
      lines.push(`- ${r.ref}: ${r.title} (${r.relationship})`);
    }
    lines.push('');
  }

  if (pkg.executionHistory && pkg.executionHistory.length > 0) {
    lines.push('## Execution History');
    for (const e of pkg.executionHistory) {
      lines.push(`- ${e.ref}: ${e.status} via ${e.provider} at ${e.createdAt}`);
    }
    lines.push('');
  }

  if (pkg.historicalRecovery) {
    lines.push('## Historical Recovery');
    lines.push(`- Recovery Reference: ${pkg.historicalRecovery.recoveryRef}`);
    lines.push(`- Confidence: ${pkg.historicalRecovery.confidence}`);
    if (pkg.historicalRecovery.importedAt) lines.push(`- Imported At: ${pkg.historicalRecovery.importedAt}`);
    lines.push('');
  }

  lines.push('## Next Action');
  lines.push(pkg.summary.nextAction || 'Review object status.');

  return lines.join('\n');
}
