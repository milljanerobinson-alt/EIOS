// EWO-014.13 + EWO-014.13R + EWO-014.17R.2 + EWO-014.19A.7SR.1
// Canonical Engineering Navigation Service
//
// Single source of truth for engineering object URLs, route parsing, navigation
// history, breadcrumbs, related objects, and canonical evidence navigation.
// All engineering applications reuse this service — no routing logic in pages.

import { supabase } from './supabase';
import { buildRoute, navigate, getRouteByKey } from './routeRegistry';
import { classifyReference } from './engineeringIntegrityService';

// ─── Types ─────────────────────────────────────────────────────────────────

export type EngineeringObjectType =
  | 'engineering_idea'
  | 'engineering_intent'
  | 'engineering_analysis'
  | 'engineering_plan'
  | 'engineering_work_order'
  | 'engineering_validation'
  | 'completion_report'
  | 'engineering_record'
  | 'engineering_knowledge'
  | 'constitutional_amendment'
  | 'engineering_standard'
  | 'historical_recovery'
  | 'runtime_diagnostic';

export interface BreadcrumbItem {
  object_ref: string;
  object_type: EngineeringObjectType;
  title: string;
  canonical_url: string;
  lifecycle_state?: string;
}

export interface RelatedObject {
  object_ref: string;
  object_type: EngineeringObjectType;
  title: string;
  canonical_url: string;
  lifecycle_state?: string;
  relationship: string;
}

export interface ParsedEngineeringRoute {
  section: string;
  objectRef: string | null;
  subPath: string | null;
}

export interface NavHistoryEntry {
  object_ref: string;
  object_type: string;
  title: string;
  canonical_url: string;
  visited_at: string;
}

export interface NavContext {
  object_ref: string;
  object_type: string;
  section: string;
  visited_at: string;
}

// ─── Object Type → Section Mapping ─────────────────────────────────────────

const OBJECT_TYPE_SECTION: Record<EngineeringObjectType, string> = {
  engineering_idea: 'engineering-ideas',
  engineering_intent: 'engineering-ideas',
  engineering_analysis: 'engineering-ideas',
  engineering_plan: 'engineering-planning',
  engineering_work_order: 'work-orders',
  engineering_validation: 'verification-dashboard',
  completion_report: 'work-orders',
  engineering_record: 'records-library',
  engineering_knowledge: 'records-library',
  constitutional_amendment: 'constitution',
  engineering_standard: 'engineering-standards',
  historical_recovery: 'historical-recovery',
  runtime_diagnostic: 'execution-dashboard',
};

export const OBJECT_TYPE_LABELS: Record<EngineeringObjectType, string> = {
  engineering_idea: 'Engineering Idea',
  engineering_intent: 'Engineering Intent',
  engineering_analysis: 'Engineering Analysis',
  engineering_plan: 'Engineering Plan',
  engineering_work_order: 'Engineering Work Order',
  engineering_validation: 'Engineering Validation',
  completion_report: 'Completion Report',
  engineering_record: 'Engineering Record',
  engineering_knowledge: 'Engineering Knowledge',
  constitutional_amendment: 'Constitutional Amendment',
  engineering_standard: 'Engineering Standard',
  historical_recovery: 'Historical Recovery Package',
  runtime_diagnostic: 'Runtime Diagnostic Envelope',
};

export const OBJECT_TYPE_ICONS: Record<EngineeringObjectType, string> = {
  engineering_idea: 'Lightbulb',
  engineering_intent: 'Target',
  engineering_analysis: 'Search',
  engineering_plan: 'ClipboardList',
  engineering_work_order: 'ClipboardEdit',
  engineering_validation: 'CheckCircle2',
  completion_report: 'FileText',
  engineering_record: 'Archive',
  engineering_knowledge: 'BookOpen',
  constitutional_amendment: 'Scale',
  engineering_standard: 'BookMarked',
  historical_recovery: 'History',
  runtime_diagnostic: 'Activity',
};

export const RELATIONSHIP_LABELS: Record<string, string> = {
  creates: 'Creates',
  produces: 'Produces',
  archives: 'Archives',
  validates: 'Validates',
  supersedes: 'Supersedes',
  depends_on: 'Depends On',
  relates_to: 'Relates To',
  implements: 'Implements',
  references: 'References',
};

// ─── Slug Helpers ────────────────────────────────────────────────────────────

function slugify(ref: string): string {
  return ref
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isUuid(ref: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
}

function deslugify(ref: string): string {
  if (isUuid(ref)) return ref;
  return ref.toUpperCase().replace(/_/g, '-').replace(/[^A-Z0-9-]/g, '');
}

// ─── Canonical URL Generation ─────────────────────────────────────────────────

export function generateCanonicalUrl(objectType: EngineeringObjectType, ref: string): string {
  const section = OBJECT_TYPE_SECTION[objectType] ?? 'mission-control';
  return `#/engineering/${section}/${slugify(ref)}`;
}

export function buildEngineeringUrl(section: string, objectRef?: string, subPath?: string): string {
  let url = `#/engineering/${section}`;
  if (objectRef) {
    url += `/${slugify(objectRef)}`;
  }
  if (subPath) {
    url += `/${subPath}`;
  }
  return url;
}

// ─── Route Parsing ──────────────────────────────────────────────────────────────

export function parseEngineeringRoute(hash: string): ParsedEngineeringRoute {
  const h = hash.replace(/^#\/?/, '').split('?')[0];
  if (!h || h === 'engineering') {
    return { section: 'mission-control', objectRef: null, subPath: null };
  }

  const parts = h.split('/');
  if (parts[0] !== 'engineering') {
    return { section: 'mission-control', objectRef: null, subPath: null };
  }

  const section = parts[1] ?? 'mission-control';
  const rawRef = parts[2] ?? null;
  const objectRef = rawRef ? deslugify(rawRef) : null;
  const subPath = parts.slice(3).join('/') || null;

  return { section, objectRef, subPath };
}

// ─── Navigation History (localStorage) ────────────────────────────────────────

const HISTORY_KEY = 'eios_nav_history';
const CONTEXT_KEY = 'eios_nav_context';
const MAX_HISTORY = 20;

function getStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage !== 'undefined' ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

export function pushNavHistory(entry: Omit<NavHistoryEntry, 'visited_at'>): void {
  const storage = getStorage();
  if (!storage) return;

  const history = getNavHistory();
  const filtered = history.filter(h => h.object_ref !== entry.object_ref);
  filtered.unshift({ ...entry, visited_at: new Date().toISOString() });

  const capped = filtered.slice(0, MAX_HISTORY);
  storage.setItem(HISTORY_KEY, JSON.stringify(capped));
}

export function getNavHistory(): NavHistoryEntry[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    return JSON.parse(storage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function clearNavHistory(): void {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(HISTORY_KEY);
}

export function saveNavContext(ctx: Omit<NavContext, 'visited_at'>): void {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(CONTEXT_KEY, JSON.stringify({ ...ctx, visited_at: new Date().toISOString() }));
}

export function getNavContext(): NavContext | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(CONTEXT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ─── Lifecycle Style ───────────────────────────────────────────────────────────

export function getLifecycleStyle(state?: string): { bg: string; text: string; dot: string; label: string } {
  switch (state) {
    case 'closed':
    case 'completed':
    case 'accepted':
      return { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Closed' };
    case 'in_progress':
    case 'active':
      return { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', label: 'In Progress' };
    case 'awaiting_acceptance':
    case 'awaiting-acceptance':
      return { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Awaiting PO' };
    case 'planned':
      return { bg: 'bg-slate-100', text: 'text-slate-600', dot: 'bg-slate-400', label: 'Planned' };
    case 'failed':
    case 'rejected':
      return { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', label: 'Failed' };
    default:
      return { bg: 'bg-slate-50', text: 'text-slate-500', dot: 'bg-slate-300', label: 'Draft' };
  }
}

// ─── Breadcrumbs ────────────────────────────────────────────────────────────────

export async function getBreadcrumbs(objectRef: string): Promise<BreadcrumbItem[]> {
  try {
    const { data, error } = await supabase
      .from('engineering_object_registry')
      .select('object_ref, object_type, title, canonical_url, lifecycle_state, parent_ref')
      .eq('object_ref', objectRef)
      .maybeSingle();

    if (error || !data) return [];

    const chain: BreadcrumbItem[] = [{
      object_ref: data.object_ref,
      object_type: data.object_type as EngineeringObjectType,
      title: data.title ?? data.object_ref,
      canonical_url: data.canonical_url ?? generateCanonicalUrl(data.object_type, data.object_ref),
      lifecycle_state: data.lifecycle_state,
    }];

    let parentRef = data.parent_ref;
    let depth = 0;
    while (parentRef && depth < 10) {
      const { data: parent } = await supabase
        .from('engineering_object_registry')
        .select('object_ref, object_type, title, canonical_url, lifecycle_state, parent_ref')
        .eq('object_ref', parentRef)
        .maybeSingle();

      if (!parent) break;

      chain.unshift({
        object_ref: parent.object_ref,
        object_type: parent.object_type as EngineeringObjectType,
        title: parent.title ?? parent.object_ref,
        canonical_url: parent.canonical_url ?? generateCanonicalUrl(parent.object_type, parent.object_ref),
        lifecycle_state: parent.lifecycle_state,
      });

      parentRef = parent.parent_ref;
      depth++;
    }

    return chain;
  } catch {
    return [];
  }
}

// ─── Related Objects ───────────────────────────────────────────────────────────

export async function getRelatedObjects(objectRef: string): Promise<{ parents: RelatedObject[]; children: RelatedObject[]; related: RelatedObject[] }> {
  try {
    const { data, error } = await supabase
      .from('engineering_object_relationships')
      .select(`
        source_ref, target_ref, relationship_type,
        source:engineering_object_registry!source_ref(object_ref, object_type, title, canonical_url, lifecycle_state),
        target:engineering_object_registry!target_ref(object_ref, object_type, title, canonical_url, lifecycle_state)
      `)
      .or(`source_ref.eq.${objectRef},target_ref.eq.${objectRef}`);

    if (error || !data) return { parents: [], children: [], related: [] };

    const parents: RelatedObject[] = [];
    const children: RelatedObject[] = [];
    const related: RelatedObject[] = [];

    for (const rel of data) {
      const isSource = rel.source_ref === objectRef;
      const objRaw = isSource ? rel.target : rel.source;
      if (!objRaw) continue;
      const obj = Array.isArray(objRaw) ? objRaw[0] : objRaw;
      if (!obj) continue;

      const item: RelatedObject = {
        object_ref: obj.object_ref,
        object_type: obj.object_type as EngineeringObjectType,
        title: obj.title ?? obj.object_ref,
        canonical_url: obj.canonical_url ?? generateCanonicalUrl(obj.object_type, obj.object_ref),
        lifecycle_state: obj.lifecycle_state,
        relationship: rel.relationship_type,
      };

      if (rel.relationship_type === 'creates' || rel.relationship_type === 'produces') {
        if (isSource) children.push(item); else parents.push(item);
      } else if (rel.relationship_type === 'supersedes') {
        related.push(item);
      } else {
        related.push(item);
      }
    }

    return { parents, children, related };
  } catch {
    return { parents: [], children: [], related: [] };
  }
}

// ─── Execution Workspace Routes ─────────────────────────────────────────────────

export function buildExecutionWorkspaceRoute(ref: string): string {
  return `#/engineering/engineering-execution/${slugify(ref)}`;
}

export function parseExecutionWorkspaceRoute(hash: string): { executionRef: string | null } {
  const match = hash.match(/^#\/engineering\/engineering-execution\/([^?/]+)/);
  if (!match) return { executionRef: null };
  return { executionRef: deslugify(match[1]) };
}

/**
 * EWO-033R.4 — Administrative/inspection navigation only.
 * This function is used by workspace pages for optional execution inspection.
 * It must NEVER be called from conversation cards as a required lifecycle action.
 * The conversation boundary guard validates this.
 */
export function navigateToExecutionWorkspace(executionRef: string): boolean {
  if (!executionRef) return false;
  const route = buildExecutionWorkspaceRoute(executionRef);
  window.location.hash = route;
  return true;
}

// ES-003 — Engineering Standard: Canonical Evidence Navigation

// ═══════════════════════════════════════════════════════════════════════════════
// EWO-014.19A.7SR.1 — Canonical Evidence Navigation
// ═══════════════════════════════════════════════════════════════════════════════

export type EvidenceObjectType =
  | 'ewo'
  | 'engineering_record'
  | 'engineering_standard'
  | 'constitution_section'
  | 'completion_report'
  | 'historical_recovery'
  | 'runtime_diagnostic'
  | 'engineering_plan';

export interface CanonicalDestination {
  routeKey: string;
  hash: string;
  objectType: EvidenceObjectType;
  objectRef: string;
  exists: boolean;
  failureReason?: string;
}

export interface NavigationFailure {
  reference: string;
  objectType: EvidenceObjectType;
  reason: string;
  referenceCode: string;
  recommendedAction: string;
}

export type NavigationResult =
  | { success: true; destination: CanonicalDestination }
  | { success: false; failure: NavigationFailure };

const EVIDENCE_ROUTE_MAP: Record<EvidenceObjectType, string> = {
  ewo: 'engineering.work-order-detail',
  engineering_record: 'engineering.records-library',
  engineering_standard: 'engineering.engineering-standards',
  constitution_section: 'engineering.constitution',
  completion_report: 'engineering.work-order-detail',
  historical_recovery: 'engineering.recovery-workspace',
  runtime_diagnostic: 'engineering.execution-dashboard',
  engineering_plan: 'engineering.engineering-planning',
};

function detectEvidenceType(reference: string, hint?: string): EvidenceObjectType {
  const ref = reference.trim().toUpperCase();

  if (hint) {
    const hintMap: Record<string, EvidenceObjectType> = {
      ewo: 'ewo',
      completion_report: 'completion_report',
      standard: 'engineering_standard',
      constitution: 'constitution_section',
      historical_recovery: 'historical_recovery',
      runtime_diagnostic: 'runtime_diagnostic',
      engineering_record: 'engineering_record',
      engineering_plan: 'engineering_plan',
    };
    if (hintMap[hint]) return hintMap[hint];
  }

  if (/^EWO-/.test(ref)) return 'ewo';
  if (/^CONST-/.test(ref)) return 'constitution_section';
  if (/^ES-/.test(ref)) return 'engineering_standard';
  if (/^ERC-/.test(ref) || /^ER-/.test(ref)) return 'engineering_record';
  if (/^REC-/.test(ref) || /RECOVERY/.test(ref)) return 'historical_recovery';
  if (/^RDE-/.test(ref) || /RUNTIME/.test(ref) || /DIAGNOSTIC/.test(ref)) return 'runtime_diagnostic';
  if (/^EP-/.test(ref) || /PLAN/.test(ref)) return 'engineering_plan';
  if (/^CR-/.test(ref) || /COMPLETION/.test(ref)) return 'completion_report';

  const classification = classifyReference(reference, 'navigation', {});
  if (classification.inferred_object_type === 'ewo') return 'ewo';
  if (classification.inferred_object_type === 'constitutional') return 'constitution_section';

  return 'ewo';
}

const EXISTENCE_QUERIES: Record<EvidenceObjectType, { table: string; column: string; altColumn?: string }> = {
  ewo: { table: 'engineering_work_orders', column: 'ewo_ref' },
  engineering_record: { table: 'engineering_records_library', column: 'record_ref', altColumn: 'ewo_ref' },
  engineering_standard: { table: 'ecc_engineering_standards', column: 'title' },
  constitution_section: { table: 'engineering_constitutional_amendments', column: 'amendment_ref' },
  completion_report: { table: 'ewo_completion_reports', column: 'ewo_ref' },
  historical_recovery: { table: 'engineering_recovery_packages', column: 'canonical_reference' },
  runtime_diagnostic: { table: 'engineering_executions', column: 'execution_ref' },
  engineering_plan: { table: 'engineering_plans', column: 'ewo_ref' },
};

async function validateObjectExists(objectType: EvidenceObjectType, reference: string): Promise<boolean> {
  const queryConfig = EXISTENCE_QUERIES[objectType];
  if (!queryConfig) return false;

  try {
    const columns = queryConfig.altColumn
      ? `${queryConfig.column}, ${queryConfig.altColumn}`
      : queryConfig.column;

    const { data, error } = await supabase
      .from(queryConfig.table)
      .select(columns)
      .or(`${queryConfig.column}.eq.${reference}${queryConfig.altColumn ? `,${queryConfig.altColumn}.eq.${reference}` : ''}`)
      .limit(1)
      .maybeSingle();

    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

export async function resolveCanonicalDestination(
  reference: string,
  hint?: string,
  options?: { validateExists?: boolean },
): Promise<NavigationResult> {
  const objectType = detectEvidenceType(reference, hint);
  const routeKey = EVIDENCE_ROUTE_MAP[objectType];
  const routeDef = getRouteByKey(routeKey);

  if (!routeDef) {
    return {
      success: false,
      failure: {
        reference,
        objectType,
        reason: `No canonical route is registered for object type "${objectType}".`,
        referenceCode: 'EIOS-NAV-002',
        recommendedAction: 'Contact engineering support — the route registry may be incomplete.',
      },
    };
  }

  const hash = buildRoute(routeKey, { ref: reference });
  const validate = options?.validateExists ?? true;

  if (validate) {
    const exists = await validateObjectExists(objectType, reference);
    if (!exists) {
      return {
        success: false,
        failure: {
          reference,
          objectType,
          reason: `The investigation references an ${evidenceObjectLabel(objectType)} that does not currently exist in the Engineering Ledger.`,
          referenceCode: 'EIOS-NAV-001',
          recommendedAction: `Create Missing ${evidenceObjectLabel(objectType)}`,
        },
      };
    }
  }

  return {
    success: true,
    destination: {
      routeKey,
      hash,
      objectType,
      objectRef: reference,
      exists: true,
    },
  };
}

export async function navigateToCanonical(
  reference: string,
  hint?: string,
  options?: { validateExists?: boolean },
): Promise<NavigationResult> {
  const result = await resolveCanonicalDestination(reference, hint, options);

  if (result.success) {
    navigate(result.destination.routeKey, { ref: result.destination.objectRef });
  }

  return result;
}

export function formatNavigationFailure(failure: NavigationFailure): {
  title: string;
  message: string;
  referenceCode: string;
  recommendedAction: string;
} {
  return {
    title: 'Engineering object unavailable',
    message: `Reference: ${failure.reference}\n\nReason:\n${failure.reason}\n\nNext action:\n${failure.recommendedAction}\n\nReference:\n${failure.referenceCode}`,
    referenceCode: failure.referenceCode,
    recommendedAction: failure.recommendedAction,
  };
}

export async function resolveEvidenceBatch(
  items: { reference: string; hint?: string }[],
  options?: { validateExists?: boolean },
): Promise<Map<string, NavigationResult>> {
  const results = new Map<string, NavigationResult>();
  await Promise.all(items.map(async (item) => {
    const result = await resolveCanonicalDestination(item.reference, item.hint, options);
    results.set(item.reference, result);
  }));
  return results;
}

function evidenceObjectLabel(objectType: EvidenceObjectType): string {
  const labels: Record<EvidenceObjectType, string> = {
    ewo: 'Engineering Work Order',
    engineering_record: 'Engineering Record',
    engineering_standard: 'Engineering Standard',
    constitution_section: 'Constitution Section',
    completion_report: 'Completion Report',
    historical_recovery: 'Historical Recovery Package',
    runtime_diagnostic: 'Runtime Diagnostic Envelope',
    engineering_plan: 'Engineering Plan',
  };
  return labels[objectType] ?? 'Engineering Object';
}

export function getObjectTypeLabel(objectType: EvidenceObjectType): string {
  return evidenceObjectLabel(objectType);
}
