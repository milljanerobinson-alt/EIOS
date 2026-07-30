import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Brain, Plus, Send, Loader2, Pin, Trash2, Star, Search,
  Copy, ChevronRight, ChevronDown, Sparkles,
  MessageSquare, X, Check, Settings, TestTube2,
  Rocket, Shield, Code2, GitBranch, Info, Zap,
  Map, FileText, ArrowRight, Menu, LayoutDashboard,
  Layers, Target, Database, Package, CheckCircle2, XCircle,
  ClipboardCheck, Clock, Server, RotateCcw, ChevronUp, ChevronLeft,
  Lightbulb, ListChecks, SkipForward, UserCog,
  Pencil, CheckSquare, RefreshCw, Activity, Link2, AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ATDCognitiveEngine } from '../../lib/atdCognitiveEngine';
import {
  sendConversationToATD,
  getExistingLink,
  navigateToIntent,
  runDuplicateIntelligenceForConversation,
  type BridgeDecision,
  type ConversationIntentLink,
  type DuplicateIntelligenceResult,
} from '../../lib/conversationIntentBridge';
import { recordDuplicateAction } from '../../lib/duplicateIntelligenceService';
import { restoreObject } from '../../lib/engineeringLifecycleEngine';
import { ECCDirectorDashboard } from './ECCDirectorDashboard';
import { ResizableSidebar } from '../../components/ResizableSidebar';
import {
  indexConversation,
  loadConversationIntelligence,
  type ConversationIntelligence,
} from '../../lib/conversationIntelligenceService';
import {
  EngineeringOrchestrator,
  assessReadiness,
  type OrchestrationStatus,
  type OrchestrationResult,
  type ExecutionPreparationStep,
  type ConversationExecutionResult,
} from '../../lib/engineeringOrchestrator';
import type { ExecutionPipelineStage } from '../ecc/ECCIdeaTypes';
import {
  ATDConversationPackage,
  type ApprovedAnalysis,
  type ApprovedPlan,
} from '../../components/ATDConversationPackage';
import type { EngineeringIntent, EngineeringAnalysis, EngineeringPlan } from '../../lib/atdCognitiveEngine';
import type { AnalysisDraft, PlanDraft } from '../../lib/engineeringDraftService';
import { EngineeringDraftService } from '../../lib/engineeringDraftService';
// EWO-033R.2: Conversation-first engineering interaction
import { InteractionChannelAdapter } from '../../lib/interactionChannelAdapter';
import type { InteractionCard } from '../../lib/interactionChannelAdapter';
import { InteractionPresentationFilter } from '../../lib/interactionPresentationFilter';
import { InteractionResumeService } from '../../lib/interactionResumeService';
import { ProposalEngine } from '../../lib/proposalEngine';
import { ProposalRefinementService } from '../../lib/proposalRefinementService';
import { InteractionExecutionService } from '../../lib/interactionExecutionService';
import { InteractionCompletionService } from '../../lib/interactionCompletionService';
import type { ExecutionProgressUpdate } from '../../lib/interactionExecutionService';
import {
  ProposalCard, ExecutionReadyCard, ExecutionProgressCard,
  CompletionPackageCard, ClosedCard, BlockedCard, PreparingCard,
  ExecutionFailedCard, PreparationTimeoutCard, ConversationRecoveryCard,
  PreparingExecutionCard,
} from '../../components/EngineeringInteractionCards';
import type { FilteredProposal, FilteredExecutionReady, FilteredCompletion } from '../../lib/interactionPresentationFilter';
import { normalizeFilesChanged } from '../../lib/interactionCompletionService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conversation {
  id: string;
  title: string;
  context_type: string;
  pinned: boolean;
  summary: string | null;
  updated_at: string;
  status: 'active' | 'completed';
  completed_at: string | null;
  reopened_at: string | null;
  auto_completed?: boolean;
  completion_reason?: string | null;
  migration_notes?: string | null;
}

interface HealthReviewStats {
  total_analysed: number;
  auto_completed: number;
  remaining_active: number;
  flagged_for_review: number;
  orphaned: number;
  unclear_titles: number;
  duplicate_pairs: number;
}

interface HealthReviewRecommendation {
  priority: string;
  title: string;
  description: string;
}

interface HealthReviewResult {
  review_id: string | null;
  summary: string;
  stats: HealthReviewStats;
  recommendations: HealthReviewRecommendation[];
}

interface SavedHealthReview {
  id: string;
  run_at: string;
  total_analysed: number;
  auto_completed_count: number;
  remaining_active: number;
  flagged_for_review: number;
  orphaned: number;
  unclear_titles: number;
  duplicate_pairs: number;
  summary: string | null;
  recommendations: HealthReviewRecommendation[];
}

interface PendingImplementation {
  task: string;
  task_name: string;
  root_cause: string;
  implementation_summary: string;
  confidence: number;
  confidence_score: number;
  confidence_reason: string;
  risk: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  estimated_time: string;
  target: string;
  target_environment: string;
  rollback_available: boolean;
  rollback_instructions?: string;
  evidence_used: string[];
  affected_features: string[];
  affected_components: string[];
  affected_edge_functions: string[];
  affected_db_tables: string[];
  affected_migrations: string[];
  changes: Array<{ type: string; file: string; description: string }>;
}

interface ArtefactPlanItem {
  type: 'backlog_item' | 'goal' | 'epic' | 'decision' | 'documentation' | 'feature';
  title: string;
  description?: string;
  priority?: string;
  reasoning: string;
}

interface CreatedArtefact {
  type: string;
  id: string;
  title: string;
  reasoning: string;
  skipped?: boolean;
  skip_reason?: string;
}

interface EngineeringDecisionFeatureIntelligence {
  creates_new_feature: boolean;
  updates_existing_feature: string | null;
  existing_epic: string | null;
  existing_goal: string | null;
  creates_new_spec: boolean;
  reasoning: string;
}

interface EngineeringDecisionImpact {
  affected_features: string[];
  affected_specs: string[];
  affected_tests: string[];
  affected_documentation: string[];
  affected_releases: string[];
  affected_architecture: string[];
  affected_integrations: string[];
  affected_apis: string[];
  affected_db_objects: string[];
}

interface EngineeringDecisionTestRec {
  type: string;
  required: boolean;
  reason: string;
}

interface EngineeringDecisionDocRec {
  type: string;
  required: boolean;
  title: string;
}

interface EngineeringDecisionDuplicateAnalysis {
  similar_records_found: boolean;
  recommendation: 'Create New' | 'Update Existing' | 'Merge' | 'Link';
  existing_record: string | null;
  reasoning: string;
}

interface EngineeringDecisionReadiness {
  percentage: number;
  items_complete: string[];
  items_outstanding: string[];
}

interface EngineeringDecisionDirectorSummary {
  recommendation: string;
  priority: number;
  reason: string;
  estimated_effort: string;
  suggested_phase: string;
  suggested_release: string;
  required_testing: string[];
}

interface EngineeringDecision {
  recommendation: 'Proceed' | 'Proceed with Changes' | 'Further Investigation Required' | 'Do Not Proceed';
  priority_score: number;
  priority_level: 'Critical' | 'High' | 'Medium' | 'Low';
  engineering_confidence: number;
  business_value: number;
  engineering_value: number;
  compliance_value: number;
  customer_value: number;
  estimated_effort: string;
  estimated_complexity: 'Simple' | 'Medium' | 'Complex' | 'Highly Complex';
  why_now: string;
  suggested_phase: string;
  suggested_milestone: string;
  suggested_release: string;
  suggested_roadmap_position: string;
  feature_intelligence: EngineeringDecisionFeatureIntelligence;
  impact_summary: EngineeringDecisionImpact;
  testing_recommendations: EngineeringDecisionTestRec[];
  documentation_recommendations: EngineeringDecisionDocRec[];
  duplicate_analysis: EngineeringDecisionDuplicateAnalysis;
  implementation_readiness: EngineeringDecisionReadiness;
  director_summary: EngineeringDecisionDirectorSummary;
}

interface RuntimeDiagnosticEnvelope {
  request_id: string;
  detected_intent: string;
  resolved_domain: string | null;
  resolved_object_reference: string | null;
  resolved_object_type: string | null;
  runtime_pipeline: string | null;
  services_invoked: string[];
  tables_attempted: string[];
  tables_successfully_queried: string[];
  tables_skipped: string[];
  query_failures: Array<{ source: string; failure: string }>;
  records_examined_count: number;
  relationships_found_count: number;
  pending_artefacts_count: number;
  diagnostic_confidence: 'high' | 'medium' | 'low' | 'undetermined';
  generated_at: string;
}

interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  suggested?: string[];
  isStreaming?: boolean;
  pending_implementation?: PendingImplementation;
  artefact_plan?: ArtefactPlanItem[];
  engineering_decision?: EngineeringDecision;
  created_artefacts?: CreatedArtefact[];
  skipped_artefacts?: CreatedArtefact[];
  change_record_id?: string;
  approved?: boolean;
  cancelled?: boolean;
  selected_roles?: string[];
  ai_role?: string;
  // EWO-011.8.1: inline engineering orchestration package
  engineering_package?: EngineeringPackageState;
  // EWO-016R.Y.1: runtime diagnostic envelope for follow-up binding
  runtime_diagnostic_envelope?: RuntimeDiagnosticEnvelope;
  // EWO-033R.2: conversation-first engineering interaction
  engineering_interaction?: EngineeringInteractionState;
}

// EWO-033R.2: State for the conversation-first engineering interaction
interface EngineeringInteractionState {
  card: InteractionCard;
  ideaId?: string;
  proposalId?: string;
  ewoId?: string;
  ewoRef?: string;
  executionId?: string;
  busy?: boolean;
}

interface FavouritePrompt {
  id: string;
  label: string;
  prompt: string;
  category: string;
  position: number;
}

// EWO-011.8.1: State for the inline Engineering Package in a conversation message
interface EngineeringPackageState {
  status: OrchestrationStatus;
  intent: EngineeringIntent | null;
  analysisDraft: AnalysisDraft | null;
  planDraft: PlanDraft | null;
  analysis: EngineeringAnalysis | null;
  plan: EngineeringPlan | null;
  duplicateResult: import('../../lib/duplicateIntelligenceService').DuplicateIntelligenceResult | null;
  errorMessage: string | null;
  // Preserved for approval calls
  pipelineExecutionId: string | null;
  // EWO-011.8.2: Execution state
  executionPreparationSteps: ExecutionPreparationStep[] | null;
  executionPipeline: ExecutionPipelineStage[] | null;
  executionResult: ConversationExecutionResult | null;
}

interface ContextStats {
  total?: number;
  live?: number;
  notTested?: number;
  goals?: number;
  epics?: number;
  backlogTotal?: number;
  relationships?: number;
}

// ─── Modes ───────────────────────────────────────────────────────────────────

type Mode = 'ask' | 'build' | 'impact' | 'search' | 'docs' | 'test' | 'audit' | 'recommend';

const MODES: { key: Mode; label: string; icon: typeof Brain; color: string; bg: string; border: string; desc: string }[] = [
  { key: 'ask',       label: 'Ask',              icon: Brain,         color: 'text-slate-700',   bg: 'bg-slate-100',    border: 'border-slate-300',  desc: 'Ask anything about the platform' },
  { key: 'build',     label: 'Build Plan',       icon: Code2,         color: 'text-blue-700',    bg: 'bg-blue-50',      border: 'border-blue-300',   desc: 'Generate an implementation spec' },
  { key: 'impact',    label: 'Impact Analysis',  icon: Zap,           color: 'text-amber-700',   bg: 'bg-amber-50',     border: 'border-amber-300',  desc: 'Analyse change impact' },
  { key: 'search',    label: 'Search',           icon: Search,        color: 'text-teal-700',    bg: 'bg-teal-50',      border: 'border-teal-300',   desc: 'Search across all product data' },
  { key: 'docs',      label: 'Documentation',    icon: FileText,      color: 'text-emerald-700', bg: 'bg-emerald-50',   border: 'border-emerald-300',desc: 'Generate documentation' },
  { key: 'test',      label: 'Test Planning',    icon: TestTube2,     color: 'text-cyan-700',    bg: 'bg-cyan-50',      border: 'border-cyan-300',   desc: 'Generate test plans & cases' },
  { key: 'audit',     label: 'Compliance',       icon: Shield,        color: 'text-red-700',     bg: 'bg-red-50',       border: 'border-red-300',    desc: 'ASQA compliance analysis' },
  { key: 'recommend', label: 'Recommendations',  icon: Sparkles,      color: 'text-violet-700',  bg: 'bg-violet-50',    border: 'border-violet-300', desc: 'Engineering recommendations' },
];

// ─── AI Roles ─────────────────────────────────────────────────────────────────

type AIRole = 'auto' | 'director' | 'architect' | 'product_manager' | 'qa_lead' | 'release_manager' | 'compliance' | 'guardian' | 'ceo' | 'documentation' | 'support';

const AI_ROLES: { key: AIRole; label: string; shortLabel: string; icon: typeof Brain; color: string; bg: string; border: string; desc: string; isAuto?: boolean }[] = [
  { key: 'auto',            label: 'Auto',               shortLabel: 'Auto',       icon: Zap,            color: 'text-blue-700',    bg: 'bg-gradient-to-r from-blue-50 to-teal-50', border: 'border-blue-200',    desc: 'AI automatically selects the best role(s) for each request', isAuto: true },
  { key: 'director',        label: 'Technical Director', shortLabel: 'Director',   icon: Brain,          color: 'text-blue-700',    bg: 'bg-blue-50',      border: 'border-blue-200',    desc: 'Senior technical leader — systems thinking, trade-offs, full programme view' },
  { key: 'architect',       label: 'Architect',          shortLabel: 'Architect',  icon: GitBranch,      color: 'text-slate-700',   bg: 'bg-slate-50',     border: 'border-slate-200',   desc: 'Focus on architecture, patterns, dependencies, and structural quality' },
  { key: 'product_manager', label: 'Product Manager',    shortLabel: 'PM',         icon: Target,         color: 'text-emerald-700', bg: 'bg-emerald-50',   border: 'border-emerald-200', desc: 'Prioritise by business value, customer impact, and roadmap fit' },
  { key: 'qa_lead',         label: 'QA Lead',            shortLabel: 'QA',         icon: TestTube2,      color: 'text-cyan-700',    bg: 'bg-cyan-50',      border: 'border-cyan-200',    desc: 'Test coverage, regression risk, quality gates, and testing strategy' },
  { key: 'release_manager', label: 'Release Manager',    shortLabel: 'Release',    icon: Rocket,         color: 'text-teal-700',    bg: 'bg-teal-50',      border: 'border-teal-200',    desc: 'Release readiness, RC status, deployment risk, and rollout planning' },
  { key: 'compliance',      label: 'Compliance Officer', shortLabel: 'Compliance', icon: Shield,         color: 'text-red-700',     bg: 'bg-red-50',       border: 'border-red-200',     desc: 'ASQA compliance, audit trail, regulatory obligations, and flags' },
  { key: 'guardian',        label: 'Engineering Guardian', shortLabel: 'Guardian', icon: Settings,       color: 'text-amber-700',   bg: 'bg-amber-50',     border: 'border-amber-200',   desc: 'Technical debt, security, performance, and long-term health' },
  { key: 'ceo',             label: 'CEO Advisor',        shortLabel: 'CEO',        icon: Sparkles,       color: 'text-violet-700',  bg: 'bg-violet-50',    border: 'border-violet-200',  desc: 'Strategic business perspective — ROI, market positioning, growth' },
  { key: 'documentation',   label: 'Documentation Manager', shortLabel: 'Docs',   icon: FileText,       color: 'text-indigo-700',  bg: 'bg-indigo-50',    border: 'border-indigo-200',  desc: 'Specifications, knowledge centre, release notes, developer docs' },
  { key: 'support',         label: 'Support Analyst',    shortLabel: 'Support',    icon: MessageSquare,  color: 'text-rose-700',    bg: 'bg-rose-50',      border: 'border-rose-200',    desc: 'Bug triage, support patterns, customer feedback, and issue analysis' },
];

// ─── Role Selector ─────────────────────────────────────────────────────────────

function RoleSelector({ role, onChange, selectedRoles }: { role: AIRole; onChange: (r: AIRole) => void; selectedRoles?: string[] }) {
  const [open, setOpen] = useState(false);
  const current = AI_ROLES.find(r => r.key === role) ?? AI_ROLES[0];
  const Icon = current.icon;
  const isAuto = current.key === 'auto';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(s => !s)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all hover:opacity-90 ${
          isAuto
            ? 'bg-gradient-to-r from-blue-600 to-teal-500 text-white border-blue-400'
            : `${current.bg} ${current.color} ${current.border}`
        }`}
        title={current.desc}
      >
        <UserCog className="w-3 h-3" />
        {isAuto && selectedRoles && selectedRoles.length > 0 ? (
          <span className="flex items-center gap-0.5">
            {selectedRoles.slice(0, 2).map(r => {
              const roleDef = AI_ROLES.find(x => x.key === r);
              if (!roleDef) return null;
              const RIcon = roleDef.icon;
              return <RIcon key={r} className="w-2.5 h-2.5" />;
            })}
          </span>
        ) : (
          <Icon className="w-3 h-3" />
        )}
        {isAuto ? (selectedRoles && selectedRoles.length > 0 ? `Auto · ${selectedRoles.length} roles` : 'Auto') : current.shortLabel}
        <ChevronDown className="w-2.5 h-2.5 opacity-70" />
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 right-0 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">AI Perspective</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Auto selects the best role(s) for each request</p>
          </div>
          <div className="p-1.5 space-y-0.5 max-h-80 overflow-y-auto">
            {AI_ROLES.map(r => {
              const RIcon = r.icon;
              return (
                <button
                  key={r.key}
                  onClick={() => { onChange(r.key); setOpen(false); }}
                  className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all ${
                    role === r.key ? `${r.bg} ${r.border} border` : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${r.isAuto ? 'bg-gradient-to-br from-blue-600 to-teal-500' : `${r.bg} border ${r.border}`}`}>
                    <RIcon className={`w-3 h-3 ${r.isAuto ? 'text-white' : r.color}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-xs font-semibold leading-tight ${role === r.key ? r.color : 'text-slate-800'}`}>{r.label}</p>
                      {r.isAuto && <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Default</span>}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight mt-0.5 line-clamp-2">{r.desc}</p>
                  </div>
                  {role === r.key && <Check className={`w-3.5 h-3.5 shrink-0 mt-1 ml-auto ${r.color}`} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Prompt categories ───────────────────────────────────────────────────────

const CATEGORY_CFG: Record<string, { label: string; icon: typeof Brain; color: string; bg: string }> = {
  product:      { label: 'Product',      icon: Sparkles,    color: 'text-blue-600',    bg: 'bg-blue-50'    },
  testing:      { label: 'Testing',      icon: TestTube2,   color: 'text-teal-600',    bg: 'bg-teal-50'    },
  release:      { label: 'Releases',     icon: Rocket,      color: 'text-emerald-600', bg: 'bg-emerald-50' },
  compliance:   { label: 'Compliance',   icon: Shield,      color: 'text-red-600',     bg: 'bg-red-50'     },
  developer:    { label: 'Developer',    icon: Code2,       color: 'text-amber-600',   bg: 'bg-amber-50'   },
  architecture: { label: 'Architecture', icon: GitBranch,   color: 'text-slate-600',   bg: 'bg-slate-100'  },
  general:      { label: 'General',      icon: MessageSquare, color: 'text-slate-500', bg: 'bg-slate-50'   },
};

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')   // headings
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1')     // italic
    .replace(/`(.+?)`/g, '$1')       // inline code
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
    .replace(/^\s*[-*+]\s+/gm, '')   // list bullets
    .replace(/\n+/g, ' ')            // newlines to spaces
    .trim();
}

function generateConvTitle(prompt: string): string {
  const p = stripMarkdown(prompt.trim());
  const lower = p.toLowerCase();
  let prefix = '';
  if (/^i (have|had|got) an? idea/i.test(p) || /\bidea\b/i.test(lower.slice(0, 40))) prefix = 'Idea';
  else if (/^i found (a |an )?bug/i.test(p) || /\bbug\b/i.test(lower.slice(0, 40))) prefix = 'Bug';
  else if (/\barchitecture\b|\breview\b/i.test(lower.slice(0, 60))) prefix = 'Architecture';
  else if (/\btest plan\b|\btest suite\b|\btesting\b/i.test(lower.slice(0, 60))) prefix = 'Test Plan';
  else if (/\bdocumentation\b|\bspec\b|\bspecification\b/i.test(lower.slice(0, 60))) prefix = 'Spec';
  else if (/\bbolt prompt\b|\bimplementation prompt\b/i.test(lower)) prefix = 'Bolt Prompt';
  else if (/\bimpact\b/i.test(lower.slice(0, 60))) prefix = 'Impact';
  else if (/\bfeature\b|\bbuild\b|\bimplement\b/i.test(lower.slice(0, 60))) prefix = 'Feature';
  else if (/\bcompliance\b|\basqa\b/i.test(lower.slice(0, 60))) prefix = 'Compliance';

  const body = p.replace(/^(i (have|had|got) an? idea|i found (a |an )?bug)[,\s—-]*/i, '').slice(0, 50).trim();
  if (prefix && body) return `${prefix} — ${body}`;
  return p.slice(0, 60);
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <div key={i} className="relative my-3 group">
          {lang && <div className="text-[10px] font-mono text-slate-400 bg-slate-100 px-3 py-1 rounded-t-lg border border-b-0 border-slate-200">{lang}</div>}
          <pre className={`bg-slate-900 text-emerald-300 text-xs font-mono p-4 rounded-lg ${lang ? 'rounded-t-none' : ''} border border-slate-200 overflow-x-auto`}>
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>
      );
      i++; continue;
    }

    if (line.startsWith('# '))  { elements.push(<h1 key={i} className="text-lg font-bold text-slate-900 mt-4 mb-2">{line.slice(2)}</h1>); i++; continue; }
    if (line.startsWith('## ')) { elements.push(<h2 key={i} className="text-base font-bold text-slate-800 mt-3 mb-1.5 border-b border-slate-100 pb-1">{line.slice(3)}</h2>); i++; continue; }
    if (line.startsWith('### ')){ elements.push(<h3 key={i} className="text-sm font-bold text-slate-700 mt-2.5 mb-1">{line.slice(4)}</h3>); i++; continue; }
    if (line.startsWith('---')) { elements.push(<hr key={i} className="border-slate-200 my-3" />); i++; continue; }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={i} className="my-2 space-y-1 pl-4">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-1.5 text-sm text-slate-700">
              <span className="w-1 h-1 rounded-full bg-slate-400 mt-2 shrink-0" />
              <span dangerouslySetInnerHTML={{ __html: inlineMarkdown(item) }} />
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      elements.push(
        <ol key={i} className="my-2 space-y-1 pl-4">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-sm text-slate-700">
              <span className="text-[10px] font-bold text-slate-400 mt-0.5 w-4 shrink-0">{j + 1}.</span>
              <span dangerouslySetInnerHTML={{ __html: inlineMarkdown(item) }} />
            </li>
          ))}
        </ol>
      );
      continue;
    }

    if (line.startsWith('|') && lines[i + 1]?.startsWith('|--')) {
      const headers = line.split('|').filter(Boolean).map(h => h.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(lines[i].split('|').filter(Boolean).map(c => c.trim()));
        i++;
      }
      elements.push(
        <div key={i} className="my-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>{headers.map((h, j) => <th key={j} className="px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-200">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 ? 'bg-slate-50/50' : ''}>
                  {row.map((cell, ci) => <td key={ci} className="px-3 py-2 text-slate-700" dangerouslySetInnerHTML={{ __html: inlineMarkdown(cell) }} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (!line.trim()) { elements.push(<div key={i} className="h-2" />); i++; continue; }
    elements.push(<p key={i} className="text-sm text-slate-700 leading-relaxed my-1" dangerouslySetInnerHTML={{ __html: inlineMarkdown(line) }} />);
    i++;
  }

  return <div className="prose-sm">{elements}</div>;
}

function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-slate-100 text-slate-800 text-xs px-1 py-0.5 rounded font-mono">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 underline" target="_blank">$1</a>');
}

// ─── Engineering Plan Card ─────────────────────────────────────────────────────

const RECOMMENDATION_CFG = {
  'Proceed':                       { bg: 'bg-emerald-50',  border: 'border-emerald-300', text: 'text-emerald-700',  dot: 'bg-emerald-500',  badge: 'bg-emerald-100 text-emerald-800' },
  'Proceed with Changes':          { bg: 'bg-amber-50',    border: 'border-amber-300',   text: 'text-amber-700',    dot: 'bg-amber-500',    badge: 'bg-amber-100 text-amber-800' },
  'Further Investigation Required':{ bg: 'bg-orange-50',   border: 'border-orange-300',  text: 'text-orange-700',   dot: 'bg-orange-500',   badge: 'bg-orange-100 text-orange-800' },
  'Do Not Proceed':                { bg: 'bg-red-50',      border: 'border-red-300',     text: 'text-red-700',      dot: 'bg-red-500',      badge: 'bg-red-100 text-red-800' },
};

const PRIORITY_LEVEL_CFG = {
  Critical: 'bg-red-100 text-red-800 border-red-200',
  High:     'bg-orange-100 text-orange-800 border-orange-200',
  Medium:   'bg-amber-100 text-amber-800 border-amber-200',
  Low:      'bg-slate-100 text-slate-700 border-slate-200',
};

const COMPLEXITY_CFG = {
  'Simple':         'text-emerald-700 bg-emerald-50',
  'Medium':         'text-amber-700 bg-amber-50',
  'Complex':        'text-orange-700 bg-orange-50',
  'Highly Complex': 'text-red-700 bg-red-50',
};

function ValueBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-bold text-slate-600 w-6 text-right shrink-0">{value}</span>
    </div>
  );
}

function PlanSection({ title, icon: Icon, iconColor, children, defaultOpen = false }: {
  title: string;
  icon: typeof Brain;
  iconColor: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(s => !s)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
        <span className="text-xs font-semibold text-slate-700 flex-1">{title}</span>
        {open ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
      </button>
      {open && <div className="px-3 py-3 space-y-2 bg-white">{children}</div>}
    </div>
  );
}

function buildReviewPackage(decision: EngineeringDecision, artefactPlan?: ArtefactPlanItem[]): string {
  const ds = decision.director_summary;
  const lines: string[] = [
    '# Engineering Review Package',
    `**AI Technical Director | LLND Automate — Engineering Command Centre**`,
    '',
    '---',
    '',
    `## Recommendation: ${decision.recommendation}`,
    `**Priority Score:** ${decision.priority_score}/100  |  **Priority Level:** ${decision.priority_level}  |  **Engineering Confidence:** ${decision.engineering_confidence}%`,
    `**Estimated Effort:** ${decision.estimated_effort}  |  **Complexity:** ${decision.estimated_complexity}`,
    '',
    '## Value Dimensions',
    `- Business Value: ${decision.business_value}/100`,
    `- Customer Value: ${decision.customer_value}/100`,
    `- Engineering Value: ${decision.engineering_value}/100`,
    `- Compliance Value: ${decision.compliance_value}/100`,
    '',
    '## Why Now',
    decision.why_now,
    '',
    '## Roadmap Position',
    `- Phase: ${decision.suggested_phase || 'TBD'}`,
    `- Release: ${decision.suggested_release || 'TBD'}`,
    `- Milestone: ${decision.suggested_milestone || 'TBD'}`,
    '',
  ];

  if (decision.impact_summary) {
    const imp = decision.impact_summary;
    const allImpact = [
      ...imp.affected_features.map(f => `Feature: ${f}`),
      ...imp.affected_db_objects.map(t => `DB: ${t}`),
      ...imp.affected_apis.map(a => `Edge Function: ${a}`),
      ...imp.affected_integrations.map(i => `Integration: ${i}`),
      ...imp.affected_architecture.map(a => `Architecture: ${a}`),
    ];
    if (allImpact.length > 0) {
      lines.push('## Engineering Impact', ...allImpact.map(i => `- ${i}`), '');
    }
  }

  if (decision.testing_recommendations?.length > 0) {
    lines.push('## Testing Requirements');
    decision.testing_recommendations.forEach(t => {
      lines.push(`- ${t.required ? '[REQUIRED]' : '[OPTIONAL]'} ${t.type}: ${t.reason}`);
    });
    lines.push('');
  }

  if (decision.documentation_recommendations?.length > 0) {
    lines.push('## Documentation Requirements');
    decision.documentation_recommendations.forEach(d => {
      lines.push(`- ${d.required ? '[REQUIRED]' : '[OPTIONAL]'} ${d.type}: ${d.title}`);
    });
    lines.push('');
  }

  if (decision.implementation_readiness) {
    const r = decision.implementation_readiness;
    lines.push(`## Implementation Readiness: ${r.percentage}%`);
    if (r.items_complete?.length) lines.push('**Complete:**', ...r.items_complete.map(i => `- ${i}`));
    if (r.items_outstanding?.length) lines.push('**Outstanding:**', ...r.items_outstanding.map(i => `- ${i}`));
    lines.push('');
  }

  if (artefactPlan?.length) {
    lines.push('## Proposed ECC Artefacts');
    artefactPlan.forEach(a => lines.push(`- [${a.type.toUpperCase()}] ${a.title}: ${a.reasoning}`));
    lines.push('');
  }

  lines.push('## Technical Director Assessment', ds.reason, '');
  lines.push('---', '_Engineering Review Package prepared by AI Technical Director — LLND Automate ECC_');

  return lines.join('\n');
}

function SendToATDPanel({
  decision,
  conversationId,
  conversationTitle,
  userQuery,
}: {
  decision: EngineeringDecision;
  conversationId: string;
  conversationTitle: string;
  userQuery: string;
}) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'analysing_duplicates' | 'duplicate_review' | 'sending' | 'sent' | 'error'>('checking');
  const [intentRef, setIntentRef] = useState<string | null>(null);
  const [intentId,  setIntentId]  = useState<string | null>(null);
  const [hasPlan,   setHasPlan]   = useState(false);
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);
  const [dupResult, setDupResult] = useState<DuplicateIntelligenceResult | null>(null);
  const [dupActing, setDupActing] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    getExistingLink(conversationId)
      .then(async link => {
        if (link) {
          setIntentRef(link.intent_ref);
          setIntentId(link.intent_id);
          const data = await ATDCognitiveEngine.getIntentWithPipeline(link.intent_id);
          setHasPlan(!!data?.plan);
          setStatus('sent');
        } else {
          setStatus('idle');
        }
      })
      .catch(() => setStatus('idle'));
  }, [conversationId]);

  const handleSend = async () => {
    // Step 1: Run duplicate intelligence before creating the intent
    setStatus('analysing_duplicates');
    setErrorMsg(null);

    let dup: DuplicateIntelligenceResult | null = null;
    try {
      dup = await runDuplicateIntelligenceForConversation(
        userQuery.length > 80 ? userQuery.slice(0, 77) + '...' : userQuery,
        conversationId,
        userQuery,
      );
    } catch {
      // Non-blocking — proceed without duplicate check
    }

    // If a recommendation exists that warrants review, pause and show it
    if (dup && dup.hasFindings && dup.recommendation !== 'proceed') {
      setDupResult(dup);
      setStatus('duplicate_review');
      return;
    }

    // No findings or proceed — create intent directly
    await executeCreate(dup);
  };

  const executeCreate = async (dup: DuplicateIntelligenceResult | null) => {
    setStatus('sending');
    try {
      const result = await sendConversationToATD(
        decision as unknown as BridgeDecision,
        { id: conversationId, title: conversationTitle },
        userQuery,
      );
      setIntentRef(result.intent.intent_ref);
      setIntentId(result.intent.id);
      const data = await ATDCognitiveEngine.getIntentWithPipeline(result.intent.id);
      setHasPlan(!!data?.plan);
      // Record PO action against the duplicate analysis record
      if (dup?.recordId) {
        await recordDuplicateAction(dup.recordId, 'create_new', result.intent.id);
      }
      setStatus('sent');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Intent creation failed');
      setStatus('error');
    }
  };

  const handleDupRestore = async () => {
    if (!dupResult?.existingObject?.id) return;
    setDupActing(true);
    try {
      await restoreObject({
        objectType: 'intent',
        objectId: dupResult.existingObject.id,
        reason: 'Restored via duplicate intelligence recommendation in ICD conversation.',
      });
      if (dupResult.recordId) {
        await recordDuplicateAction(dupResult.recordId, 'restore', dupResult.existingObject.id);
      }
      // Navigate to the restored intent
      navigateToIntent(dupResult.existingObject.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Restore failed');
      setDupActing(false);
    }
  };

  const handleDupOpenExisting = () => {
    if (!dupResult?.existingObject?.id) return;
    if (dupResult.recordId) recordDuplicateAction(dupResult.recordId, 'open_existing');
    navigateToIntent(dupResult.existingObject.id);
  };

  const handleDupCreateNew = async () => {
    await executeCreate(dupResult);
  };

  const handleDupDismiss = () => {
    if (dupResult?.recordId) recordDuplicateAction(dupResult.recordId, 'dismissed');
    setDupResult(null);
    setStatus('idle');
  };

  // ── Loading / checking existing link ──────────────────────────────────────────
  if (status === 'checking') {
    return (
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin shrink-0" />
        <span className="text-xs text-slate-400">Checking ATD Workspace linkage...</span>
      </div>
    );
  }

  // ── Duplicate intelligence analysis running ───────────────────────────────────
  if (status === 'analysing_duplicates') {
    return (
      <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
        <span className="text-xs text-blue-700 font-medium">Duplicate Intelligence scanning Engineering Object Model...</span>
      </div>
    );
  }

  // ── Duplicate review — present recommendation before execution ────────────────
  if (status === 'duplicate_review' && dupResult) {
    const isActive   = dupResult.recommendation === 'continue_existing';
    const isArchived = dupResult.recommendation === 'restore_archived';
    const isDeleted  = dupResult.recommendation === 'restore_deleted';

    const headerBg = isActive
      ? 'bg-amber-50 border-amber-200'
      : isArchived
        ? 'bg-blue-50 border-blue-200'
        : 'bg-slate-50 border-slate-200';

    const headerText = isActive
      ? 'text-amber-900'
      : isArchived
        ? 'text-blue-900'
        : 'text-slate-800';

    const iconBg = isActive ? 'bg-amber-100' : isArchived ? 'bg-blue-100' : 'bg-slate-200';
    const iconCl = isActive ? 'text-amber-600' : isArchived ? 'text-blue-600' : 'text-slate-500';

    return (
      <div className="mt-3 rounded-xl border-2 border-amber-200 overflow-hidden bg-white shadow-sm">
        {/* Header */}
        <div className={`px-4 py-3 flex items-start gap-3 border-b ${headerBg}`}>
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${iconBg}`}>
            <AlertTriangle className={`w-3.5 h-3.5 ${iconCl}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className={`text-xs font-bold ${headerText}`}>Duplicate Intelligence</p>
              <span className="text-[9px] font-bold text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded uppercase tracking-wide">
                {dupResult.confidence}% confidence
              </span>
            </div>
            <p className="text-[10px] text-slate-600 leading-relaxed">{dupResult.explanationText}</p>
          </div>
        </div>

        {/* Existing object badge */}
        {dupResult.existingObject && (
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-semibold text-slate-500 uppercase">Existing Object</span>
              <span className="text-[10px] font-mono text-slate-700">{dupResult.existingObject.ref ?? dupResult.existingObject.id}</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded capitalize ${
                dupResult.existingObject.lifecycleStatus === 'active' ? 'bg-emerald-100 text-emerald-700' :
                dupResult.existingObject.lifecycleStatus === 'archived' ? 'bg-blue-100 text-blue-700' :
                'bg-slate-200 text-slate-600'
              }`}>
                {dupResult.existingObject.lifecycleStatus}
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-4 py-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
            {dupResult.recommendationLabel} — Choose an action
          </p>

          {/* Active duplicate actions */}
          {isActive && (
            <>
              <button
                onClick={handleDupOpenExisting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Open Existing Intent
              </button>
              <button
                onClick={handleDupDismiss}
                className="w-full px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
              >
                Cancel
              </button>
            </>
          )}

          {/* Archived or deleted duplicate actions */}
          {(isArchived || isDeleted) && (
            <>
              <button
                onClick={handleDupRestore}
                disabled={dupActing}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {dupActing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {isArchived ? 'Restore Archived Intent' : 'Restore Deleted Intent'}
              </button>
              <button
                onClick={handleDupOpenExisting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                View {isArchived ? 'Archived' : 'Deleted'} Intent
              </button>
              <button
                onClick={handleDupCreateNew}
                disabled={dupActing || status === 'sending'}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {status === 'sending'
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating Intent...</>
                  : <>Create New Intent (New ID)</>}
              </button>
              <button
                onClick={handleDupDismiss}
                className="w-full px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Already sent — show success card ─────────────────────────────────────────
  if (status === 'sent' && intentRef && intentId) {
    return (
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 overflow-hidden">
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-emerald-800 mb-0.5">Linked to ATD Workspace</p>
            <p className="text-[10px] text-emerald-700">
              Engineering Intent{' '}
              <span className="font-mono font-bold">{intentRef}</span>
              {' '}has been transferred to the ATD Workspace.{' '}
              {hasPlan
                ? 'The Engineering Plan is ready for review.'
                : 'Its cognitive pipeline is now processing.'}
            </p>
          </div>
        </div>
        <div className="px-4 pb-3 flex gap-2">
          <button
            onClick={() => navigateToIntent(intentId)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <ArrowRight className="w-3 h-3" />
            {hasPlan ? 'Review Engineering Plan' : 'Open Intent in ATD Workspace'}
          </button>
          <span className="self-center text-[10px] text-emerald-600 font-mono">{intentRef}</span>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
          <p className="text-xs font-semibold text-red-700">Intent creation failed</p>
        </div>
        {errorMsg && <p className="text-[10px] text-red-600">{errorMsg}</p>}
        <button
          onClick={handleSend}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          Retry
        </button>
      </div>
    );
  }

  // ── Idle — main CTA ───────────────────────────────────────────────────────────
  return (
    <div className="mt-3 rounded-xl border-2 border-blue-200 bg-blue-50/60 overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3 border-b border-blue-200 bg-blue-50">
        <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
          <Brain className="w-3.5 h-3.5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-blue-900">Next Step — Governed Engineering Execution</p>
          <p className="text-[10px] text-blue-700 mt-0.5">
            This Engineering Review is ready to become a governed Engineering Intent.
          </p>
        </div>
      </div>
      <div className="px-4 py-3 space-y-3">
        <button
          onClick={handleSend}
          disabled={status === 'sending'}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          {status === 'sending'
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating Engineering Intent...</>
            : <><ArrowRight className="w-3.5 h-3.5" />Send to ATD Workspace</>
          }
        </button>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10px] text-blue-700">
          {[
            'Engineering Intent',
            'Cognitive Pipeline',
            'Engineering Plan',
            'Permanent conversation linkage',
            'Access to the Execution Decision Gate',
          ].map(item => (
            <div key={item} className="flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EngineeringPlanCard({ decision, artefactPlan, conversationId, conversationTitle, userQuery }: {
  decision: EngineeringDecision;
  artefactPlan?: ArtefactPlanItem[];
  conversationId?: string;
  conversationTitle?: string;
  userQuery?: string;
}) {
  const [reviewCopied, setReviewCopied] = useState(false);
  const recCfg = RECOMMENDATION_CFG[decision.recommendation] ?? RECOMMENDATION_CFG['Proceed'];
  const priorityCfg = PRIORITY_LEVEL_CFG[decision.priority_level] ?? PRIORITY_LEVEL_CFG.Medium;
  const complexityCfg = COMPLEXITY_CFG[decision.estimated_complexity] ?? COMPLEXITY_CFG.Medium;
  const ds = decision.director_summary;

  const totalImpact = [
    ...(decision.impact_summary?.affected_features ?? []),
    ...(decision.impact_summary?.affected_architecture ?? []),
    ...(decision.impact_summary?.affected_db_objects ?? []),
    ...(decision.impact_summary?.affected_integrations ?? []),
  ].length;

  const requiredTests = (decision.testing_recommendations ?? []).filter(t => t.required);
  const requiredDocs  = (decision.documentation_recommendations ?? []).filter(d => d.required);
  const readiness     = decision.implementation_readiness;

  return (
    <div className="mt-3 rounded-2xl border-2 border-slate-200 overflow-hidden bg-white shadow-sm">

      {/* ── Header ── */}
      <div className={`px-4 py-3 flex items-start gap-3 ${recCfg.bg} border-b ${recCfg.border}`}>
        <div className="w-8 h-8 rounded-xl bg-white/70 flex items-center justify-center shrink-0 shadow-sm">
          <Lightbulb className={`w-4 h-4 ${recCfg.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Engineering Plan</span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${recCfg.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${recCfg.dot}`} />
              {decision.recommendation}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${priorityCfg}`}>
              Priority {decision.priority_score} — {decision.priority_level}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${complexityCfg}`}>
              {decision.estimated_complexity}
            </span>
            {decision.estimated_effort && (
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> {decision.estimated_effort}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">

        {/* ── Confidence + Value Bars ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Engineering Confidence</p>
            <div className="flex items-end gap-1.5 mb-1">
              <span className={`text-2xl font-black ${
                decision.engineering_confidence >= 80 ? 'text-emerald-600' :
                decision.engineering_confidence >= 60 ? 'text-amber-600' : 'text-red-600'
              }`}>{decision.engineering_confidence}<span className="text-base font-bold">%</span></span>
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${confidenceColor(decision.engineering_confidence)}`}
                style={{ width: `${decision.engineering_confidence}%` }}
              />
            </div>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Value Breakdown</p>
            <ValueBar label="Business"    value={decision.business_value}    color="bg-blue-500" />
            <ValueBar label="Customer"    value={decision.customer_value}    color="bg-teal-500" />
            <ValueBar label="Engineering" value={decision.engineering_value} color="bg-violet-500" />
            <ValueBar label="Compliance"  value={decision.compliance_value}  color="bg-amber-500" />
          </div>
        </div>

        {/* ── Why Now ── */}
        {decision.why_now && (
          <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
            <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Info className="w-3 h-3" /> Why Now
            </p>
            <p className="text-xs text-slate-700 leading-relaxed">{decision.why_now}</p>
          </div>
        )}

        {/* ── Roadmap Positioning ── */}
        {(decision.suggested_phase || decision.suggested_release || decision.suggested_milestone) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { icon: Layers,   label: 'Phase',     value: decision.suggested_phase },
              { icon: Rocket,   label: 'Release',   value: decision.suggested_release },
              { icon: Target,   label: 'Milestone', value: decision.suggested_milestone },
            ].map(({ icon: Icon, label, value }) => value ? (
              <div key={label} className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 text-center">
                <Icon className="w-3 h-3 text-slate-400 mx-auto mb-1" />
                <p className="text-[9px] text-slate-400 uppercase tracking-wide">{label}</p>
                <p className="text-[11px] font-bold text-slate-700 mt-0.5 leading-tight">{value}</p>
              </div>
            ) : null)}
          </div>
        )}

        {/* ── Feature Intelligence ── */}
        {decision.feature_intelligence && (
          <PlanSection title="Feature Intelligence" icon={Package} iconColor="text-blue-500">
            <div className="space-y-1.5">
              {decision.feature_intelligence.updates_existing_feature && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">UPDATE</span>
                  <span className="text-xs text-slate-700">{decision.feature_intelligence.updates_existing_feature}</span>
                </div>
              )}
              {decision.feature_intelligence.creates_new_feature && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0">NEW FEATURE</span>
                  <span className="text-xs text-slate-500">New feature entry will be created</span>
                </div>
              )}
              {decision.feature_intelligence.existing_epic && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 shrink-0">EPIC</span>
                  <span className="text-xs text-slate-700">{decision.feature_intelligence.existing_epic}</span>
                </div>
              )}
              {decision.feature_intelligence.existing_goal && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 shrink-0">GOAL</span>
                  <span className="text-xs text-slate-700">{decision.feature_intelligence.existing_goal}</span>
                </div>
              )}
              {decision.feature_intelligence.creates_new_spec && (
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">NEW SPEC</span>
                  <span className="text-xs text-slate-500">Engineering specification will be drafted</span>
                </div>
              )}
              {decision.feature_intelligence.reasoning && (
                <p className="text-[10px] text-slate-500 italic pt-1">{decision.feature_intelligence.reasoning}</p>
              )}
            </div>
          </PlanSection>
        )}

        {/* ── Duplicate Analysis ── */}
        {decision.duplicate_analysis?.similar_records_found && (
          <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Search className="w-3 h-3" /> Duplicate Intelligence
            </p>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                decision.duplicate_analysis.recommendation === 'Update Existing' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                decision.duplicate_analysis.recommendation === 'Merge' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                decision.duplicate_analysis.recommendation === 'Link' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                'bg-emerald-100 text-emerald-700 border-emerald-200'
              }`}>{decision.duplicate_analysis.recommendation}</span>
              {decision.duplicate_analysis.existing_record && (
                <span className="text-xs text-slate-700">"{decision.duplicate_analysis.existing_record}"</span>
              )}
            </div>
            <p className="text-[10px] text-slate-600">{decision.duplicate_analysis.reasoning}</p>
          </div>
        )}

        {/* ── Impact Summary ── */}
        {totalImpact > 0 && (
          <PlanSection title={`Engineering Impact (${totalImpact} areas)`} icon={Zap} iconColor="text-amber-500">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { label: 'Features',       items: decision.impact_summary?.affected_features,      icon: Package,     color: 'text-blue-600' },
                { label: 'Architecture',   items: decision.impact_summary?.affected_architecture,  icon: GitBranch,   color: 'text-slate-600' },
                { label: 'DB Objects',     items: decision.impact_summary?.affected_db_objects,    icon: Database,    color: 'text-teal-600' },
                { label: 'Integrations',   items: decision.impact_summary?.affected_integrations,  icon: Zap,         color: 'text-orange-600' },
                { label: 'Tests',          items: decision.impact_summary?.affected_tests,          icon: TestTube2,   color: 'text-cyan-600' },
                { label: 'Releases',       items: decision.impact_summary?.affected_releases,       icon: Rocket,      color: 'text-emerald-600' },
              ].filter(({ items }) => items?.length).map(({ label, items, icon: Icon, color }) => (
                <div key={label} className="bg-slate-50 rounded-lg p-2 border border-slate-200">
                  <div className="flex items-center gap-1 mb-1.5">
                    <Icon className={`w-3 h-3 ${color}`} />
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
                    <span className="ml-auto text-[10px] font-bold text-slate-600">{items!.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {items!.slice(0, 3).map(item => (
                      <span key={item} className="text-[9px] bg-white text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 font-mono">{item}</span>
                    ))}
                    {items!.length > 3 && <span className="text-[9px] text-slate-400">+{items!.length - 3}</span>}
                  </div>
                </div>
              ))}
            </div>
          </PlanSection>
        )}

        {/* ── Testing Recommendations ── */}
        {(decision.testing_recommendations?.length ?? 0) > 0 && (
          <PlanSection title={`Testing (${requiredTests.length} required)`} icon={TestTube2} iconColor="text-cyan-500" defaultOpen={requiredTests.length > 0}>
            <div className="space-y-1.5">
              {decision.testing_recommendations.map((t, i) => (
                <div key={i} className={`flex items-start gap-2 p-2 rounded-lg border ${
                  t.required ? 'bg-cyan-50 border-cyan-200' : 'bg-slate-50 border-slate-200 opacity-70'
                }`}>
                  {t.required
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-cyan-500 shrink-0 mt-0.5" />
                    : <XCircle className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 leading-tight">{t.type}</p>
                    {t.reason && <p className="text-[10px] text-slate-500 mt-0.5">{t.reason}</p>}
                  </div>
                  {t.required && <span className="text-[9px] font-bold text-cyan-700 bg-cyan-100 px-1.5 py-0.5 rounded shrink-0">Required</span>}
                </div>
              ))}
            </div>
          </PlanSection>
        )}

        {/* ── Documentation Recommendations ── */}
        {(decision.documentation_recommendations?.length ?? 0) > 0 && (
          <PlanSection title={`Documentation (${requiredDocs.length} required)`} icon={FileText} iconColor="text-emerald-500">
            <div className="space-y-1.5">
              {decision.documentation_recommendations.map((d, i) => (
                <div key={i} className={`flex items-start gap-2 p-2 rounded-lg border ${
                  d.required ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200 opacity-70'
                }`}>
                  {d.required
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    : <XCircle className="w-3.5 h-3.5 text-slate-300 shrink-0 mt-0.5" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 leading-tight">{d.type}</p>
                    {d.title && <p className="text-[10px] text-slate-500 font-mono mt-0.5">{d.title}</p>}
                  </div>
                  {d.required && <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded shrink-0">Required</span>}
                </div>
              ))}
            </div>
          </PlanSection>
        )}

        {/* ── Implementation Readiness ── */}
        {readiness && (
          <PlanSection title={`Implementation Readiness — ${readiness.percentage}%`} icon={ClipboardCheck} iconColor="text-violet-500">
            <div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-3">
                <div
                  className={`h-full rounded-full transition-all ${
                    readiness.percentage >= 80 ? 'bg-emerald-500' :
                    readiness.percentage >= 50 ? 'bg-amber-500' : 'bg-red-400'
                  }`}
                  style={{ width: `${readiness.percentage}%` }}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {readiness.items_complete?.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-wide mb-1.5">Complete</p>
                    <div className="space-y-1">
                      {readiness.items_complete.map(item => (
                        <div key={item} className="flex items-center gap-1.5">
                          <Check className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                          <span className="text-[10px] text-slate-600">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {readiness.items_outstanding?.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Outstanding</p>
                    <div className="space-y-1">
                      {readiness.items_outstanding.map(item => (
                        <div key={item} className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full border-2 border-slate-300 shrink-0" />
                          <span className="text-[10px] text-slate-500">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </PlanSection>
        )}

        {/* ── ECC Artefacts to create ── */}
        {artefactPlan && artefactPlan.length > 0 && (
          <PlanSection title={`ECC Artefacts to Create (${artefactPlan.length})`} icon={ListChecks} iconColor="text-amber-500" defaultOpen>
            <div className="space-y-2">
              {artefactPlan.map((item, i) => {
                const cfg = artefactTypeCfg(item.type);
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 border ${cfg.bg} ${cfg.color} ${cfg.border}`}>{cfg.label}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 leading-tight">{item.title}</p>
                      {item.reasoning && <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{item.reasoning}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </PlanSection>
        )}

        {/* ── Director Summary ── */}
        {ds && (
          <div className={`rounded-xl p-4 border-2 ${recCfg.bg} ${recCfg.border}`}>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/80 flex items-center justify-center shrink-0 shadow-sm">
                <Brain className={`w-4 h-4 ${recCfg.text}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <p className="text-xs font-black text-slate-800">Technical Director Recommendation</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${recCfg.badge}`}>{ds.recommendation}</span>
                  {ds.priority && (
                    <span className="text-[10px] font-bold text-slate-500">Priority {ds.priority}</span>
                  )}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed mb-2">{ds.reason}</p>
                <div className="flex flex-wrap gap-2 text-[10px] text-slate-500">
                  {ds.estimated_effort && (
                    <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{ds.estimated_effort}</span>
                  )}
                  {ds.suggested_phase && (
                    <span className="flex items-center gap-1"><Layers className="w-2.5 h-2.5" />{ds.suggested_phase}</span>
                  )}
                  {ds.suggested_release && (
                    <span className="flex items-center gap-1"><Rocket className="w-2.5 h-2.5" />{ds.suggested_release}</span>
                  )}
                </div>
                {ds.required_testing?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {ds.required_testing.map(t => (
                      <span key={t} className="text-[9px] bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded font-medium">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Engineering Review Package */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100 mt-1">
          <button
            onClick={() => {
              const pkg = buildReviewPackage(decision, artefactPlan);
              navigator.clipboard.writeText(pkg);
              setReviewCopied(true);
              setTimeout(() => setReviewCopied(false), 2500);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all font-medium"
          >
            {reviewCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {reviewCopied ? 'Review Package Copied' : 'Copy for External Review'}
          </button>
          <p className="text-[9px] text-slate-400">Engineering Review Package · Ready for external review</p>
        </div>

        {/* Send to ATD Workspace */}
        {conversationId && (
          <SendToATDPanel
            decision={decision}
            conversationId={conversationId}
            conversationTitle={conversationTitle ?? 'AI Technical Director Conversation'}
            userQuery={userQuery ?? decision.director_summary?.reason ?? decision.why_now ?? ''}
          />
        )}

      </div>
    </div>
  );
}

// ─── Artefact type display helpers ───────────────────────────────────────────

const ARTEFACT_TYPE_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  backlog_item:  { label: 'Backlog Item',  color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200' },
  goal:          { label: 'Goal',          color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  epic:          { label: 'Epic',          color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-200' },
  decision:      { label: 'Decision',      color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  documentation: { label: 'Spec Draft',   color: 'text-teal-700',    bg: 'bg-teal-50',    border: 'border-teal-200' },
  feature:       { label: 'Feature',       color: 'text-slate-700',   bg: 'bg-slate-100',  border: 'border-slate-300' },
};

function artefactTypeCfg(type: string) {
  return ARTEFACT_TYPE_CFG[type] ?? { label: type, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' };
}

// ─── Artefact Plan Card ───────────────────────────────────────────────────────

function ArtefactPlanCard({ plan }: { plan: ArtefactPlanItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const preview = plan.slice(0, 3);
  const rest = plan.slice(3);

  return (
    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/60 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2 bg-amber-50 border-b border-amber-200">
        <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
          <Lightbulb className="w-3.5 h-3.5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-amber-800">Engineering Artefacts to be Created</p>
          <p className="text-[10px] text-amber-600">{plan.length} artefact{plan.length !== 1 ? 's' : ''} will be recorded in ECC on approval</p>
        </div>
      </div>
      <div className="px-4 py-3 space-y-2">
        {preview.map((item, i) => {
          const cfg = artefactTypeCfg(item.type);
          return (
            <div key={i} className="flex items-start gap-2.5">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 border ${cfg.bg} ${cfg.color} ${cfg.border}`}>{cfg.label}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 leading-tight">{item.title}</p>
                {item.reasoning && <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{item.reasoning}</p>}
              </div>
            </div>
          );
        })}
        {rest.length > 0 && (
          <>
            {expanded && rest.map((item, i) => {
              const cfg = artefactTypeCfg(item.type);
              return (
                <div key={i + 3} className="flex items-start gap-2.5">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 border ${cfg.bg} ${cfg.color} ${cfg.border}`}>{cfg.label}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 leading-tight">{item.title}</p>
                    {item.reasoning && <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{item.reasoning}</p>}
                  </div>
                </div>
              );
            })}
            <button
              onClick={() => setExpanded(s => !s)}
              className="text-[10px] text-amber-600 hover:text-amber-800 font-medium flex items-center gap-1 transition-colors"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? 'Show less' : `Show ${rest.length} more`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Created Artefacts Panel ──────────────────────────────────────────────────

function CreatedArtefactsPanel({ created, skipped }: { created: CreatedArtefact[]; skipped: CreatedArtefact[] }) {
  const [showSkipped, setShowSkipped] = useState(false);

  return (
    <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2 bg-emerald-50 border-b border-emerald-200">
        <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
          <ListChecks className="w-3.5 h-3.5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-emerald-800">ECC Artefacts Created</p>
          <p className="text-[10px] text-emerald-600">
            {created.length} created{skipped.length > 0 ? ` · ${skipped.length} skipped (duplicate)` : ''}
          </p>
        </div>
      </div>
      <div className="px-4 py-3 space-y-2">
        {created.map((item, i) => {
          const cfg = artefactTypeCfg(item.type);
          return (
            <div key={i} className="flex items-start gap-2.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 border ${cfg.bg} ${cfg.color} ${cfg.border}`}>{cfg.label}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-800 leading-tight">{item.title}</p>
              </div>
            </div>
          );
        })}
        {skipped.length > 0 && (
          <>
            <button
              onClick={() => setShowSkipped(s => !s)}
              className="text-[10px] text-slate-400 hover:text-slate-600 font-medium flex items-center gap-1 transition-colors"
            >
              <SkipForward className="w-3 h-3" />
              {showSkipped ? 'Hide skipped' : `${skipped.length} skipped (duplicate)`}
            </button>
            {showSkipped && skipped.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 opacity-60">
                <XCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-600 leading-tight line-through">{item.title}</p>
                  {item.skip_reason && <p className="text-[10px] text-slate-400 mt-0.5">{item.skip_reason}</p>}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Approval Card ────────────────────────────────────────────────────────────

const RISK_CFG = {
  low:      { label: 'Low Risk',      bg: 'bg-emerald-50',  border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  medium:   { label: 'Medium Risk',   bg: 'bg-amber-50',    border: 'border-amber-200',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  high:     { label: 'High Risk',     bg: 'bg-orange-50',   border: 'border-orange-200',  text: 'text-orange-700',  dot: 'bg-orange-500' },
  critical: { label: 'Critical Risk', bg: 'bg-red-50',      border: 'border-red-200',     text: 'text-red-700',     dot: 'bg-red-500' },
};

function confidenceColor(score: number): string {
  if (score >= 85) return 'bg-emerald-500';
  if (score >= 70) return 'bg-amber-500';
  if (score >= 50) return 'bg-orange-500';
  return 'bg-red-500';
}

function ApprovalCard({ impl, approved, cancelled, onApprove, onCancel }: {
  impl: PendingImplementation;
  approved?: boolean;
  cancelled?: boolean;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Normalise dual field names from AI response
  const taskName       = impl.task ?? impl.task_name ?? 'Engineering Task';
  const confidence     = impl.confidence ?? impl.confidence_score ?? 80;
  const riskKey        = (impl.risk ?? impl.risk_level ?? 'medium') as keyof typeof RISK_CFG;
  const risk           = RISK_CFG[riskKey] ?? RISK_CFG.medium;
  const targetEnv      = impl.target ?? impl.target_environment ?? 'staging';

  const totalChanges = impl.changes?.length ?? 0;
  const isResolved = approved || cancelled;

  // Derive which engineering artefacts are implied by the change list
  const artefacts: { label: string; present: boolean }[] = [
    { label: 'Database Migration',        present: impl.affected_migrations?.length > 0 || impl.affected_db_tables?.length > 0 },
    { label: 'Edge Function',             present: impl.affected_edge_functions?.length > 0 },
    { label: 'Frontend Component',        present: impl.affected_components?.length > 0 || impl.changes?.some(c => /\.tsx?$/.test(c.file)) },
    { label: 'Feature Registry Update',  present: impl.affected_features?.length > 0 },
    { label: 'Implementation Spec',      present: impl.implementation_summary?.length > 60 },
    { label: 'Change Record',            present: true },
  ].filter(a => a.present);

  return (
    <div className={`mt-3 rounded-2xl border-2 overflow-hidden transition-all ${
      approved  ? 'border-emerald-300 bg-emerald-50/50' :
      cancelled ? 'border-slate-200 bg-slate-50 opacity-60' :
                  'border-blue-300 bg-white shadow-md'
    }`}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-start gap-3 ${
        approved ? 'bg-emerald-50' : cancelled ? 'bg-slate-50' : 'bg-blue-50/60'
      }`}>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
          approved ? 'bg-emerald-100' : cancelled ? 'bg-slate-100' : 'bg-blue-100'
        }`}>
          {approved ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> :
           cancelled ? <XCircle className="w-4 h-4 text-slate-400" /> :
           <ClipboardCheck className="w-4 h-4 text-blue-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold uppercase tracking-wide ${
              approved ? 'text-emerald-700' : cancelled ? 'text-slate-400' : 'text-blue-700'
            }`}>
              {approved ? 'Approved — Change Recorded' : cancelled ? 'Cancelled' : 'Awaiting Approval'}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${risk.bg} ${risk.border} ${risk.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${risk.dot}`} />
              {risk.label}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-900 mt-0.5">{taskName}</p>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Confidence bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Confidence</span>
            <span className={`text-xs font-bold ${
              confidence >= 85 ? 'text-emerald-600' :
              confidence >= 70 ? 'text-amber-600' :
              confidence >= 50 ? 'text-orange-600' : 'text-red-600'
            }`}>{confidence}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${confidenceColor(confidence)}`}
              style={{ width: `${confidence}%` }}
            />
          </div>
        </div>

        {/* AI Reasoning Summary */}
        {impl.confidence_reason && (
          <div className="bg-blue-50 rounded-xl p-3 border border-blue-200">
            <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <Brain className="w-3 h-3" /> Reasoning Summary
            </p>
            <p className="text-xs text-slate-700 leading-relaxed">{impl.confidence_reason}</p>
            {impl.evidence_used?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {impl.evidence_used.slice(0, 4).map(e => (
                  <span key={e} className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{e}</span>
                ))}
                {impl.evidence_used.length > 4 && <span className="text-[9px] text-blue-400">+{impl.evidence_used.length - 4} more</span>}
              </div>
            )}
          </div>
        )}

        {/* Engineering Artefacts Summary */}
        {artefacts.length > 0 && (
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Engineering Artefacts</p>
            <div className="space-y-1.5">
              {artefacts.map(({ label }) => (
                <div key={label} className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="text-xs text-slate-700">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="bg-slate-50 rounded-xl px-3 py-2 text-center border border-slate-200">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Clock className="w-3 h-3 text-slate-400" />
            </div>
            <p className="text-[10px] font-bold text-slate-700 truncate">{impl.estimated_time}</p>
            <p className="text-[9px] text-slate-400">Est. time</p>
          </div>
          <div className="bg-slate-50 rounded-xl px-3 py-2 text-center border border-slate-200">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <Server className="w-3 h-3 text-slate-400" />
            </div>
            <p className="text-[10px] font-bold text-slate-700 truncate">{targetEnv}</p>
            <p className="text-[9px] text-slate-400">Environment</p>
          </div>
          <div className={`rounded-xl px-3 py-2 text-center border ${impl.rollback_available ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <RotateCcw className={`w-3 h-3 ${impl.rollback_available ? 'text-emerald-500' : 'text-slate-400'}`} />
            </div>
            <p className={`text-[10px] font-bold ${impl.rollback_available ? 'text-emerald-700' : 'text-slate-500'}`}>
              {impl.rollback_available ? 'Available' : 'None'}
            </p>
            <p className="text-[9px] text-slate-400">Rollback</p>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Implementation Summary</p>
          <p className="text-xs text-slate-700 leading-relaxed">{impl.implementation_summary}</p>
        </div>

        {/* Affected areas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { label: 'Features',       items: impl.affected_features,       icon: Package,   color: 'text-blue-600' },
            { label: 'Components',     items: impl.affected_components,     icon: Code2,     color: 'text-amber-600' },
            { label: 'Edge Functions', items: impl.affected_edge_functions, icon: Zap,       color: 'text-orange-600' },
            { label: 'DB Tables',      items: impl.affected_db_tables,      icon: Database,  color: 'text-teal-600' },
          ].filter(({ items }) => items?.length).map(({ label, items, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-xl p-2.5 border border-slate-200">
              <div className="flex items-center gap-1 mb-1">
                <Icon className={`w-3 h-3 ${color}`} />
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">{label}</span>
                <span className="ml-auto text-[10px] font-bold text-slate-600">{items.length}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {items.slice(0, 3).map(item => (
                  <span key={item} className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">{item}</span>
                ))}
                {items.length > 3 && <span className="text-[9px] text-slate-400">+{items.length - 3}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Expand for changes list */}
        {totalChanges > 0 && (
          <button
            onClick={() => setExpanded(s => !s)}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <span className="font-medium">{totalChanges} planned change{totalChanges !== 1 ? 's' : ''}</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}

        {expanded && impl.changes?.length > 0 && (
          <div className="space-y-1.5">
            {impl.changes.map((change, i) => (
              <div key={i} className="flex items-start gap-2 bg-slate-50 rounded-lg p-2.5 border border-slate-200">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 mt-0.5 ${
                  change.type === 'create' ? 'bg-emerald-100 text-emerald-700' :
                  change.type === 'modify' ? 'bg-amber-100 text-amber-700' :
                  change.type === 'delete' ? 'bg-red-100 text-red-700' :
                  'bg-slate-100 text-slate-600'
                }`}>{change.type}</span>
                <div className="flex-1 min-w-0">
                  <code className="text-[10px] font-mono text-slate-700 truncate block">{change.file}</code>
                  <p className="text-[10px] text-slate-500 mt-0.5">{change.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        {!isResolved && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={onApprove}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              Approve & Apply
            </button>
            <button
              onClick={onCancel}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-red-300 hover:bg-red-50 text-slate-600 hover:text-red-600 text-sm font-medium rounded-xl transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Cancel
            </button>
          </div>
        )}

        {isResolved && (
          <div className={`flex items-center gap-2 py-2 px-3 rounded-xl text-xs font-medium ${
            approved ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
            'bg-slate-100 text-slate-500 border border-slate-200'
          }`}>
            {approved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            {approved ? 'Changes approved and recorded in history' : 'Request cancelled — no changes made'}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Change Record Banner ─────────────────────────────────────────────────────

function ChangeRecordBanner({ changeRef }: { changeRef: string }) {
  return (
    <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
      <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
      <p className="text-xs text-emerald-700">
        Change record saved: <code className="font-mono font-bold">{changeRef}</code>
      </p>
    </div>
  );
}

// ─── Suggested actions ────────────────────────────────────────────────────────

function SuggestedActions({ actions, onSelect }: { actions: string[]; onSelect: (a: string) => void }) {
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={() => onSelect(action)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all font-medium"
        >
          <ArrowRight className="w-3 h-3 shrink-0" />
          {action}
        </button>
      ))}
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message, onCopy, onSelectAction, onApprove, onCancel, conversationId, conversationTitle, userQuery }: {
  message: Message;
  onCopy: (text: string) => void;
  onSelectAction: (a: string) => void;
  onApprove?: () => void;
  onCancel?: () => void;
  conversationId?: string;
  conversationTitle?: string;
  userQuery?: string;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    onCopy(message.content);
    setTimeout(() => setCopied(false), 2000);
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.isStreaming) {
    return (
      <div className="flex gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center shrink-0 shadow-sm">
          <Brain className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs">Analysing product data…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 mb-4 group">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
        <Brain className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        {message.content && (
          <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
            <MarkdownContent content={message.content} />
          </div>
        )}
        <div className="flex items-center gap-2 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={copy}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        {message.engineering_decision ? (
          <EngineeringPlanCard
            decision={message.engineering_decision}
            artefactPlan={message.artefact_plan}
            conversationId={conversationId}
            conversationTitle={conversationTitle}
            userQuery={userQuery}
          />
        ) : (
          message.artefact_plan && message.artefact_plan.length > 0 && !message.created_artefacts && (
            <ArtefactPlanCard plan={message.artefact_plan} />
          )
        )}
        {message.pending_implementation && onApprove && onCancel && (
          <ApprovalCard
            impl={message.pending_implementation}
            approved={message.approved}
            cancelled={message.cancelled}
            onApprove={onApprove}
            onCancel={onCancel}
          />
        )}
        {message.created_artefacts && message.created_artefacts.length > 0 && (
          <CreatedArtefactsPanel
            created={message.created_artefacts}
            skipped={message.skipped_artefacts ?? []}
          />
        )}
        {message.change_record_id && (
          <ChangeRecordBanner changeRef={message.change_record_id} />
        )}
        {message.suggested && message.suggested.length > 0 && !message.pending_implementation && (
          <SuggestedActions actions={message.suggested} onSelect={onSelectAction} />
        )}
      </div>
    </div>
  );
}

// ─── Mode selector (compact dropdown) ────────────────────────────────────────

function ModeSelector({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const [open, setOpen] = useState(false);
  const current = MODES.find(m => m.key === mode) ?? MODES[0];
  const Icon = current.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(s => !s)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all hover:opacity-90 ${current.bg} ${current.color} ${current.border}`}
        title={current.desc}
      >
        <Icon className="w-3 h-3" />
        Mode: {current.label}
        <ChevronDown className="w-2.5 h-2.5 opacity-70" />
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">AI Mode</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Choose how the AI responds to your request</p>
          </div>
          <div className="p-1.5 space-y-0.5 max-h-72 overflow-y-auto">
            {MODES.map(m => {
              const MIcon = m.icon;
              return (
                <button
                  key={m.key}
                  onClick={() => { onChange(m.key); setOpen(false); }}
                  className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all ${
                    mode === m.key ? `${m.bg} ${m.border} border` : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${m.bg} border ${m.border}`}>
                    <MIcon className={`w-3 h-3 ${m.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold leading-tight ${mode === m.key ? m.color : 'text-slate-800'}`}>{m.label}</p>
                    <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{m.desc}</p>
                  </div>
                  {mode === m.key && <Check className={`w-3.5 h-3.5 shrink-0 mt-1 ml-auto ${m.color}`} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Prompt Grid ──────────────────────────────────────────────────────────────

function PromptGrid({ prompts, onSelect }: { prompts: FavouritePrompt[]; onSelect: (prompt: string) => void }) {
  const [activeCategory, setActiveCategory] = useState('product');

  const grouped = prompts.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {} as Record<string, FavouritePrompt[]>);

  const categories = Object.keys(CATEGORY_CFG).filter(k => grouped[k]?.length);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex gap-1 flex-wrap px-4 pt-4 pb-3 border-b border-slate-100">
        {categories.map(cat => {
          const cfg = CATEGORY_CFG[cat];
          const Icon = cfg.icon;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                activeCategory === cat
                  ? `${cfg.bg} ${cfg.color} border-current`
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              <Icon className="w-3 h-3" />
              {cfg.label}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-2">
          {(grouped[activeCategory] ?? []).sort((a, b) => a.position - b.position).map(p => {
            const cfg = CATEGORY_CFG[p.category] ?? CATEGORY_CFG.general;
            const Icon = cfg.icon;
            return (
              <button
                key={p.id}
                onClick={() => onSelect(p.prompt)}
                className="w-full text-left p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/30 transition-all group"
              >
                <div className="flex items-start gap-2.5">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${cfg.bg}`}>
                    <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">{p.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{p.prompt.slice(0, 80)}…</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400 shrink-0 mt-0.5 transition-colors" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── No API Key ───────────────────────────────────────────────────────────────

function NoAPIKeyBanner() {
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Settings className="w-8 h-8 text-amber-500" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-2">AI Not Configured</h3>
        <p className="text-sm text-slate-500 leading-relaxed mb-4">
          To use the Engineering AI, add an LLM API key in the platform settings.
          Supports any OpenAI-compatible provider (GPT-4o, Claude via proxy) or a direct Anthropic API key.
        </p>
        <div className="bg-slate-50 rounded-xl p-4 text-left border border-slate-200">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Configure in Settings</p>
          <p className="text-xs text-slate-500">Admin Portal → Settings → AI Configuration → LLM API Key</p>
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onSelectPrompt, stats }: { onSelectPrompt: (p: string, m?: Mode) => void; stats: ContextStats | null }) {
  const capabilities = [
    {
      label: 'I have an idea...',
      icon: Sparkles,
      color: 'text-violet-600', bg: 'bg-violet-50',
      prompt: 'I have an idea — I want to add a feature that sends automated reminder emails to candidates who haven\'t completed their assessment after 48 hours.',
      mode: 'build' as Mode,
    },
    {
      label: 'I found a bug...',
      icon: Zap,
      color: 'text-red-600', bg: 'bg-red-50',
      prompt: 'I found a bug — candidates who complete an assessment on mobile are not having their results saved correctly. The issue appears to be in the submission flow.',
      mode: 'impact' as Mode,
    },
    {
      label: 'Build a new feature...',
      icon: Code2,
      color: 'text-blue-600', bg: 'bg-blue-50',
      prompt: 'Generate a full implementation plan for adding bulk candidate import from CSV, including database migrations, edge functions, and frontend components.',
      mode: 'build' as Mode,
    },
    {
      label: 'Create an Engineering Specification...',
      icon: FileText,
      color: 'text-emerald-600', bg: 'bg-emerald-50',
      prompt: 'Create a detailed Engineering Specification for the aXcelerate writeback queue, documenting architecture decisions, data flows, error handling, and rollback procedures.',
      mode: 'docs' as Mode,
    },
    {
      label: 'Review this architecture...',
      icon: GitBranch,
      color: 'text-slate-600', bg: 'bg-slate-100',
      prompt: 'Review the current architecture of the assessment engine. Identify any risks, bottlenecks, or areas that may not scale well as candidate volume grows.',
      mode: 'ask' as Mode,
    },
    {
      label: 'Prepare the next Bolt implementation prompt...',
      icon: Rocket,
      color: 'text-amber-600', bg: 'bg-amber-50',
      prompt: 'Based on the current platform state and the active development programme, prepare a complete, self-contained Bolt implementation prompt for the next highest-priority engineering task.',
      mode: 'build' as Mode,
    },
    {
      label: 'Create a Test Plan...',
      icon: TestTube2,
      color: 'text-cyan-600', bg: 'bg-cyan-50',
      prompt: 'Generate a comprehensive test plan for the billing and subscription features, including test suites, individual test cases, and acceptance criteria.',
      mode: 'test' as Mode,
    },
    {
      label: 'Analyse the impact of this change...',
      icon: Search,
      color: 'text-teal-600', bg: 'bg-teal-50',
      prompt: 'What is the full impact of modifying the assessment_responses table to add a section_id column? Identify all affected features, edge functions, database tables, and frontend components.',
      mode: 'impact' as Mode,
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex flex-col items-center pt-10 pb-6 px-6">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-teal-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
          <Brain className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">AI Technical Director</h2>
        <p className="text-sm text-slate-600 text-center max-w-lg mb-3 leading-relaxed">
          The AI Technical Director helps manage the engineering lifecycle of the LLND Automate platform.
          Describe ideas in natural language and the AI will analyse them, prepare implementation plans,
          create engineering artefacts, recommend testing, and generate Bolt implementation prompts when appropriate.
        </p>

        {/* Context stats */}
        {stats && (
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {[
              { icon: Package,  label: `${stats.total ?? '—'} features`,    color: 'text-blue-600 bg-blue-50 border-blue-200' },
              { icon: Target,   label: `${stats.goals ?? '—'} goals`,        color: 'text-slate-600 bg-slate-50 border-slate-200' },
              { icon: Layers,   label: `${stats.epics ?? '—'} epics`,         color: 'text-violet-600 bg-violet-50 border-violet-200' },
              { icon: Map,      label: `${stats.backlogTotal ?? '—'} backlog`, color: 'text-teal-600 bg-teal-50 border-teal-200' },
              { icon: Database, label: `${stats.relationships ?? '—'} deps`,  color: 'text-amber-600 bg-amber-50 border-amber-200' },
            ].map(({ icon: Icon, label, color }) => (
              <span key={label} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
                <Icon className="w-3 h-3" />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="px-6 pb-8">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 text-center">What would you like to do?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
          {capabilities.map(({ label, icon: Icon, color, bg, prompt, mode }) => (
            <button
              key={label}
              onClick={() => onSelectPrompt(prompt, mode)}
              className="flex items-center gap-2.5 p-3 bg-white border border-slate-200 rounded-xl text-left hover:border-blue-300 hover:bg-blue-50/40 transition-all group"
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <span className="text-xs font-medium text-slate-700 group-hover:text-blue-700 transition-colors leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Header inline title rename ───────────────────────────────────────────────

function HeaderTitle({ conv, onRename }: { conv: Conversation; onRename: (id: string, title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(conv.title);
  const ref                   = useRef<HTMLInputElement>(null);

  function start() { setDraft(conv.title); setEditing(true); setTimeout(() => ref.current?.select(), 20); }

  function commit() {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== conv.title) onRename(conv.id, trimmed);
    else setDraft(conv.title);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { setEditing(false); setDraft(conv.title); }
  }

  if (editing) {
    return (
      <input
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        className="text-sm font-semibold text-slate-800 bg-white border border-blue-300 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-blue-400 w-full max-w-xs"
      />
    );
  }

  return (
    <button onClick={start} className="flex items-center gap-1.5 group/title max-w-xs text-left" title="Click to rename">
      <h2 className="text-sm font-semibold text-slate-800 truncate">{conv.title}</h2>
      <Pencil className="w-3 h-3 text-slate-300 group-hover/title:text-slate-500 shrink-0 transition-colors" />
    </button>
  );
}

// ─── Completed conversations section ─────────────────────────────────────────

function CompletedSection({ convs, activeConvId, onSelect, onDelete, onPin, onRename, onComplete, onReopen }: {
  convs: Conversation[];
  activeConvId: string | null;
  onSelect: (c: Conversation) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onPin: (id: string, pinned: boolean, e: React.MouseEvent) => void;
  onRename: (id: string, title: string) => void;
  onComplete: (id: string, e: React.MouseEvent) => void;
  onReopen: (id: string, e: React.MouseEvent) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="px-3 mt-3 border-t border-slate-100 pt-2">
      <button
        onClick={() => setOpen(s => !s)}
        className="w-full flex items-center justify-between px-1 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors"
      >
        <span>Completed ({convs.length})</span>
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && convs.map(c => (
        <ConvItem
          key={c.id}
          conv={c}
          active={activeConvId === c.id}
          onSelect={onSelect}
          onDelete={onDelete}
          onPin={onPin}
          onRename={onRename}
          onComplete={onComplete}
          onReopen={onReopen}
        />
      ))}
    </div>
  );
}

// ─── Conversation item ────────────────────────────────────────────────────────

function ConvItem({ conv, active, onSelect, onDelete, onPin, onRename, onComplete, onReopen }: {
  conv: Conversation;
  active: boolean;
  onSelect: (c: Conversation) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onPin: (id: string, pinned: boolean, e: React.MouseEvent) => void;
  onRename: (id: string, title: string) => void;
  onComplete: (id: string, e: React.MouseEvent) => void;
  onReopen: (id: string, e: React.MouseEvent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(conv.title);
  const inputRef              = useRef<HTMLInputElement>(null);

  const typeLabelMap: Record<string, string> = {
    ask: 'Ask', build: 'Build', impact: 'Impact', search: 'Search',
    docs: 'Docs', test: 'Test Plan', audit: 'Compliance', recommend: 'Recommend',
  };
  const typeLabel = typeLabelMap[conv.context_type] ?? conv.context_type ?? 'General';
  const isCompleted = conv.status === 'completed';

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(conv.title);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 20);
  }

  function commitRename(e?: React.FocusEvent | React.KeyboardEvent) {
    e?.stopPropagation?.();
    const trimmed = draft.trim();
    if (!trimmed) { setEditing(false); setDraft(conv.title); return; }
    setEditing(false);
    if (trimmed !== conv.title) onRename(conv.id, trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter')  { e.preventDefault(); commitRename(e); }
    if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setDraft(conv.title); }
  }

  return (
    <button
      onClick={() => !editing && onSelect(conv)}
      className={`w-full text-left px-2 py-2 rounded-xl mb-0.5 group transition-all ${
        active ? 'bg-blue-50 border border-blue-200' : isCompleted ? 'hover:bg-slate-50 opacity-70' : 'hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start gap-2">
        <MessageSquare className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${active ? 'text-blue-500' : isCompleted ? 'text-slate-300' : 'text-slate-400'}`} />
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={handleKeyDown}
              onClick={e => e.stopPropagation()}
              className="w-full text-xs font-medium text-slate-800 bg-white border border-blue-300 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-400"
            />
          ) : (
            <p className={`text-xs font-medium truncate ${active ? 'text-blue-800' : isCompleted ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
              {conv.title}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[9px] text-slate-400">{fmtDate(conv.updated_at)}</span>
            <span className="text-[9px] text-slate-300">·</span>
            <span className="text-[9px] font-medium text-slate-400 bg-slate-100 px-1.5 rounded">{typeLabel}</span>
            {isCompleted && <span className="text-[9px] font-medium text-emerald-600 bg-emerald-50 px-1.5 rounded">Done</span>}
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {!isCompleted && (
            <>
              <button onClick={startEdit} className="p-1.5 rounded text-slate-400 hover:text-blue-500" title="Rename">
                <Pencil className="w-3 h-3" />
              </button>
              <button onClick={e => onPin(conv.id, conv.pinned, e)} className={`p-1.5 rounded ${conv.pinned ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'}`} title={conv.pinned ? 'Unpin' : 'Pin'}>
                <Pin className="w-3 h-3" />
              </button>
              <button onClick={e => onComplete(conv.id, e)} className="p-1.5 rounded text-slate-400 hover:text-emerald-600" title="Mark as completed">
                <CheckSquare className="w-3 h-3" />
              </button>
            </>
          )}
          {isCompleted && (
            <button onClick={e => onReopen(conv.id, e)} className="p-1.5 rounded text-slate-400 hover:text-blue-500" title="Reopen conversation">
              <RefreshCw className="w-3 h-3" />
            </button>
          )}
          <button onClick={e => onDelete(conv.id, e)} className="p-1.5 rounded text-slate-400 hover:text-red-500" title="Delete">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function CCAIProductManagerPage({ onNavigate }: { onNavigate?: (section: string) => void } = {}) {
  const [conversations,   setConversations]   = useState<Conversation[]>([]);
  const [activeConvId,    setActiveConvId]     = useState<string | null>(null);
  const [messages,        setMessages]         = useState<Message[]>([]);
  const [input,           setInput]            = useState('');
  const [mode,            setMode]             = useState<Mode>('ask');
  const [aiRole,          setAiRole]           = useState<AIRole>('auto');
  const [loading,         setLoading]          = useState(false);
  const [loadingConvs,    setLoadingConvs]     = useState(true);
  const [favourites,      setFavourites]       = useState<FavouritePrompt[]>([]);
  const [showPrompts,     setShowPrompts]      = useState(false);
  const [convSearch,      setConvSearch]       = useState('');
  const [noApiKey,        setNoApiKey]         = useState(false);
  const [copiedText,      setCopiedText]       = useState('');
  const [contextStats,    setContextStats]     = useState<ContextStats | null>(null);
  const [sidebarOpen,     setSidebarOpen]      = useState(false);
  const [panelCollapsed,  setPanelCollapsed]   = useState<boolean>(() => {
    try { return localStorage.getItem('ecc_panel_collapsed') === 'true'; } catch { return false; }
  });
  const [lastSelectedRoles, setLastSelectedRoles] = useState<string[]>([]);

  // Conversation Intelligence state
  const [convIntelligence, setConvIntelligence] = useState<ConversationIntelligence | null>(null);
  const [indexingConv, setIndexingConv] = useState(false);

  // EWO-011.4: Linked intent banner — loaded when conversation changes
  const [linkedIntentLink, setLinkedIntentLink] = useState<ConversationIntentLink | null>(null);
  const [linkedIntentHasPlan, setLinkedIntentHasPlan] = useState(false);

  // Health Analysis state
  const [analyzingConvs,    setAnalyzingConvs]    = useState(false);
  const [healthReview,      setHealthReview]      = useState<HealthReviewResult | null>(null);
  const [showHealthReview,  setShowHealthReview]  = useState(false);
  const [savedReviews,      setSavedReviews]      = useState<SavedHealthReview[]>([]);
  const [showReviewHistory, setShowReviewHistory] = useState(false);

  const messagesEndRef  = useRef<HTMLDivElement>(null);
  const inputRef        = useRef<HTMLTextAreaElement>(null);

  function togglePanel() {
    setPanelCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('ecc_panel_collapsed', String(next)); } catch { /* */ }
      return next;
    });
  }

  useEffect(() => { loadConversations(); loadFavourites(); loadSavedReviews(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // EWO-033R.4 Correction 3: Restore the exact active conversation on page load (refresh, sign-out/sign-in).
  // The Product Owner should return directly to where they were working, not Mission Control.
  useEffect(() => {
    const stored = sessionStorage.getItem('ecc_active_conv_id');
    if (!stored) return;
    (async () => {
      // Wait for conversations to load
      const { data } = await supabase
        .from('cc_ai_conversations')
        .select('*')
        .eq('id', stored)
        .maybeSingle();
      if (data) {
        await selectConversation(data as Conversation, { isPageRestore: true });
      }
    })();
  }, []);

  // EWO-033R.2: Resume an engineering interaction from the workspace
  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/[?&]resumeIdea=([^&]+)/);
    if (!match) return;
    const ideaId = decodeURIComponent(match[1]);
    // Clear the parameter so it doesn't re-trigger
    window.location.hash = '#/engineering/mission-control';
    // Create a new conversation and resume the interaction
    (async () => {
      await newConversation();
      // Small delay to let the conversation be created
      setTimeout(async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const userId = session?.user?.id;
          const result = await InteractionResumeService.resumeInteraction(ideaId);
          const { message } = await InteractionChannelAdapter.resumeInteraction(ideaId);
          setMessages(prev => [...prev, message as Message]);
        } catch (err) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `I couldn't resume this engineering interaction: ${err instanceof Error ? err.message : 'Unknown error'}.`,
          }]);
        }
      }, 200);
    })();
  }, []);

  // EWO-011.4: Load linked intent whenever conversation changes
  useEffect(() => {
    setLinkedIntentLink(null);
    setLinkedIntentHasPlan(false);
    if (!activeConvId) return;
    getExistingLink(activeConvId).then(async link => {
      if (!link) return;
      setLinkedIntentLink(link);
      const data = await ATDCognitiveEngine.getIntentWithPipeline(link.intent_id);
      setLinkedIntentHasPlan(!!data?.plan);
    }).catch(() => {});
  }, [activeConvId]);

  async function loadConversations() {
    setLoadingConvs(true);
    const { data } = await supabase
      .from('cc_ai_conversations')
      .select('*')
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false });
    setConversations(data ?? []);
    setLoadingConvs(false);
  }

  async function loadFavourites() {
    const { data } = await supabase
      .from('cc_ai_favourite_prompts')
      .select('*')
      .order('category')
      .order('position');
    setFavourites(data ?? []);
  }

  async function loadMessagesRaw(convId: string): Promise<Message[]> {
    const { data } = await supabase
      .from('cc_ai_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at');
    return (data ?? []).map(m => ({
      id: m.id,
      role: m.role as Message['role'],
      content: m.content,
      suggested: m.metadata?.suggested ?? [],
      engineering_decision: m.metadata?.engineering_decision ?? undefined,
      pending_implementation: m.metadata?.pending_implementation ?? undefined,
      artefact_plan: m.metadata?.artefact_plan ?? undefined,
      created_artefacts: m.metadata?.created_artefacts ?? undefined,
      skipped_artefacts: m.metadata?.skipped_artefacts ?? undefined,
      change_record_id: m.metadata?.change_record_id ?? undefined,
      selected_roles: m.metadata?.selected_roles ?? undefined,
      ai_role: m.metadata?.ai_role ?? undefined,
      approved: !!(m.metadata?.change_record_id),
      runtime_diagnostic_envelope: m.metadata?.runtime_diagnostic_envelope ?? undefined,
      engineering_interaction: m.metadata?.engineering_interaction ?? undefined,
    }));
  }

  async function loadMessages(convId: string) {
    const msgs = await loadMessagesRaw(convId);
    setMessages(msgs);
  }

  async function selectConversation(conv: Conversation, options?: { isPageRestore?: boolean }) {
    setActiveConvId(conv.id);
    sessionStorage.setItem('ecc_active_conv_id', conv.id);
    setShowPrompts(false);
    setConvIntelligence(null);
    await loadMessages(conv.id);
    // Load existing intelligence for this conversation (non-blocking)
    loadConversationIntelligence(conv.id).then(ci => {
      if (ci) setConvIntelligence(ci);
    });

    // EWO-033R.4 Correction 3: Resume is ONLY attempted on page restore (refresh,
    // sign-out/sign-in). During normal conversation switching the live messages
    // already contain the active interaction card — appending a resume card would
    // duplicate or contradict the live state.
    if (!options?.isPageRestore) return;

    // EWO-033R.4 Correction 3: Even on page restore, do NOT append a resume card
    // if the loaded messages already contain an active engineering interaction.
    // The persisted transcript is the single source of truth.
    const hasExistingInteraction = (await loadMessagesRaw(conv.id)).some(
      m => m.engineering_interaction && m.engineering_interaction.card && typeof m.engineering_interaction.card.type === 'string',
    );
    if (hasExistingInteraction) return;

    // EWO-033R.4: Attempt to resume an in-flight engineering interaction
    // from the canonical conversation association. This restores the
    // correct interaction card after browser refresh, sign-out, etc.
    try {
      const mod = await import('../../lib/interactionChannelAdapter');
      // EWO-033R.4 Correction 5: Use the adapter's canonical resumeFromConversation
      // which builds proper InteractionCards with real data — never placeholders.
      const resumeResult = await mod.InteractionChannelAdapter.resumeFromConversation(conv.id);
      if (resumeResult && resumeResult.interactionCard) {
        setMessages(prev => [...prev, {
          role: 'assistant' as const,
          content: 'Welcome back. I\'ve restored your engineering interaction.',
          engineering_interaction: {
            card: resumeResult.interactionCard!,
            ideaId: resumeResult.supportingRecords.ideaId,
            proposalId: resumeResult.supportingRecords.proposalId,
            ewoRef: resumeResult.supportingRecords.ewoRef,
            ewoId: resumeResult.supportingRecords.ewoId,
          } as EngineeringInteractionState,
        }]);
      }
    } catch {
      // Resume is best-effort — don't block conversation loading
    }
  }

  async function handleIndexConversation() {
    const activeConv = conversations.find(c => c.id === activeConvId);
    if (!activeConv || messages.length < 2) return;
    setIndexingConv(true);
    try {
      const msgs = messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      const ci = await indexConversation(activeConv.id, activeConv.title, msgs);
      setConvIntelligence(ci);
    } finally {
      setIndexingConv(false);
    }
  }

  async function newConversation(initialPrompt?: string, initialMode?: Mode) {
    const { data } = await supabase
      .from('cc_ai_conversations')
      .insert({ title: initialPrompt ? generateConvTitle(initialPrompt) : 'New Conversation', context_type: initialMode ?? mode })
      .select()
      .single();
    if (!data) return;
    setConversations(prev => [data, ...prev]);
    setActiveConvId(data.id);
    setMessages([]);
    setShowPrompts(false);
    if (initialMode) setMode(initialMode);
    if (initialPrompt) {
      setTimeout(() => sendMessage(initialPrompt, data.id, initialMode ?? mode), 100);
    }
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from('cc_ai_conversations').delete().eq('id', id);
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConvId === id) { setActiveConvId(null); setMessages([]); setConvIntelligence(null); }
  }

  async function togglePin(id: string, pinned: boolean, e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from('cc_ai_conversations').update({ pinned: !pinned }).eq('id', id);
    setConversations(prev => prev.map(c => c.id === id ? { ...c, pinned: !pinned } : c));
  }

  async function renameConversation(id: string, title: string) {
    await supabase.from('cc_ai_conversations').update({ title, updated_at: new Date().toISOString() }).eq('id', id);
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c));
  }

  async function completeConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const now = new Date().toISOString();
    await supabase.from('cc_ai_conversations').update({ status: 'completed', completed_at: now, updated_at: now }).eq('id', id);
    setConversations(prev => prev.map(c => c.id === id ? { ...c, status: 'completed', completed_at: now } : c));
    if (activeConvId === id) { setActiveConvId(null); setMessages([]); }
  }

  async function reopenConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const now = new Date().toISOString();
    await supabase.from('cc_ai_conversations').update({ status: 'active', reopened_at: now, updated_at: now }).eq('id', id);
    setConversations(prev => prev.map(c => c.id === id ? { ...c, status: 'active', reopened_at: now } : c));
  }

  async function loadSavedReviews() {
    const { data } = await supabase
      .from('ecc_conversation_health_reviews')
      .select('id, run_at, total_analysed, auto_completed_count, remaining_active, flagged_for_review, orphaned, unclear_titles, duplicate_pairs, summary, recommendations')
      .order('run_at', { ascending: false })
      .limit(10);
    setSavedReviews(data ?? []);
  }

  async function runHealthAnalysis() {
    setAnalyzingConvs(true);
    setHealthReview(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-conversations`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);

      setHealthReview(result);
      setShowHealthReview(true);
      // Reload conversations to reflect auto-completed ones
      await loadConversations();
      await loadSavedReviews();
    } catch (err) {
      setHealthReview({
        review_id: null,
        summary: err instanceof Error ? err.message : 'Analysis failed.',
        stats: { total_analysed: 0, auto_completed: 0, remaining_active: 0, flagged_for_review: 0, orphaned: 0, unclear_titles: 0, duplicate_pairs: 0 },
        recommendations: [],
      });
      setShowHealthReview(true);
    } finally {
      setAnalyzingConvs(false);
    }
  }

  // EWO-033R.2: Detect engineering idea messages
  function isEngineeringIdeaMessage(text: string): boolean {
    const lower = text.toLowerCase().trim();
    if (lower.length < 10) return false;
    const patterns = [
      /\bi have an idea\b/,
      /\bi want to (add|build|create|implement|improve|fix|change)\b/,
      /\bi need to (add|build|create|implement|improve|fix|change)\b/,
      /\bwe should (add|build|create|implement|improve|fix|change)\b/,
      /\blet'?s (add|build|create|implement|improve|fix|change)\b/,
      /\bcan we (add|build|create|implement|improve|fix|change)\b/,
      /\bi'?d like to (add|build|create|implement|improve|fix|change)\b/,
    ];
    return patterns.some(p => p.test(lower));
  }

  // EWO-033R.2: Find the last message with an engineering interaction
  function findLastInteraction(msgs: Message[]): EngineeringInteractionState | null {
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].engineering_interaction) return msgs[i].engineering_interaction!;
    }
    return null;
  }

  // EWO-033R.2: Handle proposal approval
  async function handleInteractionApprove(msgIndex: number) {
    const interaction = messages[msgIndex]?.engineering_interaction;
    if (!interaction?.proposalId) return;
    setMessages(prev => prev.map((m, i) =>
      i === msgIndex && m.engineering_interaction
        ? { ...m, engineering_interaction: { ...m.engineering_interaction, busy: true } }
        : m
    ));
    sendMessage('Approve');
  }

  // EWO-033R.2: Handle proposal cancel
  async function handleInteractionCancel(msgIndex: number) {
    sendMessage('Cancel');
  }

  // EWO-033R.2: Handle execution launch
  async function handleInteractionExecute(msgIndex: number) {
    // EWO-033R.4 Correction 7: Ensure ewoId is available before sending Execute.
    // The ewoId should already be in the message's engineering_interaction metadata
    // (stored when the Execution Ready card was created). sendMessage reads it
    // via findLastInteraction. No additional action needed here — the metadata
    // persistence fix ensures ewoId survives refresh and resume.
    sendMessage('Execute');
  }

  // EWO-033R.2: Handle execution not yet
  async function handleInteractionNotYet(msgIndex: number) {
    sendMessage('Not yet');
  }

  // EWO-033R.2: Handle completion accept
  async function handleInteractionAccept(msgIndex: number) {
    sendMessage('Accept');
  }

  // EWO-033R.2: Handle completion reject
  async function handleInteractionReject(msgIndex: number) {
    sendMessage('Reject');
  }

  // EWO-033R.2: Handle completion request refinement
  async function handleInteractionRefinement(msgIndex: number) {
    sendMessage('Request refinement');
  }

  const sendMessage = useCallback(async (text: string, convId?: string, messageMode?: Mode) => {
    const targetConvId = convId ?? activeConvId;
    const targetMode = messageMode ?? mode;
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    // EWO-033R.2: Intercept engineering ideas and route through the
    // InteractionChannelAdapter instead of the legacy edge function flow.
    const isEngIdea = isEngineeringIdeaMessage(trimmed);
    const lastInteraction = findLastInteraction(messages);
    const isInteractionResponse = lastInteraction && (
      /^(approve|approved|proceed|go ahead|looks good|let'?s do it|execute|run|start|launch|begin|accept|accepted|ship it|well done)\b/i.test(trimmed) ||
      /^(reject|rejected|cancel|abort|no)\b/i.test(trimmed) ||
      /^(changes|change|modify|update|adjust|refine|different|reduce|narrow|trim|expand|broaden|ignore|exclude|skip|include|add|also|deploy|deployment|github|gitlab|split|separate|priority|urgent|critical|approach|strategy)\b/i.test(trimmed) ||
      trimmed === '%%APPROVE%%' || trimmed === '%%CANCEL%%'
    );

    if (isEngIdea || (isInteractionResponse && lastInteraction)) {
      setInput('');
      setLoading(true);
      const userMsg: Message = { role: 'user', content: trimmed };
      const streamingMsg: Message = { role: 'assistant', content: '', isStreaming: true };
      const newMessages = [...messages, userMsg];
      setMessages([...newMessages, streamingMsg]);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;

        // EWO-033R.4 Correction 4: Live preparation progress — update the
        // preparing_execution card in real-time as each phase completes.
        const preparationStartTime = Date.now();
        const onPreparationProgress: import('../../lib/interactionChannelAdapter').PreparationProgressCallback = (phases) => {
          setMessages(prev => {
            // Find the last preparing_execution card and update it
            const newMsgs = [...prev];
            for (let i = newMsgs.length - 1; i >= 0; i--) {
              const inter = newMsgs[i].engineering_interaction;
              if (inter?.card?.type === 'preparing_execution') {
                newMsgs[i] = {
                  ...newMsgs[i],
                  engineering_interaction: {
                    ...inter,
                    card: {
                      ...inter.card,
                      phases,
                      elapsedMs: Date.now() - preparationStartTime,
                    },
                  },
                };
                break;
              }
            }
            return newMsgs;
          });
        };

        const result = await InteractionChannelAdapter.processMessage(trimmed, {
          userId,
          ideaId: lastInteraction?.ideaId,
          proposalId: lastInteraction?.proposalId,
          ewoId: lastInteraction?.ewoId,
          conversationId: targetConvId ?? undefined,
        }, { onPreparationProgress });

        // Replace streaming message with the interaction response
        const interactionMsgs: Message[] = result.messages.map((m, idx) => {
          const isLast = idx === result.messages.length - 1;
          const interactionCard = isLast ? m.interactionCard : undefined;
          return {
            role: m.role as Message['role'],
            content: m.content,
            engineering_interaction: interactionCard
              ? {
                  card: interactionCard,
                  ideaId: result.ideaId ?? lastInteraction?.ideaId,
                  proposalId: result.proposalId ?? lastInteraction?.proposalId,
                  ewoId: result.ewoId ?? lastInteraction?.ewoId,
                  ewoRef: result.ewoRef ?? lastInteraction?.ewoRef,
                }
              : undefined,
          };
        });

        setMessages([...newMessages, ...interactionMsgs]);

        // EWO-033R.4 Correction 3: Persist interaction messages to the database so the
        // full transcript (including engineering_interaction metadata) survives refresh.
        if (targetConvId) {
          const rowsToInsert = [userMsg, ...interactionMsgs].map(m => ({
            conversation_id: targetConvId,
            role: m.role,
            content: m.content ?? '',
            metadata: {
              engineering_interaction: m.engineering_interaction ?? undefined,
            },
          }));
          await supabase.from('cc_ai_messages').insert(rowsToInsert);
        }
      } catch (err) {
        setMessages([...newMessages, {
          role: 'assistant',
          content: `I encountered an issue: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
        }]);
      } finally {
        setLoading(false);
      }
      return;
    }

    setInput('');
    setLoading(true);
    setNoApiKey(false);

    const userMsg: Message = { role: 'user', content: trimmed };
    const streamingMsg: Message = { role: 'assistant', content: '', isStreaming: true };
    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, streamingMsg]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      // EWO-016R.Y.1 Req 2 — Diagnostic follow-up envelope continuity.
      // Detect if this message is a diagnostic follow-up and bind to the
      // most recent governed assistant message's runtime diagnostic envelope.
      const isDiagnosticFollowup = /\b(which|what)\s+(tables?|services?|records?|pipeline|queries?)\s+(did\s+you|were|actually|you|have\s+you|ran)\b/i.test(trimmed) ||
        /\b(how\s+did\s+you|why\s+did\s+you|why\s+were\s+no|what\s+was\s+the\s+confirmed\s+root\s+cause|was\s+this\s+discovered\s+or\s+inferred|show\s+(?:me\s+)?(?:the\s+)?runtime\s+evidence|which\s+relationship\s+graph\s+tables)\b/i.test(trimmed);
      let priorEnvelope: RuntimeDiagnosticEnvelope | null = null;
      let priorEnvelopeRequestId: string | null = null;
      if (isDiagnosticFollowup) {
        // Find the most recent assistant message with a diagnostic envelope.
        // If the follow-up mentions a specific object reference, prefer the
        // envelope whose resolved_object_reference matches.
        const refMatch = trimmed.match(/EWO-?[\d.]+[A-Z]?/i);
        for (let i = newMessages.length - 1; i >= 0; i--) {
          const m = newMessages[i];
          if (m.role === 'assistant' && m.runtime_diagnostic_envelope) {
            const env = m.runtime_diagnostic_envelope;
            if (refMatch && env.resolved_object_reference &&
                !env.resolved_object_reference.toLowerCase().includes(refMatch[0].toLowerCase())) {
              continue; // skip envelopes for unrelated objects
            }
            priorEnvelope = env;
            priorEnvelopeRequestId = env.request_id;
            break;
          }
        }
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/command-centre-ai`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: newMessages.map(m => ({ role: m.role, content: m.content })),
            conversation_id: targetConvId,
            mode: targetMode,
            ai_role: aiRole,
            prior_diagnostic_envelope: priorEnvelope,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (err.error === 'NO_API_KEY') {
          setNoApiKey(true);
          setMessages(newMessages);
          return;
        }
        throw new Error(err.message || `Request failed (${response.status})`);
      }

      const data = await response.json();
      if (data.stats) setContextStats(data.stats);
      if (data.selected_roles?.length) setLastSelectedRoles(data.selected_roles);

      const assistantMsg: Message = {
        role: 'assistant',
        content: data.reply ?? data.message ?? '',
        suggested: data.suggested ?? [],
        engineering_decision: data.engineering_decision ?? undefined,
        pending_implementation: data.pending_implementation ?? undefined,
        artefact_plan: data.artefact_plan ?? undefined,
        created_artefacts: data.created_artefacts?.length ? data.created_artefacts : undefined,
        skipped_artefacts: data.skipped_artefacts?.length ? data.skipped_artefacts : undefined,
        change_record_id: data.change_record_id ?? undefined,
        selected_roles: data.selected_roles ?? undefined,
        ai_role: aiRole,
        runtime_diagnostic_envelope: data.runtime_diagnostic_envelope ?? undefined,
      };

      // EWO-011.8.1: Auto-trigger engineering orchestration when decision is Proceed/Proceed with Changes
      const shouldOrchestrate = data.engineering_decision &&
        (data.engineering_decision.recommendation === 'Proceed' ||
         data.engineering_decision.recommendation === 'Proceed with Changes');

      if (shouldOrchestrate && targetConvId) {
        const pkgMsgIndex = newMessages.length + 1; // index of pkg message after assistantMsg
        const pkgMsg: Message = {
          role: 'system',
          content: '',
          engineering_package: {
            status: 'assessing',
            intent: null, analysisDraft: null, planDraft: null,
            analysis: null, plan: null,
            duplicateResult: null, errorMessage: null,
            pipelineExecutionId: null,
            executionPreparationSteps: null,
            executionPipeline: null,
            executionResult: null,
          },
        };
        setMessages([...newMessages, assistantMsg, pkgMsg]);

        // Run orchestration async — updates package state in-place
        const convTitle = conversations.find(c => c.id === targetConvId)?.title ?? generateConvTitle(trimmed);
        const readiness = assessReadiness(trimmed);
        startOrchestration(
          targetConvId,
          convTitle,
          trimmed,
          readiness,
          pkgMsgIndex,
        );
      } else {
        setMessages([...newMessages, assistantMsg]);
      }

      if (targetConvId && newMessages.length === 1) {
        const title = generateConvTitle(trimmed);
        await supabase.from('cc_ai_conversations').update({ title }).eq('id', targetConvId);
        setConversations(prev => prev.map(c => c.id === targetConvId ? { ...c, title } : c));
      }
    } catch (err) {
      setMessages([...newMessages, {
        role: 'assistant',
        content: `**Error**: ${err instanceof Error ? err.message : 'Failed to reach AI. Please try again.'}`,
      }]);
    } finally {
      setLoading(false);
    }
  }, [activeConvId, messages, loading, mode, aiRole, conversations]);

  function handleApprove(msgIndex: number) {
    setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, approved: true } : m));
    const approvalText = '%%APPROVE%%';
    if (activeConvId) sendMessage(approvalText);
    else newConversation(approvalText);
  }

  function handleCancel(msgIndex: number) {
    setMessages(prev => prev.map((m, i) => i === msgIndex ? { ...m, cancelled: true } : m));
    const cancelText = '%%CANCEL%%';
    if (activeConvId) sendMessage(cancelText);
    else newConversation(cancelText);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (activeConvId) sendMessage(input);
      else newConversation(input);
    }
  }

  function handleSend() {
    if (activeConvId) sendMessage(input);
    else newConversation(input);
  }

  function handleSelectAction(action: string) {
    setInput(action);
    inputRef.current?.focus();
  }

  // EWO-011.8.1 — update a specific engineering_package message by index
  function updatePkg(msgIndex: number, patch: Partial<EngineeringPackageState>) {
    setMessages(prev => prev.map((m, i) => {
      if (i !== msgIndex || !m.engineering_package) return m;
      return { ...m, engineering_package: { ...m.engineering_package, ...patch } };
    }));
  }

  // EWO-011.8.1 — start the full orchestration pipeline for a conversation
  async function startOrchestration(
    convId: string,
    convTitle: string,
    userQuery: string,
    readiness: ReturnType<typeof assessReadiness>,
    pkgMsgIndex: number,
  ) {
    const captureInput = {
      title: readiness.derivedTitle,
      raw_input: userQuery,
      engineering_objective: readiness.derivedObjective,
    };

    try {
      const result = await EngineeringOrchestrator.orchestrate(
        { conversationId: convId, conversationTitle: convTitle, userQuery },
        captureInput,
        (status) => updatePkg(pkgMsgIndex, { status }),
      );

      updatePkg(pkgMsgIndex, {
        status: result.status,
        intent: result.intent,
        analysisDraft: result.analysisDraft,
        analysis: result.analysis,
        plan: result.plan,
        duplicateResult: result.duplicateResult,
        errorMessage: result.errorMessage,
        pipelineExecutionId: result.pipeline?.id ?? null,
      });
    } catch (err) {
      updatePkg(pkgMsgIndex, {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Orchestration failed.',
      });
    }
  }

  // EWO-011.8.1 — approve analysis for a package message
  async function handlePackageApproveAnalysis(msgIndex: number, approved: ApprovedAnalysis) {
    const msg = messages[msgIndex];
    const pkg = msg?.engineering_package;
    if (!pkg?.intent || !pkg.pipelineExecutionId) return;

    updatePkg(msgIndex, { status: 'generating_plan' });

    try {
      const { analysis, planDraft } = await EngineeringOrchestrator.approveAnalysis(
        {
          intentId: pkg.intent.id,
          pipelineExecutionId: pkg.pipelineExecutionId,
          approvedSummary: approved.summary,
          approvedComplexity: approved.complexity,
          approvedConstitutionReview: approved.constitution_review,
          approvedArchitectureNotes: approved.architecture_notes,
          approvedProductIntelligenceNotes: approved.product_intelligence_notes,
        },
        pkg.analysisDraft,
      );
      updatePkg(msgIndex, {
        analysis,
        planDraft,
        status: 'awaiting_plan_approval',
        analysisDraft: pkg.analysisDraft,
      });
    } catch (err) {
      updatePkg(msgIndex, { status: 'error', errorMessage: err instanceof Error ? err.message : 'Analysis approval failed.' });
    }
  }

  // EWO-011.8.1 — approve plan for a package message
  async function handlePackageApprovePlan(msgIndex: number, approved: ApprovedPlan) {
    const msg = messages[msgIndex];
    const pkg = msg?.engineering_package;
    if (!pkg?.intent || !pkg.pipelineExecutionId || !pkg.analysis) return;

    try {
      const plan = await EngineeringOrchestrator.approvePlan(
        {
          intentId: pkg.intent.id,
          pipelineExecutionId: pkg.pipelineExecutionId,
          analysisId: pkg.analysis.id,
          approvedExecutiveSummary: approved.executive_summary,
          approvedEngineeringStrategy: approved.engineering_strategy,
          approvedRecommendedApproach: approved.recommended_approach,
          approvedEstimatedEffort: approved.estimated_effort,
        },
        pkg.planDraft,
      );
      updatePkg(msgIndex, { plan, status: 'complete' });
    } catch (err) {
      updatePkg(msgIndex, { status: 'error', errorMessage: err instanceof Error ? err.message : 'Plan approval failed.' });
    }
  }

  // EWO-011.8.1 — regenerate analysis draft
  async function handlePackageRegenerateAnalysis(msgIndex: number) {
    const pkg = messages[msgIndex]?.engineering_package;
    if (!pkg?.intent) return;
    updatePkg(msgIndex, { status: 'generating_analysis', analysisDraft: null });
    try {
      const draft = await EngineeringDraftService.generateAnalysisDraft(pkg.intent.id);
      updatePkg(msgIndex, { analysisDraft: draft, status: 'awaiting_analysis_approval' });
    } catch (err) {
      updatePkg(msgIndex, { status: 'error', errorMessage: err instanceof Error ? err.message : 'Regeneration failed.' });
    }
  }

  // EWO-011.8.1 — regenerate plan draft
  async function handlePackageRegeneratePlan(msgIndex: number) {
    const pkg = messages[msgIndex]?.engineering_package;
    if (!pkg?.intent || !pkg.analysis) return;
    updatePkg(msgIndex, { status: 'generating_plan', planDraft: null });
    try {
      const draft = await EngineeringDraftService.generatePlanDraft(pkg.intent.id, pkg.analysis.id);
      updatePkg(msgIndex, { planDraft: draft, status: 'awaiting_plan_approval' });
    } catch (err) {
      updatePkg(msgIndex, { status: 'error', errorMessage: err instanceof Error ? err.message : 'Regeneration failed.' });
    }
  }

  // EWO-011.8.2 — begin execution preparation (animated checklist)
  async function handlePackagePrepareExecution(msgIndex: number) {
    const pkg = messages[msgIndex]?.engineering_package;
    if (!pkg?.intent || !pkg.analysis || !pkg.plan) return;
    updatePkg(msgIndex, { status: 'preparing_execution', executionPreparationSteps: null });
    try {
      await EngineeringOrchestrator.prepareExecution(
        { intent: pkg.intent, analysis: pkg.analysis, plan: pkg.plan },
        (steps) => updatePkg(msgIndex, { executionPreparationSteps: steps }),
      );
      updatePkg(msgIndex, { status: 'awaiting_execution' });
    } catch (err) {
      updatePkg(msgIndex, { status: 'error', errorMessage: err instanceof Error ? err.message : 'Execution preparation failed.' });
    }
  }

  // EWO-011.8.2 — execute the approved engineering package inline
  async function handlePackageExecute(msgIndex: number) {
    const pkg = messages[msgIndex]?.engineering_package;
    if (!pkg?.intent || !pkg.analysis || !pkg.plan) return;
    updatePkg(msgIndex, { status: 'executing', executionPipeline: null });
    try {
      const wizardState = await EngineeringOrchestrator._buildWizardStateForExecution(
        { intent: pkg.intent, analysis: pkg.analysis, plan: pkg.plan },
      );
      const result = await EngineeringOrchestrator.executeConversationPipeline(
        wizardState,
        (pipeline) => updatePkg(msgIndex, { executionPipeline: pipeline }),
      );
      updatePkg(msgIndex, { status: 'complete', executionResult: result });
    } catch (err) {
      updatePkg(msgIndex, { status: 'error', errorMessage: err instanceof Error ? err.message : 'Execution failed.' });
    }
  }

  // EWO-011.8.2 — reset conversation for a new engineering request
  function handlePackageCreateAnother() {
    setMessages([]);
    setInput('');
    inputRef.current?.focus();
  }

  // EWO-011.8.1 — duplicate decision: proceed with new intent
  async function handlePackageDuplicateProceed(msgIndex: number, convId: string, convTitle: string, userQuery: string) {
    const pkg = messages[msgIndex]?.engineering_package;
    if (!pkg?.duplicateResult) return;
    updatePkg(msgIndex, { status: 'creating_intent' });
    const readiness = assessReadiness(userQuery);
    const captureInput = { title: readiness.derivedTitle, raw_input: userQuery, engineering_objective: readiness.derivedObjective };
    try {
      const result = await EngineeringOrchestrator._createAndAnalyse(
        { conversationId: convId, conversationTitle: convTitle, userQuery },
        captureInput,
        pkg.duplicateResult,
        (status) => updatePkg(msgIndex, { status }),
      );
      updatePkg(msgIndex, {
        status: result.status,
        intent: result.intent,
        analysisDraft: result.analysisDraft,
        analysis: result.analysis,
        plan: result.plan,
        errorMessage: result.errorMessage,
        pipelineExecutionId: result.pipeline?.id ?? null,
      });
    } catch (err) {
      updatePkg(msgIndex, { status: 'error', errorMessage: err instanceof Error ? err.message : 'Intent creation failed.' });
    }
  }

  // EWO-011.8.1 — duplicate decision: open existing intent
  async function handlePackageDuplicateContinueExisting(msgIndex: number, intentId: string) {
    updatePkg(msgIndex, { status: 'creating_intent' });
    try {
      const data = await EngineeringOrchestrator.continueExisting(intentId);
      updatePkg(msgIndex, {
        intent: data.intent,
        analysis: data.analysis ?? null,
        plan: data.plan ?? null,
        pipelineExecutionId: data.pipeline?.id ?? null,
        status: data.plan ? 'complete' : data.analysis ? 'awaiting_plan_approval' : 'awaiting_analysis_approval',
      });
    } catch (err) {
      updatePkg(msgIndex, { status: 'error', errorMessage: err instanceof Error ? err.message : 'Failed to open existing intent.' });
    }
  }

  function handleEmptyStatePrompt(prompt: string, m?: Mode) {
    newConversation(prompt, m);
  }

  const filteredConvs = conversations.filter(c =>
    !convSearch || c.title.toLowerCase().includes(convSearch.toLowerCase())
  );
  const activeConvs    = filteredConvs.filter(c => c.status !== 'completed');
  const completedConvs = filteredConvs.filter(c => c.status === 'completed');
  const pinnedConvs    = activeConvs.filter(c => c.pinned);
  const recentConvs    = activeConvs.filter(c => !c.pinned);
  const activeConv     = conversations.find(c => c.id === activeConvId);

  return (
    <div className="flex h-full overflow-hidden bg-slate-50">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — mobile drawer / desktop resizable */}
      {/* Mobile: fixed drawer controlled by sidebarOpen */}
      <div className={`
        fixed md:hidden top-0 left-0 h-full z-40
        w-72 bg-white border-r border-slate-200 flex flex-col
        transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        ${panelCollapsed ? 'hidden' : ''}
      `}>
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-bold text-slate-900">AI Technical Director</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => { setActiveConvId(null); setMessages([]); setSidebarOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all mb-1.5 ${
              !activeConvId
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 text-left">Executive Dashboard</span>
            {!activeConvId && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
          </button>
          <button
            onClick={() => setShowPrompts(s => !s)}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all mb-1.5 ${
              showPrompts
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Star className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 text-left">Prompt Library</span>
            <span className="text-[10px] text-slate-400 font-normal">{favourites.length}</span>
            {showPrompts ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
          </button>
          <button
            onClick={() => { newConversation(); setSidebarOpen(false); }}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Conversation
          </button>
          <button
            onClick={() => { setShowReviewHistory(false); runHealthAnalysis(); setSidebarOpen(false); }}
            disabled={analyzingConvs}
            className="w-full flex items-center justify-center gap-1.5 py-2 border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {analyzingConvs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
            {analyzingConvs ? 'Analysing…' : 'Health Analysis'}
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={convSearch}
              onChange={e => setConvSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:bg-white"
            />
          </div>
        </div>

        {/* Conversations */}
        <div className="flex-1 overflow-y-auto py-2">
          {loadingConvs ? (
            <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-slate-300" /></div>
          ) : (
            <>
              {pinnedConvs.length > 0 && (
                <div className="px-3 pb-1">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1">Pinned</p>
                  {pinnedConvs.map(c => <ConvItem key={c.id} conv={c} active={activeConvId === c.id} onSelect={c => { selectConversation(c); setSidebarOpen(false); }} onDelete={deleteConversation} onPin={togglePin} onRename={renameConversation} onComplete={completeConversation} onReopen={reopenConversation} />)}
                </div>
              )}
              {recentConvs.length > 0 && (
                <div className="px-3">
                  {pinnedConvs.length > 0 && <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1 mt-2">Active</p>}
                  {recentConvs.map(c => <ConvItem key={c.id} conv={c} active={activeConvId === c.id} onSelect={c => { selectConversation(c); setSidebarOpen(false); }} onDelete={deleteConversation} onPin={togglePin} onRename={renameConversation} onComplete={completeConversation} onReopen={reopenConversation} />)}
                </div>
              )}
              {activeConvs.length === 0 && completedConvs.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-400">
                  {convSearch ? 'No conversations match.' : 'No conversations yet.'}
                </div>
              )}
              {completedConvs.length > 0 && (
                <CompletedSection convs={completedConvs} activeConvId={activeConvId} onSelect={c => { selectConversation(c); setSidebarOpen(false); }} onDelete={deleteConversation} onPin={togglePin} onRename={renameConversation} onComplete={completeConversation} onReopen={reopenConversation} />
              )}
              {savedReviews.length > 0 && (
                <div className="px-3 mt-3">
                  <button
                    onClick={() => { setShowReviewHistory(true); setShowHealthReview(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-700 text-xs font-medium transition-colors"
                  >
                    <TrendingUp className="w-3 h-3 shrink-0" />
                    <span className="flex-1 text-left">Health Reviews ({savedReviews.length})</span>
                    <ChevronRight className="w-3 h-3 shrink-0" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Context footer — mobile only (no collapse toggle) */}
        <div className="px-4 py-3 border-t border-slate-100">
          {contextStats ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {[
                { icon: Package, v: contextStats.total,  label: 'features' },
                { icon: Target,  v: contextStats.goals,  label: 'goals' },
                { icon: Layers,  v: contextStats.epics,  label: 'epics' },
              ].map(({ icon: Icon, v, label }) => (
                <div key={label} className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Icon className="w-2.5 h-2.5" />
                  <span className="font-semibold text-slate-600">{v}</span> {label}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <Info className="w-3 h-3" />
              Live product context
            </div>
          )}
        </div>
      </div>

      {/* Desktop resizable sidebar */}
      {!panelCollapsed && (
        <ResizableSidebar
          defaultWidth={320}
          minWidth={280}
          maxWidth={650}
          storageKey="atdConversationPanelWidth"
          className="hidden md:flex bg-white border-r border-slate-200 h-full"
        >
          <div className="px-4 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <span className="text-sm font-bold text-slate-900">AI Technical Director</span>
            </div>
            <button
              onClick={() => { setActiveConvId(null); setMessages([]); }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all mb-1.5 ${
                !activeConvId
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 text-left">Executive Dashboard</span>
              {!activeConvId && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
            </button>
            <button
              onClick={() => setShowPrompts(s => !s)}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border transition-all mb-1.5 ${
                showPrompts
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Star className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 text-left">Prompt Library</span>
              <span className="text-[10px] text-slate-400 font-normal">{favourites.length}</span>
              {showPrompts ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
            </button>
            <button
              onClick={() => newConversation()}
              className="w-full flex items-center justify-center gap-1.5 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Conversation
            </button>
            <button
              onClick={() => { setShowReviewHistory(false); runHealthAnalysis(); }}
              disabled={analyzingConvs}
              className="w-full flex items-center justify-center gap-1.5 py-2 border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-700 hover:bg-teal-50 text-xs font-semibold rounded-xl transition-colors disabled:opacity-50 mt-1.5"
            >
              {analyzingConvs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
              {analyzingConvs ? 'Analysing…' : 'Health Analysis'}
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={convSearch}
                onChange={e => setConvSearch(e.target.value)}
                placeholder="Search conversations…"
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:bg-white"
              />
            </div>
          </div>

          {/* Conversations */}
          <div className="flex-1 overflow-y-auto py-2">
            {loadingConvs ? (
              <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-slate-300" /></div>
            ) : (
              <>
                {pinnedConvs.length > 0 && (
                  <div className="px-3 pb-1">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1">Pinned</p>
                    {pinnedConvs.map(c => <ConvItem key={c.id} conv={c} active={activeConvId === c.id} onSelect={selectConversation} onDelete={deleteConversation} onPin={togglePin} onRename={renameConversation} onComplete={completeConversation} onReopen={reopenConversation} />)}
                  </div>
                )}
                {recentConvs.length > 0 && (
                  <div className="px-3">
                    {pinnedConvs.length > 0 && <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1 mb-1 mt-2">Active</p>}
                    {recentConvs.map(c => <ConvItem key={c.id} conv={c} active={activeConvId === c.id} onSelect={selectConversation} onDelete={deleteConversation} onPin={togglePin} onRename={renameConversation} onComplete={completeConversation} onReopen={reopenConversation} />)}
                  </div>
                )}
                {activeConvs.length === 0 && completedConvs.length === 0 && (
                  <div className="text-center py-8 text-xs text-slate-400">
                    {convSearch ? 'No conversations match.' : 'No conversations yet.'}
                  </div>
                )}
                {completedConvs.length > 0 && (
                  <CompletedSection convs={completedConvs} activeConvId={activeConvId} onSelect={selectConversation} onDelete={deleteConversation} onPin={togglePin} onRename={renameConversation} onComplete={completeConversation} onReopen={reopenConversation} />
                )}
                {savedReviews.length > 0 && (
                  <div className="px-3 mt-3">
                    <button
                      onClick={() => { setShowReviewHistory(true); setShowHealthReview(true); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-700 text-xs font-medium transition-colors"
                    >
                      <TrendingUp className="w-3 h-3 shrink-0" />
                      <span className="flex-1 text-left">Health Reviews ({savedReviews.length})</span>
                      <ChevronRight className="w-3 h-3 shrink-0" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Context footer */}
          <div className="px-4 py-3 border-t border-slate-100">
            <button
              onClick={togglePanel}
              className="flex w-full items-center justify-between mb-2.5 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
              title="Collapse panel"
            >
              <span className="uppercase tracking-wider font-bold">Collapse panel</span>
              <ChevronLeft className="w-3 h-3" />
            </button>
            {contextStats ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {[
                  { icon: Package, v: contextStats.total,  label: 'features' },
                  { icon: Target,  v: contextStats.goals,  label: 'goals' },
                  { icon: Layers,  v: contextStats.epics,  label: 'epics' },
                ].map(({ icon: Icon, v, label }) => (
                  <div key={label} className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Icon className="w-2.5 h-2.5" />
                    <span className="font-semibold text-slate-600">{v}</span> {label}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <Info className="w-3 h-3" />
                Live product context
              </div>
            )}
          </div>
        </ResizableSidebar>
      )}

      {/* Collapsed panel rail — desktop only */}
      {panelCollapsed && (
        <div className="hidden md:flex flex-col items-center w-10 shrink-0 bg-white border-r border-slate-200 py-3 gap-3">
          <button
            onClick={togglePanel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Expand panel"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => { setActiveConvId(null); setMessages([]); }}
            className={`p-1.5 rounded-lg transition-colors ${!activeConvId ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
            title="Executive Dashboard"
          >
            <LayoutDashboard className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setShowPrompts(s => !s); }}
            className={`p-1.5 rounded-lg transition-colors ${showPrompts ? 'text-amber-600 bg-amber-50' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
            title="Prompt Library"
          >
            <Star className="w-4 h-4" />
          </button>
          <button
            onClick={() => { newConversation(); }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="New Conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Header */}
        <div className="shrink-0 px-3 md:px-6 py-3 bg-white border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Mobile hamburger */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 shrink-0"
            >
              <Menu className="w-4 h-4" />
            </button>
            {/* Desktop panel toggle */}
            <button
              onClick={togglePanel}
              className="hidden md:flex p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
              title={panelCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              {panelCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>
            {activeConv ? (
              <>
                <MessageSquare className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <HeaderTitle conv={activeConv} onRename={renameConversation} />
                  <div className="flex items-center gap-2 mt-0.5">
                    {activeConv.context_type && (
                      <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {({ ask:'Ask', build:'Build Plan', impact:'Impact Analysis', search:'Search', docs:'Documentation', test:'Test Planning', audit:'Compliance', recommend:'Recommendations' } as Record<string,string>)[activeConv.context_type] ?? activeConv.context_type}
                      </span>
                    )}
                    {activeConv.status === 'completed' && (
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Completed</span>
                    )}
                    {convIntelligence && (
                      <span className="text-[10px] font-semibold text-teal-600 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <GitBranch className="w-2.5 h-2.5" />
                        {convIntelligence.conversation_type.replace(/_/g, ' ')}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 hidden sm:inline">Updated {fmtDate(activeConv.updated_at)}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <Brain className="w-4 h-4 text-blue-500 shrink-0" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">AI Technical Director</h2>
                  <p className="text-[10px] text-slate-400 hidden sm:block">Engineering Command Interface · Internal only</p>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {activeConv && (
              <>
                {/* Return to Dashboard */}
                <button
                  onClick={() => { setActiveConvId(null); setMessages([]); }}
                  className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50 transition-all text-xs font-semibold"
                  title="Return to Executive Dashboard"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Dashboard</span>
                </button>
                {activeConv.status === 'completed' ? (
                  <button
                    onClick={e => reopenConversation(activeConv.id, e)}
                    className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all text-xs font-semibold"
                    title="Reopen conversation"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Reopen</span>
                  </button>
                ) : (
                  <button
                    onClick={e => completeConversation(activeConv.id, e)}
                    className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-all text-xs font-semibold"
                    title="Mark as completed"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Complete</span>
                  </button>
                )}
                {activeConv.status !== 'completed' && (
                  <button
                    onClick={e => togglePin(activeConv.id, activeConv.pinned, e)}
                    className={`p-1.5 rounded-lg border transition-all ${activeConv.pinned ? 'bg-amber-50 border-amber-200 text-amber-500' : 'border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                    title={activeConv.pinned ? 'Unpin' : 'Pin'}
                  >
                    <Pin className="w-3.5 h-3.5" />
                  </button>
                )}
                {/* Index conversation intelligence */}
                {messages.length >= 2 && (
                  <button
                    onClick={handleIndexConversation}
                    disabled={indexingConv}
                    className={`p-1.5 rounded-lg border transition-all ${convIntelligence ? 'bg-teal-50 border-teal-200 text-teal-600' : 'border-slate-200 text-slate-400 hover:text-teal-600 hover:border-teal-200 hover:bg-teal-50'}`}
                    title={convIntelligence ? `Re-index intelligence (${convIntelligence.conversation_type.replace(/_/g, ' ')})` : 'Index conversation intelligence for ELPM'}
                  >
                    {indexingConv ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
                  </button>
                )}
                <button
                  onClick={e => deleteConversation(activeConv.id, e)}
                  className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all"
                  title="Delete conversation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              onClick={() => { setActiveConvId(null); setMessages([]); }}
              className={`p-1.5 rounded-lg border transition-all ${
                !activeConv
                  ? 'border-blue-200 bg-blue-50 text-blue-600'
                  : 'border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 sm:hidden'
              }`}
              title={activeConv ? 'Return to Dashboard' : 'Executive Dashboard'}
            >
              {activeConv ? <LayoutDashboard className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Prompt library panel */}
        {showPrompts && (
          <div className="shrink-0 border-b border-slate-200 bg-white" style={{ height: 320 }}>
            <div className="flex items-center justify-between px-4 pt-3 pb-0">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-slate-800">Prompt Library</span>
                <span className="text-xs text-slate-400">{favourites.length} prompts</span>
              </div>
              <button onClick={() => setShowPrompts(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <PromptGrid prompts={favourites} onSelect={p => { setInput(p); setShowPrompts(false); inputRef.current?.focus(); }} />
          </div>
        )}

        {/* EWO-011.4: Linked Intent Banner */}
        {linkedIntentLink && activeConvId && (
          <div className="shrink-0 px-4 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center gap-3">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-semibold text-emerald-700">Linked Engineering Intent: </span>
              <span className="text-[10px] font-mono font-bold text-emerald-800">{linkedIntentLink.intent_ref}</span>
              {!linkedIntentHasPlan && (
                <span className="ml-2 text-[10px] text-amber-600 font-medium">· Planning in progress</span>
              )}
            </div>
            <button
              onClick={() => navigateToIntent(linkedIntentLink.intent_id)}
              className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:text-emerald-900 transition-colors whitespace-nowrap"
            >
              <ArrowRight className="w-3 h-3" />
              {linkedIntentHasPlan ? 'Review Engineering Plan' : 'Open Intent'}
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {noApiKey ? (
            <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 md:py-6">
              <NoAPIKeyBanner />
            </div>
          ) : !activeConvId && messages.length === 0 ? (
            <ECCDirectorDashboard
              onStartConversation={(prompt) => { if (prompt) newConversation(prompt); else newConversation(); }}
              onContextStats={(stats) => setContextStats(stats)}
              onNavigate={onNavigate}
            />
          ) : (
            <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 md:py-6">
              {messages.map((msg, i) => {
                // EWO-033R.4 Correction 3: Determine if a valid active interaction exists anywhere
                // in the conversation. If so, recovery cards are suppressed for ALL messages —
                // success suppresses recovery, and only one active interaction may exist.
                const hasValidInteraction = messages.some(
                  m => m.engineering_interaction?.card && typeof m.engineering_interaction.card.type === 'string',
                );

                // EWO-033R.2: render conversation-first engineering interaction cards
                if (msg.engineering_interaction) {
                  const interaction = msg.engineering_interaction;
                  const card = interaction.card;
                  // EWO-033R.4 Correction 2: Defensive validation — never crash on malformed interaction state
                  // EWO-033R.4 Correction 3: Suppress recovery card if a valid interaction already exists
                  if (!card || typeof card.type !== 'string') {
                    if (hasValidInteraction) {
                      // A valid interaction exists elsewhere — render text only, no recovery card
                      return (
                        <div key={i} className="mb-4 max-w-2xl">
                          {msg.content && (
                            <MessageBubble
                              key={`text-${i}`}
                              message={{ ...msg, engineering_interaction: undefined }}
                              onCopy={setCopiedText}
                              onSelectAction={(a: string) => { if (activeConvId) sendMessage(a); }}
                              conversationId={activeConvId ?? undefined}
                            />
                          )}
                        </div>
                      );
                    }
                    return (
                      <div key={i} className="mb-4 max-w-2xl">
                        {msg.content && (
                          <div className="mb-2">
                            <MessageBubble
                              key={`text-${i}`}
                              message={{ ...msg, engineering_interaction: undefined }}
                              onCopy={setCopiedText}
                              onSelectAction={(a: string) => { if (activeConvId) sendMessage(a); }}
                              conversationId={activeConvId ?? undefined}
                            />
                          </div>
                        )}
                        <ConversationRecoveryCard
                          onRetry={() => {
                            const conv = conversations.find(c => c.id === activeConvId);
                            if (conv) selectConversation(conv, { isPageRestore: true });
                          }}
                          onRestore={() => {
                            const conv = conversations.find(c => c.id === activeConvId);
                            if (conv) loadMessages(conv.id);
                          }}
                        />
                      </div>
                    );
                  }
                  return (
                    <div key={i} className="mb-4 max-w-2xl">
                      {msg.content && (
                        <div className="mb-2">
                          <MessageBubble
                            key={`text-${i}`}
                            message={{ ...msg, engineering_interaction: undefined }}
                            onCopy={setCopiedText}
                            onSelectAction={(a: string) => {
                              if (activeConvId) sendMessage(a);
                            }}
                            conversationId={activeConvId ?? undefined}
                          />
                        </div>
                      )}
                      <div className="mt-2">
                        {card.type === 'proposal' && card.proposal && (
                          <ProposalCard
                            proposal={InteractionPresentationFilter.filterProposal(card.proposal)}
                            onApprove={() => handleInteractionApprove(i)}
                            onRequestChanges={() => {
                              setInput('I\'d like to make some changes: ');
                              inputRef.current?.focus();
                            }}
                            onCancel={() => handleInteractionCancel(i)}
                            busy={interaction.busy}
                          />
                        )}
                        {card.type === 'proposal_refining' && card.proposal && (
                          <ProposalCard
                            proposal={InteractionPresentationFilter.filterProposal(card.proposal)}
                            onApprove={() => handleInteractionApprove(i)}
                            onRequestChanges={() => {
                              setInput('I\'d like to make some changes: ');
                              inputRef.current?.focus();
                            }}
                            onCancel={() => handleInteractionCancel(i)}
                            busy={interaction.busy}
                          />
                        )}
                        {card.type === 'execution_ready' && (
                          <ExecutionReadyCard
                            prep={{
                              ready: card.ready,
                              provider: card.provider,
                              estimatedImpact: card.estimatedImpact,
                              filesAffected: card.filesAffected,
                              validation: card.validation,
                              blockingReasons: card.blockingReasons,
                            }}
                            onExecute={() => handleInteractionExecute(i)}
                            onNotYet={() => handleInteractionNotYet(i)}
                            busy={interaction.busy}
                          />
                        )}
                        {card.type === 'executing' && (
                          <ExecutionProgressCard stages={card.stages} />
                        )}
                        {card.type === 'execution_failed' && (
                          <ExecutionFailedCard
                            error={card.error}
                            onRetry={() => handleInteractionExecute(i)}
                          />
                        )}
                        {card.type === 'completion' && (
                          <CompletionPackageCard
                            completion={{
                              summary: card.summary,
                              filesChanged: normalizeFilesChanged(card.filesChanged),
                              tests: card.tests,
                              validation: card.validation,
                              deploymentRecommendation: card.deploymentRecommendation,
                              testInstructions: card.testInstructions,
                            }}
                            onAccept={() => handleInteractionAccept(i)}
                            onReject={() => handleInteractionReject(i)}
                            onRequestRefinement={() => handleInteractionRefinement(i)}
                            busy={interaction.busy}
                          />
                        )}
                        {card.type === 'closed' && (
                          <ClosedCard message={card.message} />
                        )}
                        {card.type === 'blocked' && (
                          <BlockedCard reason={card.reason} />
                        )}
                        {card.type === 'preparing' && (
                          <PreparingCard message={card.message} />
                        )}
                        {card.type === 'preparing_execution' && (
                          <PreparingExecutionCard
                            phases={card.phases}
                            failedPhase={card.failedPhase}
                            error={card.error}
                            elapsedMs={card.elapsedMs}
                            onRetry={() => handleInteractionApprove(i)}
                            onCancel={() => handleInteractionCancel(i)}
                          />
                        )}
                        {card.type === 'preparing_timeout' && (
                          <PreparationTimeoutCard
                            onRetry={() => handleInteractionApprove(i)}
                            onContinueWaiting={() => { /* no-op — card stays visible */ }}
                            onCancel={() => handleInteractionCancel(i)}
                          />
                        )}
                      </div>
                    </div>
                  );
                }

                // EWO-011.8.1: render inline Engineering Package for system messages
                if (msg.role === 'system' && msg.engineering_package) {
                  const pkg = msg.engineering_package;
                  const precedingUserMsg = messages.slice(0, i).reverse().find(m => m.role === 'user');
                  const userQuery = precedingUserMsg?.content ?? '';
                  return (
                    <div key={i} className="px-0 md:px-0">
                      <ATDConversationPackage
                        status={pkg.status}
                        intent={pkg.intent}
                        analysisDraft={pkg.analysisDraft}
                        planDraft={pkg.planDraft}
                        analysis={pkg.analysis}
                        plan={pkg.plan}
                        duplicateResult={pkg.duplicateResult}
                        errorMessage={pkg.errorMessage}
                        executionPreparationSteps={pkg.executionPreparationSteps}
                        executionPipeline={pkg.executionPipeline}
                        executionResult={pkg.executionResult}
                        onDuplicateProceed={() => handlePackageDuplicateProceed(i, activeConvId!, activeConv?.title ?? '', userQuery)}
                        onDuplicateContinueExisting={(intentId) => handlePackageDuplicateContinueExisting(i, intentId)}
                        onApproveAnalysis={(approved) => handlePackageApproveAnalysis(i, approved)}
                        onRegenerateAnalysis={() => handlePackageRegenerateAnalysis(i)}
                        onApprovePlan={(approved) => handlePackageApprovePlan(i, approved)}
                        onRegeneratePlan={() => handlePackageRegeneratePlan(i)}
                        onPrepareExecution={() => handlePackagePrepareExecution(i)}
                        onExecute={() => handlePackageExecute(i)}
                        onCreateAnother={handlePackageCreateAnother}
                      />
                    </div>
                  );
                }

                // Find the most recent user message before this assistant message
                const precedingUserQuery = msg.role === 'assistant' && msg.engineering_decision
                  ? messages.slice(0, i).reverse().find(m => m.role === 'user')?.content
                  : undefined;
                return (
                  <MessageBubble
                    key={i}
                    message={msg}
                    onCopy={setCopiedText}
                    onSelectAction={action => {
                      setInput(action);
                      inputRef.current?.focus();
                    }}
                    onApprove={msg.pending_implementation && !msg.approved && !msg.cancelled ? () => handleApprove(i) : undefined}
                    onCancel={msg.pending_implementation && !msg.approved && !msg.cancelled ? () => handleCancel(i) : undefined}
                    conversationId={activeConvId ?? undefined}
                    conversationTitle={activeConv?.title}
                    userQuery={precedingUserQuery}
                  />
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="shrink-0 px-3 md:px-6 pt-2 pb-3 md:pb-4 bg-white border-t border-slate-200">
          {/* Mode selector + role selector */}
          <div className="mb-2 flex items-center gap-2">
            <ModeSelector mode={mode} onChange={setMode} />
            <RoleSelector role={aiRole} onChange={setAiRole} selectedRoles={lastSelectedRoles} />
          </div>

          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What would you like to work on today?"
                rows={1}
                className="w-full resize-none border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-slate-50 focus:bg-white transition-colors max-h-32 overflow-y-auto"
                style={{ minHeight: 44 }}
                onInput={e => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 128) + 'px';
                }}
                disabled={loading}
              />
              <button
                onClick={() => setShowPrompts(s => !s)}
                className={`absolute right-12 bottom-3 p-1 rounded-lg transition-colors ${showPrompts ? 'text-blue-500' : 'text-slate-400 hover:text-slate-600'}`}
                title="Prompt library"
              >
                <Star className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="w-10 h-10 md:w-11 md:h-11 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white disabled:text-slate-400 rounded-2xl flex items-center justify-center transition-all shrink-0 shadow-sm disabled:shadow-none"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between mt-1.5">
            <p className="text-[10px] text-slate-400">
              Context built from live product data · Internal only
            </p>
            {copiedText && <p className="text-[10px] text-emerald-500 font-medium">Copied</p>}
          </div>
        </div>

      </div>

      {/* ── Health Review Modal ─────────────────────────────────────────────── */}
      {showHealthReview && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
                  <Activity className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {showReviewHistory ? 'Health Review History' : 'Conversation Health Review'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {showReviewHistory ? `${savedReviews.length} review(s) on record` : 'AI analysis of conversation lifecycle'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!showReviewHistory && savedReviews.length > 0 && (
                  <button
                    onClick={() => setShowReviewHistory(true)}
                    className="text-xs text-teal-600 hover:text-teal-700 font-medium px-2 py-1 rounded-lg hover:bg-teal-50 transition-colors"
                  >
                    History
                  </button>
                )}
                {showReviewHistory && (
                  <button
                    onClick={() => setShowReviewHistory(false)}
                    className="text-xs text-slate-500 hover:text-slate-700 font-medium px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    Latest
                  </button>
                )}
                <button
                  onClick={() => { setShowHealthReview(false); setShowReviewHistory(false); }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Review History View */}
              {showReviewHistory ? (
                <div className="space-y-3">
                  {savedReviews.map(review => (
                    <div key={review.id} className="border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700">
                          {new Date(review.run_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{review.total_analysed} analysed</span>
                          {review.auto_completed_count > 0 && (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{review.auto_completed_count} completed</span>
                          )}
                        </div>
                      </div>
                      {review.summary && <p className="text-xs text-slate-600 leading-relaxed">{review.summary}</p>}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { label: 'Active',     value: review.remaining_active,  color: 'text-blue-700'   },
                          { label: 'Flagged',    value: review.flagged_for_review, color: 'text-amber-700'  },
                          { label: 'Orphaned',   value: review.orphaned,          color: 'text-orange-700' },
                          { label: 'Duplicates', value: review.duplicate_pairs,   color: 'text-red-700'    },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="bg-slate-50 rounded-lg p-2 text-center">
                            <p className={`text-base font-bold ${color}`}>{value}</p>
                            <p className="text-[10px] text-slate-500">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : healthReview ? (
                <>
                  {/* Summary */}
                  <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
                    <p className="text-sm text-teal-800 leading-relaxed">{healthReview.summary}</p>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Total Analysed',    value: healthReview.stats.total_analysed,     color: 'text-slate-700',   bg: 'bg-slate-50'   },
                      { label: 'Auto-Completed',    value: healthReview.stats.auto_completed,     color: 'text-emerald-700', bg: 'bg-emerald-50' },
                      { label: 'Remain Active',     value: healthReview.stats.remaining_active,   color: 'text-blue-700',    bg: 'bg-blue-50'    },
                      { label: 'Flagged for Review',value: healthReview.stats.flagged_for_review, color: 'text-amber-700',   bg: 'bg-amber-50'   },
                    ].map(({ label, value, color, bg }) => (
                      <div key={label} className={`${bg} rounded-xl p-3 text-center`}>
                        <p className={`text-2xl font-bold ${color}`}>{value}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Secondary stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { label: 'Orphaned',        value: healthReview.stats.orphaned,        Icon: Link2,         color: 'text-orange-600' },
                      { label: 'Unclear Titles',  value: healthReview.stats.unclear_titles,  Icon: Pencil,        color: 'text-violet-600' },
                      { label: 'Duplicate Pairs', value: healthReview.stats.duplicate_pairs, Icon: AlertTriangle, color: 'text-red-600'    },
                    ].map(({ label, value, Icon, color }) => (
                      <div key={label} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3">
                        <Icon className={`w-5 h-5 ${color} shrink-0`} />
                        <div>
                          <p className={`text-lg font-bold ${color}`}>{value}</p>
                          <p className="text-[10px] text-slate-500">{label}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Recommendations */}
                  {healthReview.recommendations.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Recommendations</h4>
                      <div className="space-y-2">
                        {healthReview.recommendations.map((rec, i) => {
                          const priorityStyle: Record<string, string> = {
                            critical: 'bg-red-50 border-red-200 text-red-800',
                            high:     'bg-orange-50 border-orange-200 text-orange-800',
                            medium:   'bg-amber-50 border-amber-200 text-amber-800',
                            low:      'bg-slate-50 border-slate-200 text-slate-700',
                            info:     'bg-blue-50 border-blue-200 text-blue-800',
                          };
                          const badgeStyle: Record<string, string> = {
                            critical: 'bg-red-100 text-red-700',
                            high:     'bg-orange-100 text-orange-700',
                            medium:   'bg-amber-100 text-amber-700',
                            low:      'bg-slate-100 text-slate-600',
                            info:     'bg-blue-100 text-blue-700',
                          };
                          const cls = priorityStyle[rec.priority] ?? priorityStyle.info;
                          const badge = badgeStyle[rec.priority] ?? badgeStyle.info;
                          return (
                            <div key={i} className={`border rounded-xl p-3 ${cls}`}>
                              <div className="flex items-start gap-2">
                                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${badge}`}>{rec.priority}</span>
                                <div>
                                  <p className="text-xs font-semibold">{rec.title}</p>
                                  <p className="text-xs mt-0.5 opacity-80 leading-relaxed">{rec.description}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {healthReview.review_id && (
                    <p className="text-[10px] text-slate-400 text-center">
                      Report saved permanently · ID: {healthReview.review_id.slice(0, 8)}…
                    </p>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex gap-3">
              {!showReviewHistory && (
                <button
                  onClick={() => { setShowHealthReview(false); setShowReviewHistory(false); runHealthAnalysis(); }}
                  disabled={analyzingConvs}
                  className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {analyzingConvs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                  Run Again
                </button>
              )}
              <button
                onClick={() => { setShowHealthReview(false); setShowReviewHistory(false); }}
                className="flex-1 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
