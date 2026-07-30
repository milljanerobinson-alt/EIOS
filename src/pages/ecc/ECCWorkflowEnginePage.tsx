import { useState, useEffect, useCallback } from 'react';
import {
  Workflow, Loader2, AlertCircle, ChevronDown, ChevronUp,
  ArrowRight, Clock, CheckCircle2, XCircle, AlertTriangle,
  Shield, ShieldCheck, Package, Rocket, Archive, Ban,
  PauseCircle, RefreshCw, Plus, Filter, BarChart3,
  GitMerge, Lock, Unlock, Flag, Activity, Users,
  FileText, ClipboardList, Info, ChevronRight, Circle,
  LayoutDashboard, History, Settings,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StageDefinition {
  id: string;
  stage_key: string;
  display_name: string;
  description: string | null;
  display_order: number;
  stage_type: 'standard' | 'optional';
  allowed_previous_stages: string[];
  allowed_next_stages: string[];
  requires_approval: boolean;
  approval_role: string | null;
  is_editable: boolean;
  is_read_only: boolean;
  is_terminal: boolean;
  counts_as_active: boolean;
  counts_as_completed: boolean;
  dashboard_color: string;
  dashboard_icon: string;
  current_action: string | null;
  sla_hours: number | null;
  audit_category: string;
}

interface WorkflowInstance {
  id: string;
  artefact_type: string;
  artefact_id: string | null;
  artefact_ref: string | null;
  artefact_title: string;
  current_stage_key: string;
  current_gate: number | null;
  assigned_to: string | null;
  product_owner: string | null;
  priority: string;
  is_blocked: boolean;
  blocked_reason: string | null;
  stage_entered_at: string;
  is_historical: boolean;
  migration_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkflowTransition {
  id: string;
  instance_id: string;
  from_stage_key: string | null;
  to_stage_key: string;
  transitioned_by: string | null;
  transition_type: string;
  decision: string | null;
  notes: string | null;
  time_in_previous_stage_hours: number | null;
  created_at: string;
}

interface WorkflowGate {
  id: string;
  gate_number: number;
  gate_name: string;
  description: string | null;
  required_stage_key: string;
  responsible_role: string;
}

interface WorkflowApproval {
  id: string;
  instance_id: string;
  gate_number: number;
  status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  decision: string | null;
  comments: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  slate:   'bg-slate-100 text-slate-600 border-slate-200',
  blue:    'bg-blue-100 text-blue-700 border-blue-200',
  indigo:  'bg-indigo-100 text-indigo-700 border-indigo-200',
  amber:   'bg-amber-100 text-amber-700 border-amber-200',
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  teal:    'bg-teal-100 text-teal-700 border-teal-200',
  violet:  'bg-violet-100 text-violet-700 border-violet-200',
  green:   'bg-green-100 text-green-700 border-green-200',
  red:     'bg-red-100 text-red-700 border-red-200',
  orange:  'bg-orange-100 text-orange-700 border-orange-200',
};

const DOT_MAP: Record<string, string> = {
  slate:   'bg-slate-400',
  blue:    'bg-blue-500',
  indigo:  'bg-indigo-500',
  amber:   'bg-amber-500',
  emerald: 'bg-emerald-500',
  teal:    'bg-teal-500',
  violet:  'bg-violet-500',
  green:   'bg-green-500',
  red:     'bg-red-500',
  orange:  'bg-orange-500',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtRelative(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function hoursInStage(iso: string) {
  return ((Date.now() - new Date(iso).getTime()) / 3600000).toFixed(1);
}

function artefactTypeLabel(t: string) {
  const m: Record<string, string> = {
    audit: 'Audit', test_plan: 'Test Plan', release: 'Release',
    review: 'Engineering Review', spec: 'Specification',
    investment: 'Investment Review', roadmap: 'Roadmap Item',
    feature: 'Feature',
  };
  return m[t] ?? t;
}

function StageBadge({ stageKey, stages }: { stageKey: string; stages: StageDefinition[] }) {
  const s = stages.find(x => x.stage_key === stageKey);
  const color = s?.dashboard_color ?? 'slate';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${COLOR_MAP[color] ?? COLOR_MAP.slate}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${DOT_MAP[color] ?? DOT_MAP.slate}`} />
      {s?.display_name ?? stageKey}
    </span>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview',    label: 'Overview',        icon: LayoutDashboard },
  { key: 'lifecycle',   label: 'Lifecycle Stages', icon: GitMerge },
  { key: 'instances',   label: 'Active Work',      icon: Activity },
  { key: 'approvals',   label: 'Approval Queue',   icon: ShieldCheck },
  { key: 'history',     label: 'Audit Trail',      icon: History },
  { key: 'gates',       label: 'Governance Gates', icon: Flag },
] as const;

type TabKey = typeof TABS[number]['key'];

// ─── Visual Lifecycle Pipeline ────────────────────────────────────────────────

function LifecyclePipeline({ stages, currentStageKey }: { stages: StageDefinition[]; currentStageKey?: string }) {
  const standard = stages.filter(s => s.stage_type === 'standard').sort((a, b) => a.display_order - b.display_order);
  const optional = stages.filter(s => s.stage_type === 'optional').sort((a, b) => a.display_order - b.display_order);

  function stageStatus(s: StageDefinition): 'complete' | 'current' | 'upcoming' {
    if (!currentStageKey) return 'upcoming';
    const currentIdx = standard.findIndex(x => x.stage_key === currentStageKey);
    const thisIdx = standard.findIndex(x => x.stage_key === s.stage_key);
    if (thisIdx < currentIdx) return 'complete';
    if (s.stage_key === currentStageKey) return 'current';
    return 'upcoming';
  }

  return (
    <div>
      {/* Standard pipeline */}
      <div className="flex flex-wrap items-center gap-0">
        {standard.map((s, i) => {
          const status = stageStatus(s);
          const color = s.dashboard_color;
          return (
            <div key={s.stage_key} className="flex items-center">
              <div className={`flex flex-col items-center px-3 py-2.5 rounded-xl border transition-all min-w-[90px] text-center ${
                status === 'current'  ? `${COLOR_MAP[color] ?? COLOR_MAP.slate} shadow-sm scale-105` :
                status === 'complete' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 opacity-80' :
                'bg-slate-50 border-slate-200 text-slate-400'
              }`}>
                <span className={`text-[9px] font-bold uppercase tracking-wider mb-0.5 ${
                  status === 'current' ? '' : status === 'complete' ? 'text-emerald-600' : 'text-slate-400'
                }`}>{i + 1}</span>
                <span className={`text-[10px] font-semibold leading-tight text-center ${
                  status === 'current' ? '' : status === 'complete' ? 'text-emerald-700' : ''
                }`}>{s.display_name}</span>
                {status === 'complete' && <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5" />}
                {status === 'current'  && <span className="w-1.5 h-1.5 rounded-full bg-current mt-0.5 animate-pulse" />}
                {s.requires_approval && (
                  <span className="mt-0.5 text-[8px] font-semibold text-amber-600 bg-amber-100 px-1 rounded">Gate</span>
                )}
              </div>
              {i < standard.length - 1 && (
                <ChevronRight className={`w-3.5 h-3.5 mx-0.5 shrink-0 ${status === 'complete' ? 'text-emerald-400' : 'text-slate-300'}`} />
              )}
            </div>
          );
        })}
      </div>
      {/* Optional states */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Optional States (may be entered at any point)</p>
        <div className="flex flex-wrap gap-2">
          {optional.map(s => (
            <span key={s.stage_key} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-medium ${COLOR_MAP[s.dashboard_color] ?? COLOR_MAP.slate}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${DOT_MAP[s.dashboard_color] ?? DOT_MAP.slate}`} />
              {s.display_name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Reusable Lifecycle Tracker (exported for use across ECC) ─────────────────

export function WorkflowLifecycleTracker({
  currentStageKey,
  stages,
  compact = false,
}: {
  currentStageKey: string;
  stages: StageDefinition[];
  compact?: boolean;
}) {
  const standard = stages.filter(s => s.stage_type === 'standard').sort((a, b) => a.display_order - b.display_order);
  const currentIdx = standard.findIndex(s => s.stage_key === currentStageKey);
  const current = stages.find(s => s.stage_key === currentStageKey);

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {standard.map((s, i) => {
          const done = i < currentIdx;
          const active = s.stage_key === currentStageKey;
          const color = s.dashboard_color;
          return (
            <div key={s.stage_key} className="flex items-center gap-1">
              <div title={s.display_name} className={`w-2 h-2 rounded-full transition-all ${
                active ? `${DOT_MAP[color] ?? DOT_MAP.slate} ring-2 ring-offset-1 ring-current` :
                done   ? 'bg-emerald-400' :
                'bg-slate-200'
              }`} />
              {i < standard.length - 1 && <div className={`w-3 h-px ${done ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
            </div>
          );
        })}
        {current && <StageBadge stageKey={currentStageKey} stages={stages} />}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {standard.map((s, i) => {
        const done   = i < currentIdx;
        const active = s.stage_key === currentStageKey;
        const color  = s.dashboard_color;
        return (
          <div key={s.stage_key} className="flex items-center gap-2.5">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-all ${
              active ? `border-${color}-400 bg-${color}-100` :
              done   ? 'border-emerald-400 bg-emerald-100' :
              'border-slate-200 bg-white'
            }`}>
              {done   ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> :
               active ? <Circle className="w-2 h-2 fill-current" style={{ color: DOT_MAP[color]?.replace('bg-','') }} /> :
               <Circle className="w-2 h-2 text-slate-200 fill-current" />}
            </div>
            <span className={`text-xs ${active ? 'font-semibold text-slate-900' : done ? 'text-emerald-700' : 'text-slate-400'}`}>
              {s.display_name}
            </span>
            {active && s.requires_approval && (
              <span className="text-[9px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">Gate {s.stage_key === 'awaiting_po_approval' ? 1 : s.stage_key === 'awaiting_po_acceptance' ? 4 : s.stage_key === 'ready_for_release' ? 5 : ''} — Approval Required</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ stages, instances, approvals, gates }: {
  stages: StageDefinition[];
  instances: WorkflowInstance[];
  approvals: WorkflowApproval[];
  gates: WorkflowGate[];
}) {
  const activeInstances  = instances.filter(i => !i.is_historical && i.current_stage_key !== 'closed' && i.current_stage_key !== 'cancelled' && i.current_stage_key !== 'archived');
  const pendingApprovals = approvals.filter(a => a.status === 'pending');
  const blockedItems     = instances.filter(i => i.is_blocked && !i.is_historical);
  const completedItems   = instances.filter(i => i.current_stage_key === 'closed' || i.current_stage_key === 'released');
  const awaitingPO       = instances.filter(i => i.current_stage_key === 'awaiting_po_approval' || i.current_stage_key === 'awaiting_po_acceptance');

  const byStage: Record<string, number> = {};
  instances.filter(i => !i.is_historical).forEach(i => {
    byStage[i.current_stage_key] = (byStage[i.current_stage_key] ?? 0) + 1;
  });

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Work Items',      value: activeInstances.length,  color: 'blue',    icon: Activity },
          { label: 'Pending Approvals',      value: pendingApprovals.length, color: 'amber',   icon: ShieldCheck },
          { label: 'Awaiting PO Action',     value: awaitingPO.length,       color: 'orange',  icon: Users },
          { label: 'Blocked Items',          value: blockedItems.length,     color: 'red',     icon: AlertTriangle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className={`bg-white rounded-xl border p-4 ${
            color === 'blue' ? 'border-blue-100' : color === 'amber' ? 'border-amber-100' : color === 'red' ? 'border-red-100' : 'border-orange-100'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500">{label}</span>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                color === 'blue' ? 'bg-blue-50' : color === 'amber' ? 'bg-amber-50' : color === 'red' ? 'bg-red-50' : 'bg-orange-50'
              }`}>
                <Icon className={`w-4 h-4 ${
                  color === 'blue' ? 'text-blue-500' : color === 'amber' ? 'text-amber-500' : color === 'red' ? 'text-red-500' : 'text-orange-500'
                }`} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${
              color === 'blue' ? 'text-blue-700' : color === 'amber' ? 'text-amber-700' : color === 'red' ? 'text-red-700' : 'text-orange-700'
            }`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lifecycle pipeline */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <GitMerge className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-900">Standard Engineering Lifecycle</h3>
          </div>
          <div className="overflow-x-auto">
            <LifecyclePipeline stages={stages} />
          </div>
        </div>

        {/* Stage distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-900">Work Distribution by Stage</h3>
          </div>
          {Object.keys(byStage).length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">No active workflow instances.</div>
          ) : (
            <div className="space-y-2">
              {stages.filter(s => byStage[s.stage_key]).sort((a, b) => a.display_order - b.display_order).map(s => (
                <div key={s.stage_key} className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border w-44 shrink-0 ${COLOR_MAP[s.dashboard_color] ?? COLOR_MAP.slate}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${DOT_MAP[s.dashboard_color] ?? DOT_MAP.slate}`} />
                    {s.display_name}
                  </span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${DOT_MAP[s.dashboard_color] ?? DOT_MAP.slate}`}
                      style={{ width: `${Math.min(100, (byStage[s.stage_key] / Math.max(...Object.values(byStage))) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-700 w-4 text-right">{byStage[s.stage_key]}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Governance gates summary */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Flag className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-slate-900">Governance Gates — Current Status</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {gates.sort((a, b) => a.gate_number - b.gate_number).map(gate => {
            const atGate = instances.filter(i => {
              const s = stages.find(x => x.stage_key === i.current_stage_key);
              return s?.stage_key === gate.required_stage_key && !i.is_historical;
            });
            const pendingAtGate = approvals.filter(a => a.gate_number === gate.gate_number && a.status === 'pending').length;
            return (
              <div key={gate.gate_number} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center">
                    <span className="text-[9px] font-black text-slate-600">G{gate.gate_number}</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-700 leading-tight">{gate.gate_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{atGate.length} item{atGate.length !== 1 ? 's' : ''}</span>
                  {pendingAtGate > 0 ? (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">{pendingAtGate} pending</span>
                  ) : (
                    <span className="text-[10px] text-slate-400">Clear</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Completed / historical */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Archive className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900">Completed & Historical</h3>
          <span className="text-xs text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded-full">{completedItems.length + instances.filter(i => i.is_historical).length}</span>
        </div>
        {completedItems.length + instances.filter(i => i.is_historical).length === 0 ? (
          <p className="text-xs text-slate-400">No completed work items yet.</p>
        ) : (
          <div className="space-y-2">
            {instances.filter(i => i.current_stage_key === 'closed' || i.current_stage_key === 'released' || i.is_historical).map(inst => (
              <div key={inst.id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase">{artefactTypeLabel(inst.artefact_type)}</span>
                {inst.artefact_ref && <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 rounded">{inst.artefact_ref}</span>}
                <span className="flex-1 text-xs text-slate-700 font-medium truncate">{inst.artefact_title}</span>
                {inst.is_historical && <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">Historical Migration</span>}
                <StageBadge stageKey={inst.current_stage_key} stages={stages} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Lifecycle Stages Tab ─────────────────────────────────────────────────────

function LifecycleStagesTab({ stages }: { stages: StageDefinition[] }) {
  const [showOptional, setShowOptional] = useState(false);
  const standard = stages.filter(s => s.stage_type === 'standard').sort((a, b) => a.display_order - b.display_order);
  const optional = stages.filter(s => s.stage_type === 'optional').sort((a, b) => a.display_order - b.display_order);

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800">
          Lifecycle stages are stored in the database and fully configurable. New stages can be added without modifying application code. The engine enforces allowed transitions — no lifecycle stage can be bypassed.
        </p>
      </div>

      {/* Standard stages */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-900">Standard Lifecycle Stages</h3>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{standard.length}</span>
          </div>
        </div>
        <div className="divide-y divide-slate-50">
          {standard.map((s, i) => (
            <div key={s.stage_key} className="px-5 py-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-start gap-4">
                <div className="flex items-center gap-2 w-8 shrink-0">
                  <span className="text-[10px] font-black text-slate-400">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${COLOR_MAP[s.dashboard_color] ?? COLOR_MAP.slate}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${DOT_MAP[s.dashboard_color] ?? DOT_MAP.slate}`} />
                      {s.display_name}
                    </span>
                    {s.requires_approval && (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full">
                        <Lock className="w-2.5 h-2.5" /> Gate — {s.approval_role === 'product_owner' ? 'PO Approval Required' : 'Approval Required'}
                      </span>
                    )}
                    {s.is_terminal && <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full border border-slate-200">Terminal</span>}
                    {s.sla_hours && <span className="text-[9px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">SLA {s.sla_hours}h</span>}
                  </div>
                  {s.description && <p className="text-xs text-slate-500 mb-1.5">{s.description}</p>}
                  {s.current_action && (
                    <div className="flex items-center gap-1.5">
                      <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="text-xs font-medium text-slate-600 italic">Action: {s.current_action}</span>
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[9px] text-slate-400 font-mono bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{s.stage_key}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">{s.audit_category}</div>
                </div>
              </div>
              {s.allowed_next_stages.length > 0 && (
                <div className="mt-2 ml-12 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] text-slate-400 font-medium">→</span>
                  {s.allowed_next_stages.map(key => {
                    const next = stages.find(x => x.stage_key === key);
                    return next ? (
                      <span key={key} className={`text-[9px] px-1.5 py-0.5 rounded border ${COLOR_MAP[next.dashboard_color] ?? COLOR_MAP.slate}`}>{next.display_name}</span>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Optional states */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <button
          onClick={() => setShowOptional(s => !s)}
          className="w-full px-5 py-4 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <PauseCircle className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-900">Optional States</h3>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{optional.length}</span>
          </div>
          {showOptional ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showOptional && (
          <div className="divide-y divide-slate-50">
            {optional.map(s => (
              <div key={s.stage_key} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${COLOR_MAP[s.dashboard_color] ?? COLOR_MAP.slate}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${DOT_MAP[s.dashboard_color] ?? DOT_MAP.slate}`} />
                        {s.display_name}
                      </span>
                      {s.is_terminal && <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-100">Terminal</span>}
                    </div>
                    {s.description && <p className="text-xs text-slate-500">{s.description}</p>}
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{s.stage_key}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Active Work Instances Tab ────────────────────────────────────────────────

function InstancesTab({ instances, stages, transitions, onTransition }: {
  instances: WorkflowInstance[];
  stages: StageDefinition[];
  transitions: WorkflowTransition[];
  onTransition: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'active' | 'blocked' | 'historical'>('active');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [transitionTarget, setTransitionTarget] = useState('');
  const [transitionNotes, setTransitionNotes] = useState('');

  const filtered = instances.filter(i => {
    if (filter === 'active')    return !i.is_historical && i.current_stage_key !== 'closed' && i.current_stage_key !== 'cancelled';
    if (filter === 'blocked')   return i.is_blocked;
    if (filter === 'historical')return i.is_historical;
    return true;
  });

  async function doTransition(instanceId: string, toStageKey: string, notes: string) {
    const inst = instances.find(i => i.id === instanceId);
    if (!inst) return;
    const now = new Date().toISOString();
    const hoursInPrev = parseFloat(hoursInStage(inst.stage_entered_at));
    await supabase.from('ecc_workflow_instances').update({
      current_stage_key: toStageKey,
      stage_entered_at: now,
      updated_at: now,
    }).eq('id', instanceId);
    await supabase.from('ecc_workflow_transitions').insert({
      instance_id: instanceId,
      from_stage_key: inst.current_stage_key,
      to_stage_key: toStageKey,
      transitioned_by: 'Engineering',
      transition_type: 'manual',
      notes: notes || null,
      time_in_previous_stage_hours: hoursInPrev,
    });
    setTransitioning(null);
    setTransitionTarget('');
    setTransitionNotes('');
    onTransition();
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        {[
          { key: 'active', label: 'Active' },
          { key: 'blocked', label: 'Blocked' },
          { key: 'historical', label: 'Historical' },
          { key: 'all', label: 'All' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key as typeof filter)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              filter === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-12 text-center">
          <Activity className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-medium">No workflow instances</p>
          <p className="text-xs text-slate-400 mt-1">Enrol engineering artefacts in the workflow engine to track them here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(inst => {
            const stageDef = stages.find(s => s.stage_key === inst.current_stage_key);
            const allowedNext = stageDef?.allowed_next_stages ?? [];
            const instTransitions = transitions.filter(t => t.instance_id === inst.id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            const isExpanded = expandedId === inst.id;
            const isTransitioning = transitioning === inst.id;

            return (
              <div key={inst.id} className={`bg-white rounded-xl border transition-all ${inst.is_blocked ? 'border-red-200' : 'border-slate-200'}`}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : inst.id)}
                  className="w-full px-5 py-4 flex items-center gap-4 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{artefactTypeLabel(inst.artefact_type)}</span>
                      {inst.artefact_ref && (
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 rounded">{inst.artefact_ref}</span>
                      )}
                      {inst.is_historical && <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Historical</span>}
                      {inst.is_blocked && <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200">Blocked</span>}
                    </div>
                    <p className="text-sm font-semibold text-slate-800 truncate">{inst.artefact_title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">In stage {Math.round(parseFloat(hoursInStage(inst.stage_entered_at)))}h · Updated {fmtRelative(inst.updated_at)}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-3">
                    <StageBadge stageKey={inst.current_stage_key} stages={stages} />
                    {stageDef?.current_action && !inst.is_historical && (
                      <div className="hidden lg:flex items-center gap-1.5 text-[10px] text-slate-500 max-w-xs">
                        <ArrowRight className="w-3 h-3 shrink-0" />
                        <span className="truncate">{stageDef.current_action}</span>
                      </div>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-slate-100 pt-4 space-y-4">
                    {/* Stage tracker */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Lifecycle Position</p>
                        <WorkflowLifecycleTracker currentStageKey={inst.current_stage_key} stages={stages} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Details</p>
                        <div className="space-y-1 text-xs">
                          {inst.assigned_to && <div className="flex gap-2"><span className="text-slate-400 w-24">Assigned To</span><span className="text-slate-700">{inst.assigned_to}</span></div>}
                          {inst.product_owner && <div className="flex gap-2"><span className="text-slate-400 w-24">Product Owner</span><span className="text-slate-700">{inst.product_owner}</span></div>}
                          <div className="flex gap-2"><span className="text-slate-400 w-24">Priority</span><span className="text-slate-700 capitalize">{inst.priority}</span></div>
                          <div className="flex gap-2"><span className="text-slate-400 w-24">Stage Since</span><span className="text-slate-700">{fmtDate(inst.stage_entered_at)}</span></div>
                          <div className="flex gap-2"><span className="text-slate-400 w-24">Created</span><span className="text-slate-700">{fmtDate(inst.created_at)}</span></div>
                        </div>
                        {inst.migration_notes && (
                          <div className="mt-2 bg-slate-50 rounded-lg p-2 text-[10px] text-slate-500 border border-slate-100">{inst.migration_notes}</div>
                        )}
                      </div>
                    </div>

                    {/* Transition history */}
                    {instTransitions.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Transition History</p>
                        <div className="space-y-1">
                          {instTransitions.slice(0, 5).map(t => (
                            <div key={t.id} className="flex items-center gap-2 text-[10px] text-slate-500">
                              <span className="text-slate-300">{fmtDate(t.created_at)}</span>
                              {t.from_stage_key ? (
                                <>
                                  <StageBadge stageKey={t.from_stage_key} stages={stages} />
                                  <ArrowRight className="w-2.5 h-2.5 text-slate-300" />
                                </>
                              ) : null}
                              <StageBadge stageKey={t.to_stage_key} stages={stages} />
                              {t.notes && <span className="text-slate-400 italic truncate max-w-xs">{t.notes}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Transition controls */}
                    {!inst.is_historical && allowedNext.length > 0 && (
                      <div className="border-t border-slate-100 pt-3">
                        {isTransitioning ? (
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Advance Lifecycle</p>
                            <div className="flex flex-wrap gap-2">
                              {allowedNext.map(key => {
                                const nextStage = stages.find(s => s.stage_key === key);
                                return (
                                  <button
                                    key={key}
                                    onClick={() => setTransitionTarget(key)}
                                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                                      transitionTarget === key
                                        ? `${COLOR_MAP[nextStage?.dashboard_color ?? 'blue']} ring-2 ring-offset-1`
                                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                    }`}
                                  >
                                    {nextStage?.display_name ?? key}
                                    {nextStage?.requires_approval && <Lock className="w-2.5 h-2.5 inline ml-1" />}
                                  </button>
                                );
                              })}
                            </div>
                            <textarea
                              value={transitionNotes}
                              onChange={e => setTransitionNotes(e.target.value)}
                              placeholder="Transition notes (optional)…"
                              rows={2}
                              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => transitionTarget && doTransition(inst.id, transitionTarget, transitionNotes)}
                                disabled={!transitionTarget}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                              >
                                Confirm Transition
                              </button>
                              <button onClick={() => { setTransitioning(null); setTransitionTarget(''); setTransitionNotes(''); }} className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setTransitioning(inst.id); setExpandedId(inst.id); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg transition-colors"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                            Advance Lifecycle
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Approval Queue Tab ───────────────────────────────────────────────────────

function ApprovalsTab({ approvals, instances, stages, gates, onRefresh }: {
  approvals: WorkflowApproval[];
  instances: WorkflowInstance[];
  stages: StageDefinition[];
  gates: WorkflowGate[];
  onRefresh: () => void;
}) {
  const [deciding, setDeciding] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected' | 'changes_requested'>('approved');
  const [comments, setComments] = useState('');

  const pending = approvals.filter(a => a.status === 'pending');
  const resolved = approvals.filter(a => a.status !== 'pending');

  async function decide(approvalId: string, d: 'approved' | 'rejected' | 'changes_requested', c: string) {
    const now = new Date().toISOString();
    await supabase.from('ecc_workflow_approvals').update({
      status: d, decision: d, comments: c || null,
      decided_by: 'Product Owner', decided_at: now,
    }).eq('id', approvalId);
    setDeciding(null);
    setComments('');
    onRefresh();
  }

  function renderApproval(a: WorkflowApproval, isPending: boolean) {
    const inst  = instances.find(i => i.id === a.instance_id);
    const gate  = gates.find(g => g.gate_number === a.gate_number);
    const stage = inst ? stages.find(s => s.stage_key === inst.current_stage_key) : null;

    return (
      <div key={a.id} className={`bg-white rounded-xl border p-5 ${isPending ? 'border-amber-200' : 'border-slate-200'}`}>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">{inst ? artefactTypeLabel(inst.artefact_type) : 'Unknown'}</span>
              {inst?.artefact_ref && <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 rounded">{inst.artefact_ref}</span>}
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                a.status === 'pending'             ? 'bg-amber-100 text-amber-700 border-amber-200' :
                a.status === 'approved'            ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                a.status === 'rejected'            ? 'bg-red-100 text-red-700 border-red-200' :
                'bg-orange-100 text-orange-700 border-orange-200'
              }`}>{a.status.replace('_', ' ')}</span>
            </div>
            <p className="text-sm font-semibold text-slate-800">{inst?.artefact_title ?? 'Unknown artefact'}</p>
          </div>
          {inst && <StageBadge stageKey={inst.current_stage_key} stages={stages} />}
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
          <div className="flex items-center gap-1.5">
            <Flag className="w-3.5 h-3.5" />
            <span className="font-medium">Gate {a.gate_number} — {gate?.gate_name ?? 'Unknown Gate'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>{gate?.responsible_role === 'product_owner' ? 'Product Owner' : 'Engineering'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Opened {fmtRelative(a.created_at)}</span>
          </div>
        </div>

        {stage?.current_action && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600 mb-3 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
            <ArrowRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="font-medium">{stage.current_action}</span>
          </div>
        )}

        {a.comments && (
          <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600 mb-3 border border-slate-100">
            <span className="font-semibold">Comments:</span> {a.comments}
          </div>
        )}
        {a.decided_by && a.decided_at && (
          <p className="text-[10px] text-slate-400">Decided by {a.decided_by} · {fmtDate(a.decided_at)}</p>
        )}

        {isPending && deciding === a.id && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
            <div className="flex gap-2">
              {(['approved','rejected','changes_requested'] as const).map(d => (
                <button key={d} onClick={() => setDecision(d)} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                  decision === d
                    ? d === 'approved' ? 'bg-emerald-600 text-white border-emerald-600'
                      : d === 'rejected' ? 'bg-red-600 text-white border-red-600'
                      : 'bg-orange-600 text-white border-orange-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}>{d.replace('_', ' ')}</button>
              ))}
            </div>
            <textarea
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder="Comments (optional)…"
              rows={2}
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
            />
            <div className="flex items-center gap-2">
              <button onClick={() => decide(a.id, decision, comments)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg">Confirm Decision</button>
              <button onClick={() => { setDeciding(null); setComments(''); }} className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
            </div>
          </div>
        )}

        {isPending && deciding !== a.id && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2">
            <button onClick={() => setDeciding(a.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-700 text-xs font-semibold rounded-lg transition-colors">
              <ShieldCheck className="w-3.5 h-3.5" /> Make Decision
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {pending.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 py-12 text-center">
          <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-600">Approval queue is clear</p>
          <p className="text-xs text-slate-400 mt-1">No items are currently awaiting approval.</p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Pending Approvals</h3>
            <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{pending.length}</span>
          </div>
          <div className="space-y-3">{pending.map(a => renderApproval(a, true))}</div>
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Resolved Approvals</h3>
          <div className="space-y-3">{resolved.map(a => renderApproval(a, false))}</div>
        </div>
      )}
    </div>
  );
}

// ─── Audit Trail Tab ──────────────────────────────────────────────────────────

function AuditTrailTab({ transitions, instances, stages }: {
  transitions: WorkflowTransition[];
  instances: WorkflowInstance[];
  stages: StageDefinition[];
}) {
  const sorted = [...transitions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <History className="w-4 h-4 text-blue-500" />
        <h3 className="text-sm font-semibold text-slate-900">Lifecycle Transition Log</h3>
        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{sorted.length} records</span>
      </div>
      {sorted.length === 0 ? (
        <div className="py-10 text-center text-xs text-slate-400">No transitions recorded yet.</div>
      ) : (
        <div className="divide-y divide-slate-50">
          {sorted.map(t => {
            const inst = instances.find(i => i.id === t.instance_id);
            return (
              <div key={t.id} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] text-slate-400 w-32 shrink-0">{fmtDate(t.created_at)}</span>
                  {inst && (
                    <>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{artefactTypeLabel(inst.artefact_type)}</span>
                      {inst.artefact_ref && <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 rounded">{inst.artefact_ref}</span>}
                      <span className="text-xs font-medium text-slate-700 truncate max-w-[180px]">{inst.artefact_title}</span>
                    </>
                  )}
                  <div className="flex items-center gap-1.5 ml-auto">
                    {t.from_stage_key ? (
                      <>
                        <StageBadge stageKey={t.from_stage_key} stages={stages} />
                        <ArrowRight className="w-3 h-3 text-slate-300" />
                      </>
                    ) : <span className="text-[10px] text-slate-300">—</span>}
                    <StageBadge stageKey={t.to_stage_key} stages={stages} />
                  </div>
                </div>
                {(t.notes || t.transition_type !== 'manual') && (
                  <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-400">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">{t.transition_type.replace('_', ' ')}</span>
                    {t.transitioned_by && <span>by {t.transitioned_by}</span>}
                    {t.time_in_previous_stage_hours != null && <span>{t.time_in_previous_stage_hours}h in prev stage</span>}
                    {t.notes && <span className="italic truncate">{t.notes}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Governance Gates Tab ─────────────────────────────────────────────────────

function GatesTab({ gates, stages, instances }: {
  gates: WorkflowGate[];
  stages: StageDefinition[];
  instances: WorkflowInstance[];
}) {
  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
        <Flag className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          Governance gates are hard stops in the lifecycle. No artefact may progress past a gate without the required approval. Gate 1 and Gate 4 require Product Owner approval. All gate decisions are permanently recorded in the audit trail.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {gates.sort((a, b) => a.gate_number - b.gate_number).map(gate => {
          const requiredStage = stages.find(s => s.stage_key === gate.required_stage_key);
          const atGate = instances.filter(i => i.current_stage_key === gate.required_stage_key && !i.is_historical);
          return (
            <div key={gate.gate_number} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Gate</span>
                    <span className="text-lg font-black text-slate-700 leading-none">{gate.gate_number}</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{gate.gate_name}</h3>
                    {gate.description && <p className="text-xs text-slate-500 mt-0.5">{gate.description}</p>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-semibold text-slate-600 capitalize">{gate.responsible_role.replace('_', ' ')}</div>
                  <div className="text-[10px] text-slate-400">{atGate.length} item{atGate.length !== 1 ? 's' : ''} at gate</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Required Stage</p>
                  {requiredStage ? <StageBadge stageKey={requiredStage.stage_key} stages={stages} /> : <span className="text-xs text-slate-400">{gate.required_stage_key}</span>}
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300" />
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Next Stage (on approval)</p>
                  {requiredStage?.allowed_next_stages.filter(k => !['blocked','on_hold','rejected','cancelled','archived'].includes(k)).map(key => (
                    <StageBadge key={key} stageKey={key} stages={stages} />
                  ))}
                </div>
              </div>
              {atGate.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-2">Currently Waiting</p>
                  <div className="space-y-1">
                    {atGate.map(inst => (
                      <div key={inst.id} className="flex items-center gap-2 text-xs">
                        {inst.artefact_ref && <span className="font-mono text-slate-500 bg-slate-100 px-1.5 rounded text-[10px]">{inst.artefact_ref}</span>}
                        <span className="font-medium text-slate-700 truncate">{inst.artefact_title}</span>
                        <span className="text-slate-400 text-[10px] ml-auto">{Math.round(parseFloat(hoursInStage(inst.stage_entered_at)))}h</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Enrol New Artefact Modal ─────────────────────────────────────────────────

function EnrolModal({ stages, onClose, onEnrolled }: {
  stages: StageDefinition[];
  onClose: () => void;
  onEnrolled: () => void;
}) {
  const [title, setTitle]               = useState('');
  const [artefactType, setArtefactType] = useState('audit');
  const [artefactRef, setArtefactRef]   = useState('');
  const [priority, setPriority]         = useState('normal');
  const [saving, setSaving]             = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    const now = new Date().toISOString();
    const { data } = await supabase.from('ecc_workflow_instances').insert({
      artefact_type: artefactType,
      artefact_ref: artefactRef.trim() || null,
      artefact_title: title.trim(),
      current_stage_key: 'draft',
      priority,
      stage_entered_at: now,
    }).select().single();
    if (data) {
      await supabase.from('ecc_workflow_transitions').insert({
        instance_id: data.id,
        from_stage_key: null,
        to_stage_key: 'draft',
        transitioned_by: 'Engineering',
        transition_type: 'manual',
        notes: 'Enrolled in Engineering Workflow Lifecycle Engine.',
      });
    }
    setSaving(false);
    onEnrolled();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6">
        <h2 className="text-base font-bold text-slate-900 mb-4">Enrol New Artefact</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Artefact Type</label>
            <select value={artefactType} onChange={e => setArtefactType(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400">
              {['audit','test_plan','release','review','spec','investment','roadmap','feature'].map(t => (
                <option key={t} value={t}>{artefactTypeLabel(t)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Feature — Authentication Enhancement" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Reference (optional)</label>
            <input value={artefactRef} onChange={e => setArtefactRef(e.target.value)} placeholder="e.g. AUD-003, TP-002" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400">
              {['low','normal','high','critical'].map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-6">
          <button onClick={submit} disabled={!title.trim() || saving} className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40">
            {saving ? 'Enrolling…' : 'Enrol in Workflow'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ECCWorkflowEnginePage() {
  const [tab,        setTab]        = useState<TabKey>('overview');
  const [stages,     setStages]     = useState<StageDefinition[]>([]);
  const [instances,  setInstances]  = useState<WorkflowInstance[]>([]);
  const [transitions,setTransitions]= useState<WorkflowTransition[]>([]);
  const [gates,      setGates]      = useState<WorkflowGate[]>([]);
  const [approvals,  setApprovals]  = useState<WorkflowApproval[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [showEnrol,  setShowEnrol]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, i, t, g, a] = await Promise.all([
        supabase.from('ecc_workflow_stage_definitions').select('*').order('display_order'),
        supabase.from('ecc_workflow_instances').select('*').order('created_at', { ascending: false }),
        supabase.from('ecc_workflow_transitions').select('*').order('created_at', { ascending: false }),
        supabase.from('ecc_workflow_gates').select('*').order('gate_number'),
        supabase.from('ecc_workflow_approvals').select('*').order('created_at', { ascending: false }),
      ]);
      if (s.error) throw s.error;
      setStages(s.data ?? []);
      setInstances(i.data ?? []);
      setTransitions(t.data ?? []);
      setGates(g.data ?? []);
      setApprovals(a.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workflow data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingApprovals = approvals.filter(a => a.status === 'pending').length;
  const activeInstances  = instances.filter(i => !i.is_historical && i.current_stage_key !== 'closed' && i.current_stage_key !== 'cancelled').length;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shadow-sm">
              <Workflow className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900">Engineering Workflow Lifecycle Engine</h1>
              <p className="text-xs text-slate-500">EWLE-001 · Central governance and orchestration layer</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pendingApprovals > 0 && (
              <button onClick={() => setTab('approvals')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors">
                <ShieldCheck className="w-3.5 h-3.5" />
                {pendingApprovals} pending approval{pendingApprovals !== 1 ? 's' : ''}
              </button>
            )}
            <button onClick={() => setShowEnrol(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors">
              <Plus className="w-3.5 h-3.5" />
              Enrol Artefact
            </button>
            <button onClick={load} className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mt-4 -mb-px overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon }) => {
            const badge = key === 'approvals' && pendingApprovals > 0 ? pendingApprovals :
                          key === 'instances' && activeInstances > 0 ? activeInstances : 0;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
                  tab === key
                    ? 'text-blue-600 border-blue-500'
                    : 'text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {badge > 0 && (
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                    key === 'approvals' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
                  }`}>{badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        ) : (
          <>
            {tab === 'overview'   && <OverviewTab stages={stages} instances={instances} approvals={approvals} gates={gates} />}
            {tab === 'lifecycle'  && <LifecycleStagesTab stages={stages} />}
            {tab === 'instances'  && <InstancesTab stages={stages} instances={instances} transitions={transitions} onTransition={load} />}
            {tab === 'approvals'  && <ApprovalsTab approvals={approvals} instances={instances} stages={stages} gates={gates} onRefresh={load} />}
            {tab === 'history'    && <AuditTrailTab transitions={transitions} instances={instances} stages={stages} />}
            {tab === 'gates'      && <GatesTab gates={gates} stages={stages} instances={instances} />}
          </>
        )}
      </div>

      {showEnrol && (
        <EnrolModal stages={stages} onClose={() => setShowEnrol(false)} onEnrolled={load} />
      )}
    </div>
  );
}
