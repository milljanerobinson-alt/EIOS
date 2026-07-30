/**
 * EWO-014.19A.4 — Governed Approval Note Generator
 * Reusable infrastructure for generating governed, context-aware default
 * Product Owner approval notes. Establishes the pattern for future approval
 * workflows across EIOS (Engineering Plan, Engineering Review, PO Acceptance,
 * Constitutional Approval, Administrative Approval).
 */

export type ApprovalContextType =
  | 'historical_recovery'
  | 'engineering_plan'
  | 'engineering_review'
  | 'product_owner_acceptance'
  | 'constitutional_approval'
  | 'administrative_approval';

export interface ApprovalNoteContext {
  type: ApprovalContextType;
  objectRef?: string | null;
  objectTitle?: string | null;
  engineeringConfidence?: string | null;
  evidenceSourceCount?: number | null;
  evidenceArtefactCount?: number | null;
  evidenceSourceCountLabel?: string | null;
  testingCompleted?: boolean | null;
  testingSummary?: string | null;
  additionalFacts?: string[];
}

export interface GeneratedApprovalNote {
  note: string;
  contextType: ApprovalContextType;
  contextual: boolean;
  factsUsed: string[];
}

const MINIMAL_DEFAULTS: Record<ApprovalContextType, string> = {
  historical_recovery: `Product Owner Acceptance granted.

Recovery evidence reviewed.
Approved for Engineering Ledger migration.`,
  engineering_plan: `Product Owner Acceptance granted.

Engineering plan reviewed.
Approved for execution.`,
  engineering_review: `Product Owner Acceptance granted.

Engineering review evidence reviewed.
Approved.`,
  product_owner_acceptance: `Product Owner Acceptance granted.

Engineering deliverable reviewed.
Approved.`,
  constitutional_approval: `Product Owner Acceptance granted.

Constitutional amendment reviewed.
Approved.`,
  administrative_approval: `Administrative approval granted.

Administrative evidence reviewed.
Approved.`,
};

function pushFact(facts: string[], label: string, value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  facts.push(`${label}: ${String(value)}.`);
  return true;
}

export function generateApprovalNote(ctx: ApprovalNoteContext): GeneratedApprovalNote {
  const minimal = MINIMAL_DEFAULTS[ctx.type] ?? MINIMAL_DEFAULTS.historical_recovery;
  const facts: string[] = [];
  const lines: string[] = [];

  // Header line is consistent across all context types
  lines.push(ctx.type === 'administrative_approval'
    ? 'Administrative approval granted.'
    : 'Product Owner Acceptance granted.');
  lines.push('');

  // Contextual body — only include facts that are actually available
  if (ctx.type === 'historical_recovery') {
    if (pushFact(facts, 'Recovery package reviewed', ctx.objectRef ?? ctx.objectTitle)) {
      lines.push(`${facts[facts.length - 1]}`);
    }
    if (pushFact(facts, 'Engineering confidence', ctx.engineeringConfidence)) {
      lines.push(facts[facts.length - 1]);
    }
    if (ctx.evidenceArtefactCount && ctx.evidenceSourceCount) {
      const fact = `Evidence reviewed from ${ctx.evidenceArtefactCount} artefact${ctx.evidenceArtefactCount === 1 ? '' : 's'} across ${ctx.evidenceSourceCount} source${ctx.evidenceSourceCount === 1 ? '' : 's'}.`;
      facts.push(fact);
      lines.push(fact);
    } else if (ctx.evidenceSourceCountLabel) {
      facts.push(ctx.evidenceSourceCountLabel);
      lines.push(ctx.evidenceSourceCountLabel);
    }
    if (ctx.testingCompleted && ctx.testingSummary) {
      facts.push(ctx.testingSummary);
      lines.push(ctx.testingSummary);
    }
    lines.push('Approved for Engineering Ledger migration.');
  } else {
    // Generic contextual body for future approval types
    if (pushFact(facts, 'Object reviewed', ctx.objectRef ?? ctx.objectTitle)) {
      lines.push(facts[facts.length - 1]);
    }
    if (ctx.engineeringConfidence && pushFact(facts, 'Engineering confidence', ctx.engineeringConfidence)) {
      lines.push(facts[facts.length - 1]);
    }
    for (const extra of ctx.additionalFacts ?? []) {
      facts.push(extra);
      lines.push(extra);
    }
    // Use type-specific closing line from the minimal default
    const minimalLines = minimal.split('\n').filter(l => l.trim() && !l.startsWith('Product Owner') && !l.startsWith('Administrative'));
    for (const ml of minimalLines) {
      lines.push(ml);
    }
  }

  const contextual = facts.length > 0;
  const note = contextual ? lines.join('\n') : minimal;

  return {
    note,
    contextType: ctx.type,
    contextual,
    factsUsed: facts,
  };
}

export function generateMinimalApprovalNote(type: ApprovalContextType): string {
  return MINIMAL_DEFAULTS[type] ?? MINIMAL_DEFAULTS.historical_recovery;
}
