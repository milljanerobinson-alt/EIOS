import { supabase } from './supabase';

// ─── Types ──────────────────────────────────────────────────────────────────

export type IdentityRelationshipType =
  | 'CANONICAL'
  | 'ALIAS'
  | 'SUPERSEDED'
  | 'MIGRATED_FROM'
  | 'IMPORTED_FROM'
  | 'DUPLICATE_REFERENCE'
  | 'LEGACY_IDENTIFIER';

export type IdentityConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type ReconciliationStatus = 'pending' | 'accepted' | 'rejected' | 'overridden';

export interface IdentityMapping {
  id: string;
  canonical_reference: string;
  canonical_type: string;
  historical_reference: string;
  historical_type: string;
  source_record_id: string | null;
  relationship_type: IdentityRelationshipType;
  confidence: IdentityConfidence;
  reconciliation_status: ReconciliationStatus;
  provenance: string | null;
  notes: string | null;
  recommended_action: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  acceptance_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReconciliationCandidate {
  canonical_reference: string;
  canonical_type: string;
  historical_reference: string;
  historical_type: string;
  relationship_type: IdentityRelationshipType;
  confidence: IdentityConfidence;
  provenance: string;
  recommended_action: string;
  source_record_id?: string;
}

export interface IdentityAuditEvent {
  id: string;
  identity_map_id: string;
  action: 'accepted' | 'rejected' | 'overridden';
  previous_mapping: Record<string, unknown> | null;
  new_mapping: Record<string, unknown> | null;
  evidence_used: string | null;
  reason: string | null;
  acted_by: string;
  acted_at: string;
}

// ─── Reconciliation Engine ──────────────────────────────────────────────────
// The engine detects potential identity relationships. It NEVER automatically
// merges records — it only recommends relationships for PO review.

/**
 * Detect duplicate EWO references across engineering_work_orders and
 * engineering_records_library. Returns candidates where the same reference
 * appears in multiple tables or where ERC records match EWO references.
 */
export async function detectIdentityCandidates(): Promise<ReconciliationCandidate[]> {
  const candidates: ReconciliationCandidate[] = [];

  // 1. Find ERC records in engineering_records_library whose ewo_ref matches
  //    an existing engineering_work_orders entry
  const { data: ewos } = await supabase
    .from('engineering_work_orders')
    .select('ewo_ref, title');

  const { data: records } = await supabase
    .from('engineering_records_library')
    .select('record_ref, title, record_type, ewo_ref');

  if (ewos && records) {
    for (const ewo of ewos) {
      const matching = records.filter(r => r.ewo_ref === ewo.ewo_ref);
      for (const rec of matching) {
        // Skip if a mapping already exists
        const { data: existing } = await supabase
          .from('engineering_identity_map')
          .select('id')
          .eq('canonical_reference', ewo.ewo_ref)
          .eq('historical_reference', rec.record_ref)
          .maybeSingle();
        if (existing) continue;

        candidates.push({
          canonical_reference: ewo.ewo_ref,
          canonical_type: 'engineering_work_order',
          historical_reference: rec.record_ref,
          historical_type: rec.record_type || 'completion_report',
          relationship_type: 'ALIAS',
          confidence: 'MEDIUM',
          provenance: `Engineering Records Library record "${rec.record_ref}" references EWO "${ewo.ewo_ref}" in its ewo_ref field.`,
          recommended_action: 'Accept as historical alias of ' + ewo.ewo_ref,
        });
      }
    }

    // 2. Find records whose record_ref IS an EWO ref (e.g. record_ref = "EWO-001")
    for (const rec of records) {
      if (rec.record_ref.startsWith('EWO-') || rec.record_ref.startsWith('ewo_')) {
        const matchingEwo = ewos.find(e => e.ewo_ref === rec.record_ref);
        if (matchingEwo) {
          const { data: existing } = await supabase
            .from('engineering_identity_map')
            .select('id')
            .eq('canonical_reference', rec.record_ref)
            .eq('historical_reference', rec.record_ref)
            .maybeSingle();
          if (existing) continue;

          candidates.push({
            canonical_reference: rec.record_ref,
            canonical_type: 'engineering_work_order',
            historical_reference: rec.record_ref,
            historical_type: rec.record_type || 'completion_report',
            relationship_type: 'CANONICAL',
            confidence: 'HIGH',
            provenance: `Record "${rec.record_ref}" in engineering_records_library has the same reference as a work order in engineering_work_orders.`,
            recommended_action: 'Accept as canonical identity (same reference in both tables)',
          });
        }
      }
    }
  }

  // 3. Detect duplicate EWO references (same ref in multiple rows)
  if (ewos) {
    const refCounts = new Map<string, number>();
    for (const ewo of ewos) {
      refCounts.set(ewo.ewo_ref, (refCounts.get(ewo.ewo_ref) || 0) + 1);
    }
    for (const [ref, count] of refCounts) {
      if (count > 1) {
        candidates.push({
          canonical_reference: ref,
          canonical_type: 'engineering_work_order',
          historical_reference: ref,
          historical_type: 'engineering_work_order',
          relationship_type: 'DUPLICATE_REFERENCE',
          confidence: 'HIGH',
          provenance: `Reference "${ref}" appears ${count} times in engineering_work_orders.`,
          recommended_action: 'Review duplicate reference — manual override may be needed',
        });
      }
    }
  }

  return candidates;
}

/**
 * Detect identity candidates for a specific set of incoming EWO refs (used by
 * the Import Wizard before a historical import proceeds).
 */
export async function detectImportCandidates(
  incomingRefs: string[]
): Promise<ReconciliationCandidate[]> {
  const candidates: ReconciliationCandidate[] = [];

  // Check against existing work orders
  const { data: existingEwos } = await supabase
    .from('engineering_work_orders')
    .select('ewo_ref, title')
    .in('ewo_ref', incomingRefs);

  if (existingEwos) {
    for (const ewo of existingEwos) {
      candidates.push({
        canonical_reference: ewo.ewo_ref,
        canonical_type: 'engineering_work_order',
        historical_reference: ewo.ewo_ref,
        historical_type: 'engineering_work_order',
        relationship_type: 'DUPLICATE_REFERENCE',
        confidence: 'HIGH',
        provenance: `Reference "${ewo.ewo_ref}" already exists in the Engineering Ledger.`,
        recommended_action: 'Skip import — already exists. Optionally create alias mapping.',
      });
    }
  }

  // Check against engineering records library
  const { data: existingRecords } = await supabase
    .from('engineering_records_library')
    .select('record_ref, title, record_type, ewo_ref')
    .in('ewo_ref', incomingRefs);

  if (existingRecords) {
    for (const rec of existingRecords) {
      candidates.push({
        canonical_reference: rec.ewo_ref || rec.record_ref,
        canonical_type: 'engineering_work_order',
        historical_reference: rec.record_ref,
        historical_type: rec.record_type || 'completion_report',
        relationship_type: 'ALIAS',
        confidence: 'MEDIUM',
        provenance: `Engineering Records Library record "${rec.record_ref}" already references "${rec.ewo_ref}".`,
        recommended_action: 'Accept as historical alias, then skip import of duplicate.',
      });
    }
  }

  return candidates;
}

// ─── Identity Map CRUD ───────────────────────────────────────────────────────

export async function createIdentityMapping(
  candidate: ReconciliationCandidate
): Promise<IdentityMapping | null> {
  const { data, error } = await supabase
    .from('engineering_identity_map')
    .insert({
      canonical_reference: candidate.canonical_reference,
      canonical_type: candidate.canonical_type,
      historical_reference: candidate.historical_reference,
      historical_type: candidate.historical_type,
      source_record_id: candidate.source_record_id || null,
      relationship_type: candidate.relationship_type,
      confidence: candidate.confidence,
      reconciliation_status: 'pending',
      provenance: candidate.provenance,
      recommended_action: candidate.recommended_action,
    })
    .select('*')
    .single();
  if (error) return null;
  return data as IdentityMapping;
}

export async function getIdentityMappings(
  canonicalRef?: string
): Promise<IdentityMapping[]> {
  let query = supabase.from('engineering_identity_map').select('*').order('created_at', { ascending: false });
  if (canonicalRef) {
    query = query.eq('canonical_reference', canonicalRef);
  }
  const { data, error } = await query;
  if (error) return [];
  return (data || []) as IdentityMapping[];
}

export async function getPendingReconciliations(): Promise<IdentityMapping[]> {
  const { data, error } = await supabase
    .from('engineering_identity_map')
    .select('*')
    .eq('reconciliation_status', 'pending')
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data || []) as IdentityMapping[];
}

export async function acceptReconciliation(
  mappingId: string,
  acceptedBy: string,
  reason: string
): Promise<{ success: boolean; auditEvent?: IdentityAuditEvent; error?: string }> {
  // Fetch current state for audit
  const { data: current } = await supabase
    .from('engineering_identity_map')
    .select('*')
    .eq('id', mappingId)
    .single();

  if (!current) return { success: false, error: 'Mapping not found' };

  const { error: updateErr } = await supabase
    .from('engineering_identity_map')
    .update({
      reconciliation_status: 'accepted',
      accepted_by: acceptedBy,
      accepted_at: new Date().toISOString(),
      acceptance_reason: reason,
    })
    .eq('id', mappingId);

  if (updateErr) return { success: false, error: updateErr.message };

  const { data: auditData } = await supabase
    .from('engineering_identity_audit')
    .insert({
      identity_map_id: mappingId,
      action: 'accepted',
      previous_mapping: current,
      new_mapping: { ...current, reconciliation_status: 'accepted', accepted_by: acceptedBy, accepted_at: new Date().toISOString(), acceptance_reason: reason },
      evidence_used: (current as Record<string, unknown>).provenance as string || null,
      reason,
      acted_by: acceptedBy,
    })
    .select('*')
    .single();

  return { success: true, auditEvent: auditData as IdentityAuditEvent };
}

export async function rejectReconciliation(
  mappingId: string,
  rejectedBy: string,
  reason: string
): Promise<{ success: boolean; auditEvent?: IdentityAuditEvent; error?: string }> {
  const { data: current } = await supabase
    .from('engineering_identity_map')
    .select('*')
    .eq('id', mappingId)
    .single();

  if (!current) return { success: false, error: 'Mapping not found' };

  const { error: updateErr } = await supabase
    .from('engineering_identity_map')
    .update({
      reconciliation_status: 'rejected',
      accepted_by: rejectedBy,
      accepted_at: new Date().toISOString(),
      acceptance_reason: reason,
    })
    .eq('id', mappingId);

  if (updateErr) return { success: false, error: updateErr.message };

  const { data: auditData } = await supabase
    .from('engineering_identity_audit')
    .insert({
      identity_map_id: mappingId,
      action: 'rejected',
      previous_mapping: current,
      new_mapping: { ...current, reconciliation_status: 'rejected' },
      evidence_used: (current as Record<string, unknown>).provenance as string || null,
      reason,
      acted_by: rejectedBy,
    })
    .select('*')
    .single();

  return { success: true, auditEvent: auditData as IdentityAuditEvent };
}

export async function overrideReconciliation(
  mappingId: string,
  overriddenBy: string,
  newCanonicalRef: string,
  newRelationshipType: IdentityRelationshipType,
  reason: string
): Promise<{ success: boolean; auditEvent?: IdentityAuditEvent; error?: string }> {
  const { data: current } = await supabase
    .from('engineering_identity_map')
    .select('*')
    .eq('id', mappingId)
    .single();

  if (!current) return { success: false, error: 'Mapping not found' };

  const { error: updateErr } = await supabase
    .from('engineering_identity_map')
    .update({
      canonical_reference: newCanonicalRef,
      relationship_type: newRelationshipType,
      reconciliation_status: 'overridden',
      accepted_by: overriddenBy,
      accepted_at: new Date().toISOString(),
      acceptance_reason: reason,
    })
    .eq('id', mappingId);

  if (updateErr) return { success: false, error: updateErr.message };

  const { data: auditData } = await supabase
    .from('engineering_identity_audit')
    .insert({
      identity_map_id: mappingId,
      action: 'overridden',
      previous_mapping: current,
      new_mapping: { ...current, canonical_reference: newCanonicalRef, relationship_type: newRelationshipType, reconciliation_status: 'overridden' },
      evidence_used: (current as Record<string, unknown>).provenance as string || null,
      reason,
      acted_by: overriddenBy,
    })
    .select('*')
    .single();

  return { success: true, auditEvent: auditData as IdentityAuditEvent };
}

export async function getIdentityAuditTrail(
  mappingId?: string
): Promise<IdentityAuditEvent[]> {
  let query = supabase.from('engineering_identity_audit').select('*').order('acted_at', { ascending: false });
  if (mappingId) {
    query = query.eq('identity_map_id', mappingId);
  }
  const { data, error } = await query;
  if (error) return [];
  return (data || []) as IdentityAuditEvent[];
}

/**
 * Run the full reconciliation engine: detect candidates and create pending
 * mappings for any that don't already exist. Returns the number of new
 * mappings created.
 */
export async function runReconciliationEngine(): Promise<{
  candidatesFound: number;
  mappingsCreated: number;
  candidates: ReconciliationCandidate[];
}> {
  const candidates = await detectIdentityCandidates();
  let created = 0;
  for (const candidate of candidates) {
    const mapping = await createIdentityMapping(candidate);
    if (mapping) created++;
  }
  return { candidatesFound: candidates.length, mappingsCreated: created, candidates };
}
