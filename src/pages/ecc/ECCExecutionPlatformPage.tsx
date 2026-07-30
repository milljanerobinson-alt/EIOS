import { useState, useEffect, useCallback } from 'react';
import {
  Cpu, Activity, Clock, CheckCircle2, XCircle, AlertTriangle,
  Play, Pause, Shield, Users, Database, Zap, BarChart3,
  Terminal, Package, FileCheck, Eye, ChevronRight, RefreshCw,
  Box, Layers, GitBranch, Brain, History, ArrowRight,
  Circle, CheckSquare, AlertCircle, Server, Wrench,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  type ExecutionSession, type EngineeringAgent, type ExecutionEvidence,
  type ExecutionPolicy, type ExecutionContract,
  STATE_CFG, AGENT_HEALTH_CFG, EVIDENCE_TYPE_CFG, ENFORCEMENT_CFG,
  ACTIVE_STATES, QUEUE_STATES, TERMINAL_STATES,
} from './ECCExecutionPlatformTypes';

// ─── Tab type ─────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'sessions' | 'evidence' | 'agents' | 'governance';

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, colour = 'slate' }: {
  label: string; value: string | number; sub?: string;
  icon: typeof Cpu; colour?: string;
}) {
  const colours: Record<string, string> = {
    slate:   'bg-slate-100 text-slate-600',
    blue:    'bg-blue-100 text-blue-600',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber:   'bg-amber-100 text-amber-700',
    red:     'bg-red-100 text-red-600',
    indigo:  'bg-indigo-100 text-indigo-600',
    orange:  'bg-orange-100 text-orange-600',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colours[colour] ?? colours.slate}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-slate-800 leading-tight">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── State Badge ──────────────────────────────────────────────────────────────

function StateBadge({ state }: { state: string }) {
  const cfg = STATE_CFG[state as keyof typeof STATE_CFG] ?? { label: state, bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', dot: 'bg-slate-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
      {cfg.label}
    </span>
  );
}

// ─── Agent Health Badge ───────────────────────────────────────────────────────

function HealthBadge({ health }: { health: string }) {
  const cfg = AGENT_HEALTH_CFG[health as keyof typeof AGENT_HEALTH_CFG] ?? { label: health, dot: 'bg-slate-400', text: 'text-slate-500' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, sub }: { icon: typeof Cpu; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-slate-300" />
      </div>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  sessions, agents, evidence,
}: {
  sessions: ExecutionSession[];
  agents: EngineeringAgent[];
  evidence: ExecutionEvidence[];
}) {
  const queue   = sessions.filter(s => QUEUE_STATES.includes(s.state));
  const active  = sessions.filter(s => ACTIVE_STATES.includes(s.state));
  const done    = sessions.filter(s => TERMINAL_STATES.includes(s.state));
  const guardian = sessions.filter(s => s.state === 'guardian_review');
  const awaitingPO = sessions.filter(s => s.state === 'awaiting_product_owner');
  const healthyAgents = agents.filter(a => a.health === 'healthy' && a.status === 'active');

  return (
    <div className="p-6 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="Queue"          value={queue.length}   icon={Clock}        colour="slate"   sub="awaiting execution" />
        <StatCard label="Executing"      value={active.length}  icon={Play}         colour="indigo"  sub="in-flight sessions" />
        <StatCard label="Guardian"       value={guardian.length} icon={Shield}       colour="orange"  sub="pending review" />
        <StatCard label="Awaiting PO"    value={awaitingPO.length} icon={Eye}        colour="amber"   sub="PO decision needed" />
        <StatCard label="Completed"      value={done.length}    icon={CheckCircle2} colour="emerald" sub="terminal sessions" />
        <StatCard label="Active Agents"  value={healthyAgents.length} icon={Cpu}    colour="blue"    sub="healthy & active" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Execution Queue */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-700">Execution Queue</h3>
            </div>
            <span className="text-xs text-slate-400">{queue.length} session{queue.length !== 1 ? 's' : ''}</span>
          </div>
          {queue.length === 0 ? (
            <EmptyState icon={Clock} title="Queue is clear" sub="No sessions pending execution" />
          ) : (
            <div className="divide-y divide-slate-50">
              {queue.map(s => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <StateBadge state={s.state} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{s.title}</p>
                    <p className="text-xs text-slate-400">{s.session_ref} {s.ewo_ref ? `· ${s.ewo_ref}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Engineering Agents */}
        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <Cpu className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">Engineering Agents</h3>
          </div>
          {agents.length === 0 ? (
            <EmptyState icon={Cpu} title="No agents registered" sub="Register an agent to begin execution" />
          ) : (
            <div className="divide-y divide-slate-50">
              {agents.map(a => (
                <div key={a.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700 truncate">{a.name}</p>
                      <p className="text-xs text-slate-400">{a.agent_ref} · {a.vendor}</p>
                    </div>
                    <HealthBadge health={a.health} />
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-slate-500">v{a.version}</span>
                    <span className="text-slate-200">·</span>
                    <span className="text-xs text-slate-500">{a.execution_count} executions</span>
                    <span className="text-slate-200">·</span>
                    <span className={`text-xs font-medium ${a.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}>{a.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Active & Guardian Sessions */}
      {(active.length > 0 || guardian.length > 0 || awaitingPO.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <Activity className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-slate-700">Current Execution</h3>
            <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
              {active.length + guardian.length + awaitingPO.length} active
            </span>
          </div>
          <div className="divide-y divide-slate-50">
            {[...active, ...guardian, ...awaitingPO].map(s => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <StateBadge state={s.state} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{s.title}</p>
                  <p className="text-xs text-slate-400">{s.session_ref}{s.ewo_ref ? ` · ${s.ewo_ref}` : ''}</p>
                </div>
                {s.guardian_required && (
                  <span className="flex items-center gap-1 text-xs text-orange-600">
                    <Shield className="w-3 h-3" /> Guardian
                  </span>
                )}
                {s.started_at && (
                  <span className="text-xs text-slate-400">{new Date(s.started_at).toLocaleDateString()}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Evidence */}
      {evidence.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <FileCheck className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">Recent Execution Evidence</h3>
          </div>
          <div className="divide-y divide-slate-50">
            {evidence.slice(0, 5).map(e => {
              const cfg = EVIDENCE_TYPE_CFG[e.evidence_type] ?? { label: e.evidence_type, colour: 'slate' };
              const colourMap: Record<string, string> = {
                emerald: 'bg-emerald-50 text-emerald-700',
                blue:    'bg-blue-50 text-blue-700',
                slate:   'bg-slate-50 text-slate-600',
                orange:  'bg-orange-50 text-orange-700',
                violet:  'bg-violet-50 text-violet-700',
                red:     'bg-red-50 text-red-700',
                amber:   'bg-amber-50 text-amber-700',
                cyan:    'bg-cyan-50 text-cyan-700',
                teal:    'bg-teal-50 text-teal-700',
                indigo:  'bg-indigo-50 text-indigo-700',
              };
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colourMap[cfg.colour] ?? colourMap.slate}`}>
                    {cfg.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 truncate">{e.title}</p>
                  </div>
                  {e.verified_at && (
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  )}
                  <span className="text-xs text-slate-400 flex-shrink-0">{new Date(e.created_at).toLocaleDateString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Execution Platform Architecture Map */}
      <div className="bg-slate-900 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-200">Execution Platform Architecture</h3>
          <span className="text-xs text-slate-500 ml-auto">EWO-010</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Execution Domain Model', icon: Box, status: 'live', sub: '13 objects' },
            { label: 'State Machine',          icon: GitBranch, status: 'live', sub: '14 states' },
            { label: 'Agent Framework',        icon: Cpu, status: 'live', sub: 'pluggable' },
            { label: 'Execution Context',      icon: Server, status: 'live', sub: 'env + memory' },
            { label: 'Execution Evidence',     icon: FileCheck, status: 'live', sub: '10 types' },
            { label: 'Memory Integration',     icon: Brain, status: 'live', sub: 'pre + post' },
            { label: 'Execution API',          icon: Zap, status: 'interface', sub: 'interfaces only' },
            { label: 'Execution Dashboard',    icon: BarChart3, status: 'live', sub: 'this screen' },
          ].map(({ label, icon: Icon, status, sub }) => (
            <div key={label} className="bg-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <Icon className="w-3.5 h-3.5 text-slate-400" />
                <span className={`text-xs font-medium ${status === 'live' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {status === 'live' ? 'LIVE' : 'IF'}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-200">{label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sessions Tab ─────────────────────────────────────────────────────────────

function SessionsTab({ sessions }: { sessions: ExecutionSession[] }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'queue' | 'terminal'>('all');

  const filtered = sessions.filter(s => {
    if (filter === 'active')   return ACTIVE_STATES.includes(s.state);
    if (filter === 'queue')    return QUEUE_STATES.includes(s.state);
    if (filter === 'terminal') return TERMINAL_STATES.includes(s.state);
    return true;
  });

  const FILTERS: { key: typeof filter; label: string; count: number }[] = [
    { key: 'all',      label: 'All',      count: sessions.length },
    { key: 'queue',    label: 'Queue',    count: sessions.filter(s => QUEUE_STATES.includes(s.state)).length },
    { key: 'active',   label: 'Active',   count: sessions.filter(s => ACTIVE_STATES.includes(s.state)).length },
    { key: 'terminal', label: 'Terminal', count: sessions.filter(s => TERMINAL_STATES.includes(s.state)).length },
  ];

  return (
    <div className="p-6 space-y-4">
      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-slate-800 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {f.label} <span className="ml-1 opacity-60">{f.count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Terminal} title="No sessions" sub="No execution sessions match this filter." />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-50">
          {filtered.map(s => (
            <div key={s.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800">{s.title}</p>
                    <StateBadge state={s.state} />
                    {s.guardian_required && (
                      <span className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                        <Shield className="w-3 h-3" /> Guardian Required
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-xs text-slate-500 font-mono">{s.session_ref}</span>
                    {s.ewo_ref && <span className="text-xs text-slate-400">EWO: {s.ewo_ref}</span>}
                    {s.agent && <span className="text-xs text-slate-400">Agent: {s.agent.name}</span>}
                    {s.started_at && (
                      <span className="text-xs text-slate-400">Started: {new Date(s.started_at).toLocaleDateString()}</span>
                    )}
                    {s.duration_minutes && (
                      <span className="text-xs text-slate-400">{Math.round(s.duration_minutes)}m</span>
                    )}
                  </div>
                </div>
              </div>
              {/* State history mini-timeline */}
              {s.state_history.length > 0 && (
                <div className="flex items-center gap-1 mt-2 overflow-x-auto">
                  {s.state_history.slice(-5).map((h, i) => (
                    <div key={i} className="flex items-center gap-1 flex-shrink-0">
                      {i > 0 && <ArrowRight className="w-2.5 h-2.5 text-slate-300" />}
                      <span className="text-xs text-slate-400">{STATE_CFG[h.to_state]?.label ?? h.to_state}</span>
                    </div>
                  ))}
                  {s.state_history.length > 5 && (
                    <span className="text-xs text-slate-300 ml-1">+{s.state_history.length - 5} more</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Evidence Tab ─────────────────────────────────────────────────────────────

function EvidenceTab({ evidence }: { evidence: ExecutionEvidence[] }) {
  const [filter, setFilter] = useState('all');
  const types = [...new Set(evidence.map(e => e.evidence_type))];

  const filtered = filter === 'all' ? evidence : evidence.filter(e => e.evidence_type === filter);

  const colourMap: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue:    'bg-blue-50 text-blue-700 border-blue-200',
    slate:   'bg-slate-50 text-slate-600 border-slate-200',
    orange:  'bg-orange-50 text-orange-700 border-orange-200',
    violet:  'bg-violet-50 text-violet-700 border-violet-200',
    red:     'bg-red-50 text-red-700 border-red-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    cyan:    'bg-cyan-50 text-cyan-700 border-cyan-200',
    teal:    'bg-teal-50 text-teal-700 border-teal-200',
    indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  };

  return (
    <div className="p-6 space-y-4">
      {/* Type filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filter === 'all' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          All <span className="ml-1 opacity-60">{evidence.length}</span>
        </button>
        {types.map(t => {
          const cfg = EVIDENCE_TYPE_CFG[t as keyof typeof EVIDENCE_TYPE_CFG];
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === t ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              {cfg?.label ?? t} <span className="ml-1 opacity-60">{evidence.filter(e => e.evidence_type === t).length}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FileCheck} title="No evidence recorded" sub="Evidence is recorded as sessions execute." />
      ) : (
        <div className="space-y-2">
          {filtered.map(e => {
            const cfg = EVIDENCE_TYPE_CFG[e.evidence_type as keyof typeof EVIDENCE_TYPE_CFG] ?? { label: e.evidence_type, colour: 'slate' };
            const badgeClass = colourMap[cfg.colour] ?? colourMap.slate;
            return (
              <div key={e.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium border flex-shrink-0 ${badgeClass}`}>
                    {cfg.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{e.title}</p>
                    {e.content && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{e.content}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      <span className="text-xs text-slate-400">{new Date(e.created_at).toLocaleDateString()}</span>
                      {e.verified_at && (
                        <span className="flex items-center gap-1 text-xs text-emerald-600">
                          <CheckSquare className="w-3 h-3" /> Verified
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Agents Tab ───────────────────────────────────────────────────────────────

function AgentsTab({ agents }: { agents: EngineeringAgent[] }) {
  return (
    <div className="p-6 space-y-4">
      {agents.length === 0 ? (
        <EmptyState icon={Cpu} title="No agents registered" sub="Register an engineering agent to enable execution." />
      ) : (
        <div className="space-y-4">
          {agents.map(a => (
            <div key={a.id} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Cpu className="w-5 h-5 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-800">{a.name}</h3>
                    <HealthBadge health={a.health} />
                    <span className={`text-xs font-medium ${a.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {a.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{a.agent_ref} · {a.vendor} · v{a.version}</p>
                  {a.description && (
                    <p className="text-xs text-slate-500 mt-1.5">{a.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    <div>
                      <p className="text-xs text-slate-400">Type</p>
                      <p className="text-xs font-medium text-slate-700 capitalize">{a.agent_type}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Executions</p>
                      <p className="text-xs font-medium text-slate-700">{a.execution_count}</p>
                    </div>
                    {a.last_health_check_at && (
                      <div>
                        <p className="text-xs text-slate-400">Last Health Check</p>
                        <p className="text-xs font-medium text-slate-700">{new Date(a.last_health_check_at).toLocaleDateString()}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-slate-400">Registered</p>
                      <p className="text-xs font-medium text-slate-700">{new Date(a.registered_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {/* Capability profile */}
                  {a.capability_profile && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-xs font-medium text-slate-500 mb-1.5">Capability Profile: {a.capability_profile.profile_name}</p>
                      <div className="flex flex-wrap gap-1">
                        {a.capability_profile.capabilities.slice(0, 8).map(cap => (
                          <span key={cap} className="text-xs bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                            {cap.replace(/_/g, ' ')}
                          </span>
                        ))}
                        {a.capability_profile.capabilities.length > 8 && (
                          <span className="text-xs text-slate-400">+{a.capability_profile.capabilities.length - 8} more</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        <span className={`flex items-center gap-1 ${a.capability_profile.supports_rollback ? 'text-emerald-600' : 'text-slate-400'}`}>
                          <Circle className={`w-2 h-2 ${a.capability_profile.supports_rollback ? 'text-emerald-500' : ''}`} />
                          Rollback
                        </span>
                        <span className={`flex items-center gap-1 ${a.capability_profile.supports_guardian ? 'text-emerald-600' : 'text-slate-400'}`}>
                          <Circle className={`w-2 h-2 ${a.capability_profile.supports_guardian ? 'text-emerald-500' : ''}`} />
                          Guardian
                        </span>
                        <span>Max {a.capability_profile.max_session_duration_minutes}m per session</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Governance Tab ───────────────────────────────────────────────────────────

function GovernanceTab({ policies, contracts }: { policies: ExecutionPolicy[]; contracts: ExecutionContract[] }) {
  return (
    <div className="p-6 space-y-6">
      {/* Policies */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Execution Policies</h3>
          <span className="text-xs text-slate-400">({policies.length})</span>
        </div>
        {policies.length === 0 ? (
          <EmptyState icon={Shield} title="No policies" sub="No execution policies defined." />
        ) : (
          <div className="space-y-3">
            {policies.map(p => {
              const enfCfg = ENFORCEMENT_CFG[p.enforcement_level];
              return (
                <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${enfCfg.bg} ${enfCfg.text}`}>
                          {enfCfg.label}
                        </span>
                        {p.active && (
                          <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">Active</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono">{p.policy_ref} · {p.policy_type}</p>
                    </div>
                    <span className="text-xs text-slate-400">v{p.version}</span>
                  </div>
                  {p.description && (
                    <p className="text-xs text-slate-500 mt-2">{p.description}</p>
                  )}
                  {Array.isArray(p.rules) && p.rules.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {(p.rules as Array<{ rule?: string; description?: string }>).map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                          <ChevronRight className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                          <span>{r.description ?? r.rule}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {p.applies_to.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {p.applies_to.map(scope => (
                        <span key={scope} className="text-xs bg-slate-50 border border-slate-200 text-slate-500 px-2 py-0.5 rounded-full">
                          {scope}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Contracts */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Package className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-700">Execution Contracts</h3>
          <span className="text-xs text-slate-400">({contracts.length})</span>
        </div>
        {contracts.length === 0 ? (
          <EmptyState icon={Package} title="No contracts" sub="No execution contracts defined." />
        ) : (
          <div className="space-y-3">
            {contracts.map(c => (
              <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{c.name}</p>
                      {c.active && (
                        <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">Active</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">{c.contract_ref} · {c.contract_type}</p>
                  </div>
                  <span className="text-xs text-slate-400">v{c.version}</span>
                </div>
                {c.scope && <p className="text-xs text-slate-500 mt-1.5">Scope: {c.scope}</p>}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                  {Array.isArray(c.obligations) && c.obligations.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">Obligations</p>
                      {(c.obligations as Array<{ obligation?: string }>).map((o, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-slate-600 mb-0.5">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                          {o.obligation}
                        </div>
                      ))}
                    </div>
                  )}
                  {Array.isArray(c.constraints) && c.constraints.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">Constraints</p>
                      {(c.constraints as Array<{ constraint?: string }>).map((ct, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-slate-600 mb-0.5">
                          <AlertCircle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                          {ct.constraint}
                        </div>
                      ))}
                    </div>
                  )}
                  {Array.isArray(c.acceptance_criteria) && c.acceptance_criteria.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">Acceptance Criteria</p>
                      {(c.acceptance_criteria as Array<{ criterion?: string }>).map((ac, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-slate-600 mb-0.5">
                          <CheckSquare className="w-3 h-3 text-blue-500 mt-0.5 flex-shrink-0" />
                          {ac.criterion}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ECCExecutionPlatformPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [sessions,  setSessions]  = useState<ExecutionSession[]>([]);
  const [agents,    setAgents]    = useState<EngineeringAgent[]>([]);
  const [evidence,  setEvidence]  = useState<ExecutionEvidence[]>([]);
  const [policies,  setPolicies]  = useState<ExecutionPolicy[]>([]);
  const [contracts, setContracts] = useState<ExecutionContract[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessRes, agentRes, evRes, polRes, ctRes] = await Promise.all([
        supabase
          .from('execution_session')
          .select('*, agent:engineering_agent(id, agent_ref, name, vendor, version, health, status, execution_count, capability_profile:execution_capability_profile(*))')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('engineering_agent')
          .select('*, capability_profile:execution_capability_profile(*)')
          .order('registered_at', { ascending: false }),
        supabase
          .from('execution_evidence')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('execution_policy')
          .select('*')
          .eq('active', true)
          .order('created_at', { ascending: true }),
        supabase
          .from('execution_contract')
          .select('*')
          .eq('active', true)
          .order('created_at', { ascending: true }),
      ]);

      if (sessRes.data)  setSessions(sessRes.data as ExecutionSession[]);
      if (agentRes.data) setAgents(agentRes.data as EngineeringAgent[]);
      if (evRes.data)    setEvidence(evRes.data as ExecutionEvidence[]);
      if (polRes.data)   setPolicies(polRes.data as ExecutionPolicy[]);
      if (ctRes.data)    setContracts(ctRes.data as ExecutionContract[]);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const TABS: { key: Tab; label: string; icon: typeof Cpu }[] = [
    { key: 'overview',    label: 'Overview',    icon: BarChart3  },
    { key: 'sessions',    label: 'Sessions',    icon: Terminal   },
    { key: 'evidence',    label: 'Evidence',    icon: FileCheck  },
    { key: 'agents',      label: 'Agents',      icon: Cpu        },
    { key: 'governance',  label: 'Governance',  icon: Shield     },
  ];

  const activeCount  = sessions.filter(s => ACTIVE_STATES.includes(s.state)).length;
  const queueCount   = sessions.filter(s => QUEUE_STATES.includes(s.state)).length;
  const guardianCount = sessions.filter(s => s.state === 'guardian_review').length;
  const healthyCount = agents.filter(a => a.health === 'healthy' && a.status === 'active').length;

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200">
        <div className="px-6 pt-5 pb-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <h1 className="text-lg font-bold text-slate-800">Engineering Execution Platform</h1>
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">EWO-010</span>
              </div>
              <p className="text-xs text-slate-500">Shared EIOS platform capability — execution domain, state machine, agent framework, evidence.</p>
            </div>
            <div className="flex items-center gap-3 pb-3">
              {/* Quick health indicators */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                <span className={`w-2 h-2 rounded-full ${healthyCount > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                <span className="text-xs text-slate-600">{healthyCount} agent{healthyCount !== 1 ? 's' : ''} healthy</span>
              </div>
              {activeCount > 0 && (
                <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  <span className="text-xs text-indigo-700">{activeCount} executing</span>
                </div>
              )}
              {guardianCount > 0 && (
                <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
                  <Shield className="w-3.5 h-3.5 text-orange-600" />
                  <span className="text-xs text-orange-700">{guardianCount} guardian review</span>
                </div>
              )}
              {queueCount > 0 && (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs text-slate-600">{queueCount} queued</span>
                </div>
              )}
              <button
                onClick={load}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
          {/* Tab navigation */}
          <div className="flex gap-0 -mb-px">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === t.key
                    ? 'border-slate-800 text-slate-800'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
            <div className="ml-auto flex items-center pb-2">
              <span className="text-xs text-slate-400">
                Updated {lastRefresh.toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {loading && sessions.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading execution platform…
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'overview'   && <OverviewTab sessions={sessions} agents={agents} evidence={evidence} />}
            {activeTab === 'sessions'   && <SessionsTab sessions={sessions} />}
            {activeTab === 'evidence'   && <EvidenceTab evidence={evidence} />}
            {activeTab === 'agents'     && <AgentsTab agents={agents} />}
            {activeTab === 'governance' && <GovernanceTab policies={policies} contracts={contracts} />}
          </>
        )}
      </div>
    </div>
  );
}
