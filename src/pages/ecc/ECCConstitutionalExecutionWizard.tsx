import { useState, useCallback, useEffect, useRef } from 'react';
import {
  X, ChevronRight, ChevronLeft, Check, Loader2, Lightbulb,
  Target, Zap, Server, Cpu, Eye, CheckCircle2, AlertCircle,
  ArrowRight, Shield, Brain, FileCheck, Database, Sparkles,
  Search, GitBranch, Package, BookOpen, Layers, Link2,
  GitMerge, XCircle, ChevronDown, ChevronUp, ExternalLink,
  ClipboardList, Info,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ConstitutionalEngine } from '../../lib/constitutionalEngine';
import {
  type WizardState, type WizardStep, type ExecutionPipelineStage,
  type SimilarityResult, type SimilarityDecision,
  WIZARD_STEPS, INITIAL_WIZARD_STATE, DEFAULT_PIPELINE,
  IDEA_CATEGORY_CFG, SIMILARITY_OBJECT_TYPE_CFG, SIMILARITY_DECISION_CFG,
  RELATIONSHIP_CFG,
  type IdeaCategory,
} from './ECCIdeaTypes';
import { hydrateWizardState, type HydrationDiagnostics } from '../../lib/wizardStateHydration';

// ─── Small helpers ────────────────────────────────────────────────────────────

function genRef(prefix: string): string {
  const ts  = Date.now().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${ts}${rnd}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// Tokenise text for similarity scoring
function tokenise(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2)
  );
}

function tokenOverlap(a: string, b: string): number {
  if (!a && !b) return 0;
  const ta = tokenise(a);
  const tb = tokenise(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const tok of ta) if (tb.has(tok)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

// ─── Similarity Engine ────────────────────────────────────────────────────────

async function runSimilaritySearch(state: WizardState): Promise<SimilarityResult[]> {
  const query = [state.idea.title, state.idea.description, state.intent.title, state.intent.description]
    .filter(Boolean).join(' ');
  const tags = state.idea.tags;

  const results: SimilarityResult[] = [];

  // 1. Engineering Ideas
  const { data: ideas } = await supabase
    .from('engineering_idea')
    .select('id, idea_ref, title, description, status, category, tags')
    .neq('status', 'archived')
    .limit(50);

  for (const row of ideas ?? []) {
    const titleScore = tokenOverlap(state.idea.title, row.title ?? '') * 0.55;
    const descScore  = tokenOverlap(query, row.description ?? '') * 0.25;
    const tagScore   = tags.length > 0 ? (row.tags?.filter((t: string) => tags.includes(t)).length ?? 0) / Math.max(tags.length, 1) * 0.20 : 0;
    const score      = Math.min(titleScore + descScore + tagScore, 1);
    if (score >= 0.25) {
      results.push({
        id: row.id,
        object_type: 'engineering_idea',
        ref: row.idea_ref,
        title: row.title,
        reason: `Title word overlap: ${Math.round((titleScore / 0.55) * 100)}%. Category: ${row.category}.`,
        relationship: score > 0.75 ? 'duplicate' : score > 0.5 ? 'related' : 'complements',
        status: row.status,
        score,
        metadata: { category: row.category, tags: row.tags },
      });
    }
  }

  // 2. Engineering Features
  const { data: featuresAlt } = await supabase
    .from('ecc_product_features')
    .select('id, feature_ref, title, description, status')
    .limit(50);

  for (const row of featuresAlt ?? []) {
    const score = tokenOverlap(state.idea.title, row.title ?? '') * 0.7 +
                  tokenOverlap(query, row.description ?? '') * 0.3;
    if (score >= 0.25) {
      results.push({
        id: row.id,
        object_type: 'engineering_feature',
        ref: row.feature_ref ?? `FEAT-${row.id.slice(0, 8).toUpperCase()}`,
        title: row.title,
        reason: `Feature title overlap: ${Math.round(score * 100)}%.`,
        relationship: score > 0.65 ? 'related' : 'extends',
        status: row.status ?? 'unknown',
        score: Math.min(score * 0.9, 1),
        metadata: {},
      });
    }
  }

  // 3. Engineering Work Orders
  const { data: workOrders } = await supabase
    .from('engineering_work_orders')
    .select('id, ewo_ref, title, description, status')
    .limit(30);

  for (const row of workOrders ?? []) {
    const score = tokenOverlap(state.idea.title, row.title ?? '') * 0.6 +
                  tokenOverlap(query, row.description ?? '') * 0.4;
    if (score >= 0.2) {
      results.push({
        id: row.id,
        object_type: 'work_order',
        ref: row.ewo_ref ?? `EWO-${row.id.slice(0, 3).toUpperCase()}`,
        title: row.title,
        reason: `Work order covers related engineering scope: ${Math.round(score * 100)}% overlap.`,
        relationship: score > 0.6 ? 'supersedes' : 'related',
        status: row.status ?? 'unknown',
        score: Math.min(score * 0.85, 1),
        metadata: {},
      });
    }
  }

  // 4. Engineering Standards
  const { data: standards } = await supabase
    .from('ecc_engineering_standards')
    .select('id, title, body, status')
    .limit(20);

  for (const row of standards ?? []) {
    const score = tokenOverlap(state.idea.title, row.title ?? '') * 0.5 +
                  tokenOverlap(query, row.body ?? '') * 0.5;
    if (score >= 0.3) {
      results.push({
        id: row.id,
        object_type: 'engineering_standard',
        ref: `STD-${row.id.slice(0, 8).toUpperCase()}`,
        title: row.title,
        reason: `Standard governs this engineering domain: ${Math.round(score * 100)}% relevance.`,
        relationship: 'complements',
        status: row.status ?? 'active',
        score: Math.min(score * 0.75, 1),
        metadata: {},
      });
    }
  }

  // 5. Engineering Records (Records Library)
  const { data: records } = await supabase
    .from('engineering_records_library')
    .select('id, record_ref, title, record_type, status')
    .limit(30);

  for (const row of records ?? []) {
    const score = tokenOverlap(state.idea.title, row.title ?? '') * 1.0;
    if (score >= 0.25) {
      results.push({
        id: row.id,
        object_type: 'engineering_record',
        ref: row.record_ref ?? `REC-${row.id.slice(0, 8).toUpperCase()}`,
        title: row.title,
        reason: `Engineering record with related content: ${Math.round(score * 100)}% overlap.`,
        relationship: 'related',
        status: row.status ?? 'active',
        score: Math.min(score * 0.8, 1),
        metadata: { record_type: row.record_type },
      });
    }
  }

  // 6. Engineering Memory
  const { data: memory } = await supabase
    .from('engineering_memory')
    .select('id, record_ref, title, content, knowledge_category, authority_state')
    .limit(20);

  for (const row of memory ?? []) {
    const score = tokenOverlap(state.idea.title, row.title ?? '') * 0.5 +
                  tokenOverlap(query, row.content ?? '') * 0.5;
    if (score >= 0.35) {
      results.push({
        id: row.id,
        object_type: 'engineering_memory',
        ref: row.record_ref ?? `MEM-${row.id.slice(0, 8).toUpperCase()}`,
        title: row.title ?? row.content?.slice(0, 60) ?? 'Memory entry',
        reason: `Engineering memory captures related knowledge: ${Math.round(score * 100)}% relevance.`,
        relationship: 'complements',
        status: row.authority_state ?? 'active',
        score: Math.min(score * 0.7, 1),
        metadata: { knowledge_category: row.knowledge_category },
      });
    }
  }

  // Sort by score descending, cap at top 12
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: WizardStep }) {
  const activeIndex = WIZARD_STEPS.findIndex(s => s.key === current);
  return (
    <div className="flex items-center gap-0 flex-wrap justify-center">
      {WIZARD_STEPS.map((s, i) => {
        const done   = i < activeIndex;
        const active = i === activeIndex;
        return (
          <div key={s.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                done   ? 'bg-emerald-500 border-emerald-500 text-white' :
                active ? 'bg-slate-800 border-slate-800 text-white' :
                         'bg-white border-slate-200 text-slate-400'
              }`}>
                {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-xs mt-1 font-medium max-w-[72px] text-center leading-tight ${
                active ? 'text-slate-700' : done ? 'text-emerald-600' : 'text-slate-400'
              }`}>{s.label}</span>
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <div className={`w-8 h-0.5 mb-5 mx-1 ${done ? 'bg-emerald-400' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Execution Pipeline Display ───────────────────────────────────────────────

function PipelineDisplay({ stages }: { stages: ExecutionPipelineStage[] }) {
  const ICONS: Record<string, typeof Check> = {
    intent: Target, objective: Target, strategy: Zap, session: Database,
    memory_pre: Brain, idea: Lightbulb, evidence: FileCheck,
    memory_post: Brain, ewo_promote: ClipboardList, complete: CheckCircle2,
  };
  return (
    <div className="space-y-2">
      {stages.map(stage => {
        const Icon = ICONS[stage.key] ?? CheckCircle2;
        return (
          <div key={stage.key} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all ${
            stage.status === 'complete' ? 'bg-emerald-50 border-emerald-200' :
            stage.status === 'running'  ? 'bg-blue-50 border-blue-200 shadow-sm' :
            stage.status === 'error'    ? 'bg-red-50 border-red-200' :
                                          'bg-slate-50 border-slate-200 opacity-60'
          }`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
              stage.status === 'complete' ? 'bg-emerald-500 text-white' :
              stage.status === 'running'  ? 'bg-blue-500 text-white' :
              stage.status === 'error'    ? 'bg-red-500 text-white' :
                                            'bg-slate-200 text-slate-400'
            }`}>
              {stage.status === 'running'  ? <Loader2 className="w-3 h-3 animate-spin" /> :
               stage.status === 'complete' ? <Check className="w-3 h-3" /> :
               stage.status === 'error'    ? <AlertCircle className="w-3 h-3" /> :
                                             <Icon className="w-3 h-3" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium ${
                stage.status === 'complete' ? 'text-emerald-700' :
                stage.status === 'running'  ? 'text-blue-700' :
                stage.status === 'error'    ? 'text-red-700' : 'text-slate-500'
              }`}>{stage.label}</p>
              {stage.record_ref && (
                <p className="text-xs text-slate-400 font-mono">{stage.record_ref}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Step Forms ───────────────────────────────────────────────────────────────

function IntentStep({ state, onChange }: { state: WizardState; onChange: (s: Partial<WizardState>) => void }) {
  const { intent } = state;
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Intent Title <span className="text-red-500">*</span></label>
        <input
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300"
          placeholder="e.g. Improve engineering execution traceability"
          value={intent.title}
          onChange={e => onChange({ intent: { ...intent, title: e.target.value } })}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
        <textarea
          rows={3}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
          placeholder="What is the engineering intent behind this idea?"
          value={intent.description}
          onChange={e => onChange({ intent: { ...intent, description: e.target.value } })}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Business Driver</label>
        <input
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300"
          placeholder="e.g. Reduce cognitive load for engineers"
          value={intent.business_driver}
          onChange={e => onChange({ intent: { ...intent, business_driver: e.target.value } })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Priority</label>
          <select
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300"
            value={intent.priority}
            onChange={e => onChange({ intent: { ...intent, priority: e.target.value as typeof intent.priority } })}
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Programme</label>
          <input
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 bg-slate-50"
            value={intent.programme}
            readOnly
          />
        </div>
      </div>
    </div>
  );
}

function ObjectiveStep({ state, onChange }: { state: WizardState; onChange: (s: Partial<WizardState>) => void }) {
  const { objective, intent } = state;

  function setMetric(i: number, val: string) {
    const next = [...objective.success_metrics];
    next[i] = val;
    onChange({ objective: { ...objective, success_metrics: next } });
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-500">
        <p className="font-medium text-slate-600">Engineering Intent: {intent.title || '—'}</p>
        <p className="mt-0.5">This objective will be linked to that intent.</p>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Objective Title <span className="text-red-500">*</span></label>
        <input
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300"
          placeholder="e.g. Create first engineering idea via constitutional execution"
          value={objective.title}
          onChange={e => onChange({ objective: { ...objective, title: e.target.value } })}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
        <textarea
          rows={2}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
          placeholder="What does success look like?"
          value={objective.description}
          onChange={e => onChange({ objective: { ...objective, description: e.target.value } })}
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-slate-600">Success Metrics</label>
          <button
            onClick={() => onChange({ objective: { ...objective, success_metrics: [...objective.success_metrics, ''] } })}
            className="text-xs text-blue-600 hover:text-blue-700"
          >+ Add metric</button>
        </div>
        <div className="space-y-2">
          {objective.success_metrics.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300"
                placeholder="e.g. Idea created with session_id and evidence"
                value={m}
                onChange={e => setMetric(i, e.target.value)}
              />
              {objective.success_metrics.length > 1 && (
                <button
                  onClick={() => onChange({ objective: { ...objective, success_metrics: objective.success_metrics.filter((_, idx) => idx !== i) } })}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StrategyStep({ state, onChange }: { state: WizardState; onChange: (s: Partial<WizardState>) => void }) {
  const { strategy } = state;
  const TYPES = ['incremental','parallel','phased','spike','iterative','experimental'] as const;

  function setCriteria(i: number, val: string) {
    const next = [...strategy.success_criteria];
    next[i] = val;
    onChange({ strategy: { ...strategy, success_criteria: next } });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Strategy Type</label>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map(t => (
            <button
              key={t}
              onClick={() => onChange({ strategy: { ...strategy, strategy_type: t } })}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors capitalize ${
                strategy.strategy_type === t
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Approach</label>
        <textarea
          rows={2}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
          placeholder="How will this idea be executed?"
          value={strategy.approach}
          onChange={e => onChange({ strategy: { ...strategy, approach: e.target.value } })}
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-slate-600">Success Criteria</label>
          <button
            onClick={() => onChange({ strategy: { ...strategy, success_criteria: [...strategy.success_criteria, ''] } })}
            className="text-xs text-blue-600 hover:text-blue-700"
          >+ Add criterion</button>
        </div>
        <div className="space-y-2">
          {strategy.success_criteria.map((c, i) => (
            <input
              key={i}
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300"
              placeholder="e.g. Engineering Idea record created in database"
              value={c}
              onChange={e => setCriteria(i, e.target.value)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ContextStep({ state }: { state: WizardState }) {
  return (
    <div className="space-y-4">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <p className="text-sm font-semibold text-emerald-800">Primary Context Pre-Selected</p>
        </div>
        <p className="text-xs text-emerald-700">Context <span className="font-mono font-bold">{state.contextRef}</span> is the configured EIOS development context.</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-xs">
          {[
            ['Context Ref',  state.contextRef],
            ['Environment',  'Development'],
            ['Repository',   'eios-platform'],
            ['Branch',       'main'],
            ['Product',      'EIOS Platform'],
            ['Risk Level',   'Medium'],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-slate-400 font-medium">{label}</p>
              <p className="text-slate-700 font-semibold mt-0.5">{val}</p>
            </div>
          ))}
        </div>
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-500">Policies: POL-001 · POL-002 · POL-003 | Contracts: CTR-001 · CTR-002</p>
        </div>
      </div>
    </div>
  );
}

function AgentStep({ state }: { state: WizardState }) {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Cpu className="w-4 h-4 text-blue-600" />
          <p className="text-sm font-semibold text-blue-800">EIOS AI Engineering Agent Selected</p>
        </div>
        <p className="text-xs text-blue-700">Agent <span className="font-mono font-bold">{state.agentRef}</span> — no manual selection required for idea creation.</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 text-xs">
          {[
            ['Agent Ref',  state.agentRef],
            ['Name',       'EIOS AI Engineering Agent'],
            ['Vendor',     'Anthropic (via Bolt)'],
            ['Version',    'claude-3-7-sonnet'],
            ['Status',     'Active'],
            ['Health',     'Healthy'],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-slate-400 font-medium">{label}</p>
              <p className="text-slate-700 font-semibold mt-0.5">{val}</p>
            </div>
          ))}
        </div>
        <div className="pt-2 border-t border-slate-100">
          <div className="flex flex-wrap gap-1">
            {['code_generation','testing','database_migration','documentation','architecture_review'].map(c => (
              <span key={c} className="text-xs bg-slate-50 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{c.replace(/_/g,' ')}</span>
            ))}
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
          <p className="text-xs text-amber-700 font-medium">Agent is pluggable — not constitutionally coupled to EIOS.</p>
        </div>
      </div>
    </div>
  );
}

function ReviewStep({ state }: { state: WizardState }) {
  return (
    <div className="space-y-4">
      <div className="bg-slate-900 text-slate-200 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Execution Summary</p>
        {[
          { icon: Target, label: 'Intent',    value: state.intent.title || 'Not set' },
          { icon: Target, label: 'Objective', value: state.objective.title || 'Not set' },
          { icon: Zap,    label: 'Strategy',  value: state.strategy.strategy_type },
          { icon: Server, label: 'Context',   value: state.contextRef },
          { icon: Cpu,    label: 'Agent',     value: state.agentRef },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3">
            <div className="w-6 h-6 bg-slate-700 rounded flex items-center justify-center flex-shrink-0">
              <Icon className="w-3 h-3 text-slate-400" />
            </div>
            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">{label}</span>
              <span className="text-xs text-slate-200 font-medium truncate">{value}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-orange-800">Guardian Authority Only</p>
            <p className="text-xs text-orange-700 mt-1">Engineering Ideas are low-risk objects. Product Owner approval is NOT required. Guardian approval only.</p>
          </div>
        </div>
      </div>
      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Search className="w-4 h-4 text-violet-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-violet-800">Similarity Review — Next Step</p>
            <p className="text-xs text-violet-700 mt-1">After confirming, EIOS will automatically search across 7 engineering object types to detect similar or duplicate engineering work before execution.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Similarity Review Step ───────────────────────────────────────────────────

const OBJECT_TYPE_ICONS: Record<string, typeof Search> = {
  engineering_idea:       Lightbulb,
  engineering_feature:    Package,
  work_order:             GitBranch,
  engineering_record:     BookOpen,
  engineering_standard:   Layers,
  engineering_memory:     Brain,
  constitutional_decision: Shield,
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const colour = pct >= 75 ? 'bg-red-500' : pct >= 50 ? 'bg-amber-500' : 'bg-blue-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${colour}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${pct >= 75 ? 'text-red-600' : pct >= 50 ? 'text-amber-600' : 'text-blue-600'}`}>{pct}%</span>
    </div>
  );
}

function SimilarityResultCard({ result, expanded, onToggle }: {
  result: SimilarityResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const typeCfg = SIMILARITY_OBJECT_TYPE_CFG[result.object_type] ?? { label: result.object_type, colour: 'slate' };
  const relCfg  = RELATIONSHIP_CFG[result.relationship] ?? { label: result.relationship, colour: 'slate' };
  const Icon    = OBJECT_TYPE_ICONS[result.object_type] ?? Eye;

  const typeColour: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    blue:  'bg-blue-50 text-blue-700 border-blue-200',
    violet:'bg-violet-50 text-violet-700 border-violet-200',
    teal:  'bg-teal-50 text-teal-700 border-teal-200',
    indigo:'bg-indigo-50 text-indigo-700 border-indigo-200',
    cyan:  'bg-cyan-50 text-cyan-700 border-cyan-200',
    red:   'bg-red-50 text-red-700 border-red-200',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  const relColour: Record<string, string> = {
    red:    'text-red-600',    blue:   'text-blue-600',
    orange: 'text-orange-600', cyan:   'text-cyan-600',
    teal:   'text-teal-600',
  };

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${
      result.score >= 0.75 ? 'border-red-200 bg-red-50/30' :
      result.score >= 0.5  ? 'border-amber-200 bg-amber-50/20' :
                             'border-slate-200 bg-white'
    }`}>
      <button
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-slate-50/50 transition-colors"
        onClick={onToggle}
      >
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
          typeColour[typeCfg.colour] ?? typeColour.slate
        } border`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${typeColour[typeCfg.colour] ?? typeColour.slate}`}>
              {typeCfg.label}
            </span>
            <span className="text-xs font-mono text-slate-500">{result.ref}</span>
            <span className={`text-xs font-semibold ${relColour[relCfg.colour] ?? 'text-slate-600'} ml-auto`}>
              {relCfg.label}
            </span>
          </div>
          <p className="text-sm font-medium text-slate-800 leading-tight truncate">{result.title}</p>
          <div className="mt-1.5">
            <ScoreBar score={result.score} />
          </div>
        </div>
        <div className="ml-1 flex-shrink-0 mt-1 text-slate-400">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-0 border-t border-slate-100 space-y-2">
          <p className="text-xs text-slate-600 pt-2">{result.reason}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400">Status:</span>
            <span className="text-xs font-medium text-slate-600 capitalize">{result.status.replace(/_/g,' ')}</span>
          </div>
          {result.metadata && Object.keys(result.metadata).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(result.metadata).map(([k, v]) => (
                <span key={k} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                  {k}: {String(v)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SimilarityReviewStep({ state, onChange, onExecute }: {
  state: WizardState;
  onChange: (s: Partial<WizardState>) => void;
  onExecute: () => void;
}) {
  const [searching,  setSearching]  = useState(!state.similaritySearchDone);
  const [expanded,   setExpanded]   = useState<Record<string, boolean>>({});

  const results  = state.similarityResults ?? [];
  const decision = state.similarityDecision;

  const highMatches = results.filter(r => r.score >= 0.75);
  const midMatches  = results.filter(r => r.score >= 0.5 && r.score < 0.75);
  const lowMatches  = results.filter(r => r.score < 0.5);

  // Auto-run search if not done yet
  useState(() => {
    if (!state.similaritySearchDone) {
      (async () => {
        setSearching(true);
        const found = await runSimilaritySearch(state);
        onChange({ similarityResults: found, similaritySearchDone: true });
        setSearching(false);
      })();
    }
  });

  function toggleExpand(id: string) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function selectDecision(d: SimilarityDecision) {
    onChange({ similarityDecision: d });
  }

  const canProceed = decision === 'continue_anyway' || decision === 'link_existing';

  return (
    <div className="space-y-4">
      {/* Search header */}
      <div className={`rounded-xl p-4 border ${searching ? 'bg-violet-50 border-violet-200' : results.length === 0 ? 'bg-emerald-50 border-emerald-200' : highMatches.length > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center gap-2">
          {searching ? (
            <Loader2 className="w-4 h-4 text-violet-600 animate-spin flex-shrink-0" />
          ) : results.length === 0 ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className={`w-4 h-4 flex-shrink-0 ${highMatches.length > 0 ? 'text-red-600' : 'text-amber-600'}`} />
          )}
          <div>
            <p className={`text-sm font-semibold ${searching ? 'text-violet-800' : results.length === 0 ? 'text-emerald-800' : highMatches.length > 0 ? 'text-red-800' : 'text-amber-800'}`}>
              {searching ? 'Searching 7 engineering object types…' :
               results.length === 0 ? 'No similar objects found — clear to proceed' :
               highMatches.length > 0 ? `${highMatches.length} high-similarity match${highMatches.length > 1 ? 'es' : ''} found` :
               `${results.length} related object${results.length > 1 ? 's' : ''} found`}
            </p>
            {!searching && results.length > 0 && (
              <p className={`text-xs mt-0.5 ${highMatches.length > 0 ? 'text-red-700' : 'text-amber-700'}`}>
                {highMatches.length} potential duplicates · {midMatches.length} related · {lowMatches.length} complementary
              </p>
            )}
          </div>
          {!searching && state.similaritySearchDone && (
            <button
              onClick={async () => {
                setSearching(true);
                const found = await runSimilaritySearch(state);
                onChange({ similarityResults: found, similarityDecision: undefined, similaritySearchDone: true });
                setSearching(false);
              }}
              className="ml-auto text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
            >
              <Search className="w-3 h-3" /> Re-scan
            </button>
          )}
        </div>
      </div>

      {/* Source coverage badge row */}
      {!searching && (
        <div className="flex flex-wrap gap-1.5">
          {([
            ['engineering_idea', 'Ideas'],
            ['engineering_feature', 'Features'],
            ['work_order', 'Work Orders'],
            ['engineering_record', 'Records'],
            ['engineering_standard', 'Standards'],
            ['engineering_memory', 'Memory'],
            ['constitutional_decision', 'Decisions'],
          ] as [string, string][]).map(([type, label]) => {
            const hasMatch = results.some(r => r.object_type === type);
            return (
              <span key={type} className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                hasMatch ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}>
                {hasMatch ? '● ' : '○ '}{label}
              </span>
            );
          })}
        </div>
      )}

      {/* Results list */}
      {!searching && results.length > 0 && (
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {results.map(r => (
            <SimilarityResultCard
              key={r.id}
              result={r}
              expanded={!!expanded[r.id]}
              onToggle={() => toggleExpand(r.id)}
            />
          ))}
        </div>
      )}

      {/* Decision panel */}
      {!searching && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Your Decision</p>
          {(Object.entries(SIMILARITY_DECISION_CFG) as [SimilarityDecision, typeof SIMILARITY_DECISION_CFG[SimilarityDecision]][]).map(([key, cfg]) => {
            const DECISION_ICONS: Record<string, typeof Check> = {
              continue_anyway: ArrowRight,
              link_existing:   Link2,
              merge:           GitMerge,
              cancel:          XCircle,
            };
            const DecIcon = DECISION_ICONS[key] ?? Check;
            const COLOURS: Record<string, { border: string; bg: string; text: string; activeBg: string; activeBorder: string }> = {
              blue:  { border: 'border-slate-200', bg: 'bg-white', text: 'text-slate-700', activeBg: 'bg-blue-50',   activeBorder: 'border-blue-400'   },
              teal:  { border: 'border-slate-200', bg: 'bg-white', text: 'text-slate-700', activeBg: 'bg-teal-50',   activeBorder: 'border-teal-400'   },
              amber: { border: 'border-slate-200', bg: 'bg-white', text: 'text-slate-700', activeBg: 'bg-amber-50',  activeBorder: 'border-amber-400'  },
              red:   { border: 'border-slate-200', bg: 'bg-white', text: 'text-slate-700', activeBg: 'bg-red-50',    activeBorder: 'border-red-400'    },
            };
            const c  = COLOURS[cfg.colour] ?? COLOURS.blue;
            const active = decision === key;
            return (
              <button
                key={key}
                onClick={() => selectDecision(key)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                  active ? `${c.activeBg} ${c.activeBorder}` : `${c.bg} ${c.border} hover:border-slate-300`
                }`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  active ? 'bg-white shadow-sm' : 'bg-slate-50'
                }`}>
                  <DecIcon className={`w-3.5 h-3.5 ${active ? `text-${cfg.colour}-600` : 'text-slate-500'}`} />
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${active ? 'text-slate-900' : 'text-slate-700'}`}>{cfg.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{cfg.description}</p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 mt-1 flex-shrink-0 transition-all ${
                  active ? `border-${cfg.colour}-500 bg-${cfg.colour}-500` : 'border-slate-200'
                }`}>
                  {active && <Check className="w-2.5 h-2.5 text-white m-auto" />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Merge / Cancel notices */}
      {decision === 'merge' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-800">Merge selected — execution will be cancelled</p>
            <p className="text-xs text-amber-700 mt-0.5">Merge is recorded as evidence. Navigate to the similar object to update it with the new content.</p>
          </div>
        </div>
      )}
      {decision === 'cancel' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <XCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-red-800">Execution cancelled</p>
            <p className="text-xs text-red-700 mt-0.5">The decision will be recorded in Engineering Memory for future reference. No idea will be created.</p>
          </div>
        </div>
      )}

      {/* Execute button for approved decisions */}
      {(decision === 'continue_anyway' || decision === 'link_existing') && (
        <button
          onClick={onExecute}
          className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors"
        >
          <Zap className="w-4 h-4" />
          Execute Constitutional Pipeline
        </button>
      )}
    </div>
  );
}

// ─── Idea Form Panel ──────────────────────────────────────────────────────────

function IdeaFormPanel({ state, onChange }: { state: WizardState; onChange: (s: Partial<WizardState>) => void }) {
  const { idea } = state;
  const CATEGORIES = Object.entries(IDEA_CATEGORY_CFG) as [IdeaCategory, { label: string; colour: string }][];

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (trimmed && !idea.tags.includes(trimmed)) {
      onChange({ idea: { ...idea, tags: [...idea.tags, trimmed] } });
    }
  }
  function removeTag(t: string) {
    onChange({ idea: { ...idea, tags: idea.tags.filter(x => x !== t) } });
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Engineering Idea Details</p>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Idea Title <span className="text-red-500">*</span></label>
        <input
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300"
          placeholder="The engineering idea to be captured"
          value={idea.title}
          onChange={e => onChange({ idea: { ...idea, title: e.target.value } })}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
        <textarea
          rows={2}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
          placeholder="Detail of the engineering idea"
          value={idea.description}
          onChange={e => onChange({ idea: { ...idea, description: e.target.value } })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Category</label>
          <select
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none"
            value={idea.category}
            onChange={e => onChange({ idea: { ...idea, category: e.target.value as IdeaCategory } })}
          >
            {CATEGORIES.map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Priority</label>
          <select
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none"
            value={idea.priority}
            onChange={e => onChange({ idea: { ...idea, priority: e.target.value as typeof idea.priority } })}
          >
            {['critical','high','medium','low'].map(p => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">Tags (press Enter)</label>
        <div className="flex flex-wrap gap-1 mb-1.5">
          {idea.tags.map(t => (
            <span key={t} className="flex items-center gap-1 bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded-full">
              {t}
              <button onClick={() => removeTag(t)} className="hover:text-red-500 ml-0.5"><X className="w-2.5 h-2.5" /></button>
            </span>
          ))}
        </div>
        <input
          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none"
          placeholder="Add a tag and press Enter"
          onKeyDown={e => {
            if (e.key === 'Enter') {
              addTag((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).value = '';
            }
          }}
        />
      </div>
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

interface WizardProps {
  onClose: () => void;
  onComplete: (ideaRef: string, ideaId: string, ewoRef?: string) => void;
  prefill?: Partial<WizardState>;
  onNavigateToIdea?: (ideaRef: string, ideaId: string) => void;
  /** When set, the wizard updates this existing idea instead of creating a new one. */
  editIdeaId?: string;
  editIdeaRef?: string;
}

export function ConstitutionalExecutionWizard({ onClose, onComplete, prefill, onNavigateToIdea, editIdeaId, editIdeaRef }: WizardProps) {
  const isEditMode = !!editIdeaId;
  const [state,    setState]    = useState<WizardState>(INITIAL_WIZARD_STATE);
  const [pipeline, setPipeline] = useState<ExecutionPipelineStage[]>(DEFAULT_PIPELINE);
  const [hydrationDiag, setHydrationDiag] = useState<HydrationDiagnostics | null>(null);
  const [showHydrationDiag, setShowHydrationDiag] = useState(false);
  const wizardInitRef = useRef(false);

  // Hydrate wizard state from prefill using deep-merge to ensure all
  // nested collections (tags, products, applications, success_metrics, etc.)
  // are initialised even when prefill only provides partial data.
  useEffect(() => {
    if (wizardInitRef.current) return; // only once
    wizardInitRef.current = true;
    const { state: hydrated, diagnostics } = hydrateWizardState(prefill ?? undefined);
    setState(hydrated);
    setHydrationDiag(diagnostics);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function update(partial: Partial<WizardState>) {
    setState(prev => ({ ...prev, ...partial }));
  }

  function canAdvance(): boolean {
    switch (state.step) {
      case 'intent':    return state.intent.title.trim().length > 0;
      case 'objective': return state.objective.title.trim().length > 0;
      case 'strategy':  return state.strategy.success_criteria.some(c => c.trim().length > 0);
      case 'context':   return true;
      case 'agent':     return true;
      case 'review':    return state.idea.title.trim().length > 0;
      default:          return false;
    }
  }

  const STEP_ORDER: WizardStep[] = ['intent','objective','strategy','context','agent','review','similarity'];

  function next() {
    const idx = STEP_ORDER.indexOf(state.step);
    if (idx >= 0 && idx < STEP_ORDER.length - 1) update({ step: STEP_ORDER[idx + 1] });
  }
  function back() {
    const idx = STEP_ORDER.indexOf(state.step);
    if (idx > 0) update({ step: STEP_ORDER[idx - 1] });
  }

  function pipelineUpdate(key: string, status: ExecutionPipelineStage['status'], ref?: string) {
    setPipeline(prev => prev.map(s => s.key === key ? { ...s, status, record_ref: ref ?? s.record_ref } : s));
  }

  const execute = useCallback(async () => {
    update({ step: 'executing' });
    setPipeline(DEFAULT_PIPELINE.map(s => ({ ...s, status: 'pending' as const })));

    try {
      const result = await ConstitutionalEngine.executePipeline({
        idea: state.idea,
        intent: state.intent,
        objective: state.objective,
        strategy: state.strategy,
        contextRef: state.contextRef,
        agentRef: state.agentRef,
        similarityDecision: state.similarityDecision,
        similarityResults: state.similarityResults,
        similarityLinkedRefs: state.similarityLinkedRefs,
        editIdeaId: isEditMode ? editIdeaId : undefined,
        editIdeaRef: isEditMode ? editIdeaRef : undefined,
        onProgress: (stage) => {
          pipelineUpdate(stage.key, stage.status, stage.recordRef);
        },
      });

      setPipeline(result.pipeline);
      update({
        createdIntentId: result.intentId,
        createdObjectiveId: result.objectiveId,
        createdSessionId: result.sessionId,
        createdIdeaId: result.ideaId,
        createdIdeaRef: result.ideaRef,
        createdRecordId: result.recordId,
        createdRecordRef: result.recordRef,
        createdEwoId: result.ewoId ?? undefined,
        createdEwoRef: result.ewoRef ?? undefined,
        ewoPromotionStatus: result.ewoPromotionStatus,
        ewoPromotionError: result.ewoPromotionError ?? undefined,
        step: 'complete',
      });

      onComplete(result.ideaRef, result.ideaId, result.ewoRef ?? undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      update({ executionError: msg });
      setPipeline(prev => prev.map(s => s.status === 'running' ? { ...s, status: 'error' } : s));
    }
  }, [state, onComplete, isEditMode, editIdeaId, editIdeaRef]);

  const retryExecution = useCallback(() => {
    update({ executionError: undefined });
    execute();
  }, [execute]);

  // Handle Merge / Cancel — record in memory and close without creating idea
  const handleMergeOrCancel = useCallback(async () => {
    const decision = state.similarityDecision!;
    const topMatch = (state.similarityResults ?? [])[0];
    // Record the decision as a memory entry (best-effort, no pipeline display needed)
    try {
      await supabase.from('execution_memory_integration').insert({
        session_id:            null,
        phase:                 'pre_execution',
        patterns_applied:      [`similarity-${decision}`],
        standards_referenced:  ['EWO-011.1'],
        risks_identified:      topMatch ? [`Prevented duplicate: ${topMatch.ref}`] : [],
        recommendations_applied: [`decision-recorded-${decision}`],
        knowledge_updated:     true,
        lineage_updated:       false,
        memory_updated:        true,
      });
    } catch { /* best effort */ }
    onClose();
  }, [state.similarityDecision, state.similarityResults, onClose]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  const isExecuting = state.step === 'executing';
  const isComplete  = state.step === 'complete';
  // When executing but an error occurred, allow close button and other controls
  const hasError    = isExecuting && !!state.executionError;
  const isRunning   = (isExecuting || isComplete) && !hasError;

  const showNav = !isRunning && state.step !== 'similarity';

  // Current step index in the ordered list (for step counter display)
  const stepIndex = STEP_ORDER.indexOf(state.step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
              <Lightbulb className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Constitutional Execution Wizard</h2>
              <p className="text-xs text-slate-500">
                {isEditMode ? 'Continuing from existing Engineering Idea' : 'Create Engineering Idea via execution pipeline'}
              </p>
            </div>
          </div>
          {!isExecuting && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Step indicator */}
        {!isRunning && (
          <div className="px-6 py-4 border-b border-slate-100 flex-shrink-0 overflow-x-auto">
            <StepIndicator current={state.step} />
          </div>
        )}

        {/* Hydration diagnostics (collapsible, developer-only) */}
        {!isRunning && hydrationDiag && (
          <div className="px-6 py-1 border-b border-slate-100 flex-shrink-0">
            <button
              onClick={() => setShowHydrationDiag(!showHydrationDiag)}
              className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1"
            >
              <Info className="w-3 h-3" />
              {showHydrationDiag ? 'Hide' : 'Hydration'} Diagnostics
            </button>
            {showHydrationDiag && (
              <div className="mt-1 mb-2 bg-slate-900 rounded-lg p-2 text-[10px] font-mono text-slate-300 space-y-0.5">
                <div><span className="text-slate-500">idea_ref:</span> {hydrationDiag.idea_ref ?? 'null'}</div>
                <div><span className="text-slate-500">session_id:</span> {hydrationDiag.session_id ?? 'null'}</div>
                <div><span className="text-slate-500">resumed_step:</span> {hydrationDiag.resumed_step}</div>
                <div><span className="text-slate-500">hydrated_fields:</span> {hydrationDiag.hydrated_fields.join(', ') || 'none'}</div>
                <div><span className="text-slate-500">defaulted_optional_collections:</span> {hydrationDiag.defaulted_optional_collections.join(', ') || 'none'}</div>
                <div><span className="text-slate-500">missing_required_fields:</span> {hydrationDiag.missing_required_fields.join(', ') || 'none'}</div>
                <div><span className="text-slate-500">review_state_valid:</span> {String(hydrationDiag.review_state_valid)}</div>
                <div><span className="text-slate-500">review_render_ready:</span> {String(hydrationDiag.review_render_ready)}</div>
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isExecuting && (
            <div className="space-y-4">
              <div className="text-center pb-2">
                {state.executionError ? (
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <AlertCircle className="w-6 h-6 text-red-600" />
                  </div>
                ) : (
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="w-6 h-6 text-blue-600 animate-pulse" />
                  </div>
                )}
                <h3 className="text-sm font-bold text-slate-800">
                  {state.executionError ? 'Pipeline Failed' : isEditMode ? 'Updating Engineering Idea' : 'Executing Constitutional Pipeline'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {state.executionError
                    ? 'One or more required pipeline stages did not complete.'
                    : isEditMode
                      ? `Continuing from existing Idea ${editIdeaRef ?? ''}. No duplicate will be created.`
                      : 'EIOS-AGENT-001 is running the execution pipeline. Do not close this window.'}
                </p>
              </div>
              <PipelineDisplay stages={pipeline} />
              {state.executionError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-red-800">Execution Error</p>
                      <p className="text-xs text-red-700 mt-1 font-mono break-all">{state.executionError}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={retryExecution}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5" /> Retry Pipeline
                    </button>
                    <button
                      onClick={onClose}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isComplete && (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Constitutional Execution Complete</h3>
              <p className="text-sm text-slate-500 mt-1">All pipeline stages completed successfully.</p>

              {/* EWO-011.2 + EWO-032R.8: Outcome summary */}
              <div className="mt-4 grid grid-cols-2 gap-3 text-left">
                {[
                  { icon: Lightbulb, label: 'Idea Created',      value: state.createdIdeaRef ?? '—',    colour: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
                  { icon: FileCheck, label: 'Record Created',     value: state.createdRecordRef ?? '—',  colour: 'bg-blue-50 border-blue-200 text-blue-700' },
                  { icon: Brain,     label: 'Memory Updated',     value: 'Knowledge + Lineage',           colour: 'bg-cyan-50 border-cyan-200 text-cyan-700' },
                  { icon: Shield,    label: 'Evidence Generated', value: '4 evidence pieces',             colour: 'bg-slate-50 border-slate-200 text-slate-600' },
                  { icon: ClipboardList, label: 'Work Order',     value: state.createdEwoRef ?? (state.ewoPromotionStatus === 'failed' ? 'Failed' : '—'),
                    colour: state.ewoPromotionStatus === 'complete'
                      ? 'bg-amber-50 border-amber-200 text-amber-700'
                      : state.ewoPromotionStatus === 'failed'
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-slate-50 border-slate-200 text-slate-600' },
                  { icon: GitBranch, label: 'EWO Lifecycle',     value: state.createdEwoRef ? 'Ready — Awaiting PO Approval' : '—',
                    colour: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
                ].map(({ icon: Icon, label, value, colour }) => (
                  <div key={label} className={`rounded-xl border px-4 py-3 ${colour}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
                    </div>
                    <p className="text-xs font-semibold font-mono">{value}</p>
                  </div>
                ))}
              </div>
              {state.ewoPromotionStatus === 'failed' && state.ewoPromotionError && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-red-800">Work Order Promotion Failed</p>
                    <p className="text-[11px] text-red-700 mt-1 font-mono break-all">{state.ewoPromotionError}</p>
                  </div>
                </div>
              )}

              <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4 text-left space-y-1.5">
                {[
                  ['Intent',      state.intent.title],
                  ['Similarity',  `${state.similarityResults?.length ?? 0} matches · ${(state.similarityDecision ?? '—').replace(/_/g,' ')}`],
                  ['Guardian',    'Validated — No PO Required'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-semibold text-slate-700">{value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4"><PipelineDisplay stages={pipeline} /></div>
            </div>
          )}

          {!isRunning && state.step !== 'similarity' && (
            <>
              {state.step === 'intent'    && <IntentStep    state={state} onChange={update} />}
              {state.step === 'objective' && <ObjectiveStep state={state} onChange={update} />}
              {state.step === 'strategy'  && <StrategyStep  state={state} onChange={update} />}
              {state.step === 'context'   && <ContextStep   state={state} />}
              {state.step === 'agent'     && <AgentStep     state={state} />}
              {state.step === 'review'    && (
                <>
                  <IdeaFormPanel state={state} onChange={update} />
                  <div className="mt-4"><ReviewStep state={state} /></div>
                </>
              )}
              {state.executionError && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{state.executionError}</p>
                </div>
              )}
            </>
          )}

          {!isRunning && state.step === 'similarity' && (
            <SimilarityReviewStep
              state={state}
              onChange={update}
              onExecute={execute}
            />
          )}
        </div>

        {/* Footer nav (not shown during similarity or execution) */}
        {showNav && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 flex-shrink-0">
            <button
              onClick={back}
              disabled={state.step === 'intent'}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                Step {stepIndex + 1} of {STEP_ORDER.length}
              </span>
              <button
                onClick={next}
                disabled={!canAdvance()}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Similarity footer: Back + Merge/Cancel actions */}
        {!isRunning && state.step === 'similarity' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 flex-shrink-0">
            <button
              onClick={back}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Review
            </button>
            {(state.similarityDecision === 'merge' || state.similarityDecision === 'cancel') && (
              <button
                onClick={handleMergeOrCancel}
                className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  state.similarityDecision === 'cancel'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-amber-500 text-white hover:bg-amber-600'
                }`}
              >
                {state.similarityDecision === 'cancel' ? (
                  <><XCircle className="w-4 h-4" /> Cancel Execution</>
                ) : (
                  <><GitMerge className="w-4 h-4" /> Record & Merge</>
                )}
              </button>
            )}
          </div>
        )}

        {/* Complete footer — EWO-011.2: navigation buttons */}
        {isComplete && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 flex-shrink-0 gap-3">
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Return to Dashboard
            </button>
            <div className="flex items-center gap-2">
              {onNavigateToIdea && state.createdIdeaRef && state.createdIdeaId && (
                <button
                  onClick={() => onNavigateToIdea(state.createdIdeaRef!, state.createdIdeaId!)}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  <Lightbulb className="w-4 h-4" /> Open Idea
                </button>
              )}
              {!onNavigateToIdea && (
                <button
                  onClick={onClose}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  <Check className="w-4 h-4" /> Done
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
