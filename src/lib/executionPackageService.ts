// EWO-029 — Execution Package Generation Service
// Creates governed Execution Packages that become permanent engineering records.

import { supabase } from './supabase';

export interface ExecutionPackageInput {
  ewo_ref: string;
  engineering_plan?: Record<string, unknown>;
  engineering_analysis?: Record<string, unknown>;
  implementation_instructions: string;
  constraints: string[];
  governance_rules: string[];
  completion_criteria: string[];
  acceptance_criteria: string[];
  build_requirements: string[];
  test_requirements: string[];
  execution_provider: string;
  provider_config: Record<string, unknown>;
}

export interface ExecutionPackage {
  id: string;
  package_ref: string;
  ewo_ref: string;
  engineering_plan: Record<string, unknown> | null;
  engineering_analysis: Record<string, unknown> | null;
  implementation_instructions: string;
  constraints: string[];
  governance_rules: string[];
  completion_criteria: string[];
  acceptance_criteria: string[];
  runtime_diagnostics: Record<string, unknown>;
  execution_provider: string;
  provider_config: Record<string, unknown>;
  execution_version: string;
  build_requirements: string[];
  test_requirements: string[];
  package_status: string;
  generated_at: string;
  approved_at: string | null;
}

export async function generateExecutionPackage(input: ExecutionPackageInput): Promise<ExecutionPackage> {
  const { data: ewo, error: ewoError } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, executive_summary, scope, business_objective, engineering_objective')
    .eq('ewo_ref', input.ewo_ref)
    .maybeSingle();

  if (ewoError) throw new Error(`Failed to fetch EWO: ${ewoError.message}`);
  if (!ewo) throw new Error(`EWO ${input.ewo_ref} not found.`);

  const packageRef = `SEP-${input.ewo_ref}-${Date.now()}`;

  const insertData = {
    package_ref: packageRef,
    ewo_id: ewo.id,
    ewo_ref: input.ewo_ref,
    engineering_plan: input.engineering_plan || null,
    engineering_analysis: input.engineering_analysis || null,
    implementation_instructions: input.implementation_instructions,
    constraints: input.constraints,
    governance_rules: input.governance_rules,
    completion_criteria: input.completion_criteria,
    acceptance_criteria: input.acceptance_criteria,
    runtime_diagnostics: { ewo_title: ewo.title, ewo_scope: ewo.scope },
    execution_provider: input.execution_provider,
    provider_config: input.provider_config,
    execution_version: '1.0',
    build_requirements: input.build_requirements,
    test_requirements: input.test_requirements,
    package_status: 'generated',
  };

  const { data, error } = await supabase
    .from('supervised_execution_packages')
    .insert(insertData)
    .select('*')
    .single();

  if (error) throw new Error(`Failed to create execution package: ${error.message}`);

  return mapDbToPackage(data);
}

export async function getExecutionPackage(packageRef: string): Promise<ExecutionPackage | null> {
  const { data, error } = await supabase
    .from('supervised_execution_packages')
    .select('*')
    .eq('package_ref', packageRef)
    .maybeSingle();

  if (error) throw new Error(`Failed to fetch package: ${error.message}`);
  if (!data) return null;

  return mapDbToPackage(data);
}

export async function getPackagesByEwo(ewoRef: string): Promise<ExecutionPackage[]> {
  const { data, error } = await supabase
    .from('supervised_execution_packages')
    .select('*')
    .eq('ewo_ref', ewoRef)
    .order('generated_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch packages: ${error.message}`);
  if (!data) return [];

  return data.map(mapDbToPackage);
}

export async function approveExecutionPackage(packageRef: string, approvedBy: string): Promise<void> {
  const { error } = await supabase
    .from('supervised_execution_packages')
    .update({ package_status: 'approved', approved_at: new Date().toISOString() })
    .eq('package_ref', packageRef);

  if (error) throw new Error(`Failed to approve package: ${error.message}`);
}

function mapDbToPackage(row: Record<string, unknown>): ExecutionPackage {
  return {
    id: row.id as string,
    package_ref: row.package_ref as string,
    ewo_ref: row.ewo_ref as string,
    engineering_plan: (row.engineering_plan as Record<string, unknown>) || null,
    engineering_analysis: (row.engineering_analysis as Record<string, unknown>) || null,
    implementation_instructions: (row.implementation_instructions as string) || '',
    constraints: (row.constraints as string[]) || [],
    governance_rules: (row.governance_rules as string[]) || [],
    completion_criteria: (row.completion_criteria as string[]) || [],
    acceptance_criteria: (row.acceptance_criteria as string[]) || [],
    runtime_diagnostics: (row.runtime_diagnostics as Record<string, unknown>) || {},
    execution_provider: (row.execution_provider as string) || 'bolt',
    provider_config: (row.provider_config as Record<string, unknown>) || {},
    execution_version: (row.execution_version as string) || '1.0',
    build_requirements: (row.build_requirements as string[]) || [],
    test_requirements: (row.test_requirements as string[]) || [],
    package_status: (row.package_status as string) || 'generated',
    generated_at: (row.generated_at as string) || '',
    approved_at: (row.approved_at as string) || null,
  };
}
