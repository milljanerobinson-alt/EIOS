import { useState, useEffect, useRef } from 'react';
import {
  Play, Square, Copy, Save, Trash2, BookOpen, Clock,
  ChevronDown, Loader2, CheckCircle2, AlertCircle, Plus,
  RefreshCw, Columns, X, Check, ChevronRight, Filter,
  DollarSign, Zap, BarChart3, Edit3, Archive,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PROVIDER_META, fmtCost } from './ECCAIProvidersSection';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProviderModel { model_id: string; display_name: string; }

interface PlaygroundResult {
  content: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  executionTimeMs: number;
}

interface HistoryEntry {
  id: string;
  provider: string;
  model: string;
  prompt_name: string | null;
  system_prompt: string | null;
  user_prompt: string;
  response: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost: number | null;
  execution_time_ms: number | null;
  success: boolean;
  error_message: string | null;
  temperature: number | null;
  max_tokens: number | null;
  created_at: string;
}

interface SavedPrompt {
  id: string;
  name: string;
  category: string;
  system_prompt: string;
  user_prompt: string;
  provider: string | null;
  model: string | null;
  temperature: number;
  max_tokens: number;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

const PROMPT_CATEGORIES = [
  'Support Plans', 'Compliance Reports', 'Course Page Generator',
  'Qualification Summaries', 'Audit Evidence', 'Documentation',
  'Engineering', 'General Testing',
];

const PROVIDERS = ['openai', 'anthropic', 'gemini'] as const;

// ─── Config Panel ─────────────────────────────────────────────────────────────

function ConfigPanel({
  provider, setProvider,
  model, setModel,
  temperature, setTemperature,
  maxTokens, setMaxTokens,
  systemPrompt, setSystemPrompt,
  userPrompt, setUserPrompt,
  compareMode, setCompareMode,
  compareProvider, setCompareProvider,
  compareModel, setCompareModel,
  modelsByProvider,
}: {
  provider: string; setProvider: (v: string) => void;
  model: string; setModel: (v: string) => void;
  temperature: number; setTemperature: (v: number) => void;
  maxTokens: number; setMaxTokens: (v: number) => void;
  systemPrompt: string; setSystemPrompt: (v: string) => void;
  userPrompt: string; setUserPrompt: (v: string) => void;
  compareMode: boolean; setCompareMode: (v: boolean) => void;
  compareProvider: string; setCompareProvider: (v: string) => void;
  compareModel: string; setCompareModel: (v: string) => void;
  modelsByProvider: Record<string, ProviderModel[]>;
}) {
  return (
    <div className="space-y-4">
      {/* Provider + Compare toggle */}
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Provider</label>
          <div className="relative">
            <select value={provider} onChange={e => { setProvider(e.target.value); setModel(modelsByProvider[e.target.value]?.[0]?.model_id ?? ''); }}
              className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 appearance-none pr-7">
              {PROVIDERS.map(p => <option key={p} value={p}>{PROVIDER_META[p]?.Icon ? p.charAt(0).toUpperCase() + p.slice(1) : p}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <div className="flex-1">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Model</label>
          <div className="relative">
            <select value={model} onChange={e => setModel(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 appearance-none pr-7">
              {(modelsByProvider[provider] ?? []).map(m => <option key={m.model_id} value={m.model_id}>{m.display_name}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>
        <button
          onClick={() => setCompareMode(!compareMode)}
          title="Compare providers"
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors mb-0 ${compareMode ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          <Columns className="w-3.5 h-3.5" />
          Compare
        </button>
      </div>

      {/* Compare row */}
      {compareMode && (
        <div className="flex gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-1.5">Compare Provider</label>
            <div className="relative">
              <select value={compareProvider} onChange={e => { setCompareProvider(e.target.value); setCompareModel(modelsByProvider[e.target.value]?.[0]?.model_id ?? ''); }}
                className="w-full text-xs border border-blue-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 appearance-none pr-7">
                {PROVIDERS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-1.5">Compare Model</label>
            <div className="relative">
              <select value={compareModel} onChange={e => setCompareModel(e.target.value)}
                className="w-full text-xs border border-blue-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 appearance-none pr-7">
                {(modelsByProvider[compareProvider] ?? []).map(m => <option key={m.model_id} value={m.model_id}>{m.display_name}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>
      )}

      {/* Temperature + Max tokens */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
            Temperature <span className="font-normal normal-case text-slate-400">({temperature.toFixed(1)})</span>
          </label>
          <input type="range" min="0" max="1" step="0.1" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))}
            className="w-full accent-blue-600" />
        </div>
        <div className="w-28">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Max Tokens</label>
          <input type="number" min="50" max="8000" step="50" value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value) || 1000)}
            className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
      </div>

      {/* System prompt */}
      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">System Prompt <span className="font-normal normal-case">(optional)</span></label>
        <textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          placeholder="You are a helpful assistant…"
          rows={3}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none placeholder:text-slate-400"
        />
      </div>

      {/* User prompt */}
      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">User Prompt</label>
        <textarea
          value={userPrompt}
          onChange={e => setUserPrompt(e.target.value)}
          placeholder="Enter your prompt here…"
          rows={6}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none placeholder:text-slate-400"
        />
      </div>
    </div>
  );
}

// ─── Response Panel ───────────────────────────────────────────────────────────

function ResponsePanel({
  result,
  compareResult,
  error,
  running,
  compareMode,
}: {
  result: PlaygroundResult | null;
  compareResult: PlaygroundResult | null;
  error: string | null;
  running: boolean;
  compareMode: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (running) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white border border-slate-200 rounded-xl gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <p className="text-sm text-slate-500">Running prompt…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 p-5 bg-red-50 border border-red-200 rounded-xl">
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-800">Execution failed</p>
          <p className="text-xs text-red-700 mt-1 leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white border border-dashed border-slate-200 rounded-xl gap-3 text-slate-400">
        <Play className="w-8 h-8 opacity-30" />
        <p className="text-sm">Run a prompt to see the response here.</p>
      </div>
    );
  }

  function ResultBlock({ r, label }: { r: PlaygroundResult; label?: string }) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Stats bar */}
        <div className="flex items-center gap-4 px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex-wrap">
          {label && <span className="text-xs font-bold text-slate-600">{label}</span>}
          <span className="flex items-center gap-1 text-[11px] text-slate-500">
            <BarChart3 className="w-3 h-3" /> {r.totalTokens.toLocaleString()} tokens
          </span>
          <span className="text-[11px] text-slate-400">{r.inputTokens.toLocaleString()} in / {r.outputTokens.toLocaleString()} out</span>
          <span className="flex items-center gap-1 text-[11px] text-slate-500">
            <DollarSign className="w-3 h-3" /> {fmtCost(r.estimatedCost)}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-slate-500">
            <Clock className="w-3 h-3" /> {(r.executionTimeMs / 1000).toFixed(2)}s
          </span>
          <span className="text-[11px] font-mono text-slate-400 ml-auto">{r.provider} / {r.model}</span>
          <button onClick={() => copyToClipboard(r.content)}
            className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={() => setExpanded(v => !v)} className="text-[11px] text-slate-400 hover:text-slate-600">
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {expanded && (
          <div className="px-4 py-4">
            <pre className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed font-sans">{r.content}</pre>
          </div>
        )}
      </div>
    );
  }

  if (compareMode && compareResult) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ResultBlock r={result} label={`${result.provider} / ${result.model}`} />
        <ResultBlock r={compareResult} label={`${compareResult.provider} / ${compareResult.model}`} />
      </div>
    );
  }

  return <ResultBlock r={result} />;
}

// ─── Prompt Library ───────────────────────────────────────────────────────────

function PromptLibrary({
  onLoad,
}: {
  onLoad: (p: SavedPrompt) => void;
}) {
  const [prompts, setPrompts]     = useState<SavedPrompt[]>([]);
  const [loading, setLoading]     = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch]       = useState('');
  const [creating, setCreating]   = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm]           = useState({ name: '', category: PROMPT_CATEGORIES[7], system_prompt: '', user_prompt: '', provider: '', model: '', temperature: 0.7, max_tokens: 1000 });
  const [saving, setSaving]       = useState(false);

  const load = () => {
    setLoading(true);
    supabase.from('ai_prompt_library').select('*').order('updated_at', { ascending: false })
      .then(({ data }) => { setPrompts(data ?? []); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const filtered = prompts.filter(p =>
    (!categoryFilter || p.category === categoryFilter) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.user_prompt.toLowerCase().includes(search.toLowerCase()))
  );

  async function savePrompt() {
    if (!form.name.trim() || !form.user_prompt.trim()) return;
    setSaving(true);
    if (editingId) {
      await supabase.from('ai_prompt_library').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editingId);
    } else {
      await supabase.from('ai_prompt_library').insert({ ...form, status: 'draft', version: 1 });
    }
    setSaving(false);
    setCreating(false);
    setEditingId(null);
    setForm({ name: '', category: PROMPT_CATEGORIES[7], system_prompt: '', user_prompt: '', provider: '', model: '', temperature: 0.7, max_tokens: 1000 });
    load();
  }

  async function deletePrompt(id: string) {
    if (!confirm('Delete this prompt?')) return;
    await supabase.from('ai_prompt_library').delete().eq('id', id);
    load();
  }

  async function publishPrompt(p: SavedPrompt) {
    await supabase.from('ai_prompt_library').update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', p.id);
    load();
  }

  async function duplicatePrompt(p: SavedPrompt) {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = p;
    await supabase.from('ai_prompt_library').insert({ ...rest, name: `${p.name} (copy)`, status: 'draft', version: 1 });
    load();
  }

  function startEdit(p: SavedPrompt) {
    setForm({ name: p.name, category: p.category, system_prompt: p.system_prompt, user_prompt: p.user_prompt, provider: p.provider ?? '', model: p.model ?? '', temperature: p.temperature, max_tokens: p.max_tokens });
    setEditingId(p.id);
    setCreating(true);
  }

  const STATUS_CFG: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    published: 'bg-emerald-100 text-emerald-700',
    archived: 'bg-slate-100 text-slate-400',
  };

  if (creating) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <p className="text-xs font-bold text-slate-700">{editingId ? 'Edit Prompt' : 'New Prompt'}</p>
          <button onClick={() => { setCreating(false); setEditingId(null); }} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Prompt name…"
                className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            <div className="w-40">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                {PROMPT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">System Prompt</label>
            <textarea value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
              rows={2} placeholder="Optional system prompt…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">User Prompt</label>
            <textarea value={form.user_prompt} onChange={e => setForm(f => ({ ...f, user_prompt: e.target.value }))}
              rows={4} placeholder="Enter prompt template…"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div className="flex gap-2">
            <button onClick={savePrompt} disabled={saving || !form.name.trim() || !form.user_prompt.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Saving…' : 'Save Prompt'}
            </button>
            <button onClick={() => { setCreating(false); setEditingId(null); }}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search prompts…"
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
        <div className="relative">
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none appearance-none pr-7">
            <option value="">All categories</option>
            {PROMPT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <Filter className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
        </div>
        <button onClick={() => { setCreating(true); setEditingId(null); setForm({ name: '', category: PROMPT_CATEGORIES[7], system_prompt: '', user_prompt: '', provider: '', model: '', temperature: 0.7, max_tokens: 1000 }); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-700">
          <Plus className="w-3.5 h-3.5" /> New
        </button>
        <button onClick={load} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center text-slate-400">
          <BookOpen className="w-7 h-7 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No prompts yet. Create your first prompt template.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-3.5 hover:border-slate-300 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_CFG[p.status] ?? 'bg-slate-100 text-slate-500'}`}>
                      {p.status}
                    </span>
                    <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{p.category}</span>
                    <span className="text-[10px] text-slate-400">v{p.version}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 truncate">{p.user_prompt.slice(0, 100)}{p.user_prompt.length > 100 ? '…' : ''}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => onLoad(p)} title="Load into playground"
                    className="flex items-center gap-1 px-2 py-1 text-[11px] bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    <ChevronRight className="w-3 h-3" /> Load
                  </button>
                  <button onClick={() => startEdit(p)} title="Edit" className="p-1 text-slate-400 hover:text-slate-600 rounded"><Edit3 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => duplicatePrompt(p)} title="Duplicate" className="p-1 text-slate-400 hover:text-slate-600 rounded"><Copy className="w-3.5 h-3.5" /></button>
                  {p.status !== 'published' && (
                    <button onClick={() => publishPrompt(p)} title="Publish" className="p-1 text-emerald-500 hover:text-emerald-700 rounded"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                  )}
                  <button onClick={() => deletePrompt(p.id)} title="Delete" className="p-1 text-slate-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── History Panel ────────────────────────────────────────────────────────────

function HistoryPanel({ onReload }: { onReload: (e: HistoryEntry) => void }) {
  const [history, setHistory]     = useState<HistoryEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [provFilter, setProvFilter] = useState('');

  const load = () => {
    setLoading(true);
    supabase.from('ai_playground_history').select('*').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { setHistory(data ?? []); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const filtered = history.filter(h => !provFilter || h.provider === provFilter);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select value={provFilter} onChange={e => setProvFilter(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none">
          <option value="">All providers</option>
          {['openai', 'anthropic', 'gemini'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>
        <button onClick={load} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 ml-auto">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <Clock className="w-6 h-6 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No history yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(h => {
            const meta = PROVIDER_META[h.provider];
            const ProvIcon = meta?.Icon;
            return (
              <div key={h.id} className="bg-white border border-slate-200 rounded-xl p-3 hover:border-slate-300 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {ProvIcon && <ProvIcon className={`w-3.5 h-3.5 shrink-0 ${meta.color}`} />}
                      <span className="text-xs font-mono text-slate-500">{h.model}</span>
                      {!h.success && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">failed</span>}
                      <span className="text-[10px] text-slate-400 ml-auto">
                        {new Date(h.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 truncate">{h.user_prompt.slice(0, 90)}{h.user_prompt.length > 90 ? '…' : ''}</p>
                    {h.total_tokens != null && (
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] text-slate-400">{h.total_tokens.toLocaleString()} tokens</span>
                        {h.estimated_cost != null && <span className="text-[10px] text-slate-400">{fmtCost(h.estimated_cost)}</span>}
                        {h.execution_time_ms != null && <span className="text-[10px] text-slate-400">{(h.execution_time_ms / 1000).toFixed(2)}s</span>}
                      </div>
                    )}
                  </div>
                  <button onClick={() => onReload(h)} title="Load into playground"
                    className="flex items-center gap-1 px-2 py-1 text-[11px] border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 shrink-0">
                    <ChevronRight className="w-3 h-3" /> Reload
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Session Cost Tracker ─────────────────────────────────────────────────────

function SessionCost({ results }: { results: PlaygroundResult[] }) {
  const totalCost    = results.reduce((s, r) => s + r.estimatedCost, 0);
  const totalTokens  = results.reduce((s, r) => s + r.totalTokens, 0);
  const totalTime    = results.reduce((s, r) => s + r.executionTimeMs, 0);

  if (results.length === 0) return null;

  return (
    <div className="flex items-center gap-4 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500">
      <span className="font-semibold text-slate-700">Session</span>
      <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> {results.length} run{results.length !== 1 ? 's' : ''}</span>
      <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> {totalTokens.toLocaleString()} tokens</span>
      <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> {fmtCost(totalCost)}</span>
      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {(totalTime / 1000).toFixed(1)}s total</span>
    </div>
  );
}

// ─── Main Playground ──────────────────────────────────────────────────────────

export function ECCAIPlayground() {
  // Config state
  const [provider, setProvider]       = useState('openai');
  const [model, setModel]             = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens]     = useState(1000);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt]   = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [compareProvider, setCompareProvider] = useState('anthropic');
  const [compareModel, setCompareModel] = useState('');

  // Models
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ProviderModel[]>>({});

  // Execution
  const [running, setRunning]     = useState(false);
  const [result, setResult]       = useState<PlaygroundResult | null>(null);
  const [compareResult, setCompareResult] = useState<PlaygroundResult | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [sessionResults, setSessionResults] = useState<PlaygroundResult[]>([]);

  // Bottom tab
  const [bottomTab, setBottomTab] = useState<'library' | 'history'>('library');

  // Load all models
  useEffect(() => {
    supabase.from('ai_provider_models').select('provider, model_id, display_name').eq('is_active', true).order('sort_order')
      .then(({ data }) => {
        const grouped: Record<string, ProviderModel[]> = {};
        for (const m of data ?? []) {
          if (!grouped[m.provider]) grouped[m.provider] = [];
          grouped[m.provider].push({ model_id: m.model_id, display_name: m.display_name });
        }
        setModelsByProvider(grouped);
        if (!model && grouped['openai']?.length) setModel(grouped['openai'][0].model_id);
        if (!compareModel && grouped['anthropic']?.length) setCompareModel(grouped['anthropic'][0].model_id);
      });
  }, []);

  async function runPrompt() {
    if (!userPrompt.trim() || running) return;
    setRunning(true); setResult(null); setCompareResult(null); setError(null);

    const body: Record<string, unknown> = {
      provider, model_id: model || undefined,
      system_prompt: systemPrompt || undefined,
      user_prompt: userPrompt,
      temperature, max_tokens: maxTokens,
    };
    if (compareMode) {
      body.compare_provider = compareProvider;
      body.compare_model_id = compareModel || undefined;
    }

    const { data, error: fnError } = await supabase.functions.invoke('ai-playground-execute', { body });
    setRunning(false);

    if (fnError) { setError(fnError.message); return; }
    if (!data?.success) { setError(data?.error ?? 'Execution failed'); return; }

    const primary = data.primary as PlaygroundResult;
    setResult(primary);
    setSessionResults(prev => [...prev, primary]);

    if (compareMode && data.compare && !data.compare.error) {
      const cmp = data.compare as PlaygroundResult;
      setCompareResult(cmp);
      setSessionResults(prev => [...prev, cmp]);
    } else if (compareMode && data.compare?.error) {
      // Show compare error inline
    }
  }

  function clearPlayground() {
    setUserPrompt(''); setSystemPrompt(''); setResult(null); setCompareResult(null); setError(null);
  }

  function loadFromLibrary(p: SavedPrompt) {
    setSystemPrompt(p.system_prompt);
    setUserPrompt(p.user_prompt);
    if (p.provider) setProvider(p.provider);
    if (p.model) setModel(p.model);
    if (p.temperature != null) setTemperature(p.temperature);
    if (p.max_tokens) setMaxTokens(p.max_tokens);
    setBottomTab('library');
  }

  function loadFromHistory(h: HistoryEntry) {
    setUserPrompt(h.user_prompt);
    setSystemPrompt(h.system_prompt ?? '');
    setProvider(h.provider);
    setModel(h.model);
    if (h.temperature != null) setTemperature(h.temperature);
    if (h.max_tokens) setMaxTokens(h.max_tokens);
  }

  return (
    <div className="space-y-4">
      {/* Config + Response */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Left: Config */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Configuration</p>
            <div className="flex items-center gap-2">
              <button onClick={clearPlayground} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600">
                <Square className="w-3 h-3" /> Clear
              </button>
            </div>
          </div>
          <div className="p-4">
            <ConfigPanel
              provider={provider} setProvider={setProvider}
              model={model} setModel={setModel}
              temperature={temperature} setTemperature={setTemperature}
              maxTokens={maxTokens} setMaxTokens={setMaxTokens}
              systemPrompt={systemPrompt} setSystemPrompt={setSystemPrompt}
              userPrompt={userPrompt} setUserPrompt={setUserPrompt}
              compareMode={compareMode} setCompareMode={setCompareMode}
              compareProvider={compareProvider} setCompareProvider={setCompareProvider}
              compareModel={compareModel} setCompareModel={setCompareModel}
              modelsByProvider={modelsByProvider}
            />
          </div>
          <div className="px-4 pb-4">
            <button
              onClick={runPrompt}
              disabled={running || !userPrompt.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? 'Running…' : compareMode ? 'Run Comparison' : 'Run Prompt'}
            </button>
          </div>
        </div>

        {/* Right: Response */}
        <div className="space-y-3">
          {/* Estimated cost preview */}
          {userPrompt.trim() && !running && !result && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-700">
              <DollarSign className="w-3.5 h-3.5 shrink-0" />
              Cost will depend on prompt length and model pricing. Estimated after execution.
            </div>
          )}
          <ResponsePanel
            result={result}
            compareResult={compareResult}
            error={error}
            running={running}
            compareMode={compareMode}
          />
        </div>
      </div>

      {/* Session cost summary */}
      <SessionCost results={sessionResults} />

      {/* Bottom tabs: Library + History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex border-b border-slate-100">
          {(['library', 'history'] as const).map(tab => (
            <button key={tab} onClick={() => setBottomTab(tab)}
              className={`flex items-center gap-1.5 px-5 py-3 text-xs font-semibold transition-colors ${bottomTab === tab ? 'text-slate-900 border-b-2 border-blue-600 -mb-px' : 'text-slate-500 hover:text-slate-700'}`}>
              {tab === 'library' ? <><BookOpen className="w-3.5 h-3.5" /> Prompt Library</> : <><Clock className="w-3.5 h-3.5" /> History</>}
            </button>
          ))}
        </div>
        <div className="p-4">
          {bottomTab === 'library'
            ? <PromptLibrary onLoad={loadFromLibrary} />
            : <HistoryPanel onReload={loadFromHistory} />}
        </div>
      </div>
    </div>
  );
}
