import { useEffect, useState, useCallback } from 'react';
import {
  X, Layers, Terminal, GitBranch, TestTube2, Rocket, Briefcase, Clock,
  Image, Zap, CheckCircle2, AlertTriangle, XCircle, Database, FileText,
  ArrowRight, Plus, Trash2, Save, Loader2, Info, Shield, BarChart3,
  RefreshCw, AlertCircle, Package, Code2, Link, Target,
  BookOpen, Bot, ClipboardList, Pencil, Check, ThumbsUp, ThumbsDown,
  RotateCcw, Star, Send, History, ScrollText, UserCheck, ChevronDown,
  ChevronRight, Activity, ShieldCheck,
} from 'lucide-react';
import { getGuardianStatusForFeature } from './ECCArchitectureGuardianPage';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Feature {
  id: string; feature_id: string; name: string; category: string;
  sub_category: string | null; description: string | null; purpose: string | null;
  status: string; lifecycle_stage: string; priority: string | null;
  release_version: string | null; first_release_version: string | null;
  first_release_date: string | null; current_release_version: string | null;
  deployment_date: string | null; release_notes: string | null;
  implementation_date: string | null; implementation_source: string | null;
  source_file: string | null; developer: string;
  testing_status: string; testing_phase: string | null;
  last_tested_at: string | null; tested_by: string | null;
  regression_required: boolean; regression_completed: boolean;
  test_evidence: string | null; test_notes: string | null;
  bug_history: string | null; future_test_requirements: string | null;
  production_ready: boolean;
  compliance_critical: boolean; audit_critical: boolean;
  business_value: string | null; customer_impact: string | null;
  operational_risk: string | null; technical_complexity: string | null;
  estimated_maintenance_effort: string | null; owner: string | null;
  review_frequency: string | null;
  database_changes: string | null; api_changes: string | null;
  ui_changes: string | null; compliance_impact: string | null;
  audit_impact: string | null; security_impact: string | null;
  documentation_status: string; known_issues: string | null;
  future_enhancements: string | null; notes: string | null;
  impl_db_tables: string[]; impl_migrations: string[];
  impl_edge_functions: string[]; impl_pages: string[];
  impl_components: string[]; impl_hooks_utilities: string[];
  impl_api_endpoints: string[]; impl_cron_jobs: string[];
  impl_email_templates: string[]; impl_env_variables: string[];
  impl_ai_services: string[];
  screenshot_desktop: string | null; screenshot_mobile: string | null;
  screenshot_workflow: string | null; diagram_url: string | null;
  architecture_image: string | null;
  goal_id: string | null; epic_id: string | null;
  audit_flags: string[]; tags: string[];
  last_modified_release: string | null;
  created_at: string; updated_at: string;
  // RC-003 new doc fields
  business_problem: string | null;
  user_story: string | null;
  future_improvements: string | null;
  doc_version: string | null;
  doc_owner: string | null;
  doc_last_reviewed_at: string | null;
  api_endpoints: string | null;
  open_defect_count: number | null;
  last_passed_at: string | null;
  test_case_count: number | null;
  // Product review workflow
  product_review_status: string;
  ai_readiness: string;
  reviewer: string | null;
  review_requested_at: string | null;
  review_started_at: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  acceptance_version: string | null;
  review_notes: string | null;
  approval_comments: string | null;
  rejection_reason: string | null;
  requested_changes: string | null;
  review_checklist: { id: string; label: string; checked: boolean }[];
}

interface Relationship {
  id: string; from_feature_id: string; to_feature_id: string;
  relationship_type: string; notes: string | null;
  peer?: { feature_id: string; name: string; category: string; status: string };
}

interface TimelineEvent {
  id: string; event_type: string; event_label: string;
  description: string | null; actor: string | null; event_date: string;
}

interface TestCase {
  id: string; title: string; description: string | null; test_type: string;
  steps: string | null; expected_result: string | null; actual_result: string | null;
  status: string; tested_at: string | null; tested_by: string | null; notes: string | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const LIFECYCLE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  idea:                    { label: 'Idea',                    color: 'text-slate-500',   bg: 'bg-slate-100'   },
  planned:                 { label: 'Planned',                 color: 'text-slate-600',   bg: 'bg-slate-100'   },
  ready_for_development:   { label: 'Ready For Development',   color: 'text-blue-600',    bg: 'bg-blue-50'     },
  ai_analysis:             { label: 'AI Analysis',             color: 'text-violet-600',  bg: 'bg-violet-50'   },
  preparation:             { label: 'Preparation',             color: 'text-indigo-600',  bg: 'bg-indigo-50'   },
  approved_to_build:       { label: 'Approved To Build',       color: 'text-cyan-700',    bg: 'bg-cyan-50'     },
  ai_development:          { label: 'AI Development',          color: 'text-purple-700',  bg: 'bg-purple-50'   },
  in_development:          { label: 'In Development',          color: 'text-blue-700',    bg: 'bg-blue-100'    },
  development_complete:    { label: 'Development Complete',    color: 'text-teal-700',    bg: 'bg-teal-50'     },
  testing:                 { label: 'Testing',                 color: 'text-amber-700',   bg: 'bg-amber-50'    },
  awaiting_product_review: { label: 'Awaiting Product Review', color: 'text-orange-700',  bg: 'bg-orange-50'   },
  product_review:          { label: 'Product Review',          color: 'text-rose-700',    bg: 'bg-rose-50'     },
  accepted:                { label: 'Accepted',                color: 'text-emerald-700', bg: 'bg-emerald-50'  },
  ready_for_release:       { label: 'Ready For Release',       color: 'text-green-700',   bg: 'bg-green-50'    },
  feature_complete:        { label: 'Feature Complete',        color: 'text-indigo-600',  bg: 'bg-indigo-50'   },
  internally_tested:       { label: 'Internally Tested',       color: 'text-cyan-700',    bg: 'bg-cyan-50'     },
  regression_tested:       { label: 'Regression Tested',       color: 'text-teal-700',    bg: 'bg-teal-50'     },
  production_ready:        { label: 'Production Ready',        color: 'text-emerald-600', bg: 'bg-emerald-50'  },
  released:                { label: 'Released',                color: 'text-green-700',   bg: 'bg-green-100'   },
  live:                    { label: 'Live',                    color: 'text-emerald-700', bg: 'bg-emerald-100' },
  maintenance:             { label: 'Maintenance',             color: 'text-slate-700',   bg: 'bg-slate-200'   },
  deprecated:              { label: 'Deprecated',              color: 'text-amber-700',   bg: 'bg-amber-50'    },
  archived:                { label: 'Archived',                color: 'text-slate-400',   bg: 'bg-slate-100'   },
};

const REVIEW_STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  not_started:         { label: 'Not Started',        color: 'text-slate-500',   bg: 'bg-slate-50',    border: 'border-slate-200' },
  requested:           { label: 'Requested',          color: 'text-blue-600',    bg: 'bg-blue-50',     border: 'border-blue-200'  },
  in_review:           { label: 'In Review',          color: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200' },
  approved:            { label: 'Approved',           color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200' },
  rejected:            { label: 'Rejected',           color: 'text-red-600',     bg: 'bg-red-50',      border: 'border-red-200'   },
  changes_requested:   { label: 'Changes Requested',  color: 'text-orange-700',  bg: 'bg-orange-50',   border: 'border-orange-200' },
  sent_back_to_dev:    { label: 'Sent Back to Dev',   color: 'text-purple-600',  bg: 'bg-purple-50',   border: 'border-purple-200' },
  sent_back_to_testing:{ label: 'Back to Testing',    color: 'text-violet-600',  bg: 'bg-violet-50',   border: 'border-violet-200' },
};

const AI_READINESS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  ready:              { label: 'Ready',              color: 'text-emerald-700', bg: 'bg-emerald-50'  },
  awaiting_approval:  { label: 'Awaiting Approval',  color: 'text-amber-700',   bg: 'bg-amber-50'    },
  analysing:          { label: 'Analysing',          color: 'text-violet-600',  bg: 'bg-violet-50'   },
  preparing:          { label: 'Preparing',          color: 'text-indigo-600',  bg: 'bg-indigo-50'   },
  developing:         { label: 'Developing',         color: 'text-blue-600',    bg: 'bg-blue-50'     },
  testing:            { label: 'Testing',            color: 'text-cyan-700',    bg: 'bg-cyan-50'     },
  ready_for_review:   { label: 'Ready for Review',   color: 'text-orange-700',  bg: 'bg-orange-50'   },
  blocked:            { label: 'Blocked',            color: 'text-red-600',     bg: 'bg-red-50'      },
  ready_for_release:  { label: 'Ready for Release',  color: 'text-green-700',   bg: 'bg-green-50'    },
};

const DEFAULT_REVIEW_CHECKLIST: { id: string; label: string; checked: boolean }[] = [
  { id: 'req_met',       label: 'All stated requirements are met',          checked: false },
  { id: 'ui_ux',         label: 'UI/UX matches design specifications',      checked: false },
  { id: 'testing_pass',  label: 'All test cases pass (unit + integration)', checked: false },
  { id: 'regression',    label: 'Regression testing completed',             checked: false },
  { id: 'docs_complete', label: 'Documentation is complete and accurate',   checked: false },
  { id: 'compliance',    label: 'Compliance requirements satisfied',        checked: false },
  { id: 'security',      label: 'Security review completed',                checked: false },
  { id: 'performance',   label: 'Performance benchmarks met',               checked: false },
  { id: 'no_issues',     label: 'No known critical issues or blockers',     checked: false },
  { id: 'release_notes', label: 'Release notes drafted and reviewed',       checked: false },
];

const REL_CFG: Record<string, { label: string; icon: typeof ArrowRight; color: string }> = {
  parent:      { label: 'Parent of',   icon: Package,    color: 'text-violet-600' },
  child:       { label: 'Child of',    icon: Layers,     color: 'text-violet-600' },
  depends_on:  { label: 'Depends On',  icon: ArrowRight, color: 'text-blue-600'   },
  used_by:     { label: 'Used By',     icon: Link,       color: 'text-teal-600'   },
  blocks:      { label: 'Blocks',      icon: XCircle,    color: 'text-red-500'    },
  blocked_by:  { label: 'Blocked By',  icon: AlertTriangle, color: 'text-amber-500' },
  related:     { label: 'Related',     icon: GitBranch,  color: 'text-slate-500'  },
};

const TEST_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  passed:          { label: 'Passed',       color: 'text-emerald-700', bg: 'bg-emerald-50'  },
  failed:          { label: 'Failed',       color: 'text-red-600',     bg: 'bg-red-50'      },
  testing:         { label: 'Testing',      color: 'text-blue-600',    bg: 'bg-blue-50'     },
  requires_review: { label: 'Req. Review',  color: 'text-amber-700',   bg: 'bg-amber-50'    },
  not_run:         { label: 'Not Run',      color: 'text-slate-500',   bg: 'bg-slate-100'   },
  skipped:         { label: 'Skipped',      color: 'text-slate-500',   bg: 'bg-slate-100'   },
  blocked:         { label: 'Blocked',      color: 'text-orange-600',  bg: 'bg-orange-50'   },
};

const RISK_CFG: Record<string, string> = {
  critical: 'text-red-600', high: 'text-amber-600', medium: 'text-blue-600', low: 'text-slate-500',
};

const TABS = [
  { key: 'overview',        label: 'Overview',        icon: Info          },
  { key: 'implementation',  label: 'Implementation',  icon: Code2         },
  { key: 'documentation',   label: 'Documentation',   icon: BookOpen      },
  { key: 'testing',         label: 'Testing',         icon: TestTube2     },
  { key: 'product_review',  label: 'Product Review',  icon: UserCheck     },
  { key: 'ai_engineering',  label: 'AI Engineering',  icon: Bot           },
  { key: 'ai_journal',      label: 'AI Journal',      icon: ScrollText    },
  { key: 'history',         label: 'History',         icon: History       },
  { key: 'audit',           label: 'Audit',           icon: ClipboardList },
  { key: 'relationships',   label: 'Relationships',   icon: GitBranch     },
  { key: 'releases',        label: 'Releases',        icon: Rocket        },
  { key: 'business',        label: 'Business',        icon: Briefcase     },
  { key: 'timeline',        label: 'Timeline',        icon: Clock         },
  { key: 'impact',          label: 'Impact',          icon: Zap           },
  { key: 'screenshots',     label: 'Screenshots',     icon: Image         },
];

function fmtDate(d: string | null) {
  if (!d) return 'Unknown';
  return new Date(d).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDay(d: string | null) {
  if (!d) return 'Unknown';
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
}

function TagList({ items, color = 'bg-slate-100 text-slate-600' }: { items: string[]; color?: string }) {
  if (!items.length) return <span className="text-sm text-slate-400 italic">None documented</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(t => <span key={t} className={`text-xs px-2 py-0.5 rounded-full font-mono ${color}`}>{t}</span>)}
    </div>
  );
}

function EditableText({ value, multiline, onSave }: {
  value: string | null; multiline?: boolean;
  onSave: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  if (!editing) return (
    <button
      onClick={() => { setDraft(value ?? ''); setEditing(true); }}
      className="w-full text-left group"
    >
      {value
        ? <span className="text-sm text-slate-700">{value}</span>
        : <span className="text-sm text-slate-400 italic">Click to add…</span>
      }
    </button>
  );
  return (
    <div className="space-y-1">
      {multiline
        ? <textarea rows={3} value={draft} onChange={e => setDraft(e.target.value)} autoFocus
            className="w-full border border-blue-300 rounded-lg px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
        : <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus
            className="w-full border border-blue-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
      }
      <div className="flex gap-2">
        <button onClick={() => { onSave(draft || null); setEditing(false); }}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Save className="w-3 h-3" /> Save
        </button>
        <button onClick={() => setEditing(false)}
          className="px-2 py-1 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

function SelectField({ value, options, onSave }: {
  value: string; options: { value: string; label: string }[];
  onSave: (v: string) => void;
}) {
  return (
    <select value={value} onChange={e => onSave(e.target.value)}
      className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── Tab: Overview ────────────────────────────────────────────────────────────

function OverviewTab({ f, onSave }: { f: Feature; onSave: (field: string, v: unknown) => void }) {
  const lc = LIFECYCLE_CFG[f.lifecycle_stage] ?? LIFECYCLE_CFG.planned;
  const [goals, setGoals] = useState<{ id: string; title: string }[]>([]);
  const [epics, setEpics] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from('ecc_goals').select('id,title').order('position'),
      supabase.from('ecc_epics').select('id,title').order('position'),
    ]).then(([g, e]) => {
      setGoals(g.data ?? []);
      setEpics(e.data ?? []);
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Lifecycle stage */}
      <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div className={`flex-1`}>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Lifecycle Stage</p>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${lc.bg} ${lc.color}`}>{lc.label}</span>
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Change Stage</p>
          <SelectField value={f.lifecycle_stage}
            options={Object.entries(LIFECYCLE_CFG).map(([k, v]) => ({ value: k, label: v.label }))}
            onSave={v => onSave('lifecycle_stage', v)} />
        </div>
      </div>

      {/* Planning — Goal & Epic */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Target className="w-3.5 h-3.5 text-blue-500" />
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Planning</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Goal</p>
            <select
              value={f.goal_id ?? ''}
              onChange={e => onSave('goal_id', e.target.value || null)}
              className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">— unassigned —</option>
              {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Epic</p>
            <select
              value={f.epic_id ?? ''}
              onChange={e => onSave('epic_id', e.target.value || null)}
              className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="">— unassigned —</option>
              {epics.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Compliance flags */}
      {(f.compliance_critical || f.audit_critical) && (
        <div className="flex gap-3 flex-wrap">
          {f.compliance_critical && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold">
              <Shield className="w-3.5 h-3.5" /> Compliance Critical
            </div>
          )}
          {f.audit_critical && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-xs font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" /> Audit Critical
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        <Field label="Description">
          <EditableText value={f.description} multiline onSave={v => onSave('description', v)} />
        </Field>
        <Field label="Purpose">
          <EditableText value={f.purpose} multiline onSave={v => onSave('purpose', v)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Category">{f.category}{f.sub_category ? ` › ${f.sub_category}` : ''}</Field>
        <Field label="Developer">{f.developer}</Field>
        <Field label="Source">{f.implementation_source ?? '—'}</Field>
        <Field label="Source File">
          {f.source_file ? <code className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded">{f.source_file}</code> : '—'}
        </Field>
        <Field label="Implementation Date">{fmtDay(f.implementation_date)}</Field>
        <Field label="Owner">
          <EditableText value={f.owner} onSave={v => onSave('owner', v)} />
        </Field>
        <Field label="Review Frequency">
          <SelectField value={f.review_frequency ?? 'biannual'}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'quarterly', label: 'Quarterly' },
              { value: 'biannual', label: 'Bi-annual' },
              { value: 'annual', label: 'Annual' },
              { value: 'as_needed', label: 'As Needed' },
            ]}
            onSave={v => onSave('review_frequency', v)} />
        </Field>
        <Field label="Tags">
          <div className="flex flex-wrap gap-1 mt-0.5">
            {f.tags.map(t => <span key={t} className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{t}</span>)}
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Field label="Known Issues">
          <EditableText value={f.known_issues} multiline onSave={v => onSave('known_issues', v)} />
        </Field>
        <Field label="Future Enhancements">
          <EditableText value={f.future_enhancements} multiline onSave={v => onSave('future_enhancements', v)} />
        </Field>
        <Field label="Future Improvements">
          <EditableText value={f.future_improvements} multiline onSave={v => onSave('future_improvements', v)} />
        </Field>
        {f.notes && <Field label="Notes"><span className="text-slate-500 italic">{f.notes}</span></Field>}
      </div>

      {/* RC-003 Documentation Metadata */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Documentation Metadata</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Doc Version">
            <EditableText value={f.doc_version} onSave={v => onSave('doc_version', v)} />
          </Field>
          <Field label="Doc Owner">
            <EditableText value={f.doc_owner} onSave={v => onSave('doc_owner', v)} />
          </Field>
          <Field label="Last Reviewed">
            <span className="text-sm text-slate-600">{fmtDay(f.doc_last_reviewed_at)}</span>
          </Field>
        </div>
        <Field label="API Endpoints">
          <EditableText value={f.api_endpoints} multiline onSave={v => onSave('api_endpoints', v)} />
        </Field>
      </div>

      {f.audit_flags.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Audit Flags</p>
          <div className="flex flex-wrap gap-2">
            {f.audit_flags.map(flag => (
              <span key={flag} className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                <AlertTriangle className="w-3 h-3" />{flag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Implementation Evidence ─────────────────────────────────────────────

function ImplementationTab({ f }: { f: Feature }) {
  const sections: { label: string; icon: typeof Database; items: string[]; color: string }[] = [
    { label: 'Database Tables',       icon: Database,     items: f.impl_db_tables,        color: 'bg-blue-50 text-blue-700 border-blue-200'    },
    { label: 'Migrations',            icon: FileText,     items: f.impl_migrations,       color: 'bg-slate-100 text-slate-600 border-slate-200' },
    { label: 'Edge Functions',        icon: Zap,          items: f.impl_edge_functions,   color: 'bg-amber-50 text-amber-700 border-amber-200'  },
    { label: 'Pages',                 icon: Layers,       items: f.impl_pages,            color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { label: 'Components',            icon: Package,      items: f.impl_components,       color: 'bg-violet-50 text-violet-700 border-violet-200' },
    { label: 'Hooks & Utilities',     icon: Code2,        items: f.impl_hooks_utilities,  color: 'bg-cyan-50 text-cyan-700 border-cyan-200'    },
    { label: 'API Endpoints',         icon: Link,         items: f.impl_api_endpoints,    color: 'bg-orange-50 text-orange-700 border-orange-200' },
    { label: 'Cron Jobs',             icon: Clock,        items: f.impl_cron_jobs,        color: 'bg-teal-50 text-teal-700 border-teal-200'    },
    { label: 'Environment Variables', icon: Shield,       items: f.impl_env_variables,    color: 'bg-red-50 text-red-700 border-red-200'       },
    { label: 'AI Services',           icon: AlertCircle,  items: f.impl_ai_services,      color: 'bg-purple-50 text-purple-700 border-purple-200' },
  ].filter(s => s.items.length > 0);

  if (!sections.length) return (
    <div className="p-8 text-center text-sm text-slate-400 italic">No implementation evidence documented yet.</div>
  );

  return (
    <div className="space-y-5">
      {sections.map(({ label, icon: Icon, items, color }) => (
        <div key={label}>
          <div className="flex items-center gap-1.5 mb-2">
            <Icon className="w-3.5 h-3.5 text-slate-400" />
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {items.map(item => (
              <span key={item} className={`text-xs font-mono px-2 py-1 rounded-lg border ${color}`}>{item}</span>
            ))}
          </div>
        </div>
      ))}

      <div className="grid grid-cols-1 gap-4 pt-2 border-t border-slate-100">
        <Field label="Database Changes">
          <span className="text-sm text-slate-600">{f.database_changes ?? <em className="text-slate-400">None documented</em>}</span>
        </Field>
        <Field label="API Changes">
          <span className="text-sm text-slate-600">{f.api_changes ?? <em className="text-slate-400">None documented</em>}</span>
        </Field>
        <Field label="UI Changes">
          <span className="text-sm text-slate-600">{f.ui_changes ?? <em className="text-slate-400">None documented</em>}</span>
        </Field>
      </div>
    </div>
  );
}

// ─── Tab: Relationships ───────────────────────────────────────────────────────

function RelationshipsTab({ featureId, featureName }: { featureId: string; featureName: string }) {
  const [rels, setRels] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState('depends_on');
  const [newTarget, setNewTarget] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [allFeatures, setAllFeatures] = useState<{ feature_id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadRels(); }, [featureId]);

  async function loadRels() {
    const [from, to, all] = await Promise.all([
      supabase.from('ecc_feature_relationships').select('*').eq('from_feature_id', featureId),
      supabase.from('ecc_feature_relationships').select('*').eq('to_feature_id', featureId),
      supabase.from('ecc_product_features').select('feature_id, name, category, status').order('feature_id'),
    ]);
    const allF = all.data ?? [];
    setAllFeatures(allF.map(f => ({ feature_id: f.feature_id, name: f.name })));
    const combined: Relationship[] = [];
    for (const r of from.data ?? []) {
      const peer = allF.find(f => f.feature_id === r.to_feature_id);
      combined.push({ ...r, peer: peer ? { feature_id: peer.feature_id, name: peer.name, category: peer.category, status: peer.status } : undefined });
    }
    for (const r of to.data ?? []) {
      if (combined.find(c => c.id === r.id)) continue;
      const peer = allF.find(f => f.feature_id === r.from_feature_id);
      combined.push({ ...r, peer: peer ? { feature_id: peer.feature_id, name: peer.name, category: peer.category, status: peer.status } : undefined });
    }
    setRels(combined);
    setLoading(false);
  }

  async function addRelationship() {
    if (!newTarget) return;
    setSaving(true);
    await supabase.from('ecc_feature_relationships').insert({
      from_feature_id: featureId, to_feature_id: newTarget,
      relationship_type: newType, notes: newNotes || null,
    });
    setAdding(false); setNewTarget(''); setNewNotes(''); setSaving(false);
    loadRels();
  }

  async function deleteRel(id: string) {
    await supabase.from('ecc_feature_relationships').delete().eq('id', id);
    setRels(rs => rs.filter(r => r.id !== id));
  }

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>;

  const grouped = Object.keys(REL_CFG).reduce((acc, type) => {
    acc[type] = rels.filter(r => r.relationship_type === type);
    return acc;
  }, {} as Record<string, Relationship[]>);

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{rels.length} relationship{rels.length !== 1 ? 's' : ''} documented</p>
        <button onClick={() => setAdding(a => !a)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add Relationship
        </button>
      </div>

      {adding && (
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <p className="text-xs font-semibold text-slate-600">New Relationship for {featureName}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Type</label>
              <select value={newType} onChange={e => setNewType(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
                {Object.entries(REL_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Target Feature</label>
              <select value={newTarget} onChange={e => setNewTarget(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
                <option value="">Select feature…</option>
                {allFeatures.filter(f => f.feature_id !== featureId)
                  .map(f => <option key={f.feature_id} value={f.feature_id}>{f.feature_id} — {f.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Notes (optional)</label>
            <input value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Describe the relationship…"
              className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={addRelationship} disabled={!newTarget || saving}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
            </button>
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      )}

      {Object.entries(grouped).filter(([, items]) => items.length > 0).map(([type, items]) => {
        const cfg = REL_CFG[type];
        const Icon = cfg.icon;
        return (
          <div key={type}>
            <div className="flex items-center gap-1.5 mb-2">
              <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
              <p className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>{cfg.label}</p>
              <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{items.length}</span>
            </div>
            <div className="space-y-1.5">
              {items.map(r => {
                const peer = r.from_feature_id === featureId ? r.peer : r.peer;
                return (
                  <div key={r.id} className="flex items-center gap-2 p-2.5 bg-white border border-slate-200 rounded-lg group">
                    <span className="text-xs font-mono text-slate-400 shrink-0">{peer?.feature_id ?? '—'}</span>
                    <span className="flex-1 text-sm text-slate-700 truncate">{peer?.name ?? 'Unknown'}</span>
                    <span className="text-xs text-slate-400 shrink-0">{peer?.category ?? ''}</span>
                    {r.notes && <span className="text-xs text-slate-400 italic hidden group-hover:block truncate max-w-32">{r.notes}</span>}
                    <button onClick={() => deleteRel(r.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-600 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {!rels.length && !adding && (
        <div className="p-8 text-center text-sm text-slate-400 italic">No relationships documented yet.</div>
      )}
    </div>
  );
}

// ─── Tab: Testing ─────────────────────────────────────────────────────────────

function TestingTab({ f, onSave }: { f: Feature; onSave: (field: string, v: unknown) => void }) {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [addingCase, setAddingCase] = useState(false);
  const [newCase, setNewCase] = useState({ title: '', description: '', test_type: 'manual', steps: '', expected_result: '' });

  useEffect(() => {
    supabase.from('ecc_feature_test_cases').select('*').eq('feature_id', f.feature_id)
      .order('position').then(({ data }) => { setTestCases(data ?? []); setLoadingCases(false); });
  }, [f.feature_id]);

  async function addCase() {
    if (!newCase.title) return;
    const { data } = await supabase.from('ecc_feature_test_cases').insert({
      feature_id: f.feature_id, ...newCase, status: 'not_run', position: testCases.length,
    }).select().single();
    if (data) setTestCases(tc => [...tc, data]);
    setAddingCase(false);
    setNewCase({ title: '', description: '', test_type: 'manual', steps: '', expected_result: '' });
  }

  async function updateCaseStatus(id: string, status: string) {
    const tested_at = new Date().toISOString();
    await supabase.from('ecc_feature_test_cases').update({ status, tested_at }).eq('id', id);
    setTestCases(tc => tc.map(c => c.id === id ? { ...c, status, tested_at } : c));
  }

  async function deleteCase(id: string) {
    await supabase.from('ecc_feature_test_cases').delete().eq('id', id);
    setTestCases(tc => tc.filter(c => c.id !== id));
  }

  const tsCfg = TEST_STATUS_CFG[f.testing_status] ?? TEST_STATUS_CFG.requires_review;
  const passed = testCases.filter(c => c.status === 'passed').length;

  return (
    <div className="space-y-5">
      {/* RC-003 Coverage Metrics */}
      {(f.test_case_count != null || f.open_defect_count != null || f.last_passed_at != null) && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-slate-800">{f.test_case_count ?? 0}</p>
            <p className="text-xs text-slate-400 mt-0.5">Test Cases</p>
          </div>
          <div className={`border rounded-xl p-3 text-center ${(f.open_defect_count ?? 0) > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
            <p className={`text-2xl font-bold ${(f.open_defect_count ?? 0) > 0 ? 'text-red-600' : 'text-slate-800'}`}>
              {f.open_defect_count ?? 0}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Open Defects</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-xs font-semibold text-emerald-600">{fmtDay(f.last_passed_at)}</p>
            <p className="text-xs text-slate-400 mt-0.5">Last Passed</p>
          </div>
        </div>
      )}
      {/* Status summary */}
      <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Overall Status</p>
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${tsCfg.bg} ${tsCfg.color}`}>
            {f.testing_status === 'passed' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {tsCfg.label}
          </div>
          <div className="mt-2">
            <SelectField value={f.testing_status}
              options={Object.entries(TEST_STATUS_CFG).map(([k, v]) => ({ value: k, label: v.label }))}
              onSave={v => onSave('testing_status', v)} />
          </div>
        </div>
        <div className="space-y-2">
          <Field label="Last Tested">{fmtDay(f.last_tested_at)}</Field>
          <Field label="Tested By">
            <EditableText value={f.tested_by} onSave={v => onSave('tested_by', v)} />
          </Field>
        </div>
      </div>

      {/* Regression */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Regression Required</p>
          <button
            onClick={() => onSave('regression_required', !f.regression_required)}
            className={`flex items-center gap-2 text-sm font-medium ${f.regression_required ? 'text-amber-600' : 'text-slate-400'}`}>
            {f.regression_required ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {f.regression_required ? 'Required' : 'Not Required'}
          </button>
        </div>
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Regression Completed</p>
          <button
            onClick={() => onSave('regression_completed', !f.regression_completed)}
            className={`flex items-center gap-2 text-sm font-medium ${f.regression_completed ? 'text-emerald-600' : 'text-slate-400'}`}>
            {f.regression_completed ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {f.regression_completed ? 'Completed' : 'Not Completed'}
          </button>
        </div>
      </div>

      {/* Test cases */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Test Cases</p>
            {testCases.length > 0 && (
              <span className="text-xs text-emerald-600 font-medium">{passed}/{testCases.length} passed</span>
            )}
          </div>
          <button onClick={() => setAddingCase(a => !a)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="w-3 h-3" /> Add Case
          </button>
        </div>

        {addingCase && (
          <div className="mb-3 p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <input placeholder="Test case title" value={newCase.title} onChange={e => setNewCase(n => ({ ...n, title: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none" />
            <textarea rows={2} placeholder="Steps" value={newCase.steps} onChange={e => setNewCase(n => ({ ...n, steps: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none" />
            <input placeholder="Expected result" value={newCase.expected_result} onChange={e => setNewCase(n => ({ ...n, expected_result: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none" />
            <div className="flex gap-2">
              <button onClick={addCase}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
              <button onClick={() => setAddingCase(false)}
                className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg">Cancel</button>
            </div>
          </div>
        )}

        {loadingCases ? <Loader2 className="w-4 h-4 animate-spin text-slate-300 mx-auto" /> : (
          <div className="space-y-2">
            {testCases.map(tc => {
              const scfg = TEST_STATUS_CFG[tc.status] ?? TEST_STATUS_CFG.not_run;
              return (
                <div key={tc.id} className="p-3 bg-white border border-slate-200 rounded-xl group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${scfg.bg} ${scfg.color}`}>{scfg.label}</span>
                        <span className="text-xs text-slate-400">{tc.test_type}</span>
                      </div>
                      <p className="text-sm font-medium text-slate-700">{tc.title}</p>
                      {tc.steps && <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{tc.steps}</p>}
                      {tc.expected_result && <p className="text-xs text-slate-400 mt-1"><span className="font-medium">Expected:</span> {tc.expected_result}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <select value={tc.status} onChange={e => updateCaseStatus(tc.id, e.target.value)}
                        className="text-xs border border-slate-200 rounded px-1 py-0.5 bg-white focus:outline-none">
                        {Object.entries(TEST_STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                      <button onClick={() => deleteCase(tc.id)}
                        className="p-1 text-red-300 opacity-0 group-hover:opacity-100 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!testCases.length && <p className="text-sm text-slate-400 italic text-center py-4">No test cases yet.</p>}
          </div>
        )}
      </div>

      {/* Evidence & notes */}
      <div className="space-y-4 border-t border-slate-100 pt-4">
        <Field label="Test Evidence">
          <EditableText value={f.test_evidence} multiline onSave={v => onSave('test_evidence', v)} />
        </Field>
        <Field label="Test Notes">
          <EditableText value={f.test_notes} multiline onSave={v => onSave('test_notes', v)} />
        </Field>
        <Field label="Bug History">
          <EditableText value={f.bug_history} multiline onSave={v => onSave('bug_history', v)} />
        </Field>
        <Field label="Future Test Requirements">
          <EditableText value={f.future_test_requirements} multiline onSave={v => onSave('future_test_requirements', v)} />
        </Field>
      </div>
    </div>
  );
}

// ─── Tab: Releases ────────────────────────────────────────────────────────────

function ReleasesTab({ f, onSave }: { f: Feature; onSave: (field: string, v: unknown) => void }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <Field label="First Release Version">
          <EditableText value={f.first_release_version} onSave={v => onSave('first_release_version', v)} />
        </Field>
        <Field label="First Release Date">{fmtDay(f.first_release_date)}</Field>
        <Field label="Current Release Version">
          <EditableText value={f.current_release_version} onSave={v => onSave('current_release_version', v)} />
        </Field>
        <Field label="Deployment Date">{fmtDay(f.deployment_date)}</Field>
        <Field label="Last Modified Release">
          <EditableText value={f.last_modified_release} onSave={v => onSave('last_modified_release', v)} />
        </Field>
      </div>
      <Field label="Release Notes">
        <EditableText value={f.release_notes} multiline onSave={v => onSave('release_notes', v)} />
      </Field>
    </div>
  );
}

// ─── Tab: Business ────────────────────────────────────────────────────────────

function BusinessTab({ f, onSave }: { f: Feature; onSave: (field: string, v: unknown) => void }) {
  const riskColor = RISK_CFG[f.operational_risk ?? 'low'];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Business Value</p>
          <SelectField value={f.business_value ?? 'medium'}
            options={[
              { value: 'critical', label: 'Critical' },
              { value: 'high',     label: 'High'     },
              { value: 'medium',   label: 'Medium'   },
              { value: 'low',      label: 'Low'      },
            ]}
            onSave={v => onSave('business_value', v)} />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Operational Risk</p>
          <div className="flex items-center gap-2">
            <SelectField value={f.operational_risk ?? 'low'}
              options={[
                { value: 'critical', label: 'Critical' },
                { value: 'high',     label: 'High'     },
                { value: 'medium',   label: 'Medium'   },
                { value: 'low',      label: 'Low'      },
              ]}
              onSave={v => onSave('operational_risk', v)} />
            <AlertTriangle className={`w-4 h-4 shrink-0 ${riskColor}`} />
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Technical Complexity</p>
          <SelectField value={f.technical_complexity ?? 'medium'}
            options={[
              { value: 'very_high', label: 'Very High' },
              { value: 'high',      label: 'High'      },
              { value: 'medium',    label: 'Medium'    },
              { value: 'low',       label: 'Low'       },
            ]}
            onSave={v => onSave('technical_complexity', v)} />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Estimated Maintenance</p>
          <SelectField value={f.estimated_maintenance_effort ?? 'medium'}
            options={[
              { value: 'very_high', label: 'Very High' },
              { value: 'high',      label: 'High'      },
              { value: 'medium',    label: 'Medium'    },
              { value: 'low',       label: 'Low'       },
            ]}
            onSave={v => onSave('estimated_maintenance_effort', v)} />
        </div>
      </div>

      {/* Compliance flags */}
      <div className="flex flex-wrap gap-3">
        <button onClick={() => onSave('compliance_critical', !f.compliance_critical)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
            f.compliance_critical ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}>
          <Shield className="w-4 h-4" /> Compliance Critical
          {f.compliance_critical ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
        </button>
        <button onClick={() => onSave('audit_critical', !f.audit_critical)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
            f.audit_critical ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}>
          <BarChart3 className="w-4 h-4" /> Audit Critical
          {f.audit_critical ? <CheckCircle2 className="w-3.5 h-3.5" /> : null}
        </button>
      </div>

      <Field label="Customer Impact">
        <EditableText value={f.customer_impact} multiline onSave={v => onSave('customer_impact', v)} />
      </Field>
      <Field label="Business Problem">
        <EditableText value={f.business_problem} multiline onSave={v => onSave('business_problem', v)} />
      </Field>
      <Field label="User Story">
        <EditableText value={f.user_story} multiline onSave={v => onSave('user_story', v)} />
      </Field>
      <Field label="Compliance Impact">
        <EditableText value={f.compliance_impact} multiline onSave={v => onSave('compliance_impact', v)} />
      </Field>
      <Field label="Security Impact">
        <EditableText value={f.security_impact} multiline onSave={v => onSave('security_impact', v)} />
      </Field>
      <Field label="Audit Impact">
        <EditableText value={f.audit_impact} multiline onSave={v => onSave('audit_impact', v)} />
      </Field>
    </div>
  );
}

// ─── Tab: Timeline ────────────────────────────────────────────────────────────

const TIMELINE_EVENT_CFG: Record<string, string> = {
  created:              'bg-blue-100 text-blue-600',
  db_updated:           'bg-slate-100 text-slate-600',
  ui_added:             'bg-violet-100 text-violet-600',
  logic_updated:        'bg-cyan-100 text-cyan-600',
  testing_started:      'bg-amber-100 text-amber-600',
  testing_passed:       'bg-emerald-100 text-emerald-600',
  testing_failed:       'bg-red-100 text-red-600',
  released:             'bg-green-100 text-green-600',
  docs_updated:         'bg-blue-50 text-blue-500',
  regression_passed:    'bg-teal-100 text-teal-600',
  deprecated:           'bg-orange-100 text-orange-600',
  issue_found:          'bg-red-50 text-red-500',
  issue_resolved:       'bg-emerald-50 text-emerald-500',
  review_completed:     'bg-indigo-50 text-indigo-500',
};

function TimelineTab({ featureId }: { featureId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newEvent, setNewEvent] = useState({ event_type: 'docs_updated', event_label: '', description: '', actor: '' });

  useEffect(() => {
    supabase.from('ecc_feature_timeline').select('*').eq('feature_id', featureId)
      .order('event_date', { ascending: false })
      .then(({ data }) => { setEvents(data ?? []); setLoading(false); });
  }, [featureId]);

  async function addEvent() {
    if (!newEvent.event_label) return;
    const { data } = await supabase.from('ecc_feature_timeline').insert({
      feature_id: featureId, ...newEvent, event_date: new Date().toISOString(),
    }).select().single();
    if (data) setEvents(ev => [data, ...ev]);
    setAdding(false);
    setNewEvent({ event_type: 'docs_updated', event_label: '', description: '', actor: '' });
  }

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{events.length} event{events.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setAdding(a => !a)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="w-3 h-3" /> Add Event
        </button>
      </div>

      {adding && (
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <select value={newEvent.event_type} onChange={e => setNewEvent(n => ({ ...n, event_type: e.target.value }))}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none">
              {Object.keys(TIMELINE_EVENT_CFG).map(k => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
            </select>
            <input placeholder="Event label" value={newEvent.event_label} onChange={e => setNewEvent(n => ({ ...n, event_label: e.target.value }))}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none" />
          </div>
          <input placeholder="Description (optional)" value={newEvent.description} onChange={e => setNewEvent(n => ({ ...n, description: e.target.value }))}
            className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none" />
          <input placeholder="Actor (who did this?)" value={newEvent.actor} onChange={e => setNewEvent(n => ({ ...n, actor: e.target.value }))}
            className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none" />
          <div className="flex gap-2">
            <button onClick={addEvent} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-0">
        {events.map((ev, i) => {
          const dotCls = TIMELINE_EVENT_CFG[ev.event_type] ?? 'bg-slate-100 text-slate-500';
          return (
            <div key={ev.id} className="flex gap-3 group">
              <div className="flex flex-col items-center">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${dotCls}`}>
                  {ev.event_type.slice(0, 2).toUpperCase()}
                </div>
                {i < events.length - 1 && <div className="w-px flex-1 bg-slate-100 my-1" />}
              </div>
              <div className="pb-4 flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-slate-700">{ev.event_label}</p>
                  <p className="text-xs text-slate-400 shrink-0">{fmtDate(ev.event_date)}</p>
                </div>
                {ev.description && <p className="text-xs text-slate-500 mt-0.5">{ev.description}</p>}
                {ev.actor && <p className="text-xs text-slate-400 mt-0.5">by {ev.actor}</p>}
              </div>
            </div>
          );
        })}
        {!events.length && <p className="text-sm text-slate-400 italic text-center py-6">No timeline events yet.</p>}
      </div>
    </div>
  );
}

// ─── Tab: Impact Analysis ─────────────────────────────────────────────────────

function ImpactTab({ featureId, featureName }: { featureId: string; featureName: string }) {
  const [deps, setDeps] = useState<{ feature_id: string; name: string; category: string; relationship_type: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Features that depend ON this feature (what breaks if this changes)
      const [relFrom, relTo] = await Promise.all([
        supabase.from('ecc_feature_relationships').select('to_feature_id, relationship_type').eq('from_feature_id', featureId),
        supabase.from('ecc_feature_relationships').select('from_feature_id, relationship_type').eq('to_feature_id', featureId),
      ]);
      const ids = [
        ...(relFrom.data ?? []).map(r => ({ id: r.to_feature_id, type: r.relationship_type, direction: 'outbound' })),
        ...(relTo.data ?? []).map(r => ({ id: r.from_feature_id, type: r.relationship_type, direction: 'inbound' })),
      ];
      if (!ids.length) { setDeps([]); setLoading(false); return; }
      const { data } = await supabase.from('ecc_product_features')
        .select('feature_id, name, category').in('feature_id', ids.map(i => i.id));
      const result = ids.map(i => {
        const f = (data ?? []).find(d => d.feature_id === i.id);
        return { feature_id: i.id, name: f?.name ?? 'Unknown', category: f?.category ?? '', relationship_type: i.type };
      });
      setDeps(result);
      setLoading(false);
    }
    load();
  }, [featureId]);

  const dependsOnMe = deps.filter(d => d.relationship_type === 'depends_on');
  const iUseDeps   = deps.filter(d => d.relationship_type === 'used_by');
  const blocks     = deps.filter(d => d.relationship_type === 'blocks');
  const related    = deps.filter(d => d.relationship_type === 'related');

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>;

  return (
    <div className="space-y-5">
      {/* Impact statement */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">What breaks if <span className="italic">{featureName}</span> changes?</p>
            <p className="text-sm text-amber-700 mt-0.5">
              {dependsOnMe.length > 0
                ? `${dependsOnMe.length} feature${dependsOnMe.length !== 1 ? 's' : ''} directly depend on this feature.`
                : 'No features are documented as directly depending on this feature.'}
            </p>
          </div>
        </div>
      </div>

      {[
        { label: 'Features That Depend On This', icon: ArrowRight, items: dependsOnMe, color: 'text-red-600', note: 'Changing this may break these features' },
        { label: 'Used By',  icon: Link,       items: iUseDeps,  color: 'text-blue-600',  note: 'These features call or use this one' },
        { label: 'Blocks',   icon: XCircle,    items: blocks,    color: 'text-orange-600', note: 'This feature is blocking these' },
        { label: 'Related',  icon: GitBranch,  items: related,   color: 'text-slate-500',  note: 'Loosely coupled — review if changing' },
      ].filter(g => g.items.length > 0).map(({ label, icon: Icon, items, color, note }) => (
        <div key={label}>
          <div className="flex items-center gap-1.5 mb-2">
            <Icon className={`w-3.5 h-3.5 ${color}`} />
            <p className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</p>
            <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{items.length}</span>
          </div>
          <p className="text-xs text-slate-400 mb-2 italic">{note}</p>
          <div className="space-y-1.5">
            {items.map(d => (
              <div key={d.feature_id} className="flex items-center gap-2 p-2.5 bg-white border border-slate-200 rounded-lg">
                <span className="text-xs font-mono text-slate-400 shrink-0">{d.feature_id}</span>
                <span className="flex-1 text-sm text-slate-700">{d.name}</span>
                <span className="text-xs text-slate-400">{d.category}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {!deps.length && (
        <div className="p-8 text-center text-sm text-slate-400 italic">
          No relationships documented yet — add relationships in the Relationships tab.
        </div>
      )}
    </div>
  );
}

// ─── Tab: Screenshots ─────────────────────────────────────────────────────────

function ScreenshotsTab({ f, onSave }: { f: Feature; onSave: (field: string, v: unknown) => void }) {
  const slots = [
    { field: 'screenshot_desktop',  label: 'Desktop Screenshot',  value: f.screenshot_desktop  },
    { field: 'screenshot_mobile',   label: 'Mobile Screenshot',   value: f.screenshot_mobile   },
    { field: 'screenshot_workflow', label: 'Workflow Screenshot',  value: f.screenshot_workflow },
    { field: 'diagram_url',         label: 'Diagram',              value: f.diagram_url         },
    { field: 'architecture_image',  label: 'Architecture Image',  value: f.architecture_image  },
  ];
  return (
    <div className="space-y-4">
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
          <p className="text-sm text-slate-500">
            Store URLs or paths to screenshots and diagrams. These fields are prepared for future screenshot capture automation.
            Paste any publicly accessible URL to display the image.
          </p>
        </div>
      </div>
      {slots.map(({ field, label, value }) => (
        <div key={field}>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{label}</p>
          {value && (
            <div className="mb-2 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 max-h-48">
              <img src={value} alt={label} className="w-full h-full object-cover" onError={e => (e.currentTarget.style.display = 'none')} />
            </div>
          )}
          <EditableText value={value} onSave={v => onSave(field, v)} />
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Documentation ──────────────────────────────────────────────────────

interface FeatureDoc {
  id: string;
  doc_type: string;
  title: string;
  content: string;
  version: string;
  status: string;
  generated_by_ai: boolean;
  ai_model: string | null;
  author: string | null;
  created_at: string;
  updated_at: string;
}

const DOC_TYPES = [
  { key: 'feature_overview',  label: 'Feature Overview',  desc: 'What this feature does and why it exists' },
  { key: 'user_docs',         label: 'User Docs',         desc: 'How users interact with this feature'     },
  { key: 'technical_docs',    label: 'Technical Docs',    desc: 'Implementation details for developers'    },
  { key: 'compliance_notes',  label: 'Compliance Notes',  desc: 'Regulatory and compliance considerations' },
  { key: 'change_log',        label: 'Change Log',        desc: 'History of changes to this feature'      },
  { key: 'ai_build_history',  label: 'AI Build History',  desc: 'AI-generated build prompts and outputs'   },
];

const DOC_STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  draft:    { label: 'Draft',    color: 'text-amber-700',   bg: 'bg-amber-50'   },
  review:   { label: 'Review',   color: 'text-blue-700',    bg: 'bg-blue-50'    },
  approved: { label: 'Approved', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  archived: { label: 'Archived', color: 'text-slate-500',   bg: 'bg-slate-100'  },
};

function DocEntry({
  doc,
  onUpdate,
  onDelete,
}: {
  doc: FeatureDoc;
  onUpdate: (id: string, changes: Partial<FeatureDoc>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: doc.title, content: doc.content, status: doc.status, version: doc.version, author: doc.author ?? '' });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const updates = { ...draft, updated_at: new Date().toISOString() };
    await supabase.from('ecc_feature_documentation').update(updates).eq('id', doc.id);
    onUpdate(doc.id, updates);
    setEditing(false);
    setSaving(false);
  }

  const ds = DOC_STATUS_STYLE[doc.status] ?? DOC_STATUS_STYLE.draft;

  return (
    <div className={`border rounded-xl overflow-hidden ${editing ? 'border-blue-300 shadow-sm' : 'border-slate-200'}`}>
      <div className="flex items-start justify-between gap-2 px-4 py-3 bg-white">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${ds.bg} ${ds.color}`}>{ds.label}</span>
            <span className="text-[10px] text-slate-400">v{doc.version}</span>
            {doc.generated_by_ai && (
              <span className="flex items-center gap-0.5 text-[10px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
                <Bot className="w-2.5 h-2.5" /> AI
              </span>
            )}
            {doc.author && <span className="text-[10px] text-slate-400">by {doc.author}</span>}
          </div>
          <p className="text-sm font-semibold text-slate-800">{doc.title || '(untitled)'}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setEditing(e => !e)}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(doc.id)}
            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {!editing && doc.content && (
        <div className="px-4 pb-4 border-t border-slate-100">
          <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap mt-3 max-h-40 overflow-y-auto">{doc.content}</p>
        </div>
      )}

      {editing && (
        <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50/50 space-y-3 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Title</label>
              <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Version</label>
              <input value={draft.version} onChange={e => setDraft(d => ({ ...d, version: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Status</label>
              <select value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
                {Object.entries(DOC_STATUS_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Author</label>
              <input value={draft.author} onChange={e => setDraft(d => ({ ...d, author: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Content (Markdown)</label>
            <textarea
              rows={8}
              value={draft.content}
              onChange={e => setDraft(d => ({ ...d, content: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-y font-mono bg-white"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
            </button>
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentationTab({ featureId }: { featureId: string }) {
  const [docs, setDocs] = useState<FeatureDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [newContent, setNewContent] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('ecc_feature_documentation')
      .select('*')
      .eq('feature_id', featureId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setDocs(data ?? []); setLoading(false); });
  }, [featureId]);

  async function addDoc(docType: string) {
    if (!newTitle) return;
    setSaving(true);
    const { data } = await supabase.from('ecc_feature_documentation').insert({
      feature_id: featureId,
      doc_type: docType,
      title: newTitle,
      content: newContent,
      status: 'draft',
      version: '1.0',
    }).select().single();
    if (data) setDocs(prev => [data as FeatureDoc, ...prev]);
    setAdding(null);
    setNewTitle('');
    setNewContent('');
    setSaving(false);
  }

  async function deleteDoc(id: string) {
    await supabase.from('ecc_feature_documentation').delete().eq('id', id);
    setDocs(prev => prev.filter(d => d.id !== id));
  }

  function updateDoc(id: string, changes: Partial<FeatureDoc>) {
    setDocs(prev => prev.map(d => d.id === id ? { ...d, ...changes } : d));
  }

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>;

  return (
    <div className="space-y-6">
      {DOC_TYPES.map(type => {
        const typeDocs = docs.filter(d => d.doc_type === type.key);
        const isAdding = adding === type.key;
        return (
          <div key={type.key}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">{type.label}</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">{type.desc}</p>
              </div>
              <button
                onClick={() => { setAdding(isAdding ? null : type.key); setNewTitle(''); setNewContent(''); }}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-slate-100 text-slate-600 rounded-lg hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>

            {isAdding && (
              <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                <input placeholder="Document title" value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" />
                <textarea rows={5} placeholder="Content (Markdown)" value={newContent} onChange={e => setNewContent(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono bg-white" />
                <div className="flex gap-2">
                  <button onClick={() => addDoc(type.key)} disabled={saving || !newTitle}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                  </button>
                  <button onClick={() => setAdding(null)} className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {typeDocs.length > 0 ? (
              <div className="space-y-2">
                {typeDocs.map(doc => (
                  <DocEntry key={doc.id} doc={doc} onUpdate={updateDoc} onDelete={deleteDoc} />
                ))}
              </div>
            ) : !isAdding && (
              <div className="py-4 text-center border border-dashed border-slate-200 rounded-xl">
                <p className="text-xs text-slate-400 italic">No {type.label.toLowerCase()} yet</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: AI Engineering ──────────────────────────────────────────────────────

interface AIUsageRow {
  id: string;
  feature: string;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
  duration_ms: number;
  success: boolean;
  cache_hit: boolean;
  created_at: string;
}

function AIEngineeringTab({ f, featureId }: { f: Feature; featureId: string }) {
  const [usageLogs, setUsageLogs] = useState<AIUsageRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [generatingDocs, setGeneratingDocs] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('ai_usage_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { setUsageLogs(data ?? []); setLoadingLogs(false); });
  }, [featureId]);

  async function generateDocumentation() {
    setGeneratingDocs(true);
    setGenResult(null);
    setGenError(null);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/command-centre-ai`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: `Generate comprehensive documentation for this feature:

Feature ID: ${f.feature_id}
Name: ${f.name}
Category: ${f.category}${f.sub_category ? ` › ${f.sub_category}` : ''}
Description: ${f.description ?? 'N/A'}
Purpose: ${f.purpose ?? 'N/A'}
Lifecycle Stage: ${f.lifecycle_stage}
Testing Status: ${f.testing_status}
DB Tables: ${f.impl_db_tables.join(', ') || 'None'}
Edge Functions: ${f.impl_edge_functions.join(', ') || 'None'}
Pages: ${f.impl_pages.join(', ') || 'None'}
Components: ${f.impl_components.join(', ') || 'None'}

Please generate:
1. A Feature Overview (2-3 paragraphs explaining what this feature does, why it exists, and who uses it)
2. User Documentation (how to use this feature step by step)
3. Technical Documentation (implementation details, architecture decisions, dependencies)

Format as clear, professional documentation.`,
            }],
          }),
        }
      );
      if (!resp.ok) throw new Error(`Request failed (${resp.status})`);
      const data = await resp.json();
      const content = data.content ?? data.message ?? JSON.stringify(data);
      setGenResult(content);

      // Save to documentation
      const baseTime = Date.now();
      await supabase.from('ecc_feature_documentation').insert([
        {
          feature_id: featureId,
          doc_type: 'feature_overview',
          title: `AI-Generated Feature Overview — ${f.name}`,
          content,
          status: 'draft',
          version: '1.0',
          generated_by_ai: true,
          ai_model: data.model ?? 'unknown',
        },
        {
          feature_id: featureId,
          doc_type: 'ai_build_history',
          title: `AI Documentation Run — ${new Date(baseTime).toLocaleDateString()}`,
          content: `## Prompt\nGenerate documentation for ${f.feature_id} — ${f.name}\n\n## Output\n${content}`,
          status: 'approved',
          version: '1.0',
          generated_by_ai: true,
          ai_model: data.model ?? 'unknown',
        },
      ]);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    }
    setGeneratingDocs(false);
  }

  const implItems = [
    { label: 'DB Tables',       value: f.impl_db_tables,       color: 'bg-blue-50 text-blue-700'     },
    { label: 'Edge Functions',  value: f.impl_edge_functions,  color: 'bg-amber-50 text-amber-700'   },
    { label: 'Pages',           value: f.impl_pages,           color: 'bg-emerald-50 text-emerald-700' },
    { label: 'Components',      value: f.impl_components,      color: 'bg-violet-50 text-violet-700'  },
    { label: 'AI Services',     value: f.impl_ai_services,     color: 'bg-purple-50 text-purple-700'  },
  ].filter(i => i.value.length > 0);

  return (
    <div className="space-y-5">
      {/* AI-powered doc generation */}
      <div className="p-4 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-white">AI Documentation Generator</h3>
          </div>
          <button
            onClick={generateDocumentation}
            disabled={generatingDocs}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {generatingDocs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {generatingDocs ? 'Generating…' : 'Generate Docs'}
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Uses the configured AI provider to generate feature overview, user docs, and technical docs based on the implementation data.
          Results are saved to the Documentation tab.
        </p>

        {genError && (
          <div className="p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
            <p className="text-xs text-red-400">{genError}</p>
          </div>
        )}

        {genResult && (
          <div className="p-3 bg-emerald-900/20 border border-emerald-700/40 rounded-lg">
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <p className="text-xs font-semibold text-emerald-400">Generated and saved to Documentation tab</p>
            </div>
            <p className="text-xs text-slate-400 line-clamp-3">{genResult}</p>
          </div>
        )}
      </div>

      {/* Implementation summary */}
      {implItems.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Implementation Summary</h3>
          <div className="space-y-2">
            {implItems.map(item => (
              <div key={item.label} className="flex items-start gap-2">
                <span className="text-xs font-medium text-slate-500 w-28 shrink-0 pt-0.5">{item.label}</span>
                <div className="flex flex-wrap gap-1.5">
                  {item.value.map(v => (
                    <span key={v} className={`text-xs font-mono px-2 py-0.5 rounded border ${item.color} border-current/20`}>{v}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI usage log */}
      <div>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Recent AI Usage (Platform)</h3>
        {loadingLogs ? (
          <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
        ) : usageLogs.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No AI usage logged yet.</p>
        ) : (
          <div className="space-y-1.5">
            {usageLogs.map(row => (
              <div key={row.id} className="flex items-center gap-3 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${row.success ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <span className="font-medium text-slate-700 truncate flex-1">{row.feature}</span>
                <span className="text-slate-400 shrink-0">{row.model}</span>
                <span className="text-slate-400 shrink-0">{row.prompt_tokens + row.completion_tokens} tok</span>
                {row.cache_hit && <span className="text-violet-600 text-[10px] font-semibold bg-violet-50 px-1.5 py-0.5 rounded shrink-0">cache</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Audit ───────────────────────────────────────────────────────────────

function AuditTab({ f, onSave }: { f: Feature; onSave: (field: string, v: unknown) => void }) {
  const hasFlags = f.audit_flags.length > 0;

  const auditFields = [
    { key: 'compliance_impact', label: 'Compliance Impact',  value: f.compliance_impact  },
    { key: 'security_impact',   label: 'Security Impact',    value: f.security_impact     },
    { key: 'audit_impact',      label: 'Audit Impact',       value: f.audit_impact        },
    { key: 'customer_impact',   label: 'Customer Impact',    value: f.customer_impact     },
  ];

  return (
    <div className="space-y-5">
      {/* Critical flags */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onSave('compliance_critical', !f.compliance_critical)}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
            f.compliance_critical ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
        >
          <Shield className="w-4 h-4" />
          <div className="text-left">
            <p className="text-xs font-semibold">Compliance Critical</p>
            <p className="text-[10px] font-normal opacity-70">{f.compliance_critical ? 'Flagged' : 'Not flagged'}</p>
          </div>
          {f.compliance_critical && <CheckCircle2 className="w-3.5 h-3.5 ml-auto" />}
        </button>
        <button
          onClick={() => onSave('audit_critical', !f.audit_critical)}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
            f.audit_critical ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <div className="text-left">
            <p className="text-xs font-semibold">Audit Critical</p>
            <p className="text-[10px] font-normal opacity-70">{f.audit_critical ? 'Flagged' : 'Not flagged'}</p>
          </div>
          {f.audit_critical && <CheckCircle2 className="w-3.5 h-3.5 ml-auto" />}
        </button>
      </div>

      {/* Audit flags */}
      {hasFlags && (
        <div>
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Active Audit Flags</p>
          <div className="flex flex-wrap gap-2">
            {f.audit_flags.map(flag => (
              <span key={flag} className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">
                <AlertTriangle className="w-3 h-3" />{flag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Impact fields */}
      <div className="space-y-4">
        {auditFields.map(({ key, label, value }) => (
          <div key={key}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
            <EditableText value={value} multiline onSave={v => onSave(key, v)} />
          </div>
        ))}
      </div>

      {/* Metadata */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Feature Metadata</p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-slate-400 mb-0.5">Feature ID</p>
            <code className="font-mono font-semibold text-slate-700">{f.feature_id}</code>
          </div>
          <div>
            <p className="text-slate-400 mb-0.5">Category</p>
            <p className="text-slate-700">{f.category}{f.sub_category ? ` › ${f.sub_category}` : ''}</p>
          </div>
          <div>
            <p className="text-slate-400 mb-0.5">Created</p>
            <p className="text-slate-700">{new Date(f.created_at).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-slate-400 mb-0.5">Last Updated</p>
            <p className="text-slate-700">{new Date(f.updated_at).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-slate-400 mb-0.5">Owner</p>
            <p className="text-slate-700">{f.owner ?? '—'}</p>
          </div>
          <div>
            <p className="text-slate-400 mb-0.5">Review Frequency</p>
            <p className="text-slate-700 capitalize">{(f.review_frequency ?? 'biannual').replace(/_/g, ' ')}</p>
          </div>
        </div>
      </div>

      {/* Documentation status */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Documentation Status</p>
        <SelectField
          value={f.documentation_status}
          options={[
            { value: 'documented',   label: 'Documented'   },
            { value: 'partial',      label: 'Partial'       },
            { value: 'undocumented', label: 'Undocumented'  },
            { value: 'not_required', label: 'Not Required'  },
          ]}
          onSave={v => onSave('documentation_status', v)}
        />
      </div>
    </div>
  );
}

// ─── Health Score ─────────────────────────────────────────────────────────────

export function calculateHealthScore(f: Feature): number {
  let score = 0;

  // Documentation (25%)
  if (f.documentation_status === 'documented') score += 25;
  else if (f.documentation_status === 'partial') score += 12;
  else if (f.documentation_status === 'not_required') score += 25;

  // Testing (25%)
  if (f.testing_status === 'passed') score += 25;
  else if (f.testing_status === 'testing') score += 12;
  else if (f.testing_status === 'requires_review') score += 8;

  // Product review (30%)
  if (f.product_review_status === 'approved') score += 30;
  else if (f.product_review_status === 'in_review') score += 15;
  else if (f.product_review_status === 'requested') score += 8;
  else if (f.product_review_status === 'changes_requested') score += 5;

  // Implementation evidence (10%)
  const implCount = (f.impl_db_tables?.length ?? 0) + (f.impl_pages?.length ?? 0) + (f.impl_components?.length ?? 0);
  if (implCount >= 3) score += 10;
  else if (implCount >= 1) score += 5;

  // Compliance (10%)
  if (!f.compliance_critical) score += 10;
  else if (f.compliance_impact) score += 5;

  return Math.min(100, score);
}

function HealthScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : score >= 50 ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-red-600 bg-red-50 border-red-200';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${color}`}>
      <Activity className="w-3 h-3" />
      {score}%
    </span>
  );
}

// ─── Tab: Product Review ──────────────────────────────────────────────────────

interface ReviewHistoryItem {
  id: string; action: string; actor: string; notes: string | null;
  from_status: string | null; to_status: string | null;
  from_lifecycle: string | null; to_lifecycle: string | null;
  checklist_snapshot: { id: string; label: string; checked: boolean }[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_CFG: Record<string, { label: string; icon: typeof ThumbsUp; color: string; bg: string; border: string }> = {
  approved:              { label: 'Approved',              icon: ThumbsUp,     color: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200' },
  rejected:              { label: 'Rejected',              icon: ThumbsDown,   color: 'text-red-600',     bg: 'bg-red-50',      border: 'border-red-200'    },
  changes_requested:     { label: 'Changes Requested',     icon: Pencil,       color: 'text-orange-700',  bg: 'bg-orange-50',   border: 'border-orange-200' },
  sent_back_to_dev:      { label: 'Sent Back to Dev',      icon: RotateCcw,    color: 'text-purple-600',  bg: 'bg-purple-50',   border: 'border-purple-200' },
  sent_back_to_testing:  { label: 'Back to Testing',       icon: RefreshCw,    color: 'text-violet-600',  bg: 'bg-violet-50',   border: 'border-violet-200' },
  review_requested:      { label: 'Review Requested',      icon: Send,         color: 'text-blue-600',    bg: 'bg-blue-50',     border: 'border-blue-200'   },
  review_started:        { label: 'Review Started',        icon: Star,         color: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200'  },
  marked_ready_for_release: { label: 'Ready for Release',  icon: Rocket,       color: 'text-green-700',   bg: 'bg-green-50',    border: 'border-green-200'  },
};

function ProductReviewTab({ f, onSave, onReviewAction }: {
  f: Feature;
  onSave: (field: string, v: unknown) => void;
  onReviewAction: (action: string, payload: {
    notes?: string; actor?: string;
    newReviewStatus?: string; newLifecycle?: string;
    checklistSnapshot?: { id: string; label: string; checked: boolean }[];
  }) => Promise<void>;
}) {
  const [actor, setActor] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [checklist, setChecklist] = useState<{ id: string; label: string; checked: boolean }[]>(() => {
    const saved = f.review_checklist;
    if (saved && saved.length > 0) return saved;
    return DEFAULT_REVIEW_CHECKLIST.map(item => ({ ...item }));
  });
  const [saving, setSaving] = useState(false);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [guardianStatus, setGuardianStatus] = useState<{ hasReview: boolean; isBlocked: boolean; latestDecision: string | null; latestApproval: string | null } | null>(null);

  useEffect(() => {
    if (f.id) {
      getGuardianStatusForFeature(f.id).then(setGuardianStatus);
    }
  }, [f.id]);

  useEffect(() => {
    const saved = f.review_checklist;
    if (saved && saved.length > 0) setChecklist(saved);
  }, [f.id]);

  const reviewCfg = REVIEW_STATUS_CFG[f.product_review_status] ?? REVIEW_STATUS_CFG.not_started;
  const checkedCount = checklist.filter(c => c.checked).length;
  const checklistPct = checklist.length > 0 ? Math.round((checkedCount / checklist.length) * 100) : 0;

  function toggleChecklist(id: string) {
    const updated = checklist.map(c => c.id === id ? { ...c, checked: !c.checked } : c);
    setChecklist(updated);
    onSave('review_checklist', updated);
  }

  async function doAction(action: string, newReviewStatus: string, newLifecycle?: string) {
    setSaving(true);
    await onReviewAction(action, {
      notes: actionNotes || undefined,
      actor: actor || 'Product Owner',
      newReviewStatus,
      newLifecycle,
      checklistSnapshot: checklist,
    });
    setActionNotes('');
    setExpandedAction(null);
    setSaving(false);
  }

  const isApproved = f.product_review_status === 'approved';

  return (
    <div className="space-y-5">
      {/* Engineering Guardian status banner */}
      {guardianStatus !== null && (
        guardianStatus.hasReview ? (
          guardianStatus.isBlocked ? (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <ShieldCheck className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-red-700">Engineering Guardian — Blocked</p>
                <p className="text-xs text-red-600 mt-0.5">
                  Guardian decision is <strong>{guardianStatus.latestDecision?.replace(/_/g, ' ')}</strong> with approval status <strong>{guardianStatus.latestApproval}</strong>. Product Owner action required before this feature can progress.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <ShieldCheck className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-emerald-700">Engineering Guardian — Cleared</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  Guardian review on file: <strong>{guardianStatus.latestDecision?.replace(/_/g, ' ')}</strong> · approval: <strong>{guardianStatus.latestApproval}</strong>
                </p>
              </div>
            </div>
          )
        ) : (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <ShieldCheck className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-700">Engineering Guardian — No Review</p>
              <p className="text-xs text-amber-600 mt-0.5">No Engineering Guardian review linked to this feature. Run a review in the Engineering Guardian section before progressing.</p>
            </div>
          </div>
        )
      )}
      {/* Status banner */}
      <div className={`p-4 rounded-xl border ${reviewCfg.border} ${reviewCfg.bg}`}>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Review Status</p>
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${reviewCfg.bg} ${reviewCfg.color} border ${reviewCfg.border}`}>
            {reviewCfg.label}
          </span>
        </div>
        {isApproved && f.accepted_by && (
          <div className="mt-2 pt-2 border-t border-emerald-200 space-y-1 text-xs text-emerald-700">
            <p><span className="font-semibold">Accepted by:</span> {f.accepted_by}</p>
            {f.accepted_at && <p><span className="font-semibold">Date:</span> {fmtDate(f.accepted_at)}</p>}
            {f.acceptance_version && <p><span className="font-semibold">Version:</span> {f.acceptance_version}</p>}
            {f.approval_comments && <p className="mt-1 italic text-emerald-600">"{f.approval_comments}"</p>}
          </div>
        )}
      </div>

      {/* Reviewer assignment */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assignment</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-400 mb-1">Assigned Reviewer</p>
            <EditableText value={f.reviewer} onSave={v => onSave('reviewer', v)} />
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">AI Readiness</p>
            <SelectField
              value={f.ai_readiness ?? 'ready'}
              options={Object.entries(AI_READINESS_CFG).map(([k, v]) => ({ value: k, label: v.label }))}
              onSave={v => onSave('ai_readiness', v)}
            />
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Acceptance Version</p>
            <EditableText value={f.acceptance_version} onSave={v => onSave('acceptance_version', v)} />
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Review Notes</p>
            <EditableText value={f.review_notes} multiline onSave={v => onSave('review_notes', v)} />
          </div>
        </div>
      </div>

      {/* Checklist */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Review Checklist</p>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${checklistPct === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
            {checkedCount}/{checklist.length} ({checklistPct}%)
          </span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-1.5 mb-1">
          <div
            className={`h-1.5 rounded-full transition-all ${checklistPct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`}
            style={{ width: `${checklistPct}%` }}
          />
        </div>
        <div className="space-y-2">
          {checklist.map(item => (
            <button
              key={item.id}
              onClick={() => toggleChecklist(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-all ${
                item.checked
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ${
                item.checked ? 'bg-emerald-500' : 'border-2 border-slate-300'
              }`}>
                {item.checked && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Actor input (shared) */}
      <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reviewer Identity</p>
        <input
          placeholder="Your name (e.g. Jane Smith)"
          value={actor}
          onChange={e => setActor(e.target.value)}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Review Actions</p>

        {/* Request Review */}
        {['not_started', 'sent_back_to_dev', 'sent_back_to_testing', 'changes_requested', 'rejected'].includes(f.product_review_status) && (
          <ActionPanel
            action="review_requested"
            label="Request Product Review"
            hint="Move this feature to Product Review stage and request PO sign-off."
            expandedAction={expandedAction}
            setExpandedAction={setExpandedAction}
            actionNotes={actionNotes}
            setActionNotes={setActionNotes}
            saving={saving}
            onConfirm={() => doAction('review_requested', 'requested', 'awaiting_product_review')}
          />
        )}

        {/* Start Review */}
        {f.product_review_status === 'requested' && (
          <ActionPanel
            action="review_started"
            label="Start Review"
            hint="Mark that you have begun reviewing this feature."
            expandedAction={expandedAction}
            setExpandedAction={setExpandedAction}
            actionNotes={actionNotes}
            setActionNotes={setActionNotes}
            saving={saving}
            onConfirm={() => doAction('review_started', 'in_review', 'product_review')}
          />
        )}

        {/* Approve */}
        {['requested', 'in_review'].includes(f.product_review_status) && (
          <ActionPanel
            action="approved"
            label="Approve Feature"
            hint="Formally accept this feature. It will move to Accepted stage."
            expandedAction={expandedAction}
            setExpandedAction={setExpandedAction}
            actionNotes={actionNotes}
            setActionNotes={setActionNotes}
            saving={saving}
            onConfirm={() => doAction('approved', 'approved', 'accepted')}
            variant="success"
          />
        )}

        {/* Reject */}
        {['requested', 'in_review'].includes(f.product_review_status) && (
          <ActionPanel
            action="rejected"
            label="Reject Feature"
            hint="Reject this feature. Provide a reason."
            expandedAction={expandedAction}
            setExpandedAction={setExpandedAction}
            actionNotes={actionNotes}
            setActionNotes={setActionNotes}
            saving={saving}
            onConfirm={() => doAction('rejected', 'rejected')}
            variant="danger"
          />
        )}

        {/* Request Changes */}
        {['requested', 'in_review'].includes(f.product_review_status) && (
          <ActionPanel
            action="changes_requested"
            label="Request Changes"
            hint="Ask the team to make changes before re-submitting for review."
            expandedAction={expandedAction}
            setExpandedAction={setExpandedAction}
            actionNotes={actionNotes}
            setActionNotes={setActionNotes}
            saving={saving}
            onConfirm={() => doAction('changes_requested', 'changes_requested', 'development_complete')}
            variant="warning"
          />
        )}

        {/* Send Back to Dev */}
        {['requested', 'in_review', 'approved'].includes(f.product_review_status) && (
          <ActionPanel
            action="sent_back_to_dev"
            label="Send Back to Development"
            hint="Return to the development team for further work."
            expandedAction={expandedAction}
            setExpandedAction={setExpandedAction}
            actionNotes={actionNotes}
            setActionNotes={setActionNotes}
            saving={saving}
            onConfirm={() => doAction('sent_back_to_dev', 'sent_back_to_dev', 'in_development')}
          />
        )}

        {/* Send Back to Testing */}
        {['requested', 'in_review', 'approved'].includes(f.product_review_status) && (
          <ActionPanel
            action="sent_back_to_testing"
            label="Send Back to Testing"
            hint="Return to QA for further testing."
            expandedAction={expandedAction}
            setExpandedAction={setExpandedAction}
            actionNotes={actionNotes}
            setActionNotes={setActionNotes}
            saving={saving}
            onConfirm={() => doAction('sent_back_to_testing', 'sent_back_to_testing', 'testing')}
          />
        )}

        {/* Mark Ready for Release */}
        {f.product_review_status === 'approved' && (
          <ActionPanel
            action="marked_ready_for_release"
            label="Mark Ready for Release"
            hint="This feature has been accepted and is cleared for release."
            expandedAction={expandedAction}
            setExpandedAction={setExpandedAction}
            actionNotes={actionNotes}
            setActionNotes={setActionNotes}
            saving={saving}
            onConfirm={() => doAction('marked_ready_for_release', 'approved', 'ready_for_release')}
            variant="success"
          />
        )}
      </div>

      {/* Sign-off record if approved */}
      {isApproved && (
        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Formal Acceptance Record</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><p className="text-slate-500">Testing Status at Acceptance</p><p className="font-medium text-slate-800">{TEST_STATUS_CFG[f.testing_status]?.label ?? f.testing_status}</p></div>
            <div><p className="text-slate-500">Documentation at Acceptance</p><p className="font-medium text-slate-800">{f.documentation_status}</p></div>
            <div><p className="text-slate-500">Compliance Critical</p><p className="font-medium text-slate-800">{f.compliance_critical ? 'Yes' : 'No'}</p></div>
            <div><p className="text-slate-500">Lifecycle at Acceptance</p><p className="font-medium text-slate-800">{LIFECYCLE_CFG[f.lifecycle_stage]?.label ?? f.lifecycle_stage}</p></div>
          </div>
          {f.approval_comments && (
            <p className="text-xs text-emerald-700 italic border-t border-emerald-200 pt-2">"{f.approval_comments}"</p>
          )}
        </div>
      )}
    </div>
  );
}

function ActionPanel({
  action, label, hint, expandedAction, setExpandedAction,
  actionNotes, setActionNotes, saving, onConfirm, variant = 'default',
}: {
  action: string; label: string; hint: string;
  expandedAction: string | null; setExpandedAction: (a: string | null) => void;
  actionNotes: string; setActionNotes: (v: string) => void;
  saving: boolean; onConfirm: () => void;
  variant?: 'default' | 'success' | 'danger' | 'warning';
}) {
  const isExpanded = expandedAction === action;
  const cfg = ACTION_CFG[action];
  const variantStyles = {
    default: 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100',
    danger:  'bg-red-50 border-red-200 text-red-700 hover:bg-red-100',
    warning: 'bg-orange-50 border-orange-200 text-orange-800 hover:bg-orange-100',
  };
  const Icon = cfg?.icon ?? ArrowRight;
  return (
    <div className={`rounded-xl border overflow-hidden transition-all ${isExpanded ? 'shadow-sm' : ''}`}>
      <button
        onClick={() => setExpandedAction(isExpanded ? null : action)}
        className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors ${variantStyles[variant]}`}
      >
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5" />
          <span>{label}</span>
        </div>
        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 bg-white border-t border-slate-100 space-y-2">
          <p className="text-xs text-slate-500">{hint}</p>
          <textarea
            rows={2}
            placeholder="Add notes (optional)"
            value={actionNotes}
            onChange={e => setActionNotes(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="flex gap-2">
            <button
              onClick={onConfirm}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Confirm
            </button>
            <button onClick={() => setExpandedAction(null)} className="px-3 py-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: AI Journal ──────────────────────────────────────────────────────────

function AIJournalTab({ featureId, featureName }: { featureId: string; featureName: string }) {
  const [entries, setEntries] = useState<{
    id: string; doc_type: string; title: string; content: string;
    version: string; ai_model: string | null; created_at: string;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('ecc_feature_documentation')
      .select('id, doc_type, title, content, version, ai_model, created_at')
      .eq('feature_id', featureId)
      .eq('generated_by_ai', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setEntries(data ?? []); setLoading(false); });
  }, [featureId]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>;

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ScrollText className="w-8 h-8 text-slate-200 mb-3" />
        <p className="text-sm font-medium text-slate-500">No AI activity yet</p>
        <p className="text-xs text-slate-400 mt-1">Use the AI Engineering tab to generate documentation or run AI tasks for this feature.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Bot className="w-3.5 h-3.5 text-violet-500" />
        <p className="text-xs text-slate-500">{entries.length} AI-generated entries</p>
      </div>
      {entries.map(entry => (
        <div key={entry.id} className="rounded-xl border border-slate-200 overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
            className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{entry.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-slate-400">{fmtDate(entry.created_at)}</span>
                {entry.ai_model && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-violet-50 text-violet-600 rounded">{entry.ai_model}</span>
                )}
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">{entry.doc_type.replace(/_/g, ' ')}</span>
              </div>
            </div>
            {expanded === entry.id ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-1" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-1" />}
          </button>
          {expanded === entry.id && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <pre className="text-xs text-slate-600 whitespace-pre-wrap mt-3 leading-relaxed font-sans">{entry.content}</pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Tab: History ─────────────────────────────────────────────────────────────

function HistoryTab({ featureId }: { featureId: string }) {
  const [history, setHistory] = useState<ReviewHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('ecc_feature_review_history')
      .select('*')
      .eq('feature_id', featureId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setHistory(data ?? []); setLoading(false); });
  }, [featureId]);

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>;

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <History className="w-8 h-8 text-slate-200 mb-3" />
        <p className="text-sm font-medium text-slate-500">No review history yet</p>
        <p className="text-xs text-slate-400 mt-1">Actions taken in the Product Review tab will be logged here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">{history.length} events on record</p>
      <div className="relative pl-5">
        <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-100" />
        {history.map((item, idx) => {
          const cfg = ACTION_CFG[item.action] ?? ACTION_CFG.review_requested;
          const Icon = cfg.icon;
          const checkedCount = (item.checklist_snapshot ?? []).filter(c => c.checked).length;
          const totalCount = (item.checklist_snapshot ?? []).length;
          return (
            <div key={item.id} className={`relative mb-4 ${idx === 0 ? '' : ''}`}>
              <div className={`absolute -left-3 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center ${cfg.bg}`}>
                <Icon className={`w-2.5 h-2.5 ${cfg.color}`} />
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className={`flex items-start justify-between gap-3 px-4 py-3 ${cfg.bg}`}>
                  <div>
                    <p className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">by {item.actor} · {fmtDate(item.created_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {item.from_status && item.to_status && (
                      <p className="text-[10px] text-slate-500">
                        {REVIEW_STATUS_CFG[item.from_status]?.label ?? item.from_status}
                        {' → '}
                        {REVIEW_STATUS_CFG[item.to_status]?.label ?? item.to_status}
                      </p>
                    )}
                    {item.from_lifecycle && item.to_lifecycle && (
                      <p className="text-[10px] text-slate-500">
                        {LIFECYCLE_CFG[item.from_lifecycle]?.label ?? item.from_lifecycle}
                        {' → '}
                        {LIFECYCLE_CFG[item.to_lifecycle]?.label ?? item.to_lifecycle}
                      </p>
                    )}
                  </div>
                </div>
                {(item.notes || totalCount > 0) && (
                  <div className="px-4 py-2 bg-white space-y-1">
                    {item.notes && <p className="text-xs text-slate-600 italic">"{item.notes}"</p>}
                    {totalCount > 0 && (
                      <p className="text-[10px] text-slate-400">Checklist at action: {checkedCount}/{totalCount} items checked</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  feature: Feature;
  onClose: () => void;
  onUpdate: (id: string, changes: Partial<Feature>) => void;
}

export function ECCFeatureDetailPanel({ feature: initialFeature, onClose, onUpdate }: Props) {
  const [f, setF] = useState<Feature>(initialFeature);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => { setF(initialFeature); }, [initialFeature.id]);

  const save = useCallback(async (field: string, value: unknown) => {
    await supabase.from('ecc_product_features')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', f.id);
    setF(prev => ({ ...prev, [field]: value }));
    onUpdate(f.id, { [field]: value } as Partial<Feature>);
  }, [f.id, onUpdate]);

  const handleReviewAction = useCallback(async (
    action: string,
    payload: {
      notes?: string;
      actor?: string;
      newReviewStatus?: string;
      newLifecycle?: string;
      checklistSnapshot?: { id: string; label: string; checked: boolean }[];
    }
  ) => {
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at: now };

    if (payload.newReviewStatus) updates.product_review_status = payload.newReviewStatus;
    if (payload.newLifecycle) updates.lifecycle_stage = payload.newLifecycle;

    if (action === 'approved') {
      updates.accepted_by = payload.actor ?? 'Product Owner';
      updates.accepted_at = now;
      if (payload.notes) updates.approval_comments = payload.notes;
    }
    if (action === 'rejected' && payload.notes) updates.rejection_reason = payload.notes;
    if (action === 'changes_requested' && payload.notes) updates.requested_changes = payload.notes;
    if (action === 'review_requested') updates.review_requested_at = now;
    if (action === 'review_started') updates.review_started_at = now;

    await supabase.from('ecc_product_features').update(updates).eq('id', f.id);

    await supabase.from('ecc_feature_review_history').insert({
      feature_id: f.id,
      action,
      actor: payload.actor ?? 'Product Owner',
      notes: payload.notes ?? null,
      from_status: f.product_review_status,
      to_status: payload.newReviewStatus ?? f.product_review_status,
      from_lifecycle: f.lifecycle_stage,
      to_lifecycle: payload.newLifecycle ?? f.lifecycle_stage,
      checklist_snapshot: payload.checklistSnapshot ?? [],
      metadata: {
        testing_status_at_action: f.testing_status,
        documentation_status_at_action: f.documentation_status,
        compliance_critical_at_action: f.compliance_critical,
      },
    });

    const merged = { ...f, ...updates } as unknown as Feature;
    setF(merged);
    onUpdate(f.id, updates as Partial<Feature>);
  }, [f, onUpdate]);

  const lc = LIFECYCLE_CFG[f.lifecycle_stage] ?? LIFECYCLE_CFG.planned;
  const reviewCfg = REVIEW_STATUS_CFG[f.product_review_status ?? 'not_started'] ?? REVIEW_STATUS_CFG.not_started;
  const healthScore = calculateHealthScore(f);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Panel header */}
      <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-slate-100 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-mono font-bold text-slate-400">{f.feature_id}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${lc.bg} ${lc.color}`}>{lc.label}</span>
            {f.product_review_status && f.product_review_status !== 'not_started' && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${reviewCfg.border} ${reviewCfg.bg} ${reviewCfg.color}`}>
                {reviewCfg.label}
              </span>
            )}
            {f.compliance_critical && (
              <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium border border-red-200">Compliance</span>
            )}
            <HealthScoreBadge score={healthScore} />
          </div>
          <h2 className="text-base font-bold text-slate-900 leading-tight truncate">{f.name}</h2>
          <p className="text-xs text-slate-400 mt-0.5">{f.category}{f.sub_category ? ` › ${f.sub_category}` : ''}</p>
        </div>
        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 px-4 pt-2 border-b border-slate-100 shrink-0 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap rounded-t-lg transition-colors border-b-2 ${
              activeTab === key
                ? 'text-slate-900 border-blue-500 bg-blue-50/50'
                : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {activeTab === 'overview'        && <OverviewTab f={f} onSave={save} />}
        {activeTab === 'implementation'  && <ImplementationTab f={f} />}
        {activeTab === 'documentation'   && <DocumentationTab featureId={f.feature_id} />}
        {activeTab === 'testing'         && <TestingTab f={f} onSave={save} />}
        {activeTab === 'product_review'  && <ProductReviewTab f={f} onSave={save} onReviewAction={handleReviewAction} />}
        {activeTab === 'ai_engineering'  && <AIEngineeringTab f={f} featureId={f.feature_id} />}
        {activeTab === 'ai_journal'      && <AIJournalTab featureId={f.feature_id} featureName={f.name} />}
        {activeTab === 'history'         && <HistoryTab featureId={f.id} />}
        {activeTab === 'audit'           && <AuditTab f={f} onSave={save} />}
        {activeTab === 'relationships'   && <RelationshipsTab featureId={f.feature_id} featureName={f.name} />}
        {activeTab === 'releases'        && <ReleasesTab f={f} onSave={save} />}
        {activeTab === 'business'        && <BusinessTab f={f} onSave={save} />}
        {activeTab === 'timeline'        && <TimelineTab featureId={f.feature_id} />}
        {activeTab === 'impact'          && <ImpactTab featureId={f.feature_id} featureName={f.name} />}
        {activeTab === 'screenshots'     && <ScreenshotsTab f={f} onSave={save} />}
      </div>
    </div>
  );
}
