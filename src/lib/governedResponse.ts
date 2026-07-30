// EWO-020 — ES-003: Governed User Guidance & Action Transparency
//
// The canonical governed response model for all EIOS applications.
// Every user action must result in one of four governed outcomes:
//   Success, Information, Guidance, Failure.
//
// This module provides the response model, registry, and engine.
// It is designed to be reusable by all current and future EIOS modules
// without modification.

// ─── Response Classification ─────────────────────────────────────────────────

export type ResponseClassification = 'success' | 'information' | 'guidance' | 'failure';

export type ResponseSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ResponseCategory =
  | 'engineering_integrity'
  | 'engineering_work_order'
  | 'change_log'
  | 'historical_recovery'
  | 'constitution'
  | 'standards'
  | 'product_owner_approval'
  | 'platform'
  | 'ai_workflow'
  | 'repository'
  | 'deployment'
  | 'integration'
  | 'general';

// ─── Governed Response Model ──────────────────────────────────────────────────

export interface GovernedResponseAction {
  label: string;
  description?: string;
  action?: () => void;
  href?: string;
}

export interface RelatedEngineeringRef {
  type: string;
  ref: string;
  label?: string;
}

export interface GovernedResponse {
  /** The classification: success, information, guidance, or failure */
  classification: ResponseClassification;
  /** Short title of the response */
  title: string;
  /** One-line summary of what happened */
  summary: string;
  /** Full explanation of what happened and why */
  explanation: string;
  /** The root cause (when known) */
  cause?: string;
  /** The primary recommended next action */
  recommendedNextAction: string;
  /** Optional secondary actions the user can take */
  secondaryActions?: GovernedResponseAction[];
  /** Stable reference code for support and diagnostics (e.g. EIOS-GUIDE-001) */
  referenceCode: string;
  /** Severity level */
  severity: ResponseSeverity;
  /** Technical context for developers (when appropriate) */
  technicalContext?: string;
  /** Related engineering references (optional) */
  relatedEngineering?: RelatedEngineeringRef[];
  /** Category for registry lookup */
  category: ResponseCategory;
  /** Timestamp of the response */
  timestamp: string;
}

// ─── Registry Definition ──────────────────────────────────────────────────────

export interface RegistryEntry {
  referenceCode: string;
  classification: ResponseClassification;
  category: ResponseCategory;
  severity: ResponseSeverity;
  title: string;
  summary: string;
  explanation: string;
  cause?: string;
  recommendedNextAction: string;
  secondaryActions?: Array<{ label: string; description?: string; href?: string }>;
  technicalContext?: string;
}

// ─── Central Response Registry ───────────────────────────────────────────────
//
// Responses are defined here, not hard-coded throughout the application.
// Future AI support assistants can use this registry to provide richer
// contextual assistance without changing the response model.

const REGISTRY: Record<string, RegistryEntry> = {
  // ── Engineering Integrity ──────────────────────────────────────────────────
  'EIOS-INTEGRITY-001': {
    referenceCode: 'EIOS-INTEGRITY-001',
    classification: 'success',
    category: 'engineering_integrity',
    severity: 'low',
    title: 'Integrity Alert Resolved',
    summary: 'The Engineering Integrity alert has been successfully resolved.',
    explanation: 'The governed resolution completed successfully. The alert lifecycle has advanced to Resolved and the resolution has been persisted to the database.',
    recommendedNextAction: 'View the Engineering Change Log to see the recorded resolution event.',
    secondaryActions: [
      { label: 'View Change Log', href: '/engineering/change-log' },
      { label: 'Return to Integrity Dashboard', href: '/engineering/integrity' },
    ],
  },
  'EIOS-INTEGRITY-002': {
    referenceCode: 'EIOS-INTEGRITY-002',
    classification: 'guidance',
    category: 'engineering_integrity',
    severity: 'medium',
    title: 'Integrity Alert Requires Investigation',
    summary: 'This alert requires investigation before it can be resolved.',
    explanation: 'Engineering Intelligence has analysed the available evidence and produced a recommendation. Review the recommendation and available actions in the Investigation Workspace.',
    cause: 'The alert was detected during an integrity scan and has not yet been resolved.',
    recommendedNextAction: 'Open the Investigation Workspace to review the evidence and recommendation.',
    secondaryActions: [
      { label: 'Open Investigation', description: 'Review evidence and recommendation' },
    ],
  },
  'EIOS-INTEGRITY-003': {
    referenceCode: 'EIOS-INTEGRITY-003',
    classification: 'failure',
    category: 'engineering_integrity',
    severity: 'high',
    title: 'Integrity Alert Already Resolved',
    summary: 'This Engineering Integrity alert has already been resolved.',
    explanation: 'The governed resolution cannot be executed because this alert has already reached a terminal state (Resolved or Archived). The same governed repair can never be executed twice.',
    cause: 'The alert resolution_status is already "resolved" or "archived" in the database.',
    recommendedNextAction: 'View the resolution details in the Investigation Workspace.',
    secondaryActions: [
      { label: 'View Resolution Details', description: 'See timestamp, actor, and audit reference' },
      { label: 'View Change Log', href: '/engineering/change-log' },
    ],
  },
  'EIOS-INTEGRITY-004': {
    referenceCode: 'EIOS-INTEGRITY-004',
    classification: 'information',
    category: 'engineering_integrity',
    severity: 'low',
    title: 'No Integrity Alerts Found',
    summary: 'No Engineering Integrity alerts were found.',
    explanation: 'The integrity scan completed successfully and found no alerts requiring attention.',
    recommendedNextAction: 'Return to the Engineering Control Centre.',
  },

  // ── Engineering Work Orders ────────────────────────────────────────────────
  'EIOS-EWO-001': {
    referenceCode: 'EIOS-EWO-001',
    classification: 'success',
    category: 'engineering_work_order',
    severity: 'low',
    title: 'Engineering Work Order Saved',
    summary: 'Your changes have been saved successfully.',
    explanation: 'The Engineering Work Order has been updated and the change has been recorded in the Engineering Change Log.',
    recommendedNextAction: 'Continue working or return to the Work Orders list.',
  },
  'EIOS-EWO-002': {
    referenceCode: 'EIOS-EWO-002',
    classification: 'guidance',
    category: 'engineering_work_order',
    severity: 'medium',
    title: 'Work Order Is Closed',
    summary: 'This Engineering Work Order has been closed and cannot be modified.',
    explanation: 'Your changes could not be saved because this Engineering Work Order has been closed after Product Owner Acceptance. Closed work orders are read-only.',
    cause: 'The work order status is "closed".',
    recommendedNextAction: 'Create a refinement Engineering Work Order to address new requirements.',
    secondaryActions: [
      { label: 'Create Refinement', description: 'Create a new EWO that refines this one' },
      { label: 'View Change Log', href: '/engineering/change-log' },
      { label: 'Reopen Work Order', description: 'Request reopening (requires PO approval)' },
    ],
  },
  'EIOS-EWO-003': {
    referenceCode: 'EIOS-EWO-003',
    classification: 'failure',
    category: 'engineering_work_order',
    severity: 'high',
    title: 'Work Order Not Found',
    summary: 'The requested Engineering Work Order could not be found.',
    explanation: 'The work order reference does not exist in the database. It may have been deleted or the reference may be incorrect.',
    cause: 'No engineering_work_orders record matches the provided reference.',
    recommendedNextAction: 'Check the reference and try again, or browse the Work Orders list.',
    secondaryActions: [
      { label: 'Browse Work Orders', href: '/engineering/work-orders' },
    ],
  },

  // ── Change Log ──────────────────────────────────────────────────────────────
  'EIOS-CHANGELOG-001': {
    referenceCode: 'EIOS-CHANGELOG-001',
    classification: 'success',
    category: 'change_log',
    severity: 'low',
    title: 'Change Log Entry Recorded',
    summary: 'The engineering event has been recorded in the Change Log.',
    explanation: 'The event was automatically recorded with full audit trail, actor tracking, and linked artefacts.',
    recommendedNextAction: 'View the Change Log to see the recorded event.',
    secondaryActions: [
      { label: 'View Change Log', href: '/engineering/change-log' },
    ],
  },
  'EIOS-CHANGELOG-002': {
    referenceCode: 'EIOS-CHANGELOG-002',
    classification: 'information',
    category: 'change_log',
    severity: 'low',
    title: 'No Change Log Entries',
    summary: 'No change log entries match the current filters.',
    explanation: 'There are no entries matching the selected filters. Try adjusting or clearing the filters.',
    recommendedNextAction: 'Clear filters to see all entries.',
  },
  'EIOS-CHANGELOG-003': {
    referenceCode: 'EIOS-CHANGELOG-003',
    classification: 'failure',
    category: 'change_log',
    severity: 'high',
    title: 'Ledger Count Retrieval Failed',
    summary: 'The Engineering Change Ledger summary counters could not be retrieved.',
    explanation: 'The database query for authoritative ledger totals failed. The displayed counters may be stale and should not be relied upon until a successful refresh completes.',
    cause: 'Database query error, network failure, or permission issue.',
    recommendedNextAction: 'Click the refresh button to retry. If the problem persists, contact support with the reference code.',
    secondaryActions: [
      { label: 'Retry', description: 'Attempt to reload the ledger' },
    ],
  },
  'EIOS-CHANGELOG-004': {
    referenceCode: 'EIOS-CHANGELOG-004',
    classification: 'information',
    category: 'change_log',
    severity: 'low',
    title: 'Ledger Count Invariant Warning',
    summary: 'The ledger counters do not satisfy the expected invariant (Total = Live + Reconstructed).',
    explanation: 'The authoritative counts returned by the database do not satisfy Total Events = Live Events + Reconstructed Events. This may indicate a data classification issue or an unknown event type.',
    recommendedNextAction: 'Contact support with the reference code to investigate the classification mismatch.',
  },

  // ── Work Order Export (EWO-022) ────────────────────────────────────────────
  'EIOS-WOEXPORT-001': {
    referenceCode: 'EIOS-WOEXPORT-001',
    classification: 'guidance',
    category: 'engineering_work_order',
    severity: 'medium',
    title: 'Export Not Ready',
    summary: 'The Work Order export is not ready. Please wait and try again.',
    explanation: 'The export system is preparing or the workspace has not fully loaded. No export will be generated until the workspace is ready.',
    cause: 'Workspace data is still loading or the export service has not initialised.',
    recommendedNextAction: 'Wait for the workspace to fully load, then click Download Spreadsheet again.',
    secondaryActions: [
      { label: 'Retry Export', description: 'Attempt the export again' },
    ],
  },
  'EIOS-WOEXPORT-002': {
    referenceCode: 'EIOS-WOEXPORT-002',
    classification: 'failure',
    category: 'engineering_work_order',
    severity: 'high',
    title: 'Authoritative Query Failed',
    summary: 'The authoritative Work Order query failed. No export was generated.',
    explanation: 'The database query to retrieve all closed Work Orders failed. This may be a network issue, permission issue, or database error. No spreadsheet was generated to prevent exporting incomplete or misleading data.',
    cause: 'Database query error, network failure, or permission issue.',
    recommendedNextAction: 'Retry the export. If the problem persists, contact support with the reference code.',
    secondaryActions: [
      { label: 'Retry Export', description: 'Attempt the export again' },
    ],
  },
  'EIOS-WOEXPORT-003': {
    referenceCode: 'EIOS-WOEXPORT-003',
    classification: 'failure',
    category: 'engineering_work_order',
    severity: 'high',
    title: 'Count Reconciliation Failed',
    summary: 'The exported record count does not match the authoritative closed count.',
    explanation: 'The number of unique canonical Work Orders exported does not match the authoritative count of closed Work Orders. The export has been blocked to prevent presenting an incomplete dataset as complete.',
    cause: 'Some batches may have failed to retrieve, or duplicate detection removed records incorrectly.',
    recommendedNextAction: 'Retry the export. If the problem persists, contact support with the reference code and the discrepancy details.',
    secondaryActions: [
      { label: 'Retry Export', description: 'Attempt the export again' },
    ],
  },
  'EIOS-WOEXPORT-004': {
    referenceCode: 'EIOS-WOEXPORT-004',
    classification: 'failure',
    category: 'engineering_work_order',
    severity: 'high',
    title: 'Spreadsheet Generation Failed',
    summary: 'The spreadsheet could not be generated.',
    explanation: 'The XLSX generation library encountered an error while building the workbook. This may be due to memory limits or an internal library error.',
    cause: 'XLSX library error, memory limit, or browser limitation.',
    recommendedNextAction: 'Retry the export. If the problem persists, try exporting a filtered subset or contact support.',
    secondaryActions: [
      { label: 'Retry Export', description: 'Attempt the export again' },
    ],
  },
  'EIOS-WOEXPORT-005': {
    referenceCode: 'EIOS-WOEXPORT-005',
    classification: 'guidance',
    category: 'engineering_work_order',
    severity: 'medium',
    title: 'Partial Export Warning',
    summary: 'The export is partial — not all closed Work Orders were retrieved.',
    explanation: 'Some batches failed to retrieve. The export has been labelled as partial. The missing range or batch is identified in the Export Summary where possible.',
    cause: 'One or more database query batches failed during retrieval.',
    recommendedNextAction: 'Review the Export Summary for the missing range. Retry the export to attempt a complete retrieval.',
    secondaryActions: [
      { label: 'Retry Export', description: 'Attempt a complete export' },
    ],
  },
  'EIOS-WOEXPORT-006': {
    referenceCode: 'EIOS-WOEXPORT-006',
    classification: 'guidance',
    category: 'engineering_work_order',
    severity: 'low',
    title: 'Duplicate Reference Warning',
    summary: 'Duplicate Work Order references were detected and deduplicated.',
    explanation: 'One or more Work Order references appeared multiple times in the retrieved data. Duplicates were removed by canonical record identity. The Export Summary records the duplicate count.',
    cause: 'Database query returned duplicate rows, possibly from joins or batch overlaps.',
    recommendedNextAction: 'Review the Export Summary for the duplicate count. No action is required unless duplicates persist.',
    secondaryActions: [
      { label: 'Review Summary', description: 'Check the Export Summary for duplicate details' },
    ],
  },

  // ── Investigation Export ────────────────────────────────────────────────────
  'EIOS-EXPORT-001': {
    referenceCode: 'EIOS-EXPORT-001',
    classification: 'guidance',
    category: 'engineering_integrity',
    severity: 'medium',
    title: 'Investigation Export Not Ready',
    summary: 'The investigation data is still resolving and cannot be exported yet.',
    explanation: 'The canonical Investigation Runtime Model has not completed resolution. Generating a PDF or AI Context Package now would produce an incomplete or misleading export with missing sections and potentially incorrect decision state.',
    cause: 'Asynchronous data loading (evidence package, engineering recommendation, authoritative decision, or decision timeline) has not completed.',
    recommendedNextAction: 'Wait for the investigation to fully resolve, then click Download PDF or Copy AI Context again.',
    secondaryActions: [
      { label: 'Retry Export', description: 'Attempt export after resolution completes' },
    ],
  },
  'EIOS-EXPORT-002': {
    referenceCode: 'EIOS-EXPORT-002',
    classification: 'failure',
    category: 'engineering_integrity',
    severity: 'high',
    title: 'Investigation Export Failed',
    summary: 'A visible investigation section failed to render in the PDF.',
    explanation: 'One or more visible schema sections could not be rendered. The export diagnostic envelope records which sections failed. The PDF may be incomplete.',
    cause: 'A section renderer threw an error or the schema data was missing required fields.',
    recommendedNextAction: 'Retry the export. If the problem persists, contact support with the reference code and the export diagnostic.',
    secondaryActions: [
      { label: 'Retry Export', description: 'Attempt the export again' },
    ],
  },

  // ── Historical Recovery ────────────────────────────────────────────────────
  'EIOS-RECOVERY-001': {
    referenceCode: 'EIOS-RECOVERY-001',
    classification: 'success',
    category: 'historical_recovery',
    severity: 'low',
    title: 'Recovery Package Approved',
    summary: 'The historical recovery package has been approved.',
    explanation: 'The recovery package was successfully approved and the canonical engineering record has been created or linked.',
    recommendedNextAction: 'View the recovered record in the Engineering Records Library.',
    secondaryActions: [
      { label: 'View Records Library', href: '/engineering/records' },
    ],
  },
  'EIOS-RECOVERY-002': {
    referenceCode: 'EIOS-RECOVERY-002',
    classification: 'guidance',
    category: 'historical_recovery',
    severity: 'medium',
    title: 'Insufficient Evidence for Recovery',
    summary: 'There is not enough evidence to safely reconstruct this engineering record.',
    explanation: 'Engineering Intelligence found references to this engineering object but could not safely reconstruct it from the available evidence. No record was fabricated.',
    cause: 'Critical fields are missing from the available evidence sources.',
    recommendedNextAction: 'Use "No Safe Historical Recovery" to record this as a governed historical exception.',
    secondaryActions: [
      { label: 'Mark as No Safe Recovery', description: 'Record as governed exception' },
      { label: 'Defer Review', description: 'Wait for additional evidence' },
    ],
  },

  // ── Product Owner Approval ──────────────────────────────────────────────────
  'EIOS-PO-001': {
    referenceCode: 'EIOS-PO-001',
    classification: 'success',
    category: 'product_owner_approval',
    severity: 'low',
    title: 'Product Owner Acceptance Recorded',
    summary: 'Product Owner Acceptance has been recorded for this Engineering Work Order.',
    explanation: 'The acceptance has been recorded in the Engineering Change Log and the work order has been transitioned to Closed.',
    recommendedNextAction: 'View the Engineering Change Log to see the acceptance event.',
    secondaryActions: [
      { label: 'View Change Log', href: '/engineering/change-log' },
    ],
  },
  'EIOS-PO-002': {
    referenceCode: 'EIOS-PO-002',
    classification: 'guidance',
    category: 'product_owner_approval',
    severity: 'medium',
    title: 'PO Review Required',
    summary: 'This item requires Product Owner review before it can proceed.',
    explanation: 'Engineering Intelligence has produced a recommendation that requires Product Owner review and decision before the workflow can continue.',
    recommendedNextAction: 'Open the PO Review panel to make a decision.',
    secondaryActions: [
      { label: 'Open PO Review', description: 'Review evidence and make a decision' },
    ],
  },

  // ── Platform ────────────────────────────────────────────────────────────────
  'EIOS-PLATFORM-001': {
    referenceCode: 'EIOS-PLATFORM-001',
    classification: 'failure',
    category: 'platform',
    severity: 'critical',
    title: 'Connection Error',
    summary: 'The platform could not connect to the database.',
    explanation: 'A network or database error occurred. Your changes may not have been saved. Please retry the operation.',
    cause: 'Database connection failed or timed out.',
    recommendedNextAction: 'Retry the operation. If the problem persists, contact support with the reference code.',
    secondaryActions: [
      { label: 'Retry', description: 'Attempt the operation again' },
    ],
  },
  'EIOS-PLATFORM-002': {
    referenceCode: 'EIOS-PLATFORM-002',
    classification: 'guidance',
    category: 'platform',
    severity: 'medium',
    title: 'Authentication Required',
    summary: 'You need to sign in to access this feature.',
    explanation: 'This feature requires an authenticated session. Please sign in to continue.',
    cause: 'No active authentication session found.',
    recommendedNextAction: 'Sign in to your account and try again.',
    secondaryActions: [
      { label: 'Sign In', href: '/login' },
    ],
  },

  // ── AI Workflow ──────────────────────────────────────────────────────────────
  'EIOS-AI-001': {
    referenceCode: 'EIOS-AI-001',
    classification: 'information',
    category: 'ai_workflow',
    severity: 'low',
    title: 'AI Analysis Complete',
    summary: 'Engineering Intelligence has completed its analysis.',
    explanation: 'The AI analysis has been completed and the results are available for review. All findings are grounded in runtime evidence.',
    recommendedNextAction: 'Review the AI analysis results.',
  },
  'EIOS-AI-002': {
    referenceCode: 'EIOS-AI-002',
    classification: 'failure',
    category: 'ai_workflow',
    severity: 'high',
    title: 'AI Analysis Failed',
    summary: 'The AI analysis could not be completed.',
    explanation: 'The AI provider returned an error or the request timed out. No fabricated results were generated.',
    cause: 'AI provider error, timeout, or rate limit.',
    recommendedNextAction: 'Retry the analysis. If the problem persists, check the AI provider configuration.',
    secondaryActions: [
      { label: 'Retry Analysis', description: 'Attempt the analysis again' },
      { label: 'Check AI Configuration', href: '/engineering/ai-providers' },
    ],
  },

  // ── General ──────────────────────────────────────────────────────────────────
  'EIOS-GENERAL-001': {
    referenceCode: 'EIOS-GENERAL-001',
    classification: 'success',
    category: 'general',
    severity: 'low',
    title: 'Operation Completed',
    summary: 'The operation completed successfully.',
    explanation: 'The requested operation has been completed.',
    recommendedNextAction: 'Continue with your next action.',
  },
  'EIOS-GENERAL-002': {
    referenceCode: 'EIOS-GENERAL-002',
    classification: 'failure',
    category: 'general',
    severity: 'medium',
    title: 'Operation Failed',
    summary: 'The operation could not be completed.',
    explanation: 'An unexpected error occurred during the operation. The error has been logged.',
    cause: 'An unhandled exception occurred.',
    recommendedNextAction: 'Retry the operation. If the problem persists, contact support with the reference code.',
    secondaryActions: [
      { label: 'Retry', description: 'Attempt the operation again' },
    ],
  },
  'EIOS-GENERAL-003': {
    referenceCode: 'EIOS-GENERAL-003',
    classification: 'information',
    category: 'general',
    severity: 'low',
    title: 'No Data Available',
    summary: 'There is no data to display.',
    explanation: 'No records were found for this view. This may be because no data has been created yet, or because filters are excluding all records.',
    recommendedNextAction: 'Create a new record or adjust your filters.',
  },
};

// ─── Registry Lookup ──────────────────────────────────────────────────────────

export function lookupResponse(referenceCode: string): RegistryEntry | null {
  return REGISTRY[referenceCode] ?? null;
}

export function listRegistryEntries(filter?: {
  category?: ResponseCategory;
  classification?: ResponseClassification;
  severity?: ResponseSeverity;
}): RegistryEntry[] {
  let entries = Object.values(REGISTRY);
  if (filter?.category) entries = entries.filter(e => e.category === filter.category);
  if (filter?.classification) entries = entries.filter(e => e.classification === filter.classification);
  if (filter?.severity) entries = entries.filter(e => e.severity === filter.severity);
  return entries.sort((a, b) => a.referenceCode.localeCompare(b.referenceCode));
}

// ─── Response Builder ─────────────────────────────────────────────────────────

export function buildGovernedResponse(
  referenceCode: string,
  overrides?: Partial<Omit<GovernedResponse, 'referenceCode' | 'classification' | 'timestamp'>> & {
    secondaryActions?: GovernedResponseAction[];
  },
): GovernedResponse {
  const entry = lookupResponse(referenceCode);
  if (!entry) {
    // Fallback: return a generic failure response if the code is not in the registry
    return {
      classification: 'failure',
      title: 'Unknown Response Code',
      summary: `The response code "${referenceCode}" is not registered.`,
      explanation: 'The application attempted to display a governed response but the reference code was not found in the registry. This may indicate a configuration issue.',
      cause: 'Unregistered response code.',
      recommendedNextAction: 'Contact support with the reference code.',
      referenceCode,
      severity: 'medium',
      category: 'general',
      timestamp: new Date().toISOString(),
    };
  }

  return {
    classification: entry.classification,
    title: overrides?.title ?? entry.title,
    summary: overrides?.summary ?? entry.summary,
    explanation: overrides?.explanation ?? entry.explanation,
    cause: overrides?.cause ?? entry.cause,
    recommendedNextAction: overrides?.recommendedNextAction ?? entry.recommendedNextAction,
    secondaryActions: overrides?.secondaryActions ?? entry.secondaryActions?.map(a => ({
      label: a.label,
      description: a.description,
      href: a.href,
    })),
    referenceCode: entry.referenceCode,
    severity: overrides?.severity ?? entry.severity,
    technicalContext: overrides?.technicalContext ?? entry.technicalContext,
    relatedEngineering: overrides?.relatedEngineering,
    category: entry.category,
    timestamp: new Date().toISOString(),
  };
}

// ─── Convenience Builders ─────────────────────────────────────────────────────

export function success(
  referenceCode: string,
  overrides?: Partial<Omit<GovernedResponse, 'classification' | 'referenceCode' | 'timestamp'>>,
): GovernedResponse {
  const resp = buildGovernedResponse(referenceCode, overrides);
  return { ...resp, classification: 'success' };
}

export function information(
  referenceCode: string,
  overrides?: Partial<Omit<GovernedResponse, 'classification' | 'referenceCode' | 'timestamp'>>,
): GovernedResponse {
  const resp = buildGovernedResponse(referenceCode, overrides);
  return { ...resp, classification: 'information' };
}

export function guidance(
  referenceCode: string,
  overrides?: Partial<Omit<GovernedResponse, 'classification' | 'referenceCode' | 'timestamp'>>,
): GovernedResponse {
  const resp = buildGovernedResponse(referenceCode, overrides);
  return { ...resp, classification: 'guidance' };
}

export function failure(
  referenceCode: string,
  overrides?: Partial<Omit<GovernedResponse, 'classification' | 'referenceCode' | 'timestamp'>>,
): GovernedResponse {
  const resp = buildGovernedResponse(referenceCode, overrides);
  return { ...resp, classification: 'failure' };
}

// ─── AI-Grounded Explanation Builder ──────────────────────────────────────────
//
// Engineering Intelligence may generate contextual explanations, but all
// responses must be grounded in governed runtime evidence. This builder
// ensures AI explanations are attached to a registered response and cannot
// fabricate causes or actions.

export function buildAIGroundedResponse(
  referenceCode: string,
  aiExplanation: string,
  evidence: { source: string; detail: string }[],
  overrides?: Partial<Omit<GovernedResponse, 'classification' | 'referenceCode' | 'timestamp'>>,
): GovernedResponse {
  const entry = lookupResponse(referenceCode);
  const base = buildGovernedResponse(referenceCode, overrides);

  // AI may explain, recommend, guide — but must not invent causes or actions
  const groundedExplanation = aiExplanation;
  const evidenceStr = evidence.map(e => `${e.source}: ${e.detail}`).join('; ');
  const techContext = `AI Explanation: ${aiExplanation}\nEvidence: ${evidenceStr}`;

  return {
    ...base,
    explanation: groundedExplanation,
    technicalContext: techContext,
    // Cause and recommendedNextAction always come from the registry entry, not AI
    cause: entry?.cause,
    recommendedNextAction: entry?.recommendedNextAction ?? base.recommendedNextAction,
  };
}
