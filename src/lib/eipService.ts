/**
 * Engineering Intelligence Platform (EIP) Service
 *
 * Assembles, validates, and packages engineering context before any AI reasoning begins.
 * The EIP never owns engineering data — it assembles it from authoritative sources.
 */

import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EipSource {
  source_key: string;
  source_name: string;
  description: string | null;
  table_name: string;
  weight: number;
  is_critical: boolean;
  is_enabled: boolean;
  sort_order: number;
}

export interface SourceAssessment extends EipSource {
  record_count: number;
  is_covered: boolean;
  last_updated: string | null;
  error: string | null;
}

export interface ValidationIssue {
  type: 'missing_source' | 'low_coverage' | 'stale_data' | 'duplicate' | 'incomplete';
  severity: 'high' | 'medium' | 'low' | 'info';
  source_key: string | null;
  message: string;
  detail?: string;
}

export interface PlatformState {
  id: string;
  version: string;
  features_count: number;
  releases_count: number;
  reviews_count: number;
  audits_count: number;
  goals_count: number;
  epics_count: number;
  phases_count: number;
  decisions_count: number;
  test_plans_count: number;
  docs_count: number;
  generated_at: string;
  generated_by: string | null;
  notes: string | null;
}

export interface ContextPackage {
  id: string;
  package_ref: string;
  package_version: string;
  platform_state_id: string | null;
  generation_timestamp: string;
  trigger_type: string;
  trigger_context: string | null;
  sources_used: SourceAssessment[];
  missing_sources: string[];
  knowledge_confidence_score: number;
  context_completeness_score: number;
  validation_status: 'valid' | 'warnings' | 'incomplete' | 'invalid';
  validation_issues: ValidationIssue[];
  executive_summary: string;
  is_locked: boolean;
}

export interface AssembledContext {
  sources: SourceAssessment[];
  validationIssues: ValidationIssue[];
  confidenceScore: number;
  completenessScore: number;
  validationStatus: 'valid' | 'warnings' | 'incomplete' | 'invalid';
  coveredSources: number;
  totalEnabledSources: number;
  criticalMissing: string[];
}

// ─── Source Query Functions ───────────────────────────────────────────────────

async function querySourceCount(tableName: string): Promise<{ count: number; lastUpdated: string | null; error: string | null }> {
  try {
    const countRes = await supabase.from(tableName).select('id', { count: 'exact', head: true });
    if (countRes.error) return { count: 0, lastUpdated: null, error: countRes.error.message };

    // Try to get last updated timestamp — optional, not all tables have it
    const latestRes = await supabase
      .from(tableName)
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastUpdated = latestRes.data?.created_at ?? null;
    return { count: countRes.count ?? 0, lastUpdated, error: null };
  } catch (err) {
    return { count: 0, lastUpdated: null, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Context Assembly Engine ──────────────────────────────────────────────────

export async function assembleSources(registeredSources: EipSource[]): Promise<SourceAssessment[]> {
  const enabled = registeredSources.filter(s => s.is_enabled);

  const assessments = await Promise.all(
    enabled.map(async (source): Promise<SourceAssessment> => {
      const { count, lastUpdated, error } = await querySourceCount(source.table_name);
      return {
        ...source,
        record_count: count,
        is_covered: count > 0,
        last_updated: lastUpdated,
        error,
      };
    })
  );

  return assessments.sort((a, b) => a.sort_order - b.sort_order);
}

// ─── Context Validation Engine ────────────────────────────────────────────────

export function validateContext(sources: SourceAssessment[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const source of sources) {
    if (source.error) {
      issues.push({
        type: 'missing_source',
        severity: source.is_critical ? 'high' : 'medium',
        source_key: source.source_key,
        message: `Source unavailable: ${source.source_name}`,
        detail: source.error,
      });
      continue;
    }

    if (!source.is_covered) {
      issues.push({
        type: 'missing_source',
        severity: source.is_critical ? 'high' : 'low',
        source_key: source.source_key,
        message: source.is_critical
          ? `Critical source empty: ${source.source_name}`
          : `No data in: ${source.source_name}`,
        detail: `Table '${source.table_name}' has no records. This source contributes ${source.weight}/10 to confidence.`,
      });
    } else if (source.last_updated) {
      const ageHours = (Date.now() - new Date(source.last_updated).getTime()) / (1000 * 60 * 60);
      if (ageHours > 720 && source.is_critical) {
        issues.push({
          type: 'stale_data',
          severity: 'low',
          source_key: source.source_key,
          message: `${source.source_name} has not been updated in over 30 days`,
          detail: `Last update: ${new Date(source.last_updated).toLocaleDateString('en-AU')}`,
        });
      }
    }
  }

  // Cross-source validations
  const features = sources.find(s => s.source_key === 'features_registry');
  const reviews = sources.find(s => s.source_key === 'engineering_reviews');
  const audits = sources.find(s => s.source_key === 'platform_audits');

  if (features?.is_covered && !reviews?.is_covered) {
    issues.push({
      type: 'incomplete',
      severity: 'medium',
      source_key: 'engineering_reviews',
      message: 'Features exist but no Engineering Reviews have been conducted',
      detail: 'Engineering Reviews validate feature quality and readiness.',
    });
  }

  if (features?.is_covered && !audits?.is_covered) {
    issues.push({
      type: 'incomplete',
      severity: 'medium',
      source_key: 'platform_audits',
      message: 'Features exist but no Platform Audits have been completed',
      detail: 'Platform Audits verify engineering governance compliance.',
    });
  }

  return issues;
}

// ─── Knowledge Confidence Engine ──────────────────────────────────────────────

export function calculateConfidence(sources: SourceAssessment[]): number {
  const totalWeight = sources.reduce((s, src) => s + src.weight, 0);
  if (totalWeight === 0) return 0;

  const coveredWeight = sources
    .filter(s => s.is_covered && !s.error)
    .reduce((s, src) => s + src.weight, 0);

  return Math.round((coveredWeight / totalWeight) * 100);
}

export function calculateCompleteness(sources: SourceAssessment[]): number {
  if (sources.length === 0) return 0;
  const covered = sources.filter(s => s.is_covered && !s.error).length;
  return Math.round((covered / sources.length) * 100);
}

export function deriveValidationStatus(
  issues: ValidationIssue[],
  completeness: number,
): 'valid' | 'warnings' | 'incomplete' | 'invalid' {
  const hasHigh = issues.some(i => i.severity === 'high');
  if (hasHigh || completeness < 30) return 'incomplete';
  if (issues.length > 0) return 'warnings';
  return 'valid';
}

// ─── Platform State Manager ───────────────────────────────────────────────────

export async function snapshotPlatformState(generatedBy?: string): Promise<PlatformState> {
  const tables = [
    'ecc_product_features',
    'ecc_release_candidates',
    'ecc_engineering_reviews',
    'ecc_audits',
    'ecc_goals',
    'ecc_epics',
    'ecc_phases',
    'ecc_decisions',
    'ecc_test_plans',
    'ecc_documentation',
  ] as const;

  const counts = await Promise.all(
    tables.map(t => supabase.from(t).select('id', { count: 'exact', head: true }).then(r => r.count ?? 0))
  );

  // Derive version from latest RC
  const { data: latestRC } = await supabase
    .from('ecc_release_candidates')
    .select('version,rc_number')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const existingStates = await supabase
    .from('eip_platform_states')
    .select('id', { count: 'exact', head: true });
  const stateNum = (existingStates.count ?? 0) + 1;
  const version = latestRC?.version ?? `1.${stateNum}.0`;

  const { data: newState, error } = await supabase
    .from('eip_platform_states')
    .insert({
      version,
      features_count: counts[0],
      releases_count: counts[1],
      reviews_count: counts[2],
      audits_count: counts[3],
      goals_count: counts[4],
      epics_count: counts[5],
      phases_count: counts[6],
      decisions_count: counts[7],
      test_plans_count: counts[8],
      docs_count: counts[9],
      generated_by: generatedBy ?? 'EIP Service',
      state_data: { rc_ref: latestRC?.rc_number ?? null },
    })
    .select()
    .single();

  if (error || !newState) throw new Error(error?.message ?? 'Failed to create platform state');
  return newState as PlatformState;
}

// ─── Context Packaging Engine ─────────────────────────────────────────────────

export function buildExecutiveSummary(
  sources: SourceAssessment[],
  confidence: number,
  completeness: number,
  issues: ValidationIssue[],
): string {
  const covered = sources.filter(s => s.is_covered).length;
  const criticalMissing = sources.filter(s => s.is_critical && !s.is_covered).map(s => s.source_name);
  const highIssues = issues.filter(i => i.severity === 'high').length;

  const parts: string[] = [
    `Engineering Context Package assembled from ${covered}/${sources.length} registered knowledge sources.`,
    `Knowledge Confidence Score: ${confidence}/100. Context Completeness: ${completeness}%.`,
  ];

  if (criticalMissing.length > 0) {
    parts.push(`Critical sources missing: ${criticalMissing.join(', ')}.`);
  }
  if (highIssues > 0) {
    parts.push(`${highIssues} high-severity validation issue${highIssues > 1 ? 's' : ''} detected.`);
  }
  if (confidence >= 80) {
    parts.push('Context quality is sufficient for AI-assisted engineering reasoning.');
  } else if (confidence >= 50) {
    parts.push('Context quality is adequate. Populate missing sources for higher confidence.');
  } else {
    parts.push('Context quality is insufficient for reliable AI reasoning. Address missing sources before proceeding.');
  }

  return parts.join(' ');
}

export async function generateContextPackage(
  sources: SourceAssessment[],
  platformStateId: string,
  triggerType = 'manual',
  triggerContext?: string,
): Promise<ContextPackage> {
  const issues = validateContext(sources);
  const confidence = calculateConfidence(sources);
  const completeness = calculateCompleteness(sources);
  const validationStatus = deriveValidationStatus(issues, completeness);
  const executiveSummary = buildExecutiveSummary(sources, confidence, completeness, issues);

  const missingSources = sources
    .filter(s => !s.is_covered || s.error)
    .map(s => s.source_key);

  const { data: pkg, error } = await supabase
    .from('eip_context_packages')
    .insert({
      package_version: '1.0',
      platform_state_id: platformStateId,
      trigger_type: triggerType,
      trigger_context: triggerContext ?? null,
      sources_used: sources,
      missing_sources: missingSources,
      knowledge_confidence_score: confidence,
      context_completeness_score: completeness,
      validation_status: validationStatus,
      executive_summary: executiveSummary,
      package_data: { source_assessments: sources, validation_issues: issues },
      is_locked: true,
    })
    .select()
    .single();

  if (error || !pkg) throw new Error(error?.message ?? 'Failed to create context package');

  // Persist validation results
  if (issues.length > 0) {
    await supabase.from('eip_validation_results').insert(
      issues.map(issue => ({
        package_id: pkg.id,
        source_key: issue.source_key,
        validation_type: issue.type,
        severity: issue.severity,
        message: issue.message,
        detail: issue.detail ?? null,
      }))
    );
  }

  return {
    ...pkg,
    sources_used: sources,
    missing_sources: missingSources,
    validation_issues: issues,
  } as ContextPackage;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function assembleAndGenerate(
  registeredSources: EipSource[],
  triggerType = 'manual',
  triggerContext?: string,
): Promise<ContextPackage> {
  const sources = await assembleSources(registeredSources);
  const platformState = await snapshotPlatformState();
  return generateContextPackage(sources, platformState.id, triggerType, triggerContext);
}

export async function loadRegisteredSources(): Promise<EipSource[]> {
  const { data, error } = await supabase
    .from('eip_source_registry')
    .select('*')
    .eq('is_enabled', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as EipSource[];
}
