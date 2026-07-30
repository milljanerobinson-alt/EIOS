import { supabase } from './supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EngineeringAuditRecord {
  id: string;
  audit_number: string;
  audit_type: string;
  audit_scope: string | null;
  name: string;
  status: string;
  overall_health_score: number | null;
  engineering_register_integrity: number | null;
  evidence_completeness: number | null;
  governance_maturity: number | null;
  executive_summary: string | null;
  critical_findings_count: number | null;
  total_findings_count: number | null;
  confirmed_defects_count: number;
  governance_decisions_count: number;
  lifecycle_issues_count: number;
  evidence_issues_count: number;
  source_ewo_refs: string[];
  remediation_packages: RemediationPackage[];
  is_engineering_audit: boolean;
  historical_classification: string | null;
  creation_method: string;
  workspace: string;
  is_draft: boolean;
  created_at: string;
  updated_at: string;
}

export interface RemediationPackage {
  package_id: string;
  title: string;
  description: string;
  effort: string;
  status: string;
  item_count: number;
}

export interface EngineeringAuditInput {
  audit_number: string;
  name: string;
  audit_type: string;
  audit_scope: string;
  executive_summary: string;
  overall_health_score: number;
  engineering_register_integrity: number;
  evidence_completeness: number;
  governance_maturity: number;
  critical_findings_count: number;
  total_findings_count: number;
  confirmed_defects_count: number;
  governance_decisions_count: number;
  lifecycle_issues_count: number;
  evidence_issues_count: number;
  source_ewo_refs: string[];
  remediation_packages: RemediationPackage[];
  historical_classification?: string;
  status?: string;
  creation_method?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

const TABLE = 'ecc_audits';

function generateAuditNumber(): string {
  const prefix = 'EA-';
  const ts = Date.now().toString(36).toUpperCase().slice(-6);
  return `${prefix}${ts}`;
}

export async function registerEngineeringAudit(
  input: EngineeringAuditInput,
): Promise<EngineeringAuditRecord | null> {
  const record = {
    audit_number: input.audit_number || generateAuditNumber(),
    audit_type: input.audit_type,
    audit_scope: input.audit_scope,
    name: input.name,
    status: input.status ?? 'closed',
    overall_health_score: input.overall_health_score,
    engineering_register_integrity: input.engineering_register_integrity,
    evidence_completeness: input.evidence_completeness,
    governance_maturity: input.governance_maturity,
    executive_summary: input.executive_summary,
    critical_findings_count: input.critical_findings_count,
    total_findings_count: input.total_findings_count,
    confirmed_defects_count: input.confirmed_defects_count,
    governance_decisions_count: input.governance_decisions_count,
    lifecycle_issues_count: input.lifecycle_issues_count,
    evidence_issues_count: input.evidence_issues_count,
    source_ewo_refs: input.source_ewo_refs,
    remediation_packages: input.remediation_packages,
    is_engineering_audit: true,
    historical_classification: input.historical_classification ?? 'production',
    creation_method: input.creation_method ?? 'imported',
    workspace: 'production',
    is_draft: false,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .insert(record)
    .select()
    .single();

  if (error) {
    console.error('[EngineeringAudit] Failed to register audit:', error.message);
    return null;
  }

  return data as unknown as EngineeringAuditRecord;
}

export async function getEngineeringAudits(): Promise<EngineeringAuditRecord[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('is_engineering_audit', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[EngineeringAudit] Failed to fetch audits:', error.message);
    return [];
  }

  return (data ?? []) as unknown as EngineeringAuditRecord[];
}

export async function getEngineeringAuditById(
  id: string,
): Promise<EngineeringAuditRecord | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .eq('is_engineering_audit', true)
    .maybeSingle();

  if (error) {
    console.error('[EngineeringAudit] Failed to fetch audit:', error.message);
    return null;
  }

  return (data as unknown as EngineeringAuditRecord) ?? null;
}

export async function getLatestEngineeringRegisterAudit(): Promise<EngineeringAuditRecord | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('is_engineering_audit', true)
    .eq('audit_type', 'engineering_register')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[EngineeringAudit] Failed to fetch latest audit:', error.message);
    return null;
  }

  return (data as unknown as EngineeringAuditRecord) ?? null;
}

export async function getAuditsForEwo(
  ewoRef: string,
): Promise<EngineeringAuditRecord[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('is_engineering_audit', true)
    .contains('source_ewo_refs', [ewoRef])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[EngineeringAudit] Failed to fetch audits for EWO:', error.message);
    return [];
  }

  return (data ?? []) as unknown as EngineeringAuditRecord[];
}
