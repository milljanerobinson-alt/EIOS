// EWO-024R.2 — Canonical Object Reference Resolution
// Resolves displayed references to canonical stored references.
// Exact match preferred. Normalisation must not return the wrong object.

import { supabase } from '../supabase';

export interface ResolutionResult {
  resolved: boolean;
  canonical_ref: string | null;
  match_type: 'exact' | 'case_normalised' | 'hyphen_normalised' | 'canonical_alias' | 'parent_refinement' | 'none';
  matched_table: string | null;
  ambiguous: boolean;
  candidates: string[];
  explanation: string;
}

export type ObjectType = 'engineering_work_order' | 'engineering_record' | 'engineering_standard' | 'page' | 'workspace' | 'service' | 'capability';

const HYPHEN_UNDERSCORE_NORMALISERS: Array<(ref: string) => string> = [
  (r) => r.replace(/_/g, '-'),
  (r) => r.replace(/-/g, '_'),
  (r) => r.replace(/\s+/g, '-'),
];

export async function resolveEngineeringWorkOrder(displayedRef: string): Promise<ResolutionResult> {
  const ref = displayedRef.trim();
  if (!ref) {
    return { resolved: false, canonical_ref: null, match_type: 'none', matched_table: null, ambiguous: false, candidates: [], explanation: 'Empty reference provided.' };
  }

  // 1. Exact match
  const { data: exact } = await supabase
    .from('engineering_work_orders')
    .select('ewo_ref, status')
    .eq('ewo_ref', ref)
    .maybeSingle();

  if (exact) {
    return {
      resolved: true,
      canonical_ref: String(exact.ewo_ref),
      match_type: 'exact',
      matched_table: 'engineering_work_orders',
      ambiguous: false,
      candidates: [String(exact.ewo_ref)],
      explanation: `Exact match found: ${exact.ewo_ref} (status: ${exact.status}).`,
    };
  }

  // 2. Case normalisation
  const lowerRef = ref.toLowerCase();
  const { data: caseMatch } = await supabase
    .from('engineering_work_orders')
    .select('ewo_ref, status')
    .ilike('ewo_ref', lowerRef)
    .limit(5);

  if (caseMatch && caseMatch.length === 1) {
    return {
      resolved: true,
      canonical_ref: String(caseMatch[0].ewo_ref),
      match_type: 'case_normalised',
      matched_table: 'engineering_work_orders',
      ambiguous: false,
      candidates: [String(caseMatch[0].ewo_ref)],
      explanation: `Case-normalised match: ${caseMatch[0].ewo_ref}.`,
    };
  }

  if (caseMatch && caseMatch.length > 1) {
    return {
      resolved: false,
      canonical_ref: null,
      match_type: 'none',
      matched_table: 'engineering_work_orders',
      ambiguous: true,
      candidates: caseMatch.map((c: Record<string, unknown>) => String(c.ewo_ref)),
      explanation: `Ambiguous reference "${ref}" matched multiple work orders: ${caseMatch.map((c: Record<string, unknown>) => c.ewo_ref).join(', ')}.`,
    };
  }

  // 3. Hyphen/underscore normalisation
  for (const normaliser of HYPHEN_UNDERSCORE_NORMALISERS) {
    const normalised = normaliser(ref);
    if (normalised === ref) continue;
    const { data: normMatch } = await supabase
      .from('engineering_work_orders')
      .select('ewo_ref, status')
      .eq('ewo_ref', normalised)
      .maybeSingle();

    if (normMatch) {
      return {
        resolved: true,
        canonical_ref: String(normMatch.ewo_ref),
        match_type: 'hyphen_normalised',
        matched_table: 'engineering_work_orders',
        ambiguous: false,
        candidates: [String(normMatch.ewo_ref)],
        explanation: `Normalised match: "${ref}" → "${normMatch.ewo_ref}".`,
      };
    }
  }

  // 4. Parent/refinement reference — check if ref is a parent and children exist
  const { data: children } = await supabase
    .from('engineering_work_orders')
    .select('ewo_ref, status')
    .eq('parent_ref', ref)
    .order('created_at', { ascending: false })
    .limit(5);

  if (children && children.length > 0) {
    // Return the latest refinement as the canonical resolution
    const latest = children[0];
    return {
      resolved: true,
      canonical_ref: String(latest.ewo_ref),
      match_type: 'parent_refinement',
      matched_table: 'engineering_work_orders',
      ambiguous: children.length > 1,
      candidates: children.map((c: Record<string, unknown>) => String(c.ewo_ref)),
      explanation: children.length > 1
        ? `Reference "${ref}" is a parent with multiple refinements. Latest: ${latest.ewo_ref}. Others: ${children.slice(1).map((c: Record<string, unknown>) => c.ewo_ref).join(', ')}.`
        : `Parent reference "${ref}" resolved to refinement "${latest.ewo_ref}".`,
    };
  }

  // 5. No match
  return {
    resolved: false,
    canonical_ref: null,
    match_type: 'none',
    matched_table: null,
    ambiguous: false,
    candidates: [],
    explanation: `Engineering work order "${ref}" not found. No exact, case-normalised, hyphen-normalised, or parent/refinement match.`,
  };
}

export async function resolveEngineeringRecord(displayedRef: string): Promise<ResolutionResult> {
  const ref = displayedRef.trim();
  if (!ref) {
    return { resolved: false, canonical_ref: null, match_type: 'none', matched_table: null, ambiguous: false, candidates: [], explanation: 'Empty reference provided.' };
  }

  // Exact match
  const { data: exact } = await supabase
    .from('engineering_records_library')
    .select('record_ref, record_type, title')
    .eq('record_ref', ref)
    .maybeSingle();

  if (exact) {
    return {
      resolved: true,
      canonical_ref: String(exact.record_ref),
      match_type: 'exact',
      matched_table: 'engineering_records_library',
      ambiguous: false,
      candidates: [String(exact.record_ref)],
      explanation: `Exact match: ${exact.record_ref}.`,
    };
  }

  // Case normalisation
  const { data: caseMatch } = await supabase
    .from('engineering_records_library')
    .select('record_ref, record_type, title')
    .ilike('record_ref', ref)
    .limit(5);

  if (caseMatch && caseMatch.length === 1) {
    return {
      resolved: true,
      canonical_ref: String(caseMatch[0].record_ref),
      match_type: 'case_normalised',
      matched_table: 'engineering_records_library',
      ambiguous: false,
      candidates: [String(caseMatch[0].record_ref)],
      explanation: `Case-normalised match: ${caseMatch[0].record_ref}.`,
    };
  }

  if (caseMatch && caseMatch.length > 1) {
    return {
      resolved: false,
      canonical_ref: null,
      match_type: 'none',
      matched_table: 'engineering_records_library',
      ambiguous: true,
      candidates: caseMatch.map((c: Record<string, unknown>) => String(c.record_ref)),
      explanation: `Ambiguous reference "${ref}" matched multiple records.`,
    };
  }

  return {
    resolved: false,
    canonical_ref: null,
    match_type: 'none',
    matched_table: null,
    ambiguous: false,
    candidates: [],
    explanation: `Engineering record "${ref}" not found.`,
  };
}

export async function resolveReference(displayedRef: string, objectType: ObjectType = 'engineering_work_order'): Promise<ResolutionResult> {
  switch (objectType) {
    case 'engineering_work_order':
      return resolveEngineeringWorkOrder(displayedRef);
    case 'engineering_record':
      return resolveEngineeringRecord(displayedRef);
    default:
      return {
        resolved: false,
        canonical_ref: null,
        match_type: 'none',
        matched_table: null,
        ambiguous: false,
        candidates: [],
        explanation: `Reference resolution for object type "${objectType}" is not supported.`,
      };
  }
}
