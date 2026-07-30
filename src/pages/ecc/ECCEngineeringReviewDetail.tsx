import { useState, useEffect } from 'react';
import {
  X, Star, BookOpen, Tag, Calendar, User, Shield,
  FileText, CheckCircle2, AlertCircle, RotateCcw, XCircle,
  Clock, AlertTriangle, Network, GitBranch, Zap, BarChart2,
  Brain, CheckSquare, Loader2, RefreshCw, ChevronRight,
  ArrowRight, TrendingUp, Target, Layers, MessageSquare,
  Play, CheckCircle,
} from 'lucide-react';
import type { EngineeringReview } from './ECCEngineeringReviewsPage';
import { loadGraphData } from '../../lib/eigService';
import { generateIntelligenceReport, loadCachedIntelligence, type IntelligenceReport } from '../../lib/reviewIntelligenceEngine';
import { generateELPMReport, loadCachedELPM, type ELPMReport, type SimilarArtefact } from '../../lib/elpmEngine';
import type { ConversationIntelligenceSummary } from '../../lib/conversationIntelligenceService';
import { generateEINEReport, type EINEReport, type EINESection, type NarrativeBlock } from '../../lib/eineEngine';
import { runEIOPipeline, makeInitialStages, type EIOStage } from '../../lib/eioOrchestrator';
import { supabase } from '../../lib/supabase';

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  root_cause_analysis:       'Root Cause Analysis',
  architecture_review:       'Architecture Review',
  engineering_investigation: 'Engineering Investigation',
  defect_resolution:         'Defect Resolution',
  performance_review:        'Performance Review',
  security_review:           'Security Review',
  ai_platform_review:        'AI Platform Review',
  governance_review:         'Governance Review',
  engineering_acceptance:    'Engineering Acceptance',
  release_review:            'Release Review',
  other:                     'Other',
};

const TYPE_COLOR: Record<string, string> = {
  root_cause_analysis:       'bg-red-50 text-red-700 border-red-200',
  architecture_review:       'bg-violet-50 text-violet-700 border-violet-200',
  engineering_investigation: 'bg-blue-50 text-blue-700 border-blue-200',
  defect_resolution:         'bg-orange-50 text-orange-700 border-orange-200',
  performance_review:        'bg-amber-50 text-amber-700 border-amber-200',
  security_review:           'bg-rose-50 text-rose-700 border-rose-200',
  ai_platform_review:        'bg-sky-50 text-sky-700 border-sky-200',
  governance_review:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  engineering_acceptance:    'bg-teal-50 text-teal-700 border-teal-200',
  release_review:            'bg-cyan-50 text-cyan-700 border-cyan-200',
  other:                     'bg-slate-100 text-slate-600 border-slate-200',
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; Icon: typeof Clock }> = {
  open:        { label: 'Open',        color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',    Icon: AlertCircle  },
  in_progress: { label: 'In Progress', color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',      Icon: RotateCcw    },
  closed:      { label: 'Closed',      color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', Icon: CheckCircle2 },
  superseded:  { label: 'Superseded',  color: 'text-slate-500',   bg: 'bg-slate-100 border-slate-200',   Icon: XCircle      },
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  high:     'bg-orange-50 text-orange-700 border-orange-200',
  medium:   'bg-amber-50 text-amber-700 border-amber-200',
  low:      'bg-emerald-50 text-emerald-700 border-emerald-200',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtTs(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ─── Shared subcomponents ─────────────────────────────────────────────────────

function Section({ title, children, accent = false, icon }: { title: string; children: React.ReactNode; accent?: boolean; icon?: React.ReactNode }) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200'}`}>
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
        {icon}{title}
      </h3>
      <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{children}</div>
    </div>
  );
}

function EmptySection({ label }: { label: string }) {
  return <p className="text-xs text-slate-400 italic">{label}</p>;
}

function Pill({ text, color = 'bg-slate-100 text-slate-600 border-slate-200' }: { text: string; color?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${color}`}>
      {text}
    </span>
  );
}

function IntelligenceEmpty({ onGenerate, generating }: { onGenerate: () => void; generating: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
      <Brain size={32} className="mb-3 opacity-30" />
      <p className="text-sm font-medium text-slate-500 mb-1">No intelligence generated yet</p>
      <p className="text-xs text-slate-400 mb-4 text-center max-w-xs">
        Run the Engineering Review Intelligence Engine to generate dependency analysis, impact assessment, risk register, and more.
      </p>
      <button
        onClick={onGenerate}
        disabled={generating}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {generating ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
        {generating ? 'Generating…' : 'Generate Intelligence'}
      </button>
    </div>
  );
}

// ─── Intelligence tab sub-components ─────────────────────────────────────────

function QualityScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-red-600';
  const bg    = score >= 80 ? 'bg-emerald-50'   : score >= 60 ? 'bg-amber-50'    : 'bg-red-50';
  return (
    <div className={`w-16 h-16 rounded-full ${bg} flex flex-col items-center justify-center border-2 ${score >= 80 ? 'border-emerald-200' : score >= 60 ? 'border-amber-200' : 'border-red-200'}`}>
      <span className={`text-lg font-bold ${color}`}>{score}</span>
      <span className="text-[9px] text-slate-400 font-medium">/ 100</span>
    </div>
  );
}

function GateRow({ gate, ready, note }: { gate: string; ready: boolean; note: string }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${ready ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
      {ready ? <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0 mt-0.5" /> : <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />}
      <div className="min-w-0">
        <p className={`text-xs font-semibold ${ready ? 'text-emerald-700' : 'text-red-700'}`}>{gate}</p>
        {note && <p className="text-xs text-slate-500 mt-0.5">{note}</p>}
      </div>
      <span className={`ml-auto text-[10px] font-bold flex-shrink-0 ${ready ? 'text-emerald-600' : 'text-red-600'}`}>{ready ? 'PASS' : 'FAIL'}</span>
    </div>
  );
}

function TraceLink({ layer, entity, entity_ref, status }: { layer: string; entity: string | null; entity_ref: string | null; status: 'present' | 'missing' }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${status === 'present' ? 'bg-emerald-400' : 'bg-slate-200'}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium ${status === 'present' ? 'text-slate-700' : 'text-slate-400'}`}>{layer}</p>
        {entity && <p className="text-xs text-slate-500 truncate">{entity_ref ? `${entity_ref} — ` : ''}{entity}</p>}
      </div>
      <span className={`text-[10px] font-semibold flex-shrink-0 ${status === 'present' ? 'text-emerald-600' : 'text-slate-400'}`}>
        {status === 'present' ? 'LINKED' : 'MISSING'}
      </span>
    </div>
  );
}

function DependencyGroup({ label, items, color }: { label: string; items: Array<{ name: string; relationship_type: string; status: string }>; color: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">{label} ({items.length})</p>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${color}`}>
            <span className="font-medium flex-1 truncate">{item.name}</span>
            <span className="text-[10px] opacity-60 flex-shrink-0">{item.relationship_type.replace(/_/g, ' ')}</span>
            <span className={`text-[9px] font-semibold flex-shrink-0 ${item.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}>{item.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview',     label: 'Overview',           icon: <BookOpen size={12} /> },
  { key: 'narrative',    label: 'Intelligence Report', icon: <Zap size={12} /> },
  { key: 'intelligence', label: 'Intelligence',        icon: <Brain size={12} /> },
  { key: 'learning',     label: 'Learning',            icon: <GitBranch size={12} /> },
  { key: 'analysis',     label: 'Analysis',            icon: <BarChart2 size={12} /> },
  { key: 'changes',      label: 'Changes',             icon: <FileText size={12} /> },
  { key: 'lessons',      label: 'Lessons',             icon: <TrendingUp size={12} /> },
  { key: 'governance',   label: 'Governance',          icon: <Shield size={12} /> },
  { key: 'full',         label: 'Full Review',         icon: <FileText size={12} /> },
] as const;

type Tab = typeof TABS[number]['key'];

// ─── Main Component ───────────────────────────────────────────────────────────

export function ECCEngineeringReviewDetail({
  review,
  onClose,
  onRefresh,
}: {
  review: EngineeringReview;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const [intelligence, setIntelligence] = useState<IntelligenceReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [elpm, setElpm] = useState<ELPMReport | null>(null);
  const [generatingElpm, setGeneratingElpm] = useState(false);
  const [eine, setEine] = useState<EINEReport | null>(null);
  const [eioStages, setEioStages] = useState<EIOStage[]>(makeInitialStages());
  const [eioRunning, setEioRunning] = useState(false);
  const [eioComplete, setEioComplete] = useState(false);
  const [eineSerialized, setEineSerialized] = useState<string | null>(null);
  const [generatingNarrative, setGeneratingNarrative] = useState(false);
  const [narrativeResult, setNarrativeResult] = useState<string | null>(null);

  const sc = STATUS_CFG[review.status] ?? STATUS_CFG.open;
  const StatusIcon = sc.Icon;
  const typeCls = TYPE_COLOR[review.type] ?? TYPE_COLOR.other;
  const typeLabel = TYPE_LABEL[review.type] ?? 'Other';
  const meta = review.metadata as Record<string, unknown> | null;

  // Load cached intelligence on mount or when review changes
  useEffect(() => {
    setIntelligence(null);
    // If the review already has intelligence fields populated, hydrate from them
    if (review.intelligence_generated_at && review.eig_analysis) {
      setIntelligence({
        eig_analysis:                   review.eig_analysis as IntelligenceReport['eig_analysis'],
        dependency_analysis:            review.dependency_analysis as IntelligenceReport['dependency_analysis'],
        impact_analysis:                review.impact_analysis as IntelligenceReport['impact_analysis'],
        risk_register:                  (review.risk_register ?? []) as IntelligenceReport['risk_register'],
        traceability:                   review.traceability as IntelligenceReport['traceability'],
        implementation_plan:            review.implementation_plan as IntelligenceReport['implementation_plan'],
        release_readiness:              review.release_readiness as IntelligenceReport['release_readiness'],
        testing_assessment:             review.testing_assessment as IntelligenceReport['testing_assessment'],
        documentation_assessment:       review.documentation_assessment as IntelligenceReport['documentation_assessment'],
        ai_reasoning:                   review.ai_reasoning as IntelligenceReport['ai_reasoning'],
        intelligence_quality_score:     review.intelligence_quality_score ?? 0,
        intelligence_quality_breakdown: review.intelligence_quality_breakdown as IntelligenceReport['intelligence_quality_breakdown'],
        executive_brief:                review.executive_brief as IntelligenceReport['executive_brief'],
        intelligence_generated_at:      review.intelligence_generated_at,
        intelligence_engine_version:    review.intelligence_engine_version ?? '1.0',
      });
    } else {
      // Try the cache
      loadCachedIntelligence(review.id).then(cached => {
        if (cached) setIntelligence(cached);
      });
    }
  }, [review.id]);

  // Load ELPM on mount
  useEffect(() => {
    setElpm(null);
    if (review.elpm_generated_at && review.elpm_learning_summary) {
      loadCachedELPM(review.id).then(cached => { if (cached) setElpm(cached); });
    }
  }, [review.id]);

  // Build EINE report whenever intelligence or elpm change
  useEffect(() => {
    setEine(generateEINEReport(review, elpm, intelligence));
  }, [review, elpm, intelligence]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const graph = await loadGraphData();
      const reviewCtx = {
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
      };
      const report = await generateIntelligenceReport(reviewCtx, graph.entities, graph.relationships);
      setIntelligence(report);
      onRefresh();
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateElpm() {
    setGeneratingElpm(true);
    try {
      const elpmCtx = {
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
      };
      const report = await generateELPMReport(elpmCtx);
      setElpm(report);
      onRefresh();
    } finally {
      setGeneratingElpm(false);
    }
  }

  async function handleRunEIO() {
    setEioRunning(true);
    setEioComplete(false);
    setEioStages(makeInitialStages());
    setEineSerialized(null);
    try {
      const result = await runEIOPipeline(review, stages => setEioStages(stages));
      setIntelligence(result.intelligence);
      setElpm(result.elpm);
      setEine(result.eine);
      setEineSerialized(result.eine_serialized);
      setEioStages(result.pipeline_log);
      setEioComplete(true);
      onRefresh();
    } catch (err) {
      console.error('[EIO] Pipeline failed', err);
    } finally {
      setEioRunning(false);
    }
  }

  async function handleGenerateEIONarrative() {
    if (!eineSerialized) return;
    setGeneratingNarrative(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await supabase.functions.invoke('technical-director', {
        body: {
          mode: 'eio_review',
          review_id: review.id,
          eine_serialized: eineSerialized,
        },
      });
      if (res.data?.eio_narrative) {
        setNarrativeResult(res.data.eio_narrative as string);
        onRefresh();
      }
    } finally {
      setGeneratingNarrative(false);
    }
  }

  // ── Narrative block renderer ─────────────────────────────────────────────────

  function renderBlock(block: NarrativeBlock, idx: number) {
    switch (block.type) {
      case 'empty':
        return (
          <p key={idx} className="text-xs text-slate-400 italic py-1">
            {block.content}
          </p>
        );
      case 'heading':
        return (
          <p key={idx} className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-3 mb-1">
            {block.content}
          </p>
        );
      case 'paragraph':
        return (
          <p key={idx} className="text-sm text-slate-700 leading-relaxed">
            {block.content}
          </p>
        );
      case 'list':
        return (
          <ul key={idx} className="space-y-1">
            {(block.items ?? []).map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                <span className="text-slate-300 flex-shrink-0 mt-0.5">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        );
      case 'metric':
        return (
          <div key={idx} className="inline-flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5">
            <span className="text-sm font-bold text-slate-800">{String(block.value ?? '—')}</span>
            {block.label && <span className="text-[11px] text-slate-500">{block.label}</span>}
          </div>
        );
      case 'badge': {
        const variantCls = {
          info:    'bg-blue-50 text-blue-700 border-blue-200',
          success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          warning: 'bg-amber-50 text-amber-700 border-amber-200',
          error:   'bg-red-50 text-red-700 border-red-200',
          neutral: 'bg-slate-100 text-slate-600 border-slate-200',
        }[block.variant ?? 'neutral'];
        return (
          <div key={idx} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${variantCls}`}>
            {block.label && <span className="font-normal opacity-70">{block.label}:</span>}
            {block.content}
          </div>
        );
      }
      case 'evidence': {
        const variantCls = {
          info:    'bg-blue-50 border-blue-100 text-blue-700',
          success: 'bg-emerald-50 border-emerald-100 text-emerald-700',
          warning: 'bg-amber-50 border-amber-100 text-amber-700',
          error:   'bg-red-50 border-red-100 text-red-700',
          neutral: 'bg-slate-50 border-slate-200 text-slate-600',
        }[block.variant ?? 'neutral'];
        return (
          <div key={idx} className={`rounded-lg border px-3 py-2.5 ${variantCls}`}>
            {block.label && <p className="text-xs font-semibold mb-0.5">{block.label}</p>}
            {block.content && <p className="text-[11px] leading-relaxed opacity-90">{block.content}</p>}
          </div>
        );
      }
      case 'table':
        return (
          <div key={idx} className="overflow-x-auto rounded-lg border border-slate-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {(block.columns ?? []).map((col, i) => (
                    <th key={i} className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wide">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(block.rows ?? []).map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    {row.map((cell, j) => (
                      <td key={j} className={`px-3 py-2 text-slate-600 ${j === 0 ? 'font-medium' : ''}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'chain':
        return (
          <div key={idx} className="space-y-1.5">
            {(block.entries ?? []).map((entry, i) => (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && <div className="w-px h-2 bg-slate-200 ml-3" />}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs flex-1 ${
                  entry.status === 'present' || entry.status === 'active'
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : entry.status === 'missing' || entry.status === 'superseded'
                    ? 'bg-slate-50 border-slate-200 text-slate-400'
                    : entry.status === 'archived'
                    ? 'bg-slate-50 border-slate-100 text-slate-400'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}>
                  <span className="font-mono font-bold text-[10px] flex-shrink-0">{entry.label}</span>
                  <span className="flex-1 truncate">{entry.value}</span>
                  {entry.sub && <span className="text-[9px] opacity-60 truncate max-w-[140px]">{entry.sub}</span>}
                </div>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  }

  function NarrativeSection({ section }: { section: EINESection }) {
    const [expanded, setExpanded] = useState(true);

    return (
      <div className={`rounded-xl border overflow-hidden ${section.has_data ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'}`}>
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
        >
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${section.has_data ? 'bg-blue-400' : 'bg-slate-200'}`} />
          <span className={`text-xs font-bold flex-1 ${section.has_data ? 'text-slate-700' : 'text-slate-400'}`}>
            {section.title}
          </span>
          {section.confidence !== null && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 ${
              section.confidence >= 0.7 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
              section.confidence >= 0.4 ? 'bg-amber-50 text-amber-600 border-amber-200' :
              'bg-red-50 text-red-500 border-red-200'
            }`}>
              {Math.round(section.confidence * 100)}%
            </span>
          )}
          {!section.has_data && (
            <span className="text-[10px] text-slate-400 flex-shrink-0">No evidence</span>
          )}
          <ChevronRight size={12} className={`text-slate-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
        {expanded && (
          <div className="px-4 pb-4 space-y-2">
            {section.blocks.map((b, i) => renderBlock(b, i))}
          </div>
        )}
      </div>
    );
  }

  function EIOPipelinePanel() {
    const allDone = eioStages.every(s => s.status === 'complete');

    return (
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Play size={13} className="text-slate-500" />
            <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">Engineering Intelligence Orchestrator</p>
          </div>
          <button
            onClick={handleRunEIO}
            disabled={eioRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {eioRunning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
            {eioRunning ? 'Running Pipeline…' : allDone ? 'Re-run Pipeline' : 'Run Full Pipeline'}
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-[11px] text-slate-500 mb-4">
            Executes the complete intelligence pipeline in order: EIG → ELPM → ERIE → EINE.
            Freezes the Engineering Intelligence Report before supplying it to the AI.
          </p>
          <div className="space-y-2">
            {eioStages.map((stage, i) => {
              const isRunning = stage.status === 'running';
              const isDone    = stage.status === 'complete';
              const isError   = stage.status === 'error';
              const isPending = stage.status === 'pending';
              return (
                <div key={stage.key} className="flex items-start gap-3">
                  {/* Connector line */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all ${
                      isDone   ? 'bg-emerald-500 border-emerald-500' :
                      isRunning? 'bg-blue-100 border-blue-400' :
                      isError  ? 'bg-red-100 border-red-400' :
                      'bg-slate-100 border-slate-200'
                    }`}>
                      {isDone    && <CheckCircle size={11} className="text-white" />}
                      {isRunning && <Loader2 size={11} className="text-blue-500 animate-spin" />}
                      {isError   && <AlertCircle size={11} className="text-red-500" />}
                      {isPending && <span className="text-[9px] font-bold text-slate-400">{i + 1}</span>}
                    </div>
                    {i < eioStages.length - 1 && (
                      <div className={`w-px flex-1 mt-1 min-h-[12px] ${isDone ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                    )}
                  </div>

                  {/* Stage info */}
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-semibold ${isDone ? 'text-emerald-700' : isRunning ? 'text-blue-700' : isError ? 'text-red-700' : 'text-slate-500'}`}>
                        {stage.label}
                      </p>
                      {stage.duration_ms !== null && (
                        <span className="text-[9px] text-slate-400">{stage.duration_ms}ms</span>
                      )}
                      <span className={`text-[9px] font-bold uppercase ml-auto ${
                        isDone ? 'text-emerald-600' : isRunning ? 'text-blue-600' : isError ? 'text-red-600' : 'text-slate-400'
                      }`}>{stage.status}</span>
                    </div>
                    {stage.detail && (
                      <p className="text-[10px] text-slate-400 mt-0.5">{stage.detail}</p>
                    )}
                    {stage.error && (
                      <p className="text-[10px] text-red-500 mt-0.5">{stage.error}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {eioComplete && (
            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle size={14} className="text-emerald-500" />
                <p className="text-xs font-semibold text-emerald-700">Intelligence Report Frozen</p>
                {eineSerialized && (
                  <span className="text-[9px] text-slate-400">{eineSerialized.length.toLocaleString()} chars</span>
                )}
              </div>
              <button
                onClick={handleGenerateEIONarrative}
                disabled={generatingNarrative || !eineSerialized}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors font-medium"
              >
                {generatingNarrative ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
                {generatingNarrative ? 'Generating AI Narrative…' : 'Generate AI Narrative'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  function NarrativeTab() {
    if (!eine) {
      return (
        <div className="space-y-4">
          <EIOPipelinePanel />
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <Zap size={28} className="mb-3 opacity-30" />
            <p className="text-sm text-slate-500 font-medium mb-1">Intelligence Report not yet generated</p>
            <p className="text-xs text-slate-400 text-center max-w-xs">Run the full intelligence pipeline above to populate all 23 sections.</p>
          </div>
        </div>
      );
    }

    const src = eine.intelligence_sources;

    return (
      <div className="space-y-4">

        {/* EIO Pipeline Panel */}
        <EIOPipelinePanel />

        {/* AI Narrative result */}
        {narrativeResult && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Brain size={13} className="text-emerald-600" />
              <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">AI-Generated Engineering Review Narrative</p>
              <span className="text-[9px] text-emerald-500 ml-auto">EIO v1.0 · Based on frozen intelligence</span>
            </div>
            <pre className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">{narrativeResult}</pre>
          </div>
        )}

        {/* Header: sources + overall confidence */}
        <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-slate-50 p-5">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-0.5">Engineering Intelligence Report</p>
              <p className="text-[11px] text-slate-500">All 23 mandatory sections — generated from ERIE + ELPM intelligence</p>
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className={`text-sm font-bold ${eine.overall_confidence >= 0.7 ? 'text-emerald-600' : eine.overall_confidence >= 0.4 ? 'text-amber-600' : 'text-slate-500'}`}>
                {Math.round(eine.overall_confidence * 100)}%
              </span>
              <span className="text-[10px] text-slate-400">Overall Confidence</span>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { label: 'EIG Entities',  value: src.eig_entities,         active: src.erie_present },
              { label: 'Relationships', value: src.eig_relationships,    active: src.erie_present },
              { label: 'Memory',        value: src.memory_entries,       active: src.elpm_present },
              { label: 'Similar Work',  value: src.similar_artefacts,    active: src.elpm_present },
              { label: 'Conversations', value: src.conversation_signals, active: src.elpm_present },
              { label: 'Sections',      value: `${eine.sections.filter(s => s.has_data).length}/${eine.sections.length}`, active: true },
            ].map(k => (
              <div key={k.label} className={`rounded-lg border px-2 py-1.5 text-center ${k.active ? 'bg-white border-blue-100' : 'bg-slate-50 border-slate-100'}`}>
                <p className={`text-sm font-bold ${k.active ? 'text-blue-700' : 'text-slate-400'}`}>{String(k.value)}</p>
                <p className={`text-[9px] ${k.active ? 'text-slate-500' : 'text-slate-400'}`}>{k.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* All 23 sections */}
        <div className="space-y-2">
          {eine.sections.map(section => (
            <NarrativeSection key={section.id} section={section} />
          ))}
        </div>

        <p className="text-[10px] text-slate-400 text-center">
          EINE v{eine.eine_version} · Generated {fmtTs(eine.generated_at)}
        </p>
      </div>
    );
  }

  // ── Intelligence tab panels ──────────────────────────────────────────────────

  function LearningTab() {
    if (!elpm) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <GitBranch size={32} className="mb-3 opacity-30" />
          <p className="text-sm font-medium text-slate-500 mb-1">No learning analysis generated yet</p>
          <p className="text-xs text-slate-400 mb-4 text-center max-w-xs">
            Run the Engineering Learning, Precedent & Memory Engine to search historical engineering knowledge and extract lessons.
          </p>
          <button
            onClick={handleGenerateElpm}
            disabled={generatingElpm}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {generatingElpm ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
            {generatingElpm ? 'Analysing History…' : 'Run Learning Engine'}
          </button>
        </div>
      );
    }

    const conf = elpm.historical_confidence;
    const learning = elpm.learning_summary;
    const evolution = elpm.evolution_summary;
    const comparison = elpm.historical_comparison;
    const lineage = elpm.engineering_lineage;

    const precedentColor = conf.precedent_strength === 'strong' ? 'emerald' :
      conf.precedent_strength === 'moderate' ? 'amber' :
      conf.precedent_strength === 'weak' ? 'orange' : 'slate';

    return (
      <div className="space-y-4">

        {/* Header: Historical Confidence */}
        <div className={`rounded-xl border border-${precedentColor}-100 bg-gradient-to-r from-${precedentColor}-50 to-slate-50 p-5 flex items-start gap-5`}>
          <div className={`w-16 h-16 rounded-full bg-${precedentColor}-100 flex flex-col items-center justify-center border-2 border-${precedentColor}-200 flex-shrink-0`}>
            <span className={`text-lg font-bold text-${precedentColor}-700`}>{Math.round(conf.historical_confidence * 100)}</span>
            <span className="text-[9px] text-slate-400 font-medium">/ 100</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-0.5">Historical Confidence</p>
            <p className="text-sm font-semibold text-slate-800 mb-1">{conf.precedent_strength.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())} Precedent</p>
            <p className="text-xs text-slate-500 leading-relaxed">{conf.confidence_basis}</p>
          </div>
          <button
            onClick={handleGenerateElpm}
            disabled={generatingElpm}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            <RefreshCw size={12} className={generatingElpm ? 'animate-spin' : ''} />
            {generatingElpm ? 'Running…' : 'Re-run'}
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Similar Reviews', value: conf.historical_reviews_found, color: 'text-blue-600' },
            { label: 'Lessons Applied', value: learning.lessons_applied.length, color: 'text-emerald-600' },
            { label: 'Reusable Assets', value: elpm.reusable_assets.length, color: 'text-violet-600' },
            { label: 'Memory Entries', value: elpm.memory_entries.length, color: 'text-amber-600' },
          ].map(k => (
            <div key={k.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
              <p className="text-[10px] text-slate-500">{k.label}</p>
            </div>
          ))}
        </div>

        {/* Similar Artefacts */}
        {elpm.similar_artefacts.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <GitBranch size={12} />Similar Engineering Reviews
            </h3>
            <div className="space-y-2">
              {elpm.similar_artefacts.slice(0, 6).map((s: SimilarArtefact) => (
                <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-[10px] font-bold text-slate-500 font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">{s.ref}</span>
                      <span className={`text-[10px] font-semibold ${s.lineage_status === 'current_baseline' ? 'text-amber-600' : s.lineage_status === 'superseded' ? 'text-slate-400' : 'text-emerald-600'}`}>
                        {s.lineage_status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-slate-700 truncate">{s.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{s.similarity_reason}</p>
                    {s.reusable_assets.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {s.reusable_assets.map((a, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-100">{a}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`text-sm font-bold ${s.similarity_score >= 60 ? 'text-emerald-600' : s.similarity_score >= 30 ? 'text-amber-600' : 'text-slate-400'}`}>
                      {s.similarity_score}%
                    </span>
                    <span className="text-[9px] text-slate-400">similarity</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Engineering Learning Summary */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Brain size={12} />Engineering Learning Summary
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Previous Decisions',        items: learning.previous_decisions,        color: 'bg-blue-50 text-blue-700 border-blue-100' },
              { label: 'Previous PO Decisions',     items: learning.previous_po_decisions,      color: 'bg-amber-50 text-amber-700 border-amber-100' },
              { label: 'Conversation Decisions',    items: learning.conversation_decisions ?? [],color: 'bg-teal-50 text-teal-700 border-teal-100' },
              { label: 'Previous Approaches',       items: learning.previous_approaches,        color: 'bg-slate-50 text-slate-700 border-slate-200' },
              { label: 'Lessons Applied',           items: learning.lessons_applied,            color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
              { label: 'Conversation Lessons',      items: learning.conversation_lessons ?? [],  color: 'bg-cyan-50 text-cyan-700 border-cyan-100' },
              { label: 'Conversation Recommendations', items: learning.conversation_recommendations ?? [], color: 'bg-violet-50 text-violet-700 border-violet-100' },
              { label: 'Previous Regressions',      items: learning.previous_regressions,       color: 'bg-red-50 text-red-700 border-red-100' },
              { label: 'Governance Decisions',      items: learning.previous_governance_decisions, color: 'bg-violet-50 text-violet-700 border-violet-100' },
              { label: 'Audit Findings',            items: learning.previous_audit_findings,    color: 'bg-rose-50 text-rose-700 border-rose-100' },
              { label: 'Release Observations',      items: learning.previous_release_observations, color: 'bg-teal-50 text-teal-700 border-teal-100' },
            ].filter(g => g.items.length > 0).map(g => (
              <div key={g.label}>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">{g.label}</p>
                <div className="space-y-1">
                  {g.items.map((item, i) => (
                    <p key={i} className={`text-xs px-3 py-2 rounded-lg border ${g.color}`}>{item}</p>
                  ))}
                </div>
              </div>
            ))}
            {learning.learning_sources === 0 && (
              <p className="text-xs text-slate-400 italic">No prior engineering knowledge found for this review type.</p>
            )}
          </div>
        </div>

        {/* Engineering Lineage */}
        {lineage.lineage_chain.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <Layers size={12} />Engineering Lineage
            </h3>
            <p className="text-xs text-slate-400 mb-3">{lineage.evolution_description}</p>
            <div className="space-y-1.5">
              {lineage.lineage_chain.map((entry, i) => (
                <div key={i} className="flex items-center gap-3">
                  {i > 0 && <div className="w-px h-3 bg-slate-200 ml-2.5" />}
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${entry.status === 'current_baseline' ? 'bg-amber-50 border-amber-200 text-amber-700' : entry.status === 'superseded' ? 'bg-slate-50 border-slate-200 text-slate-400' : entry.status === 'active' && entry.relationship === 'current' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600'}`}>
                    <span className="font-mono font-bold text-[10px]">{entry.ref}</span>
                    <span className="flex-1 truncate">{entry.title}</span>
                    <span className="text-[9px] font-semibold ml-auto">{entry.status.replace(/_/g, ' ').toUpperCase()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reusable Assets */}
        {elpm.reusable_assets.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <CheckSquare size={12} />Reusable Engineering Assets
            </h3>
            <div className="space-y-2">
              {elpm.reusable_assets.slice(0, 8).map((asset, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700">{asset.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{asset.reuse_recommendation}</p>
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-end gap-1">
                    <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded">
                      {asset.type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[9px] text-slate-400">{Math.round(asset.confidence * 100)}% confidence</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Evolution Summary */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <TrendingUp size={12} />Engineering Evolution
          </h3>
          <p className="text-sm text-slate-700 leading-relaxed mb-3">{evolution.evolution_explanation}</p>
          {evolution.timeline_entries.length > 0 && (
            <div className="border-l-2 border-slate-200 pl-4 space-y-2 ml-2">
              {evolution.timeline_entries.map((entry, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-5 top-1.5 w-2 h-2 rounded-full bg-slate-300" />
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold font-mono text-slate-500">{entry.ref}</span>
                        <span className="text-[10px] text-slate-400">{entry.event_type}</span>
                        {entry.outcome && <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">{entry.outcome}</span>}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">{entry.title}</p>
                    </div>
                    <span className="text-[9px] text-slate-400 flex-shrink-0">{fmtDate(entry.date)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Historical Comparison */}
        {(comparison.previous_recommendation || comparison.improvements.length > 0) && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <ArrowRight size={12} />Historical Comparison
            </h3>
            {comparison.previous_recommendation && (
              <div className="mb-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Previous Recommendation ({comparison.previous_review_ref})</p>
                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{comparison.previous_recommendation}</p>
              </div>
            )}
            {comparison.improvements.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mb-1">Improvements in This Review</p>
                <div className="space-y-1">
                  {comparison.improvements.map((imp, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-emerald-700">
                      <CheckCircle2 size={11} className="mt-0.5 flex-shrink-0 text-emerald-500" />
                      <span>{imp}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {comparison.po_decisions_applied.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-1">PO Decisions Applied</p>
                <div className="space-y-1">
                  {comparison.po_decisions_applied.map((d, i) => (
                    <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">{d}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Pattern Matches */}
        {elpm.pattern_matches.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Target size={12} />Engineering Patterns Detected
            </h3>
            <div className="space-y-3">
              {elpm.pattern_matches.map((p, i) => (
                <div key={i} className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-blue-800">{p.pattern_name}</p>
                    <span className="text-[10px] font-bold text-blue-600">{Math.round(p.confidence * 100)}%</span>
                  </div>
                  <p className="text-[11px] text-blue-600 mb-2">{p.pattern_description}</p>
                  <div className="flex flex-wrap gap-1">
                    {p.recommended_workflow.map((step, j) => (
                      <span key={j} className="text-[10px] px-2 py-0.5 bg-white text-blue-700 border border-blue-200 rounded-full flex items-center gap-1">
                        {j > 0 && <ArrowRight size={8} />}{step}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Historical Risk Summary */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <AlertTriangle size={12} />Historical Risk Summary
          </h3>
          {[
            { label: 'Common Implementation Risks', items: elpm.historical_risk_summary.common_implementation_risks, color: 'text-red-700' },
            { label: 'Common Regression Causes', items: elpm.historical_risk_summary.common_regression_causes, color: 'text-orange-700' },
            { label: 'Frequently Missing Docs', items: elpm.historical_risk_summary.frequently_missing_docs, color: 'text-amber-700' },
            { label: 'Frequently Missing Testing', items: elpm.historical_risk_summary.frequently_missing_testing, color: 'text-violet-700' },
            { label: 'Repeated Governance Findings', items: elpm.historical_risk_summary.repeated_governance_findings, color: 'text-blue-700' },
          ].filter(g => g.items.length > 0).map(g => (
            <div key={g.label} className="mb-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">{g.label}</p>
              <div className="space-y-1">
                {g.items.map((item, i) => (
                  <p key={i} className={`text-xs ${g.color}`}>{item}</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Related Conversations */}
        {elpm.conversation_intelligence.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <MessageSquare size={12} />Related ATD Conversations ({elpm.conversation_intelligence.length})
            </h3>
            <div className="space-y-2">
              {elpm.conversation_intelligence.map((ci: ConversationIntelligenceSummary) => (
                <div key={ci.id} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-[10px] font-semibold text-teal-600 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded">
                          {ci.conversation_type.replace(/_/g, ' ')}
                        </span>
                        {ci.engineering_area && (
                          <span className="text-[10px] text-slate-400">{ci.engineering_area}</span>
                        )}
                        <span className={`text-[9px] font-semibold ml-auto ${ci.lineage_status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}>
                          {ci.lineage_status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-700 truncate">{ci.conversation_title}</p>
                    </div>
                    <span className="text-[10px] font-bold text-blue-600 flex-shrink-0">{Math.round(ci.confidence_score * 100)}%</span>
                  </div>

                  {ci.extracted_decisions.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[9px] font-bold text-blue-500 uppercase tracking-wide mb-1">Decisions</p>
                      {ci.extracted_decisions.slice(0, 2).map((d, i) => (
                        <p key={i} className="text-[10px] text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-1 mb-0.5">
                          {d.decision.slice(0, 120)}
                        </p>
                      ))}
                    </div>
                  )}

                  {ci.extracted_lessons.length > 0 && (
                    <div className="mt-1.5">
                      <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-wide mb-1">Lessons</p>
                      {ci.extracted_lessons.slice(0, 2).map((l, i) => (
                        <p key={i} className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-2 py-1 mb-0.5">
                          {l.lesson.slice(0, 120)}
                        </p>
                      ))}
                    </div>
                  )}

                  {ci.extracted_po_feedback.length > 0 && (
                    <div className="mt-1.5">
                      <p className="text-[9px] font-bold text-amber-500 uppercase tracking-wide mb-1">PO Feedback</p>
                      {ci.extracted_po_feedback.slice(0, 1).map((f, i) => (
                        <p key={i} className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1 flex items-center gap-1.5">
                          <span className={`font-bold text-[9px] ${f.direction === 'approved' ? 'text-emerald-600' : f.direction === 'rejected' ? 'text-red-600' : 'text-amber-600'}`}>
                            {f.direction.toUpperCase()}
                          </span>
                          {f.feedback.slice(0, 100)}
                        </p>
                      ))}
                    </div>
                  )}

                  {ci.related_ercs.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {ci.related_ercs.map((erc, i) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200 font-mono">{erc}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Memory Entries */}
        {elpm.memory_entries.length > 0 && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 p-5">
            <h3 className="text-xs font-bold text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Star size={12} />Engineering Memory Applied ({elpm.memory_entries.filter(m => !m.is_superseded).length} active entries)
            </h3>
            <div className="space-y-2">
              {elpm.memory_entries.filter(m => !m.is_superseded).slice(0, 5).map(m => (
                <div key={m.id} className="bg-white border border-amber-200 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold text-amber-600">{'★'.repeat(m.weight)}</span>
                    <span className="text-[10px] text-amber-500">{m.memory_type.replace(/_/g, ' ')}</span>
                    <span className="text-[9px] text-slate-400 font-mono ml-auto">{m.source_ref}</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-700">{m.title}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{m.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    );
  }

  function IntelligenceTab() {
    if (!intelligence) return <IntelligenceEmpty onGenerate={handleGenerate} generating={generating} />;

    const qual = intelligence.intelligence_quality_breakdown;
    const brief = intelligence.executive_brief;
    const eig = intelligence.eig_analysis;
    const reasoning = intelligence.ai_reasoning;

    return (
      <div className="space-y-4">

        {/* Header: Quality Score + Regenerate */}
        <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-slate-50 p-5 flex items-start gap-5">
          {intelligence.intelligence_quality_score != null && (
            <QualityScoreRing score={intelligence.intelligence_quality_score} />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wide mb-1">Engineering Review Quality Score</p>
            {qual && (
              <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                {Object.entries(qual).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${(val as number) >= 80 ? 'bg-emerald-400' : (val as number) >= 60 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${val}%` }} />
                    </div>
                    <span className="text-[9px] text-slate-500 w-6 text-right">{val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            <RefreshCw size={12} className={generating ? 'animate-spin' : ''} />
            {generating ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>

        {/* EIG Analysis */}
        {eig && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Network size={12} />Engineering Intelligence Graph Analysis
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              {[
                { label: 'Entities Analysed', value: (eig as Record<string,unknown>).entities_analysed },
                { label: 'Relationships',      value: (eig as Record<string,unknown>).relationships_traversed },
                { label: 'Dependency Depth',   value: (eig as Record<string,unknown>).dependency_depth },
                { label: 'Impact Radius',      value: (eig as Record<string,unknown>).impact_radius },
              ].map(k => (
                <div key={k.label} className="bg-slate-50 rounded-lg p-3 text-center border border-slate-100">
                  <p className="text-lg font-bold text-blue-600">{String(k.value ?? 0)}</p>
                  <p className="text-[10px] text-slate-500">{k.label}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-slate-500">Graph confidence:</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden max-w-[120px]">
                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.round(((eig as Record<string,unknown>).graph_confidence as number ?? 0) * 100)}%` }} />
              </div>
              <span className="text-xs font-semibold text-blue-600">{Math.round(((eig as Record<string,unknown>).graph_confidence as number ?? 0) * 100)}%</span>
              <span className="text-[10px] text-slate-400 ml-auto">Analysed {fmtTs(intelligence.intelligence_generated_at)}</span>
            </div>
          </div>
        )}

        {/* AI Reasoning */}
        {reasoning && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Brain size={12} />AI Reasoning
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed mb-4">{(reasoning as Record<string,unknown>).reasoning_summary as string}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {Object.entries((reasoning as Record<string,unknown>).sources_used as Record<string,number> ?? {}).filter(([,v]) => v > 0).map(([k, v]) => (
                <div key={k} className="bg-slate-50 border border-slate-100 rounded px-2 py-1.5">
                  <p className="font-semibold text-slate-700">{v}</p>
                  <p className="text-slate-400 text-[10px]">{k.replace(/_/g, ' ')}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Executive Brief */}
        {brief && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-5">
            <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Target size={12} />Executive Brief
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-0.5">Why This Matters</p>
                <p className="text-slate-700">{(brief as Record<string,unknown>).why_it_matters as string}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-0.5">Business Value</p>
                  <p className="text-xs text-slate-700">{(brief as Record<string,unknown>).business_value as string}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-0.5">Engineering Value</p>
                  <p className="text-xs text-slate-700">{(brief as Record<string,unknown>).engineering_value as string}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Effort', value: (brief as Record<string,unknown>).effort_estimate },
                  { label: 'Timeline', value: (brief as Record<string,unknown>).timeline },
                  { label: 'Release Impact', value: (brief as Record<string,unknown>).release_impact },
                ].map(k => (
                  <div key={k.label} className="bg-white rounded-lg border border-emerald-100 px-2 py-1.5 text-center">
                    <p className="text-[10px] text-emerald-600 font-semibold">{k.label}</p>
                    <p className="text-xs text-slate-700 mt-0.5">{String(k.value ?? '—')}</p>
                  </div>
                ))}
              </div>
              <div className="bg-white border border-emerald-200 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-1">Recommendation</p>
                <p className="text-sm font-medium text-slate-800">{(brief as Record<string,unknown>).recommendation as string}</p>
                <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1.5">
                  <ArrowRight size={11} className="text-emerald-500" />
                  Next action: {(brief as Record<string,unknown>).next_action as string}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function DependencyTab() {
    const deps = intelligence?.dependency_analysis as Record<string, unknown> | null | undefined;
    const impact = intelligence?.impact_analysis as Record<string, unknown> | null | undefined;
    if (!intelligence) return <IntelligenceEmpty onGenerate={handleGenerate} generating={generating} />;

    const depGroups: Array<{ label: string; key: string; color: string }> = [
      { label: 'Missions',             key: 'missions',           color: 'bg-violet-50 text-violet-700 border-violet-100' },
      { label: 'Engineering Reviews',  key: 'engineering_reviews',color: 'bg-cyan-50 text-cyan-700 border-cyan-100' },
      { label: 'Work Orders (EWOs)',   key: 'ewos',               color: 'bg-blue-50 text-blue-700 border-blue-100' },
      { label: 'Specifications',       key: 'specifications',     color: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
      { label: 'Platform Modules',     key: 'platform_modules',   color: 'bg-teal-50 text-teal-700 border-teal-100' },
      { label: 'UI Pages',             key: 'ui_pages',           color: 'bg-sky-50 text-sky-700 border-sky-100' },
      { label: 'Components',           key: 'components',         color: 'bg-blue-50 text-blue-600 border-blue-100' },
      { label: 'Database Tables',      key: 'database_tables',    color: 'bg-amber-50 text-amber-700 border-amber-100' },
      { label: 'API Endpoints',        key: 'api_endpoints',      color: 'bg-orange-50 text-orange-700 border-orange-100' },
      { label: 'Releases',             key: 'releases',           color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
      { label: 'Audits',               key: 'audits',             color: 'bg-rose-50 text-rose-700 border-rose-100' },
      { label: 'Benchmarks',           key: 'benchmarks',         color: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100' },
      { label: 'Test Plans',           key: 'test_plans',         color: 'bg-lime-50 text-lime-700 border-lime-100' },
      { label: 'Risks',                key: 'risks',              color: 'bg-red-50 text-red-700 border-red-100' },
      { label: 'Technical Debt',       key: 'technical_debt',     color: 'bg-yellow-50 text-yellow-700 border-yellow-100' },
      { label: 'Roadmap Items',        key: 'roadmap_items',      color: 'bg-pink-50 text-pink-700 border-pink-100' },
    ];

    return (
      <div className="space-y-4">
        {/* Impact summary */}
        {impact && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <Zap size={12} />Impact Assessment
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Complexity',  value: `${impact.complexity_score}/10`,  color: (impact.complexity_score as number) > 7 ? 'text-red-600' : (impact.complexity_score as number) > 4 ? 'text-amber-600' : 'text-emerald-600' },
                { label: 'Effort',      value: impact.effort_estimate,            color: 'text-blue-600' },
                { label: 'Regression',  value: String(impact.regression_risk).toUpperCase(), color: (impact.regression_risk === 'critical' || impact.regression_risk === 'high') ? 'text-red-600' : 'text-slate-600' },
                { label: 'Systems',     value: (impact.affected_systems as string[]).length,  color: 'text-slate-700' },
              ].map(k => (
                <div key={k.label} className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
                  <p className={`text-sm font-bold ${k.color}`}>{String(k.value)}</p>
                  <p className="text-[10px] text-slate-400">{k.label}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2 text-xs">
              {(impact.affected_systems as string[]).length > 0 && (
                <div>
                  <p className="font-semibold text-slate-500 mb-1">Affected Systems</p>
                  <div className="flex flex-wrap gap-1">{(impact.affected_systems as string[]).map((s, i) => <Pill key={i} text={s} color="bg-blue-50 text-blue-700 border-blue-200" />)}</div>
                </div>
              )}
              {(impact.affected_governance as string[]).length > 0 && (
                <div>
                  <p className="font-semibold text-slate-500 mb-1">Governance Impact</p>
                  <p className="text-slate-600">{impact.governance_impact as string}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dependency groups */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Layers size={12} />Dependency Graph ({deps ? String(deps.total_dependencies) : 0} total)
          </h3>
          {deps ? (
            <div className="space-y-3">
              {depGroups.map(g => (
                <DependencyGroup
                  key={g.key}
                  label={g.label}
                  items={(deps[g.key] as Array<Record<string, string>> ?? [])}
                  color={g.color}
                />
              ))}
              {depGroups.every(g => ((deps[g.key] as unknown[]) ?? []).length === 0) && (
                <p className="text-xs text-slate-400 italic">No EIG entities linked to this review yet. Add entity references to the Engineering Intelligence Graph to build the dependency map.</p>
              )}
            </div>
          ) : <EmptySection label="No dependency data available." />}
        </div>
      </div>
    );
  }

  function RiskTab() {
    const risks = intelligence?.risk_register as Record<string,unknown>[] | null | undefined;
    const traceability = intelligence?.traceability as Record<string,unknown> | null | undefined;
    if (!intelligence) return <IntelligenceEmpty onGenerate={handleGenerate} generating={generating} />;

    return (
      <div className="space-y-4">
        {/* Risk Register */}
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <AlertTriangle size={13} className="text-slate-500" />
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Risk Register ({risks?.length ?? 0})</h3>
          </div>
          {risks && risks.length > 0 ? (
            <div className="divide-y divide-slate-50">
              {risks.map((r, i) => (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-start gap-2 mb-1.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border flex-shrink-0 ${SEVERITY_COLOR[r.severity as string] ?? SEVERITY_COLOR.medium}`}>
                      {String(r.severity).toUpperCase()}
                    </span>
                    <p className="text-xs font-medium text-slate-700">{r.description as string}</p>
                  </div>
                  <div className="flex gap-4 text-[10px] text-slate-500 pl-12">
                    <span>Likelihood: <span className="font-medium text-slate-700">{r.likelihood as string}</span></span>
                    <span>Impact: <span className="font-medium text-slate-700">{r.impact as string}</span></span>
                    <span>Owner: <span className="font-medium text-slate-700">{r.owner as string}</span></span>
                    <span className={`ml-auto font-semibold ${r.status === 'open' ? 'text-amber-600' : r.status === 'mitigated' ? 'text-emerald-600' : 'text-slate-500'}`}>{String(r.status).toUpperCase()}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1.5 pl-12 leading-relaxed"><span className="font-medium text-slate-600">Mitigation:</span> {r.mitigation as string}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-4"><EmptySection label="No risks identified. Run intelligence to generate risk register." /></div>
          )}
        </div>

        {/* Traceability */}
        {traceability && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <GitBranch size={12} />Engineering Traceability
              </h3>
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-400 rounded-full" style={{ width: `${traceability.completeness_pct as number}%` }} />
                </div>
                <span className="text-xs font-semibold text-blue-600">{traceability.completeness_pct as number}%</span>
              </div>
            </div>
            <div className="space-y-2">
              {(traceability.chain as Array<Record<string,unknown>> ?? []).map((link, i, arr) => (
                <div key={i}>
                  <TraceLink
                    layer={link.layer as string}
                    entity={link.entity as string | null}
                    entity_ref={link.entity_ref as string | null}
                    status={link.status as 'present' | 'missing'}
                  />
                  {i < arr.length - 1 && (
                    <div className="ml-0.5 pl-0.5 py-0.5">
                      <div className="w-px h-3 bg-slate-200 ml-0.5" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            {(traceability.missing_links as string[] ?? []).length > 0 && (
              <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                <p className="text-[10px] font-semibold text-amber-600 mb-1">Missing Traceability Links</p>
                <div className="flex flex-wrap gap-1">
                  {(traceability.missing_links as string[]).map((l, i) => <Pill key={i} text={l} color="bg-amber-50 text-amber-700 border-amber-200" />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function ReadinessTab() {
    const readiness = intelligence?.release_readiness as Record<string,unknown> | null | undefined;
    const implPlan = intelligence?.implementation_plan as Record<string,unknown> | null | undefined;
    const testing = intelligence?.testing_assessment as Record<string,unknown> | null | undefined;
    const docs = intelligence?.documentation_assessment as Record<string,unknown> | null | undefined;
    if (!intelligence) return <IntelligenceEmpty onGenerate={handleGenerate} generating={generating} />;

    return (
      <div className="space-y-4">
        {/* Release Readiness */}
        {readiness && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <CheckSquare size={12} />Release Readiness Gates
              </h3>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${readiness.overall_ready ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                {readiness.overall_ready ? 'READY' : 'NOT READY'}
              </span>
            </div>
            <div className="space-y-2">
              {(readiness.gates as Array<Record<string,unknown>> ?? []).map((g, i) => (
                <GateRow key={i} gate={g.gate as string} ready={g.ready as boolean} note={g.note as string} />
              ))}
            </div>
            {(readiness.blockers as string[] ?? []).length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide">Blockers</p>
                {(readiness.blockers as string[]).map((b, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded px-2 py-1.5 border border-red-100">
                    <AlertTriangle size={10} className="flex-shrink-0 mt-0.5" />{b}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Implementation Plan */}
        {implPlan && (implPlan.phases as unknown[]).length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <ChevronRight size={12} />Implementation Plan
            </h3>
            <div className="space-y-3">
              {(implPlan.phases as Array<Record<string,unknown>>).map(p => (
                <div key={p.phase as number} className="border border-slate-100 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-3 py-2 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">{p.phase as number}</span>
                    <p className="text-xs font-semibold text-slate-700">{p.title as string}</p>
                  </div>
                  <div className="px-3 py-2 space-y-1">
                    {(p.items as string[]).slice(0, 5).map((item, i) => (
                      <p key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                        <span className="text-slate-300 flex-shrink-0">·</span>{item}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {(implPlan.critical_path as string[]).length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] font-semibold text-slate-500 mb-1">Critical Path</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(implPlan.critical_path as string[]).map((step, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <ArrowRight size={10} className="text-slate-300" />}
                      <span className="text-[10px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">{step}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Testing Assessment */}
        {testing && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle2 size={12} />Testing Assessment
              </h3>
              <span className="text-xs font-semibold text-blue-600">{testing.coverage_pct as number}% coverage</span>
            </div>
            {(testing.existing_plans as string[]).length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-emerald-600 mb-1">Existing Plans ({(testing.existing_plans as string[]).length})</p>
                <div className="flex flex-wrap gap-1">{(testing.existing_plans as string[]).map((p, i) => <Pill key={i} text={p} color="bg-emerald-50 text-emerald-700 border-emerald-200" />)}</div>
              </div>
            )}
            {(testing.missing_plans as string[]).length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-amber-600 mb-1">Missing Plans</p>
                <div className="flex flex-wrap gap-1">{(testing.missing_plans as string[]).map((p, i) => <Pill key={i} text={p} color="bg-amber-50 text-amber-700 border-amber-200" />)}</div>
              </div>
            )}
            {(testing.recommended_activities as string[]).length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-slate-500 mb-1">Recommended Activities</p>
                <div className="space-y-1">
                  {(testing.recommended_activities as string[]).map((a, i) => (
                    <p key={i} className="text-xs text-slate-600 flex items-start gap-1.5"><span className="text-blue-300 flex-shrink-0">·</span>{a}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Documentation Assessment */}
        {docs && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <FileText size={12} />Documentation Assessment
            </h3>
            {(docs.missing as string[]).length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-red-600 mb-1">Missing ({(docs.missing as string[]).length})</p>
                <div className="flex flex-wrap gap-1">{(docs.missing as string[]).map((d, i) => <Pill key={i} text={d} color="bg-red-50 text-red-700 border-red-200" />)}</div>
              </div>
            )}
            {(docs.updates_required as string[]).length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] font-semibold text-amber-600 mb-1">Updates Required</p>
                <div className="flex flex-wrap gap-1">{(docs.updates_required as string[]).map((d, i) => <Pill key={i} text={d} color="bg-amber-50 text-amber-700 border-amber-200" />)}</div>
              </div>
            )}
            {(docs.existing as string[]).length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-emerald-600 mb-1">Existing ({(docs.existing as string[]).length})</p>
                <div className="flex flex-wrap gap-1">{(docs.existing as string[]).map((d, i) => <Pill key={i} text={d} color="bg-emerald-50 text-emerald-700 border-emerald-200" />)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-white">

      {/* Header */}
      <div className={`shrink-0 px-6 pt-5 pb-4 border-b ${review.is_reference ? 'bg-gradient-to-r from-amber-50 to-white border-amber-200' : 'bg-white border-slate-200'}`}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">
              {review.erc_number}
            </span>
            {review.is_reference && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-300">
                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                Reference Review
              </span>
            )}
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${typeCls}`}>
              <Tag className="w-3 h-3" />
              {typeLabel}
            </span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${sc.bg} ${sc.color}`}>
              <StatusIcon className="w-3 h-3" />
              {sc.label}
            </span>
            {review.intelligence_quality_score != null && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${review.intelligence_quality_score >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : review.intelligence_quality_score >= 60 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                <Brain className="w-3 h-3" />
                IQ {review.intelligence_quality_score}
              </span>
            )}
          </div>
          <button onClick={onClose} className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <h1 className="text-lg font-bold text-slate-900 leading-snug mb-3">{review.title}</h1>

        <div className="flex items-center gap-4 flex-wrap text-xs text-slate-500">
          {review.engineering_area && <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" />{review.engineering_area}</span>}
          {review.author && <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />{review.author}</span>}
          <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{fmtDate(review.review_date)}</span>
        </div>

        {review.is_reference && review.reference_reason && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-start gap-2.5">
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-800 mb-0.5">Reference Engineering Review</p>
              <p className="text-[11px] text-amber-700">{review.reference_reason}</p>
              {review.reference_approved_by && (
                <p className="text-[10px] text-amber-600 mt-0.5">Approved by {review.reference_approved_by} · {fmtDate(review.reference_date)}</p>
              )}
            </div>
          </div>
        )}

        {meta && typeof meta.defect_count === 'number' && (
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-3 py-1.5">
              <AlertTriangle className="w-3 h-3 text-slate-500" />
              <span className="text-xs font-semibold text-slate-700">{String(meta.defect_count)} defects</span>
            </div>
            {typeof meta.critical_defects === 'number' && meta.critical_defects > 0 && (
              <div className="flex items-center gap-1.5 bg-red-50 rounded-lg px-3 py-1.5 border border-red-100">
                <AlertCircle className="w-3 h-3 text-red-500" />
                <span className="text-xs font-semibold text-red-700">{String(meta.critical_defects)} critical</span>
              </div>
            )}
            {typeof meta.files_changed === 'number' && (
              <div className="flex items-center gap-1.5 bg-blue-50 rounded-lg px-3 py-1.5 border border-blue-100">
                <FileText className="w-3 h-3 text-blue-500" />
                <span className="text-xs font-semibold text-blue-700">{String(meta.files_changed)} file{meta.files_changed !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b border-slate-200 bg-white">
        <div className="flex overflow-x-auto px-6 gap-0">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-all ${
                tab === t.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">

        {tab === 'overview' && (
          <div className="space-y-4">
            <Section title="Executive Summary">
              {review.executive_summary ? <p>{review.executive_summary}</p> : <EmptySection label="No executive summary recorded." />}
            </Section>
            <Section title="Problem Statement" accent>
              {review.problem_statement ? <p>{review.problem_statement}</p> : <EmptySection label="No problem statement recorded." />}
            </Section>
            <Section title="Engineering Assessment">
              {review.engineering_assessment ? <p>{review.engineering_assessment}</p> : <EmptySection label="No engineering assessment recorded." />}
            </Section>
          </div>
        )}

        {tab === 'narrative'   && <NarrativeTab />}
        {tab === 'intelligence' && <IntelligenceTab />}
        {tab === 'learning'     && <LearningTab />}
        {tab === 'analysis'    && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <DependencyTab />
              <RiskTab />
            </div>
          </div>
        )}

        {tab === 'changes' && (
          <div className="space-y-4">
            <Section title="Changes Implemented">
              {review.changes_implemented ? <p>{review.changes_implemented}</p> : <EmptySection label="No changes recorded." />}
            </Section>
            {review.files_modified && review.files_modified.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Files Modified</h3>
                <div className="space-y-1.5">
                  {review.files_modified.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-700 font-mono bg-slate-50 rounded-lg px-3 py-2">
                      <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />{f}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Section title="Validation Performed" accent>
              {review.validation_performed ? <p>{review.validation_performed}</p> : <EmptySection label="No validation recorded." />}
            </Section>
            <Section title="Regression Testing">
              {review.regression_testing ? <p>{review.regression_testing}</p> : <EmptySection label="No regression testing recorded." />}
            </Section>
          </div>
        )}

        {tab === 'lessons' && (
          <div className="space-y-4">
            <Section title="Lessons Learned">
              {review.lessons_learned ? <p>{review.lessons_learned}</p> : <EmptySection label="No lessons recorded." />}
            </Section>
            <Section title="Future Recommendations" accent>
              {review.future_recommendations ? <p>{review.future_recommendations}</p> : <EmptySection label="No future recommendations recorded." />}
            </Section>
          </div>
        )}

        {tab === 'governance' && (
          <div className="space-y-4">
            {[
              { label: 'Related Engineering Audits',    items: review.related_audits,     color: 'bg-blue-50 text-blue-700 border-blue-200' },
              { label: 'Related Releases',              items: review.related_releases,    color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
              { label: 'Related Test Plans',            items: review.related_test_plans,  color: 'bg-teal-50 text-teal-700 border-teal-200' },
              { label: 'Related Engineering Decisions', items: review.related_decisions,   color: 'bg-violet-50 text-violet-700 border-violet-200' },
              { label: 'Related Dev Phases',            items: review.related_phases,      color: 'bg-slate-100 text-slate-700 border-slate-200' },
            ].map(g => (
              <div key={g.label} className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">{g.label}</h3>
                {g.items.length > 0
                  ? <div className="flex flex-wrap gap-2">{g.items.map(a => <Pill key={a} text={a} color={g.color} />)}</div>
                  : <EmptySection label={`No ${g.label.toLowerCase()} linked.`} />}
              </div>
            ))}
            {review.related_features.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Related Features</h3>
                <div className="flex flex-wrap gap-2">{review.related_features.map(f => <Pill key={f} text={f} color="bg-orange-50 text-orange-700 border-orange-200" />)}</div>
              </div>
            )}
            {review.related_ercs.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Related Engineering Reviews</h3>
                <div className="flex flex-wrap gap-2">{review.related_ercs.map(e => <Pill key={e} text={e} color="bg-amber-50 text-amber-700 border-amber-200" />)}</div>
              </div>
            )}
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
              <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">Governance Traceability</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: 'Audits',     count: review.related_audits.length     },
                  { label: 'Releases',   count: review.related_releases.length   },
                  { label: 'Decisions',  count: review.related_decisions.length  },
                  { label: 'Test Plans', count: review.related_test_plans.length },
                  { label: 'Features',   count: review.related_features.length   },
                  { label: 'Reviews',    count: review.related_ercs.length       },
                ].map(item => (
                  <div key={item.label} className="bg-white rounded-lg border border-blue-100 py-2">
                    <p className="text-base font-bold text-blue-700">{item.count}</p>
                    <p className="text-[10px] text-blue-500">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Readiness panel integrated in governance */}
            <ReadinessTab />
          </div>
        )}

        {tab === 'full' && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Full Engineering Review</h3>
            {review.full_review ? (
              <pre className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-mono bg-slate-50 rounded-lg p-4 border border-slate-100 overflow-x-auto">
                {review.full_review}
              </pre>
            ) : <EmptySection label="No full review document recorded." />}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> {review.erc_number}</span>
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {fmtDate(review.review_date)}</span>
          {review.intelligence_generated_at && (
            <span className="flex items-center gap-1 text-blue-400"><Brain className="w-3 h-3" /> Intelligence {fmtTs(review.intelligence_generated_at)}</span>
          )}
          {review.elpm_generated_at && (
            <span className="flex items-center gap-1 text-emerald-400"><GitBranch className="w-3 h-3" /> Learning {fmtTs(review.elpm_generated_at)}</span>
          )}
        </div>
        {review.is_reference && (
          <span className="text-[10px] font-semibold text-amber-600 flex items-center gap-1">
            <Star className="w-3 h-3 fill-amber-500" />
            Reference Review — Protected Governance Artefact
          </span>
        )}
      </div>
    </div>
  );
}
