import { supabase } from './supabase';

// ============================================================
// Types
// ============================================================

export interface OwnershipType {
  id: string;
  key: string;
  label: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CapabilityClassification {
  id: string;
  key: string;
  label: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type OwnershipStatus = 'active' | 'under_review' | 'deprecated' | 'retired';

export interface OwnershipMetadata {
  id: string;
  object_id: string;
  object_type: string;
  ownership_type: string | null;
  classification_type: string | null;
  current_project_id: string | null;
  original_project_id: string | null;
  created_by_ecr: string | null;
  ownership_confidence: number | null;
  ownership_status: OwnershipStatus;
  notes: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type LineageEventType =
  | 'created'
  | 'ownership_changed'
  | 'capability_promoted'
  | 'capability_retired'
  | 'ownership_restored'
  | 'deviation_granted'
  | 'deviation_expired';

export interface OwnershipLineageEvent {
  id: string;
  ownership_metadata_id: string | null;
  object_id: string;
  object_type: string;
  event_type: LineageEventType;
  from_ownership_type: string | null;
  to_ownership_type: string;
  from_owner_id: string | null;
  to_owner_id: string | null;
  actor: string;
  reason: string;
  evidence: Record<string, unknown>;
  ecr_ref: string | null;
  effective_date: string;
  created_at: string;
}

export type SpcStatus = 'active' | 'deprecated' | 'retired';

export interface SharedPlatformCapability {
  id: string;
  spc_ref: string;
  name: string;
  summary: string;
  classification_type: string | null;
  status: SpcStatus;
  version: string;
  original_project_id: string | null;
  promoted_from_ecr: string | null;
  promoted_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Input types
// ============================================================

export interface CreateOwnershipMetadataInput {
  object_id: string;
  object_type: string;
  ownership_type?: string;
  classification_type?: string;
  current_project_id?: string;
  original_project_id?: string;
  created_by_ecr?: string;
  ownership_confidence?: number;
  ownership_status?: OwnershipStatus;
  notes?: string;
}

export interface UpdateOwnershipMetadataInput {
  ownership_type?: string;
  classification_type?: string;
  current_project_id?: string | null;
  ownership_confidence?: number;
  ownership_status?: OwnershipStatus;
  notes?: string;
}

export interface AppendLineageEventInput {
  ownership_metadata_id?: string;
  object_id: string;
  object_type: string;
  event_type: LineageEventType;
  from_ownership_type?: string;
  to_ownership_type: string;
  from_owner_id?: string;
  to_owner_id?: string;
  actor?: string;
  reason?: string;
  evidence?: Record<string, unknown>;
  ecr_ref?: string;
  effective_date?: string;
}

export interface CreateSpcInput {
  spc_ref: string;
  name: string;
  summary?: string;
  classification_type?: string;
  status?: SpcStatus;
  version?: string;
  original_project_id?: string;
  promoted_from_ecr?: string;
  promoted_at?: string;
}

export interface UpdateSpcInput {
  name?: string;
  summary?: string;
  classification_type?: string;
  status?: SpcStatus;
  version?: string;
  promoted_from_ecr?: string;
  promoted_at?: string;
}

// ============================================================
// Ownership Types
// ============================================================

export async function listOwnershipTypes(): Promise<OwnershipType[]> {
  const { data, error } = await supabase
    .from('ecc_ownership_types')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getOwnershipTypeByKey(key: string): Promise<OwnershipType | null> {
  const { data, error } = await supabase
    .from('ecc_ownership_types')
    .select('*')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ============================================================
// Capability Classifications
// ============================================================

export async function listCapabilityClassifications(): Promise<CapabilityClassification[]> {
  const { data, error } = await supabase
    .from('ecc_capability_classifications')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getCapabilityClassificationByKey(
  key: string,
): Promise<CapabilityClassification | null> {
  const { data, error } = await supabase
    .from('ecc_capability_classifications')
    .select('*')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ============================================================
// Ownership Metadata
// ============================================================

export async function createOwnershipMetadata(
  input: CreateOwnershipMetadataInput,
): Promise<OwnershipMetadata> {
  const { data, error } = await supabase
    .from('ecc_ownership_metadata')
    .insert({
      ...input,
      ownership_status: input.ownership_status ?? 'active',
      notes: input.notes ?? '',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getOwnershipMetadataById(id: string): Promise<OwnershipMetadata | null> {
  const { data, error } = await supabase
    .from('ecc_ownership_metadata')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getOwnershipMetadataForObject(
  objectId: string,
  objectType: string,
): Promise<OwnershipMetadata | null> {
  const { data, error } = await supabase
    .from('ecc_ownership_metadata')
    .select('*')
    .eq('object_id', objectId)
    .eq('object_type', objectType)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listOwnershipMetadataByType(
  ownershipType: string,
): Promise<OwnershipMetadata[]> {
  const { data, error } = await supabase
    .from('ecc_ownership_metadata')
    .select('*')
    .eq('ownership_type', ownershipType)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function updateOwnershipMetadata(
  id: string,
  input: UpdateOwnershipMetadataInput,
): Promise<OwnershipMetadata> {
  const { data, error } = await supabase
    .from('ecc_ownership_metadata')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function softDeleteOwnershipMetadata(id: string): Promise<void> {
  const { error } = await supabase
    .from('ecc_ownership_metadata')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// Ownership Lineage (append-only)
// ============================================================

export async function appendLineageEvent(
  input: AppendLineageEventInput,
): Promise<OwnershipLineageEvent> {
  const { data, error } = await supabase
    .from('ecc_ownership_lineage')
    .insert({
      ownership_metadata_id: input.ownership_metadata_id ?? null,
      object_id: input.object_id,
      object_type: input.object_type,
      event_type: input.event_type,
      from_ownership_type: input.from_ownership_type ?? null,
      to_ownership_type: input.to_ownership_type,
      from_owner_id: input.from_owner_id ?? null,
      to_owner_id: input.to_owner_id ?? null,
      actor: input.actor ?? 'system',
      reason: input.reason ?? '',
      evidence: input.evidence ?? {},
      ecr_ref: input.ecr_ref ?? null,
      effective_date: input.effective_date ?? new Date().toISOString().split('T')[0],
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getLineageForObject(
  objectId: string,
  objectType: string,
): Promise<OwnershipLineageEvent[]> {
  const { data, error } = await supabase
    .from('ecc_ownership_lineage')
    .select('*')
    .eq('object_id', objectId)
    .eq('object_type', objectType)
    .order('effective_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getLineageForMetadata(
  ownershipMetadataId: string,
): Promise<OwnershipLineageEvent[]> {
  const { data, error } = await supabase
    .from('ecc_ownership_lineage')
    .select('*')
    .eq('ownership_metadata_id', ownershipMetadataId)
    .order('effective_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getRecentLineageEvents(limit = 50): Promise<OwnershipLineageEvent[]> {
  const { data, error } = await supabase
    .from('ecc_ownership_lineage')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ============================================================
// Shared Platform Capabilities
// ============================================================

export async function createSharedPlatformCapability(
  input: CreateSpcInput,
): Promise<SharedPlatformCapability> {
  const { data, error } = await supabase
    .from('ecc_shared_platform_capabilities')
    .insert({
      ...input,
      status: input.status ?? 'active',
      version: input.version ?? '1.0.0',
      summary: input.summary ?? '',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getSharedPlatformCapabilityById(
  id: string,
): Promise<SharedPlatformCapability | null> {
  const { data, error } = await supabase
    .from('ecc_shared_platform_capabilities')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSharedPlatformCapabilityByRef(
  spcRef: string,
): Promise<SharedPlatformCapability | null> {
  const { data, error } = await supabase
    .from('ecc_shared_platform_capabilities')
    .select('*')
    .eq('spc_ref', spcRef)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listSharedPlatformCapabilities(
  statusFilter?: SpcStatus,
): Promise<SharedPlatformCapability[]> {
  let query = supabase
    .from('ecc_shared_platform_capabilities')
    .select('*')
    .is('deleted_at', null)
    .order('spc_ref', { ascending: true });

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function updateSharedPlatformCapability(
  id: string,
  input: UpdateSpcInput,
): Promise<SharedPlatformCapability> {
  const { data, error } = await supabase
    .from('ecc_shared_platform_capabilities')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function softDeleteSharedPlatformCapability(id: string): Promise<void> {
  const { error } = await supabase
    .from('ecc_shared_platform_capabilities')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// Lookup helpers
// ============================================================

export async function resolveOwnershipLabel(key: string | null): Promise<string> {
  if (!key) return 'Unclassified';
  const type = await getOwnershipTypeByKey(key);
  return type?.label ?? key;
}

export async function resolveClassificationLabel(key: string | null): Promise<string> {
  if (!key) return 'Unclassified';
  const cls = await getCapabilityClassificationByKey(key);
  return cls?.label ?? key;
}

export async function getOwnershipSummaryForObject(
  objectId: string,
  objectType: string,
): Promise<{
  metadata: OwnershipMetadata | null;
  lineage: OwnershipLineageEvent[];
} | null> {
  const metadata = await getOwnershipMetadataForObject(objectId, objectType);
  if (!metadata) return null;
  const lineage = await getLineageForMetadata(metadata.id);
  return { metadata, lineage };
}
