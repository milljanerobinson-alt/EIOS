import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen, CheckCircle2, Clock,
  ChevronDown, ChevronRight, RefreshCw, Shield,
  FileText, BarChart3, Star, Eye, Lock, ArrowRight,
  Layers, Copy, Check, Play, X, Zap, ExternalLink,
  Cpu, Database, Sparkles, AlertTriangle, Ban, Target,
  TrendingUp, TrendingDown, Search, Activity, Award,
  Minus, Filter,
} from 'lucide-react';
import {
  loadBenchmarkDefinitions,
  loadBenchmarkSessions,
  loadBenchmarkRuns,
  createSession,
  addBenchmarkRun,
  updateRunReviewStatus,
  completeSession,
  getLatestVersionRefs,
  loadIncompleteSession,
  supersedeBenchmarkSession,
  loadLatestAcceptedReview,
  CAPABILITY_DIMENSIONS,
  type BenchmarkDefinition,
  type BenchmarkSession,
  type BenchmarkRun,
  type BenchmarkReview,
  type RunReviewStatus,
  type SessionOutcome,
  type SupersedeSessionInput,
  type ValidationEvent,
  type CapabilityScores,
} from '../../lib/atdBenchmarkService';
import {
  snapshotPlatformState,
  loadRegisteredSources,
  assembleSources,
  generateContextPackage,
} from '../../lib/eipService';
import { generateSnapshot as generatePISSnapshot } from '../../lib/pisService';
import { ECCBenchmarkReviewPanel } from './ECCBenchmarkReviewPanel';
import { ECCSessionOverviewPanel } from './ECCSessionOverviewPanel';

// ─── Constants ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'library' | 'sessions' | 'runs';

const BENCHMARK_ORDER = ['ATD-BMK-001', 'ATD-BMK-002', 'ATD-BMK-003'];

const RUN_STATUS_CONFIG: Record<RunReviewStatus, { label: string; color: string; bg: string; border: string; icon: typeof Clock }> = {
  awaiting_review: { label: 'Awaiting Review', color: 'text-slate-600',   bg: 'bg-slate-50',    border: 'border-slate-200',   icon: Clock        },
  under_review:    { label: 'Under Review',    color: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200',   icon: Eye          },
  reviewed:        { label: 'Reviewed',        color: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-200',    icon: CheckCircle2 },
  accepted:        { label: 'Accepted',        color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200', icon: CheckCircle2 },
};

// Effective filter options for Run History — covers both run-level and session governance statuses
// that may be displayed as the badge on a run card.
const RUN_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'awaiting_review',            label: 'Awaiting Review'            },
  { value: 'under_review',               label: 'Under Review'               },
  { value: 'reviewed',                   label: 'Reviewed'                   },
  { value: 'awaiting_po_acceptance',     label: 'Awaiting PO Acceptance'     },
  { value: 'accepted',                   label: 'Accepted'                   },
  { value: 'accepted_with_observations', label: 'Accepted with Observations' },
  { value: 'returned_for_improvement',   label: 'Returned for Improvement'   },
  { value: 'superseded',                 label: 'Superseded'                 },
];

// Derives the effective status shown on a run card. Session governance takes precedence
// over the run's own review_status once the session reaches a terminal state.
function getRunEffectiveStatus(run: BenchmarkRun, sessionMap: Record<string, BenchmarkSession>): string {
  const session = run.session_id ? sessionMap[run.session_id] : null;
  if (!session) return run.review_status;
  if (session.session_outcome === 'superseded') return 'superseded';
  const ss = session.overall_review_status;
  if (
    ss === 'accepted' ||
    ss === 'accepted_with_observations' ||
    ss === 'returned_for_improvement' ||
    ss === 'awaiting_po_acceptance'
  ) return ss;
  return run.review_status;
}

const SESSION_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  awaiting_review:            { label: 'Awaiting Review',            color: 'text-slate-600',   bg: 'bg-slate-50',   border: 'border-slate-200'   },
  under_review:               { label: 'Under Review',               color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200'   },
  reviewed:                   { label: 'Reviewed',                   color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200'    },
  review_complete:            { label: 'Review Complete',            color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200'    },
  awaiting_po_acceptance:     { label: 'Awaiting PO Acceptance',     color: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-200'  },
  accepted:                   { label: 'Accepted',                   color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  accepted_with_observations: { label: 'Accepted with Observations', color: 'text-teal-700',    bg: 'bg-teal-50',    border: 'border-teal-200'    },
  returned_for_improvement:   { label: 'Returned for Improvement',   color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200'     },
};

const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; headerBg: string; headerBorder: string; headerText: string }> = {
  strategic_reasoning: { label: 'Strategic Reasoning', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', headerBg: 'bg-purple-900', headerBorder: 'border-purple-700', headerText: 'text-purple-200' },
  architecture:        { label: 'Architecture',         color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200',   headerBg: 'bg-blue-900',   headerBorder: 'border-blue-700',   headerText: 'text-blue-200'   },
  roadmap_planning:    { label: 'Roadmap Planning',     color: 'text-emerald-700',bg: 'bg-emerald-50',border: 'border-emerald-200',headerBg: 'bg-emerald-900',headerBorder: 'border-emerald-700',headerText: 'text-emerald-200'},
  general:             { label: 'General',              color: 'text-slate-700',  bg: 'bg-slate-100', border: 'border-slate-200',  headerBg: 'bg-slate-800',  headerBorder: 'border-slate-600',  headerText: 'text-slate-300'  },
};

const SESSION_OUTCOME_CONFIG: Record<SessionOutcome, { label: string; color: string; bg: string; border: string; icon: typeof Clock }> = {
  in_progress: { label: 'In Progress',  color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200',    icon: RefreshCw    },
  completed:   { label: 'Completed',    color: 'text-slate-600',   bg: 'bg-slate-50',   border: 'border-slate-200',   icon: CheckCircle2 },
  accepted:    { label: 'Accepted',     color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 },
  superseded:  { label: 'Superseded',   color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   icon: Ban          },
  cancelled:   { label: 'Cancelled',    color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',     icon: X            },
};

const RUN_REVIEW_STEPS: RunReviewStatus[] = ['awaiting_review', 'under_review', 'reviewed', 'accepted'];

function nextRunReviewStatus(current: RunReviewStatus): RunReviewStatus | null {
  const idx = RUN_REVIEW_STEPS.indexOf(current);
  if (idx < 0 || idx === RUN_REVIEW_STEPS.length - 1) return null;
  return RUN_REVIEW_STEPS[idx + 1];
}

// ─── Structural Benchmark Validator v2.0 ──────────────────────────────────────

interface BenchmarkFingerprint {
  expectedHeadings: string[];  // lowercase; case-insensitive match against response
  negativeIndicators: string[]; // headings that strongly indicate a DIFFERENT benchmark
}

const BENCHMARK_FINGERPRINTS: Record<string, BenchmarkFingerprint> = {
  'ATD-BMK-001': {
    expectedHeadings: [
      'executive summary',
      'engineering opportunities',
      'alternative investments',
      'comparative evaluation',
      'business justification',
      'technical justification',
      'customer impact',
      'commercial impact',
      'estimated engineering effort',
      'success criteria',
    ],
    negativeIndicators: [
      'current architecture assessment',
      'architectural strengths',
      'architectural weaknesses',
      'scalability assessment',
      'maintainability assessment',
      'critical path analysis',
      'launch readiness assessment',
      'top five recommended investments',
    ],
  },
  'ATD-BMK-002': {
    expectedHeadings: [
      'current architecture assessment',
      'architectural strengths',
      'architectural weaknesses',
      'technical risks',
      'scalability assessment',
      'maintainability assessment',
      'future architecture',
      'prioritised recommendations',
    ],
    negativeIndicators: [
      'alternative investments considered',
      'alternative investments',
      'estimated engineering effort',
      'business justification',
      'critical path analysis',
      'launch readiness assessment',
      'top five recommended investments',
      'current roadmap assessment',
    ],
  },
  'ATD-BMK-003': {
    expectedHeadings: [
      'current roadmap assessment',
      'critical path analysis',
      'top five recommended investments',
      'launch readiness assessment',
      'technical dependencies',
      'success measures',
      'commercial impact',
      'customer impact',
    ],
    negativeIndicators: [
      'current architecture assessment',
      'architectural strengths',
      'architectural weaknesses',
      'scalability assessment',
      'maintainability assessment',
      'alternative investments considered',
      'alternative investments',
      'estimated engineering effort',
    ],
  },
};

type ValidationStatus = 'none' | 'prompt' | 'mismatch' | 'moderate' | 'clean';

interface ValidationSignals {
  headingScore: number;   // 0–1: fraction of expected headings detected
  structureScore: number; // 0–1: document has heading-like structure
  negativeScore: number;  // 0–1: fraction of negative indicators found (penalises confidence)
}

interface ValidationResult {
  status: ValidationStatus;
  confidence: number; // 0–100
  detectedHeadings: string[];
  missingHeadings: string[];
  likelyBenchmarkId: string | null;
  likelyBenchmarkName: string | null;
  likelyDetectedHeadings: string[];
  signals: ValidationSignals;
  validatorVersion: string;
}

const VALIDATOR_VERSION = '2.0';

function detectDocumentStructure(text: string): boolean {
  // Look for heading-like patterns: markdown headers, bold titles, ALL CAPS lines
  return /(?:^|\n)(?:#{1,3}\s+[A-Z]|\*\*[A-Z][^*]{3,}\*\*|[A-Z][A-Z\s]{8,}(?:\n|$))/m.test(text);
}

function scoreFingerprint(lower: string, fp: BenchmarkFingerprint): {
  headingScore: number;
  negativeScore: number;
  detected: string[];
  missing: string[];
} {
  const detected = fp.expectedHeadings.filter(h => lower.includes(h));
  const missing = fp.expectedHeadings.filter(h => !lower.includes(h));
  const negFound = fp.negativeIndicators.filter(n => lower.includes(n)).length;
  return {
    headingScore: detected.length / fp.expectedHeadings.length,
    negativeScore: fp.negativeIndicators.length > 0 ? negFound / fp.negativeIndicators.length : 0,
    detected,
    missing,
  };
}

function validateBenchmarkResponse(
  text: string,
  currentBenchmarkId: string,
  allDefinitions: BenchmarkDefinition[],
): ValidationResult {
  const lower = text.toLowerCase();

  // Prompt paste check first
  if (detectPromptPaste(text)) {
    return {
      status: 'prompt',
      confidence: 0,
      detectedHeadings: [],
      missingHeadings: BENCHMARK_FINGERPRINTS[currentBenchmarkId]?.expectedHeadings ?? [],
      likelyBenchmarkId: null,
      likelyBenchmarkName: null,
      likelyDetectedHeadings: [],
      signals: { headingScore: 0, structureScore: 0, negativeScore: 0 },
      validatorVersion: VALIDATOR_VERSION,
    };
  }

  const currentFp = BENCHMARK_FINGERPRINTS[currentBenchmarkId];
  if (!currentFp) {
    // Unknown benchmark — pass through without validation
    return {
      status: 'clean',
      confidence: 75,
      detectedHeadings: [],
      missingHeadings: [],
      likelyBenchmarkId: null,
      likelyBenchmarkName: null,
      likelyDetectedHeadings: [],
      signals: { headingScore: 0.75, structureScore: 1, negativeScore: 0 },
      validatorVersion: VALIDATOR_VERSION,
    };
  }

  // Score current benchmark
  const current = scoreFingerprint(lower, currentFp);
  const hasStructure = detectDocumentStructure(text);
  const structureScore = hasStructure ? 1 : 0.6;

  // Score all other benchmarks to find best competitor
  let bestOtherId: string | null = null;
  let bestOtherScore = 0;
  let bestOtherDetected: string[] = [];

  for (const def of allDefinitions) {
    if (def.benchmark_id === currentBenchmarkId) continue;
    const fp = BENCHMARK_FINGERPRINTS[def.benchmark_id];
    if (!fp) continue;
    const other = scoreFingerprint(lower, fp);
    if (other.headingScore > bestOtherScore) {
      bestOtherScore = other.headingScore;
      bestOtherId = def.benchmark_id;
      bestOtherDetected = other.detected;
    }
  }

  // Calculate confidence: heading score weighted 80%, structure 20%, penalised by negatives
  const rawConfidence = current.headingScore * 0.8 + structureScore * 0.2;
  const penalisedConfidence = rawConfidence * (1 - current.negativeScore * 0.45);
  const confidence = Math.round(Math.min(100, Math.max(0, penalisedConfidence * 100)));

  // Mismatch: another benchmark scores materially better
  const isMismatch =
    bestOtherId !== null &&
    bestOtherScore > current.headingScore + 0.18 &&
    bestOtherScore >= 0.38;

  const likelyDef = isMismatch
    ? allDefinitions.find(d => d.benchmark_id === bestOtherId) ?? null
    : null;

  let status: ValidationStatus;
  if (isMismatch) {
    status = 'mismatch';
  } else if (confidence < 65) {
    status = 'moderate';
  } else {
    status = 'clean';
  }

  return {
    status,
    confidence,
    detectedHeadings: current.detected,
    missingHeadings: current.missing,
    likelyBenchmarkId: isMismatch ? bestOtherId : null,
    likelyBenchmarkName: likelyDef?.benchmark_name ?? null,
    likelyDetectedHeadings: isMismatch ? bestOtherDetected : [],
    signals: {
      headingScore: current.headingScore,
      structureScore,
      negativeScore: current.negativeScore,
    },
    validatorVersion: VALIDATOR_VERSION,
  };
}

interface WizardVersions {
  platformStateId: string | null;
  platformStateVersion: string | null;
  pisSnapshotId: string | null;
  pisVersion: string | null;
  contextPackageId: string | null;
  contextPackageRef: string | null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy Prompt'}
    </button>
  );
}

function ProgressDots({ total, current, completed }: { total: number; current: number; completed: number }) {
  return (
    <div className="flex items-center gap-3">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
            i < completed
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : i === current
              ? 'bg-white border-blue-600 text-blue-600 ring-4 ring-blue-100'
              : 'bg-white border-slate-200 text-slate-400'
          }`}>
            {i < completed ? <Check className="w-4 h-4" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`h-0.5 w-10 transition-colors ${i < completed ? 'bg-emerald-400' : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// Prompt paste detection — returns true if the pasted text looks like benchmark instructions
const PROMPT_SIGNATURES = [
  'ATD-BMK-',
  'Conduct a ',
  'Your review must address:',
  'Copy this prompt',
  'benchmark prompt',
  'paste this into',
  'you are acting as',
  'you are the ai technical director',
];

function detectPromptPaste(text: string): boolean {
  if (text.length < 50) return false;
  const lower = text.toLowerCase();
  return PROMPT_SIGNATURES.some(sig => lower.includes(sig.toLowerCase()));
}

// ─── Transition Screen ────────────────────────────────────────────────────────

function TransitionScreen({
  completedBenchmark,
  nextBenchmark,
  completedIdx,
  totalCount,
  onContinue,
}: {
  completedBenchmark: BenchmarkDefinition;
  nextBenchmark: BenchmarkDefinition;
  completedIdx: number;
  totalCount: number;
  onContinue: () => void;
}) {
  const completedCat = CATEGORY_CONFIG[completedBenchmark.category] ?? CATEGORY_CONFIG.general;
  const nextCat = CATEGORY_CONFIG[nextBenchmark.category] ?? CATEGORY_CONFIG.general;

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-6 text-center">
        {/* Completed badge */}
        <div className="flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="w-9 h-9 text-emerald-600" />
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">Benchmark Response Captured</p>
          <h2 className="text-lg font-bold text-slate-900">{completedBenchmark.benchmark_name}</h2>
        </div>

        {/* Confirmation checklist */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 space-y-2 text-left">
          {[
            'Response validated',
            'Structure verified',
            'Stored as immutable governance evidence',
          ].map(item => (
            <div key={item} className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span className="text-sm text-emerald-800">{item}</span>
            </div>
          ))}
        </div>

        {/* Divider with progress */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-xs text-slate-400 font-medium">{completedIdx + 1} of {totalCount} done</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {/* Next benchmark preview */}
        <div className={`rounded-2xl border-2 ${nextCat.border} overflow-hidden`}>
          <div className={`px-5 py-4 ${nextCat.bg}`}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1 ${nextCat.color}">Up Next — Benchmark {completedIdx + 2}</p>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold text-slate-400">{nextBenchmark.benchmark_id}</span>
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${nextCat.color} ${nextCat.bg} border ${nextCat.border}`}>{nextCat.label}</span>
            </div>
            <p className="text-base font-bold text-slate-900">{nextBenchmark.benchmark_name}</p>
            <p className="text-sm text-slate-500 mt-1">{nextBenchmark.purpose}</p>
          </div>
          <div className="px-5 py-3 bg-white border-t border-slate-100">
            <p className="text-xs text-slate-500">
              This benchmark asks a <strong>different question</strong> to the one you just completed.
              Copy the new prompt carefully before pasting your response. Do not reuse your previous answer.
            </p>
          </div>
        </div>

        <button
          onClick={onContinue}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          Continue to Benchmark {completedIdx + 2} →
        </button>
      </div>
    </div>
  );
}

// ─── Prerequisite Generation ──────────────────────────────────────────────────

interface GenerationStep {
  id: string;
  label: string;
  icon: typeof Cpu;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
}

function PrerequisiteScreen({
  onGenerated,
  onCancel,
}: {
  onGenerated: (versions: WizardVersions) => void;
  onCancel: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<GenerationStep[]>([
    { id: 'platform',  label: 'Platform State Snapshot',          icon: Cpu,      status: 'pending' },
    { id: 'context',   label: 'Engineering Context Package',      icon: Database, status: 'pending' },
    { id: 'pis',       label: 'Product Intelligence Snapshot',    icon: Sparkles, status: 'pending' },
  ]);

  const setStepStatus = (id: string, status: GenerationStep['status'], detail?: string) =>
    setSteps(prev => prev.map(s => s.id === id ? { ...s, status, detail } : s));

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);

    try {
      setStepStatus('platform', 'running');
      const platformState = await snapshotPlatformState('ATD Benchmark Prerequisite');
      setStepStatus('platform', 'done', `v${platformState.version}`);

      setStepStatus('context', 'running');
      const registeredSources = await loadRegisteredSources();
      const sources = await assembleSources(registeredSources);
      const contextPackage = await generateContextPackage(
        sources,
        platformState.id,
        'benchmark_prerequisite',
        'Auto-generated for ATD Benchmark session',
      );
      setStepStatus('context', 'done', contextPackage.package_ref);

      setStepStatus('pis', 'running');
      const pisSnapshot = await generatePISSnapshot('ATD Benchmark Prerequisite', platformState.id, contextPackage.id);
      setStepStatus('pis', 'done', `v${pisSnapshot.pis_version ?? '1.0'}`);

      onGenerated({
        platformStateId: platformState.id,
        platformStateVersion: platformState.version,
        pisSnapshotId: pisSnapshot.id,
        pisVersion: pisSnapshot.pis_version ?? '1.0',
        contextPackageId: contextPackage.id,
        contextPackageRef: contextPackage.package_ref,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Generation failed';
      setError(msg);
      setSteps(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error', detail: msg } : s));
      setGenerating(false);
    }
  };

  const allDone = steps.every(s => s.status === 'done');

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border-2 border-amber-200 flex items-center justify-center mx-auto mb-4">
            <Database className="w-7 h-7 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Platform Snapshot Required</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            A benchmark session requires a current Platform State and Engineering Context Package to ensure version traceability.
          </p>
        </div>

        {/* What's missing */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Prerequisites not found</p>
          <p className="text-xs text-amber-800 leading-relaxed">
            No current Platform State or Engineering Context Package exists. These are required to ensure the benchmark is properly versioned and traceable to the platform's exact state at the time of execution.
          </p>
        </div>

        {/* Generation steps */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">What will be generated</p>
          </div>
          <div className="divide-y divide-slate-100">
            {steps.map(step => {
              const Icon = step.icon;
              return (
                <div key={step.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    step.status === 'done'    ? 'bg-emerald-100' :
                    step.status === 'running' ? 'bg-blue-100' :
                    step.status === 'error'   ? 'bg-red-100' :
                    'bg-slate-100'
                  }`}>
                    {step.status === 'running' ? (
                      <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
                    ) : step.status === 'done' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : step.status === 'error' ? (
                      <X className="w-4 h-4 text-red-600" />
                    ) : (
                      <Icon className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${
                      step.status === 'done'    ? 'text-emerald-800' :
                      step.status === 'running' ? 'text-blue-800' :
                      step.status === 'error'   ? 'text-red-700' :
                      'text-slate-700'
                    }`}>{step.label}</p>
                    {step.detail && (
                      <p className={`text-xs mt-0.5 font-mono ${
                        step.status === 'done'  ? 'text-emerald-600' :
                        step.status === 'error' ? 'text-red-500' :
                        'text-blue-500'
                      }`}>{step.detail}</p>
                    )}
                  </div>
                  {step.status === 'pending' && (
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded font-medium">Pending</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {error && !allDone && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="text-xs font-semibold text-red-700 mb-1">Generation failed</p>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button onClick={onCancel} disabled={generating && !allDone} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-40">
            Cancel
          </button>
          {!allDone ? (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {generating
                ? <><RefreshCw className="w-4 h-4 animate-spin" />Generating…</>
                : <><Sparkles className="w-4 h-4" />Generate Current Platform Snapshot</>
              }
            </button>
          ) : (
            <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Redirecting to benchmark setup…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Setup Step ───────────────────────────────────────────────────────────────

function SetupStep({
  definitions,
  sessionCount,
  onBegin,
  onCancel,
}: {
  definitions: BenchmarkDefinition[];
  sessionCount: number;
  onBegin: (opts: { name: string; atdVersion: string; eccVersion: string; isBaseline: boolean; versions: WizardVersions }) => Promise<void>;
  onCancel: () => void;
}) {
  const suggestedName = `Engineering Intelligence Benchmark — EIB-${String(sessionCount + 1).padStart(3, '0')}`;
  const [name, setName] = useState(suggestedName);
  const [atdVersion, setAtdVersion] = useState('');
  const [eccVersion, setEccVersion] = useState('');
  const [isBaseline, setIsBaseline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<WizardVersions | null>(null);
  const [versionLoading, setVersionLoading] = useState(true);
  const [showPrerequisite, setShowPrerequisite] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVersionLoading(true);
    getLatestVersionRefs().then(refs => {
      setVersions(refs);
      setVersionLoading(false);
      // Show prerequisite screen if either platform state or context package is missing
      if (!refs.platformStateId || !refs.contextPackageId) {
        setShowPrerequisite(true);
      }
    });
  }, []);

  const handlePrerequisiteGenerated = (generatedVersions: WizardVersions) => {
    setVersions(generatedVersions);
    // Brief pause so user sees the "done" state before transitioning
    setTimeout(() => setShowPrerequisite(false), 800);
  };

  const handleBegin = async () => {
    if (!name.trim()) { setError('Session name is required.'); return; }
    if (!versions) { setError('Version detection in progress.'); return; }
    setLoading(true);
    setError(null);
    try {
      await onBegin({ name, atdVersion, eccVersion, isBaseline, versions });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start session');
      setLoading(false);
    }
  };

  const orderedDefs = [...definitions].sort((a, b) =>
    BENCHMARK_ORDER.indexOf(a.benchmark_id) - BENCHMARK_ORDER.indexOf(b.benchmark_id)
  );

  if (versionLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-6 h-6 text-slate-400 animate-spin mx-auto mb-2" />
          <p className="text-sm text-slate-500">Checking platform prerequisites…</p>
        </div>
      </div>
    );
  }

  if (showPrerequisite) {
    return (
      <PrerequisiteScreen
        onGenerated={handlePrerequisiteGenerated}
        onCancel={onCancel}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Title */}
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Engineering Intelligence Benchmark</h2>
          <p className="text-sm text-slate-500 mt-1">
            This session will execute {BENCHMARK_ORDER.length} benchmarks in sequence and produce a permanent governance artefact.
          </p>
        </div>

        {/* Benchmark preview */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Benchmarks to be executed</p>
          {orderedDefs.map((d, i) => {
            const cat = CATEGORY_CONFIG[d.category] ?? CATEGORY_CONFIG.general;
            return (
              <div key={d.id} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 text-xs font-bold text-slate-600">{i + 1}</div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400">{d.benchmark_id}</span>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${cat.color} ${cat.bg}`}>{cat.label}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-800">{d.benchmark_name}</p>
                  <p className="text-xs text-slate-500">{d.purpose}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Session config */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Session Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">ATD Version <span className="font-normal text-slate-400">(optional)</span></label>
              <input
                type="text"
                value={atdVersion}
                onChange={e => setAtdVersion(e.target.value)}
                placeholder="e.g. claude-3-7-sonnet"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">ECC Version <span className="font-normal text-slate-400">(optional)</span></label>
              <input
                type="text"
                value={eccVersion}
                onChange={e => setEccVersion(e.target.value)}
                placeholder="e.g. 1.15.5"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isBaseline} onChange={e => setIsBaseline(e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm text-slate-700 flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-amber-500" />
              Mark as Baseline Session
            </span>
          </label>
        </div>

        {/* Version references — always populated at this point */}
        {versions && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Platform Version References — Verified</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-emerald-700">Platform State</span>
                <span className="font-mono text-emerald-900">v{versions.platformStateVersion}</span>
              </div>
              {versions.pisVersion && (
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-700">Product Intelligence</span>
                  <span className="font-mono text-emerald-900">v{versions.pisVersion}</span>
                </div>
              )}
              {versions.contextPackageRef && (
                <div className="flex justify-between text-xs">
                  <span className="text-emerald-700">Context Package</span>
                  <span className="font-mono text-emerald-900">{versions.contextPackageRef}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex justify-between pt-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
          <button
            onClick={handleBegin}
            disabled={loading || !versions}
            className="flex items-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Begin Benchmark
          </button>
        </div>
      </div>
    </div>
  );
}

function RunningStep({
  definition,
  currentIdx,
  totalCount,
  completedRuns,
  session,
  allDefinitions,
  onCapture,
}: {
  definition: BenchmarkDefinition;
  currentIdx: number;
  totalCount: number;
  completedRuns: BenchmarkRun[];
  session: BenchmarkSession;
  allDefinitions: BenchmarkDefinition[];
  onCapture: (response: string, model: string, provider: string, events: ValidationEvent[]) => Promise<void>;
}) {
  const [response, setResponse] = useState('');
  const [model, setModel] = useState('');
  const [provider, setProvider] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveValidation, setLiveValidation] = useState<ValidationResult | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isLast = currentIdx === totalCount - 1;
  const cat = CATEGORY_CONFIG[definition.category] ?? CATEGORY_CONFIG.general;

  // Reset all state when moving to a new benchmark
  useEffect(() => {
    setResponse('');
    setModel('');
    setProvider('');
    setError(null);
    setSaving(false);
    setLiveValidation(null);
    textareaRef.current?.focus();
  }, [currentIdx]);

  // Debounced live validation — fires 400ms after user stops typing
  useEffect(() => {
    if (response.length < 200) {
      setLiveValidation(null);
      return;
    }
    const timer = setTimeout(() => {
      setLiveValidation(validateBenchmarkResponse(response, definition.benchmark_id, allDefinitions));
    }, 400);
    return () => clearTimeout(timer);
  }, [response, definition.benchmark_id]); // allDefinitions is stable; intentionally omitted

  // Build governance events to store with the run
  const buildEvents = (isOverride: boolean): ValidationEvent[] => {
    const now = new Date().toISOString();
    const events: ValidationEvent[] = [];

    if (liveValidation) {
      events.push({
        type: 'validation_result',
        timestamp: now,
        metadata: {
          confidence: liveValidation.confidence,
          matchedBenchmarkId: definition.benchmark_id,
          headingScore: liveValidation.signals.headingScore,
          isMismatch: liveValidation.status === 'mismatch',
          validatorVersion: liveValidation.validatorVersion,
        },
      });
    }

    if (liveValidation?.status === 'prompt') {
      events.push({ type: 'prompt_detected', timestamp: now, detail: definition.benchmark_id });
    } else if (isOverride) {
      events.push({ type: 'override_selected', timestamp: now });
    } else if (liveValidation?.status === 'mismatch') {
      events.push({ type: 'mismatch_detected', timestamp: now, detail: liveValidation.likelyBenchmarkId ?? undefined });
    } else {
      events.push({ type: 'clean_capture', timestamp: now });
    }

    return events;
  };

  const doCapture = async (r: string, m: string, p: string, isOverride = false) => {
    setSaving(true);
    setError(null);
    try {
      await onCapture(r, m, p, buildEvents(isOverride));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save run');
      setSaving(false);
    }
  };

  const handleCapture = () => {
    if (!response.trim()) { setError('Paste the AI Technical Director response before capturing.'); return; }
    if (liveValidation?.status === 'prompt') return; // blocked — prompt detected
    doCapture(response.trim(), model.trim(), provider.trim(), false);
  };

  const confidencePct = liveValidation?.confidence ?? 0;
  const confidenceColor =
    !liveValidation ? '' :
    liveValidation.status === 'prompt' ? 'text-red-700' :
    liveValidation.status === 'mismatch' ? 'text-red-600' :
    confidencePct < 65 ? 'text-amber-600' :
    'text-emerald-600';

  const barColor =
    !liveValidation ? '' :
    liveValidation.status === 'prompt' || liveValidation.status === 'mismatch' ? 'bg-red-500' :
    confidencePct < 65 ? 'bg-amber-400' :
    'bg-emerald-500';

  // Show override buttons for mismatch/moderate; hide main capture button for prompt/mismatch
  const showMainCapture = !liveValidation || (liveValidation.status !== 'mismatch' && liveValidation.status !== 'prompt');
  const showOverridePanel = liveValidation?.status === 'mismatch';
  const showPromptError = liveValidation?.status === 'prompt';

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Category identity header band */}
      <div className={`${cat.headerBg} border-b-2 ${cat.headerBorder} px-8 py-3`}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">{currentIdx + 1}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-white/60">{definition.benchmark_id}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/10 text-white">{cat.label}</span>
              </div>
              <p className="text-sm font-bold text-white leading-tight">{definition.benchmark_name}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={`text-xs font-medium ${cat.headerText}`}>Benchmark</p>
            <p className="text-lg font-bold text-white">{currentIdx + 1} <span className={`text-sm font-normal ${cat.headerText}`}>of {totalCount}</span></p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-8 space-y-6">
        {/* Progress header */}
        <div className="flex items-center justify-between">
          <ProgressDots total={totalCount} current={currentIdx} completed={completedRuns.length} />
          <div className="text-right">
            <p className="text-xs text-slate-400">Session</p>
            <p className="text-sm font-bold text-slate-700">{session.session_ref}</p>
          </div>
        </div>

        {/* Two-column layout with workflow guide */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-0 items-stretch">
          {/* Left: Step 1 — Prompt */}
          <div className="flex flex-col" id="benchmark-prompt-panel">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-bold text-slate-800">Step 1 — Copy Benchmark Prompt</p>
                <p className="text-xs text-slate-500 mt-0.5">This is the instruction to give the AI Technical Director.</p>
              </div>
              <CopyButton text={definition.benchmark_prompt} />
            </div>
            <div
              className="bg-slate-900 rounded-xl p-4 flex-1 overflow-y-auto"
              style={{ minHeight: '20rem', maxHeight: '28rem' }}
              aria-label="Benchmark prompt — read only"
              role="region"
            >
              <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-sans">{definition.benchmark_prompt}</pre>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Copy this prompt exactly. Do not modify the benchmark instructions before pasting into the AI.
            </p>
          </div>

          {/* Workflow guide strip */}
          <div className="hidden lg:flex flex-col items-center justify-center px-5 py-2 gap-3" aria-hidden="true">
            <div className="w-px flex-1 bg-slate-200" />
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <Copy className="w-3.5 h-3.5 text-white" />
              </div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider leading-tight max-w-[5rem]">Copy Prompt</p>
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider leading-tight max-w-[5rem]">Paste into AI</p>
            </div>
            <div className="w-px h-4 bg-slate-200" />
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider leading-tight max-w-[5rem]">Paste Response</p>
            </div>
            <div className="w-px flex-1 bg-slate-200" />
          </div>

          {/* Right: Step 2 — Response */}
          <div className="flex flex-col" id="benchmark-response-panel">
            <div className="mb-2">
              <p className="text-sm font-bold text-slate-800">Step 2 — Paste AI Technical Director Response</p>
              <p className="text-xs text-slate-500 mt-0.5">Paste the completed AI response — not the benchmark instructions.</p>
            </div>
            <textarea
              id="benchmark-response-input"
              ref={textareaRef}
              value={response}
              onChange={e => setResponse(e.target.value)}
              rows={12}
              placeholder={`Paste the AI Technical Director's completed response to "${definition.benchmark_name}" here.\n\n⚠ Do NOT paste the benchmark prompt or instructions.\nOnly paste the response generated by the AI Technical Director.`}
              className="w-full px-3 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono leading-relaxed flex-1"
              style={{ minHeight: '20rem', maxHeight: '28rem' }}
              aria-label="Paste AI Technical Director response here"
              aria-describedby="response-guidance"
            />
            {/* Helper guide when empty; char count when populated */}
            {!response ? (
              <div id="response-guidance" className="mt-2 grid grid-cols-2 gap-3">
                <div className="bg-emerald-50 rounded-lg p-2.5">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1.5">Expected</p>
                  <div className="space-y-1">
                    <p className="text-xs text-emerald-700 flex items-center gap-1.5"><Check className="w-3 h-3 flex-shrink-0" />Completed AI Technical Director response</p>
                  </div>
                </div>
                <div className="bg-red-50 rounded-lg p-2.5">
                  <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1.5">Not Expected</p>
                  <div className="space-y-1">
                    <p className="text-xs text-red-600 flex items-center gap-1.5"><X className="w-3 h-3 flex-shrink-0" />Benchmark prompt</p>
                    <p className="text-xs text-red-600 flex items-center gap-1.5"><X className="w-3 h-3 flex-shrink-0" />Benchmark instructions</p>
                    <p className="text-xs text-red-600 flex items-center gap-1.5"><X className="w-3 h-3 flex-shrink-0" />Partial response</p>
                  </div>
                </div>
              </div>
            ) : (
              <div id="response-guidance" className="flex items-center justify-between mt-1">
                <p className="text-xs text-slate-400">{response.length.toLocaleString()} characters</p>
                {!liveValidation && (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />Analysing…
                  </span>
                )}
                {liveValidation?.status === 'clean' && (
                  <span className="text-xs text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />Response validated
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── Response Analysis Panel ──────────────────────────────────────── */}
        {liveValidation && (
          <div className={`rounded-xl border-2 overflow-hidden ${
            showPromptError ? 'border-red-300 bg-red-50' :
            showOverridePanel ? 'border-amber-300 bg-amber-50' :
            confidencePct < 65 ? 'border-amber-200 bg-amber-50' :
            'border-emerald-200 bg-emerald-50'
          }`}
            role="status"
            aria-live="polite"
            aria-label="Response analysis result"
          >
            {/* Panel header */}
            <div className={`px-4 py-3 border-b ${
              showPromptError ? 'border-red-200' :
              showOverridePanel ? 'border-amber-200' :
              confidencePct < 65 ? 'border-amber-200' :
              'border-emerald-200'
            } flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                {showPromptError ? (
                  <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" aria-hidden="true" />
                ) : showOverridePanel ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" aria-hidden="true" />
                ) : confidencePct < 65 ? (
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden="true" />
                )}
                <p className={`text-sm font-bold ${
                  showPromptError ? 'text-red-800' :
                  showOverridePanel ? 'text-amber-800' :
                  confidencePct < 65 ? 'text-amber-800' :
                  'text-emerald-800'
                }`}>
                  {showPromptError ? 'Benchmark Prompt Detected' :
                   showOverridePanel ? 'Possible Benchmark Capture Issue' :
                   confidencePct < 65 ? 'Response Review Recommended' :
                   'Response Validated'}
                </p>
              </div>
              {/* Confidence score badge */}
              {!showPromptError && (
                <div className="text-right">
                  <span className={`text-xs font-bold ${confidenceColor}`}>{confidencePct}% confidence</span>
                  {/* Confidence bar */}
                  <div className="w-24 h-1.5 bg-slate-200 rounded-full mt-1 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${confidencePct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Panel body */}
            <div className="px-4 py-3 space-y-3">
              {/* Prompt paste error */}
              {showPromptError && (
                <div className="space-y-2">
                  <p className="text-xs text-red-700 leading-relaxed">
                    It looks like you've pasted the benchmark instructions rather than the completed AI Technical Director response.
                    Paste the AI Technical Director's completed response into this field instead.
                  </p>
                  <p className="text-xs font-semibold text-red-700">No data has been captured.</p>
                </div>
              )}

              {/* Detected benchmark + document type */}
              {!showPromptError && (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5">Detected Benchmark</p>
                    <p className="text-xs font-bold text-slate-800">{definition.benchmark_id} — {definition.benchmark_name}</p>
                  </div>
                </div>
              )}

              {/* Mismatch: show likely benchmark */}
              {showOverridePanel && liveValidation.likelyBenchmarkName && (
                <div className="bg-white/60 rounded-lg p-3 space-y-1">
                  <p className="text-xs text-amber-800 leading-relaxed">
                    This response appears to belong to a different benchmark.
                  </p>
                  <p className="text-xs font-semibold text-amber-800">Most likely: {liveValidation.likelyBenchmarkId} — {liveValidation.likelyBenchmarkName}</p>
                  {liveValidation.likelyDetectedHeadings.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider">Detected for {liveValidation.likelyBenchmarkId}</p>
                      {liveValidation.likelyDetectedHeadings.map(h => (
                        <p key={h} className="text-xs text-amber-700 flex items-center gap-1.5 capitalize">
                          <CheckCircle2 className="w-3 h-3 flex-shrink-0" />{h}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Moderate: softer guidance */}
              {liveValidation.status === 'moderate' && (
                <p className="text-xs text-amber-700 leading-relaxed">
                  Some expected sections were detected but the response appears incomplete.
                  Please verify you have the correct response before capturing.
                </p>
              )}

              {/* Section breakdown (current benchmark) — shown for non-prompt cases */}
              {!showPromptError && (
                <div className="grid grid-cols-2 gap-3">
                  {liveValidation.detectedHeadings.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        {showOverridePanel ? `Not Detected for ${definition.benchmark_id}` : 'Detected Sections'}
                      </p>
                      <div className="space-y-0.5">
                        {liveValidation.detectedHeadings.slice(0, 5).map(h => (
                          <p key={h} className={`text-xs flex items-center gap-1.5 capitalize ${showOverridePanel ? 'text-amber-600' : 'text-emerald-700'}`}>
                            <CheckCircle2 className="w-3 h-3 flex-shrink-0" />{h}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  {liveValidation.missingHeadings.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Not Detected</p>
                      <div className="space-y-0.5">
                        {liveValidation.missingHeadings.slice(0, 5).map(h => (
                          <p key={h} className="text-xs text-slate-400 flex items-center gap-1.5 capitalize">
                            <X className="w-3 h-3 flex-shrink-0" />{h}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action buttons for override/error cases */}
            {(showPromptError || showOverridePanel) && (
              <div className={`px-4 py-3 border-t flex gap-2 ${
                showPromptError ? 'border-red-200' : 'border-amber-200'
              }`}>
                {showPromptError ? (
                  <button
                    onClick={() => { setResponse(''); setLiveValidation(null); }}
                    className="px-4 py-2 text-xs font-semibold text-red-700 border border-red-300 rounded-lg hover:bg-red-100 transition-colors"
                    aria-label="Clear the response field and try again"
                  >
                    Clear &amp; Try Again
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => { setLiveValidation(null); setResponse(''); }}
                      className="px-4 py-2 text-xs font-semibold text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors"
                      aria-label="Clear the response and review"
                    >
                      Review Response
                    </button>
                    <button
                      onClick={() => doCapture(response.trim(), model.trim(), provider.trim(), true)}
                      disabled={saving}
                      className="px-4 py-2 text-xs font-medium text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-50 disabled:opacity-50 transition-colors"
                      aria-label="Capture this response anyway, overriding the warning"
                    >
                      {saving ? 'Capturing...' : 'Capture Anyway'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Optional fields */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Model Used <span className="font-normal text-slate-400">(optional)</span></label>
            <input
              type="text" value={model} onChange={e => setModel(e.target.value)}
              placeholder="e.g. claude-3-7-sonnet-20250219"
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Provider <span className="font-normal text-slate-400">(optional)</span></label>
            <input
              type="text" value={provider} onChange={e => setProvider(e.target.value)}
              placeholder="e.g. Anthropic"
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Completed runs progress */}
        {completedRuns.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1.5">
            <p className="text-xs font-semibold text-emerald-600 mb-2">Completed</p>
            {completedRuns.map(r => (
              <div key={r.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="font-medium text-emerald-800">{r.benchmark_id_code}</span>
                  <span className="text-emerald-600">{r.benchmark_name}</span>
                </div>
                <span className="text-emerald-500">{r.response_length.toLocaleString()} chars</span>
              </div>
            ))}
          </div>
        )}

        {/* Immutability notice */}
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-amber-700">Once captured, this response is permanently locked as a governance artefact and cannot be edited.</p>
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* Main capture button — hidden when in mismatch or prompt state */}
        {showMainCapture && (
          <div className="flex justify-end">
            <button
              onClick={handleCapture}
              disabled={saving || !response.trim()}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors ${
                isLast
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-slate-900 text-white hover:bg-slate-700'
              }`}
              aria-label={isLast ? 'Capture response and complete session' : 'Capture response and continue to next benchmark'}
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : isLast ? <Zap className="w-4 h-4" aria-hidden="true" /> : <ArrowRight className="w-4 h-4" aria-hidden="true" />}
              {saving ? 'Capturing...' : isLast ? 'Capture & Complete Session' : 'Capture & Continue'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CompleteStep({
  session,
  runs,
  versions,
  onViewResponses,
  onClose,
}: {
  session: BenchmarkSession;
  runs: BenchmarkRun[];
  versions: WizardVersions | null;
  onViewResponses: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Success header */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-9 h-9 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Engineering Intelligence Benchmark Complete</h2>
          <p className="text-sm text-slate-500 mt-1">All {runs.length} benchmarks captured and locked as permanent governance artefacts.</p>
        </div>

        {/* Summary card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-900">{session.session_ref}</p>
            <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">Awaiting Independent Review</span>
          </div>
          <p className="text-sm text-slate-700">{session.session_name}</p>

          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Benchmarks Completed</span>
              <span className="font-semibold text-slate-800">{runs.length} of {BENCHMARK_ORDER.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Completion Time</span>
              <span className="font-medium text-slate-700">{new Date().toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
            {session.atd_version && (
              <div className="flex justify-between text-sm"><span className="text-slate-500">ATD Version</span><span className="font-mono text-slate-700">{session.atd_version}</span></div>
            )}
            {session.ecc_version && (
              <div className="flex justify-between text-sm"><span className="text-slate-500">ECC Version</span><span className="font-mono text-slate-700">{session.ecc_version}</span></div>
            )}
            {versions?.platformStateVersion && (
              <div className="flex justify-between text-sm"><span className="text-slate-500">Platform State</span><span className="font-mono text-slate-700">{versions.platformStateVersion}</span></div>
            )}
            {versions?.pisVersion && (
              <div className="flex justify-between text-sm"><span className="text-slate-500">PIS Version</span><span className="font-mono text-slate-700">v{versions.pisVersion}</span></div>
            )}
            {versions?.contextPackageRef && (
              <div className="flex justify-between text-sm"><span className="text-slate-500">Context Package</span><span className="font-mono text-slate-700">{versions.contextPackageRef}</span></div>
            )}
            {session.is_baseline && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Session Type</span>
                <span className="flex items-center gap-1 text-amber-700 font-medium"><Star className="w-3.5 h-3.5" />Baseline</span>
              </div>
            )}
          </div>

          {/* Individual run summary */}
          <div className="pt-3 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Captured Responses</p>
            <div className="space-y-2">
              {runs.map(r => (
                <div key={r.id} className="flex items-center justify-between bg-emerald-50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-xs font-mono text-slate-500">{r.benchmark_id_code}</span>
                    <span className="text-xs text-slate-700">{r.benchmark_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{r.response_length.toLocaleString()} chars</span>
                    <Lock className="w-3 h-3 text-slate-300" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={onViewResponses}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
          >
            <Eye className="w-4 h-4" />
            View Captured Responses
          </button>
          <button onClick={onClose} className="px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function GuidedBenchmarkWizard({
  definitions,
  sessionCount,
  resumeSession,
  resumeRuns,
  supersededSessionId,
  supersededSessionRef,
  onClose,
  onComplete,
}: {
  definitions: BenchmarkDefinition[];
  sessionCount: number;
  resumeSession?: BenchmarkSession;
  resumeRuns?: BenchmarkRun[];
  supersededSessionId?: string;
  supersededSessionRef?: string;
  onClose: () => void;
  onComplete: (session: BenchmarkSession, runs: BenchmarkRun[]) => void;
}) {
  const [phase, setPhase] = useState<WizardPhase>(resumeSession ? 'running' : 'setup');
  const [session, setSession] = useState<BenchmarkSession | null>(resumeSession ?? null);
  const [completedRuns, setCompletedRuns] = useState<BenchmarkRun[]>(resumeRuns ?? []);
  const [currentBenchmarkIdx, setCurrentBenchmarkIdx] = useState(resumeRuns ? resumeRuns.length : 0);
  const [capturedVersions, setCapturedVersions] = useState<WizardVersions | null>(
    resumeSession ? {
      platformStateId: resumeSession.platform_state_id,
      platformStateVersion: null,
      pisSnapshotId: resumeSession.pis_snapshot_id,
      pisVersion: null,
      contextPackageId: resumeSession.context_package_id,
      contextPackageRef: null,
    } : null
  );

  const orderedDefs = [...definitions]
    .filter(d => BENCHMARK_ORDER.includes(d.benchmark_id))
    .sort((a, b) => BENCHMARK_ORDER.indexOf(a.benchmark_id) - BENCHMARK_ORDER.indexOf(b.benchmark_id));

  const handleBegin = async (opts: {
    name: string; atdVersion: string; eccVersion: string;
    isBaseline: boolean; versions: WizardVersions;
  }) => {
    setCapturedVersions(opts.versions);
    const newSession = await createSession({
      session_name: opts.name,
      atd_version: opts.atdVersion || undefined,
      ecc_version: opts.eccVersion || undefined,
      is_baseline: opts.isBaseline,
      platform_state_id: opts.versions.platformStateId || undefined,
      pis_snapshot_id: opts.versions.pisSnapshotId || undefined,
      context_package_id: opts.versions.contextPackageId || undefined,
      supersedes_session_id: supersededSessionId || undefined,
    });
    setSession(newSession);
    setCurrentBenchmarkIdx(0);
    setPhase('running');
  };

  const handleCapture = async (response: string, modelUsed: string, providerUsed: string, events: ValidationEvent[]) => {
    if (!session) return;
    const currentDef = orderedDefs[currentBenchmarkIdx];
    const run = await addBenchmarkRun({
      session_id: session.id,
      benchmark_definition_id: currentDef.id,
      benchmark_prompt: currentDef.benchmark_prompt,
      ai_response: response,
      model_used: modelUsed || undefined,
      provider_used: providerUsed || undefined,
      platform_state_id: session.platform_state_id ?? undefined,
      pis_snapshot_id: session.pis_snapshot_id ?? undefined,
      context_package_id: session.context_package_id ?? undefined,
      validation_events: events.length > 0 ? events : undefined,
    });

    const withMeta: BenchmarkRun = {
      ...run,
      benchmark_name: currentDef.benchmark_name,
      benchmark_id_code: currentDef.benchmark_id,
    };
    const newCompleted = [...completedRuns, withMeta];
    setCompletedRuns(newCompleted);

    const isLast = currentBenchmarkIdx === orderedDefs.length - 1;
    if (isLast) {
      const summary = [
        `Engineering Intelligence Benchmark Session — ${session.session_ref}`,
        `Generated: ${new Date().toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'short' })}`,
        `Benchmarks Completed: ${newCompleted.length} of ${BENCHMARK_ORDER.length}`,
        capturedVersions?.platformStateVersion ? `Platform State: ${capturedVersions.platformStateVersion}` : null,
        capturedVersions?.pisVersion ? `PIS Version: v${capturedVersions.pisVersion}` : null,
        capturedVersions?.contextPackageRef ? `Context Package: ${capturedVersions.contextPackageRef}` : null,
        `Status: Awaiting Independent Review`,
        `Benchmarks: ${newCompleted.map(r => r.benchmark_id_code).join(', ')}`,
      ].filter(Boolean).join('\n');

      await completeSession(session.id, summary);
      setPhase('complete');
      onComplete(session, newCompleted);
    } else {
      // Show transition screen before advancing
      setPhase('transition');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col">
      {/* Wizard header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-slate-700" />
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-slate-900">Engineering Intelligence Benchmark</p>
              {resumeSession && phase === 'running' && (
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                  Resuming {resumeSession.session_ref}
                </span>
              )}
              {supersededSessionRef && phase !== 'complete' && (
                <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                  Replaces {supersededSessionRef}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {phase === 'setup' && 'Session configuration'}
              {phase === 'running' && `Benchmark ${currentBenchmarkIdx + 1} of ${orderedDefs.length}`}
              {phase === 'transition' && `Benchmark ${currentBenchmarkIdx + 1} complete`}
              {phase === 'complete' && 'Session complete'}
            </p>
          </div>
        </div>
        {phase === 'setup' && (
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {phase === 'setup' && (
        <SetupStep
          definitions={orderedDefs}
          sessionCount={sessionCount}
          onBegin={handleBegin}
          onCancel={onClose}
        />
      )}

      {phase === 'running' && session && (
        <RunningStep
          definition={orderedDefs[currentBenchmarkIdx]}
          currentIdx={currentBenchmarkIdx}
          totalCount={orderedDefs.length}
          completedRuns={completedRuns}
          session={session}
          allDefinitions={orderedDefs}
          onCapture={handleCapture}
        />
      )}

      {phase === 'transition' && session && orderedDefs[currentBenchmarkIdx + 1] && (
        <TransitionScreen
          completedBenchmark={orderedDefs[currentBenchmarkIdx]}
          nextBenchmark={orderedDefs[currentBenchmarkIdx + 1]}
          completedIdx={currentBenchmarkIdx}
          totalCount={orderedDefs.length}
          onContinue={() => {
            setCurrentBenchmarkIdx(i => i + 1);
            setPhase('running');
          }}
        />
      )}

      {phase === 'complete' && session && (
        <CompleteStep
          session={session}
          runs={completedRuns}
          versions={capturedVersions}
          onViewResponses={() => onClose()}
          onClose={onClose}
        />
      )}
    </div>
  );
}

// ─── Run Detail Modal ─────────────────────────────────────────────────────────

function RunDetailModal({ run, onClose, onStatusUpdate }: {
  run: BenchmarkRun;
  onClose: () => void;
  onStatusUpdate: (runId: string, status: RunReviewStatus) => Promise<void>;
}) {
  const [updating, setUpdating] = useState(false);
  const rs = RUN_STATUS_CONFIG[run.review_status as RunReviewStatus] ?? RUN_STATUS_CONFIG.awaiting_review;
  const next = nextRunReviewStatus(run.review_status as RunReviewStatus);

  const handleAdvance = async () => {
    if (!next) return;
    setUpdating(true);
    try { await onStatusUpdate(run.id, next); } finally { setUpdating(false); }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{run.run_ref}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded border ${rs.color} ${rs.bg} ${rs.border}`}>{rs.label}</span>
                {run.is_locked && <span className="flex items-center gap-1 text-xs text-slate-400"><Lock className="w-3 h-3" />Immutable</span>}
              </div>
              <p className="text-sm font-bold text-slate-900">{run.benchmark_id_code} — {run.benchmark_name}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {new Date(run.execution_timestamp).toLocaleString('en-AU', { dateStyle: 'long', timeStyle: 'short' })}
                {run.model_used && ` · ${run.model_used}`}
                {run.provider_used && ` (${run.provider_used})`}
                {` · ${run.response_length.toLocaleString()} chars`}
              </p>
            </div>
            {next && (
              <button
                onClick={handleAdvance} disabled={updating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex-shrink-0"
              >
                <ArrowRight className="w-3 h-3" />{RUN_STATUS_CONFIG[next].label}
              </button>
            )}
          </div>
          {run.session_ref && <p className="text-xs text-slate-400 mt-1">Session: {run.session_ref}</p>}
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {run.execution_notes && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-500 mb-1">Execution Notes</p>
              <p className="text-xs text-slate-700">{run.execution_notes}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">AI Technical Director Response</p>
            <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto">
              <pre className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed font-mono">{run.ai_response}</pre>
            </div>
          </div>
          {run.reviewer_notes && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-600 mb-1">Reviewer Notes</p>
              <p className="text-xs text-blue-800">{run.reviewer_notes}</p>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Supersede Modal ──────────────────────────────────────────────────────────

function SupersedeModal({
  session,
  allSessions,
  onConfirm,
  onClose,
}: {
  session: BenchmarkSession;
  allSessions: BenchmarkSession[];
  onConfirm: (input: SupersedeSessionInput) => Promise<void>;
  onClose: () => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!reason.trim()) { setError('Reason is required.'); return; }
    if (!date) { setError('Date is required.'); return; }
    setSaving(true);
    try {
      await onConfirm({ reason: reason.trim(), date, notes: notes.trim() || undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to supersede session');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Ban className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Supersede Benchmark Session</p>
              <p className="text-xs text-slate-400">{session.session_ref} — {session.session_name}</p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            Superseding a session marks it as invalid and read-only. The session and all captured responses are preserved for historical traceability. A replacement session can be started separately.
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Reason <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Incorrect benchmark response captured during pilot testing."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Additional context about why this session is being superseded..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="px-6 py-4 border-t border-slate-200 flex justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
            Confirm Supersession
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab Content ──────────────────────────────────────────────────────────────

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function eisTier(score: number): string {
  if (score >= 80) return 'Exceptional';
  if (score >= 65) return 'Strong';
  if (score >= 50) return 'Adequate';
  if (score >= 35) return 'Developing';
  return 'Insufficient';
}

function eisColor(score: number) {
  if (score >= 80) return { text: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-300', bar: 'bg-emerald-500' };
  if (score >= 65) return { text: 'text-blue-700',    bg: 'bg-blue-50',    ring: 'ring-blue-300',    bar: 'bg-blue-500'    };
  if (score >= 50) return { text: 'text-amber-700',   bg: 'bg-amber-50',   ring: 'ring-amber-300',   bar: 'bg-amber-500'   };
  if (score >= 35) return { text: 'text-orange-700',  bg: 'bg-orange-50',  ring: 'ring-orange-300',  bar: 'bg-orange-500'  };
  return           { text: 'text-red-700',    bg: 'bg-red-50',    ring: 'ring-red-300',    bar: 'bg-red-500'     };
}

function capabilityColor(v: number) {
  if (v >= 8) return 'bg-emerald-500';
  if (v >= 6) return 'bg-blue-500';
  if (v >= 4) return 'bg-amber-500';
  return 'bg-red-400';
}

function OverviewTab({
  sessions,
  runs,
  definitions,
  latestReview,
  onOpenSession,
  onStartBenchmark,
}: {
  sessions: BenchmarkSession[];
  runs: BenchmarkRun[];
  definitions: BenchmarkDefinition[];
  latestReview: { session: BenchmarkSession; review: BenchmarkReview } | null;
  onOpenSession: (s: BenchmarkSession) => void;
  onStartBenchmark: () => void;
}) {
  const accepted = sessions.filter(s =>
    s.overall_review_status === 'accepted' || s.overall_review_status === 'accepted_with_observations'
  );
  const pendingReview = sessions.filter(s =>
    s.session_outcome !== 'superseded' &&
    ['awaiting_review', 'under_review', 'reviewed', 'review_complete', 'awaiting_po_acceptance'].includes(s.overall_review_status)
  );
  const superseded = sessions.filter(s => s.session_outcome === 'superseded');

  // EIS trend — accepted sessions with eis_score on the session OR on a linked review.
  // eis_score is written to the review record; fall back to the review's score for the
  // matching session when the session column is still null.
  const reviewEisById: Record<string, number> = {};
  if (latestReview?.session?.id && latestReview.review?.eis_score != null) {
    reviewEisById[latestReview.session.id] = Number(latestReview.review.eis_score);
  }
  const eisHistory = sessions
    .filter(s =>
      (s.overall_review_status === 'accepted' || s.overall_review_status === 'accepted_with_observations') &&
      (s.eis_score != null || reviewEisById[s.id] != null)
    )
    .map(s => ({ ...s, eis_score: s.eis_score ?? reviewEisById[s.id] }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const latestEIS = latestReview?.review?.eis_score != null
    ? Number(latestReview.review.eis_score)
    : eisHistory[0]?.eis_score ?? null;
  const previousEIS = eisHistory[1]?.eis_score ?? null;
  const eisDelta = latestEIS != null && previousEIS != null ? latestEIS - previousEIS : null;

  const latestSession = latestReview?.session ?? eisHistory[0] ?? accepted[0] ?? sessions[0] ?? null;
  const latestEISColors = latestEIS != null ? eisColor(latestEIS) : null;

  // Capability scores from latest review
  const capScores: CapabilityScores | null = latestReview?.review?.capability_scores
    ? (typeof latestReview.review.capability_scores === 'string'
        ? JSON.parse(latestReview.review.capability_scores)
        : latestReview.review.capability_scores)
    : null;

  // Benchmark health: derive from acceptance rate + pending review load
  const totalComplete = sessions.filter(s => s.session_outcome !== 'in_progress' && s.benchmarks_count >= 3).length;
  const acceptanceRate = totalComplete > 0 ? Math.round((accepted.length / totalComplete) * 100) : null;

  // Session timeline — last 6 accepted/reviewed sessions
  const timeline = [...sessions]
    .filter(s => s.session_outcome !== 'in_progress' || s.benchmarks_count >= 3)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  const hasData = sessions.length > 0;

  if (!hasData) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-64">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Activity className="w-8 h-8 text-slate-300" />
        </div>
        <p className="text-base font-semibold text-slate-700">No benchmark sessions yet</p>
        <p className="text-sm text-slate-400 mt-1 text-center max-w-sm">Start your first benchmark session to begin measuring the AI Technical Director's engineering intelligence.</p>
        <button
          onClick={onStartBenchmark}
          className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
        >
          <Play className="w-4 h-4" />Start First Benchmark
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">

      {/* Top KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* EIS Card */}
        <div className={`col-span-2 sm:col-span-1 rounded-2xl p-5 ${latestEISColors ? `${latestEISColors.bg} ring-1 ${latestEISColors.ring}` : 'bg-slate-50 ring-1 ring-slate-200'}`}>
          <div className="flex items-center gap-2 mb-1">
            <Zap className={`w-4 h-4 ${latestEISColors?.text ?? 'text-slate-400'}`} />
            <p className={`text-xs font-semibold uppercase tracking-wider ${latestEISColors?.text ?? 'text-slate-500'}`}>EIS</p>
          </div>
          {latestEIS != null ? (
            <>
              <p className={`text-3xl font-black leading-none ${latestEISColors!.text}`}>{latestEIS.toFixed(1)}</p>
              <p className={`text-xs mt-1 font-semibold ${latestEISColors!.text} opacity-70`}>{eisTier(latestEIS)}</p>
              {eisDelta != null && (
                <div className={`flex items-center gap-1 mt-2 text-xs font-bold ${eisDelta >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {eisDelta > 0 ? <TrendingUp className="w-3 h-3" /> : eisDelta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                  {eisDelta >= 0 ? '+' : ''}{eisDelta.toFixed(1)} vs previous
                </div>
              )}
            </>
          ) : (
            <p className="text-2xl font-black text-slate-400">—</p>
          )}
          {latestSession && (
            <p className="text-xs text-slate-400 mt-2 truncate">{latestSession.session_ref}</p>
          )}
        </div>

        {/* Sessions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Sessions</p>
          <p className="text-3xl font-black text-slate-800">{sessions.length}</p>
          <div className="mt-2 space-y-0.5 text-xs text-slate-500">
            <div className="flex justify-between"><span>Accepted</span><span className="font-semibold text-emerald-700">{accepted.length}</span></div>
            <div className="flex justify-between"><span>Pending Review</span><span className="font-semibold text-amber-700">{pendingReview.length}</span></div>
            <div className="flex justify-between"><span>Superseded</span><span className="font-semibold text-slate-500">{superseded.length}</span></div>
          </div>
        </div>

        {/* Acceptance Rate */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Acceptance Rate</p>
          {acceptanceRate != null ? (
            <>
              <p className={`text-3xl font-black ${acceptanceRate >= 80 ? 'text-emerald-700' : acceptanceRate >= 60 ? 'text-blue-700' : acceptanceRate >= 40 ? 'text-amber-700' : 'text-red-700'}`}>
                {acceptanceRate}%
              </p>
              <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${acceptanceRate >= 80 ? 'bg-emerald-500' : acceptanceRate >= 60 ? 'bg-blue-500' : acceptanceRate >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${acceptanceRate}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">{accepted.length} of {totalComplete} completed</p>
            </>
          ) : (
            <p className="text-2xl font-black text-slate-400">—</p>
          )}
        </div>

        {/* Benchmark Library */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Benchmark Library</p>
          <p className="text-3xl font-black text-slate-800">{definitions.length}</p>
          <p className="text-xs text-slate-400 mt-2">{runs.length} runs captured</p>
          <p className="text-xs text-slate-400">{definitions.filter(d => d.is_active).length} active benchmarks</p>
        </div>
      </div>

      {/* Capability Maturity */}
      {capScores ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-bold text-slate-900">Capability Maturity</p>
              <p className="text-xs text-slate-400 mt-0.5">
                From {latestReview!.review.review_title ?? latestReview!.session.session_ref}
                {latestReview!.review.reviewer && ` · ${latestReview!.review.reviewer}`}
              </p>
            </div>
            {latestEIS != null && (
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl ring-1 ${latestEISColors!.bg} ${latestEISColors!.ring} flex-shrink-0`}>
                <Zap className={`w-3.5 h-3.5 ${latestEISColors!.text}`} />
                <span className={`text-base font-black ${latestEISColors!.text}`}>{latestEIS.toFixed(1)}</span>
                <span className={`text-xs ${latestEISColors!.text} opacity-60 hidden sm:inline`}>/ 100</span>
                <span className={`text-xs font-semibold ${latestEISColors!.text} border-l border-current/20 pl-1.5`}>{eisTier(latestEIS)}</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CAPABILITY_DIMENSIONS.map(dim => {
              const v = capScores[dim.key];
              return (
                <div key={dim.key} className="grid grid-cols-[1fr_auto] gap-3 items-center py-1">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{dim.label}</p>
                    <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${capabilityColor(v)}`} style={{ width: `${(v / 10) * 100}%` }} />
                    </div>
                  </div>
                  <span className={`text-sm font-black w-10 text-center rounded-lg py-0.5 ${
                    v >= 8 ? 'text-emerald-700 bg-emerald-50' :
                    v >= 6 ? 'text-blue-700 bg-blue-50' :
                    v >= 4 ? 'text-amber-700 bg-amber-50' :
                    'text-red-700 bg-red-50'
                  }`}>{v % 1 === 0 ? v.toFixed(1) : v}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-6 text-center">
          <Award className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-600">Capability Maturity unavailable</p>
          <p className="text-xs text-slate-400 mt-1">Complete a benchmark review with capability scores to see the maturity matrix.</p>
        </div>
      )}

      {/* EIS Evolution Timeline */}
      {eisHistory.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-900">EIS Evolution</p>
            <p className="text-xs text-slate-400">{eisHistory.length} scored session{eisHistory.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="space-y-2">
            {eisHistory.slice(0, 6).map((s, i) => {
              const eis = s.eis_score!;
              const colors = eisColor(eis);
              const prev = eisHistory[i + 1]?.eis_score;
              const delta = prev != null ? eis - prev : null;
              return (
                <button
                  key={s.id}
                  onClick={() => onOpenSession(s)}
                  className="w-full flex items-center gap-2 sm:gap-3 py-2 px-2 sm:px-3 rounded-xl hover:bg-slate-50 transition-colors text-left group"
                >
                  <span className="text-xs font-mono text-slate-400 w-16 sm:w-20 shrink-0 truncate">{s.session_ref}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${colors.bar}`} style={{ width: `${eis}%` }} />
                  </div>
                  <span className={`text-sm font-black w-9 sm:w-10 text-right ${colors.text}`}>{eis.toFixed(1)}</span>
                  {delta != null && (
                    <span className={`text-xs font-semibold w-10 sm:w-12 text-right hidden xs:block ${delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                      {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                    </span>
                  )}
                  {i === 0 && (
                    <span className="text-xs bg-slate-900 text-white px-1.5 py-0.5 rounded font-semibold hidden sm:inline">Latest</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Session Timeline */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-900">Session History</p>
          <p className="text-xs text-slate-400">{sessions.length} total</p>
        </div>
        <div className="space-y-2">
          {timeline.map(s => {
            const isSuperseded = s.session_outcome === 'superseded';
            const isAccepted = s.overall_review_status === 'accepted' || s.overall_review_status === 'accepted_with_observations';
            const isPending = !isSuperseded && ['awaiting_review', 'under_review', 'reviewed', 'review_complete', 'awaiting_po_acceptance'].includes(s.overall_review_status);
            return (
              <button
                key={s.id}
                onClick={() => onOpenSession(s)}
                className="w-full flex items-center gap-2 sm:gap-3 py-2 px-2 sm:px-3 rounded-xl hover:bg-slate-50 transition-colors text-left"
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isAccepted ? 'bg-emerald-500' : isPending ? 'bg-amber-500' : isSuperseded ? 'bg-amber-300' : 'bg-slate-300'}`} />
                <span className="text-xs font-mono text-slate-400 w-16 sm:w-20 shrink-0 truncate">{s.session_ref}</span>
                <span className={`flex-1 text-xs sm:text-sm truncate ${isSuperseded ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{s.session_name}</span>
                {s.eis_score != null && (
                  <span className={`text-xs font-bold flex items-center gap-0.5 flex-shrink-0 ${eisColor(s.eis_score).text}`}>
                    <Zap className="w-2.5 h-2.5" />{s.eis_score.toFixed(1)}
                  </span>
                )}
                <span className="text-xs text-slate-400 shrink-0 hidden sm:inline">{new Date(s.created_at).toLocaleDateString('en-AU', { dateStyle: 'short' })}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LibraryTab({ definitions }: { definitions: BenchmarkDefinition[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? definitions.filter(d =>
        d.benchmark_id.toLowerCase().includes(search.toLowerCase()) ||
        d.benchmark_name.toLowerCase().includes(search.toLowerCase()) ||
        d.purpose?.toLowerCase().includes(search.toLowerCase()) ||
        d.category?.toLowerCase().includes(search.toLowerCase())
      )
    : definitions;

  return (
    <div className="p-4 sm:p-6 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800">Benchmark Library</p>
          <p className="text-xs text-slate-400 mt-0.5">{definitions.length} registered benchmark{definitions.length !== 1 ? 's' : ''}. Prompts are permanent and reusable across all sessions.</p>
        </div>
        <div className="relative sm:flex-shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search benchmarks..."
            className="w-full sm:w-52 pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      {filtered.map(d => {
        const cat = CATEGORY_CONFIG[d.category] ?? CATEGORY_CONFIG.general;
        const isOpen = expanded === d.id;
        return (
          <div key={d.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : d.id)}
              className="w-full text-left p-4 flex items-start justify-between hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold text-slate-500">{d.benchmark_id}</span>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${cat.color} ${cat.bg}`}>{cat.label}</span>
                    <span className="text-xs text-slate-400 hidden sm:inline">v{d.version}</span>
                    {d.is_active && <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">Active</span>}
                  </div>
                  <p className="text-sm font-semibold text-slate-800 mt-0.5">{d.benchmark_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{d.purpose}</p>
                </div>
              </div>
              {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />}
            </button>
            {isOpen && (
              <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Benchmark Prompt</p>
                    <CopyButton text={d.benchmark_prompt} />
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-64 overflow-y-auto">
                    <pre className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-sans">{d.benchmark_prompt}</pre>
                  </div>
                </div>
                {d.evaluation_criteria.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Evaluation Criteria</p>
                    <div className="space-y-2">
                      {d.evaluation_criteria.map((c, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                          <div>
                            <p className="text-xs font-semibold text-slate-700">{c.criterion}</p>
                            <p className="text-xs text-slate-500">{c.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {filtered.length === 0 && search && (
        <div className="text-center py-8 text-slate-400 text-sm">No benchmarks match "{search}".</div>
      )}
    </div>
  );
}

function SessionsTab({
  sessions,
  onSelect,
}: {
  sessions: BenchmarkSession[];
  onSelect: (session: BenchmarkSession) => void;
}) {
  const [search, setSearch] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const sessionMap = Object.fromEntries(sessions.map(s => [s.id, s]));

  const filtered = sessions.filter(s => {
    if (filterOutcome && s.session_outcome !== filterOutcome) return false;
    if (filterStatus && s.overall_review_status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        s.session_ref.toLowerCase().includes(q) ||
        s.session_name.toLowerCase().includes(q) ||
        s.atd_version?.toLowerCase().includes(q) ||
        s.ecc_version?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterOutcome}
            onChange={e => setFilterOutcome(e.target.value)}
            className="flex-1 sm:flex-none px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Outcomes</option>
            {Object.entries(SESSION_OUTCOME_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="flex-1 sm:flex-none px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Status</option>
            {Object.entries(SESSION_STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <p className="text-xs text-slate-400 whitespace-nowrap">{filtered.length}/{sessions.length}</p>
        </div>
      </div>
      <div className="space-y-3">
        {filtered.map(s => {
          const rs = SESSION_STATUS_CONFIG[s.overall_review_status] ?? SESSION_STATUS_CONFIG.awaiting_review;
          const oc = SESSION_OUTCOME_CONFIG[s.session_outcome] ?? SESSION_OUTCOME_CONFIG.in_progress;
          const OutcomeIcon = oc.icon;
          const isComplete = s.benchmarks_count >= BENCHMARK_ORDER.length;
          const isSuperseded = s.session_outcome === 'superseded';
          const supersededBy = s.superseded_by_session_id ? sessionMap[s.superseded_by_session_id] : null;
          const supersedes = s.supersedes_session_id ? sessionMap[s.supersedes_session_id] : null;

          return (
            <button
              key={s.id}
              onClick={() => onSelect(s)}
              className={`w-full text-left bg-white border rounded-xl p-4 transition-all hover:shadow-sm hover:border-slate-300 ${
                isSuperseded ? 'border-amber-200 bg-amber-50/20 opacity-80' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-mono font-bold text-slate-500">{s.session_ref}</span>
                    {s.is_baseline && (
                      <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                        <Star className="w-2.5 h-2.5" />Baseline
                      </span>
                    )}
                    {s.benchmark_milestone && (
                      <span className="flex items-center gap-1 text-xs bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded font-medium capitalize">
                        <Target className="w-2.5 h-2.5" />{s.benchmark_milestone.replace(/_/g, ' ')}
                      </span>
                    )}
                    <span className={`flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded border ${oc.color} ${oc.bg} ${oc.border}`}>
                      <OutcomeIcon className="w-2.5 h-2.5" />{oc.label}
                    </span>
                    {isComplete && !isSuperseded && (
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${rs.color} ${rs.bg} ${rs.border}`}>{rs.label}</span>
                    )}
                    {!isComplete && s.benchmarks_count > 0 && (
                      <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-medium">
                        {s.benchmarks_count}/{BENCHMARK_ORDER.length} captured
                      </span>
                    )}
                    {s.eis_score != null && (
                      <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                        s.eis_score >= 80 ? 'bg-emerald-50 text-emerald-700' :
                        s.eis_score >= 60 ? 'bg-blue-50 text-blue-700' :
                        s.eis_score >= 40 ? 'bg-amber-50 text-amber-700' :
                        'bg-red-50 text-red-700'
                      }`}>
                        <Zap className="w-2.5 h-2.5" />EIS {s.eis_score.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm font-semibold ${isSuperseded ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{s.session_name}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 flex-wrap">
                    <span>{new Date(s.created_at).toLocaleDateString('en-AU', { dateStyle: 'short' })}</span>
                    <span>{s.benchmarks_count} run{s.benchmarks_count !== 1 ? 's' : ''}</span>
                    {s.atd_version && <span className="hidden sm:inline">ATD: {s.atd_version}</span>}
                    {s.ecc_version && <span className="hidden sm:inline">ECC: {s.ecc_version}</span>}
                  </div>
                  {isSuperseded && s.supersession_reason && (
                    <p className="text-xs text-amber-700 mt-1.5 truncate">{s.supersession_reason}</p>
                  )}
                  {supersededBy && (
                    <p className="text-xs text-amber-600 mt-0.5">Superseded by: <span className="font-mono font-bold">{supersededBy.session_ref}</span></p>
                  )}
                  {supersedes && (
                    <p className="text-xs text-blue-600 mt-0.5">Replaces: <span className="font-mono font-bold">{supersedes.session_ref}</span></p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-1" />
              </div>
            </button>
          );
        })}
        {sessions.length === 0 && (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-10 text-center">
            <Layers className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No benchmark sessions yet.</p>
            <p className="text-xs text-slate-400 mt-1">Use "Start Benchmark" in the header to begin your first session.</p>
          </div>
        )}
        {sessions.length > 0 && filtered.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">No sessions match the current filters.</div>
        )}
      </div>
    </div>
  );
}

function RunsTab({ runs, sessions, onStatusUpdate }: {
  runs: BenchmarkRun[];
  sessions: BenchmarkSession[];
  onStatusUpdate: (runId: string, status: RunReviewStatus) => Promise<void>;
}) {
  const [viewingRun, setViewingRun] = useState<BenchmarkRun | null>(null);
  const [filterStatus, setFilterStatus] = useState('');

  const sessionMap = Object.fromEntries(sessions.map(s => [s.id, s]));

  // Filter against the effective status (session governance takes precedence over run status)
  const filtered = filterStatus
    ? runs.filter(r => getRunEffectiveStatus(r, sessionMap) === filterStatus)
    : runs;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">All Benchmark Runs</p>
          <p className="text-xs text-slate-400 mt-0.5">{filtered.length} run{filtered.length !== 1 ? 's' : ''} — immutable governance artefacts.</p>
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full sm:w-auto"
        >
          <option value="">All Status</option>
          {RUN_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        {filtered.map(run => {
          const parentSession = run.session_id ? sessionMap[run.session_id] : null;
          const sessionOutcome = parentSession?.session_outcome;
          const sessionStatus = parentSession?.overall_review_status;

          // Derive effective governance status from session state
          const effectivelyComplete =
            sessionOutcome === 'superseded' ||
            sessionStatus === 'accepted' ||
            sessionStatus === 'accepted_with_observations' ||
            sessionStatus === 'returned_for_improvement';

          // Session-level governance badge
          let sessionBadge: { label: string; color: string; bg: string; border: string } | null = null;
          if (sessionOutcome === 'superseded') {
            sessionBadge = SESSION_OUTCOME_CONFIG.superseded;
          } else if (sessionStatus === 'accepted') {
            sessionBadge = SESSION_STATUS_CONFIG.accepted;
          } else if (sessionStatus === 'accepted_with_observations') {
            sessionBadge = SESSION_STATUS_CONFIG.accepted_with_observations;
          } else if (sessionStatus === 'returned_for_improvement') {
            sessionBadge = SESSION_STATUS_CONFIG.returned_for_improvement;
          }

          const rs = RUN_STATUS_CONFIG[run.review_status as RunReviewStatus] ?? RUN_STATUS_CONFIG.awaiting_review;
          const StatusIcon = rs.icon;
          return (
            <div
              key={run.id}
              onClick={() => setViewingRun(run)}
              className={`bg-white border rounded-xl p-4 hover:border-slate-300 hover:shadow-sm cursor-pointer transition-all ${
                sessionOutcome === 'superseded' ? 'border-amber-200 bg-amber-50/10 opacity-80' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-slate-400">{run.run_ref}</span>
                      <span className="text-xs font-bold text-slate-600">{run.benchmark_id_code}</span>
                      <span className="text-sm font-medium text-slate-800 truncate">{run.benchmark_name}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 flex-wrap">
                      <span>{new Date(run.execution_timestamp).toLocaleDateString('en-AU')}</span>
                      {run.session_ref && <span>{run.session_ref}</span>}
                      {run.model_used && <span className="hidden sm:inline">{run.model_used}</span>}
                      <span className="hidden sm:inline">{run.response_length.toLocaleString()} chars</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                  <Lock className="w-3 h-3 text-slate-300" />
                  {/* Session-level governance status takes precedence when governance is complete */}
                  {sessionBadge ? (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${sessionBadge.color} ${sessionBadge.bg} ${sessionBadge.border}`}>
                      {sessionBadge.label}
                    </span>
                  ) : !effectivelyComplete ? (
                    <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${rs.color} ${rs.bg} ${rs.border}`}>
                      <StatusIcon className="w-3 h-3" />{rs.label}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            {filterStatus ? 'No runs match this status.' : 'No benchmark runs captured yet.'}
          </div>
        )}
      </div>
      {viewingRun && (
        <RunDetailModal
          run={viewingRun}
          onClose={() => setViewingRun(null)}
          onStatusUpdate={async (id, status) => {
            await onStatusUpdate(id, status);
            setViewingRun(prev => prev && prev.id === id ? { ...prev, review_status: status } : prev);
          }}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ECCBenchmarkingPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [definitions, setDefinitions] = useState<BenchmarkDefinition[]>([]);
  const [sessions, setSessions] = useState<BenchmarkSession[]>([]);
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [latestReview, setLatestReview] = useState<{ session: BenchmarkSession; review: BenchmarkReview } | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [reviewingSession, setReviewingSession] = useState<BenchmarkSession | null>(null);
  const [incompleteSession, setIncompleteSession] = useState<BenchmarkSession | null>(null);
  const [incompleteRuns, setIncompleteRuns] = useState<BenchmarkRun[]>([]);
  const [resumeSession, setResumeSession] = useState<BenchmarkSession | null>(null);
  const [resumeRuns, setResumeRuns] = useState<BenchmarkRun[]>([]);
  const [supersedingSession, setSupersedingSession] = useState<BenchmarkSession | null>(null);
  const [replacingSession, setReplacingSession] = useState<BenchmarkSession | null>(null);
  const [selectedSession, setSelectedSession] = useState<BenchmarkSession | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [defs, sess, allRuns, incomplete, latestReviewData] = await Promise.all([
        loadBenchmarkDefinitions(),
        loadBenchmarkSessions(),
        loadBenchmarkRuns(),
        loadIncompleteSession(),
        loadLatestAcceptedReview(),
      ]);
      setDefinitions(defs);
      setSessions(sess);
      setRuns(allRuns);
      setLatestReview(latestReviewData);

      if (incomplete) {
        const sessionRuns = allRuns.filter(r => r.session_id === incomplete.id);
        // Sort by benchmark order so resume starts at the right position
        const orderedRuns = [...sessionRuns].sort((a, b) =>
          BENCHMARK_ORDER.indexOf(a.benchmark_id_code ?? '') - BENCHMARK_ORDER.indexOf(b.benchmark_id_code ?? '')
        );
        setIncompleteSession(incomplete);
        setIncompleteRuns(orderedRuns);
      } else {
        setIncompleteSession(null);
        setIncompleteRuns([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStatusUpdate = useCallback(async (runId: string, status: RunReviewStatus) => {
    await updateRunReviewStatus(runId, status);
    setRuns(prev => prev.map(r => r.id === runId ? { ...r, review_status: status } : r));
  }, []);

  const handleWizardComplete = useCallback((session: BenchmarkSession, newRuns: BenchmarkRun[]) => {
    setSessions(prev => [session, ...prev]);
    setRuns(prev => [...newRuns.map(r => ({ ...r })), ...prev]);
    load();
  }, [load]);

  const handleSessionUpdated = useCallback((updated: BenchmarkSession) => {
    // Optimistically update in-place for instant UI feedback
    setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
    if (reviewingSession?.id === updated.id) {
      setReviewingSession(updated);
    }
    if (selectedSession?.id === updated.id) {
      setSelectedSession(updated);
    }
    // If the session reached a terminal governance state, do a full reload
    // to ensure counters, baseline indicator, and resume banner all synchronise.
    const isTerminal =
      updated.session_outcome === 'superseded' ||
      updated.overall_review_status === 'accepted' ||
      updated.overall_review_status === 'accepted_with_observations' ||
      updated.overall_review_status === 'returned_for_improvement';
    if (isTerminal) {
      load();
    }
  }, [reviewingSession, selectedSession, load]);

  const handleResume = useCallback((session?: BenchmarkSession | null, sessionRuns?: BenchmarkRun[]) => {
    const target = session ?? incompleteSession;
    const targetRuns = sessionRuns ?? incompleteRuns;
    setSelectedSession(null);
    setResumeSession(target);
    setResumeRuns(targetRuns);
    setShowWizard(true);
  }, [incompleteSession, incompleteRuns]);

  const handleWizardClose = useCallback(() => {
    setShowWizard(false);
    setResumeSession(null);
    setResumeRuns([]);
    setReplacingSession(null);
    load();
  }, [load]);

  const handleSupersede = useCallback(async (input: SupersedeSessionInput) => {
    if (!supersedingSession) return;
    await supersedeBenchmarkSession(supersedingSession.id, input);
    setSupersedingSession(null);
    setSelectedSession(null);
    await load();
  }, [supersedingSession, load]);

  const handleStartReplacement = useCallback((superseded: BenchmarkSession) => {
    setSelectedSession(null);
    setReplacingSession(superseded);
    setResumeSession(null);
    setResumeRuns([]);
    setShowWizard(true);
    setTab('sessions');
  }, []);

  const totalRuns = runs.length;
  const accepted = sessions.filter(s =>
    s.overall_review_status === 'accepted' || s.overall_review_status === 'accepted_with_observations'
  ).length;
  // Pending Review: only sessions actively awaiting Engineering Review or PO Decision,
  // excluding superseded, returned, or completed sessions.
  const pendingReview = sessions.filter(s =>
    s.session_outcome !== 'superseded' &&
    s.session_outcome !== 'cancelled' &&
    (s.overall_review_status === 'awaiting_review' ||
     s.overall_review_status === 'under_review' ||
     s.overall_review_status === 'reviewed' ||
     s.overall_review_status === 'review_complete' ||
     s.overall_review_status === 'awaiting_po_acceptance')
  ).length;
  // Baseline: latest accepted session that has NOT been superseded
  const baselineSession =
    sessions.find(s => s.is_baseline && s.session_outcome !== 'superseded') ??
    sessions.find(s =>
      (s.overall_review_status === 'accepted' || s.overall_review_status === 'accepted_with_observations') &&
      s.session_outcome !== 'superseded'
    ) ?? null;

  const TABS: { key: Tab; label: string; icon: typeof BookOpen; count?: number }[] = [
    { key: 'overview', label: 'Overview',           icon: Activity                            },
    { key: 'library',  label: 'Benchmark Library', icon: BookOpen,  count: definitions.length },
    { key: 'sessions', label: 'Sessions',           icon: Layers,    count: sessions.length    },
    { key: 'runs',     label: 'Run History',        icon: BarChart3, count: totalRuns          },
  ];

  return (
    <>
      {showWizard && (
        <GuidedBenchmarkWizard
          definitions={definitions}
          sessionCount={sessions.length}
          resumeSession={resumeSession ?? undefined}
          resumeRuns={resumeRuns.length > 0 ? resumeRuns : undefined}
          supersededSessionId={replacingSession?.id}
          supersededSessionRef={replacingSession?.session_ref}
          onClose={handleWizardClose}
          onComplete={handleWizardComplete}
        />
      )}

      {supersedingSession && (
        <SupersedeModal
          session={supersedingSession}
          allSessions={sessions}
          onConfirm={handleSupersede}
          onClose={() => setSupersedingSession(null)}
        />
      )}

      {selectedSession && !showWizard && !reviewingSession && (
        <ECCSessionOverviewPanel
          session={selectedSession}
          runs={runs.filter(r => r.session_id === selectedSession.id)}
          allSessions={sessions}
          onClose={() => setSelectedSession(null)}
          onResume={() => {
            const sessionRuns = runs.filter(r => r.session_id === selectedSession.id)
              .sort((a, b) => BENCHMARK_ORDER.indexOf(a.benchmark_id_code ?? '') - BENCHMARK_ORDER.indexOf(b.benchmark_id_code ?? ''));
            handleResume(selectedSession, sessionRuns);
          }}
          onSupersede={() => { setSupersedingSession(selectedSession); }}
          onStartReplacement={() => handleStartReplacement(selectedSession)}
          onOpenGovernanceReview={() => {
            setReviewingSession(selectedSession);
            setSelectedSession(null);
          }}
        />
      )}

      {reviewingSession && (
        <ECCBenchmarkReviewPanel
          session={reviewingSession}
          onClose={() => setReviewingSession(null)}
          onSessionUpdated={handleSessionUpdated}
        />
      )}

      <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700 flex-shrink-0" />
                <h1 className="text-sm sm:text-base lg:text-lg font-bold text-slate-900 leading-tight">AI Technical Director Benchmarking</h1>
                <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-full font-medium hidden xs:inline">ATD-BC v1.1</span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">Permanent immutable evidence repository measuring AI Technical Director evolution over time.</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!loading && (
                <>
                  {sessions.length > 0 && (
                    <div className="hidden md:flex items-center gap-4 text-right">
                      <div><p className="text-xs text-slate-400">Sessions</p><p className="text-lg font-bold text-slate-800">{sessions.length}</p></div>
                      {accepted > 0 && <div><p className="text-xs text-slate-400">Accepted</p><p className="text-lg font-bold text-emerald-700">{accepted}</p></div>}
                      {pendingReview > 0 && <div><p className="text-xs text-slate-400">Pending</p><p className="text-lg font-bold text-amber-700">{pendingReview}</p></div>}
                      {baselineSession && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                          <p className="text-xs text-amber-600 font-medium flex items-center gap-1"><Star className="w-3 h-3" />Baseline</p>
                          <p className="text-xs font-bold text-amber-800">{baselineSession.session_ref}</p>
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => setShowWizard(true)}
                    className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-slate-900 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-slate-700 transition-colors shadow-sm whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Start Benchmark</span>
                    <span className="sm:hidden">Start</span>
                  </button>
                </>
              )}
              <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Tabs — scrollable on mobile */}
          <div className="flex gap-0.5 mt-3 -mb-3 sm:-mb-4 overflow-x-auto scrollbar-none">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-medium rounded-t-lg border-b-2 whitespace-nowrap transition-colors flex-shrink-0 ${
                    tab === t.key
                      ? 'text-slate-900 border-slate-900 bg-slate-50/50'
                      : 'text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  {t.label}
                  {t.count !== undefined && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold hidden sm:inline-block ${tab === t.key ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-500'}`}>
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <RefreshCw className="w-6 h-6 text-slate-400 animate-spin mx-auto mb-2" />
                <p className="text-sm text-slate-500">Loading benchmark data...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Resume banner — only for in-progress sessions with remaining benchmarks */}
              {incompleteSession &&
               incompleteSession.session_outcome === 'in_progress' &&
               incompleteSession.benchmarks_count < BENCHMARK_ORDER.length &&
               !showWizard && (
                <div className="mx-4 sm:mx-6 mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Play className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-blue-900">Incomplete benchmark session detected</p>
                      <p className="text-xs text-blue-700 mt-0.5">
                        <span className="font-mono font-bold">{incompleteSession.session_ref}</span>
                        {' — '}
                        {incompleteSession.benchmarks_count} of {BENCHMARK_ORDER.length} benchmarks captured.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedSession(incompleteSession)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors flex-shrink-0"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    View Session
                  </button>
                </div>
              )}
              {tab === 'overview' && <OverviewTab sessions={sessions} runs={runs} definitions={definitions} latestReview={latestReview} onOpenSession={s => setSelectedSession(s)} onStartBenchmark={() => setShowWizard(true)} />}
              {tab === 'library'  && <LibraryTab definitions={definitions} />}
              {tab === 'sessions' && <SessionsTab sessions={sessions} onSelect={s => setSelectedSession(s)} />}
              {tab === 'runs'     && <RunsTab runs={runs} sessions={sessions} onStatusUpdate={handleStatusUpdate} />}
            </>
          )}
        </div>
      </div>
    </>
  );
}
