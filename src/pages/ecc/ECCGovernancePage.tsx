import { useState, useEffect } from 'react';
import {
  Globe, Shield, ClipboardList, Database, GitBranch, Heart,
  ArrowRight, Scale, Layers, BookOpen, FileText, History,
  AlertCircle, CheckCircle2, Clock,
} from 'lucide-react';
import type { Section } from './ECCDashboard';
import { ECCReviewsPage } from './ECCReviewsPage';
import { getEcrMetrics, type EcrMetrics } from '../../lib/reviewService';
import { getMigrationPlanMetrics, type MigrationPlanMetrics } from '../../lib/migrationPlannerService';
import { getExecutionMetrics, type ExecutionMetrics } from '../../lib/migrationExecutionService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ECCGovernancePageProps {
  section: Section;
  onNavigate: (s: Section) => void;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SECTION_META: Record<string, {
  title: string;
  subtitle: string;
  icon: typeof Shield;
  purpose: string;
  description: string;
  eocpsRef: string;
  milestone: string;
  status: 'planned' | 'in-progress' | 'foundation-only';
  relatedSections: Section[];
}> = {
  'governance-overview': {
    title: 'Platform Governance',
    subtitle: 'Governance Workspace · EIOS',
    icon: Scale,
    purpose: 'The permanent home for all Platform governance capabilities within the Engineering Intelligence Operating System.',
    description: 'This workspace governs how EIOS governs itself. Engineering Classification Reviews, Capability Promotion, Ownership Lineage, and the Shared Platform Capability Registry all live here. Platform governance capabilities are constitutional — they exist to ensure every engineering object across EIOS has a governed owner, a classified type, and a permanent history.',
    eocpsRef: 'EOCPS-001',
    milestone: 'EWO-014 — Project Scoping & Ownership Migration',
    status: 'in-progress',
    relatedSections: ['ecr-reviews', 'capability-registry', 'spc-registry', 'ownership-lineage', 'governance-health', 'engineering-standards', 'constitution'],
  },
  'capability-registry': {
    title: 'Capability Registry',
    subtitle: 'Classification · Governance Workspace',
    icon: Database,
    purpose: 'The canonical record of every engineering object in EIOS — classified, owned, and governed.',
    description: 'The Capability Registry holds classification records for every engineering object across EIOS: Features, Services, Data Models, AI Components, Integrations, Documentation, Architecture Objects, Workflows, and more. Each record carries its ownership class (Platform, Project, SPC, External), classification type, reusability score, and promotion eligibility status. The registry is the foundation on which ECRs, lineage tracking, and SPC promotion all depend.',
    eocpsRef: 'EOCPS-001 § 2 — Engineering Classification Model',
    milestone: 'EWO-014 — Project Scoping & Ownership Migration',
    status: 'planned',
    relatedSections: ['ecr-reviews', 'spc-registry', 'ownership-lineage'],
  },
  'spc-registry': {
    title: 'Shared Platform Capability Registry',
    subtitle: 'SPC Registry · Governance Workspace',
    icon: Layers,
    purpose: 'The governed catalogue of capabilities that have been promoted from Project ownership to Platform ownership and are available for inheritance by all Projects.',
    description: 'Shared Platform Capabilities (SPCs) are the result of the capability promotion process. When a Project-owned capability has been reviewed and found to be reusable, stable, and Platform-fit, it is promoted through an ECR. The SPC Registry is where all promoted capabilities live — searchable, versioned, and available for inheritance. Each SPC retains its complete promotion lineage, crediting the originating Project permanently.',
    eocpsRef: 'EOCPS-001 § 4 — Capability Promotion Model; § 5 — Capability Inheritance',
    milestone: 'EWO-014 — Project Scoping & Ownership Migration',
    status: 'planned',
    relatedSections: ['capability-registry', 'ecr-reviews', 'ownership-lineage'],
  },
  'ownership-lineage': {
    title: 'Ownership Lineage',
    subtitle: 'Lineage Ledger · Governance Workspace',
    icon: History,
    purpose: 'The permanent, append-only record of every ownership change, promotion, and governance decision across all engineering objects in EIOS.',
    description: 'The Ownership Lineage ledger is a constitutional audit trail. Every time an engineering object changes ownership — through creation, ECR approval, capability promotion, or retirement — an immutable lineage event is appended. The ledger answers questions like "Who created this capability and in which project?", "What decisions led to this becoming a Platform SPC?", and "What was the state of this capability at the time of RC-005?". Records are never updated or deleted.',
    eocpsRef: 'EOCPS-001 § 6 — Ownership Lineage Specification',
    milestone: 'EWO-014 — Project Scoping & Ownership Migration',
    status: 'planned',
    relatedSections: ['ecr-reviews', 'capability-registry', 'governance-health'],
  },
  'governance-health': {
    title: 'Governance Health',
    subtitle: 'Health Monitor · Governance Workspace',
    icon: Heart,
    purpose: 'Continuous visibility into the health, completeness, and velocity of Platform governance across EIOS.',
    description: 'Governance Health provides real-time metrics on the state of EIOS governance. Key indicators include ownership coverage (what percentage of engineering objects have an attributed owner), ECR velocity (how quickly reviews are being resolved), SPC adoption (how many Projects are inheriting Platform capabilities), lineage completeness, and ATD confidence calibration. This surface is where governance debt becomes visible and actionable.',
    eocpsRef: 'EOCPS-001 § 7 — Continuous Engineering Learning Model',
    milestone: 'EWO-014 — Project Scoping & Ownership Migration',
    status: 'planned',
    relatedSections: ['ecr-reviews', 'ownership-lineage', 'capability-registry'],
  },
  'migration-plans': {
    title: 'Migration Plans',
    subtitle: 'Governed Migration Planner · Governance Workspace',
    icon: GitBranch,
    purpose: 'Generate immutable migration plans from approved ECRs. Planning only — nothing executes.',
    description: 'The Governed Migration Planner analyses an approved Engineering Classification Review and generates a complete, immutable Migration Plan that describes exactly what will happen if the migration is executed in a future EWO. The planner is the constitutional bridge between governance approval and engineering execution.',
    eocpsRef: 'EOCPS-001 — Governed Migration Planner',
    milestone: 'EWO-014.3.1 — Governed Migration Planner v1.0',
    status: 'in-progress',
    relatedSections: ['ecr-reviews', 'ownership-lineage', 'capability-registry', 'spc-registry', 'governance-health'],
  },
};

const SECTION_LABELS: Partial<Record<Section, string>> = {
  'ecr-reviews':           'Classification Reviews',
  'capability-registry':   'Capability Registry',
  'spc-registry':          'SPC Registry',
  'ownership-lineage':     'Ownership Lineage',
  'governance-health':     'Governance Health',
  'migration-plans':       'Migration Plans',
  'engineering-standards': 'Engineering Standards',
  'constitution':          'Constitution',
};

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'planned' | 'in-progress' | 'foundation-only' }) {
  if (status === 'planned') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200">
        <Clock className="w-3 h-3 text-slate-400" />
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Planned · EWO-014</span>
      </div>
    );
  }
  if (status === 'in-progress') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200">
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">In Progress · EWO-014</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200">
      <AlertCircle className="w-3 h-3 text-amber-600" />
      <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Architecture Only</span>
    </div>
  );
}

// ─── Platform identity badge ──────────────────────────────────────────────────

function PlatformBadge() {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-900 border border-slate-700">
      <Globe className="w-3 h-3 text-slate-400" />
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Platform · EIOS</span>
    </div>
  );
}

// ─── Governance overview landing ──────────────────────────────────────────────

const GOVERNANCE_CARDS: {
  section: Section; label: string; description: string; icon: typeof Shield; milestone: string;
}[] = [
  { section: 'engineering-standards', label: 'Engineering Standards', description: 'Constitutional rules governing how engineering is conducted across EIOS', icon: BookOpen,     milestone: 'Live' },
  { section: 'constitution',          label: 'Constitution',           description: 'Platform constitution, architecture mandates, and constitutional records', icon: FileText,    milestone: 'Live' },
  { section: 'ecr-reviews',           label: 'Classification Reviews', description: 'Govern ownership changes, capability promotions, and classification decisions', icon: ClipboardList, milestone: 'Live' },
  { section: 'capability-registry',   label: 'Capability Registry',    description: 'Canonical record of every engineering object — classified and owned',    icon: Database,    milestone: 'EWO-014' },
  { section: 'spc-registry',          label: 'SPC Registry',           description: 'Shared Platform Capabilities available for inheritance by all Projects',  icon: Layers,      milestone: 'EWO-014' },
  { section: 'ownership-lineage',     label: 'Ownership Lineage',      description: 'Permanent append-only ledger of every governance decision in EIOS',      icon: History,     milestone: 'EWO-014' },
  { section: 'governance-health',     label: 'Governance Health',      description: 'Continuous visibility into ownership coverage, ECR velocity, and governance debt', icon: Heart, milestone: 'EWO-014' },
  { section: 'migration-plans',       label: 'Migration Plans',       description: 'Generate immutable migration plans from approved ECRs — planning only, nothing executes', icon: GitBranch, milestone: 'EWO-014.3.1' },
];

function GovernanceOverview({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const [metrics, setMetrics] = useState<EcrMetrics | null>(null);
  const [migrationMetrics, setMigrationMetrics] = useState<MigrationPlanMetrics | null>(null);
  const [executionMetrics, setExecutionMetrics] = useState<ExecutionMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getEcrMetrics().catch(() => null),
      getMigrationPlanMetrics().catch(() => null),
      getExecutionMetrics().catch(() => null),
    ])
      .then(([ecrMetrics, migMetrics, execMetrics]) => {
        setMetrics(ecrMetrics);
        setMigrationMetrics(migMetrics);
        setExecutionMetrics(execMetrics);
      })
      .finally(() => setMetricsLoading(false));
  }, []);

  const liveMetrics = [
    { label: 'Open Classification Reviews',  value: metrics?.open ?? null },
    { label: 'Reviews In Review',            value: metrics?.in_review ?? null },
    { label: 'Awaiting Decision',            value: metrics?.awaiting_decision ?? null },
    { label: 'Approved Reviews',             value: metrics?.approved ?? null },
    { label: 'Deferred Reviews',             value: metrics?.deferred ?? null },
    { label: 'Avg. Confidence',              value: metrics?.avg_confidence != null ? `${metrics.avg_confidence}%` : null },
  ];

  const migrationMetricsCards = [
    { label: 'Draft Plans',      value: migrationMetrics?.draft ?? null },
    { label: 'Ready Plans',      value: migrationMetrics?.ready ?? null },
    { label: 'Blocked Plans',    value: migrationMetrics?.blocked ?? null },
    { label: 'Avg. Readiness',    value: migrationMetrics?.average_readiness != null ? `${migrationMetrics.average_readiness}` : null },
  ];

  const executionMetricsCards = [
    { label: 'Ready',           value: executionMetrics?.ready ?? null },
    { label: 'Executing',       value: executionMetrics?.executing ?? null },
    { label: 'Completed',       value: executionMetrics?.completed ?? null },
    { label: 'Failed',           value: executionMetrics?.failed ?? null },
    { label: 'Rolled Back',     value: executionMetrics?.rolled_back ?? null },
    { label: 'Avg Exec Time',   value: executionMetrics?.average_execution_time != null ? `${executionMetrics.average_execution_time}s` : null },
  ];

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
                <Scale className="w-6 h-6 text-slate-300" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <PlatformBadge />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Governance Workspace</span>
                </div>
                <h1 className="text-lg font-bold text-slate-900">Platform Governance</h1>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
                  The permanent home for all Platform governance capabilities within EIOS.
                  This is where the operating system governs itself.
                </p>
              </div>
            </div>
            <StatusBadge status="in-progress" />
          </div>
        </div>

        {/* Constitutional reference */}
        <div className="bg-slate-900 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <GitBranch className="w-4 h-4 text-slate-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Constitutional Standard</span>
          </div>
          <p className="text-xs font-bold text-white mb-1">EOCPS-001 — Engineering Ownership & Capability Promotion Standard v1.0</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            This workspace implements EOCPS-001. Engineering Classification Reviews are now live (EWO-014.2).
            Capability Registry, SPC Registry, Ownership Lineage and Governance Health will follow in subsequent EWOs.
          </p>
        </div>

        {/* Live ECR Metrics */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ECR Governance Metrics</p>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider">Live</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {liveMetrics.map(m => (
              <div key={m.label} className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{m.label}</p>
                {metricsLoading ? (
                  <div className="w-8 h-6 bg-slate-100 rounded animate-pulse" />
                ) : (
                  <p className={`text-2xl font-bold ${m.value != null ? 'text-slate-900' : 'text-slate-300'}`}>
                    {m.value ?? 0}
                  </p>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => onNavigate('ecr-reviews')}
            className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            View all Classification Reviews
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* Migration Plan Metrics */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Migration Plans</p>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">Planning Only</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {migrationMetricsCards.map(m => (
              <div key={m.label} className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{m.label}</p>
                {metricsLoading ? (
                  <div className="w-8 h-6 bg-slate-100 rounded animate-pulse" />
                ) : (
                  <p className={`text-2xl font-bold ${m.value != null ? 'text-slate-900' : 'text-slate-300'}`}>
                    {m.value ?? 0}
                  </p>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => onNavigate('migration-plans')}
            className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            View all Migration Plans
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* Migration Execution Metrics */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Migration Execution</p>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">Execution Engine</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {executionMetricsCards.map(m => (
              <div key={m.label} className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{m.label}</p>
                {metricsLoading ? (
                  <div className="w-8 h-6 bg-slate-100 rounded animate-pulse" />
                ) : (
                  <p className={`text-2xl font-bold ${m.value != null ? 'text-slate-900' : 'text-slate-300'}`}>
                    {m.value ?? 0}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Staged placeholders */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Staged Capabilities — Not Yet Available</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Capability Registry', note: 'EWO-014' },
              { label: 'SPC Registry',        note: 'EWO-014' },
              { label: 'Ownership Lineage',   note: 'EWO-014' },
              { label: 'Governance Health',   note: 'EWO-014' },
            ].map(m => (
              <div key={m.label} className="bg-white border border-dashed border-slate-200 rounded-xl p-4">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{m.label}</p>
                <p className="text-lg font-bold text-slate-300">—</p>
                <p className="text-[9px] text-slate-300 mt-0.5">{m.note}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Capability cards */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Governance Capabilities</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {GOVERNANCE_CARDS.map(({ section, label, description, icon: Icon, milestone }) => {
              const live = milestone === 'Live';
              return (
                <button key={section} onClick={() => onNavigate(section)}
                  className="flex items-start gap-3 p-4 bg-white border border-slate-200 rounded-xl hover:border-slate-300 hover:shadow-sm transition-all text-left group">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${live ? 'bg-slate-900' : 'bg-slate-50 border border-slate-200'}`}>
                    <Icon className={`w-4 h-4 ${live ? 'text-slate-300' : 'text-slate-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-semibold text-slate-800">{label}</p>
                      {live
                        ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Live</span>
                        : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">{milestone}</span>
                      }
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{description}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 shrink-0 mt-1 transition-colors" />
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Generic governance placeholder page ─────────────────────────────────────

function GovernancePlaceholder({ section, onNavigate }: { section: Section; onNavigate: (s: Section) => void }) {
  const meta = SECTION_META[section];
  if (!meta) return null;

  const Icon = meta.icon;

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-6 lg:p-8">
      <div className="max-w-3xl mx-auto space-y-5">

        {/* Header card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
            <div className="flex items-center gap-2">
              <PlatformBadge />
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Governance Workspace</span>
            </div>
            <StatusBadge status={meta.status} />
          </div>

          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
              <Icon className="w-6 h-6 text-slate-300" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-slate-900 mb-1">{meta.title}</h1>
              <p className="text-sm text-slate-600 leading-relaxed">{meta.purpose}</p>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-slate-400" />
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">About This Capability</p>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">{meta.description}</p>
        </div>

        {/* Constitutional reference */}
        <div className="bg-slate-900 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <GitBranch className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Introduced By</p>
              <p className="text-xs font-semibold text-white mb-2">{meta.eocpsRef}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Implementation Milestone</p>
              <p className="text-xs font-semibold text-slate-200">{meta.milestone}</p>
            </div>
          </div>
        </div>

        {/* Awaiting implementation */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-800 mb-1">Awaiting Implementation — {meta.milestone}</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                This page establishes the permanent architectural home for <strong>{meta.title}</strong> within the
                Platform Governance workspace. No functional data is stored yet. Implementation will occur in
                the EWO-014 Project Scoping & Ownership Migration work order.
              </p>
            </div>
          </div>
        </div>

        {/* Metrics placeholder */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Metrics — Not Yet Available</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-3 text-center">
                <p className="text-lg font-bold text-slate-200">—</p>
                <p className="text-[9px] text-slate-300 mt-0.5">EWO-014</p>
              </div>
            ))}
          </div>
        </div>

        {/* Related sections */}
        {meta.relatedSections.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Related Governance Capabilities</p>
            <div className="flex flex-wrap gap-2">
              {meta.relatedSections.map(s => (
                <button key={s} onClick={() => onNavigate(s)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all">
                  <CheckCircle2 className="w-3 h-3 text-slate-400" />
                  {SECTION_LABELS[s] ?? s.replace(/-/g, ' ')}
                  <ArrowRight className="w-3 h-3 text-slate-300" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Back */}
        <div className="pt-2">
          <button onClick={() => onNavigate('governance-overview')}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-600 transition-colors">
            <ArrowRight className="w-3 h-3 rotate-180" />
            Back to Platform Governance
          </button>
        </div>

      </div>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function ECCGovernancePage({ section, onNavigate }: ECCGovernancePageProps) {
  if (section === 'governance-overview') {
    return <GovernanceOverview onNavigate={onNavigate} />;
  }
  if (section === 'ecr-reviews') {
    return <ECCReviewsPage />;
  }
  return <GovernancePlaceholder section={section} onNavigate={onNavigate} />;
}
