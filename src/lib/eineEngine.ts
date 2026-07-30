/**
 * Engineering Intelligence Narrative Engine (EINE)
 *
 * Transforms structured engineering intelligence from ERIE + ELPM
 * into rich, evidence-driven Engineering Review narratives.
 *
 * No new analysis — pure deterministic conversion of structured data
 * into 23 mandatory Engineering Review sections.
 */

import type { IntelligenceReport } from './reviewIntelligenceEngine';
import type { ELPMReport } from './elpmEngine';
import type { EngineeringReview } from '../pages/ecc/ECCEngineeringReviewsPage';

export const EINE_VERSION = '1.0';

// ─── Block Types ──────────────────────────────────────────────────────────────

export type NarrativeBlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'metric'
  | 'badge'
  | 'evidence'
  | 'empty'
  | 'timeline'
  | 'chain'
  | 'table';

export interface NarrativeBlock {
  type: NarrativeBlockType;
  content?: string;
  items?: string[];
  value?: string | number;
  label?: string;
  variant?: 'info' | 'success' | 'warning' | 'error' | 'neutral';
  entries?: Array<{
    label: string;
    value: string;
    sub?: string;
    status?: 'present' | 'missing' | 'active' | 'superseded' | 'archived';
  }>;
  columns?: string[];
  rows?: string[][];
}

export interface EINESection {
  id: string;
  title: string;
  blocks: NarrativeBlock[];
  has_data: boolean;
  confidence: number | null; // 0–1 or null if N/A
}

export interface IntelligenceSources {
  erie_present: boolean;
  elpm_present: boolean;
  eig_entities: number;
  eig_relationships: number;
  memory_entries: number;
  similar_artefacts: number;
  conversation_signals: number;
}

export interface EINEReport {
  sections: EINESection[];
  overall_confidence: number; // 0–1
  intelligence_sources: IntelligenceSources;
  generated_at: string;
  eine_version: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_BLOCK: NarrativeBlock = {
  type: 'empty',
  content: 'No relevant historical evidence identified.',
};

function emptySection(id: string, title: string): EINESection {
  return { id, title, blocks: [EMPTY_BLOCK], has_data: false, confidence: null };
}

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

function conf(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function severityVariant(s: string): NarrativeBlock['variant'] {
  if (s === 'critical' || s === 'high') return 'error';
  if (s === 'medium') return 'warning';
  return 'info';
}

// ─── Section Builders ─────────────────────────────────────────────────────────

function buildExecutiveSummary(review: EngineeringReview, intelligence: IntelligenceReport | null, elpm: ELPMReport | null): EINESection {
  const blocks: NarrativeBlock[] = [];

  if (review.executive_summary) {
    blocks.push({ type: 'paragraph', content: review.executive_summary });
  }

  if (intelligence?.executive_brief) {
    const eb = intelligence.executive_brief as Record<string, unknown>;
    if (eb.why_it_matters) blocks.push({ type: 'paragraph', content: `Why it matters: ${eb.why_it_matters}` });
    if (eb.recommendation) blocks.push({ type: 'badge', label: 'Recommendation', content: String(eb.recommendation), variant: 'info' });
    if (eb.next_action) blocks.push({ type: 'paragraph', content: `Next action: ${eb.next_action}` });
  }

  if (blocks.length === 0) return emptySection('executive_summary', 'Executive Summary');
  return { id: 'executive_summary', title: 'Executive Summary', blocks, has_data: true, confidence: null };
}

function buildEngineeringIntelligenceSummary(intelligence: IntelligenceReport | null): EINESection {
  if (!intelligence?.eig_analysis) return emptySection('engineering_intelligence_summary', 'Engineering Intelligence Summary');

  const a = intelligence.eig_analysis;
  const blocks: NarrativeBlock[] = [
    { type: 'heading', content: 'Graph Analysis' },
    {
      type: 'table',
      columns: ['Metric', 'Value'],
      rows: [
        ['Entities Analysed', String(a.entities_analysed)],
        ['Relationships Traversed', String(a.relationships_traversed)],
        ['Dependency Depth', String(a.dependency_depth)],
        ['Impact Radius', String(a.impact_radius)],
        ['Graph Confidence', conf(a.graph_confidence)],
        ['Analysis Timestamp', new Date(a.analysed_at).toLocaleString()],
      ],
    },
  ];

  if (a.connected_systems?.length) {
    blocks.push({ type: 'heading', content: 'Connected Systems' });
    blocks.push({ type: 'list', items: a.connected_systems });
  }

  if (a.entity_type_breakdown && Object.keys(a.entity_type_breakdown).length > 0) {
    blocks.push({ type: 'heading', content: 'Entity Type Breakdown' });
    blocks.push({
      type: 'table',
      columns: ['Entity Type', 'Count'],
      rows: Object.entries(a.entity_type_breakdown).map(([k, v]) => [k, String(v)]),
    });
  }

  return { id: 'engineering_intelligence_summary', title: 'Engineering Intelligence Summary', blocks, has_data: true, confidence: a.graph_confidence };
}

function buildHistoricalAnalysis(elpm: ELPMReport | null): EINESection {
  if (!elpm?.similar_artefacts?.length) return emptySection('historical_analysis', 'Historical Analysis');

  const blocks: NarrativeBlock[] = [
    { type: 'metric', label: 'Similar Artefacts Found', value: elpm.similar_artefacts.length },
  ];

  for (const a of elpm.similar_artefacts.slice(0, 5)) {
    blocks.push({
      type: 'evidence',
      label: `${a.ref} — ${a.title}`,
      content: `Similarity: ${a.similarity_score}% | ${a.similarity_reason}`,
      variant: a.similarity_score >= 70 ? 'success' : a.similarity_score >= 40 ? 'info' : 'neutral',
    });
  }

  return { id: 'historical_analysis', title: 'Historical Analysis', blocks, has_data: true, confidence: elpm.historical_confidence?.historical_confidence ?? null };
}

function buildLearningSummary(elpm: ELPMReport | null): EINESection {
  if (!elpm?.learning_summary) return emptySection('learning_summary', 'Learning Summary');
  const ls = elpm.learning_summary;

  const blocks: NarrativeBlock[] = [];

  if (ls.previous_approaches?.length) {
    blocks.push({ type: 'heading', content: 'Previous Approaches' });
    blocks.push({ type: 'list', items: ls.previous_approaches });
  }
  if (ls.previous_decisions?.length) {
    blocks.push({ type: 'heading', content: 'Previous Engineering Decisions' });
    blocks.push({ type: 'list', items: ls.previous_decisions });
  }
  if (ls.previous_challenges?.length) {
    blocks.push({ type: 'heading', content: 'Previous Challenges' });
    blocks.push({ type: 'list', items: ls.previous_challenges });
  }
  if (ls.previous_regressions?.length) {
    blocks.push({ type: 'heading', content: 'Previous Regressions' });
    blocks.push({ type: 'list', items: ls.previous_regressions });
  }
  if (ls.lessons_applied?.length) {
    blocks.push({ type: 'heading', content: 'Lessons Applied' });
    blocks.push({ type: 'list', items: ls.lessons_applied });
  }
  blocks.push({ type: 'metric', label: 'Learning Sources', value: ls.learning_sources });

  if (blocks.length === 1 && blocks[0].type === 'metric' && blocks[0].value === 0) {
    return emptySection('learning_summary', 'Learning Summary');
  }

  return { id: 'learning_summary', title: 'Learning Summary', blocks, has_data: true, confidence: null };
}

function buildConversationIntelligenceSummary(elpm: ELPMReport | null): EINESection {
  if (!elpm?.conversation_intelligence?.length) return emptySection('conversation_intelligence', 'Conversation Intelligence');

  const blocks: NarrativeBlock[] = [
    { type: 'metric', label: 'Conversation Signals', value: elpm.conversation_intelligence.length },
  ];

  const decisions = elpm.learning_summary?.conversation_decisions ?? [];
  const lessons = elpm.learning_summary?.conversation_lessons ?? [];
  const recs = elpm.learning_summary?.conversation_recommendations ?? [];

  if (decisions.length) {
    blocks.push({ type: 'heading', content: 'Decisions from Conversations' });
    blocks.push({ type: 'list', items: decisions });
  }
  if (lessons.length) {
    blocks.push({ type: 'heading', content: 'Lessons from Conversations' });
    blocks.push({ type: 'list', items: lessons });
  }
  if (recs.length) {
    blocks.push({ type: 'heading', content: 'Recommendations from Conversations' });
    blocks.push({ type: 'list', items: recs });
  }

  return { id: 'conversation_intelligence', title: 'Conversation Intelligence', blocks, has_data: true, confidence: null };
}

function buildPODecisionsApplied(elpm: ELPMReport | null): EINESection {
  const poDecisions = elpm?.learning_summary?.previous_po_decisions ?? [];
  const applied = elpm?.historical_comparison?.po_decisions_applied ?? [];
  const all = [...new Set([...poDecisions, ...applied])];

  if (!all.length) return emptySection('po_decisions', 'PO Decisions Applied');

  const blocks: NarrativeBlock[] = [
    { type: 'metric', label: 'PO Decisions Applied', value: all.length },
    { type: 'list', items: all },
  ];

  return { id: 'po_decisions', title: 'PO Decisions Applied', blocks, has_data: true, confidence: null };
}

function buildEngineeringMemoryApplied(elpm: ELPMReport | null): EINESection {
  if (!elpm?.memory_entries?.length) return emptySection('engineering_memory', 'Engineering Memory Applied');

  const blocks: NarrativeBlock[] = [
    { type: 'metric', label: 'Memory Entries Applied', value: elpm.memory_entries.length },
  ];

  for (const m of elpm.memory_entries.filter(e => !e.is_superseded).slice(0, 8)) {
    blocks.push({
      type: 'evidence',
      label: m.title,
      content: `${m.content} [Weight: ${m.weight}/5 | Source: ${m.source_ref}]`,
      variant: m.weight >= 4 ? 'warning' : 'info',
    });
  }

  return { id: 'engineering_memory', title: 'Engineering Memory Applied', blocks, has_data: true, confidence: null };
}

function buildSimilarWork(elpm: ELPMReport | null): EINESection {
  if (!elpm?.similar_artefacts?.length) return emptySection('similar_work', 'Similar Work');

  const blocks: NarrativeBlock[] = [];

  if (elpm.top_similar) {
    blocks.push({
      type: 'evidence',
      label: `Top Match: ${elpm.top_similar.ref} — ${elpm.top_similar.title}`,
      content: `${elpm.top_similar.similarity_score}% similarity | ${elpm.top_similar.similarity_reason} | Outcome: ${elpm.top_similar.outcome ?? 'unknown'}`,
      variant: 'success',
    });
  }

  blocks.push({
    type: 'table',
    columns: ['Ref', 'Title', 'Type', 'Similarity', 'Status'],
    rows: elpm.similar_artefacts.slice(0, 10).map(a => [
      a.ref,
      a.title.length > 40 ? a.title.slice(0, 40) + '…' : a.title,
      a.artefact_type,
      `${a.similarity_score}%`,
      a.status,
    ]),
  });

  return { id: 'similar_work', title: 'Similar Work', blocks, has_data: true, confidence: null };
}

function buildReusableAssets(elpm: ELPMReport | null): EINESection {
  if (!elpm?.reusable_assets?.length) return emptySection('reusable_assets', 'Reusable Assets');

  const blocks: NarrativeBlock[] = [
    { type: 'metric', label: 'Reusable Assets Identified', value: elpm.reusable_assets.length },
  ];

  for (const a of elpm.reusable_assets) {
    blocks.push({
      type: 'evidence',
      label: `${a.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: ${a.title}`,
      content: `${a.reuse_recommendation}${a.source_review_ref ? ` | Source: ${a.source_review_ref}` : ''}`,
      variant: a.confidence >= 0.7 ? 'success' : 'info',
    });
  }

  return { id: 'reusable_assets', title: 'Reusable Assets', blocks, has_data: true, confidence: null };
}

function buildEngineeringLineage(elpm: ELPMReport | null): EINESection {
  if (!elpm?.engineering_lineage?.lineage_chain?.length && !elpm?.engineering_lineage?.current_baseline) {
    return emptySection('engineering_lineage', 'Engineering Lineage');
  }

  const lin = elpm.engineering_lineage;
  const blocks: NarrativeBlock[] = [];

  if (lin.revision_count > 0) {
    blocks.push({ type: 'metric', label: 'Revisions', value: lin.revision_count });
  }

  if (lin.evolution_description) {
    blocks.push({ type: 'paragraph', content: lin.evolution_description });
  }

  if (lin.lineage_chain?.length) {
    blocks.push({ type: 'heading', content: 'Lineage Chain' });
    blocks.push({
      type: 'chain',
      entries: lin.lineage_chain.map(e => ({
        label: e.ref,
        value: e.title,
        sub: `${e.relationship} · ${e.engineering_area ?? 'General'} · ${e.created_at.slice(0, 10)}`,
        status: e.status as 'active' | 'superseded' | 'archived',
      })),
    });
  }

  return { id: 'engineering_lineage', title: 'Engineering Lineage', blocks, has_data: true, confidence: null };
}

function buildRecommendationEvolution(elpm: ELPMReport | null): EINESection {
  if (!elpm?.recommendation_evolution) return emptySection('recommendation_evolution', 'Recommendation Evolution');
  const ev = elpm.recommendation_evolution;

  const blocks: NarrativeBlock[] = [];

  if (ev.previous_recommendation) {
    blocks.push({ type: 'evidence', label: `Previous (${ev.previous_review_ref ?? 'N/A'})`, content: ev.previous_recommendation, variant: 'neutral' });
  }
  blocks.push({ type: 'evidence', label: 'Current Recommendation', content: ev.current_recommendation, variant: 'success' });

  if (ev.why_changed) {
    blocks.push({ type: 'paragraph', content: `Why changed: ${ev.why_changed}` });
  }

  if (ev.supporting_evidence?.length) {
    blocks.push({ type: 'heading', content: 'Supporting Evidence' });
    blocks.push({ type: 'list', items: ev.supporting_evidence });
  }

  blocks.push({ type: 'badge', label: 'Evolution Maturity', content: ev.evolution_maturity.replace(/_/g, ' '), variant: 'info' });

  return { id: 'recommendation_evolution', title: 'Recommendation Evolution', blocks, has_data: true, confidence: null };
}

function buildHistoricalComparison(elpm: ELPMReport | null): EINESection {
  if (!elpm?.historical_comparison) return emptySection('historical_comparison', 'Historical Comparison');
  const hc = elpm.historical_comparison;

  const blocks: NarrativeBlock[] = [];

  const hasContent = [
    hc.new_intelligence, hc.new_risks, hc.new_dependencies,
    hc.lessons_reused, hc.improvements,
  ].some(a => a?.length);

  if (!hasContent) return emptySection('historical_comparison', 'Historical Comparison');

  if (hc.new_intelligence?.length) {
    blocks.push({ type: 'heading', content: 'New Intelligence vs. Previous' });
    blocks.push({ type: 'list', items: hc.new_intelligence });
  }
  if (hc.new_risks?.length) {
    blocks.push({ type: 'heading', content: 'New Risks Identified' });
    blocks.push({ type: 'list', items: hc.new_risks });
  }
  if (hc.new_dependencies?.length) {
    blocks.push({ type: 'heading', content: 'New Dependencies vs. Previous' });
    blocks.push({ type: 'list', items: hc.new_dependencies });
  }
  if (hc.lessons_reused?.length) {
    blocks.push({ type: 'heading', content: 'Lessons Reused' });
    blocks.push({ type: 'list', items: hc.lessons_reused });
  }
  if (hc.improvements?.length) {
    blocks.push({ type: 'heading', content: 'Improvements vs. Previous Review' });
    blocks.push({ type: 'list', items: hc.improvements });
  }

  return { id: 'historical_comparison', title: 'Historical Comparison', blocks, has_data: true, confidence: null };
}

function buildDependencyAnalysis(intelligence: IntelligenceReport | null): EINESection {
  if (!intelligence?.dependency_analysis) return emptySection('dependency_analysis', 'Dependency Analysis');
  const da = intelligence.dependency_analysis;

  if (da.total_dependencies === 0) return emptySection('dependency_analysis', 'Dependency Analysis');

  const blocks: NarrativeBlock[] = [
    { type: 'metric', label: 'Total Dependencies', value: da.total_dependencies },
  ];

  const groups: Array<[string, Array<{ name: string; type: string; status: string }>]> = [
    ['Engineering Reviews', da.engineering_reviews],
    ['Missions', da.missions],
    ['Specifications', da.specifications],
    ['Releases', da.releases],
    ['Test Plans', da.test_plans],
    ['Benchmarks', da.benchmarks],
    ['Risks', da.risks],
    ['Platform Modules', da.platform_modules],
    ['Database Tables', da.database_tables],
    ['API Endpoints', da.api_endpoints],
    ['Components', da.components],
    ['Technical Debt', da.technical_debt],
    ['Roadmap Items', da.roadmap_items],
  ];

  for (const [label, items] of groups) {
    if (items?.length) {
      blocks.push({ type: 'heading', content: label });
      blocks.push({
        type: 'table',
        columns: ['Name', 'Type', 'Status'],
        rows: items.map(i => [i.name, i.type, i.status]),
      });
    }
  }

  return { id: 'dependency_analysis', title: 'Dependency Analysis', blocks, has_data: true, confidence: null };
}

function buildImpactAnalysis(intelligence: IntelligenceReport | null): EINESection {
  if (!intelligence?.impact_analysis) return emptySection('impact_analysis', 'Impact Analysis');
  const ia = intelligence.impact_analysis;

  const blocks: NarrativeBlock[] = [
    {
      type: 'table',
      columns: ['Metric', 'Value'],
      rows: [
        ['Complexity Score', `${ia.complexity_score}/10`],
        ['Effort Estimate', ia.effort_estimate],
        ['Regression Risk', ia.regression_risk],
        ['Governance Impact', ia.governance_impact],
        ['Release Impact', ia.release_impact],
      ],
    },
  ];

  if (ia.affected_systems?.length) {
    blocks.push({ type: 'heading', content: 'Affected Systems' });
    blocks.push({ type: 'list', items: ia.affected_systems });
  }
  if (ia.affected_components?.length) {
    blocks.push({ type: 'heading', content: 'Affected Components' });
    blocks.push({ type: 'list', items: ia.affected_components });
  }
  if (ia.affected_db_tables?.length) {
    blocks.push({ type: 'heading', content: 'Affected Database Tables' });
    blocks.push({ type: 'list', items: ia.affected_db_tables });
  }
  if (ia.affected_api_endpoints?.length) {
    blocks.push({ type: 'heading', content: 'Affected API Endpoints' });
    blocks.push({ type: 'list', items: ia.affected_api_endpoints });
  }
  if (ia.affected_test_plans?.length) {
    blocks.push({ type: 'heading', content: 'Affected Test Plans' });
    blocks.push({ type: 'list', items: ia.affected_test_plans });
  }
  if (ia.affected_releases?.length) {
    blocks.push({ type: 'heading', content: 'Affected Releases' });
    blocks.push({ type: 'list', items: ia.affected_releases });
  }
  if (ia.affected_governance?.length) {
    blocks.push({ type: 'heading', content: 'Affected Governance' });
    blocks.push({ type: 'list', items: ia.affected_governance });
  }

  return { id: 'impact_analysis', title: 'Impact Analysis', blocks, has_data: true, confidence: null };
}

function buildRiskRegister(intelligence: IntelligenceReport | null, elpm: ELPMReport | null): EINESection {
  const erieRisks = intelligence?.risk_register ?? [];
  const historicalRisks = elpm?.historical_risk_summary;

  if (!erieRisks.length && !historicalRisks) return emptySection('risk_register', 'Risk Register');

  const blocks: NarrativeBlock[] = [];

  if (erieRisks.length) {
    blocks.push({ type: 'metric', label: 'Current Risks', value: erieRisks.length });
    for (const r of erieRisks) {
      blocks.push({
        type: 'evidence',
        label: r.description,
        content: `Likelihood: ${r.likelihood} | Impact: ${r.impact} | Severity: ${r.severity} | ${r.mitigation} | Owner: ${r.owner} | Status: ${r.status}`,
        variant: severityVariant(r.severity),
      });
    }
  }

  if (historicalRisks) {
    if (historicalRisks.common_implementation_risks?.length) {
      blocks.push({ type: 'heading', content: 'Historical: Common Implementation Risks' });
      blocks.push({ type: 'list', items: historicalRisks.common_implementation_risks });
    }
    if (historicalRisks.common_regression_causes?.length) {
      blocks.push({ type: 'heading', content: 'Historical: Common Regression Causes' });
      blocks.push({ type: 'list', items: historicalRisks.common_regression_causes });
    }
    if (historicalRisks.frequently_impacted_modules?.length) {
      blocks.push({ type: 'heading', content: 'Historical: Frequently Impacted Modules' });
      blocks.push({ type: 'list', items: historicalRisks.frequently_impacted_modules });
    }
    if (historicalRisks.repeated_governance_findings?.length) {
      blocks.push({ type: 'heading', content: 'Historical: Repeated Governance Findings' });
      blocks.push({ type: 'list', items: historicalRisks.repeated_governance_findings });
    }
  }

  return { id: 'risk_register', title: 'Risk Register', blocks, has_data: true, confidence: null };
}

function buildReleaseReadiness(intelligence: IntelligenceReport | null): EINESection {
  if (!intelligence?.release_readiness) return emptySection('release_readiness', 'Release Readiness');
  const rr = intelligence.release_readiness;

  const blocks: NarrativeBlock[] = [
    {
      type: 'badge',
      label: 'Overall Release Readiness',
      content: rr.overall_ready ? 'Ready' : 'Not Ready',
      variant: rr.overall_ready ? 'success' : 'error',
    },
  ];

  if (rr.gates?.length) {
    blocks.push({ type: 'heading', content: 'Release Gates' });
    blocks.push({
      type: 'table',
      columns: ['Gate', 'Status', 'Note'],
      rows: rr.gates.map(g => [g.gate, g.ready ? 'Pass' : 'Fail', g.note]),
    });
  }
  if (rr.blockers?.length) {
    blocks.push({ type: 'heading', content: 'Blockers' });
    blocks.push({ type: 'list', items: rr.blockers });
  }
  if (rr.missing_evidence?.length) {
    blocks.push({ type: 'heading', content: 'Missing Evidence' });
    blocks.push({ type: 'list', items: rr.missing_evidence });
  }
  if (rr.outstanding_risks?.length) {
    blocks.push({ type: 'heading', content: 'Outstanding Risks' });
    blocks.push({ type: 'list', items: rr.outstanding_risks });
  }
  if (rr.outstanding_docs?.length) {
    blocks.push({ type: 'heading', content: 'Outstanding Documentation' });
    blocks.push({ type: 'list', items: rr.outstanding_docs });
  }
  if (rr.outstanding_testing?.length) {
    blocks.push({ type: 'heading', content: 'Outstanding Testing' });
    blocks.push({ type: 'list', items: rr.outstanding_testing });
  }

  return { id: 'release_readiness', title: 'Release Readiness', blocks, has_data: true, confidence: null };
}

function buildTestingAssessment(intelligence: IntelligenceReport | null, elpm: ELPMReport | null): EINESection {
  const ta = intelligence?.testing_assessment;
  const historicalTesting = elpm?.historical_risk_summary?.frequently_missing_testing ?? [];

  if (!ta && !historicalTesting.length) return emptySection('testing_assessment', 'Testing Assessment');

  const blocks: NarrativeBlock[] = [];

  if (ta) {
    blocks.push({
      type: 'table',
      columns: ['Metric', 'Value'],
      rows: [
        ['Coverage', pct(ta.coverage_pct)],
        ['Regression Required', ta.regression_required ? 'Yes' : 'No'],
      ],
    });
    if (ta.existing_plans?.length) {
      blocks.push({ type: 'heading', content: 'Existing Test Plans' });
      blocks.push({ type: 'list', items: ta.existing_plans });
    }
    if (ta.missing_plans?.length) {
      blocks.push({ type: 'heading', content: 'Missing Test Plans' });
      blocks.push({ type: 'list', items: ta.missing_plans });
    }
    if (ta.recommended_activities?.length) {
      blocks.push({ type: 'heading', content: 'Recommended Testing Activities' });
      blocks.push({ type: 'list', items: ta.recommended_activities });
    }
  }

  if (historicalTesting.length) {
    blocks.push({ type: 'heading', content: 'Historical: Frequently Missing Testing' });
    blocks.push({ type: 'list', items: historicalTesting });
  }

  return { id: 'testing_assessment', title: 'Testing Assessment', blocks, has_data: true, confidence: null };
}

function buildDocumentationAssessment(intelligence: IntelligenceReport | null, elpm: ELPMReport | null): EINESection {
  const da = intelligence?.documentation_assessment;
  const historicalDocs = elpm?.historical_risk_summary?.frequently_missing_docs ?? [];

  if (!da && !historicalDocs.length) return emptySection('documentation_assessment', 'Documentation Assessment');

  const blocks: NarrativeBlock[] = [];

  if (da) {
    if (da.existing?.length) {
      blocks.push({ type: 'heading', content: 'Existing Documentation' });
      blocks.push({ type: 'list', items: da.existing });
    }
    if (da.missing?.length) {
      blocks.push({ type: 'heading', content: 'Missing Documentation' });
      blocks.push({ type: 'list', items: da.missing });
    }
    if (da.updates_required?.length) {
      blocks.push({ type: 'heading', content: 'Updates Required' });
      blocks.push({ type: 'list', items: da.updates_required });
    }
    if (da.recommended_specs?.length) {
      blocks.push({ type: 'heading', content: 'Recommended Specs' });
      blocks.push({ type: 'list', items: da.recommended_specs });
    }
  }

  if (historicalDocs.length) {
    blocks.push({ type: 'heading', content: 'Historical: Frequently Missing Docs' });
    blocks.push({ type: 'list', items: historicalDocs });
  }

  return { id: 'documentation_assessment', title: 'Documentation Assessment', blocks, has_data: true, confidence: null };
}

function buildEngineeringTraceability(intelligence: IntelligenceReport | null): EINESection {
  if (!intelligence?.traceability) return emptySection('engineering_traceability', 'Engineering Traceability');
  const tr = intelligence.traceability;

  const blocks: NarrativeBlock[] = [
    {
      type: 'table',
      columns: ['Metric', 'Value'],
      rows: [
        ['Completeness', pct(tr.completeness_pct)],
        ['Missing Links', String(tr.missing_links?.length ?? 0)],
      ],
    },
  ];

  if (tr.chain?.length) {
    blocks.push({ type: 'heading', content: 'Traceability Chain' });
    blocks.push({
      type: 'chain',
      entries: tr.chain.map(c => ({
        label: c.layer,
        value: c.entity ?? 'Not linked',
        sub: c.entity_ref ?? undefined,
        status: c.status,
      })),
    });
  }

  if (tr.missing_links?.length) {
    blocks.push({ type: 'heading', content: 'Missing Links' });
    blocks.push({ type: 'list', items: tr.missing_links });
  }

  return { id: 'engineering_traceability', title: 'Engineering Traceability', blocks, has_data: true, confidence: tr.completeness_pct / 100 };
}

function buildQualityAssessment(intelligence: IntelligenceReport | null): EINESection {
  if (intelligence?.intelligence_quality_score == null) return emptySection('quality_assessment', 'Intelligence Quality Assessment');

  const breakdown = intelligence.intelligence_quality_breakdown as Record<string, number> | null;

  const blocks: NarrativeBlock[] = [
    { type: 'metric', label: 'Overall Quality Score', value: pct(intelligence.intelligence_quality_score) },
  ];

  if (breakdown) {
    blocks.push({
      type: 'table',
      columns: ['Dimension', 'Score'],
      rows: Object.entries(breakdown).map(([k, v]) => [
        k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        pct(typeof v === 'number' ? v : 0),
      ]),
    });
  }

  return { id: 'quality_assessment', title: 'Intelligence Quality Assessment', blocks, has_data: true, confidence: intelligence.intelligence_quality_score / 100 };
}

function buildAIReasoningSummary(intelligence: IntelligenceReport | null): EINESection {
  if (!intelligence?.ai_reasoning) return emptySection('ai_reasoning', 'AI Reasoning Summary');
  const ai = intelligence.ai_reasoning;

  const blocks: NarrativeBlock[] = [
    { type: 'metric', label: 'Evidence Count', value: ai.evidence_count },
    { type: 'metric', label: 'Confidence', value: conf(ai.confidence_score) },
  ];

  if (ai.reasoning_summary) {
    blocks.push({ type: 'paragraph', content: ai.reasoning_summary });
  }

  const src = ai.sources_used;
  if (src) {
    blocks.push({ type: 'heading', content: 'Sources Used' });
    blocks.push({
      type: 'table',
      columns: ['Source', 'Count'],
      rows: [
        ['EIG Entities', String(src.eig_entities)],
        ['EIG Relationships', String(src.eig_relationships)],
        ['Engineering Reviews', String(src.engineering_reviews)],
        ['Specifications', String(src.specifications)],
        ['Releases', String(src.releases)],
        ['Test Plans', String(src.test_plans)],
        ['Benchmarks', String(src.benchmarks)],
        ['Risks', String(src.risks)],
      ],
    });
  }

  return { id: 'ai_reasoning', title: 'AI Reasoning Summary', blocks, has_data: true, confidence: ai.confidence_score };
}

function buildConfidenceSummary(intelligence: IntelligenceReport | null, elpm: ELPMReport | null): EINESection {
  const hc = elpm?.historical_confidence;
  const aiConf = intelligence?.ai_reasoning?.confidence_score ?? null;
  const qualityScore = intelligence?.intelligence_quality_score;
  const breakdown = intelligence?.intelligence_quality_breakdown as Record<string, number> | null;

  if (!hc && aiConf == null) return emptySection('confidence_summary', 'Confidence Summary');

  const blocks: NarrativeBlock[] = [];

  const rows: string[][] = [];
  if (hc) {
    rows.push(['Historical Confidence', conf(hc.historical_confidence)]);
    rows.push(['Historical Success Rate', pct(hc.historical_success_rate)]);
    rows.push(['Precedent Strength', hc.precedent_strength]);
    rows.push(['Combined Confidence', conf(hc.combined_confidence)]);
  }
  if (aiConf != null) rows.push(['AI Confidence', conf(aiConf)]);
  if (breakdown) {
    if (breakdown.testing_completeness != null) rows.push(['Testing Confidence', pct(breakdown.testing_completeness)]);
    if (breakdown.documentation_completeness != null) rows.push(['Documentation Confidence', pct(breakdown.documentation_completeness)]);
    if (breakdown.governance_completeness != null) rows.push(['Governance Confidence', pct(breakdown.governance_completeness)]);
  }
  if (qualityScore != null) rows.push(['Engineering Quality Score', pct(qualityScore)]);

  blocks.push({ type: 'table', columns: ['Confidence Dimension', 'Score'], rows });

  if (hc?.confidence_basis) {
    blocks.push({ type: 'paragraph', content: `Basis: ${hc.confidence_basis}` });
  }

  const overallConf = hc?.combined_confidence ?? aiConf ?? (qualityScore != null ? qualityScore / 100 : null);

  return { id: 'confidence_summary', title: 'Confidence Summary', blocks, has_data: true, confidence: overallConf };
}

function buildExecutiveRecommendation(review: EngineeringReview, intelligence: IntelligenceReport | null, elpm: ELPMReport | null): EINESection {
  const eb = intelligence?.executive_brief as Record<string, unknown> | null;
  const rec = elpm?.recommendation_evolution;
  const hc = elpm?.historical_confidence;

  const hasContent = eb || rec?.current_recommendation;
  if (!hasContent) return emptySection('executive_recommendation', 'Executive Recommendation');

  const blocks: NarrativeBlock[] = [];

  if (rec?.current_recommendation) {
    blocks.push({ type: 'evidence', label: 'Recommendation', content: rec.current_recommendation, variant: 'success' });
  }

  if (eb) {
    if (eb.business_value) blocks.push({ type: 'evidence', label: 'Business Impact', content: String(eb.business_value), variant: 'info' });
    if (eb.engineering_value) blocks.push({ type: 'evidence', label: 'Engineering Impact', content: String(eb.engineering_value), variant: 'info' });
    if (eb.risks && Array.isArray(eb.risks) && eb.risks.length) {
      blocks.push({ type: 'heading', content: 'Risks' });
      blocks.push({ type: 'list', items: eb.risks as string[] });
    }
    if (eb.effort_estimate) blocks.push({ type: 'metric', label: 'Effort Estimate', value: String(eb.effort_estimate) });
    if (eb.timeline) blocks.push({ type: 'metric', label: 'Timeline', value: String(eb.timeline) });
    if (eb.release_impact) blocks.push({ type: 'paragraph', content: `Release impact: ${eb.release_impact}` });
  }

  if (hc) {
    blocks.push({
      type: 'badge',
      label: 'Overall Confidence',
      content: `${conf(hc.combined_confidence)} (${hc.precedent_strength} precedent)`,
      variant: hc.combined_confidence >= 0.7 ? 'success' : hc.combined_confidence >= 0.4 ? 'warning' : 'error',
    });
  }

  blocks.push({ type: 'paragraph', content: `Status: ${review.status} | Author: ${review.author ?? 'Unknown'} | Area: ${review.engineering_area ?? 'General'}` });

  return { id: 'executive_recommendation', title: 'Executive Recommendation', blocks, has_data: true, confidence: hc?.combined_confidence ?? null };
}

// ─── Engine Entry Point ───────────────────────────────────────────────────────

export function generateEINEReport(
  review: EngineeringReview,
  elpm: ELPMReport | null,
  intelligence: IntelligenceReport | null,
): EINEReport {
  const sections: EINESection[] = [
    buildExecutiveSummary(review, intelligence, elpm),
    buildEngineeringIntelligenceSummary(intelligence),
    buildHistoricalAnalysis(elpm),
    buildLearningSummary(elpm),
    buildConversationIntelligenceSummary(elpm),
    buildPODecisionsApplied(elpm),
    buildEngineeringMemoryApplied(elpm),
    buildSimilarWork(elpm),
    buildReusableAssets(elpm),
    buildEngineeringLineage(elpm),
    buildRecommendationEvolution(elpm),
    buildHistoricalComparison(elpm),
    buildDependencyAnalysis(intelligence),
    buildImpactAnalysis(intelligence),
    buildRiskRegister(intelligence, elpm),
    buildReleaseReadiness(intelligence),
    buildTestingAssessment(intelligence, elpm),
    buildDocumentationAssessment(intelligence, elpm),
    buildEngineeringTraceability(intelligence),
    buildQualityAssessment(intelligence),
    buildAIReasoningSummary(intelligence),
    buildConfidenceSummary(intelligence, elpm),
    buildExecutiveRecommendation(review, intelligence, elpm),
  ];

  const confValues = sections
    .filter(s => s.confidence !== null)
    .map(s => s.confidence as number);
  const overallConfidence = confValues.length
    ? confValues.reduce((a, b) => a + b, 0) / confValues.length
    : 0;

  const sources: IntelligenceSources = {
    erie_present: intelligence != null,
    elpm_present: elpm != null,
    eig_entities: intelligence?.eig_analysis?.entities_analysed ?? 0,
    eig_relationships: intelligence?.eig_analysis?.relationships_traversed ?? 0,
    memory_entries: elpm?.memory_entries?.length ?? 0,
    similar_artefacts: elpm?.similar_artefacts?.length ?? 0,
    conversation_signals: elpm?.conversation_intelligence?.length ?? 0,
  };

  return {
    sections,
    overall_confidence: overallConfidence,
    intelligence_sources: sources,
    generated_at: new Date().toISOString(),
    eine_version: EINE_VERSION,
  };
}

// ─── AI Serializer ────────────────────────────────────────────────────────────

export function serializeEINEReportForAI(eine: EINEReport, maxChars = 14000): string {
  const src = eine.intelligence_sources;
  const populated = eine.sections.filter(s => s.has_data).length;

  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════════╗',
    '  FROZEN ENGINEERING INTELLIGENCE REPORT',
    `  EINE v${eine.eine_version} · Generated ${new Date(eine.generated_at).toLocaleString()}`,
    `  Overall Confidence: ${Math.round(eine.overall_confidence * 100)}%`,
    `  Sections: ${populated} of ${eine.sections.length} populated`,
    `  EIG: ${src.eig_entities} entities · ${src.eig_relationships} relationships`,
    `  ELPM: ${src.similar_artefacts} similar artefacts · ${src.memory_entries} memory entries · ${src.conversation_signals} conversation signals`,
    '╚══════════════════════════════════════════════════════════════════╝',
    '',
    'INSTRUCTIONS TO AI TECHNICAL DIRECTOR:',
    'You are writing an Engineering Review based entirely upon the completed',
    'Engineering Intelligence Report below. Do NOT invent engineering analysis.',
    'Do NOT replace or contradict the provided conclusions.',
    'EXPLAIN the supplied intelligence. REFERENCE the evidence provided.',
    'If a section has no evidence, state: "No relevant engineering evidence was identified."',
    '',
    '══════════════════════════════════════════════════════════════════',
  ];

  for (const section of eine.sections) {
    lines.push(`\n## ${section.title.toUpperCase()}`);
    if (section.confidence !== null) {
      lines.push(`Confidence: ${Math.round(section.confidence * 100)}%`);
    }
    if (!section.has_data) {
      lines.push('No relevant engineering evidence identified.');
      continue;
    }
    for (const block of section.blocks) {
      switch (block.type) {
        case 'paragraph':
          if (block.content) lines.push(block.content);
          break;
        case 'heading':
          lines.push(`\n### ${block.content}`);
          break;
        case 'list':
          (block.items ?? []).forEach(item => lines.push(`  • ${item}`));
          break;
        case 'metric':
          lines.push(`${block.label}: ${block.value}`);
          break;
        case 'badge':
          lines.push(`[${block.label ?? ''}] ${block.content ?? ''}`);
          break;
        case 'evidence':
          if (block.label) lines.push(`► ${block.label}`);
          if (block.content) lines.push(`  ${block.content}`);
          break;
        case 'table': {
          const cols = block.columns ?? [];
          (block.rows ?? []).forEach(row => {
            const parts = row.map((cell, i) => `${cols[i] ?? 'Col'}: ${cell}`);
            lines.push(`  ${parts.join(' | ')}`);
          });
          break;
        }
        case 'chain':
          (block.entries ?? []).forEach(e => {
            lines.push(`  [${e.label}] ${e.value}${e.sub ? ` · ${e.sub}` : ''}`);
          });
          break;
        case 'empty':
          break;
      }
    }
  }

  const full = lines.join('\n');
  if (full.length <= maxChars) return full;

  // Truncate gracefully at a section boundary near the limit
  const truncated = full.slice(0, maxChars);
  const lastSection = truncated.lastIndexOf('\n## ');
  const cutAt = lastSection > maxChars * 0.7 ? lastSection : maxChars;
  return full.slice(0, cutAt) + '\n\n[Intelligence Report truncated — remaining sections omitted for token budget]';
}

