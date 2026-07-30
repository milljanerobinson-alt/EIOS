/**
 * Engineering Completion Governance Engine — EWO-011.3
 *
 * Triggered after Product Owner Acceptance.
 * Executes the full governance workflow:
 *   1. Ratify Engineering Record (authority_state → authoritative)
 *   2. Extract Engineering Knowledge → engineering_memory
 *   3. Generate Exports (Markdown, JSON, manifest)
 *   4. Establish Engineering Lineage
 *   5. Write Governance Log
 *   6. Mark governance_status = 'complete'
 *
 * Only this engine may create authoritative Engineering Records
 * after Product Owner Acceptance. Bolt never archives directly.
 */

import { supabase } from './supabase';

export type GovernancePhase =
  | 'ratify'
  | 'memory_extraction'
  | 'export_generation'
  | 'lineage'
  | 'complete';

export interface GovernanceResult {
  recordId: string;
  recordRef: string;
  success: boolean;
  phases: { phase: GovernancePhase; status: 'complete' | 'error'; message: string }[];
  error?: string;
}

// ─── Helper: log a governance phase ──────────────────────────────────────────

async function logPhase(
  recordId: string,
  ewoRef: string | null,
  phase: GovernancePhase,
  status: 'running' | 'complete' | 'error',
  message: string,
) {
  await supabase.from('engineering_governance_log').insert({
    record_id: recordId,
    ewo_ref:   ewoRef,
    phase,
    status,
    message,
  });
}

// ─── Phase 1: Ratify — mark authoritative, record acceptance ─────────────────

async function ratify(recordId: string, acceptedBy: string, statement: string) {
  const { error } = await supabase
    .from('engineering_records_library')
    .update({
      authority_state:         'authoritative',
      governance_status:       'running',
      po_accepted_at:          new Date().toISOString(),
      po_accepted_by:          acceptedBy,
      po_acceptance_statement: statement,
    })
    .eq('id', recordId);
  if (error) throw new Error(`Ratify: ${error.message}`);
}

// ─── Phase 2: Extract Engineering Knowledge → engineering_memory ──────────────

async function extractMemory(record: {
  id: string;
  record_ref: string;
  title: string;
  content: Record<string, unknown>;
  engineering_knowledge: Record<string, unknown> | null;
  semantic_metadata: Record<string, unknown> | null;
  technologies: string[] | null;
  complexity: string | null;
  risk_rating: string | null;
  ewo_ref: string | null;
}) {
  const entries: {
    record_ref: string;
    knowledge_category: string;
    knowledge_domain: string;
    title: string;
    content: string;
    tags: string[];
    authority_state: string;
  }[] = [];

  const summary = (record.content?.summary as string) ?? (record.content?.executive_summary as string) ?? '';
  const ek = record.engineering_knowledge as Record<string, unknown[]> | null;

  if (summary) {
    entries.push({
      record_ref:         record.record_ref,
      knowledge_category: 'implementation_strategy',
      knowledge_domain:   'constitutional-engineering',
      title:              `Implementation: ${record.title}`,
      content:            summary.slice(0, 1200),
      tags:               [record.ewo_ref ?? record.record_ref, 'governance', 'ewo-011.3'],
      authority_state:    'authoritative',
    });
  }

  if (ek?.lessons_learned?.length) {
    entries.push({
      record_ref:         record.record_ref,
      knowledge_category: 'lesson_learned',
      knowledge_domain:   'engineering-records',
      title:              `Lessons: ${record.title}`,
      content:            (ek.lessons_learned as string[]).join(' | ').slice(0, 800),
      tags:               [record.record_ref, 'lessons', 'governance'],
      authority_state:    'authoritative',
    });
  }

  if (ek?.architectural_decisions?.length) {
    entries.push({
      record_ref:         record.record_ref,
      knowledge_category: 'architecture',
      knowledge_domain:   'architecture',
      title:              `Architecture: ${record.title}`,
      content:            (ek.architectural_decisions as string[]).join(' | ').slice(0, 800),
      tags:               [record.record_ref, 'architecture', 'governance'],
      authority_state:    'authoritative',
    });
  }

  if (ek?.future_recommendations?.length) {
    entries.push({
      record_ref:         record.record_ref,
      knowledge_category: 'pattern',
      knowledge_domain:   'platform-governance',
      title:              `Recommendations: ${record.title}`,
      content:            (ek.future_recommendations as string[]).join(' | ').slice(0, 800),
      tags:               [record.record_ref, 'recommendations', 'governance'],
      authority_state:    'authoritative',
    });
  }

  if (record.risk_rating === 'high' || record.risk_rating === 'critical') {
    entries.push({
      record_ref:         record.record_ref,
      knowledge_category: 'known_risk',
      knowledge_domain:   'platform',
      title:              `Risk: ${record.title} (${record.risk_rating})`,
      content:            `Engineering record ${record.record_ref} was classified as ${record.risk_rating} risk. Technologies: ${(record.technologies ?? []).join(', ') || 'unspecified'}.`,
      tags:               [record.record_ref, 'risk', record.risk_rating ?? 'unknown'],
      authority_state:    'authoritative',
    });
  }

  if (entries.length > 0) {
    const { error } = await supabase.from('engineering_memory').insert(entries);
    if (error) throw new Error(`Memory extraction: ${error.message}`);
  }

  await supabase
    .from('engineering_records_library')
    .update({ engineering_memory_extracted: true, knowledge_extracted: true })
    .eq('id', record.id);
}

// ─── Phase 3: Generate Exports ────────────────────────────────────────────────

function buildMarkdown(record: {
  record_ref: string;
  title: string;
  ewo_ref: string | null;
  programme: string;
  completion_date: string | null;
  authority_state: string | null;
  complexity: string | null;
  risk_rating: string | null;
  estimated_effort: string | null;
  primary_engineer: string | null;
  product_owner: string | null;
  completion_report_ref: string | null;
  content: Record<string, unknown>;
  technologies: string[] | null;
  applications_affected: string[] | null;
}): string {
  const lines: string[] = [
    `# ${record.record_ref} — ${record.title}`,
    '',
    `**EWO Reference:** ${record.ewo_ref ?? 'N/A'}  `,
    `**Programme:** ${record.programme}  `,
    `**Completion Date:** ${record.completion_date ?? 'N/A'}  `,
    `**Authority State:** ${record.authority_state ?? 'N/A'}  `,
    `**Complexity:** ${record.complexity ?? 'N/A'}  `,
    `**Risk Rating:** ${record.risk_rating ?? 'N/A'}  `,
    `**Estimated Effort:** ${record.estimated_effort ?? 'N/A'}  `,
    `**Primary Engineer:** ${record.primary_engineer ?? 'EIOS-AGENT-001'}  `,
    `**Product Owner:** ${record.product_owner ?? 'N/A'}  `,
    '',
    '## Summary',
    '',
    String(record.content?.summary ?? record.content?.executive_summary ?? '—'),
    '',
    '## Technologies',
    '',
    (record.technologies ?? []).map(t => `- ${t}`).join('\n') || '— None recorded',
    '',
    '## Applications Affected',
    '',
    (record.applications_affected ?? []).map(a => `- ${a}`).join('\n') || '— None recorded',
    '',
    '---',
    `*Generated by Engineering Completion Governance Engine — EWO-011.3*  `,
    `*Completion Report Ref: ${record.completion_report_ref ?? 'N/A'}*`,
  ];
  return lines.join('\n');
}

async function generateExports(record: {
  id: string;
  record_ref: string;
  title: string;
  ewo_ref: string | null;
  programme: string;
  completion_date: string | null;
  authority_state: string | null;
  complexity: string | null;
  risk_rating: string | null;
  estimated_effort: string | null;
  primary_engineer: string | null;
  product_owner: string | null;
  completion_report_ref: string | null;
  content: Record<string, unknown>;
  technologies: string[] | null;
  applications_affected: string[] | null;
}) {
  const markdown = buildMarkdown(record);
  const jsonContent = JSON.stringify({
    record_ref:             record.record_ref,
    title:                  record.title,
    ewo_ref:                record.ewo_ref,
    programme:              record.programme,
    completion_date:        record.completion_date,
    authority_state:        record.authority_state,
    complexity:             record.complexity,
    risk_rating:            record.risk_rating,
    estimated_effort:       record.estimated_effort,
    primary_engineer:       record.primary_engineer,
    product_owner:          record.product_owner,
    completion_report_ref:  record.completion_report_ref,
    content:                record.content,
    technologies:           record.technologies,
    applications_affected:  record.applications_affected,
    generated_at:           new Date().toISOString(),
    generator:              'Engineering Completion Governance Engine',
    ewo_generator:          'EWO-011.3',
  }, null, 2);

  const manifest = JSON.stringify({
    record_ref:   record.record_ref,
    title:        record.title,
    exports: [
      { type: 'markdown',          filename: `${record.record_ref}.md`       },
      { type: 'json',              filename: `${record.record_ref}.json`     },
      { type: 'manifest',          filename: `${record.record_ref}.manifest.json` },
    ],
    generated_at: new Date().toISOString(),
  }, null, 2);

  const exports = [
    { record_id: record.id, export_type: 'markdown',  content: markdown,    file_size_bytes: markdown.length },
    { record_id: record.id, export_type: 'json',      content: jsonContent, file_size_bytes: jsonContent.length },
    { record_id: record.id, export_type: 'manifest',  content: manifest,    file_size_bytes: manifest.length },
  ];

  // Delete any prior exports for this record (idempotency)
  await supabase.from('engineering_record_exports').delete().eq('record_id', record.id);
  const { error } = await supabase.from('engineering_record_exports').insert(exports);
  if (error) throw new Error(`Export generation: ${error.message}`);

  const exportUrls = {
    markdown: `generated:${record.record_ref}.md`,
    json:     `generated:${record.record_ref}.json`,
    manifest: `generated:${record.record_ref}.manifest.json`,
  };
  await supabase
    .from('engineering_records_library')
    .update({ exports_generated: true, export_urls: exportUrls })
    .eq('id', record.id);
}

// ─── Phase 4: Establish Lineage ────────────────────────────────────────────────

async function establishLineage(record: {
  id: string;
  record_ref: string;
  ewo_ref: string | null;
}) {
  // Check if lineage already exists for this record
  const { data: existing } = await supabase
    .from('engineering_record_lineage')
    .select('id')
    .eq('from_record_ref', record.record_ref)
    .limit(1);

  if (!existing?.length && record.ewo_ref && record.ewo_ref !== record.record_ref) {
    await supabase.from('engineering_record_lineage').insert({
      from_record_id:   record.id,
      from_record_ref:  record.record_ref,
      to_ref:           record.ewo_ref,
      relationship_type:'related_ewo',
      notes:            `${record.record_ref} is an authoritative record for ${record.ewo_ref}`,
    });
  }

  await supabase
    .from('engineering_records_library')
    .update({ lineage_established: true })
    .eq('id', record.id);
}

// ─── Main Engine Entry Point ──────────────────────────────────────────────────

export async function runCompletionGovernance(
  recordId: string,
  options: {
    acceptedBy?: string;
    statement?: string;
  } = {},
): Promise<GovernanceResult> {
  const acceptedBy = options.acceptedBy ?? 'Product Owner';
  const statement  = options.statement  ?? 'Product Owner Accepted — Engineering Completion Governance Engine initiated.';

  const phases: GovernanceResult['phases'] = [];

  // Load the record
  const { data: record, error: loadErr } = await supabase
    .from('engineering_records_library')
    .select('*')
    .eq('id', recordId)
    .single();

  if (loadErr || !record) {
    return {
      recordId,
      recordRef: 'UNKNOWN',
      success: false,
      phases,
      error: loadErr?.message ?? 'Record not found',
    };
  }

  const ewoRef = record.ewo_ref as string | null;
  await supabase
    .from('engineering_records_library')
    .update({ governance_status: 'running' })
    .eq('id', recordId);

  // Phase 1: Ratify
  try {
    await logPhase(recordId, ewoRef, 'ratify', 'running', 'Ratifying Engineering Record — setting authority_state to authoritative');
    await ratify(recordId, acceptedBy, statement);
    await logPhase(recordId, ewoRef, 'ratify', 'complete', `Record ratified as authoritative. Accepted by: ${acceptedBy}`);
    phases.push({ phase: 'ratify', status: 'complete', message: 'Ratified as authoritative' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logPhase(recordId, ewoRef, 'ratify', 'error', msg);
    phases.push({ phase: 'ratify', status: 'error', message: msg });
    await supabase.from('engineering_records_library').update({ governance_status: 'error' }).eq('id', recordId);
    return { recordId, recordRef: record.record_ref, success: false, phases, error: msg };
  }

  // Phase 2: Memory Extraction
  try {
    await logPhase(recordId, ewoRef, 'memory_extraction', 'running', 'Extracting Engineering Knowledge into engineering_memory');
    await extractMemory(record as Parameters<typeof extractMemory>[0]);
    await logPhase(recordId, ewoRef, 'memory_extraction', 'complete', 'Engineering Knowledge extracted and persisted');
    phases.push({ phase: 'memory_extraction', status: 'complete', message: 'Knowledge extracted' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logPhase(recordId, ewoRef, 'memory_extraction', 'error', msg);
    phases.push({ phase: 'memory_extraction', status: 'error', message: msg });
  }

  // Phase 3: Export Generation
  try {
    await logPhase(recordId, ewoRef, 'export_generation', 'running', 'Generating Markdown, JSON, and manifest exports');
    await generateExports(record as Parameters<typeof generateExports>[0]);
    await logPhase(recordId, ewoRef, 'export_generation', 'complete', 'Exports generated: markdown, json, manifest');
    phases.push({ phase: 'export_generation', status: 'complete', message: 'Exports generated' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logPhase(recordId, ewoRef, 'export_generation', 'error', msg);
    phases.push({ phase: 'export_generation', status: 'error', message: msg });
  }

  // Phase 4: Lineage
  try {
    await logPhase(recordId, ewoRef, 'lineage', 'running', 'Establishing Engineering Lineage relationships');
    await establishLineage({ id: recordId, record_ref: record.record_ref, ewo_ref: ewoRef });
    await logPhase(recordId, ewoRef, 'lineage', 'complete', 'Lineage established');
    phases.push({ phase: 'lineage', status: 'complete', message: 'Lineage established' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logPhase(recordId, ewoRef, 'lineage', 'error', msg);
    phases.push({ phase: 'lineage', status: 'error', message: msg });
  }

  // Finalise
  const allOk = phases.every(p => p.status === 'complete');
  await supabase
    .from('engineering_records_library')
    .update({ governance_status: allOk ? 'complete' : 'error' })
    .eq('id', recordId);

  await logPhase(recordId, ewoRef, 'complete', allOk ? 'complete' : 'error',
    allOk
      ? `Governance complete for ${record.record_ref}. All phases succeeded.`
      : `Governance completed with errors for ${record.record_ref}. ${phases.filter(p => p.status === 'error').length} phase(s) failed.`
  );

  return {
    recordId,
    recordRef: record.record_ref,
    success:   allOk,
    phases,
  };
}

// ─── Batch run for all records missing governance ─────────────────────────────

export async function runGovernanceForPendingRecords(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const { data: pending } = await supabase
    .from('engineering_records_library')
    .select('id, record_ref')
    .eq('authority_state', 'authoritative')
    .eq('governance_status', 'pending');

  let succeeded = 0;
  let failed    = 0;

  for (const rec of pending ?? []) {
    const result = await runCompletionGovernance(rec.id, {
      acceptedBy: 'System — EWO-011.3 Backfill',
      statement:  'Retrospective governance applied via EWO-011.3 Completion Governance Engine.',
    });
    if (result.success) succeeded++;
    else failed++;
  }

  return { processed: (pending ?? []).length, succeeded, failed };
}
