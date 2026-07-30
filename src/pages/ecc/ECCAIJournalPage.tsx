import { useEffect, useRef, useState } from 'react';
import {
  Brain, Plus, X, Loader2, Trash2, ChevronDown, ChevronUp,
  Check, Pencil, Search,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useActiveRC } from '../../lib/activeRC';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AISession {
  id: string;
  title: string;
  session_date: string;
  ai_platform: string;
  objective: string | null;
  prompt_used: string | null;
  summary: string | null;
  outcome: string | null;
  lessons_learned: string | null;
  files_modified: string[];
  db_migrations: string[];
  edge_functions: string[];
  backlog_items_created: string[];
  decisions_made: string[];
  follow_up_actions: string[];
  related_links: string[];
  tags: string[];
  created_at: string;
  updated_at: string;
}

type SessionInput = Omit<AISession, 'id' | 'created_at' | 'updated_at'>;

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORMS = ['Claude', 'ChatGPT', 'Bolt', 'Gemini', 'Copilot', 'Other'];

const PLATFORM_CFG: Record<string, { bg: string; text: string; border: string }> = {
  Claude:   { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
  ChatGPT:  { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  Bolt:     { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  Gemini:   { bg: 'bg-indigo-50',  text: 'text-indigo-700',  border: 'border-indigo-200' },
  Copilot:  { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200' },
  Other:    { bg: 'bg-slate-100',  text: 'text-slate-600',   border: 'border-slate-200' },
};

function platformCfg(p: string) { return PLATFORM_CFG[p] ?? PLATFORM_CFG.Other; }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const INPUT  = "w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white placeholder-slate-300";
const LABEL  = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";
const SELECT = "w-full appearance-none px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white pr-8";

const EMPTY_SESSION: () => SessionInput = () => ({
  title: '',
  session_date: new Date().toISOString().split('T')[0],
  ai_platform: 'Claude',
  objective: null,
  prompt_used: null,
  summary: null,
  outcome: null,
  lessons_learned: null,
  files_modified: [],
  db_migrations: [],
  edge_functions: [],
  backlog_items_created: [],
  decisions_made: [],
  follow_up_actions: [],
  related_links: [],
  tags: [],
});

// ─── Session Drawer ───────────────────────────────────────────────────────────

function SessionDrawer({ session, onClose, onSave, onDelete }: {
  session: AISession | null;
  onClose: () => void;
  onSave: (d: SessionInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [form, setForm] = useState<SessionInput>(
    session ? {
      title: session.title, session_date: session.session_date,
      ai_platform: session.ai_platform, objective: session.objective,
      prompt_used: session.prompt_used, summary: session.summary,
      outcome: session.outcome, lessons_learned: session.lessons_learned,
      files_modified: session.files_modified ?? [],
      db_migrations: session.db_migrations ?? [],
      edge_functions: session.edge_functions ?? [],
      backlog_items_created: session.backlog_items_created ?? [],
      decisions_made: session.decisions_made ?? [],
      follow_up_actions: session.follow_up_actions ?? [],
      related_links: session.related_links ?? [],
      tags: session.tags ?? [],
    } : EMPTY_SESSION()
  );
  const [tab, setTab] = useState<'session' | 'content' | 'technical'>('session');
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  function set<K extends keyof SessionInput>(k: K, v: SessionInput[K]) { setForm(f => ({ ...f, [k]: v })); }
  function setLines(k: 'files_modified' | 'db_migrations' | 'edge_functions' | 'backlog_items_created' | 'decisions_made' | 'follow_up_actions' | 'related_links', val: string) {
    set(k, val.split('\n').map(s => s.trim()).filter(Boolean));
  }
  function setTags(raw: string) { set('tags', raw.split(',').map(s => s.trim()).filter(Boolean)); }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    await onSave({ ...form, title: form.title.trim() });
    setSaving(false);
  }

  const TABS = [
    { key: 'session'   as const, label: 'Session' },
    { key: 'content'   as const, label: 'Summary' },
    { key: 'technical' as const, label: 'Technical' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">{session ? 'Edit Session' : 'New AI Session'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex border-b border-slate-200 px-6">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`text-sm font-medium px-1 py-3 mr-5 border-b-2 transition-colors ${tab === t.key ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {tab === 'session' && <>
            <div><label className={LABEL}>Title <span className="text-red-500">*</span></label>
              <input ref={titleRef} value={form.title} onChange={e => set('title', e.target.value)} placeholder="What was this session about?" className={INPUT} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>Date</label>
                <input type="date" value={form.session_date} onChange={e => set('session_date', e.target.value)} className={INPUT} />
              </div>
              <div><label className={LABEL}>AI Used</label>
                <div className="relative">
                  <select value={form.ai_platform} onChange={e => set('ai_platform', e.target.value)} className={SELECT}>
                    {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <div><label className={LABEL}>Objective</label>
              <textarea value={form.objective ?? ''} onChange={e => set('objective', e.target.value || null)} rows={3}
                placeholder="What was the goal of this session?" className={INPUT + ' resize-none'} />
            </div>

            <div><label className={LABEL}>Tags <span className="font-normal normal-case text-slate-400">(comma-separated)</span></label>
              <input value={form.tags.join(', ')} onChange={e => setTags(e.target.value)} placeholder="auth, database, refactor" className={INPUT} />
            </div>
          </>}

          {tab === 'content' && <>
            <div><label className={LABEL}>Prompts Used</label>
              <textarea value={form.prompt_used ?? ''} onChange={e => set('prompt_used', e.target.value || null)} rows={6}
                placeholder="Key prompts, instructions, or context used in this session." className={INPUT + ' resize-none'} />
            </div>
            <div><label className={LABEL}>Summary</label>
              <textarea value={form.summary ?? ''} onChange={e => set('summary', e.target.value || null)} rows={4}
                placeholder="What happened in this session?" className={INPUT + ' resize-none'} />
            </div>
            <div><label className={LABEL}>Outcome</label>
              <textarea value={form.outcome ?? ''} onChange={e => set('outcome', e.target.value || null)} rows={3}
                placeholder="What was delivered, resolved, or changed?" className={INPUT + ' resize-none'} />
            </div>
            <div><label className={LABEL}>Lessons Learned</label>
              <textarea value={form.lessons_learned ?? ''} onChange={e => set('lessons_learned', e.target.value || null)} rows={4}
                placeholder="What worked well? What would you do differently? What surprised you?" className={INPUT + ' resize-none'} />
            </div>
            <div><label className={LABEL}>Follow-up Actions <span className="font-normal normal-case">(one per line)</span></label>
              <textarea value={form.follow_up_actions.join('\n')} onChange={e => setLines('follow_up_actions', e.target.value)} rows={4}
                placeholder="- Create backlog item for X&#10;- Review generated migration" className={INPUT + ' resize-none'} />
            </div>
          </>}

          {tab === 'technical' && <>
            <div><label className={LABEL}>Files Changed <span className="font-normal normal-case">(one per line)</span></label>
              <textarea value={form.files_modified.join('\n')} onChange={e => setLines('files_modified', e.target.value)} rows={4}
                placeholder="src/pages/..." className={INPUT + ' resize-none font-mono text-xs'} />
            </div>
            <div><label className={LABEL}>Migrations Applied <span className="font-normal normal-case">(one per line)</span></label>
              <textarea value={form.db_migrations.join('\n')} onChange={e => setLines('db_migrations', e.target.value)} rows={3}
                placeholder="20260704_migration_name" className={INPUT + ' resize-none font-mono text-xs'} />
            </div>
            <div><label className={LABEL}>Edge Functions <span className="font-normal normal-case">(one per line)</span></label>
              <textarea value={form.edge_functions.join('\n')} onChange={e => setLines('edge_functions', e.target.value)} rows={3}
                className={INPUT + ' resize-none font-mono text-xs'} />
            </div>
            <div><label className={LABEL}>Backlog Items Created <span className="font-normal normal-case">(one per line)</span></label>
              <textarea value={form.backlog_items_created.join('\n')} onChange={e => setLines('backlog_items_created', e.target.value)} rows={3}
                placeholder="Feature or task title…" className={INPUT + ' resize-none'} />
            </div>
            <div><label className={LABEL}>Decisions Made <span className="font-normal normal-case">(one per line)</span></label>
              <textarea value={form.decisions_made.join('\n')} onChange={e => setLines('decisions_made', e.target.value)} rows={3}
                placeholder="Decision title or summary…" className={INPUT + ' resize-none'} />
            </div>
            <div><label className={LABEL}>Related Links <span className="font-normal normal-case">(one per line)</span></label>
              <textarea value={form.related_links.join('\n')} onChange={e => setLines('related_links', e.target.value)} rows={3}
                placeholder="https://..." className={INPUT + ' resize-none font-mono text-xs'} />
            </div>
          </>}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div>{session && (confirmDel
            ? <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Delete?</span>
                <button onClick={() => onDelete?.().then(onClose)} className="text-xs font-semibold text-red-600">Confirm</button>
                <button onClick={() => setConfirmDel(false)} className="text-xs text-slate-400">Cancel</button>
              </div>
            : <button onClick={() => setConfirmDel(true)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />Delete
              </button>
          )}</div>
          <div className="flex gap-3">
            <button onClick={onClose} className="text-sm text-slate-500 px-4 py-2">Cancel</button>
            <button onClick={handleSave} disabled={!form.title.trim() || saving}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {session ? 'Save changes' : 'Log session'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Session Card ─────────────────────────────────────────────────────────────

function SessionCard({ session, onEdit }: { session: AISession; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const pCfg = platformCfg(session.ai_platform);
  const hasBody = session.summary || session.outcome || session.lessons_learned || session.files_modified.length > 0 || session.follow_up_actions.length > 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${pCfg.bg} ${pCfg.text} ${pCfg.border}`}>
              {session.ai_platform}
            </span>
            <span className="text-xs text-slate-400">{fmtDate(session.session_date)}</span>
            {session.tags.slice(0, 3).map(t => (
              <span key={t} className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{t}</span>
            ))}
          </div>
          <h3 className="text-sm font-semibold text-slate-900 leading-snug">{session.title}</h3>
          {session.objective && !expanded && (
            <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">{session.objective}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            {session.files_modified.length > 0 && (
              <span className="text-xs text-slate-400">{session.files_modified.length} file{session.files_modified.length > 1 ? 's' : ''} changed</span>
            )}
            {session.db_migrations.length > 0 && (
              <span className="text-xs text-slate-400">{session.db_migrations.length} migration{session.db_migrations.length > 1 ? 's' : ''}</span>
            )}
            {session.follow_up_actions.length > 0 && (
              <span className="text-xs text-amber-600">{session.follow_up_actions.length} follow-up{session.follow_up_actions.length > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {hasBody && (
            <button onClick={() => setExpanded(e => !e)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4">
          {session.objective && <JSection label="Objective" content={session.objective} />}
          {session.summary && <JSection label="Summary" content={session.summary} />}
          {session.outcome && <JSection label="Outcome" content={session.outcome} highlight />}
          {session.lessons_learned && <JSection label="Lessons Learned" content={session.lessons_learned} accent />}

          {session.follow_up_actions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Follow-up Actions</p>
              <ul className="space-y-1">
                {session.follow_up_actions.map((a, i) => (
                  <li key={i} className="text-xs text-slate-600 flex gap-2">
                    <span className="text-amber-400 mt-0.5 shrink-0">→</span>{a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(session.files_modified.length > 0 || session.db_migrations.length > 0 || session.edge_functions.length > 0) && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Technical Changes</p>
              <div className="grid grid-cols-3 gap-3">
                {session.files_modified.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Files Changed</p>
                    {session.files_modified.slice(0, 5).map((f, i) => <p key={i} className="text-xs font-mono text-slate-600 truncate">{f}</p>)}
                    {session.files_modified.length > 5 && <p className="text-xs text-slate-400">+{session.files_modified.length - 5} more</p>}
                  </div>
                )}
                {session.db_migrations.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Migrations</p>
                    {session.db_migrations.map((m, i) => <p key={i} className="text-xs font-mono text-slate-600 truncate">{m}</p>)}
                  </div>
                )}
                {session.edge_functions.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Edge Functions</p>
                    {session.edge_functions.map((f, i) => <p key={i} className="text-xs font-mono text-slate-600">{f}</p>)}
                  </div>
                )}
              </div>
            </div>
          )}

          {session.decisions_made.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Decisions Made</p>
              <ul className="space-y-1">
                {session.decisions_made.map((d, i) => (
                  <li key={i} className="text-xs text-slate-600 flex gap-2"><span className="text-slate-300">—</span>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function JSection({ label, content, highlight, accent }: { label: string; content: string; highlight?: boolean; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
      <pre className={`text-xs leading-relaxed whitespace-pre-wrap font-sans ${
        highlight ? 'text-slate-900 font-medium' :
        accent    ? 'text-teal-700 bg-teal-50 p-2.5 rounded-lg' :
        'text-slate-600'
      }`}>{content}</pre>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ECCAIJournalPage() {
  const [sessions, setSessions] = useState<AISession[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { activeRC, addToActiveRC, logEvent } = useActiveRC();
  const [editing, setEditing] = useState<AISession | null>(null);
  const [search, setSearch] = useState('');
  const [filterPlatform, setFilterPlatform] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from('ecc_ai_journal').select('*').order('session_date', { ascending: false });
    setSessions((data ?? []).map(s => ({
      ...s,
      files_modified: s.files_modified ?? [],
      db_migrations: s.db_migrations ?? [],
      edge_functions: s.edge_functions ?? [],
      backlog_items_created: s.backlog_items_created ?? [],
      decisions_made: s.decisions_made ?? [],
      follow_up_actions: s.follow_up_actions ?? [],
      related_links: s.related_links ?? [],
      tags: s.tags ?? [],
    })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSave(data: SessionInput) {
    if (editing) {
      const { data: updated } = await supabase.from('ecc_ai_journal').update({ ...data, updated_at: new Date().toISOString() }).eq('id', editing.id).select().single();
      if (updated) setSessions(ss => ss.map(s => s.id === updated.id ? normalise(updated) : s));
    } else {
      const { data: created } = await supabase.from('ecc_ai_journal').insert(data).select().single();
      if (created) {
        setSessions(ss => [normalise(created), ...ss]);
        if (activeRC) {
          await addToActiveRC('journal', created.id);
          await logEvent({ event_type: 'journal_session', event_label: `AI session created: ${created.title}`, entity_type: 'ai_journal', entity_id: created.id, entity_title: created.title });
        }
      }
    }
    setDrawerOpen(false); setEditing(null);
  }

  async function handleDelete() {
    if (!editing) return;
    await supabase.from('ecc_ai_journal').delete().eq('id', editing.id);
    setSessions(ss => ss.filter(s => s.id !== editing.id));
    setDrawerOpen(false); setEditing(null);
  }

  function normalise(s: AISession): AISession {
    return {
      ...s,
      files_modified: s.files_modified ?? [],
      db_migrations: s.db_migrations ?? [],
      edge_functions: s.edge_functions ?? [],
      backlog_items_created: s.backlog_items_created ?? [],
      decisions_made: s.decisions_made ?? [],
      follow_up_actions: s.follow_up_actions ?? [],
      related_links: s.related_links ?? [],
      tags: s.tags ?? [],
    };
  }

  const displayed = sessions.filter(s => {
    if (filterPlatform && s.ai_platform !== filterPlatform) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.title.toLowerCase().includes(q) ||
        s.objective?.toLowerCase().includes(q) ||
        s.summary?.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q));
    }
    return true;
  });

  const usedPlatforms = [...new Set(sessions.map(s => s.ai_platform))];
  const pendingFollowUps = sessions.reduce((n, s) => n + s.follow_up_actions.length, 0);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-slate-300 animate-spin" /></div>;

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
            <Brain className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">AI Collaboration Journal</h2>
            <p className="text-sm text-slate-500">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''} logged
              {pendingFollowUps > 0 && <span className="ml-2 text-amber-600">· {pendingFollowUps} follow-up{pendingFollowUps > 1 ? 's' : ''} pending</span>}
            </p>
          </div>
        </div>
        <button onClick={() => { setEditing(null); setDrawerOpen(true); }}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Log Session
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sessions…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {usedPlatforms.map(p => {
            const cfg = platformCfg(p);
            return (
              <button key={p} onClick={() => setFilterPlatform(filterPlatform === p ? null : p)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${filterPlatform === p ? `${cfg.bg} ${cfg.border} ${cfg.text}` : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}>
                {p}
              </button>
            );
          })}
        </div>
        {(search || filterPlatform) && (
          <button onClick={() => { setSearch(''); setFilterPlatform(null); }} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* List */}
      {displayed.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
          <Brain className="w-8 h-8 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">
            {sessions.length === 0 ? 'No sessions logged yet.' : 'No sessions match your search.'}
          </p>
          {sessions.length === 0 && (
            <p className="text-xs text-slate-400 mt-2">Log your AI sessions to build a searchable history of what was built and why.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(s => (
            <SessionCard key={s.id} session={s} onEdit={() => { setEditing(s); setDrawerOpen(true); }} />
          ))}
        </div>
      )}

      {drawerOpen && (
        <SessionDrawer
          session={editing}
          onClose={() => { setDrawerOpen(false); setEditing(null); }}
          onSave={handleSave}
          onDelete={editing ? handleDelete : undefined}
        />
      )}
    </div>
  );
}
