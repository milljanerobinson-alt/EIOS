// EWO-016R — Conversation Context Router
// Deterministic routing that runs before AI prompt construction.
// Canonical Engineering references take priority over active product context.

export type CanonicalDomain =
  | "eios-engineering"
  | "active-product"
  | "project"
  | "platform-admin"
  | "candidate"
  | "general";

// EWO-031R.3: Provider policy inspection patterns — checked BEFORE reference detection.
const PROVIDER_POLICY_INSPECTION_PATTERNS = [
  /inspect\s+(?:the\s+)?(?:supervised\s+)?execution\s+engine\s+and\s+provider\s+selection\s+(?:for\s+)?(EWO-[\w.-]+?)\b/i,
  /inspect\s+(?:the\s+)?(?:supervised\s+)?execution\s+engine\s+and\s+provider\s+selection/i,
  /inspect\s+(?:the\s+)?provider\s+(?:policy|selection)\s+(?:for\s+)?(EWO-[\w.-]+?)\b/i,
  /inspect\s+(?:the\s+)?provider\s+(?:policy|selection)/i,
  /inspect\s+(?:the\s+)?(?:preferred|default|allowed)\s+providers?(?:\s+for\s+(EWO-[\w.-]+?))?\b/i,
  /inspect\s+(?:the\s+)?fallback\s+(?:provider\s+)?policy/i,
  /invoke\s+inspect_execution_provider_policy\s+(?:directly\s+)?(?:for\s+)?(EWO-[\w.-]+?)?\b/i,
  /invoke\s+inspect_execution_provider_policy\s+directly/i,
  /invoke\s+inspectexecutionproviderpolicy\s+(?:directly\s+)?(?:for\s+)?(EWO-[\w.-]+?)?\b/i,
  /invoke\s+inspectexecutionproviderpolicy\s+directly/i,
  /return\s+(?:the\s+)?(?:live\s+)?execution\s+provider\s+policy/i,
  /inspect\s+(?:the\s+)?execution\s+provider\s+policy/i,
];

// EWO-032: Execution handoff inspection patterns
const EXECUTION_HANDOFF_INSPECTION_PATTERNS = [
  /inspect\s+(?:the\s+)?execution\s+handoff\s+(?:for\s+)?(EWO-[\w.-]+?)?\b/i,
  /inspect\s+(?:the\s+)?execution\s+handoff/i,
  /invoke\s+inspect_execution_handoff\s+(?:directly\s+)?(?:for\s+)?(EWO-[\w.-]+?)?\b/i,
  /invoke\s+inspect_execution_handoff\s+directly/i,
  /invoke\s+inspectexecutionhandoff\s+(?:directly\s+)?(?:for\s+)?(EWO-[\w.-]+?)?\b/i,
  /invoke\s+inspectexecutionhandoff\s+directly/i,
  /return\s+(?:the\s+)?execution\s+handoff\s+(?:state|status)/i,
  /inspect\s+(?:the\s+)?handoff\s+(?:state|status)/i,
];

// EWO-032: Conversational approval patterns
const APPROVAL_PATTERNS = [
  /^\s*approved\s*$/i,
  /^\s*approve\s*$/i,
  /^\s*proceed\s*$/i,
  /^\s*proceed\s+with\s+execution\s*$/i,
  /^\s*approved\s*,\s*execute\s*$/i,
  /^\s*confirm\s+execution\s*$/i,
  /^\s*yes\s*,\s*execute\s+the\s+approved\s+plan\s*$/i,
  /\bapproved\s+for\s+execution\b/i,
  /\bproceed\s+with\s+the\s+approved\s+plan\b/i,
  /\bconfirm\s+the\s+approved\s+plan\b/i,
  /\byes\s*,?\s*proceed\b/i,
  /\bexecute\s+the\s+approved\s+plan\b/i,
];

// EWO-032: Cancellation/modification patterns (override approval)
const CANCELLATION_PATTERNS = [
  /\bdo\s+not\s+execute\b/i,
  /\bdon'?t\s+execute\b/i,
  /\bcancel\b/i,
  /\bstop\b/i,
  /\bhold\s+execution\b/i,
  /\babort\b/i,
  /\bdo\s+not\s+proceed\b/i,
  /\bmodify\s+(?:the\s+)?plan\b/i,
  /\bchange\s+(?:the\s+)?requirements?\b/i,
  /\bchange\s+(?:the\s+)?plan\b/i,
  /\bupdate\s+(?:the\s+)?plan\b/i,
  /\brevise\s+(?:the\s+)?plan\b/i,
  /\bhold\s+(?:execution\s+)?until\b/i,
  /\bwait\s+(?:until|before)\b/i,
  /approved\s*,?\s*but\s+do\s+not\s+execute\b/i,
  /approved\s*,?\s*but\s+(?:do\s+not\s+)?(?:execute|run|proceed)\s+(?:yet|now)\b/i,
  /proceed\s+(?:after|once)\s+(?:changing|updating|modifying)\b/i,
  /yes\s*,?\s*cancel\s+(?:it|this)\b/i,
];

// EWO-031R.3: Negation-aware execution suppression patterns.
const NEGATED_EXECUTION_PATTERNS = [
  /\bdo\s+not\s+execute\b/i,
  /\bdon'?t\s+execute\b/i,
  /\bdo\s+not\s+run\b/i,
  /\bdo\s+not\s+start\b/i,
  /\bdo\s+not\s+dispatch\b/i,
  /\bdo\s+not\s+perform\s+lifecycle\s+changes?\b/i,
  /\binspection\s+only\b/i,
  /\bread-?only\b/i,
  /\bdo\s+not\s+validate\b/i,
  /\bdo\s+not\s+advance\b/i,
];

export type EngineeringRefType =
  | "EWO" | "EXEC" | "ER" | "REC" | "IDEA" | "INTENT" | "PLAN"
  | "ES" | "AMD" | "VS" | "AUD" | "RC" | "ECR" | "TP" | "EIG";

export interface DetectedRef {
  raw: string;
  type: EngineeringRefType;
  canonical: string;
  ref: string;
}

// Reference families that route to EIOS Engineering (Requirement 2)
const REFERENCE_PATTERNS: Array<{ type: EngineeringRefType; regex: RegExp }> = [
  { type: "EWO", regex: /\bEWO-(\d+(?:\.\d+[A-Z]?\.?\d*)?)\b/gi },
  { type: "EXEC", regex: /\bEXEC-(\d+)\b/gi },
  { type: "ER", regex: /\bER-(\d+)\b/gi },
  { type: "REC", regex: /\bREC-(\d+)\b/gi },
  { type: "IDEA", regex: /\bIDEA-(\d+)\b/gi },
  { type: "INTENT", regex: /\bINTENT-(\d+)\b/gi },
  { type: "PLAN", regex: /\bPLAN-(\d+)\b/gi },
  { type: "ES", regex: /\bES-([A-Z0-9][A-Z0-9-]*\d+)\b/gi },
  { type: "AMD", regex: /\bAMD-(\d+)\b/gi },
  { type: "VS", regex: /\bVS-(\d{8}-\d+)\b/gi },
  { type: "AUD", regex: /\bAUD-(\d+)\b/gi },
  { type: "RC", regex: /\bRC-(\d+)\b/gi },
  { type: "ECR", regex: /\bECR-(\d+)\b/gi },
  { type: "TP", regex: /\bTP-(\d+)\b/gi },
  { type: "EIG", regex: /\bEIG-(\d+)\b/gi },
];

export function detectReferences(text: string): DetectedRef[] {
  const results: DetectedRef[] = [];
  const seen = new Set<string>();
  for (const { type, regex } of REFERENCE_PATTERNS) {
    const pattern = new RegExp(regex.source, regex.flags);
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[0];
      const refValue = match[1];
      const prefix = type === "ES" ? "ES" : type;
      const canonical = `${prefix}-${refValue}`;
      const key = `${type}:${canonical}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ raw, type, canonical, ref: refValue });
    }
  }
  return results;
}

export function detectIntent(text: string, refs: DetectedRef[]): string {
  // Relationship Discovery (EWO-016R.X) — must be checked BEFORE impact/feature
  // queries to avoid cross-routing to Engineering Impact Analysis.
  if (/\b(what\s+engineering\s+records\s+are\s+related\s+to|show\s+everything\s+related\s+to|show\s+linked\s+engineering|what\s+artefacts\s+belong\s+to|show\s+engineering\s+traceability|show\s+engineering\s+history|what\s+is\s+related\s+to|related\s+engineering\s+records|engineering\s+relationships?)\b/i.test(text)) {
    return "relationship_discovery";
  }
  if (/\b(execute\s+(?:it|this|that)?|execute\s+(?:EWO-\S+))\b/i.test(text)) return "execute";
  if (/\bprepare\s+/i.test(text)) return "prepare";
  if (/\bbegin\s+/i.test(text)) return "begin";
  if (/\bshow\s+(?:me\s+)?(?:its\s+|the\s+)?verification\b/i.test(text)) return "show_verification";
  if (/\bshow\s+(?:me\s+)?(?:its\s+|the\s+)?plan\b/i.test(text)) return "show_plan";
  if (/\bshow\s+(?:me\s+)?(?:the\s+)?completion\s+report\b/i.test(text)) return "show_completion";
  if (/\bwhat\s+is\s+/i.test(text) && refs.length > 0) return "summarise";
  if (/\btell\s+me\s+about\s+/i.test(text)) return "summarise";
  if (/\bcompare\s+/i.test(text) && refs.length >= 2) return "compare";
  if (/\breview\s+/i.test(text)) return "review";
  if (refs.length > 0) return "summarise";
  return "general";
}

// Conversation Context Router (Requirement 1, 3)
// Precedence order:
//   1. Explicit canonical Engineering reference
//   2. Explicit Engineering action intent
//   3. Explicit platform or project object reference
//   4. Conversation focus state (handled by caller)
//   5. Active workspace context
//   6. General semantic classification
//   7. General AI fallback
export function routeConversation(
  text: string,
  refs: DetectedRef[],
  activeWorkspace: string | null,
): { domain: CanonicalDomain; rule: string } {
  // EWO-031R.3: Provider policy inspection — HIGHEST PRECEDENCE.
  // Must be checked BEFORE reference detection to avoid routing to eios-engineering
  // and letting the AI model misclassify as execution/validation.
  if (PROVIDER_POLICY_INSPECTION_PATTERNS.some(p => p.test(text))) {
    return { domain: "eios-engineering", rule: "provider-policy-inspection" };
  }
  // EWO-032: Execution handoff inspection — high precedence, read-only
  if (EXECUTION_HANDOFF_INSPECTION_PATTERNS.some(p => p.test(text))) {
    return { domain: "eios-engineering", rule: "execution-handoff-inspection" };
  }
  // EWO-032: Cancellation/modification overrides approval
  if (CANCELLATION_PATTERNS.some(p => p.test(text))) {
    return { domain: "eios-engineering", rule: "cancellation-detected" };
  }
  // EWO-032: Conversational approval — route to handoff
  if (APPROVAL_PATTERNS.some(p => p.test(text))) {
    return { domain: "eios-engineering", rule: "approval-handoff" };
  }
  // EWO-031R.3: Negation-aware — if request says "do not execute", it's an inspection.
  if (NEGATED_EXECUTION_PATTERNS.some(p => p.test(text)) && /\b(inspect|show|return|report|provider)\b/i.test(text)) {
    return { domain: "eios-engineering", rule: "negation-suppressed-inspection" };
  }
  // Precedence 1: Explicit canonical Engineering reference
  if (refs.length > 0) {
    return { domain: "eios-engineering", rule: "explicit-canonical-engineering-reference" };
  }
  // Precedence 2: Explicit Engineering action intent
  if (/\b(execute|prepare|begin|verification|governance|engineering standard|constitution|amendment|traceability|engineering history|engineering records|engineering relationships?)\b/i.test(text)) {
    return { domain: "eios-engineering", rule: "explicit-engineering-action-intent" };
  }
  // Precedence 2a: Execution platform queries — route to EIOS Engineering
  if (/\b(engineering execution|execution platform|how do i (start|begin) (an? )?execution|how is (an? )?ewo executed|execution entry point|resume (an? )?execution session|why can'?t i execute)\b/i.test(text)) {
    return { domain: "eios-engineering", rule: "execution-platform-query" };
  }
  // Precedence 3: Platform/project object references
  if (/\b(RC-\d+|phase|milestone|backlog|roadmap|release candidate)\b/i.test(text)) {
    return { domain: "project", rule: "explicit-project-object-reference" };
  }
  // Precedence 5: Active workspace context (general product questions)
  if (activeWorkspace && /\b(feature|assessment|lln|digital|billing|stripe|axcelerate|compliance|asqa)\b/i.test(text)) {
    return { domain: "active-product", rule: "active-workspace-product-context" };
  }
  // Precedence 6: General semantic classification
  if (/\b(candidate|learner|student|enrolment)\b/i.test(text)) {
    return { domain: "candidate", rule: "candidate-semantic" };
  }
  if (/\b(admin|settings|user|role|permission)\b/i.test(text)) {
    return { domain: "platform-admin", rule: "platform-admin-semantic" };
  }
  // Precedence 7: General fallback
  return { domain: "general", rule: "general-fallback" };
}

// ─── Execution Platform Knowledge (EWO-017R.2 Req 12-13) ───────────────────────
// Provides grounded, platform-specific answers about the Engineering Execution
// Platform. ATD uses this instead of generic engineering process guidance.
// All answers are derived from the canonical executionEligibilityResolver
// and match the actual deployed schema.

export interface ExecutionPlatformAnswer {
  query: string;
  answer: string;
  entryPoint: string;
  eligibility: string[];
  workflow: string[];
  failureStates: string[];
  grounded: boolean;
}

export function getExecutionPlatformGuidance(query: string): ExecutionPlatformAnswer | null {
  const q = query.toLowerCase().trim();

  // How do I start an Engineering Execution?
  if (/\b(how do i|how to|where do i)\s+.*(start|begin|launch|initiate).*execution\b/i.test(q) ||
      /\b(how do i|how to)\s+.*execute\s+(an?\s+)?ewo\b/i.test(q)) {
    return {
      query,
      answer: 'To start an Engineering Execution, open the Engineering Work Order detail page in the Engineering Command Centre. When the EWO is eligible (Engineering Package approved, Engineering Review approved, Product Owner execution approval recorded, valid execution target, not already executed, not closed, no active execution session), a "Begin Engineering Execution" button appears. Clicking it evaluates canonical prerequisites via the executionEligibilityResolver, creates an execution session, and invokes the executionOrchestrator pipeline.',
      entryPoint: 'Engineering Work Orders page → EWO detail → "Begin Engineering Execution" button',
      eligibility: [
        'Engineering Package approved (ewo_engineering_packages.package_status = "approved")',
        'Engineering Review approved (ecc_engineering_reviews.status = "approved", linked via metadata->>ewo_ref)',
        'Product Owner execution approval (ewo_execution_approvals.decision = "approved") — distinct from post-verification PO acceptance',
        'Valid execution target (execution_targets.is_active = true, valid repository and branches)',
        'Engineering not already executed (implementation_status not "complete")',
        'EWO not closed (status not "closed" or "archived")',
        'No active execution session for this EWO',
      ],
      workflow: [
        'Open EWO detail in Engineering Command Centre',
        'Click "Begin Engineering Execution"',
        'evaluateExecutionEligibility() checks all canonical prerequisites',
        'createExecution() creates the execution record',
        'executeWorkOrder() runs the 10-stage pipeline',
        'Execution Workspace opens with live progress',
        'Verification gates run automatically',
        'Completion report is generated',
        'Product Owner testing and acceptance',
      ],
      failureStates: [
        'Missing Engineering Package (package_status not "approved")',
        'Missing Engineering Review (no approved review linked to this EWO)',
        'Missing Product Owner execution approval (no ewo_execution_approvals row)',
        'Missing execution target (no active target with valid repository)',
        'Already executed (implementation_status = "complete")',
        'EWO closed (status = "closed" or "archived")',
        'Active execution session exists (duplicate prevention)',
      ],
      grounded: true,
    };
  }

  // How is an Engineering Work Order executed?
  if (/\bhow (is|are)\s+.*(ewo|engineering work order).*executed\b/i.test(q) ||
      /\bwhat is the execution (process|pipeline|workflow)\b/i.test(q)) {
    return {
      query,
      answer: 'Engineering Work Orders are executed through the executionOrchestrator, a governed 10-stage pipeline: load context, load EWO, load plan, load related engineering, determine affected components, prepare implementation package, invoke implementation engine, receive implementation, validate implementation, and record evidence. The Product Owner initiates execution from the EWO detail page via the "Begin Engineering Execution" button. Eligibility is determined by the canonical executionEligibilityResolver which checks ewo_engineering_packages, ecc_engineering_reviews, ewo_execution_approvals, execution_targets, and engineering_executions.',
      entryPoint: 'EWO detail page → "Begin Engineering Execution" button',
      eligibility: [
        'Engineering Package approved (ewo_engineering_packages)',
        'Engineering Review approved (ecc_engineering_reviews)',
        'Product Owner execution approval (ewo_execution_approvals)',
        'Valid execution target (execution_targets)',
      ],
      workflow: [
        'evaluateExecutionEligibility() checks all canonical prerequisites',
        'createExecution() creates the execution record',
        'executeWorkOrder() runs the 10-stage pipeline',
        'Live progress visible in Execution Workspace',
        'Automated verification gates run',
        'Completion report generated',
      ],
      failureStates: [
        'Missing prerequisites (package, review, or PO execution approval)',
        'Duplicate execution session',
        'Missing or invalid execution target',
        'EWO already executed or closed',
      ],
      grounded: true,
    };
  }

  // Where is the execution entry point?
  if (/\b(where is|what is).*execution entry point\b/i.test(q) ||
      /\bwhere do i (start|begin).*execution\b/i.test(q)) {
    return {
      query,
      answer: 'The execution entry point is the "Begin Engineering Execution" button on the Engineering Work Order detail page in the Engineering Command Centre. Navigate to Engineering → Work Orders, select the EWO, and the button appears when eligibility is met. The canonical eligibility resolver (evaluateExecutionEligibility) determines whether the button is shown.',
      entryPoint: 'Engineering Command Centre → Work Orders → EWO detail → "Begin Engineering Execution"',
      eligibility: [
        'Engineering Package approved',
        'Engineering Review approved',
        'Product Owner execution approval recorded',
        'Valid execution target available',
        'Not already executed',
        'Not closed',
        'No active session',
      ],
      workflow: [],
      failureStates: [],
      grounded: true,
    };
  }

  // How do I resume an execution session?
  if (/\bhow do i (resume|continue|restart).*execution\b/i.test(q)) {
    return {
      query,
      answer: 'If an active execution session exists for an EWO, the UI shows a "View Execution" button instead of "Begin Engineering Execution". Click it to navigate to the Execution Workspace using the canonical navigateToExecutionWorkspace function. The canonical resolver identifies active sessions via engineering_executions with implementation_status in queued, running, awaiting_review, awaiting_po, awaiting_po_testing, awaiting_completion, prepared, submitted, completion_received, engineering_review, automated_verification, or po_accepted. View Execution only navigates — it never creates a new execution or session.',
      entryPoint: 'EWO detail page → "View Execution" (shown when active session exists)',
      eligibility: [],
      workflow: [
        'Open EWO detail — "View Execution" button appears',
        'Click to navigate to Execution Workspace',
        'Use recovery actions: Resume, Retry, Abort, or Rollback',
      ],
      failureStates: [
        'Session not found',
        'Session already completed',
      ],
      grounded: true,
    };
  }

  // Why can't I execute this EWO?
  if (/\bwhy can'?t i execute\b/i.test(q) || /\bwhy can'?t i (start|begin).*execution\b/i.test(q)) {
    return {
      query,
      answer: 'The "Begin Engineering Execution" button only appears when the canonical eligibility resolver (evaluateExecutionEligibility) returns eligible = true. The resolver checks: (1) Engineering Package approved in ewo_engineering_packages, (2) Engineering Review approved in ecc_engineering_reviews linked via metadata, (3) Product Owner execution approval in ewo_execution_approvals, (4) valid execution target in execution_targets, (5) not already executed, (6) not closed, (7) no active session. The EWO detail page shows specific evidence-backed blocking reasons when the button is not available.',
      entryPoint: 'EWO detail page shows evidence-backed blocking reasons when not eligible',
      eligibility: [
        'Engineering Package must be approved (ewo_engineering_packages.package_status = "approved")',
        'Engineering Review must be approved (ecc_engineering_reviews.status = "approved")',
        'Product Owner execution approval must be recorded (ewo_execution_approvals.decision = "approved")',
        'Valid execution target must exist (execution_targets.is_active = true)',
        'EWO must not be already executed',
        'EWO must not be closed',
        'No active execution session',
      ],
      workflow: [],
      failureStates: [
        'Missing Engineering Package',
        'Missing Engineering Review',
        'Missing Product Owner execution approval',
        'Missing execution target',
        'Already executed',
        'EWO closed',
        'Active session exists',
      ],
      grounded: true,
    };
  }

  // Which EWOs are currently eligible?
  if (/\bwhich.*(ewo|work order).*eligible\b/i.test(q) || /\bwhat.*(ewo|work order).*can i execute\b/i.test(q)) {
    return {
      query,
      answer: 'The canonical eligibility resolver (evaluateExecutionEligibility) determines which EWOs are eligible. It checks all EWOs against: ewo_engineering_packages (package_status = "approved"), ecc_engineering_reviews (status = "approved", linked via metadata), ewo_execution_approvals (decision = "approved"), execution_targets (is_active = true), and engineering_executions (no active session). A governed test candidate (EWO-TEST-001) is available for Product Owner execution testing.',
      entryPoint: 'Use the eligibility resolver or check EWO-TEST-001 for testing',
      eligibility: [
        'All canonical prerequisites must be satisfied',
        'EWO-TEST-001 is a governed test candidate with all prerequisites met',
      ],
      workflow: [],
      failureStates: [],
      grounded: true,
    };
  }

  // Which work order should I use for testing?
  if (/\bwhich.*(work order|ewo).*test\b/i.test(q) || /\b(test|testing).*(work order|ewo|candidate)\b/i.test(q)) {
    return {
      query,
      answer: 'EWO-TEST-001 is the governed test execution candidate. It has all canonical prerequisites satisfied: an approved engineering package, an approved engineering review (ERC-TEST-001), Product Owner execution approval (POEA-TEST-001), and a valid test execution target (ET-TEST). It is clearly labelled as a non-production test EWO and can be archived after testing.',
      entryPoint: 'EWO-TEST-001 in the Engineering Work Orders list',
      eligibility: [
        'Engineering Package approved',
        'Engineering Review approved (ERC-TEST-001)',
        'PO execution approval recorded (POEA-TEST-001)',
        'Execution target ET-TEST configured and active',
        'No prior implementation',
        'Not closed',
      ],
      workflow: [
        'Open EWO-TEST-001 in the Work Orders page',
        'Click "Begin Engineering Execution"',
        'Validate the execution pipeline completes',
        'Archive EWO-TEST-001 after testing',
      ],
      failureStates: [],
      grounded: true,
    };
  }

  // Has this EWO already been implemented?
  if (/\b(has|have).*(this|that|the).*(ewo|work order).*(been|already).*(implemented|executed)\b/i.test(q) ||
      /\b(is|was).*(this|that|the).*(ewo|work order).*(already|been).*(implemented|executed)\b/i.test(q)) {
    return {
      query,
      answer: 'The canonical eligibility resolver checks implementation_status in engineering_work_orders. If it is "complete" or "Completed", the EWO has already been implemented. The resolver also distinguishes between: (1) completed with a canonical execution session, (2) historical implementation without a session, and (3) active session in progress. The UI displays the appropriate state: "Execution completed", "Implementation Already Completed — no canonical execution session", or "Active execution session".',
      entryPoint: 'Check the EWO detail page for the governed execution state',
      eligibility: [],
      workflow: [],
      failureStates: [],
      grounded: true,
    };
  }

  // Is there an active execution session?
  if (/\b(is there|has).*(an?|active).*(execution|session)\b/i.test(q)) {
    return {
      query,
      answer: 'The canonical eligibility resolver checks engineering_executions for rows with implementation_status in queued, running, awaiting_review, awaiting_po, awaiting_po_testing, awaiting_completion, prepared, submitted, completion_received, engineering_review, automated_verification, or po_accepted. If found, the UI shows "View Execution" with the execution reference and status. Duplicate execution launch is prevented — the "Begin Engineering Execution" button is replaced by "View Execution" when an active session exists. View Execution uses navigateToExecutionWorkspace which calls buildExecutionWorkspaceRoute to generate the canonical route #/engineering/engineering-execution/<execution-ref>.',
      entryPoint: 'Check the EWO detail page for active session status',
      eligibility: [],
      workflow: [],
      failureStates: [],
      grounded: true,
    };
  }

  // What evidence proves the Product Owner approved execution?
  if (/\bwhat evidence.*(product owner|po).*approv/i.test(q) || /\bwhat.*(proves|evidence).*(po|product owner).*execution\b/i.test(q)) {
    return {
      query,
      answer: 'Product Owner approval to begin engineering execution is recorded in the ewo_execution_approvals table with decision = "approved". This is the canonical evidence source. It is DISTINCT from post-verification PO acceptance (engineering_work_orders.po_accepted_at) and closure acceptance. The eligibility resolver queries ewo_execution_approvals and returns the approval_ref, product_owner, and approval_statement as evidence.',
      entryPoint: 'ewo_execution_approvals table is the canonical PO execution approval source',
      eligibility: [],
      workflow: [],
      failureStates: [
        'No ewo_execution_approvals row with decision = "approved"',
        'PO acceptance (po_accepted_at) is NOT execution approval',
        'Closure acceptance is NOT execution approval',
      ],
      grounded: true,
    };
  }

  return null;
}

