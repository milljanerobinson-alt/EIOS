import type { ChecklistItem, HistoricalException } from './activeRC';

// ─── Definitions ──────────────────────────────────────────────────────────────

export interface ChecklistDef {
  id: string;
  label: string;
  required: boolean;
  automatic: boolean;
}

export const CHECKLIST_DEFS: ChecklistDef[] = [
  { id: 'bl',         label: 'Backlog Complete',             required: true,  automatic: true  },
  { id: 'build',      label: 'Build Successful',             required: true,  automatic: false },
  { id: 'ts',         label: 'TypeScript Clean',             required: false, automatic: false },
  { id: 'manual',     label: 'Manual Testing Completed',     required: true,  automatic: true  },
  { id: 'regression', label: 'Regression Testing Completed', required: false, automatic: true  },
  { id: 'edge',       label: 'Edge Cases Tested',            required: false, automatic: true  },
  { id: 'sql',        label: 'SQL Validation Completed',     required: false, automatic: true  },
  { id: 'docs',       label: 'Documentation Updated',        required: true,  automatic: true  },
  { id: 'adr',        label: 'ADR Linked (if required)',     required: false, automatic: false },
  { id: 'journal',    label: 'AI Journal Updated',           required: true,  automatic: true  },
  { id: 'report',     label: 'Completion Report Generated',  required: true,  automatic: true  },
  { id: 'prod',       label: 'Ready for Production',         required: true,  automatic: false },
];

export const MANUAL_ITEM_IDS = new Set(['build', 'ts', 'adr', 'prod']);

// ─── Evidence Types ────────────────────────────────────────────────────────────

export interface BacklogEvidence   { id: string; status: string }
export interface TestingEvidence   { id: string; result: string; regression_testing_notes?: string | null; edge_cases?: string | null; sql_used?: string | null }
export interface DocEvidence       { id: string; tags: string[] }
export interface JournalEvidence   { id: string }

export interface EvidenceData {
  backlogItems:   BacklogEvidence[];
  testingReports: TestingEvidence[];
  docs:           DocEvidence[];
  journalEntries: JournalEvidence[];
}

// ─── Computed Item ─────────────────────────────────────────────────────────────

export interface ComputedItem extends ChecklistItem {
  automatic: boolean;
  evidenceNote: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const COMPLETED_STATUSES = new Set(['verified', 'released', 'completed', 'archived']);
const PASSED_RESULTS     = new Set(['passed', 'passed_with_observations']);

function evalAutoItem(id: string, ev: EvidenceData): { checked: boolean; note: string } {
  switch (id) {
    case 'bl': {
      const total = ev.backlogItems.length;
      if (!total) return { checked: false, note: 'No backlog items linked' };
      const incomplete = ev.backlogItems.filter(i => !COMPLETED_STATUSES.has(i.status));
      if (incomplete.length) return { checked: false, note: `${incomplete.length} of ${total} item${total > 1 ? 's' : ''} not yet completed` };
      return { checked: true, note: `All ${total} item${total > 1 ? 's' : ''} completed` };
    }
    case 'manual': {
      if (!ev.testingReports.length) return { checked: false, note: 'No testing reports linked' };
      const passed = ev.testingReports.filter(t => PASSED_RESULTS.has(t.result));
      if (!passed.length) return { checked: false, note: `${ev.testingReports.length} report${ev.testingReports.length > 1 ? 's' : ''} — none passed` };
      return { checked: true, note: `${passed.length} report${passed.length > 1 ? 's' : ''} passed` };
    }
    case 'regression': {
      if (!ev.testingReports.length) return { checked: false, note: 'No testing reports linked' };
      const has = ev.testingReports.some(t => t.regression_testing_notes?.trim());
      return has
        ? { checked: true,  note: 'Regression notes recorded' }
        : { checked: false, note: 'No regression notes in any report' };
    }
    case 'edge': {
      if (!ev.testingReports.length) return { checked: false, note: 'No testing reports linked' };
      const has = ev.testingReports.some(t => t.edge_cases?.trim());
      return has
        ? { checked: true,  note: 'Edge cases documented' }
        : { checked: false, note: 'No edge case notes in any report' };
    }
    case 'sql': {
      if (!ev.testingReports.length) return { checked: false, note: 'No testing reports linked' };
      const has = ev.testingReports.some(t => t.sql_used?.trim());
      return has
        ? { checked: true,  note: 'SQL validation recorded' }
        : { checked: false, note: 'No SQL validation in any report' };
    }
    case 'docs': {
      const n = ev.docs.length;
      return n > 0
        ? { checked: true,  note: `${n} document${n > 1 ? 's' : ''} linked` }
        : { checked: false, note: 'No documentation linked' };
    }
    case 'journal': {
      const n = ev.journalEntries.length;
      return n > 0
        ? { checked: true,  note: `${n} session${n > 1 ? 's' : ''} linked` }
        : { checked: false, note: 'No AI journal sessions linked' };
    }
    case 'report': {
      const reports = ev.docs.filter(d => d.tags.includes('completion-report'));
      return reports.length > 0
        ? { checked: true,  note: `${reports.length} completion report${reports.length > 1 ? 's' : ''} linked` }
        : { checked: false, note: 'No completion report linked' };
    }
    default:
      return { checked: false, note: '' };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function extractManualStates(checklistItems: ChecklistItem[]): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const item of checklistItems) {
    if (MANUAL_ITEM_IDS.has(item.id)) result[item.id] = item.checked;
  }
  return result;
}

export function extractHistoricalExceptions(checklistItems: ChecklistItem[]): Record<string, HistoricalException> {
  const result: Record<string, HistoricalException> = {};
  for (const item of checklistItems) {
    if (item.historical_exception) result[item.id] = item.historical_exception;
  }
  return result;
}

export function computeChecklist(
  evidence: EvidenceData,
  manualStates: Record<string, boolean>,
  exceptions: Record<string, HistoricalException> = {},
): ComputedItem[] {
  return CHECKLIST_DEFS.map(def => {
    let item: ComputedItem;
    if (def.automatic) {
      const { checked, note } = evalAutoItem(def.id, evidence);
      item = { id: def.id, label: def.label, required: def.required, checked, automatic: true, evidenceNote: note };
    } else {
      const checked = manualStates[def.id] ?? false;
      item = {
        id: def.id, label: def.label, required: def.required, checked,
        automatic: false,
        evidenceNote: checked ? 'Manually confirmed' : 'Awaiting manual confirmation',
      };
    }
    if (exceptions[def.id]) item = { ...item, historical_exception: exceptions[def.id] };
    return item;
  });
}

// An item is resolved if it is checked (evidence present) OR has an approved historical exception.
export function validateForVerification(items: ComputedItem[]): { canVerify: boolean; missing: string[] } {
  const missing = items.filter(i => i.required && !i.checked && !i.historical_exception).map(i => i.label);
  return { canVerify: missing.length === 0, missing };
}

export function rcPct(items: ComputedItem[]): number {
  const required = items.filter(i => i.required);
  if (!required.length) return 0;
  const resolved = required.filter(i => i.checked || !!i.historical_exception).length;
  return Math.round(resolved / required.length * 100);
}
