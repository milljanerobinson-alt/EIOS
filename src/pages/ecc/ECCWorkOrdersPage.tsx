import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HistoricalImportWizard,
  EngineeringProvenancePanel,
  type EngineeringProvenance,
  type EvidenceEnrichment,
} from './ECHistoricalImportWizard';
import {
  Plus, X, ChevronDown, Loader2, Search, Filter,
  AlertTriangle, Clock, CheckCircle2, Circle, ArrowRight,
  FileText, User, Calendar, Tag, Link2, ChevronRight,
  LayoutGrid, List, Kanban, GitBranch, Archive, Zap, Sparkles,
  CheckSquare, ShieldCheck, Rocket, Flag, Activity,
  Eye, Edit3, Check, ChevronUp, BarChart3, TrendingUp,
  ClipboardList, Download, ShieldCheck as ShieldCheckIcon, Copy,
  History,
  AlertCircle, Camera, Database, Code, Scale,
  Ban,
  RotateCcw,
  RefreshCw,
  ChevronLeft,
  Server, Package as PackageIcon,
  Fingerprint,
  UserCheck,
  ListChecks,
  FileSpreadsheet,
  Trash2,
  FlaskConical,
} from 'lucide-react';
import { listHistoricalReferences, searchUnifiedLedger, type HistoricalReference, type LedgerEntry } from '../../lib/ensureEngineeringWorkOrder';
import { HistoricalReferenceDetail } from './HistoricalReferenceDetail';
import { supabase } from '../../lib/supabase';
import { EngineeringBreadcrumbs } from '../../components/ecc/EngineeringBreadcrumbs';
import { RelatedEngineeringPanel } from '../../components/ecc/RelatedEngineeringPanel';
import { ECCVerificationMatrixPanel } from '../../components/ecc/ECCVerificationMatrixPanel';
import { ECCPOTestGuidePanel } from '../../components/ecc/ECCPOTestGuidePanel';
import { EngineeringIdentityPanel } from './ECCIdentityPanel';
import { pushNavHistory, saveNavContext } from '../../lib/engineeringNavigationService';
import {
  GATE_DEFINITIONS,
  GATE_STATUS_CFG,
  OVERALL_STATUS_CFG,
  initializeVerificationGates,
  getVerificationGates,
  getVerificationSummary,
  updateVerificationGate,
  retryAutoTransition,
  isGateUnlocked,
  getNextUnverifiedGate,
  isEvidenceLocked,
  type VerificationGate,
  type VerificationGateKey,
  type VerificationGateStatus,
  type VerificationOverallStatus,
  type VerificationGateUpdateResult,
  type VerificationSummary,
} from '../../lib/verificationService';
import {
  runVerificationOrchestration,
  retryFailedGates,
  getLatestOrchestration,
  performVerification,
  type OrchestrationMode,
  type OrchestrationResult,
  type OrchestrationFinalStatus,
  type GateResult,
  type GateDependency,
  GATE_CLASSIFICATION,
  PO_GATES,
  loadGateDependencies,
} from '../../lib/verificationOrchestrator';
import {
  getConstitutionalVerification,
  upsertConstitutionalVerification,
  checkPOAcceptanceGate,
  CONSTITUTIONAL_LEVELS,
  CONSTITUTIONAL_LEVEL_LABELS,
  type ConstitutionalVerificationLevel,
  type ConstitutionalVerificationSummary,
  type ConstitutionalVerificationRecord,
  type POAcceptanceGateResult,
} from '../../lib/verificationFrameworkService';
import {
  generateEngineeringPackage,
  listEngineeringPackages,
  exportPackage,
  assignProvider,
  returnImplementation,
  getImplementationMetrics,
  PROVIDER_LABELS,
  IMPLEMENTATION_STATUS_CFG,
  PACKAGE_STATUS_CFG,
  type EngineeringPackage,
  type ImplementationProvider,
  type ImplementationStatus,
  type EngineeringPackageStatus,
} from '../../lib/engineeringPackageService';
import {
  beginEngineeringExecution,
  checkExecutionEligibility,
  getActiveSession,
  generateGovernedFailureMessage,
} from '../../lib/executionLaunchService';
import type { EligibilityResult as CanonicalEligibilityResult } from '../../lib/executionEligibilityResolver';
import { buildExecutionWorkspaceRoute, navigateToExecutionWorkspace } from '../../lib/engineeringNavigationService';
import { exportClosedWorkOrders, type EWOExportResult } from '../../lib/ewoExportService';
import { orchestrateRecords, getRecordsForEwo, checkRecordHealth, getHealthAlerts, type GeneratedRecord, type RecordHealthAlert } from '../../lib/engineeringRecordsOrchestrator';
import { getAuditsForEwo, type EngineeringAuditRecord } from '../../lib/engineeringAuditService';
import { EwoDeleteModal, EwoDeleteSuccessToast, MarkAsTestModal, RemoveTestClassificationModal } from './ECCDeleteEwoModal';
import type { EwoDeleteResult } from '../../lib/ewoDeletionService';

// ─── Types ────────────────────────────────────────────────────────────────────

type EWOStatus =
  | 'draft'
  | 'architecture_review'
  | 'engineering_approved'
  | 'po_approved'
  | 'ready'
  | 'in_progress'
  | 'engineering_validation'
  | 'engineering_complete'
  | 'engineering_verification'
  | 'verified'
  | 'report_generated'
  | 'po_acceptance'
  | 'closed'
  | 'archived';

type Priority = 'critical' | 'high' | 'medium' | 'low';
type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

interface EWO {
  id: string;
  ewo_ref: string;
  title: string;
  executive_summary: string | null;
  business_objective: string | null;
  engineering_objective: string | null;
  priority: Priority;
  risk_level: RiskLevel;
  estimated_effort: string | null;
  owner: string | null;
  requested_by: string | null;
  status: EWOStatus;
  scope: string | null;
  out_of_scope: string | null;
  validation_requirements: string | null;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  closure_reason: string | null;
  closure_method: string | null;
  target_date: string | null;
  dependencies: string[];
  related_features: string[];
  related_standards: string[];
  related_decisions: string[];
  related_releases: string[];
  engineering_notes: string | null;
  architecture_review_notes: string | null;
  validation_notes: string | null;
  po_acceptance_notes: string | null;
  business_value: string | null;
  eig_entity_id: string | null;
  po_accepted_at: string | null;
  po_accepted_by: string | null;
  po_acceptance_statement: string | null;
  report_generation_status: 'not_expected' | 'pending' | 'failed' | 'available' | null;
  verification_status: VerificationOverallStatus | null;
  verified_at: string | null;
  implementation_provider: ImplementationProvider;
  implementation_status: ImplementationStatus;
  engineering_package_status: EngineeringPackageStatus;
  implementation_reference: string | null;
  implementation_started_at: string | null;
  implementation_completed_at: string | null;
  implementation_summary: string | null;
  changed_files: string[];
  implementation_notes: string | null;
  is_historical_import: boolean;
  import_source: string | null;
  imported_at: string | null;
  imported_by: string | null;
  historical_notes: string | null;
  is_test_artifact: boolean;
  test_artifact_marked_at: string | null;
  test_artifact_marked_by: string | null;
  test_artifact_reason: string | null;
  engineering_classification: string | null;
  product_owner: string | null;
  implementation_source: string | null;
  originating_prompt_ref: string | null;
  originating_conversation_ref: string | null;
  parent_ref: string | null;
  refinement_chain: string[];
  refinement_depth: number;
  created_by: string | null;
  accepted_completion_report_id: string | null;
  accepted_refinement_version: string | null;
  accepted_implementation_version: string | null;
  created_at: string;
  updated_at: string;
}

interface LifecycleEvent {
  id: string;
  ewo_id: string;
  from_status: string | null;
  to_status: string;
  actor: string | null;
  notes: string | null;
  created_at: string;
}

interface CompletionReport {
  id: string;
  ewo_id: string;
  ewo_ref: string;
  title: string;
  executive_summary: string | null;
  scope_completed: string | null;
  lifecycle_summary: string | null;
  validation_results: string | null;
  build_result: string | null;
  risks: string | null;
  po_decisions: string | null;
  acceptance_recommendation: string | null;
  report_body: string | null;
  generated_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
}

type EWOInput = Omit<EWO, 'id' | 'created_at' | 'updated_at' | 'eig_entity_id'>;

type ViewMode = 'dashboard' | 'kanban' | 'table' | 'detail' | 'timeline';

// ─── Lifecycle config ─────────────────────────────────────────────────────────

const LIFECYCLE: { status: EWOStatus; label: string; short: string }[] = [
  { status: 'draft',                    label: 'Draft',                       short: 'Draft'          },
  { status: 'architecture_review',      label: 'Architecture Review',         short: 'Arch Review'    },
  { status: 'engineering_approved',     label: 'Engineering Approved',        short: 'Eng Approved'   },
  { status: 'po_approved',              label: 'Product Owner Approved',      short: 'PO Approved'    },
  { status: 'ready',                    label: 'Ready for Implementation',    short: 'Ready'          },
  { status: 'in_progress',              label: 'Implementation In Progress',  short: 'In Progress'    },
  { status: 'engineering_validation',   label: 'Engineering Validation',      short: 'Validation'     },
  { status: 'engineering_complete',      label: 'Engineering Complete',         short: 'Eng Complete'   },
  { status: 'engineering_verification',  label: 'Engineering Verification',    short: 'Verification'  },
  { status: 'verified',                 label: 'Engineering Verified',         short: 'Verified'       },
  { status: 'report_generated',         label: 'Completion Report Generated', short: 'Report Ready'              },
  { status: 'po_acceptance',            label: 'Awaiting Product Owner Acceptance', short: 'Awaiting PO Acceptance' },
  { status: 'closed',                   label: 'Closed',                      short: 'Closed'         },
  { status: 'archived',                 label: 'Archived',                    short: 'Archived'       },
];

const STATUS_CFG: Record<EWOStatus, { bg: string; border: string; text: string; dot: string; label: string }> = {
  draft:                     { bg: 'bg-slate-50',    border: 'border-slate-200',   text: 'text-slate-600',   dot: 'bg-slate-400',   label: 'Draft'                      },
  architecture_review:       { bg: 'bg-orange-50',   border: 'border-orange-200',  text: 'text-orange-700',  dot: 'bg-orange-400',  label: 'Architecture Review'        },
  engineering_approved:      { bg: 'bg-blue-50',     border: 'border-blue-200',    text: 'text-blue-700',    dot: 'bg-blue-500',    label: 'Engineering Approved'       },
  po_approved:               { bg: 'bg-cyan-50',     border: 'border-cyan-200',    text: 'text-cyan-700',    dot: 'bg-cyan-500',    label: 'PO Approved'                },
  ready:                     { bg: 'bg-teal-50',     border: 'border-teal-200',    text: 'text-teal-700',    dot: 'bg-teal-500',    label: 'Ready'                      },
  in_progress:               { bg: 'bg-amber-50',    border: 'border-amber-200',   text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'In Progress'                },
  engineering_validation:    { bg: 'bg-violet-50',   border: 'border-violet-200',  text: 'text-violet-700',  dot: 'bg-violet-500',  label: 'Engineering Validation'     },
  engineering_complete:      { bg: 'bg-indigo-50',   border: 'border-indigo-200',  text: 'text-indigo-700',  dot: 'bg-indigo-500',  label: 'Engineering Complete'       },
  engineering_verification:  { bg: 'bg-violet-50',   border: 'border-violet-200',  text: 'text-violet-700',  dot: 'bg-violet-500',  label: 'Engineering Verification'   },
  verified:                  { bg: 'bg-emerald-50',  border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Verified'                    },
  report_generated:          { bg: 'bg-indigo-50',   border: 'border-indigo-200',  text: 'text-indigo-700',  dot: 'bg-indigo-500',  label: 'Report Ready'               },
  po_acceptance:             { bg: 'bg-amber-50',    border: 'border-amber-200',   text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'Awaiting PO Acceptance'     },
  closed:                    { bg: 'bg-emerald-50',  border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Closed'                     },
  archived:                  { bg: 'bg-slate-50',    border: 'border-slate-200',   text: 'text-slate-400',   dot: 'bg-slate-300',   label: 'Archived'                   },
};

const PRIORITY_CFG: Record<Priority, { label: string; dot: string; text: string; border: string; bg: string }> = {
  critical: { label: 'Critical', dot: 'bg-red-500',    text: 'text-red-700',    border: 'border-red-200',    bg: 'bg-red-50'    },
  high:     { label: 'High',     dot: 'bg-orange-500', text: 'text-orange-700', border: 'border-orange-200', bg: 'bg-orange-50' },
  medium:   { label: 'Medium',   dot: 'bg-amber-500',  text: 'text-amber-700',  border: 'border-amber-200',  bg: 'bg-amber-50'  },
  low:      { label: 'Low',      dot: 'bg-slate-400',  text: 'text-slate-600',  border: 'border-slate-200',  bg: 'bg-slate-50'  },
};

const NEXT_ACTIONS: Record<EWOStatus, { next: EWOStatus; label: string; icon: typeof Check } | null> = {
  draft:                     { next: 'architecture_review',     label: 'Submit for Architecture Review', icon: ShieldCheck },
  architecture_review:       { next: 'engineering_approved',    label: 'Approve Engineering',            icon: Check       },
  engineering_approved:      { next: 'po_approved',             label: 'Record PO Approval',             icon: CheckSquare },
  po_approved:               { next: 'ready',                   label: 'Mark Ready for Implementation',  icon: Rocket      },
  ready:                     { next: 'in_progress',             label: 'Start Implementation',           icon: Zap         },
  in_progress:               { next: 'engineering_validation',  label: 'Submit for Validation',          icon: ShieldCheck },
  engineering_validation:    { next: 'engineering_complete',   label: 'Mark Engineering Complete',      icon: Check       },
  engineering_complete:      { next: 'engineering_verification', label: 'Start Engineering Verification', icon: ShieldCheckIcon },
  engineering_verification:   null,
  verified:                  { next: 'report_generated',        label: 'Generate Completion Report',     icon: FileText    },
  report_generated:          { next: 'po_acceptance',           label: 'Submit for PO Acceptance',       icon: CheckSquare },
  po_acceptance:             { next: 'closed',                  label: 'Accept as Product Owner',          icon: CheckSquare },
  closed:                    null,
  archived:                  null,
};

const ACTIVE_STATUSES: EWOStatus[] = ['draft', 'architecture_review', 'engineering_approved', 'po_approved', 'ready', 'in_progress', 'engineering_validation', 'engineering_complete', 'engineering_verification', 'verified', 'report_generated', 'po_acceptance'];
const CLOSED_STATUSES: EWOStatus[] = ['closed', 'archived'];

// ─── Semantic EWO Reference Sorting ───────────────────────────────────────────
// Sorts EWO refs like EWO-001, EWO-011.4B, EWO-014.13C in proper hierarchical order
function parseEwoRef(ref: string): number[] {
  const match = ref.match(/EWO-(.+)$/i);
  if (!match) return [0];
  const parts = match[1].split('.');
  return parts.map(p => {
    const numMatch = p.match(/(\d+)/);
    if (!numMatch) return 0;
    const num = parseInt(numMatch[1], 10);
    const suffixMatch = p.match(/[A-Za-z]+$/);
    const suffix = suffixMatch ? suffixMatch[0].toUpperCase().charCodeAt(0) - 64 : 0;
    return num * 1000 + suffix;
  });
}

function compareEwoRefs(a: string, b: string): number {
  const pa = parseEwoRef(a);
  const pb = parseEwoRef(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

function sortEwosByRef<T extends { ewo_ref: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => compareEwoRefs(a.ewo_ref, b.ewo_ref));
}

// ─── Ledger Filter System ─────────────────────────────────────────────────────

type LedgerFilter =
  | 'all'
  | 'active'
  | 'closed'
  | 'historical'
  | 'historical_ref'
  | 'archived'
  | 'in_progress'
  | 'awaiting_po'
  | 'report_ready'
  | 'engineering_verification'
  | 'ready'
  | 'draft'
  | 'test'
  | 'classification_historical_migration'
  | 'classification_refinement'
  | 'classification_engineering'
  | 'classification_bug'
  | 'classification_constitutional'
  | 'classification_historical_recovery';

const FILTER_CFG: { key: LedgerFilter; label: string }[] = [
  { key: 'all',                      label: 'All' },
  { key: 'active',                   label: 'Active' },
  { key: 'in_progress',             label: 'In Progress' },
  { key: 'engineering_verification', label: 'Engineering Verification' },
  { key: 'report_ready',             label: 'Report Ready' },
  { key: 'awaiting_po',              label: 'Awaiting PO Acceptance' },
  { key: 'ready',                    label: 'Ready' },
  { key: 'draft',                    label: 'Draft' },
  { key: 'test',                     label: 'Test' },
  { key: 'closed',                   label: 'Closed' },
  { key: 'historical_ref',            label: 'Historical References' },
  { key: 'archived',                 label: 'Archived' },
  { key: 'classification_historical_migration', label: 'Classification: Historical Migration' },
  { key: 'classification_refinement',           label: 'Classification: Refinement' },
  { key: 'classification_engineering',           label: 'Classification: Engineering' },
  { key: 'classification_bug',                   label: 'Classification: Bug' },
  { key: 'classification_constitutional',        label: 'Classification: Constitutional' },
  { key: 'classification_historical_recovery',    label: 'Classification: Historical Recovery' },
];

function applyLedgerFilter(ewo: EWO, filter: LedgerFilter): boolean {
  const isTest = ewo.is_test_artifact === true;
  switch (filter) {
    case 'all': return !isTest;
    case 'active': return !isTest && ACTIVE_STATUSES.includes(ewo.status);
    case 'closed': return !isTest && ewo.status === 'closed';
    case 'historical': return !isTest && (ewo.is_historical_import || ewo.closure_method === 'Historical Migration');
    case 'historical_ref': return false;
    case 'archived': return !isTest && ewo.status === 'archived';
    case 'in_progress': return !isTest && ewo.status === 'in_progress';
    case 'awaiting_po': return !isTest && ewo.status === 'po_acceptance';
    case 'report_ready': return !isTest && ewo.status === 'report_generated';
    case 'engineering_verification': return !isTest && ewo.status === 'engineering_verification';
    case 'ready': return !isTest && ewo.status === 'ready';
    case 'draft': return !isTest && ewo.status === 'draft';
    case 'test': return isTest;
    case 'classification_historical_migration': return !isTest && (ewo.engineering_classification || 'Engineering') === 'Historical Migration';
    case 'classification_refinement': return !isTest && (ewo.engineering_classification || 'Engineering') === 'Refinement';
    case 'classification_engineering': return !isTest && (ewo.engineering_classification || 'Engineering') === 'Engineering';
    case 'classification_bug': return !isTest && (ewo.engineering_classification || 'Engineering') === 'Bug';
    case 'classification_constitutional': return !isTest && (ewo.engineering_classification || 'Engineering') === 'Constitutional';
    case 'classification_historical_recovery': return !isTest && (ewo.engineering_classification || 'Engineering') === 'Historical Recovery';
    default: return !isTest;
  }
}

const KANBAN_COLUMNS: { statuses: EWOStatus[]; label: string; color: string }[] = [
  { statuses: ['draft'],                               label: 'Draft',            color: 'border-t-slate-300'   },
  { statuses: ['architecture_review'],                 label: 'Arch Review',      color: 'border-t-orange-400'  },
  { statuses: ['engineering_approved', 'po_approved'], label: 'Approved',         color: 'border-t-blue-400'    },
  { statuses: ['ready'],                               label: 'Ready',            color: 'border-t-teal-400'    },
  { statuses: ['in_progress'],                         label: 'In Progress',      color: 'border-t-amber-500'   },
  { statuses: ['engineering_validation', 'engineering_complete'], label: 'Validation', color: 'border-t-indigo-400' },
  { statuses: ['engineering_verification', 'verified'], label: 'Verification',    color: 'border-t-violet-400' },
  { statuses: ['report_generated', 'po_acceptance'],   label: 'Acceptance',       color: 'border-t-purple-400'  },
  { statuses: ['closed'],                              label: 'Closed',           color: 'border-t-emerald-400' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(ts: string): string {
  return new Date(ts).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fallbackCopy(text: string) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch { /* ignore */ }
  document.body.removeChild(ta);
}

function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  let node = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

function scrollToSection(scrollContainer: HTMLElement | null, sectionId: string) {
  const el = document.getElementById(sectionId);
  if (!el || !scrollContainer) return;
  const offset = 160;
  const top = el.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top + scrollContainer.scrollTop - offset;
  scrollContainer.scrollTo({ top, behavior: 'smooth' });
  el.classList.add('section-highlight');
  setTimeout(() => el.classList.remove('section-highlight'), 2000);
}

function StatusBadge({ status }: { status: EWOStatus }) {
  const cfg = STATUS_CFG[status] ?? { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400', label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.border} ${cfg.text} border`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  const cfg = PRIORITY_CFG[priority] ?? { label: priority, dot: 'bg-slate-400', text: 'text-slate-600', border: 'border-slate-200', bg: 'bg-slate-50' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.border} ${cfg.text} border`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

const CLASSIFICATION_CFG: Record<string, { bg: string; text: string; border: string; label: string }> = {
  'Engineering':          { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   label: 'Engineering' },
  'Refinement':           { bg: 'bg-cyan-50',   text: 'text-cyan-700',   border: 'border-cyan-200',   label: 'Refinement' },
  'Historical Migration': { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  label: 'Historical Migration' },
  'Historical Recovery':  { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', label: 'Historical Recovery' },
  'Bug':                  { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    label: 'Bug' },
  'Constitutional':       { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', label: 'Constitutional' },
  'Audit':                { bg: 'bg-slate-50',  text: 'text-slate-700',  border: 'border-slate-200',  label: 'Audit' },
  'Historical Reference': { bg: 'bg-slate-100', text: 'text-slate-600',  border: 'border-slate-300',  label: 'Historical Reference' },
};

function ClassificationBadge({ classification }: { classification: string }) {
  const cfg = CLASSIFICATION_CFG[classification] ?? { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', label: classification };
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text} ${cfg.border} border`}>
      {cfg.label}
    </span>
  );
}

// ─── Form Modal ───────────────────────────────────────────────────────────────

const EMPTY_FORM: EWOInput = {
  ewo_ref: '',
  title: '',
  executive_summary: '',
  business_objective: '',
  engineering_objective: '',
  priority: 'medium',
  risk_level: 'medium',
  estimated_effort: '',
  owner: 'ATD',
  requested_by: '',
  status: 'draft',
  scope: '',
  out_of_scope: '',
  validation_requirements: '',
  approved_at: null,
  started_at: null,
  completed_at: null,
  closed_at: null,
  target_date: null,
  dependencies: [],
  related_features: [],
  related_standards: [],
  related_decisions: [],
  related_releases: [],
  engineering_notes: '',
  architecture_review_notes: '',
  validation_notes: '',
  po_acceptance_notes: '',
  business_value: '',
  is_historical_import: false,
  import_source: null,
  imported_at: null,
  imported_by: null,
  historical_notes: null,
  engineering_classification: 'Engineering',
  product_owner: 'Millie Robinson',
};

function EWOFormModal({
  ewo,
  nextRef,
  onClose,
  onSaved,
}: {
  ewo: EWO | null;
  nextRef: string;
  onClose: () => void;
  onSaved: (saved: EWO) => void;
}) {
  const [form, setForm] = useState<EWOInput>(
    ewo
      ? { ...ewo }
      : { ...EMPTY_FORM, ewo_ref: nextRef }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'core' | 'scope' | 'relationships' | 'notes'>('core');

  function set<K extends keyof EWOInput>(k: K, v: EWOInput[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function handleSave() {
    if (!form.title.trim() || !form.ewo_ref.trim()) {
      setError('Title and Work Order ID are required.');
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      ...form,
      title: form.title.trim(),
      updated_at: new Date().toISOString(),
    };

    let result;
    if (ewo) {
      const { data, error: e } = await supabase
        .from('engineering_work_orders')
        .update(payload)
        .eq('id', ewo.id)
        .select()
        .single();
      result = { data, error: e };
    } else {
      const { data, error: e } = await supabase
        .from('engineering_work_orders')
        .insert(payload)
        .select()
        .single();
      result = { data, error: e };

      if (!e && data) {
        // Register as EIG entity
        await supabase.from('eig_entities').insert({
          entity_type: 'ewo',
          entity_ref: data.ewo_ref,
          name: data.title,
          description: data.executive_summary,
          status: 'active',
          properties: { priority: data.priority, risk_level: data.risk_level },
          tags: ['ewo', data.priority],
          linked_record_id: data.id,
          linked_record_type: 'engineering_work_orders',
        }).select().single().then(({ data: entity }) => {
          if (entity) {
            supabase.from('engineering_work_orders')
              .update({ eig_entity_id: entity.id })
              .eq('id', data.id)
              .then(() => {});
          }
        });
      }
    }

    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    onSaved(result.data as EWO);
  }

  const TABS = [
    { key: 'core' as const, label: 'Core Details' },
    { key: 'scope' as const, label: 'Scope & Validation' },
    { key: 'relationships' as const, label: 'Relationships' },
    { key: 'notes' as const, label: 'Engineering Notes' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {ewo ? `Edit ${ewo.ewo_ref}` : 'New Engineering Work Order'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Engineering Execution Engine</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 shrink-0 px-6">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {tab === 'core' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Work Order ID *</label>
                  <input className="input text-sm" value={form.ewo_ref} onChange={e => set('ewo_ref', e.target.value)} placeholder="EWO-004" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select className="input text-sm" value={form.status} onChange={e => set('status', e.target.value as EWOStatus)}>
                    {LIFECYCLE.map(l => <option key={l.status} value={l.status}>{l.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Title *</label>
                <input className="input text-sm" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Brief, descriptive title" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Executive Summary</label>
                <textarea className="input text-sm resize-none" rows={3} value={form.executive_summary || ''} onChange={e => set('executive_summary', e.target.value)} placeholder="Brief summary for executives and stakeholders" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Business Objective</label>
                <textarea className="input text-sm resize-none" rows={2} value={form.business_objective || ''} onChange={e => set('business_objective', e.target.value)} placeholder="What business outcome does this deliver?" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Engineering Objective</label>
                <textarea className="input text-sm resize-none" rows={2} value={form.engineering_objective || ''} onChange={e => set('engineering_objective', e.target.value)} placeholder="What technical work is required?" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
                  <select className="input text-sm" value={form.priority} onChange={e => set('priority', e.target.value as Priority)}>
                    {(['critical', 'high', 'medium', 'low'] as Priority[]).map(p => (
                      <option key={p} value={p}>{PRIORITY_CFG[p].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Risk Level</label>
                  <select className="input text-sm" value={form.risk_level} onChange={e => set('risk_level', e.target.value as RiskLevel)}>
                    {(['critical', 'high', 'medium', 'low'] as RiskLevel[]).map(r => (
                      <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Owner</label>
                  <input className="input text-sm" value={form.owner || ''} onChange={e => set('owner', e.target.value)} placeholder="ATD" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Requested By</label>
                  <input className="input text-sm" value={form.requested_by || ''} onChange={e => set('requested_by', e.target.value)} placeholder="Product Owner" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Estimated Effort</label>
                  <input className="input text-sm" value={form.estimated_effort || ''} onChange={e => set('estimated_effort', e.target.value)} placeholder="2–4 hours" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Target Date</label>
                  <input className="input text-sm" type="date" value={form.target_date ? form.target_date.split('T')[0] : ''} onChange={e => set('target_date', e.target.value ? e.target.value + 'T00:00:00Z' : null)} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Business Value</label>
                <textarea className="input text-sm resize-none" rows={2} value={form.business_value || ''} onChange={e => set('business_value', e.target.value)} placeholder="Describe the business and product value this delivers" />
              </div>
            </>
          )}

          {tab === 'scope' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Scope</label>
                <textarea className="input text-sm resize-none" rows={4} value={form.scope || ''} onChange={e => set('scope', e.target.value)} placeholder="What is included in this work order?" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Out of Scope</label>
                <textarea className="input text-sm resize-none" rows={3} value={form.out_of_scope || ''} onChange={e => set('out_of_scope', e.target.value)} placeholder="Explicitly state what is NOT included" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Validation Requirements</label>
                <textarea className="input text-sm resize-none" rows={4} value={form.validation_requirements || ''} onChange={e => set('validation_requirements', e.target.value)} placeholder="What must be verified before this can be closed?" />
              </div>
            </>
          )}

          {tab === 'relationships' && (
            <>
              {(
                [
                  { key: 'dependencies' as const,      label: 'Dependencies',      placeholder: 'EWO-001, EWO-002' },
                  { key: 'related_features' as const,  label: 'Related Features',  placeholder: 'Feature refs' },
                  { key: 'related_standards' as const, label: 'Related Standards', placeholder: 'STD-001' },
                  { key: 'related_decisions' as const, label: 'Related Decisions', placeholder: 'ADR-001' },
                  { key: 'related_releases' as const,  label: 'Related Releases',  placeholder: 'RC-003' },
                ] as const
              ).map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
                  <input
                    className="input text-sm"
                    value={(form[key] as string[]).join(', ')}
                    onChange={e => set(key, e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                    placeholder={placeholder}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Comma-separated</p>
                </div>
              ))}
            </>
          )}

          {tab === 'notes' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Engineering Notes</label>
                <textarea className="input text-sm resize-none" rows={4} value={form.engineering_notes || ''} onChange={e => set('engineering_notes', e.target.value)} placeholder="Technical notes, implementation observations, decisions made during execution" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Architecture Review Notes</label>
                <textarea className="input text-sm resize-none" rows={3} value={form.architecture_review_notes || ''} onChange={e => set('architecture_review_notes', e.target.value)} placeholder="Notes from architecture review stage" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Validation Notes</label>
                <textarea className="input text-sm resize-none" rows={3} value={form.validation_notes || ''} onChange={e => set('validation_notes', e.target.value)} placeholder="Engineering validation findings" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">PO Acceptance Notes</label>
                <textarea className="input text-sm resize-none" rows={3} value={form.po_acceptance_notes || ''} onChange={e => set('po_acceptance_notes', e.target.value)} placeholder="Product Owner acceptance commentary" />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Check className="w-4 h-4" /> {ewo ? 'Save Changes' : 'Create Work Order'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Completion Report Modal ──────────────────────────────────────────────────

function CompletionReportModal({
  ewo,
  onClose,
  onGenerated,
}: {
  ewo: EWO;
  onClose: () => void;
  onGenerated: () => void;
}) {
  const [form, setForm] = useState({
    executive_summary: ewo.executive_summary || '',
    scope_completed: ewo.scope || '',
    lifecycle_summary: `Work Order ${ewo.ewo_ref} completed the full engineering lifecycle from ${ewo.status === 'engineering_validation' ? 'draft through engineering validation' : 'draft through implementation'}.`,
    validation_results: ewo.validation_notes || '',
    build_result: 'Build passed — all modules compiled without errors.',
    risks: ewo.risk_level !== 'low' ? `Risk level: ${ewo.risk_level.toUpperCase()}. All identified risks mitigated during implementation.` : 'No significant risks identified.',
    po_decisions: ewo.po_acceptance_notes || '',
    acceptance_recommendation: 'Recommended for Product Owner Acceptance.',
  });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  function buildReportBody() {
    return [
      `═══════════════════════════════════════════════`,
      `ENGINEERING COMPLETION REPORT`,
      `Work Order: ${ewo.ewo_ref}`,
      `Title: ${ewo.title}`,
      `Generated: ${new Date().toLocaleString('en-AU')}`,
      `═══════════════════════════════════════════════`,
      ``,
      `EXECUTIVE SUMMARY`,
      `─────────────────────────────────────────`,
      form.executive_summary,
      ``,
      `SCOPE COMPLETED`,
      `─────────────────────────────────────────`,
      form.scope_completed,
      ``,
      `LIFECYCLE SUMMARY`,
      `─────────────────────────────────────────`,
      form.lifecycle_summary,
      ``,
      `VALIDATION RESULTS`,
      `─────────────────────────────────────────`,
      form.validation_results,
      ``,
      `BUILD RESULT`,
      `─────────────────────────────────────────`,
      form.build_result,
      ``,
      `RISKS`,
      `─────────────────────────────────────────`,
      form.risks,
      ``,
      `PRODUCT OWNER DECISIONS`,
      `─────────────────────────────────────────`,
      form.po_decisions || 'No specific Product Owner decisions recorded.',
      ``,
      `ENGINEERING ACCEPTANCE RECOMMENDATION`,
      `─────────────────────────────────────────`,
      form.acceptance_recommendation,
      ``,
      `═══════════════════════════════════════════════`,
      `LLND Automate · Engineering Execution Engine`,
      `═══════════════════════════════════════════════`,
    ].join('\n');
  }

  async function handleCopyPreview() {
    const body = buildReportBody();
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      fallbackCopy(body);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleGenerate() {
    setSaving(true);
    const reportBody = buildReportBody();

    // EWO-014.19A.7R.1 Req 7 — Completion Report Safety Net
    // Validate canonical EWO exists before attaching Completion Report
    const { validateCompletionReportHasEwo } = await import('../../lib/engineeringIntegrityService');
    const safetyCheck = await validateCompletionReportHasEwo(ewo.ewo_ref, ewo.id);
    if (!safetyCheck.ewoFound) {
      setSaving(false);
      alert(`Governance Violation: Cannot generate Completion Report. No canonical Engineering Work Order found for ${ewo.ewo_ref}.\n\nA governance violation alert has been raised and historical reconciliation has been initiated.`);
      return;
    }

    await supabase.from('ewo_completion_reports').insert({
      ewo_id: safetyCheck.ewoId ?? ewo.id,
      ewo_ref: ewo.ewo_ref,
      title: `Completion Report — ${ewo.title}`,
      ...form,
      report_body: reportBody,
      generated_at: new Date().toISOString(),
    });

    // Advance status to report_generated
    await supabase.from('engineering_work_orders')
      .update({ status: 'report_generated', updated_at: new Date().toISOString() })
      .eq('id', ewo.id);

    await supabase.from('ewo_lifecycle_events').insert({
      ewo_id: ewo.id,
      from_status: ewo.status,
      to_status: 'report_generated',
      actor: 'ATD',
      notes: 'Completion report generated',
    });

    setSaving(false);
    onGenerated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Generate Completion Report</h2>
            <p className="text-xs text-slate-400 mt-0.5">{ewo.ewo_ref} · {ewo.title}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {(
            [
              { key: 'executive_summary' as const, label: 'Executive Summary', rows: 3 },
              { key: 'scope_completed' as const, label: 'Scope Completed', rows: 3 },
              { key: 'lifecycle_summary' as const, label: 'Lifecycle Summary', rows: 2 },
              { key: 'validation_results' as const, label: 'Validation Results', rows: 3 },
              { key: 'build_result' as const, label: 'Build Result', rows: 2 },
              { key: 'risks' as const, label: 'Risks', rows: 2 },
              { key: 'po_decisions' as const, label: 'Product Owner Decisions', rows: 2 },
              { key: 'acceptance_recommendation' as const, label: 'Engineering Acceptance Recommendation', rows: 2 },
            ] as const
          ).map(({ key, label, rows }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
              <textarea
                className="input text-sm resize-none"
                rows={rows}
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
          <div className="flex items-center gap-2">
            <button onClick={handleCopyPreview} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
              {copied ? <><Check className="w-3.5 h-3.5 text-emerald-600" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy Preview</>}
            </button>
            <button onClick={handleGenerate} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : <><FileText className="w-4 h-4" /> Generate Report</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PO Acceptance & Governed Closure Modal (EWO-014.13A) ─────────────────────

function POAcceptanceModal({
  ewo, saving, onClose, onAccept,
}: {
  ewo: EWO;
  saving: boolean;
  onClose: () => void;
  onAccept: (statement: string, notes: string) => void;
}) {
  const [statement, setStatement] = useState('Product Owner Acceptance: PASS');
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 bg-emerald-50/50">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-semibold text-slate-900">Product Owner Acceptance</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Accepting this EWO will automatically execute the governed closure sequence:
            lock records, archive report, extract knowledge, update metrics, and close the work order.
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <div className="text-xs font-mono text-slate-500">{ewo.ewo_ref}</div>
            <div className="text-sm font-medium text-slate-800 mt-0.5">{ewo.title}</div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Acceptance Statement</label>
            <input
              type="text"
              className="input text-sm"
              value={statement}
              onChange={e => setStatement(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Acceptance Notes (optional)</label>
            <textarea
              className="input text-sm resize-none"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Product Owner commentary, observations, or conditions..."
            />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="text-xs text-amber-800 font-medium mb-1">Governed Closure Sequence</div>
            <ol className="text-[11px] text-amber-700 space-y-0.5 list-decimal list-inside">
              <li>Lock Engineering Record</li>
              <li>Lock Engineering Plan</li>
              <li>Mark Completion Report as Final</li>
              <li>Archive Completion Report</li>
              <li>Extract Engineering Knowledge</li>
              <li>Update Engineering Metrics</li>
              <li>Update Roadmap Progress</li>
              <li>Transition EWO → Closed</li>
              <li>Record timestamp & actor</li>
              <li>Publish lifecycle event</li>
            </ol>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={() => onAccept(statement, notes)}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckSquare className="w-3.5 h-3.5" />}
            Accept & Close EWO
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lifecycle Transition Modal ───────────────────────────────────────────────

function TransitionModal({
  ewo,
  toStatus,
  label,
  onClose,
  onTransitioned,
}: {
  ewo: EWO;
  toStatus: EWOStatus;
  label: string;
  onClose: () => void;
  onTransitioned: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    const now = new Date().toISOString();
    const updates: Partial<EWO> = {
      status: toStatus,
      updated_at: now,
    };
    if (toStatus === 'engineering_approved' || toStatus === 'po_approved') updates.approved_at = now;
    if (toStatus === 'in_progress') updates.started_at = now;
    if (toStatus === 'engineering_complete') updates.completed_at = now;
    if (toStatus === 'verified') updates.verified_at = now;
    // PO Acceptance → Closed is now a governed RPC flow, not a direct update
    if (toStatus === 'closed') {
      setSaving(false);
      onTransitioned();
      return;
    }

    await supabase.from('engineering_work_orders').update(updates).eq('id', ewo.id);
    await supabase.from('ewo_lifecycle_events').insert({
      ewo_id: ewo.id,
      from_status: ewo.status,
      to_status: toStatus,
      actor: 'ATD',
      notes: notes.trim() || null,
    });

    setSaving(false);
    onTransitioned();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">{label}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">{ewo.ewo_ref} · {ewo.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={ewo.status} />
                {ewo.is_historical_import && (
                  <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">Historical</span>
                )}
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <StatusBadge status={toStatus} />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Notes (optional)</label>
            <textarea
              className="input text-sm resize-none"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add context or commentary for this transition…"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
          <button onClick={handleConfirm} disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : <><Check className="w-4 h-4" /> Confirm Transition</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// EWO-017R.5: Constitutional Verification Panel (AMD-007)
// Displays four verification levels + PO acceptance gate
// ============================================================

const CONSTITUTIONAL_STATUS_CFG: Record<string, { bg: string; border: string; text: string; dot: string; label: string }> = {
  not_run:        { bg: 'bg-slate-50',   border: 'border-slate-200',  text: 'text-slate-500',   dot: 'bg-slate-300',  label: 'Not Run' },
  pending:        { bg: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-600',    dot: 'bg-blue-500',   label: 'Pending' },
  passed:         { bg: 'bg-emerald-50', border: 'border-emerald-200',text: 'text-emerald-600', dot: 'bg-emerald-500',label: 'Passed' },
  failed:         { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-600',     dot: 'bg-red-500',    label: 'Failed' },
  blocked:        { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-600',  dot: 'bg-orange-500', label: 'Blocked' },
  not_applicable: { bg: 'bg-slate-50',   border: 'border-slate-200',  text: 'text-slate-400',  dot: 'bg-slate-200',  label: 'N/A' },
};

const CONSTITUTIONAL_LEVEL_ICONS: Record<ConstitutionalVerificationLevel, typeof Code> = {
  unit: Code,
  integration: GitBranch,
  end_to_end: ShieldCheck,
  product_owner: UserCheck,
};

function ConstitutionalVerificationPanel({ ewoId, onRefresh }: { ewoId: string; onRefresh?: () => void }) {
  const [summary, setSummary] = useState<ConstitutionalVerificationSummary | null>(null);
  const [gate, setGate] = useState<POAcceptanceGateResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [ewoId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, g] = await Promise.all([
        getConstitutionalVerification(ewoId),
        checkPOAcceptanceGate(ewoId),
      ]);
      setSummary(s);
      setGate(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load verification data');
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkLevel(level: ConstitutionalVerificationLevel, status: 'passed' | 'failed' | 'not_applicable' | 'pending') {
    setUpdating(level);
    setError(null);
    try {
      await upsertConstitutionalVerification(ewoId, level, status, 'Engineering');
      await load();
      if (onRefresh) onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update verification level');
    } finally {
      setUpdating(null);
    }
  }

  const levels: ConstitutionalVerificationLevel[] = CONSTITUTIONAL_LEVELS;
  const passedCount = levels.filter(l => {
    const r = summary?.[l];
    return r && (r.status === 'passed' || r.status === 'not_applicable');
  }).length;
  const progressPct = (passedCount / levels.length) * 100;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-slate-600" />
          <h3 className="text-sm font-bold text-slate-800">Constitutional Verification (AMD-007)</h3>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            summary?.allPassed ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-amber-50 border-amber-200 text-amber-600'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${summary?.allPassed ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {passedCount}/{levels.length} Levels
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{passedCount}/{levels.length} passed</span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? '' : '-rotate-90'}`} />
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5">
          {/* Progress bar */}
          <div className="mb-4 bg-slate-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Verification Progress</span>
              <span className="text-xs font-semibold text-slate-600">{passedCount} / {levels.length} Levels Complete</span>
            </div>
            <div className="flex gap-1 mb-3">
              {levels.map(level => {
                const r = summary?.[level];
                const cfg = r ? (CONSTITUTIONAL_STATUS_CFG[r.status] ?? CONSTITUTIONAL_STATUS_CFG.not_run) : CONSTITUTIONAL_STATUS_CFG.not_run;
                return (
                  <div
                    key={level}
                    className={`h-2 flex-1 rounded-full ${cfg.dot}`}
                    title={`${CONSTITUTIONAL_LEVEL_LABELS[level]}: ${cfg.label}`}
                  />
                );
              })}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
              {levels.map(level => {
                const r = summary?.[level];
                const cfg = r ? (CONSTITUTIONAL_STATUS_CFG[r.status] ?? CONSTITUTIONAL_STATUS_CFG.not_run) : CONSTITUTIONAL_STATUS_CFG.not_run;
                const Icon = CONSTITUTIONAL_LEVEL_ICONS[level];
                return (
                  <div key={level} className="flex items-center gap-1.5">
                    {r?.status === 'passed' || r?.status === 'not_applicable' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : r?.status === 'failed' ? (
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    ) : r?.status === 'pending' ? (
                      <Loader2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    )}
                    <span className={`text-[11px] font-medium ${cfg.text}`}>{CONSTITUTIONAL_LEVEL_LABELS[level]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Level cards */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
            </div>
          ) : error ? (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {levels.map((level, idx) => {
                const r = summary?.[level];
                const cfg = r ? (CONSTITUTIONAL_STATUS_CFG[r.status] ?? CONSTITUTIONAL_STATUS_CFG.not_run) : CONSTITUTIONAL_STATUS_CFG.not_run;
                const Icon = CONSTITUTIONAL_LEVEL_ICONS[level];
                const isMandatory = level !== 'product_owner';
                return (
                  <div key={level} className={`rounded-lg border p-3 ${cfg.border} ${cfg.bg}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`w-4 h-4 ${cfg.text} shrink-0`} />
                        <div className="min-w-0">
                          <p className={`text-xs font-semibold ${cfg.text}`}>
                            {CONSTITUTIONAL_LEVEL_LABELS[level]}
                            {isMandatory && <span className="ml-1.5 text-[10px] text-slate-400 font-normal">— mandatory for PO acceptance</span>}
                          </p>
                          {r?.verified_at && (
                            <p className="text-[10px] text-slate-400">
                              Verified {new Date(r.verified_at).toLocaleDateString()} by {r.verifier ?? '—'}
                            </p>
                          )}
                          {r?.evidence && (
                            <p className="text-[10px] text-slate-500 mt-0.5 truncate">{r.evidence}</p>
                          )}
                          {r?.notes && (
                            <p className="text-[10px] text-slate-400 mt-0.5 italic">{r.notes}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {updating === level ? (
                          <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                        ) : (
                          <>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                              {cfg.label}
                            </span>
                            {r?.status !== 'passed' && r?.status !== 'not_applicable' && (
                              <button
                                onClick={() => handleMarkLevel(level, 'passed')}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-md hover:bg-emerald-100 transition-colors border border-emerald-200"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Mark Passed
                              </button>
                            )}
                            {r?.status !== 'failed' && (
                              <button
                                onClick={() => handleMarkLevel(level, 'failed')}
                                className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-100 transition-colors"
                                title="Mark as Failed"
                              >
                                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* PO Acceptance Gate */}
          {gate && !gate.canAccept && (
            <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-orange-700">Product Owner Acceptance Blocked</p>
                  <p className="text-[11px] text-orange-600 mt-0.5">{gate.explanation}</p>
                </div>
              </div>
            </div>
          )}
          {gate?.canAccept && (
            <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-emerald-700">Product Owner Acceptance Eligible</p>
                  <p className="text-[11px] text-emerald-600 mt-0.5">All mandatory verification levels passed. Product Owner may now accept.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// EWO-017R.6: Governed Verification Orchestration UI
// Verify All Eligible / Verify Remaining / Pre-Review / Progress / Summary
// ============================================================

const FINAL_STATUS_CFG: Record<OrchestrationFinalStatus, { label: string; bg: string; text: string; border: string }> = {
  in_progress: { label: 'In Progress', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  verification_complete: { label: 'Verification Complete', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  verification_partially_complete: { label: 'Partially Complete', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  verification_failed: { label: 'Verification Failed', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  verification_blocked_by_missing_artefacts: { label: 'Blocked by Missing Artefacts', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  ready_for_product_owner_verification: { label: 'Ready for PO Verification', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  ready_for_product_owner_acceptance: { label: 'Ready for PO Acceptance', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

const OUTCOME_ICON: Record<GateResult['outcome'], typeof CheckCircle2> = {
  passed: CheckCircle2,
  already_verified: CheckCircle2,
  failed: AlertCircle,
  blocked: Ban,
  skipped: Circle,
  artefacts_required: AlertTriangle,
  deferred_po: UserCheck,
};

const OUTCOME_COLOR: Record<GateResult['outcome'], string> = {
  passed: 'text-emerald-600',
  already_verified: 'text-emerald-500',
  failed: 'text-red-600',
  blocked: 'text-orange-600',
  skipped: 'text-slate-400',
  artefacts_required: 'text-amber-600',
  deferred_po: 'text-indigo-600',
};

const OUTCOME_LABEL: Record<GateResult['outcome'], string> = {
  passed: 'Passed',
  already_verified: 'Already Verified',
  failed: 'Failed',
  blocked: 'Blocked',
  skipped: 'Skipped',
  artefacts_required: 'Verification Requirements Not Met',
  deferred_po: 'Deferred to PO',
};

function VerificationOrchestrationPanel({ ewoId, ewoRef, ewo, onRefresh }: { ewoId: string; ewoRef: string; ewo: EWO; onRefresh: () => void }) {
  const [showPreReview, setShowPreReview] = useState<OrchestrationMode | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<OrchestrationResult | null>(null);
  const [poNotes, setPoNotes] = useState('');
  const [progressGate, setProgressGate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Recover latest orchestration on mount (refresh-safe)
  useEffect(() => {
    getLatestOrchestration(ewoId).then(latest => {
      if (latest && latest.finalStatus !== 'in_progress') {
        setResult(latest);
      }
    }).catch(() => {});
  }, [ewoId]);

  async function handleConfirmRun() {
    if (!showPreReview) return;
    setRunning(true);
    setError(null);
    setShowPreReview(null);
    setProgressGate('Starting...');
    try {
      const res = await runVerificationOrchestration({
        workOrderId: ewoId,
        requestedBy: 'Product Owner',
        mode: showPreReview,
        notes: poNotes || undefined,
        isProductOwnerInitiated: true,
        loadedContext: {
          workOrderId: ewo.id,
          workOrderRef: ewo.ewo_ref,
          status: ewo.status,
          implementationStatus: ewo.implementation_status as string | undefined,
          reportGenerationStatus: ewo.report_generation_status as string | undefined,
          poTestingStatus: (ewo as unknown as Record<string, unknown>).po_testing_status as string | null | undefined ?? null,
          productOwnerVerificationStatus: (ewo as unknown as Record<string, unknown>).product_owner_verification_status as string | undefined,
          loadedAt: new Date().toISOString(),
        },
      });
      setResult(res);
      setProgressGate(null);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Orchestration failed');
      setProgressGate(null);
    } finally {
      setRunning(false);
    }
  }

  async function handleRetry() {
    setRunning(true);
    setError(null);
    setProgressGate('Retrying failed gates...');
    try {
      const res = await retryFailedGates(ewoId, 'Product Owner', 'Retry failed gates', {
        workOrderId: ewo.id,
        workOrderRef: ewo.ewo_ref,
        status: ewo.status,
        implementationStatus: ewo.implementation_status as string | undefined,
        reportGenerationStatus: ewo.report_generation_status as string | undefined,
        poTestingStatus: (ewo as unknown as Record<string, unknown>).po_testing_status as string | null | undefined ?? null,
        productOwnerVerificationStatus: (ewo as unknown as Record<string, unknown>).product_owner_verification_status as string | undefined,
        loadedAt: new Date().toISOString(),
      }, true);
      setResult(res);
      setProgressGate(null);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed');
      setProgressGate(null);
    } finally {
      setRunning(false);
    }
  }

  const cfg = result ? FINAL_STATUS_CFG[result.finalStatus] : null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header with batch actions */}
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-slate-600" />
            <h3 className="text-sm font-bold text-slate-800">Batch Verification Orchestration</h3>
            <span className="text-[10px] text-slate-400">EWO-017R.6</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowPreReview('verify_all_eligible')}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Verify All Eligible
            </button>
            <button
              onClick={() => setShowPreReview('verify_remaining')}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Verify Remaining
            </button>
          </div>
        </div>
      </div>

      {/* Live progress */}
      {running && (
        <div className="px-5 py-3 bg-blue-50 border-b border-blue-200">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            <span className="text-xs font-medium text-blue-700">{progressGate ?? 'Processing...'}</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-5 py-3 bg-red-50 border-b border-red-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Completion summary */}
      {result && !running && (
        <div className="px-5 py-4 space-y-4">
          <div className={`p-3 rounded-lg border ${cfg?.bg ?? ''} ${cfg?.border ?? ''}`}>
            <div className="flex items-center gap-2">
              <ShieldCheck className={`w-5 h-5 ${cfg?.text ?? ''}`} />
              <h4 className={`text-sm font-bold ${cfg?.text ?? ''}`}>{cfg?.label ?? 'Verification Result'}</h4>
              <span className="text-[10px] text-slate-400 ml-auto">{result.orchestrationRef}</span>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { label: 'Total', value: result.totalGates, color: 'text-slate-700' },
              { label: 'Passed', value: result.passed + result.alreadyVerified, color: 'text-emerald-600' },
              { label: 'Failed', value: result.failed, color: 'text-red-600' },
              { label: 'Blocked', value: result.blocked, color: 'text-orange-600' },
              { label: 'Artefacts Missing', value: result.artefactsMissing, color: 'text-amber-600' },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 rounded-lg p-2 text-center">
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Gate results */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Gate Results</p>
            {result.resultsByGate.map(gr => {
              const Icon = OUTCOME_ICON[gr.outcome] ?? Circle;
              const color = OUTCOME_COLOR[gr.outcome] ?? 'text-slate-400';
              return (
                <div key={gr.gate_key} className="flex items-start gap-2.5 p-2 bg-slate-50 rounded-lg">
                  <Icon className={`w-4 h-4 ${color} shrink-0 mt-0.5`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-700">{gr.gate_label}</span>
                      <span className={`text-[10px] font-semibold ${color}`}>{OUTCOME_LABEL[gr.outcome]}</span>
                      {gr.classification === 'product_owner' && (
                        <span className="text-[10px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full">PO Gate</span>
                      )}
                    </div>
                    {gr.evidence_source && <p className="text-[10px] text-slate-400 mt-0.5">Artefact: {gr.evidence_source}</p>}
                    {gr.verifier && <p className="text-[10px] text-slate-400">Verifier: {gr.verifier}</p>}
                    {gr.blocking_reason && <p className="text-[10px] text-orange-600 mt-0.5">{gr.blocking_reason}</p>}
                    {gr.failure_reason && <p className="text-[10px] text-red-600 mt-0.5">{gr.failure_reason}</p>}
                    {gr.missing_artefacts && gr.missing_artefacts.length > 0 && (
                      <p className="text-[10px] text-amber-600 mt-0.5">Missing: {gr.missing_artefacts.join(', ')}</p>
                    )}
                    {gr.notes && <p className="text-[10px] text-slate-400 italic mt-0.5">{gr.notes}</p>}
                  </div>
                  {gr.verified_at && <span className="text-[10px] text-slate-300 shrink-0">{new Date(gr.verified_at).toLocaleDateString()}</span>}
                </div>
              );
            })}
          </div>

          {/* Next recommended action */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs font-semibold text-blue-700">Next: {result.nextRecommendedAction}</p>
            {result.lifecycleImpact.poAcceptanceEligible && (
              <p className="text-[11px] text-emerald-600 mt-1">Product Owner Acceptance is eligible — all mandatory verification passed.</p>
            )}
          </div>

          {/* EWO-017R.11: Governed completion status */}
          {result.failed === 0 && result.artefactsMissing === 0 && result.blocked === 0 && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              {result.lifecycleImpact.canTransitionToReportReady ? (
                <p className="text-xs font-semibold text-emerald-700">Verification Complete — all gates passed, lifecycle progressing to Report Ready.</p>
              ) : result.lifecycleImpact.canTransitionToVerified ? (
                <p className="text-xs font-semibold text-emerald-700">Verification Complete — all gates passed.</p>
              ) : (
                <p className="text-xs font-semibold text-emerald-700">Verification Complete — {result.passed} of {result.totalGates} gates passed.</p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {result.failed > 0 && (
              <button
                onClick={handleRetry}
                disabled={running}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Retry Failed Gates
              </button>
            )}
            <button
              onClick={() => setResult(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              Dismiss Summary
            </button>
          </div>
        </div>
      )}

      {/* Pre-verification review dialog */}
      {showPreReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !running && setShowPreReview(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">
                {showPreReview === 'verify_all_eligible' ? 'Verify All Eligible' : 'Verify Remaining'}
              </h3>
            </div>
            <div className="space-y-2 text-xs text-slate-600">
              <p><strong>EWO:</strong> {ewoRef}</p>
              <p>This will process all outstanding verification gates that are currently eligible, in canonical prerequisite order.</p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                <p className="font-semibold text-amber-700">Governed Verification Rules:</p>
                <ul className="list-disc list-inside text-[11px] text-amber-600 space-y-0.5">
                  <li>Gates are processed in prerequisite dependency order</li>
                  <li>Canonical engineering artefacts are evaluated before any gate is marked Verified</li>
                  <li>Product Owner gates execute under Product Owner authority</li>
                  <li>Dependent gates are blocked after prerequisite failure</li>
                  <li>Product Owner Acceptance is never granted automatically</li>
                </ul>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 block mb-1">Product Owner Notes (optional)</label>
                <textarea
                  value={poNotes}
                  onChange={e => setPoNotes(e.target.value)}
                  placeholder="Optional notes for this verification run..."
                  rows={2}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowPreReview(null)}
                disabled={running}
                className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRun}
                disabled={running}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg disabled:opacity-50"
              >
                {running ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying...</> : <><CheckCircle2 className="w-3.5 h-3.5" /> Confirm Verification</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

// ============================================================
// Verification Section Component
// ============================================================

const GATE_ICONS: Record<VerificationGateKey, typeof Code> = {
  build: Code,
  functional: Activity,
  ui: Camera,
  data: Database,
  constitutional: Scale,
};

function VerificationSection({ ewoId, ewoRef, ewoStatus, ewo, verificationStatus, verifiedAt, onRefreshEwo, verificationBump }: {
  ewoId: string;
  ewoRef: string;
  verificationStatus: VerificationOverallStatus;
  verifiedAt: string | null;
  ewoStatus: EWOStatus;
  ewo: EWO;
  onRefreshEwo?: () => Promise<void>;
  // EWO-017R.11B: Bump counter that increments after any verification operation.
  // Triggers a canonical reload of gates so the matrix reflects persisted state.
  verificationBump?: number;
}) {
  const [gates, setGates] = useState<VerificationGate[]>([]);
  const [gateDeps, setGateDeps] = useState<GateDependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  // EWO-017R.9 — Persistent governed verification result panel.
  // Replaces the transient toast that disappeared after a few seconds.
  // Failure results remain visible until dismissed or corrected.
  const [verificationResult, setVerificationResult] = useState<{
    gateLabel: string;
    outcome: string;
    message: string;
    missingArtefacts: string[] | null;
    timestamp: string;
  } | null>(null);

  useEffect(() => {
    loadGates();
  }, [ewoId, verificationBump]);

  async function loadGates() {
    setLoading(true);
    try {
      await initializeVerificationGates(ewoId);
      const summary = await getVerificationSummary(ewoId);
      setGates(summary.gates);
      try {
        const deps = await loadGateDependencies();
        setGateDeps(deps);
      } catch {
        setGateDeps([]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  // EWO-017R.8 — Individual Verify delegates to the SAME canonical engine as
  // Verify All Eligible. Both workflows now produce identical eligibility
  // decisions, artefact eligibility, lifecycle progression and audit records.
  async function handleGateUpdate(gateKey: VerificationGateKey, newStatus: VerificationGateStatus) {
    setUpdating(gateKey);
    setTransitionError(null);
    try {
      if (newStatus === 'verified') {
        // Canonical path: delegate to performVerification (same as Verify All)
        const gate = gates.find(g => g.gate_key === gateKey);
        if (!gate) throw new Error('Gate not found');
        const classification = GATE_CLASSIFICATION[gateKey] ?? 'automated';
        const failedGateKeys = new Set<VerificationGateKey>();
        for (const g of gates) {
          if (g.status === 'failed') failedGateKeys.add(g.gate_key);
        }
        const pvResult = await performVerification({
          workOrderId: ewoId,
          gate,
          gateLabel: gate.gate_label,
          classification,
          deps: gateDeps,
          allGates: gates,
          failedGateKeys,
          requestedBy: 'Product Owner',
          notes: 'Individual Verify (canonical engine)',
          deferProductOwnerGates: false,
          loadedContext: {
            workOrderId: ewo.id,
            workOrderRef: ewo.ewo_ref,
            status: ewo.status,
            implementationStatus: ewo.implementation_status as string | undefined,
            reportGenerationStatus: ewo.report_generation_status as string | undefined,
            poTestingStatus: (ewo as unknown as Record<string, unknown>).po_testing_status as string | null | undefined ?? null,
            productOwnerVerificationStatus: (ewo as unknown as Record<string, unknown>).product_owner_verification_status as string | undefined,
            loadedAt: new Date().toISOString(),
          },
        });
        if (pvResult.outcome === 'artefacts_required') {
          setVerificationResult({
            gateLabel: gate.gate_label,
            outcome: pvResult.outcome,
            message: pvResult.gateResult.missing_artefacts?.length
              ? `Blocked: ${pvResult.gateResult.missing_artefacts.join('; ')}`
              : 'Verification requirements not met',
            missingArtefacts: pvResult.gateResult.missing_artefacts,
            timestamp: new Date().toISOString(),
          });
        } else if (pvResult.outcome === 'blocked') {
          setVerificationResult({
            gateLabel: gate.gate_label,
            outcome: pvResult.outcome,
            message: pvResult.gateResult.blocking_reason ?? 'Gate blocked by prerequisites.',
            missingArtefacts: null,
            timestamp: new Date().toISOString(),
          });
        } else if (pvResult.outcome === 'failed') {
          setVerificationResult({
            gateLabel: gate.gate_label,
            outcome: pvResult.outcome,
            message: pvResult.gateResult.failure_reason ?? 'Gate verification failed.',
            missingArtefacts: null,
            timestamp: new Date().toISOString(),
          });
        } else if (pvResult.outcome === 'passed') {
          setVerificationResult({
            gateLabel: gate.gate_label,
            outcome: pvResult.outcome,
            message: `Gate verified successfully via ${pvResult.gateResult.evidence_source ?? 'canonical artefact'}`,
            missingArtefacts: null,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        // Mark as failed: direct update (no artefacts required to fail a gate)
        const result = await updateVerificationGate(ewoId, gateKey, newStatus, `Gate ${gateKey} marked as ${newStatus}`);
        const gate = gates.find(g => g.gate_key === gateKey);
        if (result.auto_transition_failed) {
          setTransitionError(result.auto_transition_error || 'Automatic transition to Report Ready failed.');
          setVerificationResult({
            gateLabel: gate?.gate_label ?? gateKey,
            outcome: 'failed',
            message: result.auto_transition_error || 'Automatic transition to Report Ready failed.',
            missingArtefacts: null,
            timestamp: new Date().toISOString(),
          });
        } else {
          setVerificationResult({
            gateLabel: gate?.gate_label ?? gateKey,
            outcome: 'failed',
            message: `Gate marked as failed.`,
            missingArtefacts: null,
            timestamp: new Date().toISOString(),
          });
        }
      }
      if (onRefreshEwo) await onRefreshEwo();
      await loadGates();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to update verification gate.';
      setTransitionError(msg);
      setVerificationResult({
        gateLabel: gateKey,
        outcome: 'failed',
        message: msg,
        missingArtefacts: null,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setUpdating(null);
    }
  }

  async function handleRetryTransition() {
    setRetrying(true);
    setTransitionError(null);
    try {
      const result = await retryAutoTransition(ewoId);
      if (!result.success) {
        setTransitionError(result.error || 'Retry failed.');
      } else {
        if (onRefreshEwo) await onRefreshEwo();
        await loadGates();
      }
    } catch (e) {
      setTransitionError(e instanceof Error ? e.message : 'Retry failed.');
    } finally {
      setRetrying(false);
    }
  }

  const overallCfg = OVERALL_STATUS_CFG[verificationStatus] ?? OVERALL_STATUS_CFG.not_started;
  const verifiedCount = gates.filter(g => g.status === 'verified').length;
  const progressPct = gates.length > 0 ? (verifiedCount / gates.length) * 100 : 0;
  const nextGate = getNextUnverifiedGate(gates);
  const allGatesVerified = verifiedCount === gates.length && gates.length > 0;
  const isReportReady = ewoStatus === 'report_generated';

  // Auto-retry transition if EWO is stuck (verification_status=verified but status not report_generated)
  useEffect(() => {
    if (allGatesVerified && !isReportReady && !transitionError && !updating && !retrying) {
      const timeout = setTimeout(() => {
        handleRetryTransition();
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [allGatesVerified, isReportReady, transitionError, updating, retrying]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="w-4 h-4 text-slate-600" />
          <h3 className="text-sm font-bold text-slate-800">Engineering Verification</h3>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${overallCfg.bg} ${overallCfg.text} ${overallCfg.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${overallCfg.dot}`} />
            {overallCfg.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{verifiedCount}/{gates.length} gates</span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? '' : '-rotate-90'}`} />
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5">
          {/* Constitutional Summary */}
          <div className="mb-4 bg-slate-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Overall Progress</span>
              <span className="text-xs font-semibold text-slate-600">{verifiedCount} / {gates.length} Gates Verified</span>
            </div>
            {/* Progress bar */}
            <div className="flex gap-1 mb-3">
              {gates.map(gate => {
                const cfg = GATE_STATUS_CFG[gate.status] ?? GATE_STATUS_CFG.not_started;
                return (
                  <div
                    key={gate.id}
                    className={`h-2 flex-1 rounded-full ${cfg.dot}`}
                    title={`${gate.gate_label}: ${cfg.label}`}
                  />
                );
              })}
            </div>
            {/* Gate status list */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {gates.map(gate => {
                const cfg = GATE_STATUS_CFG[gate.status] ?? GATE_STATUS_CFG.not_started;
                const Icon = GATE_ICONS[gate.gate_key] ?? Circle;
                return (
                  <div key={gate.id} className="flex items-center gap-1.5">
                    {gate.status === 'verified' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    ) : gate.status === 'failed' ? (
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    ) : gate.status === 'in_progress' ? (
                      <Loader2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    )}
                    <span className={`text-[11px] font-medium ${cfg.text}`}>{gate.gate_label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sequential gate cards */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {gates.map((gate, idx) => {
                const cfg = GATE_STATUS_CFG[gate.status] ?? GATE_STATUS_CFG.not_started;
                const Icon = GATE_ICONS[gate.gate_key] ?? Circle;
                const def = GATE_DEFINITIONS.find(d => d.key === gate.gate_key);
                const unlocked = isGateUnlocked(gate.gate_key, gates);
                const locked = isEvidenceLocked(gate);
                const isCurrentGate = nextGate?.gate_key === gate.gate_key;

                return (
                  <div
                    key={gate.id}
                    className={`rounded-lg border p-3 transition-all ${
                      !unlocked && gate.status === 'not_started'
                        ? 'border-slate-100 bg-slate-50/50 opacity-60'
                        : `${cfg.border} ${cfg.bg}`
                    } ${isCurrentGate ? 'ring-2 ring-blue-200' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="relative">
                          <Icon className={`w-4 h-4 ${cfg.text} shrink-0`} />
                          {idx < gates.length - 1 && (
                            <div className="absolute left-1/2 -translate-x-1/2 top-full w-px h-2 bg-slate-200" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-semibold ${cfg.text}`}>
                            {gate.gate_label}
                            {!unlocked && gate.status === 'not_started' && (
                              <span className="ml-1.5 text-[10px] text-slate-400 font-normal">
                                (complete previous gate first)
                              </span>
                            )}
                            {isCurrentGate && unlocked && gate.status !== 'verified' && (
                              <span className="ml-1.5 text-[10px] text-blue-500 font-normal">— current gate</span>
                            )}
                          </p>
                          {gate.verified_at && (
                            <p className="text-[10px] text-slate-400">
                              Verified {new Date(gate.verified_at).toLocaleDateString()} by {gate.verified_by ?? '—'}
                            </p>
                          )}
                          {gate.failure_reason && (
                            <p className="text-[10px] text-red-500 mt-0.5">{gate.failure_reason}</p>
                          )}
                          {locked && (
                            <p className="text-[10px] text-slate-400 mt-0.5 italic">Artefacts locked (immutable)</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {updating === gate.gate_key ? (
                          <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                        ) : (
                          <>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                              {cfg.label}
                            </span>
                            {!locked && unlocked && gate.status !== 'verified' && (
                              <button
                                onClick={() => handleGateUpdate(gate.gate_key, 'verified')}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-md hover:bg-emerald-100 transition-colors border border-emerald-200"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Verify
                              </button>
                            )}
                            {!locked && unlocked && gate.status !== 'failed' && (
                              <button
                                onClick={() => handleGateUpdate(gate.gate_key, 'failed')}
                                className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-100 transition-colors"
                                title="Mark as Failed"
                              >
                                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {/* Requirements checklist */}
                    {def && (
                      <div className="mt-2 pt-2 border-t border-slate-100/60">
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {def.requirements.map((req, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-[10px] text-slate-500">
                              <Check className={`w-3 h-3 shrink-0 mt-0.5 ${gate.status === 'verified' ? 'text-emerald-500' : 'text-slate-300'}`} />
                              {req}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Inline governed messages */}
          {allGatesVerified && isReportReady && (
            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              All 5 verification gates passed. EWO reached Report Ready on {verifiedAt ? new Date(verifiedAt).toLocaleString() : '—'}. Verification artefacts are now immutable.
            </div>
          )}
          {allGatesVerified && !isReportReady && !transitionError && (
            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
              All gates verified. Transitioning to Report Ready...
            </div>
          )}
          {/* EWO-017R.9 — Persistent governed verification result panel */}
          {verificationResult && (
            <div className={`mt-3 rounded-lg border px-3 py-2.5 ${
              verificationResult.outcome === 'passed'
                ? 'border-emerald-200 bg-emerald-50'
                : verificationResult.outcome === 'artefacts_required'
                ? 'border-amber-200 bg-amber-50'
                : 'border-red-200 bg-red-50'
            }`}>
              <div className="flex items-start gap-1.5 text-[10px]">
                {verificationResult.outcome === 'passed'
                  ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" />
                  : verificationResult.outcome === 'artefacts_required'
                  ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                  : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-600" />
                }
                <div className="flex-1">
                  <div className={`font-semibold ${
                    verificationResult.outcome === 'passed' ? 'text-emerald-700'
                    : verificationResult.outcome === 'artefacts_required' ? 'text-amber-700'
                    : 'text-red-700'
                  }`}>
                    {verificationResult.gateLabel}: {verificationResult.outcome === 'passed' ? 'Verified' : verificationResult.outcome === 'artefacts_required' ? 'Verification Requirements Not Met' : 'Verification Failed'}
                  </div>
                  <div className={`mt-0.5 ${
                    verificationResult.outcome === 'passed' ? 'text-emerald-600'
                    : verificationResult.outcome === 'artefacts_required' ? 'text-amber-600'
                    : 'text-red-600'
                  }`}>
                    {verificationResult.message}
                  </div>
                  {verificationResult.missingArtefacts && verificationResult.missingArtefacts.length > 0 && (
                    <div className={`mt-1.5 ${verificationResult.outcome === 'artefacts_required' ? 'text-amber-600' : 'text-red-600'}`}>
                      <div className="font-semibold">Missing engineering artefacts:</div>
                      <ul className="mt-0.5 ml-3 list-disc">
                        {verificationResult.missingArtefacts.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mt-1 text-slate-400">
                    {new Date(verificationResult.timestamp).toLocaleString()}
                  </div>
                  <button
                    onClick={() => setVerificationResult(null)}
                    className="mt-1.5 text-[10px] font-medium text-slate-500 hover:text-slate-700"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}
          {transitionError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <div className="flex items-start gap-1.5 text-[10px] text-red-700">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold">Engineering verification completed successfully.</div>
                  <div className="mt-0.5">Automatic transition to Report Ready failed: {transitionError}</div>
                  <button
                    onClick={handleRetryTransition}
                    disabled={retrying}
                    className="mt-1.5 flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded transition-colors disabled:opacity-50"
                  >
                    {retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Retry Transition
                  </button>
                </div>
              </div>
            </div>
          )}
          {verificationStatus === 'not_verified' && (
            <div className="mt-3 flex items-center gap-1.5 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              One or more verification gates failed. Resolve failures before generating a completion report.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Implementation Section ──────────────────────────────────────────────────

function ImplementationSection({ ewo, onRefresh }: { ewo: EWO; onRefresh: () => Promise<void> }) {
  const [packages, setPackages] = useState<EngineeringPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<EngineeringPackage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPackages = useCallback(async () => {
    if (!ewo?.id) return;
    const pkgs = await listEngineeringPackages(ewo.id);
    setPackages(pkgs);
  }, [ewo?.id]);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  const handleGenerate = async () => {
    setLoading(true); setError(null);
    try {
      await generateEngineeringPackage(ewo.id);
      await loadPackages();
      await onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to generate package'); }
    setLoading(false);
  };

  const handleExport = async (pkg: EngineeringPackage) => {
    await exportPackage(pkg.id, ewo.id);
    await loadPackages();
    await onRefresh();
  };

  const handleReturn = async (summary: string, files: string[], notes: string) => {
    setLoading(true); setError(null);
    try {
      await returnImplementation(ewo.id, { implementationSummary: summary, changedFiles: files, implementationNotes: notes });
      setShowReturnModal(false);
      await onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to return implementation'); }
    setLoading(false);
  };

  const handleAssign = async (provider: ImplementationProvider, reference?: string) => {
    setLoading(true); setError(null);
    try {
      await assignProvider(ewo.id, provider, reference);
      setShowAssignModal(false);
      await onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to assign provider'); }
    setLoading(false);
  };

  const implStatus = IMPLEMENTATION_STATUS_CFG[ewo.implementation_status] || IMPLEMENTATION_STATUS_CFG['Not Started'];
  const pkgStatus = PACKAGE_STATUS_CFG[ewo.engineering_package_status] || PACKAGE_STATUS_CFG['Not Generated'];
  const latestPackage = packages[0] || null;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Provider Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-slate-500" />
            <h4 className="text-sm font-semibold text-slate-700">Implementation Provider</h4>
          </div>
          {(ewo.implementation_status !== 'Implementation Complete' && ewo.implementation_status !== 'Returned') && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Reassign
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
          <div>
            <div className="text-xs text-slate-400 mb-1">Provider</div>
            <div className="font-medium text-slate-700">{PROVIDER_LABELS[ewo.implementation_provider]}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Status</div>
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${implStatus.dot}`} />
              <span className="font-medium text-slate-700">{implStatus.label}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Package Status</div>
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${pkgStatus.dot}`} />
              <span className="font-medium text-slate-700">{pkgStatus.label}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Assigned Date</div>
            <div className="font-medium text-slate-700">{ewo.implementation_started_at ? new Date(ewo.implementation_started_at).toLocaleDateString() : '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Completed Date</div>
            <div className="font-medium text-slate-700">{ewo.implementation_completed_at ? new Date(ewo.implementation_completed_at).toLocaleDateString() : '—'}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Reference</div>
            <div className="font-medium text-slate-700">{ewo.implementation_reference || '—'}</div>
          </div>
        </div>
        {latestPackage && (
          <div className="mt-3 text-xs text-slate-400">
            Package Version: <span className="font-medium text-slate-600">v{latestPackage.version}</span>
            {(ewo.implementation_status === 'Implementation Complete' || ewo.implementation_status === 'Returned') && (
              <span className="ml-2 text-amber-600 font-medium">Provider locked — implementation returned</span>
            )}
          </div>
        )}
      </div>

      {/* Engineering Package */}
      <div id="section-engineering-package" className="rounded-xl border border-slate-200 bg-white p-5 scroll-mt-40">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <PackageIcon className="h-4 w-4 text-slate-500" />
            <h4 className="text-sm font-semibold text-slate-700">Engineering Package</h4>
            {packages.length > 0 && (
              <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                ewo.status === 'closed' ? 'bg-emerald-100 text-emerald-700' :
                pkgStatus.label === 'Generated' ? 'bg-blue-100 text-blue-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                {ewo.status === 'closed' ? 'Archived' : pkgStatus.label}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {packages.length > 0 && ewo.implementation_status !== 'Implementation Complete' && ewo.implementation_status !== 'Returned' && (
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="text-xs font-medium text-slate-600 hover:text-slate-800"
              >
                Regenerate
              </button>
            )}
            {packages.length === 0 && (
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate Package'}
              </button>
            )}
          </div>
        </div>

        {packages.length === 0 ? (
          <div className="flex items-center gap-2">
            <PackageIcon className="w-4 h-4 text-slate-300" />
            <p className="text-sm text-slate-400">
              {ewo.closure_method === 'Historical Migration'
                ? 'Historical record — package not applicable'
                : 'Package not generated'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {packages.map(pkg => (
              <div key={pkg.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">v{pkg.version}</span>
                    <span className="text-xs text-slate-500">{new Date(pkg.generated_at).toLocaleString()}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedPackage(pkg)}
                      className="text-xs font-medium text-slate-600 hover:text-slate-800"
                    >
                      View
                    </button>
                    {pkg.package_status === 'generated' && (
                      <button
                        onClick={() => handleExport(pkg)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        Export
                      </button>
                    )}
                  </div>
                </div>
                {pkg.summary && <p className="mt-2 text-sm text-slate-600 line-clamp-2">{pkg.summary}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Returned Summary */}
      {ewo.implementation_summary && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-slate-500" />
            <h4 className="text-sm font-semibold text-slate-700">Returned Summary</h4>
          </div>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{ewo.implementation_summary}</p>
          {ewo.changed_files && ewo.changed_files.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-slate-400 mb-1">Changed Files ({ewo.changed_files.length})</div>
              <div className="flex flex-wrap gap-1.5">
                {ewo.changed_files.map((f, i) => (
                  <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600">{f}</span>
                ))}
              </div>
            </div>
          )}
          {ewo.implementation_notes && (
            <div className="mt-3">
              <div className="text-xs text-slate-400 mb-1">Implementation Notes</div>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{ewo.implementation_notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-slate-500" />
          <h4 className="text-sm font-semibold text-slate-700">Implementation Timeline</h4>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Package Generated</span>
            <span className="text-slate-600">{latestPackage ? new Date(latestPackage.generated_at).toLocaleString() : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Implementation Started</span>
            <span className="text-slate-600">{ewo.implementation_started_at ? new Date(ewo.implementation_started_at).toLocaleString() : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Implementation Completed</span>
            <span className="text-slate-600">{ewo.implementation_completed_at ? new Date(ewo.implementation_completed_at).toLocaleString() : '—'}</span>
          </div>
        </div>
      </div>

      {/* Return Implementation Action */}
      {ewo.implementation_status !== 'Implementation Complete' && ewo.implementation_status !== 'Returned' && (
        <button
          onClick={() => setShowReturnModal(true)}
          disabled={loading}
          className="w-full rounded-xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
        >
          Return Implementation
        </button>
      )}

      {/* Modals */}
      {showReturnModal && (
        <ReturnImplementationModal
          ewoRef={ewo.ewo_ref}
          onSubmit={handleReturn}
          onClose={() => setShowReturnModal(false)}
        />
      )}
      {showAssignModal && (
        <AssignProviderModal
          currentProvider={ewo.implementation_provider}
          currentReference={ewo.implementation_reference}
          onAssign={handleAssign}
          onClose={() => setShowAssignModal(false)}
        />
      )}
      {selectedPackage && (
        <PackageViewerModal pkg={selectedPackage} onClose={() => setSelectedPackage(null)} />
      )}
    </div>
  );
}

function ReturnImplementationModal({
  ewoRef,
  onSubmit,
  onClose,
}: {
  ewoRef: string;
  onSubmit: (summary: string, files: string[], notes: string) => void;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState('');
  const [files, setFiles] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">Return Implementation — {ewoRef}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-6">
          <div>
            <label className="text-sm font-medium text-slate-700">Implementation Summary</label>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="Describe what was implemented..."
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Changed Files (one per line)</label>
            <textarea
              value={files}
              onChange={e => setFiles(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm font-mono text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder={'src/lib/example.ts\nsrc/pages/ecc/ExamplePage.tsx'}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Implementation Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="Any additional notes..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
          <button
            onClick={() => onSubmit(summary, files.split('\n').map(f => f.trim()).filter(Boolean), notes)}
            disabled={!summary.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Return Implementation
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignProviderModal({
  currentProvider,
  currentReference,
  onAssign,
  onClose,
}: {
  currentProvider: ImplementationProvider;
  currentReference: string | null;
  onAssign: (provider: ImplementationProvider, reference?: string) => void;
  onClose: () => void;
}) {
  const [provider, setProvider] = useState<ImplementationProvider>(currentProvider);
  const [reference, setReference] = useState(currentReference || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-semibold text-slate-800">Assign Implementation Provider</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-6">
          <div>
            <label className="text-sm font-medium text-slate-700">Provider</label>
            <select
              value={provider}
              onChange={e => setProvider(e.target.value as ImplementationProvider)}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {(Object.keys(PROVIDER_LABELS) as ImplementationProvider[]).map(p => (
                <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Reference (optional)</label>
            <input
              value={reference}
              onChange={e => setReference(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="Provider reference ID..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
          <button
            onClick={() => onAssign(provider, reference || undefined)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Assign
          </button>
        </div>
      </div>
    </div>
  );
}

function PackageViewerModal({ pkg, onClose }: { pkg: EngineeringPackage; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(pkg.package_body || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-slate-800">Engineering Package — v{pkg.version}</h3>
            <span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{pkg.package_status}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy Package'}
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="overflow-auto p-6">
          <pre className="whitespace-pre-wrap text-sm text-slate-700 font-mono leading-relaxed">{pkg.package_body}</pre>
        </div>
      </div>
    </div>
  );
}

// EWO-023: Engineering Records Section Component
function EngineeringRecordsSection({ ewoRef, ewoId, ewoStatus }: { ewoRef: string; ewoId: string; ewoStatus: string }) {
  const [records, setRecords] = useState<GeneratedRecord[]>([]);
  const [alerts, setAlerts] = useState<RecordHealthAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [orchestrating, setOrchestrating] = useState(false);
  const [healthReport, setHealthReport] = useState<{ complete: boolean; missing: string[] } | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const [recs, healthAlerts] = await Promise.all([
      getRecordsForEwo(ewoRef),
      getHealthAlerts(ewoRef),
    ]);
    setRecords(recs);
    setAlerts(healthAlerts.filter(a => a.status === 'open'));
    setHealthReport({
      complete: healthAlerts.length === 0 || healthAlerts.every(a => a.status === 'resolved'),
      missing: healthAlerts.filter(a => a.status === 'open').map(a => a.missing_record_type),
    });
    setLoading(false);
  }, [ewoRef]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleOrchestrate = async () => {
    setOrchestrating(true);
    await orchestrateRecords(ewoRef, ewoStatus);
    await loadRecords();
    setOrchestrating(false);
  };

  const recordTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      prompt: 'Prompt', completion_report: 'Completion Report', testing: 'Testing',
      acceptance: 'Acceptance', verification: 'Verification',
      engineering_package: 'Package', engineering_summary: 'Summary',
      timeline_snapshot: 'Timeline', change_log_entry: 'Change Log',
      audit_record: 'Audit', architecture_decision: 'Architecture Decision',
      constitutional_decision: 'Constitutional Decision', historical_recovery: 'Historical Recovery',
      knowledge_extraction: 'Knowledge', release_record: 'Release',
    };
    return labels[type] ?? type;
  };

  const statusColor = (status: string): string => {
    const colors: Record<string, string> = {
      generated: 'bg-blue-100 text-blue-700',
      verified: 'bg-emerald-100 text-emerald-700',
      accepted: 'bg-emerald-100 text-emerald-700',
      archived: 'bg-slate-100 text-slate-600',
      superseded: 'bg-amber-100 text-amber-700',
      draft: 'bg-slate-100 text-slate-500',
    };
    return colors[status] ?? 'bg-slate-100 text-slate-600';
  };

  return (
    <section id="section-engineering-records" className="mx-6 mt-4 scroll-mt-24">
      <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
        <Archive className="w-4 h-4 text-blue-500" /> Engineering Records
        <span className="ml-auto flex items-center gap-2">
          {healthReport && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${healthReport.complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {healthReport.complete ? 'Complete' : `${healthReport.missing.length} missing`}
            </span>
          )}
          <button
            onClick={handleOrchestrate}
            disabled={orchestrating}
            className="px-2 py-1 text-[10px] font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
          >
            {orchestrating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {orchestrating ? 'Orchestrating...' : 'Orchestrate Records'}
          </button>
        </span>
      </h3>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
        {loading && <div className="text-xs text-slate-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading records...</div>}
        {!loading && records.length === 0 && (
          <div className="text-xs text-slate-500">
            No engineering records generated yet. Click "Orchestrate Records" to auto-generate.
          </div>
        )}
        {!loading && records.length > 0 && (
          <div className="space-y-2">
            {records.map((record) => (
              <div key={record.id} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
                <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="text-xs font-medium text-slate-700 flex-1">{recordTypeLabel(record.record_type)}</span>
                <span className="text-[10px] font-mono text-slate-400">{record.record_ref}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${statusColor(record.orchestrator_status ?? record.status ?? 'generated')}`}>
                  {record.orchestrator_status ?? record.status ?? 'generated'}
                </span>
                <span className="text-[9px] text-slate-400">v{record.record_version ?? record.version_number ?? 1}</span>
                <span className="text-[9px] text-slate-400">{record.created_at ? new Date(record.created_at).toLocaleDateString() : ''}</span>
              </div>
            ))}
          </div>
        )}
        {alerts.length > 0 && (
          <div className="border-t border-slate-200 pt-2 space-y-1">
            <span className="text-xs text-amber-600 font-medium flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Missing Records</span>
            {alerts.map((alert) => (
              <div key={alert.id} className="flex items-center gap-2 text-xs">
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-amber-100 text-amber-700">{recordTypeLabel(alert.missing_record_type)}</span>
                <span className="text-slate-500">Missing — {alert.severity} severity</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function EWODetail({
  ewo,
  events,
  report,
  provenance,
  enrichments,
  onEnriched,
  onEdit,
  onTransition,
  onGenerateReport,
  onClose,
  onReloadEwo,
  verificationBump,
  onVerificationBump,
}: {
  ewo: EWO;
  events: LifecycleEvent[];
  report: CompletionReport | null;
  provenance: EngineeringProvenance | null;
  enrichments: EvidenceEnrichment[];
  onEnriched: (ewoId: string) => void;
  onEdit: () => void;
  onTransition: (toStatus: EWOStatus, label: string) => void;
  onGenerateReport: () => void;
  onClose: () => void;
  onReloadEwo: () => Promise<void>;
  // EWO-017R.11B: Canonical post-verification refresh signal. Incremented after
  // any verification operation (batch or individual) to trigger a reload of all
  // verification-dependent UI components without a browser refresh.
  verificationBump: number;
  onVerificationBump: () => void;
}) {
  const nextAction = NEXT_ACTIONS[ewo.status];
  const [showReport, setShowReport] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [copiedPreview, setCopiedPreview] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<string>('');

  // EWO-017R.2: Canonical execution launch state
  const [execLaunching, setExecLaunching] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [execEligibility, setExecEligibility] = useState<CanonicalEligibilityResult | null>(null);
  const [activeSession, setActiveSession] = useState<{ hasActiveSession: boolean; execution: any } | null>(null);
  const [viewingExec, setViewingExec] = useState(false);
  const [viewExecError, setViewExecError] = useState<string | null>(null);

  useEffect(() => {
    setExecError(null);
    setExecEligibility(null);
    checkExecutionEligibility(ewo.id).then(setExecEligibility).catch(() => {});
    getActiveSession(ewo.id).then(setActiveSession).catch(() => setActiveSession({ hasActiveSession: false, execution: null }));
  }, [ewo.id]);

  async function handleBeginExecution() {
    setExecLaunching(true);
    setExecError(null);
    try {
      const result = await beginEngineeringExecution(ewo.id, {
        actor: 'Product Owner',
        onProgress: () => {},
      });
      if (result.success && result.executionRef) {
        navigateToExecutionWorkspace(result.executionRef);
      } else if (!result.success && result.error) {
        const msg = generateGovernedFailureMessage(result.error);
        setExecError(`${msg.title}: ${msg.explanation} ${msg.lifecycleState} ${msg.recommendedAction}`);
      }
    } catch (e) {
      setExecError(e instanceof Error ? e.message : 'Failed to begin execution');
    } finally {
      setExecLaunching(false);
    }
  }

  function handleViewActiveExecution() {
    setViewExecError(null);
    const ref = execEligibility?.activeExecutionSession?.executionRef
      ?? activeSession?.execution?.execution_ref
      ?? null;
    if (!ref) {
      setViewExecError('No active execution reference found. The execution may have been archived or the eligibility data is stale. Try re-evaluating the execution state.');
      return;
    }
    setViewingExec(true);
    try {
      const ok = navigateToExecutionWorkspace(ref);
      if (!ok) {
        setViewExecError(`Failed to navigate to execution ${ref}. The route could not be generated.`);
      }
    } catch (e) {
      setViewExecError(e instanceof Error ? e.message : 'Failed to navigate to execution workspace');
    } finally {
      setViewingExec(false);
    }
  }

  const isHistorical = ewo.closure_method === 'Historical Migration'
    || ewo.closure_method === 'System Migration'
    || ewo.closure_method === 'Engineering Governance Migration';

  const sectionTabs = useMemo(() => {
    const tabs = [
      { id: 'section-completion-report', label: 'Completion Report', icon: FileText, always: true },
      { id: 'section-engineering-record', label: 'Engineering Record', icon: Archive, always: true },
      { id: 'section-engineering-plan', label: 'Engineering Plan', icon: ClipboardList, always: true },
      { id: 'section-engineering-identity', label: 'Engineering Identity', icon: Fingerprint, always: true },
      { id: 'section-engineering-package', label: 'Engineering Package', icon: PackageIcon, always: true },
      { id: 'section-engineering-timeline', label: 'Engineering Timeline', icon: Clock, always: true },
      { id: 'section-verification-evidence', label: 'Verification Artefacts', icon: ShieldCheck, always: true },
      { id: 'section-verification-matrix', label: 'Verification Matrix', icon: ShieldCheck, always: true },
      { id: 'section-po-test-guide', label: 'PO Test Guide', icon: ClipboardList, always: true },
      { id: 'section-lifecycle-history', label: 'Lifecycle History', icon: History, always: true },
      { id: 'section-related-audits', label: 'Related Audits', icon: ClipboardList, always: true },
      { id: 'section-refinement-hierarchy', label: 'Refinement Tree', icon: GitBranch, always: true },
      { id: 'section-engineering-records', label: 'Engineering Records', icon: Archive, always: true },
    ];
    return tabs.filter(t => t.always || document.getElementById(t.id));
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const containerTop = container.getBoundingClientRect().top;
        let best: { id: string; dist: number } | null = null;
        for (const tab of sectionTabs) {
          const el = document.getElementById(tab.id);
          if (!el) continue;
 const rect = el.getBoundingClientRect();
          const dist = Math.abs(rect.top - containerTop - 160);
          if (!best || dist < best.dist) best = { id: tab.id, dist };
        }
        if (best) setActiveSection((best as { id: string; dist: number }).id);
      });
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => container.removeEventListener('scroll', onScroll);
  }, [sectionTabs]);

  // Build a preview report body from EWO data + lifecycle events (pre-generation)
  function buildPreviewReportBody(ewoData: EWO, lifecycleEvents: LifecycleEvent[]): string {
    const lifecycleSummary = lifecycleEvents
      .map(ev => `  ${fmtDateTime(ev.created_at)} — ${ev.from_status ?? '—'} → ${ev.to_status} (${ev.actor ?? 'system'})`)
      .join('\n');
    return [
      `═══════════════════════════════════════════════`,
      `ENGINEERING COMPLETION REPORT (PREVIEW)`,
      `Work Order: ${ewoData.ewo_ref}`,
      `Title: ${ewoData.title}`,
      `Generated: ${new Date().toLocaleString('en-AU')}`,
      `═══════════════════════════════════════════════`,
      ``,
      `EXECUTIVE SUMMARY`,
      `─────────────────────────────────────────`,
      ewoData.executive_summary ?? 'No executive summary available.',
      ``,
      `SCOPE`,
      `─────────────────────────────────────────`,
      ewoData.scope ?? 'No scope defined.',
      ``,
      `LIFECYCLE SUMMARY`,
      `─────────────────────────────────────────`,
      lifecycleSummary || 'No lifecycle events recorded.',
      ``,
      `VERIFICATION STATUS`,
      `─────────────────────────────────────────`,
      ewoData.verification_status ?? 'not_started',
      ewoData.verified_at ? `Verified at: ${fmtDateTime(ewoData.verified_at)}` : '',
      ``,
      `IMPLEMENTATION`,
      `─────────────────────────────────────────`,
      `Provider: ${ewoData.implementation_provider}`,
      `Status: ${ewoData.implementation_status}`,
      ewoData.implementation_summary ?? 'No implementation summary.',
      ``,
      `CLOSURE`,
      `─────────────────────────────────────────`,
      ewoData.closure_method ? `Method: ${ewoData.closure_method}` : '',
      ewoData.closure_reason ? `Reason: ${ewoData.closure_reason}` : '',
      !isHistorical && ewoData.po_accepted_by ? `Accepted by: ${ewoData.po_accepted_by}` : '',
      !isHistorical && ewoData.po_accepted_at ? `Accepted at: ${fmtDateTime(ewoData.po_accepted_at)}` : '',
      ``,
      `═══════════════════════════════════════════════`,
      `LLND Automate · Engineering Execution Engine`,
      `═══════════════════════════════════════════════`,
    ].filter(Boolean).join('\n');
  }

  const lifecycleIdx = LIFECYCLE.findIndex(l => l.status === ewo.status);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100 shrink-0">
        <div className="min-w-0 flex-1 mr-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-bold text-slate-400 font-mono">{ewo.ewo_ref}</span>
            <StatusBadge status={ewo.status} />
            <PriorityBadge priority={ewo.priority} />
            <ClassificationBadge classification={ewo.engineering_classification || 'Engineering'} />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 leading-tight">{ewo.title}</h2>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500">
            <span className="flex items-center gap-1"><User className="w-3 h-3" /> Engineering Owner: <strong className="text-slate-700">{ewo.owner || ewo.implementation_provider || 'ATD'}</strong></span>
            <span className="flex items-center gap-1"><UserCheck className="w-3 h-3" /> Product Owner: <strong className="text-slate-700">{ewo.product_owner || 'Millie Robinson'}</strong></span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
            <Edit3 className="w-3.5 h-3.5" /> Edit
          </button>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Lifecycle progress */}
      <div className="px-6 py-3 bg-slate-50 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {LIFECYCLE.filter(l => l.status !== 'archived').map((l, idx) => {
            const done = idx < lifecycleIdx;
            const current = idx === lifecycleIdx;
            return (
              <div key={l.status} className="flex items-center gap-0.5 shrink-0">
                {idx > 0 && <div className={`w-3 h-0.5 ${done ? 'bg-blue-400' : 'bg-slate-200'}`} />}
                <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium transition-colors ${
                  current ? 'bg-blue-600 text-white' :
                  done ? 'bg-blue-100 text-blue-700' :
                  'bg-slate-100 text-slate-400'
                }`}>
                  {done && <Check className="w-2.5 h-2.5" />}
                  {l.short}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sticky section tabs */}
      <div className="px-4 py-1.5 bg-white border-b border-slate-200 shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
          {sectionTabs.map(tab => {
            const Icon = tab.icon;
            const active = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => scrollToSection(scrollRef.current, tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">

        {/* Engineering Provenance (historical records only) */}
        {isHistorical && provenance && (
          <div className="mx-6 mt-4">
            <EngineeringProvenancePanel
              provenance={provenance}
              enrichments={enrichments}
              onEnrich={onEnriched}
              ewoId={ewo.id}
            />
          </div>
        )}

        {/* EWO-022: Refinement Hierarchy & Provenance */}
        <section id="section-refinement-hierarchy" className="mx-6 mt-4 scroll-mt-24">
          <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><GitBranch className="w-4 h-4 text-blue-500" /> Refinement Hierarchy & Provenance</h3>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            {/* Implementation Source */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Implementation Source:</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{ewo.implementation_source ?? 'unknown'}</span>
            </div>
            {/* Originating Prompt */}
            {ewo.originating_prompt_ref && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-medium">Originating Prompt:</span>
                <span className="font-mono text-slate-700">{ewo.originating_prompt_ref}</span>
              </div>
            )}
            {/* Originating Conversation */}
            {ewo.originating_conversation_ref && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-medium">Originating Conversation:</span>
                <span className="font-mono text-slate-700">{ewo.originating_conversation_ref}</span>
              </div>
            )}
            {/* Parent EWO */}
            {ewo.parent_ref && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-medium">Parent EWO:</span>
                <span className="font-mono text-blue-600">{ewo.parent_ref}</span>
              </div>
            )}
            {/* Refinement Chain */}
            {ewo.refinement_chain && ewo.refinement_chain.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs text-slate-500 font-medium">Refinement Chain (depth {ewo.refinement_depth}):</span>
                <div className="flex items-center gap-1 flex-wrap">
                  {ewo.refinement_chain.map((ref: string, idx: number) => (
                    <div key={ref} className="flex items-center gap-1">
                      {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${ref === ewo.ewo_ref ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{ref}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Created By */}
            {ewo.created_by && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 font-medium">Created By:</span>
                <span className="text-slate-700">{ewo.created_by}</span>
              </div>
            )}
            {/* PO Acceptance Details */}
            {ewo.po_accepted_at && (
              <div className="border-t border-slate-200 pt-2 space-y-1">
                <span className="text-xs text-slate-500 font-medium">Product Owner Acceptance:</span>
                <div className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-slate-700">Accepted by <strong>{ewo.po_accepted_by ?? 'Product Owner'}</strong> on {fmtDateTime(ewo.po_accepted_at)}</span>
                </div>
                {ewo.po_acceptance_statement && (
                  <p className="text-xs text-slate-500 italic">"{ewo.po_acceptance_statement}"</p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* EWO-023: Engineering Records Panel */}
        <EngineeringRecordsSection ewoRef={ewo.ewo_ref} ewoId={ewo.id} ewoStatus={ewo.status} />

        {/* Next action */}
        {nextAction && (
          <div className="mx-6 mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <nextAction.icon className="w-4 h-4 text-blue-600 shrink-0" />
              <p className="text-sm font-medium text-blue-700 truncate">Next: {nextAction.label}</p>
            </div>
            {ewo.status === 'engineering_complete' ? (
              <button
                onClick={() => onTransition(nextAction.next, nextAction.label)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 shrink-0 transition-colors"
              >
                <ShieldCheckIcon className="w-3.5 h-3.5" /> Start Verification
              </button>
            ) : ewo.status === 'verified' ? (
              <button
                onClick={onGenerateReport}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 shrink-0 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" /> Generate Report
              </button>
            ) : (
              <button
                onClick={() => onTransition(nextAction.next, nextAction.label)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 shrink-0 transition-colors"
              >
                <nextAction.icon className="w-3.5 h-3.5" /> {nextAction.label}
              </button>
            )}
          </div>
        )}

        {/* EWO-017R.2: Governed Execution State */}
        {execEligibility && execEligibility.executionState === 'eligible' && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Zap className="w-4 h-4 text-emerald-600 shrink-0" />
              <p className="text-sm font-medium text-emerald-700 truncate">
                Ready for Engineering Execution — all prerequisites satisfied
                {execEligibility.isTestCandidate && <span className="ml-1.5 text-emerald-500">(Test Candidate)</span>}
              </p>
            </div>
            <button
              onClick={handleBeginExecution}
              disabled={execLaunching}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 shrink-0 transition-colors disabled:opacity-50"
            >
              {execLaunching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              {execLaunching ? 'Starting...' : 'Begin Engineering Execution'}
            </button>
          </div>
        )}

        {/* EWO-017R.2: Active session — View / Resume */}
        {execEligibility && execEligibility.executionState === 'active_session' && (
          <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-sm font-medium text-amber-700 truncate">
                Active execution session: {execEligibility.activeExecutionSession.executionRef} ({execEligibility.activeExecutionSession.status})
              </p>
            </div>
            <button
              onClick={handleViewActiveExecution}
              disabled={viewingExec}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-semibold rounded-lg hover:bg-amber-700 shrink-0 transition-colors disabled:opacity-50"
            >
              {viewingExec ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
              {viewingExec ? 'Opening...' : 'View Execution'}
            </button>
          </div>
        )}

        {/* EWO-017R.2: Completed execution */}
        {execEligibility && execEligibility.executionState === 'completed' && (
          <div className="mx-6 mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <p className="text-sm font-medium text-blue-700 truncate">Execution completed</p>
            </div>
            <button
              onClick={handleViewActiveExecution}
              disabled={viewingExec}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 shrink-0 transition-colors disabled:opacity-50"
            >
              {viewingExec ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
              {viewingExec ? 'Opening...' : 'View Completed Execution'}
            </button>
          </div>
        )}

        {/* EWO-017R.2: Historical implementation without session */}
        {execEligibility && execEligibility.executionState === 'historical_no_session' && (
          <div className="mx-6 mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-start gap-2">
              <Archive className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-600">Implementation Already Completed</p>
                <p className="text-xs text-slate-500 mt-0.5">No canonical execution session exists. Historical implementation evidence only.</p>
              </div>
            </div>
          </div>
        )}

        {/* EWO-017R.2: Failed resumable */}
        {execEligibility && execEligibility.executionState === 'failed_resumable' && (
          <div className="mx-6 mt-4 p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
              <p className="text-sm font-medium text-orange-700 truncate">Execution failed — resumable</p>
            </div>
            <button
              onClick={handleViewActiveExecution}
              disabled={viewingExec}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 text-white text-xs font-semibold rounded-lg hover:bg-orange-700 shrink-0 transition-colors disabled:opacity-50"
            >
              {viewingExec ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              {viewingExec ? 'Opening...' : 'Review Failed Execution'}
            </button>
          </div>
        )}

        {/* EWO-017R.2: Failed — requires restart */}
        {execEligibility && execEligibility.executionState === 'failed_restart' && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-700">Execution failed — restart required</p>
                <p className="text-xs text-red-500 mt-0.5">Address the failure reason and start a new execution.</p>
              </div>
            </div>
          </div>
        )}

        {/* EWO-017R.2: Closed */}
        {execEligibility && execEligibility.executionState === 'closed' && (
          <div className="mx-6 mt-4 p-3 bg-slate-100 border border-slate-200 rounded-xl">
            <div className="flex items-start gap-2">
              <Archive className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-500">Execution unavailable — work order is closed</p>
              </div>
            </div>
          </div>
        )}

        {/* EWO-017R.2: Ineligible — artefact-backed reasons */}
        {execEligibility && execEligibility.executionState === 'ineligible' && execEligibility.blockingReasons.length > 0 && (
          <div className="mx-6 mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-600">Not Eligible for Engineering Execution</p>
                <ul className="mt-1.5 space-y-1.5">
                  {execEligibility.blockingReasons.map((r, i) => (
                    <li key={i} className="text-xs text-slate-500">
                      <span className="font-medium text-slate-600">{r.prerequisite}:</span> {r.detail}
                      <span className="block text-slate-400 mt-0.5">→ {r.recommendedAction}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* EWO-017R.4: View Execution governed failure */}
        {viewExecError && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-700">Cannot Open Execution</p>
                <p className="text-xs text-red-600 mt-1">{viewExecError}</p>
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => { setViewExecError(null); checkExecutionEligibility(ewo.id).then(setExecEligibility).catch(() => {}); getActiveSession(ewo.id).then(setActiveSession).catch(() => setActiveSession({ hasActiveSession: false, execution: null })); }} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Re-evaluate Execution State</button>
                  <button onClick={() => { setViewExecError(null); window.location.hash = '#/engineering/execution'; }} className="text-xs text-slate-500 hover:text-slate-700 font-medium">Return to Execution Dashboard</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EWO-017R.1: Execution failure message */}
        {execError && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-700">Execution Failed</p>
                <p className="text-xs text-red-600 mt-1">{execError}</p>
              </div>
            </div>
          </div>
        )}

        <div className="px-6 py-4 space-y-5">
          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {[
              { label: 'Owner',           value: ewo.owner },
              { label: 'Requested By',    value: ewo.requested_by },
              { label: 'Risk Level',      value: ewo.risk_level ? ewo.risk_level.charAt(0).toUpperCase() + ewo.risk_level.slice(1) : null },
              { label: 'Estimated Effort',value: ewo.estimated_effort },
              { label: 'Target Date',     value: fmtDate(ewo.target_date) },
              { label: 'Created',         value: fmtDate(ewo.created_at) },
              { label: 'Started',         value: fmtDate(ewo.started_at) },
              { label: 'Completed',       value: fmtDate(ewo.completed_at) },
            ].map(({ label, value }) => value && value !== '—' ? (
              <div key={label}>
                <p className="text-xs font-medium text-slate-400">{label}</p>
                <p className="text-sm text-slate-700 mt-0.5">{value}</p>
              </div>
            ) : null)}
          </div>

          {/* Sections */}
          {[
            { label: 'Executive Summary', value: ewo.executive_summary },
            { label: 'Business Objective', value: ewo.business_objective },
            { label: 'Engineering Objective', value: ewo.engineering_objective },
            { label: 'Business Value', value: ewo.business_value },
            { label: 'Scope', value: ewo.scope },
            { label: 'Out of Scope', value: ewo.out_of_scope },
            { label: 'Validation Requirements', value: ewo.validation_requirements },
            { label: 'Engineering Notes', value: ewo.engineering_notes },
            { label: 'Architecture Review Notes', value: ewo.architecture_review_notes },
            { label: 'Validation Notes', value: ewo.validation_notes },
            ...(isHistorical ? [] : [{ label: 'PO Acceptance Notes', value: ewo.po_acceptance_notes }]),
            { label: 'Closed By', value: ewo.closed_by },
            { label: 'Closed At', value: ewo.closed_at ? new Date(ewo.closed_at).toLocaleString() : null },
            { label: 'Closure Reason', value: ewo.closure_reason },
            { label: 'Closure Method', value: ewo.closure_method },
          ].filter(s => s.value).map(s => (
            <div key={s.label}>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{s.label}</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{s.value}</p>
            </div>
          ))}

          {/* Relationships */}
          {(ewo.dependencies.length > 0 || ewo.related_features.length > 0 || ewo.related_releases.length > 0) && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Relationships</p>
              <div className="space-y-1.5">
                {ewo.dependencies.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span className="text-xs text-slate-500 font-medium">Dependencies:</span>
                    <span className="text-xs text-slate-700">{ewo.dependencies.join(', ')}</span>
                  </div>
                )}
                {ewo.related_features.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span className="text-xs text-slate-500 font-medium">Features:</span>
                    <span className="text-xs text-slate-700">{ewo.related_features.join(', ')}</span>
                  </div>
                )}
                {ewo.related_releases.length > 0 && (
                  <div className="flex items-start gap-2">
                    <GitBranch className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span className="text-xs text-slate-500 font-medium">Releases:</span>
                    <span className="text-xs text-slate-700">{ewo.related_releases.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Verification Artefacts */}
          <div id="section-verification-evidence" className="scroll-mt-40">
          <ConstitutionalVerificationPanel ewoId={ewo.id} onRefresh={async () => { await onReloadEwo(); onVerificationBump(); }} />
          <VerificationOrchestrationPanel ewoId={ewo.id} ewoRef={ewo.ewo_ref} ewo={ewo} onRefresh={async () => { await onReloadEwo(); onVerificationBump(); }} />
          <VerificationSection
            ewoId={ewo.id}
            ewoRef={ewo.ewo_ref}
            verificationStatus={ewo.verification_status ?? 'not_started'}
            verifiedAt={ewo.verified_at}
            ewoStatus={ewo.status}
            ewo={ewo}
            onRefreshEwo={async () => { await onReloadEwo(); onVerificationBump(); }}
            verificationBump={verificationBump}
          />
          </div>

          {/* Engineering Verification Matrix (EWO-014.18) */}
          <div id="section-verification-matrix" className="scroll-mt-40">
            <ECCVerificationMatrixPanel ewoId={ewo.id} ewoRef={ewo.ewo_ref} verificationBump={verificationBump} />
          </div>

          {/* Product Owner Testing Guide (EWO-014.18R) */}
          <div id="section-po-test-guide" className="scroll-mt-40">
            <ECCPOTestGuidePanel
              ewoId={ewo.id}
              ewoRef={ewo.ewo_ref}
              ewoTitle={ewo.title}
              riskLevel={ewo.risk_level ?? 'medium'}
            />
          </div>

          {/* Implementation Section */}
          <div id="section-engineering-record" className="scroll-mt-40">
          <ImplementationSection ewo={ewo} onRefresh={onReloadEwo} />
          </div>

          {/* Engineering Plan */}
          <div id="section-engineering-plan" className="scroll-mt-40">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="h-4 w-4 text-slate-500" />
                <h4 className="text-sm font-semibold text-slate-700">Engineering Plan</h4>
              </div>
              <p className="text-sm text-slate-600">{ewo.engineering_objective || ewo.scope || 'No engineering plan documented.'}</p>
            </div>
          </div>

          {/* Engineering Identity */}
          <div id="section-engineering-identity" className="scroll-mt-40">
            <EngineeringIdentityPanel ewoRef={ewo.ewo_ref} />
          </div>

          {/* Engineering Timeline */}
          <div id="section-engineering-timeline" className="scroll-mt-40">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-slate-500" />
                <h4 className="text-sm font-semibold text-slate-700">Engineering Timeline</h4>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'Created', date: ewo.created_at },
                  { label: 'Started', date: ewo.started_at },
                  { label: 'Verified', date: ewo.verified_at },
                  { label: 'Completed', date: ewo.completed_at },
                  { label: 'Closed', date: ewo.closed_at },
                ].filter(t => t.date).map(t => (
                  <div key={t.label} className="flex items-center gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-slate-500 font-medium w-24">{t.label}</span>
                    <span className="text-slate-700">{new Date(t.date ?? '').toLocaleString()}</span>
                  </div>
                ))}
                {events.length === 0 && (!ewo.created_at && !ewo.started_at) && (
                  <p className="text-sm text-slate-400">No timeline events recorded.</p>
                )}
              </div>
            </div>
          </div>

          {/* Completion Report — 5-state clarity */}
          <div id="section-completion-report" className="scroll-mt-40">
          {report ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Completion Report</p>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                    {report.accepted_at ? 'Final Archived Report' : 'Preview Report'}
                  </span>
                </div>
                <button
                  onClick={() => setShowReport(s => !s)}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  {showReport ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showReport ? 'Hide' : 'View Report'}
                </button>
              </div>
              <div className={`p-3 border rounded-xl ${report.accepted_at ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  {report.accepted_at
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    : <FileText className="w-4 h-4 text-blue-600" />}
                  <p className="text-sm font-medium text-slate-800">{report.accepted_at ? 'Final Archived Report' : 'Preview Report'}</p>
                </div>
                <p className="text-xs text-slate-600">{fmtDateTime(report.generated_at)}</p>
                {report.accepted_at && (
                  <p className="text-xs text-emerald-700 mt-1">Accepted: {fmtDateTime(report.accepted_at)} {report.accepted_by ? `by ${report.accepted_by}` : ''}</p>
                )}
                {!report.accepted_at && (
                  <p className="text-xs text-blue-600 mt-1">Report will be archived upon Product Owner Acceptance.</p>
                )}
              </div>

              {/* Copy buttons — always visible */}
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={async () => {
                    const previewBody = buildPreviewReportBody(ewo, events);
                    try {
                      await navigator.clipboard.writeText(previewBody);
                    } catch {
                      fallbackCopy(previewBody);
                    }
                    setCopiedPreview(true);
                    setTimeout(() => setCopiedPreview(false), 2000);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                >
                  {copiedPreview ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedPreview ? 'Copied' : 'Copy Preview'}
                </button>
                <button
                  onClick={async () => {
                    const fullBody = report.report_body ?? buildPreviewReportBody(ewo, events);
                    try {
                      await navigator.clipboard.writeText(fullBody);
                    } catch {
                      fallbackCopy(fullBody);
                    }
                    setCopiedReport(true);
                    setTimeout(() => setCopiedReport(false), 2000);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  {copiedReport ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedReport ? 'Copied' : 'Copy Full Report'}
                </button>
              </div>

              {showReport && (
                <pre className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 whitespace-pre-wrap font-mono overflow-x-auto">
                  {report.report_body ?? buildPreviewReportBody(ewo, events)}
                </pre>
              )}
            </div>
          ) : (
            /* Report state clarity for EWOs without a report */
            (() => {
              const isHistorical = ewo.closure_method === 'Historical Migration'
                || ewo.closure_method === 'System Migration'
                || ewo.closure_method === 'Engineering Governance Migration';
              const genStatus = ewo.report_generation_status;

              if (isHistorical) {
                return (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="flex items-start gap-2">
                      <Archive className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-slate-600">Historical Record — No Report Expected</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          This EWO was migrated as a historical record via {ewo.closure_method ?? 'Historical Migration'}. Completion reports are not generated for historical migrations.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              if (genStatus === 'failed') {
                return (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-red-800">Engineering Completion Report generation failed.</p>
                        <p className="text-[11px] text-red-700 mt-1">
                          Report generation was attempted during Product Owner Acceptance but failed. You can retry below.
                        </p>
                        <button
                          onClick={async () => {
                            try {
                              const { error } = await supabase.rpc('execute_po_acceptance_closure', {
                                p_ewo_id: ewo.id,
                                p_accepted_by: ewo.po_accepted_by ?? 'Product Owner',
                                p_acceptance_statement: ewo.po_acceptance_statement ?? 'Product Owner Acceptance: Retry Report Generation',
                              });
                              if (error) throw error;
                              onReloadEwo();
                            } catch (e) {
                              console.error('Report retry failed:', e);
                            }
                          }}
                          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Generate Report
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              if (genStatus === 'pending') {
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start gap-2">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 animate-spin" />
                      <div>
                        <p className="text-xs font-semibold text-amber-800">Report Generation Pending</p>
                        <p className="text-[11px] text-amber-700 mt-1">
                          The completion report is being generated. Please wait.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              if (ewo.status === 'report_generated' || ewo.status === 'po_acceptance') {
                return (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-blue-800">Report Ready — Pending Acceptance</p>
                        <p className="text-[11px] text-blue-700 mt-1">
                          The completion report will be archived upon Product Owner Acceptance.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              if (ewo.status === 'closed' || ewo.status === 'archived') {
                return (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-slate-600">No Engineering Completion Report available.</p>
                        <p className="text-[11px] text-slate-400 mt-1">
                          This EWO was closed via {ewo.closure_method ?? 'an unknown method'} and no completion report was generated.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-amber-800">Report Not Yet Available</p>
                      <p className="text-[11px] text-amber-700 mt-1">
                        The completion report will be generated once the EWO passes verification and reaches Report Ready status.
                      </p>
                      <div className="mt-2 flex items-center gap-1 text-[10px] text-amber-600 flex-wrap">
                        <span className="font-semibold">Engineering Validation</span>
                        <ArrowRight className="w-3 h-3" />
                        <span className="font-semibold">Engineering Complete</span>
                        <ArrowRight className="w-3 h-3" />
                        <span className="font-semibold">Verification</span>
                        <ArrowRight className="w-3 h-3" />
                        <span className="font-semibold">Verified</span>
                        <ArrowRight className="w-3 h-3" />
                        <span className="font-semibold">Report Ready</span>
                      </div>
                      <p className="text-[10px] text-amber-600 mt-2">
                        Current status: <span className="font-semibold">{STATUS_CFG[ewo.status]?.label ?? ewo.status}</span>
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()
          )}

          </div>

          {/* Related Engineering Audits (BUG-006: bidirectional EWO→Audit traceability) */}
          <div id="section-related-audits" className="scroll-mt-40">
            <RelatedEngineeringAuditsSection ewoRef={ewo.ewo_ref} />
          </div>

          {/* Lifecycle history */}
          <div id="section-lifecycle-history" className="scroll-mt-40">
          {events.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Lifecycle History</p>
              <div className="space-y-2">
                {events.map(ev => {
                  const toCfg = STATUS_CFG[ev.to_status as EWOStatus];
                  const isIntermediate = ev.from_status === ev.to_status && ev.from_status !== null;
                  const isMigration = ewo.closure_method === 'Historical Migration'
                    || ewo.closure_method === 'System Migration'
                    || ewo.closure_method === 'Engineering Governance Migration';
                  const isPoAcceptance = !isMigration && ev.to_status === 'closed' && (
                    ev.notes?.includes('Product Owner') || ewo.closure_method === 'Product Owner Acceptance'
                  );
                  return (
                    <div key={ev.id} className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${isMigration ? 'bg-purple-400' : isPoAcceptance ? 'bg-emerald-500' : isIntermediate ? 'bg-blue-400' : (toCfg?.dot ?? 'bg-slate-400')}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium text-slate-700">
                            {isIntermediate
                              ? (ev.notes?.split('.')[0] ?? ev.to_status)
                              : `${ev.from_status ? (STATUS_CFG[ev.from_status as EWOStatus]?.label ?? ev.from_status) + ' → ' : ''}${toCfg?.label ?? ev.to_status}`}
                          </p>
                          {ev.actor && <span className="text-[10px] text-slate-400">{ev.actor}</span>}
                          {isMigration && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">{ewo.closure_method ?? 'Historical Migration'}</span>}
                          {isPoAcceptance && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Product Owner Acceptance</span>}
                        </div>
                        {ev.notes && <p className="text-xs text-slate-500 mt-0.5">{ev.notes}</p>}
                        {isPoAcceptance && !isHistorical && ewo.po_accepted_by && (
                          <div className="mt-1 space-y-0.5">
                            <p className="text-[10px] text-slate-500">Accepted by: <span className="font-medium text-slate-700">{ewo.po_accepted_by}</span></p>
                            {ewo.po_accepted_at && <p className="text-[10px] text-slate-500">Accepted at: <span className="font-medium text-slate-700">{fmtDateTime(ewo.po_accepted_at)}</span></p>}
                            {ewo.closure_method && <p className="text-[10px] text-slate-500">Closure method: <span className="font-medium text-slate-700">{ewo.closure_method}</span></p>}
                          </div>
                        )}
                        {isMigration && (
                          <div className="mt-1 space-y-0.5">
                            {ewo.closure_method && <p className="text-[10px] text-slate-500">Migration type: <span className="font-medium text-slate-700">{ewo.closure_method}</span></p>}
                            {ewo.closure_reason && <p className="text-[10px] text-slate-500">Reason: <span className="font-medium text-slate-700">{ewo.closure_reason}</span></p>}
                          </div>
                        )}
                        <p className="text-[10px] text-slate-400 mt-0.5">{fmtDateTime(ev.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard Panel ──────────────────────────────────────────────────────────

// ─── Implementation Dashboard Widgets ────────────────────────────────────────

function ImplementationDashboardWidgets({ ewos, onSelectEwo }: { ewos: EWO[]; onSelectEwo: (e: EWO) => void }) {
  const [metrics, setMetrics] = useState<{
    totalPackages: number;
    waitingForImplementation: number;
    inProgress: number;
    returnedForValidation: number;
    avgImplementationTime: string;
    providerDistribution: { provider: string; count: number }[];
  } | null>(null);

  useEffect(() => {
    getImplementationMetrics(ewos as unknown as Record<string, unknown>[]).then(setMetrics).catch(() => {});
  }, [ewos]);

  if (!metrics) return null;

  const widgets = [
    { label: 'Engineering Packages', value: metrics.totalPackages, icon: PackageIcon, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Waiting For Implementation', value: metrics.waitingForImplementation, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Implementation In Progress', value: metrics.inProgress, icon: Server, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Returned For Validation', value: metrics.returnedForValidation, icon: FileText, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Avg Implementation Time', value: metrics.avgImplementationTime, icon: Clock, color: 'text-violet-600', bg: 'bg-violet-50' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {widgets.map(w => {
          const Icon = w.icon;
          return (
            <div key={w.label} className={`rounded-xl border border-slate-200 ${w.bg} p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`h-4 w-4 ${w.color}`} />
                <span className="text-xs font-medium text-slate-500">{w.label}</span>
              </div>
              <div className="text-xl font-bold text-slate-800">{w.value}</div>
            </div>
          );
        })}
      </div>

      {/* Provider Distribution */}
      {metrics.providerDistribution.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Provider Distribution</h4>
          <div className="flex flex-wrap gap-3">
            {metrics.providerDistribution.map(p => {
              const pct = ewos.length > 0 ? Math.round((p.count / ewos.length) * 100) : 0;
              return (
                <div key={p.provider} className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-600">{PROVIDER_LABELS[p.provider as ImplementationProvider] || p.provider}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{p.count} ({pct}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Waiting For Implementation List */}
      {metrics.waitingForImplementation > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Waiting For Implementation</h4>
          <div className="space-y-1.5">
            {ewos.filter(e => e.engineering_package_status === 'Generated' && e.implementation_status === 'Not Started').map(e => (
              <button
                key={e.id}
                onClick={() => onSelectEwo(e)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-slate-700">{e.ewo_ref} — {e.title}</span>
                <span className="text-xs text-slate-400">{PROVIDER_LABELS[e.implementation_provider]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardView({ ewos, onSelectEwo, historicalRefs, onSelectHistRef, ledgerFilter }: { ewos: EWO[]; onSelectEwo: (e: EWO) => void; historicalRefs: HistoricalReference[]; onSelectHistRef: (ref: string) => void; ledgerFilter: LedgerFilter }) {
  const active = ewos.filter(e => ACTIVE_STATUSES.includes(e.status));
  const closed = ewos.filter(e => e.status === 'closed');
  // Closed count includes Historical Reference placeholders per Requirement 7
  const closedWithPlaceholders = closed.length + historicalRefs.length;
  const byPriority = (p: Priority) => ewos.filter(e => e.priority === p && ACTIVE_STATUSES.includes(e.status));
  const inProgress = ewos.filter(e => e.status === 'in_progress');
  const needsAction = ewos.filter(e => ['architecture_review', 'po_approved', 'engineering_validation', 'po_acceptance'].includes(e.status));

  // Build a combined sorted list of closed EWOs and Historical Reference placeholders
  // for the Closed view, preserving numbering continuity.
  type ClosedRow =
    | { kind: 'ewo'; ref: string; title: string; status: string; classification: string; productOwner: string; ewo: EWO }
    | { kind: 'hist'; ref: string; title: string; hr: HistoricalReference };

  const closedRows: ClosedRow[] = [
    ...closed.map(e => ({
      kind: 'ewo' as const, ref: e.ewo_ref, title: e.title, status: e.status,
      classification: e.engineering_classification || 'Engineering',
      productOwner: e.product_owner || 'Millie Robinson', ewo: e,
    })),
    ...historicalRefs.map(hr => ({
      kind: 'hist' as const, ref: hr.reference, title: hr.title, hr,
    })),
  ].sort((a, b) => {
    const numA = parseInt(a.ref.replace('EWO-', '').replace(/[^0-9].*/, ''), 10) || 0;
    const numB = parseInt(b.ref.replace('EWO-', '').replace(/[^0-9].*/, ''), 10) || 0;
    if (numA !== numB) return numA - numB;
    return a.ref.localeCompare(b.ref);
  });

  const statCards = [
    { label: 'Total Work Orders', value: ewos.length, icon: ClipboardList, color: 'text-slate-600', bg: 'bg-slate-100' },
    { label: 'Active',            value: active.length, icon: Activity,     color: 'text-blue-600',  bg: 'bg-blue-50'  },
    { label: 'In Progress',       value: inProgress.length, icon: Zap,      color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Completed',         value: closedWithPlaceholders, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Needs Action',      value: needsAction.length, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Critical Priority', value: byPriority('critical').length, icon: Flag, color: 'text-red-600', bg: 'bg-red-50' },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-3">
              <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center mb-2`}>
                <Icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          );
        })}
      </div>

        {/* Closed Engineering view with Historical Reference placeholders */}
        {ledgerFilter === 'closed' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-slate-800">Closed Engineering</h3>
              <span className="ml-auto text-xs text-slate-400">{closedRows.length} records</span>
            </div>
            <div className="divide-y divide-slate-50">
              {closedRows.map(row => (
                <button
                  key={row.ref}
                  onClick={() => row.kind === 'ewo' ? onSelectEwo(row.ewo) : onSelectHistRef(row.ref)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                >
                  <span className="font-mono text-xs font-bold text-slate-500 whitespace-nowrap w-28 shrink-0">{row.ref}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{row.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {row.kind === 'ewo' ? (
                        <>
                          <StatusBadge status={row.status as EWOStatus} />
                          <ClassificationBadge classification={row.classification} />
                          <span className="text-[10px] text-slate-400">PO: {row.productOwner}</span>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                          <Ban className="w-2.5 h-2.5" /> Historical — Not Issued
                        </span>
                      )}
                    </div>
                  </div>
                  {row.kind === 'hist' && (
                    <span className="text-[10px] text-blue-500 font-medium whitespace-nowrap">Open Historical Reference →</span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Verification Progress */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <ShieldCheckIcon className="w-4 h-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-slate-800">Verification Progress</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-5 gap-2 mb-4">
            {GATE_DEFINITIONS.map(gate => {
              const Icon = GATE_ICONS[gate.key];
              const ewosWithGate = ewos.filter(e => ACTIVE_STATUSES.includes(e.status));
              return (
                <div key={gate.key} className="text-center">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center mx-auto mb-1.5">
                    <Icon className="w-4 h-4 text-slate-400" />
                  </div>
                  <p className="text-[10px] font-semibold text-slate-600">{gate.label.split(' ')[0]}</p>
                </div>
              );
            })}
          </div>
          <div className="space-y-1.5">
            {ewos.filter(e => ACTIVE_STATUSES.includes(e.status) && e.verification_status && e.verification_status !== 'not_started').slice(0, 5).map(e => {
              const cfg = OVERALL_STATUS_CFG[e.verification_status as VerificationOverallStatus] ?? OVERALL_STATUS_CFG.not_started;
              return (
                <button key={e.id} onClick={() => onSelectEwo(e)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-lg transition-colors text-left">
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} shrink-0`} />
                  <p className="text-xs font-medium text-slate-700 truncate flex-1">{e.ewo_ref} · {e.title}</p>
                  <span className={`text-[10px] font-bold ${cfg.text}`}>{cfg.label}</span>
                </button>
              );
            })}
            {ewos.filter(e => ACTIVE_STATUSES.includes(e.status) && e.verification_status && e.verification_status !== 'not_started').length === 0 && (
              <p className="text-xs text-slate-400 text-center py-2">No verification in progress</p>
            )}
          </div>
        </div>
      </div>

      {/* Implementation Overview */}
      <ImplementationDashboardWidgets ewos={ewos} onSelectEwo={onSelectEwo} />

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Needs Action */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-800">Needs Action</h3>
            <span className="ml-auto text-xs text-slate-400">{needsAction.length}</span>
          </div>
          {needsAction.length === 0 ? (
            <div className="p-4 text-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
              <p className="text-xs text-slate-400">No work orders awaiting action</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {needsAction.map(e => (
                <button key={e.id} onClick={() => onSelectEwo(e)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{e.ewo_ref} · {e.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={e.status} />
                      <PriorityBadge priority={e.priority} />
                    </div>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* In Progress */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <Zap className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-800">In Progress</h3>
            <span className="ml-auto text-xs text-slate-400">{inProgress.length}</span>
          </div>
          {inProgress.length === 0 ? (
            <div className="p-4 text-center">
              <Circle className="w-6 h-6 text-slate-200 mx-auto mb-1" />
              <p className="text-xs text-slate-400">No work orders in progress</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {inProgress.map(e => (
                <button key={e.id} onClick={() => onSelectEwo(e)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{e.ewo_ref} · {e.title}</p>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{e.executive_summary}</p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Status Breakdown */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <BarChart3 className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-800">Status Distribution</h3>
          </div>
          <div className="p-4 space-y-2">
            {LIFECYCLE.filter(l => {
              const count = ewos.filter(e => e.status === l.status).length;
              return count > 0;
            }).map(l => {
              const count = ewos.filter(e => e.status === l.status).length;
              const pct = Math.round((count / ewos.length) * 100);
              const cfg = STATUS_CFG[l.status];
              return (
                <div key={l.status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-600">{l.label}</span>
                    <span className="text-xs font-semibold text-slate-700">{count}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${cfg.dot}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <TrendingUp className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-800">All Work Orders</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {ewos.slice(0, 6).map(e => (
              <button key={e.id} onClick={() => onSelectEwo(e)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{e.ewo_ref} · {e.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={e.status} />
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Kanban View ──────────────────────────────────────────────────────────────

function KanbanView({ ewos, onSelectEwo }: { ewos: EWO[]; onSelectEwo: (e: EWO) => void }) {
  return (
    <div className="p-4 h-full overflow-x-auto">
      <div className="flex gap-3 h-full min-w-max">
        {KANBAN_COLUMNS.map(col => {
          const cards = ewos.filter(e => col.statuses.includes(e.status));
          return (
            <div key={col.label} className={`w-60 shrink-0 bg-slate-50 rounded-xl border border-slate-200 border-t-4 ${col.color} flex flex-col`}>
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200">
                <span className="text-xs font-semibold text-slate-700">{col.label}</span>
                <span className="text-xs text-slate-400 bg-white border border-slate-200 rounded-full px-1.5 py-0.5">{cards.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {cards.map(e => (
                  <button
                    key={e.id}
                    onClick={() => onSelectEwo(e)}
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 text-left hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-[10px] font-bold text-slate-400 font-mono">{e.ewo_ref}</span>
                      <PriorityBadge priority={e.priority} />
                    </div>
                    <p className="text-xs font-semibold text-slate-800 leading-snug mb-2">{e.title}</p>
                    {e.executive_summary && (
                      <p className="text-[11px] text-slate-400 line-clamp-2 mb-2">{e.executive_summary}</p>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      {e.owner && <span className="flex items-center gap-0.5"><User className="w-2.5 h-2.5" />{e.owner}</span>}
                      {e.estimated_effort && <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{e.estimated_effort}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Table View ───────────────────────────────────────────────────────────────

function TableView({ ewos, onSelectEwo }: { ewos: EWO[]; onSelectEwo: (e: EWO) => void }) {
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-sm">
        <thead className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <tr>
            {['ID', 'Title', 'Status', 'Classification', 'Priority', 'Eng. Owner', 'Product Owner', 'Risk', 'Effort', 'Target', 'Created'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ewos.map(e => (
            <tr
              key={e.id}
              onClick={() => onSelectEwo(e)}
              className="hover:bg-slate-50 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3 font-mono text-xs font-bold text-slate-500 whitespace-nowrap">{e.ewo_ref}</td>
              <td className="px-4 py-3 max-w-[280px]">
                <p className="text-sm font-medium text-slate-800 truncate">{e.title}</p>
                {e.executive_summary && <p className="text-xs text-slate-400 truncate">{e.executive_summary}</p>}
              </td>
              <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={e.status} /></td>
              <td className="px-4 py-3 whitespace-nowrap"><ClassificationBadge classification={e.engineering_classification || 'Engineering'} /></td>
              <td className="px-4 py-3 whitespace-nowrap"><PriorityBadge priority={e.priority} /></td>
              <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{e.owner || 'ATD'}</td>
              <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{e.product_owner || 'Millie Robinson'}</td>
              <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap capitalize">{e.risk_level}</td>
              <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{e.estimated_effort || '—'}</td>
              <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(e.target_date)}</td>
              <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(e.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Timeline View ────────────────────────────────────────────────────────────

function TimelineView({ ewos, onSelectEwo }: { ewos: EWO[]; onSelectEwo: (e: EWO) => void }) {
  const sorted = [...ewos].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />
        <div className="space-y-4">
          {sorted.map(e => {
            const cfg = STATUS_CFG[e.status];
            return (
              <div key={e.id} className="relative flex items-start gap-4 pl-10">
                <div className={`absolute left-2.5 w-3 h-3 rounded-full ${cfg.dot} border-2 border-white ring-2 ring-slate-200 z-10`} />
                <button
                  onClick={() => onSelectEwo(e)}
                  className="flex-1 bg-white border border-slate-200 rounded-xl p-4 text-left hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-slate-400 font-mono">{e.ewo_ref}</span>
                        <StatusBadge status={e.status} />
                        <PriorityBadge priority={e.priority} />
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{e.title}</p>
                      {e.executive_summary && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{e.executive_summary}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-1" />
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(e.created_at)}</span>
                    {e.owner && <span className="flex items-center gap-1"><User className="w-3 h-3" />{e.owner}</span>}
                    {e.estimated_effort && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{e.estimated_effort}</span>}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Related Engineering Audits Section (BUG-006) ─────────────────────────────

function RelatedEngineeringAuditsSection({ ewoRef }: { ewoRef: string }) {
  const [audits, setAudits] = useState<EngineeringAuditRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAuditsForEwo(ewoRef).then(result => {
      if (!cancelled) {
        setAudits(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [ewoRef]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-xs text-slate-400 animate-pulse">
        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
        Loading related audits…
      </div>
    );
  }

  if (audits.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList className="w-4 h-4 text-teal-600" />
        <h3 className="text-sm font-semibold text-slate-800">Related Engineering Audits</h3>
        <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-medium bg-teal-50 text-teal-600">
          {audits.length} audit{audits.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="space-y-3">
        {audits.map(audit => (
          <a
            key={audit.id}
            href={`#/engineering/audits/${audit.id}`}
            onClick={(e) => {
              e.preventDefault();
              window.location.hash = `#/engineering/audits/${audit.id}`;
            }}
            className="group flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:border-teal-300 hover:bg-teal-50/30 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal-50 shrink-0">
              <ClipboardList className="w-5 h-5 text-teal-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">{audit.audit_number}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${audit.status === 'closed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                  {audit.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">{audit.name}</p>
              <div className="flex items-center gap-3 mt-1">
                {audit.overall_health_score !== null && (
                  <span className="text-[10px] text-slate-400">Health: <span className="font-semibold text-slate-600">{audit.overall_health_score}%</span></span>
                )}
                {audit.audit_type && (
                  <span className="text-[10px] text-slate-400">Type: <span className="font-semibold text-slate-600 capitalize">{audit.audit_type.replace(/_/g, ' ')}</span></span>
                )}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500 shrink-0" />
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ECCWorkOrdersPage({ objectRef, subPath }: { objectRef?: string; subPath?: string } = {}) {
  const [ewos, setEwos] = useState<EWO[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('dashboard');
  const [selectedEwo, setSelectedEwo] = useState<EWO | null>(null);
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [report, setReport] = useState<CompletionReport | null>(null);
  const [provenance, setProvenance] = useState<EngineeringProvenance | null>(null);
  const [enrichments, setEnrichments] = useState<EvidenceEnrichment[]>([]);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingEwo, setEditingEwo] = useState<EWO | null>(null);
  const [showTransition, setShowTransition] = useState<{ to: EWOStatus; label: string } | null>(null);
  const [showPOAcceptance, setShowPOAcceptance] = useState(false);
  const [poAcceptanceSaving, setPOAcceptanceSaving] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<EWOStatus | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<Priority | 'all'>('all');
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>('all');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  // EWO-017R.11B: Canonical post-verification refresh signal. Incremented after
  // any verification operation (batch or individual) to trigger a reload of all
  // verification-dependent UI components without a browser refresh.
  const [verificationBump, setVerificationBump] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportWarning, setExportWarning] = useState<string | null>(null);
  const [exportWarningRef, setExportWarningRef] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [historicalRefs, setHistoricalRefs] = useState<HistoricalReference[]>([]);
  const [selectedHistRef, setSelectedHistRef] = useState<string | null>(null);
  const [unifiedResults, setUnifiedResults] = useState<LedgerEntry[]>([]);
  const [unifiedSearching, setUnifiedSearching] = useState(false);
  const [exactMatchOverride, setExactMatchOverride] = useState<LedgerEntry | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteSuccessRef, setDeleteSuccessRef] = useState<string | null>(null);
  const [showMarkAsTest, setShowMarkAsTest] = useState(false);
  const [showRemoveTest, setShowRemoveTest] = useState(false);

  async function load() {
    setLoading(true);
    const [ewoRes, histRes] = await Promise.all([
      supabase.from('engineering_work_orders').select('*'),
      listHistoricalReferences(),
    ]);
    setEwos(sortEwosByRef(ewoRes.data || []));
    setHistoricalRefs(histRes);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // EWO-014.13: Auto-select EWO from URL objectRef (direct object navigation)
  useEffect(() => {
    if (!objectRef || (ewos.length === 0 && historicalRefs.length === 0)) return;
    if (selectedEwo?.ewo_ref === objectRef) return; // already selected — avoid loop
    if (selectedHistRef === objectRef) return;
    const found = ewos.find(e => e.ewo_ref === objectRef);
    if (found) {
      selectEwo(found);
    } else {
      // Check if it's a Historical Reference
      const histFound = historicalRefs.find(h => h.reference === objectRef);
      if (histFound) {
        setSelectedHistRef(histFound.reference);
        setView('detail');
      } else {
        supabase.from('engineering_work_orders').select('*').eq('ewo_ref', objectRef).maybeSingle().then(({ data }) => {
          if (data) selectEwo(data as EWO);
        });
      }
    }
  }, [objectRef, ewos, historicalRefs]);

  // EWO-014.7: Auto-select EWO when navigated from ATD Workspace
  useEffect(() => {
    const handler = async () => {
      const targetId = sessionStorage.getItem('ecc_selected_ewo_id');
      if (targetId) {
        sessionStorage.removeItem('ecc_selected_ewo_id');
        // Wait for ewos to load if needed
        const findEwo = async () => {
          let found = ewos.find(e => e.id === targetId);
          if (!found) {
            const { data } = await supabase
              .from('engineering_work_orders')
              .select('*')
              .eq('id', targetId)
              .single();
            found = data as EWO | undefined;
          }
          if (found) {
            await selectEwo(found);
          }
        };
        findEwo();
      }
    };
    window.addEventListener('ecc:navigateToWorkOrders', handler);
    return () => window.removeEventListener('ecc:navigateToWorkOrders', handler);
  }, [ewos]);

  async function loadEwoDetails(ewo: EWO) {
    const [eventsRes, reportRes, provRes, enrichRes] = await Promise.all([
      supabase.from('ewo_lifecycle_events').select('*').eq('ewo_id', ewo.id).order('created_at', { ascending: false }),
      supabase.from('ewo_completion_reports').select('*').eq('ewo_id', ewo.id).order('generated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('ewo_engineering_provenance').select('*').eq('ewo_id', ewo.id).maybeSingle(),
      supabase.from('ewo_evidence_enrichments').select('*').eq('ewo_id', ewo.id).order('enriched_at', { ascending: false }),
    ]);
    setEvents(eventsRes.data || []);
    setReport(reportRes.data || null);
    setProvenance(provRes.data as EngineeringProvenance | null);
    setEnrichments((enrichRes.data || []) as EvidenceEnrichment[]);
  }

  async function handleEnriched(ewoId: string) {
    const [enrichRes, provRes] = await Promise.all([
      supabase.from('ewo_evidence_enrichments').select('*').eq('ewo_id', ewoId).order('enriched_at', { ascending: false }),
      supabase.rpc('calculate_ewo_confidence', { p_ewo_id: ewoId }),
    ]);
    setEnrichments((enrichRes.data || []) as EvidenceEnrichment[]);
    if (provRes.data) {
      const conf = provRes.data as { score: number; level: string; evidence: EngineeringProvenance['evidence_available'] };
      await supabase.from('ewo_engineering_provenance').update({
        confidence_score: conf.score,
        confidence_level: conf.level,
        evidence_available: conf.evidence,
        updated_at: new Date().toISOString(),
      }).eq('ewo_id', ewoId);
      const { data: newProv } = await supabase.from('ewo_engineering_provenance').select('*').eq('ewo_id', ewoId).maybeSingle();
      setProvenance(newProv as EngineeringProvenance | null);
    }
  }

  async function selectEwo(ewo: EWO) {
    setSelectedEwo(ewo);
    setView('detail');
    const slug = ewo.ewo_ref.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const canonicalUrl = `#/engineering/work-orders/${slug}`;
    if (window.location.hash !== canonicalUrl) {
      window.location.hash = canonicalUrl;
    }
    pushNavHistory({ object_ref: ewo.ewo_ref, object_type: 'engineering_work_order', title: ewo.title, canonical_url: canonicalUrl });
    saveNavContext({ object_ref: ewo.ewo_ref, object_type: 'engineering_work_order', section: 'work-orders' });
    await loadEwoDetails(ewo);
  }

  async function handleTransitionComplete() {
    setShowTransition(null);
    if (selectedEwo) {
      const { data } = await supabase.from('engineering_work_orders').select('*').eq('id', selectedEwo.id).single();
      if (data) { setSelectedEwo(data); await loadEwoDetails(data); }
    }
    await load();
  }

  async function handleReportGenerated() {
    setShowReportModal(false);
    if (selectedEwo) {
      const { data } = await supabase.from('engineering_work_orders').select('*').eq('id', selectedEwo.id).single();
      if (data) { setSelectedEwo(data); await loadEwoDetails(data); }
    }
    await load();
  }

  async function handleArchive(ewo: EWO) {
    await supabase.from('engineering_work_orders')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', ewo.id);
    await supabase.from('ewo_lifecycle_events').insert({
      ewo_id: ewo.id,
      from_status: ewo.status,
      to_status: 'archived',
      actor: 'ATD',
      notes: 'Archived by operator',
    });
    if (selectedEwo?.id === ewo.id) {
      setSelectedEwo(null);
      if (window.location.hash.includes(`/${ewo.ewo_ref.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`)) {
        window.location.hash = '#/engineering/work-orders';
      }
    }
    await load();
  }

  async function handleEwoDeleted(result: EwoDeleteResult) {
    setShowDeleteModal(false);
    setSelectedEwo(null);
    if (window.location.hash.includes('/work-orders/')) {
      window.location.hash = '#/engineering/work-orders';
    }
    await load();
    if (result.deletedEwoRef) {
      setDeleteSuccessRef(result.deletedEwoRef);
    }
  }

  // EWO-014.13A: Governed PO Acceptance Closure — calls the 11-step RPC
  async function handlePOAcceptance(ewo: EWO, acceptanceStatement: string, acceptanceNotes: string) {
    setPOAcceptanceSaving(true);
    const { data, error } = await supabase.rpc('execute_po_acceptance_closure', {
      p_ewo_id: ewo.id,
      p_accepted_by: 'Product Owner',
      p_acceptance_statement: acceptanceStatement,
      p_acceptance_notes: acceptanceNotes || null,
    });
    setPOAcceptanceSaving(false);
    if (error) {
      console.error('[EWO-014.13A] Governed closure failed:', error);
      alert(`Governed closure failed: ${error.message}`);
      return;
    }
    // Check if report generation failed
    const result = data as { success?: boolean; report_generated?: boolean; errors?: string[] } | null;
    if (result?.errors && result.errors.length > 0) {
      const reportError = result.errors.find((e: string) => e.includes('Report'));
      if (reportError) {
        alert(`Engineering Completion Report generation failed. You can retry from the Completion Report section.`);
      }
    }
    // Refresh the EWO from DB
    const { data: updated } = await supabase.from('engineering_work_orders').select('*').eq('id', ewo.id).single();
    if (updated) { setSelectedEwo(updated); await loadEwoDetails(updated); }
    await load();
  }

  // Next EWO ref
  const nextRef = (() => {
    const nums = ewos.map(e => parseInt(e.ewo_ref.replace('EWO-', ''), 10)).filter(n => !isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `EWO-${String(next).padStart(3, '0')}`;
  })();

  // Unified search: when search text changes, search both EWOs and Historical References
  useEffect(() => {
    if (!search.trim()) {
      setUnifiedResults([]);
      setExactMatchOverride(null);
      return;
    }
    setUnifiedSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchUnifiedLedger(search);
      setUnifiedResults(results);
      // Detect exact match override (bypasses lifecycle filter)
      const exact = results.find(r => r.isExactMatch);
      setExactMatchOverride(exact ?? null);
      setUnifiedSearching(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  // Filtered list — sorted by semantic EWO reference
  const filtered = sortEwosByRef(ewos.filter(e => {
    if (!applyLedgerFilter(e, ledgerFilter)) return false;
    if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    if (filterPriority !== 'all' && e.priority !== filterPriority) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.title.toLowerCase().includes(q) || e.ewo_ref.toLowerCase().includes(q) || (e.executive_summary || '').toLowerCase().includes(q);
    }
    return true;
  }));

  // Paginated slice for performance
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  // Ledger counters
  const nonTestEwos = ewos.filter(e => !e.is_test_artifact);
  const testEwos = ewos.filter(e => e.is_test_artifact);
  const closedCount = nonTestEwos.filter(e => e.status === 'closed').length + historicalRefs.length;
  const counts = {
    total: nonTestEwos.length + historicalRefs.length,
    active: nonTestEwos.filter(e => ACTIVE_STATUSES.includes(e.status)).length,
    closed: closedCount,
    historical: nonTestEwos.filter(e => e.is_historical_import || e.closure_method === 'Historical Migration').length,
    historical_ref: historicalRefs.length,
    awaiting_po: nonTestEwos.filter(e => e.status === 'po_acceptance').length,
    archived: nonTestEwos.filter(e => e.status === 'archived').length,
    test: testEwos.length,
  };

  const VIEW_BTNS: { mode: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
    { mode: 'dashboard', icon: LayoutGrid, label: 'Dashboard' },
    { mode: 'kanban',    icon: Kanban,     label: 'Kanban'    },
    { mode: 'table',     icon: List,       label: 'Table'     },
    { mode: 'timeline',  icon: Activity,   label: 'Timeline'  },
  ];

  const isFullscreen = view === 'detail';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Engineering Work Orders</h1>
            <p className="text-xs text-slate-400 mt-0.5">Engineering Ledger · {counts.total} Total · {counts.active} Active · {counts.closed} Closed · {counts.historical} Historical · {counts.historical_ref} Historical Refs · {counts.awaiting_po} Awaiting PO · {counts.archived} Archived · {counts.test} Test</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View switcher */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
              {VIEW_BTNS.map(b => {
                const Icon = b.icon;
                return (
                  <button
                    key={b.mode}
                    onClick={() => setView(b.mode)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      view === b.mode ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {b.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowImportWizard(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold rounded-lg hover:bg-amber-100 transition-colors"
                >
                  <Archive className="w-4 h-4" /> Historical Import
                </button>
                <button
                  onClick={() => { setEditingEwo(null); setShowForm(true); }}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" /> Manual Work Order
                </button>
                {(ledgerFilter === 'closed' || ledgerFilter === 'archived') && (
                  <button
                    onClick={async () => {
                      setExporting(true);
                      setExportWarning(null);
                      setExportWarningRef(null);
                      setExportSuccess(false);
                      try {
                        const classification = ledgerFilter.startsWith('classification_')
                          ? ledgerFilter.replace('classification_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                          : null;
                        const result: EWOExportResult = await exportClosedWorkOrders(
                          { searchText: search, classification, closedOnly: true },
                          counts.closed,
                        );
                        if (result.success && result.workbook) {
                          const blob = new Blob([result.workbook], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = result.filename;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                          setExportSuccess(true);
                          setTimeout(() => setExportSuccess(false), 3000);
                        } else if (result.governedResponse) {
                          setExportWarning(result.governedResponse.summary);
                          setExportWarningRef(result.governedResponse.referenceCode);
                        }
                      } catch (err) {
                        setExportWarning('Export failed unexpectedly.');
                        setExportWarningRef('EIOS-WOEXPORT-004');
                      } finally {
                        setExporting(false);
                      }
                    }}
                    disabled={exporting}
                    className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={search || (ledgerFilter.startsWith('classification_')) ? 'Download filtered closed Work Orders as spreadsheet' : 'Download all closed Work Orders as spreadsheet'}
                  >
                    {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : exportSuccess ? <Check className="w-4 h-4 text-emerald-600" /> : <FileSpreadsheet className="w-4 h-4" />}
                    {exporting ? 'Exporting...' : exportSuccess ? 'Downloaded!' : 'Download Spreadsheet'}
                  </button>
                )}
              </div>
              {exportWarning && (
                <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-amber-700">{exportWarning}</p>
                    {exportWarningRef && (
                      <span className="text-[10px] font-mono text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200 mt-1 inline-block">{exportWarningRef}</span>
                    )}
                  </div>
                </div>
              )}
              <span className="text-xs text-slate-400">For exceptional engineering only. Normal Work Orders are automatically created from approved Engineering Plans.</span>
            </div>
          </div>
        </div>

        {/* Search & filters (not shown in detail view) */}
        {view !== 'detail' && (
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                placeholder="Search work orders and historical references…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
              />
              {unifiedSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-slate-300" />
              )}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {FILTER_CFG.map(f => {
                const isActive = ledgerFilter === f.key;
                const count = f.key === 'all' ? counts.total
                  : f.key === 'active' ? counts.active
                  : f.key === 'closed' ? counts.closed
                  : f.key === 'historical' ? counts.historical
                  : f.key === 'historical_ref' ? counts.historical_ref
                  : f.key === 'awaiting_po' ? counts.awaiting_po
                  : f.key === 'archived' ? counts.archived
                  : f.key === 'test' ? counts.test
                  : ewos.filter(e => applyLedgerFilter(e, f.key)).length;
                return (
                  <button
                    key={f.key}
                    onClick={() => { setLedgerFilter(f.key); setPage(0); }}
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-blue-500' : 'bg-slate-200'}`}>{count}</span>
                  </button>
                );
              })}
            </div>
            <select
              className="input text-sm py-2"
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value as EWOStatus | 'all'); setPage(0); }}
            >
              <option value="all">All Statuses</option>
              {LIFECYCLE.map(l => <option key={l.status} value={l.status}>{l.label}</option>)}
            </select>
            <select
              className="input text-sm py-2"
              value={filterPriority}
              onChange={e => { setFilterPriority(e.target.value as Priority | 'all'); setPage(0); }}
            >
              <option value="all">All Priorities</option>
              {(['critical', 'high', 'medium', 'low'] as Priority[]).map(p => (
                <option key={p} value={p}>{PRIORITY_CFG[p].label}</option>
              ))}
            </select>
            {(filterStatus !== 'all' || filterPriority !== 'all' || search || ledgerFilter !== 'all') && (
              <button
                onClick={() => { setFilterStatus('all'); setFilterPriority('all'); setSearch(''); setLedgerFilter('all'); setPage(0); }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
            <span className="text-xs text-slate-400">{filtered.length} shown</span>
          </div>
        )}
      </div>

        {/* Unified search results & exact match override banner */}
        {view !== 'detail' && search.trim() && unifiedResults.length > 0 && exactMatchOverride && (
          <div className="px-6 py-2 bg-blue-50 border-b border-blue-100 shrink-0">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-blue-700">Exact Reference Match:</span>
              <button
                onClick={() => {
                  if (exactMatchOverride.type === 'ewo') {
                    const ewo = ewos.find(e => e.ewo_ref === exactMatchOverride.reference);
                    if (ewo) selectEwo(ewo);
                  } else {
                    setSelectedHistRef(exactMatchOverride.reference);
                    setView('detail');
                  }
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-medium text-slate-800 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                {exactMatchOverride.type === 'ewo' ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Canonical EWO</span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">Historical — Not Issued</span>
                )}
                <span className="font-semibold">{exactMatchOverride.reference}</span>
                <span className="text-slate-500">{exactMatchOverride.title}</span>
                <ChevronRight className="w-3 h-3 text-slate-400" />
              </button>
              <span className="text-xs text-blue-600">Returned via global exact-reference search (outside selected filter)</span>
            </div>
          </div>
        )}
        {view !== 'detail' && search.trim() && unifiedResults.length > 0 && !exactMatchOverride && ledgerFilter !== 'historical_ref' && (
          <div className="px-6 py-2 bg-slate-50 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-slate-600">Unified Search Results:</span>
              {unifiedResults.slice(0, 6).map(r => (
                <button
                  key={r.id}
                  onClick={() => {
                    if (r.type === 'ewo') {
                      const ewo = ewos.find(e => e.ewo_ref === r.reference);
                      if (ewo) selectEwo(ewo);
                    } else {
                      setSelectedHistRef(r.reference);
                      setView('detail');
                    }
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded-md text-xs hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  {r.type === 'ewo' ? (
                    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-50 text-emerald-700">EWO</span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[9px] font-semibold bg-slate-100 text-slate-600">Hist Ref</span>
                  )}
                  <span className="font-medium text-slate-700">{r.reference}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
      <div className="flex-1 overflow-hidden">
        {view === 'dashboard' && ledgerFilter !== 'historical_ref' && <div className="h-full overflow-y-auto"><DashboardView ewos={paged} onSelectEwo={selectEwo} historicalRefs={historicalRefs} onSelectHistRef={(ref) => { setSelectedHistRef(ref); setView('detail'); }} ledgerFilter={ledgerFilter} /></div>}
        {view === 'kanban' && ledgerFilter !== 'historical_ref' && <div className="h-full overflow-hidden"><KanbanView ewos={paged} onSelectEwo={selectEwo} /></div>}
        {view === 'table' && ledgerFilter !== 'historical_ref' && <div className="h-full overflow-hidden"><TableView ewos={paged} onSelectEwo={selectEwo} /></div>}
        {view === 'timeline' && ledgerFilter !== 'historical_ref' && <div className="h-full overflow-y-auto"><TimelineView ewos={paged} onSelectEwo={selectEwo} /></div>}
        {view !== 'detail' && ledgerFilter === 'historical_ref' && (
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-slate-900">Historical References</h2>
                <p className="text-xs text-slate-500 mt-0.5">Engineering Work Order references that were never issued. These records preserve Engineering Ledger numbering integrity.</p>
              </div>
              {historicalRefs.length === 0 ? (
                <div className="text-center py-12 text-sm text-slate-400">No Historical References found.</div>
              ) : (
                <div className="grid gap-3">
                  {historicalRefs.map(hr => (
                    <button
                      key={hr.id}
                      onClick={() => { setSelectedHistRef(hr.reference); setView('detail'); }}
                      className="text-left bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md hover:border-slate-300 transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            <Ban className="w-3 h-3" /> Historical Reference
                          </span>
                          <span className="text-xs text-slate-400">Status: Historical — Not Issued</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 mb-1">{hr.reference}</h3>
                      <p className="text-xs text-slate-500 line-clamp-2">{hr.evidence_summary}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {/* Pagination */}
        {totalPages > 1 && view !== 'detail' && (
          <div className="flex items-center justify-between mt-3 px-1">
            <span className="text-xs text-slate-400">Page {page + 1} of {totalPages} · {filtered.length} work orders</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <span className="text-xs text-slate-500">{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        {view === 'detail' && selectedEwo && (
          <div className="h-full overflow-hidden flex">
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="px-6 py-2.5 bg-white border-b border-slate-200 shrink-0">
                <EngineeringBreadcrumbs objectRef={selectedEwo.ewo_ref} />
              </div>
              <div className="flex-1 overflow-hidden flex">
                <div className="flex-1 overflow-hidden">
              <EWODetail
                ewo={selectedEwo}
                events={events}
                report={report}
                provenance={provenance}
                enrichments={enrichments}
                onEnriched={handleEnriched}
                onEdit={() => { setEditingEwo(selectedEwo); setShowForm(true); }}
                onTransition={(toStatus, label) => {
                  if (toStatus === 'closed') {
                    setShowPOAcceptance(true);
                  } else {
                    setShowTransition({ to: toStatus, label });
                  }
                }}
                onGenerateReport={() => setShowReportModal(true)}
                onClose={() => {
                  setView('dashboard');
                  setSelectedHistRef(null);
                  if (window.location.hash.includes('/work-orders/')) {
                    window.location.hash = '#/engineering/work-orders';
                  }
                }}
                onReloadEwo={async () => {
                  const { data } = await supabase.from('engineering_work_orders').select('*').eq('id', selectedEwo.id).single();
                  if (data) { setSelectedEwo(data); await loadEwoDetails(data); }
                }}
                verificationBump={verificationBump}
                onVerificationBump={() => setVerificationBump(b => b + 1)}
              />
                </div>
                <div className="w-72 shrink-0 border-l border-slate-200 bg-white overflow-y-auto p-3">
                  <RelatedEngineeringPanel objectRef={selectedEwo.ewo_ref} />
                </div>
              </div>
            </div>
            {/* Archive/Delete/Test actions */}
            <div className="absolute bottom-6 right-6 flex items-center gap-2">
              {selectedEwo.status !== 'archived' && !CLOSED_STATUSES.includes(selectedEwo.status) && (
                <button
                  onClick={() => handleArchive(selectedEwo)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow transition-all"
                >
                  <Archive className="w-3.5 h-3.5" /> Archive
                </button>
              )}
              {(selectedEwo as any).is_test_artifact ? (
                <button
                  onClick={() => setShowRemoveTest(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-600 hover:text-amber-800 bg-white border border-amber-200 rounded-lg shadow-sm hover:shadow transition-all"
                >
                  <FlaskConical className="w-3.5 h-3.5" /> Test Artefact
                </button>
              ) : (
                <button
                  onClick={() => setShowMarkAsTest(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-amber-500 hover:text-amber-700 bg-white border border-amber-200 rounded-lg shadow-sm hover:shadow transition-all"
                >
                  <FlaskConical className="w-3.5 h-3.5" /> Mark as Test
                </button>
              )}
              {(selectedEwo.status === 'draft' || selectedEwo.status === 'ready' || selectedEwo.status === 'archived' || (selectedEwo as any).is_test_artifact) && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500 hover:text-red-700 bg-white border border-red-200 rounded-lg shadow-sm hover:shadow transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              )}
            </div>
          </div>
        )}
        {view === 'detail' && !selectedEwo && selectedHistRef && (
          <HistoricalReferenceDetail
            reference={selectedHistRef}
            onClose={() => {
              setView('dashboard');
              setSelectedHistRef(null);
              setLedgerFilter('historical_ref');
              if (window.location.hash.includes('/work-orders/')) {
                window.location.hash = '#/engineering/work-orders';
              }
            }}
          />
        )}
      </div>

      {/* Modals */}
      {showForm && (
        <EWOFormModal
          ewo={editingEwo}
          nextRef={nextRef}
          onClose={() => { setShowForm(false); setEditingEwo(null); }}
          onSaved={async saved => {
            setShowForm(false);
            setEditingEwo(null);
            await load();
            await selectEwo(saved);
          }}
        />
      )}

      {showTransition && selectedEwo && (
        <TransitionModal
          ewo={selectedEwo}
          toStatus={showTransition.to}
          label={showTransition.label}
          onClose={() => setShowTransition(null)}
          onTransitioned={handleTransitionComplete}
        />
      )}

      {showPOAcceptance && selectedEwo && (
        <POAcceptanceModal
          ewo={selectedEwo}
          saving={poAcceptanceSaving}
          onClose={() => setShowPOAcceptance(false)}
          onAccept={(statement, notes) => {
            handlePOAcceptance(selectedEwo, statement, notes);
            setShowPOAcceptance(false);
          }}
        />
      )}

      {showReportModal && selectedEwo && (
        <CompletionReportModal
          ewo={selectedEwo}
          onClose={() => setShowReportModal(false)}
          onGenerated={handleReportGenerated}
        />
      )}

      {showImportWizard && (
        <HistoricalImportWizard
          onClose={() => setShowImportWizard(false)}
          onImported={() => load()}
        />
      )}

      {showDeleteModal && selectedEwo && (
        <EwoDeleteModal
          ewo={selectedEwo as any}
          onClose={() => setShowDeleteModal(false)}
          onDeleted={handleEwoDeleted}
          onArchive={handleArchive}
        />
      )}

      {showMarkAsTest && selectedEwo && (
        <MarkAsTestModal
          ewo={selectedEwo as any}
          onClose={() => setShowMarkAsTest(false)}
          onMarked={() => { setShowMarkAsTest(false); load(); }}
        />
      )}

      {showRemoveTest && selectedEwo && (
        <RemoveTestClassificationModal
          ewo={selectedEwo as any}
          onClose={() => setShowRemoveTest(false)}
          onRemoved={() => { setShowRemoveTest(false); load(); }}
        />
      )}

      {deleteSuccessRef && (
        <EwoDeleteSuccessToast
          ewoRef={deleteSuccessRef}
          onDismiss={() => setDeleteSuccessRef(null)}
        />
      )}
    </div>
  );
}
