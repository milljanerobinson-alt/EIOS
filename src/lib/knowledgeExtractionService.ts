import { supabase } from "./supabase";

export interface KnowledgeExtractionRecord {
  id: string;
  ewo_id: string;
  ewo_ref: string;
  extraction_status: string;
  extraction_method: string;
  knowledge_records_created: number;
  knowledge_records_merged: number;
  knowledge_records_skipped: number;
  completion_report_id: string | null;
  extraction_diagnostics: Record<string, unknown>;
  extracted_at: string | null;
  created_at: string;
}

export interface KnowledgeProvenanceRecord {
  id: string;
  knowledge_record_id: string;
  ewo_id: string;
  ewo_ref: string;
  implementation_version: string | null;
  completion_report_id: string | null;
  acceptance_audit_reference: string | null;
  extraction_id: string | null;
  extraction_timestamp: string;
}

export interface LifecycleReconciliationRecord {
  id: string;
  ewo_id: string;
  ewo_ref: string;
  reconciliation_type: string;
  pre_status: string;
  post_status: string;
  reconciliation_reason: string;
  verification_integrity: boolean;
  report_linkage_verified: boolean;
  acceptance_verified: boolean;
  knowledge_extraction_status: string | null;
  reconciled_at: string;
  reconciled_by: string;
}

export interface KnowledgeInspectionResult {
  governed: boolean;
  ewo_ref: string;
  ewo_title: string;
  ewo_status: string;
  knowledge_extraction_status: string;
  linked_completion_report: Record<string, unknown> | null;
  completion_report_id: string | null;
  report_storage_location: string | null;
  extraction_record: KnowledgeExtractionRecord | null;
  extracted_knowledge_records: Array<Record<string, unknown>>;
  provenance: Record<string, unknown> | null;
  lifecycle_reconciliation_history: LifecycleReconciliationRecord[];
  linkage_integrity: {
    completion_report_linked: boolean;
    completion_report_id: string | null;
    extraction_recorded: boolean;
    extraction_status: string;
    provenance_records: number;
  };
  extraction_diagnostics: Record<string, unknown> | null;
  audit_reference: string;
}

export interface PostAcceptancePipelineResult {
  governed: boolean;
  ewo_ref: string;
  pipeline_status: string;
  pipeline_steps: Array<{ step: string; status: string; detail?: string }>;
  po_acceptance_recorded: boolean;
  completion_report_linked: boolean;
  knowledge_extraction: {
    extraction_status: string;
    knowledge_records_created: number;
    knowledge_records_merged: number;
    knowledge_records_skipped: number;
    extraction_id?: string;
  } | null;
  ewo_closed: boolean;
  closure_method: string;
  closed_at: string;
}

export interface LifecycleReconciliationResult {
  governed: boolean;
  reconciliation_type: string;
  candidates_identified: number;
  ewos_closed: number;
  ewos_skipped: number;
  testing_ewos_untouched: number;
  results: Array<{
    ewo_ref: string;
    pre_status: string;
    post_status: string;
    closed: boolean;
    verification_integrity: boolean;
    report_linkage_verified: boolean;
    acceptance_verified: boolean;
    knowledge_extraction_status: string;
    reason: string;
  }>;
  testing_ewos: Array<{
    ewo_ref: string;
    status: string;
    po_testing_status: string | null;
    untouched: boolean;
  }>;
  message: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function callEdgeFunction<T>(slug: string, body: unknown): Promise<T> {
  const url = `${SUPABASE_URL}/functions/v1/${slug}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Edge function ${slug} failed (${resp.status}): ${text.slice(0, 200)}`);
  }
  return JSON.parse(text) as T;
}

export async function triggerKnowledgeExtraction(ewoRef: string): Promise<{
  governed: boolean;
  ewo_ref: string;
  extraction_status: string;
  extraction_id: string;
  knowledge_records_created: number;
  knowledge_records_merged: number;
  knowledge_records_skipped: number;
  knowledge_candidates: number;
  completion_report_linked: boolean;
  provenance_recorded: boolean;
}> {
  return callEdgeFunction("engineering-knowledge-extraction", { ewo_ref: ewoRef });
}

export async function triggerPostAcceptancePipeline(params: {
  ewo_ref: string;
  po_accepted_by: string;
  po_acceptance_statement: string;
  acceptance_audit_reference?: string;
  accepted_implementation_version?: string;
  accepted_refinement_version?: string;
  completion_report_id?: string;
  completion_report_body?: string;
  completion_report_title?: string;
  completion_report_executive_summary?: string;
  completion_report_scope_completed?: string;
  completion_report_files_modified?: string[];
  completion_report_lifecycle_summary?: string;
  completion_report_validation_results?: string;
  completion_report_build_result?: string;
  completion_report_risks?: string;
  completion_report_po_decisions?: string;
  completion_report_acceptance_recommendation?: string;
}): Promise<PostAcceptancePipelineResult> {
  return callEdgeFunction("post-acceptance-pipeline", params);
}

export async function triggerLifecycleReconciliation(): Promise<LifecycleReconciliationResult> {
  return callEdgeFunction("lifecycle-reconciliation", {});
}

export async function inspectKnowledgeExtraction(ewoRef: string): Promise<KnowledgeInspectionResult> {
  return callEdgeFunction("atd-mcp-server", {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "inspect_knowledge_extraction",
      arguments: { ewo_ref: ewoRef },
    },
  });
}

export async function fetchKnowledgeExtractions(): Promise<KnowledgeExtractionRecord[]> {
  const { data, error } = await supabase
    .from("engineering_knowledge_extractions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as KnowledgeExtractionRecord[];
}

export async function fetchProvenanceForEWO(ewoRef: string): Promise<KnowledgeProvenanceRecord[]> {
  const { data, error } = await supabase
    .from("engineering_knowledge_provenance")
    .select("*")
    .eq("ewo_ref", ewoRef)
    .order("extraction_timestamp", { ascending: false });
  if (error) throw error;
  return (data || []) as KnowledgeProvenanceRecord[];
}

export async function fetchReconciliationHistory(ewoRef: string): Promise<LifecycleReconciliationRecord[]> {
  const { data, error } = await supabase
    .from("lifecycle_reconciliation_log")
    .select("*")
    .eq("ewo_ref", ewoRef)
    .order("reconciled_at", { ascending: false });
  if (error) throw error;
  return (data || []) as LifecycleReconciliationRecord[];
}
