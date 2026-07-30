/**
 * Engineering Intelligence Orchestrator (EIO)
 *
 * Executes the complete engineering intelligence pipeline in the correct order:
 *   EIG → ELPM → ERIE → EINE
 *
 * The frozen Engineering Intelligence Report becomes the primary source of truth
 * supplied to the AI Technical Director. The AI explains intelligence; it does
 * not recreate it.
 *
 * Pipeline stages are logged and exposed for diagnostic display.
 */

import type { EngineeringReview } from '../pages/ecc/ECCEngineeringReviewsPage';
import { loadGraphData } from './eigService';
import { generateELPMReport, type ELPMReport } from './elpmEngine';
import { generateIntelligenceReport, type IntelligenceReport } from './reviewIntelligenceEngine';
import { generateEINEReport, serializeEINEReportForAI, type EINEReport } from './eineEngine';

export const EIO_VERSION = '1.0';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EIOStageStatus = 'pending' | 'running' | 'complete' | 'error';

export interface EIOStage {
  key: string;
  label: string;
  status: EIOStageStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  detail: string | null;
  error: string | null;
}

export interface EIOResult {
  intelligence: IntelligenceReport;
  elpm: ELPMReport;
  eine: EINEReport;
  eine_serialized: string;
  pipeline_log: EIOStage[];
  completed_at: string;
  eio_version: string;
}

// ─── Pipeline definition ──────────────────────────────────────────────────────

const PIPELINE: Array<{ key: string; label: string }> = [
  { key: 'eig',  label: 'Engineering Intelligence Graph' },
  { key: 'elpm', label: 'Learning, Precedent & Memory Engine' },
  { key: 'erie', label: 'Review Intelligence Engine' },
  { key: 'eine', label: 'Intelligence Narrative Engine' },
  { key: 'freeze', label: 'Freeze Intelligence Report' },
];

export function makeInitialStages(): EIOStage[] {
  return PIPELINE.map(p => ({
    key: p.key,
    label: p.label,
    status: 'pending',
    started_at: null,
    completed_at: null,
    duration_ms: null,
    detail: null,
    error: null,
  }));
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function runEIOPipeline(
  review: EngineeringReview,
  onProgress?: (stages: EIOStage[]) => void,
): Promise<EIOResult> {
  const stages = makeInitialStages();
  const notify = () => onProgress?.([...stages]);

  function start(key: string) {
    const s = stages.find(x => x.key === key)!;
    s.status = 'running';
    s.started_at = new Date().toISOString();
    notify();
  }

  function done(key: string, detail: string) {
    const s = stages.find(x => x.key === key)!;
    s.status = 'complete';
    s.completed_at = new Date().toISOString();
    s.duration_ms = s.started_at
      ? new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()
      : null;
    s.detail = detail;
    notify();
  }

  function fail(key: string, error: string) {
    const s = stages.find(x => x.key === key)!;
    s.status = 'error';
    s.completed_at = new Date().toISOString();
    s.error = error;
    notify();
  }

  // ── Stage 1: EIG ────────────────────────────────────────────────────────────
  start('eig');
  const graph = await loadGraphData();
  done('eig', `${graph.entities.length} entities · ${graph.relationships.length} relationships loaded`);

  // ── Stage 2: ELPM ───────────────────────────────────────────────────────────
  start('elpm');
  const elpm = await generateELPMReport({
    id: review.id,
    erc_number: review.erc_number,
    title: review.title,
    type: review.type,
    engineering_area: review.engineering_area,
    executive_summary: review.executive_summary,
    related_features: review.related_features,
    related_releases: review.related_releases,
    related_test_plans: review.related_test_plans,
    related_audits: review.related_audits,
    related_decisions: review.related_decisions,
    related_ercs: review.related_ercs,
    metadata: review.metadata,
  });
  done(
    'elpm',
    `${elpm.similar_artefacts.length} similar artefacts · ${elpm.memory_entries.length} memory entries · ${elpm.conversation_intelligence.length} conversation signals`,
  );

  // ── Stage 3: ERIE ───────────────────────────────────────────────────────────
  start('erie');
  const intelligence = await generateIntelligenceReport(
    {
      id: review.id,
      erc_number: review.erc_number,
      title: review.title,
      type: review.type,
      engineering_area: review.engineering_area,
      executive_summary: review.executive_summary,
      related_audits: review.related_audits,
      related_features: review.related_features,
      related_releases: review.related_releases,
      related_test_plans: review.related_test_plans,
      related_decisions: review.related_decisions,
      related_phases: review.related_phases,
      metadata: review.metadata,
    },
    graph.entities,
    graph.relationships,
  );
  done(
    'erie',
    `${intelligence.eig_analysis.entities_analysed} entities analysed · quality score ${intelligence.intelligence_quality_score}/100 · ${intelligence.risk_register.length} risks`,
  );

  // ── Stage 4: EINE ───────────────────────────────────────────────────────────
  start('eine');
  const eine = generateEINEReport(review, elpm, intelligence);
  done(
    'eine',
    `${eine.sections.filter(s => s.has_data).length} of ${eine.sections.length} sections populated · overall confidence ${Math.round(eine.overall_confidence * 100)}%`,
  );

  // ── Stage 5: Freeze ─────────────────────────────────────────────────────────
  start('freeze');
  const eine_serialized = serializeEINEReportForAI(eine);
  done('freeze', `Intelligence Report frozen · ${eine_serialized.length.toLocaleString()} characters`);

  console.log('[EIO] Pipeline complete', {
    eio_version: EIO_VERSION,
    review_id: review.id,
    erc_number: review.erc_number,
    stages: stages.map(s => `${s.key}:${s.status}${s.duration_ms ? ` (${s.duration_ms}ms)` : ''}`).join(' → '),
  });

  return {
    intelligence,
    elpm,
    eine,
    eine_serialized,
    pipeline_log: [...stages],
    completed_at: new Date().toISOString(),
    eio_version: EIO_VERSION,
  };
}
