import { supabase } from './supabase';
import { recordEWOCreated } from './engineeringChangeLogService';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EnsureResult {
  success: boolean;
  ewoId: string | null;
  ewoRef: string | null;
  created: boolean;
  error: string | null;
  collisionDetected: boolean;
}

export interface GuardResult {
  success: boolean;
  ewoId: string | null;
  ewoRef: string | null;
  error: string | null;
  entryPoint: string;
  timestamp: string;
  correlationRef: string;
}

// ─── Universal Canonical Creation ────────────────────────────────────────────

/**
 * The single governed entry point for canonical Engineering Work Order creation.
 * Implementation must NEVER begin before this function succeeds.
 *
 * Guarantees:
 *  - If a canonical EWO already exists for the ref, returns it (idempotent).
 *  - If no canonical EWO exists, creates one with status 'ready'.
 *  - If creation fails, returns success=false — caller MUST abort implementation.
 *  - If the reference is held by a Historical Reference, blocks creation
 *    (collision protection) unless allowConversion is true.
 */
export async function ensureEngineeringWorkOrderExists(
  ewoRef: string,
  title: string,
  executiveSummary: string,
  options?: {
    priority?: 'critical' | 'high' | 'medium' | 'low';
    riskLevel?: 'critical' | 'high' | 'medium' | 'low';
    parentRef?: string | null;
    implementationProvider?: string;
    allowConversion?: boolean;
  }
): Promise<EnsureResult> {
  try {
    // ── 1. Check if canonical EWO already exists ────────────────────────────
    const { data: existing, error: checkErr } = await supabase
      .from('engineering_work_orders')
      .select('id, ewo_ref')
      .eq('ewo_ref', ewoRef)
      .maybeSingle();

    if (checkErr) {
      return { success: false, ewoId: null, ewoRef, created: false, error: `Failed to check existing EWO: ${checkErr.message}`, collisionDetected: false };
    }

    if (existing) {
      return { success: true, ewoId: existing.id, ewoRef: existing.ewo_ref, created: false, error: null, collisionDetected: false };
    }

    // ── 2. Collision detection — check Historical References ──────────────
    if (!options?.allowConversion) {
      const { data: collision } = await supabase
        .from('engineering_historical_references')
        .select('id, reference')
        .eq('reference', ewoRef)
        .maybeSingle();

      if (collision) {
        return {
          success: false,
          ewoId: null,
          ewoRef,
          created: false,
          error: `Reference ${ewoRef} is held by a Historical Reference. Cannot create a competing canonical EWO. Use a governed conversion process.`,
          collisionDetected: true,
        };
      }
    }

    // ── 3. Create canonical EWO ─────────────────────────────────────────────
    const { data: ewo, error: createErr } = await supabase
      .from('engineering_work_orders')
      .insert({
        ewo_ref: ewoRef,
        title,
        executive_summary: executiveSummary,
        status: 'ready',
        priority: options?.priority ?? 'medium',
        risk_level: options?.riskLevel ?? 'medium',
        parent_ref: options?.parentRef ?? null,
        implementation_provider: options?.implementationProvider ?? 'bolt',
        implementation_status: 'Assigned',
        engineering_package_status: 'Generated',
      })
      .select('id, ewo_ref')
      .single();

    if (createErr || !ewo) {
      return { success: false, ewoId: null, ewoRef, created: false, error: `Failed to create canonical EWO: ${createErr?.message ?? 'unknown'}`, collisionDetected: false };
    }

    // ── 4. Record lifecycle event ─────────────────────────────────────────────
    await supabase.from('ewo_lifecycle_events').insert({
      ewo_id: ewo.id,
      from_status: null,
      to_status: 'ready',
      actor: 'system',
      notes: `Canonical EWO ${ewoRef} registered via ensureEngineeringWorkOrderExists() before implementation.`,
      metadata: { source: 'ensure_canonical_creation', ewo_ref: ewoRef },
    });

    // ── 4a. Record automatic Engineering Change Log entry (EWO-019) ──────────
    await recordEWOCreated(ewo.ewo_ref, title, ewo.id, 'system', 'system');

    return { success: true, ewoId: ewo.id, ewoRef: ewo.ewo_ref, created: true, error: null, collisionDetected: false };
  } catch (e) {
    return { success: false, ewoId: null, ewoRef, created: false, error: e instanceof Error ? e.message : 'Unknown error', collisionDetected: false };
  }
}

// ─── Implementation Gateway (Fail-Closed) ─────────────────────────────────────

/**
 * The single higher-level implementation gateway that ALL implementation paths
 * must call before creating any implementation artefact.
 *
 * 1. Resolves the EWO reference from the ID (or uses the ref directly).
 * 2. Calls ensureEngineeringWorkOrderExists() to confirm canonical registration.
 * 3. Returns the canonical EWO ID on success.
 * 4. On failure, returns a governed error and records the failure in audit history.
 *
 * Implementation activity must NOT proceed if this function returns success=false.
 */
export async function guardImplementationEntry(
  ewoRefOrId: string,
  entryPoint: string,
  options?: {
    title?: string;
    executiveSummary?: string;
  }
): Promise<GuardResult> {
  const timestamp = new Date().toISOString();
  const correlationRef = `GUARD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    // ── 1. Resolve EWO ref from ID if needed ────────────────────────────────
    let ewoRef = ewoRefOrId;

    // If it looks like a UUID, resolve to ewo_ref
    if (ewoRefOrId.length === 36 && ewoRefOrId.includes('-')) {
      const { data: ewo } = await supabase
        .from('engineering_work_orders')
        .select('ewo_ref')
        .eq('id', ewoRefOrId)
        .maybeSingle();

      if (ewo) {
        ewoRef = ewo.ewo_ref;
      } else {
        // EWO doesn't exist — try to create it if we have title/summary
        if (options?.title && options?.executiveSummary) {
          const result = await ensureEngineeringWorkOrderExists(ewoRefOrId, options.title, options.executiveSummary);
          if (!result.success) {
            await recordGuardFailure(ewoRefOrId, entryPoint, result.error || 'Unknown error', timestamp, correlationRef);
            return { success: false, ewoId: null, ewoRef: ewoRefOrId, error: result.error, entryPoint, timestamp, correlationRef };
          }
          return { success: true, ewoId: result.ewoId, ewoRef: result.ewoRef, error: null, entryPoint, timestamp, correlationRef };
        }
        await recordGuardFailure(ewoRefOrId, entryPoint, `EWO not found for ID ${ewoRefOrId} and no title/summary provided for creation`, timestamp, correlationRef);
        return { success: false, ewoId: null, ewoRef: ewoRefOrId, error: `EWO not found for ID ${ewoRefOrId}`, entryPoint, timestamp, correlationRef };
      }
    }

    // ── 2. Ensure canonical EWO exists ──────────────────────────────────────
    const result = await ensureEngineeringWorkOrderExists(
      ewoRef,
      options?.title ?? `Engineering Work Order ${ewoRef}`,
      options?.executiveSummary ?? `Engineering implementation for ${ewoRef}`,
    );

    if (!result.success) {
      await recordGuardFailure(ewoRef, entryPoint, result.error || 'Unknown error', timestamp, correlationRef);
      return { success: false, ewoId: null, ewoRef, error: result.error, entryPoint, timestamp, correlationRef };
    }

    return { success: true, ewoId: result.ewoId, ewoRef: result.ewoRef, error: null, entryPoint, timestamp, correlationRef };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : 'Unknown error';
    await recordGuardFailure(ewoRefOrId, entryPoint, errorMsg, timestamp, correlationRef);
    return { success: false, ewoId: null, ewoRef: ewoRefOrId, error: errorMsg, entryPoint, timestamp, correlationRef };
  }
}

// ─── Guard Failure Audit ──────────────────────────────────────────────────────

async function recordGuardFailure(
  ewoRef: string,
  entryPoint: string,
  failureReason: string,
  timestamp: string,
  correlationRef: string,
): Promise<void> {
  try {
    await supabase.from('execution_audit_trail').insert({
      action: 'guard_failure',
      entity_type: 'engineering_work_orders',
      entity_ref: ewoRef,
      details: {
        entry_point: entryPoint,
        failure_reason: failureReason,
        timestamp,
        correlation_ref: correlationRef,
        message: 'Engineering implementation cannot begin because the canonical Engineering Work Order could not be registered.',
      },
      severity: 'high',
    });
  } catch {
    // Best-effort audit — don't fail harder
  }
}

// ─── Historical Reference Service ────────────────────────────────────────────

export interface HistoricalReference {
  id: string;
  reference: string;
  title: string;
  investigation_date: string;
  audit_ref: string;
  evidence_summary: string;
  conclusion: string;
  historical_explanation: string;
  status: string;
  product_owner: string | null;
  created_at: string;
  updated_at: string;
}

export async function getHistoricalReference(ref: string): Promise<HistoricalReference | null> {
  const { data, error } = await supabase
    .from('engineering_historical_references')
    .select('*')
    .eq('reference', ref)
    .maybeSingle();
  if (error) throw error;
  return data as HistoricalReference | null;
}

export async function listHistoricalReferences(): Promise<HistoricalReference[]> {
  const { data, error } = await supabase
    .from('engineering_historical_references')
    .select('*')
    .order('reference', { ascending: true });
  if (error) throw error;
  return (data || []) as HistoricalReference[];
}

// ─── Unified Ledger Search ───────────────────────────────────────────────────

export interface LedgerEntry {
  type: 'ewo' | 'historical_reference';
  reference: string;
  title: string;
  status: string;
  id: string;
  isExactMatch: boolean;
}

function isExactEwoReference(query: string): boolean {
  return /^EWO-\d+(\.\w+)*$/i.test(query.trim());
}

function isNumericQuery(query: string): boolean {
  return /^\d+$/.test(query.trim());
}

/**
 * Searches both canonical EWOs and Historical References.
 * - Exact EWO reference (e.g. EWO-007): prioritises exact match, returns related refinements
 * - Numeric (e.g. 007): searches for EWO-007, EWO-007R, and any ref containing 007
 * - General text: searches both tables, applies filters consistently
 */
export async function searchUnifiedLedger(searchQuery: string): Promise<LedgerEntry[]> {
  const query = searchQuery.trim();
  if (!query) return [];

  const isExact = isExactEwoReference(query);
  const isNumeric = isNumericQuery(query);

  // For numeric queries, search for EWO-{number} prefix
  const ewoSearchPattern = isNumeric ? `EWO-${query}` : query;
  const histSearchPattern = isNumeric ? `EWO-${query}` : query;

  const [ewoResult, histResult] = await Promise.all([
    supabase
      .from('engineering_work_orders')
      .select('id, ewo_ref, title, status')
      .or(`ewo_ref.ilike.%${ewoSearchPattern}%,title.ilike.%${query}%,executive_summary.ilike.%${query}%`)
      .order('ewo_ref', { ascending: true }),
    supabase
      .from('engineering_historical_references')
      .select('id, reference, title, status, evidence_summary, conclusion, historical_explanation')
      .or(`reference.ilike.%${histSearchPattern}%,title.ilike.%${query}%,evidence_summary.ilike.%${query}%`)
      .order('reference', { ascending: true }),
  ]);

  const entries: LedgerEntry[] = [];

  for (const ewo of ewoResult.data || []) {
    entries.push({
      type: 'ewo',
      reference: ewo.ewo_ref,
      title: ewo.title,
      status: ewo.status,
      id: ewo.id,
      isExactMatch: isExact && ewo.ewo_ref.toUpperCase() === query.toUpperCase(),
    });
  }

  for (const hist of histResult.data || []) {
    entries.push({
      type: 'historical_reference',
      reference: hist.reference,
      title: hist.title,
      status: hist.status,
      id: hist.id,
      isExactMatch: isExact && hist.reference.toUpperCase() === query.toUpperCase(),
    });
  }

  // Sort: exact matches first, then historical references (for numeric/exact), then alphabetical
  entries.sort((a, b) => {
    if (a.isExactMatch && !b.isExactMatch) return -1;
    if (!a.isExactMatch && b.isExactMatch) return 1;
    // For exact/numeric searches, prioritise Historical References over canonical EWOs
    // so EWO-007 search shows the Historical Reference first
    if (isExact || isNumeric) {
      if (a.type === 'historical_reference' && b.type === 'ewo') return -1;
      if (a.type === 'ewo' && b.type === 'historical_reference') return 1;
    }
    return a.reference.localeCompare(b.reference);
  });

  return entries;
}

// ─── Collision Detection ─────────────────────────────────────────────────────

export async function detectCollisions(): Promise<Array<{ reference: string; ewoId: string; historicalId: string }>> {
  const { data, error } = await supabase
    .from('v_ewo_historical_collisions')
    .select('*');

  if (error) return [];

  return (data || []).map((row: Record<string, unknown>) => ({
    reference: row.reference as string,
    ewoId: row.ewo_id as string,
    historicalId: row.historical_id as string,
  }));
}
